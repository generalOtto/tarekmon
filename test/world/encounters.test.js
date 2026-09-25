import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollEncounter } from '../../src/world/encounters.js';

const zone = { id: 'z', rate: 0.5, table: [{ species: 'a', min: 2, max: 4, weight: 9 }, { species: 'b', min: 10, max: 10, weight: 1 }] };

test('returns null when the rate roll fails; otherwise a weighted species at a level in range', () => {
  assert.equal(rollEncounter(zone, () => 0.9), null);
  let i = 0; const seq = [0.1, 0.05, 0.5]; const r = rollEncounter(zone, () => seq[i++]);
  assert.equal(r.species, 'a'); assert.ok(r.level >= 2 && r.level <= 4);
  i = 0; const seq2 = [0.1, 0.95, 0.0]; assert.deepEqual(rollEncounter(zone, () => seq2[i++]), { species: 'b', level: 10 });
});

test('rate multiplier (skating halves the rate)', () => {
  assert.equal(rollEncounter(zone, () => 0.3, 0.5), null, '0.3 >= 0.25');
  assert.notEqual(rollEncounter(zone, () => 0.2, 0.5), null);
});
