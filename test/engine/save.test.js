import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGameState, healParty, markSeen, markCaught } from '../../src/engine/state.js';
import { createSave, toSaveCode, fromSaveCode } from '../../src/engine/save.js';

const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

test('save/load round-trips the whole state; load returns null when empty', () => {
  const store = memStorage(), save = createSave(store);
  assert.equal(save.load(), null);
  const s = newGameState('TAREK'); s.money = 1234; s.flags.badgeHaze = true; s.pos = { map: 'town', x: 3, y: 4, facing: 'left' };
  save.save(s); assert.deepEqual(save.load(), s);
  save.clear(); assert.equal(save.load(), null);
});
test('save code round-trips and rejects garbage', () => {
  const s = newGameState('TAREK'); const code = toSaveCode(s);
  assert.deepEqual(fromSaveCode(code), s); assert.equal(fromSaveCode('nope'), null); assert.equal(fromSaveCode(''), null);
});
test('load rejects a different version and corrupt JSON', () => {
  const store = memStorage(); store.setItem('tarekmon.save', JSON.stringify({ version: 0, state: {} }));
  assert.equal(createSave(store).load(), null);
  store.setItem('tarekmon.save', '{not json'); assert.equal(createSave(store).load(), null);
});
test('save survives a throwing storage (private mode) without crashing', () => {
  const bad = { getItem: () => { throw new Error('nope'); }, setItem: () => { throw new Error('nope'); }, removeItem: () => { throw new Error('nope'); } };
  const save = createSave(bad); assert.doesNotThrow(() => save.save(newGameState())); assert.equal(save.load(), null); assert.doesNotThrow(() => save.clear());
});
test('newGameState defaults; healParty restores hp and pp; markSeen/markCaught dedupe', () => {
  const s = newGameState();
  assert.equal(s.playerName, 'TAREK'); assert.equal(s.money, 500); assert.deepEqual(s.pos, { map: 'lab', x: 5, y: 7, facing: 'up' });
  assert.deepEqual(s.bag, { 'dumpling-ball': 5, 'wet-wipe': 2, 'extra-sauce': 0, 'napkin': 0 });
  s.party.push({ hp: 1, maxHp: 30, moves: [{ id: 'x', pp: 0, maxPp: 20 }] }); healParty(s);
  assert.equal(s.party[0].hp, 30); assert.equal(s.party[0].moves[0].pp, 20);
  markSeen(s, 'd001'); markSeen(s, 'd001'); markCaught(s, 'd002'); markCaught(s, 'd002');
  assert.deepEqual(s.dex, { seen: ['d001', 'd002'], caught: ['d002'] });
});
