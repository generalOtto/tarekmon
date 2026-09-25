// ShopScreen: the ribs-place counter. Greeting → BUY / LEAVE → item list → quantity → pay.
// Hosted by the overworld's overlay slot; logic is pure, draw() only reads. Lines come from
// db.dialogue (shop-bought, shop-bought-balls, shop-poor, shop-leave).
import { Menu } from './menu.js';
import { drawText } from '../engine/font.js';
import { W } from '../engine/canvas.js';
import { INK } from './textbox.js';
import { paperBox, drawRight, padRow } from './box.js';

const MAX_QTY = 9;

export class ShopScreen {
  constructor({ state, db, textbox, onClose }) {
    Object.assign(this, { state, db, textbox, onClose });
    this.open = true;
    this.phase = 'greet'; // 'greet' | 'main' | 'buy' | 'qty' | 'leaving'
    this.main = new Menu(['BUY', 'LEAVE']);
    this.items = db.items ?? Object.values(db.itemsById ?? {});
    this.list = new Menu(this.items.map(it => padRow(it.name, `$${it.price}`, 19)));
    this.qty = 1;
    this.line('ribs-shop').then(() => { if (this.phase === 'greet') this.phase = 'main'; });
  }

  line(id) { return Promise.resolve(this.textbox.say(this.db.dialogue?.[id] ?? '...')); }

  close() {
    if (!this.open) return;
    this.open = false;
    this.onClose?.();
  }

  get item() { return this.items[this.list.index]; }
  get total() { return this.item.price * this.qty; }

  update(input) {
    if (!this.open) return;
    if (this.textbox.open) { this.textbox.update(input); return; }
    switch (this.phase) {
      case 'main':
        return this.main.handle(input, {
          onSelect: label => (label === 'BUY' ? this.phase = 'buy' : this.leave()),
          onCancel: () => this.leave(),
        });
      case 'buy':
        return this.list.handle(input, {
          onSelect: () => { this.qty = 1; this.phase = 'qty'; },
          onCancel: () => { this.phase = 'main'; },
        });
      case 'qty': {
        const d = ['up', 'down', 'left', 'right'].find(b => input.justPressed(b));
        if (d) this.qty = Math.max(1, Math.min(MAX_QTY, this.qty + (d === 'right' || d === 'up' ? 1 : -1)));
        else if (input.justPressed('a')) this.buy();
        else if (input.justPressed('b')) this.phase = 'buy';
        return;
      }
    }
  }

  /** Pays for `qty` of the selected item if affordable; either way returns to the item list. */
  buy() {
    const { state, item, qty, total } = this;
    this.phase = 'buy';
    if (state.money < total) return this.line('shop-poor');
    state.money -= total;
    state.bag[item.id] = (state.bag[item.id] ?? 0) + qty;
    return this.line(item.battle === 'catch' ? 'shop-bought-balls' : 'shop-bought');
  }

  leave() {
    this.phase = 'leaving';
    return this.line('shop-leave').then(() => this.close());
  }

  // ---------------------------------------------------------------- drawing

  draw(ctx) {
    if (!this.open || this.phase === 'greet' || this.phase === 'leaving') return;
    paperBox(ctx, W - 64, 0, 64, 16);
    drawRight(ctx, `$${this.state.money}`, W - 6, 5);
    if (this.phase === 'main') { this.main.draw(ctx, 0, 0, 64); return; }
    this.list.draw(ctx, 0, 16, W, { rows: this.items.length });
    if (this.phase === 'qty') {
      paperBox(ctx, W - 88, 100, 88, 36);
      drawText(ctx, `x${this.qty}`, W - 80, 108, INK);
      drawText(ctx, `TOTAL $${this.total}`, W - 80, 120, INK);
    }
  }
}
