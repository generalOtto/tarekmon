import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player, WALK_SPEED, SKATE_SPEED } from '../../src/world/player.js';
import { loadMaps } from '../../src/world/map.js';
import mapData from '../../data/map.json' with { type: 'json' };
const maps = loadMaps(mapData);
// 8×8 so the lab-coordinate player in test 1 (5,6) is still in bounds for its final step.
const open = loadMaps({ maps: { o: { rows: Array(8).fill('........') } } }).o;

test('player moves one tile per step at walk speed (16 px in 16 ticks), blocked by non-walkable tiles, turns without moving when blocked', () => {
  const m = maps.lab, s = mapData.start; const p = new Player(s.x, s.y, s.facing);
  assert.equal(p.tryMove('up', m, { blocked: () => false }), true);
  for (let i = 0; i < 16; i++) p.update(1 / 60);
  assert.deepEqual([p.x, p.y], [s.x, s.y - 1]); assert.equal(p.moving, false);
  const before = [p.x, p.y]; assert.equal(p.tryMove('left', m, { blocked: () => true }), false); assert.equal(p.facing, 'left'); assert.deepEqual([p.x, p.y], before);
  assert.equal(p.tryMove('up', open, { blocked: () => false }), true); assert.equal(p.tryMove('down', open, {}), false, 'cannot start a new step while moving');
});
test('skateboard doubles speed (synthetic open map)', () => {
  const p = new Player(1, 1, 'down'); p.skating = true; p.tryMove('down', open, { blocked: () => false });
  for (let i = 0; i < 8; i++) p.update(1 / 60);
  assert.equal(p.moving, false); assert.deepEqual([p.x, p.y], [1, 2]); assert.equal(SKATE_SPEED, WALK_SPEED * 2);
});
test('onArrive fires once per completed step with the new tile; walk frame cycles 0..3', () => {
  const p = new Player(1, 1, 'down'); const arrived = []; p.onArrive = (x, y) => arrived.push([x, y]);
  p.tryMove('right', open, { blocked: () => false }); const frames = new Set();
  for (let i = 0; i < 16; i++) { p.update(1 / 60); frames.add(p.frame); }
  assert.deepEqual(arrived, [[2, 1]]); assert.ok(frames.size >= 2 && [...frames].every(f => f >= 0 && f <= 3));
});
test('pixel position interpolates during a step', () => {
  const p = new Player(1, 1, 'down'); p.tryMove('right', open, { blocked: () => false });
  for (let i = 0; i < 8; i++) p.update(1 / 60);
  const { px, py } = p.pixelPos(); assert.equal(py, 16); assert.ok(px > 16 && px < 32);
});
test('tryMove while a step is in flight is rejected and keeps facing; the step still lands on its own target', () => {
  const p = new Player(2, 2, 'down');
  assert.equal(p.tryMove('up', open, { blocked: () => false }), true);
  p.update(1 / 60);
  assert.equal(p.tryMove('down', open, { blocked: () => false }), false); assert.equal(p.facing, 'up');
  for (let i = 0; i < 15; i++) p.update(1 / 60);
  assert.equal(p.moving, false); assert.deepEqual([p.x, p.y], [2, 1]);
});
