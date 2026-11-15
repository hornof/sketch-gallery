// ./import: load one or more year folders (#15, R11 in the PRD, item 4 in the TDD's section 12).
// Every test that runs ./import runs it in a sandbox: a temporary clone and a temporary
// bare repo standing in for GitHub. Nothing here touches the real repo.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import sharp from 'sharp';
import { describe, expect, it, onTestFinished } from 'vitest';
import { HELP, describeImport, importFolders } from '../commands/import.mjs';
import { readDrawings } from '../build/drawings.mjs';
import { JPEG_A, JPEG_B, JPEG_C, blobId, git, makeSandbox } from './sandbox.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// A sandbox that is removed when the test ends, pass or fail.
function sandbox(files) {
  const sb = makeSandbox(files);
  onTestFinished(() => sb.remove());
  return sb;
}

// Runs importFolders() in a sandbox, collecting what it prints and every question it asks.
async function run(sb, args, { answer = 'y', onAsk } = {}) {
  const printed = [];
  const questions = [];
  const code = await importFolders(args, {
    repo: sb.laptop,
    print: (line) => printed.push(line),
    ask: async (q) => {
      questions.push(q);
      if (onAsk) onAsk();
      return answer;
    },
  });
  return { code, out: printed.join('\n'), questions };
}

// Takes a picture of everything ./import could change, to check that a refusal changes nothing.
function snapshot(sb) {
  return { remote: sb.remoteFiles(), remoteHead: sb.remoteHead(), laptopHead: sb.laptopHead(), status: sb.laptopStatus() };
}

const commitsOnGitHub = (sb) => Number(git(sb.remote, 'rev-list', '--count', 'main'));

// Counts the pushes GitHub's stand-in receives, from now on.
function countPushes(sb) {
  const log = join(sb.root, 'pushes.log');
  writeFileSync(log, '');
  writeFileSync(join(sb.remote, 'hooks', 'post-receive'), `#!/bin/sh\necho push >> '${log}'\n`, { mode: 0o755 });
  return () => readFileSync(log, 'utf8').split('\n').filter(Boolean).length;
}

const SITE = 'https://sketch-gallery.hornof.org';

describe('what ./import says it will do', () => {
  it('one new year', () => {
    expect(describeImport([{ year: 2025, adding: 31, replacing: 0, countBefore: 0 }])).toBe(
      'Importing 31 drawings in one commit:\n- 2025: adding 31 drawings, a new year (now 31 drawings)',
    );
  });

  it('one drawing into a year that has some', () => {
    expect(describeImport([{ year: 2026, adding: 1, replacing: 0, countBefore: 31 }])).toBe(
      'Importing 1 drawing in one commit:\n- 2026: adding 1 drawing (now 32 drawings)',
    );
  });

  it('adding and replacing in one year, and only replacing in another', () => {
    expect(describeImport([
      { year: 2024, adding: 2, replacing: 1, countBefore: 30 },
      { year: 2025, adding: 0, replacing: 3, countBefore: 3 },
      { year: 2026, adding: 0, replacing: 1, countBefore: 1 },
    ])).toBe([
      'Importing 7 drawings in one commit:',
      '- 2024: adding 2 drawings and replacing 1 drawing (now 32 drawings)',
      '- 2025: replacing 3 drawings (still 3 drawings)',
      '- 2026: replacing 1 drawing (still 1 drawing)',
    ].join('\n'));
  });

  it('counts every drawing, for any years', () => {
    const year = fc.record({
      year: fc.integer({ min: 1900, max: 2100 }),
      adding: fc.integer({ min: 0, max: 40 }),
      replacing: fc.integer({ min: 0, max: 40 }),
      countBefore: fc.integer({ min: 0, max: 40 }),
    }).filter((y) => y.adding + y.replacing > 0 && y.replacing <= y.countBefore);
    fc.assert(fc.property(fc.array(year, { minLength: 1, maxLength: 6 }), (years) => {
      const lines = describeImport(years).split('\n');
      const total = years.reduce((n, y) => n + y.adding + y.replacing, 0);
      expect(lines[0]).toBe(`Importing ${total} drawing${total === 1 ? '' : 's'} in one commit:`);
      expect(lines.length).toBe(years.length + 1);
      years.forEach((y, i) => {
        const after = y.countBefore + y.adding;
        expect(lines[i + 1].startsWith(`- ${y.year}: `)).toBe(true);
        expect(lines[i + 1].endsWith(`${after} drawing${after === 1 ? '' : 's'})`)).toBe(true);
        expect(lines[i + 1].includes('a new year')).toBe(y.countBefore === 0);
      });
    }), { numRuns: 500 });
  });
});

