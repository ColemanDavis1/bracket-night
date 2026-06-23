import { createClient } from "@/lib/supabase/server";
import {
  computeTournamentState,
  type MatchResultRow,
  type PlayerRow,
  type TournamentRow,
} from "@/lib/db";
import type { HubData } from "@/components/hub/types";

/**
 * Load everything the hub needs for a tournament by slug and compute the live
 * engine state. Returns null if the tournament doesn't exist.
 */
export async function loadHub(slug: string): Promise<{
  data: HubData;
  organizerId: string;
  archived: boolean;
} | null> {
  const supabase = await createClient();

  const { data: t } = await supabase
    .from("tournaments")
    .select("*")
    .eq("slug", slug)
    .single();
  if (!t) return null;
  const tournament = t as TournamentRow;

  const selfService = tournament.config?.selfServiceScoring === true;
  const [{ data: players }, { data: results }, { data: auth }, { data: pending }] =
    await Promise.all([
      supabase
        .from("players")
        .select("*")
        .eq("tournament_id", tournament.id)
        .order("position"),
      supabase.from("match_results").select("*").eq("tournament_id", tournament.id),
      supabase.auth.getUser(),
      selfService
        ? supabase
            .from("pending_results")
            .select("*")
            .eq("tournament_id", tournament.id)
            .eq("status", "pending")
            .order("created_at")
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ]);

  const playerRows = (players ?? []) as PlayerRow[];
  const { state } = computeTournamentState(
    tournament,
    playerRows,
    (results ?? []) as MatchResultRow[],
  );

  const isOrganizer = auth.user?.id === tournament.organizer_id;

  const data: HubData = {
    tournament: {
      id: tournament.id,
      name: tournament.name,
      gameName: tournament.game_name,
      slug: tournament.slug,
      format: tournament.format,
      scoringMode: tournament.scoring_mode,
      tiebreak: tournament.tiebreak,
      aiTone: tournament.ai_tone,
      status: tournament.status,
      eventDate: tournament.event_date,
      notes: tournament.config?.notes ?? null,
      numStations: Math.min(8, Math.max(1, tournament.config?.numStations ?? 1)),
      seriesLength: tournament.config?.seriesLength ?? 1,
      selfServiceScoring: tournament.config?.selfServiceScoring ?? false,
    },
    players: playerRows.map((p) => ({
      id: p.id,
      name: p.name,
      withdrawn: p.withdrawn,
    })),
    state,
    prevRanking: tournament.prev_power_ranking ?? [],
    isOrganizer,
    pending: ((pending ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      matchKey: r.match_key as string,
      submittedBy: (r.submitted_by as string | null) ?? null,
      winnerId: (r.winner_player_id as string | null) ?? null,
      scoreA: (r.score_a as number | null) ?? null,
      scoreB: (r.score_b as number | null) ?? null,
      isDraw: (r.is_draw as boolean) ?? false,
      createdAt: r.created_at as string,
    })),
  };

  return {
    data,
    organizerId: tournament.organizer_id,
    archived: tournament.archived_at != null,
  };
}
