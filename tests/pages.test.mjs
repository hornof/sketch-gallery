// Year pages (#16): the build turns the list of drawings into one page per year
// plus a home page showing the newest year. These tests read the HTML the build
// writes; the browser tests in tests/browser/ check how it looks and behaves.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildDrawings } from '../build/drawings.mjs';
import { EAGER_THUMBS, renderPage, writeSite } from '../build/pages.mjs';
import { caption, label } from '../build/dates.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = join(root, 'tests', 'fixtures', 'drawings');

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

const dateArb = fc
  .date({ min: new Date('2000-01-01T00:00:00Z'), max: new Date('2030-12-31T00:00:00Z'), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10));
const listArb = fc.uniqueArray(dateArb, { minLength: 1, maxLength: 60 }).map(listFrom);

// Pieces of a page, read with patterns that match the markup the build writes.
const menuYears = (html) => [...html.matchAll(/<a href="\/(\d{4})\/"/g)].map((m) => Number(m[1]));
const currentYears = (html) => [...html.matchAll(/<a href="\/(\d{4})\/" aria-current="page"/g)].map((m) => Number(m[1]));
const tileDates = (html) => [...html.matchAll(/<img src="\/thumbs\/\d{4}\/(\d{4}-\d{2}-\d{2})\.webp"/g)].map((m) => m[1]);
const imgs = (html) => [...html.matchAll(/<img [^>]*>/g)].map((m) => m[0]);

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
          expect(html).toContain(`${year} · ${n} ${n === 1 ? 'drawing' : 'drawings'}`);
        }
      }),
    );
  });

  it('loads the first thumbnails right away and the rest only when scrolled near', () => {
    fc.assert(
      fc.property(listArb, (list) => {
        const year = list[0].year;
        const tags = imgs(renderPage({ year, list }));
        tags.forEach((tag, i) => {
          if (i < EAGER_THUMBS) expect(tag).not.toContain('loading="lazy"');
          else expect(tag).toContain('loading="lazy"');
        });
        expect(tags[0]).toContain('fetchpriority="high"');
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

  it('stays light even when the device is set to dark', () => {
    const html = renderPage({ year: 2025, list: listFrom(['2025-10-07']) });
    expect(html).toContain('<meta name="color-scheme" content="light">');
    expect(html).not.toContain('prefers-color-scheme');
  });
});

describe('writeSite', () => {
  it('writes one page per year, and a home page that shows the newest year', async () => {
    const to = mkdtempSync(join(tmpdir(), 'sketch-gallery-site-'));
    const list = await buildDrawings({ from: fixtures, to });
    writeSite({ list, to });
    const years = [...new Set(list.map((d) => d.year))].sort((a, b) => b - a);
    for (const year of years) {
      expect(readFileSync(join(to, String(year), 'index.html'), 'utf8')).toBe(renderPage({ year, list }));
    }
    expect(readFileSync(join(to, 'index.html'), 'utf8')).toBe(renderPage({ year: years[0], list }));
  });

  it('puts the fonts on the site itself, and every font the page asks for is there', async () => {
    const to = mkdtempSync(join(tmpdir(), 'sketch-gallery-site-'));
    const list = await buildDrawings({ from: fixtures, to });
    writeSite({ list, to });
    const html = readFileSync(join(to, 'index.html'), 'utf8');
    const urls = [...html.matchAll(/url\((\/fonts\/[^)]+)\)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThanOrEqual(2);
    for (const url of urls) expect(existsSync(join(to, url))).toBe(true);
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });

  it('R12 (add one drawing): a new year appears in every page\'s menu', async () => {
    const from = mkdtempSync(join(tmpdir(), 'sketch-gallery-new-year-'));
    for (const year of readdirSync(fixtures)) {
      mkdirSync(join(from, year));
      for (const f of readdirSync(join(fixtures, year))) copyFileSync(join(fixtures, year, f), join(from, year, f));
    }
    mkdirSync(join(from, '2030'));
    copyFileSync(join(fixtures, '2025', '2025-10-07.jpg'), join(from, '2030', '2030-01-15.jpg'));
    const to = mkdtempSync(join(tmpdir(), 'sketch-gallery-site-'));
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
});
