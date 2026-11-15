// Setup proof (#12): the build writes a placeholder page with the PRD's title and line (R1).
// Drawings in (#13): the build also writes the list of drawings, or stops and names every problem.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it, onTestFinished } from 'vitest';
import { CHILD_TIMEOUT_MS } from './sandbox.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = join(root, 'dist', 'index.html');
const fixtures = join(root, 'tests', 'fixtures', 'drawings');

// Every drawing's date in a drawings folder, read straight from the file names; none if there's no folder.
function datesIn(folder) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((y) => !y.startsWith('.'))
    .flatMap((y) => readdirSync(join(folder, y)).filter((f) => !f.startsWith('.')).map((f) => f.replace('.jpg', '')))
    .sort();
}

describe('build/build.mjs', () => {
  beforeAll(() => {
    // Start from nothing, so the test proves this build wrote the page.
    rmSync(join(root, 'dist'), { recursive: true, force: true });
    execFileSync(process.execPath, [join(root, 'build', 'build.mjs'), '--drawings', fixtures], { cwd: root, timeout: CHILD_TIMEOUT_MS });
  });

  it('writes dist/index.html', () => {
    expect(existsSync(page)).toBe(true);
  });

  it('gives the page the title "Sketch Gallery"', () => {
    const html = readFileSync(page, 'utf8');
    expect(html).toMatch(/<title>Sketch Gallery<\/title>/);
    expect(html).toMatch(/<h1>Sketch Gallery<\/h1>/);
  });

  it('shows the description line from PRD R1', () => {
    const html = readFileSync(page, 'utf8');
    expect(html).toContain('This gallery displays drawings made over several years.');
  });

  it('is a complete HTML page', () => {
    const html = readFileSync(page, 'utf8');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<meta name="viewport"');
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('lists the drawings from the folder given with --drawings', () => {
    const list = JSON.parse(readFileSync(join(root, 'dist', 'drawings.json'), 'utf8'));
    expect(list.drawings.map((d) => d.date)).toEqual(datesIn(fixtures));
    for (const d of list.drawings) {
      expect(existsSync(join(root, 'dist', d.thumb))).toBe(true);
      expect(existsSync(join(root, 'dist', d.full))).toBe(true);
    }
  });

  // Link preview and browser rules (#20): the image every page names exists, and the rules file is there.
  it('writes the link preview image and the browser rules', () => {
    const html = readFileSync(page, 'utf8');
    const image = html.match(/<meta property="og:image" content="https:\/\/sketch-gallery\.hornof\.org(\/[^"]+)">/)[1];
    expect(existsSync(join(root, 'dist', image))).toBe(true);
    expect(readFileSync(join(root, 'dist', '_headers'), 'utf8')).toContain('Content-Security-Policy:');
  });

  it('stops when the folder given with --drawings does not exist', () => {
    const missing = join(tmpdir(), 'sketch-gallery-no-such-folder');
    const run = spawnSync(process.execPath, [join(root, 'build', 'build.mjs'), '--drawings', missing], { cwd: root, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(`the drawings folder ${missing} doesn't exist`);
  });

  it('stops with a clear message naming every bad file, and leaves dist/ alone', () => {
    const bad = mkdtempSync(join(tmpdir(), 'sketch-gallery-bad-'));
    onTestFinished(() => rmSync(bad, { recursive: true, force: true }));
    mkdirSync(join(bad, '2025'));
    mkdirSync(join(bad, '2019'));
    writeFileSync(join(bad, '2025', 'IMG_1234.jpg'), 'not a picture');
    const before = readFileSync(join(root, 'dist', 'drawings.json'));
    const run = spawnSync(process.execPath, [join(root, 'build', 'build.mjs'), '--drawings', bad], { cwd: root, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('The build stopped. Fix these and try again:');
    expect(run.stderr).toContain('2019/: is empty');
    expect(run.stderr).toContain('2025/IMG_1234.jpg: "IMG_1234.jpg" isn\'t named like 2025-10-07.jpg');
    expect(readFileSync(join(root, 'dist', 'drawings.json')).equals(before)).toBe(true);
  });
});

// With no drawings/ folder, the build stops, so the host keeps the last good site live (#30).
// It runs a copy of build/ in a folder of its own, so the real drawings/ is never moved.
describe('build/build.mjs with no drawings/ folder', () => {
  it('stops with a clear message and writes nothing', () => {
    // The real path, as the build names it: on macOS the temp folder sits behind a link.
    const copy = realpathSync(mkdtempSync(join(tmpdir(), 'sketch-gallery-no-drawings-')));
    onTestFinished(() => rmSync(copy, { recursive: true, force: true }));
    cpSync(join(root, 'build'), join(copy, 'build'), { recursive: true });
    symlinkSync(join(root, 'node_modules'), join(copy, 'node_modules'), 'dir');
    const run = spawnSync(process.execPath, [join(copy, 'build', 'build.mjs')], { cwd: copy, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('The build stopped. Fix these and try again:');
    expect(run.stderr).toContain(`the drawings folder ${join(copy, 'drawings')} doesn't exist`);
    expect(existsSync(join(copy, 'dist'))).toBe(false);
  });
});

// With no --drawings, the build reads drawings/ and only drawings/ (#15), never the test drawings.
describe('build/build.mjs with no --drawings', () => {
  let run;
  beforeAll(() => {
    run = spawnSync(process.execPath, [join(root, 'build', 'build.mjs')], { cwd: root, encoding: 'utf8', timeout: 300_000 });
  }, 300_000); // every drawing in drawings/

  it('builds', () => {
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
  });

  it('lists exactly the drawings in drawings/, and never the test drawings', () => {
    const list = JSON.parse(readFileSync(join(root, 'dist', 'drawings.json'), 'utf8'));
    expect(list.drawings.map((d) => d.date)).toEqual(datesIn(join(root, 'drawings')));
    expect(run.stdout).not.toContain('fixtures');
  });
});
