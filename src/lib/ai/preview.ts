import type {
  AiTone,
  ResolvedMatch,
  ScoringMode,
  StandingsRow,
} from "@/lib/engine";

/**
 * Pre-game matchup previews.
 *
 * The heuristic predicted winner is ALWAYS available (no AI required) — it is
 * computed from records, point differential, recent form, head-to-head, and
 * seeding so there is always a transparent pick. The AI analyst write-up is a
 * cherry on top: if ANTHROPIC_API_KEY is set we ask a small, fast Claude model
 * (Haiku) for a few sentences in the organizer's chosen tone; otherwise we fall
 * back to deterministic templated text. AI calls never block or crash the UI.
 */

export interface SidePreview {
  id: string;
  name: string;
  rank: number;
  wins: number;
  losses: number;
  draws: number;
  pointDiff: number;
  streak: number;
  recentForm: ("W" | "L" | "D")[];
}

export interface PreviewContext {
  matchKey: string;
  tone: AiTone;
  scoringMode: ScoringMode;
  stageLabel: string;
  a: SidePreview;
  b: SidePreview;
  h2h: { aWins: number; bWins: number; draws: number };
}

export interface Prediction {
  predictedWinnerId: string;
  confidence: number; // 0..1
  rationale: string;
}

export interface MatchPreview {
  prediction: Prediction;
  body: string;
  source: "ai" | "template";
  inputsHash: string;
}

function recentForm(
  playerId: string,
  matches: readonly ResolvedMatch[],
): ("W" | "L" | "D")[] {
  return matches
    .filter(
      (m) => m.status === "done" && (m.aId === playerId || m.bId === playerId),
    )
    .sort((x, y) => x.order - y.order)
    .slice(-3)
    .map((m) => {
      if (m.isDraw) return "D" as const;
      return m.winnerId === playerId ? ("W" as const) : ("L" as const);
    });
}

function headToHead(
  aId: string,
  bId: string,
  matches: readonly ResolvedMatch[],
): { aWins: number; bWins: number; draws: number } {
  let aWins = 0;
  let bWins = 0;
  let draws = 0;
  for (const m of matches) {
    if (m.status !== "done") continue;
    const pair =
      (m.aId === aId && m.bId === bId) || (m.aId === bId && m.bId === aId);
    if (!pair) continue;
    if (m.isDraw) draws++;
    else if (m.winnerId === aId) aWins++;
    else if (m.winnerId === bId) bWins++;
  }
  return { aWins, bWins, draws };
}

function side(row: StandingsRow, matches: readonly ResolvedMatch[]): SidePreview {
  return {
    id: row.participantId,
    name: row.name,
    rank: row.rank,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    pointDiff: row.pointDiff,
    streak: row.streak,
    recentForm: recentForm(row.participantId, matches),
  };
}

/** Build the full preview context for a ready match from the live state. */
export function buildPreviewContext(
  match: ResolvedMatch,
  standings: readonly StandingsRow[],
  matches: readonly ResolvedMatch[],
  tone: AiTone,
  scoringMode: ScoringMode,
): PreviewContext | null {
  if (!match.aId || !match.bId) return null;
  const aRow = standings.find((r) => r.participantId === match.aId);
  const bRow = standings.find((r) => r.participantId === match.bId);
  if (!aRow || !bRow) return null;
  return {
    matchKey: match.key,
    tone,
    scoringMode,
    stageLabel: match.label,
    a: side(aRow, matches),
    b: side(bRow, matches),
    h2h: headToHead(match.aId, match.bId, matches),
  };
}

function formPoints(form: ("W" | "L" | "D")[]): number {
  return form.reduce((acc, f) => acc + (f === "W" ? 1 : f === "D" ? 0.4 : 0), 0);
}

/** Transparent heuristic so a predicted winner always exists. */
export function predictWinner(ctx: PreviewContext): Prediction {
  const scoreOf = (s: SidePreview, h2h: number): number =>
    s.wins * 3 -
    s.losses * 1.5 +
    s.pointDiff * 0.08 +
    s.streak * 1.2 +
    formPoints(s.recentForm) * 1.5 +
    h2h * 1.5 +
    // Better seed (lower rank number) is a small tiebreaking edge.
    (40 - s.rank) * 0.05;

  const aScore = scoreOf(ctx.a, ctx.h2h.aWins);
  const bScore = scoreOf(ctx.b, ctx.h2h.bWins);

  let winner: SidePreview;
  let loser: SidePreview;
  if (aScore === bScore) {
    // Deterministic fallback: better seed, then name.
    winner = ctx.a.rank <= ctx.b.rank ? ctx.a : ctx.b;
    loser = winner === ctx.a ? ctx.b : ctx.a;
  } else {
    winner = aScore > bScore ? ctx.a : ctx.b;
    loser = winner === ctx.a ? ctx.b : ctx.a;
  }

  const spread = Math.abs(aScore - bScore);
  const confidence = Math.min(0.95, 0.5 + spread / 30);

  const bits: string[] = [];
  if (winner.wins !== loser.wins)
    bits.push(`${winner.wins}-${winner.losses} record`);
  if (ctx.h2h.aWins + ctx.h2h.bWins > 0) {
    const hw = winner.id === ctx.a.id ? ctx.h2h.aWins : ctx.h2h.bWins;
    const hl = winner.id === ctx.a.id ? ctx.h2h.bWins : ctx.h2h.aWins;
    bits.push(`${hw}-${hl} head-to-head edge`);
  }
  if (winner.streak >= 2) bits.push(`a ${winner.streak}-game win streak`);
  if (ctx.scoringMode === "scored" && winner.pointDiff > loser.pointDiff)
    bits.push(`a stronger point differential (${winner.pointDiff > 0 ? "+" : ""}${winner.pointDiff})`);

  const rationale = bits.length
    ? `${winner.name} is favored on ${bits.slice(0, 2).join(" and ")}.`
    : `${winner.name} gets the slight edge on seeding in an even matchup.`;

  return { predictedWinnerId: winner.id, confidence, rationale };
}

