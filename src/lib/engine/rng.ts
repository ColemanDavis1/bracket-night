/**
 * Deterministic, seedable PRNG (mulberry32).
 *
 * Tournament draws (random seeding, group draws, randomized seeding-round
 * schedules) must be reproducible: given the same seed we always produce the
 * same draw. That makes the engine unit-testable and lets the app persist a
 * single integer "draw seed" to recreate a tournament's randomness on demand.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle returning a new array. Pure given the rng. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/** Generate a fresh random 32-bit seed (used when creating a tournament). */
export function newSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
