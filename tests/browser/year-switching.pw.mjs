// Switching years in place (#17, TDD section 12 item 6). Rows of the TDD's section 11
// test plan: R2 (year menu: clicking a year) and R3 (links, for years).
// What each year shows comes from the drawings folder (source.mjs). What Back and
// Forward should show comes from a small model of the browser's history kept in this
// file, not from the site's code.
import { chromium, expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fc from 'fast-check';
import { drawingsByYear, monthDay } from './source.mjs';

const byYear = drawingsByYear();
const years = [...byYear.keys()].sort((a, b) => b - a);
const newest = years[0];
const oldest = years.at(-1);
// The year with the most drawings, so its page is the longest.
const biggest = years.reduce((a, b) => (byYear.get(b).length > byYear.get(a).length ? b : a));
// Years with no drawings: just before and after the drawings, any gap between them, and one long ago.
const emptyYears = [oldest - 1, newest + 1, 1999, ...Array.from({ length: newest - oldest }, (_, i) => oldest + i).filter((y) => !byYear.has(y))];

const menu = (page) => page.getByRole('navigation', { name: 'Years' });
const yearLink = (page, year) => menu(page).getByRole('link', { name: String(year), exact: true });
// The year an address shows: the home page shows the newest.
const yearAt = (path) => (path === '/' ? newest : Number(path.slice(1, 5)));
const titleAt = (path) => (path === '/' ? 'Sketch Gallery' : `${yearAt(path)} · Sketch Gallery`);

// The date each tile shows, read from its thumbnail's file name.
const tileDates = (page) =>
  page.locator('.grid > li img').evaluateAll((imgs) => imgs.map((i) => i.getAttribute('src').match(/(\d{4}-\d{2}-\d{2})\.webp$/)?.[1]));

// Marks the page, so a later check can tell no new page has loaded since.
const mark = (page) => page.evaluate(() => (window.samePage = true));
const isSamePage = (page) => page.evaluate(() => window.samePage === true);

// Checks the page shows the year for `path`, at that address: menu, count, grid and tab title.
async function expectShows(page, path) {
  const year = yearAt(path);
  const dates = byYear.get(year);
  await expect.poll(() => new URL(page.url()).pathname).toBe(path);
  expect(new URL(page.url()).hash).toBe('');
  const current = menu(page).locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText(String(year));
  await expect(page.locator('.count')).toHaveText(`${year} · ${dates.length} ${dates.length === 1 ? 'drawing' : 'drawings'}`);
  await expect.poll(() => tileDates(page)).toEqual(dates);
  await expect(page.locator('.grid > li .label')).toHaveText(dates.map(monthDay));
  await expect(page).toHaveTitle(titleAt(path));
}

// Every error the page's code throws fails the test.
let errors;
test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors).toEqual([]));

