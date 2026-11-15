// Year pages and grid (#16, TDD section 12 item 5). Rows of the TDD's section 11
// test plan: R1 (one page), R2 (year menu: its look), R4 (grid), R9 (phone, tablet
// and desktop), R10 (fast: loading), accessibility, always light, no login.
// Every expected drawing comes from the drawings folder (source.mjs), not the build.
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { drawingsByYear, fullDate, monthDay } from './source.mjs';
import { EAGER_THUMBS } from '../../build/pages.mjs';

const byYear = drawingsByYear();
const years = [...byYear.keys()].sort((a, b) => b - a);
const newest = years[0];
// The year with the most drawings: with the real drawings, a full October of 31.
const biggest = years.reduce((a, b) => (byYear.get(b).length > byYear.get(a).length ? b : a));
// Every page: the home page shows the newest year.
const pages = [{ path: '/', year: newest }, ...years.map((year) => ({ path: `/${year}/`, year }))];

const menuLinks = (page) => page.getByRole('navigation', { name: 'Years' }).getByRole('link');
const tiles = (page) => page.locator('.grid > li');

// Scrolls down the grid one screen at a time, as a visitor would, so each lazy thumbnail comes near the screen.
async function scrollThrough(page) {
  const { total, step } = await page.evaluate(() => ({ total: document.documentElement.scrollHeight, step: window.innerHeight }));
  for (let y = 0; y <= total; y += step) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(100);
  }
}

// The date each tile shows, read from its thumbnail's file name.
async function tileDates(page) {
  const srcs = await tiles(page).locator('img').evaluateAll((imgs) => imgs.map((i) => i.getAttribute('src')));
  return srcs.map((s) => s.match(/(\d{4}-\d{2}-\d{2})\.webp$/)?.[1]);
}

test.describe('R1 (one page)', () => {
  test('the title and description are there', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sketch Gallery');
    await expect(page.getByText('This gallery displays drawings made over several years.')).toBeVisible();
    await expect(page).toHaveTitle('Sketch Gallery');
  });

  test('each year page\'s browser tab names its year, like "2025 · Sketch Gallery"', async ({ page }) => {
    for (const year of years) {
      await page.goto(`/${year}/`);
      await expect(page).toHaveTitle(`${year} · Sketch Gallery`);
    }
  });

  test('the page names no person: every word on it is from the site text, a month or a number', async ({ page }) => {
    const allowed = new Set(
      'sketch gallery this displays drawings drawing made over several years january february march april may june july august september october november december'.split(' '),
    );
    for (const { path } of pages) {
      await page.goto(path);
      const words = (await page.locator('body').innerText()).toLowerCase().match(/[a-z]+/g) ?? [];
      expect(words.filter((w) => !allowed.has(w)), path).toEqual([]);
    }
  });
});

