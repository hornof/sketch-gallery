// Link preview and browser rules (#20). R14 (link preview): every page carries the
// title, the description line and the preview image, and the image exists. R13 (only
// the owner, on the site): the site has no form and no server code, and the browser
// rules in _headers let only the site's own code run and only hornof.org frame it.
// The browser tests in tests/browser/browser-rules.pw.mjs check the rules in a browser.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import fc from 'fast-check';
import sharp from 'sharp';
import { beforeAll, describe, expect, it, onTestFinished } from 'vitest';
import { buildDrawings } from '../build/drawings.mjs';
import { renderPage, writeSite } from '../build/pages.mjs';
import { PREVIEW, SITE, pickPreview, previewTags, writePreview } from '../build/preview.mjs';
import { CSP, headersFor, writeHeaders } from '../build/headers.mjs';
import { caption, label } from '../build/dates.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = join(root, 'tests', 'fixtures', 'drawings');

function tmp(name) {
  const dir = mkdtempSync(join(tmpdir(), `sketch-gallery-${name}-`));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function listFrom(dates) {
  return [...dates].sort().map((date) => {
    const [year, month, day] = date.split('-').map(Number);
    return { date, year, label: label({ month, day }), caption: caption({ year, month, day }), width: 1440, height: 1671, thumb: `/thumbs/${year}/${date}.webp`, full: `/full/${year}/${date}.jpg` };
  });
}
const dateArb = fc.integer({ min: 0, max: 365 * 10 }).map((n) => new Date(Date.UTC(2020, 0, 1 + n)).toISOString().slice(0, 10));
const listArb = fc.uniqueArray(dateArb, { minLength: 1, maxLength: 40 }).map(listFrom);

// The value of <meta property="..."> or <meta name="...">, read from the page; undefined if missing.
const meta = (html, key) => html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`))?.[1];
const allFiles = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? allFiles(join(dir, n)) : [join(dir, n)]));

describe('site.json', () => {
  it('holds the title, the description line, the address, and the drawing the preview shows', () => {
    expect(SITE.title).toBe('Sketch Gallery');
    expect(SITE.description).toBe('This gallery displays drawings made over several years.');
    expect(SITE.address).toBe('https://sketch-gallery.hornof.org');
    expect(SITE.preview).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('picks a drawing that is really in drawings/', () => {
    const date = SITE.preview;
    expect(existsSync(join(root, 'drawings', date.slice(0, 4), `${date}.jpg`))).toBe(true);
  });
});

describe('pickPreview', () => {
  it('uses the drawing site.json names when it is in the list', () => {
    fc.assert(
      fc.property(listArb, fc.nat(), (list, n) => {
        const want = list[n % list.length];
        expect(pickPreview(list, want.date)).toEqual({ drawing: want });
      }),
    );
  });

  it('when that drawing is missing, uses the newest and says so', () => {
    fc.assert(
      fc.property(listArb, dateArb, (list, date) => {
        fc.pre(!list.some((d) => d.date === date));
        const { drawing, warning } = pickPreview(list, date);
        expect(drawing).toBe(list.at(-1));
        expect(warning).toContain(date);
        expect(warning).toContain(list.at(-1).date);
      }),
    );
  });

  it('with no drawings, picks none', () => {
    expect(pickPreview([], '2025-10-07')).toEqual({ drawing: null });
  });
});

describe('previewTags on every page (R14, link preview)', () => {
  it('every year page and the home page carry the title, description, address and an absolute image address', () => {
    fc.assert(
      fc.property(listArb, (list) => {
        const { drawing } = pickPreview(list);
        const years = [...new Set(list.map((d) => d.year))].sort((a, b) => b - a);
        const pages = [...years.map((year) => [`/${year}/`, renderPage({ year, list })]), ['/', renderPage({ year: years[0], list, home: true })]];
        for (const [path, html] of pages) {
          expect(meta(html, 'og:title')).toBe('Sketch Gallery');
          expect(meta(html, 'og:description')).toBe('This gallery displays drawings made over several years.');
          expect(meta(html, 'og:site_name')).toBe('Sketch Gallery');
          expect(meta(html, 'og:type')).toBe('website');
          expect(meta(html, 'og:url')).toBe(`https://sketch-gallery.hornof.org${path}`);
          expect(meta(html, 'og:image')).toBe('https://sketch-gallery.hornof.org/preview.jpg');
          expect(meta(html, 'og:image:width')).toBe('1200');
          expect(meta(html, 'og:image:height')).toBe('630');
          expect(meta(html, 'og:image:alt')).toBe(`A drawing from ${drawing.caption}`);
          expect(meta(html, 'twitter:card')).toBe('summary_large_image');
          expect(html.match(/<meta property="og:image" /g)).toHaveLength(1);
        }
      }),
    );
  });

  it('with no drawings, names no image and never says "undefined"', () => {
    const tags = previewTags({ path: '/', drawing: null });
    expect(tags).toContain('og:title');
    expect(tags).not.toContain('og:image');
    expect(tags).not.toContain('undefined');
    expect(tags).toContain('<meta name="twitter:card" content="summary">');
  });

  it('escapes quotes and angle brackets in what site.json says', () => {
    const tags = previewTags({ path: '/', drawing: null, site: { ...SITE, title: 'A "b" <c> & d' } });
    expect(tags).toContain('content="A &quot;b&quot; &lt;c&gt; &amp; d"');
  });
});

