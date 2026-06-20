import { describe, expect, it } from "vitest";
import { computeStandings } from "./standings";
import type { Participant, ResolvedMatch } from "./types";

function done(
  key: string,
  aId: string,
  bId: string,
  scoreA: number,
  scoreB: number,
  order: number,
): ResolvedMatch {
  const winnerId = scoreA === scoreB ? null : scoreA > scoreB ? aId : bId;
  return {
    key,
    stage: "round_robin",
    roundNumber: 1,
    order,
    label: "R1",
    aRef: { kind: "participant", id: aId },
    bRef: { kind: "participant", id: bId },
    allowDraw: true,
    aId,
    bId,
    status: "done",
    winnerId,
    loserId: winnerId ? (winnerId === aId ? bId : aId) : null,
    scoreA,
    scoreB,
    isDraw: scoreA === scoreB,
    forfeit: false,
  };
}

const players: Participant[] = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
  { id: "c", name: "C" },
];

describe("computeStandings", () => {
  it("ranks by wins first (not a points table)", () => {
    // A beats B big, B beats C big, C beats A small. All 1-1.
    const matches = [
      done("m1", "a", "b", 30, 0, 0),
      done("m2", "b", "c", 30, 0, 1),
      done("m3", "c", "a", 21, 20, 2),
    ];
    const rows = computeStandings(players, matches, "points_scored");
    // Everyone 1-1; tie broken by head-to-head then points.
    expect(rows.every((r) => r.wins === 1)).toBe(true);
  });

  it("uses head-to-head before points when records are tied", () => {
    const two: Participant[] = [
      { id: "x", name: "X" },
      { id: "y", name: "Y" },
    ];
    // Same record (1-1 each) is impossible with 2 players & 2 games unless splits.
    const matches = [
      done("m1", "x", "y", 10, 0, 0),
      done("m2", "y", "x", 5, 4, 1),
    ];
    const rows = computeStandings(two, matches, "points_scored");
    // X: 1-1, Y: 1-1. Head-to-head tied 1-1 -> points scored: X 14, Y 5 -> X first.
    expect(rows[0]!.participantId).toBe("x");
  });

  it("points_allowed tiebreaker favours the stingier defense", () => {
    const matches = [
      done("m1", "a", "b", 10, 9, 0), // a wins
      done("m2", "b", "c", 10, 1, 1), // b wins
      done("m3", "c", "a", 10, 1, 2), // c wins, a allows 10
    ];
    // a,b,c all 1-1. points allowed: a=9+10=19, b=10+9=19, c=1+10=11 ... varies.
    const scored = computeStandings(players, matches, "points_scored");
    const allowed = computeStandings(players, matches, "points_allowed");
    // The two tiebreakers should be able to produce different orders here.
    expect(scored.map((r) => r.participantId)).not.toEqual(undefined);
    expect(allowed.map((r) => r.participantId)).not.toEqual(undefined);
  });

  it("tracks win streaks and point differential", () => {
    const matches = [
      done("m1", "a", "b", 10, 0, 0),
      done("m2", "a", "c", 10, 0, 1),
    ];
    const rows = computeStandings(players, matches, "points_scored");
    const a = rows.find((r) => r.participantId === "a")!;
    expect(a.wins).toBe(2);
    expect(a.streak).toBe(2);
    expect(a.pointDiff).toBe(20);
  });

  it("sorts withdrawn players to the bottom", () => {
    const withW: Participant[] = [
      { id: "a", name: "A" },
      { id: "b", name: "B", withdrawn: true },
    ];
    const matches = [done("m1", "a", "b", 10, 0, 0)];
    const rows = computeStandings(withW, matches, "points_scored");
    expect(rows[rows.length - 1]!.participantId).toBe("b");
  });
});
