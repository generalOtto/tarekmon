import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMonster, movesLearnedAt, resetBattleState, addXp } from '../../src/battle/monster.js';
import { mulberry32 } from '../../src/engine/rng.js';

const species = { id: 'dX', name: 'TESTY', type: 'Fried', base: { hp: 50, atk: 60, def: 50, spd: 60 }, xpYield: 60,
  moves: [{ level: 1, id: 'm1' }, { level: 1, id: 'm2' }, { level: 8, id: 'm3' }, { level: 15, id: 'm4' }] };
const moves = { m1: { id: 'm1', pp: 20 }, m2: { id: 'm2', pp: 30 }, m3: { id: 'm3', pp: 10 }, m4: { id: 'm4', pp: 15 } };
const xpFor = l => l ** 3;

test('makeMonster at level 5 knows only level-1 moves, full hp, xp = 125', () => {
  const m = makeMonster(species, 5, moves, mulberry32(1));
  assert.deepEqual(m.moves.map(x => x.id), ['m1', 'm2']); assert.equal(m.moves[0].pp, 20); assert.equal(m.moves[0].maxPp, 20); assert.equal(m.hp, m.maxHp); assert.equal(m.xp, 125);
  assert.equal(m.speciesId, 'dX'); assert.equal(m.nickname, 'TESTY'); assert.ok(typeof m.uid === 'string' && m.uid.length > 0);
  assert.deepEqual(m.stages, { atk: 0, def: 0, acc: 0 }); assert.equal(m.skipNext, false);
});
test('two monsters get different uids', () => { const rng = mulberry32(2); assert.notEqual(makeMonster(species, 5, moves, rng).uid, makeMonster(species, 5, moves, rng).uid); });
test('movesLearnedAt lists moves gained exactly at that level', () => { assert.deepEqual(movesLearnedAt(species, 8), ['m3']); assert.deepEqual(movesLearnedAt(species, 9), []); });
test('addXp levels up (possibly several times), recomputes stats keeping hp ratio, learns moves, returns events', () => {
  const m = makeMonster(species, 5, moves, mulberry32(1)); m.hp = Math.floor(m.maxHp / 2);
  const ev = addXp(m, species, moves, xpFor(8) - m.xp);
  assert.equal(m.level, 8); assert.ok(ev.some(e => e.type === 'levelup' && e.level === 8)); assert.ok(ev.some(e => e.type === 'learn' && e.move === 'm3'));
  assert.equal(m.moves.length, 3); assert.ok(m.hp > 0 && m.hp <= m.maxHp); assert.equal(ev.filter(e => e.type === 'levelup').length, 3);
});
test('learning a 5th move replaces the oldest', () => {
  const m = makeMonster(species, 14, moves, mulberry32(1)); // knows m1, m2, m3
  m.moves.push({ id: 'extra', pp: 5, maxPp: 5 });            // 4 moves: m1, m2, m3, extra
  const ev = addXp(m, species, moves, xpFor(15) - m.xp);      // learns m4 → forgets m1
  assert.deepEqual(m.moves.map(x => x.id), ['m2', 'm3', 'extra', 'm4']);
  assert.ok(ev.some(e => e.type === 'learn' && e.move === 'm4' && e.forgot === 'm1'));
});
test('xp is capped at level 50 and no level-ups happen past it', () => {
  const m = makeMonster(species, 50, moves, mulberry32(1)); const ev = addXp(m, species, moves, 1e9); assert.equal(m.level, 50); assert.equal(ev.length, 0);
});
test('resetBattleState clears stages and skip', () => { const m = makeMonster(species, 5, moves); m.stages.atk = 2; m.skipNext = true; resetBattleState(m); assert.deepEqual(m.stages, { atk: 0, def: 0, acc: 0 }); assert.equal(m.skipNext, false); });
