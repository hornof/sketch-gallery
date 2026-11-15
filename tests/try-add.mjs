// `npm run try-add`: try ./add safely (#14). Runs the real ./add code on a throwaway
// copy of the repo in a temporary folder, with a stand-in for GitHub there too.
// Nothing is sent to the real GitHub and the real repo isn't touched.
//   npm run try-add                                        ./add sample.jpg --date 2026-11-04
//   npm run try-add -- --date 2026-11-03                   that date already has a drawing
//   npm run try-add -- --date 2026-11-03 --replace         replaces it
import { add, askOnTerminal } from '../commands/add.mjs';
import { JPEG_A, JPEG_B, git, makeSandbox } from './sandbox.mjs';

const sb = makeSandbox({
  'drawings/2026/2026-02-28.jpg': JPEG_A,
  'drawings/2026/2026-11-03.jpg': JPEG_B,
});
const drawingsOnGitHub = () => Object.keys(sb.remoteFiles()).filter((p) => p.startsWith('drawings/')).join(', ');
console.log(`Practice copy of the repo: ${sb.laptop}`);
console.log(`Its stand-in for GitHub has: ${drawingsOnGitHub()}\n`);

const sample = sb.sourceFile('sample.jpg', JPEG_A);
const options = process.argv.length > 2 ? process.argv.slice(2) : ['--date', '2026-11-04'];
console.log(`./add sample.jpg ${options.join(' ')}\n`);

const code = await add([sample, ...options], { repo: sb.laptop, print: (line) => console.log(line), ask: askOnTerminal });
console.log(`\nThe stand-in for GitHub now has: ${drawingsOnGitHub()}`);
console.log(`Its last change: ${git(sb.remote, 'log', '-1', '--format=%s', 'main')}`);
process.exitCode = code;
