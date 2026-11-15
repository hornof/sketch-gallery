// Getting the latest version from GitHub and sending drawings to it, for the owner
// commands (#14, #15). Everything runs git in the repo folder, using the laptop's own
// GitHub login.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export function git(repo, ...args) {
  const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Checks that the repo is ready for a drawing to be added, and gets the latest
// version from GitHub. Returns null when ready, or a message saying what's wrong
// and how to fix it.
export function getReady(repo, command = './add') {
  const branch = git(repo, 'branch', '--show-current');
  if (!branch.ok) return `${repo} isn't a copy of the repo (git says: ${branch.err})`;
  if (branch.out !== 'main') {
    // A rebase that stopped on a conflict leaves the repo on no branch, and git
    // refuses to switch until it is finished or abandoned.
    if (rebaseStopped(repo)) {
      return 'A git pull --rebase stopped partway because this laptop and GitHub changed the same lines. Go back with git rebase --abort, then get help from someone who knows git.';
    }
    return `${command} works on main, and this copy of the repo is on ${branch.out || 'no branch'}. Switch with: git switch main`;
  }
  const changed = git(repo, 'status', '--porcelain', '--untracked-files=all', '--', 'drawings');
  if (changed.out) {
    const files = changed.out.split('\n').map((line) => line.slice(3));
    return `The drawings folder has changes that aren't on GitHub yet: ${files.join(', ')}. Send them with git, or remove them, then try again.`;
  }
  const fetch = git(repo, 'fetch', '-q', 'origin', 'main');
  if (!fetch.ok) {
    return `Couldn't get the latest version from GitHub. Check the internet connection and try again. (git says: ${fetch.err})`;
  }
  // Checked before taking GitHub's version, so commits made only on this laptop get
  // this message, not git's refusal to fast-forward.
  const ahead = Number(git(repo, 'rev-list', '--count', 'origin/main..HEAD').out);
  if (ahead > 0) {
    const notYet = `main has ${plural(ahead, 'commit')} that ${ahead === 1 ? 'isn\'t' : 'aren\'t'} on GitHub yet`;
    // When GitHub has commits this laptop doesn't, a plain git push would be refused.
    const behind = Number(git(repo, 'rev-list', '--count', 'HEAD..origin/main').out);
    if (behind > 0) {
      return `${notYet}, and GitHub has changed too. Get its changes first with git pull --rebase --autostash, then send yours with git push, and try again.`;
    }
    return `${notYet}. Send ${ahead === 1 ? 'it' : 'them'} with git push, or remove ${ahead === 1 ? 'it' : 'them'}, then try again.`;
  }
  const merge = git(repo, 'merge', '-q', '--ff-only', 'origin/main');
  if (!merge.ok) {
    const files = blockingFiles(merge.err);
    if (files.length > 0) {
      const list = files.length === 1 ? files[0] : `${files.slice(0, -1).join(', ')} and ${files.at(-1)}`;
      return `${list} ${files.length === 1 ? 'has' : 'have'} changes on this laptop that GitHub also changed. Copy them somewhere else and undo them, then try again.`;
    }
    return `Couldn't bring this copy of the repo up to date with GitHub. (git says: ${merge.err})`;
  }
  return null;
}

// Whether a rebase is under way: git keeps its state in one of these two folders
// (which one depends on how git was set up) until the rebase ends.
function rebaseStopped(repo) {
  return ['rebase-merge', 'rebase-apply'].some((name) => existsSync(resolve(repo, git(repo, 'rev-parse', '--git-path', name).out)));
}

// The files git names when the laptop's own changes stop it taking GitHub's
// version ("would be overwritten by merge"): each on its own line, starting with a tab.
function blockingFiles(said) {
  return said.split('\n').filter((line) => line.startsWith('\t')).map((line) => line.trim());
}

// Copies each file into the repo, commits only those files and pushes to GitHub.
// files: [{ from: '/path/on/laptop.jpg', to: 'drawings/2026/2026-11-03.jpg' }].
// Returns null when GitHub has them. If anything fails, it puts the repo back the
// way it was (the commit, the copies, any replaced files, any new folders) and
// returns a message saying what went wrong.
export function sendToGitHub(repo, files, message, command = './add') {
  const before = git(repo, 'rev-parse', 'HEAD').out;
  // What each path held before, so it can be put back.
  const saved = files.map(({ to }) => {
    const path = join(repo, to);
    return { to, path, old: existsSync(path) ? readFileSync(path) : null, newFolder: firstMissingFolder(repo, to) };
  });

  const undo = () => {
    if (git(repo, 'rev-parse', 'HEAD').out !== before) git(repo, 'reset', '-q', '--soft', before);
    for (const { to, path, old, newFolder } of saved) {
      git(repo, 'reset', '-q', '--', to);
      if (old) writeFileSync(path, old);
      else rmSync(path, { force: true });
      if (newFolder) rmSync(join(repo, newFolder), { recursive: true, force: true });
    }
  };

  for (const { from, to } of files) {
    mkdirSync(dirname(join(repo, to)), { recursive: true });
    copyFileSync(from, join(repo, to));
  }
  const paths = files.map((f) => f.to);
  const steps = [
    ['add', '--', ...paths],
    ['commit', '-q', '-m', message, '--', ...paths],
  ];
  for (const step of steps) {
    const r = git(repo, ...step);
    if (!r.ok) {
      undo();
      return `Couldn't save it with git. (git says: ${r.err || r.out})`;
    }
  }
  const push = git(repo, 'push', '-q', 'origin', 'main');
  if (!push.ok) {
    undo();
    const moved = /fetch first|non-fast-forward/.test(push.err);
    const login = /Authentication failed|could not read Username|Permission to .* denied|\b403\b/.test(push.err);
    let hint = `Check the internet connection, then try ${command} again.`;
    if (moved) hint = `Someone changed GitHub in the meantime. Try ${command} again.`;
    else if (login) hint = 'GitHub didn\'t accept this laptop\'s login. Sign in with gh auth login and try again.';
    return `Couldn't send it to GitHub. ${hint} (git says: ${push.err})`;
  }
  return null;
}

// The outermost folder on the way to `to` that doesn't exist yet, or null: for
// drawings/2027/2027-01-01.jpg in a repo with no drawings folder, 'drawings'.
function firstMissingFolder(repo, to) {
  const parts = to.split('/').slice(0, -1);
  for (let i = 1; i <= parts.length; i++) {
    const folder = parts.slice(0, i).join('/');
    if (!existsSync(join(repo, folder))) return folder;
  }
  return null;
}
