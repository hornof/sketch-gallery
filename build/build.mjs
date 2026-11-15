// Builds the site into dist/.
//   node build/build.mjs                    reads drawings/
//   node build/build.mjs --drawings <dir>   reads another folder
// Until the real drawings are in drawings/, it reads the test drawings in
// tests/fixtures/drawings/ (#13). It writes the drawings (#13), then the year pages (#16).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { BuildStopped, buildDrawings } from './drawings.mjs';
import { writeSite } from './pages.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

function drawingsFolder(args) {
  const i = args.indexOf('--drawings');
  if (i !== -1) return resolve(args[i + 1] ?? '');
  const real = join(root, 'drawings');
  if (existsSync(real)) return real;
  console.log('No drawings/ folder yet, so using the test drawings in tests/fixtures/drawings/');
  return join(root, 'tests', 'fixtures', 'drawings');
}

try {
  const list = await buildDrawings({ from: drawingsFolder(process.argv.slice(2)), to: dist });
  console.log(`Wrote ${list.length} drawings: dist/drawings.json, dist/thumbs/, dist/full/`);
  writeSite({ list, to: dist });
  console.log('Wrote dist/index.html, a page for each year in dist/YYYY/, and dist/fonts/');
} catch (err) {
  if (!(err instanceof BuildStopped)) throw err;
  console.error(err.message);
  process.exit(1);
}
