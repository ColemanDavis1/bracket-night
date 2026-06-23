import { describe, expect, it } from "vitest";
import { buildEngineState, type TournamentConfig } from "./index";
import { makePlayers, playToCompletion } from "./testHelpers";
import type { MatchResult } from "./types";

function baseConfig(stages: TournamentConfig["stages"]): TournamentConfig {
  return {
    format: "multi_stage",
    scoringMode: "scored",
    tiebreak: "points_scored",
    drawSeed: 7,
    seedingMethod: "manual",
    manualSeedOrder: undefined,
    stages,
  };
}

describe("multi_stage pipeline", () => {
  it("runs 128 → 32 → 8 → champion (groups, groups, single elim)", () => {
    const players = makePlayers(128);
    const config = baseConfig([
      { type: "group", numGroups: 32, advancePerGroup: 1, draw: "random" },
      { type: "group", numGroups: 8, advancePerGroup: 1, draw: "random" },
      { type: "single_elim" },
    ]);
    config.manualSeedOrder = players.map((p) => p.id);

    const { state } = playToCompletion(config, players);

    expect(state.complete).toBe(true);
    expect(state.stages).not.toBeNull();
    expect(state.stages!.length).toBe(3);
    expect(state.stages![0]!.entrantCount).toBe(128);
    expect(state.stages![1]!.entrantCount).toBe(32);
    expect(state.stages![2]!.entrantCount).toBe(8);
    // Strongest player (p1) wins everything in strongerWins.
    expect(state.championId).toBe("p1");
  });

  it("namespaces match keys per stage", () => {
    const players = makePlayers(8);
    const config = baseConfig([
      { type: "group", numGroups: 2, advancePerGroup: 2, draw: "random" },
      { type: "single_elim" },
    ]);
    config.manualSeedOrder = players.map((p) => p.id);

    const { state } = playToCompletion(config, players);
    expect(state.matches.every((m) => /^S\d+-/.test(m.key))).toBe(true);
    expect(state.matches.some((m) => m.key.startsWith("S1-"))).toBe(true);
    expect(state.matches.some((m) => m.key.startsWith("S2-"))).toBe(true);
    expect(state.matches.every((m) => typeof m.stageIndex === "number")).toBe(true);
  });

  it("applies byes when a non-power-of-two field enters a knockout stage", () => {
    // 3 groups of 4, top 2 advance = 6 entrants into single elim (padded to 8).
    const players = makePlayers(12);
    const config = baseConfig([
      { type: "group", numGroups: 3, advancePerGroup: 2, draw: "random" },
      { type: "single_elim" },
    ]);
    config.manualSeedOrder = players.map((p) => p.id);

    const { state } = playToCompletion(config, players);
    expect(state.complete).toBe(true);
    const knockout = state.stages![1]!;
    expect(knockout.entrantCount).toBe(6);
    // A 6-into-8 bracket must contain bye matches in round 1.
    const r1 = knockout.matches.filter((m) => m.roundNumber === 1);
    expect(r1.some((m) => m.status === "bye")).toBe(true);
    expect(state.championId).toBe("p1");
  });

  it("respects a manual group draw in the first stage", () => {
    const players = makePlayers(8);
    const manualGroups = [
      { groupKey: "A", participantIds: ["p1", "p3", "p5", "p7"] },
      { groupKey: "B", participantIds: ["p2", "p4", "p6", "p8"] },
    ];
    const config = baseConfig([
      {
        type: "group",
        numGroups: 2,
        advancePerGroup: 1,
        draw: "manual",
        manualGroups,
      },
      { type: "round_robin" },
    ]);
    config.manualSeedOrder = players.map((p) => p.id);

    const first = buildEngineState(config, players, []);
    expect(first.stages![0]!.groups).toEqual(manualGroups);

    const { state } = playToCompletion(config, players);
    expect(state.complete).toBe(true);
    // Final stage is a round robin between the two group winners (p1, p2).
    expect(state.stages![1]!.entrantCount).toBe(2);
    expect(state.championId).toBe("p1");
  });

  it("recomputes downstream stages when a stage-1 result is edited", () => {
    const players = makePlayers(8);
    const config = baseConfig([
      { type: "group", numGroups: 2, advancePerGroup: 1, draw: "manual",
        manualGroups: [
          { groupKey: "A", participantIds: ["p1", "p2", "p3", "p4"] },
          { groupKey: "B", participantIds: ["p5", "p6", "p7", "p8"] },
        ] },
      { type: "single_elim" },
    ]);
    config.manualSeedOrder = players.map((p) => p.id);

    const { state, results } = playToCompletion(config, players);
    // p1 wins group A normally.
    expect(state.stages![0]!.advancerIds).toContain("p1");

    // Edit stage 1: force p2 to beat p1 in their group-A meeting, and have p2
    // win its other group-A matches, so p2 advances instead of p1.
    const edited: MatchResult[] = results.map((r) => ({ ...r }));
    const setWinner = (key: string, winnerId: string) => {
      const m = state.matches.find((x) => x.key === key)!;
      const idx = edited.findIndex((r) => r.matchKey === key);
      const row: MatchResult = {
        matchKey: key,
        winnerId,
        scoreA: m.aId === winnerId ? 21 : 10,
        scoreB: m.bId === winnerId ? 21 : 10,
        isDraw: false,
        forfeit: false,
        status: "done",
      };
      if (idx >= 0) edited[idx] = row;
      else edited.push(row);
    };
    // Group A round-robin matches involving p2: make p2 sweep the group.
    for (const m of state.matches) {
      if (m.stageIndex === 0 && m.groupKey === "A" && (m.aId === "p2" || m.bId === "p2")) {
        setWinner(m.key, "p2");
      }
    }

    const recomputed = buildEngineState(config, players, edited);
    // Group A's advancer is now p2, and the knockout reflects the new entrant.
    expect(recomputed.stages![0]!.advancerIds).toContain("p2");
    expect(recomputed.stages![0]!.advancerIds).not.toContain("p1");
    expect(recomputed.stages![1]!.entrantIds).toContain("p2");
    expect(recomputed.stages![1]!.entrantIds).not.toContain("p1");
  });

  it("lazily generates only the active and completed stages", () => {
    const players = makePlayers(8);
    const config = baseConfig([
      { type: "group", numGroups: 2, advancePerGroup: 2, draw: "random" },
      { type: "single_elim" },
    ]);
    config.manualSeedOrder = players.map((p) => p.id);

    // No results yet: only stage 1 should be generated.
    const initial = buildEngineState(config, players, []);
    expect(initial.stages!.length).toBe(1);
    expect(initial.matches.every((m) => m.stageIndex === 0)).toBe(true);
    expect(initial.complete).toBe(false);
  });

  it("reproduces group_knockout as a two-stage pipeline", () => {
    const players = makePlayers(16);
    const config = baseConfig([
      { type: "group", numGroups: 4, advancePerGroup: 2, draw: "random" },
      { type: "knockout", format: "single_elim" },
    ]);
    config.manualSeedOrder = players.map((p) => p.id);

    const { state } = playToCompletion(config, players);
    expect(state.complete).toBe(true);
    expect(state.stages![1]!.entrantCount).toBe(8);
    expect(state.championId).toBe("p1");
  });
});
