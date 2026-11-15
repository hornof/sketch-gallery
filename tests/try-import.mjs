// `npm run try-import`: try ./import safely (#15). Runs the real ./import code on a
// throwaway copy of the repo in a temporary folder, with a stand-in for GitHub there
// too. Nothing is sent to the real GitHub and the real repo isn't touched. Unlike the
// tests, it keeps its temporary folder, so you can look inside.
//   npm run try-import                          ./import my-drawings/2024 my-drawings/2025, two sample year folders
//   npm run try-import -- --bad                 the same folders with two bad files: lists both, adds nothing
//   npm run try-import -- <folder> <folder>     imports your own year folders into the throwaway copy, which starts with no drawings
// Any other option, like --yes or --replace, is passed on to ./import.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { askOnTerminal } from '../commands/add.mjs';
import { importFolders } from '../commands/import.mjs';
import { JPEG_A, JPEG_B, JPEG_C, git, makeSandbox } from './sandbox.mjs';

const args = process.argv.slice(2);
const bad = args.includes('--bad');
const given = args.filter((a) => a !== '--bad');
const options = given.filter((a) => a.startsWith('-'));
const ownFolders = given.filter((a) => !a.startsWith('-'));

// With your own folders, the stand-in for GitHub starts with no drawings, like main before
// the first load, so what ./import prints matches the real run line for line. The sample
// folders start next to one drawing already on it.
const sb = makeSandbox(ownFolders.length > 0 ? {} : { 'drawings/2026/2026-02-28.jpg': JPEG_A });
const drawingsOnGitHub = () => Object.keys(sb.remoteFiles()).filter((p) => p.startsWith('drawings/'));
console.log(`Throwaway copy of the repo: ${sb.laptop}`);
console.log(`Its stand-in for GitHub has: ${drawingsOnGitHub().join(', ') || 'no drawings'}\n`);

// Your own folders are read from where you ran the command. The sample folders are made
// in the temporary folder, in my-drawings/2024 and my-drawings/2025.
let folders = ownFolders;
// npm runs this from the repo folder; INIT_CWD is the folder the command was typed in.
let cwd = process.env.INIT_CWD ?? process.cwd();
if (folders.length === 0) {
  const samples = {
    'my-drawings/2024/2024-02-29.jpg': JPEG_C,
    'my-drawings/2025/2025-10-07.jpg': JPEG_A,
    'my-drawings/2025/2025-12-31.jpg': JPEG_B,
  };
  if (bad) {
    samples['my-drawings/2024/IMG_1234.jpg'] = JPEG_A;
    samples['my-drawings/2025/2024-06-01.jpg'] = JPEG_A;
  }
  for (const [rel, data] of Object.entries(samples)) {
    mkdirSync(dirname(join(sb.root, rel)), { recursive: true });
    writeFileSync(join(sb.root, rel), data);
  }
  folders = ['my-drawings/2024', 'my-drawings/2025'];
  cwd = sb.root;
}
console.log(`./import ${[...folders, ...options].join(' ')}\n`);

const started = Date.now();
const code = await importFolders([...folders, ...options], { repo: sb.laptop, cwd, print: (line) => console.log(line), ask: askOnTerminal });
const drawings = drawingsOnGitHub();
console.log(`\nThe stand-in for GitHub now has ${drawings.length} drawing${drawings.length === 1 ? '' : 's'}: ${drawings.length > 8 ? `${drawings.slice(0, 8).join(', ')}, ...` : drawings.join(', ')}`);
console.log(`Its last change: ${git(sb.remote, 'log', '-1', '--format=%s', 'main')}`);
console.log(`./import took ${Math.round((Date.now() - started) / 1000)} seconds, including the time the question waited.`);
process.exitCode = code;
