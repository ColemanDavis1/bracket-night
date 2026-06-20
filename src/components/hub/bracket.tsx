import { cn } from "@/lib/utils";
import type { EngineState, ResolvedMatch, ScoringMode, StageKind } from "@/lib/engine";
import { matchupName, type NameMap } from "@/lib/hub-helpers";
import { StandingsTable } from "./standings-table";

export function Bracket({
  state,
  names,
  scoringMode,
}: {
  state: EngineState;
  names: NameMap;
  scoringMode: ScoringMode;
}) {
  const hasGroups = (state.groupStandings?.length ?? 0) > 0;
  const knockout = state.matches.filter(
    (m) => m.stage === "knockout" || m.stage === "winners" || m.stage === "losers" || m.stage === "grand_final",
  );
  const isElim = knockout.length > 0;

  if (!hasGroups && !isElim) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        This format has no bracket — follow the action in Standings &amp;
        Schedule.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {hasGroups ? (
        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Group stage
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {state.groupStandings!.map((g) => (
              <div
                key={g.groupKey}
                className="rounded-xl border border-border bg-card p-4"
              >
                <h4 className="mb-2 font-bold">Group {g.groupKey}</h4>
                <StandingsTable rows={g.rows} scoringMode={scoringMode} compact />
              </div>
            ))}
          </div>
          {state.advancers && state.advancers.length > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Advancing:{" "}
              {state.advancers
                .map((a) => `${names[a.participantId] ?? "—"} (${a.groupKey}${a.rankInGroup})`)
                .join(", ")}
            </p>
          ) : null}
        </section>
      ) : null}

      {state.matches.some((m) => m.stage === "winners") ? (
        <>
          <BracketSection title="Winners bracket" stage="winners" state={state} names={names} scoringMode={scoringMode} />
          <BracketSection title="Losers bracket" stage="losers" state={state} names={names} scoringMode={scoringMode} />
          <BracketSection title="Grand final" stage="grand_final" state={state} names={names} scoringMode={scoringMode} />
        </>
      ) : isElim ? (
        <BracketSection
          title={hasGroups ? "Knockout" : "Bracket"}
          stage="knockout"
          state={state}
          names={names}
          scoringMode={scoringMode}
        />
      ) : null}
    </div>
  );
}

function BracketSection({
  title,
  stage,
  state,
  names,
  scoringMode,
}: {
  title: string;
  stage: StageKind;
  state: EngineState;
  names: NameMap;
  scoringMode: ScoringMode;
}) {
  const matches = state.matches
    .filter((m) => m.stage === stage && !m.voided)
    .sort((a, b) => a.order - b.order);
  if (matches.length === 0) return null;

  const rounds = Array.from(new Set(matches.map((m) => m.roundNumber))).sort(
    (a, b) => a - b,
  );

  return (
    <section>
      <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {rounds.map((r) => {
          const col = matches.filter((m) => m.roundNumber === r);
          return (
            <div key={r} className="flex min-w-[200px] flex-col justify-around gap-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {col[0]?.label ?? `Round ${r}`}
              </p>
              {col.map((m) => (
                <BracketCard
                  key={m.key}
                  match={m}
                  names={names}
                  scoringMode={scoringMode}
                />
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BracketCard({
  match,
  names,
  scoringMode,
}: {
  match: ResolvedMatch;
  names: NameMap;
  scoringMode: ScoringMode;
}) {
  const { a, b } = matchupName(match, names);
  const done = match.status === "done";
  const showScore = done && scoringMode === "scored";
  return (
    <div className="rounded-lg border border-border bg-card text-sm">
      <Line
        name={a}
        score={match.scoreA}
        won={done && match.winnerId === match.aId}
        showScore={showScore}
      />
      <div className="h-px bg-border" />
      <Line
        name={b}
        score={match.scoreB}
        won={done && match.winnerId === match.bId}
        showScore={showScore}
      />
    </div>
  );
}

function Line({
  name,
  score,
  won,
  showScore,
}: {
  name: string;
  score: number | null;
  won: boolean;
  showScore: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-3 py-1.5",
        won ? "font-bold" : "text-muted-foreground",
      )}
    >
      <span className="truncate">{name}</span>
      {showScore ? <span className="scorenum">{score ?? "—"}</span> : null}
    </div>
  );
}
