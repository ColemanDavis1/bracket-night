import type {
  GeneratedMatch,
  MatchResult,
  Participant,
  PointsTiebreak,
  ResolvedMatch,
  SlotRef,
  StandingsRow,
} from "./types";
import {
  assignGroups,
  computeAdvancers,
  generateGroupStage,
  groupKey,
  type Advancer,
  type GroupAssignment,
} from "./groups";
import {
  generateDoubleElimination,
  generateKnockoutFromLeaves,
  generateSingleElimination,
} from "./elimination";
import { buildMultiLifeElimination } from "./multiLife";
import { generateRoundRobin } from "./roundRobin";
import { resolveMatches, isComplete } from "./resolve";
import { computeStandings } from "./standings";
import { nextPow2, seedOrder } from "./seeding";

/**
 * Multi-stage group pipeline format.
 *
 * A tournament is a sequence of stages. Each stage takes a pool of entrants,
 * plays a sub-format (group play, round robin, or an elimination bracket) and
 * produces an ordered list of survivors that feed the next stage. The last
 * stage crowns the champion.
 *
 * Implementation strategy: every stage is generated with the *existing*
 * single-format generators (so all their tested behaviour is preserved), then
 * its keys and internal winner/loser references are namespaced with an `S{n}-`
 * prefix and tagged with `stageIndex`. Entry slots are concrete participant
 * refs (no dependence on a global seed list), so the whole pipeline resolves in
 * a single pass and each stage is fully self-contained.
 *
 * Generation is **lazy**: a stage is only generated once the previous stage is
 * complete, so downstream brackets aren't drawn until their entrants are known.
 */

export type ElimFormat = "single_elim" | "double_elim" | "triple_elim";

export type StageConfig =
  | {
      type: "group";
      numGroups: number;
      advancePerGroup: number;
      doubleRoundRobin?: boolean;
      draw?: "random" | "manual";
      /** Manual group draw, one assignment list per stage occurrence. */
      manualGroups?: GroupAssignment[];
    }
  | { type: "knockout"; format: ElimFormat }
  | { type: "round_robin"; double?: boolean }
  | { type: ElimFormat };

export type StageKindName =
  | "group"
  | "round_robin"
  | "single_elim"
  | "double_elim"
  | "triple_elim";

export interface StageView {
  index: number;
  kind: StageKindName;
  label: string;
  /** Number of entrants that started this stage. */
  entrantCount: number;
  entrantIds: string[];
  matches: ResolvedMatch[];
  groups: GroupAssignment[] | null;
  groupStandings: { groupKey: string; rows: StandingsRow[] }[] | null;
  /** Overall standings for round-robin / elimination stages. */
  standings: StandingsRow[] | null;
  /** Ordered survivor ids (best first) once the stage is complete. */
  advancerIds: string[] | null;
  complete: boolean;
  started: boolean;
}

export interface MultiStageResult {
  generated: GeneratedMatch[];
  stages: StageView[];
  championId: string | null;
  complete: boolean;
  /** Index of the stage currently being played (or the last, if complete). */
  activeStageIndex: number;
}

/** Map a stage config to its underlying single-format kind. */
export function stageKind(stage: StageConfig): StageKindName {
  if (stage.type === "knockout") return stage.format;
  return stage.type as StageKindName;
}

export function stageKindLabel(kind: StageKindName): string {
  switch (kind) {
    case "group":
      return "Group Stage";
    case "round_robin":
      return "Round Robin";
    case "single_elim":
      return "Single Elimination";
    case "double_elim":
      return "Double Elimination";
    case "triple_elim":
      return "Triple Elimination";
  }
}

/** Re-key and re-reference a stage's matches under an `S{n}-` namespace. */
function namespaceMatches(
  matches: readonly GeneratedMatch[],
  prefix: string,
  stageIndex: number,
): GeneratedMatch[] {
  const reref = (ref: SlotRef): SlotRef =>
    ref.kind === "winner" || ref.kind === "loser"
      ? { ...ref, matchKey: prefix + ref.matchKey }
      : ref;
  return matches.map((m) => ({
    ...m,
    key: prefix + m.key,
    stageIndex,
    aRef: reref(m.aRef),
    bRef: reref(m.bRef),
  }));
}

