// Year pages and grid (#16). Turns the list of drawings into one page per year,
// /YYYY/index.html, and a home page, /index.html, that shows the newest year.
// The look follows the PRD's section 6 and the mockups in docs/mockups/.
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THUMB_LONG_SIDE } from './drawings.mjs';
import { SITE, pickPreview, previewTags } from './preview.mjs';

// From site.json, which also feeds the link preview (#20).
export const TITLE = SITE.title;
export const DESCRIPTION = SITE.description;

// How many thumbnails load right away. The rest wait until the visitor scrolls near
// them (TDD section 5). Four fill a phone's first screen; on wider screens the
// browser loads any others on the screen at once anyway.
export const EAGER_THUMBS = 4;

// The page code: switching years in place (#17). A file on the site rather than code
// written into the page, so the browser rules of issue 9 can allow only the site's own
// files. Every page works without it.
const SCRIPT = '/site.js';
const scriptSource = join(dirname(fileURLToPath(import.meta.url)), 'site.js');

// The fonts, stored on the site itself (TDD section 3): the Latin letters of each,
// one file covering every weight.
const require = createRequire(import.meta.url);
const FONTS = [
  { family: 'Space Grotesk', pkg: '@fontsource-variable/space-grotesk', file: 'space-grotesk-latin-wght-normal.woff2', weights: '300 700' },
  { family: 'Inter', pkg: '@fontsource-variable/inter', file: 'inter-latin-wght-normal.woff2', weights: '100 900' },
];
const fontUrl = (f) => `/fonts/${f.file}`;

const fontFaces = FONTS.map(
  (f) => `@font-face{font-family:"${f.family}";font-style:normal;font-weight:${f.weights};font-display:swap;src:url(${fontUrl(f)}) format("woff2")}`,
).join('\n');

// Always light: no dark-mode rules, and color-scheme tells the browser not to darken
// anything itself (PRD section 6).
const CSS = `${fontFaces}
:root{color-scheme:light;--page:#faf9f6;--ink:#1b1a18;--text:#3d3b37;--muted:#5c5952;--rule:#dcd8cf;--divider:#a8a398;--tile:#fff;--tile-edge:#e2ded6;--ring:#1b1a18}
*{box-sizing:border-box}
html{background:var(--page)}
body{margin:0;background:var(--page);color:var(--text);font:400 1rem/1.5 Inter,system-ui,sans-serif;-webkit-text-size-adjust:100%}
.wrap{max-width:1600px;margin:0 auto;padding:40px clamp(16px,3.2vw,48px) 64px}
h1{margin:0;font:700 clamp(2rem,1.5rem + 2vw,2.75rem)/1.1 "Space Grotesk",system-ui,sans-serif;color:var(--ink);letter-spacing:-0.01em}
.lede{margin:10px 0 20px;font-size:clamp(1rem,0.95rem + 0.25vw,1.125rem);color:var(--text)}
nav{border-top:1px solid var(--rule);border-bottom:1px solid var(--rule)}
nav ul{display:flex;flex-wrap:wrap;margin:0;padding:0;list-style:none}
nav li{display:flex;align-items:center}
nav li+li::before{content:"";width:1px;height:20px;background:var(--divider)}
nav a{display:flex;align-items:center;justify-content:center;min-width:44px;min-height:52px;padding:0 clamp(6px,1.4vw,14px);color:var(--text);font-size:clamp(1rem,0.9rem + 0.4vw,1.125rem);text-decoration:none;font-variant-numeric:tabular-nums}
nav a:hover{color:var(--ink)}
nav a[aria-current="page"]{color:var(--ink);font-weight:700;text-decoration:underline;text-decoration-thickness:3px;text-underline-offset:9px}
@media (max-width:559px){nav li{flex:1 1 auto}nav a{flex:1;padding:0 2px;font-size:min(1.0625rem,4.6vw)}}
.count{margin:24px 0 16px;font-size:0.9375rem;font-weight:400;color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px 12px;margin:0;padding:0;list-style:none}
@media (min-width:560px){.grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (min-width:720px){.grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:24px 16px}}
@media (min-width:960px){.grid{grid-template-columns:repeat(5,minmax(0,1fr))}}
@media (min-width:1200px){.grid{grid-template-columns:repeat(6,minmax(0,1fr));gap:24px 18px}}
.grid a{display:block;aspect-ratio:6/7;padding:8px;background:var(--tile);border:1px solid var(--tile-edge);color:var(--ink)}
.grid img{display:block;width:100%;height:100%;object-fit:contain}
.label{margin:6px 0 0;font-size:0.875rem;color:var(--muted)}
a:focus{outline:none}
a:focus-visible{outline:3px solid var(--ring);outline-offset:3px}
`;

