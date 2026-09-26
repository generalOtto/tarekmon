import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NameEntry, GRID } from '../../src/ui/nameentry.js';

function stubInput() {
  const inp = { pressed: new Set(), justPressed: b => inp.pressed.has(b), isDown: b => inp.pressed.has(b),
    pressedDirection: () => ['up', 'down', 'left', 'right'].find(d => inp.pressed.has(d)) ?? null };
  return inp;
}
function fakeCtx() {
  return new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
}
function setup(opts = {}) {
  const input = stubInput(), done = [];
  const ne = new NameEntry({ input, onDone: n => done.push(n), ...opts });
  const tick = (...b) => { input.pressed = new Set(b); ne.update(input); input.pressed = new Set(); };
  /** Move the cursor onto the cell labelled `label` (by position, not by walking). */
  const goto = label => { const r = GRID.findIndex(row => row.includes(label)); ne.row = r; ne.col = GRID[r].indexOf(label); };
  return { ne, tick, goto, done };
}

test('starts with the initial name (TAREK by default) and the cursor on A', () => {
  const { ne } = setup();
  assert.equal(ne.name, 'TAREK');
  assert.equal(ne.cell(), 'A');
  assert.doesNotThrow(() => ne.draw(fakeCtx()));
  assert.equal(setup({ initial: 'OTTO' }).ne.name, 'OTTO');
});

test('the grid holds every letter plus . - \' DEL END', () => {
  const cells = GRID.flat();
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') assert.ok(cells.includes(ch), ch);
  for (const c of ['.', '-', "'", 'DEL', 'END']) assert.ok(cells.includes(c), c);
  assert.ok(GRID.every(row => row.length <= 5), '5 columns at most');
});

test('A on a letter appends it; the name caps at max (7)', () => {
  const { ne, tick } = setup({ initial: '' });
  tick('a'); assert.equal(ne.name, 'A');
  tick('right'); tick('a'); assert.equal(ne.name, 'AB');
  for (let i = 0; i < 10; i++) tick('a');
  assert.equal(ne.name, 'ABBBBBB');
  assert.equal(ne.name.length, 7);
});

test('DEL and B remove the last character; both are safe on an empty name', () => {
  const { ne, tick, goto } = setup();
  goto('DEL'); tick('a'); assert.equal(ne.name, 'TARE');
  tick('b'); assert.equal(ne.name, 'TAR');
  tick('b'); tick('b'); tick('b'); tick('b'); assert.equal(ne.name, '');
});

test('END (or Start) confirms via onDone; an empty name cannot confirm', () => {
  let s = setup();
  s.goto('END'); s.tick('a'); assert.deepEqual(s.done, ['TAREK']);
  s = setup(); s.tick('start'); assert.deepEqual(s.done, ['TAREK']);
  s = setup({ initial: '' });
  s.goto('END'); s.tick('a'); s.tick('start'); assert.deepEqual(s.done, []);
  s.goto('Q'); s.tick('a'); s.tick('start'); assert.deepEqual(s.done, ['Q']);
});

test('confirms only once', () => {
  const { tick, done } = setup();
  tick('start'); tick('start'); tick('a');
  assert.equal(done.length, 1);
});

test('the 2-D cursor wraps both ways and clamps into short rows', () => {
  const { ne, tick } = setup();
  tick('left'); assert.equal(ne.cell(), 'E', 'left from A wraps to the row end');
  tick('right'); assert.equal(ne.cell(), 'A');
  tick('up'); assert.equal(ne.row, GRID.length - 1, 'up from the top row wraps to the bottom');
  assert.equal(ne.cell(), 'DEL');
  tick('down'); assert.equal(ne.cell(), 'A', 'down from the bottom wraps to the top');
  for (let i = 0; i < 4; i++) tick('right');
  assert.equal(ne.cell(), 'E');
  tick('up'); assert.equal(ne.cell(), 'END', 'column clamps into the short last row');
  tick('up'); assert.equal(ne.row, GRID.length - 2);
});
