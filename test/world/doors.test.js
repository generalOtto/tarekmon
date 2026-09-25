import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveWarp, Fader } from '../../src/world/doors.js';
import { loadMaps } from '../../src/world/map.js';
import mapData from '../../data/map.json' with { type: 'json' };
const maps = loadMaps(mapData);

test('stepping on a D or M tile resolves to the target map/tile/facing; other tiles resolve to null', () => {
  const t = maps.town, w = t.warps[0];
  assert.deepEqual(resolveWarp(t, w.x, w.y), { map: w.to, x: w.tx, y: w.ty, facing: w.facing });
  assert.equal(resolveWarp(t, 0, 0), null);
  const lab = maps.lab, m = lab.warps[0]; assert.equal(resolveWarp(lab, m.x, m.y).map, 'town');
});
test('Fader: out then in, reports phases and completion, alpha ramps 0→1→0', () => {
  const f = new Fader(12); assert.equal(f.active, false);
  let fired = 0; f.start(() => fired++);
  assert.equal(f.active, true); assert.equal(f.alpha, 0);
  for (let i = 0; i < 12; i++) f.update(); assert.equal(fired, 1, 'midpoint callback fires exactly once when fully dark'); assert.equal(f.alpha, 1);
  for (let i = 0; i < 12; i++) f.update(); assert.equal(f.active, false); assert.equal(f.alpha, 0);
});
