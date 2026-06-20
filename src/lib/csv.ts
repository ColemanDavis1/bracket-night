import type { EngineState } from "@/lib/engine";
import { matchupName, type NameMap } from "@/lib/hub-helpers";

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
): string {
  const schedule: (string | number)[][] = [
    ["Round", "Player A", "Player B", "Status", "Score A", "Score B", "Winner"],
  ];
  for (const m of [...state.matches].sort((a, b) => a.order - b.order)) {
    const { a, b } = matchupName(m, names);
    schedule.push([
      m.label,
      a,
      b,
      m.status,
      m.scoreA ?? "",
      m.scoreB ?? "",
      m.isDraw ? "Draw" : m.winnerId ? (names[m.winnerId] ?? "") : "",
    ]);
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
