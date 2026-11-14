// Dates and file names (#13). A drawing's file name, like 2025-10-07.jpg, is the
// only source of its date (TDD section 5).

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const NAME = /^(\d{4})-(\d{2})-(\d{2})\.jpg$/;

export function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year, month) {
  return month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
}

// "2025-10-07.jpg" → { ok: true, year: 2025, month: 10, day: 7, date: "2025-10-07" }.
// Anything else → { ok: false, message } saying what's wrong.
export function parseFileName(name) {
  const quoted = JSON.stringify(name);
  const match = NAME.exec(name);
  if (!match) {
    return { ok: false, message: `${quoted} isn't named like 2025-10-07.jpg (year-month-day.jpg)` };
  }
  const [year, month, day] = match.slice(1).map(Number);
  const date = name.slice(0, 10);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return { ok: false, message: `${quoted}: ${date} isn't a real date` };
  }
  return { ok: true, year, month, day, date };
}

const pad = (n, width) => String(n).padStart(width, '0');

// { year: 2025, month: 10, day: 7 } → "2025-10-07.jpg".
export function fileName({ year, month, day }) {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}.jpg`;
}

// The label under a thumbnail: "October 7".
export function label({ month, day }) {
  return `${MONTHS[month - 1]} ${day}`;
}

// The caption in the pop-up, also the description for screen readers: "October 7, 2025".
export function caption({ year, month, day }) {
  return `${label({ month, day })}, ${year}`;
}
