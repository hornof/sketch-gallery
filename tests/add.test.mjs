// ./add: add one drawing (#14, R12 in the PRD, item 3 in the TDD's section 12).
// Every test that runs ./add runs it in a sandbox: a temporary clone and a temporary
// bare repo standing in for GitHub. Nothing here touches the real repo.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import sharp from 'sharp';
import { describe, expect, it, onTestFinished } from 'vitest';
import { HELP, add, chooseDate, describeAdd, drawingLink } from '../commands/add.mjs';
import { readDrawings } from '../build/drawings.mjs';
import { JPEG_A, JPEG_B, JPEG_C, blobId, git, makeSandbox } from './sandbox.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// A sandbox that is removed when the test ends, pass or fail.
function sandbox(files) {
  const sb = makeSandbox(files);
  onTestFinished(() => sb.remove());
  return sb;
}

// Runs add() in a sandbox, collecting what it prints and every question it asks.
async function run(sb, args, { answer = 'y', onAsk } = {}) {
  const printed = [];
  const questions = [];
  const code = await add(args, {
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

// Takes a picture of everything ./add could change, to check that a refusal changes nothing.
function snapshot(sb) {
  return { remote: sb.remoteFiles(), remoteHead: sb.remoteHead(), laptopHead: sb.laptopHead(), status: sb.laptopStatus() };
}

// Independent check of a date: the calendar as JavaScript's Date sees it.
function realDate(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return false;
  const [y, mo, d] = m.slice(1).map(Number);
  const dt = new Date(0);
  dt.setUTCFullYear(y, mo - 1, d);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

const dateText = fc.record({
  y: fc.integer({ min: 1900, max: 2100 }),
  m: fc.integer({ min: 0, max: 13 }),
  d: fc.integer({ min: 0, max: 32 }),
}).map(({ y, m, d }) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

const realDateText = fc.date({ min: new Date('2000-01-01T00:00:00Z'), max: new Date('2030-12-31T00:00:00Z'), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10));

describe('choosing the date', () => {
  it('turns any file name into a real date or refuses it with a message', () => {
    // A file name is anything without a slash, other than "", "." and "..".
    const name = fc.oneof(
      fc.string({ minLength: 1 }).filter((n) => !n.includes('/') && n !== '.' && n !== '..'),
      dateText.map((t) => `${t}.jpg`),
      fc.tuple(dateText, fc.constantFrom('.JPG', '.jpeg', '.png', '', '.jpg.jpg')).map(([t, ext]) => `${t}${ext}`),
    );
    fc.assert(fc.property(name, (n) => {
      const r = chooseDate(`/some/folder/${n}`);
      expect(r.ok).toBe(n.endsWith('.jpg') && realDate(n.slice(0, -4)));
      if (r.ok) expect(r.date).toBe(n.slice(0, 10));
      else {
        expect(r.message).toContain(JSON.stringify(n));
        expect(r.message).toContain('--date');
      }
    }), { numRuns: 2000 });
  });

  it('takes --date over the file name, and refuses a --date that is not a real date', () => {
    fc.assert(fc.property(fc.oneof(fc.string(), dateText), fc.string(), (date, n) => {
      const r = chooseDate(`/x/${n}`, date);
      expect(r.ok).toBe(realDate(date));
      if (r.ok) expect(r.date).toBe(date);
      else expect(r.message).toContain(`--date ${date}`);
    }), { numRuns: 2000 });
  });

  it('gives the year, month and day', () => {
    expect(chooseDate('2026-11-03.jpg')).toEqual({ ok: true, year: 2026, month: 11, day: 3, date: '2026-11-03' });
    expect(chooseDate('photo.jpeg', '2024-02-29')).toEqual({ ok: true, year: 2024, month: 2, day: 29, date: '2024-02-29' });
  });

  it('explains how to fix a file not named by date', () => {
    const r = chooseDate('/Users/me/Desktop/IMG_1234.jpg');
    expect(r.ok).toBe(false);
    expect(r.message).toBe('"IMG_1234.jpg" isn\'t named like 2025-10-07.jpg (year-month-day.jpg). Rename it, or give the date: ./add IMG_1234.jpg --date 2026-11-03');
  });

  it('explains a --date that is not a real date', () => {
    expect(chooseDate('photo.jpg', '2026-02-29')).toEqual({ ok: false, message: '--date 2026-02-29 isn\'t a real date written like 2026-11-03 (year-month-day)' });
  });
});

describe('what ./add says', () => {
  it('matches the PRD\'s example', () => {
    expect(describeAdd({ date: '2026-11-03', countBefore: 31, replacing: false })).toBe('Adding November 3, 2026 to 2026 (now 32 drawings)');
  });

  it('says when it replaces a drawing, and when the year is new', () => {
    expect(describeAdd({ date: '2026-11-03', countBefore: 32, replacing: true })).toBe('Replacing November 3, 2026 in 2026 (still 32 drawings)');
    expect(describeAdd({ date: '2027-01-01', countBefore: 0, replacing: false })).toBe('Adding January 1, 2027 to 2027, a new year (now 1 drawing)');
    expect(describeAdd({ date: '2026-11-03', countBefore: 1, replacing: true })).toBe('Replacing November 3, 2026 in 2026 (still 1 drawing)');
  });

  it('links to the drawing on the site', () => {
    fc.assert(fc.property(realDateText, (date) => {
      expect(drawingLink(date)).toBe(`https://sketch-gallery.hornof.org/${date.slice(0, 4)}/#${date}`);
    }));
  });
});

describe('adding a drawing', () => {
  it('adds the file to its year, sends it to GitHub and prints the link', async () => {
    const sb = sandbox({ 'drawings/2026/2026-02-28.jpg': JPEG_B, 'drawings/2025/2025-12-31.jpg': JPEG_A });
    const before = sb.remoteFiles();
    const src = sb.sourceFile('2026-11-03.jpg', JPEG_C);
    const r = await run(sb, [src]);
    expect(r.code).toBe(0);
    expect(r.questions).toEqual(['Adding November 3, 2026 to 2026 (now 2 drawings). Go ahead? (y/n) ']);
    expect(r.out).toContain('Added November 3, 2026. Live in about 2 minutes at:\nhttps://sketch-gallery.hornof.org/2026/#2026-11-03');
    expect(sb.remoteFiles()).toEqual({ ...before, 'drawings/2026/2026-11-03.jpg': blobId(JPEG_C) });
    expect(sb.laptopHead()).toBe(sb.remoteHead());
    expect(sb.laptopStatus()).toBe('');
    expect(git(sb.remote, 'log', '-1', '--format=%s', 'main')).toBe('Add November 3, 2026');
    expect(readFileSync(src)).toEqual(JPEG_C); // the original is left where it was
  });

  it('--date gives a file not named by date its date', async () => {
    const sb = sandbox({ 'drawings/2026/2026-02-28.jpg': JPEG_B });
    const before = sb.remoteFiles();
    const r = await run(sb, [sb.sourceFile('IMG_1234.jpeg', JPEG_C), '--date', '2026-11-03']);
    expect(r.code).toBe(0);
    expect(sb.remoteFiles()).toEqual({ ...before, 'drawings/2026/2026-11-03.jpg': blobId(JPEG_C) });
  });

  it('starts a new year, even before there is a drawings folder', async () => {
    const sb = sandbox();
    const r = await run(sb, [sb.sourceFile('2027-01-01.jpg', JPEG_A)]);
    expect(r.code).toBe(0);
    expect(r.questions[0]).toContain('Adding January 1, 2027 to 2027, a new year (now 1 drawing)');
    expect(sb.remoteFiles()['drawings/2027/2027-01-01.jpg']).toBe(blobId(JPEG_A));
  });

  it('--yes skips the question', async () => {
    const sb = sandbox();
    const r = await run(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A), '--yes']);
    expect(r.code).toBe(0);
    expect(r.questions).toEqual([]);
    expect(r.out).toContain('Adding November 3, 2026 to 2026, a new year (now 1 drawing)');
    expect(sb.remoteFiles()['drawings/2026/2026-11-03.jpg']).toBe(blobId(JPEG_A));
  });

  it.each(['y', 'Y', 'yes', ' YES '])('takes %j as a yes', async (answer) => {
    const sb = sandbox();
    const r = await run(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)], { answer });
    expect(r.code).toBe(0);
    expect(sb.remoteFiles()['drawings/2026/2026-11-03.jpg']).toBe(blobId(JPEG_A));
  });

  it.each(['n', '', 'no', 'yep', 'maybe', 'nay', 'yes please'])('changes nothing on the answer %j', async (answer) => {
    const sb = sandbox({ 'drawings/2026/2026-02-28.jpg': JPEG_B });
    const before = snapshot(sb);
    const r = await run(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)], { answer });
    expect(r.code).toBe(0);
    expect(r.out).toContain('Nothing changed.');
    expect(snapshot(sb)).toEqual(before);
  });

  it('gets the latest version from GitHub first', async () => {
    const sb = sandbox({ 'drawings/2026/2026-02-28.jpg': JPEG_B });
    sb.pushFromElsewhere('drawings/2026/2026-03-01.jpg', JPEG_A);
    const r = await run(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_C)]);
    expect(r.code).toBe(0);
    expect(r.questions[0]).toContain('(now 3 drawings)');
    expect(Object.keys(sb.remoteFiles()).filter((p) => p.startsWith('drawings/'))).toEqual([
      'drawings/2026/2026-02-28.jpg', 'drawings/2026/2026-03-01.jpg', 'drawings/2026/2026-11-03.jpg',
    ]);
    expect(sb.laptopHead()).toBe(sb.remoteHead());
  });

  it('leaves the owner\'s other work alone, and sends only the drawing', async () => {
    const sb = sandbox();
    writeFileSync(join(sb.laptop, 'README.md'), 'my own edit\n');
    writeFileSync(join(sb.laptop, 'notes.txt'), 'staged\n');
    git(sb.laptop, 'add', 'notes.txt');
    const r = await run(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)]);
    expect(r.code).toBe(0);
    expect(Object.keys(sb.remoteFiles()).sort()).toEqual(['README.md', 'drawings/2026/2026-11-03.jpg']);
    expect(readFileSync(join(sb.laptop, 'README.md'), 'utf8')).toBe('my own edit\n');
    expect(sb.laptopStatus().split('\n').sort()).toEqual([' M README.md', 'A  notes.txt']);
  });
});

