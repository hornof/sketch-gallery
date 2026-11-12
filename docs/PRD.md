# PRD — sketch-gallery   (status: DRAFT, revision 2)

Source: brain dump on issue #2 (2026-11-10) and Luke's review of PR #4 (2026-11-11).

## What & why
A small public website that shows an artist's ink drawings, one gallery per year. It is a static site (plain web pages, no database, no server code) on Cloudflare's free tier.

This repo is a **trial run**. A friend of Luke's, an Inktober artist, will build the real site with apb in a separate repo. Luke builds this one first to find and fix problems in apb. The trial site also goes on hornof.org as a portfolio project, so it must look good and be safe to show anyone.

The real artist's archive sets the shape of the trial: 6 years (2021–2026), 160 drawings, portrait, black ink or pencil on white. The trial uses **AI-generated placeholder drawings** in that spirit, never the artist's own images (see Content).

## Mockups
**[Sketch Gallery mockups](https://claude.ai/artifact/BP1P6kU4J1Sg5cFvTqto7o)**: five screens, and board 1 is clickable (press Play). The features below describe what the mockups show. Gray tiles stand in for drawings. At approval, a screenshot of each board goes into `docs/mockups/` so the approved look can't drift.

## Who it's for
- **Viewers:** anyone with the link, including visitors from the hornof.org projects page. They flip through a year, open a drawing large, step through the rest, and switch years.
- **Owner:** the artist (Luke stands in during the trial). Loads past years in bulk once, then adds new drawings from a laptop. Luke also wants to demo this live: add a drawing and show it appear under its year.

## Features

### Viewer

1. **One page.** A title ("Sketch Gallery"), the line "This gallery displays drawings made over several years.", a year menu, and the drawings. The site names no artist and no person. *Check: the page text contains no personal names.*
2. **Year menu:** `2026 | 2025 | 2024 | 2023 | 2022 | 2021`, newest first, current year underlined. The newest year shows by default. Clicking a year **replaces** the drawings in place: no new page load, no jump down the page. *Check: clicking each year shows exactly that year's count (31, 31, 6, 31, 31, 30); the scroll position resets to the top of the grid.*
3. **Links per year and per drawing:** each year has its own URL (`/2025/`) and each drawing too (`/2025/#7`), so hornof.org or a message can link straight to one. Back and Forward move between years and open or closed drawings. *Check: pasting each URL into a fresh tab opens that year or that drawing.*
4. **Grid:** uniform portrait thumbnails in day order, each with its date ("October 7"). The grid has 2 columns at phone width and grows to 6 on a wide desktop. *Check: column count at 375, 768 and 1440 px is 2, 3–4 and 6.*
5. **Pop-up viewer:** clicking a thumbnail grows it into a large view over the grid (a short zoom from the thumbnail). Closing it by X, Esc, a click on the dark area, Back, or a downward swipe on a phone shrinks it back to the same spot in the grid. *Check: each close method returns to the grid at the same scroll position.*
6. **Next/previous inside the pop-up:** on-screen arrows, keyboard arrows, and swipe on a phone. All three **slide** to the next drawing with an animation; none swaps instantly. It stays within the year and stops at the first and last drawing (the arrow hides). The counter reads "7 / 31". *Check: each gesture, forward and back, lands on the right drawing; the slide animation runs for the arrow buttons and the keys, not only for swipe.*
7. **Zoom on a phone:** pinch or double-tap zooms the full-size drawing, so small hand lettering is readable. *Check: on a 375 px screen, zooming reaches the image's full resolution.*
8. **Motion:** every animation finishes within 350 ms. When the device asks for reduced motion (`prefers-reduced-motion`), the animations are switched off. *Check: timings measured; reduced-motion honored.*
9. **Phone, tablet and desktop:** *Check: no horizontal scroll at 375, 768 or 1440 px; every button is at least 44 px.*
10. **Fast:** *Check: a 31-drawing year is usable within 2 s on throttled "Fast 4G"; Lighthouse mobile performance ≥ 90; each thumbnail ≤ 60 KB; the pop-up shows the original file at full resolution.*

### Owner

11. **Bulk import:** one command on the laptop takes a year's folder of JPEGs and makes it that year's gallery. Each file is named by its date, `YYYY-MM-DD.jpg`, and that name is the only source of the date: it sets the caption, the order and the link (`2025-10-07.jpg` → "October 7", `/2025/#7`). File timestamps are ignored, because git resets them. *Check: a 31-image folder is live within 5 min of the command finishing; a file not named `YYYY-MM-DD.jpg` is refused with a clear message.*
12. **Add one drawing:** one command on the laptop adds a single dated JPEG, and creates the year if it is new. *Check: it is live within 5 min, in the right year and the right place; the other drawings are unchanged. This is the live demo.*
13. **No login on the site:** viewers never log in (the site is public). The site has no upload page, so nothing on it can be changed from a browser. Changes go through the owner's laptop and GitHub, so GitHub's login is the only lock. *Check: the deployed site serves only static files: no form, no API.*

### Nice to have (built last, and only if small)

14. **Grid / List switch,** as on the Bezsonova gallery. The list view shows a bigger thumbnail beside the date. Without prompt words or descriptions the list adds little, so it can be dropped.

## Content: the trial's drawings
- **Made in ChatGPT** (Luke's subscription), with Claude driving it in Luke's Chrome. The style references are two of the artist's drawings (a hand and a button) and five earlier ChatGPT results in the same style. The artist's map drawing is left out because it's a full scene with red ink. Six sources were tried side by side (Piranesi, Doré, Leonardo, Gemini, ChatGPT, drawn in code); see the [trial page](https://claude.ai/artifact/1o6uuCreKn6wVuCyqG5dHV).
- **Style:** one object per drawing, black ink lines and hatching, no color, plain white background, no text.
- **160 drawings,** matching the real archive's counts: 2026: 31, 2025: 31, 2024: 6, 2023: 31, 2022: 31, 2021: 30.
- **One theme per year,** so switching years visibly changes the page: 2026 household items, 2025 outdoors, 2024 make-believe, 2023 tools, 2022 food, 2021 animals. Every subject is listed in advance with no repeats.
- **Dates:** each year runs October 1 through N (2024 is October 1–6). The date is the filename (see feature 11).
- **Processing:** grayscale, scaled to fit 1440 × 1671 px and padded with white (never cropped), JPEG. No size limit on these full-size files; the site makes its own small thumbnails (feature 10).
- **When:** generation started during the PRD stage. ChatGPT's daily image cap is not published, so the 160 may take several days. Unfinished years are fine: they get bulk-imported later, which also tests feature 11, and one can be held back for the live demo.
- **No AI disclosure on the site.** Luke's hornof.org projects page explains how the project was built.
- The artist's two reference drawings stay on Luke's laptop. None of the artist's images are in this repo or on the site.

## Non-goals
Viewer accounts, comments, likes, search, analytics, selling prints, more than one artist, uploading from a phone, editing images in the browser, a database, a "word of the day" caption (maybe later).

## Answered (from the review)
- **Public or private:** public; anyone with the link can view it, and it is linked from hornof.org.
- **Upload from:** the laptop only.
- **Text per drawing:** the image, plus the date if easy (it is: the filename is the date). No prompt word for now.
- **Gallery per year or per month:** per year. A year with only a few drawings (2024: 6) is fine.
- **File type:** JPEG. Black and white or grayscale.
- **Look and feel:** close to the Bezsonova gallery, with one year shown at a time, plus the pop-up viewer (see Mockups).
- **Previous/next year links:** not needed; the year menu covers it.
- **Domain:** pros and cons, as asked:

  | Option | Cost | For | Against |
  |---|---|---|---|
  | Subdomain, e.g. `sketches.hornof.org` | Free | One DNS record; clearly part of the hornof.org portfolio | Tied to your domain (fine for a trial) |
  | `sketch-gallery.pages.dev` | Free | No setup at all | Looks unfinished on a portfolio page |
  | `sketch-gallery.com` | — | — | **Taken** (registered at Wix since 2022) |
  | `sketch-gallery.ai` | $80/yr, 2-year minimum ($160 up front) | Available as of 2026-11-11 | Costly; ".ai" suggests the drawings are AI-made |

  Recommendation: `sketches.hornof.org`. The real artist picks a domain for the real site.
- **Auth:** covered by feature 13. The details (GitHub, Cloudflare deploy keys) go in the TDD.
- **How to make the 160 drawings:** see Content.

## Future work (after the site is live and on hornof.org)
**"Generate drawings" for the owner.** For a demo: pick a year or a date range and a number, the site makes new placeholder drawings named by date, and the owner imports them so they show up in the right year.

Why it waits:
- **A ChatGPT subscription can't be used from a website.** Plus doesn't include the OpenAI API; the API is a separate pay-as-you-go account. Third-party figures put an image at roughly $0.05 (medium quality) to $0.21 (high), so about $1.50–$6.50 for a 31-drawing year. OpenAI doesn't publish a flat price, so check it before building.
- **It breaks feature 13.** The API key must stay secret, so the site would need server code (a Cloudflare Worker) and an owner login. Today the site is static files only, with no login.
- **A smaller version fits the current design:** a laptop command, like bulk import (`generate --year 2027 --count 5`), that calls the API and writes dated files. That adds no server and no login, but still costs API money. A free option is what's used for the trial: Claude drives ChatGPT in the owner's Chrome. It's slow, it needs the laptop, and it's subject to the daily cap.

## Open questions
2. **Domain:** OK with `sketches.hornof.org`, or another name?
3. **End of a year in the pop-up:** stop at the last drawing (as drawn), or wrap around to the first?
4. **Grid / List switch:** keep it as a nice-to-have, or drop it?
