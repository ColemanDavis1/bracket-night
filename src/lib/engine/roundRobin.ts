import type { GeneratedMatch, Participant } from "./types";

/**
 * Full round-robin schedule (everyone plays everyone once, or twice for a
 * double round robin). Uses the circle method so each round is a clean set of
 * simultaneous-ish pairings with a rotating bye for odd counts.
 *
 * @param keyPrefix lets group play reuse this generator with namespaced keys.
 */
export function generateRoundRobin(
  participants: readonly Participant[],
  opts: {
    double?: boolean;
    keyPrefix?: string;
    stage?: "round_robin" | "group";
    groupKey?: string;
    labelPrefix?: string;
    startOrder?: number;
  } = {},
): GeneratedMatch[] {
  const {
    double = false,
    keyPrefix = "RR",
    stage = "round_robin",
    groupKey,
    labelPrefix = "Round",
    startOrder = 0,
  } = opts;

  const ids: (string | null)[] = participants.map((p) => p.id);
  if (ids.length % 2 === 1) ids.push(null);
  const n = ids.length;
  const roundsPerCycle = n - 1;
  const cycles = double ? 2 : 1;

  const matches: GeneratedMatch[] = [];
  const arr = ids.slice();
  let order = startOrder;
  let roundNumber = 0;

  for (let c = 0; c < cycles; c++) {
    // Reset rotation each cycle so the second cycle mirrors the first.
    arr.splice(0, arr.length, ...ids);
    for (let r = 0; r < roundsPerCycle; r++) {
      roundNumber++;
      for (let i = 0; i < n / 2; i++) {
        let a = arr[i];
        let b = arr[n - 1 - i];
        if (a == null || b == null) continue;
        // Alternate home/away on the second cycle for fairness of scoring.
        if (c === 1) [a, b] = [b, a];
        matches.push({
          key: `${keyPrefix}-${roundNumber}-${i + 1}`,
          stage,
          roundNumber,
          order: order++,
          label: groupKey
            ? `Group ${groupKey} · ${labelPrefix} ${roundNumber}`
            : `${labelPrefix} ${roundNumber}`,
          groupKey,
          aRef: { kind: "participant", id: a },
          bRef: { kind: "participant", id: b },
          allowDraw: true,
        });
      }
      const fixed = arr[0] as string | null;
      const rest = arr.slice(1);
      rest.unshift(rest.pop() as string | null);
      arr.splice(0, arr.length, fixed, ...rest);
    }
  }
  return matches;
}
