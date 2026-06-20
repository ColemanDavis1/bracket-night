import type {
  Participant,
  PointsTiebreak,
  ResolvedMatch,
  StandingsRow,
} from "./types";
import { makeRng } from "./rng";

interface Acc {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  pointsFor: number;
  pointsAgainst: number;
  /** chronological win(1)/loss-or-draw(0) sequence for streak math */
  sequence: number[];
}

function emptyAcc(): Acc {
  return {
    played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    sequence: [],
  };
}

/**
 * Compute standings over a set of matches using the app-wide ranking rules:
 *
 *   1. Most wins (we explicitly do NOT use a soccer-style points table).
 *   2. Head-to-head record among the tied players.
 *   3. The organizer's chosen points tiebreaker (points scored desc, or
 *      points allowed asc).
 *   4. Point differential (documented fallback).
 *   5. A flagged random tiebreak (deterministic given `drawSeed`).
 *
 * Only decided games count toward records and points. Pure byes never pad a
 * record; forfeits (a withdrawn opponent) count as a win/loss with zero points.
 */
export function computeStandings(
  participants: readonly Participant[],
  matches: readonly ResolvedMatch[],
  tiebreak: PointsTiebreak,
  drawSeed = 1,
): StandingsRow[] {
  const acc = new Map<string, Acc>();
  for (const p of participants) acc.set(p.id, emptyAcc());

  // Head-to-head wins between every ordered pair of participants.
  const h2h = new Map<string, number>();
  const bump = (winner: string, loser: string) =>
    h2h.set(`${winner}|${loser}`, (h2h.get(`${winner}|${loser}`) ?? 0) + 1);

  const counted = matches
    .filter(
      (m) =>
        m.status === "done" ||
        (m.status === "bye" && m.forfeit && m.winnerId !== null),
    )
    .sort((a, b) => a.order - b.order);

  for (const m of counted) {
    if (!m.aId || !m.bId) continue;
    const a = acc.get(m.aId);
    const b = acc.get(m.bId);
    if (!a || !b) continue;
    const sa = m.scoreA ?? 0;
    const sb = m.scoreB ?? 0;
    a.played++;
    b.played++;
    a.pointsFor += sa;
    a.pointsAgainst += sb;
    b.pointsFor += sb;
    b.pointsAgainst += sa;
    if (m.isDraw) {
      a.draws++;
      b.draws++;
      a.sequence.push(0);
      b.sequence.push(0);
    } else if (m.winnerId === m.aId) {
      a.wins++;
      b.losses++;
      a.sequence.push(1);
      b.sequence.push(0);
      bump(m.aId, m.bId);
    } else if (m.winnerId === m.bId) {
      b.wins++;
      a.losses++;
      b.sequence.push(1);
      a.sequence.push(0);
      bump(m.bId, m.aId);
    }
  }

  const rows: StandingsRow[] = participants.map((p) => {
    const x = acc.get(p.id) ?? emptyAcc();
    return {
      participantId: p.id,
      name: p.name,
      rank: 0,
      played: x.played,
      wins: x.wins,
      losses: x.losses,
      draws: x.draws,
      pointsFor: x.pointsFor,
      pointsAgainst: x.pointsAgainst,
      pointDiff: x.pointsFor - x.pointsAgainst,
      streak: currentStreak(x.sequence),
      longestStreak: longestStreak(x.sequence),
      withdrawn: Boolean(p.withdrawn),
      decidedByRandom: false,
    };
  });

  const rng = makeRng(drawSeed);
  const randomKey = new Map(rows.map((r) => [r.participantId, rng()]));

  rows.sort((a, b) => {
    // Withdrawn players always sort to the bottom.
    if (a.withdrawn !== b.withdrawn) return a.withdrawn ? 1 : -1;
    if (b.wins !== a.wins) return b.wins - a.wins;

    const h = headToHead(a, b, h2h);
    if (h !== 0) return h;

    const pts = pointsCompare(a, b, tiebreak);
    if (pts !== 0) return pts;

    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;

    a.decidedByRandom = true;
    b.decidedByRandom = true;
    const ra = randomKey.get(a.participantId) ?? 0;
    const rb = randomKey.get(b.participantId) ?? 0;
    return ra - rb;
  });

  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

function headToHead(
  a: StandingsRow,
  b: StandingsRow,
  h2h: Map<string, number>,
): number {
  const aw = h2h.get(`${a.participantId}|${b.participantId}`) ?? 0;
  const bw = h2h.get(`${b.participantId}|${a.participantId}`) ?? 0;
  return bw - aw; // more H2H wins ranks higher
}

function pointsCompare(
  a: StandingsRow,
  b: StandingsRow,
  tiebreak: PointsTiebreak,
): number {
  if (tiebreak === "points_scored") return b.pointsFor - a.pointsFor;
  return a.pointsAgainst - b.pointsAgainst; // fewer points allowed ranks higher
}

function currentStreak(seq: number[]): number {
  let s = 0;
  for (let i = seq.length - 1; i >= 0; i--) {
    if (seq[i] === 1) s++;
    else break;
  }
  return s;
}

function longestStreak(seq: number[]): number {
  let best = 0;
  let cur = 0;
  for (const v of seq) {
    if (v === 1) {
      cur++;
      best = Math.max(best, cur);
    } else cur = 0;
  }
  return best;
}

/** Final seed order (best first) derived from a set of seeding-round matches. */
export function seedsFromStandings(
  participants: readonly Participant[],
  seedingMatches: readonly ResolvedMatch[],
  tiebreak: PointsTiebreak,
  drawSeed = 1,
): string[] {
  return computeStandings(participants, seedingMatches, tiebreak, drawSeed).map(
    (r) => r.participantId,
  );
}
