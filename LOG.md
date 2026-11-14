# Build log

One line per iteration: date · what changed · tests (pass/fail count). Append-only; the builder writes it.

- 2026-11-14 · #12 setup proof: package.json (Node 22, Vitest 5), build/build.mjs placeholder page, tests/build.test.mjs, CI runs install, build, test · tests 4/4 pass (before build.mjs existed: the build step failed, 4 skipped; a changed title fails 1)
- 2026-11-14 · #12 review fixes: lock file Node range, README Node 22.12+, LOG and MAP corrections, CI on checkout/setup-node `@v5` and runs the map script's tests · site tests 4/4 pass, map script tests 26/26 pass
- 2026-11-14 · #12 PR #23 review items 9 and 10: README tests/ row names the site's tests, LOG entries are list items · site tests 4/4 pass
