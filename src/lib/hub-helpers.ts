import type { EngineState, ResolvedMatch, StandingsRow } from "@/lib/engine";

export type NameMap = Record<string, string>;

export function nameMapOf(
  players: { id: string; name: string }[],
): NameMap {
  return Object.fromEntries(players.map((p) => [p.id, p.name]));
}

export interface Awards {
  mvp: { id: string; name: string } | null;
  pointsLeader: { id: string; name: string; value: number } | null;
  longestStreak: { id: string; name: string; value: number } | null;
  biggestUpset: {
    winnerName: string;
    loserName: string;
    gap: number;
    label: string;
  } | null;
}

/** Running stat leaders + end-of-event awards, derived from the live state. */
export function computeAwards(
  state: EngineState,
  names: NameMap,
): Awards {
  const standings = state.overallStandings;
  const rankById = new Map(standings.map((r) => [r.participantId, r.rank]));

  const mvpId = state.complete
    ? state.championId ?? standings[0]?.participantId
    : standings[0]?.participantId;
  const mvp =
    mvpId && !state.overallStandings.find((r) => r.participantId === mvpId)?.withdrawn
      ? { id: mvpId, name: names[mvpId] ?? "—" }
      : standings[0]
        ? { id: standings[0].participantId, name: standings[0].name }
        : null;

  const pointsRow = standings
    .filter((r) => !r.withdrawn)
    .reduce<StandingsRow | null>(
      (best, r) => (!best || r.pointsFor > best.pointsFor ? r : best),
      null,
    );
  const pointsLeader =
    pointsRow && pointsRow.pointsFor > 0
      ? {
          id: pointsRow.participantId,
          name: pointsRow.name,
          value: pointsRow.pointsFor,
        }
      : null;

  const streakRow = standings.reduce<StandingsRow | null>(
    (best, r) => (!best || r.longestStreak > best.longestStreak ? r : best),
    null,
  );
  const longestStreak =
    streakRow && streakRow.longestStreak >= 2
      ? {
          id: streakRow.participantId,
          name: streakRow.name,
          value: streakRow.longestStreak,
        }
      : null;

  let biggestUpset: Awards["biggestUpset"] = null;
  for (const m of state.matches) {
    if (m.status !== "done" || m.isDraw || !m.winnerId || !m.loserId) continue;
    const wr = rankById.get(m.winnerId);
    const lr = rankById.get(m.loserId);
    if (wr == null || lr == null) continue;
    const gap = wr - lr; // winner ranked lower (bigger number) than loser => upset
    if (gap > 0 && (!biggestUpset || gap > biggestUpset.gap)) {
      biggestUpset = {
        winnerName: names[m.winnerId] ?? "—",
        loserName: names[m.loserId] ?? "—",
        gap,
        label: m.label,
      };
    }
  }

  return { mvp, pointsLeader, longestStreak, biggestUpset };
}

/** Movement vs the previous power-ranking snapshot. */
export function rankingMovement(
  current: string[],
  previous: string[],
): Map<string, number> {
  const prevIndex = new Map(previous.map((id, i) => [id, i]));
  const move = new Map<string, number>();
  current.forEach((id, i) => {
    const p = prevIndex.get(id);
    move.set(id, p == null ? 0 : p - i); // positive = moved up
  });
  return move;
}

export function matchupName(
  m: ResolvedMatch,
  names: NameMap,
): { a: string; b: string } {
  const a =
    m.aId != null
      ? (names[m.aId] ?? "—")
      : m.aRef.kind === "bye"
        ? "BYE"
        : "TBD";
  const b =
    m.bId != null
      ? (names[m.bId] ?? "—")
      : m.bRef.kind === "bye"
        ? "BYE"
        : "TBD";
  return { a, b };
}

export function recordLine(r: StandingsRow): string {
  return r.draws ? `${r.wins}-${r.losses}-${r.draws}` : `${r.wins}-${r.losses}`;
}
