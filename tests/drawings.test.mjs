// Drawings in, site data out (#13, TDD section 5 and item 2 of section 12).
// The build reads a drawings folder, enforces the file rules, makes thumbnails
// and full-size copies, and writes the list of drawings.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import exifr from 'exifr';
import fc from 'fast-check';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { BuildStopped, MAX_THUMB_BYTES, THUMB_LONG_SIDE, buildDrawings, makeThumbnail, readDrawings } from '../build/drawings.mjs';
import { PHONE_PHOTO } from './fixtures/make-fixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures', 'drawings');
const tmp = (name) => mkdtempSync(join(tmpdir(), `sketch-gallery-${name}-`));

// Every file under a folder, as paths relative to it, leaving out hidden files like .DS_Store.
function filesUnder(dir, prefix = '') {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => !name.startsWith('.')).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path, `${prefix}${name}/`) : [`${prefix}${name}`];
  });
}

async function pixelAt(file, x, y, { upright = true } = {}) {
  const img = upright ? sharp(file).rotate() : sharp(file);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const at = (Math.round(y * (info.height - 1)) * info.width + Math.round(x * (info.width - 1))) * info.channels;
  return { r: data[at], g: data[at + 1], b: data[at + 2] };
}
const isRed = ({ r, g, b }) => r > 150 && g < 80 && b < 80;
const isBlue = ({ r, g, b }) => b > 150 && r < 80 && g < 80;

describe('building the test drawings', () => {
  let out;
  let list;
  const expectedDates = filesUnder(fixtures).map((f) => f.split('/')[1].replace('.jpg', '')).sort();

  beforeAll(async () => {
    out = tmp('out');
    await buildDrawings({ from: fixtures, to: out });
    list = JSON.parse(readFileSync(join(out, 'drawings.json'), 'utf8'));
  });

  it('lists every drawing in the folder, in date order', () => {
    expect(expectedDates.length).toBeGreaterThan(0);
    expect(list.drawings.map((d) => d.date)).toEqual(expectedDates);
  });

  it('gives each drawing its year, label, caption and file addresses', () => {
    const d = list.drawings.find((x) => x.date === '2025-10-07');
    expect(d).toEqual({
      date: '2025-10-07',
      year: 2025,
      label: 'October 7',
      caption: 'October 7, 2025',
      width: 1440,
      height: 1671,
      thumb: '/thumbs/2025/2025-10-07.webp',
      full: '/full/2025/2025-10-07.jpg',
    });
  });

  it('has a thumbnail and a full-size file for every drawing in the list, and no other files', () => {
    const listed = list.drawings.flatMap((d) => [d.thumb, d.full]).sort();
    const made = [...filesUnder(join(out, 'thumbs'), '/thumbs/'), ...filesUnder(join(out, 'full'), '/full/')].sort();
    expect(made).toEqual(listed);
  });

  it(`keeps every thumbnail at most ${MAX_THUMB_BYTES} bytes (60 KB, R10 fast) and makes it a WebP image`, async () => {
    for (const d of list.drawings) {
      const file = join(out, d.thumb);
      expect(statSync(file).size).toBeLessThanOrEqual(60_000);
      expect((await sharp(file).metadata()).format).toBe('webp');
    }
  });

  it("keeps each thumbnail the drawing's shape, at most the set size on its long side", async () => {
    for (const d of list.drawings) {
      const { width, height } = await sharp(join(out, d.thumb)).metadata();
      expect(Math.max(width, height)).toBe(Math.min(THUMB_LONG_SIDE, Math.max(d.width, d.height)));
      // Same shape, to within one pixel of rounding.
      expect(Math.abs(width / height - d.width / d.height)).toBeLessThanOrEqual(1 / Math.min(width, height));
    }
  });

  it("gives each drawing its upright width and height, read from the drawing", async () => {
    for (const d of list.drawings) {
      const src = join(fixtures, String(d.year), `${d.date}.jpg`);
      const meta = await sharp(src).metadata();
      expect({ width: d.width, height: d.height }).toEqual(meta.autoOrient);
    }
  });

  it('keeps the full-size pictures exactly as they were', async () => {
    for (const d of list.drawings) {
      const src = join(fixtures, String(d.year), `${d.date}.jpg`);
      const a = await sharp(src).raw().toBuffer();
      const b = await sharp(join(out, d.full)).raw().toBuffer();
      expect(b.equals(a)).toBe(true);
    }
  });

  describe('the sideways phone photo with a location (TDD section 11, "Phone photos")', () => {
    const src = join(fixtures, String(PHONE_PHOTO.date.slice(0, 4)), `${PHONE_PHOTO.date}.jpg`);
    const entry = () => list.drawings.find((d) => d.date === PHONE_PHOTO.date);

    it('really is stored sideways with a location (checks the test drawing itself)', async () => {
      const meta = await sharp(src).metadata();
      expect(meta.orientation).toBe(PHONE_PHOTO.orientation);
      expect({ width: meta.width, height: meta.height }).toEqual({ width: PHONE_PHOTO.height, height: PHONE_PHOTO.width });
      expect(await exifr.gps(src)).toBeTruthy();
      expect(isRed(await pixelAt(src, 0.05, 0.5, { upright: false }))).toBe(true); // red is on the left as stored
    });

    it('has an upright thumbnail: red on top, blue below', async () => {
      const thumb = join(out, entry().thumb);
      const { width, height } = await sharp(thumb).metadata();
      expect(height).toBeGreaterThan(width);
      expect(isRed(await pixelAt(thumb, 0.5, 0.1, { upright: false }))).toBe(true);
      expect(isBlue(await pixelAt(thumb, 0.5, 0.9, { upright: false }))).toBe(true);
    });

    it('is in the list with its upright width and height', () => {
      expect({ width: entry().width, height: entry().height }).toEqual({ width: PHONE_PHOTO.width, height: PHONE_PHOTO.height });
    });

    it('has a full-size copy with no location in it', async () => {
      const full = join(out, entry().full);
      expect(await exifr.gps(full)).toBeUndefined();
      const notes = (await exifr.parse(full, { tiff: true, exif: true, gps: true, xmp: true, iptc: true, mergeOutput: false, translateValues: false })) ?? {};
      expect(JSON.stringify(notes)).not.toMatch(/GPS|latitude|longitude/i);
      expect(readFileSync(full).includes(Buffer.from('GPSLatitude'))).toBe(false);
    });

    it('has a full-size copy that still shows upright', async () => {
      const full = join(out, entry().full);
      expect((await sharp(full).metadata()).orientation).toBe(PHONE_PHOTO.orientation);
      expect(isRed(await pixelAt(full, 0.5, 0.1))).toBe(true);
      expect(isBlue(await pixelAt(full, 0.5, 0.9))).toBe(true);
    });
  });
});

