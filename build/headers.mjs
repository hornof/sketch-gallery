// Browser rules (#20, TDD section 9), sent with every page in Cloudflare's _headers file.
// R13 (only the owner, on the site): only code from this site runs, and only hornof.org
// may show the site inside its own page (for its projects page).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const CSP = [
  // Everything comes from this site: pages, page code, drawings, fonts, drawings.json.
  "default-src 'self'",
  // Only the site's own code files; no code written into a page, no eval.
  "script-src 'self'",
  // The page's look is written into each page, in its <style>.
  "style-src 'self' 'unsafe-inline'",
  "object-src 'none'",
  "base-uri 'none'",
  // Nothing to send: the site has no forms.
  "form-action 'none'",
  'frame-ancestors https://hornof.org https://www.hornof.org',
].join('; ');

// The page code (#37): on sketch-gallery.hornof.org, Cloudflare's setting for the hornof.org
// domain lets browsers keep files for 4 hours, so after a release a browser could run old code with new pages. "no-cache" makes the browser check
// with the server on every visit (an unchanged file comes back as a short 304). Only these
// rules set Cache-Control: Cloudflare joins a header set by two matching rules with commas.
const FRESH = ['/site.js', '/popup/*'];

export const HEADERS = `/*\n  Content-Security-Policy: ${CSP}\n`
  + FRESH.map((path) => `${path}\n  Cache-Control: no-cache\n`).join('');

export function writeHeaders(to) {
  writeFileSync(join(to, '_headers'), HEADERS);
}

// The headers a _headers file gives one address, as Cloudflare reads it: a line with an
// address (where "*" stands for any text) starts a rule, indented "Name: value" lines
// follow, and every rule that matches applies. Used by tests/serve.mjs.
export function headersFor(text, path) {
  const out = {};
  let applies = false;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const pattern = new RegExp(`^${line.trim().split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
      applies = pattern.test(path);
    } else if (applies) {
      const i = line.indexOf(':');
      out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return out;
}
