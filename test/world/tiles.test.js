import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEGEND, WALKABLE, ENCOUNTER, INTERACT, TILE_SIZE } from '../../src/world/tiles.js';

const subset = (a, b) => [...a].every(x => b.has(x));

test('WALKABLE and INTERACT are subsets of LEGEND', () => {
  assert.ok(subset(WALKABLE, LEGEND));
  assert.ok(subset(INTERACT, LEGEND));
});
test('ENCOUNTER is a subset of WALKABLE', () => {
  assert.ok(subset(ENCOUNTER, WALKABLE));
});
test('closed gate blocks, open gate walks', () => {
  assert.ok(!WALKABLE.has('G'));
  assert.ok(WALKABLE.has('g'));
});
test('water, trees and walls are not walkable', () => {
  for (const c of ['~', 'T', 'W']) assert.ok(!WALKABLE.has(c), c);
});
test('pedestal is in the legend, interactable, not walkable', () => {
  assert.ok(LEGEND.has('E'));
  assert.ok(INTERACT.has('E'));
  assert.ok(!WALKABLE.has('E'));
});
test('TILE_SIZE is 16', () => {
  assert.equal(TILE_SIZE, 16);
});
