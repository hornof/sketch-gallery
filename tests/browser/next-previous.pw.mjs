// Next, previous and drawing links (#19, TDD section 12 item 8). Rows of the TDD's
// section 11 test plan, as issue #19 copies them:
//   R6 (next and previous): Buttons, keys and swipes, forward and back, reach the right
//     drawing; buttons and keys slide; no arrows at the ends; a swipe past an end springs
//     back; counter "7 / 31" and caption "October 7, 2026".
//   R3 (links), for drawings: each drawing link opens correctly in a new tab; Back and
//     Forward move between open and closed drawings, in both directions; no two drawings
//     in a year share a link; a link to a date with no drawing opens the year.
//   R8 (motion): the slide on buttons, keys and swipes finishes within 350 ms; none plays
//     when the device asks for less motion.
//   Never shown to a visitor (PRD section 6): a bad drawing link opens its year instead
//     of an error page.
// Which drawing should be shown comes from the drawings folder (source.mjs): a year's
// drawings in date order, and their full dates from the browser's own date formatting.
import { expect, test } from '@playwright/test';
import { drawingsByYear, fullDate } from './source.mjs';
import { FRAME_SLACK_MS, MOTION_MS, endWatch, popup, shownDate, startWatch, swipe, tileFor, waitClosed, waitOpen } from './popup-helpers.mjs';

const byYear = drawingsByYear();
const years = [...byYear.keys()].sort((a, b) => b - a);
const newest = years[0];
// The year with the most drawings.
const biggest = years.reduce((a, b) => (byYear.get(b).length > byYear.get(a).length ? b : a));
const dates = byYear.get(biggest);

const button = (page, name) => page.locator('.pswp').getByRole('button', { name, exact: true });
const counter = (page) => page.locator('.pswp .pswp__counter');
const caption = (page) => page.locator('.pswp .pswp__caption');

// The drawing shown is `date`, the `i`-th of its year's `n`: the counter reads "i / n",
// the caption gives the full date, the address is the drawing's link, and the arrows
// show except at the ends.
async function expectShowing(page, date) {
  const year = Number(date.slice(0, 4));
  const list = byYear.get(year);
  const i = list.indexOf(date);
  await waitOpen(page);
  expect(await shownDate(page)).toBe(date);
  if (list.length > 1) await expect(counter(page)).toHaveText(`${i + 1} / ${list.length}`);
  await expect(caption(page)).toHaveText(fullDate(date));
  await expect(caption(page)).toBeVisible();
  const url = new URL(page.url());
  expect(url.pathname + url.hash).toMatch(new RegExp(`^/(${year}/)?#${date}$`));
  if (i > 0) await expect(button(page, 'Previous')).toBeVisible();
  else await expect(button(page, 'Previous')).toBeHidden();
  if (i < list.length - 1) await expect(button(page, 'Next')).toBeVisible();
  else await expect(button(page, 'Next')).toBeHidden();
}