describe('a date that already has a drawing', () => {
  it('is refused without --replace, replaced with it, and every other drawing stays the same', async () => {
    const sb = sandbox({ 'drawings/2026/2026-02-28.jpg': JPEG_B, 'drawings/2025/2025-12-31.jpg': JPEG_A });
    // First direction: add a new date.
    expect((await run(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)])).code).toBe(0);
    const afterAdd = snapshot(sb);

    // The same date again, without --replace: refused before the question, nothing changed.
    const refused = await run(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_C)]);
    expect(refused.code).toBe(1);
    expect(refused.questions).toEqual([]);
    expect(refused.out).toContain('There\'s already a drawing for November 3, 2026 (drawings/2026/2026-11-03.jpg). To replace it, add --replace.');
    expect(refused.out).toContain('Nothing changed.');
    expect(snapshot(sb)).toEqual(afterAdd);

    // The same date with --replace: replaced; the others stay the same.
    const replaced = await run(sb, [sb.sourceFile('photo.jpg', JPEG_C), '--date', '2026-11-03', '--replace']);
    expect(replaced.code).toBe(0);
    expect(replaced.questions).toEqual(['Replacing November 3, 2026 in 2026 (still 2 drawings). Go ahead? (y/n) ']);
    expect(replaced.out).toContain('Replaced November 3, 2026. Live in about 2 minutes at:\nhttps://sketch-gallery.hornof.org/2026/#2026-11-03');
    expect(sb.remoteFiles()).toEqual({ ...afterAdd.remote, 'drawings/2026/2026-11-03.jpg': blobId(JPEG_C) });
    expect(git(sb.remote, 'log', '-1', '--format=%s', 'main')).toBe('Replace November 3, 2026');
    expect(sb.laptopHead()).toBe(sb.remoteHead());
  });

  it('--replace on a new date simply adds it', async () => {
    const sb = sandbox({ 'drawings/2026/2026-02-28.jpg': JPEG_B });
    const r = await run(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A), '--replace']);
    expect(r.code).toBe(0);
    expect(r.questions[0]).toContain('Adding November 3, 2026 to 2026 (now 2 drawings)');
  });
});

