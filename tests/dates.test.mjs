// Dates and file names (#13). The file name is the only source of a drawing's
// date (TDD section 5). The expected answers come from the JavaScript Date
// object and the browser's own date formatter (Intl), not from hand-picked lists,
// so the tests don't share the build's calendar rules.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { caption, daysInMonth, fileName, isLeapYear, label, parseFileName } from '../build/dates.mjs';

// The oracle: is year-month-day a real day on the calendar?
function realDate(year, month, day) {
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

const pad = (n, width) => String(n).padStart(width, '0');

// Any day from year 0000 to 9999, built from the Date object rather than our rules.
// (Date.UTC reads years 0 to 99 as 1900 to 1999, so set the year directly.)
const firstDay = new Date(0).setUTCFullYear(0, 0, 1);
const lastDay = new Date(0).setUTCFullYear(9999, 11, 31);
const anyDay = fc.integer({ min: firstDay, max: lastDay }).map((ms) => {
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
});

// Names close to the right shape, so most random cases test the date rules, not just the shape.
const nearMiss = fc
  .record({
    year: fc.integer({ min: 0, max: 9999 }),
    month: fc.integer({ min: 0, max: 99 }),
    day: fc.integer({ min: 0, max: 99 }),
    ext: fc.constantFrom('.jpg', '.jpg', '.jpg', '.JPG', '.jpeg', '.png', '', '.jpg.jpg'),
    sep: fc.constantFrom('-', '-', '-', '_', '', '/'),
  })
  .map(({ year, month, day, ext, sep }) => `${pad(year, 4)}${sep}${pad(month, 2)}${sep}${pad(day, 2)}${ext}`);

const anyName = fc.oneof(nearMiss, fc.string(), fc.string({ unit: 'binary' }));

// The oracle for a whole file name: the exact shape, then a real date.
function oracle(name) {
  const m = /^(\d{4})-(\d{2})-(\d{2})\.jpg$/.exec(name);
  if (!m) return null;
  const [year, month, day] = m.slice(1).map(Number);
  return realDate(year, month, day) ? { year, month, day } : null;
}

describe('parseFileName', () => {
  it('turns any file name into a real date, or refuses it with a message that names the file', () => {
    fc.assert(
      fc.property(anyName, (name) => {
        const result = parseFileName(name);
        const expected = oracle(name);
        if (expected) {
          expect(result).toEqual({ ok: true, ...expected, date: name.slice(0, 10) });
        } else {
          expect(result.ok).toBe(false);
          expect(result.message).toEqual(expect.any(String));
          expect(result.message).toContain(JSON.stringify(name));
        }
      }),
      { numRuns: 5000 },
    );
  });

  it('accepts a real date', () => {
    expect(parseFileName('2025-10-07.jpg')).toEqual({ ok: true, year: 2025, month: 10, day: 7, date: '2025-10-07' });
  });

  it('accepts February 29 only in leap years', () => {
    expect(parseFileName('2024-02-29.jpg').ok).toBe(true);
    expect(parseFileName('2000-02-29.jpg').ok).toBe(true);
    expect(parseFileName('2025-02-29.jpg').ok).toBe(false);
    expect(parseFileName('1900-02-29.jpg').ok).toBe(false);
  });

  it('accepts the first and last day of every month, and refuses the day after the last', () => {
    for (let month = 1; month <= 12; month++) {
      const last = new Date(Date.UTC(2023, month, 0)).getUTCDate();
      expect(parseFileName(`2023-${pad(month, 2)}-01.jpg`).ok).toBe(true);
      expect(parseFileName(`2023-${pad(month, 2)}-${pad(last, 2)}.jpg`).ok).toBe(true);
      expect(parseFileName(`2023-${pad(month, 2)}-${pad(last + 1, 2)}.jpg`).ok).toBe(false);
    }
  });

  it('refuses month 0, month 13 and day 0', () => {
    expect(parseFileName('2025-00-10.jpg').ok).toBe(false);
    expect(parseFileName('2025-13-10.jpg').ok).toBe(false);
    expect(parseFileName('2025-10-00.jpg').ok).toBe(false);
  });

  it('refuses other shapes and endings', () => {
    for (const name of ['2025-10-07.JPG', '2025-10-07.jpeg', '2025-10-7.jpg', '25-10-07.jpg', ' 2025-10-07.jpg', '2025-10-07.jpg ', 'x2025-10-07.jpg', '2025-10-07.jpgx', '2025-10-07', '']) {
      expect(parseFileName(name).ok, name).toBe(false);
    }
  });

  it('says what is wrong in plain words', () => {
    expect(parseFileName('IMG_1234.jpg').message).toBe('"IMG_1234.jpg" isn\'t named like 2025-10-07.jpg (year-month-day.jpg)');
    expect(parseFileName('2025-02-30.jpg').message).toBe('"2025-02-30.jpg": 2025-02-30 isn\'t a real date');
  });
});

describe('fileName', () => {
  it('turns a date into a file name and back into the same date', () => {
    fc.assert(
      fc.property(anyDay, (d) => {
        const name = fileName(d);
        expect(name).toMatch(/^\d{4}-\d{2}-\d{2}\.jpg$/);
        const back = parseFileName(name);
        expect(back.ok).toBe(true);
        expect({ year: back.year, month: back.month, day: back.day }).toEqual(d);
      }),
      { numRuns: 2000 },
    );
  });

  it('turns an accepted file name into a date and back into the same name', () => {
    fc.assert(
      fc.property(anyName, (name) => {
        const result = parseFileName(name);
        fc.pre(result.ok);
        expect(fileName(result)).toBe(name);
      }),
    );
    fc.assert(
      fc.property(anyDay, (d) => {
        const name = `${pad(d.year, 4)}-${pad(d.month, 2)}-${pad(d.day, 2)}.jpg`;
        expect(fileName(parseFileName(name))).toBe(name);
      }),
    );
  });

  it('pads the year, month and day', () => {
    expect(fileName({ year: 987, month: 3, day: 4 })).toBe('0987-03-04.jpg');
  });
});

describe('calendar rules', () => {
  it('agree with the Date object for every month of years 0 to 9999', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 9999 }), fc.integer({ min: 1, max: 12 }), (year, month) => {
        const d = new Date(0);
        d.setUTCFullYear(year, month, 0); // day 0 of the next month is the last day of this one
        expect(daysInMonth(year, month)).toBe(d.getUTCDate());
        expect(isLeapYear(year)).toBe(realDate(year, 2, 29));
      }),
      { numRuns: 3000 },
    );
  });

  it('know the century rules', () => {
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2025)).toBe(false);
  });
});

describe('label and caption', () => {
  const long = (opts) => new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' });

  it('match the browser date formatter, like "October 7" and "October 7, 2025"', () => {
    fc.assert(
      fc.property(anyDay.filter(({ year }) => year >= 1000), (d) => {
        const at = new Date(0);
        at.setUTCFullYear(d.year, d.month - 1, d.day);
        expect(label(d)).toBe(long({ month: 'long', day: 'numeric' }).format(at));
        expect(caption(d)).toBe(long({ month: 'long', day: 'numeric', year: 'numeric' }).format(at));
      }),
      { numRuns: 1000 },
    );
  });

  it('read like the TDD examples', () => {
    expect(label({ year: 2025, month: 10, day: 7 })).toBe('October 7');
    expect(caption({ year: 2025, month: 10, day: 7 })).toBe('October 7, 2025');
    expect(caption({ year: 2026, month: 1, day: 31 })).toBe('January 31, 2026');
  });
});
