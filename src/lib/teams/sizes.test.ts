import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEAM_SIZE,
  capacityError,
  fillStatus,
  normalizeTeamSize,
  remainingCapacity,
  resolveTeamSize,
} from "./sizes";

const noOverride = { target_size: null, min_size: null, max_size: null };

describe("resolveTeamSize", () => {
  it("falls back to the built-in default when nothing is set", () => {
    expect(resolveTeamSize(noOverride)).toEqual(DEFAULT_TEAM_SIZE);
  });

  it("uses the tournament config when there is no per-team override", () => {
    const config = { target: 5, min: 3, max: 7 };
    expect(resolveTeamSize(noOverride, config)).toEqual(config);
  });

  it("prefers a per-team override over config, per dimension", () => {
    const config = { target: 5, min: 3, max: 7 };
    const team = { target_size: 6, min_size: null, max_size: null };
    // target overridden; min/max inherit config.
    expect(resolveTeamSize(team, config)).toEqual({ target: 6, min: 3, max: 7 });
  });

  it("mixes override, config, and default across dimensions", () => {
    const config = { max: 8 }; // only max provided by config
    const team = { target_size: null, min_size: 2, max_size: null };
    expect(resolveTeamSize(team, config)).toEqual({
      target: DEFAULT_TEAM_SIZE.target, // default
      min: 2, // override
      max: 8, // config
    });
  });
});

describe("fillStatus", () => {
  const size = { target: 4, min: 2, max: 5 };
  it("flags under / ok / over against min and max", () => {
    expect(fillStatus(1, size)).toBe("under");
    expect(fillStatus(2, size)).toBe("ok");
    expect(fillStatus(4, size)).toBe("ok");
    expect(fillStatus(5, size)).toBe("ok");
    expect(fillStatus(6, size)).toBe("over");
  });
});

describe("remainingCapacity", () => {
  const size = { target: 4, min: 2, max: 6 };
  it("counts the spots left, never below zero", () => {
    expect(remainingCapacity(0, size)).toBe(6);
    expect(remainingCapacity(5, size)).toBe(1);
    expect(remainingCapacity(6, size)).toBe(0);
    expect(remainingCapacity(9, size)).toBe(0);
  });
});

describe("capacityError", () => {
  const size = { target: 4, min: 2, max: 6 };

  it("allows a full roster of exactly max (captain + max-1 teammates)", () => {
    expect(capacityError(0, 6, size)).toBeNull();
  });

  it("rejects one person past max", () => {
    expect(capacityError(0, 7, size)).toMatch(/room for 6 more/);
  });

  it("accounts for people who already signed up under the same team name", () => {
    expect(capacityError(4, 2, size)).toBeNull();
    expect(capacityError(4, 3, size)).toMatch(/room for 2 more/);
  });

  it("says a full team is full, and names it", () => {
    expect(capacityError(6, 1, size, "The Ballers")).toBe(
      '"The Ballers" is already full at 6 players.',
    );
  });

  it("respects a max of 10 (nine teammates, not ten)", () => {
    const ten = { target: 8, min: 4, max: 10 };
    expect(capacityError(0, 10, ten)).toBeNull();
    expect(capacityError(0, 11, ten)).not.toBeNull();
  });
});

describe("normalizeTeamSize", () => {
  it("keeps a coherent range", () => {
    expect(normalizeTeamSize({ target: 4, min: 2, max: 6 })).toEqual({
      target: 4,
      min: 2,
      max: 6,
    });
  });

  it("raises max to at least min, and clamps target inside the range", () => {
    expect(normalizeTeamSize({ target: 9, min: 5, max: 3 })).toEqual({
      target: 5,
      min: 5,
      max: 5,
    });
    expect(normalizeTeamSize({ target: 1, min: 3, max: 6 })).toEqual({
      target: 3,
      min: 3,
      max: 6,
    });
  });

  it("floors min at 1", () => {
    expect(normalizeTeamSize({ target: 0, min: 0, max: 4 })).toEqual({
      target: 1,
      min: 1,
      max: 4,
    });
  });
});
