/**
 * Photo sizes for the website. A page asks for the width it shows a photo at:
 *
 *   /img/w800/uploads/properties_..._img-123.jpg
 *
 * and gets a WebP of that width (400, 800 or 1600 px), made from the original the first time
 * and kept on disk (uploads/_variants) for every later request. Originals are 2-5 MB phone photos;
 * an 800 px WebP is about 40-80 KB. Works for every photo already uploaded, with no conversion
 * run. File names never change once uploaded, so variants can be cached for a year.
 *
 * New uploads are also shrunk (largest side 2400 px) before they're stored: shrinkUpload().
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export const WIDTHS = [400, 800, 1600];
const ALLOWED = /\.(jpe?g|png|webp)$/i;

// libvips uses several threads per image; keep its memory cache small (the files are cached on disk)
sharp.cache({ memory: 64, files: 0, items: 100 });

const inFlight = new Map();

/**
 * Path of the variant file for an /uploads/ path and width, creating it if needed.
 * Returns null when the original doesn't exist or isn't an image.
 */
export const variantFor = async (uploadDir, relPath, width) => {
  if (!WIDTHS.includes(width) || !ALLOWED.test(relPath)) return null;
  const original = path.resolve(uploadDir, relPath);
  if (!original.startsWith(path.resolve(uploadDir) + path.sep)) return null; // stays inside uploads
  const out = path.join(uploadDir, '_variants', `w${width}`, `${relPath}.webp`);
  if (!path.resolve(out).startsWith(path.resolve(uploadDir, '_variants') + path.sep)) return null;
  try { await fs.promises.access(out); return out; } catch { /* make it */ }
  try { await fs.promises.access(original); } catch { return null; }

  // Two visitors asking for the same new size at once: make it once
  if (inFlight.has(out)) return inFlight.get(out);
  const job = (async () => {
    await fs.promises.mkdir(path.dirname(out), { recursive: true });
    const tmp = `${out}.${process.pid}.${Date.now()}.tmp`;
    await sharp(original, { failOn: 'none' })
      .rotate() // respect the phone's orientation
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: width >= 1600 ? 78 : 72, effort: 4 })
      .toFile(tmp);
    await fs.promises.rename(tmp, out);
    return out;
  })().finally(() => inFlight.delete(out));
  inFlight.set(out, job);
  return job;
};

/**
 * Shrinks a new upload before it's stored: largest side 2400 px, metadata removed, same format.
 * Returns the original buffer if it isn't an image sharp can read.
 */
export const shrinkUpload = async (buffer, mimeType) => {
  if (!/^image\/(jpe?g|png|webp)$/i.test(mimeType || '')) return buffer;
  try {
    let img = sharp(buffer, { failOn: 'none' }).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true });
    if (/png/i.test(mimeType)) img = img.png({ compressionLevel: 9, palette: true });
    else if (/webp/i.test(mimeType)) img = img.webp({ quality: 82 });
    else img = img.jpeg({ quality: 82, mozjpeg: true });
    const out = await img.toBuffer();
    return out.length < buffer.length ? out : buffer;
  } catch {
    return buffer;
  }
};
