import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginate, Typewriter, TextBox } from '../../src/ui/textbox.js';

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

test('paginate drops a trailing blank page produced by a trailing \\f', () => {
  assert.deepEqual(paginate('HI\f', 18, 2), [['HI']]);
  assert.deepEqual(paginate('', 18, 2), []);
});

// Minimal stand-in for engine/input.js's ButtonState, scoped to one tick:
// pass which buttons are held and which were just pressed *for this call only*.
function inputWith({ down = [], justPressed = [] } = {}) {
  return { isDown: b => down.includes(b), justPressed: b => justPressed.includes(b) };
}

test('TextBox: single page types out, then A resolves the say() promise exactly once and closes', async () => {
  const tb = new TextBox();
  let resolveCount = 0;
  const done = tb.say('HI').then(() => { resolveCount += 1; });
  assert.equal(tb.open, true);

  tb.update(inputWith()); // "HI" is 2 chars at 2/tick: fully typed after one tick
  assert.equal(tb.typewriter.done, true);
  assert.equal(tb.open, true); // not dismissed yet — no A press received

  tb.update(inputWith({ justPressed: ['a'] })); // last (only) page: A resolves and closes
  assert.equal(tb.open, false);
  await done;
  assert.equal(resolveCount, 1);

  tb.update(inputWith({ justPressed: ['a'] })); // closed box ignores further updates
  assert.equal(resolveCount, 1);
});

test('TextBox: two pages via \\f — first A advances, second A resolves', async () => {
  const tb = new TextBox();
  let resolved = false;
  const done = tb.say('HI\fBYE').then(() => { resolved = true; });
  assert.equal(tb.pages.length, 2);

  tb.update(inputWith()); // types "HI" (2 chars @ 2/tick)
  assert.equal(tb.typewriter.done, true);
  tb.update(inputWith({ justPressed: ['a'] })); // advances to page 2, not closed
  assert.equal(tb.open, true);
  assert.equal(tb.pageIndex, 1);
  assert.equal(resolved, false);

  tb.update(inputWith()); // types "BYE" (3 chars @ 2/tick): 2 revealed
  assert.equal(tb.typewriter.done, false);
  tb.update(inputWith()); // 3rd char revealed, now done
  assert.equal(tb.typewriter.done, true);

  tb.update(inputWith({ justPressed: ['a'] })); // last page: A resolves and closes
  assert.equal(tb.open, false);
  await done;
  assert.equal(resolved, true);
});

test('TextBox: re-entrant say() resolves the previous promise', async () => {
  const tb = new TextBox();
  let resolved1 = false;
  const p1 = tb.say('FIRST').then(() => { resolved1 = true; });
  tb.say('SECOND'); // opens over the still-pending first say() — must not orphan p1
  await p1;
  assert.equal(resolved1, true);
  assert.equal(tb.open, true);
});

test('TextBox: say("") does not dismiss on the same tick it opens', async () => {
  const tb = new TextBox();
  let resolved = false;
  const done = tb.say('').then(() => { resolved = true; });
  assert.equal(tb.open, true);
  assert.equal(tb.typewriter.done, true); // nothing to type

  tb.update(inputWith({ justPressed: ['a'] })); // same tick as open — must not close
  assert.equal(tb.open, true);
  assert.equal(resolved, false);

  tb.update(inputWith({ justPressed: ['a'] })); // next tick — now it closes
  assert.equal(tb.open, false);
  await done;
  assert.equal(resolved, true);
});

test('TextBox: say("HI\\f") shows one page only and does not dismiss on the same tick', () => {
  const tb = new TextBox();
  tb.say('HI\f');
  assert.equal(tb.pages.length, 1);
  assert.deepEqual(tb.pages[0], ['HI']);

  tb.update(inputWith({ justPressed: ['a'] })); // still typing this tick — can't dismiss yet
  assert.equal(tb.open, true);
});

test('TextBox: holding A doubles the reveal speed (4 chars/tick instead of 2)', () => {
  const tb = new TextBox();
  tb.say('ABCDEFGH');
  tb.update(inputWith());
  assert.equal(tb.typewriter.revealed, 2);
  tb.update(inputWith({ down: ['a'] }));
  assert.equal(tb.typewriter.revealed, 6);
});