describe('random drawings', () => {
  it('adding one leaves every other drawing unchanged, and the year stays in date order', async () => {
    await fc.assert(fc.asyncProperty(
      fc.uniqueArray(realDateText, { minLength: 0, maxLength: 6 }),
      realDateText,
      fc.boolean(),
      async (existing, date, replace) => {
        const files = Object.fromEntries(existing.map((d) => [`drawings/${d.slice(0, 4)}/${d}.jpg`, JPEG_B]));
        // Each run's sandbox is removed as soon as the run ends, not at the end of the test.
        const sb = makeSandbox(files);
        try {
          const before = sb.remoteFiles();
          const exists = existing.includes(date);
          const r = await run(sb, [sb.sourceFile(`${date}.jpg`, JPEG_C), ...(replace ? ['--replace'] : [])]);
          if (exists && !replace) {
            expect(r.code).toBe(1);
            expect(sb.remoteFiles()).toEqual(before);
            return;
          }
          expect(r.code).toBe(0);
          // Every other file is the same, and the new one is in its year's folder.
          expect(sb.remoteFiles()).toEqual({ ...before, [`drawings/${date.slice(0, 4)}/${date}.jpg`]: blobId(JPEG_C) });
          // The build reads the year in date order, with the new drawing in its place.
          const checkout = join(sb.root, 'check');
          git(sb.root, 'clone', '-q', sb.remote, checkout);
          const { drawings, problems } = await readDrawings(join(checkout, 'drawings'));
          expect(problems).toEqual([]);
          const year = date.slice(0, 4);
          const expected = [...new Set([...existing, date])].filter((d) => d.startsWith(year)).sort();
          expect(drawings.filter((d) => String(d.year) === year).map((d) => d.date)).toEqual(expected);
        } finally {
          sb.remove();
        }
      },
    ), { numRuns: 12 });
  }, 60_000);
});

