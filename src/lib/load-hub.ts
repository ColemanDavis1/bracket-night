import { createClient } from "@/lib/supabase/server";
import {
  computeTournamentState,
  type MatchResultRow,
  type PlayerRow,
  type RegistrantRow,
  type StationAssignmentRow,
  type TeamRow,
  type TournamentRow,
} from "@/lib/db";
import { normalizeSignupMode } from "@/lib/teams/signup-mode";
import { isAdminRole, normalizeEmail, type AdminRole } from "@/lib/access/roles";
import { normalizeSignupForm } from "@/lib/signup/form-schema";
import { inferSignupStyle, normalizeSignupStyle } from "@/lib/signup/style";
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
  const teamMode = tournament.config?.entryMode === "team";
  const [
    { data: players },
    { data: results },
    { data: auth },
    { data: pending },
    { data: teams },
    { data: registrants },
    { data: stations },
    { data: adminRows },
  ] = await Promise.all([
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
    teamMode
      ? supabase
          .from("teams")
          .select("*")
          .eq("tournament_id", tournament.id)
          .order("position")
      : Promise.resolve({ data: [] as TeamRow[] }),
    // Always: responses outlive the setting that collected them, and an event
    // switched back to manual must still be able to export what it gathered.
    supabase
      .from("registrants")
      .select("*")
      .eq("tournament_id", tournament.id)
      .order("created_at"),
    supabase
      .from("station_assignments")
      .select("*")
      .eq("tournament_id", tournament.id),
    // RLS returns only the caller's own row (or every row, to the owner).
    supabase
      .from("tournament_admins")
      .select("id, user_id, email, role, accepted_at")
      .eq("tournament_id", tournament.id),
  ]);

  const playerRows = (players ?? []) as PlayerRow[];
  const { state } = computeTournamentState(
    tournament,
    playerRows,
    (results ?? []) as MatchResultRow[],
  );

  // Access is the owner plus anyone they invited, matched by account or by the
  // email the invite was sent to.
  const isOwner = auth.user?.id === tournament.organizer_id;
  const email = auth.user?.email ? normalizeEmail(auth.user.email) : null;
  const adminList = (adminRows ?? []) as {
    id: string;
    user_id: string | null;
    email: string;
    role: string;
    accepted_at: string | null;
  }[];
  const invited = adminList.find(
    (a) =>
      (auth.user?.id && a.user_id === auth.user.id) ||
      (email && normalizeEmail(a.email) === email),
  );
  const viewerRole: AdminRole | null = isOwner
    ? "owner"
    : invited && isAdminRole(invited.role) && invited.role !== "owner"
      ? invited.role
      : null;
  const isOrganizer = viewerRole !== null;

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
      seedingMethod: tournament.seeding_method,
      seedingRounds: tournament.config?.seedingRounds ?? null,
      roundRobinDouble: tournament.config?.roundRobinDouble ?? false,
      numGroups: tournament.config?.numGroups ?? null,
      advancePerGroup: tournament.config?.advancePerGroup ?? null,
      groupDoubleRoundRobin: tournament.config?.groupDoubleRoundRobin ?? false,
      knockoutFormat: tournament.config?.knockoutFormat ?? null,
      stages: tournament.config?.stages ?? null,
      numStations: Math.min(8, Math.max(1, tournament.config?.numStations ?? 1)),
      seriesLength: tournament.config?.seriesLength ?? 1,
      selfServiceScoring: tournament.config?.selfServiceScoring ?? false,
      entryMode: tournament.config?.entryMode ?? "individual",
      teamSize: tournament.config?.teamSize ?? null,
      signupEnabled: tournament.config?.signupEnabled ?? false,
      signupMode: normalizeSignupMode(tournament.config?.signupMode),
      // Events created before styles existed are read from their primitives.
      signupStyle: tournament.config?.signupStyle
        ? normalizeSignupStyle(tournament.config.signupStyle)
        : inferSignupStyle(tournament.config ?? {}),
      signupForm: normalizeSignupForm(tournament.config?.signupForm),
      googleFormUrl: tournament.config?.googleFormUrl ?? null,
      stationLabels: tournament.config?.stationLabels ?? [],
    },
    players: playerRows.map((p) => ({
      id: p.id,
      name: p.name,
      withdrawn: p.withdrawn,
    })),
    state,
    prevRanking: tournament.prev_power_ranking ?? [],
    isOrganizer,
    viewerRole,
    // RLS returns every row to the owner and only their own to an invitee, so
    // this is the full list exactly when the viewer is allowed to manage it.
    admins: isOwner
      ? adminList
          .filter((a) => isAdminRole(a.role) && a.role !== "owner")
          .map((a) => ({
            id: a.id,
            email: a.email,
            role: a.role as AdminRole,
            acceptedAt: a.accepted_at,
          }))
      : [],
    ownerEmail: isOwner ? (auth.user?.email ?? null) : null,
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
    teams: ((teams ?? []) as TeamRow[]).map((t) => ({
      id: t.id,
      playerId: t.player_id,
      name: t.name,
      targetSize: t.target_size,
      minSize: t.min_size,
      maxSize: t.max_size,
      locked: t.locked,
      checkedIn: t.checked_in,
      position: t.position,
    })),
    registrants: ((registrants ?? []) as RegistrantRow[]).map((r) => ({
      id: r.id,
      teamId: r.team_id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      signupType: r.signup_type,
      isCaptain: r.is_captain,
      proposedTeam: r.proposed_team,
      status: r.status,
      source: r.source,
      checkedIn: r.checked_in,
      answers: r.answers ?? {},
      playerId: r.player_id ?? null,
    })),
    stations: ((stations ?? []) as StationAssignmentRow[]).map((s) => ({
      matchKey: s.match_key,
      station: s.station,
      state: s.state,
      calledAt: s.called_at,
    })),
  };

  return {
    data,
    organizerId: tournament.organizer_id,
    archived: tournament.archived_at != null,
  };
}
