/**
 * Court/station assignment queue logic. Pure display/queue layer over the
 * already-scheduled matches — it NEVER reorders or alters the bracket, and is
 * never read by the engine.
 *
 * A match is "ready" when both slots are resolved and it has no result yet
 * (engine status === "ready"). Ready matches with no court yet form the ordered
 * "Up Next" queue; auto-assign pulls from the front of that queue to fill courts
 * nothing is sitting on.
 *
 * A court, once given to a match, is that match's until the match is done. An
 * earlier version treated only "playing" as occupying a court and left merely
 * assigned matches in the queue, so every auto-assign could shuffle them onto
 * different courts as the bracket advanced — teams were sent to court 1, then
 * court 3, for the same fixture. Assignment is now sticky: existing placements
 * are never moved, and auto-assign only ever fills genuinely empty courts.
 */

export type StationState = "queued" | "playing" | "done";

/** The slice of a resolved engine match this layer needs. */
export interface StationMatch {
  key: string;
  order: number;
  status: "pending" | "ready" | "done" | "bye";
}

/** A persisted station_assignments row (the fields we read). */
export interface StationAssignmentLike {
  matchKey: string;
  station: number | null;
  state: StationState;
}

/**
 * Ready, un-scored matches with no court yet, in stable schedule order. This is
 * the "Up Next" queue: a match that already has a court is not waiting for one.
 */
export function readyQueue(
  matches: readonly StationMatch[],
  assignments: readonly StationAssignmentLike[],
): StationMatch[] {
  const byKey = new Map(assignments.map((a) => [a.matchKey, a]));
  return matches
    .filter((m) => m.status === "ready")
    .filter((m) => {
      const a = byKey.get(m.key);
      if (!a) return true;
      if (a.state === "playing" || a.state === "done") return false;
      // Queued with a court is already placed; queued without one still waits.
      return a.station == null;
    })
    .slice()
    .sort((a, b) => a.order - b.order);
}

/**
 * Courts held by a match that hasn't finished — playing or merely assigned.
 * Holding a court from the moment it is assigned is what stops the shuffle.
 */
export function occupiedStations(
  assignments: readonly StationAssignmentLike[],
): Set<number> {
  const occ = new Set<number>();
  for (const a of assignments) {
    if (a.state !== "done" && a.station != null) occ.add(a.station);
  }
  return occ;
}

/** Station indexes (0-based) with no match currently playing on them. */
export function openStations(
  assignments: readonly StationAssignmentLike[],
  numStations: number,
): number[] {
  const occ = occupiedStations(assignments);
  const open: number[] = [];
  for (let i = 0; i < numStations; i++) if (!occ.has(i)) open.push(i);
  return open;
}

/**
 * Fill every empty court from the front of the ready queue, lowest court number
 * to the earliest match. Returns only new placements — matches that already
 * have a court are left exactly where they are.
 */
export function autoAssignStations(
  matches: readonly StationMatch[],
  assignments: readonly StationAssignmentLike[],
  numStations: number,
): { matchKey: string; station: number }[] {
  const open = openStations(assignments, numStations);
  const queue = readyQueue(matches, assignments);
  const out: { matchKey: string; station: number }[] = [];
  for (let i = 0; i < open.length && i < queue.length; i++) {
    out.push({ matchKey: queue[i]!.key, station: open[i]! });
  }
  return out;
}

/**
 * The unfinished assignment sitting on a court, if any. Used by the court cards
 * so an assigned-but-not-yet-called match is visible rather than hidden until
 * someone starts it.
 */
export function assignmentOnStation<T extends StationAssignmentLike>(
  assignments: readonly T[],
  station: number,
): T | null {
  const live = assignments.find(
    (a) => a.station === station && a.state === "playing",
  );
  if (live) return live;
  return (
    assignments.find((a) => a.station === station && a.state === "queued") ?? null
  );
}

/** Human label for a 0-based station index, falling back to "Station N". */
export function stationLabel(
  index: number,
  labels?: readonly string[] | null,
): string {
  return labels?.[index]?.trim() || `Station ${index + 1}`;
}
