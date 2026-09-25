import { test } from 'node:test';
import assert from 'node:assert/strict';
import trainers from '../../data/trainers.json' with { type: 'json' };
import species from '../../data/species.json' with { type: 'json' };
import dialogue from '../../data/dialogue.json' with { type: 'json' };
import mapData from '../../data/map.json' with { type: 'json' };

const speciesById = Object.fromEntries(species.map(s => [s.id, s]));
const KINDS = ['route', 'regular', 'leader', 'champion'];

test('trainers: unique ids, names ≤ 10, valid kinds, known species and dialogue ids, sane levels', () => {
  const ids = new Set();
  for (const t of trainers) {
    assert.ok(!ids.has(t.id), `duplicate trainer ${t.id}`); ids.add(t.id);
    assert.ok(typeof t.name === 'string' && t.name.length > 0 && t.name.length <= 10, `${t.id}: name ${t.name}`);
    assert.ok(KINDS.includes(t.kind), `${t.id}: kind ${t.kind}`);
    assert.ok(typeof t.sprite === 'string' && t.sprite.startsWith('npc-'), `${t.id}: sprite`);
    assert.ok(t.team.length >= 1 && t.team.length <= 6, `${t.id}: team size`);
    for (const m of t.team) {
      assert.ok(speciesById[m.species], `${t.id}: unknown species ${m.species}`);
      assert.ok(Number.isInteger(m.level) && m.level >= 1 && m.level <= 100, `${t.id}: level ${m.level}`);
    }
    for (const key of ['pre', 'post', 'speech']) if (key in t) assert.ok(t[key] in dialogue, `${t.id}: unknown ${key} dialogue ${t[key]}`);
    assert.ok(t.pre && t.post, `${t.id}: needs pre and post`);
  }
});

test('exactly one leader and one champion; the champion is all Imported with a mid-battle speech that can play', () => {
  assert.equal(trainers.filter(t => t.kind === 'leader').length, 1);
  const champs = trainers.filter(t => t.kind === 'champion');
  assert.equal(champs.length, 1);
  const [c] = champs;
  assert.equal(c.id, 'suhaib');
  assert.ok(c.team.every(m => speciesById[m.species].type === 'Imported'), 'champion team is all Imported');
  assert.ok(c.speech in dialogue);
  assert.ok(Number.isInteger(c.speechAfterFaints) && c.speechAfterFaints < c.team.length, 'speech must fire while he has monsters left');
});

test('every trainer placed in map.json exists, and every trainer (bar the champion) is placed exactly once', () => {
  const byId = Object.fromEntries(trainers.map(t => [t.id, t]));
  const placed = [];
  for (const [mid, m] of Object.entries(mapData.maps)) {
    for (const p of m.trainers ?? []) { assert.ok(byId[p.id], `${mid}: unknown trainer ${p.id}`); placed.push(p.id); }
    for (const n of m.npcs ?? []) if (n.trainer) { assert.ok(byId[n.trainer], `${mid}: npc ${n.id} names unknown trainer ${n.trainer}`); placed.push(n.trainer); }
  }
  for (const t of trainers) {
    const count = placed.filter(id => id === t.id).length;
    assert.equal(count, t.kind === 'champion' ? 0 : 1, `${t.id} placed ${count}×`);
  }
});

test('the four haze regulars are trainers now, not plain npcs', () => {
  const haze = mapData.maps.haze;
  const regulars = trainers.filter(t => t.kind === 'regular').map(t => t.id).sort();
  assert.deepEqual(regulars, ['regular-1', 'regular-2', 'regular-3', 'regular-4']);
  for (const id of regulars) {
    assert.ok(!haze.npcs.some(n => n.id === id), `${id} still in npcs`);
    assert.ok(haze.trainers.some(t => t.id === id && t.sight === 0), `${id} is a talk-only trainer`);
  }
});
