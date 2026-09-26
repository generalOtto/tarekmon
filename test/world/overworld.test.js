import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OverworldScene } from '../../src/world/overworld.js';
import { loadMaps, zoneAt } from '../../src/world/map.js';
import { newGameState } from '../../src/engine/state.js';
import { makeMonster } from '../../src/battle/monster.js';
import mapData from '../../data/map.json' with { type: 'json' };
import dialogue from '../../data/dialogue.json' with { type: 'json' };
import speciesList from '../../data/species.json' with { type: 'json' };
import movesList from '../../data/moves.json' with { type: 'json' };
import trainersList from '../../data/trainers.json' with { type: 'json' };
import { dialogueFor } from '../../src/world/npc.js';
import itemsList from '../../data/items.json' with { type: 'json' };
import { ShopScreen } from '../../src/ui/shop.js';
import { BagScreen } from '../../src/ui/bag.js';
import { hazeEntrance } from '../../src/world/items.js';
import { FridgeScreen } from '../../src/ui/fridge.js';
import { DexScreen } from '../../src/ui/dex.js';
import { TextBox } from '../../src/ui/textbox.js';
import { pedestalGone } from '../../src/world/starters.js';

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
  state.flags.starterPicked = true; // the mat only lets you out with a starter
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

test('A facing the Haze Lounge fridge opens the Fridge overlay; closing it autosaves', async () => {
  const t = talker({ map: 'haze', x: 1, y: 1, facing: 'left' });
  const saves = []; t.scene.save = { autosave: s => saves.push(s) };
  await t.pressA();
  assert.ok(t.scene.overlay instanceof FridgeScreen);
  assert.deepEqual(t.ctl.said, [dialogue['fridge-open']]);
  assert.equal(saves.length, 0);
  t.scene.overlay.close();
  assert.equal(t.scene.overlay, null);
  assert.deepEqual(saves, [t.state]);
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

// ---------------------------------------------------------------- wild encounters (Task 28)

const byId = arr => Object.fromEntries(arr.map(x => [x.id, x]));
const speciesById = byId(speciesList);
const movesById = byId(movesList);
const encounterDb = { speciesById, movesById };
const ROUTE_1_START = { map: 'town', x: 10, y: 22, facing: 'right' }; // one tile west of a Route 1 grass tile (11,22)

/** Headless scene one step from Route 1 tall grass, with a scripted rng and an onEncounter spy. */
function encounterHarness({ rng, party = [makeMonster(speciesById['d002'], 5, movesById)], audio } = {}) {
  const ctl = { dir: null, encounters: [], saveCalls: [] };
  const state = newGameState('T', ROUTE_1_START);
  state.party = party;
  const scene = new OverworldScene({
    db: encounterDb, maps: loadMaps(mapData), state, tileset: { draw() {} },
    input: makeInput({ direction: () => ctl.dir, justPressed: () => false }),
    textbox: { open: false, update() {}, draw() {} },
    save: { autosave: s => ctl.saveCalls.push(structuredClone(s.pos)) },
    rng,
    audio,
    onBattle: b => { assert.equal(b.kind, 'wild'); ctl.encounters.push(b.foeParty[0]); },
  });
  scene.enter();
  return { scene, state, ctl };
}

test('walking into Route 1 tall grass with a forced-hit rng fires onBattle once, after the transition, with a foe from the zone table; input is ignored throughout', () => {
  const { scene, ctl } = encounterHarness({ rng: () => 0.01 }); // always low: rate roll hits, picks the first table entry
  ctl.dir = 'right';
  for (let i = 0; i < 20 && !scene.transition.active; i++) scene.update(1 / 60);
  assert.equal(scene.transition.active, true, 'arriving on the grass tile starts the real FlashWipe transition');
  assert.equal(ctl.encounters.length, 0, 'onBattle has not fired mid-transition');

  for (let i = 0; i < 90 && scene.transition.active; i++) {
    ctl.dir = 'left'; // held throughout: proves input is ignored while the transition plays
    scene.update(1 / 60);
    assert.equal(scene.player.moving, false, `tick ${i}: player moved during the transition`);
  }
  assert.equal(scene.transition.active, false, 'transition completed (~72 ticks)');
  assert.equal(ctl.encounters.length, 1, 'onBattle fired exactly once');

  const foe = ctl.encounters[0];
  const zone = zoneAt(scene.map, 11, 22);
  assert.equal(zone.id, 'route-1');
  assert.ok(zone.table.some(t => t.species === foe.speciesId), 'foe species comes from the zone table');
});

test('rng order: rate, weight, level, uid, uid → the foe handed to onBattle is exactly what that sequence produces', () => {
  // route-1: rate 0.12, weights total 90 → 0.2*90 = 18 lands in d003 (12..22); level randInt(2,5) with 0.99 → 5.
  const seq = [0.05, 0.2, 0.99, 0.25, 0.5];
  const rng = () => { assert.ok(seq.length, 'rng called more times than the sequence allows'); return seq.shift(); };
  const { scene, ctl } = encounterHarness({ rng });
  ctl.dir = 'right';
  for (let i = 0; i < 120 && !ctl.encounters.length; i++) { scene.update(1 / 60); if (scene.transition.active) ctl.dir = null; }
  assert.equal(seq.length, 0, 'every scripted roll was consumed');
  const foe = ctl.encounters[0];
  const expected = makeMonster(speciesById['d003'], 5, movesById, (s => () => s.shift())([0.25, 0.5]));
  assert.equal(foe.speciesId, 'd003');
  assert.equal(foe.level, 5);
  assert.equal(foe.uid, expected.uid, 'the two uid rolls come last');
});

test('a forced-hit encounter plays the jingle through the audio the scene was constructed with', () => {
  const calls = [];
  const audio = { playJingle: name => calls.push(name), playSfx() {}, startMusic() {}, stopMusic() {} };
  const { scene } = encounterHarness({ rng: () => 0.01, audio });
  scene.player.tryMove('right', scene.map, {}); // one step onto the Route 1 grass tile (11,22)
  for (let i = 0; i < 20 && scene.player.moving; i++) scene.player.update(1 / 60);
  assert.deepEqual(calls, ['encounter']);
});

test('a forced-miss rng never fires onBattle', () => {
  const { scene, ctl } = encounterHarness({ rng: () => 0.99 }); // always high: rate roll always fails
  ctl.dir = 'right';
  for (let i = 0; i < 100; i++) scene.update(1 / 60);
  assert.equal(scene.transition.active, false);
  assert.equal(ctl.encounters.length, 0);
});

test('an empty party never triggers an encounter, even on a forced-hit rng', () => {
  const { scene, ctl } = encounterHarness({ rng: () => 0.01, party: [] });
  ctl.dir = 'right';
  for (let i = 0; i < 100; i++) scene.update(1 / 60);
  assert.equal(scene.transition.active, false);
  assert.equal(ctl.encounters.length, 0);
});

test('onBattleEnd("win") autosaves once and resets every party member\'s battle-transient state', () => {
  const { scene, state, ctl } = encounterHarness({ rng: () => 0.5 });
  for (const m of state.party) { m.stages = { atk: 2, def: -1, acc: 1 }; m.skipNext = true; }

  scene.onBattleEnd('win');

  assert.equal(ctl.saveCalls.length, 1, 'save.autosave called exactly once');
  for (const m of state.party) assert.deepEqual(m.stages, { atk: 0, def: 0, acc: 0 });
  for (const m of state.party) assert.equal(m.skipNext, false);
});

// ---------------------------------------------------------------- trainers, gym, badge, champion (Task 29)

const trainersById = byId(trainersList);
const fullDb = { dialogue, speciesById, movesById, trainers: trainersList, trainersById, mapData };

/** Headless scene with every db table, a recording textbox (say resolves at once), an onBattle /
 *  onChampion spy, a jingle recorder and a never-hit rng (no wild encounters get in the way). */
function trainerHarness(start, { badges = [], defeated = [] } = {}) {
  const ctl = { dir: null, a: false, said: [], battles: [], jingles: [], champion: 0 };
  const state = newGameState('T', start);
  state.party = [makeMonster(speciesById['d002'], 20, movesById)];
  state.badges.push(...badges); state.defeatedTrainers.push(...defeated);
  const scene = new OverworldScene({
    db: fullDb, maps: loadMaps(structuredClone(mapData)), state, tileset: { draw() {} },
    input: makeInput({ direction: () => ctl.dir, justPressed: b => b === 'a' && ctl.a }),
    textbox: { open: false, update() {}, draw() {}, say(t) { ctl.said.push(t); return Promise.resolve(); } },
    save: { autosave() {} }, rng: () => 0.99, audio: { playJingle: n => ctl.jingles.push(n), playSfx() {}, startMusic() {}, stopMusic() {} },
    onBattle: b => ctl.battles.push(b), onChampion: () => ctl.champion++,
  });
  scene.enter();
  const flush = async () => { for (let i = 0; i < 8; i++) await null; };
  const tick = async () => { scene.update(1 / 60); await flush(); };
  const until = async (cond, max = 600) => { for (let i = 0; i < max && !cond(); i++) await tick(); assert.ok(cond(), 'condition never met'); };
  const pressA = async () => { ctl.a = true; scene.update(1 / 60); ctl.a = false; await flush(); };
  const npc = id => [...scene.map.npcs, ...scene.map.trainers].find(n => n.id === id);
  return { scene, state, ctl, tick, until, pressA, flush, npc };
}
const teamOf = b => b.foeParty.map(m => ({ species: m.speciesId, level: m.level }));

test('LOS: stepping into a route trainer\'s sight → ! bubble, walk-up, pre line, then a trainer battle with its team', async () => {
  const h = trainerHarness({ map: 'town', x: 12, y: 22, facing: 'down' });
  const nic = h.npc('napkin-nic');
  assert.deepEqual([nic.x, nic.y, nic.facing], [10, 24, 'right']);
  h.ctl.dir = 'down';
  await h.until(() => h.scene.trainerFlow.seq);
  h.ctl.dir = null;
  assert.deepEqual([h.state.pos.x, h.state.pos.y], [12, 24], 'spotted on the first tile of the sight line');
  assert.equal(h.scene.trainerFlow.seq.phase, 'alert', 'the ! bubble shows first');
  for (let i = 0; i < 29; i++) await h.tick();
  assert.equal(h.scene.trainerFlow.seq.phase, 'alert', 'the bubble holds for 30 ticks');
  assert.deepEqual([nic.x, nic.y], [10, 24], 'no walking during the bubble');
  await h.tick();
  assert.equal(h.scene.trainerFlow.seq.phase, 'walk');
  await h.until(() => h.ctl.said.length);
  assert.deepEqual([nic.x, nic.y], [11, 24], 'walked up to the tile beside the player');
  assert.equal(h.scene.player.facing, 'left', 'the player turns to face the trainer');
  assert.deepEqual(h.ctl.said, [dialogue['napkin-nic-pre']]);
  await h.until(() => h.ctl.battles.length);
  const [b] = h.ctl.battles;
  assert.equal(b.kind, 'trainer');
  assert.deepEqual(teamOf(b), trainersById['napkin-nic'].team);
  assert.deepEqual(b.trainer, { id: 'napkin-nic', name: 'NAPKIN NIC' }, 'no undefined keys ride along');
  assert.deepEqual(h.ctl.jingles, ['encounter']);
  for (let i = 0; i < 60; i++) await h.tick();
  assert.equal(h.ctl.battles.length, 1, 'no second trigger while the battle is pending');
});

test('beating a trainer records it and says post; a defeated trainer never re-spots and says post when talked to', async () => {
  const h = trainerHarness({ map: 'town', x: 11, y: 24, facing: 'left' });
  h.scene.onBattleEnd('win', { kind: 'trainer', trainer: { id: 'napkin-nic', name: 'NAPKIN NIC' } });
  await h.flush();
  assert.deepEqual(h.state.defeatedTrainers, ['napkin-nic']);
  assert.deepEqual(h.ctl.said, [dialogue['napkin-nic-post']]);
  for (let i = 0; i < 40; i++) await h.tick();
  assert.equal(h.scene.trainerFlow.seq, null, 'standing in its sight line does nothing now');
  await h.pressA();
  assert.deepEqual(h.ctl.said, [dialogue['napkin-nic-post'], dialogue['napkin-nic-post']]);
  assert.equal(h.ctl.battles.length, 0);
});

test('talking to an undefeated sight-0 regular: pre line, then a battle (no bubble, no walk)', async () => {
  const h = trainerHarness({ map: 'haze', x: 5, y: 4, facing: 'left' });
  await h.pressA();
  assert.deepEqual(h.ctl.said, [dialogue['regular-1']]);
  assert.equal(h.scene.trainerFlow.seq, null);
  await h.until(() => h.ctl.battles.length);
  assert.deepEqual(teamOf(h.ctl.battles[0]), trainersById['regular-1'].team);
});

test('a trainer loss blacks out and leaves the trainer undefeated', async () => {
  const h = trainerHarness({ map: 'town', x: 11, y: 24, facing: 'left' });
  let blackouts = 0; h.scene.blackout = () => blackouts++;
  h.scene.onBattleEnd('lose', { kind: 'trainer', trainer: { id: 'napkin-nic', name: 'NAPKIN NIC' } });
  await h.flush();
  assert.equal(blackouts, 1);
  assert.deepEqual(h.state.defeatedTrainers, []);
  assert.deepEqual(h.ctl.said, []);
});

/** Loses a battle on Route 1 with a hurt party and `money`, then plays the blackout to the end. */
async function blackoutRun(money, result = { kind: 'wild' }) {
  const h = trainerHarness({ map: 'town', x: 12, y: 22, facing: 'down' });
  const saves = []; h.scene.save = { autosave: st => saves.push(structuredClone(st)) };
  const mon = h.state.party[0]; mon.hp = 0; mon.moves[0].pp = 0;
  h.state.money = money;
  h.scene.onBattleEnd('lose', result);
  await h.flush();
  const saidBeforeFade = [...h.ctl.said], fading = h.scene.fader.active, posBefore = { ...h.state.pos };
  for (let i = 0; i < 60 && h.scene.fader.active; i++) await h.tick();
  await h.flush();
  return { ...h, saves, mon, saidBeforeFade, fading, posBefore };
}

test('blackout: text on the spot, fade to the Haze Lounge mat (healed, money halved, autosaved), then heal-2 and the drop line', async () => {
  const b = await blackoutRun(501);
  assert.deepEqual(b.saidBeforeFade, ['T BLACKED OUT!']);
  assert.equal(b.fading, true, 'fade starts after the blackout line');
  assert.equal(b.posBefore.map, 'town', 'still on the battle spot while the line shows');
  assert.equal(b.scene.fader.active, false);
  const mat = hazeEntrance(loadMaps(mapData));
  assert.deepEqual(b.state.pos, mat);
  assert.equal(b.state.pos.map, 'haze'); assert.equal(b.state.pos.facing, 'up');
  assert.equal(b.scene.map.id, 'haze');
  assert.deepEqual([b.scene.player.x, b.scene.player.y], [mat.x, mat.y]);
  assert.equal(b.mon.hp, b.mon.maxHp); assert.equal(b.mon.moves[0].pp, b.mon.moves[0].maxPp);
  assert.equal(b.state.money, 250, 'odd money floors');
  const last = b.saves.at(-1);
  assert.deepEqual(last.pos, mat); assert.equal(last.money, 250); assert.equal(last.party[0].hp, b.mon.maxHp);
  assert.deepEqual(b.ctl.said, ['T BLACKED OUT!', dialogue['haze-heal-2'], 'T DROPPED $251\nON THE WAY.']);
});

test('blackout with no money: no drop line', async () => {
  const b = await blackoutRun(0);
  assert.equal(b.state.money, 0);
  assert.deepEqual(b.ctl.said, ['T BLACKED OUT!', dialogue['haze-heal-2']]);
});

test('blackout after a trainer loss leaves the trainer undefeated', async () => {
  const b = await blackoutRun(100, { kind: 'trainer', trainer: { id: 'napkin-nic', name: 'NAPKIN NIC' } });
  assert.deepEqual(b.state.defeatedTrainers, []);
  assert.equal(b.state.pos.map, 'haze'); assert.equal(b.state.money, 50);
  assert.equal(b.ctl.said.at(-1), 'T DROPPED $50\nON THE WAY.');
});

test('shisha guy: waits (and heals) until the regulars are beaten, then fights; with the badge he just heals', async () => {
  const REGS = ['regular-1', 'regular-2', 'regular-3', 'regular-4'];
  let h = trainerHarness({ map: 'haze', x: 7, y: 3, facing: 'up' }, { defeated: REGS.slice(0, 3) });
  h.state.party[0].hp = 1;
  await h.pressA();
  assert.deepEqual(h.ctl.said, [dialogue['haze-leader-wait'], dialogue['haze-heal-2']]);
  assert.equal(h.state.party[0].hp, h.state.party[0].maxHp, 'healed anyway');
  for (let i = 0; i < 90; i++) await h.tick();
  assert.equal(h.ctl.battles.length, 0);

  h = trainerHarness({ map: 'haze', x: 7, y: 3, facing: 'up' }, { defeated: REGS });
  await h.pressA();
  assert.deepEqual(h.ctl.said, [dialogue['haze-leader-pre']]);
  await h.until(() => h.ctl.battles.length);
  assert.equal(h.ctl.battles[0].trainer.id, 'haze-guy');
  assert.deepEqual(teamOf(h.ctl.battles[0]), trainersById['haze-guy'].team);

  h = trainerHarness({ map: 'haze', x: 7, y: 3, facing: 'up' }, { badges: ['haze'], defeated: [...REGS, 'haze-guy'] });
  await h.pressA();
  assert.deepEqual(h.ctl.said, [dialogue['haze-heal-1'], dialogue['haze-heal-2']]);
  for (let i = 0; i < 90; i++) await h.tick();
  assert.equal(h.ctl.battles.length, 0);
});

test('beating the leader: badge + jingle + badge text; the officer\'s line flips; the gate opens', async () => {
  const h = trainerHarness({ map: 'haze', x: 7, y: 3, facing: 'up' });
  h.scene.onBattleEnd('win', { kind: 'trainer', trainer: { id: 'haze-guy', name: 'HAZE GUY' } });
  await h.flush();
  assert.deepEqual(h.state.badges, ['haze']);
  assert.ok(h.state.defeatedTrainers.includes('haze-guy'));
  assert.deepEqual(h.ctl.said, [dialogue['haze-leader-post'], 'T GOT THE\nHAZE BADGE!']);
  assert.deepEqual(h.ctl.jingles, ['badge']);
  const officer = h.scene.maps.booth.npcs.find(n => n.id === 'officer');
  assert.equal(dialogueFor(officer, h.state, dialogue), dialogue['booth-officer-open']);

  const shut = trainerHarness({ map: 'town', x: 25, y: 5, facing: 'up' });
  shut.ctl.dir = 'up'; for (let i = 0; i < 20; i++) await shut.tick();
  assert.equal(shut.state.pos.y, 5, 'the closed gate blocks');
  const open = trainerHarness({ map: 'town', x: 25, y: 5, facing: 'up' }, { badges: h.state.badges });
  open.ctl.dir = 'up'; await open.until(() => open.state.pos.y === 4, 40);
  assert.equal(open.scene.map.rows[4][25], 'G', 'the tile data stays G; the badge makes it passable');
});

test('champion: with the badge, stepping into the border strip brings Suhaib in; win → champion, onChampion once, rematch after', async () => {
  const h = trainerHarness({ map: 'town', x: 25, y: 5, facing: 'up' }, { badges: ['haze'], defeated: ['haze-guy'] });
  assert.equal(h.npc('suhaib'), undefined, 'not placed before the trigger');
  h.ctl.dir = 'up';
  await h.until(() => h.scene.trainerFlow.seq);
  h.ctl.dir = null;
  assert.deepEqual([h.state.pos.x, h.state.pos.y], [25, 3], 'triggered on the first strip tile');
  const suhaib = h.npc('suhaib');
  assert.deepEqual([suhaib.x, suhaib.y, suhaib.sprite], [25, 0, 'npc-suhaib'], 'walks in from the top edge');
  await h.until(() => h.ctl.said.length);
  assert.deepEqual([suhaib.x, suhaib.y], [25, 2], 'stops at the champion tile');
  assert.deepEqual(h.ctl.said, [dialogue['suhaib-pre']]);
  await h.until(() => h.ctl.battles.length);
  const { trainer } = h.ctl.battles[0];
  assert.equal(h.ctl.battles[0].kind, 'trainer');
  assert.deepEqual(trainer, { id: 'suhaib', name: 'SUHAIB', payout: trainersById.suhaib.payout, isChampion: true, speechAfterFaints: 3, speech: dialogue['suhaib-mid'] });
  assert.equal(h.ctl.battles[0].foeParty.length, 6);

  h.scene.onBattleEnd('win', { kind: 'trainer', trainer });
  await h.flush();
  assert.equal(h.state.flags.champion, true);
  assert.ok(h.state.defeatedTrainers.includes('suhaib'));
  assert.deepEqual(h.ctl.said.slice(1), [dialogue['suhaib-lost'], 'T IS THE\nDUMPLING CHAMPION!']);
  assert.deepEqual(h.ctl.jingles, ['encounter', 'victory'], 'trainer battles open with the encounter jingle too');
  assert.equal(h.ctl.champion, 1);

  h.ctl.said.length = 0;
  h.scene.player.facing = 'up';
  await h.pressA();
  assert.deepEqual(h.ctl.said, [dialogue['suhaib-rematch']]);
  await h.until(() => h.ctl.battles.length === 2);
  h.scene.onBattleEnd('win', { kind: 'trainer', trainer: h.ctl.battles[1].trainer });
  await h.flush();
  assert.deepEqual(h.ctl.said, [dialogue['suhaib-rematch'], dialogue['suhaib-lost']], 'a rematch win just repeats post');
  assert.equal(h.ctl.champion, 1, 'onChampion fires once');
  assert.equal(h.scene.map.npcs.filter(n => n.id === 'suhaib').length, 1);
});

test('champion: no badge → no Suhaib; after a reload as champion he is already standing at his tile', async () => {
  const h = trainerHarness({ map: 'town', x: 25, y: 3, facing: 'up' });
  for (let i = 0; i < 20; i++) await h.tick();
  assert.equal(h.scene.trainerFlow.seq, null);
  assert.equal(h.npc('suhaib'), undefined);
  const c = trainerHarness({ map: 'town', x: 20, y: 2, facing: 'up' }, { badges: ['haze'], defeated: ['suhaib'] });
  c.state.flags.champion = true; c.scene.enter();
  const s = c.npc('suhaib');
  assert.deepEqual([s.x, s.y], [25, 2]);
  for (let i = 0; i < 20; i++) await c.tick();
  assert.equal(c.scene.trainerFlow.seq, null, 'no walk-in once champion');
});

test('LOS: a full walk-up from 3 tiles away (Wet Will facing down, player steps onto (17,33))', async () => {
  const h = trainerHarness({ map: 'town', x: 17, y: 34, facing: 'up' });
  const will = h.npc('wet-will');
  assert.deepEqual([will.x, will.y, will.facing, will.sight], [17, 30, 'down', 3]);
  h.ctl.dir = 'up';
  await h.until(() => h.scene.trainerFlow.seq);
  h.ctl.dir = null;
  assert.deepEqual([h.state.pos.x, h.state.pos.y], [17, 33]);
  const ys = new Set();
  await h.until(() => { ys.add(will.y); return h.ctl.said.length > 0; });
  assert.deepEqual([...ys], [30, 31, 32], 'walked tile by tile, stopping beside the player');
  assert.equal(h.scene.player.facing, 'up');
  assert.deepEqual(h.ctl.said, [dialogue['wet-will-pre']]);
  await h.until(() => h.ctl.battles.length);
  assert.deepEqual(teamOf(h.ctl.battles[0]), trainersById['wet-will'].team);
});

test('LOS: an npc standing in the lane blocks the trainer\'s sight', async () => {
  const h = trainerHarness({ map: 'town', x: 17, y: 34, facing: 'up' });
  h.scene.map.npcs.push({ id: 'blocker', x: 17, y: 31, facing: 'down', sprite: 'npc-townie', dialogue: 'townie-1' });
  h.ctl.dir = 'up';
  await h.until(() => h.state.pos.y === 33, 60);
  h.ctl.dir = null;
  for (let i = 0; i < 40; i++) await h.tick();
  assert.equal(h.scene.trainerFlow.seq, null);
  assert.equal(h.ctl.battles.length, 0);
});

test('LOS: two trainers seeing the same tile → exactly one alert, and only that trainer walks up', async () => {
  const h = trainerHarness({ map: 'town', x: 12, y: 23, facing: 'down' });
  const will = h.npc('wet-will'); Object.assign(will, { x: 14, y: 24, facing: 'left' }); // sees (13..11, 24)
  const nic = h.npc('napkin-nic');
  h.ctl.dir = 'down';
  const seqs = new Set();
  await h.until(() => { if (h.scene.trainerFlow.seq) { seqs.add(h.scene.trainerFlow.seq); h.ctl.dir = null; } return h.ctl.battles.length > 0; });
  assert.equal(seqs.size, 1, 'one alert sequence');
  assert.equal([...seqs][0].npc, nic, 'the first trainer in the list wins the tie');
  assert.deepEqual([will.x, will.y], [14, 24], 'the other trainer stayed put');
  assert.equal(h.ctl.battles[0].trainer.id, 'napkin-nic');
});

test('champion: loading north of his tile and stepping south → he walks 0→1→2 and stops beside the player', async () => {
  const h = trainerHarness({ map: 'town', x: 25, y: 1, facing: 'down' }, { badges: ['haze'], defeated: ['haze-guy'] });
  for (let i = 0; i < 5; i++) await h.tick();
  assert.equal(h.scene.trainerFlow.seq, null, 'no trigger on row 1');
  h.ctl.dir = 'down';
  await h.until(() => h.state.pos.y === 2, 60);
  assert.equal(h.scene.trainerFlow.seq, null, 'no trigger on his own row');
  await h.until(() => h.scene.trainerFlow.seq, 60);
  h.ctl.dir = null;
  assert.equal(h.state.pos.y, 3);
  const suhaib = h.npc('suhaib'), ys = new Set();
  await h.until(() => { ys.add(suhaib.y); return h.ctl.said.length > 0; });
  assert.deepEqual([...ys], [0, 1, 2]);
  assert.deepEqual([suhaib.x, suhaib.y], [25, 2]);
  assert.deepEqual(h.ctl.said, [dialogue['suhaib-pre']]);
});

test('booth officer: with the badge, gives 3 Extra Sauce exactly once', async () => {
  const t = trainerHarness({ map: 'booth', x: 3, y: 3, facing: 'up' }, { badges: ['haze'] });
  const before = t.state.bag['extra-sauce'];
  await t.pressA();
  assert.deepEqual(t.ctl.said, [dialogue['booth-officer-open'], dialogue['booth-officer-sauce'], 'T GOT 3\nEXTRA SAUCE!']);
  assert.equal(t.state.bag['extra-sauce'], before + 3);
  assert.equal(t.state.flags.sauceGiven, true);
  await t.pressA();
  assert.deepEqual(t.ctl.said.slice(3), [dialogue['booth-officer-open']], 'no second gift');
  assert.equal(t.state.bag['extra-sauce'], before + 3);
  const n = trainerHarness({ map: 'booth', x: 3, y: 3, facing: 'up' });
  await n.pressA();
  assert.deepEqual(n.ctl.said, [dialogue['booth-officer-locked']], 'no badge, no sauce');
});

/** Headless scene with a real-ish button set: `press(...)` makes buttons justPressed for one tick. */
function buttons(start, setupState = () => {}) {
  const ctl = { pressed: new Set(), said: [], saves: [] };
  const state = newGameState('T', start);
  setupState(state);
  const textbox = { open: false, update() {}, draw() {}, say(t) { ctl.said.push(t); return Promise.resolve(); } };
  const db = { dialogue, items: itemsList, itemsById: Object.fromEntries(itemsList.map(i => [i.id, i])) };
  const scene = new OverworldScene({
    db, maps: loadMaps(structuredClone(mapData)), state, tileset: { draw() {} },
    input: makeInput({ direction: () => null, justPressed: b => ctl.pressed.has(b) }),
    textbox, save: { autosave: s => ctl.saves.push(structuredClone(s.pos)) },
  });
  scene.enter();
  const press = async (...b) => { ctl.pressed = new Set(b); scene.update(1 / 60); ctl.pressed = new Set(); for (let i = 0; i < 5; i++) await null; };
  return { scene, state, ctl, press };
}

test('talking to the shopkeeper over the counter opens the shop overlay; leaving closes it', async () => {
  const t = buttons({ map: 'ribs', x: 3, y: 3, facing: 'up' });
  await t.press('a');
  assert.ok(t.scene.overlay instanceof ShopScreen);
  assert.deepEqual(t.ctl.said, [dialogue['ribs-shop']]);
  await t.press('a'); // BUY
  await t.press('a'); // DUMPLINGBALL, x1
  await t.press('a'); // pay
  assert.equal(t.state.money, 400);
  assert.equal(t.ctl.said.at(-1), dialogue['shop-bought-balls']);
  await t.press('b'); await t.press('b'); // list → main → leave
  assert.equal(t.ctl.said.at(-1), dialogue['shop-leave']);
  assert.equal(t.scene.overlay, null);
});

test('a napkin from the Start menu BAG warps to Haze Lounge, autosaves, then says so', async () => {
  const t = buttons({ map: 'town', x: 11, y: 12, facing: 'down' }, s => { s.bag.napkin = 1; });
  await t.press('start');
  await t.press('down'); await t.press('down'); await t.press('a'); // BAG
  assert.ok(t.scene.startMenu.screen instanceof BagScreen);
  await t.press('down'); await t.press('a'); await t.press('a'); // NAPKIN → USE
  assert.equal(t.state.bag.napkin, 0);
  assert.equal(t.scene.startMenu.open, false);
  assert.equal(t.scene.fader.active, true);
  for (let i = 0; i < 60 && t.scene.fader.active; i++) await t.press();
  await t.press();
  const door = mapData.maps.town.warps.find(w => w.to === 'haze');
  assert.deepEqual(t.state.pos, { map: 'haze', x: door.tx, y: door.ty, facing: 'up' });
  assert.equal(t.scene.map.id, 'haze');
  assert.deepEqual(t.ctl.saves, [t.state.pos]);
  assert.equal(t.ctl.said.at(-1), 'T WIPED HIS WAY\nBACK TO HAZE LOUNGE.');
});

test('Start → DUMPLINGS opens the party screen; B returns to the Start menu', async () => {
  const t = buttons({ map: 'town', x: 11, y: 12, facing: 'down' }, s => {
    s.party.push(makeMonster(speciesList[0], 5, Object.fromEntries(movesList.map(m => [m.id, m])), () => 0.5));
  });
  await t.press('start'); await t.press('down'); await t.press('a');
  assert.equal(t.scene.startMenu.screen?.mode, 'manage');
  await t.press('b');
  assert.equal(t.scene.startMenu.screen, null);
  assert.equal(t.scene.startMenu.open, true);
});

test('Start → DUMPLINGDEX opens the Dex overlay; B returns to the Start menu', async () => {
  const t = buttons({ map: 'town', x: 11, y: 12, facing: 'down' }, s => { s.dex.seen.push('d001'); });
  await t.press('start'); await t.press('a'); // DUMPLINGDEX is the first item
  assert.ok(t.scene.startMenu.screen instanceof DexScreen);
  assert.equal(t.ctl.said.length, 0, 'no more NOT YET.');
  await t.press('b');
  assert.equal(t.scene.startMenu.screen, null);
  assert.equal(t.scene.startMenu.open, true);
});

test('the haze healer plays the heal jingle between heal-1 and heal-2', async () => {
  const t = talker({ map: 'haze', x: 7, y: 3, facing: 'up' });
  t.scene.audio = { playJingle: n => t.ctl.said.push(`jingle:${n}`), playSfx() {}, startMusic() {}, stopMusic() {} };
  await t.pressA();
  assert.deepEqual(t.ctl.said, [dialogue['haze-heal-1'], 'jingle:heal', dialogue['haze-heal-2']]);
});

// ── starter pick (Task 34) ────────────────────────────────────────────────────
/** Lab harness with the real TextBox (the YES/NO prompt reads its page state); buttons per tick. */
function lab(pos = { map: 'lab', x: 5, y: 4, facing: 'up' }) {
  const ctl = { pressed: new Set(), saves: [], jingles: [] };
  const state = newGameState('TAREK', pos);
  const input = makeInput({ direction: () => null, justPressed: b => ctl.pressed.has(b) });
  const textbox = new TextBox();
  const scene = new OverworldScene({
    db: { ...fullDb, types: { colors: {} }, images: {} }, maps: loadMaps(structuredClone(mapData)), state, tileset: { draw() {} },
    input, textbox, save: { autosave: s => ctl.saves.push(structuredClone(s)) },
    audio: { playJingle: n => ctl.jingles.push(n), playSfx() {}, startMusic() {} }, rng: () => 0.5,
  });
  scene.enter();
  const press = async (...b) => { ctl.pressed = new Set(b); scene.update(1 / 60); ctl.pressed = new Set(); for (let i = 0; i < 5; i++) await null; };
  const settle = async () => { for (let i = 0; i < 80 && textbox.open && !textbox.pageRevealed; i++) await press(); };
  /** Read every page of whatever is on screen (A per page) until the box closes or a YES/NO shows. */
  const readAll = async () => { const seen = []; while (textbox.open && !scene.prompt.showing) { await settle(); if (scene.prompt.showing) break; seen.push(textbox.pages[textbox.pageIndex].join('\n')); await press('a'); } return seen; };
  return { scene, state, ctl, textbox, press, settle, readAll };
}
const pages = id => dialogue[id].split('\f');

test('pedestal → preview + line → TAKE IT? YES: L5 starter, flags, dex caught, jingle, autosave', async () => {
  const t = lab({ map: 'lab', x: 6, y: 4, facing: 'up' }); // Chillbao's pedestal
  await t.press('a');
  assert.equal(t.scene.preview?.id, 'd061', 'sticker card is up');
  assert.deepEqual(await t.readAll(), pages('starter-d061'));
  await t.settle();
  assert.ok(t.scene.prompt.showing);
  assert.deepEqual(t.textbox.pages, [[dialogue['starter-confirm']]]);
  await t.press('a'); // YES
  assert.equal(t.state.party.length, 1);
  const m = t.state.party[0];
  assert.deepEqual([m.speciesId, m.level], ['d061', 5]);
  assert.equal(t.state.flags.starterPicked, true);
  assert.equal(t.state.flags.starterId, 'd061');
  assert.ok(t.state.dex.caught.includes('d061') && t.state.dex.seen.includes('d061'));
  assert.deepEqual(t.ctl.jingles, ['caught']);
  assert.equal(t.ctl.saves.length, 1);
  assert.equal(t.ctl.saves[0].party[0].speciesId, 'd061');
  assert.deepEqual(await t.readAll(), ['TAREK RECEIVED\nCHILLBAO!']);
  assert.equal(t.scene.preview, null);
  assert.equal(t.scene.busy, false);
});

test('TAKE IT? NO (or B) leaves the pedestal alone', async () => {
  for (const answer of [['down', 'a'], ['b']]) {
    const t = lab();
    await t.press('a'); await t.readAll(); await t.settle();
    for (const b of answer) await t.press(b);
    assert.equal(t.state.party.length, 0);
    assert.equal(t.state.flags.starterPicked, undefined);
    assert.equal(t.textbox.open, false);
    assert.equal(t.scene.preview, null);
    assert.deepEqual(t.ctl.saves, []);
  }
});

test('after the pick: the other pedestals are empty (render as floor, say starter-gone)', async () => {
  const t = lab({ map: 'lab', x: 5, y: 4, facing: 'up' });
  Object.assign(t.state.flags, { starterPicked: true, starterId: 'd061' });
  await t.press('a');
  assert.deepEqual(await t.readAll(), pages('starter-gone'));
  assert.equal(t.state.party.length, 0);
  const map = t.scene.map;
  assert.deepEqual([5, 6, 7].map(x => pedestalGone(map, t.state, x, 3)), [true, false, true]);
  t.state.flags.starterPicked = false;
  assert.deepEqual([5, 6, 7].map(x => pedestalGone(map, t.state, x, 3)), [false, false, false]);
});

test('the lab mat blocks without a starter (Otto says why, player backs up) and warps with one', async () => {
  const t = lab({ map: 'lab', x: 5, y: 7, facing: 'down' });
  t.scene.player.tryMove('down', t.scene.map, {});
  for (let i = 0; i < 30 && t.scene.player.moving; i++) t.scene.player.update(1 / 60);
  assert.equal(t.scene.fader.active, false, 'no warp');
  assert.deepEqual(t.state.pos, { map: 'lab', x: 5, y: 7, facing: 'up' });
  assert.deepEqual([t.scene.player.x, t.scene.player.y, t.scene.player.facing], [5, 7, 'up']);
  for (let i = 0; i < 5; i++) await null;
  assert.deepEqual(await t.readAll(), pages('otto-lab-block'));

  t.state.flags.starterPicked = true;
  t.scene.player.tryMove('down', t.scene.map, {});
  for (let i = 0; i < 30 && t.scene.player.moving; i++) t.scene.player.update(1 / 60);
  assert.equal(t.scene.fader.active, true, 'warps now');
});

test('Prof. Otto\'s line flips once a starter is picked', async () => {
  const t = lab({ map: 'lab', x: 7, y: 2, facing: 'left' });
  await t.press('a');
  assert.deepEqual(await t.readAll(), pages('otto-lab-intro'));
  t.state.flags.starterPicked = true;
  await t.press('a');
  assert.deepEqual(await t.readAll(), pages('otto-lab-after'));
});

// ---------------------------------------------------------------- skateboard (Task 36)

const NICE_DAY = '2026-01-02', BAD_DAY = '2026-01-01'; // fixed dates: one nice, one bad (see rng.test.js)

/** Sets `?date=` for the duration of an async fn, restoring globalThis.location after. */
async function withDate(dateString, fn) {
  const had = 'location' in globalThis, restore = globalThis.location;
  globalThis.location = { search: `?date=${dateString}` };
  try { return await fn(); } finally { if (had) globalThis.location = restore; else delete globalThis.location; }
}

/** Headless scene for skateboard tests: A presses like `talker`, direction holds like `headless`;
 *  a recording audio stub captures the loop sfx (start:<name> / stop) alongside dialogue. */
function skateHarness(start) {
  const ctl = { dir: null, a: false, said: [], loop: [] };
  const state = newGameState('T', start);
  const audio = {
    playJingle() {}, playSfx() {}, startMusic() {}, stopMusic() {},
    startLoopSfx: name => ctl.loop.push(`start:${name}`), stopLoopSfx: () => ctl.loop.push('stop'),
  };
  const textbox = { open: false, update() {}, draw() {}, say(t) { ctl.said.push(t); return Promise.resolve(); } };
  const scene = new OverworldScene({
    db: { dialogue }, maps: loadMaps(structuredClone(mapData)), state, tileset: { draw() {} },
    input: makeInput({ direction: () => ctl.dir, justPressed: b => b === 'a' && ctl.a }),
    textbox, save: { autosave() {} }, audio,
  });
  scene.enter();
  const pressA = async () => { ctl.a = true; scene.update(1 / 60); ctl.a = false; for (let i = 0; i < 5; i++) await null; };
  const tick = async (n = 1) => { for (let i = 0; i < n; i++) { scene.update(1 / 60); await null; } };
  return { scene, state, ctl, pressA, tick };
}
const RACK = { map: 'town', x: 5, y: 34, facing: 'left' }; // faces the K tile at (4, 34)

test('rack, nice day: picks the board up, starts the loop, sets boardOut', async () => {
  await withDate(NICE_DAY, async () => {
    const t = skateHarness(RACK);
    await t.pressA();
    assert.deepEqual(t.ctl.said, [dialogue['rack-nice']]);
    assert.equal(t.scene.player.skating, true);
    assert.deepEqual(t.ctl.loop, ['start:skate']);
    assert.equal(t.state.flags.boardOut, true);
  });
});

test('rack, bad day: just says so, nothing else changes', async () => {
  await withDate(BAD_DAY, async () => {
    const t = skateHarness(RACK);
    await t.pressA();
    assert.deepEqual(t.ctl.said, [dialogue['rack-bad']]);
    assert.equal(t.scene.player.skating, false);
    assert.deepEqual(t.ctl.loop, []);
    assert.equal(t.state.flags.boardOut, undefined);
  });
});

test('rack, second A while skating: parks it', async () => {
  await withDate(NICE_DAY, async () => {
    const t = skateHarness(RACK);
    await t.pressA(); // picks it up
    t.ctl.said.length = 0; t.ctl.loop.length = 0;
    await t.pressA(); // parks it
    assert.deepEqual(t.ctl.said, [dialogue['rack-park']]);
    assert.equal(t.scene.player.skating, false);
    assert.deepEqual(t.ctl.loop, ['stop']);
    assert.equal(t.state.flags.boardOut, false);
  });
});

test('walking into a door while skating parks the board; walking back out restores it with rack-back', async () => {
  const t = skateHarness({ map: 'town', x: 12, y: 10, facing: 'up' });
  t.state.flags.boardOut = true;
  t.state.flags.starterPicked = true; // so the lab mat lets us back out again below
  t.scene.player.skating = true;

  t.ctl.dir = 'up';
  for (let i = 0; i < 60 && t.state.pos.map === 'town'; i++) t.scene.update(1 / 60);
  for (let i = 0; i < 30 && t.scene.fader.active; i++) t.scene.update(1 / 60);
  await t.tick(5);

  assert.equal(t.state.pos.map, 'lab', 'walked through the lab door');
  assert.equal(t.scene.player.skating, false, 'no skating indoors');
  assert.equal(t.state.flags.boardParked, true);
  assert.ok(t.ctl.loop.includes('stop'));
  assert.deepEqual(t.ctl.said, [], 'no line going in');

  t.ctl.loop.length = 0;
  t.ctl.dir = 'down';
  for (let i = 0; i < 60 && t.state.pos.map === 'lab'; i++) t.scene.update(1 / 60);
  for (let i = 0; i < 30 && t.scene.fader.active; i++) t.scene.update(1 / 60);
  await t.tick(5);

  assert.equal(t.state.pos.map, 'town', 'walked back out through the mat');
  assert.equal(t.scene.player.skating, true, 'the board is back');
  assert.equal(t.state.flags.boardParked, false);
  assert.ok(t.ctl.loop.includes('start:skate'));
  assert.deepEqual(t.ctl.said, [dialogue['rack-back']]);
});

test('encounter rate halves while skating: a roll that hits at full rate misses at half', () => {
  const rng = () => 0.08; // route-1 rate is 0.12: hits at ×1 (0.08 < 0.12), misses at ×0.5 (0.08 >= 0.06)
  const { scene: normal, ctl: normalCtl } = encounterHarness({ rng });
  normalCtl.dir = 'right';
  for (let i = 0; i < 20 && !normal.transition.active; i++) normal.update(1 / 60);
  assert.equal(normal.transition.active, true, 'hits at full rate while on foot');

  const { scene: skating, ctl: skateCtl } = encounterHarness({ rng });
  skating.player.skating = true;
  skateCtl.dir = 'right';
  for (let i = 0; i < 20; i++) skating.update(1 / 60);
  assert.equal(skating.transition.active, false, 'misses at half rate while skating');
});

test('battle start stops the skate loop; onBattleEnd restarts it if still skating', () => {
  const loop = [];
  const audio = {
    playJingle() {}, playSfx() {}, startMusic() {}, stopMusic() {},
    startLoopSfx: n => loop.push(`start:${n}`), stopLoopSfx: () => loop.push('stop'),
  };
  const { scene } = encounterHarness({ rng: () => 0.01, audio });
  scene.player.skating = true;
  scene.player.tryMove('right', scene.map, {});
  for (let i = 0; i < 20 && scene.player.moving; i++) scene.player.update(1 / 60);
  assert.deepEqual(loop, ['stop'], 'the loop stops the moment a battle starts');

  scene.onBattleEnd('win');
  assert.deepEqual(loop, ['stop', 'start:skate'], 'and resumes since the player is still on the board');
});