test.describe('R2 (year menu: its look)', () => {
  test('lists every year newest first, each linking to its own page, with only the shown year current', async ({ page }) => {
    for (const { path, year } of pages) {
      await page.goto(path);
      const links = menuLinks(page);
      await expect(links).toHaveText(years.map(String));
      for (const [i, y] of years.entries()) {
        await expect(links.nth(i)).toHaveAttribute('href', `/${y}/`);
      }
      const current = page.locator('nav[aria-label="Years"] [aria-current="page"]');
      await expect(current).toHaveCount(1);
      await expect(current).toHaveText(String(year));
    }
  });

  test('the shown year is underlined with a thick line; the others are not underlined', async ({ page }) => {
    await page.goto('/');
    const looks = await menuLinks(page).evaluateAll((links) =>
      links.map((a) => {
        const s = getComputedStyle(a);
        return { current: a.getAttribute('aria-current') === 'page', line: s.textDecorationLine, thickness: parseFloat(s.textDecorationThickness) };
      }),
    );
    for (const look of looks) {
      if (look.current) {
        expect(look.line).toContain('underline');
        expect(look.thickness).toBeGreaterThanOrEqual(2);
      } else {
        expect(look.line).not.toContain('underline');
      }
    }
  });

  test('the menu has a thin rule above and below it', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Years' });
    const rules = await nav.evaluate((n) => {
      const s = getComputedStyle(n);
      return [s.borderTopStyle, s.borderTopWidth, s.borderBottomStyle, s.borderBottomWidth];
    });
    expect(rules[0]).toBe('solid');
    expect(parseFloat(rules[1])).toBeGreaterThan(0);
    expect(parseFloat(rules[1])).toBeLessThanOrEqual(1);
    expect(rules[2]).toBe('solid');
    expect(parseFloat(rules[3])).toBeGreaterThan(0);
    expect(parseFloat(rules[3])).toBeLessThanOrEqual(1);
  });

  test('on a phone the years fill the menu\'s full width, on one line, in text at least 17 px (docs/mockups/3-phone-grid.png)', async ({ page }) => {
    test.skip(page.viewportSize().width >= 560, 'phone width only');
    await page.goto('/');
    const nav = await page.getByRole('navigation', { name: 'Years' }).evaluate((n) => n.getBoundingClientRect().toJSON());
    const links = await menuLinks(page).evaluateAll((as) => as.map((a) => ({ ...a.getBoundingClientRect().toJSON(), size: parseFloat(getComputedStyle(a).fontSize) })));
    expect(Math.abs(links[0].left - nav.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(links.at(-1).right - nav.right)).toBeLessThanOrEqual(1);
    expect(new Set(links.map((l) => Math.round(l.top))).size).toBe(1);
    // Slightly larger than the 16 px of the first version, like the mockup.
    for (const l of links) expect(l.size).toBeGreaterThanOrEqual(17);
  });
});

test.describe('R4 (grid)', () => {
  test('each page shows exactly the drawings in its year folder, in date order, labeled like "October 7"', async ({ page }) => {
    for (const { path, year } of pages) {
      await page.goto(path);
      const dates = byYear.get(year);
      expect(await tileDates(page), path).toEqual(dates);
      await expect(tiles(page).locator('.label')).toHaveText(dates.map(monthDay));
      const n = dates.length;
      await expect(page.locator('.count')).toHaveText(`${year} · ${n} ${n === 1 ? 'drawing' : 'drawings'}`);
    }
  });

  test('the grid has 2 columns on a phone, 3 or 4 on a tablet and 6 on a desktop', async ({ page }) => {
    await page.goto('/');
    const columns = await page.locator('.grid').evaluate((g) => getComputedStyle(g).gridTemplateColumns.split(' ').length);
    const width = page.viewportSize().width;
    const expected = { 375: [2], 768: [3, 4], 1440: [6] }[width];
    expect(expected).toContain(columns);
  });

  test('every tile is the same size', async ({ page }) => {
    for (const { path } of pages) {
      await page.goto(path);
      const boxes = await tiles(page).locator('a').evaluateAll((as) => as.map((a) => [Math.round(a.offsetWidth), Math.round(a.offsetHeight)]));
      expect(new Set(boxes.map(String)).size, path).toBe(1);
    }
  });

  test('each drawing sits inside its tile with a white margin of about 8 px, so no line touches the border', async ({ page }) => {
    await page.goto('/');
    const gaps = await tiles(page).locator('a').evaluateAll((as) =>
      as.map((a) => {
        const t = a.getBoundingClientRect();
        const i = a.querySelector('img').getBoundingClientRect();
        const border = parseFloat(getComputedStyle(a).borderTopWidth);
        return [i.left - t.left, t.right - i.right, i.top - t.top, t.bottom - i.bottom].map((g) => g - border);
      }),
    );
    for (const g of gaps.flat()) {
      expect(g).toBeGreaterThanOrEqual(7.5);
      expect(g).toBeLessThanOrEqual(10.5);
    }
  });
});