describe('importing folders', () => {
  it('adds a year folder in one commit and one push, and prints the year\'s link', async () => {
    const sb = sandbox({ 'drawings/2026/2026-02-28.jpg': JPEG_B });
    const pushes = countPushes(sb);
    const before = sb.remoteFiles();
    const commits = commitsOnGitHub(sb);
    const folder = sb.sourceFolder('2025', { '2025-10-07.jpg': JPEG_A, '2025-12-31.jpg': JPEG_C });
    const r = await run(sb, [folder]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('Importing 2 drawings in one commit:\n- 2025: adding 2 drawings, a new year (now 2 drawings)');
    expect(r.questions).toEqual(['Go ahead? (y/n) ']);
    expect(r.out).toContain(`Imported 2 drawings. Live in about 2 minutes at:\n${SITE}/2025/`);
    expect(sb.remoteFiles()).toEqual({
      ...before,
      'drawings/2025/2025-10-07.jpg': blobId(JPEG_A),
      'drawings/2025/2025-12-31.jpg': blobId(JPEG_C),
    });
    expect(commitsOnGitHub(sb)).toBe(commits + 1);
    expect(pushes()).toBe(1);
    expect(git(sb.remote, 'log', '-1', '--format=%s', 'main')).toBe('Import 2025 (2 drawings)');
    expect(sb.laptopStatus()).toBe('');
  });

  it('adds several year folders in one commit and one push, even before there is a drawings folder', async () => {
    const sb = sandbox();
    const pushes = countPushes(sb);
    const commits = commitsOnGitHub(sb);
    const folders = [
      sb.sourceFolder('2024', { '2024-02-29.jpg': JPEG_C }),
      sb.sourceFolder('2025', { '2025-10-07.jpg': JPEG_A, '2025-12-31.jpg': JPEG_B }),
      sb.sourceFolder('2026', { '2026-02-28.jpg': JPEG_B }),
    ];
    const r = await run(sb, folders);
    expect(r.code).toBe(0);
    expect(r.out).toContain([
      'Importing 4 drawings in one commit:',
      '- 2024: adding 1 drawing, a new year (now 1 drawing)',
      '- 2025: adding 2 drawings, a new year (now 2 drawings)',
      '- 2026: adding 1 drawing, a new year (now 1 drawing)',
    ].join('\n'));
    expect(r.out).toContain(`Imported 4 drawings. Live in about 2 minutes at:\n${SITE}/2024/\n${SITE}/2025/\n${SITE}/2026/`);
    expect(Object.keys(sb.remoteFiles()).filter((p) => p.startsWith('drawings/')).sort()).toEqual([
      'drawings/2024/2024-02-29.jpg', 'drawings/2025/2025-10-07.jpg', 'drawings/2025/2025-12-31.jpg', 'drawings/2026/2026-02-28.jpg',
    ]);
    expect(commitsOnGitHub(sb)).toBe(commits + 1);
    expect(pushes()).toBe(1);
    expect(git(sb.remote, 'log', '-1', '--format=%s', 'main')).toBe('Import 2024, 2025 and 2026 (4 drawings)');
  });

  it('names two years with "and"', async () => {
    const sb = sandbox();
    const r = await run(sb, [sb.sourceFolder('2024', { '2024-02-29.jpg': JPEG_C }), sb.sourceFolder('2025', { '2025-10-07.jpg': JPEG_A })]);
    expect(r.code).toBe(0);
    expect(git(sb.remote, 'log', '-1', '--format=%s', 'main')).toBe('Import 2024 and 2025 (2 drawings)');
  });

  it('adds drawings to a year that already has some, keeping the others', async () => {
    const sb = sandbox({ 'drawings/2025/2025-01-01.jpg': JPEG_B, 'drawings/2025/2025-06-01.jpg': JPEG_B });
    const before = sb.remoteFiles();
    const r = await run(sb, [sb.sourceFolder('2025', { '2025-10-07.jpg': JPEG_A })]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('- 2025: adding 1 drawing (now 3 drawings)');
    expect(sb.remoteFiles()).toEqual({ ...before, 'drawings/2025/2025-10-07.jpg': blobId(JPEG_A) });
  });

  it('takes a folder written with a slash at the end, and leaves out hidden files like .DS_Store', async () => {
    const sb = sandbox();
    const folder = sb.sourceFolder('2025', { '2025-10-07.jpg': JPEG_A, '.DS_Store': 'mac notes' });
    const r = await run(sb, [`${folder}/`]);
    expect(r.code).toBe(0);
    expect(Object.keys(sb.remoteFiles()).filter((p) => p.startsWith('drawings/'))).toEqual(['drawings/2025/2025-10-07.jpg']);
  });

  it('--yes skips the question', async () => {
    const sb = sandbox();
    const r = await run(sb, [sb.sourceFolder('2025', { '2025-10-07.jpg': JPEG_A }), '--yes']);
    expect(r.code).toBe(0);
    expect(r.questions).toEqual([]);
    expect(r.out).toContain('Importing 1 drawing in one commit:');
    expect(Object.keys(sb.remoteFiles())).toContain('drawings/2025/2025-10-07.jpg');
  });

  it('answering anything but yes changes nothing', async () => {
    for (const answer of ['n', '', 'no', 'maybe']) {
      const sb = sandbox();
      const before = snapshot(sb);
      const r = await run(sb, [sb.sourceFolder('2025', { '2025-10-07.jpg': JPEG_A })], { answer });
      expect(r.code).toBe(0);
      expect(r.out).toContain('Nothing changed.');
      expect(snapshot(sb)).toEqual(before);
    }
  });

  it('"y", "yes" and "Y" all go ahead', async () => {
    for (const answer of ['y', 'yes', 'Y', ' Yes ']) {
      const sb = sandbox();
      const r = await run(sb, [sb.sourceFolder('2025', { '2025-10-07.jpg': JPEG_A })], { answer });
      expect(r.code).toBe(0);
      expect(Object.keys(sb.remoteFiles())).toContain('drawings/2025/2025-10-07.jpg');
    }
  });

  it('gets the latest version from GitHub first', async () => {
    const sb = sandbox();
    sb.pushFromElsewhere('drawings/2025/2025-01-01.jpg', JPEG_B);
    const r = await run(sb, [sb.sourceFolder('2025', { '2025-10-07.jpg': JPEG_A })]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('- 2025: adding 1 drawing (now 2 drawings)');
    expect(Object.keys(sb.remoteFiles()).filter((p) => p.startsWith('drawings/')).sort()).toEqual([
      'drawings/2025/2025-01-01.jpg', 'drawings/2025/2025-10-07.jpg',
    ]);
  });

  it('leaves the owner\'s other work alone, and sends only the drawings', async () => {
    const sb = sandbox();
    writeFileSync(join(sb.laptop, 'README.md'), 'my own edit\n');
    const r = await run(sb, [sb.sourceFolder('2025', { '2025-10-07.jpg': JPEG_A })]);
    expect(r.code).toBe(0);
    expect(sb.laptopStatus()).toBe(' M README.md');
    expect(sb.remoteFiles()['README.md']).toBe(blobId('sandbox\n'));
  });

  it('leaves the source folders as they were', async () => {
    const sb = sandbox();
    const folder = sb.sourceFolder('2025', { '2025-10-07.jpg': JPEG_A });
    await run(sb, [folder]);
    expect(readdirSync(folder)).toEqual(['2025-10-07.jpg']);
    expect(readFileSync(join(folder, '2025-10-07.jpg'))).toEqual(JPEG_A);
  });
});

describe('a date that already has a drawing', () => {
  it('is refused without --replace, replaced with it, and every other drawing stays the same', async () => {
    const sb = sandbox({ 'drawings/2025/2025-10-07.jpg': JPEG_B, 'drawings/2025/2025-01-01.jpg': JPEG_B });
    const folder = sb.sourceFolder('2025', { '2025-10-07.jpg': JPEG_A, '2025-12-31.jpg': JPEG_C });
    const before = snapshot(sb);
    const refused = await run(sb, [folder]);
    expect(refused.code).toBe(1);
    expect(refused.out).toContain(`- ${join(folder, '2025-10-07.jpg')}: there's already a drawing for October 7, 2025 (drawings/2025/2025-10-07.jpg). To replace it, add --replace.`);
    expect(refused.out).not.toContain('2025-12-31.jpg:');
    expect(snapshot(sb)).toEqual(before);

    const replaced = await run(sb, [folder, '--replace']);
    expect(replaced.code).toBe(0);
    expect(replaced.out).toContain('- 2025: adding 1 drawing and replacing 1 drawing (now 3 drawings)');
    expect(sb.remoteFiles()).toEqual({
      ...before.remote,
      'drawings/2025/2025-10-07.jpg': blobId(JPEG_A),
      'drawings/2025/2025-12-31.jpg': blobId(JPEG_C),
    });
  });
});

describe('problems: lists every one and changes nothing', () => {
  async function refused(sb, args) {
    const before = snapshot(sb);
    const r = await run(sb, args);
    expect(r.code).toBe(1);
    expect(r.questions).toEqual([]);
    expect(r.out).toContain('Nothing changed.');
    expect(r.out).not.toContain('Live in about 2 minutes');
    expect(snapshot(sb)).toEqual(before);
    return r;
  }
  // The lines naming problems: each starts with "- ".
  const problemLines = (out) => out.split('\n').filter((l) => l.startsWith('- '));

  it('one badly named file in any folder adds nothing from any folder, and names that file', async () => {
    const sb = sandbox();
    const good = sb.sourceFolder('2024', { '2024-02-29.jpg': JPEG_C });
    const bad = sb.sourceFolder('2025', { '2025-10-07.jpg': JPEG_A, 'IMG_1234.jpg': JPEG_A });
    const r = await refused(sb, [good, bad]);
    expect(r.out.split('\n')[0]).toBe('Found 1 problem. Fix it and try again:');
    expect(problemLines(r.out)).toEqual([
      `- ${join(bad, 'IMG_1234.jpg')}: "IMG_1234.jpg" isn't named like 2025-10-07.jpg (year-month-day.jpg)`,
    ]);
  });

  it('lists every problem in every folder at once', async () => {
    const sb = sandbox({ 'drawings/2025/2025-03-01.jpg': JPEG_B });
    const noise = await sharp({ create: { width: 1000, height: 1000, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 120 } } })
      .jpeg({ quality: 95 }).toBuffer();
    const y2025 = sb.sourceFolder('2025', {
      '2025-01-01.jpg': JPEG_A, // fine
      '2025-02-30.jpg': JPEG_A, // not a real date
      '2024-12-31.jpg': JPEG_A, // wrong year
      '2025-03-01.jpg': JPEG_A, // already has a drawing
      '2025-04-01.jpg': 'not a picture',
      '2025-05-01.jpg': noise, // too detailed
      'photos': null, // a folder
    });
    const empty = sb.sourceFolder('2023');
    const missing = join(sb.root, 'nowhere', '2022');
    const notYear = sb.sourceFolder('placeholders', { '2021-01-01.jpg': JPEG_A });
    const file = sb.sourceFile('2020', 'a file');
    const r = await refused(sb, [y2025, empty, missing, notYear, file]);
    expect(r.out.split('\n')[0]).toBe('Found 10 problems. Fix them and try again:');
    expect(problemLines(r.out)).toEqual([
      `- ${join(y2025, '2024-12-31.jpg')}: dated 2024 but in the 2025 folder`,
      `- ${join(y2025, '2025-02-30.jpg')}: "2025-02-30.jpg": 2025-02-30 isn't a real date`,
      `- ${join(y2025, '2025-03-01.jpg')}: there's already a drawing for March 1, 2025 (drawings/2025/2025-03-01.jpg). To replace it, add --replace.`,
      `- ${join(y2025, '2025-04-01.jpg')}: isn't really a JPEG. Save it as a JPEG (on a Mac: open it in Preview, then File > Export, Format: JPEG).`,
      `- ${join(y2025, '2025-05-01.jpg')}: is too detailed for a thumbnail of at most 60 KB, so the site would stop building with it. Open an issue with the file attached.`,
      `- ${join(y2025, 'photos')}: is a folder; a year folder holds only drawings`,
      `- ${empty}: is empty; a year folder needs at least one drawing`,
      `- ${missing}: can't find this folder`,
      `- ${notYear}: isn't a year folder. Give the year folders inside it, or name it after its year, like 2025.`,
      `- ${file}: is a file, not a year folder`,
    ]);
  });

  it('the same year given twice', async () => {
    const sb = sandbox();
    const first = sb.sourceFolder('2025', { '2025-10-07.jpg': JPEG_A });
    const second = sb.sourceFolder('2025', { '2025-12-31.jpg': JPEG_A });
    const r = await refused(sb, [first, second]);
    expect(problemLines(r.out)).toEqual([`- ${second}: 2025 is given twice. Put that year's drawings in one folder.`]);
  });

  it('the same folder given twice', async () => {
    const sb = sandbox();
    const folder = sb.sourceFolder('2025', { '2025-10-07.jpg': JPEG_A });
    const r = await refused(sb, [folder, folder]);
    expect(problemLines(r.out)).toEqual([`- ${folder}: 2025 is given twice. Put that year's drawings in one folder.`]);
  });

  it('a JPEG damaged inside its picture data', async () => {
    const sb = sandbox();
    const damaged = Buffer.from(JPEG_A);
    damaged.fill(0xff, Math.floor(damaged.length * 0.5), damaged.length - 2);
    const folder = sb.sourceFolder('2025', { '2025-10-07.jpg': damaged });
    const r = await refused(sb, [folder]);
    expect(problemLines(r.out)[0]).toContain(`${join(folder, '2025-10-07.jpg')}: isn't really a JPEG`);
  });

  it('not on main: names ./import, not ./add', async () => {
    const sb = sandbox();
    git(sb.laptop, 'switch', '-q', '-c', 'my-branch');
    const r = await refused(sb, [sb.sourceFolder('2025', { '2025-10-07.jpg': JPEG_A })]);
    expect(r.out).toContain('./import works on main, and this copy of the repo is on my-branch. Switch with: git switch main');
  });

  it('unsent changes in the drawings folder', async () => {
    const sb = sandbox({ 'drawings/2026/2026-02-28.jpg': JPEG_B });
    writeFileSync(join(sb.laptop, 'drawings', '2026', '2026-03-01.jpg'), JPEG_A);
    const r = await refused(sb, [sb.sourceFolder('2025', { '2025-10-07.jpg': JPEG_A })]);
    expect(r.out).toContain('The drawings folder has changes that aren\'t on GitHub yet: drawings/2026/2026-03-01.jpg');
  });

  it('commits on main that are not on GitHub yet', async () => {
    const sb = sandbox();
    writeFileSync(join(sb.laptop, 'notes.txt'), 'mine\n');
    git(sb.laptop, 'add', 'notes.txt');
    git(sb.laptop, 'commit', '-q', '-m', 'Mine');
    const r = await refused(sb, [sb.sourceFolder('2025', { '2025-10-07.jpg': JPEG_A })]);
    expect(r.out).toContain('main has 1 commit that isn\'t on GitHub yet. Send it with git push, or remove it, then try again.');
  });
});

describe('when the push fails, everything is undone', () => {
  it('every new year folder is gone, the old drawings are back, and it says to try ./import again', async () => {
    const sb = sandbox({ 'drawings/2025/2025-10-07.jpg': JPEG_B });
    const status = sb.laptopStatus();
    const laptopHead = sb.laptopHead();
    const remote = sb.remoteFiles();
    sb.refusePushes();
    const r = await run(sb, [
      sb.sourceFolder('2024', { '2024-02-29.jpg': JPEG_C }),
      sb.sourceFolder('2025', { '2025-10-07.jpg': JPEG_A, '2025-12-31.jpg': JPEG_A }),
      '--replace',
    ]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('Couldn\'t send it to GitHub. Check the internet connection, then try ./import again.');
    expect(r.out).toContain('Nothing changed.');
    expect(r.out).not.toContain('Live in about 2 minutes');
    expect(sb.laptopHead()).toBe(laptopHead);
    expect(sb.laptopStatus()).toBe(status);
    expect(sb.remoteFiles()).toEqual(remote);
    expect(existsSync(join(sb.laptop, 'drawings', '2024'))).toBe(false);
    expect(existsSync(join(sb.laptop, 'drawings', '2025', '2025-12-31.jpg'))).toBe(false);
    expect(readFileSync(join(sb.laptop, 'drawings', '2025', '2025-10-07.jpg'))).toEqual(JPEG_B);
  });

  it('someone changed GitHub while the question was waiting: try again, and it works', async () => {
    const sb = sandbox();
    const folder = sb.sourceFolder('2025', { '2025-10-07.jpg': JPEG_A });
    const r = await run(sb, [folder], { onAsk: () => sb.pushFromElsewhere('drawings/2025/2025-01-01.jpg', JPEG_B) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('Someone changed GitHub in the meantime. Try ./import again.');
    expect(sb.laptopStatus()).toBe('');
    const again = await run(sb, [folder]);
    expect(again.code).toBe(0);
    expect(Object.keys(sb.remoteFiles()).filter((p) => p.startsWith('drawings/')).sort()).toEqual([
      'drawings/2025/2025-01-01.jpg', 'drawings/2025/2025-10-07.jpg',
    ]);
  });
});

describe('random folders: all of them or none of them', () => {
  // Each file in a random folder is one of these kinds. Only "good" files, and "existing"
  // ones when --replace is given, are allowed; every other kind is a problem.
  const kind = fc.constantFrom('good', 'good', 'good', 'badName', 'wrongYear', 'notJpeg', 'existing', 'folder');

  it('adds every folder it is given, or none of them, and names every problem', async () => {
    await fc.assert(fc.asyncProperty(
      fc.uniqueArray(fc.integer({ min: 2000, max: 2030 }), { minLength: 1, maxLength: 3 }).chain((years) =>
        fc.tuple(fc.constant(years), fc.array(fc.array(kind, { maxLength: 4 }), { minLength: years.length, maxLength: years.length }), fc.boolean()),
      ),
      async ([years, kindsPerYear, replace]) => {
        // Already on GitHub: one drawing for each "existing" file, plus one unrelated drawing.
        const seed = { 'drawings/1999/1999-01-01.jpg': JPEG_B };
        const plan = years.map((year, i) => kindsPerYear[i].map((k, j) => {
          const day = String(j + 1).padStart(2, '0');
          const name = {
            good: `${year}-01-${day}.jpg`,
            badName: `photo ${j}.jpg`,
            wrongYear: `${year - 1}-01-${day}.jpg`,
            notJpeg: `${year}-02-${day}.jpg`,
            existing: `${year}-03-${day}.jpg`,
            folder: `sub ${j}`,
          }[k];
          if (k === 'existing') seed[`drawings/${year}/${name}`] = JPEG_B;
          return { k, name };
        }));
        const sb = makeSandbox(seed);
        try {
          const folders = years.map((year, i) => sb.sourceFolder(String(year), Object.fromEntries(plan[i].map(({ k, name }) => {
            if (k === 'folder') return [name, null];
            return [name, k === 'notJpeg' ? 'not a picture' : JPEG_C];
          }))));
          // The oracle: which paths are problems, worked out from how the folders were made.
          const expectedProblems = [];
          folders.forEach((folder, i) => {
            if (plan[i].length === 0) expectedProblems.push(folder);
            for (const { k, name } of plan[i]) {
              if (k === 'good' || (k === 'existing' && replace)) continue;
              expectedProblems.push(join(folder, name));
            }
          });
          const before = snapshot(sb);
          const r = await run(sb, [...folders, ...(replace ? ['--replace'] : [])]);
          if (expectedProblems.length > 0) {
            expect(r.code).toBe(1);
            expect(snapshot(sb)).toEqual(before);
            // Each problem line is "- <path>: <what's wrong>"; the temporary paths have no ": " in them.
            const named = r.out.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2, l.indexOf(': ')));
            expect(named.sort()).toEqual([...expectedProblems].sort());
            return;
          }
          expect(r.code).toBe(0);
          const added = Object.fromEntries(years.flatMap((year, i) => plan[i].map(({ name }) => [`drawings/${year}/${name}`, blobId(JPEG_C)])));
          expect(sb.remoteFiles()).toEqual({ ...before.remote, ...added });
          expect(Number(git(sb.remote, 'rev-list', '--count', `${before.remoteHead}..main`))).toBe(1);
          // The build reads what was sent with no problems.
          const checkout = join(sb.root, 'check');
          git(sb.root, 'clone', '-q', sb.remote, checkout);
          const { problems } = await readDrawings(join(checkout, 'drawings'));
          expect(problems).toEqual([]);
        } finally {
          sb.remove();
        }
      },
    ), { numRuns: 20 });
  }, 120_000);
});

describe('how ./import is run, before it looks at the repo', () => {
  // These never reach git: a repo folder that doesn't exist would make git fail.
  const runHere = (args) => run({ laptop: '/nonexistent-repo' }, args);

  it('--help and -h print the help', async () => {
    for (const flag of ['--help', '-h']) {
      const r = await runHere([flag]);
      expect(r.code).toBe(0);
      expect(r.out).toBe(HELP);
    }
  });

  it('no folder, or an unknown option, is refused with how to use it', async () => {
    const none = await runHere([]);
    expect(none.code).toBe(1);
    expect(none.out).toContain('Which folders? For example: ./import ../drawings/2025');
    expect(none.out).toContain(HELP);
    const unknown = await runHere(['2025', '--force']);
    expect(unknown.code).toBe(1);
    expect(unknown.out).toContain('--force');
    expect(unknown.out).toContain(HELP);
  });
});

describe('the ./import command', () => {
  const runCli = (...args) => spawnSync(join(repoRoot, 'import'), args, { cwd: repoRoot, encoding: 'utf8', input: '' });

  it('--help says how to use it and changes nothing', () => {
    const r = runCli('--help');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('./import ../drawings/2024 ../drawings/2025');
    expect(r.stdout).toContain('--replace');
    expect(r.stdout).toContain('--yes');
  });

  it('with no folder, says how to use it', () => {
    const r = runCli();
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('Which folders? For example: ./import ../drawings/2025');
  });
});
