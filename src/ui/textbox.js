import { drawText, LINE_H } from '../engine/font.js';
import { W } from '../engine/canvas.js';
import { paperBox } from './box.js';

export const PAPER = '#f8f8f0';
export const INK = '#0f380f';

/** Greedily word-wraps a single logical line to `cols` columns, hard-splitting words too long to fit. */
function wrapWords(str, cols) {
  const words = str.split(' ').filter(w => w.length > 0);
  const lines = [];
  let cur = '';
  const flush = () => { if (cur.length) { lines.push(cur); cur = ''; } };
  for (let word of words) {
    while (word.length > cols) {
      flush();
      lines.push(word.slice(0, cols));
      word = word.slice(cols);
    }
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= cols) cur += ' ' + word;
    else { flush(); cur = word; }
  }
  flush();
  return lines.length ? lines : [''];
}

/**
 * Splits `text` into pages of up to `rows` word-wrapped lines of up to `cols`
 * columns each. `\n` forces a line break; `\f` forces a page break.
 */
export function paginate(text, cols, rows) {
  const pages = [];
  for (const segment of String(text).split('\f')) {
    const lines = [];
    for (const forced of segment.split('\n')) {
      lines.push(...(forced.length ? wrapWords(forced, cols) : ['']));
    }
    for (let i = 0; i < lines.length; i += rows) pages.push(lines.slice(i, i + rows));
  }
  // Drop pages that are entirely blank (e.g. a trailing \f, or \f\f) — nothing
  // for the reader to see and nothing for the typewriter to reveal.
  return pages.filter(page => page.some(line => line.length > 0));
}

/** Reveals a page's lines `charsPerTick` characters at a time, in reading order. */
export class Typewriter {
  constructor(lines, charsPerTick = 2) {
    this.lines = lines;
    this.charsPerTick = charsPerTick;
    this.revealed = 0;
    this.total = lines.reduce((sum, l) => sum + l.length, 0);
  }

  get done() { return this.revealed >= this.total; }

  tick() { this.revealed = Math.min(this.total, this.revealed + this.charsPerTick); }

  skip() { this.revealed = this.total; }

  visibleLines() {
    let remaining = this.revealed;
    return this.lines.map(line => {
      const take = Math.max(0, Math.min(line.length, remaining));
      remaining -= line.length;
      return line.slice(0, take);
    });
  }
}

const COLS = 18;
const ROWS = 2;
const BASE_SPEED = 2;
const FAST_SPEED = 4;
const BLINK_FRAMES = 30;
const BOX_Y = 96;
const BOX_H = 48;
const PAD = 8;

/** A Gen-1-style dialog box: paginates text, types it out, and waits for A to advance/dismiss. */
export class TextBox {
  constructor() {
    this.open = false;
    this.pages = [];
    this.pageIndex = 0;
    this.typewriter = null;
    this.blinkTimer = 0;
    this._resolve = null;
    this._openedThisTick = false;
  }

  say(text) {
    return new Promise(resolve => {
      // Resolve-and-replace: say() while a box is already open would otherwise
      // orphan the previous caller's promise, leaving any `await` hanging forever.
      if (this._resolve) {
        const prevResolve = this._resolve;
        this._resolve = null;
        prevResolve();
      }
      this.pages = paginate(text, COLS, ROWS);
      this.pageIndex = 0;
      this._resolve = resolve;
      this.open = true;
      this._startPage();
    });
  }

  _startPage() {
    this.typewriter = new Typewriter(this.pages[this.pageIndex] ?? [], BASE_SPEED);
    this.blinkTimer = 0;
    // Guards against the very justPressed('a') that opened/advanced the box
    // also dismissing/advancing it on this same tick, when the new page is
    // already fully revealed (empty text, or a page with only blank lines).
    this._openedThisTick = true;
  }

  update(input) {
    if (!this.open || !this.typewriter) return;
    const skipDismiss = this._openedThisTick;
    this._openedThisTick = false;

    if (!this.typewriter.done) {
      const fast = input.isDown('a') || input.isDown('b');
      this.typewriter.charsPerTick = fast ? FAST_SPEED : BASE_SPEED;
      this.typewriter.tick();
      return;
    }

    this.blinkTimer = (this.blinkTimer + 1) % (BLINK_FRAMES * 2);
    if (skipDismiss) return;
    if (input.justPressed('a')) this.advance();
  }

  /** True once the current page is fully typed out. */
  get pageRevealed() { return this.open && !!this.typewriter?.done; }
  get onLastPage() { return this.pageIndex >= this.pages.length - 1; }

  /** What A does on a revealed page: next page, or close and resolve on the last one. */
  advance() {
    if (!this.open) return;
    if (!this.onLastPage) {
      this.pageIndex += 1;
      this._startPage();
    } else {
      this.dismiss();
    }
  }

  /** Closes the box and resolves the pending say() immediately (battle auto-advance). */
  dismiss() {
    if (!this.open) return;
    this.open = false;
    this.typewriter = null;
    const resolve = this._resolve;
    this._resolve = null;
    resolve?.();
  }

  draw(ctx) {
    if (!this.open || !this.typewriter) return;
    paperBox(ctx, 0, BOX_Y, W, BOX_H);

    this.typewriter.visibleLines().forEach((line, i) => {
      drawText(ctx, line, PAD, BOX_Y + PAD + i * (LINE_H * 2), INK);
    });

    if (this.typewriter.done && this.blinkTimer < BLINK_FRAMES) {
      drawText(ctx, '▶', W - 12, BOX_Y + BOX_H - 12, INK);
    }
  }
}
