// Grid-locked player movement. The Player class is pure (no DOM); drawPlayer is the
// only drawing code here and just issues fillRects on whatever context it is given.
import { isWalkable, step } from './map.js';
import { TILE_SIZE } from './tiles.js';
import * as P from './palette.js';

const S = TILE_SIZE;
export const WALK_SPEED = 60;   // px/s → one 16 px tile in 16 ticks at 60 Hz
export const SKATE_SPEED = 120; // skateboard doubles it
const DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const EPS = 1e-6; // 16 × (60 × 1/60) can land a hair under 16 in floating point

export class Player {
  constructor(x, y, facing = 'down') {
    this.x = x; this.y = y; this.facing = facing;
    this.moving = false; this.skating = false;
    this.frame = 0;     // walk cycle 0..3: 0/2 standing, 1/3 stepping (advances every 4 px)
    this.progress = 0;  // px travelled within the current step, 0..16
    this.onArrive = null;
  }

  /** No-op while moving. Otherwise face `dir`, then start a one-tile step if the target is walkable
   *  (or explicitly `allow`ed, e.g. a badge-gated tile) and not `blocked`. */
  tryMove(dir, map, { blocked, allow } = {}) {
    // Guard first: pixelPos() and the arrival in update() read this.facing, so it must not change mid-step.
    if (this.moving) return false;
    this.facing = dir;
    const [nx, ny] = step(this.x, this.y, dir);
    if (!(isWalkable(map, nx, ny) || allow?.(nx, ny)) || blocked?.(nx, ny)) return false;
    this.moving = true; this.progress = 0;
    return true;
  }

  update(dt) {
    if (!this.moving) return;
    this.progress += (this.skating ? SKATE_SPEED : WALK_SPEED) * dt;
    if (this.progress >= S - EPS) {
      [this.x, this.y] = step(this.x, this.y, this.facing);
      this.moving = false; this.progress = 0; this.frame = 0;
      this.onArrive?.(this.x, this.y);
    } else {
      this.frame = Math.floor(this.progress / 4) % 4;
    }
  }

  /** World pixel position (top-left of the sprite), interpolated mid-step. */
  pixelPos() {
    if (!this.moving) return { px: this.x * S, py: this.y * S };
    const [dx, dy] = DELTA[this.facing];
    return { px: this.x * S + dx * this.progress, py: this.y * S + dy * this.progress };
  }
}

/** 16×16 procedural sprite at screen (x, y): blue cap, red shirt, dark pants, legs alternating with `frame`. */
export function drawPlayer(ctx, x, y, facing, frame, skating = false) {
  x = Math.round(x); y = Math.round(y);
  const lift = skating ? 3 : 0;
  const bob = !skating && (frame === 1 || frame === 3) ? 1 : 0; // tiny bounce on stepping frames
  const r = (rx, ry, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x + rx, y + ry - lift + bob, w, h); };
  const side = facing === 'left' || facing === 'right';

  // legs (drawn first so the pants overlap their tops)
  if (skating || frame === 0 || frame === 2) { r(5, 13, 2, 3, P.INK); r(9, 13, 2, 3, P.INK); }
  else if (frame === 1) { r(4, 13, 2, 2, P.INK); r(9, 13, 2, 3, P.INK); }
  else { r(5, 13, 2, 3, P.INK); r(10, 13, 2, 2, P.INK); }
  // body: shirt + arms + pants
  r(4, 9, 8, 4, P.RED);
  if (!side) { r(3, 10, 1, 2, P.SKIN); r(12, 10, 1, 2, P.SKIN); }
  else r(facing === 'left' ? 9 : 6, 10, 1, 2, P.SKIN);
  r(5, 12, 6, 2, P.INK);
  // head
  r(4, 4, 8, 5, P.INK);          // outline / hair
  if (facing !== 'up') r(5, 5, 6, 4, P.SKIN);
  if (facing === 'down') { r(6, 6, 1, 2, P.INK); r(9, 6, 1, 2, P.INK); }
  else if (facing === 'left') r(5, 6, 1, 2, P.INK);
  else if (facing === 'right') r(10, 6, 1, 2, P.INK);
  // cap + brim on the side the player faces
  r(4, 1, 8, 4, P.ROOF_LAB);
  r(6, 1, 4, 1, P.WHITE);        // little logo highlight
  if (facing === 'down') r(4, 4, 8, 1, P.TREE_D);
  else if (facing === 'left') r(2, 4, 4, 1, P.ROOF_LAB);
  else if (facing === 'right') r(10, 4, 4, 1, P.ROOF_LAB);

  if (skating) { // 12×3 board with two wheels, under the lifted feet
    ctx.fillStyle = P.ROOF_RIBS; ctx.fillRect(x + 2, y + 13, 12, 3);
    ctx.fillStyle = P.BLACK; ctx.fillRect(x + 3, y + 15, 2, 1); ctx.fillRect(x + 11, y + 15, 2, 1);
  }
}
