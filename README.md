# sketch-gallery

A web gallery for posting and browsing sketches, one page per year.

Built with the apb process: https://github.com/hornof/apb

## Using it

You need Node 22, version 22.12 or later (`.nvmrc` installs the newest 22). Stryker asks for Node 22.18 or later; on an older 22 it warns but runs. From the repo folder:

- `npm install` installs the tools, once.
- `npm run build` builds the site into `dist/` from the drawings in `drawings/`, one folder per year, each file named like `2025-10-07.jpg`. With no `drawings/` folder, the build stops and says so, so the host keeps the last good site live. `npm run build -- --drawings tests/fixtures/drawings` builds the test drawings instead. `--drawings <folder>` works with any folder laid out the same way. That folder must hold only year folders. If a file breaks the rules, the build stops and lists every problem.
- `npm run serve` shows the built site at http://localhost:4173/, the way Cloudflare serves it, with the browser rules from `dist/_headers`. `dist/drawings.json` is the list of drawings.
- `site.json` holds the title, the description line, the address, and the date of the drawing the link preview shows, like `"preview": "2025-10-07"`. The build makes `dist/preview.jpg` from that drawing. If there's no drawing with that date, the build uses the newest one and says so.
- `./add 2026-11-03.jpg` adds one drawing and sends it to GitHub; the site shows it about 2 minutes later. Run it on main. It gets the latest version from GitHub first, checks the file, says what it will do and asks for a yes. It changes nothing if anything is wrong, and undoes everything if sending to GitHub fails.
  - `./add photo.jpg --date 2026-11-03` adds a file that isn't named by date, and gives it that name.
  - `--replace` replaces the drawing already there for that date. Without it, `./add` refuses a date that already has a drawing.
  - `--yes` doesn't ask before adding.
  - `./add --help` lists these.
- `./import ../my-drawings/2024 ../my-drawings/2025` adds one or more year folders in one commit and sends them to GitHub, so loading several years is one rebuild of the site. Each folder is named after its year and holds only drawings named by date. Run it on main. Like `./add`, it gets the latest version from GitHub first, checks every file, says what it will do and asks for a yes. It's all or nothing: if any file in any folder has a problem, it lists every problem and adds nothing.
  - `--replace` replaces drawings already there for the same dates. Without it, `./import` refuses them.
  - `--yes` doesn't ask before adding.
  - `./import --help` lists these.
- `npm run try-add` tries `./add` safely: it runs the real `./add` code on a throwaway copy of the repo in a temporary folder, with a stand-in for GitHub there too. `npm run try-add -- --date 2026-11-03` tries a date that already has a drawing; add `--replace` to replace it.
- `npm run try-import` tries `./import` the same way, on two sample year folders. `npm run try-import -- --bad` adds two badly named files to them, to see every problem listed and nothing added. `npm run try-import -- <folder> <folder>` imports your own year folders into the throwaway copy, starting with no drawings.
- `npm test` runs the site's tests.
- `npm run test:browser` runs the browser tests on the built site: Chromium, Firefox and WebKit at 375, 768 and 1440 px wide. The first time, `npx playwright install chromium firefox webkit` downloads the browsers. After building with `--drawings <folder>`, run `DRAWINGS=<folder> npm run test:browser` so the tests expect that folder's drawings.
- `npm run lighthouse` runs Lighthouse, Google's page-speed check, on the built site, as a phone would see it, and fails below 90 for speed or accessibility. `node scripts/lighthouse-scores.mjs` prints the scores. It needs Chrome and Node 22.19 or later. Lighthouse runs through `npx` at a fixed version rather than from package.json, because listing it there adds 13 high-severity warnings to `npm audit`; keep it out of package.json.
- `npm run mutation` runs Stryker: it puts small deliberate bugs into the date, file-name, drawing, `./add` and `./import` code and checks that a test catches each one. It takes 10 to 30 minutes.
- `npm run fixtures` makes the test drawings again.
- `python3 scripts/test_map_artifact.py` runs the map script's tests.

GitHub runs the build, the site's tests, the map script's tests, the browser tests and Lighthouse on every PR and every push to main.

## Files

| File | What it is | Who reads it |
|---|---|---|
| docs/collaborator-guide.md | For an invited collaborator: the steps, in order | collaborator |
| docs/MAP.md | Every piece of the project and where it lives | anyone |
| docs/drawings.md | The drawings: themes by year, samples, how they were made; images in docs/drawings/ | the human |
| docs/research/drawing-sources.md | The six drawing sources compared, and why ChatGPT was chosen; images in docs/research/drawing-sources/ | the human |
| .github/workflows/ci.yml | The test workflow GitHub runs on every PR and every push to main: install, build, the site's tests, the map script's tests, the browser tests and Lighthouse | Claude |
| playwright.config.mjs | Settings for the browser tests: which browsers and widths | Claude |
| lighthouserc.json | Settings for Lighthouse: which page, and the lowest scores allowed | Claude |
| scripts/lighthouse-scores.mjs | Prints the Lighthouse scores, and adds them to the summary of GitHub's test run | Claude |
| package.json, package-lock.json | The Node version, the tools the site uses, and the `build` and `test` commands | Claude |
| .nvmrc | The Node version (22), for the laptop and the automatic tests | Claude |
| build/build.mjs | Builds the site into `dist/` (not stored in the repo) | Claude |
| build/pages.mjs | Writes the home page and one page per year, and puts the page code, the pop-up (PhotoSwipe, in `/popup/`) and the fonts on the site | Claude |
| site.json | The site's title, description line and address, and which drawing the link preview shows | the human, Claude |
| build/preview.mjs | The link preview: the tags every page carries, and `/preview.jpg` (1200 × 630) made from the drawing `site.json` picks | Claude |
| build/headers.mjs | The browser rules, written to `_headers` and sent with every page: only the site's own code runs, and only hornof.org may show the site in a frame | Claude |
| build/site.js | The page code, served as `/site.js`: the year menu changes the grid without loading a new page, and Back and Forward move between years; a click on a drawing opens it in the pop-up, and Back closes it; in the pop-up, arrows, keys and swipes slide to the next drawing, and the address is the drawing's link, like `/2025/#2025-10-07`. Every page works without it | Claude |
| build/drawings.mjs | Reads the drawings folder, checks the file rules, makes the thumbnails, the full-size copies and the list of drawings | Claude |
| build/dates.mjs | Turns a file name like `2025-10-07.jpg` into a date and back, and writes labels like "October 7" | Claude |
| build/jpeg.mjs | Removes hidden notes, like the place a photo was taken, from the full-size copies, keeping only which way is up | Claude |
| add | The `./add` command; its code is in `commands/add.mjs` | the human |
| commands/add.mjs | What `./add` does: checks the file, asks, adds it | Claude |
| import | The `./import` command; its code is in `commands/import.mjs` | the human |
| commands/import.mjs | What `./import` does: checks every folder and file, asks, adds them all in one commit | Claude |
| commands/git.mjs | Gets the latest version from GitHub, and sends drawings to it, undoing everything if that fails | Claude |
| tests/ | The site's automatic tests, run by `npm test`; the browser tests in tests/browser/, run by `npm run test:browser`; and tests/serve.mjs, which serves `dist/` the way Cloudflare does | Claude |
| tests/sandbox.mjs, tests/try-add.mjs, tests/try-import.mjs | A throwaway copy of the repo with a stand-in for GitHub, used by the `./add` and `./import` tests and by `npm run try-add` and `npm run try-import` | Claude |
| tests/fixtures/ | Test drawings, used by the tests, and `make-fixtures.mjs`, which makes them | Claude |
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
