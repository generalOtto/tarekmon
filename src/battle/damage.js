import { typeMultiplier } from './types.js';
import { stageMult, accMult } from './stats.js';
import { defaultRng } from '../engine/rng.js';

/** Gen 1 damage. rng is consumed as [critRoll, randomRoll] (only when power > 0). */
export function calcDamage({ attacker, attackerSpecies, defender, defenderSpecies, move, types, rng = defaultRng }) {
  if (!move.power) return { damage: 0, crit: false, typeMult: 1 };
  // Gen 1 crit rate: base speed / 512 (~20% at spd 105). Intentional, not a bug.
  const crit = rng() < attacker.stats.spd / 512;
  const L = crit ? attacker.level * 2 : attacker.level;
  const A = attacker.stats.atk * stageMult(attacker.stages.atk);
  const D = Math.max(1, defender.stats.def * stageMult(defender.stages.def));
  const base = Math.floor(Math.floor(Math.floor(2 * L / 5 + 2) * move.power * A / D) / 50) + 2;
  const stab = move.type && move.type === attackerSpecies.type ? 1.5 : 1;
  const typeMult = typeMultiplier(move.type, defenderSpecies.type, types);
  const rand = (217 + Math.floor(rng() * 39)) / 255;
  const damage = Math.max(1, Math.floor(base * stab * typeMult * rand));
  return { damage, crit, typeMult };
}

/** Convention: `accDown` lowers the TARGET's stages.acc; when that monster attacks, its own stages.acc reduces its hit chance. */
export function hitCheck(move, attacker, rng = defaultRng) {
  if (move.effect?.kind === 'neverMiss') return true;
  return rng() < (move.accuracy / 100) * accMult(attacker.stages.acc);
}
