// Browser rules (#20, TDD section 9): the _headers file the build writes. tests/serve.mjs
// sends its rules the way Cloudflare does, so these tests see what a visitor's browser sees.
// R13 (only the owner, on the site): only the site's own code runs, and only hornof.org may
// show the site inside its own page.
import { expect, test } from '@playwright/test';
import { drawingsByYear } from './source.mjs';

const years = [...drawingsByYear().keys()].sort((a, b) => b - a);
const SITE = 'http://localhost:4173';

// Every rule the browser refuses, recorded by the page itself.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.violations = [];
    document.addEventListener('securitypolicyviolation', (e) => window.violations.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
});
const violations = (page) => page.evaluate(() => window.violations);

test('every page is sent the browser rules', async ({ page }) => {
  for (const path of ['/', ...years.map((y) => `/${y}/`)]) {
    const res = await page.goto(path);
    const csp = res.headers()['content-security-policy'];
    expect(csp, path).toContain("script-src 'self'");
    expect(csp, path).toContain('frame-ancestors https://hornof.org https://www.hornof.org');
  }
});

test('the site itself breaks no rule: every year, every drawing\'s thumbnail, the fonts and the page code', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  for (const year of years) {
    await page.getByRole('navigation', { name: 'Years' }).getByRole('link', { name: String(year), exact: true }).click();
    await expect(page.locator('[aria-current="page"]')).toHaveText(String(year));
    // Scroll to the end, so every thumbnail loads.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.locator('.grid img').evaluateAll((imgs) => imgs.every((i) => i.complete && i.naturalWidth > 0))).toBe(true);
  }
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('16px Inter') && document.fonts.check('16px "Space Grotesk"'))).toBe(true);
  expect(await violations(page)).toEqual([]);
});

test('the pop-up breaks no rule: open a drawing, step to the next, close', async ({ page }) => {
  const dates = drawingsByYear().get(years[0]);
  await page.goto('/', { waitUntil: 'load' });
  await page.locator(`.grid a[data-date="${dates[0]}"]`).click();
  await expect(page.locator('.pswp')).toHaveClass(/pswp--open/);
  // The full-size drawing has loaded in the pop-up.
  const loaded = (date) =>
    page.locator(`.pswp img.pswp__img[src="/full/${years[0]}/${date}.jpg"]`).evaluateAll((imgs) => imgs.some((i) => i.complete && i.naturalWidth > 0));
  await expect.poll(() => loaded(dates[0])).toBe(true);
  if (dates.length > 2) {
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => loaded(dates[2])).toBe(true); // the pop-up loads the one after next, ready
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('.pswp')).toHaveCount(0);
  expect(await violations(page)).toEqual([]);
});

test('code from the site runs; code written into the page or from another site does not', async ({ page }) => {
  await page.route(`${SITE}/probe.js`, (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.ran = (window.ran || []).concat("site")' }));
  await page.route('https://elsewhere.example/probe.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.ran = (window.ran || []).concat("elsewhere")' }));
  await page.goto('/', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const add = (fill) =>
      new Promise((done) => {
        const s = document.createElement('script');
        fill(s);
        s.onload = s.onerror = done;
        document.head.append(s);
        if (!s.src) setTimeout(done, 100);
      });
    await add((s) => (s.src = '/probe.js'));
    await add((s) => (s.src = 'https://elsewhere.example/probe.js'));
    await add((s) => (s.textContent = 'window.ran = (window.ran || []).concat("inline")'));
  });
  expect(await page.evaluate(() => window.ran)).toEqual(['site']);
  const refused = await violations(page);
  expect(refused.some((v) => v.startsWith('script-src') && v.includes('elsewhere.example'))).toBe(true);
  expect(refused.some((v) => v.startsWith('script-src') && v.includes('inline'))).toBe(true);
});

// A page on another site that shows the gallery in a frame, served by the test itself. The
// gallery is framed at its real address, which the test answers from the local copy with
// its headers, since browsers won't put a page on http://localhost inside an https page.
async function framedFrom(page, origin) {
  const LIVE = 'https://sketch-gallery.hornof.org';
  await page.route(`${LIVE}/**`, async (r) => r.fulfill({ response: await r.fetch({ url: r.request().url().replace(LIVE, SITE) }) }));
  await page.route(`${origin}/`, (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><iframe src="${LIVE}/" onload="window.framed = true"></iframe>` }));
  await page.goto(`${origin}/`);
  await page.waitForFunction(() => window.framed === true);
  return page.frames().find((f) => f !== page.mainFrame());
}

test.describe('who may show the site in a frame', () => {
  test('hornof.org may', async ({ page }) => {
    const frame = await framedFrom(page, 'https://hornof.org');
    await expect(frame.locator('h1')).toHaveText('Sketch Gallery');
  });

  test('another site may not', async ({ page }) => {
    const frame = await framedFrom(page, 'https://elsewhere.example');
    expect(await frame.locator('h1').count()).toBe(0);
  });
});
