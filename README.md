# sketch-gallery

A web gallery for posting and browsing sketches, one page per year.

Built with the apb process: https://github.com/hornof/apb

## Using it

You need Node 22, version 22.12 or later (`.nvmrc` installs the newest 22). Stryker asks for Node 22.18 or later; on an older 22 it warns but runs. From the repo folder:

- `npm install` installs the tools, once.
- `npm run build` builds the site into `dist/` from the drawings in `drawings/`, one folder per year, each file named like `2025-10-07.jpg`. Until `drawings/` exists, it uses the test drawings in `tests/fixtures/drawings/`. If a file breaks the rules, the build stops and lists every problem. Open `dist/index.html` in a browser to see the site, and `dist/drawings.json` for the list of drawings.
- `./add 2026-11-03.jpg` adds one drawing and sends it to GitHub; the site shows it about 2 minutes later. Run it on main. It gets the latest version from GitHub first, checks the file, says what it will do and asks for a yes. It changes nothing if anything is wrong, and undoes everything if sending to GitHub fails.
  - `./add photo.jpg --date 2026-11-03` adds a file that isn't named by date, and gives it that name.
  - `--replace` replaces the drawing already there for that date. Without it, `./add` refuses a date that already has a drawing.
  - `--yes` doesn't ask before adding.
  - `./add --help` lists these.
- `npm run try-add` tries `./add` safely: it runs the real `./add` code on a throwaway copy of the repo in a temporary folder, with a stand-in for GitHub there too. `npm run try-add -- --date 2026-11-03` tries a date that already has a drawing; add `--replace` to replace it.
- `npm test` runs the site's tests.
- `npm run mutation` runs Stryker: it puts small deliberate bugs into the date, file-name, drawing and `./add` code and checks that a test catches each one. It takes several minutes.
- `npm run fixtures` makes the test drawings again.
- `python3 scripts/test_map_artifact.py` runs the map script's tests.

GitHub runs the same build and both sets of tests, the site's and the map script's, on every PR and every push to main.

## Files

| File | What it is | Who reads it |
|---|---|---|
| docs/collaborator-guide.md | For an invited collaborator: the steps, in order | collaborator |
| docs/MAP.md | Every piece of the project and where it lives | anyone |
| docs/drawings.md | The placeholder drawings: themes by year, samples, how they were made; images in docs/drawings/ | the human |
| docs/research/drawing-sources.md | The six drawing sources compared, and why ChatGPT was chosen; images in docs/research/drawing-sources/ | the human |
| .github/workflows/ci.yml | The test workflow GitHub runs on every PR and every push to main: install, build, the site's tests, the map script's tests | Claude |
| package.json, package-lock.json | The Node version, the tools the site uses, and the `build` and `test` commands | Claude |
| .nvmrc | The Node version (22), for the laptop and the automatic tests | Claude |
| build/build.mjs | Builds the site into `dist/` (not stored in the repo) | Claude |
| build/drawings.mjs | Reads the drawings folder, checks the file rules, makes the thumbnails, the full-size copies and the list of drawings | Claude |
| build/dates.mjs | Turns a file name like `2025-10-07.jpg` into a date and back, and writes labels like "October 7" | Claude |
| build/jpeg.mjs | Removes hidden notes, like the place a photo was taken, from the full-size copies, keeping only which way is up | Claude |
| add | The `./add` command; its code is in `commands/add.mjs` | the human |
| commands/add.mjs | What `./add` does: checks the file, asks, adds it | Claude |
| commands/git.mjs | Gets the latest version from GitHub, and sends drawings to it, undoing everything if that fails | Claude |
| tests/ | The site's automatic tests, run by `npm test` | Claude |
| tests/sandbox.mjs, tests/try-add.mjs | A throwaway copy of the repo with a stand-in for GitHub, used by the `./add` tests and by `npm run try-add` | Claude |
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
