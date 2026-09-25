// BattleScene: renders a Battle and paces its events. The engine resolves a whole turn at once;
// this scene replays the resulting events one at a time (text, bar tweens, sticker animations),
// then shows the action menu when the queue is empty. Pacing lives in update()/play()/step() and
// only mutates `this.view` — draw() is a pure function of that view, so pacing tests run headless.
import { Menu } from '../ui/menu.js';
import { drawHpBar, Tween } from '../ui/hpbar.js';
import { drawText, measure } from '../engine/font.js';
import { W, H } from '../engine/canvas.js';
import { drawFade } from '../world/doors.js';
import { PAPER, INK, GRASS_L, RED, WHITE, YELLOW } from '../world/palette.js';
import { xpForLevel, MAX_LEVEL } from './stats.js';

const TEXT_HOLD = 45;   // ticks a revealed battle text stays up before auto-advancing
const HP_TICKS = 24, XP_TICKS = 30, FAINT_TICKS = 18, SLIDE_TICKS = 18, FLEE_TICKS = 12, FADE_IN = 12, SPARKLE_TICKS = 20;
const BALL_ARC = 20, BALL_SHRINK = 10, WOBBLE = 30, BALL_STAR = 20, BALL_POP = 10;
const STICKER = 56;
const FOE_POS = { x: 96, y: 8 }, PLAYER_POS = { x: 8, y: 56 };
const BALL_FROM = { x: 40, y: 80 }, BALL_TO = { x: 124, y: 50 }; // ball rests on the foe's platform, above the player info box
const BOX_Y = 96, BOX_H = 48;
const ACTIONS = ['FIGHT', 'BAG', 'DUMPLINGS', 'RUN'];

const clamp01 = v => Math.max(0, Math.min(1, v));
const upper = s => String(s ?? '').toUpperCase();

/** Displayed (possibly lagging) state of one side: what the info box and sticker show right now. */
function sideView(mon) {
  return { mon, level: mon.level, hp: mon.hp, max: mon.maxHp, hpText: mon.hp, xpRatio: xpRatioOf(mon),
    hidden: false, dx: 0, dy: 0, alpha: 1, scale: 1 };
}
function xpRatioOf(m) {
  if (m.level >= MAX_LEVEL) return 1;
  const lo = xpForLevel(m.level), hi = xpForLevel(m.level + 1);
  return clamp01((m.xp - lo) / (hi - lo));
}

export class BattleScene {
  constructor({ db, state, battle, input, textbox, images = {}, onEnd, audio = null }) {
    Object.assign(this, { db, state, battle, input, textbox, images, onEnd, audio });
    this.queue = [];
    this.current = null;   // the event being played: { type, ..., t } (t = ticks elapsed)
    this.mode = 'events';  // 'events' | 'action' | 'fight' | 'bag' | 'party'
    this.menu = null;
    this.actionMenu = new Menu(ACTIONS, { cols: 2 });
    this.forcedSwitch = false;
    this.ended = false;
    this.fadeIn = 0;
    this.sparkle = 0;
    this.view = {
      player: sideView(battle.player), foe: sideView(battle.foe),
      ball: { visible: false, x: 0, y: 0, star: 0 },
    };
  }

  enter() {
    this.fadeIn = FADE_IN;
    this.pump();
    this.next();
  }

  // ---------------------------------------------------------------- pacing

  update() {
    if (this.ended) return;
    if (this.fadeIn > 0) this.fadeIn--;
    if (this.sparkle > 0) this.sparkle--;
    if (!this.current) { this.pump(); this.next(); }
    if (this.current) { this.step(); return; }
    this.updateMenu();
  }

  /** Pulls the engine's pending events into the queue. */
  pump() { this.queue.push(...this.battle.drain()); }

  /** Starts the next queued event, or opens the right menu when there is nothing left to show. */
  next() {
    if (this.current || this.ended) return;
    const ev = this.queue.shift();
    if (ev) return this.play(ev);
    if (this.mode !== 'events') return; // a menu is already open
    if (this.battle.phase === 'choose') this.openAction();
    else if (this.battle.phase === 'mustSwitch') this.openParty(true);
  }

