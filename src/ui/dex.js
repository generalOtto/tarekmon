// DexScreen: the DUMPLINGDEX overlay, hosted by the Start menu. A list page (all 74 species, unseen
// ones masked, a ball icon on caught ones; Start toggles NUMBER/NAME order) and an entry page (sticker,
// type badge, gag HT/WT, the entry text through the textbox, then base-stat bars for caught species;
// left/right flips through seen species). Logic is pure; draw() only reads.
import { Menu } from './menu.js';
import { drawText } from '../engine/font.js';
import { W, H } from '../engine/canvas.js';
import { paperBox, drawRight, scrollFor } from './box.js';
import { drawThumb } from './party.js';
import { INK, PAPER, RED, WHITE, PLACEHOLDER } from '../world/palette.js';

const ROWS = 7, TOP = 27, ROW_H = 14, MASK = '----------', STAT_MAX = 130, BAR_W = 40;
const SIZE = { // a gag, by type: [height, weight]
  Steamed: [`0'8"`, '3 LBS'], Fried: [`0'7"`, '4 LBS'], Spicy: [`0'9"`, '5 LBS'],
  Soggy: [`0'6"`, '6 LBS'], Frozen: [`0'8"`, '2 LBS'], Imported: [`1'2"`, '3 LBS'],
};
const pad3 = n => String(n).padStart(3, '0');

/** One row per species, in `sort` order ('NUMBER' | 'NAME'; NAME puts unseen last, by number). */
export function dexRows(db, state, sort = 'NUMBER') {
  const seen = new Set([...state.dex.seen, ...state.dex.caught]), caught = new Set(state.dex.caught);
  const rows = (db.species ?? []).map(s => ({
    id: s.id, num: s.num, name: seen.has(s.id) ? s.name.toUpperCase() : MASK, seen: seen.has(s.id), caught: caught.has(s.id),
  })).sort((a, b) => a.num - b.num);
  if (sort !== 'NAME') return rows;
  return rows.sort((a, b) => (b.seen - a.seen) || (a.seen ? a.name.localeCompare(b.name) : a.num - b.num));
}

/** The next seen row from `index` in direction `dir` (±1); stays at `index` if there is none. */
export function nextSeen(rows, index, dir) {
  for (let i = index + dir; i >= 0 && i < rows.length; i += dir) if (rows[i].seen) return i;
  return index;
}

export class DexScreen {
  constructor({ state, db, textbox, onClose }) {
    Object.assign(this, { state, db, textbox, onClose });
    this.open = true;
    this.mode = 'list'; // 'list' | 'entry'
    this.sort = 'NUMBER';
    this.showStats = false; // entry page: base stats revealed (caught species, after the entry text)
    this.rows = dexRows(db, state, this.sort);
    this.menu = new Menu(this.rows);
    this.menu.index = Math.max(0, this.rows.findIndex(r => r.seen));
  }

  get current() { return this.rows[this.menu.index]; }

  counts() { return { seen: this.rows.filter(r => r.seen).length, caught: this.rows.filter(r => r.caught).length }; }

  close() {
    if (!this.open) return;
    this.open = false;
    this.onClose?.();
  }

  update(input) {
    if (!this.open) return;
    if (this.mode === 'entry') return this._updateEntry(input);
    if (this.textbox.open) { this.textbox.update(input); return; }
    if (input.justPressed('start')) { this._toggleSort(); return; }
    this.menu.handle(input, { onSelect: () => this._select(), onCancel: () => this.close() });
  }

  _select() {
    if (!this.current.seen) { Menu.audio?.playSfx('bump'); return; }
    this.mode = 'entry';
    this._showEntry();
  }

  _toggleSort() {
    const id = this.current?.id;
    this.sort = this.sort === 'NUMBER' ? 'NAME' : 'NUMBER';
    this.rows = this.menu.items = dexRows(this.db, this.state, this.sort);
    this.menu.index = Math.max(0, this.rows.findIndex(r => r.id === id));
    Menu.audio?.playSfx('select');
  }

  /** Starts (or restarts) the entry text for the current species; stats wait until it closes. */
  _showEntry() {
    this.showStats = false;
    this.textbox.say(this.db.speciesById?.[this.current.id]?.entry ?? '...');
  }

  _updateEntry(input) {
    const dir = input.justPressed('left') ? -1 : input.justPressed('right') ? 1 : 0;
    if (dir) {
      const i = nextSeen(this.rows, this.menu.index, dir);
      if (i !== this.menu.index) { this.menu.index = i; Menu.audio?.playSfx('select'); this._showEntry(); }
      return;
    }
    if (this.textbox.open) {
      this.textbox.update(input);
      if (!this.textbox.open) this.showStats = this.current.caught;
      return;
    }
    if (input.justPressed('a') || input.justPressed('b')) { this.mode = 'list'; this.showStats = false; }
  }

