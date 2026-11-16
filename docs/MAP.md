# sketch-gallery: project map

Every piece of this project, where it lives, and when it's used. Claude adds each new piece as soon as it exists, and checks the whole map after every merge, whenever a PR opens, at the end of each stage, and whenever the human asks where things stand.

The map exists in two places with the same content: `docs/MAP.md` in the GitHub repo, and the [map artifact](https://claude.ai/artifact/Pm6QZUibPcqXohWUKnVLSx) in Claude. Claude edits only `docs/MAP.md` and builds the map artifact from it.

**Now:** Done. Every build issue (#12 to #21) is closed and the site is live at sketch-gallery.hornof.org.

```mermaid
flowchart LR
  s1["PRD input"]:::done --> s2["PRD (gate 1)"]:::done --> s3["TDD (gate 2)"]:::done --> s4["Split the TDD into issues"]:::done --> s5["Build"]:::done --> s6["Review and merge (gate 3)"]:::done --> s7["Check the live product"]:::now
  classDef done fill:#E3EFE9,stroke:#1F5E4A,color:#1F5E4A
  classDef now fill:#1F5E4A,stroke:#1F5E4A,color:#FFFFFF
  classDef next fill:#FFFFFF,stroke:#BBB6AC,color:#55524B
```

## GitHub
| Piece | What it is | When it's used |
|---|---|---|
| Repo: [hornof/sketch-gallery](https://github.com/hornof/sketch-gallery) | The code, docs and content. [README.md](../README.md) lists every file and who reads it. | Every stage |
| Board: [sketch-gallery](https://github.com/users/hornof/projects/2) | Progress: one issue for the PRD and one for the TDD, then one issue per piece of work from the TDD, plus one issue for any other change (like #9) | Every stage |
| [Open PRs](https://github.com/hornof/sketch-gallery/pulls) | Work waiting for review or merge. GitHub keeps this list current. | Every stage |
| Build issues: [#12 to #21](https://github.com/hornof/sketch-gallery/issues?q=is%3Aissue+%22TDD+item%22+in%3Atitle) | One issue per item in the TDD's section 12 | The build |
| [Future work](https://github.com/hornof/sketch-gallery/issues?q=is%3Aissue+label%3A%22future+work%22) | Ideas for later, not part of the current build: issues labeled "future work", not on the board | Any time an idea comes up |
| PRD input: [issue 2](https://github.com/hornof/sketch-gallery/issues/2) | The human's product details, which Claude used to write the first draft of the PRD. The PRD's issue on the board. | Start |
| [docs/PRD.md](PRD.md) | The Product Requirements Doc: what the site does and for whom, with mockup screenshots in docs/mockups/ | Approved at gate 1 |
| [docs/drawings.md](drawings.md) | The drawings: themes by year, samples, how they were made | PRD, then the build |
| [docs/research/drawing-sources.md](research/drawing-sources.md) | The six drawing sources compared, and why ChatGPT was chosen | PRD; kept for the record |
| TDD: [issue 8](https://github.com/hornof/sketch-gallery/issues/8) | The TDD's issue on the board | TDD (done) |
| [docs/TDD.md](TDD.md) | The technical design: tools, data, tests and the issues to build | Approved at gate 2; then the build |
| [docs/launch/launch-checks.md](launch/launch-checks.md) | The launch checks that need a person (#21): results, who checked, and the iPhone screenshots | At launch |
| [docs/HISTORY.md](HISTORY.md) | The project's turning points, one entry per stage | A new entry after each stage |
| [docs/MAP.md](MAP.md) | The map, in the repo. The map artifact is built from it. | Any time |
| [docs/reviewer-notes.md](reviewer-notes.md) | The human's rulings on past reviews; the reviewer reads it before every review | Every review |
| [docs/collaborator-guide.md](collaborator-guide.md) | The steps, in order, for a collaborator invited to the project | When someone joins |
| [scripts/map-artifact.py](../scripts/map-artifact.py) | Builds the map artifact from `docs/MAP.md`. Its tests are in `scripts/test_map_artifact.py`. | After every change to `docs/MAP.md`, and again from main after each merge |
| [.github/workflows/ci.yml](../.github/workflows/ci.yml) | The test workflow GitHub runs on every PR and every push to main: it installs, builds the site and runs the site's tests on Node 22, then runs the map script's tests; the browser tests and Lighthouse run beside them | Every PR, every push to main |
| [build/build.mjs](../build/build.mjs) | Builds the site into `dist/`: the thumbnails, the full-size copies and the list of drawings, made by `build/drawings.mjs`, `build/dates.mjs` and `build/jpeg.mjs`; then the home page and one page per year, made by `build/pages.mjs`, and `/site.js`, a copy of `build/site.js`, the page code that switches years in place and opens the pop-up; and `/popup/`, PhotoSwipe's code and look for the pop-up; and `/preview.jpg`, the link preview image, made by `build/preview.mjs`, and `_headers`, the browser rules, made by `build/headers.mjs` | Every build |
| [site.json](../site.json) | The site's title, description line and address, and the date of the drawing the link preview shows | When the human changes the preview drawing or the wording |
| [add](../add) | The `./add` command: adds one drawing and sends it to GitHub. Its code is in [commands/](../commands/). `./add --help` says how to use it. | Each time the human adds a drawing |
| [import](../import) | The `./import` command: adds one or more year folders in one commit and sends them to GitHub, all or nothing. Its code is in [commands/](../commands/). `./import --help` says how to use it. | Loading the drawings once, then any past year |
| [tests/](../tests/) | The site's automatic tests, run by `npm test`, and the browser tests in `tests/browser/`, run by `npm run test:browser` in Chromium, Firefox and WebKit at 375, 768 and 1440 px | Every PR, every push to main |
| [playwright.config.mjs](../playwright.config.mjs), [lighthouserc.json](../lighthouserc.json) | Settings for the browser tests, and for Lighthouse (Google's page-speed check, which must score at least 90 on a phone), and [scripts/lighthouse-scores.mjs](../scripts/lighthouse-scores.mjs), which prints the Lighthouse scores | Every PR, every push to main |
| [tests/try-add.mjs](../tests/try-add.mjs) | `npm run try-add`: runs `./add` on a throwaway copy of the repo with a stand-in for GitHub, made by `tests/sandbox.mjs`, which the `./add` and `./import` tests use too | To try `./add` without changing anything |
| [tests/try-import.mjs](../tests/try-import.mjs) | `npm run try-import`: runs `./import` the same way, on two sample year folders or on folders you name | To try `./import` without changing anything |
| [tests/fixtures/](../tests/fixtures/) | Test drawings, including one made like a sideways phone photo with a location, and the script that makes them. The tests build them with `--drawings tests/fixtures/drawings`. | Every PR |
| [stryker.config.json](../stryker.config.json) | Settings for Stryker, which checks that the tests catch small deliberate bugs in the date, file-name, drawing, `./add` and `./import` code. Run by `npm run mutation`, not in the automatic tests. | When that code changes |
| Process: [hornof/apb](https://github.com/hornof/apb) | The steps this project follows, installed as a Claude Code plugin | Every stage |

## Claude artifacts
Web pages Claude makes and hosts on claude.ai. Each is private to its owner until shared. The kind is in parentheses after each name: a Design is a set of clickable screen mockups; a plain page is any other page.

| Piece | What it is | When it's used |
|---|---|---|
| Map artifact: [sketch-gallery: project map](https://claude.ai/artifact/Pm6QZUibPcqXohWUKnVLSx) (plain page) | Built from `docs/MAP.md`; never edited by hand. | Any time |
| [Sketch Gallery mockups](https://claude.ai/artifact/BP1P6kU4J1Sg5cFvTqto7o) (Design) | Clickable designs of the main screens | PRD review (done) |
| [Placeholder Drawing Review](https://claude.ai/artifact/7DVZ6m3ZC6wztNZzgvbHci) (plain page) | Every drawing by year, newest year first, plus the ones set aside | While the drawings were made; reference |
| [Placeholder Drawing Trials](https://claude.ai/artifact/1o6uuCreKn6wVuCyqG5dHV) (plain page) | Six drawing sources compared, which led to choosing ChatGPT | Done; kept for the record |
| [Thumbnail Size Check](https://claude.ai/artifact/BTyoAzjMcVd7Sew6XvW298) (plain page) | Three drawings as 600 and 500 pixel thumbnails, side by side; the human chose 500 from it | Done; kept for the record |
| [Gallery Grid Preview](https://claude.ai/artifact/41sbeWZm5yDSiGRenbXgxB) (plain page) | Screenshots of the year pages with all 161 drawings, for the human's look at PR #27 | Done; kept for the record |

## On the human's computer
Folders, and scheduled tasks that run Claude unattended.

| Piece | What it is | When it's used |
|---|---|---|
| `~/src/claude/sketch-gallery` | Local copy of the repo | Every stage |
| `~/src/claude/sketch-gallery-placeholders` | Working folder for the drawings: one folder per year, files named by date, the original images, the set-aside ones, and the scripts that process them. `RUNBOOK.md` has the steps; `LOG.md` records every run. Not committed. | Making the drawings; its year folders were imported into `drawings/` with `./import` |
| Scheduled task "Sketch gallery: next placeholder drawings" | Made the drawings in small batches, every 20 minutes | Done; paused |

## Outside services
| Piece | What it is | When it's used |
|---|---|---|
| ChatGPT | Made the drawings, driven by Claude in the human's browser | Done |
| Cloudflare Pages | Free hosting for the site at `sketch-gallery.hornof.org`, plus a preview address for every branch, like `year-pages.sketch-gallery.pages.dev` | Set up in #12 |
| Cloudflare Cache Rule on hornof.org: "sketch-gallery: browsers follow the site's own cache headers" | For `sketch-gallery.hornof.org` only, browsers follow the site's own cache headers instead of the domain's 4-hour default, so a release reaches visitors at once | Added for #37 |
| hornof.org projects page | An entry for this project once it's live | After launch |
