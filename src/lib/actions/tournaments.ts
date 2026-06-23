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
import { MIN_PLAYERS, MAX_PLAYERS } from "@/lib/constants";
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
  if (input.players.length < MIN_PLAYERS || input.players.length > MAX_PLAYERS) {
    throw new Error(
      `Tournaments need between ${MIN_PLAYERS} and ${MAX_PLAYERS} players`,
    );
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
  /** Per-game scores for a best-of-N series (Feature 13). */
  seriesGames?: { a: number; b: number }[] | null;
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
      series_games: input.seriesGames ?? null,
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

/**
 * Add a late-arriving player after a tournament has started (Feature 11).
 *
 * How the new player slots into play depends on the format and how far the draw
 * has progressed (handled by the pure engine on the next recompute):
 *  - Round robin / group stage: the player joins the rotation; their not-yet-
 *    played matches appear, already-passed rounds count as unplayed.
 *  - Elimination: the bracket re-draws from the expanded pool; matches that
 *    already have results are preserved by match key. The organizer is warned
 *    that a manual bracket adjustment may be needed.
 */
export async function addPlayer(tournamentId: string, name: string) {
  const { supabase, tournament } = await loadOwned(tournamentId);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Player name is required");
  if (tournament.status === "complete") {
    throw new Error("This tournament is already complete");
  }

  const { data: existing } = await supabase
    .from("players")
    .select("name, position")
    .eq("tournament_id", tournament.id);
  const rows = (existing ?? []) as { name: string; position: number }[];

  if (rows.length >= MAX_PLAYERS) {
    throw new Error(`Maximum ${MAX_PLAYERS} players`);
  }
  if (rows.some((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase())) {
    throw new Error("A player with that name already exists");
  }

  const nextPosition = rows.reduce((max, p) => Math.max(max, p.position), -1) + 1;
  const { error } = await supabase.from("players").insert({
    tournament_id: tournament.id,
    name: trimmed,
    seed: null,
    position: nextPosition,
    withdrawn: false,
  });
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

/** Soft-delete: hide a tournament's public hub but keep all data. */
export async function archiveTournament(tournamentId: string) {
  const { supabase, tournament } = await loadOwned(tournamentId);
  const { error } = await supabase
    .from("tournaments")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", tournament.id);
  if (error) throw error;
  revalidatePath("/dashboard");
  revalidatePath(`/t/${tournament.slug}`);
}

/** Restore an archived tournament to the active list and public hub. */
export async function unarchiveTournament(tournamentId: string) {
  const { supabase, tournament } = await loadOwned(tournamentId);
  const { error } = await supabase
    .from("tournaments")
    .update({ archived_at: null })
    .eq("id", tournament.id);
  if (error) throw error;
  revalidatePath("/dashboard");
  revalidatePath(`/t/${tournament.slug}`);
}

/** Permanently delete every completed tournament owned by the current user. */
export async function deleteCompletedTournaments() {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("tournaments")
    .delete()
    .eq("organizer_id", user.id)
    .eq("status", "complete");
  if (error) throw error;
  revalidatePath("/dashboard");
}

/**
 * Clone a tournament's setup (format, scoring, config, player names) into a new
 * event. Does NOT copy results, power rankings, AI previews, slug, or status.
 */
export async function duplicateTournament(tournamentId: string) {
  const { supabase, tournament } = await loadOwned(tournamentId);

  const { data: srcPlayers } = await supabase
    .from("players")
    .select("*")
    .eq("tournament_id", tournament.id)
    .order("position");
  const players = (srcPlayers ?? []) as PlayerRow[];

  // Manual seed/group config references player ids, which change on copy.
  const srcConfig = tournament.config ?? {};
  const { manualSeedOrder, manualGroups, ...baseConfig } = srcConfig;

  const copyName = `${tournament.name} (copy)`;
  const drawSeed = newSeed();

  let created: TournamentRow | null = null;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    const { data, error } = await supabase
      .from("tournaments")
      .insert({
        organizer_id: tournament.organizer_id,
        name: copyName,
        game_name: tournament.game_name,
        event_date: tournament.event_date,
        slug: slugify(copyName),
        format: tournament.format,
        scoring_mode: tournament.scoring_mode,
        seeding_method: tournament.seeding_method,
        tiebreak: tournament.tiebreak,
        ai_tone: tournament.ai_tone,
        draw_seed: drawSeed,
        status: "setup",
        config: baseConfig as TournamentConfigJson,
      })
      .select()
      .single();
    if (!error) {
      created = data as TournamentRow;
      break;
    }
    if (error.code !== "23505") throw error;
  }
  if (!created) throw new Error("Could not duplicate tournament");

  // Re-create players (new ids) preserving entry order; reset withdrawals.
  const playerRows = players.map((p) => ({
    tournament_id: created!.id,
    name: p.name,
    seed: p.seed,
    position: p.position,
    withdrawn: false,
  }));
  const positionToNewId = new Map<number, string>();
  if (playerRows.length) {
    const { data: inserted, error: pErr } = await supabase
      .from("players")
      .insert(playerRows)
      .select();
    if (pErr) throw pErr;
    for (const row of (inserted ?? []) as PlayerRow[]) {
      positionToNewId.set(row.position, row.id);
    }
  }

  // Remap manual seed order / manual groups from old ids to new ids by position.
  const oldIdToPosition = new Map(players.map((p) => [p.id, p.position]));
  const remap = (oldId: string): string | undefined => {
    const pos = oldIdToPosition.get(oldId);
    return pos == null ? undefined : positionToNewId.get(pos);
  };
  const nextConfig: TournamentConfigJson = { ...baseConfig };
  let touched = false;
  if (manualSeedOrder?.length) {
    nextConfig.manualSeedOrder = manualSeedOrder
      .map(remap)
      .filter((id): id is string => Boolean(id));
    touched = true;
  }
  if (manualGroups?.length) {
    nextConfig.manualGroups = manualGroups.map((g) => ({
      groupKey: g.groupKey,
      participantIds: g.participantIds
        .map(remap)
        .filter((id): id is string => Boolean(id)),
    }));
    touched = true;
  }
  if (touched) {
    await supabase
      .from("tournaments")
      .update({ config: nextConfig })
      .eq("id", created.id);
  }

  revalidatePath("/dashboard");
  redirect(`/t/${created.slug}/manage`);
}

// ---------------------------------------------------------------------------
// Player self-service scoring (Feature 15)
// ---------------------------------------------------------------------------

export interface SubmitPendingInput {
  tournamentId: string;
  matchKey: string;
  winnerId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  isDraw: boolean;
  submittedBy?: string | null;
}

/**
 * A public viewer proposes a result. No auth required — RLS only permits the
 * insert when the tournament has self-service scoring enabled and isn't
 * complete. A partial unique index enforces one pending submission per match.
 */
export async function submitPendingResult(input: SubmitPendingInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("pending_results").insert({
    tournament_id: input.tournamentId,
    match_key: input.matchKey,
    submitted_by: input.submittedBy?.trim() || null,
    winner_player_id: input.isDraw ? null : input.winnerId,
    score_a: input.scoreA,
    score_b: input.scoreB,
    is_draw: input.isDraw,
    status: "pending",
  });
  if (error) {
    if (error.code === "23505") {
      throw new Error("A submission for this match is already awaiting approval.");
    }
    throw error;
  }
  // Fetch the slug for revalidation (public read is allowed).
  const { data: t } = await supabase
    .from("tournaments")
    .select("slug")
    .eq("id", input.tournamentId)
    .single();
  if (t) revalidatePath(`/t/${(t as { slug: string }).slug}`);
}

/** Organizer approves a pending submission: it becomes the real result. */
export async function approvePendingResult(pendingId: string) {
  const { supabase, user } = await requireUser();
  const { data: pend } = await supabase
    .from("pending_results")
    .select("*")
    .eq("id", pendingId)
    .single();
  if (!pend) throw new Error("Submission not found");
  const p = pend as {
    tournament_id: string;
    match_key: string;
    winner_player_id: string | null;
    score_a: number | null;
    score_b: number | null;
    is_draw: boolean;
  };

  const { data: t } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", p.tournament_id)
    .single();
  if (!t) throw new Error("Tournament not found");
  const tournament = t as TournamentRow;
  if (tournament.organizer_id !== user.id) throw new Error("Not authorized");

  const { error: upErr } = await supabase.from("match_results").upsert(
    {
      tournament_id: tournament.id,
      match_key: p.match_key,
      winner_player_id: p.is_draw ? null : p.winner_player_id,
      score_a: p.score_a,
      score_b: p.score_b,
      is_draw: p.is_draw,
      forfeit: false,
    },
    { onConflict: "tournament_id,match_key" },
  );
  if (upErr) throw upErr;

  // Clear the queue for this match (approved item + any stragglers).
  await supabase
    .from("pending_results")
    .delete()
    .eq("tournament_id", tournament.id)
    .eq("match_key", p.match_key);

  await recomputeAndPersist(supabase, tournament);
  revalidatePath(`/t/${tournament.slug}/manage`);
  revalidatePath(`/t/${tournament.slug}`);
}

/** Organizer rejects (discards) a pending submission. */
export async function rejectPendingResult(pendingId: string, reason?: string) {
  const { supabase } = await requireUser();
  const { data: pend } = await supabase
    .from("pending_results")
    .select("tournament_id")
    .eq("id", pendingId)
    .single();
  const { error } = await supabase
    .from("pending_results")
    .delete()
    .eq("id", pendingId);
  if (error) throw error;
  void reason;
  if (pend) {
    const { data: t } = await supabase
      .from("tournaments")
      .select("slug")
      .eq("id", (pend as { tournament_id: string }).tournament_id)
      .single();
    if (t) {
      const slug = (t as { slug: string }).slug;
      revalidatePath(`/t/${slug}/manage`);
      revalidatePath(`/t/${slug}`);
    }
  }
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
