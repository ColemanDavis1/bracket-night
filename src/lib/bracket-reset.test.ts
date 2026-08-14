import { describe, expect, it } from "vitest";
import {
  resetBracketMessage,
  resetNeedsConfirm,
  unfinalizeBlockedMessage,
} from "./bracket-reset";

describe("resetNeedsConfirm", () => {
  it("is false before anything has been played", () => {
    expect(resetNeedsConfirm({ finalizedTeams: 8, results: 0 })).toBe(false);
  });

  it("is true once a score exists", () => {
    expect(resetNeedsConfirm({ finalizedTeams: 8, results: 1 })).toBe(true);
  });
});

describe("resetBracketMessage", () => {
  it("reassures when nothing is at stake", () => {
    const msg = resetBracketMessage({ finalizedTeams: 0, results: 0 });
    expect(msg).toContain("nothing is lost");
  });

  it("names both losses and singularizes", () => {
    const msg = resetBracketMessage({ finalizedTeams: 1, results: 1 });
    expect(msg).toContain("1 team");
    expect(msg).toContain("1 recorded score");
    expect(msg).not.toContain("teams");
    expect(msg).not.toContain("scores");
  });

  it("pluralizes and keeps rosters", () => {
    const msg = resetBracketMessage({ finalizedTeams: 6, results: 3 });
    expect(msg).toContain("6 teams");
    expect(msg).toContain("3 recorded scores");
    expect(msg).toContain("Rosters");
  });

  it("omits the scores clause when none exist", () => {
    const msg = resetBracketMessage({ finalizedTeams: 4, results: 0 });
    expect(msg).toContain("4 teams");
    expect(msg).not.toContain("score");
  });
});

describe("unfinalizeBlockedMessage", () => {
  it("names the team and the cost", () => {
    expect(unfinalizeBlockedMessage("Blue Crew", 2)).toBe(
      "Removing Blue Crew from the bracket re-draws the schedule and clears 2 recorded scores. Confirm to continue.",
    );
  });
});