test.describe('R2 (year menu: clicking a year)', () => {
  test('clicking each year, down to the oldest and back up, shows exactly the drawings in its folder, without loading a new page or anything but thumbnails', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await mark(page);
    const fetched = [];
    page.on('request', (r) => fetched.push({ type: r.resourceType(), path: new URL(r.url()).pathname }));
    const order = [...years.slice(1), ...years.slice(0, -1).reverse()];
    for (const year of order) {
      await yearLink(page, year).click();
      await expectShows(page, `/${year}/`);
      expect(await isSamePage(page)).toBe(true);
    }
    // Browsers may ask for /favicon.ico on their own; the site has none.
    const other = fetched.filter((f) => !(f.type === 'image' && (f.path.startsWith('/thumbs/') || f.path === '/favicon.ico')));
    expect(other).toEqual([]);
  });

  test('opening a page fetches no thumbnail of another year', async ({ page }) => {
    for (const path of ['/', ...years.map((y) => `/${y}/`)]) {
      // A blank page first, so nothing the last page was still loading is counted.
      await page.goto('about:blank');
      const fetched = [];
      const onRequest = (r) => fetched.push(new URL(r.url()).pathname);
      page.on('request', onRequest);
      await page.goto(path, { waitUntil: 'load' });
      page.off('request', onRequest);
      const own = `/thumbs/${yearAt(path)}/`;
      expect(fetched.filter((p) => p.startsWith('/thumbs/') && !p.startsWith(own)), path).toEqual([]);
      // The shown year's own thumbnails do load.
      expect(fetched.some((p) => p.startsWith(own)), path).toBe(true);
    }
  });

  test('after a switch, the grid is the same as on that year\'s own page', async ({ page }) => {
    // Each year's grid as its own page has it, read by the same browser.
    const own = new Map();
    await page.goto('/');
    for (const year of years) {
      const html = await (await page.request.get(`/${year}/`)).text();
      own.set(year, await page.evaluate((h) => new DOMParser().parseFromString(h, 'text/html').querySelector('.grid').innerHTML, html));
    }
    for (const year of [...years.slice(1), newest]) {
      await yearLink(page, year).click();
      await expectShows(page, `/${year}/`);
      expect(await page.locator('.grid').evaluate((g) => g.innerHTML), String(year)).toBe(own.get(year));
    }
  });

  test('clicking the year already shown changes nothing and adds no step to the history', async ({ page }) => {
    await page.goto(`/${oldest}/`);
    await yearLink(page, newest).click();
    await expectShows(page, `/${newest}/`);
    await yearLink(page, newest).click();
    await expectShows(page, `/${newest}/`);
    await page.goBack();
    await expectShows(page, `/${oldest}/`);
  });

  test('clicking the year already shown, from the bottom of the page, brings the year menu to the top of the screen', async ({ page }) => {
    await page.goto(`/${biggest}/`);
    await mark(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const navTop = () => menu(page).evaluate((n) => n.getBoundingClientRect().top);
    expect(await navTop()).toBeLessThan(0);
    // With the keyboard, so nothing scrolls before the click.
    await yearLink(page, biggest).evaluate((a) => a.focus({ preventScroll: true }));
    await page.keyboard.press('Enter');
    await expect.poll(async () => Math.abs(await navTop())).toBeLessThanOrEqual(1);
    await expectShows(page, `/${biggest}/`);
    expect(await isSamePage(page)).toBe(true);
  });

  test('a switch from far down a long year scrolls back to the top of the grid; one from the top doesn\'t move the page', async ({ page }) => {
    const where = () =>
      page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Years"]').getBoundingClientRect();
        const grid = document.querySelector('.grid').getBoundingClientRect();
        const max = document.documentElement.scrollHeight - window.innerHeight;
        return { y: window.scrollY, max, navTop: nav.top, gridTop: grid.top, screen: window.innerHeight };
      });
    for (const year of years.filter((y) => y !== biggest)) {
      // From the top of the page: nothing moves.
      await page.goto(`/${biggest}/`);
      await yearLink(page, year).click();
      await expectShows(page, `/${year}/`);
      expect((await where()).y).toBe(0);

      // From the bottom of the biggest year, with the keyboard, so nothing scrolls before the switch.
      await page.goto(`/${biggest}/`);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const before = await where();
      expect(before.navTop).toBeLessThan(0);
      await yearLink(page, year).evaluate((a) => a.focus({ preventScroll: true }));
      await page.keyboard.press('Enter');
      await expectShows(page, `/${year}/`);
      const after = await where();
      // The menu at the top of the screen, unless the new year is too short to scroll that far.
      if (after.y < after.max) expect(Math.abs(after.navTop)).toBeLessThanOrEqual(1);
      else expect(after.navTop).toBeGreaterThanOrEqual(-1);
      expect(after.gridTop).toBeGreaterThanOrEqual(0);
      expect(after.gridTop).toBeLessThan(after.screen);
      // Never further down the page than before.
      expect(after.y).toBeLessThanOrEqual(before.y);
    }
  });

  test('Back and Forward from far down a year also land at the top of the grid', async ({ page }) => {
    const other = years.find((y) => y !== biggest);
    await page.goto(`/${other}/`);
    await yearLink(page, biggest).click();
    await expectShows(page, `/${biggest}/`);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.goBack();
    await expectShows(page, `/${other}/`);
    await expect.poll(() => page.locator('.grid').evaluate((g) => g.getBoundingClientRect().top >= 0 && g.getBoundingClientRect().top < window.innerHeight)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.goForward();
    await expectShows(page, `/${biggest}/`);
    const navTop = await menu(page).evaluate((n) => n.getBoundingClientRect().top);
    expect(Math.abs(navTop)).toBeLessThanOrEqual(1);
  });

  test('screen readers hear the new year and its count', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.count')).toHaveAttribute('aria-live', 'polite');
  });

  test('axe finds no problems after switching to each year', async ({ page }) => {
    await page.goto('/');
    for (const year of [...years.slice(1), newest]) {
      await yearLink(page, year).click();
      await expectShows(page, `/${year}/`);
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
      expect(violations.map((v) => `${v.id}: ${v.help}`), String(year)).toEqual([]);
    }
  });

  test('after a switch, Tab moves through the years and then the new year\'s drawings, from the year just picked', async ({ page, browserName }) => {
    const key = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    await page.goto('/');
    await yearLink(page, oldest).click();
    await expectShows(page, `/${oldest}/`);
    // Focus stays on the year just picked, the last in the menu; the next stop is the first of its drawings.
    const hrefs = await page.locator('.grid a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    for (const href of hrefs) {
      await page.keyboard.press(key);
      expect(await page.evaluate(() => document.activeElement.getAttribute('href'))).toBe(href);
    }
  });
});

