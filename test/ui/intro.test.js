import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IntroScene } from '../../src/ui/intro.js';
import { TextBox } from '../../src/ui/textbox.js';
import { GRID } from '../../src/ui/nameentry.js';
import dialogue from '../../data/dialogue.json' with { type: 'json' };

function stubInput() {
  const inp = { pressed: new Set(), justPressed: b => inp.pressed.has(b), isDown: () => false,
    pressedDirection: () => ['up', 'down', 'left', 'right'].find(d => inp.pressed.has(d)) ?? null };
  return inp;
}
function fakeCtx() {
  return new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
}
const flush = async () => { for (let i = 0; i < 5; i++) await null; };

function setup() {
  const input = stubInput(), textbox = new TextBox(), done = [], pages = [];
  const scene = new IntroScene({ db: { dialogue }, textbox, input, onDone: n => done.push(n) });
  const tick = async (...b) => { input.pressed = new Set(b); scene.update(); input.pressed = new Set(); await flush(); };
  /** Let the current page type out, note it, then press A. */
  const page = async () => {
    for (let i = 0; i < 60 && !textbox.pageRevealed; i++) await tick();
    pages.push(textbox.pages[textbox.pageIndex].join('\n'));
    await tick('a');
  };
  scene.enter();
  return { scene, textbox, tick, page, done, pages };
}

/** Pages of a dialogue string as the textbox shows them. */
const pagesOf = text => text.split('\f');

test('A through intro-1..5 reaches the name entry; accepting TAREK finishes with onDone("TAREK")', async () => {
  const { scene, page, tick, done, pages } = setup();
  await flush();
  assert.doesNotThrow(() => scene.draw(fakeCtx()));
  while (!scene.nameEntry) await page();
  const expected = ['intro-1', 'intro-2', 'intro-3', 'intro-4', 'intro-5'].flatMap(id => pagesOf(dialogue[id]));
  assert.deepEqual(pages, expected);
  assert.equal(scene.nameEntry.name, 'TAREK');
  assert.doesNotThrow(() => scene.draw(fakeCtx()));

  await tick('start');
  assert.equal(scene.nameEntry, null);
  await page(); // intro-6
  assert.equal(pages.at(-1), 'RIGHT. TAREK.\nOBVIOUSLY.');
  assert.deepEqual(done, []);
  await page(); await page(); // intro-7, two pages
  assert.deepEqual(done, ['TAREK']);
});

test('a typed name is used in intro-6 and handed to onDone', async () => {
  const { scene, page, tick, done, pages } = setup();
  await flush();
  while (!scene.nameEntry) await page();
  for (let i = 0; i < 5; i++) await tick('b');          // clear TAREK
  scene.nameEntry.row = 2; scene.nameEntry.col = 4;     // O
  await tick('a');
  scene.nameEntry.row = 3; scene.nameEntry.col = 4;     // T
  await tick('a'); await tick('a');
  scene.nameEntry.row = 2; scene.nameEntry.col = 4;     // O
  await tick('a');
  assert.equal(scene.nameEntry.name, 'OTTO');
  scene.nameEntry.row = GRID.length - 1; scene.nameEntry.col = 1; // END
  await tick('a');
  await page();
  assert.equal(pages.at(-1), 'RIGHT. OTTO.\nOBVIOUSLY.');
  await page(); await page();
  assert.deepEqual(done, ['OTTO']);
});
