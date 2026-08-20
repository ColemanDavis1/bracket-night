"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import {
  computeTournamentState,
  type MatchResultRow,
  type PlayerRow,
  type RegistrantRow,
  type StationAssignmentRow,
  type TeamRow,
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
import { canAddEntrant, TEAMS_LOCKED_MESSAGE } from "@/lib/teams/gate";
import { autoFillTeams as computeAutoFill } from "@/lib/teams/autofill";
import {
  capacityError,
  normalizeTeamSize,
  resolveTeamSize,
} from "@/lib/teams/sizes";
import {
  allowsSignupType,
  normalizeSignupMode,
  signupTypeBlockedMessage,
  type SignupMode,
} from "@/lib/teams/signup-mode";
import {
  contactError,
  describeAnswerErrors,
  formClosed,
  FORM_CLOSED_MESSAGE,
  normalizeSignupForm,
  questionsFor,
  rosterSizeError,
  sanitizeAnswers,
  validateAnswers,
  type AnswerMap,
  type SignupFormConfig,
} from "@/lib/signup/form-schema";
import {
  normalizeSignupStyle,
  presetForStyle,
  type SignupStyle,
} from "@/lib/signup/style";
import {
  rebuildBlockedMessage,
  sanitizeSettingsPatch,
  structuralChanges,
  type SettingsPatch,
  type SettingsSnapshot,
} from "@/lib/tournament-settings";
import {
  resetBracketMessage,
  unfinalizeBlockedMessage,
} from "@/lib/bracket-reset";
import {
  autoAssignStations as computeAutoAssign,
  type StationAssignmentLike,
  type StationMatch,
} from "@/lib/stations/assign";
import type { ParsedRegistrant } from "@/lib/import-registrants";
import {
  can,
  deniedMessage,
  isAdminRole,
  normalizeEmail,
  type AdminRole,
  type Capability,
} from "@/lib/access/roles";
import { resolveRole } from "@/lib/access/lookup";

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
  /** Team mode: optional initial (empty) team names to seed. */
  initialTeams?: string[];
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
  // Team mode: teams are the bracket entrants and are finalized in later, so an
  // event can start with zero players. Individual mode keeps the 2..128 rule.
  const isTeamMode = input.config?.entryMode === "team";
  // An open sign-up form fills the field later, so it may start empty too.
  const fillsLater = isTeamMode || input.config?.signupEnabled === true;
  if (!fillsLater && input.players.length < MIN_PLAYERS) {
    throw new Error(
      `Tournaments need between ${MIN_PLAYERS} and ${MAX_PLAYERS} players`,
    );
  }
  if (input.players.length > MAX_PLAYERS) {
    throw new Error(`Maximum ${MAX_PLAYERS} players`);
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

  // Insert players in entry order (individual mode; team mode may have none).
  const playerRows = input.players.map((p, i) => ({
    tournament_id: tournament!.id,
    name: p.name.trim() || `Player ${i + 1}`,
    seed: p.seed ?? null,
    position: i,
  }));
  let inserted: PlayerRow[] | null = null;
  if (playerRows.length) {
    const { data, error: pErr } = await supabase
      .from("players")
      .insert(playerRows)
      .select();
    if (pErr) throw pErr;
    inserted = data as PlayerRow[];
  }

  // Team mode: seed any initial (empty) teams the organizer named.
  if (isTeamMode && input.initialTeams?.length) {
    const teamRows = input.initialTeams
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name, i) => ({ tournament_id: tournament!.id, name, position: i }));
    if (teamRows.length) {
      await supabase.from("teams").insert(teamRows);
    }
  }

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
/**
 * The caller's role on an event. Delegates to the server-side lookup, which
 * does not depend on the access token carrying an email claim — see
 * src/lib/access/lookup.ts for why that mattered.
 */
async function roleOn(
  _supabase: SupabaseClient,
  tournament: TournamentRow,
  user: { id: string; email?: string | null },
): Promise<AdminRole | null> {
  return resolveRole(tournament.id, tournament.organizer_id, {
    id: user.id,
    email: user.email,
  });
}

/**
 * Load a tournament for a write and assert the caller holds `capability`.
 * Defaults to edit_settings, the owner/co-organizer level — narrower roles must
 * be named explicitly by the actions they are allowed to perform.
 */
async function loadOwned(
  tournamentId: string,
  capability: Capability = "edit_settings",
) {
  const { supabase, user } = await requireUser();
  const { data: t } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .single();
  if (!t) throw new Error("Tournament not found");
  const tournament = t as TournamentRow;
  const role = await roleOn(supabase, tournament, user);
  if (!can(role, capability)) throw new Error(deniedMessage(role, capability));
  return { supabase, tournament, role };
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
  const { supabase, tournament } = await loadOwned(input.tournamentId, "enter_scores");

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

  // Entering a score frees the court the match was on, and the next match in
  // order takes it (call board).
  await freeStation(supabase, tournament.id, input.matchKey);
  await recomputeAndPersist(supabase, tournament);
  await fillFreedCourts(supabase, tournament);
  revalidatePath(`/t/${tournament.slug}/manage`);
  revalidatePath(`/t/${tournament.slug}`);
}

