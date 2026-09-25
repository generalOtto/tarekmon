// Map authoring helper: prints every map in data/map.json with a coordinate ruler,
// plus its warps and encounter zones. Usage: node tools/map-check.mjs [mapId...]
import { readFileSync } from 'node:fs';
import { loadMaps } from '../src/world/map.js';

const data = JSON.parse(readFileSync(new URL('../data/map.json', import.meta.url), 'utf8'));
const maps = loadMaps(data);
const want = process.argv.slice(2);

for (const m of Object.values(maps)) {
  if (want.length && !want.includes(m.id)) continue;
  console.log(`\n== ${m.id} "${m.name}" ${m.width}x${m.height}${m.outdoor ? ' outdoor' : ''}`);
  const tens = [...Array(m.width)].map((_, x) => (x % 10 === 0 ? String(x / 10 % 10) : ' ')).join('');
  const ones = [...Array(m.width)].map((_, x) => x % 10).join('');
  console.log(`    ${tens}\n    ${ones}`);
  m.rows.forEach((r, y) => console.log(`${String(y).padStart(3)} ${r}`));
  for (const w of m.warps) console.log(`  warp ${w.x},${w.y} -> ${w.to} ${w.tx},${w.ty} ${w.facing}`);
  for (const z of m.zones) {
    const [x, y, w, h] = z.rect;
    console.log(`  zone ${z.id} rect x${x}..${x + w - 1} y${y}..${y + h - 1} rate ${z.rate} ` +
      `(${z.table.length} species, levels ${Math.min(...z.table.map(e => e.min))}-${Math.max(...z.table.map(e => e.max))}, ` +
      `total weight ${z.table.reduce((s, e) => s + e.weight, 0)})`);
  }
  for (const o of m.objects) console.log(`  object ${o.kind} at ${o.x},${o.y}`);
}
if (data.start) console.log(`\nstart: ${data.start.map} ${data.start.x},${data.start.y} facing ${data.start.facing}`);
