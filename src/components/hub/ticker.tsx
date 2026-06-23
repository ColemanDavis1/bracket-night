import type { EngineState } from "@/lib/engine";
import { phaseProgress } from "@/lib/engine";
import { matchupName, recordLine, type NameMap } from "@/lib/hub-helpers";

/** Broadcast-style scrolling ticker of recent results and standings. */
export function Ticker({
  state,
  names,
}: {
  state: EngineState;
  names: NameMap;
}) {
  const items: string[] = [];

  // Lead with phase context so viewers always know where the event stands.
  if (!state.complete && state.matches.length > 0) {
    const pp = phaseProgress(state);
    const parts: string[] = [];
    if (state.activeStageIndex > 0) parts.push(`STAGE ${state.activeStageIndex + 1}`);
    parts.push(pp.label.toUpperCase());
    if (pp.roundCount > 1) parts.push(`ROUND ${pp.roundNumber} OF ${pp.roundCount}`);
    items.push(parts.join(" · "));
  }

  const recent = [...state.matches]
    .filter((m) => m.status === "done")
    .sort((a, b) => b.order - a.order)
    .slice(0, 6);
  for (const m of recent) {
    const { a, b } = matchupName(m, names);
    if (m.isDraw) items.push(`${a} ${m.scoreA ?? ""}–${m.scoreB ?? ""} ${b} (DRAW)`);
    else {
      const w = m.winnerId ? (names[m.winnerId] ?? "") : "";
      items.push(
        m.scoreA != null && m.scoreB != null
          ? `${a} ${m.scoreA}–${m.scoreB} ${b} · ${w} wins`
          : `${w} def. ${m.winnerId === m.aId ? b : a}`,
      );
    }
  }
  for (const r of state.overallStandings.slice(0, 5)) {
    items.push(`#${r.rank} ${r.name} (${recordLine(r)})`);
  }

  if (items.length === 0) items.push("Tournament starting soon…");

  const doubled = [...items, ...items];

  return (
    <div className="ticker-mask overflow-hidden border-y border-border bg-card/60">
      <div className="flex w-max animate-ticker gap-8 whitespace-nowrap py-2 text-sm">
        {doubled.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
