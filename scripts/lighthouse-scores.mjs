// Prints the Lighthouse scores from the last `npm run lighthouse`, one line per
// page, and adds them to the GitHub Actions run summary when there is one.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const manifest = 'reports/lighthouse/manifest.json';
if (!existsSync(manifest)) {
  console.log('No Lighthouse results: reports/lighthouse/manifest.json is missing.');
  process.exit(0);
}
const pct = (score) => (score == null ? 'n/a' : Math.round(score * 100));
const lines = JSON.parse(readFileSync(manifest, 'utf8'))
  .filter((run) => run.isRepresentativeRun)
  .map((run) => `${new URL(run.url).pathname}: performance ${pct(run.summary.performance)}, accessibility ${pct(run.summary.accessibility)}, best practices ${pct(run.summary['best-practices'])}, SEO ${pct(run.summary.seo)}`);
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Lighthouse (mobile)\n\n${lines.map((l) => `- ${l}`).join('\n')}\n`);
}
