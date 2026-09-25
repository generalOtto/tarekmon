// BattleScene: renders a Battle and paces its events. The engine resolves a whole turn at once;
// this scene replays the resulting events one at a time (text, bar tweens, sticker animations),
// then shows the action menu when the queue is empty. Pacing lives in update()/play()/step() and
// only mutates `this.view`; drawing is in battledraw.js, which reads the scene and never mutates
// it — so pacing tests run headless.
import { Menu } from '../ui/menu.js';
import { Tween } from '../ui/hpbar.js';
import { xpForLevel, MAX_LEVEL } from './stats.js';
import { drawBattle, BALL_FROM, BALL_TO } from './battledraw.js';
import { BagScreen } from '../ui/bag.js';
import { PartyScreen } from '../ui/party.js';

/** Pacing, in ticks (60/s). */
export const TIMING = Object.freeze({
  TEXT_HOLD: 45, // a revealed battle text stays up this long before auto-advancing
  HP: 24, XP: 30, FAINT: 18, SLIDE: 18, FLEE: 12, FADE_IN: 12, SPARKLE: 20,
  BALL_ARC: 20, BALL_SHRINK: 10, WOBBLE: 30, BALL_STAR: 20, BALL_POP: 10,
});
const { TEXT_HOLD, FAINT: FAINT_TICKS, SLIDE: SLIDE_TICKS, FLEE: FLEE_TICKS, FADE_IN,
  BALL_ARC, BALL_SHRINK, WOBBLE, BALL_STAR, BALL_POP } = TIMING;
const ACTIONS = ['FIGHT', 'BAG', 'DUMPLINGS', 'RUN'];

const clamp01 = v => Math.max(0, Math.min(1, v));
const upper = s => String(s ?? '').toUpperCase();

/**
 * Displayed (possibly lagging) state of one side: what the info box and sticker show right now.
 * `snap` ({hp, maxHp, level, xp}, e.g. a switch event's emit-time snapshot) overrides the live
 * monster, whose numbers may already reflect the rest of the turn.
 */
function sideView(mon, snap = mon) {
  const { hp, maxHp, level, xp } = snap;
  return { mon, level, hp, max: maxHp, hpText: hp, xpRatio: xpRatioOf({ level, xp }),
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
    this.screen = null;    // the BagScreen / PartyScreen overlay while mode is 'bag' / 'party'
    this.actionMenu = new Menu(ACTIONS, { cols: 2 });
    this.returnTo = null; // 'party': reopen the party list after a rejected voluntary switch
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
    if (this.current) {
      // An event that finishes hands straight over to the next one (or the menu) this tick,
      // so no empty-box frame flashes between two texts.
      if (this.step()) { this.pump(); this.next(); }
      return;
    }
    this.updateMenu();
  }

  get fadeAlpha() { return this.fadeIn / FADE_IN; }

  /** Pulls the engine's pending events into the queue. */
  pump() { this.queue.push(...this.battle.drain()); }

  /** Starts the next queued event, or opens the right menu when there is nothing left to show. */
  next() {
    if (this.current || this.ended) return;
    const ev = this.queue.shift();
    if (ev) return this.play(ev);
    if (this.mode !== 'events') return; // a menu is already open
    const back = this.returnTo;
    this.returnTo = null;
    if (this.battle.phase === 'choose') { if (back === 'party') this.openParty(false); else this.openAction(); }
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
        this.sparkle = TIMING.SPARKLE;
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
        cur.tween = new Tween(ev.from, ev.to, TIMING.HP);
        break;
      case 'xpbar': {
        const leveled = ev.level > p.level;
        const range = ev.xpForNext - ev.xpForLevel;
        cur.after = range > 0 ? clamp01((ev.xp - ev.xpForLevel) / range) : 1;
        const from = leveled ? p.xpRatio : clamp01((ev.xp - ev.amount - ev.xpForLevel) / (range || 1));
        cur.tween = new Tween(from, leveled ? 1 : cur.after, TIMING.XP);
        break;
      }
      case 'switch':
        cur.mon = ev.side === 'player' ? this.state.party[ev.index] : this.battle.foeParty[ev.index];
        if (side.hidden) cur.t = SLIDE_TICKS - 1; // a fainted side has nothing to slide out
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
        const wasRevealed = tb.pageRevealed; // the hold starts on the tick after the page finishes typing
        tb.update(this.input); // A advances/dismisses (TextBox guards the tick it opened on)
        if (tb.pageIndex !== cur.page) { cur.page = tb.pageIndex; cur.hold = 0; }
        else if (tb.open && cur.type === 'text' && wasRevealed && ++cur.hold >= TEXT_HOLD) {
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
          Object.assign(side, sideView(cur.mon, cur.hp != null ? cur : cur.mon));
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
    this.openScreen('bag', new BagScreen({ ...this.screenOpts(), context: 'battle',
      onUse: (id, i) => this.act(() => this.battle.useItem(id, i)) }));
  }

  openParty(forced = false) {
    this.openScreen('party', new PartyScreen({ ...this.screenOpts(), mode: 'switch', forced, battle: this.battle,
      onPick: i => {
        // a rejected voluntary pick (already out / no energy) comes back to the party screen, not the action menu
        const m = this.state.party[i];
        if (!forced && (i === this.battle.playerIndex || !(m?.hp > 0))) this.returnTo = 'party';
        this.act(() => this.battle.switchTo(i));
      } }));
  }

  screenOpts() { return { state: this.state, db: { ...this.db, images: this.images }, textbox: this.textbox }; }

  /** Shows a shared overlay screen; backing out of it (B, or an empty bag) returns to the action menu. */
  openScreen(mode, screen) {
    this.mode = mode;
    this.menu = null;
    this.screen = screen;
    screen.onClose = () => { if (this.screen === screen) { this.screen = null; this.openAction(); } };
  }

  /** Runs one battle.* action, then pulls its events so they play from the next tick. */
  act(fn) {
    const screen = this.screen;
    this.screen = null; // detach first, so its close() below doesn't reopen the action menu
    screen?.close();
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
      case 'bag': case 'party':
        return this.screen?.update(input);
    }
  }

  // ---------------------------------------------------------------- drawing

  draw(ctx) {
    drawBattle(ctx, this);
    if (this.screen) { this.screen.draw(ctx); this.textbox.draw(ctx); } // INFO / no-effect lines over the screen
  }
}
