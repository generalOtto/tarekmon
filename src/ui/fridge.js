// FridgeScreen: the Haze Lounge fridge (box storage). PARTY column on the left, FRIDGE on the
// right; left/right picks a column, A opens DEPOSIT or WITHDRAW. Hosted by the overworld's overlay
// slot; logic is pure, draw() only reads. Lines: fridge-open/-last/-full/-deposit/-withdraw.
import { Menu } from './menu.js';
import { drawText } from '../engine/font.js';
import { W, H } from '../engine/canvas.js';
import { INK } from './textbox.js';
import { paperBox, scrollFor } from './box.js';
import { drawMonTag } from './party.js';

const ROWS = 6, TOP = 26, ROW_H = 19, COL_X = { party: 2, fridge: 80 }, MAX_PARTY = 6;

/** Fills a dialogue template's `{nick}`. */
export const fillNick = (text, nick) => String(text).replaceAll('{nick}', nick);

export class FridgeScreen {
  constructor({ state, db, textbox, onClose }) {
    Object.assign(this, { state, db, textbox, onClose });
    this.open = true;
    this.col = 'party';
    this.menus = { party: new Menu([]), fridge: new Menu([]) };
    this.context = null; // DEPOSIT|WITHDRAW / CANCEL
    this.greeting = true;
    this.line('fridge-open').then(() => { this.greeting = false; });
  }

  line(id, nick) { return Promise.resolve(this.textbox.say(fillNick(this.db.dialogue?.[id] ?? '...', nick))); }

  get cursor() { return { party: this.menus.party.index, fridge: this.menus.fridge.index }; }

  close() {
    if (!this.open) return;
    this.open = false;
    this.onClose?.();
  }

  /** Re-syncs both cursor lists with state (they shrink/grow on every move). */
  _sync() {
    for (const col of ['party', 'fridge']) {
      const menu = this.menus[col];
      menu.items = this.state[col];
      menu.index = Math.max(0, Math.min(menu.index, menu.items.length - 1));
    }
  }

  update(input) {
    if (!this.open) return;
    if (this.textbox.open) { this.textbox.update(input); return; }
    if (this.greeting) return;
    this._sync();
    if (this.context) {
      this.context.handle(input, { onSelect: label => this._context(label), onCancel: () => { this.context = null; } });
      return;
    }
    const side = ['left', 'right'].find(d => input.justPressed(d));
    if (side) { this.col = side === 'left' ? 'party' : 'fridge'; return; }
    this.menus[this.col].handle(input, {
      onSelect: m => { if (m) this.context = new Menu([this.col === 'party' ? 'DEPOSIT' : 'WITHDRAW', 'CANCEL']); },
      onCancel: () => this.close(),
    });
  }

  _context(label) {
    this.context = null;
    const i = this.menus[this.col].index;
    if (label === 'DEPOSIT') this.deposit(i);
    else if (label === 'WITHDRAW') this.withdraw(i);
  }

  /** Party → fridge, unless it would leave no healthy dumpling in the party. */
  deposit(i) {
    const { party, fridge } = this.state;
    if (!party.some((m, j) => j !== i && m.hp > 0)) return this.line('fridge-last');
    const m = party.splice(i, 1)[0];
    fridge.push(m);
    this._sync();
    return this.line('fridge-deposit', m.nickname);
  }

  /** Fridge → end of the party, unless the party is full. */
  withdraw(i) {
    const { party, fridge } = this.state;
    if (party.length >= MAX_PARTY) return this.line('fridge-full');
    const m = fridge.splice(i, 1)[0];
    party.push(m);
    this._sync();
    return this.line('fridge-withdraw', m.nickname);
  }

  // ---------------------------------------------------------------- drawing

  draw(ctx) {
    if (!this.open || this.greeting) return;
    paperBox(ctx, 0, 0, W, H);
    drawText(ctx, 'THE FRIDGE', 8, 5, INK);
    ctx.fillStyle = INK; ctx.fillRect(COL_X.fridge - 1, 16, 1, H - 20);
    for (const col of ['party', 'fridge']) this._drawColumn(ctx, col);
    this.context?.draw(ctx, W - 72, H - 48, 72);
  }

  _drawColumn(ctx, col) {
    const x = COL_X[col], list = this.state[col], menu = this.menus[col];
    const index = Math.min(menu.index, list.length - 1);
    drawText(ctx, col.toUpperCase(), x + 6, 16, INK);
    if (!list.length) { drawText(ctx, '-----', x + 8, TOP + 5, INK); return; }
    const top = scrollFor(index, list.length, ROWS);
    for (let r = 0; r < ROWS && top + r < list.length; r++) {
      const i = top + r, y = TOP + r * ROW_H, m = list[i];
      if (col === this.col && i === index) drawText(ctx, '▶', x + 2, y + 4, INK);
      drawMonTag(ctx, this.db, m, x + 7, y, 8);
      drawText(ctx, `L${m.level}`, x + 27, y + 9, INK);
    }
    if (top > 0) drawText(ctx, '-', x + 70, TOP - 3, INK);
    if (top + ROWS < list.length) drawText(ctx, '-', x + 70, TOP + ROWS * ROW_H - 4, INK);
  }
}