test.describe('R9 (phone, tablet and desktop)', () => {
  test('no sideways scrolling', async ({ page }) => {
    for (const { path } of pages) {
      await page.goto(path);
      const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      expect(scroll, path).toBeLessThanOrEqual(client);
    }
  });

  test('every link and button is at least 44 px each way', async ({ page }) => {
    await page.goto('/');
    const small = await page.locator('a, button').evaluateAll((els) =>
      els
        .map((el) => ({ text: el.textContent.trim() || el.getAttribute('href'), box: el.getBoundingClientRect() }))
        .filter(({ box }) => box.width < 44 || box.height < 44)
        .map(({ text, box }) => `${text}: ${Math.round(box.width)} × ${Math.round(box.height)}`),
    );
    expect(small).toEqual([]);
  });
});

test.describe('R10 (fast): loading the thumbnails', () => {
  test(`only the first ${EAGER_THUMBS} thumbnails on each page load right away; every later one waits until scrolled near`, async ({ page }) => {
    for (const { path } of pages) {
      await page.goto(path);
      const loading = await page.locator('.grid img').evaluateAll((imgs) => imgs.map((i) => i.getAttribute('loading')));
      expect(loading, path).toEqual(loading.map((_, i) => (i < EAGER_THUMBS ? null : 'lazy')));
    }
  });

  test('on Fast 4G, every thumbnail on the first screen of the biggest year shows within 2 seconds', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'only Chromium can slow its own network');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    // Chrome's "Fast 4G" setting, as Chrome DevTools and Puppeteer define it.
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 60 * 2.75,
      downloadThroughput: ((9 * 1000 * 1000) / 8) * 0.9,
      uploadThroughput: ((1.5 * 1000 * 1000) / 8) * 0.9,
    });
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.goto(`/${biggest}/`, { waitUntil: 'domcontentloaded' });
    // Milliseconds from the start of the page's request until the last thumbnail on the first screen has loaded.
    const done = await page.evaluate(async () => {
      const onScreen = [...document.querySelectorAll('.grid img')].filter((i) => i.getBoundingClientRect().top < window.innerHeight);
      const times = await Promise.all(
        onScreen.map(
          (img) =>
            new Promise((resolve) => {
              if (img.complete && img.naturalWidth > 0) resolve(performance.getEntriesByName(img.src)[0]?.responseEnd ?? performance.now());
              else img.addEventListener('load', () => resolve(performance.now()), { once: true });
            }),
        ),
      );
      return Math.max(...times);
    });
    expect(done).toBeLessThan(2000);
  });

  test('thumbnails on the screen load right away; ones well below the screen wait until scrolled near', async ({ page }) => {
    await page.goto(`/${biggest}/`, { waitUntil: 'load' });
    const state = () =>
      page.locator('.grid img').evaluateAll((imgs) => {
        const loaded = new Set(performance.getEntriesByType('resource').map((e) => new URL(e.name).pathname));
        return imgs.map((img) => ({ top: img.getBoundingClientRect().top, loaded: img.complete && img.naturalWidth > 0, asked: loaded.has(new URL(img.src).pathname) }));
      });
    const height = page.viewportSize().height;
    // WebKit starts on-screen lazy thumbnails just after the page's load event, so allow
    // up to 2 seconds, the time R10 (fast) gives for a year to be usable.
    await expect.poll(async () => (await state()).filter((i) => i.top < height).every((i) => i.loaded), { timeout: 2000 }).toBe(true);
    for (const img of await state()) {
      // Browsers start lazy loads up to 2,500 pixels early; well past that, nothing is fetched yet.
      if (img.top > height + 3000) expect(img.asked).toBe(false);
    }
    await scrollThrough(page);
    await expect.poll(async () => (await state()).every((i) => i.loaded)).toBe(true);
  });

  test('every thumbnail keeps the drawing\'s shape and has its size written in the page', async ({ page }) => {
    for (const { path } of pages) {
      await page.goto(path, { waitUntil: 'load' });
      await scrollThrough(page);
      await expect.poll(() => page.locator('.grid img').evaluateAll((imgs) => imgs.every((i) => i.complete && i.naturalWidth > 0))).toBe(true);
      const shapes = await page.locator('.grid img').evaluateAll((imgs) =>
        imgs.map((i) => ({ written: Number(i.getAttribute('width')) / Number(i.getAttribute('height')), real: i.naturalWidth / i.naturalHeight, fit: getComputedStyle(i).objectFit })),
      );
      for (const s of shapes) {
        expect(Math.abs(s.written - s.real) / s.real).toBeLessThan(0.02);
        expect(s.fit).toBe('contain');
      }
    }
  });
});

