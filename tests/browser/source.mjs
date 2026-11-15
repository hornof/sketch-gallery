// What the browser tests expect, read straight from the drawings folder rather than
// from the build's output, so the build can't agree with itself by mistake.
// No test assumes how many drawings a year has (TDD section 11): they count here.
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The same folder the build reads: drawings/, or the test drawings until it exists.
// After `npm run build -- --drawings <dir>`, set DRAWINGS=<dir> to test that build.
export function sourceFolder() {
  if (process.env.DRAWINGS) return process.env.DRAWINGS;
  const real = join(root, 'drawings');
  return existsSync(real) ? real : join(root, 'tests', 'fixtures', 'drawings');
}

// Map of year (number) → that year's dates ("2025-10-07"), in date order.
export function drawingsByYear(dir = sourceFolder()) {
  const byYear = new Map();
  for (const year of readdirSync(dir).filter((n) => /^\d{4}$/.test(n))) {
    const dates = readdirSync(join(dir, year))
      .filter((f) => f.endsWith('.jpg'))
      .map((f) => f.slice(0, 10))
      .sort();
    byYear.set(Number(year), dates);
  }
  return byYear;
}

// "2025-10-07" → "October 7" and "October 7, 2025", worked out by the browser's own
// date formatting, not by build/dates.mjs.
const fmt = (date, opts) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
export const monthDay = (date) => fmt(date, { month: 'long', day: 'numeric' });
export const fullDate = (date) => fmt(date, { month: 'long', day: 'numeric', year: 'numeric' });