  /** Starts playing one event (scene-generated texts are expanded here). */
  play(ev) {
    this.mode = 'events';
    this.menu = null;
    const p = this.view.player;
    switch (ev.type) {
      case 'xp':
        this.queue.unshift({ ...ev, type: 'xpbar' });
        return this.play({ type: 'text', text: `${p.mon.nickname} GAINED ${ev.amount} XP!` });
      case 'levelup':
        p.level = ev.level;
        this.sparkle = SPARKLE_TICKS;
        return this.play({ type: 'text', text: `${p.mon.nickname} GREW TO L${ev.level}!` });
      case 'learn': {
        const name = id => upper(this.db.movesById[id]?.name ?? id);
        const forgot = ev.forgot ? `\n... AND FORGOT ${name(ev.forgot)}!` : '';
        return this.play({ type: 'text', text: `${p.mon.nickname} LEARNED ${name(ev.move)}!${forgot}` });
      }
      case 'money':
        return this.play({ type: 'text', text: `${this.state.playerName} GOT $${ev.amount} FOR WINNING!` });
    }
    const cur = { ...ev, t: 0 };
    this.current = cur;
    const side = this.view[ev.side];
    switch (ev.type) {
      case 'text': case 'speech':
        cur.hold = 0;
        this.textbox.say(ev.text);
        cur.page = this.textbox.pageIndex;
        break;
      case 'hp':
        side.max = ev.max;
        cur.tween = new Tween(ev.from, ev.to, HP_TICKS);
        break;
      case 'xpbar': {
        const leveled = ev.level > p.level;
        const range = ev.xpForNext - ev.xpForLevel;
        cur.after = range > 0 ? clamp01((ev.xp - ev.xpForLevel) / range) : 1;
        const from = leveled ? p.xpRatio : clamp01((ev.xp - ev.amount - ev.xpForLevel) / (range || 1));
        cur.tween = new Tween(from, leveled ? 1 : cur.after, XP_TICKS);
        break;
      }
      case 'switch':
        cur.mon = ev.side === 'player' ? this.state.party[ev.index] : this.battle.foeParty[ev.index];
        break;
      case 'end':
        this.ended = true;
        this.current = null;
        this.onEnd?.(ev.result);
        break;
    }
  }

  /** Advances the current event by one tick; clears `current` when it is finished. */
  step() {
    const cur = this.current, tb = this.textbox, v = this.view;
    const side = v[cur.side];
    cur.t++;
    let done = false;
    switch (cur.type) {
      case 'text': case 'speech': {
        tb.update(this.input); // A advances/dismisses (TextBox guards the tick it opened on)
        if (tb.pageIndex !== cur.page) { cur.page = tb.pageIndex; cur.hold = 0; }
        if (tb.open && cur.type === 'text' && tb.revealed && ++cur.hold >= TEXT_HOLD) {
          cur.hold = 0;
          if (tb.onLastPage) tb.dismiss(); else tb.advance();
        }
        done = !tb.open;
        break;
      }
      case 'hp':
        cur.tween.update();
        side.hp = cur.tween.value;
        side.hpText = Math.round(cur.tween.value);
        done = cur.tween.done;
        break;
      case 'xpbar':
        cur.tween.update();
        v.player.xpRatio = cur.tween.value;
        if (cur.tween.done) { v.player.xpRatio = cur.after; done = true; }
        break;
      case 'faint': {
        const k = Math.min(1, cur.t / FAINT_TICKS);
        side.dy = Math.round(60 * k); side.alpha = 1 - k;
        if (k >= 1) { Object.assign(side, { hidden: true, dy: 0, alpha: 1 }); done = true; }
        break;
      }
      case 'switch': {
        const dir = cur.side === 'player' ? -1 : 1; // player exits left, foe exits right
        if (cur.t <= SLIDE_TICKS) side.dx = Math.round(dir * 80 * cur.t / SLIDE_TICKS);
        if (cur.t === SLIDE_TICKS) { // off-screen: swap in the new monster's info
          Object.assign(side, this.enteringView(cur.side, cur.mon));
          side.dx = dir * 80;
          if (cur.side === 'foe') v.ball.visible = false;
        }
        if (cur.t > SLIDE_TICKS) side.dx = Math.round(dir * 80 * (1 - (cur.t - SLIDE_TICKS) / SLIDE_TICKS));
        done = cur.t >= 2 * SLIDE_TICKS;
        break;
      }
      case 'ball': done = this.stepBall(cur); break;
      case 'flee':
        v.foe.dx = Math.round(80 * Math.min(1, cur.t / FLEE_TICKS));
        if (cur.t >= FLEE_TICKS) { v.foe.hidden = true; v.foe.dx = 0; done = true; }
        break;
      default: done = true; // 'stat' and anything unknown: one tick, text carries it
    }
    if (done) this.current = null;
    return done;
  }

