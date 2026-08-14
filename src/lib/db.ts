import type {
  AiTone,
  MainFormat,
  MatchResult,
  Participant,
  PointsTiebreak,
  ScoringMode,
  SeedingMethod,
} from "@/lib/engine";
import { buildEngineState, type TournamentConfig } from "@/lib/engine";
import type { GroupAssignment, StageConfig } from "@/lib/engine";
import type { SignupMode } from "@/lib/teams/signup-mode";

/** Extra config persisted in tournaments.config (jsonb). */
export interface TournamentConfigJson {
  seedingRounds?: number | "full";
  manualSeedOrder?: string[];
  roundRobinDouble?: boolean;
  numGroups?: number;
  advancePerGroup?: number;
  groupDoubleRoundRobin?: boolean;
  groupDraw?: "random" | "manual";
  manualGroups?: GroupAssignment[];
  knockoutFormat?: "single_elim" | "double_elim" | "triple_elim";
  /** multi_stage pipeline definition (Feature 8). */
  stages?: StageConfig[];
  /** Optional organizer notes / house rules shown on the public hub. */
  notes?: string;
  /** Parallel stations: matches playable concurrently (Feature 12). 1–8. */
  numStations?: number;
  /** Best-of-N series length for elimination matches (Feature 13). 1 | 3 | 5. */
  seriesLength?: 1 | 3 | 5;
  /** Allow players to submit results for approval (Feature 15). */
  selfServiceScoring?: boolean;

  // --- Team Builder (large events) ---
  /** Entrant model. Default "individual" preserves all existing behavior. */
  entryMode?: "individual" | "team";
  /** Freeform team sizes within min..max; target is advisory (auto-fill goal). */
  teamSize?: { target: number; min: number; max: number };
  /** Gates the public native sign-up page (also enforced by RLS). */
  signupEnabled?: boolean;
  /**
   * Which sign-up paths the public page offers (also enforced by RLS).
   * Defaults to "both".
   */
  signupMode?: SignupMode;
  /** Organizer-owned Google Form link to display/share. */
  googleFormUrl?: string;
  /** Human names for stations/courts, e.g. ["Court 1","Table A"]. */
  stationLabels?: string[];
}

export interface TournamentRow {
  id: string;
  organizer_id: string;
  name: string;
  game_name: string | null;
  event_date: string | null;
  slug: string;
  format: MainFormat;
  scoring_mode: ScoringMode;
  seeding_method: SeedingMethod;
  tiebreak: PointsTiebreak;
  ai_tone: AiTone;
  draw_seed: number;
  status: "setup" | "live" | "complete";
  config: TournamentConfigJson;
  power_ranking: string[];
  prev_power_ranking: string[];
  /** Soft-delete timestamp; null means the tournament is active. */
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlayerRow {
  id: string;
  tournament_id: string;
  name: string;
  seed: number | null;
  position: number;
  withdrawn: boolean;
  created_at: string;
}

/** One game within a best-of-N series (Feature 13). */
export interface SeriesGame {
  a: number;
  b: number;
}

export interface MatchResultRow {
  id: string;
  tournament_id: string;
  match_key: string;
  winner_player_id: string | null;
  score_a: number | null;
  score_b: number | null;
  is_draw: boolean;
  forfeit: boolean;
  series_games?: SeriesGame[] | null;
}

/** A team: 1:1 with a bracket entrant (players row), plus roster metadata. */
export interface TeamRow {
  id: string;
  tournament_id: string;
  player_id: string | null;
  name: string;
  target_size: number | null;
  min_size: number | null;
  max_size: number | null;
  locked: boolean;
  checked_in: boolean;
  checked_in_at: string | null;
  position: number;
  created_at: string;
}

/** One person: solo pool (team_id null) or a team member. */
export interface RegistrantRow {
  id: string;
  tournament_id: string;
  team_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  signup_type: "solo" | "team";
  is_captain: boolean;
  proposed_team: string | null;
  status: "pending" | "approved" | "declined";
  source: "native" | "google_csv" | "manual" | "walkin";
  checked_in: boolean;
  checked_in_at: string | null;
  notes: string | null;
  created_at: string;
}

/** Live per-match court/station state. Never read by the engine. */
export interface StationAssignmentRow {
  id: string;
  tournament_id: string;
  match_key: string;
  station: number | null;
  state: "queued" | "playing" | "done";
  called_at: string | null;
  updated_at: string;
}

export function toParticipants(players: readonly PlayerRow[]): Participant[] {
  return players
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((p) => ({
      id: p.id,
      name: p.name,
      seed: p.seed ?? undefined,
      withdrawn: p.withdrawn,
    }));
}

export function toResults(rows: readonly MatchResultRow[]): MatchResult[] {
  return rows.map((r) => ({
    matchKey: r.match_key,
    winnerId: r.winner_player_id,
    scoreA: r.score_a,
    scoreB: r.score_b,
    isDraw: r.is_draw,
    forfeit: r.forfeit,
    status: "done" as const,
  }));
}

export function toEngineConfig(t: TournamentRow): TournamentConfig {
  const c = t.config ?? {};
  return {
    format: t.format,
    scoringMode: t.scoring_mode,
    tiebreak: t.tiebreak,
    drawSeed: Number(t.draw_seed) || 0,
    seedingMethod: t.seeding_method,
    seedingRounds: c.seedingRounds,
    manualSeedOrder: c.manualSeedOrder,
    roundRobinDouble: c.roundRobinDouble,
    numGroups: c.numGroups,
    advancePerGroup: c.advancePerGroup,
    groupDoubleRoundRobin: c.groupDoubleRoundRobin,
    groupDraw: c.groupDraw,
    manualGroups: c.manualGroups,
    knockoutFormat: c.knockoutFormat,
    stages: c.stages,
  };
}

/** Compute the full live state for a tournament from its persisted rows. */
export function computeTournamentState(
  t: TournamentRow,
  players: readonly PlayerRow[],
  results: readonly MatchResultRow[],
) {
  const participants = toParticipants(players);
  const engineResults = toResults(results);
  const config = toEngineConfig(t);
  const state = buildEngineState(config, participants, engineResults);
  return { state, participants, config };
}
