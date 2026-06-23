import type {
  MainFormat,
  PointsTiebreak,
  ScoringMode,
  SeedingMethod,
  StageConfig,
} from "@/lib/engine";

/**
 * One-click tournament presets surfaced in the creation wizard. A preset only
 * pre-fills the wizard — every field stays editable before the event is created.
 */
export interface Template {
  id: string;
  label: string;
  description: string;
  /** Suggested roster size; the wizard seeds this many blank rows. */
  playerCount: number | null;
  format: MainFormat;
  scoringMode: ScoringMode;
  seedingMethod: SeedingMethod;
  tiebreak: PointsTiebreak;
  config: {
    roundRobinDouble?: boolean;
    numGroups?: number;
    advancePerGroup?: number;
    knockoutFormat?: "single_elim" | "double_elim" | "triple_elim";
    /** Multi-stage pipeline; populated for multi_stage presets (Feature 8). */
    stages?: StageConfig[];
  };
}

export const TEMPLATES: Template[] = [
  {
    id: "se8",
    label: "8-player single elim",
    description: "Eight players, random draw, win-or-go-home single elimination.",
    playerCount: 8,
    format: "single_elim",
    scoringMode: "win_loss",
    seedingMethod: "random",
    tiebreak: "points_scored",
    config: {},
  },
  {
    id: "rr12",
    label: "12-player round robin",
    description: "Everyone plays everyone once; best record wins. Scored.",
    playerCount: 12,
    format: "round_robin",
    scoringMode: "scored",
    seedingMethod: "random",
    tiebreak: "points_scored",
    config: { roundRobinDouble: false },
  },
  {
    id: "de16",
    label: "16-player double elim",
    description: "Sixteen players, random draw, two lives in a double-elim bracket.",
    playerCount: 16,
    format: "double_elim",
    scoringMode: "win_loss",
    seedingMethod: "random",
    tiebreak: "points_scored",
    config: {},
  },
  {
    id: "wc32",
    label: "32-player World Cup",
    description: "8 groups of 4, top 2 advance, then a single-elim knockout.",
    playerCount: 32,
    format: "group_knockout",
    scoringMode: "scored",
    seedingMethod: "random",
    tiebreak: "points_scored",
    config: { numGroups: 8, advancePerGroup: 2, knockoutFormat: "single_elim" },
  },
  {
    id: "mega128",
    label: "128-player mega event",
    description:
      "Three stages: 32 groups of 4 (top 1) → 8 groups of 4 (top 1) → single-elim final 8.",
    playerCount: 128,
    format: "multi_stage",
    scoringMode: "scored",
    seedingMethod: "random",
    tiebreak: "points_scored",
    config: {
      stages: [
        { type: "group", numGroups: 32, advancePerGroup: 1, draw: "random" },
        { type: "group", numGroups: 8, advancePerGroup: 1, draw: "random" },
        { type: "single_elim" },
      ],
    },
  },
  {
    id: "custom",
    label: "Custom",
    description: "Start from a blank wizard and configure everything yourself.",
    playerCount: null,
    format: "single_elim",
    scoringMode: "scored",
    seedingMethod: "random",
    tiebreak: "points_scored",
    config: {},
  },
];

export function templateById(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
