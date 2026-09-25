import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BattleScene } from '../../src/battle/battlescene.js';
import { Battle } from '../../src/battle/battle.js';
import { makeMonster } from '../../src/battle/monster.js';
import { newGameState } from '../../src/engine/state.js';
import types from '../../data/types.json' with { type: 'json' };
import items from '../../data/items.json' with { type: 'json' };

// Minimal fixture (duplicated from battle.test.js).
const movesById = {
  hit: { id: 'hit', name: 'HIT', type: 'Fried', power: 50, accuracy: 100, pp: 10, effect: { kind: 'none' }, text: '{user} hits.' },
  skip: { id: 'skip', name: 'SKIP', type: 'Imported', power: 0, accuracy: 100, pp: 5, effect: { kind: 'skip' }, text: '{foe} waits.' },
};
const speciesById = {
  pA: { id: 'pA', name: 'PLAYERMON', type: 'Fried', base: { hp: 60, atk: 70, def: 50, spd: 80 }, xpYield: 60, catchRate: 190, moves: [{ level: 1, id: 'hit' }, { level: 1, id: 'skip' }], who: 'tarek' },
  fW: { id: 'fW', name: 'WILDY', type: 'Steamed', base: { hp: 40, atk: 40, def: 40, spd: 30 }, xpYield: 60, catchRate: 190, moves: [{ level: 1, id: 'hit' }], who: 'otto' },
};
const db = { types, movesById, speciesById, itemsById: Object.fromEntries(items.map(i => [i.id, i])) };
const mon = (sp, level) => makeMonster(speciesById[sp], level, movesById, () => 0.5);
const high = () => 0.9;

const DIRS = ['up', 'down', 'left', 'right'];
/** Stub input: the buttons in `pressed` are justPressed (and down) for the current update only. */
function stubInput() {
  const inp = {
    pressed: new Set(),
    justPressed: b => inp.pressed.has(b), isDown: b => inp.pressed.has(b),
    pressedDirection: () => DIRS.find(d => inp.pressed.has(d)) ?? null,
  };
  return inp;
}
/** Stub textbox: say() returns a promise resolved by dismiss() or an A press; pages are always revealed. */
function stubTextbox() {
  const tb = {
    open: false, said: [], revealed: true, onLastPage: true, _resolve: null,
    say(text) { tb.said.push(text); tb.open = true; return new Promise(r => { tb._resolve = r; }); },
    update(input) { if (tb.open && input.justPressed('a')) tb.dismiss(); },
    advance() { tb.dismiss(); },
    dismiss() { tb.open = false; const r = tb._resolve; tb._resolve = null; r?.(); },
    draw() {},
  };
  return tb;
}

function setup({ party = [mon('pA', 10)], foes = [mon('fW', 3)], rng = high, onEnd = () => {} } = {}) {
  const state = newGameState();
  state.party.push(...party);
  const battle = new Battle({ db, state, rng, kind: 'wild', foeParty: foes });
  const input = stubInput(), textbox = stubTextbox();
  const scene = new BattleScene({ db, state, battle, input, textbox, images: {}, onEnd });
  const tick = (...btns) => { input.pressed = new Set(btns.filter(Boolean)); scene.update(1 / 60); input.pressed = new Set(); };
  /** Presses A through texts until the scene is idle (a menu is showing) or the battle ended. */
  const clearTexts = (max = 2000) => { for (let i = 0; i < max && scene.mode === 'events' && !scene.ended; i++) tick(textbox.open ? 'a' : null); };
  scene.enter();
  return { scene, battle, state, input, textbox, tick, clearTexts };
}

test('enter drains the intro texts and shows the first', () => {
  const { scene, textbox } = setup();
  assert.deepEqual(textbox.said, ['A WILD WILDY APPEARED!']);
  assert.equal(scene.current.type, 'text');
  assert.deepEqual(scene.queue.map(e => e.text), ['GO! PLAYERMON!']);
  assert.equal(scene.mode, 'events');
});

test('battle text auto-advances 45 ticks after it is revealed; A skips the wait', () => {
  const { scene, textbox, tick } = setup();
  for (let i = 0; i < 44; i++) tick();
  assert.equal(textbox.said.length, 1);
  assert.equal(textbox.open, true);
  tick();
  assert.equal(textbox.open, false, 'dismissed after 45 revealed ticks');
  tick(); // next event starts
  assert.deepEqual(textbox.said, ['A WILD WILDY APPEARED!', 'GO! PLAYERMON!']);
  tick('a');
  assert.equal(textbox.open, false);
  assert.equal(scene.current, null);
});

test('after the intro texts the action menu opens', () => {
  const { scene, clearTexts } = setup();
  clearTexts();
  assert.equal(scene.mode, 'action');
});

