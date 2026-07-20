import { describe, expect, it } from "vitest";
import { buildEngineState, type TournamentConfig } from "@/lib/engine";
import { makePlayers, playToCompletion, strongerWins } from "@/lib/engine/testHelpers";
import type { MatchResult, ResolvedMatch } from "@/lib/engine";
import { canAddEntrant, hasKnockoutStarted } from "./gate";

const KNOCKOUT: ReadonlySet<ResolvedMatch["stage"]> = new Set([
  "winners",
  "losers",
  "grand_final",
  "knockout",
]);

/** Play one "wave" of ready matches, returning the appended results. */
function playWave(
  config: TournamentConfig,
  players: ReturnType<typeof makePlayers>,
  results: MatchResult[],
): MatchResult[] {
  const strength = new Map(players.map((p, i) => [p.id, i]));
  const state = buildEngineState(config, players, results);
  for (const m of state.matches.filter((x) => x.status === "ready")) {
    const r = strongerWins(m, strength);
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
  return results;
}

function base(format: TournamentConfig["format"]): TournamentConfig {
  return {
    format,
    scoringMode: "scored",
    tiebreak: "points_scored",
    drawSeed: 3,
    seedingMethod: "manual",
  };
}

describe("hasKnockoutStarted / canAddEntrant", () => {
  it("round robin: never locks until complete", () => {
    const players = makePlayers(4);
    const config = { ...base("round_robin"), manualSeedOrder: players.map((p) => p.id) };

    // Enter a single result: still mid-event (all RR matches are ready at once,
    // so play just one), adds remain allowed.
    const first = buildEngineState(config, players, []).matches.find(
      (m) => m.status === "ready",
    )!;
    const results: MatchResult[] = [
      {
        matchKey: first.key,
        winnerId: first.aId,
        scoreA: 21,
        scoreB: 10,
        isDraw: false,
        forfeit: false,
        status: "done",
      },
    ];
    const mid = buildEngineState(config, players, results);
    expect(mid.complete).toBe(false);
    expect(hasKnockoutStarted(mid)).toBe(false);
    expect(canAddEntrant(mid)).toBe(true);

    // Once complete, adds are closed.
    const { state: done } = playToCompletion(config, players);
    expect(done.complete).toBe(true);
    expect(canAddEntrant(done)).toBe(false);
  });

  for (const format of ["single_elim", "double_elim", "triple_elim"] as const) {
    it(`${format}: allowed before the first bracket result, locked after`, () => {
      const players = makePlayers(4);
      const config = { ...base(format), manualSeedOrder: players.map((p) => p.id) };

      const before = buildEngineState(config, players, []);
      expect(hasKnockoutStarted(before)).toBe(false);
      expect(canAddEntrant(before)).toBe(true);

      const results = playWave(config, players, []);
      const after = buildEngineState(config, players, results);
      expect(hasKnockoutStarted(after)).toBe(true);
      expect(canAddEntrant(after)).toBe(false);
    });
  }

  it("group + knockout: allowed through groups, locked once knockout has a result", () => {
    const players = makePlayers(8);
    const config: TournamentConfig = {
      ...base("group_knockout"),
      manualSeedOrder: players.map((p) => p.id),
      numGroups: 2,
      advancePerGroup: 2,
      groupDraw: "random",
      knockoutFormat: "single_elim",
    };

    // Drive results one wave at a time; assert the gate flips exactly when the
    // first knockout-stage match gets a result.
    const results: MatchResult[] = [];
    let sawKnockoutOpen = false;
    for (let guard = 0; guard < 200; guard++) {
      const state = buildEngineState(config, players, results);
      const knockoutDone = state.matches.some(
        (m) => KNOCKOUT.has(m.stage) && m.status === "done",
      );
      if (!knockoutDone) {
        // still in/at the group stage boundary — adding remains allowed
        expect(canAddEntrant(state)).toBe(true);
        sawKnockoutOpen = true;
      } else {
        expect(canAddEntrant(state)).toBe(false);
        break;
      }
      if (state.complete) break;
      playWave(config, players, results);
    }
    expect(sawKnockoutOpen).toBe(true);
  });

  it("multi_stage: locked once an elimination stage match has a result", () => {
    const players = makePlayers(8);
    const config: TournamentConfig = {
      ...base("multi_stage"),
      manualSeedOrder: players.map((p) => p.id),
      stages: [
        { type: "group", numGroups: 2, advancePerGroup: 2, draw: "random" },
        { type: "single_elim" },
      ],
    };

    const results: MatchResult[] = [];
    let lockedAtKnockout = false;
    for (let guard = 0; guard < 200; guard++) {
      const state = buildEngineState(config, players, results);
      const knockoutDone = state.matches.some(
        (m) => KNOCKOUT.has(m.stage) && m.status === "done",
      );
      expect(canAddEntrant(state)).toBe(!knockoutDone && !state.complete);
      if (knockoutDone) {
        lockedAtKnockout = true;
        break;
      }
      if (state.complete) break;
      playWave(config, players, results);
    }
    expect(lockedAtKnockout).toBe(true);
  });
});