/** Replace seed refs with concrete participant refs from an ordered pool. */
function bindSeeds(
  matches: readonly GeneratedMatch[],
  pool: readonly string[],
): GeneratedMatch[] {
  const bind = (ref: SlotRef): SlotRef => {
    if (ref.kind !== "seed") return ref;
    const id = pool[ref.seed - 1];
    return id ? { kind: "participant", id } : { kind: "bye" };
  };
  return matches.map((m) => ({ ...m, aRef: bind(m.aRef), bRef: bind(m.bRef) }));
}

/** Build the (un-namespaced) matches for one stage given its ordered entrants. */
function generateStage(
  stage: StageConfig,
  entrants: readonly string[],
  participants: readonly Participant[],
  results: readonly MatchResult[],
  prefix: string,
  drawSeed: number,
): { matches: GeneratedMatch[]; groups: GroupAssignment[] | null } {
  const byId = new Map(participants.map((p) => [p.id, p]));
  const pool = entrants
    .map((id) => byId.get(id))
    .filter((p): p is Participant => Boolean(p));
  const kind = stageKind(stage);

  if (stage.type === "group") {
    const groups =
      stage.draw === "manual" && stage.manualGroups
        ? stage.manualGroups
        : assignGroups(pool, stage.numGroups, {
            seeds: entrants,
            drawSeed,
            random: stage.draw !== "manual",
          });
    const matches = generateGroupStage(groups, pool, {
      double: stage.doubleRoundRobin,
    });
    return { matches, groups };
  }

  if (kind === "round_robin") {
    const double = stage.type === "round_robin" ? stage.double : false;
    return {
      matches: generateRoundRobin(pool, { double }),
      groups: null,
    };
  }

  // Elimination kinds.
  if (kind === "single_elim") {
    const size = nextPow2(entrants.length);
    const leaves = seedOrder(size).map((seed) => entrants[seed - 1] ?? null);
    return {
      matches: generateKnockoutFromLeaves(leaves, { keyPrefix: "KO" }),
      groups: null,
    };
  }

  if (kind === "double_elim") {
    const matches = bindSeeds(
      generateDoubleElimination(entrants.length),
      entrants,
    );
    return { matches, groups: null };
  }

  // triple_elim — dynamic Swiss-style bracket reads its own results, so strip
  // the namespace prefix off this stage's results before feeding it in.
  const stageResults = results
    .filter((r) => r.matchKey.startsWith(prefix))
    .map((r) => ({ ...r, matchKey: r.matchKey.slice(prefix.length) }));
  const { matches } = buildMultiLifeElimination(entrants, stageResults, 3);
  return { matches, groups: null };
}

/** Champion of a single elimination/knockout stage (grand-final aware). */
function bracketChampion(stageMatches: readonly ResolvedMatch[]): string | null {
  const gf2 = stageMatches.find((m) => m.key.endsWith("GF-2"));
  if (gf2 && !gf2.voided) return gf2.status === "done" ? gf2.winnerId : null;
  const gf1 = stageMatches.find((m) => m.key.endsWith("GF-1"));
  if (gf1) return gf1.status === "done" ? gf1.winnerId : null;
  const finals = stageMatches.filter(
    (m) => m.stage === "knockout" || m.stage === "winners",
  );
  if (finals.length === 0) return null;
  const last = finals.reduce((acc, m) => (m.order > acc.order ? m : acc));
  return last.status === "done" ? last.winnerId : null;
}