test('FIGHT → move 0 calls battle.chooseMove(0) and queues its events in order', () => {
  const { scene, battle, tick, clearTexts } = setup();
  clearTexts();
  const calls = [], drained = [];
  const orig = battle.chooseMove.bind(battle), origDrain = battle.drain.bind(battle);
  battle.chooseMove = i => { calls.push(i); return orig(i); };
  battle.drain = () => { const e = origDrain(); drained.push(...e); return e; };
  tick('a'); // FIGHT
  assert.equal(scene.mode, 'fight');
  tick('a'); // move 0
  assert.deepEqual(calls, [0]);
  assert.ok(drained.length > 3);
  assert.deepEqual([scene.current, ...scene.queue].filter(Boolean), drained);
  assert.equal(scene.mode, 'events');
});

test('B backs out of the move menu to the action menu', () => {
  const { scene, tick, clearTexts } = setup();
  clearTexts();
  tick('a'); assert.equal(scene.mode, 'fight');
  tick('b'); assert.equal(scene.mode, 'action');
});

test('an hp event animates the bar over 24 ticks to to/max', () => {
  const { scene, clearTexts } = setup();
  clearTexts();
  scene.play({ type: 'hp', side: 'foe', from: 20, to: 5, max: 20 });
  for (let i = 0; i < 12; i++) scene.update();
  const mid = scene.view.foe.hp / scene.view.foe.max;
  assert.ok(mid < 1 && mid > 0.25, `mid-animation ratio ${mid}`);
  for (let i = 0; i < 12; i++) scene.update();
  assert.equal(scene.view.foe.hp / scene.view.foe.max, 5 / 20);
  assert.equal(scene.current, null);
});

test('player hp number counts along with the bar', () => {
  const { scene, clearTexts } = setup();
  clearTexts();
  scene.play({ type: 'hp', side: 'player', from: 40, to: 16, max: 40 });
  for (let i = 0; i < 12; i++) scene.update();
  assert.equal(scene.view.player.hpText, 28);
  for (let i = 0; i < 12; i++) scene.update();
  assert.equal(scene.view.player.hpText, 16);
});

test('end → onEnd called once with the result, after the last text is dismissed', () => {
  const results = [];
  let textbox;
  const onEnd = r => results.push({ r, open: textbox.open });
  const s = setup({ party: [mon('pA', 30)], onEnd });
  const { scene, battle, tick, clearTexts } = s;
  textbox = s.textbox;
  clearTexts();
  tick('a'); tick('a'); // FIGHT → HIT: a L30 hit KOs a L3 foe
  assert.equal(battle.phase, 'over');
  for (let i = 0; i < 2000 && !results.length; i++) tick(textbox.open ? 'a' : null);
  assert.equal(results.length, 1);
  assert.equal(results[0].r, 'win');
  assert.equal(results[0].open, false, 'the last text was dismissed before onEnd');
  assert.ok(textbox.said.includes('WILD WILDY FAINTED!'));
  assert.match(textbox.said.at(-1), /^PLAYERMON GAINED \d+ XP!$/, 'the last text before the end');
  assert.equal(scene.ended, true);
  for (let i = 0; i < 50; i++) tick('a');
  assert.equal(results.length, 1);
});

test('xp shows a GAINED text in front of the bar animation', () => {
  const { scene, textbox, clearTexts } = setup();
  clearTexts();
  const p = scene.view.player.mon;
  scene.play({ type: 'xp', side: 'player', amount: 7, xp: p.xp + 7, level: p.level, xpForLevel: p.xp, xpForNext: p.xp + 70 });
  assert.equal(textbox.said.at(-1), 'PLAYERMON GAINED 7 XP!');
  assert.equal(scene.queue[0].type, 'xpbar');
});

test('phase mustSwitch opens the party list automatically and B is ignored', () => {
  const { scene, battle, tick, clearTexts } = setup({ party: [mon('pA', 2), mon('pA', 10)], foes: [mon('fW', 30)] });
  clearTexts();
  tick('a'); tick('a');
  assert.equal(battle.phase, 'mustSwitch');
  clearTexts();
  assert.equal(scene.mode, 'party');
  tick('b');
  assert.equal(scene.mode, 'party');
  assert.equal(scene.menu.index, 1, 'cursor starts on the first healthy member');
  tick('a');
  assert.equal(battle.playerIndex, 1);
  assert.equal(scene.mode, 'events');
});

