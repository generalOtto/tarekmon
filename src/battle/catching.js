import { defaultRng } from '../engine/rng.js';

/** Gen 1 style catch probability, bounded to [0.05, 1]. */
export function catchChance(monster, catchRate) {
  const p = ((3 * monster.maxHp - 2 * monster.hp) * catchRate / (3 * monster.maxHp)) / 255;
  return Math.min(1, Math.max(0.05, p));
}

/** Rolls a catch attempt. Success always wobbles 3 times; failure wobbles 0-2 times scaled by chance. */
export function throwBall(monster, catchRate, rng = defaultRng) {
  const p = catchChance(monster, catchRate), success = rng() < p;
  return { success, wobbles: success ? 3 : Math.min(2, Math.floor(p * 4)) };
}
