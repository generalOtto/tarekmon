// PartyScreen: the DUMPLINGS overlay, hosted by the Start menu (manage), the bag (pick a heal
// target) and the battle (switch). Logic is pure; draw() only reads. Never touches the scene stack:
// the host forwards update/draw while `open` and reacts to onPick/onClose.
import { Menu } from './menu.js';
import { drawText } from '../engine/font.js';
import { W, H } from '../engine/canvas.js';
import { drawHpBar } from './hpbar.js';
import { paperBox, drawRight } from './box.js';
import { INK } from './textbox.js';
import { PLACEHOLDER } from '../world/palette.js';
import { xpForLevel, MAX_LEVEL } from '../battle/stats.js';
import { NO_EFFECT } from '../world/items.js';

const FAINTED = '#c04040';
const SWAP_BG = '#d8e8c8';
const TOP = 14, ROW_H = 20, SLOTS = 6;
const upper = s => String(s ?? '').toUpperCase();

export class PartyScreen {
  /** mode: 'manage' (Start menu) | 'pick' (heal target) | 'switch' (battle). forced: B does nothing. */
  constructor({ state, db, textbox, mode = 'manage', onPick, onClose, forced = false }) {
    Object.assign(this, { state, db, textbox, mode, onPick, onClose, forced });
    this.open = true;
    this.menu = new Menu(state.party.map((_, i) => i));
    if (forced) this.menu.index = Math.max(0, state.party.findIndex(m => m.hp > 0));
    this.context = null;  // SUMMARY / SWITCH / CANCEL (manage mode)
    this.swapFrom = null; // index picked by SWITCH, waiting for its partner
    this.summary = null;  // index whose summary page is showing
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.onClose?.();
  }

  /** Display rows, one per slot: 'NICK L5 HP 20/30' or '-----'. */
  rows() {
    return Array.from({ length: SLOTS }, (_, i) => {
      const m = this.state.party[i];
      return m ? `${m.nickname} L${m.level} HP ${m.hp}/${m.maxHp}` : '-----';
    });
  }

  update(input) {
    if (!this.open) return;
    if (this.textbox.open) { this.textbox.update(input); return; }
    if (this.summary != null) {
      if (input.justPressed('b') || input.justPressed('a')) this.summary = null;
      return;
    }
    if (this.context) {
      this.context.handle(input, { onSelect: label => this._context(label), onCancel: () => { this.context = null; } });
      return;
    }
    this.menu.items = this.state.party.map((_, i) => i);
    this.menu.handle(input, { onSelect: (_, i) => this._select(i), onCancel: () => this._cancel() });
  }

  _cancel() {
    if (this.swapFrom != null) { this.swapFrom = null; return; }
    if (!this.forced) this.close();
  }

  _select(i) {
    if (this.mode === 'manage') {
      if (this.swapFrom == null) { this.context = new Menu(['SUMMARY', 'SWITCH', 'CANCEL']); return; }
      const p = this.state.party, j = this.swapFrom;
      [p[i], p[j]] = [p[j], p[i]];
      this.swapFrom = null;
      return;
    }
    if (!this.state.party[i]) return;
    if (this.mode === 'pick' && !(this.state.party[i]?.hp > 0)) { this.textbox.say(NO_EFFECT); return; }
    this.onPick?.(i);
  }

  _context(label) {
    const i = this.menu.index;
    this.context = null;
    if (label === 'SUMMARY') this.summary = i;
    else if (label === 'SWITCH') this.swapFrom = i;
  }

  // ---------------------------------------------------------------- drawing

  draw(ctx) {
    if (!this.open) return;
    if (this.summary != null) return this._drawSummary(ctx, this.state.party[this.summary]);
    paperBox(ctx, 0, 0, W, H);
    drawText(ctx, 'DUMPLINGS', 8, 5, INK);
    const hint = this.swapFrom != null ? 'MOVE TO?' : this.mode === 'pick' ? 'USE ON?' : this.mode === 'switch' ? 'SEND OUT?' : '';
    drawRight(ctx, hint, W - 6, 5);
    for (let s = 0; s < SLOTS; s++) {
      const y = TOP + s * ROW_H, m = this.state.party[s];
      if (!m) { drawText(ctx, '-----', 32, y + 6, INK); continue; }
      if (s === this.swapFrom) { ctx.fillStyle = SWAP_BG; ctx.fillRect(3, y, W - 6, ROW_H - 1); }
      if (s === this.menu.index) drawText(ctx, '▶', 4, y + 6, INK);
      drawThumb(ctx, this.db?.images?.[m.speciesId], 12, y + 2, 16);
      drawText(ctx, m.nickname.slice(0, 10), 32, y + 2, m.hp > 0 ? INK : FAINTED);
      drawRight(ctx, `L${m.level}`, W - 6, y + 2);
      drawHpBar(ctx, 33, y + 13, 48, 4, m.hp / m.maxHp);
      drawText(ctx, `HP ${m.hp}/${m.maxHp}`, 86, y + 11, INK);
    }
    this.context?.draw(ctx, W - 80, H - 64, 80);
  }

  _drawSummary(ctx, m) {
    const { db } = this;
    paperBox(ctx, 0, 0, W, H);
    drawThumb(ctx, db?.images?.[m.speciesId], 8, 8, 64);
    drawText(ctx, m.nickname, 80, 8, m.hp > 0 ? INK : FAINTED);
    drawText(ctx, `L${m.level}`, 80, 18, INK);
    const type = db?.speciesById?.[m.speciesId]?.type;
    if (type) {
      ctx.fillStyle = INK; ctx.fillRect(80, 28, 10, 9);
      ctx.fillStyle = db.types?.colors?.[type] ?? PLACEHOLDER; ctx.fillRect(81, 29, 8, 7);
      drawText(ctx, upper(type), 94, 29, INK);
    }
    const st = m.stats ?? {};
    [`HP  ${m.hp}/${m.maxHp}`, `ATK ${st.atk}`, `DEF ${st.def}`, `SPD ${st.spd}`]
      .forEach((line, k) => drawText(ctx, line, 80, 40 + k * 9, INK));
    ctx.fillStyle = INK; ctx.fillRect(6, 77, W - 12, 1);
    for (let k = 0; k < 4; k++) {
      const mv = m.moves[k], y = 81 + k * 10;
      if (!mv) { drawText(ctx, '-', 8, y, INK); continue; }
      drawText(ctx, upper(db?.movesById?.[mv.id]?.name ?? mv.id).slice(0, 12), 8, y, INK);
      drawRight(ctx, `PP ${mv.pp}/${mv.maxPp}`, W - 8, y);
    }
    const next = m.level >= MAX_LEVEL ? '-' : xpForLevel(m.level + 1);
    drawText(ctx, `XP ${m.xp}/${next}`, 8, 126, INK);
  }
}

/** A sticker scaled into a size×size square (smooth, it's a photo), or a grey placeholder. */
export function drawThumb(ctx, img, x, y, size) {
  if (img && img.complete !== false && (img.naturalWidth ?? 1) > 0) {
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, x, y, size, size);
    ctx.imageSmoothingEnabled = prev;
  } else {
    ctx.fillStyle = PLACEHOLDER;
    ctx.fillRect(x, y, size, size);
  }
}
