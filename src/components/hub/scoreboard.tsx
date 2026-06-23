import { Radio, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { EngineState, ScoringMode } from "@/lib/engine";
import { completedRounds, currentRound, phaseProgress } from "@/lib/engine";
import { matchupName, type NameMap } from "@/lib/hub-helpers";
import { ScoreEntryDialog } from "./score-entry-dialog";
import { SubmitResultDialog } from "./submit-result-dialog";
import { MatchRow } from "./match-row";
import type { HubTournament } from "./types";

export function Scoreboard({
  tournament,
  state,
  names,
  isOrganizer,
  pendingKeys = [],
}: {
  tournament: HubTournament;
  state: EngineState;
  names: NameMap;
  isOrganizer: boolean;
  /** Match keys already awaiting approval (self-service mode). */
  pendingKeys?: string[];
}) {
  const selfService = tournament.selfServiceScoring && !isOrganizer;
  const pendingSet = new Set(pendingKeys);
  const ready = state.matches
    .filter((m) => m.status === "ready")
    .sort((a, b) => a.order - b.order);
  const stationCount = Math.min(8, Math.max(1, tournament.numStations ?? 1));
  const current = ready[0];
  // With parallel stations, the first N ready matches are "now playing".
  const live = ready.slice(0, stationCount);
  const upNext = ready.slice(stationCount, stationCount + 4);

  if (state.complete && state.championId) {
    return (
      <div className="rounded-xl border border-broadcast-gold/40 bg-broadcast-gold/10 p-8 text-center">
        <Trophy className="mx-auto h-10 w-10 text-broadcast-gold" />
        <p className="mt-3 text-xs font-bold uppercase tracking-widest text-broadcast-gold">
          Champion
        </p>
        <p className="scorenum mt-1 text-3xl">
          {names[state.championId] ?? "—"}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {tournament.name} is in the books.
        </p>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No match is ready to play right now.
        {state.phase === "seeding"
          ? " Finish the seeding rounds to draw the bracket."
          : ""}
      </div>
    );
  }

  const { a, b } = matchupName(current, names);
  const pp = phaseProgress(state);
  const cur = currentRound(state);
  // A round just started when its first match is up and earlier rounds are done.
  const freshRound = cur != null && cur.done === 0 && completedRounds(state).length > 0;

  return (
    <div className="space-y-4">
      {freshRound ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-broadcast-green/40 bg-broadcast-green/10 py-2 text-xs font-bold uppercase tracking-widest text-broadcast-green">
          Round complete — {pp.label}
          {pp.roundCount > 1 ? ` Round ${pp.roundNumber} of ${pp.roundCount}` : ""} up
          next
        </div>
      ) : null}
      {stationCount === 1 ? (
        <div className="rounded-xl border border-primary/40 bg-gradient-to-b from-primary/10 to-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
              <Radio className="h-4 w-4 animate-pulse-red" /> Now playing
            </span>
            <Badge variant="outline">{current.label}</Badge>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div className="text-right">
              <p className="text-lg font-extrabold leading-tight sm:text-2xl">
                {a}
              </p>
            </div>
            <span className="scorenum text-2xl text-muted-foreground">VS</span>
            <div className="text-left">
              <p className="text-lg font-extrabold leading-tight sm:text-2xl">
                {b}
              </p>
            </div>
          </div>
          {isOrganizer ? (
            <div className="mt-5 flex justify-center">
              <ScoreEntryDialog
                tournamentId={tournament.id}
                match={current}
                names={names}
                scoringMode={tournament.scoringMode}
                seriesLength={tournament.seriesLength}
                trigger={<Button size="lg">Enter result</Button>}
              />
            </div>
          ) : selfService ? (
            <div className="mt-5 flex justify-center">
              <SubmitResultDialog
                tournamentId={tournament.id}
                match={current}
                names={names}
                scoringMode={tournament.scoringMode}
                alreadyPending={pendingSet.has(current.key)}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <div>
          <h3 className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
            <Radio className="h-4 w-4 animate-pulse-red" /> Now playing ·{" "}
            {live.length} of {stationCount} stations
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {live.map((m, i) => {
              const mm = matchupName(m, names);
              return (
                <div
                  key={m.key}
                  className="rounded-xl border border-primary/40 bg-gradient-to-b from-primary/10 to-card p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <Badge>Station {i + 1}</Badge>
                    <Badge variant="outline">{m.label}</Badge>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <p className="text-right text-sm font-extrabold leading-tight sm:text-lg">
                      {mm.a}
                    </p>
                    <span className="scorenum text-muted-foreground">VS</span>
                    <p className="text-left text-sm font-extrabold leading-tight sm:text-lg">
                      {mm.b}
                    </p>
                  </div>
                  {isOrganizer ? (
                    <div className="mt-4 flex justify-center">
                      <ScoreEntryDialog
                        tournamentId={tournament.id}
                        match={m}
                        names={names}
                        scoringMode={tournament.scoringMode}
                        seriesLength={tournament.seriesLength}
                        trigger={<Button size="sm">Enter result</Button>}
                      />
                    </div>
                  ) : selfService ? (
                    <div className="mt-4 flex justify-center">
                      <SubmitResultDialog
                        tournamentId={tournament.id}
                        match={m}
                        names={names}
                        scoringMode={tournament.scoringMode}
                        alreadyPending={pendingSet.has(m.key)}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {upNext.length > 0 ? (
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Up next
          </h3>
          <div className="space-y-2">
            {upNext.map((m) => (
              <MatchRow
                key={m.key}
                match={m}
                names={names}
                scoringMode={tournament.scoringMode}
                tournamentId={tournament.id}
                isOrganizer={isOrganizer}
                seriesLength={tournament.seriesLength}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
