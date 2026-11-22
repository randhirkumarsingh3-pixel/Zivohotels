/**
 * Makes the 400 / 800 / 1600 px WebP copies of every uploaded photo now, so no visitor waits for
 * the first resize. Safe to run any time (existing copies are skipped).
 *
 *   docker compose -f docker-compose.yml --env-file .env exec -T api node scripts/warmImages.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { variantFor, WIDTHS } from '../services/imageVariants.js';

const uploadDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'uploads');

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  if (e.name.startsWith('_')) return []; // skip the copies themselves
  const p = path.join(dir, e.name);
  return e.isDirectory() ? walk(p) : [p];
});

const files = fs.existsSync(uploadDir) ? walk(uploadDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)) : [];
let made = 0;
let before = 0;
let after = 0;
for (const f of files) {
  const rel = path.relative(uploadDir, f);
  before += fs.statSync(f).size;
  for (const w of WIDTHS) {
    const out = await variantFor(uploadDir, rel, w).catch((e) => { console.error(`  ${rel} @${w}: ${e.message}`); return null; });
    if (out) { made += 1; if (w === 800) after += fs.statSync(out).size; }
  }
}
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
console.log(`${files.length} photos, ${made} sized copies ready. Originals ${mb(before)}; 800 px copies ${mb(after)}.`);
