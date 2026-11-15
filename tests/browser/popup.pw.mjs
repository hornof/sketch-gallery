// The pop-up (#18, TDD section 12 item 7). Rows of the TDD's section 11 test plan, as
// issue #18 copies them:
//   R5 (pop-up): Opens with a zoom from the thumbnail; each way of closing (X, Esc,
//     clicking the dark area, Back, swiping down) returns to the grid at the same place.
//   R7 (zoom on a phone): Double-tap at 375 px wide zooms to the drawing's full size.
//   R8 (motion): Every animation, including the slide on buttons and keys, finishes
//     within 350 ms; none play when the device asks for less motion. (This issue: opening
//     and closing the pop-up, and the double-tap zoom; the slide comes with #19.)
//   R10 (fast): the pop-up shows the full-size drawing.
//   Accessibility (PRD section 6): keyboard use in the pop-up, including Enter opening a
//     drawing.
// What each drawing should look like comes from the drawings folder (source.mjs, and its
// size read with sharp), and where the thumbnail is drawn is worked out here from the
// thumbnail the browser shows, not from the site's code.
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { join } from 'node:path';
import sharp from 'sharp';
import { drawingsByYear, fullDate, sourceFolder } from './source.mjs';

const byYear = drawingsByYear();
const years = [...byYear.keys()].sort((a, b) => b - a);
const newest = years[0];
const oldest = years.at(-1);
// The year with the most drawings, so its page is the longest.
const biggest = years.reduce((a, b) => (byYear.get(b).length > byYear.get(a).length ? b : a));

// R8 (motion): every animation finishes within this many milliseconds.
const MOTION_MS = 350;
// What a measured animation may run over MOTION_MS: the browser draws a frame about
// every 16 ms, and a busy test machine can drop a few.
const FRAME_SLACK_MS = 50;

const menu = (page) => page.getByRole('navigation', { name: 'Years' });
const yearLink = (page, year) => menu(page).getByRole('link', { name: String(year), exact: true });
const tileFor = (page, date) => page.locator(`.grid a[data-date="${date}"]`);
const popup = (page) => page.locator('.pswp');

// The drawing's size in pixels, upright, read from the file in the drawings folder.
async function sourceSize(date) {
  const m = await sharp(join(sourceFolder(), date.slice(0, 4), `${date}.jpg`)).metadata();
  return m.orientation >= 5 ? { width: m.height, height: m.width } : { width: m.width, height: m.height };
}

// Scrolls about 60% down the page and returns a drawing fully on the screen there, with
// its thumbnail loaded, and where the page is scrolled.
async function scrollToMiddle(page) {
  await page.evaluate(() => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - window.innerHeight) * 0.6)));
  const found = await page.evaluate(() => {
    const a = [...document.querySelectorAll('.grid a')].find((t) => {
      const r = t.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight;
    });
    return { y: window.scrollY, date: a.dataset.date };
  });
  await expect.poll(() => tileFor(page, found.date).locator('img').evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
  return found;
}

// Where the thumbnail's drawing is on the screen: the image box with the picture fitted
// inside it (the tile shows the whole drawing, so there may be white space at its sides).
const thumbRect = (page, date) =>
  tileFor(page, date)
    .locator('img')
    .evaluate((img) => {
      const r = img.getBoundingClientRect();
      const scale = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      return { x: r.left + (r.width - w) / 2, y: r.top + (r.height - h) / 2, w, h };
    });

// Code run in the page: the drawing shown in the pop-up, the one whose middle is on the
// screen (the pop-up keeps the drawings either side ready, off the screen).
const shownImage = `(() => {
  const imgs = [...document.querySelectorAll('.pswp img.pswp__img')].filter((i) => {
    const r = i.getBoundingClientRect();
    const mid = r.left + r.width / 2;
    return r.width > 0 && mid >= 0 && mid <= window.innerWidth;
  });
  return imgs.find((i) => !i.classList.contains('pswp__img--placeholder')) ?? imgs[0];
})()`;