describe('thumbnails', () => {
  it('lower the quality step by step until they fit', async () => {
    const src = readFileSync(join(fixtures, '2025', '2025-10-07.jpg'));
    const first = await makeThumbnail(src);
    const smaller = await makeThumbnail(src, { maxBytes: first.data.length - 1 });
    expect(smaller.quality).toBeLessThan(first.quality);
    expect(smaller.data.length).toBeLessThan(first.data.length);
  });

  it('stop the build when even the lowest quality is too big', async () => {
    const out = tmp('too-big');
    const err = await buildDrawings({ from: fixtures, to: out, maxThumbBytes: 100 }).catch((e) => e);
    expect(err).toBeInstanceOf(BuildStopped);
    expect(err.problems.length).toBe(filesUnder(fixtures).length);
    expect(err.problems[0]).toMatch(/^2024\/2024-02-29\.jpg: its thumbnail is still [\d.]+ KB at the lowest quality; the limit is 0\.1 KB$/);
  });
});

// A drawings folder made from a description, for the tests of the file rules.
let jpeg;
let png;
beforeAll(async () => {
  jpeg = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#888' } }).jpeg().toBuffer();
  png = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#888' } }).png().toBuffer();
});

function makeFolder(tree) {
  const dir = tmp('in');
  for (const [path, content] of Object.entries(tree)) {
    const full = join(dir, path);
    if (content === 'folder') {
      mkdirSync(full, { recursive: true });
      continue;
    }
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content === 'jpeg' ? jpeg : content === 'png' ? png : content);
  }
  return dir;
}

async function problemsIn(tree) {
  return (await readDrawings(makeFolder(tree))).problems;
}

