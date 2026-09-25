// test/data/moves.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import moves from '../../data/moves.json' with { type: 'json' };
import types from '../../data/types.json' with { type: 'json' };
import { validateMoves } from '../../src/data/validate.js';

test('moves validate: unique ids, valid types, imported accuracy cap, 35-45 moves', () => {
  assert.deepEqual(validateMoves(moves, types), []);
  assert.ok(moves.length >= 35 && moves.length <= 45, `have ${moves.length}`);
});

test('every type has at least 4 attacking moves', () => {
  for (const t of types.types) {
    const n = moves.filter(m => m.type === t && m.power > 0).length;
    assert.ok(n >= 4, `${t} has ${n}`);
  }
});
