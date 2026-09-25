import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BagScreen, CRUMBS } from '../../src/ui/bag.js';
import { PartyScreen } from '../../src/ui/party.js';
import { applyFieldItem, hazeEntrance, NO_EFFECT } from '../../src/world/items.js';
import { newGameState } from '../../src/engine/state.js';
import { loadMaps } from '../../src/world/map.js';
import items from '../../data/items.json' with { type: 'json' };
import mapData from '../../data/map.json' with { type: 'json' };

const db = { items, itemsById: Object.fromEntries(items.map(i => [i.id, i])) };
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
const mon = (nickname, hp, maxHp = 40) => ({ speciesId: 'x', nickname, level: 5, xp: 125, hp, maxHp, stats: {}, moves: [] });
const flush = async () => { for (let i = 0; i < 5; i++) await null; };

function setup({ context = 'field', bag = { 'dumpling-ball': 3, 'wet-wipe': 2, 'extra-sauce': 0, napkin: 1 } } = {}) {
  const state = newGameState();
  state.party.push(mon('AAA', 0), mon('BBB', 10));
  state.bag = bag;
  const input = stubInput(), textbox = stubTextbox(), used = [], closes = [];
  const screen = new BagScreen({ state, db, textbox, context, onUse: (...a) => used.push(a), onClose: () => closes.push(1) });
  const tick = (...b) => { input.pressed = new Set(b); screen.update(input); input.pressed = new Set(); };
  return { state, screen, tick, used, closes, textbox };
}

test('field context lists items with a field use; battle lists battle items; counts right-aligned', () => {
  const f = setup();
  assert.deepEqual(f.screen.ids, ['wet-wipe', 'napkin']);
  assert.equal(f.screen.menu.items[0], 'WET WIPE' + ' '.repeat(11) + 'x2');
  assert.equal(f.screen.menu.items[0].length, 21);
  assert.doesNotThrow(() => f.screen.draw(fakeCtx()));
  const b = setup({ context: 'battle' });
  assert.deepEqual(b.screen.ids, ['dumpling-ball', 'wet-wipe', 'napkin']);
});

test('an empty bag says the crumbs text, then closes', async () => {
  const { screen, tick, textbox, closes } = setup({ bag: { 'dumpling-ball': 0, 'extra-sauce': 4 } });
  assert.deepEqual(textbox.said, [CRUMBS]);
  assert.equal(screen.open, true);
  tick('a');
  await flush();
  assert.equal(screen.open, false);
  assert.deepEqual(closes, [1]);
});

test('USE on a field heal opens the party picker, then calls onUse(id, index)', () => {
  const { screen, tick, used } = setup();
  tick('a'); // item → USE / INFO / CANCEL
  assert.deepEqual(screen.action.items, ['USE', 'INFO', 'CANCEL']);
  tick('a'); // USE
  assert.ok(screen.picker instanceof PartyScreen);
  assert.equal(screen.picker.mode, 'pick');
  assert.doesNotThrow(() => screen.draw(fakeCtx()));
  tick('down'); tick('a'); // BBB
  assert.deepEqual(used, [['wet-wipe', 1]]);
  assert.equal(screen.picker.open, false);
  assert.equal(screen.open, true, 'the bag stays open in the field');
});

test('USE on the napkin in the field calls onUse(id) with no target', () => {
  const { tick, used } = setup();
  tick('down'); tick('a'); tick('a');
  assert.deepEqual(used, [['napkin']]);
});

test('battle: USE on a catch item calls onUse(dumpling-ball); a heal still asks for a target', () => {
  const b = setup({ context: 'battle' });
  b.tick('a'); b.tick('a');
  assert.deepEqual(b.used, [['dumpling-ball']]);
  const h = setup({ context: 'battle' });
  h.tick('down'); h.tick('a'); h.tick('a');
  assert.ok(h.screen.picker?.open);
  h.tick('down'); h.tick('a');
  assert.deepEqual(h.used, [['wet-wipe', 1]]);
});

test('INFO says the item text; CANCEL and B back out level by level', () => {
  const { screen, tick, textbox, closes } = setup();
  tick('a'); tick('down'); tick('a');
  assert.equal(textbox.said.at(-1), db.itemsById['wet-wipe'].text);
  tick('a'); // dismiss
  assert.equal(screen.action, null);
  tick('a'); tick('b');
  assert.equal(screen.action, null);
  assert.equal(screen.open, true);
  tick('b');
  assert.equal(screen.open, false);
  assert.deepEqual(closes, [1]);
});

test('applyFieldItem heal: caps at max, decrements the bag, reports the amount', () => {
  const state = newGameState();
  state.party.push(mon('AAA', 30), mon('BBB', 0), mon('CCC', 40));
  let r = applyFieldItem(state, 'wet-wipe', 0, { db });
  assert.deepEqual(r, { ok: true, text: 'AAA RECOVERED 10 HP!' });
  assert.equal(state.party[0].hp, 40);
  assert.equal(state.bag['wet-wipe'], 1);
  for (const i of [0, 1, 2, 5]) {
    r = applyFieldItem(state, 'wet-wipe', i, { db });
    assert.deepEqual(r, { ok: false, text: NO_EFFECT }, `target ${i}`);
  }
  assert.equal(state.bag['wet-wipe'], 1, 'no decrement on failure');
});

test('applyFieldItem napkin: decrements and asks for the warp; hazeEntrance lands inside Haze Lounge', () => {
  const state = newGameState();
  state.bag.napkin = 2;
  assert.deepEqual(applyFieldItem(state, 'napkin', undefined, { db }), { ok: true, warp: true });
  assert.equal(state.bag.napkin, 1);
  state.bag.napkin = 0;
  assert.equal(applyFieldItem(state, 'napkin', undefined, { db }).ok, false);
  const door = mapData.maps.town.warps.find(w => w.to === 'haze');
  assert.deepEqual(hazeEntrance(loadMaps(mapData)), { map: 'haze', x: door.tx, y: door.ty, facing: 'up' });
});
