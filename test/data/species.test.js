// test/data/species.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import species from '../../data/species.json' with { type: 'json' };
import moves from '../../data/moves.json' with { type: 'json' };
import types from '../../data/types.json' with { type: 'json' };
import stickers from '../../data/stickers.json' with { type: 'json' };
import { validateSpecies } from '../../src/data/validate.js';

test('74 species validate', () => {
  assert.equal(species.length, 74);
  assert.deepEqual(validateSpecies(species, moves, types, stickers), []);
});
test('every Suhaib face is Imported and rare-or-better; nobody else is Imported', () => {
  for (const s of species) {
    if (s.who === 'suhaib') { assert.equal(s.type, 'Imported', s.id); assert.ok(['rare', 'starter', 'legend'].includes(s.rarity), s.id); }
    else assert.notEqual(s.type, 'Imported', s.id);
  }
});
test('exactly three starters, one per person; exactly two legends (Orange Boy and Suhaibabe)', () => {
  const st = species.filter(s => s.rarity === 'starter');
  assert.deepEqual(st.map(s => s.who).sort(), ['otto', 'suhaib', 'tarek']);
  assert.deepEqual(species.filter(s => s.rarity === 'legend').map(s => s.id).sort(), ['d024', 'd030']);
  assert.equal(species.find(s => s.id === 'd024').name.toUpperCase(), 'ORANGE BOY');
  assert.equal(species.find(s => s.id === 'd030').name.toUpperCase(), 'SUHAIBABE');
});
test('names are unique; each species has 4 distinct moves', () => {
  assert.equal(new Set(species.map(s => s.name)).size, 74);
  for (const s of species) assert.equal(new Set(s.moves.map(m => m.id)).size, s.moves.length, s.id);
});
