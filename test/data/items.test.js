import { test } from 'node:test';
import assert from 'node:assert/strict';
import items from '../../data/items.json' with { type: 'json' };
import { validateItems } from '../../src/data/validate.js';
import { newGameState } from '../../src/engine/state.js';

test('items validate with no errors', () => {
  assert.deepEqual(validateItems(items), []);
});

test('ids and prices match the spec', () => {
  assert.deepEqual(items.map(i => [i.id, i.price]), [
    ['dumpling-ball', 100],
    ['wet-wipe', 150],
    ['extra-sauce', 300],
    ['napkin', 250],
  ]);
});

test('every bag item exists in items.json and vice versa', () => {
  const state = newGameState();
  const itemIds = new Set(items.map(i => i.id));
  const bagIds = new Set(Object.keys(state.bag));
  for (const id of bagIds) assert.ok(itemIds.has(id), `bag has unknown item ${id}`);
  for (const id of itemIds) assert.ok(bagIds.has(id), `items.json has ${id} missing from starting bag`);
});

test('duplicate ids and over-long names produce validation errors', () => {
  const dup = [
    { id: 'a', name: 'A', price: 10, battle: null, field: null, text: 't' },
    { id: 'a', name: 'B', price: 10, battle: null, field: null, text: 't' },
  ];
  assert.ok(validateItems(dup).length > 0);

  const longName = [
    { id: 'a', name: 'THIRTEEN CHARS', price: 10, battle: null, field: null, text: 't' },
  ];
  assert.ok(validateItems(longName).length > 0);
});
