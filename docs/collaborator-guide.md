# Collaborator guide: building sketch-gallery with apb

You'll help build sketch-gallery, a web gallery for posting and browsing sketches. AI agents do most of the design and coding; you give direction and details when needed. We're following [apb](https://github.com/hornof/apb/blob/main/docs/playbook.md), a workflow for building software with Claude (you don't need to read it now). Go through the steps below in order; this page is the whole map.

- Repo: https://github.com/hornof/sketch-gallery
- Board: https://github.com/users/hornof/projects/2

1. **Accept the invite** to the repo (email from GitHub, or github.com/notifications).

2. **Set up Claude Code.** Install it ([quickstart](https://code.claude.com/docs/en/quickstart)), then clone the repo with `git clone https://github.com/hornof/sketch-gallery`. In your terminal (not inside Claude), run `claude plugin marketplace add hornof/apb` and `claude plugin install apb@apb`. Now run `claude` inside the `sketch-gallery` folder. If it says `gh` is missing or not logged in, let it fix that (one browser login). It will ask permission for commands as it goes; answer "Yes, and don't ask again" for build, test and git commands. It saves those in `.claude/settings.local.json`, which is yours only and git-ignored. From here on you do everything by prompting Claude in this repo, including questions: "what do I do next?", "this isn't working", "what does X mean?" It has the repo and GitHub, so it knows the state.

3. **Brain dump.** Write everything you want sketch-gallery to do as a comment on the brain-dump ticket on the board; the ticket lists the questions to answer. Then tell Claude: "I posted the brain dump on issue #N; draft the PRD." It writes `docs/PRD.md` and opens a PR.

4. **Review the PRD.** Read the PR. Comment on it, or tell Claude "I added comments, take a look," until it says what you mean. Merging the PR is your approval (gate 1). Nothing gets built before that.

5. **TDD.** Tell Claude: "PRD approved; draft the TDD." It writes `docs/TDD.md` (architecture, where data lives, how each requirement is tested) and opens a PR. Same review loop; merging is gate 2. CI and hosting are already connected; right after gate 2, Claude points them at the stack the TDD picks.

6. **Session 0.** By prompting only: make a small change, open a PR, have a reviewer who didn't write it approve, merge it, see it deploy. About 2 hours; you'll have touched the whole pipeline.

7. **Build.** Tell Claude "build the next card." It takes the top card from the board, writes tests first, then code, and opens a PR. A reviewer who didn't write it approves; you merge; check the live site.
