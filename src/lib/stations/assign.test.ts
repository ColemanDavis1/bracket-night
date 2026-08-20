import { describe, expect, it } from "vitest";
import {
  autoAssignStations,
  openStations,
  readyQueue,
  stationLabel,
  type StationAssignmentLike,
  type StationMatch,
} from "./assign";

function m(key: string, order: number, status: StationMatch["status"] = "ready"): StationMatch {
  return { key, order, status };
}

describe("readyQueue", () => {
  it("keeps only ready, un-scored matches in schedule order", () => {
    const matches = [
      m("c", 3),
      m("a", 1),
      m("done", 2, "done"),
      m("pending", 4, "pending"),
      m("b", 2),
    ];
    expect(readyQueue(matches, []).map((x) => x.key)).toEqual(["a", "b", "c"]);
  });

  it("excludes matches already playing or done", () => {
    const matches = [m("a", 1), m("b", 2), m("c", 3)];
    const assignments: StationAssignmentLike[] = [
      { matchKey: "a", station: 0, state: "playing" },
      { matchKey: "b", station: null, state: "done" },
    ];
    expect(readyQueue(matches, assignments).map((x) => x.key)).toEqual(["c"]);
  });

  it("still queues a match assigned to no particular court", () => {
    const matches = [m("a", 1)];
    const assignments: StationAssignmentLike[] = [
      { matchKey: "a", station: null, state: "queued" },
    ];
    expect(readyQueue(matches, assignments).map((x) => x.key)).toEqual(["a"]);
  });

  it("drops a match that already has a court, even before it starts", () => {
    // Otherwise the next auto-assign could move it to a different court.
    const matches = [m("a", 1), m("b", 2)];
    const assignments: StationAssignmentLike[] = [
      { matchKey: "a", station: 2, state: "queued" },
    ];
    expect(readyQueue(matches, assignments).map((x) => x.key)).toEqual(["b"]);
  });
});

describe("openStations", () => {
  it("returns indexes with no playing match", () => {
    const assignments: StationAssignmentLike[] = [
      { matchKey: "a", station: 0, state: "playing" },
      { matchKey: "b", station: 2, state: "playing" },
      { matchKey: "c", station: 1, state: "done" }, // done does not occupy
    ];
    expect(openStations(assignments, 4)).toEqual([1, 3]);
  });

  it("counts an assigned-but-not-started court as taken", () => {
    const assignments: StationAssignmentLike[] = [
      { matchKey: "a", station: 0, state: "queued" },
    ];
    expect(openStations(assignments, 3)).toEqual([1, 2]);
  });
});

describe("autoAssignStations", () => {
  it("fills only open stations from the front of the ready queue", () => {
    const matches = [m("a", 1), m("b", 2), m("c", 3), m("d", 4)];
    const assignments: StationAssignmentLike[] = [
      { matchKey: "a", station: 0, state: "playing" }, // station 0 busy, a excluded
    ];
    // Stations 1 and 2 open (numStations 3); queue is b, c, d.
    const out = autoAssignStations(matches, assignments, 3);
    expect(out).toEqual([
      { matchKey: "b", station: 1 },
      { matchKey: "c", station: 2 },
    ]);
  });

  it("never assigns completed matches", () => {
    const matches = [m("done", 1, "done"), m("a", 2)];
    const out = autoAssignStations(matches, [], 4);
    expect(out).toEqual([{ matchKey: "a", station: 0 }]);
  });

  it("assigns nothing when no stations are open", () => {
    const matches = [m("a", 1)];
    const assignments: StationAssignmentLike[] = [
      { matchKey: "x", station: 0, state: "playing" },
    ];
    expect(autoAssignStations(matches, assignments, 1)).toEqual([]);
  });

  it("assigns nothing when the ready queue is empty", () => {
    expect(autoAssignStations([], [], 4)).toEqual([]);
  });
});

describe("stationLabel", () => {
  it("uses provided labels, falling back to Station N", () => {
    expect(stationLabel(0, ["Court 1", "Court 2"])).toBe("Court 1");
    expect(stationLabel(2, ["Court 1", "Court 2"])).toBe("Station 3");
    expect(stationLabel(0, null)).toBe("Station 1");
    expect(stationLabel(1, ["", "  "])).toBe("Station 2");
  });
});

describe("court assignment is stable across the tournament", () => {
  it("leaves an existing placement alone and fills only what is empty", () => {
    const matches = [m("a", 1), m("b", 2), m("c", 3)];
    const assignments: StationAssignmentLike[] = [
      { matchKey: "b", station: 1, state: "queued" },
    ];
    // Court 1 is b's. a and c take the courts nothing is sitting on.
    expect(autoAssignStations(matches, assignments, 3)).toEqual([
      { matchKey: "a", station: 0 },
      { matchKey: "c", station: 2 },
    ]);
  });

  it("is idempotent — running it again moves nobody", () => {
    const matches = [m("a", 1), m("b", 2)];
    let assignments: StationAssignmentLike[] = [];

    const first = autoAssignStations(matches, assignments, 2);
    assignments = first.map((p) => ({
      matchKey: p.matchKey,
      station: p.station,
      state: "playing" as const,
    }));
    expect(first).toEqual([
      { matchKey: "a", station: 0 },
      { matchKey: "b", station: 1 },
    ]);
    expect(autoAssignStations(matches, assignments, 2)).toEqual([]);
  });

  it("reuses a court only once its match is done", () => {
    const matches = [m("a", 1, "done"), m("b", 2)];
    const assignments: StationAssignmentLike[] = [
      { matchKey: "a", station: 0, state: "done" },
    ];
    expect(autoAssignStations(matches, assignments, 1)).toEqual([
      { matchKey: "b", station: 0 },
    ]);
  });

  it("gives the earliest waiting match the lowest free court", () => {
    const matches = [m("late", 9), m("early", 1)];
    expect(autoAssignStations(matches, [], 2)).toEqual([
      { matchKey: "early", station: 0 },
      { matchKey: "late", station: 1 },
    ]);
  });
});
