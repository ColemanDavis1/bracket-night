import type { MatchResult, Participant, ResolvedMatch } from "./types";
import { buildEngineState, type TournamentConfig } from "./index";

export function makePlayers(n: number): Participant[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
  }));
}

export type Picker = (
  m: ResolvedMatch,
  strength: Map<string, number>,
) => { winnerId: string; scoreA: number; scoreB: number };

/** Default: the structurally stronger player (lower strength value) wins 21–x. */
export const strongerWins: Picker = (m, strength) => {
  const a = m.aId as string;
  const b = m.bId as string;
  const sa = strength.get(a) ?? 0;
  const sb = strength.get(b) ?? 0;
  const winner = sa <= sb ? a : b;
  return {
    winnerId: winner,
    scoreA: winner === a ? 21 : 15,
    scoreB: winner === b ? 21 : 15,
  };
};

/**
 * Drive a tournament to completion by repeatedly recomputing state and playing
 * every "ready" match. Returns the final state plus the full result log.
 */
export function playToCompletion(
  config: TournamentConfig,
  participants: Participant[],
  pick: Picker = strongerWins,
  strengthOrder?: string[],
): { state: ReturnType<typeof buildEngineState>; results: MatchResult[] } {
  const strength = new Map<string, number>(
    (strengthOrder ?? participants.map((p) => p.id)).map((id, i) => [id, i]),
  );
  const results: MatchResult[] = [];
  for (let guard = 0; guard < 5000; guard++) {
    const state = buildEngineState(config, participants, results);
    if (state.complete) return { state, results };
    const ready = state.matches.filter((m) => m.status === "ready");
    if (ready.length === 0) {
      return { state, results };
    }
    for (const m of ready) {
      const r = pick(m, strength);
      results.push({
        matchKey: m.key,
        winnerId: r.winnerId,
        scoreA: r.scoreA,
        scoreB: r.scoreB,
        isDraw: false,
        forfeit: false,
        status: "done",
      });
    }
  }
  throw new Error("playToCompletion did not converge");
}
