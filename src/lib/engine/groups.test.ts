import { describe, expect, it } from "vitest";
import {
  assignGroups,
  computeAdvancers,
  knockoutLeafOrder,
  type Advancer,
} from "./groups";
import { makePlayers, playToCompletion } from "./testHelpers";
import type { TournamentConfig } from "./index";

describe("assignGroups", () => {
  it("balances group sizes via snake distribution", () => {
    const players = makePlayers(8);
    const groups = assignGroups(players, 2, { seeds: players.map((p) => p.id) });
    expect(groups.length).toBe(2);
    expect(groups[0]!.participantIds.length).toBe(4);
    expect(groups[1]!.participantIds.length).toBe(4);
    // Top two seeds should be spread across different groups.
    expect(groups[0]!.participantIds[0]).toBe("p1");
    expect(groups[1]!.participantIds[0]).toBe("p2");
  });

  it("handles uneven counts (10 players, 4 groups)", () => {
    const players = makePlayers(10);
    const groups = assignGroups(players, 4, { seeds: players.map((p) => p.id) });
    const sizes = groups.map((g) => g.participantIds.length).sort();
    expect(sizes).toEqual([2, 2, 3, 3]);
  });
});

describe("knockoutLeafOrder cross-group pairing", () => {
  it("pairs group winners against other groups' runners-up (4 groups, top 2)", () => {
    const advancers: Advancer[] = [];
    for (const g of ["A", "B", "C", "D"]) {
      advancers.push({ participantId: `${g}1`, groupKey: g, rankInGroup: 1, wins: 3, pointDiff: 10 });
      advancers.push({ participantId: `${g}2`, groupKey: g, rankInGroup: 2, wins: 2, pointDiff: 5 });
    }
    const leaves = knockoutLeafOrder(advancers);
    expect(leaves.length).toBe(8);
    // Check no round-1 match pairs two players from the same group.
    const groupOf = (id: string | null) => (id ? id[0] : null);
    for (let i = 0; i < leaves.length; i += 2) {
      expect(groupOf(leaves[i]!)).not.toBe(groupOf(leaves[i + 1]!));
    }
    // First matchup is a group winner vs a different group's runner-up.
    expect(leaves[0]).toBe("A1");
    expect(leaves[1]).toBe("B2");
  });
});

describe("group stage -> knockout end to end", () => {
  it("runs 8 players, 2 groups, top 2 advance, into a single-elim knockout", () => {
    const players = makePlayers(8);
    const config: TournamentConfig = {
      format: "group_knockout",
      scoringMode: "scored",
      tiebreak: "points_scored",
      drawSeed: 5,
      seedingMethod: "manual",
      manualSeedOrder: players.map((p) => p.id),
      numGroups: 2,
      advancePerGroup: 2,
      groupDraw: "random",
      knockoutFormat: "single_elim",
    };
    const { state } = playToCompletion(config, players);
    expect(state.complete).toBe(true);
    expect(state.groups?.length).toBe(2);
    expect(state.advancers?.length).toBe(4);
    expect(state.championId).not.toBeNull();
  });
});

describe("computeAdvancers", () => {
  it("returns the top N of each group in finishing order", () => {
    const players = makePlayers(4);
    const groups = [
      { groupKey: "A", participantIds: ["p1", "p2"] },
      { groupKey: "B", participantIds: ["p3", "p4"] },
    ];
    // Single match per group; winner ranks first.
    const matches = [
      {
        key: "GA-1-1",
        stage: "group" as const,
        roundNumber: 1,
        order: 0,
        label: "Group A",
        groupKey: "A",
        aRef: { kind: "participant" as const, id: "p1" },
        bRef: { kind: "participant" as const, id: "p2" },
        allowDraw: true,
        aId: "p1",
        bId: "p2",
        status: "done" as const,
        winnerId: "p1",
        loserId: "p2",
        scoreA: 10,
        scoreB: 2,
        isDraw: false,
        forfeit: false,
      },
      {
        key: "GB-1-1",
        stage: "group" as const,
        roundNumber: 1,
        order: 1,
        label: "Group B",
        groupKey: "B",
        aRef: { kind: "participant" as const, id: "p3" },
        bRef: { kind: "participant" as const, id: "p4" },
        allowDraw: true,
        aId: "p3",
        bId: "p4",
        status: "done" as const,
        winnerId: "p3",
        loserId: "p4",
        scoreA: 10,
        scoreB: 2,
        isDraw: false,
        forfeit: false,
      },
    ];
    const advancers = computeAdvancers(groups, players, matches, 1, "points_scored");
    expect(advancers.map((a) => a.participantId).sort()).toEqual(["p1", "p3"]);
    expect(advancers.every((a) => a.rankInGroup === 1)).toBe(true);
  });
});
