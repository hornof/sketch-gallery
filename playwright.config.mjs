// Browser tests (TDD section 11): Chromium, Firefox and WebKit, each at phone,
// tablet and desktop width, on the built site in dist/. Run `npm run build` first.
import { defineConfig } from '@playwright/test';

const browsers = ['chromium', 'firefox', 'webkit'];
const sizes = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

export default defineConfig({
  testDir: 'tests/browser',
  testMatch: '*.pw.mjs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { baseURL: 'http://localhost:4173' },
  projects: browsers.flatMap((browserName) =>
    sizes.map((viewport) => ({ name: `${browserName}-${viewport.width}`, use: { browserName, viewport } })),
  ),
  webServer: {
    command: 'node tests/serve.mjs dist 4173',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
  },
});
