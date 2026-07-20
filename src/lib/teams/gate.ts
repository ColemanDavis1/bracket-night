/**
 * The "add teams before the knockout stage" gate. Pure: reads only from the
 * engine state — it never modifies the engine.
 *
 * Rule (across every format): new teams may be added while the event is still
 * in a non-elimination phase, and lock once the knockout/elimination bracket
 * has started (its first match has a real result).
 *
 *  - Round robin: no knockout stage exists, so adds are allowed until complete.
 *  - Single / double / triple elimination: the whole event is the bracket, so
 *    allowed only before the first bracket match has a result.
 *  - Group + knockout: allowed all through the group (round-robin) stage; locked
 *    once the first knockout-stage match has a result.
 *  - Multi-stage: allowed while the current stage is non-elimination; locked
 *    once the first elimination/knockout-stage match has a result.
 */
import type { EngineState, ResolvedMatch } from "@/lib/engine";

/** Engine stages that constitute a knockout/elimination bracket. */
const KNOCKOUT_STAGES: ReadonlySet<ResolvedMatch["stage"]> = new Set([
  "winners",
  "losers",
  "grand_final",
  "knockout",
]);

/**
 * Has any knockout/elimination match been *played* (a recorded result, not a
 * structural bye)? A bye auto-advances without a result and must not lock adds.
 */
export function hasKnockoutStarted(state: EngineState): boolean {
  return state.matches.some(
    (m) => KNOCKOUT_STAGES.has(m.stage) && m.status === "done" && !m.voided,
  );
}

/** Whether new teams / walk-ins may still be added to the tournament. */
export function canAddEntrant(state: EngineState): boolean {
  if (state.complete) return false;
  return !hasKnockoutStarted(state);
}

/** Shown in the UI and returned by blocked server actions. */
export const TEAMS_LOCKED_MESSAGE =
  "Teams are locked — the knockout round has started";
