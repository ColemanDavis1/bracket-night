import { describe, expect, it } from "vitest";
import {
  buildGoogleFormScript,
  formTitle,
  MAX_TEAMMATE_QUESTIONS,
  teammateQuestionCount,
  type FormSpec,
} from "./google-form-script";
import { detectColumns } from "@/lib/import-registrants";

const base: FormSpec = {
  eventName: "Church Game Night",
  gameName: "Cornhole",
  eventDate: "2026-09-12",
  signupMode: "both",
  teamMax: 4,
};

describe("teammateQuestionCount", () => {
  it("is one question per roster spot after the captain", () => {
    expect(teammateQuestionCount(4)).toBe(3);
    expect(teammateQuestionCount(2)).toBe(1);
  });

  it("emits none for solo-sized teams", () => {
    expect(teammateQuestionCount(1)).toBe(0);
    expect(teammateQuestionCount(0)).toBe(0);
  });

  it("caps a runaway roster", () => {
    expect(teammateQuestionCount(500)).toBe(MAX_TEAMMATE_QUESTIONS);
  });
});

describe("formTitle", () => {
  it("names the event", () => {
    expect(formTitle(base)).toBe("Church Game Night — Sign-up");
  });

  it("falls back when the name is blank", () => {
    expect(formTitle({ ...base, eventName: "  " })).toBe("Tournament — Sign-up");
  });
});

describe("buildGoogleFormScript", () => {
  it("offers both paths in both mode", () => {
    const s = buildGoogleFormScript(base);
    expect(s).toContain("Are you signing up solo or as a team?");
    expect(s).toContain("'Team Name'");
    expect(s).toContain("Teammate ");
    expect(s).toContain("setRequired(false)");
  });

  it("drops the mode question and requires a team name in team_only", () => {
    const s = buildGoogleFormScript({ ...base, signupMode: "team_only" });
    expect(s).not.toContain("Are you signing up solo or as a team?");
    expect(s).toContain("form.addTextItem().setTitle('Team Name').setRequired(true);");
  });

  it("drops every team question in solo_only", () => {
    const s = buildGoogleFormScript({ ...base, signupMode: "solo_only" });
    expect(s).not.toContain("Team Name");
    expect(s).not.toContain("Teammate");
    expect(s).not.toContain("solo or as a team");
  });

  it("includes phone only when asked", () => {
    expect(buildGoogleFormScript(base)).not.toContain("Phone Number");
    expect(
      buildGoogleFormScript({ ...base, collectPhone: true }),
    ).toContain("Phone Number");
  });

  it("escapes quotes in the event name so the script still parses", () => {
    const s = buildGoogleFormScript({ ...base, eventName: "Kelly's Night" });
    expect(s).toContain("\\'");
    expect(s).toContain("FormApp.create('Kelly\\'s Night — Sign-up')");
  });

  it("emits titles the CSV importer maps without help", () => {
    // The whole point of the generator: its headers must round-trip through
    // the same detection the import path uses.
    const header = [
      "Timestamp",
      "Your Name",
      "Email Address",
      "Phone Number",
      "Are you signing up solo or as a team?",
      "Team Name",
      "Teammate 2 Name",
      "Teammate 3 Name",
    ];
    expect(detectColumns(header)).toEqual({
      name: 1,
      email: 2,
      phone: 3,
      soloOrTeam: 4,
      teamName: 5,
      teammates: [6, 7],
    });
  });
});
