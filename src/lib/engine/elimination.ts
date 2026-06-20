import type { GeneratedMatch, SlotRef } from "./types";
import { nextPow2, seedOrder } from "./seeding";

function seedOrByeRef(seed: number, count: number): SlotRef {
  return seed <= count ? { kind: "seed", seed } : { kind: "bye" };
}

/**
 * Single-elimination bracket for `count` seeds.
 *
 * Pads to the next power of two with byes; byes always fall to the **top
 * seeds** (because the classic seed order pairs strong seeds against the
 * largest seed numbers, which are the empty slots). Byes are emitted as real
 * matches with one empty side so the UI can show them explicitly.
 */
export function generateSingleElimination(
  count: number,
  opts: { keyPrefix?: string; startOrder?: number; labelPrefix?: string } = {},
): GeneratedMatch[] {
  const { keyPrefix = "M", startOrder = 0, labelPrefix = "Round" } = opts;
  if (count < 2) return [];
  const size = nextPow2(count);
  const order = seedOrder(size);
  const totalRounds = Math.log2(size);

  const matches: GeneratedMatch[] = [];
  let ord = startOrder;

  // Round 1 from seed pairs.
  const round1: GeneratedMatch[] = [];
  for (let i = 0; i < size / 2; i++) {
    const sA = order[2 * i] as number;
    const sB = order[2 * i + 1] as number;
    round1.push({
      key: `${keyPrefix}-1-${i + 1}`,
      stage: "knockout",
      roundNumber: 1,
      order: ord++,
      label: roundLabel(labelPrefix, 1, totalRounds),
      aRef: seedOrByeRef(sA, count),
      bRef: seedOrByeRef(sB, count),
      allowDraw: false,
    });
  }
  matches.push(...round1);

  // Later rounds reference the winners of the previous round.
  let prev = round1;
  for (let r = 2; r <= totalRounds; r++) {
    const cur: GeneratedMatch[] = [];
    for (let i = 0; i < prev.length / 2; i++) {
      cur.push({
        key: `${keyPrefix}-${r}-${i + 1}`,
        stage: "knockout",
        roundNumber: r,
        order: ord++,
        label: roundLabel(labelPrefix, r, totalRounds),
        aRef: { kind: "winner", matchKey: (prev[2 * i] as GeneratedMatch).key },
        bRef: { kind: "winner", matchKey: (prev[2 * i + 1] as GeneratedMatch).key },
        allowDraw: false,
      });
    }
    matches.push(...cur);
    prev = cur;
  }
  return matches;
}

function roundLabel(prefix: string, round: number, total: number): string {
  const fromEnd = total - round;
  if (fromEnd === 0) return `${prefix === "Round" ? "" : prefix + " "}Final`.trim();
  if (fromEnd === 1) return "Semifinals";
  if (fromEnd === 2) return "Quarterfinals";
  return `${prefix} ${round}`;
}

/**
 * Single-elimination bracket built from an explicit leaf ordering (participant
 * ids, or null for a bye). Used by the group stage, which arranges leaves so
 * that round 1 is cross-group (group winner vs another group's runner-up).
 * `leaves.length` must be a power of two.
 */
export function generateKnockoutFromLeaves(
  leaves: readonly (string | null)[],
  opts: { keyPrefix?: string; startOrder?: number } = {},
): GeneratedMatch[] {
  const { keyPrefix = "KO", startOrder = 0 } = opts;
  const size = leaves.length;
  if (size < 2 || (size & (size - 1)) !== 0) {
    throw new Error(`knockout leaves must be a power of two, got ${size}`);
  }
  const totalRounds = Math.log2(size);
  const matches: GeneratedMatch[] = [];
  let ord = startOrder;

  const leafRef = (id: string | null): SlotRef =>
    id === null ? { kind: "bye" } : { kind: "participant", id };

  const round1: GeneratedMatch[] = [];
  for (let i = 0; i < size / 2; i++) {
    round1.push({
      key: `${keyPrefix}-1-${i + 1}`,
      stage: "knockout",
      roundNumber: 1,
      order: ord++,
      label: roundLabel("Knockout", 1, totalRounds),
      aRef: leafRef(leaves[2 * i] ?? null),
      bRef: leafRef(leaves[2 * i + 1] ?? null),
      allowDraw: false,
    });
  }
  matches.push(...round1);

  let prev = round1;
  for (let r = 2; r <= totalRounds; r++) {
    const cur: GeneratedMatch[] = [];
    for (let i = 0; i < prev.length / 2; i++) {
      cur.push({
        key: `${keyPrefix}-${r}-${i + 1}`,
        stage: "knockout",
        roundNumber: r,
        order: ord++,
        label: roundLabel("Knockout", r, totalRounds),
        aRef: { kind: "winner", matchKey: (prev[2 * i] as GeneratedMatch).key },
        bRef: { kind: "winner", matchKey: (prev[2 * i + 1] as GeneratedMatch).key },
        allowDraw: false,
      });
    }
    matches.push(...cur);
    prev = cur;
  }
  return matches;
}

