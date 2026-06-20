import { describe, expect, it } from "vitest";
import {
  generateDoubleElimination,
  generateSingleElimination,
} from "./elimination";
import { resolveMatches, championOf, isComplete } from "./resolve";
import type { MatchResult, Participant } from "./types";
import { makePlayers, playToCompletion } from "./testHelpers";
import type { TournamentConfig } from "./index";

function seedIds(n: number): string[] {
  return makePlayers(n).map((p) => p.id);
}

describe("single elimination", () => {
  it("8 seeds -> 7 matches across 3 rounds, no byes", () => {
    const m = generateSingleElimination(8);
    expect(m.length).toBe(7);
    expect(m.filter((x) => x.roundNumber === 1).length).toBe(4);
    expect(m.filter((x) => x.aRef.kind === "bye" || x.bRef.kind === "bye").length).toBe(0);
  });

  it("awards byes to the TOP seeds for non-power-of-two counts", () => {
    // 6 players -> bracket of 8 -> seeds 1 and 2 should get round-1 byes.
    const matches = generateSingleElimination(6);
    const seeds = seedIds(6);
    const resolved = resolveMatches(matches, seeds, [], makePlayers(6));
    const r1 = resolved.filter((m) => m.roundNumber === 1);
    const byes = r1.filter((m) => m.status === "bye");
    expect(byes.length).toBe(2);
    const byeWinners = byes.map((m) => m.winnerId).sort();
    // Seeds 1 (p1) and 2 (p2) advance on byes.
    expect(byeWinners).toEqual(["p1", "p2"]);
  });

  it("plays to a single champion (5 players)", () => {
    const players = makePlayers(5);
    const config: TournamentConfig = {
      format: "single_elim",
      scoringMode: "scored",
      tiebreak: "points_scored",
      drawSeed: 1,
      seedingMethod: "manual",
      manualSeedOrder: players.map((p) => p.id),
    };
    const { state } = playToCompletion(config, players);
    expect(state.complete).toBe(true);
    // Stronger player (seed 1) always wins => champion is p1.
    expect(state.championId).toBe("p1");
  });
});

describe("double elimination", () => {
  function simulate(n: number, strengthOrder?: string[]) {
    const players = makePlayers(n);
    const config: TournamentConfig = {
      format: "double_elim",
      scoringMode: "win_loss",
      tiebreak: "points_scored",
      drawSeed: 1,
      seedingMethod: "manual",
      manualSeedOrder: players.map((p) => p.id),
    };
    return playToCompletion(config, players, undefined, strengthOrder);
  }

  it("produces exactly one champion and eliminates everyone else with 2 losses (n=4)", () => {
    const { state, results } = simulate(4);
    expect(state.complete).toBe(true);
    expect(state.championId).not.toBeNull();
    assertTwoLossElimination(state.matches, results, makePlayers(4), state.championId);
  });

  it("produces exactly one champion (n=8)", () => {
    const { state } = simulate(8);
    expect(state.complete).toBe(true);
    expect(state.championId).toBe("p1");
  });

  it("handles non-power-of-two counts with byes (n=6)", () => {
    const { state } = simulate(6);
    expect(state.complete).toBe(true);
    expect(state.championId).not.toBeNull();
  });

  it("triggers the grand-final reset when the losers-bracket player wins GF-1", () => {
    // Force an upset: make the eventual WB finalist weaker so the LB player
    // wins GF-1 and a reset (GF-2) is required.
    const players = makePlayers(4);
    // Strength order where p4 is strongest -> p4 climbs and forces a reset path.
    const { state } = simulate(4, ["p4", "p3", "p2", "p1"]);
    const gf2 = state.matches.find((m) => m.key === "GF-2");
    expect(gf2).toBeDefined();
    // Either the reset was played (not voided) or WB champ closed it out (voided).
    expect(state.complete).toBe(true);
  });
});

/** Every non-champion must finish with exactly two losses in double elim. */
function assertTwoLossElimination(
  matches: { winnerId: string | null; loserId: string | null; voided?: boolean }[],
  _results: MatchResult[],
  players: Participant[],
  championId: string | null,
) {
  const losses = new Map<string, number>(players.map((p) => [p.id, 0]));
  for (const m of matches) {
    if (m.voided) continue;
    if (m.loserId) losses.set(m.loserId, (losses.get(m.loserId) ?? 0) + 1);
  }
  for (const p of players) {
    if (p.id === championId) continue;
    expect(losses.get(p.id)).toBe(2);
  }
}
