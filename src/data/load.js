// fetch all JSON once, index by id, preload sticker images. Browser-only (uses fetch + Image).
const byId = arr => Object.fromEntries(arr.map(x => [x.id, x]));
export async function loadDb(base = './') {
  const get = f => fetch(`${base}data/${f}.json`).then(r => { if (!r.ok) throw new Error(`load ${f}: ${r.status}`); return r.json(); });
  const [types, moves, species, stickers, items, trainers, dialogue, mapData] = await Promise.all(
    ['types', 'moves', 'species', 'stickers', 'items', 'trainers', 'dialogue', 'map'].map(get));
  const images = {};
  await Promise.all(species.map(s => new Promise((res) => {
    const img = new Image(); img.onload = () => res(); img.onerror = () => { console.warn(`sticker missing: ${s.sticker}`); images[s.id] = null; res(); };
    img.src = `${base}assets/stickers/${s.sticker}.webp`; images[s.id] = img;
  })));
  return Object.freeze({ types, moves, movesById: byId(moves), species, speciesById: byId(species), stickers, items, itemsById: byId(items),
    trainers, trainersById: byId(trainers), dialogue, mapData, images });
}
