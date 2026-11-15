// A throwaway copy of the setup ./add works in, all inside a temporary folder (#14):
//   github.git  a bare repo standing in for GitHub, so nothing is ever sent to the real one
//   laptop/     a clone of it, standing in for the owner's copy of the repo
// Tests and `npm run try-add` use it. Nothing here touches the real repo.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURES = join(here, 'fixtures', 'drawings');
// Three small, real JPEGs to use as drawings.
export const JPEG_A = readFileSync(join(FIXTURES, '2025', '2025-12-31.jpg'));
export const JPEG_B = readFileSync(join(FIXTURES, '2026', '2026-02-28.jpg'));
export const JPEG_C = readFileSync(join(FIXTURES, '2024', '2024-02-29.jpg'));

export function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}:\n${r.stderr}`);
  return r.stdout.trimEnd();
}

const IDENTITY = [['user.name', 'Sandbox'], ['user.email', 'sandbox@example.invalid'], ['commit.gpgsign', 'false']];

function clone(remote, where) {
  git(dirname(where), 'clone', '-q', '-b', 'main', remote, where);
  for (const [k, v] of IDENTITY) git(where, 'config', k, v);
  return where;
}

// files: { 'drawings/2025/2025-10-07.jpg': <Buffer>, 'README.md': 'text', ... } for the first commit.
export function makeSandbox(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sketch-gallery-add-'));
  const remote = join(root, 'github.git');
  const seed = join(root, 'seed');
  git(root, 'init', '-q', '--bare', '-b', 'main', remote);
  git(root, 'init', '-q', '-b', 'main', seed);
  for (const [k, v] of IDENTITY) git(seed, 'config', k, v);
  writeFileSync(join(seed, 'README.md'), 'sandbox\n');
  for (const [rel, data] of Object.entries(files)) {
    mkdirSync(dirname(join(seed, rel)), { recursive: true });
    writeFileSync(join(seed, rel), data);
  }
  git(seed, 'add', '-A');
  git(seed, 'commit', '-q', '-m', 'Start');
  git(seed, 'push', '-q', remote, 'main');
  const laptop = clone(remote, join(root, 'laptop'));
  let others = 0;
  return {
    root,
    remote,
    laptop,
    // Every file on the fake GitHub's main, as { path: blob id }. Equal ids mean equal contents.
    remoteFiles() {
      const out = git(remote, 'ls-tree', '-r', 'main');
      return Object.fromEntries(out.split('\n').filter(Boolean).map((line) => {
        const [meta, path] = line.split('\t');
        return [path, meta.split(' ')[2]];
      }));
    },
    remoteHead: () => git(remote, 'rev-parse', 'main'),
    laptopHead: () => git(laptop, 'rev-parse', 'HEAD'),
    laptopStatus: () => git(laptop, 'status', '--porcelain', '--untracked-files=all'),
    // Someone else pushes a file to the fake GitHub, as if added on github.com.
    pushFromElsewhere(rel, data) {
      others += 1;
      const other = clone(remote, join(root, `other-${others}`));
      mkdirSync(dirname(join(other, rel)), { recursive: true });
      writeFileSync(join(other, rel), data);
      git(other, 'add', '-A');
      git(other, 'commit', '-q', '-m', `Add ${rel} elsewhere`);
      git(other, 'push', '-q', 'origin', 'main');
    },
    // From now on the fake GitHub refuses every push.
    refusePushes() {
      writeFileSync(join(remote, 'hooks', 'pre-receive'), '#!/bin/sh\necho "refused by the test" >&2\nexit 1\n', { mode: 0o755 });
    },
    // A file outside the repo, for ./add to add.
    sourceFile(name, data) {
      const dir = mkdtempSync(join(root, 'from-'));
      const path = join(dir, name);
      writeFileSync(path, data);
      return path;
    },
  };
}

// The git id a file's contents would get, to compare with remoteFiles().
export function blobId(data) {
  const r = spawnSync('git', ['hash-object', '--stdin'], { input: data, encoding: 'utf8' });
  return r.stdout.trim();
}
