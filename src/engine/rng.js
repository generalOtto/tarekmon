/**
 * Seeded RNG utilities.
 *
 * Every game function that rolls dice takes an `rng` argument (a function
 * returning a float in [0, 1)) defaulting to `defaultRng`, so tests can pass
 * seeded rngs and get deterministic results.
 */

/** mulberry32: fast, small, deterministic PRNG. Returns a () => [0,1) generator. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const defaultRng = mulberry32((Date.now() ^ 0x9E3779B9) >>> 0);

/** Stable 32-bit FNV-1a hash of a date string, used to seed per-day rolls. */
export function dateSeed(dateString) {
  let h = 2166136261;
  for (const c of dateString) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function todayString(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Nice weather 60% of calendar days, deterministic per day. */
export function rollWeather(dateString = todayString()) { return mulberry32(dateSeed(dateString))() < 0.6; }

export function randInt(rng, min, max) { return min + Math.floor(rng() * (max - min + 1)); }

export function chance(rng, p) { return rng() < p; }

// Empty list or all-zero weights fall through to the last item; callers guard.
export function pickWeighted(rng, items) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const i of items) { r -= i.weight; if (r < 0) return i; }
  return items[items.length - 1];
}
