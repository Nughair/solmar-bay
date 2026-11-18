// Deterministic random helpers: one seeded generator builds the whole city, so every
// visit (and every screenshot) sees the same Solmar Bay.

/** A mulberry32 generator: tiny, fast, and stable across browsers. */
export function makeRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Float in [min, max) from a generator. */
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

/** Integer in [min, max] inclusive from a generator. */
export function intRange(rng, min, max) {
  return Math.floor(range(rng, min, max + 1));
}

/** One element of a non-empty array, chosen by a generator. */
export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

/** True with probability p. */
export function chance(rng, p) {
  return rng() < p;
}
