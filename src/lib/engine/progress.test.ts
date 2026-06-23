import { describe, expect, it } from "vitest";
import type { MatchResult, Participant } from "./types";
import {
  buildEngineState,
  completedRounds,
  currentRound,
  phaseProgress,
  playersRemaining,
  roundsOf,
  type EngineState,
  type TournamentConfig,
} from "./index";
import { makePlayers } from "./testHelpers";

/** Play the tournament one round at a time, capturing a snapshot per step. */
function playRoundByRound(
  config: TournamentConfig,
  players: Participant[],
): { results: MatchResult[]; snapshots: EngineState[] } {
  const results: MatchResult[] = [];
  const snapshots: EngineState[] = [];
  for (let guard = 0; guard < 1000; guard++) {
    const state = buildEngineState(config, players, results);
    snapshots.push(state);
    if (state.complete) break;
    const cur = currentRound(state);
    let toPlay = (cur?.matches ?? []).filter((m) => m.status === "ready");
    if (toPlay.length === 0) {
      toPlay = state.matches.filter((m) => m.status === "ready");
      if (toPlay.length === 0) break;
    }
    for (const m of toPlay) {
      results.push({
        matchKey: m.key,
        winnerId: m.aId!,
        scoreA: 21,
        scoreB: 10,
        isDraw: false,
        forfeit: false,
        status: "done",
      });
    }
  }
  return { results, snapshots };
}

const base = {
  scoringMode: "scored" as const,
  tiebreak: "points_scored" as const,
  drawSeed: 7,
  seedingMethod: "random" as const,
};

describe("round helpers", () => {
  it("identifies rounds and completion for single elimination", () => {
    const players = makePlayers(8);
    const config: TournamentConfig = { ...base, format: "single_elim" };

    const start = buildEngineState(config, players, []);
    const rounds = roundsOf(start);
    // 8-player single elim = 3 rounds (QF, SF, F).
    expect(rounds.length).toBe(3);
    expect(completedRounds(start).length).toBe(0);
    expect(currentRound(start)?.order).toBe(rounds[0]!.order);
    expect(phaseProgress(start).roundCount).toBe(3);

    const { snapshots } = playRoundByRound(config, players);
    // After round one finishes, four players remain.
    const afterR1 = snapshots.find((s) => completedRounds(s).length === 1);
    expect(afterR1).toBeDefined();
    expect(playersRemaining(afterR1!)).toBe(4);

    const final = snapshots[snapshots.length - 1]!;
    expect(final.complete).toBe(true);
    expect(playersRemaining(final)).toBe(1);
  });

  it("flags the group-to-knockout phase transition", () => {
    const players = makePlayers(8);
    const config: TournamentConfig = {
      ...base,
      format: "group_knockout",
      numGroups: 2,
      advancePerGroup: 2,
    };

    const start = buildEngineState(config, players, []);
    expect(start.phase).toBe("group");
    expect(start.phaseTransition).toBeNull();
    expect(start.activeStageIndex).toBe(0);

    const { snapshots } = playRoundByRound(config, players);
    const transition = snapshots.find((s) => s.phaseTransition !== null);
    expect(transition).toBeDefined();
    expect(transition!.phaseTransition).toEqual({
      from: "Group Stage",
      to: "Knockout",
    });
    expect(transition!.activeStageIndex).toBe(1);

    const final = snapshots[snapshots.length - 1]!;
    expect(final.complete).toBe(true);
    expect(final.championId).not.toBeNull();
  });

  it("tracks round completion across a round robin", () => {
    const players = makePlayers(4);
    const config: TournamentConfig = { ...base, format: "round_robin" };
    const { snapshots } = playRoundByRound(config, players);
    // Round robin of 4 players = 3 rounds.
    expect(roundsOf(snapshots[0]!).length).toBe(3);
    const final = snapshots[snapshots.length - 1]!;
    expect(final.complete).toBe(true);
    expect(completedRounds(final).length).toBe(3);
  });
});
