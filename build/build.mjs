// Builds the site into dist/.
//   node build/build.mjs                    reads drawings/; with no drawings/ folder yet, the site has no drawings
//   node build/build.mjs --drawings <dir>   reads another folder, which must exist
// It writes the drawings (#13), then the year pages (#16) and the page code (#17).
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { BuildStopped, buildDrawings } from './drawings.mjs';
import { writeSite } from './pages.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const args = process.argv.slice(2);
const i = args.indexOf('--drawings');
const from = i === -1 ? join(root, 'drawings') : resolve(args[i + 1] ?? '');

try {
  // Until ./import first loads the drawings, drawings/ doesn't exist and the site has none (#15).
  const list = await buildDrawings({ from, to: dist, allowMissing: i === -1 });
  console.log(`Wrote ${list.length} drawings: dist/drawings.json, dist/thumbs/, dist/full/`);
  writeSite({ list, to: dist });
  console.log('Wrote dist/index.html, a page for each year in dist/YYYY/, dist/site.js and dist/fonts/');
} catch (err) {
  if (!(err instanceof BuildStopped)) throw err;
  console.error(err.message);
  process.exit(1);
}
