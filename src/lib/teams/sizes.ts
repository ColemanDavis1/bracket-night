/**
 * Team-size resolution. Sizes are freeform within min..max; `target` is
 * advisory (drives fill progress + auto-fill). A per-team override wins over
 * the tournament-wide config default. Pure — no DB, no React.
 */

export interface TeamSizeConfig {
  target: number;
  min: number;
  max: number;
}

/** Fallback used when neither a per-team override nor config supplies a value. */
export const DEFAULT_TEAM_SIZE: TeamSizeConfig = { target: 4, min: 2, max: 6 };

/** The nullable override columns carried on a teams row. */
export interface TeamSizeOverride {
  target_size: number | null;
  min_size: number | null;
  max_size: number | null;
}

/**
 * Resolve a team's effective sizes. Each dimension independently prefers the
 * per-team override, then the tournament config, then the built-in default.
 */
export function resolveTeamSize(
  team: TeamSizeOverride,
  config?: Partial<TeamSizeConfig> | null,
): TeamSizeConfig {
  const base: TeamSizeConfig = { ...DEFAULT_TEAM_SIZE, ...(config ?? {}) };
  return {
    target: team.target_size ?? base.target,
    min: team.min_size ?? base.min,
    max: team.max_size ?? base.max,
  };
}

/** How a team's current member count compares to its resolved sizes. */
export function fillStatus(
  count: number,
  size: TeamSizeConfig,
): "under" | "ok" | "over" {
  if (count < size.min) return "under";
  if (count > size.max) return "over";
  return "ok";
}

/** Force a coherent size range: 1 <= min <= target <= max. */
export function normalizeTeamSize(size: TeamSizeConfig): TeamSizeConfig {
  const min = Math.max(1, Math.round(size.min || 1));
  const max = Math.max(min, Math.round(size.max || min));
  const target = Math.min(max, Math.max(min, Math.round(size.target || min)));
  return { target, min, max };
}

/** Roster spots left on a team that already has `count` members. */
export function remainingCapacity(count: number, size: TeamSizeConfig): number {
  return Math.max(0, size.max - count);
}

/**
 * Can `adding` more people join a team that already has `count`? Returns a
 * human-readable reason when they can't, so the sign-up form, the walk-in form,
 * and the server actions all reject overflow with the same wording.
 */
export function capacityError(
  count: number,
  adding: number,
  size: TeamSizeConfig,
  teamName?: string | null,
): string | null {
  const left = remainingCapacity(count, size);
  if (adding <= left) return null;
  const who = teamName ? `"${teamName}"` : "That team";
  if (left === 0) {
    return `${who} is already full at ${size.max} player${size.max === 1 ? "" : "s"}.`;
  }
  return `${who} has room for ${left} more player${left === 1 ? "" : "s"} (max ${size.max}).`;
}