export async function deleteResult(tournamentId: string, matchKey: string) {
  const { supabase, tournament } = await loadOwned(tournamentId, "enter_scores");
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
  const { supabase, tournament } = await loadOwned(tournamentId, "manage_roster");
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
  const { supabase, tournament } = await loadOwned(tournamentId, "manage_roster");
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
  const { supabase, tournament } = await loadOwned(tournamentId, "delete_event");
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
  const { supabase, tournament } = await loadOwned(tournamentId, "delete_event");
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
  const { supabase, tournament } = await loadOwned(tournamentId, "delete_event");
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

export interface SignupInput {
  tournamentId: string;
  mode: "solo" | "team";
  teamName?: string;
  /** For a team: [captain, ...teammates]. For solo: a single person. */
  members: {
    name: string;
    email?: string;
    phone?: string;
    /** Answers to person-scope questions. */
    answers?: AnswerMap;
  }[];
  /** Answers to team-scope questions, given once by the captain. */
  answers?: AnswerMap;
}

/**
 * Public native sign-up. No auth required — RLS only permits the insert when the
 * tournament has sign-ups enabled and isn't complete, and only as pending/native
 * rows. Full teams arrive as registrants sharing a proposed team name (the first
 * is the captain); the organizer reconciles them into a team on approval.
 */
export async function submitSignup(input: SignupInput) {
  const supabase = await createClient();
  const clean = input.members
    .map((m) => ({
      name: m.name?.trim() ?? "",
      email: m.email?.trim() || null,
      phone: m.phone?.trim() || null,
      answers: m.answers ?? {},
    }))
    .filter((m) => m.name);
  if (!clean.length) throw new Error("Please enter at least one name");
  if (input.mode === "team" && !input.teamName?.trim()) {
    throw new Error("Team name is required");
  }

  const { data: config } = await supabase
    .from("tournaments")
    .select("config")
    .eq("id", input.tournamentId)
    .single();
  const cfg = (config as { config: TournamentConfigJson } | null)?.config;
  const form = normalizeSignupForm(cfg?.signupForm);

  // The window closes on its own; RLS enforces this too.
  if (formClosed(form)) throw new Error(FORM_CLOSED_MESSAGE);

  // Which paths this event accepts. RLS enforces the same rule; this is the
  // friendly error for someone whose form went stale mid-fill.
  const signupMode = normalizeSignupMode(cfg?.signupMode);
  if (!allowsSignupType(signupMode, input.mode)) {
    throw new Error(signupTypeBlockedMessage(signupMode));
  }

  const size = resolveTeamSize(
    { target_size: null, min_size: null, max_size: null },
    cfg?.teamSize,
  );

  if (input.mode === "team") {
    const teamName = input.teamName!.trim();

    // Roster rules for this one submission: the max always applies, the min
    // only when the organizer wants full teams up front.
    const rosterProblem = rosterSizeError(
      clean.length,
      size,
      form.requireMinRoster,
    );
    if (rosterProblem) throw new Error(rosterProblem);

    // Enforce the cap across submissions too: a team can also sign up in
    // several goes under the same name.
    const { count } = await supabase
      .from("registrants")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", input.tournamentId)
      .eq("proposed_team", teamName)
      .neq("status", "declined");
    const problem = capacityError(count ?? 0, clean.length, size, teamName);
    if (problem) throw new Error(problem);
  }

  // Built-in contact rules.
  for (const [i, m] of clean.entries()) {
    const problem = contactError(form, i, m);
    if (problem) throw new Error(problem);
  }

  // Custom questions: team-scope answered once, person-scope per member.
  const teamQuestions = questionsFor(form, "team");
  const personQuestions = questionsFor(form, "person");
  const teamAnswers = input.mode === "team" ? (input.answers ?? {}) : {};

  if (input.mode === "team") {
    const errors = validateAnswers(teamQuestions, teamAnswers);
    if (errors.length) {
      throw new Error(describeAnswerErrors(teamQuestions, errors));
    }
  }
  for (const m of clean) {
    const errors = validateAnswers(personQuestions, m.answers);
    if (errors.length) {
      throw new Error(describeAnswerErrors(personQuestions, errors));
    }
  }

  const cleanTeamAnswers = sanitizeAnswers(teamQuestions, teamAnswers);

  const rows = clean.map((m, i) => {
    const isCaptain = input.mode === "team" && i === 0;
    const personAnswers = sanitizeAnswers(personQuestions, m.answers);
    return {
      tournament_id: input.tournamentId,
      name: m.name,
      email: m.email,
      phone: m.phone,
      signup_type: input.mode,
      is_captain: isCaptain,
      proposed_team: input.mode === "team" ? input.teamName!.trim() : null,
      status: "pending" as const,
      source: "native" as const,
      // Team answers ride on the captain's row: one submission, one set.
      answers: isCaptain
        ? { ...cleanTeamAnswers, ...personAnswers }
        : personAnswers,
    };
  });

  const { error } = await supabase.from("registrants").insert(rows);
  if (error) {
    throw new Error(
      "Sign-ups aren't open for this event right now. Please check with the organizer.",
    );
  }

  const { data: t } = await supabase
    .from("tournaments")
    .select("slug")
    .eq("id", input.tournamentId)
    .single();
  if (t) revalidatePath(`/t/${(t as { slug: string }).slug}/manage`);
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
  const role = await roleOn(supabase, tournament, user);
  if (!can(role, "enter_scores")) {
    throw new Error(deniedMessage(role, "enter_scores"));
  }

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

// ===========================================================================
// Team Builder (large events): teams, registrants, check-in, no-show, stations
//
// A "people" layer on top of the engine. Teams compete as single bracket
// entrants (one players row = one team); registrants are individual people.
// None of this is read by the engine.
// ===========================================================================

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

interface TeamSizesInput {
  target?: number | null;
  min?: number | null;
  max?: number | null;
}

/** Load a team and assert the caller owns its tournament. */
async function loadOwnedTeam(
  teamId: string,
  capability: Capability = "manage_roster",
) {
  const { supabase, user } = await requireUser();
  const { data: team } = await supabase
    .from("teams")
    .select("*")
    .eq("id", teamId)
    .single();
  if (!team) throw new Error("Team not found");
  const t = team as TeamRow;
  const { data: tour } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", t.tournament_id)
    .single();
  if (!tour) throw new Error("Tournament not found");
  const tournament = tour as TournamentRow;
  const role = await roleOn(supabase, tournament, user);
  if (!can(role, capability)) throw new Error(deniedMessage(role, capability));
  return { supabase, tournament, team: t };
}

/** Load a registrant and assert the caller owns its tournament. */
async function loadOwnedRegistrant(
  registrantId: string,
  capability: Capability = "manage_roster",
) {
  const { supabase, user } = await requireUser();
  const { data: reg } = await supabase
    .from("registrants")
    .select("*")
    .eq("id", registrantId)
    .single();
  if (!reg) throw new Error("Registrant not found");
  const r = reg as RegistrantRow;
  const { data: tour } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", r.tournament_id)
    .single();
  if (!tour) throw new Error("Tournament not found");
  const tournament = tour as TournamentRow;
  const role = await roleOn(supabase, tournament, user);
  if (!can(role, capability)) throw new Error(deniedMessage(role, capability));
  return { supabase, tournament, registrant: r };
}

/** Recompute the live engine state for gate checks / no-show resolution. */
async function engineStateFor(supabase: SupabaseClient, tournament: TournamentRow) {
  const [{ data: players }, { data: results }] = await Promise.all([
    supabase.from("players").select("*").eq("tournament_id", tournament.id),
    supabase.from("match_results").select("*").eq("tournament_id", tournament.id),
  ]);
  return computeTournamentState(
    tournament,
    (players ?? []) as PlayerRow[],
    (results ?? []) as MatchResultRow[],
  ).state;
}

/** Mark a station free when its match is scored/forfeited. Best-effort. */
async function freeStation(
  supabase: SupabaseClient,
  tournamentId: string,
  matchKey: string,
) {
  await supabase
    .from("station_assignments")
    .update({ state: "done" })
    .eq("tournament_id", tournamentId)
    .eq("match_key", matchKey);
}

/**
 * Put the next waiting matches onto whatever courts are now empty, in schedule
 * order. Called after a score frees a court so the board keeps itself current
 * instead of waiting for someone to press auto-assign.
 *
 * Placed as "queued", not "playing": the court is reserved and shown on the
 * board, but nobody is claimed to be mid-match until it is called. Existing
 * placements are never moved — see lib/stations/assign.ts.
 */
async function fillFreedCourts(
  supabase: SupabaseClient,
  tournament: TournamentRow,
) {
  const numStations = Math.min(
    8,
    Math.max(1, tournament.config?.numStations ?? 1),
  );
  const [state, { data: assigns }] = await Promise.all([
    engineStateFor(supabase, tournament),
    supabase
      .from("station_assignments")
      .select("*")
      .eq("tournament_id", tournament.id),
  ]);
  const placements = computeAutoAssign(
    state.matches.map((m) => ({ key: m.key, order: m.order, status: m.status })),
    ((assigns ?? []) as StationAssignmentRow[]).map((a) => ({
      matchKey: a.match_key,
      station: a.station,
      state: a.state,
    })),
    numStations,
  );
  if (!placements.length) return;
  await supabase.from("station_assignments").upsert(
    placements.map((p) => ({
      tournament_id: tournament.id,
      match_key: p.matchKey,
      station: p.station,
      state: "queued",
      called_at: null,
    })),
    { onConflict: "tournament_id,match_key" },
  );
}

/**
 * Drop everything that keys off a match key. Call before any change that
 * regenerates the schedule (structural settings, a re-draw, an entrant leaving
 * the pool) so old scores can't re-attach to a different pairing.
 */
async function clearMatchKeyedData(
  supabase: SupabaseClient,
  tournamentId: string,
) {
  await Promise.all([
    supabase.from("match_results").delete().eq("tournament_id", tournamentId),
    supabase
      .from("station_assignments")
      .delete()
      .eq("tournament_id", tournamentId),
    supabase.from("pending_results").delete().eq("tournament_id", tournamentId),
  ]);
}

/** How many scores a re-draw would orphan. */
async function countResults(supabase: SupabaseClient, tournamentId: string) {
  const { count } = await supabase
    .from("match_results")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId);
  return count ?? 0;
}

function reval(tournament: TournamentRow) {
  revalidatePath(`/t/${tournament.slug}/manage`);
  revalidatePath(`/t/${tournament.slug}`);
}

/** Patch team-mode config: entry mode, sizes, sign-ups, form URL, court names. */
export async function setTeamMode(
  tournamentId: string,
  patch: {
    entryMode?: "individual" | "team";
    teamSize?: { target: number; min: number; max: number };
    signupEnabled?: boolean;
    signupMode?: SignupMode;
    googleFormUrl?: string;
    stationLabels?: string[];
  },
) {
  const structural =
    patch.entryMode !== undefined ||
    patch.teamSize !== undefined ||
    patch.stationLabels !== undefined;
  const { supabase, tournament } = await loadOwned(
    tournamentId,
    structural ? "edit_settings" : "manage_form",
  );
  const config: TournamentConfigJson = { ...(tournament.config ?? {}) };
  if (patch.entryMode !== undefined) config.entryMode = patch.entryMode;
  if (patch.teamSize !== undefined) {
    config.teamSize = normalizeTeamSize(patch.teamSize);
  }
  if (patch.signupEnabled !== undefined) config.signupEnabled = patch.signupEnabled;
  if (patch.signupMode !== undefined) {
    config.signupMode = normalizeSignupMode(patch.signupMode);
  }
  if (patch.googleFormUrl !== undefined) {
    config.googleFormUrl = patch.googleFormUrl.trim() || undefined;
  }
  if (patch.stationLabels !== undefined) {
    config.stationLabels = patch.stationLabels.map((s) => s.trim());
  }
  const { error } = await supabase
    .from("tournaments")
    .update({ config })
    .eq("id", tournament.id);
  if (error) throw error;
  reval(tournament);
}

/**
 * Pick the sign-up style. Each style is a preset over entryMode /
 * signupEnabled / signupMode, all of which stay individually editable after.
 * Existing rosters and the bracket are untouched.
 */
export async function setSignupStyle(
  tournamentId: string,
  style: SignupStyle,
) {
  const { supabase, tournament } = await loadOwned(tournamentId);
  const chosen = normalizeSignupStyle(style);
  const preset = presetForStyle(chosen);
  const config: TournamentConfigJson = {
    ...(tournament.config ?? {}),
    signupStyle: chosen,
    entryMode: preset.entryMode,
    signupEnabled: preset.signupEnabled,
    signupMode: preset.signupMode,
  };
  const { error } = await supabase
    .from("tournaments")
    .update({ config })
    .eq("id", tournament.id);
  if (error) throw error;
  reval(tournament);
}

/** Save the custom sign-up form. Normalized here so config can never hold junk. */
export async function updateSignupForm(
  tournamentId: string,
  form: SignupFormConfig,
) {
  const { supabase, tournament } = await loadOwned(tournamentId, "manage_form");
  const config: TournamentConfigJson = {
    ...(tournament.config ?? {}),
    signupForm: normalizeSignupForm(form),
  };
  const { error } = await supabase
    .from("tournaments")
    .update({ config })
    .eq("id", tournament.id);
  if (error) throw error;
  reval(tournament);
}

/** Flatten a tournament row + config into the shape settings diffing expects. */
function settingsSnapshot(t: TournamentRow): SettingsSnapshot {
  const c = t.config ?? {};
  return {
    name: t.name,
    gameName: t.game_name,
    eventDate: t.event_date,
    format: t.format,
    scoringMode: t.scoring_mode,
    seedingMethod: t.seeding_method,
    tiebreak: t.tiebreak,
    aiTone: t.ai_tone,
    seedingRounds: c.seedingRounds,
    roundRobinDouble: c.roundRobinDouble,
    numGroups: c.numGroups,
    advancePerGroup: c.advancePerGroup,
    groupDoubleRoundRobin: c.groupDoubleRoundRobin,
    knockoutFormat: c.knockoutFormat,
    numStations: c.numStations,
    seriesLength: c.seriesLength,
    selfServiceScoring: c.selfServiceScoring,
    notes: c.notes,
    stages: c.stages,
  };
}

/**
 * Change tournament settings after the event has started, so an organizer can
 * open sign-ups first and pick the format once the head count is known.
 *
 * Structural changes (format, seeding, groups, the draw) regenerate the
 * schedule. When scores already exist, the caller must pass `clearResults` to
 * confirm — otherwise the change is rejected rather than silently orphaning them.
 */
export async function updateTournamentSettings(
  tournamentId: string,
  patch: SettingsPatch & { clearResults?: boolean },
) {
  const { supabase, tournament } = await loadOwned(tournamentId);
  const clean = sanitizeSettingsPatch(patch);
  const structural = structuralChanges(settingsSnapshot(tournament), clean);

  let resultCount = 0;
  if (structural.length) {
    resultCount = await countResults(supabase, tournament.id);
    if (resultCount > 0 && !patch.clearResults) {
      throw new Error(rebuildBlockedMessage(structural, resultCount));
    }
  }

  const upd: Record<string, unknown> = {};
  if (clean.name !== undefined) {
    const name = clean.name.trim();
    if (!name) throw new Error("Tournament name is required");
    upd.name = name;
  }
  if (clean.gameName !== undefined) {
    upd.game_name = clean.gameName?.trim() || null;
  }
  if (clean.eventDate !== undefined) upd.event_date = clean.eventDate || null;
  if (clean.format !== undefined) upd.format = clean.format;
  if (clean.scoringMode !== undefined) upd.scoring_mode = clean.scoringMode;
  if (clean.seedingMethod !== undefined) {
    upd.seeding_method = clean.seedingMethod;
  }
  if (clean.tiebreak !== undefined) upd.tiebreak = clean.tiebreak;
  if (clean.aiTone !== undefined) upd.ai_tone = clean.aiTone;
  if (patch.reshuffleDraw) upd.draw_seed = newSeed();

  const config: TournamentConfigJson = { ...(tournament.config ?? {}) };
  if (clean.seedingRounds !== undefined) config.seedingRounds = clean.seedingRounds;
  if (clean.roundRobinDouble !== undefined) {
    config.roundRobinDouble = clean.roundRobinDouble;
  }
  if (clean.numGroups !== undefined) config.numGroups = clean.numGroups;
  if (clean.advancePerGroup !== undefined) {
    config.advancePerGroup = clean.advancePerGroup;
  }
  if (clean.groupDoubleRoundRobin !== undefined) {
    config.groupDoubleRoundRobin = clean.groupDoubleRoundRobin;
  }
  if (clean.knockoutFormat !== undefined) {
    config.knockoutFormat = clean.knockoutFormat;
  }
  if (clean.numStations !== undefined) config.numStations = clean.numStations;
  if (clean.seriesLength !== undefined) config.seriesLength = clean.seriesLength;
  if (clean.selfServiceScoring !== undefined) {
    config.selfServiceScoring = clean.selfServiceScoring;
  }
  if (clean.notes !== undefined) config.notes = clean.notes.trim() || undefined;
  if (clean.stages !== undefined) {
    config.stages = clean.stages.length ? clean.stages : undefined;
  }

  // Manual draws are expressed as player ids against the old shape — drop them
  // when the shape they were built for no longer applies.
  if (clean.numGroups !== undefined && clean.numGroups !== tournament.config?.numGroups) {
    delete config.manualGroups;
  }
  if (clean.seedingMethod !== undefined && clean.seedingMethod !== "manual") {
    delete config.manualSeedOrder;
  }
  upd.config = config;

  if (structural.length) {
    // Match keys are about to change; drop everything that keys off them.
    await clearMatchKeyedData(supabase, tournament.id);
  }

  const { error } = await supabase
    .from("tournaments")
    .update(upd)
    .eq("id", tournament.id);
  if (error) throw error;

  // Recompute against the NEW settings so rankings and status reflect them.
  await recomputeAndPersist(supabase, {
    ...tournament,
    ...(upd as Partial<TournamentRow>),
  } as TournamentRow);
  reval(tournament);
}

export async function createTeam(
  tournamentId: string,
  input: { name: string; sizes?: TeamSizesInput },
) {
  const { supabase, tournament } = await loadOwned(tournamentId, "manage_roster");
  const name = input.name?.trim();
  if (!name) throw new Error("Team name is required");
  const state = await engineStateFor(supabase, tournament);
  if (!canAddEntrant(state)) throw new Error(TEAMS_LOCKED_MESSAGE);

  const { data: existing } = await supabase
    .from("teams")
    .select("position")
    .eq("tournament_id", tournament.id);
  const nextPosition =
    ((existing ?? []) as { position: number }[]).reduce(
      (m, r) => Math.max(m, r.position),
      -1,
    ) + 1;

  const { error } = await supabase.from("teams").insert({
    tournament_id: tournament.id,
    name,
    position: nextPosition,
    target_size: input.sizes?.target ?? null,
    min_size: input.sizes?.min ?? null,
    max_size: input.sizes?.max ?? null,
  });
  if (error) throw error;
  reval(tournament);
}

export async function updateTeam(
  teamId: string,
  patch: { name?: string; sizes?: TeamSizesInput; locked?: boolean },
) {
  const { supabase, tournament, team } = await loadOwnedTeam(
    teamId,
    "manage_roster",
  );
  const upd: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) throw new Error("Team name is required");
    upd.name = n;
  }
  if (patch.locked !== undefined) upd.locked = patch.locked;
  if (patch.sizes) {
    if ("target" in patch.sizes) upd.target_size = patch.sizes.target ?? null;
    if ("min" in patch.sizes) upd.min_size = patch.sizes.min ?? null;
    if ("max" in patch.sizes) upd.max_size = patch.sizes.max ?? null;
  }
  if (Object.keys(upd).length) {
    await supabase.from("teams").update(upd).eq("id", teamId);
  }
  // Keep the bracket entrant's name in sync if this team is finalized.
  if (upd.name && team.player_id) {
    await supabase
      .from("players")
      .update({ name: upd.name })
      .eq("id", team.player_id);
    await recomputeAndPersist(supabase, tournament);
  }
  reval(tournament);
}

