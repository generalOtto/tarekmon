/** Gen 1 style stats, medium-fast XP curve, and battle stat stages. */

/** Level cap; addXp never levels a monster past this. */
export const MAX_LEVEL = 50;

/** Clamps a stat stage to the legal [-3, 3] range. */
export const clampStage = s => Math.max(-3, Math.min(3, s));

/** Computes hp/atk/def/spd for a species at a given level (no IVs/EVs). */
export function computeStats(species, level) {
  const b = species.base;
  const st = k => Math.floor(b[k] * 2 * level / 100) + 5;
  return { hp: Math.floor(b.hp * 2 * level / 100) + level + 10, atk: st('atk'), def: st('def'), spd: st('spd') };
}

/** Medium-fast XP curve: xp required for a level is level^3. */
export const xpForLevel = level => level ** 3;

/** Inverts xpForLevel: the highest level whose xp requirement is met, capped at MAX_LEVEL. */
export function levelForXp(xp) {
  let l = 1;
  while (l < MAX_LEVEL && xpForLevel(l + 1) <= xp) l++;
  return l;
}

/** Global XP multiplier. Otto (2026-09-26): "increase the exp earned by a lot, I want it to be easier." */
export const XP_MULT = 3;
/** XP awarded for defeating a species at foeLevel: Gen 1 base (yield*level/7) × XP_MULT, and ×3 again for trainer battles. */
export function xpGain(species, foeLevel, isTrainer) {
  const base = Math.floor(species.xpYield * foeLevel / 7) * XP_MULT;
  return isTrainer ? Math.floor(base * 3) : base;
}

/** Multiplier applied to atk/def/spd for a given stat stage. */
export function stageMult(stage) {
  stage = clampStage(stage);
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

/** Multiplier applied to accuracy for a given accuracy stage. */
export function accMult(stage) {
  stage = clampStage(stage);
  return stage >= 0 ? 1 : 0.75 ** -stage;
}
