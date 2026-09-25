import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTileset } from '../../src/world/tileset.js';
import { LEGEND, TILE_SIZE as S } from '../../src/world/tiles.js';

// Fake canvas: records every fillRect in absolute canvas coordinates (translate applied).
function fakeDoc() {
  const rects = [];
  const stack = [];
  let off = [0, 0];
  const ctx = {
    fillStyle: '#000000',
    save() { stack.push(off); },
    restore() { off = stack.pop() ?? [0, 0]; },
    translate(x, y) { off = [off[0] + x, off[1] + y]; },
    beginPath() {}, rect() {}, clip() {}, drawImage() {},
    fillRect(x, y, w, h) { rects.push({ x: x + off[0], y: y + off[1], w, h }); },
  };
  const doc = { createElement: tag => { assert.equal(tag, 'canvas'); return { width: 0, height: 0, getContext: () => ctx }; } };
  return { doc, rects };
}

const { doc, rects } = fakeDoc();
const ts = buildTileset(doc);
const inCell = (r, f) => r.x >= f.sx && r.x < f.sx + S && r.y >= f.sy && r.y < f.sy + S && r.w <= S && r.h <= S;

test('every legend char draws at least one rect inside each of its cells', () => {
  for (const ch of LEGEND) {
    for (const f of ts.index[ch].frames) assert.ok(rects.some(r => inCell(r, f)), `${ch} drew nothing at ${f.sx},${f.sy}`);
  }
});
test('every rect originates inside a single 16x16 cell and is at most 16x16', () => {
  const frames = Object.values(ts.index).flatMap(e => e.frames);
  for (const r of rects) assert.ok(frames.some(f => inCell(r, f)), `stray rect ${JSON.stringify(r)}`);
});
test('frame counts: water animates, others static', () => {
  for (const ch of LEGEND) assert.equal(ts.index[ch].frames.length, ch === '~' ? 2 : 1, ch);
});
test('canvas fits all cells and draw ignores unknown chars', () => {
  const frames = Object.values(ts.index).flatMap(e => e.frames);
  for (const f of frames) assert.ok(f.sx + S <= ts.canvas.width && f.sy + S <= ts.canvas.height);
  const calls = [];
  assert.doesNotThrow(() => ts.draw({ drawImage: (...a) => calls.push(a) }, '?', 0, 0));
  assert.equal(calls.length, 0);
  ts.draw({ drawImage: (...a) => calls.push(a) }, '~', 0, 0, 1);
  assert.deepEqual(calls[0].slice(1, 3), [ts.index['~'].frames[1].sx, ts.index['~'].frames[1].sy]);
});
