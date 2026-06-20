import type {
  GeneratedMatch,
  MainFormat,
  MatchResult,
  Participant,
  PointsTiebreak,
  ResolvedMatch,
  ScoringMode,
  SeedingMethod,
  StandingsRow,
} from "./types";
import {
  generateSeedingSchedule,
  manualSeeds,
  randomSeeds,
} from "./seeding";
import { generateRoundRobin } from "./roundRobin";
import {
  generateDoubleElimination,
  generateSingleElimination,
} from "./elimination";
import { buildMultiLifeElimination } from "./multiLife";
import {
  assignGroups,
  computeAdvancers,
  generateGroupKnockout,
  generateGroupStage,
  type Advancer,
  type GroupAssignment,
} from "./groups";
import { championOf, isComplete, resolveMatches } from "./resolve";
import { computeStandings, seedsFromStandings } from "./standings";

export * from "./types";
export { makeRng, shuffle, newSeed } from "./rng";
export { nextPow2, seedOrder } from "./seeding";
export { computeStandings } from "./standings";
export { resolveMatches, championOf, isComplete } from "./resolve";
export { GROUP_KEYS } from "./groups";
export type { Advancer, GroupAssignment } from "./groups";

export interface TournamentConfig {
  format: MainFormat;
  scoringMode: ScoringMode;
  tiebreak: PointsTiebreak;
  /** Persisted integer so random draws are reproducible. */
  drawSeed: number;

  seedingMethod: SeedingMethod;
  seedingRounds?: number | "full";
  /** Participant ids best-first, for manual seeding. */
  manualSeedOrder?: string[];

  /** Round robin can optionally be played twice. */
  roundRobinDouble?: boolean;

  /** group_knockout configuration */
  numGroups?: number;
  advancePerGroup?: number;
  groupDoubleRoundRobin?: boolean;
  groupDraw?: "random" | "manual";
  manualGroups?: GroupAssignment[];
  knockoutFormat?: "single_elim" | "double_elim" | "triple_elim";
}

export type EnginePhase =
  | "seeding"
  | "round_robin"
  | "bracket"
  | "group"
  | "knockout"
  | "complete";

export interface EngineState {
  phase: EnginePhase;
  matches: ResolvedMatch[];
  /** Resolved seed order (best first), once seeding is settled. */
  seeds: string[] | null;
  overallStandings: StandingsRow[];
  seedingStandings: StandingsRow[] | null;
  groups: GroupAssignment[] | null;
  groupStandings: { groupKey: string; rows: StandingsRow[] }[] | null;
  advancers: Advancer[] | null;
  championId: string | null;
  complete: boolean;
}

function orderedSeedIds(seeded: Participant[]): string[] {
  return seeded
    .slice()
    .sort((a, b) => (a.seed ?? 1e9) - (b.seed ?? 1e9))
    .map((p) => p.id);
}

/**
 * The heart of the app: given a tournament's configuration, its participants,
 * and every recorded result, produce the full current state — resolved matches,
 * standings, groups, advancers, the active phase, and the champion (if any).
 *
 * Pure and deterministic. Server actions call this after each score change to
 * recompute everything; the wizard calls it to preview a draw.
 */
