import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, xpForLevel, levelForXp, xpGain, stageMult, accMult, MAX_LEVEL } from '../../src/battle/stats.js';

test('Gen 1 style stats without IVs/EVs', () => {
  const s = computeStats({ base: { hp: 45, atk: 49, def: 49, spd: 45 } }, 5);
  assert.deepEqual(s, { hp: 19, atk: 9, def: 9, spd: 9 }); // floor(90*5/100)+5+10=19 ; floor(98*5/100)+5=9
  assert.deepEqual(computeStats({ base: { hp: 100, atk: 100, def: 100, spd: 100 } }, 50), { hp: 160, atk: 105, def: 105, spd: 105 });
});
test('medium-fast curve: xp = level^3, levelForXp inverts and caps at 50', () => {
  assert.equal(xpForLevel(1), 1); assert.equal(xpForLevel(10), 1000);
  assert.equal(levelForXp(999), 9); assert.equal(levelForXp(1000), 10); assert.equal(levelForXp(1e9), MAX_LEVEL); assert.equal(levelForXp(0), 1);
});
test('xp gain: yield*level/7, x3 for trainers, floored', () => {
  assert.equal(xpGain({ xpYield: 64 }, 7, false), 64); assert.equal(xpGain({ xpYield: 64 }, 7, true), 192);
  assert.equal(xpGain({ xpYield: 60 }, 3, false), 25);
});
test('stage multipliers', () => {
  assert.equal(stageMult(0), 1); assert.equal(stageMult(1), 1.5); assert.equal(stageMult(3), 2.5); assert.equal(stageMult(-1), 2 / 3); assert.equal(stageMult(-3), 0.4);
  assert.equal(accMult(0), 1); assert.equal(accMult(-1), 0.75); assert.equal(accMult(-3), 0.75 ** 3); assert.equal(stageMult(7), 2.5, 'clamped');
});
