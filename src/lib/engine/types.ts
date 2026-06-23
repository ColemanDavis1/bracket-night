/**
 * Core domain types for the tournament format engine.
 *
 * This module is **pure**: no React, no Next, no Supabase. Everything here is
 * deterministic given its inputs so it can be exhaustively unit-tested and
 * reused on both the server (recompute after score entry) and the client
 * (previewing a draw in the creation wizard).
 */

export type ScoringMode = "win_loss" | "scored";

export type MainFormat =
  | "round_robin"
  | "single_elim"
  | "double_elim"
  | "triple_elim"
  | "group_knockout"
  | "multi_stage";

export type SeedingMethod = "manual" | "random" | "seeding_rounds";

/** Second-level tiebreaker the organizer selects (after head-to-head). */
export type PointsTiebreak = "points_scored" | "points_allowed";

export type AiTone = "hype" | "trash_talk" | "analyst";

/** Where a match sits in the overall event. Drives labels and grouping. */
export type StageKind =
  | "seeding"
  | "round_robin"
  | "group"
  | "winners"
  | "losers"
  | "grand_final"
  | "knockout";

export type MatchStatus = "pending" | "ready" | "done" | "bye";

/** A participant in a single tournament (per-tournament only in the MVP). */
export interface Participant {
  id: string;
  name: string;
  /** 1-indexed seed. Lower is better. Undefined until seeding resolves. */
  seed?: number;
  withdrawn?: boolean;
}

/**
 * A reference to whatever fills a match slot. Resolved lazily so that
 * elimination brackets can be generated up-front before participants are known.
 */
export type SlotRef =
  | { kind: "seed"; seed: number } // 1-indexed into the seed list
  | { kind: "participant"; id: string }
  | { kind: "winner"; matchKey: string }
  | { kind: "loser"; matchKey: string }
  | { kind: "bye" }
  | { kind: "tbd" };

/** A match as produced by a generator, before participants/results resolve. */
export interface GeneratedMatch {
  /** Stable, unique key within a tournament, e.g. "WB-1-1", "RR-2-3", "G-A-1". */
  key: string;
  stage: StageKind;
  /** Round ordinal within the stage (1-based). */
  roundNumber: number;
  /** Global ordering hint for the sequential "next up" queue. */
  order: number;
  label: string;
  /** For group stage only: "A", "B", ... */
  groupKey?: string;
  /** 0-based pipeline stage index for multi-stage tournaments. */
  stageIndex?: number;
  aRef: SlotRef;
  bRef: SlotRef;
  /** Draws permitted (round robin / seeding) vs forced winner (elimination). */
  allowDraw: boolean;
}

/** A recorded result for a match (organizer-entered). */
export interface MatchResult {
  matchKey: string;
  winnerId: string | null; // null when it's a draw
  scoreA: number | null;
  scoreB: number | null;
  isDraw: boolean;
  forfeit: boolean;
  status: "done";
}

/** A match after participants and (optionally) results have been resolved. */
export interface ResolvedMatch extends GeneratedMatch {
  aId: string | null; // null = bye or not-yet-determined
  bId: string | null;
  status: MatchStatus;
  winnerId: string | null;
  loserId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  isDraw: boolean;
  forfeit: boolean;
  /** True for a grand-final reset match that turned out not to be needed. */
  voided?: boolean;
}

export interface TiebreakConfig {
  points: PointsTiebreak;
}

/** A computed standings row for one participant. */
export interface StandingsRow {
  participantId: string;
  name: string;
  rank: number;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  /** Current win streak (consecutive wins ending at most recent game). */
  streak: number;
  /** Longest win streak observed across the event. */
  longestStreak: number;
  withdrawn: boolean;
  /** True when the final position was decided by the random fallback. */
  decidedByRandom: boolean;
}
