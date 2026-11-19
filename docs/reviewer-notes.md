# Reviewer notes

The human's rulings on past reviews. The reviewer reads this file before every review and follows it. One ruling per line, newest at the bottom, with the PR it came from.

## How to write a review
- Follow apb's review format (`agents/reviewer.md` in the apb plugin): one round, three buckets. **Fix**: you are sure; fixed straight away with no thread, and the orchestrator checks each fix. **Note**: you are not sure; the human skims it, and nothing changes unless the human asks. **Decision**: taste or a trade-off; one thread each, with lettered choices, a recommendation and `Resolve with no reply = <letter>`. (#47)
- Post the index and "What I checked" as the review, the Fix and Note items as one comment with no threads, and each Decision as its own inline thread. (#47)
- Number the items straight through all three buckets, so the human can reply "all agree except 14". Keep each item to one or two lines: what's wrong, where, and the fix. (#7)
- Start each item with a topic label: **[wrong or contradictory]**, **[naming]**, **[writing]** or **[code]**. (#7)
- A Decision gives the context in plain words, says exactly what the choices are, and recommends one. Don't ask a question that the human can't answer without digging. (#7)
- When the human says "don't care", the reviewer makes the call and lists it as a Fix next time. (#7)
- Explain technical terms in plain words, or leave them out. (#7)
- Give the context a reader needs: where a thing came from, a concrete example, and how it affects this project. If you can't give a real example, say so; never invent one. (#10)
- One point per item. When an item has more than one part, list each part as its own bullet. (#10)
- An obvious fix (like "pull before pushing") is a Fix, written as a plain statement, not a question. (#10)
- Write "R6 (next and previous)", not just "R6", and say which list "issue 5" belongs to. (#10)
- Only the human resolves threads. The reviewer and the orchestrator never resolve them. (#10)
- Read every page of comments (`gh api ... --paginate`). Before saying every comment is answered, count them. (#10)
- A Decision thread the human resolves with no reply means yes to the recommendation. (#27)

## Names
- One name per thing, everywhere: repo files, PR titles and descriptions, issue titles and bodies, the board and Claude artifacts. (#7)
- **issue**, not "card": a piece of work on the board. Every PR and every commit names its issue (`#N`). (#7)
- **the human**: the person working with Claude on this project. **collaborator**: someone invited to join, who follows `docs/collaborator-guide.md`. (#7)
- Gates are written **PRD (gate 1)**, **TDD (gate 2)** and **Review and merge (gate 3)**. (#7)
- **PRD input**, not "brain dump". **Claude artifact**, not "Claude page". **map artifact**, not "map page". `docs/HISTORY.md`, not STORY. (#7)

## Settled, don't raise again
- `docs/HISTORY.md` stays oldest first. (#7)
- The map shows the current stage in its diagram and on the "Now" line; the checks in CLAUDE.md keep it right. (#7)
- The renames in the approved PRD ("PRD input", "issue") were the human's choice. (#7)
- Commits made before a new rule are not rewritten to follow it. (#7)
- A drawing's link is `/YYYY/#YYYY-MM-DD`; the PRD's link examples were changed by the human's choice. (#10)
- Alt text is the date only; there is no subjects file. (#10)
- LOG.md is append-only for its words. A formatting fix that leaves the words unchanged (a leading `- `, backticks) is allowed on old entries. (#24)
