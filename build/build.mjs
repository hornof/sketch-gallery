// Builds the site into dist/. For now (#12, setup proof) it writes one placeholder page.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

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

mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, 'index.html'), html);
console.log('Wrote dist/index.html');
