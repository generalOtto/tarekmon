// Warps (doors/mats) and the fade transition that plays across a warp. Pure except
// drawFade, the one bit of ctx code — kept here since it's only ever used alongside a warp.
import { warpAt } from './map.js';
import { W, H } from '../engine/canvas.js';

/** Resolve the tile at (x, y) to its warp target, or null if it isn't a D/M warp tile. */
export function resolveWarp(map, x, y) {
  const w = warpAt(map, x, y);
  return w ? { map: w.to, x: w.tx, y: w.ty, facing: w.facing } : null;
}

/** Fade to black and back: `frames` ticks out, one `onDark` callback at full black, then `frames` ticks in. */
export class Fader {
  constructor(frames = 12) {
    this.frames = frames;
    this.active = false;
    this.alpha = 0;
    this.phase = null; // 'out' | 'in' | null
    this.t = 0;
    this.onDark = null;
  }

  start(onDark) {
    this.active = true;
    this.phase = 'out';
    this.t = 0;
    this.alpha = 0;
    this.onDark = onDark;
  }

  update() {
    if (!this.active) return;
    if (this.phase === 'out') {
      this.t++;
      this.alpha = Math.min(1, this.t / this.frames);
      if (this.t >= this.frames) {
        this.onDark?.();
        this.phase = 'in';
        this.t = 0;
      }
    } else if (this.phase === 'in') {
      this.t++;
      this.alpha = Math.max(0, 1 - this.t / this.frames);
      if (this.t >= this.frames) {
        this.active = false;
        this.phase = null;
        this.alpha = 0;
      }
    }
  }
}

/** Draw-only: cover the 160×144 screen with the fade color at the given alpha. */
export function drawFade(ctx, alpha) {
  if (alpha <= 0) return;
  ctx.fillStyle = `rgba(16,16,16,${alpha})`;
  ctx.fillRect(0, 0, W, H);
}
