import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PartyScreen } from '../../src/ui/party.js';
import { newGameState } from '../../src/engine/state.js';

const DIRS = ['up', 'down', 'left', 'right'];
function stubInput() {
  const inp = { pressed: new Set(), justPressed: b => inp.pressed.has(b), isDown: b => inp.pressed.has(b),
    pressedDirection: () => DIRS.find(d => inp.pressed.has(d)) ?? null };
  return inp;
}
function stubTextbox() {
  const tb = { open: false, said: [], say(t) { tb.said.push(t); tb.open = true; return new Promise(r => { tb._r = r; }); },
    update(input) { if (tb.open && input.justPressed('a')) { tb.open = false; tb._r?.(); } }, draw() {} };
  return tb;
}
/** A recording 2D-context stand-in: every method is a no-op, every property assignable. */
function fakeCtx() {
  return new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
}
const mon = (nickname, hp = 20, maxHp = 20) => ({ speciesId: 'x', nickname, level: 5, xp: 125, hp, maxHp,
  stats: { hp: maxHp, atk: 9, def: 8, spd: 7 }, moves: [{ id: 'hit', pp: 3, maxPp: 10 }] });

function setup(opts = {}, party = [mon('AAA'), mon('BBB', 5), mon('CCC', 0)]) {
  const state = newGameState();
  state.party.push(...party);
  const input = stubInput(), textbox = stubTextbox(), picks = [], closes = [];
  const screen = new PartyScreen({ state, db: {}, textbox, onPick: i => picks.push(i), onClose: () => closes.push(1), ...opts });
  const tick = (...b) => { input.pressed = new Set(b); screen.update(input); input.pressed = new Set(); };
  return { state, screen, tick, picks, closes, textbox };
}

test('rows reflect state.party, empty slots draw -----', () => {
  const { screen } = setup();
  assert.deepEqual(screen.rows(), ['AAA L5 HP 20/20', 'BBB L5 HP 5/20', 'CCC L5 HP 0/20', '-----', '-----', '-----']);
  assert.doesNotThrow(() => screen.draw(fakeCtx()));
});

test('pick mode calls onPick with the index; fainted targets are refused', () => {
  const { screen, tick, picks, textbox } = setup({ mode: 'pick' });
  tick('down'); tick('a');
  assert.deepEqual(picks, [1]);
  tick('down'); tick('a');
  assert.deepEqual(picks, [1]);
  assert.equal(textbox.said.at(-1), "IT WON'T HAVE ANY EFFECT.");
  assert.equal(screen.open, true);
});

test('switch mode picks immediately (the host decides), fainted included', () => {
  const { tick, picks } = setup({ mode: 'switch' });
  tick('down'); tick('down'); tick('a');
  assert.deepEqual(picks, [2]);
});

test('manage → SWITCH swaps two members', () => {
  const { state, screen, tick } = setup();
  tick('a'); // context menu on AAA
  assert.deepEqual(screen.context.items, ['SUMMARY', 'SWITCH', 'CANCEL']);
  tick('down'); tick('a'); // SWITCH
  assert.equal(screen.swapFrom, 0);
  assert.doesNotThrow(() => screen.draw(fakeCtx()));
  tick('down'); tick('down'); tick('a'); // onto CCC
  assert.deepEqual(state.party.map(m => m.nickname), ['CCC', 'BBB', 'AAA']);
  assert.equal(screen.swapFrom, null);
});

test('B during a swap cancels only the swap', () => {
  const { state, screen, tick } = setup();
  tick('a'); tick('down'); tick('a'); tick('b');
  assert.equal(screen.swapFrom, null);
  assert.equal(screen.open, true);
  assert.deepEqual(state.party.map(m => m.nickname), ['AAA', 'BBB', 'CCC']);
});

test('summary opens from the context menu and B returns to the list', () => {
  const { screen, tick } = setup();
  tick('down'); tick('a'); tick('a');
  assert.equal(screen.summary, 1);
  assert.doesNotThrow(() => screen.draw(fakeCtx()));
  tick('b');
  assert.equal(screen.summary, null);
  assert.equal(screen.open, true);
});

test('B closes (onClose once); forced mode ignores B and starts on a healthy member', () => {
  let s = setup();
  s.tick('b');
  assert.equal(s.screen.open, false);
  assert.deepEqual(s.closes, [1]);
  s = setup({ mode: 'switch', forced: true }, [mon('AAA', 0), mon('BBB')]);
  assert.equal(s.screen.menu.index, 1);
  s.tick('b');
  assert.equal(s.screen.open, true);
});
