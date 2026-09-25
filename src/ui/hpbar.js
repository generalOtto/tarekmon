// HP bar: pure color/tween logic plus a tiny pixel-art draw.
import { INK, HP_GREEN, HP_YELLOW, HP_RED, HP_TRACK } from '../world/palette.js';

/** Gen-1 HP colors: green above half, yellow above a fifth, red below. */
export function hpColor(ratio) {
  if (ratio > 0.5) return HP_GREEN;
  if (ratio > 0.2) return HP_YELLOW;
  return HP_RED;
}

/** Ink outline (1 px, outside the bar), dark track, then the colored fill — min 1 px while ratio > 0. */
export function drawHpBar(ctx, x, y, w, h, ratio) {
  const r = Math.max(0, Math.min(1, ratio));
  ctx.fillStyle = INK;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = HP_TRACK;
  ctx.fillRect(x, y, w, h);
  const fill = r > 0 ? Math.max(1, Math.round(w * r)) : 0;
  if (fill > 0) {
    ctx.fillStyle = hpColor(r);
    ctx.fillRect(x, y, fill, h);
  }
}

/** Linear tween from → to over `frames` update() calls. */
export class Tween {
  constructor(from, to, frames) {
    Object.assign(this, { from, to, frames });
    this.t = 0;
    this.value = frames > 0 ? from : to;
  }

  get done() { return this.t >= this.frames; }

  update() {
    if (this.done) return;
    this.t++;
    this.value = this.done ? this.to : this.from + (this.to - this.from) * (this.t / this.frames);
  }
}