describe('problems: says what is wrong and changes nothing', () => {
  async function refused(sb, args, expected) {
    const before = snapshot(sb);
    const r = await run(sb, args);
    expect(r.code).toBe(1);
    expect(r.questions).toEqual([]);
    expect(r.out).toContain(expected);
    expect(r.out).toContain('Nothing changed.');
    expect(snapshot(sb)).toEqual(before);
    return r;
  }

  it('a file that does not exist', async () => {
    const sb = sandbox();
    await refused(sb, [join(sb.root, '2026-11-03.jpg')], `Can't find ${join(sb.root, '2026-11-03.jpg')}`);
  });

  it('a folder instead of a file', async () => {
    const sb = sandbox();
    await refused(sb, [sb.root, '--date', '2026-11-03'], `${sb.root} is a folder, not a drawing`);
  });

  const SAVE_AS_JPEG = 'Save it as a JPEG and try again (on a Mac: open it in Preview, then File > Export, Format: JPEG).';

  it('a file that is not really a JPEG, and how to fix it', async () => {
    const sb = sandbox();
    await refused(sb, [sb.sourceFile('2026-11-03.jpg', 'not a picture')], `2026-11-03.jpg isn't really a JPEG. ${SAVE_AS_JPEG}`);
  });

  it('an iPhone photo saved as HEIC, and how to fix it', async () => {
    const sb = sandbox();
    // A HEIC file starts with an "ftyp" box naming the heic brand.
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic\0\0\0\0mif1heic'), Buffer.alloc(200)]);
    await refused(sb, [sb.sourceFile('IMG_1234.HEIC', heic), '--date', '2026-11-03'], `IMG_1234.HEIC isn't really a JPEG. ${SAVE_AS_JPEG}`);
  });

  it('a JPEG damaged inside its picture data', async () => {
    const sb = sandbox();
    const damaged = Buffer.from(JPEG_A);
    // Overwrite part of the picture data, after the headers, keeping the end marker.
    damaged.fill(0xff, Math.floor(damaged.length * 0.5), damaged.length - 2);
    await refused(sb, [sb.sourceFile('2026-11-03.jpg', damaged)], '2026-11-03.jpg isn\'t really a JPEG');
  });

  it('a file not named by date, without --date', async () => {
    const sb = sandbox();
    await refused(sb, [sb.sourceFile('IMG_1234.jpg', JPEG_A)], 'Rename it, or give the date: ./add IMG_1234.jpg --date 2026-11-03');
  });

  it('a --date that is not a real date', async () => {
    const sb = sandbox();
    await refused(sb, [sb.sourceFile('photo.jpg', JPEG_A), '--date', '2026-13-01'], '--date 2026-13-01 isn\'t a real date');
  });

  it('not on main', async () => {
    const sb = sandbox();
    git(sb.laptop, 'switch', '-q', '-c', 'my-branch');
    await refused(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)], './add works on main, and this copy of the repo is on my-branch. Switch with: git switch main');
  });

  it('commits on main that are not on GitHub yet', async () => {
    const sb = sandbox();
    writeFileSync(join(sb.laptop, 'notes.txt'), 'mine\n');
    git(sb.laptop, 'add', 'notes.txt');
    git(sb.laptop, 'commit', '-q', '-m', 'Mine');
    await refused(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)], 'main has 1 commit that isn\'t on GitHub yet. Send it with git push, or remove it, then try again.');
  });

  it('two commits on main that are not on GitHub yet', async () => {
    const sb = sandbox();
    for (const n of [1, 2]) {
      writeFileSync(join(sb.laptop, `notes-${n}.txt`), 'mine\n');
      git(sb.laptop, 'add', '-A');
      git(sb.laptop, 'commit', '-q', '-m', `Mine ${n}`);
    }
    await refused(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)], 'main has 2 commits that aren\'t on GitHub yet. Send them with git push, or remove them, then try again.');
  });

  it('a drawing too detailed for a 60 KB thumbnail', async () => {
    const sb = sandbox();
    const noise = await sharp({ create: { width: 1000, height: 1000, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 120 } } })
      .jpeg({ quality: 95 }).toBuffer();
    await refused(sb, [sb.sourceFile('2026-11-03.jpg', noise)], '2026-11-03.jpg is too detailed for a thumbnail of at most 60 KB, so the site would stop building with it. This needs a change to how the site makes thumbnails, not to the file: open an issue with the file attached.');
  });

  it('unsent changes in the drawings folder', async () => {
    const sb = sandbox({ 'drawings/2026/2026-02-28.jpg': JPEG_B });
    writeFileSync(join(sb.laptop, 'drawings', '2026', '2026-03-01.jpg'), JPEG_A);
    writeFileSync(join(sb.laptop, 'drawings', '2026', '2026-03-02.jpg'), JPEG_A);
    await refused(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)], 'The drawings folder has changes that aren\'t on GitHub yet: drawings/2026/2026-03-01.jpg, drawings/2026/2026-03-02.jpg');
  });

  it('GitHub can\'t be reached', async () => {
    const sb = sandbox();
    rmSync(sb.remote, { recursive: true, force: true });
    const r = await run(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)]);
    expect(r.code).toBe(1);
    expect(r.questions).toEqual([]);
    expect(r.out).toContain('Couldn\'t get the latest version from GitHub. Check the internet connection and try again.');
    expect(r.out).toContain('Nothing changed.');
    expect(sb.laptopStatus()).toBe('');
  });

  it('the copy of main and GitHub\'s have gone different ways: names the commit, not the internet', async () => {
    const sb = sandbox();
    writeFileSync(join(sb.laptop, 'notes.txt'), 'mine\n');
    git(sb.laptop, 'add', 'notes.txt');
    git(sb.laptop, 'commit', '-q', '-m', 'Mine');
    sb.pushFromElsewhere('drawings/2026/2026-03-01.jpg', JPEG_A);
    const r = await refused(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)], 'main has 1 commit that isn\'t on GitHub yet, and GitHub has changed too. Get its changes first with git pull --rebase, then send yours with git push, and try again.');
    expect(r.out).not.toContain('internet');
  });

  it('two commits on main and GitHub has changed too', async () => {
    const sb = sandbox();
    for (const n of [1, 2]) {
      writeFileSync(join(sb.laptop, `notes-${n}.txt`), 'mine\n');
      git(sb.laptop, 'add', '-A');
      git(sb.laptop, 'commit', '-q', '-m', `Mine ${n}`);
    }
    sb.pushFromElsewhere('drawings/2026/2026-03-01.jpg', JPEG_A);
    await refused(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)], 'main has 2 commits that aren\'t on GitHub yet, and GitHub has changed too. Get its changes first with git pull --rebase, then send yours with git push, and try again.');
  });

  // Following each message's advice must lead to a working ./add, not to a refused push.
  it('following the advice for a commit on main, ./add then works', async () => {
    const sb = sandbox();
    writeFileSync(join(sb.laptop, 'notes.txt'), 'mine\n');
    git(sb.laptop, 'add', 'notes.txt');
    git(sb.laptop, 'commit', '-q', '-m', 'Mine');
    await refused(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)], 'Send it with git push');
    git(sb.laptop, 'push', '-q', 'origin', 'main');
    const r = await run(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)]);
    expect(r.code).toBe(0);
    expect(sb.remoteFiles()['drawings/2026/2026-11-03.jpg']).toBe(blobId(JPEG_A));
  });

  it('following the advice for a commit on main when GitHub has changed too, ./add then works', async () => {
    const sb = sandbox();
    sb.pushFromElsewhere('README.md', 'theirs\n');
    writeFileSync(join(sb.laptop, 'notes.txt'), 'mine\n');
    git(sb.laptop, 'add', 'notes.txt');
    git(sb.laptop, 'commit', '-q', '-m', 'Mine');
    await refused(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)], 'Get its changes first with git pull --rebase, then send yours with git push');
    git(sb.laptop, 'pull', '-q', '--rebase');
    git(sb.laptop, 'push', '-q');
    const r = await run(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)]);
    expect(r.code).toBe(0);
    const remote = sb.remoteFiles();
    expect(remote['drawings/2026/2026-11-03.jpg']).toBe(blobId(JPEG_A));
    expect(remote['notes.txt']).toBe(blobId('mine\n'));
    expect(remote['README.md']).toBe(blobId('theirs\n'));
  });

  it('following the advice for an edit to a file GitHub also changed, ./add then works', async () => {
    const sb = sandbox();
    sb.pushFromElsewhere('README.md', 'theirs\n');
    writeFileSync(join(sb.laptop, 'README.md'), 'my own edit\n');
    await refused(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)], 'Copy them somewhere else and undo them');
    writeFileSync(join(sb.root, 'README-copy.md'), readFileSync(join(sb.laptop, 'README.md')));
    git(sb.laptop, 'checkout', '--', 'README.md');
    const r = await run(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)]);
    expect(r.code).toBe(0);
    expect(sb.remoteFiles()['drawings/2026/2026-11-03.jpg']).toBe(blobId(JPEG_A));
    expect(readFileSync(join(sb.laptop, 'README.md'), 'utf8')).toBe('theirs\n');
  });

  it('an unsaved edit to a file GitHub also changed: names the file, not the internet', async () => {
    const sb = sandbox();
    sb.pushFromElsewhere('README.md', 'theirs\n');
    writeFileSync(join(sb.laptop, 'README.md'), 'my own edit\n');
    const r = await refused(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)], 'README.md has changes on this laptop that GitHub also changed. Copy them somewhere else and undo them, then try again.');
    expect(r.out.split('\n')[0]).toBe('README.md has changes on this laptop that GitHub also changed. Copy them somewhere else and undo them, then try again.');
    expect(r.out).not.toContain('internet');
    expect(readFileSync(join(sb.laptop, 'README.md'), 'utf8')).toBe('my own edit\n');
  });

  it('git can\'t take GitHub\'s version for another reason: says what git said, not the internet', async () => {
    const sb = sandbox();
    sb.pushFromElsewhere('notes.txt', 'theirs\n');
    // Another git command is running in this copy of the repo, as far as git can tell.
    writeFileSync(join(sb.laptop, '.git', 'index.lock'), '');
    const r = await refused(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)], 'Couldn\'t bring this copy of the repo up to date with GitHub. (git says: ');
    expect(r.out).toContain('index.lock');
    expect(r.out).not.toContain('internet');
  });

  it('two such files, one of them new on both sides', async () => {
    const sb = sandbox();
    sb.pushFromElsewhere('README.md', 'theirs\n');
    sb.pushFromElsewhere('notes.txt', 'theirs\n');
    writeFileSync(join(sb.laptop, 'README.md'), 'my own edit\n');
    writeFileSync(join(sb.laptop, 'notes.txt'), 'my own notes\n');
    const r = await refused(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)], 'README.md and notes.txt have changes on this laptop that GitHub also changed. Copy them somewhere else and undo them, then try again.');
    expect(r.out.split('\n')[0]).toBe('README.md and notes.txt have changes on this laptop that GitHub also changed. Copy them somewhere else and undo them, then try again.');
    expect(r.out).not.toContain('internet');
  });

  it('three such files', async () => {
    const sb = sandbox({ 'a.txt': 'start\n', 'b.txt': 'start\n', 'c.txt': 'start\n' });
    for (const name of ['a.txt', 'b.txt', 'c.txt']) sb.pushFromElsewhere(name, 'theirs\n');
    for (const name of ['a.txt', 'b.txt', 'c.txt']) writeFileSync(join(sb.laptop, name), 'mine\n');
    const r = await refused(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)], 'a.txt, b.txt and c.txt have changes');
    expect(r.out.split('\n')[0]).toBe('a.txt, b.txt and c.txt have changes on this laptop that GitHub also changed. Copy them somewhere else and undo them, then try again.');
  });

  it('a folder that isn\'t a copy of the repo', async () => {
    const sb = sandbox();
    // The sandbox's own folder holds copies of the repo but isn't one.
    const r = await run({ laptop: sb.root }, [sb.sourceFile('2026-11-03.jpg', JPEG_A)]);
    expect(r.code).toBe(1);
    expect(r.questions).toEqual([]);
    expect(r.out).toContain(`${sb.root} isn't a copy of the repo (git says: `);
    expect(r.out).toContain('Nothing changed.');
  });
});