/** A stable hash of the inputs so cached previews invalidate on data change. */
export function previewInputsHash(ctx: PreviewContext): string {
  const key = JSON.stringify({
    t: ctx.tone,
    s: ctx.stageLabel,
    a: [ctx.a.wins, ctx.a.losses, ctx.a.draws, ctx.a.pointDiff, ctx.a.streak, ctx.a.recentForm],
    b: [ctx.b.wins, ctx.b.losses, ctx.b.draws, ctx.b.pointDiff, ctx.b.streak, ctx.b.recentForm],
    h: [ctx.h2h.aWins, ctx.h2h.bWins, ctx.h2h.draws],
  });
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = (h * 33) ^ key.charCodeAt(i);
  return (h >>> 0).toString(36);
}

const TONE_LABEL: Record<AiTone, string> = {
  hype: "hype sportscaster",
  trash_talk: "playful trash-talker",
  analyst: "balanced analyst",
};

/** Deterministic templated preview used when AI is unavailable. */
export function templatePreview(ctx: PreviewContext, pred: Prediction): string {
  const winner = pred.predictedWinnerId === ctx.a.id ? ctx.a : ctx.b;
  const underdog = winner === ctx.a ? ctx.b : ctx.a;
  const rec = (s: SidePreview) =>
    s.draws ? `${s.wins}-${s.losses}-${s.draws}` : `${s.wins}-${s.losses}`;

  switch (ctx.tone) {
    case "hype":
      return `${ctx.stageLabel}! ${ctx.a.name} (${rec(ctx.a)}) meets ${ctx.b.name} (${rec(ctx.b)}) and the energy is ELECTRIC. ${pred.rationale} But don't blink — ${underdog.name} can flip the script in a heartbeat.`;
    case "trash_talk":
      return `${ctx.a.name} vs ${ctx.b.name} — somebody's leaving this one with a story they'd rather forget. ${pred.rationale} ${underdog.name} better bring more than vibes.`;
    case "analyst":
    default:
      return `${ctx.stageLabel}: ${ctx.a.name} (${rec(ctx.a)}) faces ${ctx.b.name} (${rec(ctx.b)}). ${pred.rationale} Watch whether ${underdog.name} can break serve early and force ${winner.name} out of rhythm.`;
  }
}

/**
 * Generate the AI analyst write-up via Claude (Haiku — small and fast). Returns
 * null on any failure so the caller can fall back to the template. Never throws.
 */
export async function generateAiPreview(
  ctx: PreviewContext,
  pred: Prediction,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    const fav = pred.predictedWinnerId === ctx.a.id ? ctx.a : ctx.b;
    const dog = fav === ctx.a ? ctx.b : ctx.a;
    const rec = (s: SidePreview) =>
      s.draws ? `${s.wins}-${s.losses}-${s.draws}` : `${s.wins}-${s.losses}`;

    const facts = [
      `Stage: ${ctx.stageLabel}`,
      `${ctx.a.name}: record ${rec(ctx.a)}, point diff ${ctx.a.pointDiff}, current streak ${ctx.a.streak}, recent form ${ctx.a.recentForm.join("") || "n/a"}, seed #${ctx.a.rank}`,
      `${ctx.b.name}: record ${rec(ctx.b)}, point diff ${ctx.b.pointDiff}, current streak ${ctx.b.streak}, recent form ${ctx.b.recentForm.join("") || "n/a"}, seed #${ctx.b.rank}`,
      `Head-to-head: ${ctx.a.name} ${ctx.h2h.aWins} - ${ctx.h2h.bWins} ${ctx.b.name} (${ctx.h2h.draws} draws)`,
      `Model pick: ${fav.name} over ${dog.name}.`,
    ].join("\n");

    const message = await client.messages.create({
      // Smallest current Claude model — fast and cheap for short previews.
      model: "claude-haiku-4-5",
      max_tokens: 220,
      system: `You are a ${TONE_LABEL[ctx.tone]} writing a punchy 2-3 sentence pre-game preview for a casual game-night tournament. Be vivid and specific to the matchup. Do not invent statistics beyond what you're given. No headings, no lists, no emojis. Keep it under 70 words.`,
      messages: [
        {
          role: "user",
          content: `Write the preview for this matchup:\n\n${facts}`,
        },
      ],
    });

    const text = message.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return text || null;
  } catch {
    // Network error, bad key, rate limit — degrade gracefully.
    return null;
  }
}
