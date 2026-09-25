import { drawText } from '../engine/font.js';
import { W } from '../engine/canvas.js';

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
  return pages;
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

/** A Gen-1-style dialog box: paginates text, types it out, and waits for A to advance/dismiss. */
export class TextBox {
  constructor() {
    this.open = false;
    this.pages = [];
    this.pageIndex = 0;
    this.typewriter = null;
    this.blinkTimer = 0;
    this._resolve = null;
  }

  say(text) {
    return new Promise(resolve => {
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
  }

  update(input) {
    if (!this.open || !this.typewriter) return;
    if (!this.typewriter.done) {
      const fast = input.isDown('a') || input.isDown('b');
      this.typewriter.charsPerTick = fast ? FAST_SPEED : BASE_SPEED;
      this.typewriter.tick();
    } else {
      this.blinkTimer = (this.blinkTimer + 1) % (BLINK_FRAMES * 2);
      if (input.justPressed('a')) {
        if (this.pageIndex < this.pages.length - 1) {
          this.pageIndex += 1;
          this._startPage();
        } else {
          this.open = false;
          this.typewriter = null;
          const resolve = this._resolve;
          this._resolve = null;
          resolve?.();
        }
      }
    }
  }

  draw(ctx) {
    if (!this.open || !this.typewriter) return;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, BOX_Y, W, BOX_H);
    ctx.fillStyle = INK;
    ctx.fillRect(0, BOX_Y, W, 2);
    ctx.fillRect(0, BOX_Y + BOX_H - 2, W, 2);
    ctx.fillRect(0, BOX_Y, 2, BOX_H);
    ctx.fillRect(W - 2, BOX_Y, 2, BOX_H);

    const [line1 = '', line2 = ''] = this.typewriter.visibleLines();
    drawText(ctx, line1, 8, 104, INK);
    drawText(ctx, line2, 8, 120, INK);

    if (this.typewriter.done && this.blinkTimer < BLINK_FRAMES) {
      drawText(ctx, '▶', 148, 132, INK);
    }
  }
}
