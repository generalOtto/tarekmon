// Pure map queries over data/map.json — no DOM. Coordinates are tile units.
import { WALKABLE, ENCOUNTER, INTERACT, LEGEND } from './tiles.js';
export { WALKABLE, ENCOUNTER, INTERACT };

/** Normalize raw map data: add id/width/height/legend and default every list to []. */
export function loadMaps(data) {
  const out = {};
  for (const [id, m] of Object.entries(data.maps)) {
    out[id] = { id, ...m, width: m.rows[0].length, height: m.rows.length, legend: LEGEND,
      warps: m.warps ?? [], zones: m.zones ?? [], npcs: m.npcs ?? [], trainers: m.trainers ?? [], signs: m.signs ?? [], objects: m.objects ?? [] };
  }
  return out;
}
export const inBounds = (m, x, y) => x >= 0 && y >= 0 && x < m.width && y < m.height;
export const tileAt = (m, x, y) => inBounds(m, x, y) ? m.rows[y][x] : null;
/** `G` (closed gate) is never walkable here; the overworld swaps the tile to `g` when the badge flag is set. */
export function isWalkable(m, x, y) { const t = tileAt(m, x, y); return t !== null && WALKABLE.has(t); }
export const isEncounterTile = (m, x, y) => ENCOUNTER.has(tileAt(m, x, y));
export const warpAt = (m, x, y) => m.warps.find(w => w.x === x && w.y === y) ?? null;
export const zoneAt = (m, x, y) => m.zones.find(z => x >= z.rect[0] && y >= z.rect[1] && x < z.rect[0] + z.rect[2] && y < z.rect[1] + z.rect[3]) ?? null;
export const npcAt = (m, x, y) => [...m.npcs, ...m.trainers].find(n => n.x === x && n.y === y) ?? null;
export const signAt = (m, x, y) => m.signs.find(s => s.x === x && s.y === y) ?? null;
export const objectAt = (m, x, y) => m.objects.find(o => o.x === x && o.y === y) ?? null;
export function step(x, y, facing) { return facing === 'up' ? [x, y - 1] : facing === 'down' ? [x, y + 1] : facing === 'left' ? [x - 1, y] : [x + 1, y]; }