describe('when the push fails, everything is undone', () => {
  async function failedPush(sb, args, onAsk) {
    const laptopHead = sb.laptopHead();
    const status = sb.laptopStatus();
    const remote = sb.remoteFiles();
    const r = await run(sb, args, { onAsk });
    expect(r.code).toBe(1);
    expect(r.out).toContain('Couldn\'t send it to GitHub');
    expect(r.out).toContain('Nothing changed.');
    expect(r.out).not.toContain('Live in about 2 minutes');
    expect(sb.laptopHead()).toBe(laptopHead);
    expect(sb.laptopStatus()).toBe(status);
    return { r, remote };
  }

  it('a new drawing: the commit and the copy are gone', async () => {
    const sb = sandbox({ 'drawings/2026/2026-02-28.jpg': JPEG_B });
    sb.refusePushes();
    const { r, remote } = await failedPush(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)]);
    expect(r.out).toContain('Couldn\'t send it to GitHub. Check the internet connection, then try ./add again.');
    expect(existsSync(join(sb.laptop, 'drawings', '2026', '2026-11-03.jpg'))).toBe(false);
    expect(sb.remoteFiles()).toEqual(remote);
  });

  // What git says when GitHub doesn't accept the laptop's login, in its usual forms.
  it.each([
    'fatal: Authentication failed for \'https://github.com/hornof/sketch-gallery.git/\'',
    'fatal: could not read Username for \'https://github.com\': terminal prompts disabled',
    'Permission to hornof/sketch-gallery.git denied to someone-else.',
    'fatal: unable to access \'https://github.com/hornof/sketch-gallery.git/\': The requested URL returned error: 403',
  ])('GitHub refuses the login (%s): says to sign in, not to check the internet', async (said) => {
    const sb = sandbox({ 'drawings/2026/2026-02-28.jpg': JPEG_B });
    sb.refusePushes(said);
    const { r, remote } = await failedPush(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)]);
    expect(r.out).toContain('Couldn\'t send it to GitHub. GitHub didn\'t accept this laptop\'s login. Sign in with gh auth login and try again.');
    expect(r.out).not.toContain('internet');
    expect(sb.remoteFiles()).toEqual(remote);
  });

  it('a refusal that merely contains 403 inside a longer number still gets the internet hint', async () => {
    const sb = sandbox();
    sb.refusePushes('error 14031: something else went wrong');
    const { r } = await failedPush(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)]);
    expect(r.out).toContain('Check the internet connection, then try ./add again.');
  });

  it('a new year next to other years: only the new year folder is gone', async () => {
    const sb = sandbox({ 'drawings/2026/2026-02-28.jpg': JPEG_B });
    sb.refusePushes();
    await failedPush(sb, [sb.sourceFile('2027-01-01.jpg', JPEG_A)]);
    expect(existsSync(join(sb.laptop, 'drawings', '2027'))).toBe(false);
    expect(existsSync(join(sb.laptop, 'drawings', '2026', '2026-02-28.jpg'))).toBe(true);
  });

  it('a new year: the new folder is gone too', async () => {
    const sb = sandbox();
    sb.refusePushes();
    await failedPush(sb, [sb.sourceFile('2027-01-01.jpg', JPEG_A)]);
    expect(existsSync(join(sb.laptop, 'drawings'))).toBe(false);
  });

  it('a replaced drawing: the old one is back', async () => {
    const sb = sandbox({ 'drawings/2026/2026-11-03.jpg': JPEG_B });
    sb.refusePushes();
    await failedPush(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A), '--replace']);
    expect(readFileSync(join(sb.laptop, 'drawings', '2026', '2026-11-03.jpg'))).toEqual(JPEG_B);
  });

  it('someone changed GitHub while the question was waiting', async () => {
    const sb = sandbox({ 'drawings/2026/2026-02-28.jpg': JPEG_B });
    const { r } = await failedPush(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)], () => sb.pushFromElsewhere('drawings/2026/2026-03-01.jpg', JPEG_C));
    expect(r.out).toContain('Try ./add again');
    expect(existsSync(join(sb.laptop, 'drawings', '2026', '2026-11-03.jpg'))).toBe(false);
    // Running it again then works, and keeps the other drawing.
    const again = await run(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)]);
    expect(again.code).toBe(0);
    expect(Object.keys(sb.remoteFiles()).filter((p) => p.startsWith('drawings/')).sort()).toEqual([
      'drawings/2026/2026-02-28.jpg', 'drawings/2026/2026-03-01.jpg', 'drawings/2026/2026-11-03.jpg',
    ]);
  });

  it('git refuses the commit: the copy is gone, and GitHub is never asked', async () => {
    const sb = sandbox({ 'drawings/2026/2026-02-28.jpg': JPEG_B });
    writeFileSync(join(sb.laptop, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho "no commits today" >&2\nexit 1\n', { mode: 0o755 });
    const before = snapshot(sb);
    const r = await run(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('Couldn\'t save it with git. (git says: no commits today)');
    expect(r.out).toContain('Nothing changed.');
    expect(snapshot(sb)).toEqual(before);
  });

  it('the owner\'s other work is still there', async () => {
    const sb = sandbox();
    writeFileSync(join(sb.laptop, 'README.md'), 'my own edit\n');
    sb.refusePushes();
    await failedPush(sb, [sb.sourceFile('2026-11-03.jpg', JPEG_A)]);
    expect(readFileSync(join(sb.laptop, 'README.md'), 'utf8')).toBe('my own edit\n');
  });
});

describe('the sandboxes are removed', () => {
  it('remove() deletes the whole temporary folder, the stand-in for GitHub and every copy in it', () => {
    const sb = makeSandbox({ 'drawings/2026/2026-02-28.jpg': JPEG_B });
    sb.pushFromElsewhere('notes.txt', 'theirs\n');
    sb.sourceFile('2026-11-03.jpg', JPEG_A);
    expect(existsSync(sb.root)).toBe(true);
    sb.remove();
    expect(existsSync(sb.root)).toBe(false);
    sb.remove(); // removing twice is harmless
  });

  // These two run in order: the first leaves its sandbox, the second checks it's gone.
  let left;
  it('a test that uses a sandbox...', () => {
    left = sandbox().root;
    expect(existsSync(left)).toBe(true);
  });

  it('...has it removed when the test ends', () => {
    expect(left).toBeTruthy();
    expect(existsSync(left)).toBe(false);
  });
});

describe('how ./add is run, before it looks at the repo', () => {
  // These never reach git: a repo folder that doesn't exist would make git fail.
  const runHere = (args) => run({ laptop: '/nonexistent-repo' }, args);

  it('--help and -h print the help', async () => {
    for (const flag of ['--help', '-h']) {
      const r = await runHere([flag]);
      expect(r.code).toBe(0);
      expect(r.out).toBe(HELP);
    }
  });

  it('no file, two files, or an unknown option is refused with how to use it', async () => {
    const none = await runHere([]);
    expect(none.code).toBe(1);
    expect(none.out).toContain('Which drawing? For example: ./add 2026-11-03.jpg');
    expect(none.out).toContain(HELP);
    const two = await runHere(['a.jpg', 'b.jpg']);
    expect(two.code).toBe(1);
    expect(two.out).toBe('One drawing at a time: ./add was given 2 files (a.jpg, b.jpg).');
    const unknown = await runHere(['a.jpg', '--force']);
    expect(unknown.code).toBe(1);
    expect(unknown.out).toContain('--force');
    expect(unknown.out).toContain(HELP);
    const noDate = await runHere(['a.jpg', '--date']);
    expect(noDate.code).toBe(1);
    expect(noDate.out).toContain('--date');
  });
});

describe('the ./add command', () => {
  const runCli = (...args) => spawnSync(join(repoRoot, 'add'), args, { cwd: repoRoot, encoding: 'utf8', input: '' });

  it('--help says how to use it and changes nothing', () => {
    const r = runCli('--help');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('./add photo.jpg --date 2026-11-03');
    expect(r.stdout).toContain('--replace');
    expect(r.stdout).toContain('--yes');
  });

  it('with no file, says how to use it', () => {
    const r = runCli();
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('Which drawing? For example: ./add 2026-11-03.jpg');
  });

  it('refuses an option it doesn\'t know, and a second file', () => {
    const r1 = runCli('a.jpg', '--force');
    expect(r1.status).toBe(1);
    expect(r1.stdout).toContain('--force');
    const r2 = runCli('a.jpg', 'b.jpg');
    expect(r2.status).toBe(1);
    expect(r2.stdout).toContain('One drawing at a time');
  });
});
