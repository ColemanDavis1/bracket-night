"use client";

import { useTransition } from "react";
import { CheckCircle2, Radio, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  autoAssignStations,
  callMatchToStation,
  setMatchState,
} from "@/lib/actions/tournaments";
import {
  occupiedStations,
  readyQueue,
  stationLabel,
  type StationAssignmentLike,
  type StationMatch,
} from "@/lib/stations/assign";
import { matchupName, type NameMap } from "@/lib/hub-helpers";
import type { EngineState } from "@/lib/engine";
import type { HubStation } from "./types";

/**
 * Organizer court/station control. Shows one card per station with its current
 * match (call to court / mark done) plus an ordered Up Next queue and a one-tap
 * "auto-assign open courts". Pure queue logic lives in @/lib/stations/assign.
 */
export function StationsAdmin({
  tournamentId,
  state,
  names,
  stations,
  numStations,
  stationLabels,
}: {
  tournamentId: string;
  state: EngineState;
  names: NameMap;
  stations: HubStation[];
  numStations: number;
  stationLabels: string[];
}) {
  const [pending, startTransition] = useTransition();

  const assignments: StationAssignmentLike[] = stations.map((s) => ({
    matchKey: s.matchKey,
    station: s.station,
    state: s.state,
  }));
  const matches: StationMatch[] = state.matches.map((m) => ({
    key: m.key,
    order: m.order,
    status: m.status,
  }));
  const matchByKey = new Map(state.matches.map((m) => [m.key, m]));

  const playingByStation = new Map<number, HubStation>();
  for (const s of stations) {
    if (s.state === "playing" && s.station != null) {
      playingByStation.set(s.station, s);
    }
  }
  const occupied = occupiedStations(assignments);
  const openCourts: number[] = [];
  for (let i = 0; i < numStations; i++) if (!occupied.has(i)) openCourts.push(i);

  const upNext = readyQueue(matches, assignments);

  function auto() {
    startTransition(() => autoAssignStations(tournamentId));
  }
  function call(matchKey: string, station: number) {
    startTransition(() => callMatchToStation(tournamentId, { matchKey, station }));
  }
  function markDone(matchKey: string) {
    startTransition(() => setMatchState(tournamentId, { matchKey, state: "done" }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Assign matches to courts and keep the room moving. Entering a score frees
          the court automatically.
        </p>
        <Button size="sm" onClick={auto} disabled={pending || openCourts.length === 0}>
          <Zap className="h-4 w-4" /> Auto-assign courts
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: numStations }, (_, i) => {
          const playing = playingByStation.get(i);
          const m = playing ? matchByKey.get(playing.matchKey) : undefined;
          const matchup = m ? matchupName(m, names) : null;
          return (
            <Card key={i} className={playing ? "border-primary/40" : undefined}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>{stationLabel(i, stationLabels)}</span>
                  {playing ? (
                    <span className="flex items-center gap-1 text-xs font-bold uppercase text-primary">
                      <Radio className="h-3.5 w-3.5 animate-pulse-red" /> Live
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-muted-foreground">
                      Open
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {matchup ? (
                  <div>
                    <p className="text-sm font-semibold">
                      {matchup.a} <span className="text-muted-foreground">vs</span>{" "}
                      {matchup.b}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {m?.label}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      disabled={pending}
                      onClick={() => markDone(playing!.matchKey)}
                    >
                      <CheckCircle2 className="h-4 w-4" /> Mark done
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No match assigned.</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
          Up next ({upNext.length})
        </h3>
        {upNext.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No matches are ready to call. They&apos;ll appear here as slots resolve.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {upNext.map((q) => {
              const m = matchByKey.get(q.key)!;
              const { a, b } = matchupName(m, names);
              return (
                <li
                  key={q.key}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <span className="text-sm font-medium">
                    {a} <span className="text-muted-foreground">vs</span> {b}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {m.label}
                    </span>
                  </span>
                  <CallToCourt
                    numStations={numStations}
                    stationLabels={stationLabels}
                    defaultStation={openCourts[0] ?? 0}
                    disabled={pending}
                    onCall={(station) => call(q.key, station)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function CallToCourt({
  numStations,
  stationLabels,
  defaultStation,
  disabled,
  onCall,
}: {
  numStations: number;
  stationLabels: string[];
  defaultStation: number;
  disabled: boolean;
  onCall: (station: number) => void;
}) {
  if (numStations === 1) {
    return (
      <Button size="sm" disabled={disabled} onClick={() => onCall(0)}>
        <Radio className="h-4 w-4" /> Call
      </Button>
    );
  }
  return (
    <Select
      onValueChange={(v) => onCall(Number(v))}
      value=""
      disabled={disabled}
    >
      <SelectTrigger className="w-40">
        <SelectValue placeholder="Call to court…" />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: numStations }, (_, i) => (
          <SelectItem key={i} value={String(i)}>
            {stationLabel(i, stationLabels)}
            {i === defaultStation ? " (open)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
