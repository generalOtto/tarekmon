// The title screen: the TAREKMON logo, a floating random sticker, and NEW GAME / CONTINUE /
// LOAD CODE. NEW GAME over an existing save asks first; LOAD CODE reads a save code (clipboard,
// else a prompt), shows what's in it and asks before saving it and handing it to onLoadCode.
import { drawText, drawTextScaled, measure, CHAR_W } from '../engine/font.js';
import { fromSaveCode } from '../engine/save.js';
import { W, H } from '../engine/canvas.js';
import { defaultRng } from '../engine/rng.js';
import { INK, PAPER } from '../world/palette.js';
import { Menu, YesNo } from './menu.js';
import { drawThumb } from './party.js';

const LOGO = 'TAREKMON', LOGO_SCALE = 3, LOGO_Y = 12;
const LOGO_COLOR = '#88d0e8', LOGO_SHADOW = '#4878c0';
const STICKER = 48, STICKER_CY = 70, FLOAT_PX = 4, FLOAT_TICKS = 90;
const MENU_Y = 110, MENU_ROW = 11;

/** Clipboard first (where the pause menu's SAVE put it), else ask. Returns null when neither works. */
async function defaultReadCode() {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
    try { const t = await navigator.clipboard.readText(); if (t?.trim()) return t; } catch { /* denied: fall back */ }
  }
  return typeof window !== 'undefined' && window.prompt ? window.prompt('PASTE YOUR SAVE CODE') : null;
}

/** A decoded save code that actually looks like a game state (fromSaveCode only checks the version). */
function readSave(code) {
  const s = code ? fromSaveCode(code) : null;
  return s && typeof s.playerName === 'string' && Array.isArray(s.party) && Array.isArray(s.badges) && s.pos ? s : null;
}

export class TitleScene {
  constructor({ db, save, textbox, input, audio = null, rng = defaultRng, readCode = defaultReadCode,
    onNewGame = null, onContinue = null, onLoadCode = null }) {
    Object.assign(this, { db, save, textbox, input, audio, rng, readCode, onNewGame, onContinue, onLoadCode });
    this.prompt = new YesNo(textbox);
    this.busy = false;
    this.ticks = 0;
  }

  enter() {
    this.saved = this.save.load();
    this.menu = new Menu(this.saved ? ['NEW GAME', 'CONTINUE', 'LOAD CODE'] : ['NEW GAME', 'LOAD CODE']);
    const species = this.db.species ?? [];
    this.stickerId = species.length ? species[Math.floor(this.rng() * species.length)].id : null;
    this.audio?.startMusic('title');
  }

  update() {
    this.ticks++;
    const { input, textbox } = this;
    if (this.prompt.active) { this.prompt.update(input); return; }
    if (textbox.open) { textbox.update(input); return; }
    if (this.busy) return;
    this.menu.handle(input, { onSelect: label => this.run(() => this.select(label)) });
  }

  run(fn) {
    this.busy = true;
    fn().catch(e => console.error(e)).finally(() => { this.busy = false; });
  }

  line(id) { return this.db.dialogue?.[id] ?? '...'; }

  async select(label) {
    if (label === 'NEW GAME') {
      if (this.saved && !(await this.prompt.ask(this.line('title-overwrite')))) return;
      this.onNewGame?.();
    } else if (label === 'CONTINUE') {
      this.onContinue?.(this.saved);
    } else if (label === 'LOAD CODE') {
      await this.loadCode();
    }
  }

  async loadCode() {
    let code = null;
    try { code = await this.readCode(); } catch { code = null; }
    const state = readSave(code);
    if (!state) { await this.textbox.say(this.line('title-bad-code')); return; }
    const b = state.badges.length;
    const ok = await this.prompt.ask(`LOAD THIS SAVE?\f${state.playerName} · ${state.party.length} DMPL\n· ${b} BADGE`);
    if (!ok) return;
    this.save.save(state);
    this.onLoadCode?.(state);
  }

  draw(ctx) {
    ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H);
    const lw = LOGO.length * CHAR_W * LOGO_SCALE - LOGO_SCALE; // no trailing spacing column
    const lx = Math.round((W - lw) / 2);
    drawTextScaled(ctx, LOGO, lx + 3, LOGO_Y + 3, LOGO_SCALE, LOGO_SHADOW);
    drawTextScaled(ctx, LOGO, lx, LOGO_Y, LOGO_SCALE, LOGO_COLOR);

    const float = Math.round(Math.sin((this.ticks / FLOAT_TICKS) * Math.PI * 2) * FLOAT_PX);
    const img = this.stickerId ? this.db.images?.[this.stickerId] : null;
    drawThumb(ctx, img, (W - STICKER) / 2, STICKER_CY - STICKER / 2 + float, STICKER);

    const sub = 'A GAME FOR TAREK';
    drawText(ctx, sub, Math.round((W - measure(sub)) / 2), 99, LOGO_COLOR);

    if (!this.textbox.open) {
      this.menu.items.forEach((item, i) => {
        const y = MENU_Y + i * MENU_ROW;
        if (i === this.menu.index) drawText(ctx, '▶', 44, y, PAPER);
        drawText(ctx, item, 56, y, PAPER);
      });
    }
    this.textbox.draw(ctx);
    this.prompt.draw(ctx);
  }
}