export async function deleteTeam(teamId: string) {
  const { supabase, tournament, team } = await loadOwnedTeam(teamId);
  if (team.player_id) {
    const state = await engineStateFor(supabase, tournament);
    if (!canAddEntrant(state)) {
      throw new Error(
        "Cannot remove a finalized team once the knockout round has started",
      );
    }
    // Remove the bracket entrant so it leaves the draw (triggers a re-derive).
    await supabase
      .from("players")
      .delete()
      .eq("id", team.player_id)
      .eq("tournament_id", tournament.id);
  }
  // Return any members to the solo pool, then delete the team.
  await supabase.from("registrants").update({ team_id: null }).eq("team_id", teamId);
  await supabase.from("teams").delete().eq("id", teamId);
  await recomputeAndPersist(supabase, tournament);
  reval(tournament);
}

/**
 * Reject an organizer-side roster add that would push a team past its max.
 * Sizes resolve per-team override → tournament config → built-in default.
 */
async function assertTeamHasRoom(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tournament: TournamentRow,
  teamId: string,
  adding: number,
) {
  const { data: team } = await supabase
    .from("teams")
    .select("*")
    .eq("id", teamId)
    .eq("tournament_id", tournament.id)
    .single();
  if (!team) throw new Error("Team not found");
  const t = team as TeamRow;
  if (t.locked) throw new Error("That team's roster is locked");
  const { count } = await supabase
    .from("registrants")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId);
  const size = resolveTeamSize(t, tournament.config?.teamSize);
  const problem = capacityError(count ?? 0, adding, size, t.name);
  if (problem) throw new Error(problem);
}

