import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SceneStack, startLoop } from '../../src/engine/loop.js';

test('only the top scene updates and draws; push/pop/replace', () => {
  const log = [];
  const mk = n => ({ update: () => log.push(`u${n}`), draw: () => log.push(`d${n}`), enter: () => log.push(`e${n}`), exit: () => log.push(`x${n}`) });
  const s = new SceneStack();
  s.push(mk(1)); s.push(mk(2)); s.update(1 / 60); s.draw({});
  s.pop(); s.update(1 / 60); s.replace(mk(3)); s.draw({});
  assert.deepEqual(log, ['e1', 'e2', 'u2', 'd2', 'x2', 'u1', 'x1', 'e3', 'd3']);
});

test('startLoop ticks at a fixed 1/60 step and renders once per frame', () => {
  let cb = null;
  const raf = fn => { cb = fn; };
  let t = 0;
  const now = () => t;
  const ticks = [];
  let renders = 0;
  const stop = startLoop({ tick: dt => ticks.push(dt), render: () => { renders++; }, raf, now });

  // Frame 1: advance 50ms, invoke the queued callback.
  t += 50; const frame1 = cb; cb = null; frame1();
  assert.equal(ticks.length, 3);
  assert.equal(renders, 1);
  assert.ok(cb, 'raf should be re-armed for the next frame');

  // Frame 2: another 50ms.
  t += 50; const frame2 = cb; cb = null; frame2();
  assert.equal(ticks.length, 6);
  assert.equal(renders, 2);

  // Frame 3: another 50ms.
  t += 50; const frame3 = cb; cb = null; frame3();
  assert.equal(ticks.length, 9);
  assert.equal(renders, 3);

  for (const dt of ticks) assert.ok(Math.abs(dt - 1 / 60) < 1e-9);

  stop();
  t += 50;
  if (cb) cb();
  assert.equal(ticks.length, 9, 'no further ticks after stop');
  assert.equal(renders, 3, 'no further renders after stop');
});
