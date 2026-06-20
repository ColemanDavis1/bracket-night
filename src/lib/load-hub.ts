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
} | null> {
  const supabase = await createClient();

  const { data: t } = await supabase
    .from("tournaments")
    .select("*")
    .eq("slug", slug)
    .single();
  if (!t) return null;
  const tournament = t as TournamentRow;

  const [{ data: players }, { data: results }, { data: auth }] = await Promise.all([
    supabase
      .from("players")
      .select("*")
      .eq("tournament_id", tournament.id)
      .order("position"),
    supabase.from("match_results").select("*").eq("tournament_id", tournament.id),
    supabase.auth.getUser(),
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
    },
    players: playerRows.map((p) => ({
      id: p.id,
      name: p.name,
      withdrawn: p.withdrawn,
    })),
    state,
    prevRanking: tournament.prev_power_ranking ?? [],
    isOrganizer,
  };

  return { data, organizerId: tournament.organizer_id };
}
