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
import type { GroupAssignment } from "@/lib/engine";

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

export interface MatchResultRow {
  id: string;
  tournament_id: string;
  match_key: string;
  winner_player_id: string | null;
  score_a: number | null;
  score_b: number | null;
  is_draw: boolean;
  forfeit: boolean;
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
