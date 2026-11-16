# sketch-gallery: how it was built

The history of this project, one entry per stage, oldest first. A newcomer should be able to read it in five minutes and understand why the project looks the way it does. The PRs hold the details; this file holds the turning points.

## 2026-11-06: Setup
- Repo and board created. PRD input: [issue 2](https://github.com/hornof/sketch-gallery/issues/2).
- This project is a trial run of the apb process: a small yearly sketch gallery, built first with placeholder drawings so the process can be tested before the real one.
- A test workflow was added at setup, before there was anything to test. apb has since moved that step to after the TDD.

## 2026-11-12: PRD (gate 1) approved
- **Placeholder drawings come from ChatGPT.** Six sources were compared (old public-domain artists, Gemini, ChatGPT, drawings made in code); ChatGPT's single object on white matched the look best. One theme per year, 161 drawings in all.
- **ChatGPT's limits shaped the work.** After about 150 images in 3 hours it asked for pauses, and later it refused until a reset time it named. Near the limit it squeezed several drawings into one picture. The last two themes were made by a scheduled task, in batches of four every 20 minutes.
- **The owner adds drawings from a laptop, not a web page.** Commands add drawings to the repo, and dragging files into GitHub is the backup. An owner page with Google sign-in was considered and moved to Future work: it needs storage, server code and a login.
- **Cut to keep the first build small:** a Grid/List switch, dark mode, and generating drawings from the site. All are in Future work.
- **The address is `sketch-gallery.hornof.org`.** Other options were turned down: a path under hornof.org (every drawing would need a copy in another repo), the free `pages.dev` address (looks unfinished), and other domains (taken or expensive).
- **Mistake and fix:** one session asked for permission more than 30 times, because a repo settings file overrode the human's auto mode. The rule now: no permission mode in repo files.

## 2026-11-14: TDD (gate 2) approved
- **Plain files on Cloudflare Pages.** A short Node program builds one page per year and makes the thumbnails. No server code, no database. PhotoSwipe 5 is the pop-up; it needs a few added lines so arrow buttons and keys slide like a swipe, and one setting so double-tap zooms to full size.
- **The PRD changed twice during the TDD review, by the human's choice.** Drawing links now use the full date (`/2025/#2025-10-07`), because day-only links clashed (October 3 and November 3 were both `#3`). The demo's example message now says November 3, since October 3 already has a drawing.
- **What the review changed.** It dropped a list of drawing subjects, so a drawing's description for screen readers is its date only. It added: removing location data from photos, turning phone photos upright, an address fix for a year with no drawings, and `./add` getting the latest version before it sends a drawing.
- **Owner commands early.** `./add` and `./import` come right after the build reads the drawings, so the real drawings arrive early and every later preview shows them.
- **Few rebuilds.** Cloudflare rebuilds once per push, so `./import` takes several year folders in one push: all 161 drawings are one rebuild. The human runs it after its PR merges, because only the human changes main.
- **The human stays in the loop during the build.** An issue starts only when the issues it needs are merged. Every PR says what to look at in a minute or two, and the site's look and the pop-up get an early preview link.
- **How reviews work now.** The reviewer posts each item inline on the doc, and its summary is only an index. The human rules on each item before anything is fixed, and only the human resolves threads. 38 items in all.
- **Mistakes and fixes:** many review items were unclear at first: unexplained words, no examples, something new with no word on where it came from. The human traced this to apb's system design guide, which needs an overhaul ([apb #13](https://github.com/hornof/apb/issues/13)). The reviewer's notes now require context and a concrete example. Claude once read only the first page of PR comments and said all were answered; it now reads every page and counts.
- **Ten issues** for the build: [#12](https://github.com/hornof/sketch-gallery/issues/12) to [#21](https://github.com/hornof/sketch-gallery/issues/21).

## 2026-11-15: Build
- **Every feature is live** at `sketch-gallery.hornof.org`: the 161 drawings, a page per year, switching years in place, the pop-up with zoom, next and previous, drawing links, the link preview and browser rules. Built as [#12](https://github.com/hornof/sketch-gallery/issues/12) to [#20](https://github.com/hornof/sketch-gallery/issues/20), plus two issues found on the way: the build stops when `drawings/` is missing ([#30](https://github.com/hornof/sketch-gallery/issues/30)), and browsers keeping old page code for 4 hours ([#37](https://github.com/hornof/sketch-gallery/issues/37)).
- **The real drawings came first.** `./add` and `./import` were built before the pages, so every preview after that showed the real drawings.
- **The build was too slow, and the process changed halfway.** The first issues took about 2 hours each: the full browser suite ran 3 to 5 times per issue, and every review took two rounds. From #18's review on: one review round, where the builder fixes clear items without waiting and the human sees only visual questions and real trade-offs; builders run only the tests they touch, and GitHub runs everything; issues that touch different code are built at the same time. Later issues took 17 to 85 minutes from start to merge. The slow step is now GitHub's browser tests, 11 to 23 minutes per push. Details: [apb #22](https://github.com/hornof/apb/issues/22).
- **What the reviews caught.** A few real bugs a visitor would have hit: Firefox downloading other years' thumbnails, Back losing the visitor's place, the arrows losing their circle when tapped. Most other items were missing tests or wording. Nearly every decision went the way the reviewer recommended; the human's eye mattered most on visual choices (thumbnail size, colors, the preview image).
- **Launch checks** are recorded in [docs/launch/launch-checks.md](launch/launch-checks.md), with iPhone screenshots.
- **Mistakes and fixes:**
  - A test froze for 69 minutes unnoticed. Every child process now has a time limit, and running agents are checked every few minutes.
  - Permission prompts came back mid-session, from commands run in the desktop app's Terminal panel. That panel is no longer used.
  - The orchestrator sat idle for 21 minutes after a merge, saying the PR was still waiting, because nothing told it the merge had happened. A script now watches GitHub and wakes it within 20 seconds ([apb #23](https://github.com/hornof/apb/issues/23)).
  - Statements about times and status were sometimes guessed. Each one is now checked in the same turn.
