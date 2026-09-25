import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inLineOfSight, faceToward, flagSet, dialogueFor } from '../../src/world/npc.js';
import { loadMaps, isWalkable, warpAt, tileAt } from '../../src/world/map.js';
import mapData from '../../data/map.json' with { type: 'json' };

test('inLineOfSight: straight ahead within sight only', () => {
  const t = { x: 5, y: 5, facing: 'down', sight: 3 };
  assert.equal(inLineOfSight(t, 5, 6), true);
  assert.equal(inLineOfSight(t, 5, 8), true, 'exactly at sight range');
  assert.equal(inLineOfSight(t, 5, 9), false, 'beyond sight');
  assert.equal(inLineOfSight(t, 5, 4), false, 'behind');
  assert.equal(inLineOfSight(t, 6, 6), false, 'diagonal');
  assert.equal(inLineOfSight(t, 5, 5), false, 'same tile');
  assert.equal(inLineOfSight({ x: 5, y: 5, facing: 'left', sight: 2 }, 3, 5), true);
  assert.equal(inLineOfSight({ x: 5, y: 5, facing: 'right', sight: 2 }, 3, 5), false);
  assert.equal(inLineOfSight({ x: 5, y: 5, facing: 'up', sight: 4 }, 5, 1), true);
});

test('faceToward: points from the npc to the player in all four directions', () => {
  const n = { x: 5, y: 5 };
  assert.equal(faceToward(n, 5, 4), 'up');
  assert.equal(faceToward(n, 5, 6), 'down');
  assert.equal(faceToward(n, 4, 5), 'left');
  assert.equal(faceToward(n, 6, 5), 'right');
  assert.equal(faceToward(n, 5, 3), 'up', 'across a counter (2 tiles away)');
});

test('flagSet: badge:X checks badges, anything else checks flags; no flag → false', () => {
  const s = { badges: ['haze'], flags: { starterPicked: true, off: 0 } };
  assert.equal(flagSet(s, 'badge:haze'), true);
  assert.equal(flagSet(s, 'badge:ribs'), false);
  assert.equal(flagSet(s, 'starterPicked'), true);
  assert.equal(flagSet(s, 'off'), false);
  assert.equal(flagSet(s, undefined), false);
});

test('dialogueFor: picks [unset, set] by the npc flag, from an id pair or a text pair', () => {
  const dlg = { a: 'A', b: 'B', pair: ['NO', 'YES'] };
  const unset = { badges: [], flags: {} }, set = { badges: ['haze'], flags: {} };
  assert.equal(dialogueFor({ dialogue: 'a' }, set, dlg), 'A');
  assert.equal(dialogueFor({ dialogue: ['a', 'b'], flag: 'badge:haze' }, unset, dlg), 'A');
  assert.equal(dialogueFor({ dialogue: ['a', 'b'], flag: 'badge:haze' }, set, dlg), 'B');
  assert.equal(dialogueFor({ dialogue: 'pair', flag: 'badge:haze' }, unset, dlg), 'NO');
  assert.equal(dialogueFor({ dialogue: 'pair', flag: 'badge:haze' }, set, dlg), 'YES');
  assert.equal(dialogueFor({ dialogue: 'missing' }, set, dlg), '...', 'unknown ids degrade to an ellipsis');
});

test('map npcs: unique ids, known sprites, on walkable non-warp tiles, valid facing', () => {
  const maps = loadMaps(mapData);
  const sprites = new Set(['npc-cap', 'npc-shisha', 'npc-regular', 'npc-officer', 'npc-suhaib', 'npc-otto', 'npc-townie', 'npc-shop']);
  const ids = new Set();
  for (const m of Object.values(maps)) for (const n of m.npcs) {
    assert.ok(!ids.has(n.id), `duplicate npc id ${n.id}`); ids.add(n.id);
    assert.ok(sprites.has(n.sprite), `${n.id}: unknown sprite ${n.sprite}`);
    assert.ok(['up', 'down', 'left', 'right'].includes(n.facing), `${n.id}: facing`);
    assert.ok(isWalkable(m, n.x, n.y), `${n.id} stands on ${tileAt(m, n.x, n.y)}`);
    assert.equal(warpAt(m, n.x, n.y), null, `${n.id} stands on a warp`);
  }
  for (const id of ['weather-guy', 'prof-otto', 'haze-guy', 'shopkeeper', 'officer', 'townie-1']) assert.ok(ids.has(id), id);
  for (const m of Object.values(maps)) for (const s of m.signs) assert.equal(tileAt(m, s.x, s.y), 'S', `sign at ${m.id} ${s.x},${s.y}`);
  const sTiles = maps.town.rows.join('').split('S').length - 1;
  assert.equal(maps.town.signs.length, sTiles, 'one sign entry per S tile');
});

test('map trainers stand on walkable non-warp tiles with a valid facing and sight; the champion tile is walkable', () => {
  const maps = loadMaps(mapData);
  for (const m of Object.values(maps)) for (const t of m.trainers) {
    assert.ok(['up', 'down', 'left', 'right'].includes(t.facing), `${t.id}: facing`);
    assert.ok(Number.isInteger(t.sight) && t.sight >= 0 && t.sight <= 3, `${t.id}: sight`);
    assert.ok(isWalkable(m, t.x, t.y), `${t.id} stands on ${tileAt(m, t.x, t.y)}`);
    assert.equal(warpAt(m, t.x, t.y), null, `${t.id} stands on a warp`);
    for (let i = 1; i <= t.sight; i++) { // the sight line is a walkable lane the player can step into
      const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[t.facing];
      assert.ok(isWalkable(m, t.x + dx * i, t.y + dy * i), `${t.id}: sight tile ${i} not walkable`);
    }
  }
  const c = maps.town.champion;
  assert.ok(c && isWalkable(maps.town, c.x, c.y), 'champion tile walkable');
  assert.ok(c.y >= 1 && c.y <= 3, 'champion stands in the border strip');
});