test.describe('R3 (links, for years)', () => {
  test('each year link opens that year in a new tab, and leaves this one as it was', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright\'s WebKit doesn\'t open a new tab on Command-click; the next test pastes each address into a new tab instead');
    await page.goto('/');
    await mark(page);
    for (const year of years) {
      const opened = context.waitForEvent('page');
      await yearLink(page, year).click({ modifiers: ['ControlOrMeta'] });
      const tab = await opened;
      await tab.waitForLoadState();
      await expectShows(tab, `/${year}/`);
      await tab.close();
      await expectShows(page, '/');
      expect(await isSamePage(page)).toBe(true);
    }
  });

  test('Shift-click and Alt-click on each year are left to the browser: Shift opens a new window, and this page is unchanged', async ({ page, context, browserName }) => {
    await page.goto('/');
    await mark(page);
    // Records, after the page's code has seen each click, whether it took the click over.
    // An Alt-click's own default (a download, in some browsers) is then stopped.
    await page.evaluate(() => {
      window.takenOver = [];
      addEventListener('click', (e) => {
        window.takenOver.push(e.defaultPrevented);
        if (e.altKey) e.preventDefault();
      });
    });
    for (const year of years) {
      const opened = context.waitForEvent('page');
      await yearLink(page, year).click({ modifiers: ['Shift'] });
      const win = await opened;
      await win.waitForLoadState();
      await expectShows(win, `/${year}/`);
      await win.close();
      await yearLink(page, year).click({ modifiers: ['Alt'] });
      await expectShows(page, '/');
    }
    expect(await page.evaluate(() => window.takenOver)).toEqual(years.flatMap(() => [false, false]));
    expect(await isSamePage(page)).toBe(true);
  });

  test('the address after each switch, pasted into a new tab, opens that year', async ({ page, browser }) => {
    await page.goto('/');
    for (const year of [...years.slice(1), newest]) {
      await yearLink(page, year).click();
      await expectShows(page, `/${year}/`);
      // A new window, with nothing shared with this one, like a link opened by someone else.
      const fresh = await browser.newContext();
      const tab = await fresh.newPage();
      await tab.goto(page.url());
      await expectShows(tab, `/${year}/`);
      await fresh.close();
    }
  });

  test('Back steps through every year picked, back to the home page, and Forward steps through them again', async ({ page }) => {
    await page.goto('/');
    await mark(page);
    const picked = years.slice(1);
    for (const year of picked) {
      await yearLink(page, year).click();
      await expectShows(page, `/${year}/`);
    }
    const path = ['/', ...picked.map((y) => `/${y}/`)];
    for (let i = path.length - 2; i >= 0; i--) {
      await page.goBack();
      await expectShows(page, path[i]);
    }
    for (let i = 1; i < path.length; i++) {
      await page.goForward();
      await expectShows(page, path[i]);
    }
    expect(await isSamePage(page)).toBe(true);
  });

  test('random clicks, Backs and Forwards: the page always shows what the history model says', async ({ page }, testInfo) => {
    // Many runs in one browser and width, rather than a few in each, to reach unusual orders.
    test.skip(testInfo.project.name !== 'chromium-1440', 'Runs in Chromium at 1440 px only');
    const step = fc.oneof(
      fc.constantFrom(...years).map((year) => ({ kind: 'click', year })),
      fc.constant({ kind: 'back' }),
      fc.constant({ kind: 'forward' }),
    );
    await fc.assert(
      fc.asyncProperty(fc.array(step, { minLength: 1, maxLength: 10 }), async (steps) => {
        await page.goto('/');
        await mark(page);
        // The model: the addresses in this page's history, and which one is showing.
        let entries = ['/'];
        let at = 0;
        for (const s of steps) {
          if (s.kind === 'click') {
            await yearLink(page, s.year).click();
            if (s.year !== yearAt(entries[at])) {
              entries = [...entries.slice(0, at + 1), `/${s.year}/`];
              at += 1;
            }
          } else if (s.kind === 'back') {
            if (at === 0) continue; // Back from here would leave the site.
            await page.goBack();
            at -= 1;
          } else {
            if (at === entries.length - 1) continue;
            await page.goForward();
            at += 1;
          }
          await expectShows(page, entries[at]);
        }
        expect(await isSamePage(page)).toBe(true);
      }),
      { numRuns: 25 },
    );
  });

  test('an address for a year with no drawings shows the newest year under its own address', async ({ page }) => {
    for (const year of emptyYears) {
      await page.goto(`/${year}/`);
      await expectShows(page, `/${newest}/`);
    }
    // A #date part is dropped too, since that date can't be in the year shown (expectShows checks there's none).
    await page.goto(`/${emptyYears[0]}/#${emptyYears[0]}-10-01`);
    await expectShows(page, `/${newest}/`);
    // The address was replaced, not added: Back from the next year returns to the newest, not to the empty year.
    await page.goto(`/${emptyYears[0]}/`);
    await yearLink(page, oldest).click();
    await expectShows(page, `/${oldest}/`);
    await page.goBack();
    await expectShows(page, `/${newest}/`);
  });
});

