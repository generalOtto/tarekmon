import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catchChance, throwBall } from '../../src/battle/catching.js';

test('chance grows as hp drops, bounded [0.05, 1]', () => {
  const full = catchChance({ hp: 100, maxHp: 100 }, 190), low = catchChance({ hp: 1, maxHp: 100 }, 190);
  assert.ok(low > full); assert.ok(full >= 0.05 && low <= 1);
  assert.equal(catchChance({ hp: 100, maxHp: 100 }, 1), 0.05);
  assert.ok(Math.abs(catchChance({ hp: 100, maxHp: 100 }, 255) - 255 / 3 / 255) < 1e-9);
  assert.equal(catchChance({ hp: 1, maxHp: 1 }, 255), 1 / 3);
});
test('throwBall: success gives 3 wobbles; failure gives 0-2 wobbles scaled by chance', () => {
  assert.deepEqual(throwBall({ hp: 1, maxHp: 100 }, 255, () => 0.0), { success: true, wobbles: 3 });
  const f = throwBall({ hp: 100, maxHp: 100 }, 30, () => 0.99); assert.equal(f.success, false); assert.ok(f.wobbles >= 0 && f.wobbles <= 2);
  assert.equal(throwBall({ hp: 100, maxHp: 100 }, 1, () => 0.99).wobbles, 0, 'hopeless throw does not wobble');
});
