import type { EngineState } from "@/lib/engine";
import { stageDisplayLabel } from "@/lib/engine";
import { matchupName, type NameMap } from "@/lib/hub-helpers";

/** Human label for a match's pipeline stage (multi_stage only). */
function stageNameOf(state: EngineState, stageIndex: number | undefined): string {
  if (state.stages && typeof stageIndex === "number") {
    return stageDisplayLabel(state.stages, stageIndex);
  }
  return "";
}

function escape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toRows(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(escape).join(",")).join("\n");
}

/**
 * A single CSV export containing both the schedule/scores and the final
 * standings, separated by a blank line and section headers.
 */
export function tournamentCsv(
  name: string,
  state: EngineState,
  names: NameMap,
  /** Multi-stage: limit the export to a single pipeline stage. */
  stageIndex?: number | null,
): string {
  const isMulti = state.stages !== null;
  const header = isMulti
    ? ["Stage", "Round", "Player A", "Player B", "Status", "Score A", "Score B", "Winner"]
    : ["Round", "Player A", "Player B", "Status", "Score A", "Score B", "Winner"];
  const schedule: (string | number)[][] = [header];
  const matches = [...state.matches]
    .filter(
      (m) =>
        stageIndex == null ||
        stageIndex === undefined ||
        m.stageIndex === stageIndex,
    )
    .sort((a, b) => a.order - b.order);
  for (const m of matches) {
    const { a, b } = matchupName(m, names);
    const row = [
      m.label,
      a,
      b,
      m.status,
      m.scoreA ?? "",
      m.scoreB ?? "",
      m.isDraw ? "Draw" : m.winnerId ? (names[m.winnerId] ?? "") : "",
    ];
    schedule.push(isMulti ? [stageNameOf(state, m.stageIndex), ...row] : row);
  }

  const standings: (string | number)[][] = [
    ["Rank", "Player", "W", "L", "D", "PF", "PA", "Diff", "Streak"],
  ];
  for (const r of state.overallStandings) {
    standings.push([
      r.rank,
      r.name,
      r.wins,
      r.losses,
      r.draws,
      r.pointsFor,
      r.pointsAgainst,
      r.pointDiff,
      r.longestStreak,
    ]);
  }

  return [
    `${name} — Schedule & Scores`,
    toRows(schedule),
    "",
    `${name} — Standings`,
    toRows(standings),
  ].join("\n");
}
