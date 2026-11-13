# sketch-gallery: project map

Every piece of this project, where it lives, and when it's used. Claude adds each new piece as soon as it exists, and checks the whole map after every merge, whenever a PR opens, at the end of each stage, and whenever someone asks where things stand. The [map page](https://claude.ai/artifact/Pm6QZUibPcqXohWUKnVLSx) is built from this file.

**Now:** PRD approved (gate 1); TDD next

**Stages:** brain dump → PRD (gate 1) → TDD (gate 2) → board → build → review and merge (gate 3) → check the live product

## GitHub
| Piece | What it is | When it's used |
|---|---|---|
| Repo: [hornof/sketch-gallery](https://github.com/hornof/sketch-gallery) | The code, docs and content | Every stage |
| Board: [sketch-gallery](https://github.com/users/hornof/projects/2) | Progress, one card per piece of work | From the board stage on |
| [Open PRs](https://github.com/hornof/sketch-gallery/pulls) | Work waiting for review or merge. GitHub keeps this list current. | Every stage |
| Brain dump: [issue 2](https://github.com/hornof/sketch-gallery/issues/2) | The original description of the project | Start |
| [docs/PRD.md](PRD.md) | What the site does and for whom, with mockup screenshots in docs/mockups/ | Approved at gate 1 |
| [docs/drawings.md](drawings.md) | The placeholder drawings: themes by year, samples, how they were made | PRD, then the build |
| [docs/STORY.md](STORY.md) | The project's turning points, one entry per stage | A new entry after each stage |
| [docs/MAP.md](MAP.md) | This map | Any time |
| [scripts/map-page.py](../scripts/map-page.py) | Builds the map page from this file | After every change to this file |
| Process: [hornof/apb](https://github.com/hornof/apb) | The steps this project follows, installed as a Claude Code plugin | Every stage |

## Claude pages
Pages Claude makes and hosts. Each one is private to its creator until shared.

| Piece | What it is | When it's used |
|---|---|---|
| [Sketch Gallery Map](https://claude.ai/artifact/Pm6QZUibPcqXohWUKnVLSx) (plain page) | This map, as a page. Built from this file; never edited by hand. | Any time |
| [Sketch Gallery mockups](https://claude.ai/artifact/BP1P6kU4J1Sg5cFvTqto7o) (Design) | Clickable designs of the main screens | PRD review (done) |
| [Placeholder Drawing Review](https://claude.ai/artifact/7DVZ6m3ZC6wztNZzgvbHci) (plain page) | Every placeholder drawing by year, newest year first, plus the ones set aside | While the drawings were made; reference |
| [Placeholder Drawing Trials](https://claude.ai/artifact/1o6uuCreKn6wVuCyqG5dHV) (plain page) | Six drawing sources compared, which led to choosing ChatGPT | Done; kept for the record |

## Local files
Files on the developer's computer.

| Piece | What it is | When it's used |
|---|---|---|
| `~/src/claude/sketch-gallery` | Local copy of the repo | Every stage |
| `~/src/claude/sketch-gallery-placeholders` | Working folder for the drawings: one folder per year, files named by date, the original images, the set-aside ones, and the scripts that process them. `RUNBOOK.md` has the steps; `LOG.md` records every run. Not committed. | Making the drawings; the year folders get imported during the build |
| Scheduled task "Sketch gallery: next placeholder drawings" | Made the drawings in small batches, every 20 minutes | Done; paused |

## Outside services
| Piece | What it is | When it's used |
|---|---|---|
| ChatGPT | Made the placeholder drawings, driven by Claude in the developer's browser | Done |
| Cloudflare Pages | Free hosting for the site at `sketch-gallery.hornof.org` | Set up after the TDD |
| hornof.org projects page | An entry for this project once it's live | After launch |
