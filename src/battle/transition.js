// Wild-encounter transition: three white flashes, then a diagonal wipe to black.
import { W, H } from '../engine/canvas.js';
import { INK, WHITE } from '../world/palette.js';

const FLASH_ON = 8, FLASH_OFF = 8, FLASHES = 3, WIPE = 24;
const FLASH_TICKS = FLASHES * (FLASH_ON + FLASH_OFF);
const BAND = 8; // the wipe edge advances in 8 px diagonal steps (chunky, not smooth)

export class FlashWipe {
  constructor() {
    this.active = false;
    this.t = 0;
    this.onDone = null;
  }

  /** Starts the sequence; onDone fires once, on the tick the screen is fully black. */
  start(onDone) {
    this.active = true;
    this.t = 0;
    this.onDone = onDone;
  }

  get phase() { return !this.active ? null : this.t < FLASH_TICKS ? 'flash' : 'wipe'; }
  /** True while a white flash is showing. */
  get flashOn() { return this.phase === 'flash' && this.t % (FLASH_ON + FLASH_OFF) < FLASH_ON; }
  /** Wipe progress 0..1. */
  get wipe() { return this.phase === 'wipe' ? (this.t - FLASH_TICKS) / WIPE : 0; }

  update() {
    if (!this.active) return;
    this.t++;
    if (this.t >= FLASH_TICKS + WIPE) {
      this.active = false;
      const cb = this.onDone;
      this.onDone = null;
      cb?.();
    }
  }

  draw(ctx) {
    if (!this.active) return;
    if (this.flashOn) {
      ctx.fillStyle = WHITE;
      ctx.fillRect(0, 0, W, H);
      return;
    }
    if (this.phase !== 'wipe') return;
    // Black triangle growing from the top-left: covers every pixel with x + y < d.
    const d = Math.ceil(((this.t - FLASH_TICKS + 1) / WIPE) * (W + H) / BAND) * BAND;
    ctx.fillStyle = INK;
    for (let y = 0; y < H; y += BAND) {
      const w = Math.min(W, d - y);
      if (w > 0) ctx.fillRect(0, y, w, BAND);
    }
  }
}
