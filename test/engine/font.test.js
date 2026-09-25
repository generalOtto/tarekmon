import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLYPHS, CHAR_W, LINE_H, drawText, measure } from '../../src/engine/font.js';

const REQUIRED = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."0123456789",
  ' ', '.', ',', '!', '?', "'", '-', ':', '/', '(', ')', '♥', '▶', '…',
];

test('every glyph is 7 rows of exactly 5 chars using only # and .', () => {
  for (const [ch, g] of Object.entries(GLYPHS)) {
    assert.equal(g.length, 7, `glyph ${ch} should have 7 rows`);
    for (const row of g) {
      assert.equal(row.length, 5, `glyph ${ch} row should have 5 chars`);
      assert.match(row, /^[#.]{5}$/, `glyph ${ch} row should only use # and .`);
    }
  }
});

test('the glyph set contains all required characters', () => {
  for (const ch of REQUIRED) assert.ok(GLYPHS[ch], `missing glyph for ${JSON.stringify(ch)}`);
});

test('constants', () => {
  assert.equal(CHAR_W, 6);
  assert.equal(LINE_H, 8);
});

test('measure returns length * CHAR_W', () => {
  assert.equal(measure('ABC'), 18);
});

test('drawText upper-cases input and returns x + CHAR_W per glyph', () => {
  const calls = [];
  const ctx = { fillRect: (...args) => calls.push(args), fillStyle: null };
  const endX = drawText(ctx, 'a', 10, 20);
  const litCount = GLYPHS['A'].join('').split('').filter(c => c === '#').length;
  assert.equal(calls.length, litCount);
  assert.equal(endX, 10 + CHAR_W);
});
