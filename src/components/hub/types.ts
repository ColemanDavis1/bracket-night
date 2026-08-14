import type {
  AiTone,
  EngineState,
  MainFormat,
  PointsTiebreak,
  ScoringMode,
  SeedingMethod,
} from "@/lib/engine";
import type { SignupMode } from "@/lib/teams/signup-mode";

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
  // --- Format options (editable after the event starts) ---
  seedingMethod: SeedingMethod;
  seedingRounds: number | "full" | null;
  roundRobinDouble: boolean;
  numGroups: number | null;
  advancePerGroup: number | null;
  groupDoubleRoundRobin: boolean;
  knockoutFormat: "single_elim" | "double_elim" | "triple_elim" | null;
  /** Parallel stations (Feature 12). Defaults to 1. */
  numStations: number;
  /** Best-of-N series length (Feature 13). Defaults to 1. */
  seriesLength: 1 | 3 | 5;
  /** Player self-service score submission enabled (Feature 15). */
  selfServiceScoring: boolean;
  // --- Team Builder ---
  /** Entrant model. Defaults to "individual". */
  entryMode: "individual" | "team";
  /** Freeform team sizes (target advisory). */
  teamSize: { target: number; min: number; max: number } | null;
  /** Public native sign-up page enabled. */
  signupEnabled: boolean;
  /** Which sign-up paths the public page offers. */
  signupMode: SignupMode;
  /** Organizer's Google Form link, if any. */
  googleFormUrl: string | null;
  /** Human names for the stations/courts. */
  stationLabels: string[];
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

/** A team (bracket entrant + roster metadata). */
export interface HubTeam {
  id: string;
  playerId: string | null;
  name: string;
  targetSize: number | null;
  minSize: number | null;
  maxSize: number | null;
  locked: boolean;
  checkedIn: boolean;
  position: number;
}

/** One registered person (solo pool or team member). */
export interface HubRegistrant {
  id: string;
  teamId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  signupType: "solo" | "team";
  isCaptain: boolean;
  proposedTeam: string | null;
  status: "pending" | "approved" | "declined";
  source: "native" | "google_csv" | "manual" | "walkin";
  checkedIn: boolean;
}

/** Live per-match court/station state. */
export interface HubStation {
  matchKey: string;
  station: number | null;
  state: "queued" | "playing" | "done";
  calledAt: string | null;
}

export interface HubData {
  tournament: HubTournament;
  players: HubPlayer[];
  state: EngineState;
  prevRanking: string[];
  isOrganizer: boolean;
  /** Pending self-service submissions (empty unless the feature is on). */
  pending: HubPending[];
  /** Team Builder roster (empty in individual mode). */
  teams: HubTeam[];
  registrants: HubRegistrant[];
  /** Live court/station assignments (empty until any are set). */
  stations: HubStation[];
}
