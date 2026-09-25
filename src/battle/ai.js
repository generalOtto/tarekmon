import { typeMultiplier } from './types.js';
import { defaultRng } from '../engine/rng.js';

/** Fallback move used when a monster has no PP left on any move. */
export const STRUGGLE = { id: 'struggle', name: 'Struggle', type: null, power: 20, accuracy: 100, pp: 1, effect: { kind: 'none' }, text: '{user} has nothing left and flails!' };

/**
 * Picks the foe's move for this turn: an index into foe.moves, or 'struggle'
 * when nothing has PP left. Scores usable moves by expected damage (attacking
 * moves) or a flat 5 (status moves), and 25% of the time picks uniformly among
 * usable moves instead of the best-scoring one.
 */
export function chooseFoeMove(foe, foeSpecies, playerSpecies, movesDb, types, rng = defaultRng) {
  const usable = [];
  foe.moves.forEach((slot, i) => { if (slot.pp > 0) usable.push(i); });
  if (usable.length === 0) return 'struggle';

  const random = rng() < 0.25;
  if (random) {
    return usable[Math.floor(rng() * usable.length)];
  }

  let bestIndex = -1, bestScore = -Infinity;
  for (const i of usable) {
    const move = movesDb[foe.moves[i].id];
    const score = move.power > 0
      ? move.power * typeMultiplier(move.type, playerSpecies.type, types) * (move.accuracy / 100)
      : 5;
    if (score > bestScore) { bestScore = score; bestIndex = i; }
  }
  return bestIndex;
}
