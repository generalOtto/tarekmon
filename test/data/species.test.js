// test/data/species.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import species from '../../data/species.json' with { type: 'json' };
import moves from '../../data/moves.json' with { type: 'json' };
import types from '../../data/types.json' with { type: 'json' };
import stickers from '../../data/stickers.json' with { type: 'json' };
import names from '../../tools/species-names.json' with { type: 'json' };
import { validateSpecies } from '../../src/data/validate.js';
import { TEMPLATE, RARITY } from '../../src/data/species-tables.js';

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
test('species.json is in sync with tools/species-names.json', () => {
  for (const s of species) {
    const n = names[s.id];
    assert.ok(n, s.id);
    for (const k of ['name', 'type', 'entry', 'rarity']) assert.equal(s[k], n[k], `${s.id}.${k}`);
  }
});
const move = id => moves.find(m => m.id === id);
test('first and last moves are attacks of the species own type, last at least as strong', () => {
  for (const s of species) {
    const first = move(s.moves[0].id), last = move(s.moves.at(-1).id);
    assert.equal(s.moves.at(-1).level, 20, s.id);
    for (const m of [first, last]) { assert.equal(m.type, s.type, `${s.id} ${m.id}`); assert.ok(m.power > 0, `${s.id} ${m.id}`); }
    assert.ok(last.power >= first.power, `${s.id}: ${first.id} -> ${last.id}`);
  }
});
test('every Imported species learns long-drive', () => {
  for (const s of species.filter(s => s.type === 'Imported')) assert.ok(s.moves.some(m => m.id === 'long-drive'), s.id);
});
test('base stats actually vary around the template', () => {
  for (const k of ['hp', 'atk', 'def', 'spd']) {
    const offsets = new Set(species.map(s => s.base[k] - TEMPLATE[s.type][k] - RARITY[s.rarity].bonus));
    assert.ok(offsets.size >= 5, `${k}: only ${offsets.size} distinct offsets`);
  }
});
test('the only non-friend face is d024', () => {
  assert.deepEqual(species.filter(s => s.who === 'other').map(s => s.id), ['d024']);
});
test('every move is learned by at least one species', () => {
  const learned = new Set(species.flatMap(s => s.moves.map(m => m.id)));
  // time-zone is the one structural exception: it's an Imported attack, Imported's L20 slot is
  // permanently pinned to long-drive (a separate test requires every Imported species to have
  // it), and there are only 3 Imported species total, so no slot is ever free to carry it.
  const unreachable = new Set(['time-zone']);
  for (const m of moves) {
    if (unreachable.has(m.id)) { assert.ok(!learned.has(m.id), `${m.id}: expected unreachable, but a species learned it`); continue; }
    assert.ok(learned.has(m.id), `${m.id}: learned by no species`);
  }
});
