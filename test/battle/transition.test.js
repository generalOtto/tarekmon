import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FlashWipe } from '../../src/battle/transition.js';

test('FlashWipe: 3 flashes (8 on / 8 off) then a 24-tick wipe; onDone fires once at full black', () => {
  const w = new FlashWipe();
  assert.equal(w.active, false);
  let done = 0;
  w.start(() => done++);
  assert.equal(w.active, true);
  const flashes = [];
  for (let i = 0; i < 3 * 16; i++) { flashes.push(w.flashOn); w.update(); }
  // alternation: on for 8, off for 8, three times
  const expected = [];
  for (let f = 0; f < 3; f++) expected.push(...Array(8).fill(true), ...Array(8).fill(false));
  assert.deepEqual(flashes, expected);
  assert.equal(w.phase, 'wipe');
  for (let i = 0; i < 23; i++) w.update();
  assert.equal(done, 0);
  assert.ok(w.wipe > 0.9 && w.wipe < 1);
  w.update();
  assert.equal(done, 1);
  assert.equal(w.active, false);
  for (let i = 0; i < 50; i++) w.update();
  assert.equal(done, 1);
});

test('FlashWipe: draw is a no-op when inactive and paints when active', () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => calls.push(k)), set: (t, k, v) => { t[k] = v; return true; } });
  const w = new FlashWipe();
  w.draw(ctx); assert.equal(calls.length, 0);
  w.start(() => {}); w.draw(ctx); assert.ok(calls.includes('fillRect'));
});
