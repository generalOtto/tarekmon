import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShopScreen } from '../../src/ui/shop.js';
import { newGameState } from '../../src/engine/state.js';
import items from '../../data/items.json' with { type: 'json' };
import dialogue from '../../data/dialogue.json' with { type: 'json' };

const db = { items, itemsById: Object.fromEntries(items.map(i => [i.id, i])), dialogue };
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
const flush = async () => { for (let i = 0; i < 5; i++) await null; };

async function setup(money = 500) {
  const state = newGameState();
  state.money = money;
  const input = stubInput(), textbox = stubTextbox(), closes = [];
  const screen = new ShopScreen({ state, db, textbox, onClose: () => closes.push(1) });
  const tick = async (...b) => { input.pressed = new Set(b); screen.update(input); input.pressed = new Set(); await flush(); };
  assert.deepEqual(textbox.said, [dialogue['ribs-shop']]);
  await tick('a'); // dismiss the greeting
  assert.equal(screen.phase, 'main');
  return { state, screen, tick, textbox, closes };
}

test('BUY → 3 balls: money −300, bag +3, the balls line', async () => {
  const { state, screen, tick, textbox } = await setup(500);
  const before = state.bag['dumpling-ball'];
  await tick('a'); // BUY
  assert.equal(screen.phase, 'buy');
  assert.equal(screen.list.items[0], 'DUMPLINGBALL   $100');
  screen.draw(fakeCtx());
  await tick('a'); // DUMPLINGBALL → quantity
  assert.equal(screen.phase, 'qty');
  await tick('right'); await tick('right');
  assert.equal(screen.qty, 3);
  assert.equal(screen.total, 300);
  screen.draw(fakeCtx());
  await tick('a');
  assert.equal(state.money, 200);
  assert.equal(state.bag['dumpling-ball'], before + 3);
  assert.equal(textbox.said.at(-1), dialogue['shop-bought-balls']);
  await tick('a');
  assert.equal(screen.phase, 'buy', 'back on the list');
});

test('quantity clamps to 1..9; other items get the plain line', async () => {
  const { state, screen, tick, textbox } = await setup(5000);
  await tick('a'); await tick('down'); await tick('a');
  await tick('left');
  assert.equal(screen.qty, 1);
  for (let i = 0; i < 12; i++) await tick('right');
  assert.equal(screen.qty, 9);
  await tick('a');
  assert.equal(state.bag['wet-wipe'], 2 + 9);
  assert.equal(state.money, 5000 - 9 * 150);
  assert.equal(textbox.said.at(-1), dialogue['shop-bought']);
});

test("can't afford: the poor line and nothing changes", async () => {
  const { state, screen, tick, textbox } = await setup(250);
  const bag = { ...state.bag };
  await tick('a'); await tick('a'); await tick('right'); await tick('right'); // 3 balls = $300
  await tick('a');
  assert.equal(textbox.said.at(-1), dialogue['shop-poor']);
  assert.equal(state.money, 250);
  assert.deepEqual(state.bag, bag);
  await tick('a');
  assert.equal(screen.phase, 'buy');
});

test('B backs out level by level; LEAVE says the leave line then closes', async () => {
  const { screen, tick, textbox, closes } = await setup();
  await tick('a'); await tick('a');
  await tick('b'); assert.equal(screen.phase, 'buy');
  await tick('b'); assert.equal(screen.phase, 'main');
  await tick('down'); await tick('a'); // LEAVE
  assert.equal(textbox.said.at(-1), dialogue['shop-leave']);
  assert.equal(screen.open, true, 'still open while the line shows');
  await tick('a');
  assert.equal(screen.open, false);
  assert.deepEqual(closes, [1]);
});
