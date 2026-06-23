import type {
  GeneratedMatch,
  Participant,
  PointsTiebreak,
  ResolvedMatch,
} from "./types";
import { computeStandings } from "./standings";
import { generateRoundRobin } from "./roundRobin";
import { generateKnockoutFromLeaves } from "./elimination";
import { nextPow2, seedOrder } from "./seeding";
import { makeRng, shuffle } from "./rng";

/**
 * Spreadsheet-style group key for a 0-based index: A..Z, then AA, AB, ...
 * Supports any number of groups (the wizard allows up to floor(players/2)).
 */
export function groupKey(index: number): string {
  let i = index;
  let key = "";
  do {
    key = String.fromCharCode(65 + (i % 26)) + key;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return key;
}

/** The first `count` group keys in order. */
export function groupKeyList(count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => groupKey(i));
}

/**
 * Order group keys so single-letter keys precede multi-letter ones
 * (e.g. Z before AA), then alphabetically within the same length.
 */
export function compareGroupKeys(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

export interface GroupAssignment {
  groupKey: string;
  participantIds: string[];
}

/**
 * Draw participants into `numGroups` groups.
 *
 * Snake distribution keeps groups balanced in size. When seeds are supplied
 * (manual or from seeding rounds) they're used to spread the strongest players
 * across groups; otherwise the order is shuffled for a random draw.
 */
export function assignGroups(
  participants: readonly Participant[],
  numGroups: number,
  opts: { seeds?: readonly string[]; drawSeed?: number; random?: boolean } = {},
): GroupAssignment[] {
  const { seeds, drawSeed = 1, random = false } = opts;
  const byId = new Map(participants.map((p) => [p.id, p]));

  let ordered: string[];
  if (seeds && seeds.length) {
    // Keep only known participants, preserving seed order, then append the rest.
    ordered = seeds.filter((id) => byId.has(id));
    for (const p of participants) if (!ordered.includes(p.id)) ordered.push(p.id);
  } else if (random) {
    ordered = shuffle(
      participants.map((p) => p.id),
      makeRng(drawSeed),
    );
  } else {
    ordered = participants.map((p) => p.id);
  }

  const groups: string[][] = Array.from({ length: numGroups }, () => []);
  // Snake: 0,1,..,G-1, G-1,..,1,0, 0,1,...
  let idx = 0;
  let dir = 1;
  for (const id of ordered) {
    (groups[idx] as string[]).push(id);
    if (dir === 1) {
      if (idx === numGroups - 1) dir = -1;
      else idx++;
    } else {
      if (idx === 0) dir = 1;
      else idx--;
    }
  }

  return groups.map((participantIds, i) => ({
    groupKey: groupKey(i),
    participantIds,
  }));
}

/** Round-robin schedule for every group (single or double round robin). */
export function generateGroupStage(
  groups: readonly GroupAssignment[],
  participants: readonly Participant[],
  opts: { double?: boolean } = {},
): GeneratedMatch[] {
  const byId = new Map(participants.map((p) => [p.id, p]));
  const matches: GeneratedMatch[] = [];
  let order = 0;
  for (const g of groups) {
    const members = g.participantIds
      .map((id) => byId.get(id))
      .filter((p): p is Participant => Boolean(p));
    const groupMatches = generateRoundRobin(members, {
      double: opts.double,
      keyPrefix: `G${g.groupKey}`,
      stage: "group",
      groupKey: g.groupKey,
      startOrder: order,
    });
    order += groupMatches.length;
    matches.push(...groupMatches);
  }
  return matches;
}

export interface Advancer {
  participantId: string;
  groupKey: string;
  rankInGroup: number;
  wins: number;
  pointDiff: number;
}

/** The top `advancePerGroup` finishers of each group, in finishing order. */
export function computeAdvancers(
  groups: readonly GroupAssignment[],
  participants: readonly Participant[],
  groupMatches: readonly ResolvedMatch[],
  advancePerGroup: number,
  tiebreak: PointsTiebreak,
  drawSeed = 1,
): Advancer[] {
  const byId = new Map(participants.map((p) => [p.id, p]));
  const advancers: Advancer[] = [];
  for (const g of groups) {
    const members = g.participantIds
      .map((id) => byId.get(id))
      .filter((p): p is Participant => Boolean(p));
    const groupOwn = groupMatches.filter((m) => m.groupKey === g.groupKey);
    const standings = computeStandings(members, groupOwn, tiebreak, drawSeed);
    standings.slice(0, advancePerGroup).forEach((row, i) => {
      advancers.push({
        participantId: row.participantId,
        groupKey: g.groupKey,
        rankInGroup: i + 1,
        wins: row.wins,
        pointDiff: row.pointDiff,
      });
    });
  }
  return advancers;
}

/**
 * Arrange advancers into a knockout bracket using cross-group pairing so that
 * same-group players don't meet in round 1 (Group A winner vs Group B
 * runner-up, etc.). Byes are awarded to the best group-stage performers.
 *
 * Returns the bracket leaf order (participant id or null for a bye). For the
 * canonical even-group / top-2 case it uses the explicit cross pattern; other
 * shapes fall back to a record-ranked standard seeding (which still gives byes
 * to top performers and puts winners opposite lower finishers).
 */
export function knockoutLeafOrder(advancers: readonly Advancer[]): (string | null)[] {
  const groupKeys = Array.from(new Set(advancers.map((a) => a.groupKey))).sort(
    compareGroupKeys,
  );
  const numGroups = groupKeys.length;
  const maxRank = Math.max(...advancers.map((a) => a.rankInGroup));
  const size = nextPow2(advancers.length);

  // Canonical case: even number of groups, exactly top 2 advance, count is pow2.
  if (numGroups % 2 === 0 && maxRank === 2 && advancers.length === size) {
    const byGroupRank = new Map<string, string>();
    for (const a of advancers) byGroupRank.set(`${a.groupKey}-${a.rankInGroup}`, a.participantId);
    const leaves: (string | null)[] = [];
    for (let p = 0; p < numGroups; p += 2) {
      const X = groupKeys[p] as string;
      const Y = groupKeys[p + 1] as string;
      leaves.push(byGroupRank.get(`${X}-1`) ?? null); // X winner
      leaves.push(byGroupRank.get(`${Y}-2`) ?? null); // Y runner-up
      leaves.push(byGroupRank.get(`${Y}-1`) ?? null); // Y winner
      leaves.push(byGroupRank.get(`${X}-2`) ?? null); // X runner-up
    }
    return leaves;
  }

  // Fallback: global ranking (rank-in-group first, then record), seeded so the
  // best performers get the byes and are spread across the bracket.
  const ranked = advancers
    .slice()
    .sort(
      (a, b) =>
        a.rankInGroup - b.rankInGroup ||
        b.wins - a.wins ||
        b.pointDiff - a.pointDiff,
    )
    .map((a) => a.participantId);

  // Place into standard seed order with byes as the largest seed numbers.
  const order = seedOrder(size); // seed number per leaf
  return order.map((seedNum) => ranked[seedNum - 1] ?? null);
}

/** Build the knockout-stage matches from computed advancers. */
export function generateGroupKnockout(
  advancers: readonly Advancer[],
  startOrder: number,
): GeneratedMatch[] {
  const leaves = knockoutLeafOrder(advancers);
  return generateKnockoutFromLeaves(leaves, { keyPrefix: "KO", startOrder });
}
