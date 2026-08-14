import { describe, expect, it } from "vitest";
import {
  detectColumns,
  parseCsv,
  parseRegistrants,
  previewRegistrantImport,
} from "./import-registrants";

describe("parseCsv", () => {
  it("parses quoted fields with commas and escaped quotes", () => {
    const text = 'a,b,c\n"x, y","he said ""hi""",z';
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      ["x, y", 'he said "hi"', "z"],
    ]);
  });

  it("handles newlines inside quotes and skips blank rows", () => {
    const text = 'name\n"line1\nline2"\n\n';
    expect(parseCsv(text)).toEqual([["name"], ["line1\nline2"]]);
  });
});

describe("detectColumns", () => {
  it("maps Google Form headers case-insensitively", () => {
    const header = [
      "Timestamp",
      "Full Name",
      "Email Address",
      "Phone Number",
      "Are you signing up solo or as a team?",
      "Team Name",
      "Teammates",
    ];
    expect(detectColumns(header)).toEqual({
      name: 1,
      email: 2,
      phone: 3,
      soloOrTeam: 4,
      teamName: 5,
      teammates: [6],
    });
  });

  it("does not mistake 'Team Name' for the person name column", () => {
    const map = detectColumns(["Team Name", "Your Name"]);
    expect(map.teamName).toBe(0);
    expect(map.name).toBe(1);
  });

  it("collects every numbered teammate column in form order", () => {
    const map = detectColumns([
      "Your Name",
      "Team Name",
      "Teammate 2 Name",
      "Teammate 3 Name",
      "Teammate 4 Name",
    ]);
    expect(map.name).toBe(0);
    expect(map.teamName).toBe(1);
    expect(map.teammates).toEqual([2, 3, 4]);
  });
});

describe("parseRegistrants", () => {
  const csv = [
    "Name,Email,Solo or Team,Team Name,Teammates",
    "Alice,alice@x.com,Solo,,",
    "Bob,bob@x.com,Team,Bob Squad,\"Carol, Dave\"",
    "Eve,,Solo,,",
  ].join("\n");

  it("turns solo rows into solo registrants", () => {
    const rows = parseRegistrants(csv);
    const alice = rows.find((r) => r.name === "Alice")!;
    expect(alice.signupType).toBe("solo");
    expect(alice.email).toBe("alice@x.com");
  });

  it("expands a team row into a captain plus teammates", () => {
    const rows = parseRegistrants(csv);
    const squad = rows.filter((r) => r.teamName === "Bob Squad");
    expect(squad.map((r) => r.name)).toEqual(["Bob", "Carol", "Dave"]);
    expect(squad[0]!.isCaptain).toBe(true);
    expect(squad.slice(1).every((r) => !r.isCaptain)).toBe(true);
    expect(squad.every((r) => r.signupType === "team")).toBe(true);
  });

  it("expands one-question-per-teammate columns, skipping blanks", () => {
    const t = [
      "Your Name,Team Name,Teammate 2 Name,Teammate 3 Name,Teammate 4 Name",
      "Bob,Bob Squad,Carol,,Dave",
    ].join("\n");
    const rows = parseRegistrants(t);
    expect(rows.map((r) => r.name)).toEqual(["Bob", "Carol", "Dave"]);
    expect(rows.every((r) => r.teamName === "Bob Squad")).toBe(true);
  });

  it("infers team from a team name when there is no solo/team column", () => {
    const t = ["Name,Team Name", "Zoe,Zoe United"].join("\n");
    const rows = parseRegistrants(t);
    expect(rows[0]!.signupType).toBe("team");
    expect(rows[0]!.teamName).toBe("Zoe United");
  });

  it("defaults a captain team name when none is given", () => {
    const t = ["Name,Solo or Team", "Max,Team"].join("\n");
    const rows = parseRegistrants(t);
    expect(rows[0]!.teamName).toBe("Max's Team");
  });
});

describe("previewRegistrantImport", () => {
  const parsed = parseRegistrants(
    [
      "Name,Email,Solo or Team,Team Name,Teammates",
      "Alice,alice@x.com,Solo,,",
      "Bob,,Team,Bob Squad,Carol",
      "Eve,,Solo,,",
    ].join("\n"),
  );

  it("groups teams and solos, dedupes against existing names", () => {
    const preview = previewRegistrantImport(parsed, ["alice"]);
    expect(preview.duplicates).toBe(1); // Alice already exists
    expect(preview.solos.map((s) => s.name)).toEqual(["Eve"]);
    expect(preview.teams).toHaveLength(1);
    expect(preview.teams[0]!.name).toBe("Bob Squad");
    expect(preview.teams[0]!.members.map((m) => m.name)).toEqual(["Bob", "Carol"]);
  });

  it("respects the capacity cap as overflow", () => {
    const preview = previewRegistrantImport(parsed, [], 2);
    expect(preview.toAdd).toHaveLength(2);
    expect(preview.overflow).toBe(2); // Carol + Eve dropped
  });

  it("treats same name with a different email as distinct", () => {
    const rows = parseRegistrants(
      [
        "Name,Email,Solo or Team",
        "Sam,sam1@x.com,Solo",
        "Sam,sam2@x.com,Solo",
      ].join("\n"),
    );
    const preview = previewRegistrantImport(rows, []);
    expect(preview.toAdd).toHaveLength(2);
    expect(preview.duplicates).toBe(0);
  });
});
