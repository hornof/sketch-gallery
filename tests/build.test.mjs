// Setup proof (#12): the build writes a placeholder page with the PRD's title and line (R1).
// Drawings in (#13): the build also writes the list of drawings, or stops and names every problem.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = join(root, 'dist', 'index.html');

describe('build/build.mjs', () => {
  beforeAll(() => {
    // Start from nothing, so the test proves this build wrote the page.
    rmSync(join(root, 'dist'), { recursive: true, force: true });
    execFileSync(process.execPath, [join(root, 'build', 'build.mjs')], { cwd: root });
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

  it('lists the drawings from drawings/, or the test drawings while drawings/ does not exist yet', () => {
    const source = existsSync(join(root, 'drawings')) ? join(root, 'drawings') : join(root, 'tests', 'fixtures', 'drawings');
    const expected = readdirSync(source)
      .filter((y) => !y.startsWith('.'))
      .flatMap((y) => readdirSync(join(source, y)).filter((f) => !f.startsWith('.')).map((f) => f.replace('.jpg', '')))
      .sort();
    const list = JSON.parse(readFileSync(join(root, 'dist', 'drawings.json'), 'utf8'));
    expect(list.drawings.map((d) => d.date)).toEqual(expected);
    for (const d of list.drawings) {
      expect(existsSync(join(root, 'dist', d.thumb))).toBe(true);
      expect(existsSync(join(root, 'dist', d.full))).toBe(true);
    }
  });

  it('stops with a clear message naming every bad file, and leaves dist/ alone', () => {
    const bad = mkdtempSync(join(tmpdir(), 'sketch-gallery-bad-'));
    mkdirSync(join(bad, '2025'));
    mkdirSync(join(bad, '2019'));
    writeFileSync(join(bad, '2025', 'IMG_1234.jpg'), 'not a picture');
    const before = readFileSync(join(root, 'dist', 'drawings.json'));
    const run = spawnSync(process.execPath, [join(root, 'build', 'build.mjs'), '--drawings', bad], { cwd: root, encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('The build stopped. Fix these and try again:');
    expect(run.stderr).toContain('2019/: is empty');
    expect(run.stderr).toContain('2025/IMG_1234.jpg: "IMG_1234.jpg" isn\'t named like 2025-10-07.jpg');
    expect(readFileSync(join(root, 'dist', 'drawings.json')).equals(before)).toBe(true);
  });
});
