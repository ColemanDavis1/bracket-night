import { describe, expect, it } from "vitest";
import {
  allowedSignupTypes,
  allowsSignupType,
  normalizeSignupMode,
  signupTypeBlockedMessage,
} from "./signup-mode";

describe("normalizeSignupMode", () => {
  it("defaults to both for anything unrecognized", () => {
    expect(normalizeSignupMode(undefined)).toBe("both");
    expect(normalizeSignupMode(null)).toBe("both");
    expect(normalizeSignupMode("teams")).toBe("both");
    expect(normalizeSignupMode(7)).toBe("both");
  });

  it("passes through the three real modes", () => {
    expect(normalizeSignupMode("both")).toBe("both");
    expect(normalizeSignupMode("team_only")).toBe("team_only");
    expect(normalizeSignupMode("solo_only")).toBe("solo_only");
  });
});

describe("allowsSignupType", () => {
  it("permits everything in both mode", () => {
    expect(allowsSignupType("both", "team")).toBe(true);
    expect(allowsSignupType("both", "solo")).toBe(true);
  });

  it("permits only teams in team_only", () => {
    expect(allowsSignupType("team_only", "team")).toBe(true);
    expect(allowsSignupType("team_only", "solo")).toBe(false);
  });

  it("permits only solos in solo_only", () => {
    expect(allowsSignupType("solo_only", "solo")).toBe(true);
    expect(allowsSignupType("solo_only", "team")).toBe(false);
  });
});

describe("allowedSignupTypes", () => {
  it("offers the team path first when both are open", () => {
    expect(allowedSignupTypes("both")).toEqual(["team", "solo"]);
  });

  it("collapses to a single path when restricted", () => {
    expect(allowedSignupTypes("team_only")).toEqual(["team"]);
    expect(allowedSignupTypes("solo_only")).toEqual(["solo"]);
  });
});

describe("signupTypeBlockedMessage", () => {
  it("tells the player what to do instead", () => {
    expect(signupTypeBlockedMessage("team_only")).toContain("full-team");
    expect(signupTypeBlockedMessage("solo_only")).toContain("solo");
  });
});
