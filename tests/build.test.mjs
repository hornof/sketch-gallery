// Setup proof (#12): the build writes a placeholder page with the PRD's title and line (R1).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
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
});