describe('writePreview', () => {
  let to;
  let list;
  beforeAll(async () => {
    to = mkdtempSync(join(tmpdir(), 'sketch-gallery-preview-'));
    list = await buildDrawings({ from: fixtures, to });
    return () => rmSync(to, { recursive: true, force: true });
  });

  it('writes /preview.jpg, a 1200 × 630 JPEG small enough for every messaging app', async () => {
    const drawing = list.find((d) => d.date === '2025-10-07');
    await writePreview({ drawing, to });
    const file = join(to, 'preview.jpg');
    const m = await sharp(file).metadata();
    expect(PREVIEW).toEqual({ path: '/preview.jpg', width: 1200, height: 630 });
    expect([m.format, m.width, m.height]).toEqual(['jpeg', 1200, 630]);
    expect(statSync(file).size).toBeLessThanOrEqual(300_000);
  });

  it('shows the whole drawing, upright and centered on the page color', async () => {
    // A sideways phone photo is in the fixtures; its preview must come out upright too.
    for (const drawing of list) {
      await writePreview({ drawing, to });
      const { width, height } = drawing; // already upright
      const scale = Math.min(1200 / width, 630 / height);
      const w = Math.round(width * scale);
      // The edges outside the drawing are the page color, #faf9f6; the middle column holds the drawing.
      const { data, info } = await sharp(join(to, 'preview.jpg')).raw().toBuffer({ resolveWithObject: true });
      const px = (x, y) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
      const margin = Math.floor((1200 - w) / 2);
      if (margin > 4) {
        for (const y of [0, 315, 629]) {
          for (const x of [0, margin - 3, 1199 - margin + 3, 1199]) {
            px(x, y).forEach((c, i) => expect(Math.abs(c - [0xfa, 0xf9, 0xf6][i]), `${drawing.date} at ${x},${y}`).toBeLessThanOrEqual(3));
          }
        }
      }
      // The drawing itself: compared with the full-size copy shrunk the same way.
      const own = await sharp(join(to, drawing.full)).autoOrient().resize(w, Math.round(height * scale)).raw().toBuffer({ resolveWithObject: true });
      const ox = Math.floor(own.info.width / 2);
      const oy = Math.floor(own.info.height / 2);
      const a = [...own.data.subarray((oy * own.info.width + ox) * own.info.channels, (oy * own.info.width + ox) * own.info.channels + 3)];
      const b = px(margin + ox, Math.floor((630 - own.info.height) / 2) + oy);
      a.forEach((c, i) => expect(Math.abs(c - b[i]), drawing.date).toBeLessThanOrEqual(24));
    }
  });
});

describe('browser rules (_headers)', () => {
  it('lets only the site\'s own code run, and only hornof.org show the site in a frame', () => {
    const rules = Object.fromEntries(CSP.split('; ').map((r) => [r.split(' ')[0], r.split(' ').slice(1)]));
    expect(rules['default-src']).toEqual(["'self'"]);
    expect(rules['script-src']).toEqual(["'self'"]);
    expect(rules['object-src']).toEqual(["'none'"]);
    expect(rules['base-uri']).toEqual(["'none'"]);
    expect(rules['form-action']).toEqual(["'none'"]);
    expect(rules['frame-ancestors']).toEqual(['https://hornof.org', 'https://www.hornof.org']);
    expect(CSP).not.toContain('unsafe-eval');
    expect(rules['script-src']).not.toContain("'unsafe-inline'");
  });

  it('writes _headers so the rules apply to every address on the site', () => {
    const to = tmp('headers');
    writeHeaders(to);
    const text = readFileSync(join(to, '_headers'), 'utf8');
    for (const path of ['/', '/2025/', '/site.js', '/full/2025/2025-10-07.jpg', '/preview.jpg']) {
      expect(headersFor(text, path)).toEqual({ 'Content-Security-Policy': CSP });
    }
  });

  it('headersFor reads Cloudflare\'s _headers format: exact paths, "*" for any part, and comments', () => {
    const text = '# a comment\n/*\n  A: 1\n/2025/\n  B: 2\n/full/*\n  C: 3\n';
    expect(headersFor(text, '/')).toEqual({ A: '1' });
    expect(headersFor(text, '/2025/')).toEqual({ A: '1', B: '2' });
    expect(headersFor(text, '/2026/')).toEqual({ A: '1' });
    expect(headersFor(text, '/full/2025/x.jpg')).toEqual({ A: '1', C: '3' });
  });
});

// R13 (only the owner, on the site): visitors have nothing to send, and nothing runs on a server.
describe('the built site (R13, only the owner)', () => {
  it('has no form, no input and no server code', async () => {
    const to = tmp('site');
    const list = await buildDrawings({ from: fixtures, to });
    writeSite({ list, to });
    const files = allFiles(to).map((f) => relative(to, f));
    // Cloudflare Pages runs server code only from functions/ or _worker.js.
    expect(files.filter((f) => f.startsWith('functions') || f.startsWith('_worker'))).toEqual([]);
    for (const f of files.filter((name) => name.endsWith('.html'))) {
      expect(readFileSync(join(to, f), 'utf8')).not.toMatch(/<(form|input|textarea|select|button)[\s>]/i);
    }
  });
});
