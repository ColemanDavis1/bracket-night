import { cn } from "@/lib/utils";
import type {
  EngineState,
  ResolvedMatch,
  ScoringMode,
  StageKind,
  StageView,
} from "@/lib/engine";
import { stageDisplayLabel } from "@/lib/engine";
import { matchupName, type NameMap } from "@/lib/hub-helpers";
import { StandingsTable } from "./standings-table";

export function Bracket({
  state,
  names,
  scoringMode,
  expandAll = false,
}: {
  state: EngineState;
  names: NameMap;
  scoringMode: ScoringMode;
  /** Force every stage open (used by the print view). */
  expandAll?: boolean;
}) {
  if (state.stages) {
    return (
      <MultiStageBracket
        state={state}
        names={names}
        scoringMode={scoringMode}
        expandAll={expandAll}
      />
    );
  }
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
  stageIndex,
}: {
  title: string;
  stage: StageKind;
  state: EngineState;
  names: NameMap;
  scoringMode: ScoringMode;
  /** When set, only show matches from this multi-stage pipeline stage. */
  stageIndex?: number;
}) {
  const matches = state.matches
    .filter(
      (m) =>
        m.stage === stage &&
        !m.voided &&
        (stageIndex === undefined || m.stageIndex === stageIndex),
    )
    .sort((a, b) => a.order - b.order);
  if (matches.length === 0) return null;

  const rounds = Array.from(new Set(matches.map((m) => m.roundNumber))).sort(
    (a, b) => a - b,
  );

  // The active round is the earliest one still holding an unfinished match.
  const activeRound =
    rounds.find((r) =>
      matches.some(
        (m) =>
          m.roundNumber === r && m.status !== "done" && m.status !== "bye",
      ),
    ) ?? null;

  return (
    <section>
      <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {rounds.map((r) => {
          const col = matches.filter((m) => m.roundNumber === r);
          const isActive = r === activeRound;
          const isPast = activeRound != null && r < activeRound;
          return (
            <div
              key={r}
              className={cn(
                "flex min-w-[200px] flex-col justify-around gap-3 rounded-lg p-2 transition-opacity",
                isActive && "bg-primary/5 ring-1 ring-primary/40",
                isPast && "opacity-60",
              )}
            >
              <p
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wider",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                {col[0]?.label ?? `Round ${r}`}
                {isActive ? " · Now" : ""}
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

/** Per-stage view for multi_stage tournaments. */
function MultiStageBracket({
  state,
  names,
  scoringMode,
  expandAll = false,
}: {
  state: EngineState;
  names: NameMap;
  scoringMode: ScoringMode;
  expandAll?: boolean;
}) {
  const stages = state.stages ?? [];
  return (
    <div className="space-y-4">
      {stages.map((view) => {
        const label = stageDisplayLabel(stages, view.index);
        const isActive = view.index === state.activeStageIndex && !view.complete;
        // Completed stages collapse by default; the active stage stays open.
        const open = expandAll || isActive || !view.complete;
        return (
          <details
            key={view.index}
            open={open}
            className={cn(
              "rounded-xl border bg-card",
              isActive ? "border-primary/50" : "border-border",
            )}
          >
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-bold">
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                Stage {view.index + 1}
              </span>
              {label}
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {view.entrantCount} entrants
                {view.complete ? " · complete" : isActive ? " · live" : ""}
              </span>
            </summary>
            <div className="border-t border-border p-4">
              <StageBody
                view={view}
                state={state}
                names={names}
                scoringMode={scoringMode}
              />
            </div>
          </details>
        );
      })}
    </div>
  );
}

function StageBody({
  view,
  state,
  names,
  scoringMode,
}: {
  view: StageView;
  state: EngineState;
  names: NameMap;
  scoringMode: ScoringMode;
}) {
  if (view.kind === "group" && view.groupStandings) {
    return (
      <div>
        <div className="grid gap-4 md:grid-cols-2">
          {view.groupStandings.map((g) => (
            <div key={g.groupKey} className="rounded-lg border border-border p-3">
              <h4 className="mb-2 font-bold">Group {g.groupKey}</h4>
              <StandingsTable rows={g.rows} scoringMode={scoringMode} compact />
            </div>
          ))}
        </div>
        {view.advancerIds && view.advancerIds.length > 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Advancing:{" "}
            {view.advancerIds.map((id) => names[id] ?? "—").join(", ")}
          </p>
        ) : null}
      </div>
    );
  }

  if (view.kind === "round_robin") {
    return (
      <StandingsTable rows={view.standings ?? []} scoringMode={scoringMode} />
    );
  }

  // Elimination stage.
  if (view.matches.some((m) => m.stage === "winners")) {
    return (
      <div className="space-y-6">
        <BracketSection title="Winners bracket" stage="winners" state={state} names={names} scoringMode={scoringMode} stageIndex={view.index} />
        <BracketSection title="Losers bracket" stage="losers" state={state} names={names} scoringMode={scoringMode} stageIndex={view.index} />
        <BracketSection title="Grand final" stage="grand_final" state={state} names={names} scoringMode={scoringMode} stageIndex={view.index} />
      </div>
    );
  }
  return (
    <BracketSection
      title="Bracket"
      stage="knockout"
      state={state}
      names={names}
      scoringMode={scoringMode}
      stageIndex={view.index}
    />
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
