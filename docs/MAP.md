# sketch-gallery: project map

Every piece of this project, where it lives, and when it's used. Claude adds each new piece as soon as it exists, and checks the whole map after every merge, whenever a PR opens, at the end of each stage, and whenever the human asks where things stand.

The map exists in two places with the same content: `docs/MAP.md` in the GitHub repo, and the [map artifact](https://claude.ai/artifact/Pm6QZUibPcqXohWUKnVLSx) in Claude. Claude edits only `docs/MAP.md` and builds the map artifact from it.

**Now:** Build. In review: [#16](https://github.com/hornof/sketch-gallery/issues/16) (year pages and grid), which waits for [#15](https://github.com/hornof/sketch-gallery/issues/15). Next: [#14](https://github.com/hornof/sketch-gallery/issues/14) (`./add`), then [#15](https://github.com/hornof/sketch-gallery/issues/15) (`./import`).

```mermaid
flowchart LR
  s1["PRD input"]:::done --> s2["PRD (gate 1)"]:::done --> s3["TDD (gate 2)"]:::done --> s4["Split the TDD into issues"]:::done --> s5["Build"]:::now --> s6["Review and merge (gate 3)"]:::next --> s7["Check the live product"]:::next
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
| [docs/drawings.md](drawings.md) | The placeholder drawings: themes by year, samples, how they were made | PRD, then the build |
| [docs/research/drawing-sources.md](research/drawing-sources.md) | The six drawing sources compared, and why ChatGPT was chosen | PRD; kept for the record |
| TDD: [issue 8](https://github.com/hornof/sketch-gallery/issues/8) | The TDD's issue on the board | TDD (done) |
| [docs/TDD.md](TDD.md) | The technical design: tools, data, tests and the issues to build | Approved at gate 2; then the build |
| [docs/HISTORY.md](HISTORY.md) | The project's turning points, one entry per stage | A new entry after each stage |
| [docs/MAP.md](MAP.md) | The map, in the repo. The map artifact is built from it. | Any time |
| [docs/reviewer-notes.md](reviewer-notes.md) | The human's rulings on past reviews; the reviewer reads it before every review | Every review |
| [docs/collaborator-guide.md](collaborator-guide.md) | The steps, in order, for a collaborator invited to the project | When someone joins |
| [scripts/map-artifact.py](../scripts/map-artifact.py) | Builds the map artifact from `docs/MAP.md`. Its tests are in `scripts/test_map_artifact.py`. | After every change to `docs/MAP.md`, and again from main after each merge |
| [.github/workflows/ci.yml](../.github/workflows/ci.yml) | The test workflow GitHub runs on every PR and every push to main: it installs, builds the site and runs the site's tests on Node 22, then runs the map script's tests; the browser tests and Lighthouse run beside them | Every PR, every push to main |
| [build/build.mjs](../build/build.mjs) | Builds the site into `dist/`: the thumbnails, the full-size copies and the list of drawings, made by `build/drawings.mjs`, `build/dates.mjs` and `build/jpeg.mjs`; then the home page and one page per year, made by `build/pages.mjs` | Every build |
| [tests/](../tests/) | The site's automatic tests, run by `npm test`, and the browser tests in `tests/browser/`, run by `npm run test:browser` in Chromium, Firefox and WebKit at 375, 768 and 1440 px | Every PR, every push to main |
| [playwright.config.mjs](../playwright.config.mjs), [lighthouserc.json](../lighthouserc.json) | Settings for the browser tests, and for Lighthouse (Google's page-speed check, which must score at least 90 on a phone), and [scripts/lighthouse-scores.mjs](../scripts/lighthouse-scores.mjs), which prints the Lighthouse scores | Every PR, every push to main |
| [tests/fixtures/](../tests/fixtures/) | Test drawings, including one made like a sideways phone photo with a location, and the script that makes them. The build uses them until `drawings/` exists. | Every PR, until the real drawings are loaded |
| [stryker.config.json](../stryker.config.json) | Settings for Stryker, which checks that the tests catch small deliberate bugs in the date, file-name and drawing code. Run by `npm run mutation`, not in the automatic tests. | When that code changes |
| Process: [hornof/apb](https://github.com/hornof/apb) | The steps this project follows, installed as a Claude Code plugin | Every stage |

## Claude artifacts
Web pages Claude makes and hosts on claude.ai. Each is private to its owner until shared. The kind is in parentheses after each name: a Design is a set of clickable screen mockups; a plain page is any other page.

| Piece | What it is | When it's used |
|---|---|---|
| Map artifact: [sketch-gallery: project map](https://claude.ai/artifact/Pm6QZUibPcqXohWUKnVLSx) (plain page) | Built from `docs/MAP.md`; never edited by hand. | Any time |
| [Sketch Gallery mockups](https://claude.ai/artifact/BP1P6kU4J1Sg5cFvTqto7o) (Design) | Clickable designs of the main screens | PRD review (done) |
| [Placeholder Drawing Review](https://claude.ai/artifact/7DVZ6m3ZC6wztNZzgvbHci) (plain page) | Every placeholder drawing by year, newest year first, plus the ones set aside | While the drawings were made; reference |
| [Placeholder Drawing Trials](https://claude.ai/artifact/1o6uuCreKn6wVuCyqG5dHV) (plain page) | Six drawing sources compared, which led to choosing ChatGPT | Done; kept for the record |
| [Thumbnail Size Check](https://claude.ai/artifact/BTyoAzjMcVd7Sew6XvW298) (plain page) | Three drawings as 600 and 500 pixel thumbnails, side by side; the human chose 500 from it | Done; kept for the record |
| [Gallery Grid Preview](https://claude.ai/artifact/41sbeWZm5yDSiGRenbXgxB) (plain page) | Screenshots of the year pages with all 161 drawings, for the human's look at PR #27 | In use for PR #27's review; then kept for the record |

## On the human's computer
Folders, and scheduled tasks that run Claude unattended.

| Piece | What it is | When it's used |
|---|---|---|
| `~/src/claude/sketch-gallery` | Local copy of the repo | Every stage |
| `~/src/claude/sketch-gallery-placeholders` | Working folder for the drawings: one folder per year, files named by date, the original images, the set-aside ones, and the scripts that process them. `RUNBOOK.md` has the steps; `LOG.md` records every run. Not committed. | Making the drawings; the year folders get imported during the build |
| Scheduled task "Sketch gallery: next placeholder drawings" | Made the drawings in small batches, every 20 minutes | Done; paused |

## Outside services
| Piece | What it is | When it's used |
|---|---|---|
| ChatGPT | Made the placeholder drawings, driven by Claude in the human's browser | Done |
| Cloudflare Pages | Free hosting for the site at `sketch-gallery.hornof.org`, plus a preview address for every branch, like `year-pages.sketch-gallery.pages.dev` | Set up in #12 |
| hornof.org projects page | An entry for this project once it's live | After launch |
