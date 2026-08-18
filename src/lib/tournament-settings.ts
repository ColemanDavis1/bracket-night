/**
 * Post-start settings editing.
 *
 * Sign-ups usually run before anyone knows the head count, so every setting
 * stays editable after an event has started. The catch: some changes regenerate
 * the schedule (different matches, different match keys), which would orphan
 * scores that are already recorded. Those are "structural" and need the
 * organizer to explicitly confirm clearing results first.
 *
 * Pure — no DB, no React.
 */
import type {
  AiTone,
  StageConfig,
  MainFormat,
  PointsTiebreak,
  ScoringMode,
  SeedingMethod,
} from "@/lib/engine";

export interface SettingsPatch {
  name?: string;
  gameName?: string | null;
  eventDate?: string | null;
  format?: MainFormat;
  scoringMode?: ScoringMode;
  seedingMethod?: SeedingMethod;
  tiebreak?: PointsTiebreak;
  aiTone?: AiTone;
  seedingRounds?: number | "full";
  roundRobinDouble?: boolean;
  numGroups?: number;
  advancePerGroup?: number;
  groupDoubleRoundRobin?: boolean;
  knockoutFormat?: "single_elim" | "double_elim" | "triple_elim";
  numStations?: number;
  seriesLength?: 1 | 3 | 5;
  selfServiceScoring?: boolean;
  notes?: string;
  /** multi_stage pipeline. Compared by value, not reference. */
  stages?: StageConfig[];
  /** Re-draw a random bracket. Always structural. */
  reshuffleDraw?: boolean;
}

/** The current value of every field a patch may touch. */
export type SettingsSnapshot = Omit<SettingsPatch, "reshuffleDraw">;

/** Fields that change which matches exist, and therefore their keys. */
export const STRUCTURAL_FIELDS = [
  "format",
  "seedingMethod",
  "seedingRounds",
  "roundRobinDouble",
  "numGroups",
  "advancePerGroup",
  "groupDoubleRoundRobin",
  "knockoutFormat",
  "stages",
] as const;

const FIELD_LABELS: Record<string, string> = {
  format: "format",
  seedingMethod: "seeding",
  seedingRounds: "seeding rounds",
  roundRobinDouble: "double round robin",
  numGroups: "number of groups",
  advancePerGroup: "teams advancing per group",
  groupDoubleRoundRobin: "double group round robin",
  knockoutFormat: "knockout format",
  stages: "the stage pipeline",
  reshuffleDraw: "the draw",
};

/** Which structural fields this patch actually changes. */
export function structuralChanges(
  current: SettingsSnapshot,
  patch: SettingsPatch,
): string[] {
  const changed: string[] = [];
  for (const field of STRUCTURAL_FIELDS) {
    const next = patch[field] as unknown;
    if (next === undefined) continue;
    const now = current[field] as unknown;
    // The pipeline is an array, so a reference compare would report every save
    // as a rebuild. Compare by value.
    const differs =
      field === "stages"
        ? JSON.stringify(next) !== JSON.stringify(now ?? null)
        : next !== now;
    if (differs) changed.push(field);
  }
  if (patch.reshuffleDraw) changed.push("reshuffleDraw");
  return changed;
}

/** Shown when a rebuild would discard scores that are already entered. */
export function rebuildBlockedMessage(
  fields: string[],
  resultCount: number,
): string {
  const what = fields.map((f) => FIELD_LABELS[f] ?? f).join(", ");
  const scores = `${resultCount} recorded ${resultCount === 1 ? "score" : "scores"}`;
  return `Changing ${what} rebuilds the schedule and clears ${scores}. Confirm to continue.`;
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.round(n)));

/**
 * Clamp numeric settings into the ranges the engine and UI support, so a bad
 * client value can never persist a schedule the engine can't build.
 */
export function sanitizeSettingsPatch(patch: SettingsPatch): SettingsPatch {
  const out: SettingsPatch = { ...patch };
  if (out.numStations !== undefined) {
    out.numStations = clamp(out.numStations, 1, 8);
  }
  if (out.numGroups !== undefined) out.numGroups = clamp(out.numGroups, 1, 32);
  if (out.advancePerGroup !== undefined) {
    out.advancePerGroup = clamp(out.advancePerGroup, 1, 16);
  }
  if (out.seriesLength !== undefined) {
    const allowed: (1 | 3 | 5)[] = [1, 3, 5];
    out.seriesLength = allowed.includes(out.seriesLength) ? out.seriesLength : 1;
  }
  if (typeof out.seedingRounds === "number") {
    out.seedingRounds = clamp(out.seedingRounds, 1, 20);
  }
  return out;
}
