import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OverworldScene } from '../../src/world/overworld.js';
import { loadMaps } from '../../src/world/map.js';
import { newGameState } from '../../src/engine/state.js';
import mapData from '../../data/map.json' with { type: 'json' };
import dialogue from '../../data/dialogue.json' with { type: 'json' };

const DIRS = ['up', 'down', 'left', 'right'];
/** Minimal stand-in for engine/input.js's ButtonState, scoped to one tick's direction/justPressed/isDown. */
function makeInput({ direction, justPressed, isDown = () => false }) {
  return { direction, justPressed, isDown, pressedDirection() { return this.direction() ?? DIRS.find(b => this.justPressed(b)); } };
}

/** Headless scene with stub input/textbox/save/tileset; `ctl.dir` drives the held direction. */
function headless(start = mapData.start) {
  const ctl = { dir: null, calls: [] };
  const state = newGameState('T', start);
  const scene = new OverworldScene({
    db: {}, maps: loadMaps(mapData), state, tileset: { draw() {} },
    input: makeInput({ direction: () => ctl.dir, justPressed: () => false }),
    textbox: { open: false, update() {}, draw() {} },
    save: { autosave: s => ctl.calls.push(structuredClone(s.pos)) },
  });
  scene.enter();
  return { scene, state, ctl };
}

test('walking onto the lab mat warps to town once, ignoring input during the fade', () => {
  const { scene, state, ctl } = headless();
  const lab = loadMaps(mapData).lab;
  const matY = mapData.start.y + 1;
  const warp = lab.warps.find(w => w.x === mapData.start.x && w.y === matY);
  assert.ok(warp, 'the mat is one tile south of start');

  ctl.dir = 'down';
  for (let i = 0; i < 120 && state.pos.y !== matY; i++) scene.update(1 / 60);
  assert.equal(state.pos.y, matY, 'reached the mat');
  assert.equal(scene.fader.active, true, 'arriving on the mat starts the fade');

  // Hold a direction that is walkable both on the lab mat row and beside the town door:
  // if input leaked through during the fade the player would start a step.
  for (let i = 0; i < 30; i++) {
    const fading = scene.fader.active;
    ctl.dir = fading ? 'right' : null;
    scene.update(1 / 60);
    if (fading) assert.equal(scene.player.moving, false, `tick ${i}: moved during the fade`);
  }
  assert.equal(scene.fader.active, false);
  assert.equal(state.pos.map, 'town');
  assert.deepEqual(state.pos, { map: warp.to, x: warp.tx, y: warp.ty, facing: warp.facing });
  assert.equal(ctl.calls.length, 1, 'autosaved exactly once');
  assert.deepEqual(ctl.calls[0], state.pos);
});

/** Headless scene whose textbox records say() calls and resolves each immediately. */
function talker(start) {
  const ctl = { a: false, said: [] };
  const state = newGameState('T', start);
  const textbox = { open: false, update() {}, draw() {}, say(t) { ctl.said.push(t); return Promise.resolve(); } };
  const scene = new OverworldScene({
    db: { dialogue }, maps: loadMaps(structuredClone(mapData)), state, tileset: { draw() {} },
    input: makeInput({ direction: () => null, justPressed: b => b === 'a' && ctl.a }),
    textbox, save: { autosave() {} },
  });
  scene.enter();
  const pressA = async () => { ctl.a = true; scene.update(1 / 60); ctl.a = false; for (let i = 0; i < 5; i++) await null; };
  return { scene, state, ctl, pressA };
}

test('A on a sign reads its dialogue; A on the fridge/pedestal/gate reads theirs', async () => {
  let t = talker({ map: 'town', x: 11, y: 11, facing: 'up' });
  await t.pressA(); assert.deepEqual(t.ctl.said, [dialogue['sign-lab']]);
  t = talker({ map: 'haze', x: 1, y: 1, facing: 'left' });
  await t.pressA(); assert.deepEqual(t.ctl.said, [dialogue['fridge-open']]);
  t = talker({ map: 'lab', x: 5, y: 4, facing: 'up' });
  await t.pressA(); assert.deepEqual(t.ctl.said, [dialogue.pedestal]);
  t = talker({ map: 'town', x: 25, y: 5, facing: 'up' });
  await t.pressA(); assert.deepEqual(t.ctl.said, [dialogue['gate-closed']]);
  t = talker({ map: 'town', x: 25, y: 5, facing: 'up' }); t.state.badges.push('haze');
  await t.pressA(); assert.deepEqual(t.ctl.said, [], 'open gate says nothing');
});

test('talking to an npc turns it to face the player; the flag picks the second line', async () => {
  const t = talker({ map: 'booth', x: 3, y: 3, facing: 'up' }); // across the counter
  const officer = t.scene.map.npcs.find(n => n.id === 'officer'); officer.facing = 'left';
  await t.pressA();
  assert.equal(officer.facing, 'down');
  assert.deepEqual(t.ctl.said, [dialogue['booth-officer-locked']]);
  t.state.badges.push('haze'); await t.pressA();
  assert.equal(t.ctl.said[1], dialogue['booth-officer-open']);
});

test('the haze healer says two lines with a full heal in between', async () => {
  const t = talker({ map: 'haze', x: 7, y: 3, facing: 'up' });
  const mon = { hp: 1, maxHp: 20, moves: [{ pp: 0, maxPp: 10 }] }; t.state.party.push(mon);
  let hpAtFirstLine = null;
  const say = t.scene.textbox.say; t.scene.textbox.say = txt => { if (hpAtFirstLine === null) hpAtFirstLine = mon.hp; return say(txt); };
  await t.pressA();
  assert.deepEqual(t.ctl.said, [dialogue['haze-heal-1'], dialogue['haze-heal-2']]);
  assert.equal(hpAtFirstLine, 1, 'not healed before the first line');
  assert.equal(mon.hp, 20); assert.equal(mon.moves[0].pp, 10);
});

