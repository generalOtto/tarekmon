import { readdirSync, copyFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = process.argv[2] ?? 'C:/Users/Otto/My Drive/_/Downloads/WhatsApp Favorite Stickers';
const OUT = 'assets/stickers';
mkdirSync(OUT, { recursive: true });

const files = readdirSync(SRC).filter(f => f.endsWith('.webp')).sort();
if (files.length !== 74) throw new Error(`expected 74 stickers, found ${files.length}`);

const manifest = files.map((f, i) => {
  const id = `d${String(i + 1).padStart(3, '0')}`;
  const buf = readFileSync(join(SRC, f));
  const animated = buf.includes(Buffer.from('ANIM'));
  copyFileSync(join(SRC, f), join(OUT, `${id}.webp`));
  return { id, file: `${id}.webp`, source: f, animated, who: null };
});
writeFileSync('data/stickers.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`copied ${manifest.length}, animated ${manifest.filter(m => m.animated).length}`);