test.describe('Back from another page, and reload', () => {
  // Where the page is scrolled, and a drawing fully on the screen there.
  const place = (page) =>
    page.evaluate(() => {
      const a = [...document.querySelectorAll('.grid a')].find((t) => {
        const r = t.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight;
      });
      return { y: window.scrollY, href: a.getAttribute('href') };
    });
  const scrollDown = (page) => page.evaluate(() => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - window.innerHeight) * 0.6)));

  // Scrolls down the year shown, goes to another page (a drawing's full-size file; a click
  // on the drawing opens the pop-up since #18), presses Back.
  async function openDrawingAndBack(page, path) {
    await scrollDown(page);
    const before = await place(page);
    expect(before.y).toBeGreaterThan(0);
    await page.goto(before.href);
    await expect.poll(() => new URL(page.url()).pathname).toBe(before.href);
    await page.goBack();
    await expectShows(page, path);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before.y);
  }

  test('scroll down, go to a drawing\'s full-size file, press Back: the same place in the grid', async ({ page }) => {
    await page.goto(`/${biggest}/`);
    await openDrawingAndBack(page, `/${biggest}/`);
  });

  test('after switching years: scroll down, go to a drawing\'s full-size file, press Back: the same year, at the same place', async ({ page }) => {
    await page.goto(`/${years.find((y) => y !== biggest)}/`);
    await yearLink(page, biggest).click();
    await expectShows(page, `/${biggest}/`);
    await openDrawingAndBack(page, `/${biggest}/`);
  });

  test('with the browser\'s memory of recent pages on: a page kept there and shown again on Back still lands at the top of the grid on Forward to a year', async ({ baseURL }, testInfo) => {
    // Playwright starts its browsers with that memory (the back/forward cache) off. Chromium
    // can be started with it on; Firefox and WebKit can't. Requests must not be routed
    // (page.route), since that turns it off again.
    test.skip(testInfo.project.name !== 'chromium-1440', 'Runs in Chromium at 1440 px only');
    const browser = await chromium.launch({ channel: 'chromium', ignoreDefaultArgs: ['--disable-back-forward-cache'], timeout: 30_000 });
    try {
      const page = await browser.newPage({ baseURL, viewport: { width: 1440, height: 900 } });
      page.on('pageerror', (e) => errors.push(e.message));
      // Records whether each page shown came from that memory.
      await page.addInitScript(() => addEventListener('pageshow', (e) => (window.fromMemory = e.persisted)));
      const start = years.find((y) => y !== biggest);
      await page.goto(`/${start}/`);
      await yearLink(page, biggest).click();
      await expectShows(page, `/${biggest}/`);
      await page.evaluate(() => window.scrollTo(0, 1000));
      expect(await page.evaluate(() => window.scrollY)).toBe(1000);
      await mark(page);

      // Another page: a drawing's full-size file (a click on the drawing opens the pop-up since #18).
      const href = await page.evaluate(() => {
        const a = [...document.querySelectorAll('.grid a')].find((t) => t.getBoundingClientRect().top >= 0);
        return a.getAttribute('href');
      });
      await page.goto(href);
      await expect.poll(() => new URL(page.url()).pathname).toBe(href);

      // Back: the same page, kept in memory, at the same place. A page shown again from
      // memory fires no 'load', so each step waits only until the address has changed.
      await page.goBack({ waitUntil: 'commit' });
      await expectShows(page, `/${biggest}/`);
      expect(await page.evaluate(() => window.fromMemory), 'The page wasn\'t kept in the browser\'s memory of recent pages, so this test proves nothing').toBe(true);
      expect(await isSamePage(page), 'The page was loaded afresh, not kept in memory').toBe(true);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1000);

      // Back to the first year, then Forward to the picked one: the year menu at the top of the screen.
      await page.goBack({ waitUntil: 'commit' });
      await expectShows(page, `/${start}/`);
      await page.goForward({ waitUntil: 'commit' });
      await expectShows(page, `/${biggest}/`);
      await expect.poll(() => menu(page).evaluate((n) => Math.abs(n.getBoundingClientRect().top))).toBeLessThanOrEqual(1);
      expect(await isSamePage(page)).toBe(true);
    } finally {
      await browser.close();
    }
  });

  test('a reload stays at the same place in the grid', async ({ page }) => {
    await page.goto(`/${biggest}/`);
    await scrollDown(page);
    const y = await page.evaluate(() => window.scrollY);
    expect(y).toBeGreaterThan(0);
    // WebKit notes where the page is a moment after a scroll, not at once; a reload straight
    // after a scroll loses the place there even with JavaScript off.
    await page.waitForTimeout(500);
    await page.reload();
    await expectShows(page, `/${biggest}/`);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(y);
  });
});

test.describe('With JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test('each year link loads that year\'s own page, Back returns, and only the shown year\'s drawings appear', async ({ page }) => {
    await page.goto('/');
    await expectShows(page, '/');
    for (const year of years.slice(1)) {
      await yearLink(page, year).click();
      await expectShows(page, `/${year}/`);
      await expect(page.locator('.grid > li')).toHaveCount(byYear.get(year).length);
    }
    await page.goBack();
    await expectShows(page, `/${years.at(-2)}/`);
  });
});