describe('the build stops', () => {
  it('for a file not named YYYY-MM-DD.jpg', async () => {
    expect(await problemsIn({ '2025/IMG_1234.jpg': 'jpeg', '2025/2025-01-01.jpg': 'jpeg' })).toEqual([
      '2025/IMG_1234.jpg: "IMG_1234.jpg" isn\'t named like 2025-10-07.jpg (year-month-day.jpg)',
    ]);
  });

  it('for a date that is not real', async () => {
    expect(await problemsIn({ '2025/2025-02-29.jpg': 'jpeg' })).toEqual(['2025/2025-02-29.jpg: "2025-02-29.jpg": 2025-02-29 isn\'t a real date']);
  });

  it("for a file whose year doesn't match its folder", async () => {
    expect(await problemsIn({ '2025/2024-12-31.jpg': 'jpeg' })).toEqual(['2025/2024-12-31.jpg: dated 2024 but in the 2025 folder']);
  });

  it("for a file that isn't really a JPEG", async () => {
    expect(await problemsIn({ '2025/2025-01-01.jpg': 'png', '2025/2025-01-02.jpg': 'just some text' })).toEqual([
      "2025/2025-01-01.jpg: isn't really a JPEG",
      "2025/2025-01-02.jpg: isn't really a JPEG",
    ]);
  });

  it('for an empty year folder, so a year with no drawings never reaches the menu', async () => {
    expect(await problemsIn({ '2019': 'folder', '2025/2025-01-01.jpg': 'jpeg' })).toEqual(['2019/: is empty; a year folder needs at least one drawing']);
  });

  it('for anything in the drawings folder that isn\'t a year folder', async () => {
    expect(await problemsIn({ 'notes.txt': 'hi', 'misc/2025-01-01.jpg': 'jpeg', '2025/2025-01-01.jpg': 'jpeg' })).toEqual([
      "misc: isn't a year folder like 2025/",
      "notes.txt: isn't a year folder like 2025/",
    ]);
  });

  it('for a folder inside a year folder', async () => {
    expect(await problemsIn({ '2025/2025-01-01.jpg': 'jpeg', '2025/extra/2025-01-02.jpg': 'jpeg' })).toEqual([
      '2025/extra: is a folder; a year folder holds only drawings',
    ]);
  });

  it('when there are no drawings at all', async () => {
    expect(await problemsIn({})).toEqual(['there are no year folders, so there are no drawings to show']);
    expect((await readDrawings(join(tmp('none'), 'missing'))).problems).toEqual([expect.stringMatching(/^the drawings folder .* doesn't exist$/)]);
  });

  it('but skips hidden files like .DS_Store, which macOS adds by itself', async () => {
    expect(await problemsIn({ '.DS_Store': 'x', '2025/.DS_Store': 'x', '2025/2025-01-01.jpg': 'jpeg' })).toEqual([]);
  });

  it('and names every problem at once, writing nothing', async () => {
    // Random folders, each file good or bad in one way; the build must list exactly the bad ones.
    const kind = fc.constantFrom('good', 'badName', 'wrongYear', 'notJpeg');
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.integer({ min: 2000, max: 2030 }), { minLength: 1, maxLength: 4 }).chain((years) =>
          fc.tuple(fc.constant(years), fc.array(fc.array(kind, { maxLength: 4 }), { minLength: years.length, maxLength: years.length })),
        ),
        async ([years, kindsPerYear]) => {
          const tree = {};
          let bad = 0;
          years.forEach((year, i) => {
            const kinds = kindsPerYear[i];
            if (kinds.length === 0) {
              tree[String(year)] = 'folder';
              bad++;
            }
            kinds.forEach((k, j) => {
              const day = String(j + 1).padStart(2, '0');
              const name = { good: `${year}-01-${day}.jpg`, badName: `photo ${j}.jpg`, wrongYear: `${year - 1}-01-${day}.jpg`, notJpeg: `${year}-02-${day}.jpg` }[k];
              tree[`${year}/${name}`] = k === 'notJpeg' ? 'png' : 'jpeg';
              if (k !== 'good') bad++;
            });
          });
          const from = makeFolder(tree);
          const { problems, drawings } = await readDrawings(from);
          expect(problems.length).toBe(bad);
          if (bad === 0) expect(drawings.length).toBe(Object.keys(tree).length);

          const to = join(tmp('out'), 'dist');
          const result = await buildDrawings({ from, to }).then(() => null, (e) => e);
          if (bad > 0) {
            expect(result).toBeInstanceOf(BuildStopped);
            expect(result.problems).toEqual(problems);
            expect(existsSync(to)).toBe(false);
          } else {
            expect(result).toBe(null);
          }
        },
      ),
      { numRuns: 25 },
    );
  });
});

describe('the list and the files always match', () => {
  it('for any set of drawings: every listed drawing has both files, and every file is listed', async () => {
    const firstDay = Date.UTC(2019, 0, 1);
    const day = 24 * 60 * 60 * 1000;
    await fc.assert(
      fc.asyncProperty(fc.uniqueArray(fc.integer({ min: 0, max: 8 * 365 }), { minLength: 1, maxLength: 6 }), async (offsets) => {
        const dates = offsets.map((n) => new Date(firstDay + n * day).toISOString().slice(0, 10));
        const tree = Object.fromEntries(dates.map((d) => [`${d.slice(0, 4)}/${d}.jpg`, 'jpeg']));
        const to = tmp('out');
        await buildDrawings({ from: makeFolder(tree), to });
        const list = JSON.parse(readFileSync(join(to, 'drawings.json'), 'utf8'));
        expect(list.drawings.map((d) => d.date)).toEqual([...dates].sort());
        const listed = list.drawings.flatMap((d) => [d.thumb, d.full]).sort();
        const made = [...filesUnder(join(to, 'thumbs'), '/thumbs/'), ...filesUnder(join(to, 'full'), '/full/')].sort();
        expect(made).toEqual(listed);
      }),
      { numRuns: 10 },
    );
  });

  it('copies the drawings without changing the source folder', async () => {
    const from = makeFolder({ '2025/2025-01-01.jpg': 'jpeg' });
    const before = filesUnder(from);
    await buildDrawings({ from, to: tmp('out') });
    expect(filesUnder(from)).toEqual(before);
    expect(readFileSync(join(from, '2025/2025-01-01.jpg')).equals(jpeg)).toBe(true);
  });
});
