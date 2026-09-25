// Pure camera math: where the 160×144 screen sits over a map, in pixels.
import { TILE_SIZE } from './tiles.js';
import { W, H } from '../engine/canvas.js';

const S = TILE_SIZE;
// The player's pixel position lands at screen (72, 64): tile column 4.5, row 4.
const ANCHOR_X = W / 2 - S / 2, ANCHOR_Y = H / 2 - S / 2;

function axis(p, anchor, mapPx, screenPx) {
  if (mapPx <= screenPx) return -(screenPx - mapPx) / 2; // smaller than the screen: center it
  return Math.min(Math.max(Math.round(p) - anchor, 0), mapPx - screenPx);
}

/** Screen offset `{ ox, oy }` (world px at screen 0,0) centering the player, clamped to the map. */
export function cameraFor({ px, py }, map) {
  return { ox: axis(px, ANCHOR_X, map.width * S, W), oy: axis(py, ANCHOR_Y, map.height * S, H) };
}
