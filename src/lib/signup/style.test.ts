import { describe, expect, it } from "vitest";
import {
  inferSignupStyle,
  normalizeSignupStyle,
  presetForStyle,
  usesCustomForm,
} from "./style";

describe("presetForStyle", () => {
  it("opens a team-only form for a large event", () => {
    expect(presetForStyle("large_event")).toEqual({
      entryMode: "team",
      signupEnabled: true,
      signupMode: "team_only",
    });
  });

  it("opens a solo-only form for individual sign-up", () => {
    expect(presetForStyle("individual")).toEqual({
      entryMode: "individual",
      signupEnabled: true,
      signupMode: "solo_only",
    });
  });

  it("closes sign-ups entirely for manual entry", () => {
    expect(presetForStyle("manual").signupEnabled).toBe(false);
  });
});

describe("normalizeSignupStyle", () => {
  it("defaults unknown values to manual", () => {
    expect(normalizeSignupStyle(undefined)).toBe("manual");
    expect(normalizeSignupStyle("bulk")).toBe("manual");
  });

  it("passes the real styles through", () => {
    expect(normalizeSignupStyle("large_event")).toBe("large_event");
    expect(normalizeSignupStyle("individual")).toBe("individual");
  });
});

describe("inferSignupStyle", () => {
  it("reads team mode as a large event", () => {
    expect(inferSignupStyle({ entryMode: "team", signupEnabled: false })).toBe(
      "large_event",
    );
  });

  it("separates open individual sign-up from manual entry", () => {
    expect(
      inferSignupStyle({ entryMode: "individual", signupEnabled: true }),
    ).toBe("individual");
    expect(inferSignupStyle({ entryMode: "individual" })).toBe("manual");
  });
});

describe("usesCustomForm", () => {
  it("is on for both public styles and off for manual", () => {
    expect(usesCustomForm("large_event")).toBe(true);
    expect(usesCustomForm("individual")).toBe(true);
    expect(usesCustomForm("manual")).toBe(false);
  });
});