// Starts noting, every frame for `ms`, where the row of drawings is: the pop-up slides
// from one drawing to the next by moving this row sideways. rowFrames gives back each
// frame's left offset, in pixels.
const startRow = (page, ms = 1500) =>
  page.evaluate((ms) => {
    window.rowDone = new Promise((resolve) => {
      const xs = [];
      const t0 = performance.now();
      const step = (t) => {
        const m = document.querySelector('.pswp .pswp__container')?.style.transform.match(/translate3d\((-?[\d.]+)px/);
        if (m) xs.push(Number(m[1]));
        if (t - t0 > ms) resolve(xs);
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }, ms);
const rowFrames = (page) => page.evaluate(() => window.rowDone);
// Frames strictly between where the row started and where it ended, at least 2 px from each.
function between(xs) {
  const [a, b] = [xs[0], xs.at(-1)];
  return xs.filter((x) => Math.min(Math.abs(x - a), Math.abs(x - b)) > 2 && x > Math.min(a, b) && x < Math.max(a, b));
}

async function openAt(page, date) {
  await page.goto(`/${date.slice(0, 4)}/`);
  await tileFor(page, date).click();
  await waitOpen(page);
}

// How far a swipe goes, as a share of the screen's width: more than half, so it moves on
// whatever the speed it ends with.
const SWIPE = 0.6;

// The ways to step: forward and back with the on-screen arrows, the keyboard and a swipe.
const stepWays = {
  'arrow buttons': { next: (page) => button(page, 'Next').click(), prev: (page) => button(page, 'Previous').click() },
  'arrow keys': { next: (page) => page.keyboard.press('ArrowRight'), prev: (page) => page.keyboard.press('ArrowLeft') },
  swipes: {
    next: (page, browserName) => swipe(page, browserName, { dx: -Math.round(page.viewportSize().width * SWIPE) }),
    prev: (page, browserName) => swipe(page, browserName, { dx: Math.round(page.viewportSize().width * SWIPE) }),
  },
};

// Every error the page's code throws fails the test.
let errors;
test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors).toEqual([]));

test.describe('R6 (next and previous)', () => {
  for (const [way, step] of Object.entries(stepWays)) {
    test(`${way}: forward to the year's last drawing and back to its first, each step landing on the right drawing, with its counter, caption and link`, async ({ page, browserName }) => {
      test.skip(way === 'swipes' && page.viewportSize().width !== 375, 'a whole year of swipes at phone width is enough');
      await openAt(page, dates[0]);
      const length = await page.evaluate(() => history.length);
      await expectShowing(page, dates[0]);
      for (let i = 1; i < dates.length; i++) {
        await step.next(page, browserName);
        await expectShowing(page, dates[i]);
      }
      for (let i = dates.length - 2; i >= 0; i--) {
        await step.prev(page, browserName);
        await expectShowing(page, dates[i]);
      }
      // Moving between drawings adds no step to the browser's history (TDD section 5).
      expect(await page.evaluate(() => history.length)).toBe(length);
    });
  }

  test('stops at the ends: no Previous arrow on the first drawing, no Next arrow on the last, and the arrow keys go no further', async ({ page }) => {
    await openAt(page, dates[0]);
    await page.keyboard.press('ArrowLeft');
    await expectShowing(page, dates[0]);
    await expect(button(page, 'Previous')).toBeHidden();
    for (let i = 1; i < dates.length; i++) await page.keyboard.press('ArrowRight');
    await expectShowing(page, dates.at(-1));
    await expect(button(page, 'Next')).toBeHidden();
    await page.keyboard.press('ArrowRight');
    await expectShowing(page, dates.at(-1));
  });

  for (const end of ['first', 'last']) {
    test(`a swipe past the ${end} drawing springs back to it`, async ({ page, browserName }) => {
      const date = end === 'first' ? dates[0] : dates.at(-1);
      await openAt(page, date);
      const rest = await page.locator('.pswp__container').evaluate((c) => c.style.transform);
      await startRow(page, 1200);
      const dx = Math.round(page.viewportSize().width * SWIPE) * (end === 'first' ? 1 : -1);
      await swipe(page, browserName, { dx });
      const xs = await rowFrames(page);
      // It moved with the finger, a little, then came back.
      const restX = Number(rest.match(/translate3d\((-?[\d.]+)px/)[1]);
      expect(Math.max(...xs.map((x) => Math.abs(x - restX)))).toBeGreaterThan(10);
      await waitOpen(page);
      expect(await page.locator('.pswp__container').evaluate((c) => c.style.transform)).toBe(rest);
      await expectShowing(page, date);
    });
  }

  for (const [way, step] of Object.entries(stepWays).filter(([w]) => w !== 'swipes')) {
    test(`${way} slide to the next drawing and back, not jump`, async ({ page }) => {
      await openAt(page, dates[0]);
      await startRow(page);
      await step.next(page);
      const forward = await rowFrames(page);
      expect(between(forward).length, `frames between: ${JSON.stringify(forward)}`).toBeGreaterThanOrEqual(3);
      await expectShowing(page, dates[1]);
      await startRow(page);
      await step.prev(page);
      const back = await rowFrames(page);
      expect(between(back).length, `frames between: ${JSON.stringify(back)}`).toBeGreaterThanOrEqual(3);
      await expectShowing(page, dates[0]);
    });
  }

  test('the counter is at the top left and the caption is under the drawing, centered, both light on the dark background', async ({ page }) => {
    await openAt(page, dates[1]);
    const { width, height } = page.viewportSize();
    const c = await counter(page).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, color: getComputedStyle(el).color };
    });
    expect(c.x).toBeLessThan(width / 4);
    expect(c.y).toBeLessThan(60);
    // Where the caption's words are, not its box, which may be as wide as the screen.
    const cap = await caption(page).evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, mid: r.left + r.width / 2, color: getComputedStyle(el).color };
    });
    const img = await page.evaluate(() => {
      const i = [...document.querySelectorAll('.pswp img.pswp__img')].find((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.left + r.width / 2 > 0 && r.left + r.width / 2 < window.innerWidth;
      });
      return i.getBoundingClientRect().bottom;
    });
    expect(cap.top).toBeGreaterThanOrEqual(img - 1);
    expect(cap.bottom).toBeLessThanOrEqual(height);
    expect(Math.abs(cap.mid - width / 2)).toBeLessThanOrEqual(2);
    for (const color of [c.color, cap.color]) {
      const [r, g, b] = color.match(/\d+/g).map(Number);
      expect(Math.min(r, g, b)).toBeGreaterThanOrEqual(200);
    }
  });

  // The arrow's round dark circle and its edge, as computed by the browser.
  const arrowLook = (page, name) =>
    button(page, name).evaluate((b) => {
      const s = getComputedStyle(b);
      return { background: s.backgroundColor, border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`, radius: s.borderTopLeftRadius };
    });
  function expectRound(look, label) {
    const alpha = Number(look.background.match(/rgba?\(([^)]*)\)/)[1].split(',')[3] ?? 1);
    expect(alpha, `${label}: background ${look.background}`).toBeGreaterThan(0.5);
    expect(look.border, label).toMatch(/^1px solid /);
    expect(look.radius, label).toBe('50%');
  }

  test('the round arrows keep their dark circle and edge while the mouse is over one and while one has the focus', async ({ page }) => {
    await openAt(page, dates[1]);
    const before = await arrowLook(page, 'Next');
    expectRound(before, 'before');
    await button(page, 'Next').hover();
    expect(await arrowLook(page, 'Next')).toEqual(before);
    await page.mouse.move(1, 1);
    await button(page, 'Previous').focus();
    expect(await arrowLook(page, 'Previous')).toEqual(before);
  });

  test.describe('on a phone', () => {
    test.use({ hasTouch: true });
    test('after a tap on an arrow, both arrows keep their dark circle and edge', async ({ page }) => {
      test.skip(page.viewportSize().width !== 375, 'phone width only');
      await page.goto(`/${biggest}/`);
      await tileFor(page, dates[1]).tap();
      await waitOpen(page);
      const before = await arrowLook(page, 'Next');
      expectRound(before, 'before');
      await button(page, 'Next').tap();
      await expectShowing(page, dates[2]);
      expect(await arrowLook(page, 'Next')).toEqual(before);
      expect(await arrowLook(page, 'Previous')).toEqual(before);
    });
  });

  test('in a year of 31 drawings, the seventh reads "7 / 31" and "October 7, 2026"', async ({ page }) => {
    test.skip(!byYear.get(2026)?.includes('2026-10-07') || byYear.get(2026).length !== 31, 'needs the 31 drawings of October 2026');
    await openAt(page, '2026-10-07');
    await expect(counter(page)).toHaveText('7 / 31');
    await expect(caption(page)).toHaveText('October 7, 2026');
  });
});

test.describe('R8 (motion): the slide', () => {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    for (const [way, step] of Object.entries(stepWays)) {
      test(`${way}: the slide ${reducedMotion === 'reduce' ? 'doesn\'t play when the device asks for less motion' : `finishes within ${MOTION_MS} ms`}`, async ({ page, browserName }) => {
        await page.emulateMedia({ reducedMotion });
        await openAt(page, dates[0]);
        for (const [dir, to] of [['next', dates[1]], ['prev', dates[0]]]) {
          if (way === 'swipes') {
            // A swipe moves the row with the finger, then the release finishes the slide: time from the release.
            await step[dir](page, browserName);
            await startWatch(page);
          } else {
            await startWatch(page);
            await step[dir](page, browserName);
          }
          const slide = await endWatch(page);
          if (reducedMotion === 'reduce') {
            // It moves in one step: a frame or two, not a motion.
            expect(slide.span, dir).toBeLessThanOrEqual(2 * 17 + FRAME_SLACK_MS);
          } else {
            expect(slide.moved, dir).toBeGreaterThan(0);
            if (way !== 'swipes') expect(slide.span, dir).toBeGreaterThan(100);
            expect(slide.span, dir).toBeLessThanOrEqual(MOTION_MS + FRAME_SLACK_MS);
          }
          await expectShowing(page, to);
        }
      });
    }
  }
});

test.describe('R3 (links), for drawings', () => {
  test('each year\'s first, middle and last drawing links open in a new tab with that drawing in the pop-up; closing shows the year at its own address', async ({ page }) => {
    for (const year of years) {
      const list = byYear.get(year);
      for (const date of new Set([list[0], list[Math.floor(list.length / 2)], list.at(-1)])) {
        await page.goto('about:blank');
        await page.goto(`/${year}/#${date}`);
        await expectShowing(page, date);
        await page.keyboard.press('Escape');
        await waitClosed(page);
        await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).hash).toBe(`/${year}/`);
        await expect(page.locator('.count')).toHaveText(new RegExp(`^${year} · `));
      }
    }
  });

  test('a link on the home page to one of the newest year\'s drawings opens it', async ({ page }) => {
    const date = byYear.get(newest).at(-1);
    await page.goto(`/#${date}`);
    await expectShowing(page, date);
  });

  test('opening a drawing gives the address its link, moving on changes it, and Back and Forward close and reopen it, in both directions', async ({ page }) => {
    await page.goto(`/${biggest}/`);
    const length = await page.evaluate(() => history.length);
    await tileFor(page, dates[0]).click();
    await expectShowing(page, dates[0]);
    expect(new URL(page.url()).pathname).toBe(`/${biggest}/`);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expectShowing(page, dates[2]);
    expect(await page.evaluate(() => history.length)).toBe(length + 1);
    await page.goBack();
    await waitClosed(page);
    expect(new URL(page.url()).pathname + new URL(page.url()).hash).toBe(`/${biggest}/`);
    // Forward reopens the drawing the visitor was last on.
    await page.goForward();
    await expectShowing(page, dates[2]);
    await page.keyboard.press('ArrowLeft');
    await expectShowing(page, dates[1]);
    await page.goBack();
    await waitClosed(page);
    await page.goForward();
    await expectShowing(page, dates[1]);
    await page.getByRole('button', { name: 'Close' }).click();
    await waitClosed(page);
    expect(new URL(page.url()).hash).toBe('');
  });

  test('a drawing link opened in a new tab: closing goes to the year, Forward reopens the drawing, and Back closes it again', async ({ page }) => {
    const date = dates[3];
    await page.goto(`/${biggest}/#${date}`);
    await expectShowing(page, date);
    await page.keyboard.press('Escape');
    await waitClosed(page);
    expect(new URL(page.url()).pathname + new URL(page.url()).hash).toBe(`/${biggest}/`);
    await page.goForward();
    await expectShowing(page, date);
    await page.goBack();
    await waitClosed(page);
    await expect(page.locator('.count')).toHaveText(new RegExp(`^${biggest} · `));
  });

  test('a reload on a drawing\'s link shows the same drawing', async ({ page }) => {
    await openAt(page, dates[0]);
    await page.keyboard.press('ArrowRight');
    await expectShowing(page, dates[1]);
    await page.reload();
    await expectShowing(page, dates[1]);
  });
});

