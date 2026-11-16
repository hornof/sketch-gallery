// Helpers shared by the pop-up's browser tests: popup.pw.mjs (#18) and
// next-previous.pw.mjs (#19). They read the pop-up as the visitor sees it, not through
// the site's code.
import { expect } from '@playwright/test';

// R8 (motion): every animation finishes within this many milliseconds.
export const MOTION_MS = 350;
// What a measured motion may run over MOTION_MS: the browser draws a frame about every
// 16 ms, and the first and last change are each seen up to a frame late.
export const FRAME_SLACK_MS = 34;

export const tileFor = (page, date) => page.locator(`.grid a[data-date="${date}"]`);
export const popup = (page) => page.locator('.pswp');

// Code run in the page: the drawing shown in the pop-up, the one whose middle is on the
// screen (the pop-up keeps the drawings either side ready, off the screen).
export const shownImage = `(() => {
  const imgs = [...document.querySelectorAll('.pswp img.pswp__img')].filter((i) => {
    const r = i.getBoundingClientRect();
    const mid = r.left + r.width / 2;
    return r.width > 0 && mid >= 0 && mid <= window.innerWidth;
  });
  return imgs.find((i) => !i.classList.contains('pswp__img--placeholder')) ?? imgs[0];
})()`;

export const shownRect = (page) =>
  page.evaluate((code) => {
    const r = eval(code).getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, shownImage);

// The date of the drawing shown, read from its full-size file's name.
export const shownDate = (page) => page.evaluate((code) => eval(code)?.getAttribute('src').match(/(\d{4}-\d{2}-\d{2})\.jpg$/)?.[1] ?? null, shownImage);

// Starts timing each of the pop-up's motions, as the visitor sees them: every frame, for
// each moving part (the dark background's and the buttons' opacity, the drawing's place
// and size, the row of drawings sliding), notes whether it changed since the last frame.
// A part's motion runs from its first change to its last; a part appearing or going isn't
// a change. Also notes the length every animation the browser runs in the pop-up was
// given. endWatch waits until nothing has changed for 600 ms and reports the longest motion.
export const startWatch = (page) =>
  page.evaluate(() => {
    const parts = () => {
      const now = new Map();
      for (const el of document.querySelectorAll('.pswp .pswp__bg, .pswp .pswp__top-bar, .pswp .pswp__button')) now.set(el, getComputedStyle(el).opacity);
      for (const el of document.querySelectorAll('.pswp .pswp__container, .pswp .pswp__zoom-wrap')) now.set(el, getComputedStyle(el).transform);
      return now;
    };
    const w = { motions: new Map(), lengths: [] };
    const seen = new Set();
    let last = parts();
    window.motion = w;
    w.done = new Promise((resolve) => {
      const t0 = performance.now();
      let still = t0;
      const step = (t) => {
        const now = parts();
        for (const [el, value] of now) {
          if (last.has(el) && last.get(el) !== value) {
            const m = w.motions.get(el) ?? { first: t, last: t };
            m.last = t;
            w.motions.set(el, m);
            still = t;
          }
        }
        if (now.size !== last.size) still = t;
        last = now;
        for (const a of document.getAnimations()) {
          // The loading indicator, which spins only while a drawing is slow to load, isn't counted.
          if (a.effect?.target?.closest?.('.pswp__preloader')) continue;
          if (!seen.has(a)) {
            seen.add(a);
            w.lengths.push(a.effect.getComputedTiming().endTime);
          }
        }
        if ((still > t0 && t - still > 600) || t - t0 > 8000) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  });
// { span: the longest motion in ms, moved: how many parts moved, lengths: each animation's given length }
export const endWatch = (page) =>
  page.evaluate(async () => {
    await window.motion.done;
    const { motions, lengths } = window.motion;
    const spans = [...motions.values()].map((m) => m.last - m.first);
    return { span: Math.max(0, ...spans), moved: spans.length, lengths };
  });

// Waits until the pop-up is open and still, with the full-size drawing loaded in place
// of the thumbnail it shows at first. Still means no animation running and the row of
// drawings not sliding (the slide to the next drawing is moved frame by frame, not by
// an animation the browser runs).
export async function waitOpen(page) {
  await expect(popup(page)).toHaveClass(/pswp--open/);
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && !a.effect?.target?.closest?.('.pswp__preloader')).length)).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const row = () => document.querySelector('.pswp .pswp__container')?.style.transform;
        const before = row();
        for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
        return before === row();
      }),
    )
    .toBe(true);
  await expect.poll(() => page.evaluate((code) => !!eval(code) && eval(code).complete && !eval(code).classList.contains('pswp__img--placeholder'), shownImage)).toBe(true);
}
export const waitClosed = (page) => expect(popup(page)).toHaveCount(0);

// A swipe `dx` and `dy` pixels in ten steps a frame apart, from the middle of the screen,
// or for a sideways swipe, centered on its middle: a real touch in Chromium, and elsewhere
// a mouse drag, which sends the pop-up the same pointer events with another pointer type.
// The pop-up follows the pointer once a frame, and a drag sent all within one frame
// doesn't move it at all. A sideways swipe is centered so it stays on the screen: Firefox
// doesn't tell the page about a mouse button let go off the screen.
export async function swipe(page, browserName, { dx = 0, dy = 0 }) {
  const { width, height } = page.viewportSize();
  const x = Math.round(width / 2 - dx / 2);
  const y = Math.round(height / 2);
  const at = (i) => ({ x: Math.round(x + (dx * i) / 10), y: Math.round(y + (dy * i) / 10) });
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at(i)] });
      await page.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(at(i).x, at(i).y);
      await page.waitForTimeout(20);
    }
    await page.mouse.up();
  }
}
