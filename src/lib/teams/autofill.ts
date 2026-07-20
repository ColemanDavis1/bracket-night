/**
 * Balanced distribution of the solo pool into teams. Pure — the server action
 * `autoFillTeams` computes assignments here, then persists them.
 *
 * Strategy: round-robin fill of the emptiest teams first, preferring teams
 * still below their target before topping teams up toward max. Never exceeds a
 * team's max and never touches a locked team. Deterministic (stable by input
 * order) so previews match what gets written.
 */

export interface AutoFillTeam {
  id: string;
  /** Members already on the team (approved). */
  currentCount: number;
  target: number;
  max: number;
  locked?: boolean;
}

export interface AutoFillResult {
  /** Ordered list of (person -> team) placements to apply. */
  assignments: { registrantId: string; teamId: string }[];
  /** Registrant ids that could not be placed (all teams full/locked). */
  unassigned: string[];
}

export function autoFillTeams(
  soloRegistrantIds: readonly string[],
  teams: readonly AutoFillTeam[],
): AutoFillResult {
  const work = teams.map((t, index) => ({
    id: t.id,
    count: t.currentCount,
    target: t.target,
    max: t.max,
    locked: t.locked ?? false,
    index,
  }));

  const assignments: { registrantId: string; teamId: string }[] = [];
  const unassigned: string[] = [];

  for (const registrantId of soloRegistrantIds) {
    const candidates = work.filter((t) => !t.locked && t.count < t.max);
    if (candidates.length === 0) {
      unassigned.push(registrantId);
      continue;
    }
    // Prefer under-target teams, then the emptiest, then earliest by input order.
    candidates.sort(
      (a, b) =>
        (a.count >= a.target ? 1 : 0) - (b.count >= b.target ? 1 : 0) ||
        a.count - b.count ||
        a.index - b.index,
    );
    const chosen = candidates[0]!;
    chosen.count += 1;
    assignments.push({ registrantId, teamId: chosen.id });
  }

  return { assignments, unassigned };
}
