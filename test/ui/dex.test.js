import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DexScreen, dexRows, nextSeen } from '../../src/ui/dex.js';
import { Menu } from '../../src/ui/menu.js';
import { newGameState } from '../../src/engine/state.js';
import species from '../../data/species.json' with { type: 'json' };
import types from '../../data/types.json' with { type: 'json' };

const db = { species, speciesById: Object.fromEntries(species.map(s => [s.id, s])), types, images: {} };
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
function fakeCtx() {
  return new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
}
const byNum = n => species.find(s => s.num === n).id;

/** Seen: #3, #5, #9 (caught: #5), plus the named ones in `extra`. */
function setup({ seen = [3, 5, 9], caught = [5] } = {}) {
  const state = newGameState();
  state.dex.seen = seen.map(byNum);
  state.dex.caught = caught.map(byNum);
  const input = stubInput(), textbox = stubTextbox(), closes = [];
  const screen = new DexScreen({ state, db, textbox, onClose: () => closes.push(1) });
  const tick = (...b) => { input.pressed = new Set(b); screen.update(input); input.pressed = new Set(); };
  const current = () => screen.rows[screen.menu.index];
  return { state, screen, tick, textbox, closes, current };
}

test('dexRows: 74 rows in number order, unseen names masked, caught flagged', () => {
  const state = newGameState();
  state.dex.seen = [byNum(2), byNum(4)];
  state.dex.caught = [byNum(4)];
  const rows = dexRows(db, state, 'NUMBER');
  assert.equal(rows.length, 74);
  assert.deepEqual(rows.map(r => r.num), species.map(s => s.num).sort((a, b) => a - b));
  assert.equal(rows[0].seen, false);
  assert.equal(rows[0].name, '----------');
  assert.deepEqual(rows[1], { id: byNum(2), num: 2, name: species.find(s => s.num === 2).name.toUpperCase(), seen: true, caught: false });
  assert.equal(rows[3].caught, true);
  assert.equal(rows.filter(r => r.seen).length, 2);
  assert.equal(rows.filter(r => r.caught).length, 1);
});

test('dexRows: NAME order is alphabetical over seen species, unseen last in number order', () => {
  const state = newGameState();
  state.dex.seen = [byNum(10), byNum(1), byNum(40)];
  const rows = dexRows(db, state, 'NAME');
  assert.equal(rows.length, 74);
  const seen = rows.slice(0, 3);
  assert.ok(seen.every(r => r.seen));
  assert.deepEqual(seen.map(r => r.name), [...seen.map(r => r.name)].sort());
  const rest = rows.slice(3);
  assert.ok(rest.every(r => !r.seen));
  assert.deepEqual(rest.map(r => r.num), [...rest.map(r => r.num)].sort((a, b) => a - b));
});

test('nextSeen skips unseen rows and stays put at either end', () => {
  const rows = [{ seen: false }, { seen: true }, { seen: false }, { seen: false }, { seen: true }];
  assert.equal(nextSeen(rows, 1, 1), 4);
  assert.equal(nextSeen(rows, 4, -1), 1);
  assert.equal(nextSeen(rows, 4, 1), 4);
  assert.equal(nextSeen(rows, 1, -1), 1);
});

test('opens on the first seen row; counts come from state', () => {
  const { screen, current } = setup();
  assert.equal(current().num, 3);
  assert.deepEqual(screen.counts(), { seen: 3, caught: 1 });
  assert.equal(screen.mode, 'list');
  assert.doesNotThrow(() => screen.draw(fakeCtx()));
});

test('A on an unseen entry does nothing but bump', () => {
  const sfx = [];
  Menu.audio = { playSfx: s => sfx.push(s) };
  try {
    const { screen, tick, textbox } = setup();
    tick('up'); // #2, unseen
    sfx.length = 0;
    tick('a');
    assert.equal(screen.mode, 'list');
    assert.deepEqual(textbox.said, []);
    assert.ok(sfx.includes('bump'));
  } finally { Menu.audio = null; }
});

test('A on a seen entry opens its entry page and says the entry', () => {
  const { screen, tick, textbox, current } = setup();
  tick('a');
  assert.equal(screen.mode, 'entry');
  assert.equal(current().num, 3);
  assert.deepEqual(textbox.said, [db.speciesById[byNum(3)].entry]);
  assert.doesNotThrow(() => screen.draw(fakeCtx()));
});

test('left/right on the entry page skip unseen species', () => {
  const { screen, tick, textbox, current } = setup();
  tick('a');
  tick('right');
  assert.equal(current().num, 5);
  tick('right');
  assert.equal(current().num, 9);
  tick('right');
  assert.equal(current().num, 9, 'no seen species past #9');
  tick('left'); tick('left');
  assert.equal(current().num, 3);
  assert.equal(screen.mode, 'entry');
  assert.equal(textbox.said.at(-1), db.speciesById[byNum(3)].entry);
});

test('B from the entry returns to the list; B from the list closes', () => {
  const { screen, tick, closes } = setup();
  tick('a');
  tick('a'); // close the entry text (uncaught #3: no stats)
  assert.equal(screen.showStats, false);
  tick('b');
  assert.equal(screen.mode, 'list');
  assert.equal(screen.open, true);
  tick('b');
  assert.equal(screen.open, false);
  assert.deepEqual(closes, [1]);
});

test('caught species reveal their stats once the entry text closes; A returns to the list', () => {
  const { screen, tick, textbox, current } = setup();
  tick('a'); tick('right');
  assert.equal(current().num, 5);
  assert.equal(screen.showStats, false);
  assert.equal(textbox.open, true);
  tick('a'); // stub textbox closes
  assert.equal(textbox.open, false);
  assert.equal(screen.showStats, true);
  assert.doesNotThrow(() => screen.draw(fakeCtx()));
  tick('a');
  assert.equal(screen.mode, 'list');
  assert.equal(current().num, 5, 'the list cursor follows the entry page');
});

test('Start toggles sort NUMBER ↔ NAME and the cursor follows the same species', () => {
  const { screen, tick, current } = setup();
  tick('down'); tick('down'); // #5
  assert.equal(current().num, 5);
  tick('start');
  assert.equal(screen.sort, 'NAME');
  assert.equal(current().num, 5);
  assert.ok(screen.rows.slice(0, 3).every(r => r.seen));
  tick('start');
  assert.equal(screen.sort, 'NUMBER');
  assert.equal(current().num, 5);
  assert.equal(screen.menu.index, 4);
});
