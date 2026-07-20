/**
 * Court/station assignment queue logic. Pure display/queue layer over the
 * already-scheduled matches — it NEVER reorders or alters the bracket, and is
 * never read by the engine.
 *
 * A match is "ready" when both slots are resolved and it has no result yet
 * (engine status === "ready"). Ready matches that aren't currently playing form
 * the ordered "Up Next" queue; auto-assign pulls from the front of that queue
 * to fill any open (not currently "playing") station.
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
 * Ready, un-scored matches not already playing/done, in stable schedule order.
 * This is the "Up Next" queue.
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
      return !a || (a.state !== "playing" && a.state !== "done");
    })
    .slice()
    .sort((a, b) => a.order - b.order);
}

/** Stations currently occupied by a "playing" match. */
export function occupiedStations(
  assignments: readonly StationAssignmentLike[],
): Set<number> {
  const occ = new Set<number>();
  for (const a of assignments) {
    if (a.state === "playing" && a.station != null) occ.add(a.station);
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
 * Fill every open station from the front of the ready queue. Returns the
 * (matchKey -> station) placements to persist as state="playing". Assigns only
 * open stations, never completed matches, and preserves Up Next order.
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

/** Human label for a 0-based station index, falling back to "Station N". */
export function stationLabel(
  index: number,
  labels?: readonly string[] | null,
): string {
  return labels?.[index]?.trim() || `Station ${index + 1}`;
}
