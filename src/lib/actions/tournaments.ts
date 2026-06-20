"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import {
  computeTournamentState,
  type MatchResultRow,
  type PlayerRow,
  type TournamentRow,
} from "@/lib/db";
import type { TournamentConfigJson } from "@/lib/db";
import type {
  AiTone,
  MainFormat,
  PointsTiebreak,
  ScoringMode,
  SeedingMethod,
} from "@/lib/engine";
import { newSeed } from "@/lib/engine";

export interface CreateTournamentInput {
  name: string;
  gameName?: string;
  eventDate?: string | null;
  players: { name: string; seed?: number | null }[];
  format: MainFormat;
  scoringMode: ScoringMode;
  seedingMethod: SeedingMethod;
  tiebreak: PointsTiebreak;
  aiTone: AiTone;
  config: TournamentConfigJson;
  /** Manual seed order expressed as 0-based indexes into the players array. */
  manualSeedOrderIndexes?: number[];
  /** Manual group assignment expressed as 0-based player indexes per group. */
  manualGroupIndexes?: { groupKey: string; playerIndexes: number[] }[];
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function createTournament(input: CreateTournamentInput) {
  const { supabase, user } = await requireUser();

  if (!input.name?.trim()) throw new Error("Tournament name is required");
  if (input.players.length < 2 || input.players.length > 32) {
    throw new Error("Tournaments need between 2 and 32 players");
  }

  const drawSeed = newSeed();

  // Insert the tournament (retry once on the unlikely slug collision).
  let tournament: TournamentRow | null = null;
  for (let attempt = 0; attempt < 3 && !tournament; attempt++) {
    const { data, error } = await supabase
      .from("tournaments")
      .insert({
        organizer_id: user.id,
        name: input.name.trim(),
        game_name: input.gameName?.trim() || null,
        event_date: input.eventDate || null,
        slug: slugify(input.name),
        format: input.format,
        scoring_mode: input.scoringMode,
        seeding_method: input.seedingMethod,
        tiebreak: input.tiebreak,
        ai_tone: input.aiTone,
        draw_seed: drawSeed,
        status: "live",
        config: input.config ?? {},
      })
      .select()
      .single();
    if (!error) {
      tournament = data as TournamentRow;
      break;
    }
    if (error.code !== "23505") throw error; // not a unique violation -> bail
  }
  if (!tournament) throw new Error("Could not create tournament");

  // Insert players in entry order.
  const playerRows = input.players.map((p, i) => ({
    tournament_id: tournament!.id,
    name: p.name.trim() || `Player ${i + 1}`,
    seed: p.seed ?? null,
    position: i,
  }));
  const { data: inserted, error: pErr } = await supabase
    .from("players")
    .insert(playerRows)
    .select();
  if (pErr) throw pErr;

  // Resolve index-based config (manual seed order, manual groups) into ids.
  if (inserted) {
    const byPosition = (inserted as PlayerRow[])
      .slice()
      .sort((a, b) => a.position - b.position);
    const config: TournamentConfigJson = { ...(tournament.config ?? {}) };
    let touched = false;

    if (input.manualSeedOrderIndexes?.length) {
      config.manualSeedOrder = input.manualSeedOrderIndexes
        .map((idx) => byPosition[idx]?.id)
        .filter((id): id is string => Boolean(id));
      touched = true;
    }
    if (input.manualGroupIndexes?.length) {
      config.manualGroups = input.manualGroupIndexes.map((g) => ({
        groupKey: g.groupKey,
        participantIds: g.playerIndexes
          .map((idx) => byPosition[idx]?.id)
          .filter((id): id is string => Boolean(id)),
      }));
      touched = true;
    }
    if (touched) {
      await supabase
        .from("tournaments")
        .update({ config })
        .eq("id", tournament.id);
    }
  }

  revalidatePath("/dashboard");
  redirect(`/t/${tournament.slug}/manage`);
}

/** Load a tournament + children for a write action and assert ownership. */
async function loadOwned(tournamentId: string) {
  const { supabase, user } = await requireUser();
  const { data: t } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .single();
  if (!t) throw new Error("Tournament not found");
  if ((t as TournamentRow).organizer_id !== user.id) {
    throw new Error("Not authorized");
  }
  return { supabase, tournament: t as TournamentRow };
}

/** Recompute power-ranking snapshot + completion status after a change. */
async function recomputeAndPersist(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tournament: TournamentRow,
) {
  const [{ data: players }, { data: results }] = await Promise.all([
    supabase.from("players").select("*").eq("tournament_id", tournament.id),
    supabase.from("match_results").select("*").eq("tournament_id", tournament.id),
  ]);
  const { state } = computeTournamentState(
    tournament,
    (players ?? []) as PlayerRow[],
    (results ?? []) as MatchResultRow[],
  );
  const newRanking = state.overallStandings.map((r) => r.participantId);
  await supabase
    .from("tournaments")
    .update({
      prev_power_ranking: tournament.power_ranking ?? [],
      power_ranking: newRanking,
      status: state.complete ? "complete" : "live",
    })
    .eq("id", tournament.id);
}

export interface EnterResultInput {
  tournamentId: string;
  matchKey: string;
  winnerId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  isDraw: boolean;
  forfeit?: boolean;
}

export async function enterResult(input: EnterResultInput) {
  const { supabase, tournament } = await loadOwned(input.tournamentId);

  const { error } = await supabase.from("match_results").upsert(
    {
      tournament_id: tournament.id,
      match_key: input.matchKey,
      winner_player_id: input.isDraw ? null : input.winnerId,
      score_a: input.scoreA,
      score_b: input.scoreB,
      is_draw: input.isDraw,
      forfeit: input.forfeit ?? false,
    },
    { onConflict: "tournament_id,match_key" },
  );
  if (error) throw error;

  await recomputeAndPersist(supabase, tournament);
  revalidatePath(`/t/${tournament.slug}/manage`);
  revalidatePath(`/t/${tournament.slug}`);
}

export async function deleteResult(tournamentId: string, matchKey: string) {
  const { supabase, tournament } = await loadOwned(tournamentId);
  const { error } = await supabase
    .from("match_results")
    .delete()
    .eq("tournament_id", tournament.id)
    .eq("match_key", matchKey);
  if (error) throw error;
  await recomputeAndPersist(supabase, tournament);
  revalidatePath(`/t/${tournament.slug}/manage`);
  revalidatePath(`/t/${tournament.slug}`);
}

export async function setPlayerWithdrawn(
  tournamentId: string,
  playerId: string,
  withdrawn: boolean,
) {
  const { supabase, tournament } = await loadOwned(tournamentId);
  const { error } = await supabase
    .from("players")
    .update({ withdrawn })
    .eq("id", playerId)
    .eq("tournament_id", tournament.id);
  if (error) throw error;
  await recomputeAndPersist(supabase, tournament);
  revalidatePath(`/t/${tournament.slug}/manage`);
  revalidatePath(`/t/${tournament.slug}`);
}

export async function deleteTournament(tournamentId: string) {
  const { supabase, tournament } = await loadOwned(tournamentId);
  const { error } = await supabase
    .from("tournaments")
    .delete()
    .eq("id", tournament.id);
  if (error) throw error;
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