export async function addRegistrant(
  tournamentId: string,
  input: {
    name: string;
    email?: string;
    phone?: string;
    signupType: "solo" | "team";
    teamId?: string | null;
    source?: "native" | "google_csv" | "manual" | "walkin";
    isCaptain?: boolean;
  },
) {
  const { supabase, tournament } = await loadOwned(tournamentId, "manage_roster");
  const name = input.name?.trim();
  if (!name) throw new Error("Name is required");
  if (input.teamId) {
    await assertTeamHasRoom(supabase, tournament, input.teamId, 1);
  }
  const { error } = await supabase.from("registrants").insert({
    tournament_id: tournament.id,
    team_id: input.teamId ?? null,
    name,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    signup_type: input.signupType,
    is_captain: input.isCaptain ?? false,
    // Organizer-entered people are trusted (no approval queue round-trip).
    status: "approved",
    source: input.source ?? "manual",
  });
  if (error) throw error;
  reval(tournament);
}

export async function assignRegistrantToTeam(
  registrantId: string,
  teamId: string | null,
) {
  const { supabase, tournament } = await loadOwnedRegistrant(registrantId);
  if (teamId) {
    await assertTeamHasRoom(supabase, tournament, teamId, 1);
  }
  await supabase
    .from("registrants")
    .update({ team_id: teamId })
    .eq("id", registrantId);
  reval(tournament);
}

