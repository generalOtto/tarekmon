// A cursor-driven list menu: pure move/select/cancel logic, plus a textbox-styled draw().
import { drawText, LINE_H } from '../engine/font.js';
import { PAPER, INK } from './textbox.js';

const REPEAT_DELAY = 12; // ticks before the first auto-repeat while a direction is held
const REPEAT_RATE = 6;   // ticks between subsequent auto-repeats

/** Cursor state over a flat list of items, optionally arranged in a grid of `cols` columns. */
export class Menu {
  constructor(items, { cols = 1 } = {}) {
    this.items = items;
    this.cols = cols;
    this.index = 0;
    this._heldDir = null;
    this._heldTicks = 0;
    this._repeating = false;
  }

  /** Moves the cursor one step in `dir`, wrapping. With cols > 1, left/right move within a row and up/down by a row. */
  move(dir) {
    const n = this.items.length;
    if (n === 0) return;
    const cols = this.cols;
    if (cols <= 1) {
      if (dir === 'down') this.index = (this.index + 1) % n;
      else if (dir === 'up') this.index = (this.index - 1 + n) % n;
      return;
    }
    const row = Math.floor(this.index / cols), col = this.index % cols;
    const rows = Math.ceil(n / cols);
    if (dir === 'left') this.index = row * cols + (col - 1 + cols) % cols;
    else if (dir === 'right') this.index = row * cols + (col + 1) % cols;
    else if (dir === 'up') this.index = ((row - 1 + rows) % rows) * cols + col;
    else if (dir === 'down') this.index = ((row + 1) % rows) * cols + col;
    if (this.index >= n) this.index = n - 1;
  }

  selected() { return this.items[this.index]; }

  /** Reads input for one tick: moves the cursor (with initial-delay/repeat while held), and fires onSelect/onCancel. */
  handle(input, { onSelect, onCancel } = {}) {
    const dir = input.pressedDirection();
    if (dir) {
      // A fresh press (or rolling onto a different direction) moves immediately and starts the delay window.
      if (input.justPressed(dir) || dir !== this._heldDir) {
        this.move(dir);
        this._heldDir = dir;
        this._heldTicks = 0;
        this._repeating = false;
      } else {
        this._heldTicks++;
        const threshold = this._repeating ? REPEAT_RATE : REPEAT_DELAY;
        if (this._heldTicks >= threshold) {
          this.move(dir);
          this._heldTicks = 1;
          this._repeating = true;
        }
      }
    } else {
      this._heldDir = null;
      this._heldTicks = 0;
      this._repeating = false;
    }

    if (input.justPressed('a')) onSelect?.(this.selected(), this.index);
    else if (input.justPressed('b')) onCancel?.();
  }

  /** Draws a paper box with an ink border at (x, y, w), items in the pixel font with a ▶ cursor; scrolls if needed. */
  draw(ctx, x, y, w, { rows = this.items.length } = {}) {
    const rowH = LINE_H * 2; // 16px per row, matching the textbox
    const pad = 8;
    const h = pad * 2 + rows * rowH;

    ctx.fillStyle = PAPER;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = INK;
    ctx.fillRect(x, y, w, 2);
    ctx.fillRect(x, y + h - 2, w, 2);
    ctx.fillRect(x, y, 2, h);
    ctx.fillRect(x + w - 2, y, 2, h);

    let scroll = 0;
    if (this.items.length > rows) {
      const maxScroll = this.items.length - rows;
      scroll = Math.min(maxScroll, Math.max(0, this.index - Math.floor(rows / 2)));
    }

    for (let r = 0; r < rows; r++) {
      const i = r + scroll;
      if (i >= this.items.length) break;
      const ry = y + pad + r * rowH;
      if (i === this.index) drawText(ctx, '▶', x + pad, ry, INK);
      drawText(ctx, String(this.items[i]), x + pad + 12, ry, INK);
    }
  }
}
