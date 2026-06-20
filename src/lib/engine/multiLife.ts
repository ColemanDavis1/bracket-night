import type { GeneratedMatch, MatchResult } from "./types";

/**
 * Triple elimination (and the general "N-life" elimination) approach.
 *
 * A rigid pre-drawn triple-elimination tree has no single canonical shape, so
 * we model it dynamically: every player carries a life count and is eliminated
 * once they reach `lives` losses (3 for triple, usable as 2/1 too). Each round
 * pairs the surviving players by fewest losses then best seed (a Swiss-style
 * pairing), avoiding immediate rematches where possible, with a non-penalizing
 * bye for odd counts. Rounds are generated one at a time: the next round only
 * appears once every match in the current round has a result. The last player
 * standing is the champion.
 *
 * This keeps the format correct (out after exactly N losses, single champion)
 * and always produces a clear sequential "next up" queue, at the cost of a
 * fixed bracket diagram. Documented in the README under the format engine.
 */
export function buildMultiLifeElimination(
  seeds: readonly string[],
  results: readonly MatchResult[],
  lives: number,
): { matches: GeneratedMatch[]; championId: string | null; complete: boolean } {
  const resultByKey = new Map(results.map((r) => [r.matchKey, r]));
  const losses = new Map<string, number>(seeds.map((id) => [id, 0]));
  const seedIndex = new Map<string, number>(seeds.map((id, i) => [id, i]));
  const opponents = new Map<string, Set<string>>(
    seeds.map((id) => [id, new Set<string>()]),
  );

  const matches: GeneratedMatch[] = [];
  let round = 0;
  let order = 0;
  let complete = false;
  let championId: string | null = null;

  while (true) {
    const active = seeds.filter((id) => (losses.get(id) ?? 0) < lives);
    if (active.length <= 1) {
      complete = true;
      championId = active[0] ?? null;
      break;
    }

    round++;
    const pairs = pairPlayers(active, losses, seedIndex, opponents);
    let roundComplete = true;

    pairs.forEach((pair, i) => {
      const key = `TE-${round}-${i + 1}`;
      if (pair.bye) {
        // Non-penalizing bye: emitted so the UI can show it, no result needed.
        matches.push({
          key,
          stage: "knockout",
          roundNumber: round,
          order: order++,
          label: `Triple Elim · Round ${round}`,
          aRef: { kind: "participant", id: pair.a },
          bRef: { kind: "bye" },
          allowDraw: false,
        });
        return;
      }
      matches.push({
        key,
        stage: "knockout",
        roundNumber: round,
        order: order++,
        label: `Triple Elim · Round ${round}`,
        aRef: { kind: "participant", id: pair.a },
        bRef: { kind: "participant", id: pair.b as string },
        allowDraw: false,
      });
      const r = resultByKey.get(key);
      if (r && r.winnerId) {
        const loser = r.winnerId === pair.a ? (pair.b as string) : pair.a;
        losses.set(loser, (losses.get(loser) ?? 0) + 1);
        opponents.get(pair.a)?.add(pair.b as string);
        opponents.get(pair.b as string)?.add(pair.a);
      } else {
        roundComplete = false;
      }
    });

    // Can't draw the next round until this one is fully decided.
    if (!roundComplete) break;
  }

  return { matches, championId, complete };
}

interface Pairing {
  a: string;
  b: string | null;
  bye: boolean;
}

function pairPlayers(
  active: readonly string[],
  losses: Map<string, number>,
  seedIndex: Map<string, number>,
  opponents: Map<string, Set<string>>,
): Pairing[] {
  const sorted = active.slice().sort((x, y) => {
    const lx = losses.get(x) ?? 0;
    const ly = losses.get(y) ?? 0;
    if (lx !== ly) return lx - ly;
    return (seedIndex.get(x) ?? 0) - (seedIndex.get(y) ?? 0);
  });

  const pool = sorted.slice();
  let byePlayer: string | null = null;
  if (pool.length % 2 === 1) {
    // Bye to the lowest-priority survivor (most losses, worst seed).
    byePlayer = pool.pop() as string;
  }

  const pairs: Pairing[] = [];
  const used = new Set<string>();
  for (let i = 0; i < pool.length; i++) {
    const a = pool[i] as string;
    if (used.has(a)) continue;
    used.add(a);
    // Find the next available opponent, preferring a non-rematch.
    let chosen: string | null = null;
    let fallback: string | null = null;
    for (let j = i + 1; j < pool.length; j++) {
      const b = pool[j] as string;
      if (used.has(b)) continue;
      if (fallback === null) fallback = b;
      if (!opponents.get(a)?.has(b)) {
        chosen = b;
        break;
      }
    }
    const opp = chosen ?? fallback;
    if (opp) {
      used.add(opp);
      pairs.push({ a, b: opp, bye: false });
    }
  }
  if (byePlayer) pairs.push({ a: byePlayer, b: null, bye: true });
  return pairs;
}
