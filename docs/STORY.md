# sketch-gallery: how it was built

The story of this project, one entry per stage, oldest first. A newcomer should be able to read it in five minutes and understand why the project looks the way it does. The PRs hold the details; this file holds the turning points.

## 2026-11-06: Setup
- Repo and board created. Brain dump: [issue 2](https://github.com/hornof/sketch-gallery/issues/2).
- This project is a trial run of the apb process: a small yearly sketch gallery, built first with placeholder drawings so the process can be tested before the real one.
- A test workflow was added at setup, before there was anything to test. apb has since moved that step to after the TDD.

## 2026-11-12: PRD approved (gate 1)
- **Placeholder drawings come from ChatGPT.** Six sources were compared (old public-domain artists, Gemini, ChatGPT, drawings made in code); ChatGPT's single object on white matched the look best. One theme per year, 161 drawings in all.
- **ChatGPT's limits shaped the work.** After about 150 images in 3 hours it asked for pauses, and later it refused until a reset time it named. Near the limit it squeezed several drawings into one picture. The last two themes were made by a scheduled task, in batches of four every 20 minutes.
- **The owner adds drawings from a laptop, not a web page.** Commands add drawings to the repo, and dragging files into GitHub is the backup. An owner page with Google sign-in was considered and moved to Future work: it needs storage, server code and a login.
- **Cut to keep the first build small:** a Grid/List switch, dark mode, and generating drawings from the site. All are in Future work.
- **The address is `sketch-gallery.hornof.org`.** Other options were turned down: a path under hornof.org (every drawing would need a copy in another repo), the free `pages.dev` address (looks unfinished), and other domains (taken or expensive).
- **Mistake and fix:** one session asked for permission more than 30 times, because a repo settings file overrode the human's auto mode. The rule now: no permission mode in repo files.