  /**
   * The view for a monster switching in. The engine has already resolved the rest of the turn, so
   * the monster's hp/level may be ahead of what the queued events still have to animate: rewind
   * them to the first queued hp event's `from` and the level before any queued level-ups.
   */
  enteringView(sideName, mon) {
    const view = sideView(mon);
    let sawHp = false, xpEv = null;
    for (const e of this.queue) {
      if (e.type === 'switch' && e.side === sideName) break;
      if (e.side !== sideName) continue;
      if (e.type === 'hp' && !sawHp) { sawHp = true; view.hp = view.hpText = e.from; }
      if (e.type === 'levelup') view.level--;
      if (e.type === 'xp' && !xpEv) xpEv = e;
    }
    if (xpEv) view.xpRatio = xpRatioOf({ level: view.level, xp: xpEv.xp - xpEv.amount });
    return view;
  }

  /** Ball timeline: arc → foe shrinks in → wobbles → star (caught) or pop back out. */
  stepBall(cur) {
    const { foe } = this.view, ball = this.view.ball, t = cur.t;
    const shrinkEnd = BALL_ARC + BALL_SHRINK, wobbleEnd = shrinkEnd + cur.wobbles * WOBBLE;
    ball.visible = true; ball.star = 0;
    if (t <= BALL_ARC) {
      const k = t / BALL_ARC;
      ball.x = Math.round(BALL_FROM.x + (BALL_TO.x - BALL_FROM.x) * k);
      ball.y = Math.round(BALL_FROM.y + (BALL_TO.y - BALL_FROM.y) * k - 40 * Math.sin(Math.PI * k));
    } else if (t <= shrinkEnd) {
      foe.scale = 1 - (t - BALL_ARC) / BALL_SHRINK;
      if (t === shrinkEnd) foe.hidden = true;
    } else if (t <= wobbleEnd) {
      const k = ((t - shrinkEnd) % WOBBLE) / WOBBLE;
      ball.x = BALL_TO.x + Math.round(3 * Math.sin(2 * Math.PI * k));
      if (t === wobbleEnd) ball.x = BALL_TO.x;
    } else if (cur.success) {
      ball.star = 1;
      if (t >= wobbleEnd + BALL_STAR) { ball.star = 0; return true; }
    } else {
      ball.visible = false;
      foe.hidden = false;
      foe.scale = Math.min(1, (t - wobbleEnd) / BALL_POP);
      if (t >= wobbleEnd + BALL_POP) { foe.scale = 1; return true; }
    }
    return false;
  }

  // ---------------------------------------------------------------- menus

  openAction() { this.mode = 'action'; this.menu = this.actionMenu; }

  openFight() {
    const moves = this.battle.player.moves;
    const struggle = moves.every(m => m.pp <= 0);
    const prev = this.fightIndex ?? 0;
    this.menu = new Menu(struggle ? ['STRUGGLE'] : moves.map(m => upper(this.db.movesById[m.id]?.name ?? m.id)));
    this.menu.index = Math.min(prev, this.menu.items.length - 1);
    this.menu.struggle = struggle;
    this.mode = 'fight';
  }

  openBag() {
    const ids = Object.keys(this.state.bag).filter(id => this.state.bag[id] > 0 && this.db.itemsById[id]?.battle != null);
    if (!ids.length) return this.play({ type: 'text', text: 'THE BAG IS EMPTY.' });
    this.menu = new Menu(ids.map(id => `${this.db.itemsById[id].name} x${this.state.bag[id]}`));
    this.menu.ids = ids;
    this.mode = 'bag';
  }

  openParty(forced = false) {
    this.forcedSwitch = forced;
    this.menu = new Menu(this.state.party.map(m => `${m.nickname} L${m.level} HP ${m.hp}/${m.maxHp}`));
    if (forced) this.menu.index = Math.max(0, this.state.party.findIndex(m => m.hp > 0));
    this.mode = 'party';
  }

  /** Runs one battle.* action, then pulls its events so they play from the next tick. */
  act(fn) {
    this.mode = 'events';
    this.menu = null;
    fn();
    this.pump();
  }

