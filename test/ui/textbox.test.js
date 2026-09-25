import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginate, Typewriter } from '../../src/ui/textbox.js';

test('paginate wraps at 18 chars per line, 2 lines per page, on word boundaries', () => {
  const pages = paginate('WELCOME TO THE WORLD OF TAREKMON! MY NAME IS OTTO.', 18, 2);
  assert.deepEqual(pages[0], ['WELCOME TO THE', 'WORLD OF TAREKMON!']);
  assert.deepEqual(pages[1], ['MY NAME IS OTTO.']);
});
test('explicit \\n forces a line break and \\f forces a page break', () => {
  assert.deepEqual(paginate('HI\nTHERE\fNEXT', 18, 2), [['HI', 'THERE'], ['NEXT']]);
});
test('a word longer than the line is hard-split', () => {
  assert.deepEqual(paginate('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 18, 2), [['ABCDEFGHIJKLMNOPQR', 'STUVWXYZ']]);
});
test('Typewriter reveals charsPerTick characters per tick across lines and reports done', () => {
  const t = new Typewriter(['AB', 'C'], 1);
  assert.equal(t.done, false);
  t.tick(); assert.deepEqual(t.visibleLines(), ['A', '']);
  t.tick(); assert.deepEqual(t.visibleLines(), ['AB', '']);
  t.tick(); assert.deepEqual(t.visibleLines(), ['AB', 'C']); assert.equal(t.done, true);
  t.skip(); assert.deepEqual(t.visibleLines(), ['AB', 'C']);
});
test('Typewriter with charsPerTick 2 and skip', () => {
  const t = new Typewriter(['ABCD'], 2); t.tick(); assert.deepEqual(t.visibleLines(), ['AB']); t.skip(); assert.equal(t.done, true);
});
