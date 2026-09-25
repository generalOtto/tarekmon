// Wild encounter rolls: pure dice logic over a zone's rate + species table. No DOM, no game state.
import { defaultRng, randInt, pickWeighted } from '../engine/rng.js';

/**
 * Rolls a wild encounter for a zone. rng consumption order: rate roll, weighted species pick, level.
 * @param {{rate:number, table:{species:string,min:number,max:number,weight:number}[]}} zone
 * @param {() => number} rng
 * @param {number} rateMult  Multiplies the zone's rate (e.g. 0.5 while skating).
 * @returns {{species:string, level:number}|null}
 */
export function rollEncounter(zone, rng = defaultRng, rateMult = 1) {
  if (rng() >= zone.rate * rateMult) return null;
  const pick = pickWeighted(rng, zone.table);
  return { species: pick.species, level: randInt(rng, pick.min, pick.max) };
}