  // ---------------------------------------------------------------- drawing

  draw(ctx) {
    if (!this.open) return;
    paperBox(ctx, 0, 0, W, H);
    if (this.mode === 'entry') this._drawEntry(ctx);
    else this._drawList(ctx);
  }

  _drawList(ctx) {
    const { seen, caught } = this.counts();
    drawText(ctx, 'DUMPLINGDEX', 8, 5, INK);
    drawText(ctx, 'SEEN', 8, 15, INK); drawRight(ctx, String(seen), 50, 15);
    drawText(ctx, 'CAUGHT', 62, 15, INK); drawRight(ctx, String(caught), 116, 15);
    ctx.fillStyle = INK; ctx.fillRect(6, 24, W - 12, 1);
    const top = scrollFor(this.menu.index, this.rows.length, ROWS);
    for (let r = 0; r < ROWS && top + r < this.rows.length; r++) {
      const i = top + r, row = this.rows[i], y = TOP + r * ROW_H;
      if (i === this.menu.index) drawText(ctx, '▶', 6, y, INK);
      if (row.caught) drawBall(ctx, 14, y + 1);
      drawText(ctx, `#${pad3(row.num)} ${row.name}`, 22, y, INK);
    }
    ctx.fillStyle = INK; ctx.fillRect(6, 126, W - 12, 1);
    drawRight(ctx, this.sort, W - 8, 131);
  }

  _drawEntry(ctx) {
    const row = this.current, sp = this.db.speciesById?.[row.id];
    drawThumb(ctx, this.db.images?.[row.id], 8, 8, 64); // smoothing on for the photo, restored after
    drawText(ctx, `#${pad3(row.num)}`, 80, 8, INK);
    drawText(ctx, row.name.slice(0, 12), 80, 18, INK);
    if (row.name.length > 12) drawText(ctx, row.name.slice(12, 24), 80, 27, INK);
    if (!sp) return;
    ctx.fillStyle = INK; ctx.fillRect(80, 38, 10, 10);
    ctx.fillStyle = PAPER; ctx.fillRect(81, 39, 8, 8); // 1px paper gap so light types still read as a filled chip
    ctx.fillStyle = this.db.types?.colors?.[sp.type] ?? PLACEHOLDER; ctx.fillRect(82, 40, 6, 6);
    drawText(ctx, sp.type.toUpperCase(), 94, 40, INK);
    const [ht, wt] = SIZE[sp.type] ?? SIZE.Steamed;
    drawText(ctx, `HT ${ht}`, 80, 53, INK);
    drawText(ctx, `WT ${wt}`, 80, 63, INK);
    ctx.fillStyle = INK; ctx.fillRect(6, 80, W - 12, 1);
    if (this.showStats && !this.textbox.open) this._drawStats(ctx, sp.base ?? {});
  }

  _drawStats(ctx, base) {
    paperBox(ctx, 0, 96, W, 48);
    [['HP', base.hp], ['ATK', base.atk], ['DEF', base.def], ['SPD', base.spd]].forEach(([label, v = 0], k) => {
      const y = 102 + k * 9;
      drawText(ctx, label, 8, y, INK);
      statBar(ctx, 32, y + 1, v / STAT_MAX);
      drawRight(ctx, String(v), 100, y);
    });
  }
}

/** drawHpBar's shape in ink: 1px ink outline, paper track, ink fill (min 1px while > 0). */
function statBar(ctx, x, y, ratio) {
  const r = Math.max(0, Math.min(1, ratio)), h = 4;
  ctx.fillStyle = INK; ctx.fillRect(x - 1, y - 1, BAR_W + 2, h + 2);
  ctx.fillStyle = PAPER; ctx.fillRect(x, y, BAR_W, h);
  if (r > 0) { ctx.fillStyle = INK; ctx.fillRect(x, y, Math.max(1, Math.round(BAR_W * r)), h); }
}

/** A 5×5 dumplingball: red cap, ink band, white base, corners cut. */
function drawBall(ctx, x, y) {
  ctx.fillStyle = RED; ctx.fillRect(x + 1, y, 3, 1); ctx.fillRect(x, y + 1, 5, 1);
  ctx.fillStyle = INK; ctx.fillRect(x, y + 2, 5, 1);
  ctx.fillStyle = WHITE; ctx.fillRect(x, y + 3, 5, 1); ctx.fillRect(x + 1, y + 4, 3, 1);
}
