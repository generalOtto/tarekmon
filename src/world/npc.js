// NPC helpers. inLineOfSight / faceToward / flagSet / dialogueFor are pure; drawNpc is the one
// bit of ctx code — 16×16 procedural sprites in the drawPlayer style (legs, body, head, facing eyes).
import * as P from './palette.js';

const DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/** True if (px, py) is 1..trainer.sight tiles straight ahead of the trainer in trainer.facing. */
export function inLineOfSight(trainer, px, py) {
  const [dx, dy] = DELTA[trainer.facing];
  for (let i = 1; i <= trainer.sight; i++) if (trainer.x + dx * i === px && trainer.y + dy * i === py) return true;
  return false;
}

/** The facing that points from the npc toward (px, py) — the dominant axis wins. */
export function faceToward(npc, px, py) {
  const dx = px - npc.x, dy = py - npc.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

/** An npc flag: `badge:X` → state.badges has X; anything else → state.flags[flag] is truthy. */
export function flagSet(state, flag) {
  if (!flag) return false;
  if (flag.startsWith('badge:')) return state.badges.includes(flag.slice(6));
  return !!state.flags[flag];
}

/** Resolve an npc's text. Index 0 = flag unset, 1 = set; applies to an id pair in npc.dialogue
 *  and/or a [unset, set] text pair in dialogue.json. Unknown ids degrade to '...'. */
export function dialogueFor(npc, state, dialogue) {
  const i = flagSet(state, npc.flag) ? 1 : 0;
  const id = Array.isArray(npc.dialogue) ? npc.dialogue[i] : npc.dialogue;
  const v = dialogue[id];
  return (Array.isArray(v) ? v[i] : v) ?? '...';
}

// Per-sprite colors: shirt, pants, hair; `detail` draws the one identifying feature.
const LOOKS = {
  'npc-cap':     { shirt: P.YELLOW, pants: P.INK, hair: P.TRUNK, detail: capDetail(P.RED) },
  'npc-shisha':  { shirt: P.BLACK, pants: P.INK, hair: P.BLACK, detail: shishaDetail },
  'npc-regular': { shirt: P.PURPLE, pants: P.INK, hair: P.TRUNK, slouch: true, detail: regularDetail },
  'npc-officer': { shirt: P.ROOF_LAB, pants: P.INK, hair: P.BLACK, detail: officerDetail },
  'npc-suhaib':  { shirt: P.TREE, pants: P.INK, hair: P.BLACK, detail: suhaibDetail },
  'npc-otto':    { shirt: P.WHITE, pants: P.INK, hair: P.TRUNK, detail: ottoDetail },
  'npc-townie':  { shirt: P.GRASS_D, pants: P.PATH_D, hair: P.TRUNK, detail: () => {} },
  'npc-shop':    { shirt: P.WHITE, pants: P.INK, hair: P.BLACK, detail: shopDetail },
};

/** Draw-only: 16×16 NPC at screen (x, y) by npc.sprite, facing npc.facing. `frame` (a tick
 *  counter) drives a slow idle bob so the room feels alive. Unknown sprites draw as townies. */
export function drawNpc(ctx, npc, x, y, frame = 0) {
  x = Math.round(x); y = Math.round(y);
  const look = LOOKS[npc.sprite] ?? LOOKS['npc-townie'];
  const f = npc.facing ?? 'down';
  const side = f === 'left' || f === 'right';
  const bob = ((frame >> 5) & 1) && !look.slouch ? 1 : 0; // breathe every ~half second
  const sl = look.slouch ? 1 : 0;                          // slouched: head/torso sit a pixel lower
  const r = (rx, ry, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x + rx, y + ry + bob, w, h); };
  const s = { r, f, side, sl };

  r(5, 13, 2, 3, P.INK); r(9, 13, 2, 3, P.INK);                  // legs
  r(4, 9 + sl, 8, 4 - sl, look.shirt);                            // torso
  if (look.shirt === P.WHITE || look.shirt === P.YELLOW) r(4, 9 + sl, 8, 1, P.PATH_D); // shoulder line so light shirts read
  if (!side) { r(3, 10 + sl, 1, 2, P.SKIN); r(12, 10 + sl, 1, 2, P.SKIN); }
  else r(f === 'left' ? 9 : 6, 10 + sl, 1, 2, P.SKIN);
  r(5, 12, 6, 2, look.pants);
  r(4, 3 + sl, 8, 6, look.hair);                                  // head outline / hair
  if (f !== 'up') r(5, 5 + sl, 6, 4, P.SKIN);
  if (f === 'down') { r(6, 6 + sl, 1, 2, P.INK); r(9, 6 + sl, 1, 2, P.INK); }
  else if (f === 'left') r(5, 6 + sl, 1, 2, P.INK);
  else if (f === 'right') r(10, 6 + sl, 1, 2, P.INK);
  look.detail(s);
}

// ── identifying details ────────────────────────────────────────────────────────
function capDetail(color) { // weather guy: red cap with a brim toward the facing
  return ({ r, f }) => {
    r(4, 2, 8, 3, color);
    if (f === 'down') r(4, 4, 8, 1, P.TREE_D);
    else if (f === 'left') r(2, 4, 3, 1, color);
    else if (f === 'right') r(11, 4, 3, 1, color);
  };
}
function shishaDetail({ r, f, side }) { // apron + hose slung over the shoulder
  if (f !== 'up') r(5, 10, 6, 3, P.PAPER);
  const hx = side ? (f === 'left' ? 10 : 5) : 11;
  r(hx, 7, 1, 5, P.PURPLE); r(hx + (f === 'left' ? 1 : -1), 12, 2, 1, P.PURPLE);
}
function regularDetail({ r, f }) { // cup in hand
  if (f === 'up') return;
  const cx = f === 'left' ? 2 : 12;
  r(cx, 10, 2, 3, P.PAPER); r(cx, 10, 2, 1, P.TRUNK);
}
function officerDetail({ r, f }) { // blue peaked cap + gold badge
  r(4, 2, 8, 2, P.ROOF_LAB); r(4, 4, 8, 1, P.BLACK);
  if (f !== 'up') r(f === 'right' ? 9 : 5, 10, 2, 2, P.YELLOW);
}
function suhaibDetail({ r, f, side }) { // backpack straps/pack + suitcase at his side
  if (f === 'up') r(5, 9, 6, 4, P.TRUNK);
  else if (side) r(f === 'left' ? 11 : 3, 9, 2, 4, P.TRUNK);
  else { r(5, 9, 1, 3, P.TRUNK); r(10, 9, 1, 3, P.TRUNK); }
  const sx = f === 'left' ? 1 : 13;
  r(sx, 10, 3, 5, P.ROOF_RIBS); r(sx + 1, 9, 1, 1, P.BLACK);
}
function ottoDetail({ r, f }) { // lab coat tails + beard
  r(3, 12, 2, 2, P.WHITE); r(11, 12, 2, 2, P.WHITE);
  if (f !== 'up') r(f === 'left' ? 5 : f === 'right' ? 7 : 6, 8, 4, 2, P.TRUNK);
}
function shopDetail({ r, f }) { // red apron
  if (f !== 'up') r(5, 10, 6, 4, P.RED);
  else r(4, 10, 8, 1, P.RED);
}
