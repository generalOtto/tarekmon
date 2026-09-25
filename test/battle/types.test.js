import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typeMultiplier, isValidType } from '../../src/battle/types.js';
import types from '../../data/types.json' with { type: 'json' };

test('cycle: 2x along the arrow, 0.5x against it, 1x otherwise', () => {
  assert.equal(typeMultiplier('Fried', 'Steamed', types), 2);
  assert.equal(typeMultiplier('Steamed', 'Fried', types), 0.5);
  assert.equal(typeMultiplier('Fried', 'Spicy', types), 1);
  assert.equal(typeMultiplier('Steamed', 'Frozen', types), 2);
  assert.equal(typeMultiplier('Frozen', 'Steamed', types), 0.5);
});

test('Imported takes half from everything, including Imported and typeless', () => {
  for (const t of types.types) assert.equal(typeMultiplier(t, 'Imported', types), 0.5, t);
  assert.equal(typeMultiplier(null, 'Imported', types), 0.5);
});

test('typeless moves are neutral against the cycle', () => {
  assert.equal(typeMultiplier(null, 'Fried', types), 1);
});

test('isValidType', () => {
  assert.equal(isValidType('Soggy', types), true);
  assert.equal(isValidType('Normal', types), false);
});
