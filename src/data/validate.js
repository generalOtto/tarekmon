// src/data/validate.js
const EFFECTS = new Set(['none', 'accDown', 'skip', 'heal', 'atkUp', 'defUp', 'neverMiss']);

export function validateMoves(moves, types) {
  const errs = [], seen = new Set();
  for (const m of moves) {
    if (seen.has(m.id)) errs.push(`dup move id ${m.id}`); seen.add(m.id);
    if (!/^[a-z0-9-]+$/.test(m.id)) errs.push(`bad id ${m.id}`);
    if (m.type !== null && !types.types.includes(m.type)) errs.push(`${m.id}: bad type ${m.type}`);
    if (!(m.accuracy >= 1 && m.accuracy <= 100)) errs.push(`${m.id}: accuracy`);
    if (m.type === types.resistsAll && m.accuracy > 75) errs.push(`${m.id}: Imported accuracy > 75`);
    if (!(m.pp >= 5 && m.pp <= 40)) errs.push(`${m.id}: pp`);
    if (!(m.power >= 0 && m.power <= 120)) errs.push(`${m.id}: power`);
    if (!EFFECTS.has(m.effect?.kind)) errs.push(`${m.id}: effect ${m.effect?.kind}`);
    if (typeof m.text !== 'string' || !m.text) errs.push(`${m.id}: text`);
    if (typeof m.name !== 'string' || !m.name || m.name.length > 10) errs.push(`${m.id}: name > 10 chars`);
  }
  return errs;
}

export function validateSpecies(species, moves, types, stickers) {
  const errs = [], ids = new Set(), moveIds = new Set(moves.map(m => m.id)), stickerIds = new Set(stickers.map(s => s.id));
  for (const s of species) {
    if (ids.has(s.id)) errs.push(`dup species ${s.id}`); ids.add(s.id);
    if (!stickerIds.has(s.sticker)) errs.push(`${s.id}: unknown sticker ${s.sticker}`);
    if (!types.types.includes(s.type)) errs.push(`${s.id}: bad type`);
    for (const k of ['hp', 'atk', 'def', 'spd']) if (!(s.base[k] >= 20 && s.base[k] <= 130)) errs.push(`${s.id}: base ${k}`);
    if (!(s.moves.length >= 2 && s.moves.length <= 4)) errs.push(`${s.id}: ${s.moves.length} moves`);
    if (s.moves[0]?.level !== 1) errs.push(`${s.id}: first move must be level 1`);
    for (const lm of s.moves) if (!moveIds.has(lm.id)) errs.push(`${s.id}: unknown move ${lm.id}`);
    if (!(s.catchRate >= 25 && s.catchRate <= 255)) errs.push(`${s.id}: catchRate`);
    if (!(s.xpYield >= 40 && s.xpYield <= 250)) errs.push(`${s.id}: xpYield`);
    if (!s.entry || s.entry.length > 120) errs.push(`${s.id}: entry length`);
    if (!s.name || s.name.length > 10) errs.push(`${s.id}: name > 10 chars (GB text box)`);
  }
  return errs;
}
