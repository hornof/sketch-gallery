# Build log

One line per iteration: date · what changed · tests (pass/fail count). Append-only; the builder writes it.

- 2026-11-14 · #12 setup proof: package.json (Node 22, Vitest 5), build/build.mjs placeholder page, tests/build.test.mjs, CI runs install, build, test · tests 4/4 pass (before build.mjs existed: the build step failed, 4 skipped; a changed title fails 1)
- 2026-11-14 · #12 review fixes: lock file Node range, README Node 22.12+, LOG and MAP corrections, CI on checkout/setup-node `@v5` and runs the map script's tests · site tests 4/4 pass, map script tests 26/26 pass
- 2026-11-14 · #12 PR #23 review items 9 and 10: README tests/ row names the site's tests, LOG entries are list items · site tests 4/4 pass
- 2026-11-14 · #13 tests first: dates and file names, location removal, file rules, thumbnails and the list; test drawings in tests/fixtures/ made by a script · 2 failed, 3 test files could not load (no build code yet)
- 2026-11-14 · #13 build/dates.mjs, build/jpeg.mjs, build/drawings.mjs; build.mjs writes dist/drawings.json, dist/thumbs/, dist/full/ · site tests 56/56 pass; Stryker 95.5% (dates.mjs 100%, drawings.mjs 97%, jpeg.mjs 92%)
- 2026-11-14 · #13 PR #25 review fixes, tests first: thumbnails 500 pixels (items 1, 10), a JPEG cut short inside its picture data is listed (item 6), file name → date → file name round trip on names built from real dates (item 5) · 2 failed (500 pixels, cut-short JPEG), 55 pass
- 2026-11-14 · #13 thumbnails 500 pixels on the long side; a thumbnail that fails to decode is listed as "isn't really a JPEG" · site tests 57/57 pass; build on the 161 placeholder drawings passes, biggest thumbnail 59,164 bytes
- 2026-11-14 · #13 docs: MAP "Now" line names #14 and #16, "full-size copies" in MAP and two test titles, Thumbnail Size Check artifact row; README notes Stryker wants Node 22.18+ · site tests 57/57 pass
- 2026-11-14 · #13 npm audit fix changed nothing (typed-rest-client 2.3.1 pins qs 6.15.1), so package.json overrides qs to ^6.16.1; npm audit: 3 moderate left, all minimatch inside Stryker; --omit=dev 0 · site tests 57/57 pass
- 2026-11-14 · #13 Stryker after the review fixes: 95.3% (dates.mjs 100%, drawings.mjs 96.35%, jpeg.mjs 91.72%), 18 not caught; the new one, .catch returning undefined instead of null, changes nothing · site tests 57/57 pass
- 2026-11-14 · #16 tests first: browser tests (Playwright, axe) for R1, R2 look, R4, R9, thumbnail loading, accessibility, always light, fonts, no login; build tests for the year pages; Lighthouse and browser jobs in CI · build tests: 1 file could not load (no build/pages.mjs); browser tests on the placeholder page: most of 162 failed
- 2026-11-14 · #16 build/pages.mjs: home page and /YYYY/ pages, year menu, grid with dates, fonts on the site, always light; browser tests now scroll through the page and allow on-screen thumbnails 2 seconds (WebKit) · site tests 65/65; browser tests 162/162 on the test drawings and 162/162 on the 161 placeholder drawings; Lighthouse mobile 99 performance, 100 accessibility
- 2026-11-14 · #16 README, MAP: browser tests, Lighthouse, build/pages.mjs, branch previews · map script tests 26/26
