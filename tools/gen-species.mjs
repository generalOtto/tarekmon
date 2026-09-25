// tools/gen-species.mjs — builds data/species.json from data/stickers.json + tools/species-names.json
import { readFileSync, writeFileSync } from 'node:fs';
import { TEMPLATE, RARITY, LEVELS } from '../src/data/species-tables.js';
const stickers = JSON.parse(readFileSync('data/stickers.json', 'utf8'));
const names = JSON.parse(readFileSync('tools/species-names.json', 'utf8'));
const moves = JSON.parse(readFileSync('data/moves.json', 'utf8'));

// Unsigned 32-bit string hash. Callers hash a salted key (id + ':' + purpose) rather than
// shifting one hash: with 4-char ids only the low bits vary, so shifted slices were constant.
const hash = s => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const clamp = v => Math.max(20, Math.min(130, v));
const typeless = moves.filter(m => m.type === null);
const byType = t => moves.filter(m => m.type === t);

function pickMoves(type, id) {
  const own = byType(type);
  const attacks = own.filter(m => m.power > 0).sort((a, b) => a.power - b.power || a.id.localeCompare(b.id));
  const status = own.filter(m => m.power === 0);
  const used = new Set();
  // take pool[start], or the next candidate (wrapping) whose id is not already used
  const take = (pool, start) => {
    for (let k = 0; k < pool.length; k++) {
      const m = pool[(start + k) % pool.length];
      if (!used.has(m.id)) { used.add(m.id); return m; }
    }
    throw new Error(`${id}: no distinct move left in pool`);
  };
  const slot = n => hash(`${id}:m${n}`);
  const weaker = attacks.slice(0, Math.ceil(attacks.length / 2));
  const stronger = attacks.slice(Math.ceil(attacks.length / 2));
  const first = take(weaker, slot(0) % weaker.length);                   // L1: a weaker attack of its own type
  const second = take(typeless, slot(1) % typeless.length);              // L1: a typeless move
  const thirdHash = hash(`${id}:status`);                                // own salt: `m2` collided too often on 4-char ids
  const third = status.length ? take(status, thirdHash % status.length)  // L10: the type's status move
    : take(attacks, thirdHash % attacks.length);
  // L20: Imported keeps long-drive pinned (every Imported species must learn it); every other
  // type picks by hash from the stronger half, so more than just the single strongest gets used.
  const fourth = type === 'Imported' ? attacks.find(m => m.id === 'long-drive')
    : take(stronger, slot(3) % stronger.length);
  if (!fourth) throw new Error(`${id}: no attack left for the final slot`);
  return [first, second, third, fourth].map((m, i) => ({ level: LEVELS[i], id: m.id }));
}

const species = stickers.map((s, i) => {
  const n = names[s.id]; if (!n) throw new Error(`no name for ${s.id}`);
  const t = TEMPLATE[n.type], r = RARITY[n.rarity];
  const nudge = k => clamp(t[k] + r.bonus + (hash(`${s.id}:${k}`) % 15) - 7);
  return { id: s.id, num: i + 1, name: n.name, who: s.who, type: n.type, sticker: s.id, animated: s.animated,
    base: { hp: nudge('hp'), atk: nudge('atk'), def: nudge('def'), spd: nudge('spd') },
    moves: pickMoves(n.type, s.id), catchRate: r.catchRate, xpYield: r.xpYield, entry: n.entry, rarity: n.rarity };
});
writeFileSync('data/species.json', JSON.stringify(species, null, 2) + '\n');
console.log(`wrote ${species.length} species`);
