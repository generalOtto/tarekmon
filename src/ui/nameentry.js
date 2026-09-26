// Name entry: a letter grid with a 2-D cursor (wraps both ways). A on a letter appends (up to
// `max`), DEL or B removes the last char, END or Start confirms a non-empty name via onDone.
// Pure logic plus draw(); the intro owns it and routes input to update().
import { drawText } from '../engine/font.js';
import { W, H } from '../engine/canvas.js';
import { INK, PAPER } from '../world/palette.js';
import { paperBox } from './box.js';
import { Menu } from './menu.js';

export const GRID = [
  ['A', 'B', 'C', 'D', 'E'],
  ['F', 'G', 'H', 'I', 'J'],
  ['K', 'L', 'M', 'N', 'O'],
  ['P', 'Q', 'R', 'S', 'T'],
  ['U', 'V', 'W', 'X', 'Y'],
  ['Z', '.', '-', "'"],
  ['DEL', 'END'],
];
const DIRS = ['up', 'down', 'left', 'right'];
const GX = 34, GY = 30, DX = 22, DY = 13; // grid origin and cell pitch
const BLINK = 30;

export class NameEntry {
  constructor({ input = null, initial = 'TAREK', max = 7, onDone = null } = {}) {
    Object.assign(this, { input, max, onDone });
    this.name = String(initial).slice(0, max);
    this.row = 0; this.col = 0;
    this.done = false;
    this.ticks = 0;
  }

  cell() { return GRID[this.row][this.col]; }

  move(dir) {
    const rows = GRID.length;
    if (dir === 'left' || dir === 'right') {
      const n = GRID[this.row].length;
      this.col = (this.col + (dir === 'left' ? n - 1 : 1)) % n;
    } else {
      this.row = (this.row + (dir === 'up' ? rows - 1 : 1)) % rows;
      this.col = Math.min(this.col, GRID[this.row].length - 1);
    }
  }

  backspace() { this.name = this.name.slice(0, -1); }

  confirm() {
    if (this.done || this.name.length < 1) return;
    this.done = true;
    this.onDone?.(this.name);
  }

  press() {
    const c = this.cell();
    if (c === 'DEL') this.backspace();
    else if (c === 'END') this.confirm();
    else if (this.name.length < this.max) this.name += c;
  }

  update(input = this.input) {
    this.ticks++;
    if (this.done) return;
    const sfx = () => Menu.audio?.playSfx('select');
    const dir = DIRS.find(d => input.justPressed(d));
    if (dir) { this.move(dir); sfx(); }
    if (input.justPressed('a')) { sfx(); this.press(); }
    else if (input.justPressed('b')) this.backspace();
    else if (input.justPressed('start')) this.confirm();
  }

  draw(ctx) {
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    paperBox(ctx, 4, 4, W - 8, 18);
    const label = 'NAME: ';
    drawText(ctx, label + this.name, 12, 10, INK);
    if (this.name.length < this.max && (this.ticks % (BLINK * 2)) < BLINK) {
      ctx.fillStyle = INK;
      ctx.fillRect(12 + (label.length + this.name.length) * 6, 17, 5, 1); // blinking underscore
    }
    paperBox(ctx, 4, 24, W - 8, H - 28);
    GRID.forEach((row, r) => row.forEach((c, i) => {
      const x = cellX(r, i), y = GY + r * DY;
      if (r === this.row && i === this.col) drawText(ctx, '▶', x - 8, y, INK);
      drawText(ctx, c, x, y, INK);
    }));
    drawText(ctx, 'B:DEL  START:END', 32, 126, INK);
  }
}

/** The DEL/END row spreads its two wide labels across the grid instead of using the letter pitch. */
function cellX(r, i) { return GRID[r].length === 2 ? GX + i * DX * 3 : GX + i * DX; }
