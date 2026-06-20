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
}

export interface HubPlayer {
  id: string;
  name: string;
  withdrawn: boolean;
}

export interface HubData {
  tournament: HubTournament;
  players: HubPlayer[];
  state: EngineState;
  prevRanking: string[];
  isOrganizer: boolean;
}