/** Ordered survivors of a stage, best first. */
function survivorsOf(
  view: Omit<StageView, "advancerIds">,
  stage: StageConfig,
  participants: readonly Participant[],
  tiebreak: PointsTiebreak,
  drawSeed: number,
  isFinal: boolean,
): string[] {
  if (stage.type === "group" && view.groups) {
    const advancers: Advancer[] = computeAdvancers(
      view.groups,
      participants,
      view.matches,
      stage.advancePerGroup,
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
    return isFinal ? ranked.slice(0, 1) : ranked;
  }

  const kind = stageKind(stage);
  if (kind === "round_robin") {
    const ranked = (view.standings ?? []).map((r) => r.participantId);
    // Round robin narrows to its winner when it isn't the final stage.
    return isFinal ? ranked.slice(0, 1) : ranked.slice(0, 1);
  }

  // Elimination: the champion advances.
  const champ = bracketChampion(view.matches);
  return champ ? [champ] : [];
}

export function buildMultiStageState(
  config: {
    stages: StageConfig[];
    tiebreak: PointsTiebreak;
    drawSeed: number;
  },
  participants: readonly Participant[],
  results: readonly MatchResult[],
  baseSeeds: readonly string[] | null,
): MultiStageResult {
  const stages = config.stages ?? [];
  const { tiebreak, drawSeed } = config;
  const byId = new Map(participants.map((p) => [p.id, p]));

  const generated: GeneratedMatch[] = [];
  const views: StageView[] = [];
  let entrants: string[] =
    baseSeeds && baseSeeds.length
      ? baseSeeds.filter((id) => byId.has(id))
      : participants.map((p) => p.id);
  let championId: string | null = null;
  let complete = false;
  let activeStageIndex = 0;

  // Seeds not yet known (seeding rounds still in progress): nothing to draw.
  if (!baseSeeds && stages.some((s) => stageKind(s) !== "round_robin")) {
    // Fall through with the natural participant order for round-robin-only
    // first stages; otherwise wait until seeding resolves.
  }

  let prevComplete = true;
  for (let s = 0; s < stages.length && prevComplete; s++) {
    const stage = stages[s] as StageConfig;
    activeStageIndex = s;
    if (entrants.length < 2) break;

    const prefix = `S${s + 1}-`;
    const isFinal = s === stages.length - 1;
    const { matches: bare, groups } = generateStage(
      stage,
      entrants,
      participants,
      results,
      prefix,
      drawSeed,
    );
    const nsMatches = namespaceMatches(bare, prefix, s);
    generated.push(...nsMatches);

    const stageResolved = resolveMatches(nsMatches, [], results, participants);
    const stageComplete = isComplete(stageResolved);
    const started = stageResolved.some((m) => m.status === "done");

    const poolParts = entrants
      .map((id) => byId.get(id))
      .filter((p): p is Participant => Boolean(p));
    const kind = stageKind(stage);

    let groupStandings: StageView["groupStandings"] = null;
    let standings: StandingsRow[] | null = null;
    if (stage.type === "group" && groups) {
      groupStandings = groups.map((g) => ({
        groupKey: g.groupKey,
        rows: computeStandings(
          poolParts.filter((p) => g.participantIds.includes(p.id)),
          stageResolved.filter((m) => m.groupKey === g.groupKey),
          tiebreak,
          drawSeed,
        ),
      }));
    } else {
      standings = computeStandings(poolParts, stageResolved, tiebreak, drawSeed);
    }

    const baseView: Omit<StageView, "advancerIds"> = {
      index: s,
      kind,
      label: stageKindLabel(kind),
      entrantCount: entrants.length,
      entrantIds: entrants.slice(),
      matches: stageResolved,
      groups,
      groupStandings,
      standings,
      complete: stageComplete,
      started,
    };

    const advancerIds = stageComplete
      ? survivorsOf(baseView, stage, participants, tiebreak, drawSeed, isFinal)
      : null;

    views.push({ ...baseView, advancerIds });

    prevComplete = stageComplete;
    if (stageComplete) {
      if (isFinal) {
        complete = true;
        championId = (advancerIds ?? [])[0] ?? bracketChampion(stageResolved);
      } else if (advancerIds) {
        entrants = advancerIds;
      }
    }
  }

  return { generated, stages: views, championId, complete, activeStageIndex };
}

/** Default stage label list for the wizard timeline ("A", "B", ... ). */
export function groupKeyName(index: number): string {
  return groupKey(index);
}
