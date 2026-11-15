// Builds the site into dist/.
//   node build/build.mjs                    reads drawings/; with no drawings/ folder yet, the site has no drawings
//   node build/build.mjs --drawings <dir>   reads another folder, which must exist
// The page itself is still the placeholder from #12.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { BuildStopped, buildDrawings } from './drawings.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const args = process.argv.slice(2);
const i = args.indexOf('--drawings');
const from = i === -1 ? join(root, 'drawings') : resolve(args[i + 1] ?? '');

const title = 'Sketch Gallery';
const description = 'This gallery displays drawings made over several years.';

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
</head>
<body>
<h1>${title}</h1>
<p>${description}</p>
</body>
</html>
`;

try {
  // Until ./import first loads the drawings, drawings/ doesn't exist and the site has none (#15).
  const list = await buildDrawings({ from, to: dist, allowMissing: i === -1 });
  console.log(`Wrote ${list.length} drawings: dist/drawings.json, dist/thumbs/, dist/full/`);
} catch (err) {
  if (!(err instanceof BuildStopped)) throw err;
  console.error(err.message);
  process.exit(1);
}

mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, 'index.html'), html);
console.log('Wrote dist/index.html');
