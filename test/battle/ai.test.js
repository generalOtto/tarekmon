import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseFoeMove, STRUGGLE } from '../../src/battle/ai.js';
import types from '../../data/types.json' with { type: 'json' };

const movesDb = {
  weak: { id: 'weak', type: 'Fried', power: 40, accuracy: 100, effect: { kind: 'none' } },
  strong: { id: 'strong', type: 'Fried', power: 75, accuracy: 85, effect: { kind: 'none' } },
  status: { id: 'status', type: 'Fried', power: 0, accuracy: 100, effect: { kind: 'accDown', stages: 1 } },
  soggy: { id: 'soggy', type: 'Soggy', power: 45, accuracy: 100, effect: { kind: 'none' } },
};
const foeSp = { type: 'Fried' }; const mk = ids => ({ moves: ids.map(id => ({ id, pp: 10, maxPp: 10 })) });
const noRandom = () => 0.9; // first draw ≥ 0.25 → deterministic best pick

test('picks the highest expected damage (power × type × accuracy) against the player type', () => {
  // vs Steamed (Fried is 2x): weak = 40*2*1 = 80, strong = 75*2*0.85 = 127.5, soggy = 45*1*1 = 45 → strong
  assert.equal(chooseFoeMove(mk(['weak', 'strong', 'soggy']), foeSp, { type: 'Steamed' }, movesDb, types, noRandom), 1);
  // vs Soggy (Fried is 0.5x, Soggy vs Soggy 1x): weak = 20, strong = 31.9, soggy = 45 → soggy
  assert.equal(chooseFoeMove(mk(['weak', 'strong', 'soggy']), foeSp, { type: 'Soggy' }, movesDb, types, noRandom), 2);
});
test('status moves score 5, so they are picked only when nothing better has PP; ties go to the lowest index', () => {
  const foe = mk(['status', 'weak']); foe.moves[1].pp = 0;
  assert.equal(chooseFoeMove(foe, foeSp, { type: 'Steamed' }, movesDb, types, noRandom), 0);
  const tie = mk(['weak', 'weak']); assert.equal(chooseFoeMove(tie, foeSp, { type: 'Steamed' }, movesDb, types, noRandom), 0);
});
test('with all PP gone returns struggle; STRUGGLE is a 20-power typeless move', () => {
  const foe = mk(['weak']); foe.moves[0].pp = 0;
  assert.equal(chooseFoeMove(foe, foeSp, { type: 'Steamed' }, movesDb, types, noRandom), 'struggle');
  assert.equal(STRUGGLE.power, 20); assert.equal(STRUGGLE.type, null);
});
test('25% of the time picks uniformly among usable moves (rng sequence: [randomRoll, pickRoll])', () => {
  let i = 0; const seq = [0.1, 0.99]; const rng = () => seq[i++];
  assert.equal(chooseFoeMove(mk(['strong', 'weak', 'soggy']), foeSp, { type: 'Steamed' }, movesDb, types, rng), 2, 'pickRoll 0.99 → last usable');
  i = 0; seq[1] = 0.0; assert.equal(chooseFoeMove(mk(['strong', 'weak', 'soggy']), foeSp, { type: 'Steamed' }, movesDb, types, rng), 0);
  const foe = mk(['strong', 'weak']); foe.moves[0].pp = 0; i = 0; seq[1] = 0.5;
  assert.equal(chooseFoeMove(foe, foeSp, { type: 'Steamed' }, movesDb, types, rng), 1, 'random pick only among usable moves');
});
