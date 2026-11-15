// ./import: loads one or more year folders (#15, R11 in the PRD). It follows the PRD's
// four steps, like ./add: checks first, says what it will do and asks for a yes, adds
// every drawing in one commit and one push to GitHub, and on any problem lists every
// problem and changes nothing. All or nothing across every folder.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { caption, parseFileName } from '../build/dates.mjs';
import { makeThumbnail, readJpeg, visible } from '../build/drawings.mjs';
import { SITE, askOnTerminal } from './add.mjs';
import { getReady, sendToGitHub } from './git.mjs';

export const HELP = `Adds one or more year folders to the gallery, in one commit, and sends them to GitHub.

  ./import ../drawings/2025                     one year
  ./import ../drawings/2024 ../drawings/2025    several years at once
  ./import ../drawings/2025 --replace           replaces drawings already there for the same dates
  ./import ../drawings/2025 --yes               doesn't ask before adding

Each folder is named after its year, and holds only drawings named by date, like
2025-10-07.jpg. Run it on main. It gets the latest version from GitHub, checks every
file, says what it will do and asks for a yes. If anything is wrong, it lists every
problem and adds nothing. Nothing changes until you answer y.`;

const plural = (n, word = 'drawing') => `${n} ${word}${n === 1 ? '' : 's'}`;

// "2024", "2024 and 2025", "2024, 2025 and 2026".
const listed = (items) => (items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

const isYes = (answer) => /^y(es)?$/i.test(answer.trim());

// What ./import will do, one line per year after a heading:
//   Importing 31 drawings in one commit:
//   - 2025: adding 31 drawings, a new year (now 31 drawings)
// years: [{ year, adding, replacing, countBefore }], where countBefore is how many
// drawings the year has now.
export function describeImport(years) {
  const total = years.reduce((n, y) => n + y.adding + y.replacing, 0);
  const lines = years.map(({ year, adding, replacing, countBefore }) => {
    if (adding === 0) return `- ${year}: replacing ${plural(replacing)} (still ${plural(countBefore)})`;
    const also = replacing > 0 ? ` and replacing ${plural(replacing)}` : '';
    const isNew = countBefore === 0 ? ', a new year' : '';
    return `- ${year}: adding ${plural(adding)}${also}${isNew} (now ${plural(countBefore + adding)})`;
  });
  return [`Importing ${plural(total)} in one commit:`, ...lines].join('\n');
}

// Checks every folder and every file in them against the build's file rules, so a
// drawing ./import accepts never stops the build. Returns { years, files, problems }:
//   years: [{ year, adding, replacing, countBefore }] in the order given
//   files: [{ from, to }] for sendToGitHub
//   problems: one line per problem, "<path>: <what's wrong>", in the order found
export async function checkFolders(folders, { repo, cwd, replace }) {
  const problems = [];
  const years = [];
  const files = [];
  const seen = new Set();
  for (const given of folders) {
    const folder = resolve(cwd, given);
    // Problems name each folder and file the way the owner typed it, without a slash at the end.
    const shown = given.replace(/\/+$/, '') || given;
    const problem = (path, message) => problems.push(`${path}: ${message}`);
    if (!existsSync(folder)) {
      problem(shown, 'can\'t find this folder');
      continue;
    }
    if (!statSync(folder).isDirectory()) {
      problem(shown, 'is a file, not a year folder');
      continue;
    }
    const year = basename(folder);
    if (!/^\d{4}$/.test(year)) {
      problem(shown, 'isn\'t a year folder. Give the year folders inside it, or name it after its year, like 2025.');
      continue;
    }
    if (seen.has(year)) {
      problem(shown, `${year} is given twice. Put that year's drawings in one folder.`);
      continue;
    }
    seen.add(year);
    const names = visible(readdirSync(folder));
    if (names.length === 0) {
      problem(shown, 'is empty; a year folder needs at least one drawing');
      continue;
    }
    const inRepo = join(repo, 'drawings', year);
    const countBefore = existsSync(inRepo) ? visible(readdirSync(inRepo)).length : 0;
    const counts = { year: Number(year), adding: 0, replacing: 0, countBefore };
    for (const name of names) {
      const from = join(folder, name);
      const where = `${shown}/${name}`;
      if (statSync(from).isDirectory()) {
        problem(where, 'is a folder; a year folder holds only drawings');
        continue;
      }
      const parsed = parseFileName(name);
      if (!parsed.ok) {
        problem(where, parsed.message);
        continue;
      }
      if (name.slice(0, 4) !== year) {
        problem(where, `dated ${name.slice(0, 4)} but in the ${year} folder`);
        continue;
      }
      const to = `drawings/${year}/${name}`;
      const replacing = existsSync(join(repo, to));
      if (replacing && !replace) {
        problem(where, `there's already a drawing for ${caption(parsed)} (${to}). To replace it, add --replace.`);
        continue;
      }
      const meta = await readJpeg(from);
      const thumb = meta && (await makeThumbnail(readFileSync(from)).catch(() => null));
      if (!thumb) {
        problem(where, 'isn\'t really a JPEG. Save it as a JPEG (on a Mac: open it in Preview, then File > Export, Format: JPEG).');
        continue;
      }
      if (!thumb.data) {
        problem(where, 'is too detailed for a thumbnail of at most 60 KB, so the site would stop building with it. Open an issue with the file attached.');
        continue;
      }
      counts[replacing ? 'replacing' : 'adding'] += 1;
      files.push({ from, to });
    }
    years.push(counts);
  }
  return { years, files, problems };
}

// Runs ./import with the given arguments in the repo folder `repo`. Prints with
// print(line) and asks with ask(question) → answer. Returns the exit code.
export async function importFolders(args, { repo, print, ask, cwd = process.cwd() }) {
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: {
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
    print(`Which folders? For example: ./import ../drawings/2025\n\n${HELP}`);
    return 1;
  }

  const fail = (message) => {
    print(message);
    print('Nothing changed.');
    return 1;
  };

  // 1. Checks first, after getting the latest version from GitHub.
  const notReady = getReady(repo, './import');
  if (notReady) return fail(notReady);
  print('Checking every drawing...');
  const { years, files, problems } = await checkFolders(positionals, { repo, cwd, replace: values.replace });
  if (problems.length > 0) {
    const n = problems.length;
    return fail([`Found ${plural(n, 'problem')}. Fix ${n === 1 ? 'it' : 'them'} and try again:`, ...problems.map((p) => `- ${p}`)].join('\n'));
  }

  // 2. Says what it will do and asks for a yes.
  print(describeImport(years));
  if (!values.yes && !isYes(await ask('Go ahead? (y/n) '))) {
    print('Nothing changed.');
    return 0;
  }

  // 3. Adds the files and sends them to GitHub in one commit; 4. undoes everything if that fails.
  print('Sending them to GitHub...');
  const names = years.map((y) => String(y.year));
  const problem = sendToGitHub(repo, files, `Import ${listed(names)} (${plural(files.length)})`, './import');
  if (problem) return fail(problem);
  print(`Imported ${plural(files.length)}. Live in about 2 minutes at:\n${names.map((y) => `${SITE}/${y}/`).join('\n')}`);
  return 0;
}

// Called by the ./import file in the repo folder.
export function main(args) {
  const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
  return importFolders(args, { repo, print: (line) => console.log(line), ask: askOnTerminal });
}
