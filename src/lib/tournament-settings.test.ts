import { describe, expect, it } from "vitest";
import {
  rebuildBlockedMessage,
  sanitizeSettingsPatch,
  structuralChanges,
  type SettingsSnapshot,
} from "./tournament-settings";

const current: SettingsSnapshot = {
  name: "Church Game Night",
  format: "round_robin",
  scoringMode: "win_loss",
  seedingMethod: "random",
  tiebreak: "points_scored",
  aiTone: "hype",
  roundRobinDouble: false,
  numStations: 1,
  seriesLength: 1,
  selfServiceScoring: false,
};

describe("structuralChanges", () => {
  it("is empty when nothing structural is touched", () => {
    expect(structuralChanges(current, { name: "New name" })).toEqual([]);
    expect(structuralChanges(current, { scoringMode: "scored" })).toEqual([]);
    expect(structuralChanges(current, { numStations: 4 })).toEqual([]);
    expect(structuralChanges(current, { seriesLength: 3 })).toEqual([]);
    expect(structuralChanges(current, { notes: "Bring a chair" })).toEqual([]);
  });

  it("ignores a value that is submitted unchanged", () => {
    expect(structuralChanges(current, { format: "round_robin" })).toEqual([]);
  });

  it("flags a format switch once the head count is known", () => {
    expect(structuralChanges(current, { format: "group_knockout" })).toEqual([
      "format",
    ]);
  });

  it("flags group shape and seeding changes", () => {
    expect(
      structuralChanges(current, {
        format: "group_knockout",
        numGroups: 4,
        advancePerGroup: 2,
        seedingMethod: "manual",
      }),
    ).toEqual(["format", "seedingMethod", "numGroups", "advancePerGroup"]);
  });

  it("treats a re-draw as structural on its own", () => {
    expect(structuralChanges(current, { reshuffleDraw: true })).toEqual([
      "reshuffleDraw",
    ]);
    expect(structuralChanges(current, { reshuffleDraw: false })).toEqual([]);
  });
});

describe("rebuildBlockedMessage", () => {
  it("names the fields and pluralizes the score count", () => {
    expect(rebuildBlockedMessage(["format"], 1)).toBe(
      "Changing format rebuilds the schedule and clears 1 recorded score. Confirm to continue.",
    );
    expect(rebuildBlockedMessage(["format", "numGroups"], 3)).toBe(
      "Changing format, number of groups rebuilds the schedule and clears 3 recorded scores. Confirm to continue.",
    );
  });
});

describe("sanitizeSettingsPatch", () => {
  it("clamps stations to 1..8", () => {
    expect(sanitizeSettingsPatch({ numStations: 0 }).numStations).toBe(1);
    expect(sanitizeSettingsPatch({ numStations: 99 }).numStations).toBe(8);
  });

  it("clamps group settings to workable ranges", () => {
    expect(sanitizeSettingsPatch({ numGroups: 0 }).numGroups).toBe(1);
    expect(sanitizeSettingsPatch({ numGroups: 500 }).numGroups).toBe(32);
    expect(sanitizeSettingsPatch({ advancePerGroup: 0 }).advancePerGroup).toBe(1);
  });

  it("falls back to best-of-1 for an unsupported series length", () => {
    expect(sanitizeSettingsPatch({ seriesLength: 3 }).seriesLength).toBe(3);
    expect(
      sanitizeSettingsPatch({ seriesLength: 4 as 1 | 3 | 5 }).seriesLength,
    ).toBe(1);
  });

  it("keeps a full round robin of seeding rounds as-is", () => {
    expect(sanitizeSettingsPatch({ seedingRounds: "full" }).seedingRounds).toBe(
      "full",
    );
    expect(sanitizeSettingsPatch({ seedingRounds: 0 }).seedingRounds).toBe(1);
  });

  it("leaves untouched fields alone", () => {
    expect(sanitizeSettingsPatch({ name: "Keep me" })).toEqual({
      name: "Keep me",
    });
  });
});
