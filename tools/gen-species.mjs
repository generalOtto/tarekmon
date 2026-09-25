// tools/gen-species.mjs — builds data/species.json from data/stickers.json + tools/species-names.json
import { readFileSync, writeFileSync } from 'node:fs';
const stickers = JSON.parse(readFileSync('data/stickers.json', 'utf8'));
const names = JSON.parse(readFileSync('tools/species-names.json', 'utf8'));
const moves = JSON.parse(readFileSync('data/moves.json', 'utf8'));

// base-stat templates by type (sum ≈ 240–260); a per-species nudge from the id hash adds variety
const TEMPLATE = {
  Steamed: { hp: 70, atk: 50, def: 70, spd: 55 }, Fried: { hp: 55, atk: 75, def: 50, spd: 65 },
  Spicy: { hp: 60, atk: 80, def: 45, spd: 60 }, Soggy: { hp: 80, atk: 55, def: 65, spd: 40 },
  Frozen: { hp: 60, atk: 60, def: 60, spd: 70 }, Imported: { hp: 75, atk: 70, def: 80, spd: 30 },
};
const RARITY = { common: { catchRate: 190, xpYield: 60, bonus: 0 }, uncommon: { catchRate: 120, xpYield: 90, bonus: 10 },
  rare: { catchRate: 60, xpYield: 140, bonus: 20 }, starter: { catchRate: 45, xpYield: 100, bonus: 15 }, legend: { catchRate: 30, xpYield: 200, bonus: 30 } };

const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const typeless = moves.filter(m => m.type === null);
const byType = t => moves.filter(m => m.type === t);

function pickMoves(type, id) {
  const h = hash(id);
  const own = byType(type);
  const attacks = own.filter(m => m.power > 0), status = own.filter(m => m.power === 0);
  const used = new Set();
  // take pool[start], or the next candidate (wrapping) whose id is not already used
  const take = (pool, start) => {
    for (let k = 0; k < pool.length; k++) {
      const m = pool[(start + k) % pool.length];
      if (!used.has(m.id)) { used.add(m.id); return m; }
    }
    throw new Error(`${id}: no distinct move left in pool`);
  };
  const first = take(attacks, h % attacks.length);
  const second = take(typeless, (h >> 3) % typeless.length);
  const third = status.length ? take(status, (h >> 6) % status.length) : take(attacks, (h >> 6) % attacks.length);
  const fourth = take(attacks, (h >> 9) % attacks.length);
  return [{ level: 1, id: first.id }, { level: 1, id: second.id }, { level: 8, id: third.id }, { level: 15, id: fourth.id }];
}

const species = stickers.map((s, i) => {
  const n = names[s.id]; if (!n) throw new Error(`no name for ${s.id}`);
  const t = TEMPLATE[n.type], r = RARITY[n.rarity], h = hash(s.id);
  const nudge = (k, j) => Math.max(20, Math.min(130, t[k] + r.bonus + ((h >> (j * 4)) % 15) - 7));
  return { id: s.id, num: i + 1, name: n.name, who: s.who, type: n.type, sticker: s.id, animated: s.animated,
    base: { hp: nudge('hp', 0), atk: nudge('atk', 1), def: nudge('def', 2), spd: nudge('spd', 3) },
    moves: pickMoves(n.type, s.id), catchRate: r.catchRate, xpYield: r.xpYield, entry: n.entry, rarity: n.rarity };
});
writeFileSync('data/species.json', JSON.stringify(species, null, 2) + '\n');
console.log(`wrote ${species.length} species`);
