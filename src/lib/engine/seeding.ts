import type { GeneratedMatch, Participant } from "./types";
import { makeRng, shuffle } from "./rng";

/** Smallest power of two >= n (min 1). */
export function nextPow2(n: number): number {
  if (n <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(n));
}

/**
 * Classic bracket seed order for a bracket of `size` (a power of two).
 *
 * Returns the seed number that belongs at each leaf position so that seed 1 and
 * seed 2 can only meet in the final, the best seeds are spread across the
 * bracket, and high seeds are paired against the highest seed numbers (which
 * become byes when there are fewer participants than slots).
 *
 * e.g. size 8 -> [1,8,4,5,2,7,3,6] -> pairs (1v8)(4v5)(2v7)(3v6).
 */
export function seedOrder(size: number): number[] {
  if (size < 1 || (size & (size - 1)) !== 0) {
    throw new Error(`seedOrder size must be a power of two, got ${size}`);
  }
  let order = [1, 2];
  while (order.length < size) {
    const sum = order.length * 2 + 1;
    const expanded: number[] = [];
    for (const s of order) {
      expanded.push(s);
      expanded.push(sum - s);
    }
    order = expanded;
  }
  return order;
}

/** Assign random seeds (1..N) to participants, deterministic given the seed. */
export function randomSeeds(
  participants: readonly Participant[],
  drawSeed: number,
): Participant[] {
  const rng = makeRng(drawSeed);
  const shuffled = shuffle(participants, rng);
  return shuffled.map((p, i) => ({ ...p, seed: i + 1 }));
}

/** Apply a manual seed ordering (array of participant ids, best first). */
export function manualSeeds(
  participants: readonly Participant[],
  orderedIds: readonly string[],
): Participant[] {
  const byId = new Map(participants.map((p) => [p.id, p]));
  const seeded: Participant[] = [];
  orderedIds.forEach((id, i) => {
    const p = byId.get(id);
    if (p) {
      seeded.push({ ...p, seed: i + 1 });
      byId.delete(id);
    }
  });
  // Any participant not present in the ordering is appended after, keeping order.
  let next = seeded.length + 1;
  for (const p of participants) {
    if (byId.has(p.id)) {
      seeded.push({ ...p, seed: next++ });
    }
  }
  return seeded;
}

/**
 * Build a randomized, round-robin-style seeding schedule.
 *
 * Uses the circle method so each player faces a *different* opponent each round
 * where possible. Odd player counts get a rotating, non-penalizing bye (no
 * match is created for the bye, so it never counts as a win or a loss).
 *
 * @param rounds number of seeding rounds, or "full" for a complete round robin.
 */
export function generateSeedingSchedule(
  participants: readonly Participant[],
  rounds: number | "full",
  drawSeed: number,
): GeneratedMatch[] {
  const rng = makeRng(drawSeed);
  const players = shuffle(participants, rng);
  const ids: (string | null)[] = players.map((p) => p.id);
  if (ids.length % 2 === 1) ids.push(null); // null = bye marker

  const n = ids.length;
  const totalRounds = n - 1; // full round robin length
  const wanted = rounds === "full" ? totalRounds : Math.min(rounds, totalRounds);

  const matches: GeneratedMatch[] = [];
  // Circle method: fix index 0, rotate the rest each round.
  const arr = ids.slice();
  let order = 0;
  for (let r = 0; r < wanted; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a == null || b == null) continue; // bye this round
      matches.push({
        key: `SR-${r + 1}-${i + 1}`,
        stage: "seeding",
        roundNumber: r + 1,
        order: order++,
        label: `Seeding Round ${r + 1}`,
        aRef: { kind: "participant", id: a },
        bRef: { kind: "participant", id: b },
        allowDraw: true,
      });
    }
    // rotate: keep arr[0], move arr[1] to end
    const fixed = arr[0] as string | null;
    const rest = arr.slice(1);
    rest.unshift(rest.pop() as string | null);
    arr.splice(0, arr.length, fixed, ...rest);
  }
  return matches;
}
