// Skateboard: picking it up/racking it, and how it survives doors, save/load, and battles.
// Pure — no DOM, no audio; OverworldScene applies the sprite flip and loop sfx from the results.
import { rollWeather, todayString } from '../engine/rng.js';

/** Wraps rollWeather for skate.js's callers, so intent here reads "does the board work today"
 *  rather than "roll a die". */
export function weatherToday(dateString = todayString()) { return rollWeather(dateString); }

/** True iff the board is out and not waiting at a door — i.e. the player was actively skating
 *  on an outdoor map right before whatever's asking. */
function isSkatingNow(state) { return !!(state.flags.boardOut && !state.flags.boardParked); }

/** A on the rack: already skating → racks it; otherwise nice weather picks it up, bad weather
 *  just says so (nothing changes — same deterministic-per-day answer as the weather guy). */
export function onRackInteract(state, skating, dateString) {
  if (skating) { state.flags.boardOut = false; return { skating: false, say: 'rack-park' }; }
  if (!weatherToday(dateString)) return { skating: false, say: 'rack-bad' };
  state.flags.boardOut = true;
  return { skating: true, say: 'rack-nice' };
}

/** What OverworldScene.enter() should do with a persisted board: outdoors with it out → ride it
 *  again; indoors → leave it parked (and flag it so, so the next trip outside says rack-back). */
export function shouldAutoSkateOnEnter(state, map) {
  if (!state.flags.boardOut) return false;
  if (map.outdoor) { state.flags.boardParked = false; return true; }
  state.flags.boardParked = true;
  return false;
}

/** What a D/M warp from `fromMap` to `toMap` does to the board: arriving indoors parks it at the
 *  door (skating always off indoors); arriving outdoors with it parked brings it back, with a
 *  line; otherwise the board's state (out and riding, or not out at all) just carries through. */
export function onWarpSkate(state, fromMap, toMap) {
  const { flags } = state;
  if (!toMap.outdoor) {
    if (fromMap.outdoor && isSkatingNow(state)) flags.boardParked = true;
    return { skating: false };
  }
  if (flags.boardParked) { flags.boardParked = false; return { skating: true, say: 'rack-back' }; }
  return { skating: isSkatingNow(state) };
}
