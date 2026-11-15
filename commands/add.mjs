// ./add: adds one drawing (#14, R12 in the PRD). It follows the PRD's four steps:
// checks first, says what it will do and asks for a yes, adds the file and sends it
// to GitHub, and on any problem says what's wrong and changes nothing.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { caption, parseFileName } from '../build/dates.mjs';
import { makeThumbnail, readJpeg, visible } from '../build/drawings.mjs';
import { getReady, sendToGitHub } from './git.mjs';

export const SITE = 'https://sketch-gallery.hornof.org';

export const HELP = `Adds one drawing to the gallery and sends it to GitHub.

  ./add 2026-11-03.jpg                    the date comes from the file name
  ./add photo.jpg --date 2026-11-03       gives a file not named by date its date
  ./add 2026-11-03.jpg --replace          replaces the drawing already there for that date
  ./add 2026-11-03.jpg --yes              doesn't ask before adding

Run it on main. It gets the latest version from GitHub, checks the file, says
what it will do and asks for a yes. Nothing changes until you answer y.`;

const plural = (n) => `${n} drawing${n === 1 ? '' : 's'}`;

// The drawing's date, from --date if given, otherwise from the file's name.
// Returns { ok: true, year, month, day, date } or { ok: false, message }.
export function chooseDate(source, dateOption) {
  if (dateOption !== undefined) {
    const parsed = parseFileName(`${dateOption}.jpg`);
    if (parsed.ok) return parsed;
    return { ok: false, message: `--date ${dateOption} isn't a real date written like 2026-11-03 (year-month-day)` };
  }
  const name = basename(source);
  const parsed = parseFileName(name);
  if (parsed.ok) return parsed;
  return { ok: false, message: `${parsed.message}. Rename it, or give the date: ./add ${name} --date 2026-11-03` };
}

// What ./add will do, for example "Adding November 3, 2026 to 2026 (now 32 drawings)".
// countBefore is how many drawings the year has now.
export function describeAdd({ date, countBefore, replacing }) {
  const when = caption(parseFileName(`${date}.jpg`));
  const year = date.slice(0, 4);
  if (replacing) return `Replacing ${when} in ${year} (still ${plural(countBefore)})`;
  const isNew = countBefore === 0 ? ', a new year' : '';
  return `Adding ${when} to ${year}${isNew} (now ${plural(countBefore + 1)})`;
}

// Where the drawing will appear: https://sketch-gallery.hornof.org/2026/#2026-11-03.
export function drawingLink(date) {
  return `${SITE}/${date.slice(0, 4)}/#${date}`;
}

const isYes = (answer) => /^y(es)?$/i.test(answer.trim());

// Runs ./add with the given arguments in the repo folder `repo`. Prints with
// print(line) and asks with ask(question) → answer. Returns the exit code.
export async function add(args, { repo, print, ask, cwd = process.cwd() }) {
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        date: { type: 'string' },
        replace: { type: 'boolean' },
        yes: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    }));
  } catch (err) {
    print(`${err.message}\n\n${HELP}`);
    return 1;
  }
  if (values.help) {
    print(HELP);
    return 0;
  }
  if (positionals.length === 0) {
    print(`Which drawing? For example: ./add 2026-11-03.jpg\n\n${HELP}`);
    return 1;
  }
  if (positionals.length > 1) {
    print(`One drawing at a time: ./add was given ${positionals.length} files (${positionals.join(', ')}).`);
    return 1;
  }

  const fail = (message) => {
    print(message);
    print('Nothing changed.');
    return 1;
  };

  // 1. Checks first, after getting the latest version from GitHub.
  const notReady = getReady(repo);
  if (notReady) return fail(notReady);

  const source = resolve(cwd, positionals[0]);
  if (!existsSync(source)) return fail(`Can't find ${source}`);
  if (statSync(source).isDirectory()) return fail(`${source} is a folder, not a drawing`);
  const chosen = chooseDate(source, values.date);
  if (!chosen.ok) return fail(chosen.message);

  // The same checks the build makes, so a drawing ./add accepts never stops the build.
  const name = basename(source);
  const meta = await readJpeg(source);
  const thumb = meta && (await makeThumbnail(readFileSync(source)).catch(() => null));
  if (!thumb) return fail(`${name} isn't really a JPEG`);
  if (!thumb.data) return fail(`${name} is too detailed for a thumbnail of at most 60 KB, so the site would stop building with it`);

  const { date, year } = chosen;
  const to = `drawings/${year}/${date}.jpg`;
  const when = caption(chosen);
  const replacing = existsSync(join(repo, to));
  if (replacing && !values.replace) {
    return fail(`There's already a drawing for ${when} (${to}). To replace it, add --replace.`);
  }
  const yearFolder = join(repo, 'drawings', String(year));
  const countBefore = existsSync(yearFolder) ? visible(readdirSync(yearFolder)).length : 0;

  // 2. Says what it will do and asks for a yes.
  const plan = describeAdd({ date, countBefore, replacing });
  if (values.yes) {
    print(plan);
  } else if (!isYes(await ask(`${plan}. Go ahead? (y/n) `))) {
    print('Nothing changed.');
    return 0;
  }

  // 3. Adds the file and sends it to GitHub; 4. undoes everything if that fails.
  print('Sending it to GitHub...');
  const problem = sendToGitHub(repo, [{ from: source, to }], `${replacing ? 'Replace' : 'Add'} ${when}`);
  if (problem) return fail(problem);
  print(`${replacing ? 'Replaced' : 'Added'} ${when}. Live in about 2 minutes at:\n${drawingLink(date)}`);
  return 0;
}

// Asks on the terminal. An answer that never comes (input closed) counts as no.
export async function askOnTerminal(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise((done) => {
      rl.once('close', () => done(''));
      rl.question(question).then(done, () => done(''));
    });
  } finally {
    rl.close();
  }
}

// Called by the ./add file in the repo folder.
export function main(args) {
  const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
  return add(args, { repo, print: (line) => console.log(line), ask: askOnTerminal });
}