test('the weather guy and the rack answer by the day\'s weather and set flags.weatherNice', async () => {
  const t = talker({ map: 'town', x: 7, y: 33, facing: 'down' });
  await t.pressA();
  const nice = t.state.flags.weatherNice;
  assert.equal(typeof nice, 'boolean');
  assert.deepEqual(t.ctl.said, [dialogue[nice ? 'weather-guy-nice' : 'weather-guy-bad']]);
  const r = talker({ map: 'town', x: 5, y: 34, facing: 'left' });
  await r.pressA(); assert.deepEqual(r.ctl.said, [dialogue[nice ? 'rack-nice' : 'rack-bad']]);
});

/** Headless scene for start-menu tests: ctl.dir drives the held direction; press() sets a one-tick
 *  justPressed edge for `btn`, ticks the scene, then clears it (mirroring ButtonState). */
function menuHarness(start = mapData.start) {
  const ctl = { dir: null, justPressed: new Set(), said: [] };
  const state = newGameState('T', start);
  const saveCalls = [];
  const textbox = {
    open: false,
    update() {},
    draw() {},
    say(t) {
      this.open = true;
      ctl.said.push(t);
      return Promise.resolve().then(() => { this.open = false; });
    },
  };
  const scene = new OverworldScene({
    db: {}, maps: loadMaps(mapData), state, tileset: { draw() {} },
    input: makeInput({ direction: () => ctl.dir, justPressed: b => ctl.justPressed.has(b) }),
    textbox, save: { save: s => saveCalls.push(structuredClone(s)), autosave() {} },
  });
  scene.enter();
  const press = btn => { ctl.justPressed.add(btn); scene.update(1 / 60); ctl.justPressed.delete(btn); };
  return { scene, state, ctl, saveCalls, textbox, press };
}

test('Start opens the pause menu and blocks movement; B closes it', () => {
  const h = menuHarness();
  h.press('start');
  assert.equal(h.scene.startMenu.open, true);

  h.ctl.dir = 'down';
  h.scene.update(1 / 60);
  assert.equal(h.scene.player.moving, false, 'movement is blocked while the menu is open');
  h.ctl.dir = null;

  h.press('b');
  assert.equal(h.scene.startMenu.open, false);
});

test('selecting SAVE from the start menu calls save.save once and the textbox says the save line', async () => {
  const h = menuHarness();
  h.press('start');
  h.scene.startMenu.menu.index = h.scene.startMenu.menu.items.indexOf('SAVE');
  h.press('a');
  await null; await null;

  assert.equal(h.saveCalls.length, 1);
  assert.equal(h.saveCalls[0].playerName, 'T');
  assert.equal(h.ctl.said[0], 'T SAVED THE GAME.');
});

/** Like menuHarness, but the textbox's say() never resolves on its own — the test resolves each
 *  call in turn via ctl.resolveSay(), so it can land input in the gap between chained say()s
 *  (textbox.open flips back to false the instant the previous say resolves, before its awaiter's
 *  continuation — including StartMenu's own busy-clearing `finally` — has actually run). */
function manualSayHarness(start = mapData.start) {
  const ctl = { dir: null, justPressed: new Set(), said: [], resolvers: [] };
  const state = newGameState('T', start);
  const saveCalls = [];
  const textbox = {
    open: false,
    update() {},
    draw() {},
    say(t) {
      this.open = true;
      ctl.said.push(t);
      return new Promise(resolve => { ctl.resolvers.push(() => { this.open = false; resolve(); }); });
    },
  };
  const scene = new OverworldScene({
    db: {}, maps: loadMaps(mapData), state, tileset: { draw() {} },
    input: makeInput({ direction: () => ctl.dir, justPressed: b => ctl.justPressed.has(b) }),
    textbox, save: { save: s => saveCalls.push(structuredClone(s)), autosave() {} },
  });
  scene.enter();
  const press = btn => { ctl.justPressed.add(btn); scene.update(1 / 60); ctl.justPressed.delete(btn); };
  const resolveSay = () => ctl.resolvers.shift()?.();
  return { scene, state, ctl, saveCalls, textbox, press, resolveSay };
}

test('SAVE re-entrancy guard: Start/A land in the gap between say()s without closing/reopening the menu', async () => {
  const h = manualSayHarness();
  h.press('start');
  h.scene.startMenu.menu.index = h.scene.startMenu.menu.items.indexOf('SAVE');
  h.press('a'); // kicks off _doSave: save.save() runs synchronously, then the first say() is in flight
  assert.equal(h.saveCalls.length, 1);
  assert.equal(h.scene.startMenu.busy, true);

  // Resolve the first say() and, in the same synchronous tick (before its awaiter's continuation
  // — StartMenu's own busy-clearing `finally` — runs as a microtask), land Start and A: this is
  // exactly the window where textbox.open is already false but the save flow hasn't settled.
  h.resolveSay();
  h.press('start');
  assert.equal(h.scene.startMenu.open, true, 'Start is ignored while the save flow is still busy');
  h.press('a');
  assert.equal(h.saveCalls.length, 1, 'A is ignored too — no second save.save call');

  await null; await null; await null; await null; // let _doSave's continuation (and finally) run
  assert.equal(h.scene.startMenu.busy, false, 'the flow settles once _doSave finishes');

  h.press('start');
  assert.equal(h.scene.startMenu.open, false, 'Start works again after the flow finishes');
});