  updateMenu() {
    const { input, battle } = this;
    const back = () => this.openAction();
    switch (this.mode) {
      case 'action':
        return this.menu.handle(input, { onSelect: item => {
          if (item === 'FIGHT') this.openFight();
          else if (item === 'BAG') this.openBag();
          else if (item === 'DUMPLINGS') this.openParty(false);
          else if (item === 'RUN') this.act(() => battle.run());
        } });
      case 'fight':
        return this.menu.handle(input, { onCancel: back, onSelect: (_, i) => {
          const struggle = this.menu.struggle;
          this.fightIndex = i;
          this.act(() => battle.chooseMove(struggle ? 'struggle' : i));
        } });
      case 'bag':
        return this.menu.handle(input, { onCancel: back, onSelect: (_, i) => {
          const id = this.menu.ids[i];
          this.act(() => battle.useItem(id));
        } });
      case 'party':
        return this.menu.handle(input, {
          onCancel: this.forcedSwitch ? undefined : back,
          onSelect: (_, i) => this.act(() => battle.switchTo(i)),
        });
    }
  }

  // ---------------------------------------------------------------- drawing

  draw(ctx) {
    const v = this.view;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = GRASS_L;
    ellipse(ctx, FOE_POS.x + STICKER / 2, FOE_POS.y + STICKER - 6, 30, 6);
    ellipse(ctx, PLAYER_POS.x + STICKER / 2, 92, 34, 7);

    this.drawSticker(ctx, v.foe, FOE_POS, false);
    this.drawSticker(ctx, v.player, PLAYER_POS, true);
    if (this.sparkle > 0) {
      const cx = PLAYER_POS.x + STICKER / 2, cy = PLAYER_POS.y + 20, r = 26 + (this.sparkle % 4);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * 2 * Math.PI + this.sparkle * 0.1;
        drawStar(ctx, Math.round(cx + r * Math.cos(a)) - 2, Math.round(cy + r * Math.sin(a)) - 2, YELLOW);
      }
    }

    this.drawFoeInfo(ctx, v.foe);
    this.drawPlayerInfo(ctx, v.player);
    if (v.ball.visible) drawBall(ctx, v.ball.x, v.ball.y);
    if (v.ball.star) drawStar(ctx, v.ball.x + 4, v.ball.y - 14, YELLOW);
    this.drawBottom(ctx);
    drawFade(ctx, this.fadeIn / FADE_IN);
  }

  drawSticker(ctx, side, pos, mirror) {
    if (side.hidden || side.scale <= 0) return;
    // scale < 1 only happens to the foe during a ball throw: shrink into the ball's resting spot
    const size = Math.round(STICKER * side.scale);
    const x = Math.round(BALL_TO.x + (pos.x - BALL_TO.x) * side.scale) + side.dx;
    const y = Math.round(BALL_TO.y + (pos.y - BALL_TO.y) * side.scale) + side.dy;
    const img = this.images?.[side.mon.speciesId];
    ctx.save();
    ctx.globalAlpha = side.alpha;
    if (img && img.complete !== false && (img.naturalWidth ?? 1) > 0) {
      ctx.imageSmoothingEnabled = true; // stickers are photos: smooth scaling looks crisper than nearest
      if (mirror) { ctx.translate(x + size, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, size, size); }
      else ctx.drawImage(img, x, y, size, size);
      ctx.imageSmoothingEnabled = false;
    } else {
      ctx.fillStyle = '#a0a0a0';
      ctx.fillRect(x, y, size, size);
      if (size >= 12) drawText(ctx, '?', x + (size >> 1) - 2, y + (size >> 1) - 3, INK);
    }
    ctx.restore();
  }

  drawFoeInfo(ctx, s) {
    const x = 8, y = 8;
    drawText(ctx, s.mon.nickname.slice(0, 10), x + 2, y + 1, INK);
    const lv = `L${s.level}`;
    drawText(ctx, lv, x + 80 - measure(lv), y + 10, INK);
    drawHpBar(ctx, x + 14, y + 19, 64, 4, s.hp / s.max);
    ctx.fillStyle = INK;
    ctx.fillRect(x, y + 1, 1, 24); ctx.fillRect(x, y + 25, 80, 1); // Gen-1 corner bracket
  }

  drawPlayerInfo(ctx, s) {
    const x = 88, y = 60; // 68×36: name / level / HP bar / HP text / XP bar
    ctx.fillStyle = PAPER; ctx.fillRect(x, y, 68, 36); // sits over the foe's platform
    drawText(ctx, s.mon.nickname.slice(0, 10), x + 3, y + 1, INK);
    const lv = `L${s.level}`;
    drawText(ctx, lv, x + 67 - measure(lv), y + 9, INK);
    drawHpBar(ctx, x + 18, y + 18, 48, 4, s.hp / s.max);
    drawText(ctx, `HP ${s.hpText}/${s.max}`, x + 3, y + 24, INK);
    ctx.fillStyle = INK;
    ctx.fillRect(x + 18, y + 32, 48, 2);
    ctx.fillStyle = '#4878d8';
    ctx.fillRect(x + 18, y + 32, Math.round(48 * clamp01(s.xpRatio)), 2);
    ctx.fillStyle = INK;
    ctx.fillRect(x + 67, y, 1, 36); ctx.fillRect(x, y + 35, 68, 1); // Gen-1 corner bracket
  }

  drawBottom(ctx) {
    if (this.mode === 'events') {
      if (this.textbox.open) this.textbox.draw(ctx);
      else paperBox(ctx, 0, BOX_Y, W, BOX_H);
      return;
    }
    if (this.mode === 'action') {
      paperBox(ctx, 0, BOX_Y, W, BOX_H);
      this.menu.items.forEach((item, i) => {
        const cx = 16 + (i % 2) * 80, cy = BOX_Y + 12 + Math.floor(i / 2) * 16;
        if (i === this.menu.index) drawText(ctx, '▶', cx - 10, cy, INK);
        drawText(ctx, item, cx, cy, INK);
      });
    } else if (this.mode === 'fight') {
      // 4 rows of 10 px: move names can be 10 chars, so a 2×2 grid would collide with the PP panel.
      paperBox(ctx, 0, BOX_Y, W, BOX_H);
      for (let i = 0; i < 4; i++) {
        const cy = BOX_Y + 5 + i * 10, item = this.menu.items[i];
        if (i === this.menu.index && item) drawText(ctx, '▶', 6, cy, INK);
        drawText(ctx, item ?? '-', 16, cy, INK);
      }
      ctx.fillStyle = INK; ctx.fillRect(96, BOX_Y + 4, 1, BOX_H - 8);
      const slot = this.menu.struggle ? null : this.battle.player.moves[this.menu.index];
      const move = slot && this.db.movesById[slot.id];
      drawText(ctx, 'TYPE/', 100, 104, INK);
      drawText(ctx, move?.type ? upper(move.type) : '-', 100, 114, INK);
      drawText(ctx, slot ? `PP ${slot.pp}/${slot.maxPp}` : 'PP -', 100, 128, slot?.pp === 0 ? RED : INK);
    } else {
      // bag / party: a list that grows upward from the bottom edge
      const rows = Math.min(this.menu.items.length, 6);
      this.menu.draw(ctx, 0, H - (16 + rows * 16), W, { rows });
    }
  }
}

