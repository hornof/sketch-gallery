// Year pages (#16): the build turns the list of drawings into one page per year
// plus a home page showing the newest year. These tests read the HTML the build
// writes; the browser tests in tests/browser/ check how it looks and behaves.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it, onTestFinished } from 'vitest';
import { buildDrawings } from '../build/drawings.mjs';
import { EAGER_THUMBS, renderPage, writeSite } from '../build/pages.mjs';
import { caption, label } from '../build/dates.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = join(root, 'tests', 'fixtures', 'drawings');

// A temporary folder, removed when the test that made it ends.
function tmp(name) {
  const dir = mkdtempSync(join(tmpdir(), `sketch-gallery-${name}-`));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// A list of drawings like the one in drawings.json, from a set of dates.
function listFrom(dates) {
  return [...dates].sort().map((date) => {
    const [year, month, day] = date.split('-').map(Number);
    return {
      date,
      year,
      label: label({ month, day }),
      caption: caption({ year, month, day }),
      width: 1440,
      height: 1671,
      thumb: `/thumbs/${year}/${date}.webp`,
      full: `/full/${year}/${date}.jpg`,
    };
  });
}

// Random lists draw their dates from one or two years, so most years have more
// drawings than load right away, like a real year of up to 31.
const yearArb = fc.integer({ min: 2000, max: 2030 });
const dateIn = (years) =>
  fc
    .tuple(fc.constantFrom(...years), fc.integer({ min: 0, max: 364 }))
    .map(([y, day]) => new Date(Date.UTC(y, 0, 1 + day)).toISOString().slice(0, 10));
const listArb = fc
  .uniqueArray(yearArb, { minLength: 1, maxLength: 2 })
  .chain((years) => fc.uniqueArray(dateIn(years), { minLength: 1, maxLength: 60 }))
  .map(listFrom);
// A full October: 31 drawings in one year.
const october = listFrom(Array.from({ length: 31 }, (_, i) => `2025-10-${String(i + 1).padStart(2, '0')}`));

// Pieces of a page, read with patterns that match the markup the build writes.
// The grid is the one shown; other years' drawings wait in <template>s (#17).
const menuYears = (html) => [...html.matchAll(/<a href="\/(\d{4})\/"/g)].map((m) => Number(m[1]));
const currentYears = (html) => [...html.matchAll(/<a href="\/(\d{4})\/" aria-current="page"/g)].map((m) => Number(m[1]));
const gridOf = (html) => html.match(/<ul class="grid">([\s\S]*?)<\/ul>/)[1];
const tileDates = (html) => [...gridOf(html).matchAll(/<img src="\/thumbs\/\d{4}\/(\d{4}-\d{2}-\d{2})\.webp"/g)].map((m) => m[1]);
const imgs = (html) => [...gridOf(html).matchAll(/<img [^>]*>/g)].map((m) => m[0]);
const templates = (html) =>
  [...html.matchAll(/<template data-year="(\d{4})" data-count="([^"]*)">([\s\S]*?)<\/template>/g)].map((m) => ({ year: Number(m[1]), count: m[2], tiles: m[3] }));
const countOf = (html) => html.match(/<h2 class="count"[^>]*>([^<]*)<\/h2>/)[1];

describe('renderPage', () => {
  it('lists every year once, newest first, with only the shown year current', () => {
    fc.assert(
      fc.property(listArb, (list) => {
        const years = [...new Set(list.map((d) => d.year))].sort((a, b) => b - a);
        for (const year of years) {
          const html = renderPage({ year, list });
          expect(menuYears(html)).toEqual(years);
          expect(currentYears(html)).toEqual([year]);
        }
      }),
    );
  });

  it('shows exactly the year\'s drawings, in date order, each with its label and its full date for screen readers', () => {
    fc.assert(
      fc.property(listArb, (list) => {
        for (const year of new Set(list.map((d) => d.year))) {
          const html = renderPage({ year, list });
          const mine = list.filter((d) => d.year === year);
          expect(tileDates(html)).toEqual(mine.map((d) => d.date));
          for (const d of mine) {
            expect(html).toContain(`alt="${d.caption}"`);
            expect(html).toContain(`>${d.label}<`);
          }
          const n = mine.length;
          expect(countOf(html)).toBe(`${year} · ${n} ${n === 1 ? 'drawing' : 'drawings'}`);
        }
      }),
    );
  });

  it('loads the first thumbnails right away and the rest only when scrolled near', () => {
    const check = (list) => {
      for (const year of new Set(list.map((d) => d.year))) {
        const tags = imgs(renderPage({ year, list }));
        tags.forEach((tag, i) => {
          if (i < EAGER_THUMBS) expect(tag).not.toContain('loading="lazy"');
          else expect(tag).toContain('loading="lazy"');
          if (i === 0) expect(tag).toContain('fetchpriority="high"');
          else expect(tag).not.toContain('fetchpriority');
        });
      }
    };
    fc.assert(fc.property(listArb, check));
    check(october);
  });

  it('a full year of 31: exactly 4 load right away and 27 wait', () => {
    const tags = imgs(renderPage({ year: 2025, list: october }));
    expect(EAGER_THUMBS).toBe(4);
    expect(tags).toHaveLength(31);
    expect(tags.filter((t) => t.includes('loading="lazy"'))).toHaveLength(27);
  });

  it('the browser tab is titled "Sketch Gallery" on the home page and "2025 · Sketch Gallery" on a year page', () => {
    fc.assert(
      fc.property(listArb, (list) => {
        const years = [...new Set(list.map((d) => d.year))].sort((a, b) => b - a);
        for (const year of years) {
          expect(renderPage({ year, list })).toContain(`<title>${year} · Sketch Gallery</title>`);
        }
        const home = renderPage({ year: years[0], list, home: true });
        expect(home).toContain('<title>Sketch Gallery</title>');
        expect(home.match(/<title>/g)).toHaveLength(1);
      }),
    );
  });

  it('writes each thumbnail\'s width and height, so the grid doesn\'t jump as they load', () => {
    const list = listFrom(['2025-10-07']);
    list[0].width = 1200;
    list[0].height = 1500;
    const [tag] = imgs(renderPage({ year: 2025, list }));
    expect(tag).toContain('width="400"');
    expect(tag).toContain('height="500"');
  });

  // Switching years in place (#17): each page holds every other year's tiles, so the
  // menu can change the grid without loading a page or downloading anything else.
  it('holds every other year\'s tiles, exactly as that year\'s own page shows them, with its count', () => {
    fc.assert(
      fc.property(listArb, fc.boolean(), (list, home) => {
        const years = [...new Set(list.map((d) => d.year))].sort((a, b) => b - a);
        for (const year of home ? [years[0]] : years) {
          const html = renderPage({ year, list, home });
          const held = templates(html);
          expect(held.map((t) => t.year)).toEqual(years.filter((y) => y !== year));
          for (const t of held) {
            const own = renderPage({ year: t.year, list });
            // A held tile has no address a browser would fetch (Firefox fetches <img src>
            // inside a <template>): its thumbnail is in data-src until the year is picked.
            expect(t.tiles).not.toMatch(/\ssrc=/);
            expect(t.tiles.replaceAll('<img data-src="', '<img src="')).toBe(gridOf(own));
            expect(t.count).toBe(countOf(own));
          }
        }
      }),
    );
  });

  it('a page with one year holds no other year', () => {
    expect(templates(renderPage({ year: 2025, list: october }))).toEqual([]);
  });

  it('the count is read out by screen readers when the year changes in place', () => {
    const html = renderPage({ year: 2025, list: october });
    expect(html).toContain('<h2 class="count" aria-live="polite">2025 · 31 drawings</h2>');
  });

  it('loads the page code from the site itself, after the page is read, and works without it', () => {
    const html = renderPage({ year: 2025, list: october });
    expect(html.match(/<script[^>]*>/g)).toEqual(['<script src="/site.js" defer>']);
    // No code written into the page itself, so the browser rules of issue 9 can allow only the site's own files.
    expect(html).not.toMatch(/<script>|<script [^>]*>[^<]/);
    expect(html).not.toMatch(/ on[a-z]+="/);
    // With JavaScript off, every year is still a plain link to its own page.
    expect(menuYears(html)).toEqual([2025]);
  });

  it('stays light even when the device is set to dark', () => {
    const html = renderPage({ year: 2025, list: listFrom(['2025-10-07']) });
    expect(html).toContain('<meta name="color-scheme" content="light">');
    expect(html).not.toContain('prefers-color-scheme');
  });
});

describe('writeSite', () => {
  it('writes one page per year, and a home page that shows the newest year', async () => {
    const to = tmp('site');
    const list = await buildDrawings({ from: fixtures, to });
    writeSite({ list, to });
    const years = [...new Set(list.map((d) => d.year))].sort((a, b) => b - a);
    for (const year of years) {
      expect(readFileSync(join(to, String(year), 'index.html'), 'utf8')).toBe(renderPage({ year, list }));
    }
    expect(readFileSync(join(to, 'index.html'), 'utf8')).toBe(renderPage({ year: years[0], list, home: true }));
  });

  it('a year removed since the last build leaves no page behind; thumbnails, full-size copies and fonts stay', () => {
    const to = tmp('site');
    for (const dir of ['thumbs/2024', 'full/2024', 'fonts']) {
      mkdirSync(join(to, dir), { recursive: true });
      writeFileSync(join(to, dir, 'keep'), '');
    }
    writeSite({ list: listFrom(['2024-10-01', '2025-10-01']), to });
    expect(existsSync(join(to, '2024', 'index.html'))).toBe(true);
    writeSite({ list: listFrom(['2025-10-01']), to });
    expect(existsSync(join(to, '2024'))).toBe(false);
    expect(existsSync(join(to, '2025', 'index.html'))).toBe(true);
    expect(existsSync(join(to, 'thumbs', '2024', 'keep'))).toBe(true);
    expect(existsSync(join(to, 'full', '2024', 'keep'))).toBe(true);
    expect(existsSync(join(to, 'fonts', 'keep'))).toBe(true);
  });

  it('puts the fonts on the site itself, and every font the page asks for is there', async () => {
    const to = tmp('site');
    const list = await buildDrawings({ from: fixtures, to });
    writeSite({ list, to });
    const html = readFileSync(join(to, 'index.html'), 'utf8');
    const urls = [...html.matchAll(/url\((\/fonts\/[^)]+)\)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThanOrEqual(2);
    for (const url of urls) expect(existsSync(join(to, url))).toBe(true);
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });

  it('puts the page code on the site, the same file as build/site.js', () => {
    const to = tmp('site');
    writeSite({ list: listFrom(['2024-10-01', '2025-10-01']), to });
    expect(readFileSync(join(to, 'site.js'), 'utf8')).toBe(readFileSync(join(root, 'build', 'site.js'), 'utf8'));
  });

  it('R12 (add one drawing): a new year appears in every page\'s menu', async () => {
    const from = tmp('new-year');
    for (const year of readdirSync(fixtures)) {
      mkdirSync(join(from, year));
      for (const f of readdirSync(join(fixtures, year))) copyFileSync(join(fixtures, year, f), join(from, year, f));
    }
    mkdirSync(join(from, '2030'));
    copyFileSync(join(fixtures, '2025', '2025-10-07.jpg'), join(from, '2030', '2030-01-15.jpg'));
    const to = tmp('site');
    const list = await buildDrawings({ from, to });
    writeSite({ list, to });
    const home = readFileSync(join(to, 'index.html'), 'utf8');
    expect(menuYears(home)[0]).toBe(2030);
    expect(currentYears(home)).toEqual([2030]);
    expect(tileDates(home)).toEqual(['2030-01-15']);
    for (const year of readdirSync(fixtures)) {
      expect(menuYears(readFileSync(join(to, year, 'index.html'), 'utf8'))).toContain(2030);
    }
  });

  // writeSite on its own; the build stops before it with no drawings (#30).
  it('with no drawings, writes only a home page that says so, into a folder that may not exist yet', () => {
    const to = join(tmp('empty'), 'dist');
    writeSite({ list: [], to });
    const home = readFileSync(join(to, 'index.html'), 'utf8');
    expect(home).toContain('<title>Sketch Gallery</title>');
    expect(home).toContain('<h1>Sketch Gallery</h1>');
    expect(home).toContain('No drawings yet.');
    expect(home).not.toContain('undefined');
    expect(menuYears(home)).toEqual([]);
    expect(tileDates(home)).toEqual([]);
    expect(readdirSync(to).filter((n) => /^\d{4}$/.test(n))).toEqual([]);
  });

  it('a page never says "undefined", whatever the list', () => {
    fc.assert(
      fc.property(listArb, (list) => {
        for (const year of new Set(list.map((d) => d.year))) expect(renderPage({ year, list })).not.toContain('undefined');
      }),
    );
  });
});
