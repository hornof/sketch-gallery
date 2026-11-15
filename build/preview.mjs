// Link preview (#20, R14). What a message app, Slack or a social site shows when the
// link is pasted: the title, the description line and one drawing, all from site.json.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The title, the description line, the address, and the date of the drawing the preview shows.
export const SITE = JSON.parse(readFileSync(join(root, 'site.json'), 'utf8'));

// 1200 × 630 is the size Facebook, Slack, iMessage and the others all show well.
export const PREVIEW = { path: '/preview.jpg', width: 1200, height: 630 };
// The page color (build/pages.mjs), around the drawing.
const BACKGROUND = '#faf9f6';

// The drawing site.json names, or the newest one, with a warning, if it isn't in the list.
export function pickPreview(list, date = SITE.preview) {
  const named = list.find((d) => d.date === date);
  if (named || list.length === 0) return { drawing: named ?? null };
  const drawing = list.at(-1);
  return { drawing, warning: `site.json picks ${date} for the link preview, but there is no such drawing; using the newest, ${drawing.date}` };
}

const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const tag = (attr, key, value) => `<meta ${attr}="${key}" content="${esc(value)}">`;

// The preview tags for the page at `path` ("/" or "/2025/"). With no drawing, no image.
export function previewTags({ path, drawing, site = SITE }) {
  const tags = [
    tag('property', 'og:title', site.title),
    tag('property', 'og:description', site.description),
    tag('property', 'og:site_name', site.title),
    tag('property', 'og:type', 'website'),
    tag('property', 'og:url', `${site.address}${path}`),
  ];
  if (drawing) {
    tags.push(
      tag('property', 'og:image', `${site.address}${PREVIEW.path}`),
      tag('property', 'og:image:width', PREVIEW.width),
      tag('property', 'og:image:height', PREVIEW.height),
      tag('property', 'og:image:alt', `A drawing from ${drawing.caption}`),
    );
  }
  tags.push(tag('name', 'twitter:card', drawing ? 'summary_large_image' : 'summary'));
  return tags.join('\n');
}

// Writes /preview.jpg into `to`: the whole drawing, upright, as tall as fits, centered on
// the page color. Reads the full-size copy the build already wrote there.
export async function writePreview({ drawing, to }) {
  await sharp(join(to, drawing.full))
    .autoOrient()
    .resize({ width: PREVIEW.width, height: PREVIEW.height, fit: 'contain', background: BACKGROUND })
    .flatten({ background: BACKGROUND })
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(join(to, PREVIEW.path));
}
