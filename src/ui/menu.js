// A cursor-driven list menu: pure move/select/cancel logic, plus a textbox-styled draw().
import { drawText, LINE_H } from '../engine/font.js';
import { INK } from '../world/palette.js';
import { paperBox } from './box.js';

const REPEAT_DELAY = 12; // ticks before the first auto-repeat while a direction is held
const REPEAT_RATE = 6;   // ticks between subsequent auto-repeats

/** Cursor state over a flat list of items, optionally arranged in a grid of `cols` columns. */
export class Menu {
  /** Shared sound hook for every menu (set once by main.js): a select blip on cursor moves and A. */
  static audio = null;

  constructor(items, { cols = 1, audio = null } = {}) {
    this.items = items;
    this.cols = cols;
    this.audio = audio; // per-menu override of Menu.audio
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
    const audio = this.audio ?? Menu.audio, from = this.index;
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

    if (this.index !== from) audio?.playSfx('select');

    if (input.justPressed('a')) { audio?.playSfx('select'); onSelect?.(this.selected(), this.index); }
    else if (input.justPressed('b')) onCancel?.();
  }

  /** Draws a paper box with an ink border at (x, y, w), items in the pixel font with a ▶ cursor; scrolls if needed. */
  draw(ctx, x, y, w, { rows = this.items.length } = {}) {
    const rowH = LINE_H * 2; // 16px per row, matching the textbox
    const pad = 8;
    const h = pad * 2 + rows * rowH;

    paperBox(ctx, x, y, w, h);

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

/** A YES/NO question: types `text` into the shared textbox and, once its last page is revealed,
 *  pops a YES/NO menu above it (Gen-1 style, no extra A). ask() resolves true for YES; NO and B
 *  resolve false. The owner routes input to update() while `active` and calls draw() after the textbox. */
export class YesNo {
  constructor(textbox) { this.textbox = textbox; this.menu = null; this._resolve = null; }
  get active() { return !!this._resolve; }
  get showing() { return this.active && this.textbox.pageRevealed && this.textbox.onLastPage; }

  ask(text) {
    return new Promise(resolve => {
      this._resolve = resolve;
      this.menu = new Menu(['YES', 'NO']);
      this.textbox.say(text);
    });
  }

  update(input) {
    if (!this.active) return;
    if (!this.showing) { this.textbox.update(input); return; }
    this.menu.handle(input, { onSelect: label => this._answer(label === 'YES'), onCancel: () => this._answer(false) });
  }

  _answer(yes) {
    const resolve = this._resolve;
    this._resolve = null; this.menu = null;
    this.textbox.dismiss();
    resolve(yes);
  }

  draw(ctx) { if (this.showing) this.menu.draw(ctx, 160 - 56, 96 - 48, 56); }
}
