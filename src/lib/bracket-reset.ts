/**
 * Undoing a draw: pulling a single team back out of the bracket, or resetting
 * the whole event to setup.
 *
 * Both are destructive in the same way a structural settings change is — the
 * entrant pool changes, so match keys change, so any score already recorded
 * would land on a different pairing after the re-draw. Rather than silently
 * re-attaching them, the organizer confirms and we clear them.
 *
 * Pure — no DB, no React. Mirrors `tournament-settings.ts`.
 */

export interface ResetScope {
  /** Teams currently holding a bracket slot (a players row). */
  finalizedTeams: number;
  /** Recorded match results that a re-draw would orphan. */
  results: number;
}

/** A reset only needs confirming once something would actually be lost. */
export function resetNeedsConfirm(scope: ResetScope): boolean {
  return scope.results > 0;
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/** Shown on the reset control so the organizer knows exactly what it undoes. */
export function resetBracketMessage(scope: ResetScope): string {
  const parts: string[] = [];
  if (scope.finalizedTeams > 0) {
    parts.push(`removes ${plural(scope.finalizedTeams, "team")} from the draw`);
  }
  if (scope.results > 0) {
    parts.push(`clears ${plural(scope.results, "recorded score")}`);
  }
  if (!parts.length) {
    return "Resets the event to setup and re-draws. Nothing has been played yet, so nothing is lost.";
  }
  const what = parts.length === 2 ? `${parts[0]} and ${parts[1]}` : parts[0]!;
  return `Resetting ${what}. Rosters, sign-ups, and check-ins are kept.`;
}

/** Shown when pulling one team back out would orphan existing scores. */
export function unfinalizeBlockedMessage(
  teamName: string,
  results: number,
): string {
  return `Removing ${teamName} from the bracket re-draws the schedule and clears ${plural(
    results,
    "recorded score",
  )}. Confirm to continue.`;
}
