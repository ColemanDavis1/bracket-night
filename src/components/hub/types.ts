import type { AiTone, EngineState, MainFormat, PointsTiebreak, ScoringMode } from "@/lib/engine";

export interface HubTournament {
  id: string;
  name: string;
  gameName: string | null;
  slug: string;
  format: MainFormat;
  scoringMode: ScoringMode;
  tiebreak: PointsTiebreak;
  aiTone: AiTone;
  status: "setup" | "live" | "complete";
  eventDate: string | null;
  notes: string | null;
  /** Parallel stations (Feature 12). Defaults to 1. */
  numStations: number;
  /** Best-of-N series length (Feature 13). Defaults to 1. */
  seriesLength: 1 | 3 | 5;
  /** Player self-service score submission enabled (Feature 15). */
  selfServiceScoring: boolean;
}

export interface HubPlayer {
  id: string;
  name: string;
  withdrawn: boolean;
}

/** A player-submitted result awaiting organizer approval (Feature 15). */
export interface HubPending {
  id: string;
  matchKey: string;
  submittedBy: string | null;
  winnerId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  isDraw: boolean;
  createdAt: string;
}

export interface HubData {
  tournament: HubTournament;
  players: HubPlayer[];
  state: EngineState;
  prevRanking: string[];
  isOrganizer: boolean;
  /** Pending self-service submissions (empty unless the feature is on). */
  pending: HubPending[];
}