test.describe('Accessibility (PRD section 6)', () => {
  test('axe, an accessibility checker, finds no problems on any page', async ({ page }) => {
    for (const { path } of pages) {
      await page.goto(path);
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
      expect(violations.map((v) => `${v.id}: ${v.help}`), path).toEqual([]);
    }
  });

  test('every drawing has a description for screen readers: its full date', async ({ page }) => {
    for (const { path, year } of pages) {
      await page.goto(path);
      const alts = await page.locator('.grid img').evaluateAll((imgs) => imgs.map((i) => i.alt));
      expect(alts, path).toEqual(byYear.get(year).map(fullDate));
      // Each drawing's link is named by its date alone, so a screen reader doesn't say it twice.
      await expect(page.locator('.grid a')).toHaveText(byYear.get(year).map(() => ''));
    }
  });

  test('Tab moves through the years and then the drawings, each showing a visible ring', async ({ page, browserName }) => {
    await page.goto('/');
    const expected = [...years.map((y) => `/${y}/`), ...(await page.locator('.grid a').evaluateAll((as) => as.map((a) => a.getAttribute('href'))))];
    // Safari only tabs to links with Option-Tab unless the visitor turns on "Press Tab to highlight each item".
    const key = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    for (const href of expected) {
      await page.keyboard.press(key);
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        const s = getComputedStyle(el);
        return { href: el.getAttribute('href'), style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
      });
      expect(focused.href).toBe(href);
      expect(focused.style).not.toBe('none');
      expect(focused.width).toBeGreaterThanOrEqual(2);
    }
  });
});

test.describe('Always light (PRD section 6)', () => {
  test('with the device set to dark mode, the page looks the same as in light mode', async ({ browser }) => {
    const colors = async (colorScheme) => {
      const context = await browser.newContext({ colorScheme });
      const page = await context.newPage();
      await page.goto('http://localhost:4173/');
      const c = await page.evaluate(() =>
        ['body', 'h1', '.count', '.grid a', '.label'].map((sel) => {
          const s = getComputedStyle(document.querySelector(sel));
          return [sel, s.backgroundColor, s.color];
        }),
      );
      await context.close();
      return c;
    };
    expect(await colors('dark')).toEqual(await colors('light'));
  });
});

test.describe('Fonts and privacy', () => {
  test('the title is in Space Grotesk and the rest in Inter, both from this site; nothing is fetched from anywhere else', async ({ page }) => {
    const elsewhere = [];
    page.on('request', (r) => {
      if (new URL(r.url()).origin !== 'http://localhost:4173') elsewhere.push(r.url());
    });
    await page.goto('/', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const fonts = await page.evaluate(() => ({
      title: getComputedStyle(document.querySelector('h1')).fontFamily,
      body: getComputedStyle(document.querySelector('.count')).fontFamily,
      titleLoaded: document.fonts.check('700 1em "Space Grotesk"'),
      bodyLoaded: document.fonts.check('400 1em Inter'),
    }));
    expect(fonts.title.startsWith('"Space Grotesk"') || fonts.title.startsWith('Space Grotesk')).toBe(true);
    expect(fonts.body.startsWith('Inter') || fonts.body.startsWith('"Inter"')).toBe(true);
    expect(fonts.titleLoaded).toBe(true);
    expect(fonts.bodyLoaded).toBe(true);
    expect(elsewhere).toEqual([]);
  });
});

test.describe('Never shown to a visitor (PRD section 6)', () => {
  test('there is no login anywhere: no form, no text box, no sign-in words', async ({ page }) => {
    for (const { path } of pages) {
      await page.goto(path);
      await expect(page.locator('form, input, textarea, select')).toHaveCount(0);
      await expect(page.locator('body')).not.toContainText(/log ?in|sign ?in|password/i);
    }
  });
});