/**
 * Move several people at once — onto a team, or back to the solo pool with a
 * null teamId. Capacity is checked against only the ones actually arriving, so
 * re-confirming people already on the team can't trip the cap.
 */
export async function moveRegistrants(
  tournamentId: string,
  registrantIds: string[],
  teamId: string | null,
) {
  const { supabase, tournament } = await loadOwned(tournamentId, "manage_roster");
  if (!registrantIds.length) return;

  if (teamId) {
    const { data: rows } = await supabase
      .from("registrants")
      .select("id, team_id")
      .eq("tournament_id", tournament.id)
      .in("id", registrantIds);
    const arriving = ((rows ?? []) as { team_id: string | null }[]).filter(
      (r) => r.team_id !== teamId,
    ).length;
    if (arriving) {
      await assertTeamHasRoom(supabase, tournament, teamId, arriving);
    }
  }

  const { error } = await supabase
    .from("registrants")
    .update({ team_id: teamId })
    .eq("tournament_id", tournament.id)
    .in("id", registrantIds);
  if (error) throw error;
  reval(tournament);
}

/**
 * Remove people from the event outright — a duplicate sign-up, a no-show who
 * cancelled, someone entered by mistake. Works for the solo pool and for team
 * members. Scoped by tournament id so ids from another event can't be touched.
 *
 * This deletes the person, not the team. Teams are removed on their own card.
 */
export async function deleteRegistrants(
  tournamentId: string,
  registrantIds: string[],
) {
  const { supabase, tournament } = await loadOwned(tournamentId, "manage_roster");
  if (!registrantIds.length) return;
  // In individual style the person holds a bracket slot; remove it with them.
  const { data: linked } = await supabase
    .from("registrants")
    .select("player_id")
    .eq("tournament_id", tournament.id)
    .in("id", registrantIds)
    .not("player_id", "is", null);
  const playerIds = ((linked ?? []) as { player_id: string | null }[])
    .map((r) => r.player_id)
    .filter((id): id is string => Boolean(id));

  const { error } = await supabase
    .from("registrants")
    .delete()
    .eq("tournament_id", tournament.id)
    .in("id", registrantIds);
  if (error) throw error;

  if (playerIds.length) {
    await supabase
      .from("players")
      .delete()
      .eq("tournament_id", tournament.id)
      .in("id", playerIds);
    await recomputeAndPersist(supabase, tournament);
  }
  reval(tournament);
}

