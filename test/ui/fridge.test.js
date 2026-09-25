import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FridgeScreen, fillNick } from '../../src/ui/fridge.js';
import { newGameState } from '../../src/engine/state.js';
import dialogue from '../../data/dialogue.json' with { type: 'json' };

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
const mon = (nickname, hp = 20) => ({ speciesId: 'x', nickname, level: 5, hp, maxHp: 20, moves: [] });

async function setup(party = [mon('AAA'), mon('BBB')], fridge = []) {
  const state = newGameState();
  state.party.push(...party); state.fridge.push(...fridge);
  const input = stubInput(), textbox = stubTextbox(), closes = [];
  const screen = new FridgeScreen({ state, db: { dialogue }, textbox, onClose: () => closes.push(1) });
  const tick = async (...b) => { input.pressed = new Set(b); screen.update(input); input.pressed = new Set(); await flush(); };
  assert.deepEqual(textbox.said, [dialogue['fridge-open']], 'says the open line first');
  assert.doesNotThrow(() => screen.draw(fakeCtx()));
  await tick('a'); // dismiss the open line
  return { state, screen, tick, textbox, closes };
}
const names = list => list.map(m => m.nickname);

test('A on a party member → DEPOSIT moves it into the fridge and says so', async () => {
  const { state, screen, tick, textbox } = await setup();
  await tick('down'); await tick('a');                 // BBB → context
  assert.deepEqual(screen.context.items, ['DEPOSIT', 'CANCEL']);
  assert.doesNotThrow(() => screen.draw(fakeCtx()));
  await tick('a');                                     // DEPOSIT
  assert.deepEqual(names(state.party), ['AAA']);
  assert.deepEqual(names(state.fridge), ['BBB']);
  assert.equal(textbox.said.at(-1), fillNick(dialogue['fridge-deposit'], 'BBB'));
  assert.match(textbox.said.at(-1), /^BBB IS IN/);
  await tick('a');
  assert.equal(screen.cursor.party, 0, 'cursor clamped into the shorter party');
});

test('A on a fridge member → WITHDRAW moves it to the end of the party and says so', async () => {
  const { state, screen, tick, textbox } = await setup([mon('AAA')], [mon('XXX'), mon('YYY')]);
  await tick('right'); assert.equal(screen.col, 'fridge');
  await tick('down'); await tick('a');
  assert.deepEqual(screen.context.items, ['WITHDRAW', 'CANCEL']);
  await tick('a');
  assert.deepEqual(names(state.party), ['AAA', 'YYY']);
  assert.deepEqual(names(state.fridge), ['XXX']);
  assert.equal(textbox.said.at(-1), fillNick(dialogue['fridge-withdraw'], 'YYY'));
  await tick('a'); await tick('left'); assert.equal(screen.col, 'party');
});

test('CANCEL and B in the context menu do nothing', async () => {
  const { state, screen, tick } = await setup();
  await tick('a'); await tick('down'); await tick('a'); // CANCEL
  assert.equal(screen.context, null);
  await tick('a'); await tick('b');
  assert.equal(screen.context, null); assert.equal(screen.open, true);
  assert.equal(state.party.length, 2);
});

test('the last healthy member cannot be deposited; a fainted one can', async () => {
  const { state, tick, textbox } = await setup([mon('LIVE'), mon('DEAD', 0)]);
  await tick('a'); await tick('a'); // DEPOSIT LIVE
  assert.equal(textbox.said.at(-1), dialogue['fridge-last']);
  assert.deepEqual(names(state.party), ['LIVE', 'DEAD']);
  await tick('a'); // dismiss
  await tick('down'); await tick('a'); await tick('a'); // DEPOSIT DEAD
  assert.deepEqual(names(state.party), ['LIVE']);
  assert.deepEqual(names(state.fridge), ['DEAD']);
});

test('a full party refuses a withdrawal', async () => {
  const party = ['A', 'B', 'C', 'D', 'E', 'F'].map(n => mon(n));
  const { state, tick, textbox } = await setup(party, [mon('X')]);
  await tick('right'); await tick('a'); await tick('a');
  assert.equal(textbox.said.at(-1), dialogue['fridge-full']);
  assert.equal(state.party.length, 6); assert.deepEqual(names(state.fridge), ['X']);
});

test('A on an empty fridge column does nothing; B closes', async () => {
  const { screen, tick, closes } = await setup();
  await tick('right'); await tick('a');
  assert.equal(screen.context, null);
  assert.doesNotThrow(() => screen.draw(fakeCtx()));
  await tick('b');
  assert.equal(screen.open, false); assert.deepEqual(closes, [1]);
});

test('a long fridge scrolls and draws', async () => {
  const { screen, tick } = await setup([mon('A')], Array.from({ length: 10 }, (_, i) => mon(`F${i}`)));
  await tick('right'); for (let i = 0; i < 8; i++) await tick('down');
  assert.equal(screen.cursor.fridge, 8);
  assert.doesNotThrow(() => screen.draw(fakeCtx()));
});

test('fillNick substitutes the nickname', () => {
  assert.equal(fillNick('{nick} IS BACK.', 'BAO'), 'BAO IS BACK.');
});
