import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcDamage, hitCheck } from '../../src/battle/damage.js';
import types from '../../data/types.json' with { type: 'json' };

const atkSp = { type: 'Fried' }, defSp = { type: 'Steamed' };
const atk = { level: 10, stats: { atk: 30, def: 20, spd: 20 }, stages: { atk: 0, def: 0, acc: 0 } };
const def = { level: 10, stats: { atk: 20, def: 20, spd: 20 }, stages: { atk: 0, def: 0, acc: 0 } };
const fixed = v => () => v;

test('base formula, no crit, max random roll, STAB and 2x type', () => {
  // L=10: floor(2*10/5+2)=6 ; 6*50*30/20=450 ; floor(450/50)+2=11 ; x1.5 STAB x2 type x(255/255) = 33
  const r = calcDamage({ attacker: atk, attackerSpecies: atkSp, defender: def, defenderSpecies: defSp, move: { type: 'Fried', power: 50 }, types, rng: fixed(0.999) });
  assert.equal(r.damage, 33); assert.equal(r.crit, false); assert.equal(r.typeMult, 2);
});
test('min random roll is 217/255; damage floors to at least 1; status moves do 0', () => {
  const r = calcDamage({ attacker: atk, attackerSpecies: atkSp, defender: def, defenderSpecies: { type: 'Spicy' }, move: { type: null, power: 10 }, types, rng: fixed(0.0) });
  assert.ok(r.damage >= 1); assert.equal(r.typeMult, 1);
  assert.equal(calcDamage({ attacker: atk, attackerSpecies: atkSp, defender: def, defenderSpecies: defSp, move: { type: null, power: 0 }, types, rng: fixed(0.5) }).damage, 0);
});
test('crit doubles the level term; rng sequence [critRoll, randomRoll]', () => {
  let i = 0; const seq = [0.0, 0.999]; const rng = () => seq[i++];
  const r = calcDamage({ attacker: atk, attackerSpecies: atkSp, defender: def, defenderSpecies: defSp, move: { type: 'Fried', power: 50 }, types, rng });
  assert.equal(r.crit, true); assert.ok(r.damage > 33);
});
test('Imported defender resists everything (×0.75)', () => {
  const r = calcDamage({ attacker: atk, attackerSpecies: atkSp, defender: def, defenderSpecies: { type: 'Imported' }, move: { type: 'Fried', power: 50 }, types, rng: fixed(0.999) });
  assert.equal(r.typeMult, 0.75);
});
test('attack/defense stages change damage', () => {
  const up = { ...atk, stages: { atk: 2, def: 0, acc: 0 } };
  const a = calcDamage({ attacker: atk, attackerSpecies: atkSp, defender: def, defenderSpecies: defSp, move: { type: 'Fried', power: 50 }, types, rng: fixed(0.999) }).damage;
  const b = calcDamage({ attacker: up, attackerSpecies: atkSp, defender: def, defenderSpecies: defSp, move: { type: 'Fried', power: 50 }, types, rng: fixed(0.999) }).damage;
  assert.ok(b > a);
});
test('hitCheck: accuracy, the attacker\'s own accuracy stages, neverMiss', () => {
  assert.equal(hitCheck({ accuracy: 100, effect: { kind: 'none' } }, { stages: { acc: 0 } }, fixed(0.99)), true);
  assert.equal(hitCheck({ accuracy: 70, effect: { kind: 'none' } }, { stages: { acc: 0 } }, fixed(0.71)), false);
  assert.equal(hitCheck({ accuracy: 100, effect: { kind: 'none' } }, { stages: { acc: -2 } }, fixed(0.6)), false); // 0.5625
  assert.equal(hitCheck({ accuracy: 1, effect: { kind: 'neverMiss' } }, { stages: { acc: -3 } }, fixed(0.99)), true);
});
