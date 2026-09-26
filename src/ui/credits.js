import { drawText, measure, LINE_H } from '../engine/font.js';
import { INK, PAPER, RED, YELLOW, STAR, SUNSET_1, SUNSET_2, SUNSET_3, SUNSET_4, SUNSET_5, SUNSET_6 } from '../world/palette.js';

const W = 160, S = 16;
const HORIZON = 64;            // sky 0..64, grass row 64..80, path row 80..96, water 96..144 (bottom third)
const TEXT_BOTTOM = 48;        // credits scroll up from here (above the parading stickers)
export const GAP = 10;         // px between credit lines
export const SCROLL_TICKS_PER_PX = 3; // credits scroll 1 px every 3 ticks
const SKY = [SUNSET_1, SUNSET_2, SUNSET_3, SUNSET_4, SUNSET_5, SUNSET_6]; // top → horizon
const STARS = [[12, 6], [30, 18], [47, 4], [66, 12], [83, 26], [98, 7], [115, 20], [131, 5], [146, 15], [22, 34]];
export const NIGHT_TICKS = 90, TYPE_TICKS = 3, SPACING = 40;
const NIGHT_ALPHA = 0.8, SIZE = 32;

/** Greedy word wrap at `cols` columns. */
export function wrapWords(text, cols) {
  const lines = [];
  for (const word of text.split(' ')) {
    const last = lines.at(-1);
    if (last !== undefined && last.length + 1 + word.length <= cols) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

/** The ending: a sunset over the Skate Route, every caught dumpling parading along the path, the credits
 *  scrolling up the sky, nightfall, then the birthday card typed out letter by letter. Any of A/B/Start
 *  once the card is fully typed → onDone(). Pacing lives in update(); draw() only reads it. */
export class CreditsScene {
  constructor({ db, state, input, audio, textbox, tileset, onDone }) {
    Object.assign(this, { db, state, input, audio, textbox, tileset, onDone });
    const n = state.dex.caught.length;
    this.lines = db.dialogue.credits.map(l => l.replaceAll('{n}', String(n)));
    this.birthday = db.dialogue.birthday.toUpperCase();
    this.cardLines = wrapWords(this.birthday, 18);
    const ids = n ? [...state.dex.caught] : [state.flags.starterId ?? state.party[0]?.speciesId].filter(Boolean);
    this.ids = ids;
    this.paradePeriod = W + SIZE + (ids.length - 1) * SPACING + 1; // until the last one is fully off the right edge
    this.t = 0; this.scrollT = 0; this.phase = 'scroll'; this.phaseT = 0; this.done = false;
  }

  enter() { this.audio?.startMusic('credits'); }

  get parade() {
    const step = this.t % this.paradePeriod;
    return this.ids.map((id, i) => ({
      id, x: step - SIZE - i * SPACING,
      bob: Math.round(Math.sin((2 * Math.PI * (this.t + i * 7)) / 30) + 1), // 0..2 px, 30-tick period
    }));
  }
  lineY(i) { return TEXT_BOTTOM + i * GAP - Math.floor(this.scrollT / SCROLL_TICKS_PER_PX); }
  get nightAlpha() {
    if (this.phase === 'scroll') return 0;
    return this.phase === 'night' ? (NIGHT_ALPHA * this.phaseT) / NIGHT_TICKS : NIGHT_ALPHA;
  }
  get revealed() { return this.phase === 'card' ? Math.min(this.birthday.length, Math.floor(this.phaseT / TYPE_TICKS)) : 0; }
  get typed() { return this.phase === 'card' && this.revealed === this.birthday.length; }
  /** The card lines cut to what the typewriter has revealed (each line break eats one space). */
  shownLines() {
    let left = this.revealed;
    return this.cardLines.map(line => { const s = line.slice(0, Math.max(0, left)); left -= line.length + 1; return s; });
  }

  update() {
    const { input } = this;
    if (this.typed && !this.done && ['a', 'b', 'start'].some(b => input.justPressed(b))) { this.done = true; this.onDone?.(); return; }
    this.t++;
    if (this.phase === 'scroll') {
      this.scrollT++;
      if (this.lineY(this.lines.length - 1) + LINE_H <= 0) { this.phase = 'night'; this.phaseT = 0; }
    } else if (this.phase === 'night') {
      if (++this.phaseT >= NIGHT_TICKS) { this.phase = 'card'; this.phaseT = 0; this.audio?.playJingle('heal'); }
    } else this.phaseT++;
  }

  draw(ctx) {
    const { t, tileset } = this;
    SKY.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, Math.round((i * HORIZON) / SKY.length), W, Math.ceil(HORIZON / SKY.length) + 1); });
    ctx.fillStyle = YELLOW; // the sun, sinking 1 px per second behind the tree line
    ctx.beginPath(); ctx.arc(112, 40 + Math.floor(t / 60), 6, 0, Math.PI * 2); ctx.fill();
    const frame = (t >> 5) & 1;
    for (let x = 0; x < W; x += S) {
      tileset?.draw(ctx, ',', x, HORIZON, frame);
      tileset?.draw(ctx, '=', x, HORIZON + S, frame);
      for (let y = HORIZON + 2 * S; y < 144; y += S) tileset?.draw(ctx, '~', x, y, frame);
    }
    ctx.fillStyle = INK; // tree silhouettes along the top of the grass
    for (let x = 4; x < W; x += 18) { ctx.beginPath(); ctx.arc(x, HORIZON - 2 + ((x * 7) % 5), 7, 0, Math.PI * 2); ctx.fill(); }
    if (this.phase === 'scroll') this.drawCredits(ctx);
    const a = this.nightAlpha;
    if (a > 0) {
      ctx.globalAlpha = a; ctx.fillStyle = INK; ctx.fillRect(0, 0, W, 144); ctx.globalAlpha = 1;
      ctx.fillStyle = STAR;
      STARS.forEach(([x, y], i) => { if (((t >> 4) + i) % 3 !== 0 && a > 0.3) ctx.fillRect(x, y, 1, 1); });
    }
    this.drawParade(ctx, a > 0 ? 0.6 : 1);
    if (this.phase === 'card') this.drawCard(ctx);
  }

  drawCredits(ctx) {
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, TEXT_BOTTOM); ctx.clip();
    this.lines.forEach((line, i) => {
      const y = this.lineY(i);
      if (!line || y < -LINE_H || y > TEXT_BOTTOM) return;
      const x = Math.floor((W - measure(line)) / 2);
      drawText(ctx, line, x + 1, y + 1, PAPER);
      drawText(ctx, line, x, y, INK);
    });
    ctx.restore();
  }

  drawParade(ctx, alpha) {
    const prevSmooth = ctx.imageSmoothingEnabled, prevAlpha = ctx.globalAlpha;
    ctx.imageSmoothingEnabled = true; ctx.globalAlpha = alpha; // stickers are photos: smooth scaling
    for (const { id, x, bob } of this.parade) {
      const img = this.db.images?.[id];
      if (img && x > -SIZE && x < W) ctx.drawImage(img, x, HORIZON + S - SIZE + 2 - bob, SIZE, SIZE);
    }
    ctx.imageSmoothingEnabled = prevSmooth; ctx.globalAlpha = prevAlpha;
  }

  drawCard(ctx) {
    const lines = this.shownLines(), top = 36;
    lines.forEach((line, i) => {
      const x = Math.floor((W - measure(this.cardLines[i])) / 2), y = top + i * (LINE_H + 4);
      drawText(ctx, line, x + 1, y + 1, INK);
      drawText(ctx, line, x, y, i % 2 ? YELLOW : PAPER);
    });
    if (this.typed && (this.phaseT >> 4) % 4 !== 3) drawText(ctx, '♥', (W - 6) / 2, top + 4 * (LINE_H + 4) + 2, RED);
  }
}
