import { describe, expect, it } from "vitest";
import { DEFAULT_TEAM_SIZE, fillStatus, resolveTeamSize } from "./sizes";

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