export function buildEngineState(
  config: TournamentConfig,
  participants: readonly Participant[],
  results: readonly MatchResult[],
): EngineState {
  const { tiebreak, drawSeed } = config;
  const generated: GeneratedMatch[] = [];
  let seeds: string[] | null = null;
  let seedingStandings: StandingsRow[] | null = null;
  let groups: GroupAssignment[] | null = null;
  let groupStandings: { groupKey: string; rows: StandingsRow[] }[] | null = null;
  let advancers: Advancer[] | null = null;

  const usesSeedingRounds =
    config.seedingMethod === "seeding_rounds" && config.format !== "round_robin";

  // --- Establish seeds (immediately for manual/random) ---
  if (config.seedingMethod === "manual") {
    seeds = orderedSeedIds(manualSeeds(participants, config.manualSeedOrder ?? []));
  } else if (config.seedingMethod === "random") {
    seeds = orderedSeedIds(randomSeeds(participants, drawSeed));
  }

  // --- Phase 0: seeding rounds ---
  if (usesSeedingRounds) {
    const sched = generateSeedingSchedule(
      participants,
      config.seedingRounds ?? 1,
      drawSeed,
    );
    generated.push(...sched);
    const resolvedSeeding = resolveMatches(sched, [], results, participants);
    seedingStandings = computeStandings(
      participants,
      resolvedSeeding,
      tiebreak,
      drawSeed,
    );
    seeds = isComplete(resolvedSeeding)
      ? seedsFromStandings(participants, resolvedSeeding, tiebreak, drawSeed)
      : null;
  }

  // --- Main competition ---
  let resolveSeeds: string[] = seeds ?? [];

  if (config.format === "round_robin") {
    const rr = generateRoundRobin(participants, {
      double: config.roundRobinDouble,
      startOrder: generated.length,
    });
    generated.push(...rr);
    resolveSeeds = [];
  } else if (
    config.format === "single_elim" ||
    config.format === "double_elim" ||
    config.format === "triple_elim"
  ) {
    if (seeds) {
      const count = seeds.length;
      if (config.format === "single_elim") {
        generated.push(...generateSingleElimination(count));
      } else if (config.format === "double_elim") {
        generated.push(...generateDoubleElimination(count));
      } else {
        const { matches } = buildMultiLifeElimination(seeds, results, 3);
        generated.push(...matches);
      }
      resolveSeeds = seeds;
    }
  } else if (config.format === "group_knockout") {
    const drawReady = config.seedingMethod !== "seeding_rounds" || seeds !== null;
    if (drawReady) {
      const numGroups = config.numGroups ?? 2;
      groups =
        config.groupDraw === "manual" && config.manualGroups
          ? config.manualGroups
          : assignGroups(participants, numGroups, {
              seeds: seeds ?? undefined,
              drawSeed,
              random: config.groupDraw !== "manual",
            });
      const groupMatches = generateGroupStage(groups, participants, {
        double: config.groupDoubleRoundRobin,
      });
      generated.push(...groupMatches);

      const resolvedGroups = resolveMatches(
        groupMatches,
        [],
        results,
        participants,
      );
      groupStandings = groups.map((g) => ({
        groupKey: g.groupKey,
        rows: computeStandings(
          participants.filter((p) => g.participantIds.includes(p.id)),
          resolvedGroups.filter((m) => m.groupKey === g.groupKey),
          tiebreak,
          drawSeed,
        ),
      }));

      if (isComplete(resolvedGroups)) {
        advancers = computeAdvancers(
          groups,
          participants,
          resolvedGroups,
          config.advancePerGroup ?? 2,
          tiebreak,
          drawSeed,
        );
        const ranked = advancers
          .slice()
          .sort(
            (a, b) =>
              a.rankInGroup - b.rankInGroup ||
              b.wins - a.wins ||
              b.pointDiff - a.pointDiff,
          )
          .map((a) => a.participantId);

        if (config.knockoutFormat === "double_elim") {
          generated.push(...generateDoubleElimination(ranked.length));
          resolveSeeds = ranked;
        } else if (config.knockoutFormat === "triple_elim") {
          const { matches } = buildMultiLifeElimination(ranked, results, 3);
          generated.push(...matches);
          resolveSeeds = ranked;
        } else {
          generated.push(...generateGroupKnockout(advancers, generated.length));
        }
      }
    }
  }

  // Reassign a clean sequential order for the "next up" queue.
  generated.forEach((m, i) => (m.order = i));

  const matches = resolveMatches(generated, resolveSeeds, results, participants);
  const overallStandings = computeStandings(
    participants,
    matches,
    tiebreak,
    drawSeed,
  );

  // --- Champion + phase ---
  let championId: string | null = null;
  if (config.format === "triple_elim") {
    championId = buildMultiLifeElimination(seeds ?? [], results, 3).championId;
  } else if (
    config.format === "group_knockout" &&
    config.knockoutFormat === "triple_elim" &&
    resolveSeeds.length
  ) {
    championId = buildMultiLifeElimination(resolveSeeds, results, 3).championId;
  } else if (config.format === "round_robin") {
    championId = isComplete(matches)
      ? overallStandings[0]?.participantId ?? null
      : null;
  } else {
    championId = championOf(matches);
  }

  const complete = matches.length > 0 && isComplete(matches);
  const phase = derivePhase(config, generated, matches, seeds, complete);

  return {
    phase,
    matches,
    seeds,
    overallStandings,
    seedingStandings,
    groups,
    groupStandings,
    advancers,
    championId,
    complete,
  };
}

function derivePhase(
  config: TournamentConfig,
  generated: readonly GeneratedMatch[],
  matches: readonly ResolvedMatch[],
  seeds: string[] | null,
  complete: boolean,
): EnginePhase {
  if (complete) return "complete";
  const has = (s: GeneratedMatch["stage"]) => generated.some((m) => m.stage === s);

  if (config.format === "round_robin") return "round_robin";

  if (has("seeding")) {
    const seedingDone = matches
      .filter((m) => m.stage === "seeding")
      .every((m) => m.status === "done" || m.status === "bye");
    if (!seedingDone || seeds === null) return "seeding";
  }

  if (config.format === "group_knockout") {
    const hasKnockout = generated.some(
      (m) => m.stage === "knockout" || m.stage === "winners",
    );
    if (!hasKnockout) return "group";
    return "knockout";
  }

  return "bracket";
}
