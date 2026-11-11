# PRD — sketch-gallery   (status: DRAFT)

Source: brain dump on issue #2 (2026-11-10).

## What & why
A small static website (plain web pages: no database, no server code) that holds Luke's Inktober doodles, one gallery per year. Luke has done Inktober for about 5 years, roughly 30 doodles a year, and the drawings live nowhere he can easily show friends. Hosting preference: Cloudflare, where hornof.org already lives, on the free tier.

## Who it's for
- **Luke (owner, the only writer).** Loads past years in bulk once, then adds new doodles one at a time or a month at once.
- **Friends (viewers, read-only).** A handful of people, visiting rarely. They come to flip through a year, open a doodle large, and move on to the next one or the next year.

## Features
Viewer:
1. Home page lists every year, newest first, each with a cover image and doodle count. *Check: every year in the data appears on the home page.*
2. Year page shows that year's doodles as a thumbnail grid in day order. *Check: a 31-doodle grid is usable within 2 s on a throttled "Fast 4G" connection; Lighthouse mobile performance ≥ 90.*
3. Opening a doodle shows it large, with previous/next by arrow keys, swipe on a phone, and on-screen buttons. Esc or browser Back closes it. *Check: each of these gestures, forward and back, lands on the right doodle.*
4. Every doodle and every year has its own URL. *Check: pasting a doodle URL into a fresh tab opens that doodle.*
5. A viewer can go to the next or previous year without returning home. *Check: links present on every year page.*
6. Open/close and page changes animate in ≤ 300 ms and are switched off when the device asks for reduced motion. *Check: timing measured; `prefers-reduced-motion` honored.*
7. Works from 375 px phone width up to desktop. *Check: no horizontal scroll at 375, 768, 1440 px.*
8. Full-size view shows the doodle at its original resolution (example: 1440 × 1671 PNG, 330 KB); grids use smaller thumbnails. *Check: each thumbnail ≤ 60 KB; full-size file pixel dimensions match the upload.*

Owner:
9. Bulk import: point one command at a folder of images and a year; they become that year's gallery, ordered by filename. *Check: a 31-image test folder appears on the live site within 5 min of the command finishing.*
10. Add one doodle to a year, creating the year if it is new. *Check: live within 5 min; existing doodles unchanged.*
11. Only Luke can change the site. *Check: the public site has no upload form or write endpoint; changes require push access to the repo.*

## Non-goals
Accounts for viewers, comments, likes, search, analytics, selling prints, more than one artist, editing images in the browser, a database.

## Open questions
1. **Public or friends-only?** Anyone with the link, or locked to invited emails? Note: the repo is public, so any image committed to it is public regardless. Friends-only means storing images outside the repo.
2. **Domain.** Free: a subdomain such as `doodles.hornof.org` (one DNS record, since hornof.org is already on Cloudflare). New `.com`: about $10–11/year at Cloudflare's at-cost registrar, plus 10 minutes of setup. Recommendation: the subdomain.
3. **Where do you upload from?** The laptop only (one command in this repo), or also the phone? Phone upload needs a login-protected upload page, which is a much bigger build. Recommendation: laptop now, phone later if you miss it.
4. **Text per doodle.** Show anything beside the image: day number, date, the Inktober prompt word ("Flex")? Or image only?
5. **One gallery per year or per month?** Inktober is October only. Do you draw in other months, or is "year/month" just one gallery per year?
6. **Past years' files.** Where are they now (phone photos, Instagram, scans), and are they named or dated so the day order is recoverable?
7. **File types.** PNG and JPEG only, or also HEIC straight from an iPhone? Always black-and-white, or some color?
8. **Look and feel.** Claude will propose 3–5 gallery sites to model. Facebook and Instagram pages need a login to read, so Claude cannot see Sam Douglass's posts; download a few images or screenshots and attach them to issue #2.