/**
 * Double-elimination bracket for `count` seeds.
 *
 * Structure: a standard winners bracket (WB), a losers bracket (LB) fed by WB
 * dropdowns, and a grand final. The LB alternates "major" rounds (an LB
 * survivor meets a fresh WB dropout) with "minor" rounds (LB survivors play
 * each other). The grand final is bracket-reset aware: GF-2 only matters if the
 * LB champion beats the WB champion in GF-1 (resolved at runtime).
 *
 * Note: dropout *placement* uses a simple index mapping rather than the more
 * elaborate anti-rematch crossing used by some bracketing software. Elimination
 * correctness (out after exactly two losses, single champion) holds regardless;
 * the simplification only affects how soon a WB/LB rematch can occur.
 */
export function generateDoubleElimination(count: number): GeneratedMatch[] {
  if (count < 2) return [];
  const size = nextPow2(count);
  const k = Math.log2(size);

  const matches: GeneratedMatch[] = [];
  let ord = 0;

  // --- Winners bracket ---
  const wbRounds: GeneratedMatch[][] = [];
  const order = seedOrder(size);
  const wb1: GeneratedMatch[] = [];
  for (let i = 0; i < size / 2; i++) {
    const sA = order[2 * i] as number;
    const sB = order[2 * i + 1] as number;
    wb1.push({
      key: `WB-1-${i + 1}`,
      stage: "winners",
      roundNumber: 1,
      order: ord++,
      label: "Winners Round 1",
      aRef: seedOrByeRef(sA, count),
      bRef: seedOrByeRef(sB, count),
      allowDraw: false,
    });
  }
  wbRounds.push(wb1);
  matches.push(...wb1);

  let prev = wb1;
  for (let r = 2; r <= k; r++) {
    const cur: GeneratedMatch[] = [];
    for (let i = 0; i < prev.length / 2; i++) {
      cur.push({
        key: `WB-${r}-${i + 1}`,
        stage: "winners",
        roundNumber: r,
        order: ord++,
        label: r === k ? "Winners Final" : `Winners Round ${r}`,
        aRef: { kind: "winner", matchKey: (prev[2 * i] as GeneratedMatch).key },
        bRef: { kind: "winner", matchKey: (prev[2 * i + 1] as GeneratedMatch).key },
        allowDraw: false,
      });
    }
    wbRounds.push(cur);
    matches.push(...cur);
    prev = cur;
  }

  // --- Losers bracket ---
  let lbRound = 0;
  let survivors: GeneratedMatch[] = [];

  // Initial LB round: pair the losers of WB round 1.
  lbRound++;
  const lbInit: GeneratedMatch[] = [];
  for (let i = 0; i < wb1.length / 2; i++) {
    lbInit.push({
      key: `LB-${lbRound}-${i + 1}`,
      stage: "losers",
      roundNumber: lbRound,
      order: ord++,
      label: `Losers Round ${lbRound}`,
      aRef: { kind: "loser", matchKey: (wb1[2 * i] as GeneratedMatch).key },
      bRef: { kind: "loser", matchKey: (wb1[2 * i + 1] as GeneratedMatch).key },
      allowDraw: false,
    });
  }
  matches.push(...lbInit);
  survivors = lbInit;

  // For each subsequent WB round, a "major" round drops the WB losers in, then
  // a "minor" round consolidates the LB survivors (skipped when only one left).
  for (let m = 2; m <= k; m++) {
    const wbLosers = wbRounds[m - 1] as GeneratedMatch[];
    lbRound++;
    const major: GeneratedMatch[] = [];
    for (let i = 0; i < wbLosers.length; i++) {
      major.push({
        key: `LB-${lbRound}-${i + 1}`,
        stage: "losers",
        roundNumber: lbRound,
        order: ord++,
        label: `Losers Round ${lbRound}`,
        aRef: { kind: "winner", matchKey: (survivors[i] as GeneratedMatch).key },
        bRef: { kind: "loser", matchKey: (wbLosers[i] as GeneratedMatch).key },
        allowDraw: false,
      });
    }
    matches.push(...major);
    survivors = major;

    if (survivors.length > 1) {
      lbRound++;
      const minor: GeneratedMatch[] = [];
      for (let i = 0; i < survivors.length / 2; i++) {
        minor.push({
          key: `LB-${lbRound}-${i + 1}`,
          stage: "losers",
          roundNumber: lbRound,
          order: ord++,
          label: `Losers Round ${lbRound}`,
          aRef: { kind: "winner", matchKey: (survivors[2 * i] as GeneratedMatch).key },
          bRef: {
            kind: "winner",
            matchKey: (survivors[2 * i + 1] as GeneratedMatch).key,
          },
          allowDraw: false,
        });
      }
      matches.push(...minor);
      survivors = minor;
    }
  }

  const wbFinal = (wbRounds[k - 1] as GeneratedMatch[])[0] as GeneratedMatch;
  const lbChampMatch = survivors[0] as GeneratedMatch;

  // --- Grand final (with conditional reset) ---
  matches.push({
    key: "GF-1",
    stage: "grand_final",
    roundNumber: 1,
    order: ord++,
    label: "Grand Final",
    aRef: { kind: "winner", matchKey: wbFinal.key },
    bRef: { kind: "winner", matchKey: lbChampMatch.key },
    allowDraw: false,
  });
  matches.push({
    key: "GF-2",
    stage: "grand_final",
    roundNumber: 2,
    order: ord++,
    label: "Grand Final (Reset)",
    // Resolved only if the LB champion wins GF-1 (handled in the resolver).
    aRef: { kind: "winner", matchKey: "GF-1" },
    bRef: { kind: "loser", matchKey: "GF-1" },
    allowDraw: false,
  });

  return matches;
}