// ---------------------------------------------------------------- draw helpers

function paperBox(ctx, x, y, w, h) {
  ctx.fillStyle = PAPER; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = INK;
  ctx.fillRect(x, y, w, 2); ctx.fillRect(x, y + h - 2, w, 2);
  ctx.fillRect(x, y, 2, h); ctx.fillRect(x + w - 2, y, 2, h);
}

/** A flat pixel ellipse (horizontal scanlines), no anti-aliasing. */
function ellipse(ctx, cx, cy, rx, ry) {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(1 - (dy / ry) ** 2));
    ctx.fillRect(cx - half, cy + dy, half * 2, 1);
  }
}

/** 10 px dumpling ball: red top, white bottom, ink outline + center line, centered on (x, y). */
function drawBall(ctx, x, y) {
  const R = [3, 4, 5, 5, 5, 5, 5, 5, 4, 3]; // half-widths per row
  for (let r = 0; r < 10; r++) {
    const half = R[r], yy = y - 5 + r;
    ctx.fillStyle = INK; ctx.fillRect(x - half, yy, half * 2, 1);
    if (r === 0 || r === 9) continue;
    ctx.fillStyle = r < 5 ? RED : WHITE;
    ctx.fillRect(x - half + 1, yy, half * 2 - 2, 1);
  }
  ctx.fillStyle = INK; ctx.fillRect(x - 5, y, 10, 1);
  ctx.fillStyle = WHITE; ctx.fillRect(x - 1, y - 1, 2, 2);
}

/** 5×5 pixel star (the font has no ★ glyph). */
function drawStar(ctx, x, y, color) {
  const rows = ['..#..', '.###.', '#####', '.###.', '.#.#.'];
  ctx.fillStyle = INK;
  rows.forEach((row, r) => { for (let c = 0; c < 5; c++) if (row[c] === '#') ctx.fillRect(x + c - 1, y + r - 1, 3, 3); });
  ctx.fillStyle = color;
  rows.forEach((row, r) => { for (let c = 0; c < 5; c++) if (row[c] === '#') ctx.fillRect(x + c, y + r, 1, 1); });
}
