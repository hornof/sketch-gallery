# Reviewer notes

The human's rulings on past reviews. The reviewer reads this file before every review and follows it. One ruling per line, newest at the bottom, with the PR it came from.

## How to write a review
- Post the whole review on the PR before anything is fixed. Group the items under three headings: **High confidence** (the human skims these; a mistake here is a big deal), **Low confidence** (the human reads these carefully), and **Needs the human** (taste calls, or things the reviewer can't decide). Put most items under High confidence, but only items you're sure of. (#7)
- Number the items straight through all three groups, so the human can reply "all agree except 14". Keep each item to one or two lines: what's wrong, where, and the fix. (#7)
- Start each item with a topic label: **[wrong or contradictory]**, **[naming]**, **[writing]** or **[code]**. (#7)
- A "Needs the human" item gives the context in plain words, says exactly what the choices are, and recommends one. Don't ask a question that the human can't answer without digging. (#7)
- When the human says "don't care", the reviewer makes the call and lists it under High confidence next time. (#7)
- Explain technical terms in plain words, or leave them out. (#7)

## Names
- One name per thing, everywhere: repo files, PR titles and descriptions, issue titles and bodies, the board and Claude artifacts. (#7)
- **issue**, not "card": a piece of work on the board. Every PR and every commit names its issue (`#N`). (#7)
- **the human**: the person working with Claude on this project. **collaborator**: someone invited to join, who follows `docs/collaborator-guide.md`. (#7)
- Gates are written **PRD (gate 1)**, **TDD (gate 2)** and **Review and merge (gate 3)**. (#7)
- **PRD input**, not "brain dump". **Claude artifact**, not "Claude page". **map artifact**, not "map page". `docs/HISTORY.md`, not STORY. (#7)

## Settled, don't raise again
- `docs/HISTORY.md` stays oldest first. (#7)
- The map shows the current stage in its diagram and on the "Now" line; the checks in CLAUDE.md keep it right. (#7)
