// Downloads the two public-domain frames of each exercise demo from
// free-exercise-db (Unlicense) into public/exercises/ as small WebP files,
// which the service worker precaches for offline use. Existing files are kept.
//   npm run demos
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const names = JSON.parse(readFileSync(join(root, 'src/demos.json'), 'utf8'));
const out = join(root, 'public/exercises');
const base = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';

mkdirSync(out, { recursive: true });

for (const [key, name] of Object.entries(names)) {
  for (const frame of [0, 1]) {
    const target = join(out, `${key}-${frame}.webp`);
    if (existsSync(target)) {
      continue;
    }
    const response = await fetch(`${base}/${name}/${frame}.jpg`);
    if (!response.ok) {
      console.error(`${name}/${frame}.jpg: HTTP ${response.status}`);
      process.exitCode = 1;
      continue;
    }
    const input = Buffer.from(await response.arrayBuffer());
    await sharp(input).resize({ width: 400, withoutEnlargement: true }).webp({ quality: 70 }).toFile(target);
    console.log(`wrote exercises/${key}-${frame}.webp`);
  }
}