const shownRect = (page) =>
  page.evaluate((code) => {
    const r = eval(code).getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, shownImage);

function expectSameRect(actual, expected, label) {
  for (const k of ['x', 'y', 'w', 'h']) expect(Math.abs(actual[k] - expected[k]), `${label}: ${k} ${actual[k]} vs ${expected[k]}`).toBeLessThanOrEqual(2);
}

// Starts watching the pop-up's animations, from before an action until it has been still
// for a while: holds them at their first frame (`at: 'start'`) or their last
// (`at: 'end'`) just long enough to measure the drawing, then lets them run on.
// Returns a promise of the drawing's place at that moment.
const holdAnimations = (page, at) =>
  page.evaluate(
    ({ at, code }) =>
      new Promise((resolve, reject) => {
        const t0 = performance.now();
        const step = () => {
          const anims = document.getAnimations().filter((a) => a.effect?.target?.closest?.('.pswp'));
          if (anims.length) {
            for (const a of anims) {
              a.pause();
              a.currentTime = at === 'start' ? 0 : a.effect.getComputedTiming().endTime;
            }
            const r = eval(code).getBoundingClientRect();
            for (const a of anims) a.play();
            resolve({ x: r.left, y: r.top, w: r.width, h: r.height });
          } else if (performance.now() - t0 > 5000) reject(new Error('No animation started'));
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    { at, code: shownImage },
  );

// Starts timing the pop-up's motion: every frame, notes whether anything about it on the
// screen changed (the dark background's opacity, the drawing's place and size, the pop-up
// appearing or going), and the length every animation the browser runs in it was given.
// endWatch waits until nothing has changed for 600 ms and reports.
const startWatch = (page) =>
  page.evaluate(() => {
    const look = () => {
      const p = document.querySelector('.pswp');
      if (!p) return 'none';
      const parts = [getComputedStyle(p.querySelector('.pswp__bg')).opacity];
      for (const el of p.querySelectorAll('.pswp__container, .pswp__zoom-wrap, img.pswp__img')) {
        const r = el.getBoundingClientRect();
        parts.push(getComputedStyle(el).transform, Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height));
      }
      return parts.join('|');
    };
    const w = { changes: [], lengths: [] };
    const seen = new Set();
    let last = look();
    window.motion = w;
    w.done = new Promise((resolve) => {
      const t0 = performance.now();
      let still = t0;
      const step = (t) => {
        const now = look();
        if (now !== last) {
          w.changes.push(t);
          last = now;
          still = t;
        }
        for (const a of document.getAnimations()) {
          if (!seen.has(a)) {
            seen.add(a);
            w.lengths.push(a.effect.getComputedTiming().endTime);
          }
        }
        if ((w.changes.length && t - still > 600) || t - t0 > 8000) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  });
const endWatch = (page) =>
  page.evaluate(async () => {
    await window.motion.done;
    const { changes, lengths } = window.motion;
    return { span: changes.length ? changes.at(-1) - changes[0] : 0, frames: changes.length, lengths };
  });

// Waits until the pop-up is open and still.
async function waitOpen(page) {
  await expect(popup(page)).toHaveClass(/pswp--open/);
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
  await expect.poll(() => page.evaluate((code) => !!eval(code), shownImage)).toBe(true);
}
const waitClosed = (page) => expect(popup(page)).toHaveCount(0);

// A point on the dark area around the drawing, clear of the drawing and the buttons.
const darkPoint = (page) =>
  page.evaluate(() => {
    for (let y = window.innerHeight - 6; y > 0; y -= 12) {
      for (let x = 6; x < window.innerWidth; x += 12) {
        const el = document.elementFromPoint(x, y);
        if (el && (el.classList.contains('pswp__item') || el.classList.contains('pswp__zoom-wrap'))) return { x, y };
      }
    }
    return null;
  });

// A swipe down from the middle of the screen: a real touch in Chromium, and elsewhere a
// mouse drag, which sends the pop-up the same pointer events with another pointer type.
async function swipeDown(page, browserName) {
  const { width, height } = page.viewportSize();
  const x = Math.round(width / 2);
  const y = Math.round(height / 2);
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + i * 30 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 300, { steps: 10 });
    await page.mouse.up();
  }
}

const closeWays = {
  X: (page) => page.getByRole('button', { name: 'Close' }).click(),
  Esc: (page) => page.keyboard.press('Escape'),
  'clicking the dark area': async (page) => {
    const p = await darkPoint(page);
    expect(p, 'no dark area found around the drawing').not.toBeNull();
    await page.mouse.click(p.x, p.y);
  },
  Back: (page) => page.goBack(),
  'swiping down': (page, browserName) => swipeDown(page, browserName),
};

// Every error the page's code throws fails the test.
let errors;
test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors).toEqual([]));

test.describe('R5 (pop-up)', () => {
  test('clicking a thumbnail opens the pop-up with a zoom from the thumbnail, over a dark background, without loading a new page', async ({ page }) => {
    await page.goto(`/${biggest}/`);
    const { date, y } = await scrollToMiddle(page);
    await page.evaluate(() => (window.samePage = true));
    const thumb = await thumbRect(page, date);
    const start = holdAnimations(page, 'start');
    await tileFor(page, date).click();
    // The first frame of the zoom: the drawing exactly where its thumbnail is.
    expectSameRect(await start, thumb, 'first frame');
    await waitOpen(page);
    // The last: much larger than the thumbnail, centered, and fully on the screen.
    const end = await shownRect(page);
    const { width, height } = page.viewportSize();
    expect(end.w).toBeGreaterThan(thumb.w * 1.5);
    expect(Math.abs(end.x + end.w / 2 - width / 2)).toBeLessThanOrEqual(2);
    expect(end.x).toBeGreaterThanOrEqual(-1);
    expect(end.y).toBeGreaterThanOrEqual(-1);
    expect(end.x + end.w).toBeLessThanOrEqual(width + 1);
    expect(end.y + end.h).toBeLessThanOrEqual(height + 1);
    // The background is near-black and covers the page.
    const bg = await page.locator('.pswp__bg').evaluate((b) => {
      const r = b.getBoundingClientRect();
      const s = getComputedStyle(b);
      return { color: s.backgroundColor, opacity: Number(s.opacity), w: r.width, h: r.height };
    });
    const [r, g, b] = bg.color.match(/\d+/g).map(Number);
    expect(Math.max(r, g, b)).toBeLessThanOrEqual(40);
    expect(bg.opacity).toBe(1);
    expect(bg.w).toBeGreaterThanOrEqual(width);
    expect(bg.h).toBeGreaterThanOrEqual(height);
    expect(await page.evaluate(() => window.samePage)).toBe(true);
    expect(new URL(page.url()).pathname).toBe(`/${biggest}/`);
    expect(await page.evaluate(() => window.scrollY)).toBe(y);
  });

  for (const [way, close] of Object.entries(closeWays)) {
    test(`closing by ${way} shrinks the drawing back to its thumbnail and returns to the grid at the same place`, async ({ page, browserName }) => {
      await page.goto(`/${biggest}/`);
      const { date, y } = await scrollToMiddle(page);
      await page.evaluate(() => (window.samePage = true));
      const before = { url: page.url(), length: await page.evaluate(() => history.length) };
      await tileFor(page, date).click();
      await waitOpen(page);
      // Opening adds one step to the browser's history (TDD section 5, Back and Forward).
      expect(await page.evaluate(() => history.length)).toBe(before.length + 1);
      const thumb = await thumbRect(page, date);
      const end = holdAnimations(page, 'end');
      await close(page, browserName);
      // The last frame of the closing zoom: the drawing back where its thumbnail is.
      expectSameRect(await end, thumb, 'last frame');
      await waitClosed(page);
      expect(page.url()).toBe(before.url);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(y);
      expect(await page.evaluate(() => window.samePage)).toBe(true);
      await expect(page.locator('.count')).toHaveText(new RegExp(`^${biggest} · `));
      // Closing went back a step: Forward opens the same drawing again, and Back closes it.
      await page.goForward();
      await waitOpen(page);
      expect(await page.evaluate((code) => eval(code).getAttribute('src'), shownImage)).toBe(`/full/${biggest}/${date}.jpg`);
      await page.goBack();
      await waitClosed(page);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(y);
      expect(await page.evaluate(() => window.samePage)).toBe(true);
    });
  }

  test('after picking a year: open a drawing, Back closes it, Back again returns to the year before; Forward twice opens it again', async ({ page }) => {
    const other = years.find((y) => y !== biggest);
    await page.goto(`/${other}/`);
    await page.evaluate(() => (window.samePage = true));
    await yearLink(page, biggest).click();
    await expect(page.locator('.count')).toHaveText(new RegExp(`^${biggest} · `));
    const date = byYear.get(biggest)[0];
    await tileFor(page, date).click();
    await waitOpen(page);
    await page.goBack();
    await waitClosed(page);
    expect(new URL(page.url()).pathname).toBe(`/${biggest}/`);
    await page.goBack();
    await expect(page.locator('.count')).toHaveText(new RegExp(`^${other} · `));
    expect(new URL(page.url()).pathname).toBe(`/${other}/`);
    await expect(popup(page)).toHaveCount(0);
    await page.goForward();
    await expect(page.locator('.count')).toHaveText(new RegExp(`^${biggest} · `));
    await expect(popup(page)).toHaveCount(0);
    await page.goForward();
    await waitOpen(page);
    expect(await page.evaluate((code) => eval(code).getAttribute('src'), shownImage)).toBe(`/full/${biggest}/${date}.jpg`);
    expect(await page.evaluate(() => window.samePage)).toBe(true);
  });

  test('moving to the next drawing adds no step: Back closes the pop-up', async ({ page }) => {
    await page.goto(`/${biggest}/`);
    const before = await page.evaluate(() => history.length);
    await tileFor(page, byYear.get(biggest)[0]).click();
    await waitOpen(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await waitOpen(page);
    expect(await page.evaluate(() => history.length)).toBe(before + 1);
    await page.goBack();
    await waitClosed(page);
    expect(new URL(page.url()).pathname).toBe(`/${biggest}/`);
  });

  test('a reload while the pop-up is open shows the same drawing in it', async ({ page }) => {
    await page.goto(`/${biggest}/`);
    const date = byYear.get(biggest)[2];
    await tileFor(page, date).click();
    await waitOpen(page);
    await page.reload();
    await waitOpen(page);
    expect(await page.evaluate((code) => eval(code).getAttribute('src'), shownImage)).toBe(`/full/${biggest}/${date}.jpg`);
    await page.keyboard.press('Escape');
    await waitClosed(page);
    expect(new URL(page.url()).pathname).toBe(`/${biggest}/`);
  });

  test('Ctrl- or Command-click on a drawing opens its full-size file in a new tab, and leaves this page as it was', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright\'s WebKit doesn\'t open a new tab on Command-click');
    await page.goto(`/${newest}/`);
    const date = byYear.get(newest)[0];
    const opened = context.waitForEvent('page');
    await tileFor(page, date).click({ modifiers: ['ControlOrMeta'] });
    const tab = await opened;
    await tab.waitForLoadState();
    expect(new URL(tab.url()).pathname).toBe(`/full/${newest}/${date}.jpg`);
    await tab.close();
    await expect(popup(page)).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(`/${newest}/`);
  });
});

test.describe('R7 (zoom on a phone)', () => {
  test.use({ hasTouch: true });

  test('double-tap at 375 px wide zooms to the drawing\'s full size, and double-tap again zooms back out', async ({ page }) => {
    test.skip(page.viewportSize().width !== 375, 'phone width only');
    await page.goto(`/${newest}/`);
    const date = byYear.get(newest)[0];
    await tileFor(page, date).tap();
    await waitOpen(page);
    await expect.poll(() => page.evaluate((code) => eval(code).complete && !eval(code).classList.contains('pswp__img--placeholder'), shownImage)).toBe(true);
    const fitted = await shownRect(page);
    const size = await sourceSize(date);
    expect(fitted.w).toBeLessThanOrEqual(375 + 1);
    const { width, height } = page.viewportSize();
    await page.touchscreen.tap(width / 2, height / 2);
    await page.touchscreen.tap(width / 2, height / 2);
    await expect.poll(async () => Math.round((await shownRect(page)).w)).toBe(size.width);
    await waitOpen(page);
    // One pixel of the drawing to one pixel of the page: every line at its full detail.
    const zoomed = await shownRect(page);
    expect(Math.abs(zoomed.w - size.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(zoomed.h - size.height)).toBeLessThanOrEqual(1);
    await page.touchscreen.tap(width / 2, height / 2);
    await page.touchscreen.tap(width / 2, height / 2);
    await expect.poll(async () => Math.round((await shownRect(page)).w)).toBe(Math.round(fitted.w));
    await waitOpen(page);
    expectSameRect(await shownRect(page), fitted, 'zoomed back out');
  });

  test('a tap on the dark area closes the pop-up on a phone', async ({ page }) => {
    test.skip(page.viewportSize().width !== 375, 'phone width only');
    await page.goto(`/${newest}/`);
    await tileFor(page, byYear.get(newest)[0]).tap();
    await waitOpen(page);
    const p = await darkPoint(page);
    expect(p).not.toBeNull();
    await page.touchscreen.tap(p.x, p.y);
    await waitClosed(page);
  });
});

test.describe('R8 (motion)', () => {
  test(`opening and closing the pop-up each finish within ${MOTION_MS} ms`, async ({ page }) => {
    await page.goto(`/${biggest}/`);
    const { date } = await scrollToMiddle(page);
    await startWatch(page);
    await tileFor(page, date).click();
    const open = await endWatch(page);
    expect(open.lengths.length, 'the pop-up should open with an animation').toBeGreaterThan(0);
    for (const ms of open.lengths) expect(ms).toBeLessThanOrEqual(MOTION_MS);
    expect(open.frames).toBeGreaterThan(3);
    expect(open.span).toBeLessThanOrEqual(MOTION_MS + FRAME_SLACK_MS);
    await waitOpen(page);
    await startWatch(page);
    await page.keyboard.press('Escape');
    const close = await endWatch(page);
    expect(close.lengths.length, 'the pop-up should close with an animation').toBeGreaterThan(0);
    for (const ms of close.lengths) expect(ms).toBeLessThanOrEqual(MOTION_MS);
    expect(close.frames).toBeGreaterThan(3);
    expect(close.span).toBeLessThanOrEqual(MOTION_MS + FRAME_SLACK_MS);
    await waitClosed(page);
  });

  test('when the device asks for less motion, the pop-up opens and closes with no animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/${biggest}/`);
    const { date, y } = await scrollToMiddle(page);
    await startWatch(page);
    await tileFor(page, date).click();
    const open = await endWatch(page);
    expect(open.lengths.filter((ms) => ms > 0)).toEqual([]);
    // It appears in one step: a frame or two, not a motion.
    expect(open.span).toBeLessThanOrEqual(2 * 17 + FRAME_SLACK_MS);
    await waitOpen(page);
    await startWatch(page);
    await page.keyboard.press('Escape');
    const close = await endWatch(page);
    expect(close.lengths.filter((ms) => ms > 0)).toEqual([]);
    expect(close.span).toBeLessThanOrEqual(2 * 17 + FRAME_SLACK_MS);
    await waitClosed(page);
    expect(await page.evaluate(() => window.scrollY)).toBe(y);
  });

  test.describe('on a phone', () => {
    test.use({ hasTouch: true });
    for (const reducedMotion of ['no-preference', 'reduce']) {
      test(`the double-tap zoom ${reducedMotion === 'reduce' ? 'has no animation when the device asks for less motion' : `finishes within ${MOTION_MS} ms`}`, async ({ page }) => {
        test.skip(page.viewportSize().width !== 375, 'phone width only');
        await page.emulateMedia({ reducedMotion });
        await page.goto(`/${newest}/`);
        await tileFor(page, byYear.get(newest)[0]).tap();
        await waitOpen(page);
        await expect.poll(() => page.evaluate((code) => eval(code).complete && !eval(code).classList.contains('pswp__img--placeholder'), shownImage)).toBe(true);
        const { width, height } = page.viewportSize();
        await startWatch(page);
        await page.touchscreen.tap(width / 2, height / 2);
        await page.touchscreen.tap(width / 2, height / 2);
        const zoom = await endWatch(page);
        if (reducedMotion === 'reduce') {
          expect(zoom.lengths.filter((ms) => ms > 0)).toEqual([]);
          expect(zoom.span).toBeLessThanOrEqual(2 * 17 + FRAME_SLACK_MS);
        } else {
          expect(zoom.lengths.length).toBeGreaterThan(0);
          for (const ms of zoom.lengths) expect(ms).toBeLessThanOrEqual(MOTION_MS);
          expect(zoom.frames).toBeGreaterThan(3);
          expect(zoom.span).toBeLessThanOrEqual(MOTION_MS + FRAME_SLACK_MS);
        }
      });
    }
  });
});

test.describe('R10 (fast): the pop-up shows the full-size drawing', () => {
  test('in every year, the first drawing\'s pop-up shows its full-size file, at the size of the file in the drawings folder', async ({ page }) => {
    for (const year of years) {
      await page.goto(`/${year}/`);
      const date = byYear.get(year)[0];
      await tileFor(page, date).click();
      await waitOpen(page);
      await expect.poll(() => page.evaluate((code) => eval(code).complete && !eval(code).classList.contains('pswp__img--placeholder'), shownImage), String(year)).toBe(true);
      const shown = await page.evaluate((code) => {
        const i = eval(code);
        return { src: i.getAttribute('src'), w: i.naturalWidth, h: i.naturalHeight };
      }, shownImage);
      const size = await sourceSize(date);
      expect(shown, String(year)).toEqual({ src: `/full/${year}/${date}.jpg`, w: size.width, h: size.height });
    }
  });
});

test.describe('Accessibility (PRD section 6) in the pop-up', () => {
  // Safari only tabs to links and buttons with Option-Tab unless the visitor turns on "Press Tab to highlight each item".
  const tabKey = (browserName) => (browserName === 'webkit' ? 'Alt+Tab' : 'Tab');

  test('Enter on a drawing opens it; Tab stays inside the pop-up, ringing each button; Esc closes it and the drawing has the focus again, at the same place', async ({ page, browserName }) => {
    await page.goto(`/${biggest}/`);
    const { date, y } = await scrollToMiddle(page);
    await tileFor(page, date).evaluate((a) => a.focus({ preventScroll: true }));
    await page.keyboard.press('Enter');
    await waitOpen(page);
    expect(await page.evaluate((code) => eval(code).getAttribute('src'), shownImage)).toBe(`/full/${biggest}/${date}.jpg`);
    expect(await page.evaluate(() => !!document.activeElement.closest('.pswp'))).toBe(true);
    const names = new Set();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press(tabKey(browserName));
      const f = await page.evaluate(() => {
        const el = document.activeElement;
        const s = getComputedStyle(el);
        return { inside: !!el.closest('.pswp'), tag: el.tagName, name: el.getAttribute('aria-label') ?? el.title, style: s.outlineStyle, width: parseFloat(s.outlineWidth), color: s.outlineColor };
      });
      expect(f.inside, `Tab ${i + 1} left the pop-up`).toBe(true);
      expect(f.tag).toBe('BUTTON');
      expect(f.style).not.toBe('none');
      expect(f.width).toBeGreaterThanOrEqual(2);
      // A light ring, which shows on the dark background.
      const [r, g, b] = f.color.match(/\d+/g).map(Number);
      expect(Math.min(r, g, b)).toBeGreaterThanOrEqual(200);
      names.add(f.name);
    }
    expect(names.has('Close')).toBe(true);
    await page.keyboard.press('Escape');
    await waitClosed(page);
    expect(await page.evaluate(() => document.activeElement.dataset.date)).toBe(date);
    expect(await page.evaluate(() => window.scrollY)).toBe(y);
    const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    expect(ring).not.toBe('none');
  });

  test('a drawing opened with Enter and moved on with the arrow keys gives the focus back to the drawing shown, without moving the page', async ({ page }) => {
    await page.goto(`/${biggest}/`);
    const dates = byYear.get(biggest);
    await tileFor(page, dates[0]).focus();
    const y = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('Enter');
    await waitOpen(page);
    await page.keyboard.press('ArrowRight');
    await waitOpen(page);
    await page.keyboard.press('Escape');
    await waitClosed(page);
    expect(await page.evaluate(() => document.activeElement.dataset.date)).toBe(dates[1]);
    expect(await page.evaluate(() => window.scrollY)).toBe(y);
  });

  test('the drawing in the pop-up is described by its full date, and the pop-up is a dialog', async ({ page }) => {
    await page.goto(`/${newest}/`);
    const date = byYear.get(newest)[1];
    await tileFor(page, date).click();
    await waitOpen(page);
    await expect(page.getByRole('dialog')).toHaveCount(1);
    expect(await page.evaluate((code) => eval(code).alt, shownImage)).toBe(fullDate(date));
  });

  test('every button in the pop-up is at least 44 px each way', async ({ page }) => {
    await page.goto(`/${newest}/`);
    await tileFor(page, byYear.get(newest)[1]).click();
    await waitOpen(page);
    const small = await page.locator('.pswp button').evaluateAll((els) =>
      els
        .filter((el) => getComputedStyle(el).display !== 'none')
        .map((el) => ({ name: el.title, box: el.getBoundingClientRect() }))
        .filter(({ box }) => box.width < 44 || box.height < 44)
        .map(({ name, box }) => `${name}: ${Math.round(box.width)} × ${Math.round(box.height)}`),
    );
    expect(small).toEqual([]);
  });

  test('axe finds no problems with the pop-up open', async ({ page }) => {
    await page.goto(`/${newest}/`);
    await tileFor(page, byYear.get(newest)[1]).click();
    await waitOpen(page);
    const { violations } = await new AxeBuilder({ page }).include('.pswp').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

test.describe('Loading the pop-up (R10, fast)', () => {
  test('opening a page fetches nothing for the pop-up; the first drawing opened fetches it from this site', async ({ page }) => {
    const fetched = [];
    page.on('request', (r) => fetched.push(new URL(r.url())));
    await page.goto(`/${oldest}/`, { waitUntil: 'load' });
    expect(fetched.filter((u) => u.pathname.startsWith('/popup/'))).toEqual([]);
    await tileFor(page, byYear.get(oldest)[0]).click();
    await waitOpen(page);
    expect(fetched.filter((u) => u.pathname.startsWith('/popup/')).map((u) => u.pathname).sort()).toEqual(['/popup/photoswipe.esm.min.js', '/popup/popup.css']);
    expect(fetched.filter((u) => u.origin !== 'http://localhost:4173')).toEqual([]);
  });
});

test.describe('With JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test('a click on a drawing loads its full-size file', async ({ page }) => {
    await page.goto(`/${newest}/`);
    const date = byYear.get(newest)[0];
    await tileFor(page, date).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/full/${newest}/${date}.jpg`);
  });
});
