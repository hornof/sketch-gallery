// Drawings in, site data out (#13). Reads a drawings folder (one folder per year,
// files named like 2025-10-07.jpg), checks the file rules in TDD section 5, and
// writes for each drawing a thumbnail and a full-size copy, plus the list of drawings.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { caption, label, parseFileName } from './dates.mjs';
import { keepOnlyOrientation } from './jpeg.mjs';

// R10 (fast): every thumbnail at most 60 KB. Counted as 60,000 bytes, the stricter reading.
export const MAX_THUMB_BYTES = 60_000;
// Thumbnails are at most this many pixels on their long side, before the quality is lowered.
export const THUMB_LONG_SIDE = 500;
// WebP quality steps, best first. The first one under the size limit is used.
export const THUMB_QUALITIES = [80, 70, 60, 50, 40];

export class BuildStopped extends Error {
  constructor(problems) {
    super(`The build stopped. Fix these and try again:\n${problems.map((p) => `- ${p}`).join('\n')}`);
    this.problems = problems;
  }
}

// Folder contents in name order, leaving out hidden files like .DS_Store, which macOS adds by itself.
export const visible = (names) => names.filter((n) => !n.startsWith('.')).sort();

// The file's size and orientation if it's a whole JPEG, or null if it isn't.
export async function readJpeg(path) {
  const buf = readFileSync(path);
  try {
    keepOnlyOrientation(buf); // walks every block to the end of the picture; throws if it isn't a whole JPEG
    return await sharp(buf).metadata();
  } catch {
    return null;
  }
}

// Returns { drawings, problems }. Drawings come in date order, each as
// { year, month, day, date, path, meta }. Every problem is a line naming the
// file, so the owner can fix them all at once.
export async function readDrawings(dir) {
  if (!existsSync(dir)) return { drawings: [], problems: [`the drawings folder ${dir} doesn't exist`] };
  const drawings = [];
  const problems = [];
  const years = [];
  for (const name of visible(readdirSync(dir))) {
    if (/^\d{4}$/.test(name) && statSync(join(dir, name)).isDirectory()) years.push(name);
    else problems.push(`${name}: isn't a year folder like 2025/`);
  }
  if (years.length === 0 && problems.length === 0) {
    return { drawings, problems: ['there are no year folders, so there are no drawings to show'] };
  }
  // Years in order, and each year's files in name order, which is date order.
  for (const year of years) {
    const files = visible(readdirSync(join(dir, year)));
    if (files.length === 0) problems.push(`${year}/: is empty; a year folder needs at least one drawing`);
    for (const file of files) {
      const where = `${year}/${file}`;
      const path = join(dir, year, file);
      if (statSync(path).isDirectory()) {
        problems.push(`${where}: is a folder; a year folder holds only drawings`);
        continue;
      }
      const parsed = parseFileName(file);
      if (!parsed.ok) {
        problems.push(`${where}: ${parsed.message}`);
        continue;
      }
      if (file.slice(0, 4) !== year) {
        problems.push(`${where}: dated ${file.slice(0, 4)} but in the ${year} folder`);
        continue;
      }
      const meta = await readJpeg(path);
      if (!meta) {
        problems.push(`${where}: isn't really a JPEG`);
        continue;
      }
      const { year: y, month, day, date } = parsed;
      drawings.push({ year: y, month, day, date, path, meta });
    }
  }
  return { drawings, problems };
}

// Makes an upright WebP thumbnail with the drawing's shape, lowering the quality
// step by step until it is at most maxBytes. Returns { data, quality }, or
// { data: null, bytes } when even the lowest quality is too big.
export async function makeThumbnail(buf, { maxBytes = MAX_THUMB_BYTES } = {}) {
  const resized = sharp(buf)
    .autoOrient()
    .resize({ width: THUMB_LONG_SIDE, height: THUMB_LONG_SIDE, fit: 'inside', withoutEnlargement: true });
  let data;
  for (const quality of THUMB_QUALITIES) {
    data = await resized.clone().webp({ quality }).toBuffer();
    if (data.length <= maxBytes) return { data, quality };
  }
  return { data: null, bytes: data.length };
}

const kb = (bytes) => `${Math.round(bytes / 100) / 10} KB`;

// Checks the drawings folder `from`, then writes into `to`:
//   thumbs/YYYY/YYYY-MM-DD.webp, full/YYYY/YYYY-MM-DD.jpg and drawings.json.
// If any file breaks the rules or any thumbnail can't get small enough, it writes
// nothing and throws BuildStopped, listing every problem.
export async function buildDrawings({ from, to, maxThumbBytes = MAX_THUMB_BYTES }) {
  const { drawings, problems } = await readDrawings(from);

  const thumbs = [];
  for (const d of drawings) {
    // A file can pass readJpeg and still be damaged inside its picture data; only decoding it finds that.
    const thumb = await makeThumbnail(readFileSync(d.path), { maxBytes: maxThumbBytes }).catch(() => null);
    if (!thumb) {
      problems.push(`${d.year}/${d.date}.jpg: isn't really a JPEG`);
    } else if (!thumb.data) {
      problems.push(`${d.year}/${d.date}.jpg: its thumbnail is still ${kb(thumb.bytes)} at the lowest quality; the limit is ${kb(maxThumbBytes)}`);
    }
    thumbs.push(thumb?.data);
  }
  if (problems.length) throw new BuildStopped(problems);

  // Clear out files from an earlier build, so a removed drawing leaves nothing behind.
  for (const sub of ['thumbs', 'full']) rmSync(join(to, sub), { recursive: true, force: true });
  const list = drawings.map((d, i) => {
    const thumbPath = `thumbs/${d.year}/${d.date}.webp`;
    const fullPath = `full/${d.year}/${d.date}.jpg`;
    mkdirSync(join(to, 'thumbs', String(d.year)), { recursive: true });
    mkdirSync(join(to, 'full', String(d.year)), { recursive: true });
    writeFileSync(join(to, thumbPath), thumbs[i]);
    writeFileSync(join(to, fullPath), keepOnlyOrientation(readFileSync(d.path), d.meta.orientation));
    return {
      date: d.date,
      year: d.year,
      label: label(d),
      caption: caption(d),
      width: d.meta.autoOrient.width,
      height: d.meta.autoOrient.height,
      thumb: `/${thumbPath}`,
      full: `/${fullPath}`,
    };
  });
  writeFileSync(join(to, 'drawings.json'), `${JSON.stringify({ drawings: list }, null, 1)}\n`);
  return list;
}