/** Balance the approved solo pool across teams toward their target sizes. */
export async function autoFillTeams(tournamentId: string) {
  const { supabase, tournament } = await loadOwned(tournamentId, "manage_roster");
  const [{ data: teams }, { data: regs }] = await Promise.all([
    supabase
      .from("teams")
      .select("*")
      .eq("tournament_id", tournament.id)
      .order("position"),
    supabase.from("registrants").select("*").eq("tournament_id", tournament.id),
  ]);
  const teamRows = (teams ?? []) as TeamRow[];
  const regRows = (regs ?? []) as RegistrantRow[];

  const counts = new Map<string, number>();
  for (const r of regRows) {
    if (r.team_id) counts.set(r.team_id, (counts.get(r.team_id) ?? 0) + 1);
  }
  const soloIds = regRows
    .filter((r) => !r.team_id && r.status === "approved")
    .map((r) => r.id);

  const cfg = tournament.config?.teamSize;
  const fillTeams = teamRows.map((t) => {
    const size = resolveTeamSize(t, cfg);
    return {
      id: t.id,
      currentCount: counts.get(t.id) ?? 0,
      target: size.target,
      max: size.max,
      locked: t.locked,
    };
  });

  const { assignments } = computeAutoFill(soloIds, fillTeams);
  const byTeam = new Map<string, string[]>();
  for (const a of assignments) {
    const list = byTeam.get(a.teamId) ?? [];
    list.push(a.registrantId);
    byTeam.set(a.teamId, list);
  }
  for (const [teamId, ids] of byTeam) {
    await supabase.from("registrants").update({ team_id: teamId }).in("id", ids);
  }
  reval(tournament);
}

/**
 * Individual sign-up style: the person *is* the entrant, so approving them
 * creates their players row. Team mode links the bracket entrant on the team
 * instead and leaves registrants.player_id null.
 */