const yearsOf = (list) => [...new Set(list.map((d) => d.year))].sort((a, b) => b - a);

// The thumbnail's size in pixels: the drawing's shape, at most THUMB_LONG_SIDE on its long side.
function thumbSize({ width, height }) {
  const scale = Math.min(1, THUMB_LONG_SIDE / Math.max(width, height));
  return { w: Math.round(width * scale), h: Math.round(height * scale) };
}

function tile(d, i) {
  const { w, h } = thumbSize(d);
  const loading = i < EAGER_THUMBS ? (i === 0 ? ' fetchpriority="high"' : '') : ' loading="lazy"';
  return `<li><a href="${d.full}" data-date="${d.date}" data-width="${d.width}" data-height="${d.height}"><img src="${d.thumb}" alt="${d.caption}" width="${w}" height="${h}" decoding="async"${loading}></a><p class="label" aria-hidden="true">${d.label}</p></li>`;
}

const tilesOf = (year, list) => list.filter((d) => d.year === year).map(tile).join('\n');

function countOf(year, list) {
  if (year === undefined) return 'No drawings yet.';
  const n = list.filter((d) => d.year === year).length;
  return `${year} · ${n} ${n === 1 ? 'drawing' : 'drawings'}`;
}

// Every other year's tiles and count, ready for build/site.js to swap into the grid when
// the visitor picks that year (#17). A <template> isn't shown. Its thumbnails' addresses
// are in data-src, not src, because Firefox fetches an <img src> even inside a
// <template>; build/site.js turns them back into src when the year is first picked.
// With JavaScript off, nothing uses them.
const heldYears = (year, list) =>
  yearsOf(list)
    .filter((y) => y !== year)
    .map((y) => `<template data-year="${y}" data-count="${countOf(y, list)}">\n${tilesOf(y, list).replaceAll('<img src="', '<img data-src="')}\n</template>`)
    .join('\n');

// The page for one year. `list` is every drawing (from drawings.json), in date order.
// `home` is true for the home page, whose browser tab is titled just "Sketch Gallery";
// a year page's tab names its year, like "2025 · Sketch Gallery".
export function renderPage({ year, list, home = false }) {
  const menu = yearsOf(list)
    .map((y) => `<li><a href="/${y}/"${y === year ? ' aria-current="page"' : ''}>${y}</a></li>`)
    .join('');
  const held = heldYears(year, list);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${home ? TITLE : `${year} · ${TITLE}`}</title>
<meta name="description" content="${DESCRIPTION}">
${previewTags({ path: home ? '/' : `/${year}/`, drawing: pickPreview(list).drawing })}
${FONTS.map((f) => `<link rel="preload" href="${fontUrl(f)}" as="font" type="font/woff2" crossorigin>`).join('\n')}
<script src="${SCRIPT}" defer></script>
<style>
${CSS}</style>
</head>
<body>
<div class="wrap">
<header>
<h1>${TITLE}</h1>
<p class="lede">${DESCRIPTION}</p>
</header>
<nav aria-label="Years"><ul>${menu}</ul></nav>
<main>
<h2 class="count" aria-live="polite">${countOf(year, list)}</h2>
<ul class="grid">
${tilesOf(year, list)}
</ul>
${held ? `${held}\n` : ''}</main>
</div>
</body>
</html>
`;
}

// Writes /index.html (the newest year), /YYYY/index.html for every year, /site.js and the fonts.
// Given no drawings, only a home page that says so. The build never gets here with none, since it stops first (#30).
export function writeSite({ list, to }) {
  const years = yearsOf(list);
  mkdirSync(to, { recursive: true });
  // Clear out year pages from an earlier build, so a removed year leaves nothing behind.
  for (const name of readdirSync(to)) {
    if (/^\d{4}$/.test(name)) rmSync(join(to, name), { recursive: true, force: true });
  }
  for (const year of years) {
    mkdirSync(join(to, String(year)), { recursive: true });
    writeFileSync(join(to, String(year), 'index.html'), renderPage({ year, list }));
  }
  writeFileSync(join(to, 'index.html'), renderPage({ year: years[0], list, home: true }));
  copyFileSync(scriptSource, join(to, SCRIPT));
  mkdirSync(join(to, 'fonts'), { recursive: true });
  for (const f of FONTS) {
    const dir = dirname(require.resolve(`${f.pkg}/package.json`));
    copyFileSync(join(dir, 'files', f.file), join(to, 'fonts', f.file));
  }
}
