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
import {
  buildMultiStageState,
  stageKind,
  type StageConfig,
  type StageView,
} from "./multiStage";

export * from "./types";
export { makeRng, shuffle, newSeed } from "./rng";
export { nextPow2, seedOrder } from "./seeding";
export { computeStandings } from "./standings";
export { resolveMatches, championOf, isComplete } from "./resolve";
export { groupKey, groupKeyList, compareGroupKeys } from "./groups";
export type { Advancer, GroupAssignment } from "./groups";
export {
  stageKind,
  stageKindLabel,
  type StageConfig,
  type StageView,
  type StageKindName,
  type ElimFormat,
} from "./multiStage";

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

  /** multi_stage configuration: an ordered pipeline of stages. */
  stages?: StageConfig[];
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
  /** 0-based index of the currently active stage (multi-stage aware). */
  activeStageIndex: number;
  /** Label of the round currently in progress, e.g. "Winners Round 2". */
  activeRoundLabel: string | null;
  /** Set when a phase just finished and the next begins, for the banner. */
  phaseTransition: { from: string; to: string } | null;
  /** Per-stage views for multi_stage tournaments (null for single-format). */
  stages: StageView[] | null;
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

  // --- Multi-stage pipeline (its own self-contained generation) ---
  if (config.format === "multi_stage") {
    return buildMultiStageEngineState(config, participants, results, seeds);
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

  const state: EngineState = {
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
    activeStageIndex: 0,
    activeRoundLabel: null,
    phaseTransition: null,
    stages: null,
  };
  state.activeRoundLabel = currentRound(state)?.label ?? null;
  state.activeStageIndex = activeStageIndexOf(state);
  state.phaseTransition = phaseTransitionOf(state);
  return state;
}

/** 1-based ordinal of a stage among stages sharing its kind. */
function stageOrdinalWithinKind(stages: readonly StageView[], index: number): number {
  const kind = stages[index]?.kind;
  let n = 0;
  for (let i = 0; i <= index; i++) if (stages[i]?.kind === kind) n++;
  return n;
}

/**
 * Display label for a stage, disambiguating repeats of the same kind
 * (e.g. two group stages become "Group Stage 1" / "Group Stage 2").
 */
export function stageDisplayLabel(
  stages: readonly StageView[],
  index: number,
): string {
  const v = stages[index];
  if (!v) return "";
  const sameKind = stages.filter((s) => s.kind === v.kind).length;
  return sameKind > 1
    ? `${v.label} ${stageOrdinalWithinKind(stages, index)}`
    : v.label;
}

/** Map a multi-stage view's kind onto the coarse EnginePhase for the hub. */
function stagePhase(kind: ReturnType<typeof stageKind>): EnginePhase {
  if (kind === "group") return "group";
  if (kind === "round_robin") return "round_robin";
  return "knockout";
}

/** Build the full EngineState for a multi_stage tournament. */
function buildMultiStageEngineState(
  config: TournamentConfig,
  participants: readonly Participant[],
  results: readonly MatchResult[],
  seeds: string[] | null,
): EngineState {
  const { tiebreak, drawSeed } = config;
  const ms = buildMultiStageState(
    { stages: config.stages ?? [], tiebreak, drawSeed },
    participants,
    results,
    seeds,
  );

  let generated = ms.generated.slice();
  generated.forEach((m, i) => (m.order = i));
  const matches = resolveMatches(generated, [], results, participants);
  const overallStandings = computeStandings(
    participants,
    matches,
    tiebreak,
    drawSeed,
  );

  const activeView = ms.stages[ms.activeStageIndex];
  const phase: EnginePhase = ms.complete
    ? "complete"
    : activeView
      ? stagePhase(activeView.kind)
      : "group";

  const state: EngineState = {
    phase,
    matches,
    seeds,
    overallStandings,
    seedingStandings: null,
    groups: activeView?.groups ?? null,
    groupStandings: activeView?.groupStandings ?? null,
    advancers: null,
    championId: ms.championId,
    complete: ms.complete,
    activeStageIndex: ms.activeStageIndex,
    activeRoundLabel: null,
    phaseTransition: null,
    stages: ms.stages,
  };
  state.activeRoundLabel = currentRound(state)?.label ?? null;
  state.phaseTransition = phaseTransitionOf(state);
  return state;
}

// ---------------------------------------------------------------------------
// Round & phase progress helpers (pure, used by the live hub + TV mode).
// ---------------------------------------------------------------------------

/** A contiguous run of matches that share a round label within one stage. */
export interface RoundInfo {
  key: string;
  label: string;
  stage: ResolvedMatch["stage"];
  /** Lowest match order in the round (for sorting / auto-scroll). */
  order: number;
  matches: ResolvedMatch[];
  done: number;
  total: number;
  complete: boolean;
}

/** Collapse elimination sub-brackets into a single "phase" for grouping. */
function stageGroup(stage: ResolvedMatch["stage"]): string {
  if (stage === "winners" || stage === "losers" || stage === "grand_final") {
    return "knockout";
  }
  return stage;
}

function stageLabel(stage: ResolvedMatch["stage"]): string {
  switch (stageGroup(stage)) {
    case "seeding":
      return "Seeding Rounds";
    case "group":
      return "Group Stage";
    case "round_robin":
      return "Round Robin";
    case "knockout":
      return "Knockout";
    default:
      return "Bracket";
  }
}