async function createPlayerForRegistrant(
  supabase: SupabaseClient,
  tournament: TournamentRow,
  registrant: RegistrantRow,
): Promise<string | null> {
  if (registrant.player_id) return registrant.player_id;
  const name = registrant.name.trim();

  const { data: existing } = await supabase
    .from("players")
    .select("id, name, position")
    .eq("tournament_id", tournament.id);
  const rows = (existing ?? []) as { id: string; name: string; position: number }[];
  if (rows.length >= MAX_PLAYERS) throw new Error(`Maximum ${MAX_PLAYERS} players`);

  // Someone already entered by hand under this name keeps their slot.
  const match = rows.find(
    (p) => p.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (match) return match.id;

  const nextPosition = rows.reduce((m, p) => Math.max(m, p.position), -1) + 1;
  const { data: player, error } = await supabase
    .from("players")
    .insert({
      tournament_id: tournament.id,
      name,
      seed: null,
      position: nextPosition,
      withdrawn: false,
    })
    .select()
    .single();
  if (error) throw error;
  return (player as PlayerRow).id;
}

export async function approveRegistrant(registrantId: string) {
  const { supabase, tournament, registrant } = await loadOwnedRegistrant(registrantId);

  // Individual style: no teams involved, the person enters the bracket.
  if ((tournament.config?.entryMode ?? "individual") !== "team") {
    const playerId = await createPlayerForRegistrant(
      supabase,
      tournament,
      registrant,
    );
    await supabase
      .from("registrants")
      .update({ status: "approved", player_id: playerId })
      .eq("id", registrantId);
    await recomputeAndPersist(supabase, tournament);
    reval(tournament);
    return;
  }

  let teamId = registrant.team_id;
  // A full-team sign-up carries a proposed team name; materialize/attach a team.
  if (!teamId && registrant.signup_type === "team" && registrant.proposed_team) {
    const { data: existing } = await supabase
      .from("teams")
      .select("*")
      .eq("tournament_id", tournament.id)
      .eq("name", registrant.proposed_team)
      .limit(1);
    if (existing && existing.length) {
      teamId = (existing[0] as TeamRow).id;
    } else {
      const { data: pos } = await supabase
        .from("teams")
        .select("position")
        .eq("tournament_id", tournament.id);
      const nextPosition =
        ((pos ?? []) as { position: number }[]).reduce(
          (m, r) => Math.max(m, r.position),
          -1,
        ) + 1;
      const { data: created } = await supabase
        .from("teams")
        .insert({
          tournament_id: tournament.id,
          name: registrant.proposed_team,
          position: nextPosition,
        })
        .select()
        .single();
      teamId = created ? (created as TeamRow).id : null;
    }
  }
  await supabase
    .from("registrants")
    .update({ status: "approved", team_id: teamId })
    .eq("id", registrantId);
  reval(tournament);
}

export async function declineRegistrant(registrantId: string) {
  const { supabase, tournament } = await loadOwnedRegistrant(registrantId);
  await supabase
    .from("registrants")
    .update({ status: "declined" })
    .eq("id", registrantId);
  reval(tournament);
}

/** Bulk insert people parsed from a Google Form CSV, held for approval. */
export async function importRegistrantsCsv(
  tournamentId: string,
  rows: ParsedRegistrant[],
) {
  const { supabase, tournament } = await loadOwned(tournamentId, "manage_signups");
  if (!rows.length) return;
  const insertRows = rows
    .filter((r) => r.name?.trim())
    .map((r) => ({
      tournament_id: tournament.id,
      name: r.name.trim(),
      email: r.email?.trim() || null,
      phone: r.phone?.trim() || null,
      signup_type: r.signupType,
      is_captain: r.isCaptain ?? false,
      proposed_team: r.signupType === "team" ? (r.teamName ?? null) : null,
      status: "pending",
      source: "google_csv",
    }));
  const { error } = await supabase.from("registrants").insert(insertRows);
  if (error) throw error;
  reval(tournament);
}

// ------------------------------ Check-in -----------------------------------

export async function setTeamCheckedIn(teamId: string, checkedIn: boolean) {
  const { supabase, tournament } = await loadOwnedTeam(teamId);
  await supabase
    .from("teams")
    .update({
      checked_in: checkedIn,
      checked_in_at: checkedIn ? new Date().toISOString() : null,
    })
    .eq("id", teamId);
  reval(tournament);
}

export async function setRegistrantCheckedIn(
  registrantId: string,
  checkedIn: boolean,
) {
  const { supabase, tournament } = await loadOwnedRegistrant(registrantId);
  await supabase
    .from("registrants")
    .update({
      checked_in: checkedIn,
      checked_in_at: checkedIn ? new Date().toISOString() : null,
    })
    .eq("id", registrantId);
  reval(tournament);
}

export async function checkInWholeTeam(teamId: string) {
  const { supabase, tournament } = await loadOwnedTeam(teamId);
  const now = new Date().toISOString();
  await supabase
    .from("teams")
    .update({ checked_in: true, checked_in_at: now })
    .eq("id", teamId);
  await supabase
    .from("registrants")
    .update({ checked_in: true, checked_in_at: now })
    .eq("team_id", teamId);
  reval(tournament);
}

/**
 * Finalize a team into a bracket entrant: create/link a players row (reusing
 * addPlayer's cap/uniqueness/position logic), then recompute. Only finalized
 * teams enter the bracket. Blocked once the knockout round has started.
 */
export async function finalizeTeam(teamId: string) {
  const { supabase, tournament, team } = await loadOwnedTeam(teamId);
  if (team.player_id) return; // already finalized
  const state = await engineStateFor(supabase, tournament);
  if (!canAddEntrant(state)) throw new Error(TEAMS_LOCKED_MESSAGE);

  const name = team.name.trim();
  const { data: existing } = await supabase
    .from("players")
    .select("name, position")
    .eq("tournament_id", tournament.id);
  const rows = (existing ?? []) as { name: string; position: number }[];
  if (rows.length >= MAX_PLAYERS) throw new Error(`Maximum ${MAX_PLAYERS} teams`);
  if (rows.some((p) => p.name.trim().toLowerCase() === name.toLowerCase())) {
    throw new Error("A team with that name is already in the bracket");
  }
  const nextPosition = rows.reduce((m, p) => Math.max(m, p.position), -1) + 1;

  const { data: player, error } = await supabase
    .from("players")
    .insert({
      tournament_id: tournament.id,
      name,
      seed: null,
      position: nextPosition,
      withdrawn: false,
    })
    .select()
    .single();
  if (error) throw error;

  await supabase
    .from("teams")
    .update({ player_id: (player as PlayerRow).id })
    .eq("id", teamId);
  await recomputeAndPersist(supabase, tournament);
  reval(tournament);
}

/**
 * Undo `finalizeTeam`: pull a team back out of the draw while keeping its
 * roster, check-ins, and sign-up history. The entrant pool shrinks, so the
 * schedule regenerates — any score already recorded would land on a different
 * pairing, so the caller confirms and we clear them.
 */
export async function unfinalizeTeam(
  teamId: string,
  opts?: { clearResults?: boolean },
) {
  const { supabase, tournament, team } = await loadOwnedTeam(teamId);
  if (!team.player_id) return; // not in the bracket

  const resultCount = await countResults(supabase, tournament.id);
  if (resultCount > 0 && !opts?.clearResults) {
    throw new Error(unfinalizeBlockedMessage(team.name, resultCount));
  }
  if (resultCount > 0) {
    await clearMatchKeyedData(supabase, tournament.id);
  }

  await supabase.from("teams").update({ player_id: null }).eq("id", teamId);
  await supabase
    .from("players")
    .delete()
    .eq("id", team.player_id)
    .eq("tournament_id", tournament.id);

  await recomputeAndPersist(supabase, tournament);
  reval(tournament);
}

/**
 * Undo the whole draw. Every finalized team leaves the bracket, scores and
 * court assignments are cleared, the draw seed is re-rolled, and the event
 * returns to "setup" so the organizer can change format and re-lock later.
 *
 * The people layer (teams, rosters, registrants, check-ins) is untouched — this
 * undoes the bracket, not the sign-ups. In individual mode there are no team
 * entrants to release, so it clears results and re-draws.
 */
export async function resetBracket(
  tournamentId: string,
  opts?: { clearResults?: boolean },
) {
  const { supabase, tournament } = await loadOwned(tournamentId);

  const [resultCount, { data: teams }] = await Promise.all([
    countResults(supabase, tournament.id),
    supabase
      .from("teams")
      .select("*")
      .eq("tournament_id", tournament.id)
      .not("player_id", "is", null),
  ]);
  const finalized = (teams ?? []) as TeamRow[];
  if (resultCount > 0 && !opts?.clearResults) {
    throw new Error(
      resetBracketMessage({
        finalizedTeams: finalized.length,
        results: resultCount,
      }),
    );
  }

  await clearMatchKeyedData(supabase, tournament.id);

  if (finalized.length) {
    const playerIds = finalized
      .map((t) => t.player_id)
      .filter((id): id is string => Boolean(id));
    await supabase
      .from("teams")
      .update({ player_id: null })
      .in(
        "id",
        finalized.map((t) => t.id),
      );
    await supabase
      .from("players")
      .delete()
      .eq("tournament_id", tournament.id)
      .in("id", playerIds);
  }

  const { error } = await supabase
    .from("tournaments")
    .update({
      draw_seed: newSeed(),
      status: "setup",
      power_ranking: [],
      prev_power_ranking: [],
    })
    .eq("id", tournament.id);
  if (error) throw error;

  reval(tournament);
}

// --------------------------- No-show / forfeit ------------------------------

/**
 * Record a results-based forfeit: the present opponent is set as the winner so
 * the engine advances them normally. No engine change required. If both sides
 * are no-shows the match is voided (no winner) rather than crowning one.
 */
export async function recordNoShow(
  tournamentId: string,
  input: { matchKey: string; noShowSide: "a" | "b" | "both" },
) {
  const { supabase, tournament } = await loadOwned(tournamentId, "enter_scores");
  const state = await engineStateFor(supabase, tournament);
  const match = state.matches.find((m) => m.key === input.matchKey);
  if (!match) throw new Error("Match not found");

  let winnerId: string | null;
  let isDraw = false;
  if (input.noShowSide === "both") {
    winnerId = null;
    isDraw = true;
  } else {
    winnerId = input.noShowSide === "a" ? match.bId : match.aId;
    if (!winnerId) throw new Error("The present side is not determined yet");
  }

  const { error } = await supabase.from("match_results").upsert(
    {
      tournament_id: tournament.id,
      match_key: input.matchKey,
      winner_player_id: winnerId,
      score_a: null,
      score_b: null,
      is_draw: isDraw,
      forfeit: true,
      series_games: null,
    },
    { onConflict: "tournament_id,match_key" },
  );
  if (error) throw error;
  await freeStation(supabase, tournament.id, input.matchKey);
  await recomputeAndPersist(supabase, tournament);
  await fillFreedCourts(supabase, tournament);
  reval(tournament);
}

/** Round-1 cleanup: forfeit every ready match whose team hasn't checked in. */
export async function markUncheckedAsNoShow(tournamentId: string) {
  const { supabase, tournament } = await loadOwned(tournamentId, "enter_scores");
  const [{ data: teams }, state] = await Promise.all([
    supabase.from("teams").select("*").eq("tournament_id", tournament.id),
    engineStateFor(supabase, tournament),
  ]);
  const checkedInByPlayer = new Map<string, boolean>();
  for (const t of (teams ?? []) as TeamRow[]) {
    if (t.player_id) checkedInByPlayer.set(t.player_id, t.checked_in);
  }
  // Unknown players (individual mode) are treated as present.
  const present = (id: string | null) =>
    id ? (checkedInByPlayer.get(id) ?? true) : true;

  const upserts = state.matches
    .filter((m) => m.status === "ready")
    .filter((m) => !present(m.aId) || !present(m.bId))
    .map((m) => {
      const aIn = present(m.aId);
      const bIn = present(m.bId);
      const bothOut = !aIn && !bIn;
      return {
        tournament_id: tournament.id,
        match_key: m.key,
        winner_player_id: bothOut ? null : aIn ? m.aId : m.bId,
        score_a: null,
        score_b: null,
        is_draw: bothOut,
        forfeit: true,
        series_games: null,
      };
    });

  if (upserts.length) {
    const { error } = await supabase
      .from("match_results")
      .upsert(upserts, { onConflict: "tournament_id,match_key" });
    if (error) throw error;
    await recomputeAndPersist(supabase, tournament);
  }
  reval(tournament);
}

// ------------------------------- Stations ----------------------------------

export async function assignMatchToStation(
  tournamentId: string,
  input: { matchKey: string; station: number | null },
) {
  const { supabase, tournament } = await loadOwned(tournamentId, "manage_courts");
  await supabase.from("station_assignments").upsert(
    {
      tournament_id: tournament.id,
      match_key: input.matchKey,
      station: input.station,
      state: "queued",
      called_at: null,
    },
    { onConflict: "tournament_id,match_key" },
  );
  reval(tournament);
}

export async function setMatchState(
  tournamentId: string,
  input: { matchKey: string; state: "queued" | "playing" | "done" },
) {
  const { supabase, tournament } = await loadOwned(tournamentId, "manage_courts");
  await supabase.from("station_assignments").upsert(
    {
      tournament_id: tournament.id,
      match_key: input.matchKey,
      state: input.state,
      called_at: input.state === "playing" ? new Date().toISOString() : null,
    },
    { onConflict: "tournament_id,match_key" },
  );
  reval(tournament);
}

/** Assign a match to a court and mark it playing (call to court). */
export async function callMatchToStation(
  tournamentId: string,
  input: { matchKey: string; station: number },
) {
  const { supabase, tournament } = await loadOwned(tournamentId, "manage_courts");
  await supabase.from("station_assignments").upsert(
    {
      tournament_id: tournament.id,
      match_key: input.matchKey,
      station: input.station,
      state: "playing",
      called_at: new Date().toISOString(),
    },
    { onConflict: "tournament_id,match_key" },
  );
  reval(tournament);
}

/** Fill every open court from the ready-match queue. */
export async function autoAssignStations(tournamentId: string) {
  const { supabase, tournament } = await loadOwned(tournamentId, "manage_courts");
  const numStations = Math.min(
    8,
    Math.max(1, tournament.config?.numStations ?? 1),
  );
  const [state, { data: assigns }] = await Promise.all([
    engineStateFor(supabase, tournament),
    supabase
      .from("station_assignments")
      .select("*")
      .eq("tournament_id", tournament.id),
  ]);
  const matches: StationMatch[] = state.matches.map((m) => ({
    key: m.key,
    order: m.order,
    status: m.status,
  }));
  const existing: StationAssignmentLike[] = (
    (assigns ?? []) as StationAssignmentRow[]
  ).map((a) => ({ matchKey: a.match_key, station: a.station, state: a.state }));

  const placements = computeAutoAssign(matches, existing, numStations);
  if (placements.length) {
    // Reserve the court; "Call to court" is what marks a match live. Same
    // behavior as the automatic fill after a score.
    await supabase.from("station_assignments").upsert(
      placements.map((p) => ({
        tournament_id: tournament.id,
        match_key: p.matchKey,
        station: p.station,
        state: "queued",
        called_at: null,
      })),
      { onConflict: "tournament_id,match_key" },
    );
  }
  reval(tournament);
}

// ===========================================================================
// Shared access (co-organizers)
// ===========================================================================

/**
 * Invite someone to help run this event. Keyed by email because they may not
 * have an account yet; the invite activates the moment they sign in with that
 * address and open the event. Owner only, enforced here and by RLS.
 */
export async function inviteAdmin(
  tournamentId: string,
  input: { email: string; role: AdminRole },
) {
  const { supabase, tournament } = await loadOwned(tournamentId, "manage_admins");
  const email = normalizeEmail(input.email);
  if (!email) throw new Error("Enter an email address.");
  if (!isAdminRole(input.role) || input.role === "owner") {
    throw new Error("Pick a role for this person.");
  }

  const { error } = await supabase.from("tournament_admins").insert({
    tournament_id: tournament.id,
    email,
    role: input.role,
    invited_by: tournament.organizer_id,
  });
  if (error) {
    if (error.code === "23505") throw new Error("That person already has access.");
    throw error;
  }
  reval(tournament);
}

/** Change what an existing admin can do. Owner only. */
export async function setAdminRole(
  tournamentId: string,
  adminId: string,
  role: AdminRole,
) {
  const { supabase, tournament } = await loadOwned(tournamentId, "manage_admins");
  if (!isAdminRole(role) || role === "owner") {
    throw new Error("Pick a role for this person.");
  }
  const { error } = await supabase
    .from("tournament_admins")
    .update({ role })
    .eq("id", adminId)
    .eq("tournament_id", tournament.id);
  if (error) throw error;
  reval(tournament);
}

/** Revoke access. Owner only. */
export async function removeAdmin(tournamentId: string, adminId: string) {
  const { supabase, tournament } = await loadOwned(tournamentId, "manage_admins");
  const { error } = await supabase
    .from("tournament_admins")
    .delete()
    .eq("id", adminId)
    .eq("tournament_id", tournament.id);
  if (error) throw error;
  reval(tournament);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
