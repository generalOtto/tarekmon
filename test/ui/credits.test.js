import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CreditsScene, wrapWords } from '../../src/ui/credits.js';
import { newGameState } from '../../src/engine/state.js';
import dialogue from '../../data/dialogue.json' with { type: 'json' };

function fakeCtx() {
  return new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
}

function setup({ caught = ['d061', 'd002', 'd013'] } = {}) {
  const state = newGameState('TAREK', { map: 'town', x: 1, y: 1, facing: 'down' });
  state.dex.caught.push(...caught);
  state.flags.starterId = 'd061';
  const log = { music: [], jingles: [], done: 0 };
  const input = { held: new Set(), justPressed(b) { return this.held.has(b); } };
  const scene = new CreditsScene({
    db: { dialogue, images: {} }, state, input, textbox: { open: false }, tileset: { draw() {} },
    audio: { startMusic: n => log.music.push(n), playJingle: n => log.jingles.push(n), stopMusic() {} },
    onDone: () => log.done++,
  });
  scene.enter();
  const tick = (n = 1, ...buttons) => { for (let i = 0; i < n; i++) { input.held = new Set(buttons); scene.update(1 / 60); input.held = new Set(); } };
  /** Run until the given phase begins (bounded). */
  const until = phase => { for (let i = 0; i < 5000 && scene.phase !== phase; i++) tick(); assert.equal(scene.phase, phase); };
  return { scene, state, log, tick, until };
}

test('enter starts the credits music', () => {
  const { log, scene } = setup();
  assert.deepEqual(log.music, ['credits']);
  assert.equal(scene.phase, 'scroll');
});

test('the parade walks every caught species 40 px apart, 1 px/tick, and loops after the last one exits', () => {
  const { scene, tick } = setup();
  assert.deepEqual(scene.parade.map(p => p.id), ['d061', 'd002', 'd013']);
  const x0 = scene.parade.map(p => p.x);
  assert.deepEqual([x0[0] - x0[1], x0[1] - x0[2]], [40, 40]);
  tick();
  assert.equal(scene.parade[0].x, x0[0] + 1);
  const period = scene.paradePeriod;
  let looped = false;
  for (let i = 0; i < period; i++) { const before = scene.parade[2].x; tick(); if (scene.parade[2].x < before) { looped = true; assert.ok(before >= 160, 'loops only once the last one is off the right edge'); } }
  assert.ok(looped);
  for (let i = 0; i < 40; i++) { tick(); for (const p of scene.parade) assert.ok(p.bob >= 0 && p.bob <= 2); }
});

test('an empty dex still parades the starter', () => {
  const { scene } = setup({ caught: [] });
  assert.deepEqual(scene.parade.map(p => p.id), ['d061']);
});

test('the credits lines come from dialogue with the caught count substituted', () => {
  const { scene } = setup();
  assert.equal(scene.lines.length, dialogue.credits.length);
  assert.equal(scene.lines[0], 'TAREKMON');
  assert.ok(scene.lines.includes('3 / 74'));
  assert.ok(!scene.lines.some(l => l.includes('{n}')));
});

test('lines scroll 1 px every 2 ticks; after they leave the top: night for 90 ticks, then the card', () => {
  const { scene, tick, until } = setup();
  const y0 = scene.lineY(0);
  tick(2);
  assert.equal(scene.lineY(0), y0 - 1);
  until('night');
  assert.ok(scene.lineY(scene.lines.length - 1) + 8 <= 0, 'the last line is fully off the top');
  assert.equal(scene.nightAlpha, 0);
  tick(45);
  assert.ok(Math.abs(scene.nightAlpha - 0.4) < 0.01);
  tick(44);
  assert.equal(scene.phase, 'night');
  tick();
  assert.equal(scene.phase, 'card');
  assert.equal(scene.nightAlpha, 0.8);
});

test('the card types the birthday message 3 ticks per char, heal once; A only works when it is fully typed', () => {
  const { scene, log, tick, until } = setup();
  assert.doesNotThrow(() => scene.draw(fakeCtx()));
  until('card');
  assert.deepEqual(log.jingles, ['heal']);
  assert.deepEqual(scene.cardLines, ["HAPPY BIRT-D'AY", 'PINE-APPLE,', 'LOOKING WERRY GOOR', 'WERRY NAAAICE!']);
  const chars = dialogue.birthday.length;
  tick(chars * 3 - 1);
  assert.equal(scene.typed, false);
  tick(1, 'a');
  assert.equal(log.done, 0, 'A before the card is fully typed does nothing');
  assert.equal(scene.typed, true);
  assert.equal(scene.shownLines().join(' '), dialogue.birthday.toUpperCase());
  assert.doesNotThrow(() => scene.draw(fakeCtx()));
  tick(30);
  assert.deepEqual(log.jingles, ['heal']);
  tick(1, 'a');
  tick(1, 'b');
  assert.equal(log.done, 1);
});

test('the typewriter reveals the card line by line', () => {
  const { scene, tick, until } = setup();
  until('card');
  tick(3 * 17);
  assert.deepEqual(scene.shownLines(), ["HAPPY BIRT-D'AY", 'P', '', '']);
});

test('wrapWords breaks greedily at 18 columns', () => {
  assert.deepEqual(wrapWords('AAA BBB CCC', 7), ['AAA BBB', 'CCC']);
});