function phaseStages(phase: EnginePhase): Set<ResolvedMatch["stage"]> {
  switch (phase) {
    case "seeding":
      return new Set(["seeding"]);
    case "round_robin":
      return new Set(["round_robin"]);
    case "group":
      return new Set(["group"]);
    case "knockout":
    case "bracket":
      return new Set(["winners", "losers", "grand_final", "knockout"]);
    default:
      return new Set([
        "seeding",
        "group",
        "round_robin",
        "winners",
        "losers",
        "grand_final",
        "knockout",
      ]);
  }
}

export function phaseLabel(phase: EnginePhase): string {
  switch (phase) {
    case "seeding":
      return "Seeding Rounds";
    case "round_robin":
      return "Round Robin";
    case "group":
      return "Group Stage";
    case "knockout":
      return "Knockout";
    case "bracket":
      return "Bracket";
    case "complete":
      return "Complete";
  }
}

/** Break the schedule into rounds (contiguous matches sharing a label+stage). */
export function roundsOf(state: EngineState): RoundInfo[] {
  const sorted = state.matches
    .filter((m) => !m.voided)
    .slice()
    .sort((a, b) => a.order - b.order);
  const rounds: RoundInfo[] = [];
  for (const m of sorted) {
    const last = rounds[rounds.length - 1];
    if (last && last.label === m.label && last.stage === m.stage) {
      last.matches.push(m);
    } else {
      rounds.push({
        key: `${m.stage}#${m.roundNumber}#${m.label}#${rounds.length}`,
        label: m.label,
        stage: m.stage,
        order: m.order,
        matches: [m],
        done: 0,
        total: 0,
        complete: false,
      });
    }
  }
  for (const r of rounds) {
    r.total = r.matches.length;
    r.done = r.matches.filter(
      (m) => m.status === "done" || m.status === "bye",
    ).length;
    r.complete = r.total > 0 && r.done === r.total;
  }
  return rounds;
}

/** The round currently being played (first incomplete; last if all done). */
export function currentRound(state: EngineState): RoundInfo | null {
  const rounds = roundsOf(state);
  if (rounds.length === 0) return null;
  return rounds.find((r) => !r.complete) ?? rounds[rounds.length - 1] ?? null;
}

/** All rounds that are 100% complete. */
export function completedRounds(state: EngineState): RoundInfo[] {
  return roundsOf(state).filter((r) => r.complete);
}

/** Match progress within the current phase, plus round position. */
export function phaseProgress(state: EngineState): {
  done: number;
  total: number;
  label: string;
  roundNumber: number;
  roundCount: number;
} {
  const stages = phaseStages(state.phase);
  const phaseMatches = state.matches.filter(
    (m) =>
      !m.voided &&
      stages.has(m.stage) &&
      // Multi-stage: restrict progress to the stage currently in play.
      (state.stages === null || m.stageIndex === state.activeStageIndex),
  );
  const done = phaseMatches.filter(
    (m) => m.status === "done" || m.status === "bye",
  ).length;
  const total = phaseMatches.length;
  const rounds = roundsOf(state).filter(
    (r) =>
      stages.has(r.stage) &&
      (state.stages === null ||
        r.matches[0]?.stageIndex === state.activeStageIndex),
  );
  const cur = currentRound(state);
  const roundCount = rounds.length;
  const roundNumber =
    cur && rounds.length
      ? Math.max(1, rounds.findIndex((r) => r.key === cur.key) + 1)
      : roundCount;
  return { done, total, label: phaseLabel(state.phase), roundNumber, roundCount };
}

/** Best-effort count of players still alive (in a ready/pending match). */
export function playersRemaining(state: EngineState): number {
  if (state.complete) return 1;
  const alive = new Set<string>();
  for (const m of state.matches) {
    if (m.voided) continue;
    if (m.status === "ready" || m.status === "pending") {
      if (m.aId) alive.add(m.aId);
      if (m.bId) alive.add(m.bId);
    }
  }
  return alive.size;
}

function activeStageIndexOf(state: EngineState): number {
  const cur = currentRound(state);
  if (!cur) return 0;
  const groups: string[] = [];
  for (const r of roundsOf(state)) {
    const g = stageGroup(r.stage);
    if (!groups.includes(g)) groups.push(g);
  }
  return Math.max(0, groups.indexOf(stageGroup(cur.stage)));
}

/**
 * Detect the moment a phase finishes and the next begins: the current round
 * starts a different stage than the previous round, the previous round is fully
 * complete, and the current round has not started yet.
 */
export function phaseTransitionOf(
  state: EngineState,
): { from: string; to: string } | null {
  if (state.complete) return null;

  // Multi-stage: a transition is the moment a stage finishes and the next one
  // begins (handles same-kind stages, e.g. Group Stage 1 → Group Stage 2).
  if (state.stages) {
    const idx = state.activeStageIndex;
    const prev = state.stages[idx - 1];
    const cur = state.stages[idx];
    if (prev?.complete && cur && !cur.started) {
      const label = (v: StageView, n: number) =>
        state.stages && state.stages.filter((s) => s.kind === v.kind).length > 1
          ? `${v.label} ${stageOrdinalWithinKind(state.stages, n)}`
          : v.label;
      return { from: label(prev, idx - 1), to: label(cur, idx) };
    }
    return null;
  }

  const rounds = roundsOf(state);
  const cur = currentRound(state);
  if (!cur) return null;
  const idx = rounds.findIndex((r) => r.key === cur.key);
  if (idx <= 0) return null;
  const prev = rounds[idx - 1];
  if (!prev) return null;
  if (
    prev.complete &&
    cur.done === 0 &&
    stageGroup(cur.stage) !== stageGroup(prev.stage)
  ) {
    return { from: stageLabel(prev.stage), to: stageLabel(cur.stage) };
  }
  return null;
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
