// BagScreen: the BAG overlay, hosted by the Start menu (context 'field') and the battle ('battle').
// Lists usable items, opens USE/INFO/CANCEL, and hands the chosen item (plus a party target for
// heals, via a PartyScreen picker) to onUse. Logic is pure; draw() only reads.
import { Menu } from './menu.js';
import { drawText } from '../engine/font.js';
import { W, H } from '../engine/canvas.js';
import { paginate, INK } from './textbox.js';
import { paperBox, drawRight, scrollFor, padRow } from './box.js';
import { PartyScreen } from './party.js';

export const CRUMBS = 'NOTHING IN THE BAG.\nJUST CRUMBS.';
const ROWS = 6, ROW_H = 12, LIST_Y = 20, COLS = 21, DESC_Y = 102;

export class BagScreen {
  constructor({ state, db, textbox, context = 'field', onUse, onClose }) {
    Object.assign(this, { state, db, textbox, context, onUse, onClose });
    this.open = true;
    this.menu = new Menu(this.labels());
    this.action = null; // USE / INFO / CANCEL context menu
    this.picker = null; // PartyScreen in pick mode (heal target)
    if (!this.ids.length) this._crumbs();
  }

  /** Ids of bag items with count > 0 that make sense here (field → item.field, battle → item.battle). */
  get ids() {
    const key = this.context === 'battle' ? 'battle' : 'field';
    return Object.keys(this.state.bag).filter(id => this.state.bag[id] > 0 && this.db.itemsById[id]?.[key] != null);
  }

  labels() {
    return this.ids.map(id => padRow(this.db.itemsById[id].name, `x${this.state.bag[id]}`, COLS));
  }

  selectedItem() { return this.db.itemsById[this.ids[this.menu.index]]; }

  close() {
    if (!this.open) return;
    this.open = false;
    this.onClose?.();
  }

  _crumbs() {
    this.emptying = true;
    Promise.resolve(this.textbox.say(CRUMBS)).then(() => this.close());
  }

  update(input) {
    if (!this.open) return;
    if (this.picker?.open) { this.picker.update(input); return; }
    this.picker = null;
    if (this.textbox.open) { this.textbox.update(input); return; }
    if (this.emptying) return;
    this.menu.items = this.labels(); // counts change after a use
    if (!this.menu.items.length) { this.close(); return; }
    this.menu.index = Math.min(this.menu.index, this.menu.items.length - 1);
    if (this.action) {
      this.action.handle(input, { onSelect: label => this._action(label), onCancel: () => { this.action = null; } });
      return;
    }
    this.menu.handle(input, { onSelect: () => { this.action = new Menu(['USE', 'INFO', 'CANCEL']); }, onCancel: () => this.close() });
  }

  _action(label) {
    this.action = null;
    const id = this.ids[this.menu.index], item = this.db.itemsById[id];
    if (label === 'INFO') { this.textbox.say(item.text); return; }
    if (label !== 'USE') return;
    const kind = this.context === 'battle' ? item.battle : item.field;
    if (kind !== 'heal') { this.onUse?.(id); return; }
    this.picker = new PartyScreen({
      state: this.state, db: this.db, textbox: this.textbox, mode: 'pick',
      onPick: i => { this.picker.close(); this.onUse?.(id, i); },
    });
  }

  // ---------------------------------------------------------------- drawing

  draw(ctx) {
    if (!this.open || this.emptying) return;
    if (this.picker?.open) { this.picker.draw(ctx); return; }
    paperBox(ctx, 0, 0, W, H);
    drawText(ctx, 'BAG', 8, 6, INK);
    drawRight(ctx, `$${this.state.money}`, W - 8, 6);
    ctx.fillStyle = INK; ctx.fillRect(6, 16, W - 12, 1); ctx.fillRect(6, DESC_Y - 5, W - 12, 1);
    const items = this.menu.items, top = scrollFor(this.menu.index, items.length, ROWS);
    for (let r = 0; r < ROWS && top + r < items.length; r++) {
      const i = top + r, y = LIST_Y + r * ROW_H;
      if (i === this.menu.index) drawText(ctx, '▶', 8, y, INK);
      drawText(ctx, items[i], 18, y, INK);
    }
    if (top > 0) drawText(ctx, '-', W - 10, LIST_Y - 3, INK);
    if (top + ROWS < items.length) drawText(ctx, '-', W - 10, LIST_Y + ROWS * ROW_H - 4, INK);
    const item = this.selectedItem();
    if (item) paginate(item.text, 24, 4)[0].slice(0, 4).forEach((line, k) => drawText(ctx, line, 8, DESC_Y + k * 10, INK));
    this.action?.draw(ctx, W - 64, H - 64, 64);
  }
}
