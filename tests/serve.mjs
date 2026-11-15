// Serves dist/ the way Cloudflare Pages does, for the browser tests and Lighthouse.
//   node tests/serve.mjs [folder] [port]
// /2025/ serves 2025/index.html, and /2025 redirects to /2025/. An address with no
// file serves the home page, as Cloudflare does when the site has no 404.html.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { headersFor } from '../build/headers.mjs';

const dir = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(dir, normalize(path));
  if (!file.startsWith(dir)) {
    res.writeHead(400).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!path.endsWith('/')) {
      res.writeHead(308, { Location: `${path}/` }).end();
      return;
    }
    file = join(file, 'index.html');
  }
  if (!existsSync(file)) file = join(dir, 'index.html');
  // The browser rules in _headers, sent the way Cloudflare sends them (#20).
  const rules = existsSync(join(dir, '_headers')) ? headersFor(readFileSync(join(dir, '_headers'), 'utf8'), path) : {};
  res.writeHead(200, { ...rules, 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`Serving ${dir} at http://localhost:${port}/`));
