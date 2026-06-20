import { describe, expect, it } from "vitest";
import {
  generateSeedingSchedule,
  manualSeeds,
  nextPow2,
  randomSeeds,
  seedOrder,
} from "./seeding";
import { makePlayers } from "./testHelpers";

describe("nextPow2", () => {
  it("rounds up to the next power of two", () => {
    expect(nextPow2(2)).toBe(2);
    expect(nextPow2(3)).toBe(4);
    expect(nextPow2(5)).toBe(8);
    expect(nextPow2(8)).toBe(8);
    expect(nextPow2(9)).toBe(16);
    expect(nextPow2(17)).toBe(32);
  });
});

describe("seedOrder", () => {
  it("produces the canonical bracket order", () => {
    expect(seedOrder(2)).toEqual([1, 2]);
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it("keeps seeds 1 and 2 in opposite halves of the bracket", () => {
    const order = seedOrder(16);
    const firstHalf = order.slice(0, 8);
    const secondHalf = order.slice(8);
    expect(firstHalf.includes(1)).toBe(true);
    expect(secondHalf.includes(2)).toBe(true);
  });

  it("rejects non powers of two", () => {
    expect(() => seedOrder(6)).toThrow();
  });
});

describe("random + manual seeding", () => {
  it("random seeding is deterministic for a given draw seed", () => {
    const players = makePlayers(8);
    const a = randomSeeds(players, 1234).map((p) => p.id);
    const b = randomSeeds(players, 1234).map((p) => p.id);
    const c = randomSeeds(players, 9999).map((p) => p.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("manual seeding honours the supplied order", () => {
    const players = makePlayers(4);
    const seeded = manualSeeds(players, ["p3", "p1", "p4", "p2"]);
    const seedOf = new Map(seeded.map((p) => [p.id, p.seed]));
    expect(seedOf.get("p3")).toBe(1);
    expect(seedOf.get("p1")).toBe(2);
    expect(seedOf.get("p2")).toBe(4);
  });
});

describe("generateSeedingSchedule", () => {
  it("gives each player distinct opponents across rounds (6 players, 2 rounds)", () => {
    const players = makePlayers(6);
    const matches = generateSeedingSchedule(players, 2, 42);
    // 6 players, 2 rounds -> 3 matches per round -> 6 matches.
    expect(matches.length).toBe(6);
    const seen = new Map<string, Set<string>>();
    for (const m of matches) {
      const a = m.aRef.kind === "participant" ? m.aRef.id : "";
      const b = m.bRef.kind === "participant" ? m.bRef.id : "";
      if (!seen.has(a)) seen.set(a, new Set());
      if (!seen.has(b)) seen.set(b, new Set());
      // No rematches within the seeding rounds.
      expect(seen.get(a)!.has(b)).toBe(false);
      seen.get(a)!.add(b);
      seen.get(b)!.add(a);
    }
    // Each player appears exactly twice (one match per round).
    for (const set of seen.values()) expect(set.size).toBe(2);
  });

  it("handles odd counts with a rotating non-penalizing bye", () => {
    const players = makePlayers(5);
    const matches = generateSeedingSchedule(players, 2, 7);
    // 5 players (odd): 2 matches per round, one player idle each round.
    expect(matches.length).toBe(4);
  });

  it("full round robin schedules n-1 rounds", () => {
    const players = makePlayers(4);
    const matches = generateSeedingSchedule(players, "full", 1);
    // 4 players full RR -> 6 matches.
    expect(matches.length).toBe(6);
    expect(Math.max(...matches.map((m) => m.roundNumber))).toBe(3);
  });
});
