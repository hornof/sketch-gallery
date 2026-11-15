// Builds the site into dist/.
//   node build/build.mjs                    reads drawings/, which must exist
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
  // With no drawings folder the build stops, so the host keeps the last good site live (#30).
  const list = await buildDrawings({ from, to: dist });
  console.log(`Wrote ${list.length} drawings: dist/drawings.json, dist/thumbs/, dist/full/`);
  writeSite({ list, to: dist });
  console.log('Wrote dist/index.html, a page for each year in dist/YYYY/, dist/site.js and dist/fonts/');
} catch (err) {
  if (!(err instanceof BuildStopped)) throw err;
  console.error(err.message);
  process.exit(1);
}
