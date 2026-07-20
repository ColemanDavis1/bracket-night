import { describe, expect, it } from "vitest";
import { autoFillTeams, type AutoFillTeam } from "./autofill";

function team(id: string, currentCount = 0, target = 4, max = 6, locked = false): AutoFillTeam {
  return { id, currentCount, target, max, locked };
}

describe("autoFillTeams", () => {
  it("distributes solos balanced across empty teams (round-robin)", () => {
    const teams = [team("A"), team("B"), team("C")];
    const solos = ["s1", "s2", "s3", "s4", "s5", "s6"];
    const { assignments, unassigned } = autoFillTeams(solos, teams);
    expect(unassigned).toEqual([]);
    const perTeam = new Map<string, number>();
    for (const a of assignments) perTeam.set(a.teamId, (perTeam.get(a.teamId) ?? 0) + 1);
    expect([...perTeam.values()].sort()).toEqual([2, 2, 2]);
  });

  it("fills the emptiest teams first, never the fullest", () => {
    const teams = [team("A", 3), team("B", 0), team("C", 1)];
    const { assignments } = autoFillTeams(["s1", "s2"], teams);
    // First placement must be the emptiest (B). Neither placement touches the
    // fullest team (A) while emptier teams remain below target.
    expect(assignments[0]!.teamId).toBe("B");
    expect(assignments.every((a) => a.teamId !== "A")).toBe(true);
    expect(assignments).toHaveLength(2);
  });

  it("never exceeds a team's max and overflows the rest", () => {
    const teams = [team("A", 0, 2, 2), team("B", 0, 2, 2)];
    const { assignments, unassigned } = autoFillTeams(["s1", "s2", "s3", "s4", "s5"], teams);
    expect(assignments.length).toBe(4); // 2 + 2 capacity
    expect(unassigned).toEqual(["s5"]);
  });

  it("skips locked teams entirely", () => {
    const teams = [team("A", 0, 4, 6, true), team("B")];
    const { assignments } = autoFillTeams(["s1", "s2"], teams);
    expect(assignments.every((a) => a.teamId === "B")).toBe(true);
  });

  it("handles fewer solos than teams (spreads, no duplicates)", () => {
    const teams = [team("A"), team("B"), team("C")];
    const { assignments, unassigned } = autoFillTeams(["s1"], teams);
    expect(assignments).toEqual([{ registrantId: "s1", teamId: "A" }]);
    expect(unassigned).toEqual([]);
  });

  it("fills toward target before topping up toward max", () => {
    // Two teams, target 2, max 4. Four solos should give 2/2 (hit target),
    // then the next two top up evenly to 3/3.
    const teams = [team("A", 0, 2, 4), team("B", 0, 2, 4)];
    const { assignments } = autoFillTeams(["s1", "s2", "s3", "s4", "s5", "s6"], teams);
    const perTeam = new Map<string, number>();
    for (const a of assignments) perTeam.set(a.teamId, (perTeam.get(a.teamId) ?? 0) + 1);
    expect([...perTeam.values()].sort()).toEqual([3, 3]);
  });

  it("returns everything unassigned when there are no eligible teams", () => {
    const { assignments, unassigned } = autoFillTeams(["s1", "s2"], []);
    expect(assignments).toEqual([]);
    expect(unassigned).toEqual(["s1", "s2"]);
  });
});
