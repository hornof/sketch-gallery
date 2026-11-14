// Builds the site into dist/.
//   node build/build.mjs                    reads drawings/
//   node build/build.mjs --drawings <dir>   reads another folder
// Until the real drawings are in drawings/, it reads the test drawings in
// tests/fixtures/drawings/ (#13). The page itself is still the placeholder from #12.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { BuildStopped, buildDrawings } from './drawings.mjs';

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
  const list = await buildDrawings({ from: drawingsFolder(process.argv.slice(2)), to: dist });
  console.log(`Wrote ${list.length} drawings: dist/drawings.json, dist/thumbs/, dist/full/`);
} catch (err) {
  if (!(err instanceof BuildStopped)) throw err;
  console.error(err.message);
  process.exit(1);
}

mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, 'index.html'), html);
console.log('Wrote dist/index.html');
