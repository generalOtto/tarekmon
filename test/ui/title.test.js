import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TitleScene } from '../../src/ui/title.js';
import { TextBox } from '../../src/ui/textbox.js';
import { newGameState } from '../../src/engine/state.js';
import { toSaveCode } from '../../src/engine/save.js';
import dialogue from '../../data/dialogue.json' with { type: 'json' };
import speciesList from '../../data/species.json' with { type: 'json' };

function stubInput() {
  const inp = { pressed: new Set(), justPressed: b => inp.pressed.has(b), isDown: () => false,
    pressedDirection: () => ['up', 'down', 'left', 'right'].find(d => inp.pressed.has(d)) ?? null };
  return inp;
}
function fakeCtx() {
  return new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
}
const flush = async () => { for (let i = 0; i < 10; i++) await null; };

function setup({ saved = null, readCode = async () => '' } = {}) {
  const input = stubInput(), textbox = new TextBox(), calls = [], saves = [], music = [];
  const save = { load: () => saved, save: s => saves.push(s) };
  const audio = { startMusic: n => music.push(n), playSfx() {}, playJingle() {} };
  const scene = new TitleScene({ db: { dialogue, species: speciesList, images: {} }, save, textbox, input, audio, readCode,
    onNewGame: () => calls.push(['new']), onContinue: s => calls.push(['continue', s]), onLoadCode: s => calls.push(['load', s]) });
  scene.enter();
  const tick = async (...b) => { input.pressed = new Set(b); scene.update(); input.pressed = new Set(); await flush(); };
  /** Let the textbox type out, then (optionally) press a button. */
  const settle = async () => { for (let i = 0; i < 60 && textbox.open && !textbox.pageRevealed; i++) await tick(); };
  const pick = async label => { while (scene.menu.selected() !== label) await tick('down'); await tick('a'); };
  return { scene, textbox, tick, settle, pick, calls, saves, music };
}

test('title music on enter; the menu shows CONTINUE only when a save exists', () => {
  let t = setup();
  assert.deepEqual(t.scene.menu.items, ['NEW GAME', 'LOAD CODE']);
  assert.deepEqual(t.music, ['title']);
  assert.doesNotThrow(() => t.scene.draw(fakeCtx()));
  t = setup({ saved: newGameState('OTTO') });
  assert.deepEqual(t.scene.menu.items, ['NEW GAME', 'CONTINUE', 'LOAD CODE']);
  assert.doesNotThrow(() => t.scene.draw(fakeCtx()));
});

test('NEW GAME without a save starts right away', async () => {
  const t = setup();
  await t.pick('NEW GAME');
  assert.deepEqual(t.calls, [['new']]);
});

test('NEW GAME over a save asks to overwrite: NO keeps the title, YES calls onNewGame', async () => {
  const t = setup({ saved: newGameState('OTTO') });
  await t.pick('NEW GAME');
  assert.deepEqual(t.textbox.pages, [dialogue['title-overwrite'].split('\n')]);
  await t.settle();
  assert.ok(t.scene.prompt.showing, 'YES/NO pops up once the question is out');
  assert.doesNotThrow(() => t.scene.draw(fakeCtx()));
  await t.tick('down'); await t.tick('a'); // NO
  assert.deepEqual(t.calls, []);
  assert.equal(t.textbox.open, false);
  await t.pick('NEW GAME'); await t.settle(); await t.tick('a'); // YES
  assert.deepEqual(t.calls, [['new']]);
});

test('CONTINUE calls onContinue with the saved state', async () => {
  const saved = newGameState('OTTO');
  const t = setup({ saved });
  await t.pick('CONTINUE');
  assert.deepEqual(t.calls, [['continue', saved]]);
});

test('LOAD CODE with a valid code → confirm → save.save + onLoadCode', async () => {
  const state = newGameState('OTTO'); state.badges.push('haze'); state.party.push({ nickname: 'X' }, { nickname: 'Y' });
  const t = setup({ readCode: async () => toSaveCode(state) });
  await t.pick('LOAD CODE');
  assert.deepEqual(t.textbox.pages, [['LOAD THIS SAVE?'], ['OTTO · 2 DMPL', '· 1 BADGE']]);
  await t.settle(); await t.tick('a'); // page 1 → 2
  await t.settle();
  assert.ok(t.scene.prompt.showing);
  await t.tick('a'); // YES
  assert.deepEqual(t.saves, [state]);
  assert.deepEqual(t.calls, [['load', state]]);
});

test('LOAD CODE: NO loads nothing; an invalid code says JUST WORDS and calls nothing', async () => {
  const good = setup({ readCode: async () => toSaveCode(newGameState()) });
  await good.pick('LOAD CODE'); await good.settle(); await good.tick('a'); await good.settle();
  await good.tick('b');
  assert.deepEqual(good.saves, []); assert.deepEqual(good.calls, []);

  for (const readCode of [async () => 'hello there', async () => null, async () => { throw new Error('denied'); }]) {
    const t = setup({ readCode });
    await t.pick('LOAD CODE');
    assert.equal(t.textbox.pages.map(p => p.join('\n')).join('\f'), dialogue['title-bad-code']);
    await t.settle(); await t.tick('a'); await t.settle(); await t.tick('a');
    assert.equal(t.textbox.open, false);
    assert.deepEqual(t.saves, []); assert.deepEqual(t.calls, []);
  }
});

test('the cursor starts on CONTINUE when a save exists, on NEW GAME otherwise', () => {
  assert.equal(setup().scene.menu.selected(), 'NEW GAME');
  assert.equal(setup({ saved: newGameState('OTTO') }).scene.menu.selected(), 'CONTINUE');
});
