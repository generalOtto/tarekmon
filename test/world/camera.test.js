import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameraFor } from '../../src/world/camera.js';
const big = { width: 32, height: 40 }, small = { width: 8, height: 6 };
test('centers on the player and clamps to the map', () => {
  assert.deepEqual(cameraFor({ px: 16 * 16, py: 16 * 20 }, big), { ox: 16 * 16 - 72, oy: 16 * 20 - 64 });
  assert.deepEqual(cameraFor({ px: 0, py: 0 }, big), { ox: 0, oy: 0 });
  assert.deepEqual(cameraFor({ px: 16 * 31, py: 16 * 39 }, big), { ox: 32 * 16 - 160, oy: 40 * 16 - 144 });
});
test('maps smaller than the screen are centered (negative offsets)', () => {
  const c = cameraFor({ px: 0, py: 0 }, small); assert.equal(c.ox, -(160 - 8 * 16) / 2); assert.equal(c.oy, -(144 - 6 * 16) / 2);
});
