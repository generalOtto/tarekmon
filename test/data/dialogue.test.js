import { test } from 'node:test';
import assert from 'node:assert/strict';
import dialogue from '../../data/dialogue.json' with { type: 'json' };
import { paginate } from '../../src/ui/textbox.js';
import { GLYPHS } from '../../src/engine/font.js';
import mapData from '../../data/map.json' with { type: 'json' };

/** Templates fill `{nick}` (species names are ≤ 10 chars) and `{name}` (the player, ≤ 7): check the widest case. */
const fill = t => t.replaceAll('{nick}', 'WWWWWWWWWW').replaceAll('{name}', 'WWWWWWW').replaceAll('{n}', '74');
const nonEmpty = s => typeof s === 'string' && s.trim().length > 0;
/** Drawn by the credits scene, not the textbox: exempt from the 18x2 page rule (checked below instead). */
const SCENE_TEXT = new Set(['credits', 'birthday']);

test('every dialogue value is a non-empty string or a pair of non-empty strings', () => {
  for (const [id, v] of Object.entries(dialogue)) {
    if (id === 'credits') continue; // an array of lines, blanks allowed (checked below)
    assert.ok(nonEmpty(v) || (Array.isArray(v) && v.length === 2 && v.every(nonEmpty)), `bad dialogue ${id}`);
  }
});

test('every dialogue id referenced by map npcs and signs exists', () => {
  for (const [mid, m] of Object.entries(mapData.maps)) for (const e of [...(m.npcs ?? []), ...(m.signs ?? [])]) {
    for (const id of [e.dialogue].flat()) assert.ok(id in dialogue, `${mid}: unknown dialogue ${id}`);
  }
});

test('required dialogue ids exist', () => {
  const required = ['sign-lab', 'sign-haze', 'sign-ribs', 'sign-skate', 'sign-border', 'sign-booth',
    'weather-guy-nice', 'weather-guy-bad', 'haze-heal-1', 'haze-heal-2', 'ribs-shop',
    'booth-officer-locked', 'booth-officer-open', 'suhaib-pre', 'suhaib-mid', 'suhaib-lost', 'suhaib-rematch',
    'otto-lab-intro', 'otto-lab-after', 'otto-lab-block', 'regular-1', 'regular-2', 'regular-3', 'regular-4',
    'townie-1', 'townie-2', 'townie-3', 'fridge-open', 'fridge-last', 'fridge-full', 'fridge-deposit', 'fridge-withdraw', 'blackout', 'rack-nice', 'rack-bad', 'pedestal', 'gate-closed',
    'intro-1', 'intro-2', 'intro-3', 'intro-4', 'intro-5', 'intro-6', 'intro-7', 'starter-d013', 'starter-d061', 'starter-d049',
    'starter-confirm', 'starter-gone', 'title-overwrite', 'title-bad-code'];
  for (const id of required) assert.ok(id in dialogue, `missing ${id}`);
});

test('every form-feed page fits one 18x2 textbox page, and every character has a font glyph', () => {
  for (const [id, v] of Object.entries(dialogue)) for (const text of [v].flat().map(fill)) {
    if (!SCENE_TEXT.has(id)) for (const page of text.split('\f')) assert.equal(paginate(page, 18, 2).length, 1, `${id}: page overflows: ${JSON.stringify(page)}`);
    for (const ch of text.toUpperCase()) assert.ok(ch === '\n' || ch === '\f' || ch in GLYPHS, `${id}: no glyph for ${JSON.stringify(ch)}`);
  }
});

test('credits: an array of single lines that each fit the 160 px screen, with the caught-count template', () => {
  const c = dialogue.credits;
  assert.ok(Array.isArray(c) && c.length > 10);
  for (const line of c) assert.ok(typeof line === 'string' && !line.includes('\n') && fill(line).length * 6 <= 160, `bad credits line ${JSON.stringify(line)}`);
  assert.deepEqual([c[0], c.at(-1)], ['TAREKMON', 'THANKS FOR PLAYING']);
  assert.ok(c.includes('{n} / 74'));
});

test('the birthday message is spelled exactly as Tarek says it', () => {
  assert.equal(dialogue.birthday, "Happy Birt-d'ay Pine-Apple, Looking Werry Goor Werry Naaaice!");
});
