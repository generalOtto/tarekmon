import { test } from 'node:test';
import assert from 'node:assert/strict';
import dialogue from '../../data/dialogue.json' with { type: 'json' };
import { paginate } from '../../src/ui/textbox.js';
import { GLYPHS } from '../../src/engine/font.js';
import mapData from '../../data/map.json' with { type: 'json' };

const nonEmpty = s => typeof s === 'string' && s.trim().length > 0;

test('every dialogue value is a non-empty string or a pair of non-empty strings', () => {
  for (const [id, v] of Object.entries(dialogue)) {
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
    'townie-1', 'townie-2', 'townie-3', 'fridge-open', 'rack-nice', 'rack-bad', 'pedestal', 'gate-closed'];
  for (const id of required) assert.ok(id in dialogue, `missing ${id}`);
});

test('every form-feed page fits one 18x2 textbox page, and every character has a font glyph', () => {
  for (const [id, v] of Object.entries(dialogue)) for (const text of [v].flat()) {
    for (const page of text.split('\f')) assert.equal(paginate(page, 18, 2).length, 1, `${id}: page overflows: ${JSON.stringify(page)}`);
    for (const ch of text.toUpperCase()) assert.ok(ch === '\n' || ch === '\f' || ch in GLYPHS, `${id}: no glyph for ${JSON.stringify(ch)}`);
  }
});
