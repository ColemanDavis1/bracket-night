import type { AiTone, MainFormat, PointsTiebreak, ScoringMode, SeedingMethod } from "@/lib/engine";

export const FORMAT_LABELS: Record<MainFormat, string> = {
  round_robin: "Round Robin",
  single_elim: "Single Elimination",
  double_elim: "Double Elimination",
  triple_elim: "Triple Elimination",
  group_knockout: "Group Stage → Knockout",
};

export const FORMAT_BLURBS: Record<MainFormat, string> = {
  round_robin: "Everyone plays everyone once. Best record wins.",
  single_elim: "Lose once and you're out. Byes go to the top seeds.",
  double_elim: "A winners and losers bracket — out after two losses.",
  triple_elim: "Three lives. Out after three losses (multi-life format).",
  group_knockout: "Group round robins feed a cross-paired knockout bracket.",
};

export const SCORING_LABELS: Record<ScoringMode, string> = {
  win_loss: "Win / Loss only",
  scored: "Scored (record point totals)",
};

export const SEEDING_LABELS: Record<SeedingMethod, string> = {
  manual: "Manual — drag to rank",
  random: "Random draw",
  seeding_rounds: "Seeding rounds → bracket",
};

export const TIEBREAK_LABELS: Record<PointsTiebreak, string> = {
  points_scored: "Points scored",
  points_allowed: "Points allowed (fewest)",
};

export const TONE_LABELS: Record<AiTone, string> = {
  hype: "Hype sportscaster",
  trash_talk: "Playful trash-talk",
  analyst: "Balanced analyst",
};