test('speech waits for A (no auto-advance)', () => {
  const { scene, textbox, tick, clearTexts } = setup();
  clearTexts();
  scene.play({ type: 'speech', text: 'YOU FOUGHT WELL.' });
  for (let i = 0; i < 200; i++) tick();
  assert.equal(textbox.open, true);
  assert.equal(scene.current.type, 'speech');
  tick('a');
  assert.equal(textbox.open, false);
});

test('all moves at 0 PP → FIGHT shows only STRUGGLE', () => {
  const { scene, battle, tick, clearTexts } = setup();
  clearTexts();
  for (const m of battle.player.moves) m.pp = 0;
  const calls = [];
  battle.chooseMove = i => calls.push(i);
  tick('a');
  assert.deepEqual(scene.menu.items, ['STRUGGLE']);
  tick('a');
  assert.deepEqual(calls, ['struggle']);
});

test('BAG lists battle items with count > 0 and uses the selected one', () => {
  const { scene, state, battle, tick, clearTexts } = setup();
  clearTexts();
  state.bag = { 'dumpling-ball': 3, 'wet-wipe': 0, 'extra-sauce': 1 };
  const calls = [];
  battle.useItem = id => calls.push(id);
  tick('right'); tick('a');
  assert.equal(scene.mode, 'bag');
  assert.deepEqual(scene.menu.items, ['DUMPLINGBALL x3', 'EXTRA SAUCE x1']);
  tick('a');
  assert.deepEqual(calls, ['dumpling-ball']);
});

test('ball event: success hides the foe and keeps the ball; timeline length matches wobbles', () => {
  const { scene, clearTexts } = setup();
  clearTexts();
  scene.play({ type: 'ball', wobbles: 3, success: true });
  const total = 20 + 10 + 3 * 30 + 20;
  for (let i = 0; i < total - 1; i++) scene.update();
  assert.equal(scene.current?.type, 'ball');
  scene.update();
  assert.equal(scene.current, null);
  assert.equal(scene.view.foe.hidden, true);
  assert.equal(scene.view.ball.visible, true);
});

test('ball event: failure pops the foe back and hides the ball', () => {
  const { scene, clearTexts } = setup();
  clearTexts();
  scene.play({ type: 'ball', wobbles: 1, success: false });
  for (let i = 0; i < 20 + 10 + 30 + 10; i++) scene.update();
  assert.equal(scene.current, null);
  assert.equal(scene.view.foe.hidden, false);
  assert.equal(scene.view.foe.scale, 1);
  assert.equal(scene.view.ball.visible, false);
});

test('a monster switching in shows its pre-turn hp until the queued hp event animates it', () => {
  const { scene, battle, tick, clearTexts } = setup({ party: [mon('pA', 10), mon('pA', 10)], foes: [mon('fW', 8)] });
  clearTexts();
  tick('down'); tick('a'); // DUMPLINGS
  assert.equal(scene.mode, 'party');
  tick('down'); tick('a'); // switch to #1; the foe then attacks it
  const incoming = battle.player;
  assert.ok(incoming.hp < incoming.maxHp, 'the foe hit the incoming monster');
  for (let i = 0; i < 2000 && scene.current?.type !== 'switch'; i++) tick(scene.textbox.open ? 'a' : null);
  while (scene.current?.type === 'switch') tick();
  assert.equal(scene.view.player.mon, incoming);
  assert.equal(scene.view.player.hpText, incoming.maxHp, 'switched in at full hp');
  assert.ok(scene.queue.some(e => e.type === 'hp' && e.side === 'player'), 'the damage is still to be animated');
});

test('xp with a level-up fills the bar to 1, then resets to the new level ratio; levelup text + sparkle', () => {
  const { scene, textbox, clearTexts } = setup();
  clearTexts();
  const p = scene.view.player, lv = p.level;
  scene.play({ type: 'xpbar', side: 'player', amount: 500, xp: 1100, level: lv + 1, xpForLevel: 1000, xpForNext: 1400 });
  for (let i = 0; i < 29; i++) scene.update();
  assert.ok(p.xpRatio > 0.9 && p.xpRatio < 1);
  scene.update();
  assert.equal(p.xpRatio, 0.25);
  assert.equal(scene.current, null);
  scene.play({ type: 'levelup', side: 'player', level: lv + 1 });
  assert.equal(p.level, lv + 1);
  assert.equal(textbox.said.at(-1), `PLAYERMON GREW TO L${lv + 1}!`);
  assert.equal(scene.sparkle, 20);
});

test('learn text names the move, and the forgotten one', () => {
  const { scene, textbox, clearTexts } = setup();
  clearTexts();
  scene.play({ type: 'learn', side: 'player', move: 'skip', forgot: 'hit' });
  assert.equal(textbox.said.at(-1), 'PLAYERMON LEARNED SKIP!\n... AND FORGOT HIT!');
});
