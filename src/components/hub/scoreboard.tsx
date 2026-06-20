import { Radio, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { EngineState, ScoringMode } from "@/lib/engine";
import { matchupName, type NameMap } from "@/lib/hub-helpers";
import { ScoreEntryDialog } from "./score-entry-dialog";
import { MatchRow } from "./match-row";
import type { HubTournament } from "./types";

export function Scoreboard({
  tournament,
  state,
  names,
  isOrganizer,
}: {
  tournament: HubTournament;
  state: EngineState;
  names: NameMap;
  isOrganizer: boolean;
}) {
  const ready = state.matches
    .filter((m) => m.status === "ready")
    .sort((a, b) => a.order - b.order);
  const current = ready[0];
  const upNext = ready.slice(1, 5);

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

  return (
    <div className="space-y-4">
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
              trigger={<Button size="lg">Enter result</Button>}
            />
          </div>
        ) : null}
      </div>

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
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
