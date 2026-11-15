# sketch-gallery

A web gallery for posting and browsing sketches, one page per year.

Built with the apb process: https://github.com/hornof/apb

## Using it

You need Node 22, version 22.12 or later (`.nvmrc` installs the newest 22). Stryker asks for Node 22.18 or later; on an older 22 it warns but runs. From the repo folder:

- `npm install` installs the tools, once.
- `npm run build` builds the site into `dist/` from the drawings in `drawings/`, one folder per year, each file named like `2025-10-07.jpg`. Until `drawings/` exists, it uses the test drawings in `tests/fixtures/drawings/`. If a file breaks the rules, the build stops and lists every problem. `npm run build -- --drawings <folder>` builds from another folder laid out the same way. That folder must hold only year folders: to try the placeholder drawings, copy the six year folders of `../sketch-gallery-placeholders` into an empty folder first.
- `npm run serve` shows the built site at http://localhost:4173/, the way Cloudflare serves it. `dist/drawings.json` is the list of drawings.
- `npm test` runs the site's tests.
- `npm run test:browser` runs the browser tests on the built site: Chromium, Firefox and WebKit at 375, 768 and 1440 px wide. The first time, `npx playwright install chromium firefox webkit` downloads the browsers. After building with `--drawings <folder>`, run `DRAWINGS=<folder> npm run test:browser` so the tests expect that folder's drawings.
- `npm run lighthouse` runs Lighthouse, Google's page-speed check, on the built site, as a phone would see it, and fails below 90 for speed or accessibility. `node scripts/lighthouse-scores.mjs` prints the scores. It needs Chrome and Node 22.19 or later. Lighthouse runs through `npx` at a fixed version rather than from package.json, because listing it there adds 13 high-severity warnings to `npm audit`; keep it out of package.json.
- `npm run mutation` runs Stryker: it puts small deliberate bugs into the date, file-name and drawing code and checks that a test catches each one. It takes about a minute.
- `npm run fixtures` makes the test drawings again.
- `python3 scripts/test_map_artifact.py` runs the map script's tests.

GitHub runs the build, the site's tests, the map script's tests, the browser tests and Lighthouse on every PR and every push to main.

## Files

| File | What it is | Who reads it |
|---|---|---|
| docs/collaborator-guide.md | For an invited collaborator: the steps, in order | collaborator |
| docs/MAP.md | Every piece of the project and where it lives | anyone |
| docs/drawings.md | The placeholder drawings: themes by year, samples, how they were made; images in docs/drawings/ | the human |
| docs/research/drawing-sources.md | The six drawing sources compared, and why ChatGPT was chosen; images in docs/research/drawing-sources/ | the human |
| .github/workflows/ci.yml | The test workflow GitHub runs on every PR and every push to main: install, build, the site's tests, the map script's tests, the browser tests and Lighthouse | Claude |
| playwright.config.mjs | Settings for the browser tests: which browsers and widths | Claude |
| lighthouserc.json | Settings for Lighthouse: which page, and the lowest scores allowed | Claude |
| scripts/lighthouse-scores.mjs | Prints the Lighthouse scores, and adds them to the summary of GitHub's test run | Claude |
| package.json, package-lock.json | The Node version, the tools the site uses, and the `build` and `test` commands | Claude |
| .nvmrc | The Node version (22), for the laptop and the automatic tests | Claude |
| build/build.mjs | Builds the site into `dist/` (not stored in the repo) | Claude |
| build/pages.mjs | Writes the home page and one page per year, and puts the fonts on the site | Claude |
| build/drawings.mjs | Reads the drawings folder, checks the file rules, makes the thumbnails, the full-size copies and the list of drawings | Claude |
| build/dates.mjs | Turns a file name like `2025-10-07.jpg` into a date and back, and writes labels like "October 7" | Claude |
| build/jpeg.mjs | Removes hidden notes, like the place a photo was taken, from the full-size copies, keeping only which way is up | Claude |
| tests/ | The site's automatic tests, run by `npm test`; the browser tests in tests/browser/, run by `npm run test:browser`; and tests/serve.mjs, which serves `dist/` the way Cloudflare does | Claude |
| tests/fixtures/ | Test drawings, used until the real ones are in `drawings/`, and `make-fixtures.mjs`, which makes them | Claude |
| stryker.config.json | Settings for Stryker, run by `npm run mutation` | Claude |
| .gitignore | Files git leaves out of the repo | Claude |
| docs/HISTORY.md | The project's turning points: decisions, surprises, changes of mind. Start here to see why the project looks the way it does | anyone |
| docs/reviewer-notes.md | The human's rulings on past reviews; the reviewer reads it before every review | Claude |
| scripts/map-artifact.py | Builds the map artifact from docs/MAP.md; its tests are in scripts/test_map_artifact.py | Claude |
| docs/PRD.md | What it does and for whom (written from the PRD input), with any mockups in docs/mockups/ | the human, Claude |
| docs/TDD.md | How it's built and tested (written after the PRD is approved) | the human, Claude |
| CLAUDE.md | Rules every Claude session follows in this repo | Claude |
| .claude/settings.json | What Claude is allowed to do here, shared by everyone | Claude |
| LOG.md | Claude's record of every build step: what changed and whether tests passed | Claude |
| LESSONS.md | Technical lessons from debugging and testing; each rule they lead to also goes in CLAUDE.md | Claude, builders |

Progress is on the GitHub Projects board, not in this file: [sketch-gallery](https://github.com/users/hornof/projects/2)