test.describe('Never shown to a visitor (PRD section 6): a bad drawing link opens its year', () => {
  const unused = (year) => {
    for (let d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; d.setUTCDate(d.getUTCDate() + 1)) {
      const s = d.toISOString().slice(0, 10);
      if (!byYear.get(year).includes(s)) return s;
    }
    return null;
  };
  const other = years.find((y) => y !== biggest);
  const bad = {
    'a date with no drawing': () => unused(biggest),
    'a date that doesn\'t exist': () => `${biggest}-02-30`,
    'not a date': () => 'hello',
    'a drawing of another year': () => byYear.get(other)[0],
  };
  for (const [what, hash] of Object.entries(bad)) {
    test(`a link to ${what} opens the year, with no pop-up and the year's own address`, async ({ page }) => {
      const response = await page.goto(`/${biggest}/#${hash()}`);
      expect(response.status()).toBe(200);
      await expect(page.locator('.count')).toHaveText(new RegExp(`^${biggest} · `));
      await page.waitForTimeout(500);
      await expect(popup(page)).toHaveCount(0);
      expect(new URL(page.url()).pathname + new URL(page.url()).hash).toBe(`/${biggest}/`);
    });
  }
});

test.describe('With JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test('a drawing link opens its year with the drawing\'s tile on the screen', async ({ page }) => {
    const date = dates.at(-1);
    await page.goto(`/${biggest}/#${date}`);
    await expect(page.locator('.count')).toHaveText(new RegExp(`^${biggest} · `));
    await expect(tileFor(page, date)).toBeInViewport();
  });
});
