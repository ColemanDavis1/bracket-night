import type { EngineState, ResolvedMatch, ScoringMode } from "@/lib/engine";
import type { NameMap } from "@/lib/hub-helpers";
import { MatchRow } from "./match-row";

export function Schedule({
  state,
  names,
  scoringMode,
  tournamentId,
  isOrganizer,
}: {
  state: EngineState;
  names: NameMap;
  scoringMode: ScoringMode;
  tournamentId: string;
  isOrganizer: boolean;
}) {
  if (state.matches.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        The schedule will appear here once the draw is set.
      </p>
    );
  }

  // Group consecutive matches by their round label.
  const groups: { label: string; matches: ResolvedMatch[] }[] = [];
  for (const m of [...state.matches].sort((a, b) => a.order - b.order)) {
    const last = groups[groups.length - 1];
    if (last && last.label === m.label) last.matches.push(m);
    else groups.push({ label: m.label, matches: [m] });
  }

  return (
    <div className="space-y-6">
      {groups.map((g, i) => {
        const done = g.matches.filter(
          (m) => m.status === "done" || m.status === "bye",
        ).length;
        return (
          <section key={`${g.label}-${i}`}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {g.label}
              </h3>
              <span className="text-xs text-muted-foreground">
                {done}/{g.matches.length}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {g.matches.map((m) => (
                <MatchRow
                  key={m.key}
                  match={m}
                  names={names}
                  scoringMode={scoringMode}
                  tournamentId={tournamentId}
                  isOrganizer={isOrganizer}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
