import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMaps, isWalkable, tileAt, warpAt, zoneAt, inBounds, step } from '../../src/world/map.js';
import mapData from '../../data/map.json' with { type: 'json' };
import species from '../../data/species.json' with { type: 'json' };

const maps = loadMaps(mapData);

test('all rows in every map have equal length and only legal tiles', () => {
  for (const [id, m] of Object.entries(maps)) {
    assert.ok(m.rows.every(r => r.length === m.width), `${id} ragged`);
    for (const r of m.rows) for (const ch of r) assert.ok(m.legend.has(ch), `${id}: illegal tile ${ch}`);
  }
});
test('start tile and every warp target are walkable and in bounds; warp sources are D or M', () => {
  const s = mapData.start; assert.ok(isWalkable(maps[s.map], s.x, s.y));
  for (const m of Object.values(maps)) for (const w of m.warps) {
    assert.ok(maps[w.to], `unknown map ${w.to}`); assert.ok(inBounds(maps[w.to], w.tx, w.ty)); assert.ok(isWalkable(maps[w.to], w.tx, w.ty), `warp to ${w.to} lands on ${tileAt(maps[w.to], w.tx, w.ty)}`);
    assert.ok(['D', 'M'].includes(tileAt(m, w.x, w.y)), `warp source at ${m.id} ${w.x},${w.y} is ${tileAt(m, w.x, w.y)}`);
  }
});
test('every D and M tile has a warp; every warp round-trips to a map that warps back', () => {
  for (const m of Object.values(maps)) for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
    const t = tileAt(m, x, y); if (t === 'D' || t === 'M') assert.ok(warpAt(m, x, y), `${m.id} ${x},${y} ${t} has no warp`);
  }
  for (const m of Object.values(maps)) for (const w of m.warps) assert.ok(maps[w.to].warps.some(b => b.to === m.id), `${w.to} never warps back to ${m.id}`);
});
test('tile queries', () => {
  const t = maps.town;
  assert.equal(isWalkable(t, -1, 0), false); assert.equal(tileAt(t, -1, 0), null);
  assert.equal(warpAt(t, t.warps[0].x, t.warps[0].y)?.to, t.warps[0].to);
  const z = t.zones[0]; assert.equal(zoneAt(t, z.rect[0], z.rect[1])?.id, z.id); assert.equal(zoneAt(t, 0, 0), null);
  assert.deepEqual(step(3, 3, 'up'), [3, 2]); assert.deepEqual(step(3, 3, 'right'), [4, 3]);
});
test('zones: rects in bounds, every table species exists, weights positive, min<=max; every zone contains tall grass', () => {
  const ids = new Set(species.map(s => s.id));
  for (const m of Object.values(maps)) for (const z of m.zones) {
    const [x, y, w, h] = z.rect; assert.ok(inBounds(m, x, y) && inBounds(m, x + w - 1, y + h - 1), `${z.id} rect out of bounds`);
    assert.ok(z.rate > 0 && z.rate < 1); let grass = 0;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (tileAt(m, xx, yy) === ',') grass++;
    assert.ok(grass > 0, `${z.id} has no tall grass`);
    for (const e of z.table) { assert.ok(ids.has(e.species), `${z.id}: unknown species ${e.species}`); assert.ok(e.weight > 0); assert.ok(e.min >= 1 && e.min <= e.max); }
  }
});
test('every tall-grass tile on outdoor maps belongs to a zone', () => {
  for (const m of Object.values(maps)) if (m.outdoor) for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++)
    if (tileAt(m, x, y) === ',') assert.ok(zoneAt(m, x, y), `${m.id} tall grass at ${x},${y} outside any zone`);
});
test('required maps and features exist', () => {
  for (const id of ['town', 'lab', 'haze', 'ribs', 'booth']) assert.ok(maps[id], id);
  const count = (m, ch) => m.rows.join('').split(ch).length - 1;
  assert.equal(count(maps.lab, 'E'), 3, 'lab has 3 starter pedestals');
  assert.equal(count(maps.haze, 'F'), 1, 'haze has the fridge');
  assert.ok(count(maps.haze, 'C') >= 1 && count(maps.ribs, 'C') >= 1);
  assert.equal(count(maps.town, 'G'), 1, 'one closed gate');
  assert.equal(count(maps.town, 'K'), 1, 'one skateboard rack');
  assert.ok(count(maps.town, 'S') >= 5, 'signs in front of each building + routes');
  assert.ok(maps.town.objects.some(o => o.kind === 'gate' && tileAt(maps.town, o.x, o.y) === 'G'));
  assert.ok(maps.town.width >= 28 && maps.town.height >= 36);
});
test('the town is connected: every walkable tile is reachable from the lab door (with the gate open)', () => {
  const t = maps.town; const door = t.warps.find(w => w.to === 'lab');
  const seen = new Set(); const q = [[door.x, door.y]]; seen.add(`${door.x},${door.y}`);
  const walk = (x, y) => isWalkable(t, x, y) || tileAt(t, x, y) === 'G';
  while (q.length) { const [x, y] = q.shift(); for (const f of ['up', 'down', 'left', 'right']) { const [nx, ny] = step(x, y, f); const k = `${nx},${ny}`; if (!seen.has(k) && walk(nx, ny)) { seen.add(k); q.push([nx, ny]); } } }
  let walkable = 0; for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) if (walk(x, y)) walkable++;
  assert.equal(seen.size, walkable, 'unreachable walkable tiles exist');
});
