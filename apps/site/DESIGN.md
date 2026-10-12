# apps/site: design notes

> **Rafa's mark is in** (decision 31, round eight). `src/brand/mark.svg` and `src/brand/mark-white.svg` are `docs/design/assets/brand/verso-mark.svg` and `verso-mark-white.svg` copied byte for byte; never edit them here. If the drawing ever changes:
> 1. Copy both files from `docs/design/assets/brand/` again.
> 2. Run `pnpm --filter @verso/site logo` from the repository root: it rebuilds the site and recuts the favicons, the touch icon and the share image in `public/`; the nav and the footer draw the mark on the next build.
> 3. Commit the two SVGs and the four files in `public/`.

The marketing site's prototype: a static, single-page Next.js export for localhost, built 2026-10-07 from [docs/private/design/site-brief.md](../../docs/private/design/site-brief.md) on Rafa's go. It is the site's structure round in code, not a decision: Rafa's copy still gates anything public (the brand color, decision 29, is applied since round four and read from the tokens since round seven; Rafa's mark and his tagline are in since round eight, decision 31; the domain is `rankverso.com`, decision 30). This file records what the research found, what the site borrows, which libraries it uses and why, and where it departs from the tokens. The interactive strip (Inside the app's phones expand on a click) comes first, then the finalize round (the site made ready for rankverso.com: Log in, the movie screens drawn, Home reshot, the privacy notice, the brand audit), then round eight (Rafa's mark, the lockup, the icons and his tagline) comes first, then round seven (the brand tokens, the mocks on the app's tier palette, the domain and the logo swap), then round six (after "awesome", with five content changes), then round five (after "amazing", with three edits), then round four (after "exactly what I wanted, very close to perfect"), then round three (after "much, much closer" and "more sauce"), then round two (after he called round one "way too busy" and "way too long"); round one's research follows them for the record. Where rounds differ, the later one wins.

Run it with `pnpm site:dev` (http://localhost:3000; `/?medium=movies` opens the movies side). `pnpm site:build` writes the static export to `apps/site/out/`. Review screenshots at 1440 and 390, light and dark, both media, are in `.prototype/` (ignored by git); the interactive strip's in `.prototype/interactive/` (with `report.json`), the finalize round's in `.prototype/finalize/` (with `report.json`, the walk's numbers), round eight's in `.prototype/brand/` (with close-ups of the lockup, the footer, the movies Home and the favicon), round seven's in `.prototype/round-seven/` (with close-ups of the chips and badges), round five's in `.prototype/round-five/`, round four's in `.prototype/round-four/`, round three's in `.prototype/round-three/`, round two's in `.prototype/round-two/`, round one's in `.prototype/round-one/`.

## Interactive strip (2026-10-08)

**Revised after Rafa's review:** the caption under the large phone is the screen's name alone (Home, Search, Compare, Ranking); the sentences after the colon read as filler. The snap row below 768 px has no caption on either side.

The brief, Rafa's words: "Make Inside the app interactable. Home is bigger than the rest in this section for movies, but the other phones should expand once they are clicked on." He approved the plan: one large phone per row, games on the same pattern, a one-line caption under the large phone, the swipe row kept on narrow screens, the keyboard and screen readers served. One pull request from `main` after #85. The hero, How it works, Log in, Privacy, `robots` and `noindex`, both `vercel.json` files and `apps/holding` are untouched; no dependency was added.

### What changed

- **One large phone per row** (`components/feature-strip.tsx`; the sizes and the motion in globals.css, "The strip"). From 768 px each medium's row has one large phone, Home first, at 320 px beside three at 200, the movies row's old sizes, spread across the column. A click on a small phone makes it the large one and the large one shrinks back. Each row keeps its own order: Home, Search, compare, Ranking on both.
- **Games gets the same pattern.** Its four equal 224 px phones are now Home at 320 and Search, compare and Ranking at 200, each expandable.
- **The middles meet at every frame.** The row is as tall as the large phone (2.099 times its width) and every phone is centered in it, so no margin is needed (the movies row's `lg:mt-[126px]` is gone) and the alignment holds while the sizes move. The widths animate; the phone leaving shrinks as the one arriving grows on the same curve, so the row's height and the page under it never move.
- **The motion.** Width over 640 ms on `--ease-site`, the reel's duration. The caption leaving fades in 200 ms; the one arriving fades in over 400 ms and rises 6 px over 640 ms, after 240 ms, as the phone finishes growing. Under `prefers-reduced-motion: reduce` there are no transitions: a press swaps the sizes and the caption at once, and nothing lifts on hover. CSS only; the script holds the selected index and nothing else.
- **One line under the large phone**, one per phone, eight in all (`copy.product.screens`, each a Slot for Rafa's sign-off; the movies Home's is round five's line, moved there from `moviesHome.caption` unchanged). The four captions of a row share one grid cell under it, each as wide as the large phone and set where its own phone sits when it is the large one, so the cell is as tall as the longest caption, the strip's height never changes with the selection, and no caption reaches past the column. The section's caption above the row is unchanged on both sides.
- **The keyboard and screen readers.** Each phone has a real `<button>` over it, the size of the phone, with the phone's own corners so the site's focus ring (2 px `brand/text`, 2 px out) follows them. Its name is "Show Search larger" and its state `aria-pressed`, true on the large one; Tab reaches each, Enter or Space expands. The large phone is a button too, pressed, where a click does nothing: if it were not, the focus would drop to the page the moment a pressed phone became large. Each phone keeps its own label for what it shows (the drawn movie phones' `label`, the shots' alt text). The drawn captions are hidden from screen readers; one visually hidden line after the row carries the large phone's caption in a polite live region, so a press is announced once and the caption is never read twice.
- **The hover lift** (4 px, as before) stays on the small phones, the ones a click changes, and on every phone in the snap row; the large phone no longer lifts, and its cursor is the default.
- **The switch.** Each side keeps its own selection: both rows stay mounted and the switch only hides one. Its replay behavior is untouched.
- **Below 768 px the snap row is as it was.** Every phone 200 px, the movies Home at `min(300px, 76vw)` with its caption under it, games with no caption, top-aligned, scrolling sideways and snapping. The buttons and the caption stack are not drawn there. The live caption line is out of the tree on games, which shows no caption at that width, and carries the Home caption on movies, whose drawn one is hidden from screen readers.

### The breakpoint: 768 px

Where 320 + 3 × 200 with 16 px between does not fit the column (a window under about 1010 px), all four phones scale down together, the small one being `min(200px, (column − 48px) / 4.6)` and the large one 1.6 times it, read in container units of the strip. Measured:

| Window | Column | Large | Small | Space between |
|---|---|---|---|---|
| 1440 | 1100 | 320 | 200 | 60 |
| 1024 | 976 | 320 | 200 | 19 |
| 900 | 852 | 280 | 175 | 16 |
| 834 (iPad Pro 11", portrait) | 786 | 257 | 160 | 16 |
| 768 | 720 | 234 | 146 | 16 |

At 768 the large phone still reads and the small ones read as their screens, as thumbnails; under it, on a phone in landscape at 640, they would be 189 and 118, too small for either. So the interactive row starts at 768, Tailwind's `md`, the step where the site's rhythm already turns to tablet. The trade at the step: just under 768 the snap row's movies Home is 300 px, and at 768 the large phone is 234, in exchange for all four on screen at once.

### Heights and checks

`document.documentElement.scrollHeight`, headless Chrome for Testing 1243 (Playwright 1.47), reduced motion, every answer closed:

| Page | 1440 × 900 | 1024 × 900 | 768 × 900 | 390 × 844 |
|---|---|---|---|---|
| Unisound (the ceiling) | 5743 | | | 6763 |
| Finalize, games | 3995 | 4017 | 4414 | 5529 |
| Finalize, movies | 4277 | 4299 | 4764 | 5833 |
| **Interactive strip, games** | **4277** | **4299** | **4536** | **5529** |
| **Interactive strip, movies** | **4277** | **4299** | **4596** | **5833** |

Games grows 282 px at 1440 for the large phone and its caption, to the movies side's height, 1,466 under the ceiling; movies is unchanged at 1440, 1024 and 390. At 768, where the snap row gives way to the interactive row, movies is 168 px shorter and games 122 taller.

- **The walk by mouse** at 1440, 1024 and 768, light and dark, both media: each small phone clicked in turn, then Home again. After each press the pressed phone is the large one (320 at 1440 and 1024, 233.7 at 768) and the other three small (200, 146.1), the four middles within 0.5 px, exactly one caption shown, at its phone's left edge and width, the live line reads it, `aria-pressed` is true on that phone alone, and the row's height and the page's do not move.
- **Mid-motion**, sampled every 60 ms after a press: compare grows 200, 250, 311, 316, 318, 320 at 1440 (156 to 232 at 768); the middles stay together at every sample, the heights stay still, and the four are never wider than the row. Quick presses (compare, then Search as it settles, then Ranking 120 ms later) settle on Ranking, never past the column.
- **By keyboard** at 1440, 1024 and 768: Tab from the row reaches "Show Home larger", then each button in turn; Enter and Space expand; Shift+Tab goes back; the focus stays on the pressed button as it grows. The ring is 2 px `#006822` at 2 px out with the phone's 56.32 px corners at 320.
- **Under reduced motion** at 1440 and 768: transition durations are 0 s, every press (mouse and keyboard) is settled 40 ms after it, and nothing lifts on hover.
- **The switch** at 1440: movies on Ranking, switched to games, shows games on Home; Search pressed there, switched back, movies is still on Ranking and games still on Search. After a switch the hero's ask replays (80 animations under `.ask-run`) and the scenes re-arm, as before.
- **At 390**, light and dark: the snap row as it was (movies 296, 200, 200, 200 with Home's caption; games four 200s), no buttons, no caption stack; the row scrolls to its end and the page does not.
- **The accessibility tree** (Chrome): the region "iPhone screens for movies" holds, per phone, its image with its label, then the toggle button "Show Home larger" (pressed), "Show Search larger" (not pressed), and so on; after a press, only the pressed one changes. The live caption line follows the region.
- **No horizontal scroll** in any combination, mid-motion included. **No console errors.** The only failed requests are Next's own prefetches of `/` and `/login/`, aborted as a page closes, as in every round.
- `pnpm --filter @verso/site build` and `typecheck` pass.
- **Screenshots** in `.prototype/interactive/`: `{movies,games}-1440-{light,dark}-{home,search,compare,ranking}.png` (each large phone at 1440), `{movies,games}-{1024,768}-{light,dark}-home.png`, `{movies,games}-1440-light-mid.png` (mid-motion), `{movies,games}-1440-light-keyboard-compare.png` (the focus ring), `{movies,games}-1440-light-reduced-search.png`, `{movies,games}-390-{light,dark}-row{,-end}.png`, `{movies,games}-1440-light-full.png`, and `report.json` with the walk's numbers.

### Flags for Rafa

1. **Seven new captions for his sign-off**, and the movies Home's moved unchanged: all eight are in `copy.product.screens`. The two compare lines lead with what Verso learns, not with the mechanic (decision 31's correction).
2. **The breakpoint is 768.** From 768 to about 1010 the four scale down together (234 and 146 at 768); just under 768 the snap row's movies Home is 300 px, larger than the large phone at 768.
3. **Each side keeps its own selection** across the switch, rather than going back to Home.
4. **The captions show from 768 only**, except the movies Home's, which stays under it in the snap row; the games snap row has no caption, as before.
5. **Nothing says the small phones can be clicked** but the pointer, the 4 px lift and the button's name; a tablet has no hover. If he wants a cue, a short line by the section's caption is the easy one.
6. **The large phone is a pressed button** that does nothing on a click, so the focus never drops. The row keeps its own tab stop before the four buttons at desktop, which the snap row needs for keyboard scrolling, as before.

## Finalize (2026-10-08)

The brief, Rafa's words decoded: "Finalize the site; I'll give input where needed. The Log in doesn't need to be functional: let people try to log in and fail because they don't have an account. The games phones should not have a movies screen. Make sure the new logo, brand colors and fonts are used throughout." One pull request from `main` at 53d5c45, so the site can go live at rankverso.com with the separate go-live commit (runbook section 11 C). Still `noindex`; `robots`, both `vercel.json` files and `apps/holding` untouched.

### What changed

- **Privacy drops its Logging in section** (Rafa: the notice should not tell readers that Log in does not work). The page is signed off.

- **Movies is the default** (Rafa, after his review: the movie side reads cleaner while its screens are drawn). With no `?medium=` the page opens on movies; `?medium=games` opens games. Movies is also the first segment of the pill, so the selected one opens the row. The layout's inline script, the switch's store and its server snapshot, and the CSS in globals.css ("The medium the page shows") all read "anything but games is movies", so the page without JavaScript shows movies too.
- **Games step 3 asks for a genre under a number of hours** (Rafa: nobody beats a game in one sitting, so nobody asks for "a short game"; a player asks for genre X under Y hours to beat, and for an RPG the ceiling is 20 hours, since most RPGs run long and a tighter one leaves almost nothing). The question is "What RPG can I beat in under 20 hours?". Of six games on the list, the picks are the three RPGs under 20 hours by IGDB's `normally` time to beat, the figure the app shows, read 2026-10-08: Transistor 7.5, Undertale 8.3, South Park: The Stick of Truth 12.5. Left out: The Witcher 3 (70.8) and Persona 5 Royal (117.9), RPGs that run long, and Inside (3.5), short but a puzzle platformer, so both halves of the ask visibly filter. The reason: "Transistor has the mix-and-match combat you loved in Hades, and takes about 8 hours to beat", a taste the two share (Functions combined into attacks, boons built into a run), never who made them (Rafa: "from the studio behind" is not a reason; every pick is the engine's). The step's games sentence says the same: a genre and the hours you can give it. Movies keep "What short movie would you recommend?", since a film is watched in one sitting. Six covers from Steam replace Hollow Knight, Animal Well and Journey; Stardew Valley, Portal 2 and Terraria, now in the hero alone, were cut to 72 px (36 CSS px).
- **The tagline's last word follows the switch** (Rafa: on the games side "press play" is "press start", with a cool animation as it changes). "See if it's worth it before you press play." on movies, the default and the words of `TAGLINE`, which the share image keeps; "…press start." on games. The two words share one grid cell, so the line never reflows; a switch rolls them like a reel (the old word lifts out blurring, the new one rises in sharpening), and the arriving word lands in the brand green before settling to the text color. Transitions only, so nothing plays on first paint; under reduced motion the word changes at once. A screen reader hears the word shown, from a visually hidden copy; the animated pair is `aria-hidden`.

- **The games strip is the four shots** (`page.tsx`, `GAMES_ROW`). The fifth phone, the "Movies / Screens coming with the beta" slot, and its copy entry are gone, and so is `SlotPhone`, which nothing else drew. From 1024 px the four are 224 px each (the five shared about 200) on `lg:grid-cols-[repeat(4,224px)] lg:justify-between`, so the outer two line up with the column: gaps of about 75 px at 1440 and 27 at 1024. A quarter of the column each, about 257 px, read oversized beside the movies row's 200 px phones. Below 1024 the snap row of 200 px phones is unchanged.
- **The movies strip has no empty phone** (`movie-screens.tsx`). Search and Ranking are drawn live on the tokens in place of round four's two slots, from the app's own screens with films in place of games, and the row reads Home, Search, compare, Ranking, the games row's order, Home still first and larger.
  - *Search*: the large title and the medium chip, "Dune" typed in the field with Cancel, then three rows of poster, title and "year · director" (the movies brief's search row) with the add pill. Dune: Part Two carries the app's check, since it is scene 2's Loved film; Dune (2021) and Dune (1984) carry the plus.
  - *Ranking*: the tools row (All, Genre, the list and grid toggle), then the app's dividers, a 2 pt rule in the tier's solid either side of `TierChip`. Loved is scene 2's four, read from the same copy entry so the story cannot drift; Liked is Finding Nemo and Wonka, the two titles the hero's movie reasons cite; It was fine opens on Jurassic World under the tab bar, so all three tier colors show, as in the games shot. Each row has its rank, poster, title, "year · genre" (TMDB's first) and the score badge.
  - Both are one image to a screen reader with a `label`. The caption now says "Drawn from the app's designs with films in place. The movie screens ship with the beta."
- **The movies Home's services are real, and every genre is one a viewer would name** (`copy.product.moviesHome`). Each film's US page on TMDB (`/watch?locale=US`, JustWatch's data) was read on 2026-10-08, with its genres and running time. The genre on each pill is chosen from TMDB's own genres for the film, never simply the first, after Rafa's review ("Parasite is NOT a comedy"; a wrong genre on the demo raises flags):

| Row | Film (TMDB id) | Service | Genre | Year | Time | TMDB's genres |
|---|---|---|---|---|---|---|
| Our recommendations | Top Gun: Maverick (361743) | Paramount+ | Action | 2022 | 2 h 11 | Action, Drama |
| | Parasite (496243) | Paramount+ | Thriller | 2019 | 2 h 13 | Comedy, Thriller, Drama |
| Comedy | **Superbad (8363)** | Paramount+ | Comedy | 2007 | 1 h 53 | Comedy |
| | Barbie (346698) | HBO Max | Comedy | 2023 | 1 h 54 | Comedy, Adventure, Fantasy |
| | **Home Alone (771)** | Disney+ | Comedy | 1990 | 1 h 43 | Comedy, Family |
| | **Bridesmaids (55721)** | Prime Video | Comedy | 2011 | 2 h 5 | Comedy, Romance |
| Because you loved *Inception* | Oppenheimer (872585) | Peacock | Drama | 2023 | 3 h 1 | Drama, History |
| | Arrival (329865) | Paramount+ | Sci-fi | 2016 | 1 h 56 | Drama, Science Fiction, Mystery |
| | Everything Everywhere All at Once (545611) | Hulu | Sci-fi | 2022 | 2 h 20 | Action, Adventure, Science Fiction |
| | **The Prestige (1124)** | Netflix | Mystery | 2006 | 2 h 10 | Drama, Mystery, Science Fiction |

  In bold, the swaps. The Prestige replaced Mad Max: Fury Road, on no US subscription service. Home Alone replaced Paddington 2. Superbad and Bridesmaids replaced Knives Out (a mystery first to any viewer, and only on Lionsgate+, an Amazon channel) and La La Land (a musical romance, also only on Lionsgate+), so every film in the Comedy row is one nobody would argue is not a comedy. On the Ranking phone, Wonka says Family (TMDB: Comedy, Family, Fantasy), not Comedy. The Loved tier's genres (The Dark Knight Action, the other three Sci-fi) are among each film's TMDB genres and stand.
  The story rules hold: nothing from scene 2's Loved tier is on Home, and the "Because you loved" film is still Inception (The Prestige is Nolan's too).
- **Posters added** the way `scripts/art-assets.mjs` does it (TMDB `w500`, once, scaled, WebP at 92, served from the site): Home Alone, The Prestige, Superbad and Bridesmaids at 156 (77 CSS px on a small card), Dune and Dune (1984) at 44 (21 on the Search phone), Finding Nemo, Wonka and Jurassic World at 40 (19 on the Ranking phone). Mad Max's, Knives Out's and La La Land's files left; Paddington 2's went from 156 to 72, since only the hero shows it now (35 CSS px). Measured at ten widths from 360 to 1920, both media, every file is at least twice its largest CSS width. The 26 unchanged files re-encoded byte for byte.
- **Log in is a page that lets people try and fail** (`app/login/page.tsx`, `components/login-form.tsx`). The nav's Log in goes to `/login/` (`LOGIN_HREF`; `APP_URL`, Expo's localhost dev server, had no other reader and is gone). It is the app's signed-out front door on the site's tokens: the lockup at the app's 34 px, a line, one email field, and "Continue with email" (disabled until the address has an "@", at the app's 40%), between the site's nav and footer. Continue shows a notice in a polite live region, in Rafa's words after his review: "This email doesn't have a registered account." and "Verso is invite-only during the beta. Email us at hello@rankverso.com for access.", the address a link to the access email, with Request access under it. It reads as if accounts are live, which is his intent; an invited tester who types their address here sees it too, since the web app is not hosted yet. The form has no `action` or `method`, the input no `name`, there is no password field and no fetch, storage or analytics, and Continue is `preventDefault`. No Figma pass: Rafa asked for this plain screen directly.
- **The Home shot is the current app** (`public/shots/phone-home.webp`). Shot again from the web build of `main` after #82, so the header is "Games" alone where the old one had the green "V" tile. Same demo library (Baldur's Gate III playing on PC, Elden Ring and Slay the Spire up next), 402 × 874 pt at 3x, light, insets 62 and 34 through Chromium's safe-area override, WebP at 92. The shared local stack carried another branch's `status_rename` and lacked two of main's migrations, so the shot came from an isolated stack (`verso-site-shots`, ports 553xx, a copied config, main's 26 migrations), seeded with the three IGDB rows by the mirror's own client and mapper and a throwaway account written through `@verso/api`, and stopped afterwards. Search, compare and Ranking were checked and kept: their chips, dots and badges are the app's current ones. `shots.ts` says all of this.
- **Privacy is a notice for the website** (`app/privacy/page.tsx`, `copy.privacy`) in place of "Coming before launch.": what the site loads, no cookies or analytics, Vercel's request logs, Request access by email, the log-in page sending nothing, and the contact; last updated October 8, 2026. Each sentence was checked in the source or the export (the comment in `copy.ts` says how). **Terms is gone**, the page and the footer link: a site with nothing to sign up for has no terms to agree to, and the app's terms come with the beta. `docs/legal/` is untouched. CI's `site` job now asserts that `login/index.html` exists, that `terms/index.html` does not, and that the log-in page has no form action, password field or named input.
- **The nav's links sit right on every page.** On Log in and Privacy, which have no medium switch, the links had slid into the grid's middle column (Privacy had this since round four); they are pinned to the third (`lg:col-start-3`).
- **Housekeeping.** `out/` was already ignored by `apps/site/.gitignore` (since #69), so there was nothing to add.

### The brand audit

- **Logo.** The lockup is in the nav, the footer and the log-in page. The favicon (SVG and .ico), the touch icon and the share image are cut from `mark-white.svg`, checked by eye in `.prototype/finalize/icons-and-share.png`. No other mark is drawn.
- **Colors.** `apps/site/src` has no brand, tier or medium hex outside the mark's own files and comments, and no `#4881CC` or older green. The literals left are justified as before: the device's grays (the phone's edge, bezel and buttons, the angled phone's slices), the shadows' black, the poster scrim's black, and the Dynamic Island. One change: **the movies tab bar's active tab is the brand green** on all three movie phones with a tab bar, as the app draws it since decision 29 (the games shots); frame 143:173 drew it black.
- **Fonts.** Inter only, self-hosted by `next/font`. One weight outside the brand's three was in use: the compare phone's escape hatches at 500, now 400, and the `type()` helper no longer accepts 500. The new phones' row titles are Semi Bold where the app sets 500, as scene 2's rows already were. The layout's comment now says the site sets 400, 600 and 700 only. The synthesized italic on "Inception" stays (decision 28's italics for the variable part).

### Heights and checks

`document.documentElement.scrollHeight`, headless Chrome for Testing 1243 (Playwright 1.47), reduced motion, every answer closed:

| Page | 1440 × 900 | 1024 × 900 | 390 × 844 |
|---|---|---|---|
| Unisound (the ceiling) | 5743 | | 6763 |
| Round eight, games | 3947 | | 5529 |
| Round eight, movies | 4277 | | 5833 |
| **Finalize, games** | **3995** | **4017** | **5529** |
| **Finalize, movies** | **4277** | **4299** | **5833** |

Games grows 48 px at 1440 for the larger phones; movies is unchanged.
- **No horizontal scroll** at 1440, 1024 or 390, light or dark, either medium, nor on Log in or Privacy.
- **No console errors and no broken images.** The only failed requests are Next's own prefetches, aborted, as in every round.
- **Log in.** At 1440 and 390, light and dark: the button is disabled until an address is typed; Continue and then Enter make **zero network requests**, leave the URL at `/login/`, and leave local storage, session storage and cookies empty; the notice appears with Request access on the `mailto:`. With JavaScript off the button stays disabled and Enter goes nowhere: zero requests, the same URL.
- **Terms.** `/terms/` is a 404, and nothing in `src` or the export links to it.
- **Privacy** loads nothing from another origin. Log in and Privacy are `noindex`.
- `pnpm --filter @verso/site build` and `typecheck` pass, and CI's export checks pass locally.
- **Screenshots** in `.prototype/finalize/`: `home-{games,movies}-{1440,390}-{light,dark}-{fold,strip}.png` (and `-full` in light), `home-{games,movies}-1024-light-strip.png`, `movies-phone-{1..4}-3x.png` and `games-phone-1-home-3x.png` (close-ups), `movies-390-phone-{1..4}.png`, `login-{1440,390}-{light,dark}{,-tried}.png`, `privacy-{1440,390}-{light,dark}.png`, `icons-and-share.png`.

### Flags for Rafa

1. **He has not seen the Search and Ranking movie phones.** They illustrate screens already approved for games, the way the compare phone does. Search's row says "year · director" as the movies brief draws it, and Ranking's tools row leaves out Platform, which films do not have.
2. **Four films swapped on the movies Home, and every genre checked by hand.** Mad Max: Fury Road (no US subscription service), Paddington 2, Knives Out and La La Land left; The Prestige, Home Alone, Superbad and Bridesmaids came in. Parasite says Thriller, Arrival and Everything Everywhere All at Once say Sci-fi, The Prestige says Mystery, Wonka says Family. Streaming catalogs change; recheck before a launch.
3. **The words on Log in and Privacy are signed off** (2026-10-08): the Log in notice in his words, the privacy notice without its Logging in section.
4. **Two privacy sentences become true at the switch** (both true since the site went live on 2026-10-08): "hosted on Vercel" (runbook 11) and the registrar forwarding `hello@rankverso.com` (runbook 11's open Porkbun checkbox).
5. **The movies tab bar's active tab is green**, where frame 143:173 drew it black, to match the app since decision 29.

## Round eight: the brand (2026-10-08)

The brief: decision 31. Rafa drew the mark by hand, and it and the words on his brand board are final ([brand-identity.md](../../docs/design/brand-identity.md)). One pull request, branched from `main` after #69 merged a commit early, so it first carries that commit: the FAQ as he locked it (`f49a6e1`: "Does Verso have ads?" added, "Can I bring in…" cut). Nothing about the layout, the scenes, the switch or the motion changed.

- **The mark, drawn inline** (`components/verso-mark.tsx`, `src/brand/mark.ts`). `mark.svg` is read at build time and its two paths go out character for character; only the fills are handed to the tokens their light values match: the V to `brand/text` (`#006822` light, `#009B37` dark), the play to `brand/tint-half` (`#80B491`) at the file's own 0.733 on white and 1 on black (`--site-mark-play-opacity`, set in dark only; the phone's screen unsets it, so a mocked screen keeps the light rule in either scheme). The fills are the `fill-brand-*` utilities, written out whole, because Tailwind emits a theme variable only when something uses it: an inline `var(--color-brand-tint-half)` drew the play black in light mode until it was a utility. `LogoSlot` and the typeset tile are gone, from the nav and from the script.
- **The lockup** (`Lockup`), from the Figma component `Verso lockup` (238:42): the mark 112 units tall beside a 104-unit word, a gap of half the mark's width, the apex on the word's baseline (a baseline-aligned flex row: the mark, having no baseline, aligns its foot), the word in Inter Semi Bold at -2% in `brand/text`. All in ems of the word. The nav sets it at 22 px (a mark 23.7 px tall, the tile was 24); measured, the mark's foot sits on the baseline to the pixel and the gap is 11.41 px against a half width of 11.41. The footer's wordmark is the same lockup at the headline's 17 px (a mark 18.3 px tall), at the head of the footer where the word stood. The spec's `#006822` for the word is 3.0:1 on the dark canvas, so `brand/text` lifts it to `#009B37` there, as decision 29 does all brand text.
- **The movies Home mock** keeps the "Movies" chip with its brand-green dot and no mark: Rafa does not want his mark at the top beside the medium's name (brand-build.md, default 5), and the ask button keeps Lucide's `sparkles`, never the mark (rule 5). The mark is in the nav, the footer, the icons and the share image only.
- **The icons and the share image** (`scripts/brand-assets.mjs`, renamed from `logo-slot-assets.mjs`), cut from `mark-white.svg` after checking its paths against `mark.svg`. The favicon (SVG at 32, rounded at 22.5%; .ico at 16, 32 and 48) and the 180 px touch icon (square) are the app icon: the `brand/primary` tile, the white V and the `#CDE8D3` play, the mark at 63% of the height, centered. Rendered at 1024 the same geometry matches `app-icon-1024.png` to a mean difference of 0.05 in 255, the largest 47 on edge pixels only. The share image is the billboard at 1200 × 630: the white mark 240 px tall, the tagline in white Inter Bold at 52 beside it, its first capitals level with the mark's top, and "Verso" in Semi Bold at 36 under it as the lockup sets it, its baseline on the apex. Chromium stalls on screenshots of 16 px windows, so the icons are clipped out of a 400 px one.
- **The words.** The headline is his tagline, "See if it's worth it before you press play." (`TAGLINE`, which the share image reads too); round six's "Verso is a recommendation engine on your side." is commented beside it, the one copy change for him to confirm. The subline stays, though its "It" no longer has "Verso" before it. His two rules applied to every string: the vision card "Taught the most natural way" led with "You say which of two you enjoyed more" and now opens on the engine; the labels over the hero's picks and over scene 3's picks say "Our recommendations" (were "Our picks, with the reason" and "Our picks"); the movies Home's rows were already "Our recommendations", a genre and "Because you loved". Checked and left: How it works step 1, which is the ranking mechanic in the section about it, and the locked FAQ answer, which opens on what Verso learns.
- **Heights** at 1440: 3,947 on games and 4,277 on movies (main was 3,965 and 4,295 before this round), at 390: 5,529 and 5,833; the ceiling is 5,743 at 1440. No horizontal scroll.
- **Not done here.** The four real shots in the games strip are as they were; Home still shows the app's placeholder tile, and is reshot after the app's mark merges.

## Launch prep (2026-10-08)

After #69 merged: the site made ready for `rankverso.com` without going live. Runbook section 11 in `docs/process/hosted-setup.md` is the switch.

- **The mark** is not in this PR: the brand build's site half is PR #81 (site-brand), from the session that holds brand-build.md.
- **The art, served from the site** (round four's flag 6, closed). The 27 covers and posters in `content/art.ts` are files in `public/art/`, downloaded once from Steam's 600 × 900 capsule or TMDB's `w500` poster and scaled to twice the largest CSS width the page shows each at. Measured in headless Chrome at twelve widths from 360 to 1920, both media: 26 px (a row in scene 2), 36 (a pick in the hero), 77 (a small card on the movies Home), 84 (scene 1), 107 (scene 3 at 767 wide, where the steps stack), 142 (a large card on the movies Home). Rounded up to a multiple of 4 and encoded as WebP at quality 92, as the shots are: 52 to 284 px wide, about 470 KB for all 27. `scripts/art-assets.mjs` holds the sources (kept out of `art.ts` so no Steam or TMDB address reaches the bundle) and redoes the folder. CI's `site` job now fails if any file in the export names `image.tmdb.org` or a Steam image host (`*.steamstatic.com`, `steamcdn-*.akamaihd.net`, `media.steampowered.com`, `steamusercontent.com`). A page load now requests nothing from another host. The footer keeps the Steam and IGDB credits and TMDB's sentence.
- **Request access is an email.** The three buttons (the nav, the hero, the closing panel) open `mailto:hello@rankverso.com?subject=Verso%20access%20request`. The address is one constant, `CONTACT_EMAIL` in `copy.ts`, which the footer's contact line also reads; the subject is `ACCESS_SUBJECT` beside it. No form, no third-party service. The address delivers once Rafa's forwarding at Porkbun is set up (runbook section 11).
- **Ready for the host, not on it.** `vercel.json` here holds the build for a Vercel project whose Root Directory is `apps/site`: framework Other, `pnpm install --frozen-lockfile --filter @verso/site...` (the site and its two workspace packages, not the Expo app), `pnpm run build`, output `out`, `trailingSlash`, and the `www` redirect. No project reads it yet. Runbook section 11 is the switch: a new Git-connected project `rankverso-site`, the bare domain moved to it from the holding page's project, and a separate go-live commit that lifts `noindex` and settles Log in, which still points at `localhost:8081`. The site is still `noindex`.

## Round seven (2026-10-08)

The brief: the brand colors merged to `main` in #76 (decision 29 in the tokens, option A for the tiers), so the site moves onto them, and gets ready for Rafa's hand-drawn mark. Rebased onto `main` with no conflict. Everything else is as round six left it: the switch, the hero, the scenes and their timing, the copy, the heights (3839 px at 1440, movies 4169; 5396 at 390, movies 5720), no animation library, reduced motion, light and dark.

- **The accent from the tokens.** `--color-accent`, `--color-accent-text` and `--color-accent-label` stay as the site's one-accent names, now pointed at `brand/primary`, `brand/text` and `brand/on-primary`; the dark lift of brand text is the token's own (`#009B37`), so the site's dark overrides went. The phone's screen declares the three names again, since a variable that points at another resolves where it is declared. No brand or tier hex is left in `src`; the only literals are the device's grays (the titanium edge, the bezel, the side buttons, the angled phone's slices) and the shadows' black.
- **The mocks on the app's tiers** (`components/tier.tsx`, from `tier-chip.tsx`, `score-badge.tsx` and `ranking-list.tsx` on `main`). Scene 2's divider was the upper-case word in tier color between two hairlines; it is the app's divider now, a 2 px rule in the tier's solid either side of the `TierChip` (the solid, the heart, "Loved it" in white). Its four badges are filled by `scoreColor` from `@verso/core` (a workspace dependency now, transpiled like the tokens) in the small size, white numerals. The movies compare phone's tier, a dot and "Loved it" on gray, is the chip. The hero's ask and the movies Home have no tier on them. The tier words are a Fact in `copy.ts` (`copy.tiers`), as the app's `TIER_LABELS` writes them.
- **The domain.** `SITE_URL` is `https://rankverso.com`: `metadataBase`, the absolute `og:image`, and a canonical link and `og:url` per page (`./`, which Next resolves against each page's path). `APP_URL` stays localhost and becomes `https://app.rankverso.com`. "Request access" and the footer write to `hello@rankverso.com`, which delivers only once its forwarding is set up at the registrar, before launch. Still `noindex`.
- **The logo as one file** (`src/brand/mark.ts`, the note at the top). `LogoSlot` reads `src/brand/mark.svg` at build time and draws it inline, 24 px tall, in its own colors, with no tile unless the file is one (a mark in `currentColor` takes the brand text color); without the file it draws round five's typeset tile. The logo command cuts the mark onto a white rounded square for the favicons (32 as SVG; 16, 32 and 48 in the .ico), centers it on a `brand/primary` tile for the 180 px touch icon with the brand green in it turned white (the logo brief: on the green, only the fill changes), and sets it beside the wordmark over the headline in the share image, through the same Chromium rendering as before. A file that is itself a tile is drawn whole. Run with no mark, it rewrote the four files byte for byte. No mark was drawn, and `mark.svg` does not exist.
- **Not done here.** The games strip's four shots are Figma exports from before decision 29: the old pastel tiers with dark labels, the upper-case dividers, and medium colors on Home's switcher. They match the app again only when re-exported from frames on option A, or drawn live as the movies screens are.

## Round six (2026-10-08)

The brief is the site brief's "Rafa's reaction to round five": "Outside of that, this is awesome", with five small changes. All five are content: films a stranger knows, relatable typed asks, "Our recommendations" as the movies Home's first row, step 3's question asked of the engine, and reasons that sound like speech. Layout, the switch, the animations, the brand green, the heights, light and dark, reduced motion and no library are as round five left them. One exception is below: scene 3's field takes a second line. Every changed string is still a slot in `copy.ts`.

### The films (`content/art.ts`)

The movie set is now audience staples, chosen by box office and reach. Dune: Part Two is kept, and fourteen films were added from the brief's list. Each poster path was read from the `og:image` of the film's themoviedb.org page. All seventeen in use were checked at `w342` on 2026-10-08: HTTP 200, `image/jpeg`, 342 × 513. **None failed.**

| Where | Films (TMDB id) |
|---|---|
| Scene 1 and the strip's compare | Dune: Part Two (693134), just watched, against Interstellar (157336) at #2. The prompt is "Which sci-fi movie did you enjoy more?" and the chip says "Sci-fi" |
| Scene 2, Loved | The Dark Knight (155), Dune: Part Two slotting in at 2, Interstellar, Inception (27205) |
| Scene 3, the watchlist | Oppenheimer (872585), **Arrival** (329865), Everything Everywhere All at Once (545611), **Get Out** (419430), Top Gun: Maverick (361743), **Barbie** (346698). The three picks are the ones under two hours: 104, 114 and 116 minutes |
| The hero's three | Spider-Man: Into the Spider-Verse (324857), Toy Story (862), Paddington 2 (346648) |
| Home, "Our recommendations" | Top Gun: Maverick, Parasite (496243) |
| Home, "Comedy" | Knives Out (546554), Barbie, Paddington 2, La La Land (313369), which TMDB files under comedy first |
| Home, "Because you loved *Inception*" | Oppenheimer, Arrival, Everything Everywhere All at Once, Mad Max: Fury Road (76341) |

- **Dropped:** every quieter film (Past Lives, Aftersun, Perfect Days, Minari, Drive My Car, Palm Springs, Hunt for the Wilderpeople), plus The Grand Budapest Hotel, What We Do in the Shadows, Lady Bird and Spirited Away. No reason line needed any of them.
- **Not used from the list:** The Social Network and Toy Story 3. No slot needed them.
- **One story still runs through the page.** Nothing ranked in scene 2 appears on Home, and the "Because you loved" film comes from scene 2's Loved tier. Years and running times are the films' own. **The services are illustrative, as before.**

### The asks and the reasons (`content/copy.ts`)

| | Games | Movies |
|---|---|---|
| Typed ask | "something to play with a friend" | "something for the whole family" |
| Trace's last line | "Keeping the co-op games" | "Keeping it for every age" |
| Picks | Portal 2, Stardew Valley, Terraria (all on scene 3's list) | Spider-Man: Into the Spider-Verse, Toy Story, Paddington 2 |
| Scene 3's question | "What short game would you recommend?" | "What short movie would you recommend?" |

- **Why these asks.** "A movie for a Friday night with friends" is too long for the hero's field, which is one line, so the movies side uses the brief's other ask. On games, "a game I can finish this weekend" would repeat step 3's short-game question, so the hero asks for co-op instead.
- **The reasons are speech in the second person.** Each is under 20 words and names a title from the person's list:
  - "A co-op campaign built for two, and you told me you loved the puzzles in Outer Wilds."
  - "One more day on a shared farm, and you keep going back to Hades for one more run."
  - "Dig, build and take on bosses together, and you told me you loved Elden Ring."
  - "A superhero movie for every age, and you told me you loved The Dark Knight."
  - "Funny for the kids, clever for the grown-ups, and you keep going back to Finding Nemo."
  - "Funny at any age, and it's from the director of Wonka, which you said you liked." Paul King directed both films.
  - Scene 3: "Animal Well is small and full of secrets, and you told me you loved Outer Wilds." and "Arrival is short, smart sci-fi, and you told me you loved Interstellar."
- **Not used: "you said Y was just fine".** A pick explained by a title the person ranked Fine reads as a warning, and the beta's reasons cite Loved or Liked titles. The Liked form is "you said you liked".
- **Step 3's sentence now names the engine:** "You ask the engine what to watch and how long you have, and it answers with three picks from your watchlist, each with a reason." Games says "play" and "your list".
- **Labels.** Every screen-reader label that names a film, a game or a question was rewritten to match.

### The one layout touch (`how-scenes.tsx`)

Rafa's question, "What short movie would you recommend?", is about 300 px wide at the scene's 15 px. The field holds 240 px at 1440 and 258 px at 390, so its one truncated line cut the question off with an ellipsis. Round five's shorter question also ran past the field from 768 to 1023 px.
- **The fix.** The field is now `min-h-11` with 6 px of vertical padding and no `truncate`, so the question wraps:
  - two lines (52 px) at 1440, 1024, 390 and 360;
  - three lines at 768, where the column is narrowest.
- **The panel is unchanged.** It stays 272 px. The fullest scene, at 768, takes 218 px of the 232 inside the padding. Nothing else in the scenes changed.

### Scroll height

`document.documentElement.scrollHeight` in headless Chrome, 2026-10-08, every FAQ answer closed:

| Page | 1440 × 900 | 390 × 844 |
|---|---|---|
| Unisound (the ceiling) | 5743 | 6763 |
| Round five, games | 3839 | 5396 |
| Round five, movies | 4169 | 5698 |
| **Round six, games** | **3839** | **5396** |
| **Round six, movies** | **4169** | **5720** |

Only movies at 390 grows, by 22 px: step 3's longer sentence takes a fourth line there. There is no horizontal scroll at 1440 on either side or at 390 on either side, in light or in dark.

### Checks

Headless Chrome for Testing 1243 (Playwright 1.47), against the static export, under reduced motion so every scene shows its finished state.
- **Screenshots.** In `.prototype/` (round five's moved to `.prototype/round-five/`): `home-{games,movies}-{1440,390}-{light,dark}-{fold,how,strip}.png`, plus `-full` in light.
- **Clipping.** No `truncate` or `nowrap` text inside the shown medium is clipped, in any of the eight combinations, once the field above wraps.
  - The hero's longest answer ends 34 px short of its field.
  - The last pick ends at least 81 px above the foot of the phone's screen.
  - "Spider-Man: Into the Spider-Verse" wraps to two lines in its pick.
- **Images.** None broken.
- **Requests.** The only failed requests are Next's own prefetches of `/`, `/privacy/` and `/terms/`, aborted (`net::ERR_ABORTED`). No image or script fails.
- **Types.** `pnpm --filter @verso/site build` and `pnpm typecheck` pass.

### Flags for Rafa

1. **Scene 1's genre is sci-fi, not the brief's thriller example.** Dune: Part Two against Interstellar is the pair a stranger would argue about, and both films are sci-fi.
2. **Scene 3's field takes a second line** (above).
3. **Two reasons cite films that are not on screen:** Finding Nemo and Wonka. The games side already cites Celeste and Disco Elysium the same way.
4. **La La Land sits in the Comedy row** on TMDB's filing. It is the fourth card, the one that peeks in from the right edge.
5. **A Short Hike and What Remains of Edith Finch left the page with the calm ask.** Their art entries are gone from `art.ts`.

## Round five (2026-10-08)

The brief is the site brief's "Rafa's reaction to round four": "Apart from that, this is amazing", with three edits. TV and books are mentioned as coming, in the switch and in a new question. The logo appears somewhere while it is being finalized. Inside the app stops being raw on the movies side: a live mock of the movies Home, where it is plain that every row is a recommendation. Everything else is kept: the switch's address state and page-wide effect, the hero and its ask, the thesis strip, the three scenes, the one brand green and no medium color, no library, nothing looping, nothing moving under reduced motion, light and dark, 1440 and 390 with no sideways scroll.

### TV and Books in the switch (`medium-switch.tsx`)

TV and Books follow Games and Movies in the same pill, after a hairline, each with the app's Lucide icon (`tv`, `book-open`) and a small outlined "soon" tag. The icon and the name sit at 55% opacity; the tag stays at full gray, so it reads (4.6:1 on the track in light).
- **Not a choice.** They are two more native radios in the same group, `disabled`. A disabled radio takes no focus and the arrows skip it: from Movies, ArrowRight goes back to Games. The thumb lives in the inner pair of live segments, so it only ever slides between those two.
- **Announced as coming.** Each has a screen-reader name, "TV, coming" and "Books, coming"; the visible tag is hidden from it. Chrome's accessibility tree reads: Games, Movies (checked), TV, coming (disabled), Books, coming (disabled). Hovering shows "TV, soon" as a tooltip.
- **Forced colors.** The two draw in `GrayText`.

**How it fits.** The names are what has to give:

| Where | Width | TV and Books show | Pill |
|---|---|---|---|
| Nav, from 1280 | 1280, 1440 | icon and "soon" | 427 px, on the page's center (12 px off at 1440) |
| Nav, 1024 to 1279 | 1024 | icon and "soon", segments a little tighter | 403 px, centered between the wordmark and the links |
| Top of the hero, 640 to 1023 | 640, 768 | icon, name and "soon" | 521 px |
| Top of the hero, below 640 | 390, 360 | the icon over a small "soon" | the column's width; TV and Books 40 px each |

In the nav the names never show. With them the pill is 521 px, and beside the wordmark and the links (325 px) it either pushes well off the page's center or wraps the links onto two lines, at 1440 as at 1024. So the nav carries the icons and the tags, the name is in the tooltip and for screen readers, and the hero's switch, below 1024, carries the names where it has room. The nav links are `nowrap` now: at 1024 the wider pill had wrapped "How it works" onto three lines.

### The FAQ

A first question, "Is it just games and movies?", with Rafa's draft as its answer, close to his words: "Games and movies are our V0. V1 adds books and TV shows. After that the sky is the limit: podcasts are the next step we're looking at, then YouTube channels, and even hotels, travel destinations and physical products are in scope." It is a slot in `copy.ts`, marked as his draft, and the page shows it in roman type. The other three still show "Rafa's answer, to come." in italics.

### The logo slot (`logo-slot.tsx`, `scripts/logo-slot-assets.mjs`)

The logo is Rafa's to draw by hand (`docs/private/design/logo-brief.md`): Claude draws no mark, and no image is generated. So the site gets a labeled slot. It is the one thing the brief already fixes: a rounded tile in the brand green carrying a white V in Inter Bold. `LogoSlot` is named as the slot in code and in its comment, and his mark replaces it.
- **The nav.** A 24 px tile before the "Verso" wordmark, corner 5.4 px (22.5%), the V at 16 px, text in the page's own Inter at weight 700. Inter centers its capitals in a line box of `line-height: 1`, so it needs no nudge. It is hidden from screen readers: the wordmark names the link.
- **The files.** `scripts/logo-slot-assets.mjs` cuts four files into `public/`, committed:
  - `favicon.svg`, the tile at 32 with the V as Inter Bold's own outline, read from the TTF the app ships (`@expo-google-fonts/inter`). Inter's V is a single contour whose inner edges ease into the crotch on quadratic curves, so the script reads TrueType's on- and off-curve points (about 90 lines, no font library).
  - `favicon.ico`, that tile at 16, 32 and 48 as PNGs in one icon file, for browsers that ask for `/favicon.ico` (round four's one console error, its 404, is gone).
  - `apple-touch-icon.png`, 180 × 180, square and full bleed, because iOS rounds a touch icon itself; rounded corners would come back as black ones.
  - `og-image.png`, 1200 × 630: the tile at 64 and the wordmark at 46 px over the headline at 80 px weight 600, on white, in the site's own variable Inter (taken from the export's CSS, so it has the Display cut the hero uses). Nothing else is drawn.
- **The proportions** are one set for all of them: a corner of 22.5% of the side, and the V's cap height at 48.5% of it, centered on its outline's box. The green is read from `--color-accent` in `globals.css`, and the words come from `copy.ts`, so nothing is restated.
- **Rendering.** Playwright's Chromium from the npx cache; the repo does not depend on it. Run it after `pnpm site:build`: `PLAYWRIGHT_DIR=<a playwright package> node apps/site/scripts/logo-slot-assets.mjs`. Without the variable it finds `playwright` in `~/.npm/_npx` and Chromium in Playwright's cache. No dependency was added.
- **The head** (`layout.tsx`). `<link rel="icon">` for the .ico and the SVG, `apple-touch-icon`, and Open Graph and Twitter tags with the share image, its size and its alt text. `metadataBase` is `SITE_URL` in `copy.ts`, `http://localhost:3000` for the prototype and the domain at launch, so `og:image` is absolute as link previews need.

### The movies Home, live (`movie-screens.tsx`)

The strip's tiny exported frame is gone. In its place is the movies Home drawn live on the tokens, in a phone, from decision 28 and rule 36 as frame 143:173 draws them. It is laid out in the 402 pt screen's own points, like the hero's ask:
- **The top row.** The "● Movies" chip (the app's `MediumChip`, its dot in the brand mark color since no medium has a color) and, at the right, the other medium as a gray gamepad.
- **The button.** One filled "What do you want to watch?" in the brand green with white text and a `sparkles` icon, the frame's stand-in for a sparkle glyph. It is the one colored control on the screen.
- **The rows.** Each title is the reason, and each has "See all":
  - "From your watchlist": the larger carousel, 190 pt posters. Dune: Part Two and Spirited Away, both on scene 3's watchlist.
  - "Drama": the genre word alone, 104 pt posters. Lady Bird, Perfect Days, Minari, and Hunt for the Wilderpeople peeking.
  - "Because you loved *Past Lives*": the film in italics (Inter's oblique, synthesized; the site loads no italic file). Everything Everywhere All at Once, Drive My Car, Palm Springs, and Paddington 2 peeking. It runs on under the tab bar, as a scrolled screen does.
- **The cards.** The poster alone, whole at 2:3, with a dark scrim at its foot and four small white pills on it: service, genre, year, running time ("HBO Max · Sci-fi · 2024 · 2 h 46"). There is no title anywhere. On the small cards the pills wrap to two rows.
- **The tab bar.** Home, Search, Ranking, Watchlist and Profile (the movies tab bar, `tabbarMovies`), Home in black as the frame has it, over the page on a translucent canvas.
- **The caption** under the phone: "Home for movies: every row is a recommendation, and the row's title is its reason."
- **To a screen reader** the phone is one image with a label that names the rows and the films.

The story holds across the page. Nothing the person ranked appears: the four Loved films of scene 2 are absent, and the "Because you loved" film is the one scene 2 slots in. Years and running times are the films' own. **The services are illustrative**: US services that are plausible for each film, not checked against a listing.

**Departures from frame 143:173**, each for the size the mock is drawn at:
1. Three of its five rows, and no carousel dots.
2. The small cards carry all four facts; the frame's carry the service alone. Decision 28 and rule 36 say four.
3. The frame's large "● Movies" header is the app's smaller chip, as the brief for this round named it.
4. The frame's row titles are reworded per the brief: "From your watchlist" for "You wanted to watch these", "Drama" for "Horror".

**Three more posters.** The brief said to reuse the eleven TMDB posters on the page. The eleven hold only two dramas the person has not ranked (Lady Bird, Hunt for the Wilderpeople), and a row titled "Drama" needs at least three. So three were added: Perfect Days (976893), Minari (615643) and Drive My Car (758866). They were read and checked the way round four's were: the poster path from the film page's `og:image`, HTTP 200, `image/jpeg`, 342 × 513.

**The compare step, live.** The second phone is the compare frame (26:385) with scene 1's films. It shows "Which drama did you enjoy more?" over Past Lives (just watched) and Aftersun (ranked #2 · 9.6), each with a Drama chip, then "Too close to call" and "Can't compare these". The top carries the "Loved it" chip in the approved tier color and "1 of ~3". It was cheap: about 80 lines on the same points.

**The slots.** Search and Ranking stay "Coming with the beta". Watchlist's slot is dropped, since the watchlist is now Home's first row, and so is round four's "In design" label. The strip's caption on the movies side reads "Drawn live from the designs. The other movie screens come with the beta."

**The layout.**
- **From 1024 px.** The Home phone is 320 px and the other three are 200, the games side's size, spread across the column. Each small phone sits 126 px down, so its middle meets the Home phone's (672 px tall against 420); the caption stays out of that sum.
- **Below 1024.** The same snap row, with the Home phone at 300 px (76vw on a narrow phone) and the rest at 200, top-aligned.
- **Unchanged.** The games side, and `shots.moviesHome` with its file, kept like the desktop frames.

### Fixed on the way

- **The stacked steps on the movies side were 383 px wide at 360 and 375**, so those phones scrolled sideways. The single column took the scenes' min-content. The list is now `grid-cols-[minmax(0,1fr)]` below 768 px. It was found while sizing the switch for 360, and was there in round four.
- **The nav links wrapped at 1024** once the pill widened; they are `nowrap`.

### Scroll height

`document.documentElement.scrollHeight` in headless Chrome, 2026-10-08, every FAQ answer closed:

| Page | 1440 × 900 | 390 × 844 |
|---|---|---|
| Unisound (the ceiling) | 5743 | 6763 |
| Round four, games | 3776 | 5333 |
| Round four, movies | 3814 | 5391 |
| **Round five, games** | **3839** | **5396** |
| **Round five, movies** | **4169** | **5698** |

The games side grows 63 px, for the new question. The movies side grows 355 px at 1440: the question's 63 and 292 for the larger Home phone and its caption. At 390 it grows 307, 244 of them the strip. There is no horizontal scroll in any of the eight combinations, nor at 360, 640, 768 or 1024.

### Checks

Headless Chrome for Testing 1243 (Playwright 1.47), against the static export.
- **Screenshots.** In `.prototype/`, round four's moved to `.prototype/round-four/`:
  - `home-{games,movies}-{1440,390}-{light,dark}-{fold,how,full,strip,faq}.png`
  - the `faq` shots have the new question open.
- **The switch.**
  - Tab order is Skip, Verso, the checked radio, How it works.
  - ArrowRight from Movies selects Games, skipping TV and Books, and writes `?medium=games`.
  - The accessibility tree is as above.
  - At 360 the hero's pill fits (328 px).
- **The head.** The built `index.html` carries the two icon links, the touch icon and the `og:` and `twitter:` image tags. No request fails, and no console error.
- **Images.** None broken, in any of the eight combinations.
- **Motion.** Under reduced motion, nothing runs, before or after a switch, and the thumb's transition is 0 s. Nothing loops. The new screens have no motion beyond the strip's existing hover lift.
- **Types.** `pnpm --filter @verso/site build` and `pnpm typecheck` pass.
- **Not run.** Safari and Firefox, as before.

### Deviations and flags for Rafa

1. **TV and Books show no names in the nav**, only the icon and "soon" (the table above). The hero's switch, below 1024, shows the names from 640 px.
2. **Three posters were added** to the eleven for the Drama row (above).
3. **The services on the cards are illustrative.**
4. **The FAQ's first answer is his draft as he said it.** "V0 / V1" is his public framing, as the brief records.
5. **The share image and the touch icon are the slot, not the logo.** When his mark lands: replace `LogoSlot`'s tile, put his SVG in the script in place of `tileSvg`, and rerun it.
6. **`og:image` points at localhost** until `SITE_URL` is the domain.
7. **The movies Home's top row is the app's chip**, not the frame's large "● Movies" header.

## Round four (2026-10-08)

The brief is the site brief's "Rafa's reaction to round three": "exactly what I wanted, very close to perfect", with four edits. The Games | Movies switch moves to the top of the page as a pill with the app's medium icons and drives the whole page. Movies get their own How it works and strip. Decision 29's green replaces the accent, and no medium has a color. The FAQ answers become his to write. Everything else is kept: the hero, the thesis strip, the scenes' motion, no library, nothing looping, reduced motion, light and dark, 1440 and 390.

### The medium switch (`medium-switch.tsx`)

**Where it sits.** In the sticky nav's center from 1024 px, and under the nav at the top of the hero below that. The nav is the top of the page and it stays on screen, so a reader can flip the switch while looking at How it works or the strip and watch them change in place; that is what "it changes the entire page" asks for. Below 1024 px the nav holds the wordmark, Log in and Request access and has no room, so the pill opens the hero instead, full width up to 360 px. Both placements are one component, and CSS shows one. Privacy and Terms carry no switch.

**What it is.**
- Two native radios in a `radiogroup` labeled "Show the page for".
- Each segment has the app's icon (`gamepad-2`, `film`, 20 px) and a 17 px semibold label. Segments are 40 px tall in the nav and 44 in the hero.
- The selected segment sits on a brand-green thumb with a white label. The thumb slides across in 320 ms, and not at all under reduced motion.
- The keyboard works as a radio group does. Tab reaches the checked segment, the arrows move and select, and the focus ring draws on the segment.
- A polite live region says "The page now shows movies."

**The state is in the address.**
- `?medium=movies` opens the movies side, and anything else opens games.
- An inline script in the layout's `<head>` reads the address into `<html data-medium>` before the first paint. It is first-party and inline, so CI's no-third-party-script check holds.
- A change writes `?medium=games` or `?medium=movies` with `history.replaceState`. There is no reload and no history entry, so Back still leaves the page rather than flipping it.

**How it drives the page.** Everything that names the medium is in the HTML once per medium, marked `data-medium-only`. One unlayered CSS rule hides the side `<html>` does not name, which takes it out of the layout, the tab order and the accessibility tree. The page holds no React state for content. That is why a shared movies link never flashes games, and why the page is right before hydration.
- A browser starts a newly shown element's CSS animations afresh, so a switch replays without extra code.
- **The hero's ask** replays from the question after a 240 ms fade. `html[data-medium-switched]` sets its start to 60 ms.
- **The scenes**, if on screen, play the new medium at once, in turn as on arrival. If off screen they are armed again (`play-on-view.tsx`), so they play when the reader reaches them.

What it changes:
- the hero's ask
- How it works' three scenes and three sentences
- the strip and its caption
- thesis card 1 ("a bad game" or "a bad movie")

The headline and subline say "games and movies" and stay one string.

**Refused:**
- **React state with a keyed remount per medium.** The prerendered HTML is games, so a movies link would show games until hydration, 100 to 300 ms.
- **`useSearchParams`.** A static export needs a Suspense boundary around it, and the prerendered HTML would still be games.
- **`pushState`.** Every flip would be a history entry.

### Movies everywhere the switch reaches

| Where | Games | Movies |
|---|---|---|
| The ask (hero) | "What do you feel like playing?"; A Short Hike, Journey, What Remains of Edith Finch | "What do you want to watch?"; Palm Springs, Paddington 2, Hunt for the Wilderpeople (copy-options section 5, unchanged) |
| Scene 1, the pick | "Which RPG did you enjoy more?" Baldur's Gate 3 (just finished) over Elden Ring (ranked #2 · 9.6) | "Which drama did you enjoy more?" Past Lives (just watched) over Aftersun (ranked #2 · 9.6) |
| Scene 2, the slot | Loved: Hades 9.8, Baldur's Gate 3 slides in at 2, Elden Ring and Outer Wilds move down | Loved: The Grand Budapest Hotel 9.8, Past Lives slides in at 2, Aftersun and What We Do in the Shadows move down |
| Scene 3, the ask | "What's short on my list?" Hollow Knight, Stardew Valley and Terraria step back; Animal Well, Portal 2, Journey picked; "Animal Well is small and full of secrets, and you put Outer Wilds in Loved." | "What's short on my watchlist?" Dune: Part Two, Everything Everywhere All at Once and Spirited Away step back; Lady Bird, Paddington 2, Palm Springs picked; "Lady Bird is a short, warm coming-of-age story, and you put Aftersun in Loved." |
| Steps | "Two games you've played", "the game slides", "what to play … from your own list" | "Two movies you've watched", "the movie slides", "what to watch … from your watchlist" (decision 18) |
| Inside the app | Home, Search, Compare, Ranking from Figma, and the Movies slot (unchanged) | The movies Home from Figma, captioned "In design", and four slots: Search, Compare, Ranking and Watchlist, each "Coming with the beta" |

One story per medium. Every reason cites a title in Loved on the same page, as the beta's reasons must (decision 24). The hero's movie reasons cite The Grand Budapest Hotel and What We Do in the Shadows, which scene 2 now shows in Loved. Scene 3's movie picks are the three under two hours, but the screen shows no runtime, so there is no number to defend.

**The movies Home** is Figma node 143:173, `Home · Movies H · Rows by reason` on `Structure round · movies`. It took one `get_screenshot` call. The frame is 402 × 2080, drawn in the old movie blue (`#4881CC`) over gray poster placeholders, so the call returned it at 338 × 1748. It became `public/shots/phone-movies-home.webp` (338 × 735, the 402 × 874 screen ratio) in three steps:
1. Cut to the first screen, above the frame's own fold line, with its tab bar joined under it.
2. Painted out the designer's "fold" note.
3. Swapped the medium colors by value in a script. Each blue pixel was read as a blend of the blue and a neutral and re-blended with `#006822`; the games dot in the switcher went gray.

The swap is what the Brand color round did in Figma (`Brand · Movies light`, 189:190), except the active Home tab, which stays black here. Shown raw, the frame would have put the abandoned blue on the page. When a Figma call is free, a direct export of 189:190 replaces the file. It is under 1x (338 px for 402 pt), so it is slightly soft on retina, like the other shots.

### Real art at full size (`content/art.ts`)

The 1x cover crops in `public/covers/` and `covers.ts` are gone. The hero's picks now carry art, which they had not before, and the scenes use the same art. Every image is a plain `<img>`:
- `width` and `height` set to the file's pixels.
- `loading="lazy"` in the scenes and the strip; eager in the hero, which is above the fold.
- `referrerpolicy="no-referrer"`.
- Whole at its own 2:3, never cropped (rule 29).

The pick cards' cover drops from 96 to 84 px wide so the taller 2:3 art fits the 272 px scene.

**Games: Steam's library art**, checked 2026-10-07.
- All 15 URLs in the brief returned 200 `image/jpeg`; none failed.
- `library_600x900.jpg` is in fact 300 × 450; the 600 × 900 file is `library_600x900_2x.jpg`. The largest cover on the page is 84 CSS px, which 300 px covers at 3x, so the smaller file is used.
- In use (12): Hades, Hollow Knight, Stardew Valley, Portal 2, Elden Ring, Outer Wilds, Baldur's Gate 3, Terraria, A Short Hike, Journey, What Remains of Edith Finch, Animal Well.
- Verified but not shown (3): Celeste, Disco Elysium and Slay the Spire. Celeste and Disco Elysium are cited in the hero's reasons as Liked.

**Films: TMDB's CDN at `w342`** (342 × 513), checked 2026-10-07. Each poster path was read from the `og:image` of the film's themoviedb.org page, with no key. All returned 200; none failed. Eleven films are in:

| Film | TMDB id |
|---|---|
| Past Lives | 666277 |
| Aftersun | 965150 |
| The Grand Budapest Hotel | 120467 |
| What We Do in the Shadows | 246741 |
| Palm Springs | 587792 |
| Paddington 2 | 346648 |
| Hunt for the Wilderpeople | 371645 |
| Dune: Part Two | 693134 |
| Lady Bird | 391713 |
| Everything Everywhere All at Once | 545611 |
| Spirited Away | 129 |

That is one more than the brief's eight to ten: scene 3 needs six films on the watchlist besides the ranked four, and the hero's three would otherwise repeat as scene 3's picks. Parasite, Columbus and Perfect Days were left out.

The footer now reads "Game data from IGDB. Game art from Steam." (Steam linked) before TMDB's sentence.

### The brand green (`globals.css`)

`--color-accent` is `#006822` in both schemes, always under a white label (`--color-accent-label`, Tailwind's white). `--color-accent-text` equals it in light and is `#009B37` in dark. Both carry a comment that they move into `packages/tokens/tokens.json` when the app adopts decision 29 (item 37). No other brand hex is written anywhere in `src`; the only other hexes are the device literals below.

| Role | Variable | Where |
|---|---|---|
| Fill, white label | `--color-accent` | Request access (nav, hero, panel); the switch's thumb; the send buttons in the hero phone and scene 3; scene 3's pick badges |
| Brand text, icons, marks | `--color-accent-text` | Step numbers; the step hairline's fill; the focus ring; the text selection; the chosen card's ring; the tap ring; the pick rings; the new row's wash; the glow behind the hero phone; the caret; the hero phone's pick numbers and chip icon |

The hero phone's screen is light in both schemes, so it holds the mark color at the fill's value (`phone.tsx`).

**Contrast.** White on `#006822` is 7.0:1. `#009B37` on black is 5.7:1, where `#006822` would be 3.0 (brand-color.md). The button's hover mixes 14% toward the text color, which keeps its white label at 5.2:1 in dark.

**Removed.** Every medium color is gone: the accent pointed at `medium/games`, the switch and the phone's chip carried a dot, and the caret, send button and pick numbers carried green or blue. No `medium-*` variable is read anywhere in `apps/site/src`.

**Kept.** Scene 2's tier divider and score pills keep the approved tier palette (`tier/loved`, `tier/label`, as the tokens hold it today). Decision 29's own option A tier palette waits for the token adoption with the brand.

### The FAQ

The heading is "Frequently asked questions". Under each question the page shows one italic line, "Rafa's answer, to come." Round three's draft answers sit in comments beside their questions in `copy.ts`.

### Fixed on the way

Rounds one to three set `scroll-padding-top: 5rem` on `<html>` so anchors land under the sticky nav. With it, focusing anything in the sticky nav while scrolled down made Chrome scroll the page up about 460 px: tabbing to Log in did it, and so did clicking the new switch mid-page. The padding is replaced by `scroll-margin-top: 5rem` on what scrolls into view inside `main` (ids, links, buttons, inputs, summaries). Checked at 1440 and 390:
- Focusing or clicking in the nav no longer scrolls.
- "See how it works" lands the heading at 80 px.
- A summary focused from above lands at 80 px.

### Scroll height

`document.documentElement.scrollHeight` in headless Chrome, 2026-10-08:

| Page | 1440 × 900 | 390 × 844 |
|---|---|---|
| Unisound (the ceiling) | 5743 | 6763 |
| Round three | 3872 | 5335 |
| **Round four, games** | **3776** | **5333** |
| **Round four, movies** | **3814** | **5391** |

At 1440 the hero lost round three's chips under its phone, since the switch is in the nav now. At 390 the switch opens the hero instead of sitting under its phone, so the height barely moves. The movies side is 38 px taller at 1440 and 58 at 390, for the strip's "In design" label and its longer caption. There is no horizontal scroll in any of the eight combinations.

### Checks

Headless Chrome for Testing 1243 (Playwright 1.47), against the static export.
- **Screenshots.** In `.prototype/`, round three's moved to `.prototype/round-three/`:
  - `home-{games,movies}-{1440,390}-{light,dark}-{fold,how,full}.png`
  - `switch-replay-*.png` (the ask replaying)
  - `switch-scenes-*.png` (the scenes replaying in view)
  - `switch-keyboard-1440.png`
  - `faq-open-1440.png`
  - `home-games-1440-light-reduced-fold.png`
- **Images.** No broken image in any of the eight combinations. The only console error is the favicon's 404, which waits on the logo.
- **Clicking Movies in the nav.** The address becomes `?medium=movies` with no reload (a window marker survives). `<html>` reads `movies`, both radio groups check Movies, the live region speaks, and the visible phone screen is the movies one.
- **The keyboard.** Tab order is Skip, Verso, the checked radio, How it works. ArrowRight selects Movies and writes the address, with a 2 px `#006822` ring on the segment. ArrowLeft goes back.
- **The scenes.** Switched in view, all three end `data-play="run"` and replay. Switched from the top, all three are `armed`.
- **Looping.** No infinite animation anywhere.
- **Reduced motion.** No animations at load or after a switch, and the thumb's transition is 0 s.
- **The FAQ** opens to the italic line.
- **The head script** sits in `<head>` before `<body>` and before Next's chunks.
- **Types.** `pnpm --filter @verso/site build` and `pnpm typecheck` pass.
- **Not run.** Safari and Firefox, as before.

### Deviations and flags for Rafa

1. **The movies Home is recolored, not raw.** Frame 143:173 is in the abandoned blue, so the shot is the value swap described above. A direct export of 189:190 replaces it.
2. **Baldur's Gate 3 replaced Clair Obscur** in scenes 1 and 2, from the brief's Steam list. The strip's compare shot still shows Clair Obscur against Elden Ring.
3. **Eleven films, not eight to ten**, so the hero's three do not repeat as scene 3's picks.
4. **Thesis card 2 stays one sentence** for both media. "An AI can read the whole book or watch the whole film" is his example of what an AI can do, not the medium on the page. A games version would have to claim an AI plays the game through.
5. **The movies strip names its four empty slots** (Search, Compare, Ranking, Watchlist, each "Coming with the beta") rather than repeating "Screens coming with the beta" four times.
6. **Hotlinked art asks Steam's and TMDB's hosts.** Each reader's browser requests the images from Steam's Akamai host and TMDB's CDN, which see the reader's IP and user agent (no referrer is sent). The site self-hosts its fonts so that nothing leaves (onboarding principle 12). Before the site goes public, mirroring the art is the call. TMDB's attribution sentence is in; its logo rules are a launch check.


## Round three (2026-10-07, late night)

The brief is the site brief's "Rafa's reaction to round two": "much, much closer", but it needs "more sauce". How it works should show the mechanism, not just say it. The first image should be a 3D phone seen at an angle. The AI moment should look better and include movies. The wording needed fixing: "never sold" reworded, AI-native language, no "this one or that one", and the age-of-AI line out of the header. Three research notes fed the build, all in `docs/private/research/site-notes/`:
- `ai-native-and-motion.md` (wording patterns and code sketches)
- `copy-options.md` (headlines, the "never sold" rewrites, cards, steps, the movies content)
- `similar-sites.md` (14 small-team taste and recommendation sites, measured at 1440)

### The page

1. Nav, unchanged.
2. **The hero.** The headline is option 1, "Verso is a recommendation engine on your side.", with its subline. Beside it is one angled 3D phone holding the AI moment, with a Games and Movies switch under it.
3. **"What Verso is built to do"**, four cards. It opens on the problem statement, "In an age of AI, your time is the scarce thing", which moved here from the header.
4. **How it works.** Three live scenes, each over its step's sentence.
5. **"Inside the app"**, unchanged: four flat phones and the Movies slot.
6. Three questions.
7. Request access.
8. The footer.

The round-two compare phone behind the hero phone is gone. One turned phone reads more clearly than two overlapping, and the compare screen still appears twice lower down: live in scene 1, and in the strip.

### The angled phone (`angled-phone.tsx`)

It is CSS 3D, as the motion note's B1 sketches it. The screen is live DOM, so the text stays sharp, the answer types itself and the switch swaps it. Four boxes each own one motion, so no two motions fight over one `transform`:

| Box | What it owns |
|---|---|
| Stage | Perspective of 1,400 px, the fade on load, the floor shadow, the glow |
| Settle | The resting angle |
| Tilt | The lean toward the pointer (`tilt-on-pointer.tsx`, now without its own perspective) |
| Body | The turn-in on load, the front face and the thickness |

How it is built and how it moves:
- **Thickness.** Ten slices of the phone's rounded outline sit behind the front face. A single side face would leave gaps at the rounded corners; the slices fill them. They are shaded light to dark from front to back, and like the titanium edge, those shades are device literals.
- **Glare.** A sheen on the glass slides with the pointer's side through a new `--tilt-u` variable.
- **Glow.** A faint pool of the accent sits behind the phone (`color-mix` at 14%, through the one accent variable).
- **Angle.** The phone rests at -22° around the vertical axis and 8° around the horizontal, turned toward the headline. It turns in from a further -18°, rising 56 px, over 1.4 s.
- **Settle.** It eases to -6° and 2° over the first 70% of a screen of scroll. The settle animates two angles registered with `@property`, and `transform` only reads them, which is why the pointer's tilt on the box inside never fights it.
- **Phone width.** Stacked under the text (below 1024 px) it rests at -14° and settles while it crosses the screen, on a `view()` timeline.
- **Flattening.** Nothing in the 3D chain takes `opacity`, `filter`, `overflow` or a mask, any of which would flatten it. The fade sits on the flat stage, and only the screen, a leaf, clips.
- **Overflow.** The hero clips sideways (`overflow-x: clip` above the 3D chain), because the glow reached 436 px at 390 wide before the clip.

**Browser support.**
- CSS 3D works everywhere.
- `@property`: Chrome 85, Safari 16.4, Firefox 128.
- The individual `rotate` and `translate` properties of the turn-in: Chrome 104, Safari 14.1, Firefox 72.
- The scroll-driven settle: Chrome 115 and Safari 26. Firefox holds the resting angle, which is a fine fallback.

**Under reduced motion,** the angle stays, since a still angle is not motion. Nothing enters, settles or tilts.

A pre-rendered angled PNG (Rotato, Shots.so) was refused, as the note concludes. It would bake the screen into a bitmap, so the switch could not work, it could not move, and every brand or dark-mode change would mean a re-render.

### The AI moment (`ask-moment.tsx`)

It plays once on load, in CSS, after the phone has turned in:
1. The question rises at 0.7 s.
2. The field rises with a caret that blinks once.
3. The answer types itself at 38 ms a character, with the caret riding its end, and the send button fills.
4. The thinking state: a trace of three lines, 320 ms apart, each under a shimmer that passes once and ends gray, with a check as it ends. "Reading your ranked list", "Leaving out what you've finished", "Fitting about two hours". This is the motion note's pattern 2, the source named on screen.
5. "Three from your list" and the three picks rise in, 150 ms apart, each with a reason that cites a title the person ranked in Loved or Liked (decision 24).

The run takes about 4.5 s. The server HTML is the finished screen.

**The switch.** Games | Movies is two `aria-pressed` chips outside the phone, which is one image to a screen reader. A click or a key swaps the medium. That remounts the keyed screen, so the timeline replays from the question after a 240 ms fade, and a polite live region reads the new example. The screen's chip, caret, send button and pick numbers carry the medium's color (games green, movies blue: the app's tokens).

The movies side is copy-options section 5, with "tonight" removed from the question: "What do you want to watch?", "something funny, under two hours", then Palm Springs, Paddington 2 and Hunt for the Wilderpeople. The games question is "What do you feel like playing?".

View transitions were refused for the swap. Their snapshot is drawn flat in the top layer, off the phone's 3D plane, for the length of the crossfade.

### How it works, animated (`how-scenes.tsx`, `play-on-view.tsx`)

The three scenes tell one story on the tokens, with covers cropped from the Figma frames the strip shows (`public/covers/`, exact pixel bounds, lossless WebP, about 140 KB in all, loaded lazily):

1. **The pick.** "Which RPG did you enjoy more?" over Clair Obscur and Elden Ring, as on the compare shot. A tap ring spreads on Clair Obscur, the card presses in and takes the accent ring, and Elden Ring steps back to 40%.
2. **The slot.** The Loved tier of the Ranking shot (Hades 9.8, Elden Ring 9.6, Outer Wilds 9.3). The rows under the slot start where they sat without it and move down a row. This is a FLIP worked out in CSS, since the layout is known. Their ranks and scores give way to the new ones (scores re-spread on insert, ranking-algorithm.md), and Clair Obscur slides in from the right at 2 with a 9.6, under an accent wash that fades to a faint mark.
3. **The ask.** "What's short on my list?" types itself, the send fills, and six covers on the person's list narrow to three. Metaphor, Silksong and GTA VI step back. Animal Well, Hades II and Balatro take the accent ring and their numbers in turn, and the first pick's reason rises. This is PlusOnePlay's many-to-few move from similar-sites.md, the thesis in motion.

**The trigger.** `PlayOnView` arms a scene that starts below the fold and plays it once when 45% of it is visible. That is an `IntersectionObserver` and a timer, the same in every browser. Side by side (from 768 px) the three play in turn, 1.4 s apart. Stacked, each plays as it arrives. A scene's animations exist only under `[data-play]`, so the HTML is the finished scene: without JavaScript, under reduced motion, or when the scene is on screen at load, it is simply there.

**The scroll-scrubbed enhancement.** The hairline over each step fills with the accent as the step rises from the bottom of the screen to its middle (`animation-timeline: view()`, Granola's step underline, Chrome 115 and Safari 26). Elsewhere it stays a plain hairline.

These scenes replace round two's static Ranking phone.

### The copy

Every line is a slot in `copy.ts`, Rafa's to sign.

| Where | Round two | Round three | From |
|---|---|---|---|
| Hero | "In an age of AI, your time is the scarce thing." | "Verso is a recommendation engine on your side." | copy-options, headline 1 |
| Subline | "…works for you: it learns your taste the way you'd tell a friend, this one or that one, and tells you what's worth your evening." | "It learns your taste from the games and movies you rank, and nobody pays it to put a pick in front of you." | copy-options, subline 1 |
| Card 1 | "Your time is the scarce thing" | "In an age of AI, your time is the scarce thing" / "The hours you get to yourself are the most valuable thing you have, and they shouldn't go to a bad movie." | Rafa's reaction; copy-options card 1 |
| Card 2 | "…before you spend ninety minutes finding out." | "…before you give it your evening." (heading kept) | copy-options card 2 |
| Card 3 | "This one or that one, one pick at a time. The ranking you build is how it learns your taste." | "You say which of two you enjoyed more, and the engine learns from that ranking. Every pick it makes comes with a reason that names what you ranked." (heading kept) | copy-options card 3, plus the join |
| Card 4 | "Never sold" / "Your list is yours. No ads, and it is never sold, free or paid." | "Your list is yours" / "The recommendation engine answers to you and nobody else, and nothing inside Verso is an ad." | copy-options, rewrite B |
| Steps | Pick between two / It learns from your list / Ask what tonight | Pick the one you liked more / It finds its place / Ask in your own words | copy-options 1A, 2A, and 3A without "tonight" |
| The ask | "What do you want to play tonight?"; Outer Wilds, Stardew Valley, Portal 2 | "What do you feel like playing?" with a trace; A Short Hike, Journey, What Remains of Edith Finch; and the Movies side | Rafa's direction; copy-options section 5 |
| Meta | The age-of-AI line and "this-or-that picks" | The headline and the join | |

**Alternatives for Rafa** are kept as comments in `copy.ts`:
- Headline 2, the mechanism: "Rank what you finish, and Verso finds what's next."
- Headline 3, the outcome: "See if it's worth it before you press play."
- Headline 9, the time thesis put as a consequence in StoryGraph's shape: "Free time is too short for the wrong movie."
- A subline 1 variant that says the join outright.
- Card 2 "Let the AI watch it first".
- Card 3 "Taught the way you'd tell a friend".

The rules hold:
- No "AI-powered", "personalized", "for you", "this one or that one" or "tonight" appears in any rendered string; the only hits are in comments.
- Wherever the engine is described, it is the subject of a working verb (learns, reads, picks, answers to you) and the source is named.
- The claim is the join of ranking in and picks with a reason from your own list out. similar-sites.md found that BEST ships the ranking alone and Movik and PlusOnePlay ship the pick alone.
- No number is invented.

### Scroll height

`document.documentElement.scrollHeight` in headless Chrome, 2026-10-07:

| Page | 1440 × 900 | 390 × 844 |
|---|---|---|
| Unisound (the ceiling) | 5743 | 6763 |
| Round one | 9410 | 10533 |
| Round two | 4020 | 4706 |
| **Round three** | **3872** | **5335** |

The scenes replace the Ranking phone, so the page at 1440 is 148 px shorter than round two's. At 390 it is 629 px longer, because the three scenes stack and the thesis cards go one per row below 640 px; it stays under Unisound's 6763. There is no horizontal scroll at either width.

### Techniques chosen and refused

Chosen. There is still no new dependency and no third-party script.
- CSS 3D in four boxes for the phone.
- `@property` for the settle's angles.
- A `scroll(root)` timeline, and `view()` at phone width.
- The individual transform properties for the turn-in.
- Per-character animation delays for the typing.
- `background-clip: text` for the one-pass shimmer.
- An `IntersectionObserver` that arms and plays each scene.
- A FLIP worked out in CSS for the slot.
- A `view()` timeline for the step hairline.
- A keyed remount to replay the ask.

Refused:
- **Motion.** The ranking list is a known layout, so CSS does the FLIP. Springs are not needed, and its components ship blank until hydration.
- **GSAP and ScrollTrigger.** A pinned, scrubbed story would add scroll height against the ceiling.
- **Lenis.** Unchanged from round two.
- **View transitions on the switch.** Their flat snapshot sits off the 3D plane.
- **A pre-rendered angled PNG.**
- **Video loops, marquees, Lottie and Rive.** Nothing loops.
- **Grain.** Texture is a brand decision.
- **Scroll-scrubbing the scenes.** A clip that plays reads as a demo; a scrubbed one is a slideshow the reader drives, and it needs sticky pinning.
- **`animation-trigger`.** Chrome 146 only.

None of the 14 similar sites uses a 3D library or an animation library either.

### Checks

Headless Chrome for Testing 1243 (Playwright 1.47), 2026-10-07.
- **Frames.** Captures at 0.4, 1.3, 2.0, 2.7, 3.4, 4.2 and 5.2 s show the turn-in, the typing with one caret, the trace's shimmer and the picks rising.
- **The switch.** Tabbing reaches it after See how it works and shows the focus ring. Space presses Movies, the screen replays with the movies content, and the live region reads the new label.
- **The scenes.** Captures 0.2 to 4.3 s after scrolling to How it works show scene 1's pick, scene 2's rows making room and the slide-in, and scene 3's typing and narrowing. All three end `data-play="run"`.
- **The settle.** It reads -22° at the top and -6° at 630 px of scroll.
- **With motion allowed.** 163 animations at load, none infinite, none running after the page settles.
- **With reduced motion.** No animations at load, nothing armed or hidden, the tilt `none` after the mouse moves, and the angle held at -22°.
- **The FAQ.** It opens with Enter.
- **What was not run.** Safari and Firefox were not run here; only Chromium is installed. Their support comes from MDN browser-compat-data, as cited in the motion note.

Screenshots are in `.prototype/` (round two's moved to `.prototype/round-two/`). They cover 1440 and 390 in light and dark, plus reduced motion, each as a fold, a How it works view and a full page. There are also `ask-typing-1440.png`, `switch-movies-1440.png`, `how-sequence-1440.png` and `settled-at-630.png`.

### Deviations and what was not done

1. **The games picks changed.** Outer Wilds sits at 3 in Loved on the Ranking shot on the same page, so it cannot be an unplayed pick. The round-two reasons also had a fragment and a semicolon (copy-options tone note 5) and an overstatement ("Celeste above everything"). The new three each run about two hours and cite a Loved or Liked title on the Ranking shot.
2. **The hero subline is option 1 as written.** It names the input and "nobody pays it", but not the picks. The phone beside it shows the join, and a variant that says it is commented in `copy.ts`. "Nobody pays it" is Rafa's premise, not yet a recorded decision (copy-options flag 5).
3. **Card 4 is read app-wide.** "Nothing inside Verso is an ad" retires decision 21's door for labeled slots in Search and Popular (copy-options flag 1). "Nothing it picks is ever an ad" keeps that door open.
4. **Step 3 is intent until the beta.** "Ask in your own words" describes the finder, which ships with the private beta by mid-December (copy-options flag 3). Scene 3's question and its Animal Well reason are Claude's slots.
5. **Not borrowed this round.** A playable compare in the hero (similar-sites, borrow 1) was not built: the hero's job is the AI moment, and scene 1 is a picture, not a control. Product-fact numbers were not added either. Both are options for a later round.
6. **The covers are 1x.** They are cropped from the same 1x Figma frames as the shots, so they are slightly soft on a retina display; a 2x export fixes both.
7. **The favicon still 404s.** It waits on the logo.

## Round two (2026-10-07, night)

The brief is the site brief's "Rafa's reaction to the prototype": Unisound's page is the ceiling on scroll length, the About goes, the movie side gets a labeled slot, and the time goes into what makes a site look seamless, smooth and professional. Two directions from Rafa arrived during the round and are in it: the thesis carried by the hero and the vision strip (the brief's "The thesis, in Rafa's words"), and the shots set in real phones with the ask-in-plain-words feature shown as a live illustration ("a floating screen is very ugly; it should be like a phone with the actual app on it"), which overrides round one's no-bezel rule.

### Unisound, measured

Opened in headless Chrome (Playwright 1.47 from the npx cache, Chrome for Testing 1243) at 1440 × 900 and 390 × 844, its nine JavaScript chunks and its stylesheet downloaded and searched, 2026-10-07.

- **Scroll height:** 5743 px at 1440, 6763 px at 390. Ours must end at or below the first.
- **Build:** Next.js (App Router, built with Turbopack: `_next/static/immutable/chunks/turbopack-*.js` and the `?_rsc=` fetches), Tailwind v4 (`@property --tw-*` in its CSS), Inter through `next/font` (its latin file has the same name prefix as round one's, `83afe278b6a6bb3c`). **It is not a Framer site, and not Webflow**, so Framer does not become a question for Rafa: Unisound is the same stack as ours.
- **No animation library.** None of `motion`, `framer-motion`, `gsap`, `ScrollTrigger` or `lenis` appears in its bundles. Every effect is a CSS keyframe or transition, plus a `Reveal` wrapper of about 15 lines (an `IntersectionObserver` at threshold 0.18 with an 8% bottom margin, adding a class, with a per-element `--reveal-delay`) and a reduced-motion hook.
- **Sections:** six plus the nav and footer. Hero with the dashboard below it (1440 px tall), a dark stat band (428), how it works as three cards plus one wide coverage panel (1340), a dark "infrastructure" band (1010), the FAQ of three beside its heading (660), the call to action in a surface panel (517), the footer.
- **Its animations, each:**
  1. *Hero on load:* eyebrow, headline, subline, button, note and dashboard each run `fade-up` (opacity 0 and 18 px down, to rest) for 0.7 s ease-out, at 0, 100, 200, 300, 400 and 500 ms. CSS only, so it runs on first paint.
  2. *Reveal on scroll:* `.reveal` fades in from 16 px down over 0.5 s ease-out, staggered 0 to 240 ms across cards.
  3. *Count-up* on "$20M+" and the other stats: `requestAnimationFrame`, 1.1 s, cubic ease-out, once 40% is visible.
  4. *Drawn strokes:* the step icons draw in (`stroke-dashoffset`), accent bars and tick rules grow (`scaleX`, `scaleY`).
  5. *Loops:* a marquee of rights-organization logos (42 s, linear, masked edges), two orbit layers (40 s and 36 s), a radial spin (28 s), a shimmer on the call-to-action panel.
  6. *Hover:* cards shift fill and border over 300 ms; in the dark band, the other cards dim to 55% while one is hovered; the button gains a soft ring over 350 ms; links drop to 70% opacity.
  7. *Scrolling:* native `scroll-behavior: smooth`, set back to `auto` under reduced motion.
  Every one of them stops under `prefers-reduced-motion`.
- **Hero type:** 60 px, weight 600, -0.03 em, line height 1.05, `text-wrap: balance`.

Taken: the CSS-first approach, the staggered hero on first paint, a reveal on entry, hover that changes fill rather than position, native smooth scrolling for anchors. Refused: the loops (the brief: nothing loops), the count-ups (Verso has no number, rule 9), the drawn icons (the page has no icons to draw), and the per-card stagger on scroll (the brief: one fade-up per section).

### The polish research

About 40 minutes, 2026-10-07. Sizes marked *measured* were taken from jsDelivr's builds and gzipped at level 9 here; browser support is MDN's browser-compat-data 8.1.4 (2026-10-01).

| Option | What it is, and what it costs | Verdict |
|---|---|---|
| **Motion** 14 ([motion.dev](https://motion.dev)) | `whileInView`, staggered variants, `useScroll` and springs for React. The `motion` component is 34 KB; `LazyMotion` with `m` is 4.6 KB plus 15 KB for `domAnimation`; the mini `animate` is 2.3 KB ([reduce bundle size](https://motion.dev/docs/react-reduce-bundle-size)); `inView` alone is 0.5 KB ([inView](https://motion.dev/docs/inview)). Under `MotionConfig reducedMotion="user"` it turns off transform and layout animation but keeps opacity animating ([accessibility](https://motion.dev/docs/react-accessibility)) | **Refused, on polish rather than bytes.** A `motion.h1` with `initial={{ opacity: 0 }}` ships at opacity 0 in the static HTML and stays blank until React hydrates; a CSS keyframe starts on first paint. Every effect on this page is opacity and translate on entry, which CSS runs on the compositor. Motion earns its place with springs, layout animation, gestures or exit animation, none of which the page has. It is the upgrade if the brand round wants a product animation (the compare cards making a pick) |
| **GSAP** 3.15 with ScrollTrigger | Free for every use since Webflow's 2025 change, the former Club plugins included ([Webflow](https://webflow.com/blog/gsap-becomes-free)); the standard license's one bar is building no-code visual animation tools ([license](https://gsap.com/standard-license/)). *Measured:* `gsap.min.js` 28.3 KB, `ScrollTrigger.min.js` 18.0 KB | **Refused.** Its strength is pinned, scrubbed scroll storytelling, which the brief rules out; 46 KB for what CSS does here |
| **CSS only** | Keyframes and transitions; scroll-driven animations (`animation-timeline: scroll()` and `view()`) in Chrome 115 and Safari 26, Firefox only in preview; `@starting-style` in Chrome 117, Safari 17.5, Firefox 129 | **Chosen.** Keyframes for the hero, a transition for the reveal, `scroll()` for the hero shot's drift as an enhancement Firefox skips. `@starting-style` does what a keyframe does for an entrance, and a keyframe takes a per-element delay more simply |
| **Lenis** 1.3 ([darkroom.engineering](https://github.com/darkroomengineering/lenis)) | Smoothed wheel scrolling on top of native scroll, so sticky and anchors keep working; honors reduced motion by default. *Measured:* 5.4 KB. Its own limits: no CSS scroll-snap without `lenis/snap`, 60 fps cap in Safari, stops over iframes. Thoughtworks' Radar (vol. 34) holds it at Assess for accessibility issues with vertical and horizontal scrolling ([Radar](https://www.thoughtworks.com/de-de/radar/languages-and-frameworks/lenis)); macOS trackpads already scroll with momentum, and smoothing on top reads as loose | **Refused.** It would break the product strip's snap row, and Rafa reviews on a Mac trackpad. Anchor jumps get native smooth scrolling, off under reduced motion |
| **tailwindcss-motion** 1.1 (Rombo) | Utility classes for on-mount animation; under reduced motion it drops translate and scale but keeps opacity animating ([docs](https://docs.rombo.co/tailwind)) | **Refused.** A JavaScript plugin for three keyframes, and its reduced motion is not "nothing moves" |
| **tailwindcss-animate** / **tw-animate-css** 1.4 | The first is superseded for v4 by the second, a CSS-first set of enter and exit utilities for Radix popovers and accordions ([tw-animate-css](https://github.com/Wombosvideo/tw-animate-css)); nothing on scroll | **Refused.** The site has no popovers |
| **Aceternity UI** | Free copy-paste components on Tailwind and Motion; set pieces such as Hero Parallax, Macbook Scroll, Container Scroll, Aurora, Beams ([components](https://ui.aceternity.com/components)) | **Refused.** Showpieces, the busy that Rafa rejected |
| **Magic UI** | Blur Fade, the most copied reveal: Motion, 0.4 s, 6 px offset, 6 px blur, in-view option ([Blur Fade](https://magicui.design/docs/components/blur-fade)) | **Read, not imported.** Its offset informed ours; the blur is refused (a filter on a section-sized box costs paint) |
| **Cult UI** | MIT, a shadcn extension of 154 animated components, device mockups among them ([cult-ui.com](https://www.cult-ui.com/)) | **Refused.** Its components come with shadcn's variables and Motion; the phone the site needs is drawn here on the tokens instead |
| **Tailark**, **shadcn blocks** | Registries of marketing blocks on shadcn's variables (Tailark: free tier and paid, [tailark.com](https://tailark.com/)) | **Patterns only**: the four-card row, the call to action in a surface panel, the FAQ beside its heading, rebuilt on the tokens rather than imported with shadcn's colors |

Micro-interactions, from Emil Kowalski's [7 practical animation tips](https://emilkowal.ski/ui/7-practical-animation-tips) and [Great animations](https://emilkowal.ski/ui/great-animations): scale a pressed button to 0.97; never animate from `scale(0)`; keep interface animation under 300 ms; ease out for things that enter; prefer a custom curve to the built-ins; animate only `transform` and `opacity`. Tailwind v4 applies `hover:` only under `@media (hover: hover)` ([upgrade guide](https://tailwindcss.com/docs/upgrade-guide)), so a tap never leaves a hover stuck. WCAG 2.3.3, Animation from Interactions (AAA), names parallax and scroll-triggered motion and asks that it can be turned off ([Understanding 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)); the site turns all of it off under reduced motion.

**Typography.** Inter's features were tested on the built site in Chrome by rendering each at 120 px with and without the feature and comparing pixels: `cv01`, `cv05`, `cv08`, `cv10`, `cv11` (single-storey a), `cv12`, `cv13`, `ss01` (open digits), `ss02`, `ss03`, `ss07`, `zero` and `case` render identically, so Google's build of Inter, the one `next/font/google` serves and the app loads through `@expo-google-fonts/inter`, has them stripped; `tnum` survives. Getting `cv11` would mean self-hosting the full file from rsms with `next/font/local`, and the site's a would then differ from the app's: refused. What Google's build does carry is Inter 4's optical-size axis (`opsz`, 14 to 32, in next/font's own font data): loaded with `axes: ['opsz']`, every size from 32 px up renders in the Display cut drawn for headlines, with no other change. Chosen; the latin file grows from 48 KB to 73 KB. The hero moves to weight 600 at -0.025 em (Unisound 600 at -0.03 em, Linear 510 at -0.022 em): at 700 the Display cut reads heavy. Kept from round one: `text-wrap: balance` on headings, `pretty` on paragraphs, tabular figures on the step numbers.

**Product shots, in phones.** Rafa's direction mid-round: every shot sits in a real phone. Apple publishes Product Bezels for showing apps on its devices (developer.apple.com/design/resources), but they are a download behind Apple's terms, which this round did not accept on Rafa's behalf, and a PNG bezel is one size; the phone is drawn in CSS instead (`phone.tsx`), from the iPhone 16 Pro's proportions: the 402 × 874 pt screen with its 62 pt corners, a black bezel of 2.2% of the width, a titanium edge of 1% (a gray gradient that catches light at the top left), the Dynamic Island, the side buttons, a status bar at 9:41 and the home indicator. It is sized in container units, so one component draws every phone on the page, and the screenshots sit whole inside it (rule 29). The shadow is four layers, each wider and fainter; in dark a faint light ring draws the phone's edge on the black canvas (rule 30's reasoning). Motion on the phones: the hero's two drift at two rates on scroll (the one behind slower, so it reads as further away) and lean a few degrees toward the pointer, and the strip's phones lift 4 px on hover; each is small, and all of it stops under reduced motion.

### What the site uses, and what it refuses

No new dependency. The minimum set:

1. CSS keyframes for the hero's entrance and the finder illustration's one play, in `globals.css`.
2. The existing `IntersectionObserver` reveal (`reveal-on-scroll.tsx`, about 30 lines), the pattern Unisound ships and the one Motion's `whileInView` wraps.
3. One scroll-driven animation (`animation-timeline: scroll(root)`) for the hero phones' drift.
4. A pointer tilt (`tilt-on-pointer.tsx`, about 50 lines): two CSS variables set once per animation frame, eased by a CSS transition.
5. The phone, drawn in CSS on container units (`phone.tsx`).
6. `next/font` with Inter's `opsz` axis.

Refused, one line each: Motion (blank until hydration, no spring or layout to justify it; the finder illustration's typing is per-character CSS delays, so even it needs no library), GSAP (scrollytelling the brief rules out), Lenis (breaks snap, loosens trackpads, flagged for accessibility), tailwindcss-motion and tw-animate-css (plugins for what a few keyframes do), Aceternity and Cult UI (set pieces on shadcn's variables), Magic UI's blur, Apple's bezel PNGs (a download behind terms, one size), self-hosted Inter for `cv11` (the site's type would leave the app's).

### The motion

Every rule sits inside `@media (prefers-reduced-motion: no-preference)`, so under reduced motion the page is drawn in place and nothing moves, fades or scales. Only `opacity`, `translate` and `scale` animate. Nothing loops. One curve, an ease-out quint (`cubic-bezier(0.22, 1, 0.36, 1)`, `--ease-site`).

1. **The hero on load:** the line, the subline and the buttons rise 16 px and fade in over 900 ms, at 0, 90 and 180 ms; the compare phone rises 48 px at 120 ms and the finder phone 40 px at 220 ms. CSS, on first paint, before hydration.
2. **The finder illustration plays once:** the question rises at 600 ms, the field at 850 ms with a caret that blinks once, the answer types itself a character every 45 ms from 1.3 s with the caret riding its end, the send button fills as typing ends, then "Three from your list" and the three picks rise in, 170 ms apart, by about 3.5 s. Per-character animation delays, no script; the server HTML is the finished screen.
3. **The hero phones' drift:** 64 px (behind) and 28 px (in front) down over the first 700 px of scroll, so they leave a little slower than the text and the one behind reads as further away. From 1024 px wide only (stacked under the text it would read as lag); Chrome and Safari 26; Firefox shows them still.
4. **The pointer tilt:** the two phones lean toward the pointer, at most 6 degrees around the vertical axis and 4 around the horizontal, eased over 800 ms. Mouse and trackpad only.
5. **One fade-up per section:** each section's inner wrapper rises 24 px and fades in over 900 ms once, when it enters; only what starts below the fold is hidden, and it is hidden at once, not faded out.
6. **The nav:** a hairline once the page scrolls, and the canvas at 80% over a 20 px blur; opaque where the reader asks for reduced transparency or more contrast.
7. **Hover and press:** the filled button darkens (the accent mixed 14% toward the text color, so it lightens in dark), the secondary goes to `bg/placeholder`, the vision cards gain a hairline, the strip's phones lift 4 px, links darken; a pressed button scales to 0.97 for 150 ms.
8. **The questions:** the chevron turns over 300 ms and the answer fades in over 360 ms; in Chrome the height opens too (`interpolate-size`), elsewhere it jumps as native `<details>` does.
9. **Anchors:** native smooth scrolling to How it works.

Checked in headless Chrome: with motion allowed, the h1 starts at opacity 0 and is at 1 by 1.5 s, the sections below the fold start hidden and are all shown after a scroll to the end, the drifts read `0px 64px` and `0px 28px` at 700 px of scroll, the tilt follows the mouse, and captures at 1.0, 1.9, 2.5, 3.4 and 4.5 s show the finder mid-typing with one caret and then settled; with reduced motion there are no animations at load, nothing is hidden, the drift and the tilt are `none`, and the finder is drawn finished.

### The page

Nav (How it works, Log in, Request access); hero, carrying the thesis, with two phones beside the text; "What Verso is built to do", the thesis in three beats plus "never sold" as four cards, four across from 1024 px and two per row below, right after the hero so the thesis reads before the mechanics (moved there on Rafa's yes); how it works as three numbered steps side by side over hairlines, with the Ranking phone under them; "Inside the app" on a `bg/surface` band, four phones (Home, Search, Compare, Ranking) and a fifth holding the movies slot, five across from 1024 px and a snap row below it; three questions beside their heading; Request access in a surface panel; the footer (the address, Privacy, Terms, the IGDB credit and the TMDB sentence, "Built by Rafael Sanchez", © 2026). Section padding 64 px at phone width, 80 at tablet, 96 from 1024 up.

Cut from round one: the About section and the `/about` page (and its check in CI's site job), About in the nav and the footer, the line under the hero's buttons, the step-1 compare shot and the step-3 finder card, the four vision sections with their shots, the desktop shots (the files stay in `public/shots/`), the Game page and Up next shots, and two questions ("Where does the data come from?" and "Who is behind it?").

### The hero's two phones, and the finder illustration

The hero carries the thesis, so its phones are the subline's two halves: behind, turned 5 degrees, the compare screen ("this one or that one", how Verso learns); in front, a live illustration of the ask in plain words ("tells you what's worth your evening"). The illustration went in the hero rather than under How it works because the hero is the vision's place on the page, in the present tense of intent, while How it works describes the beta as it is and keeps the real Ranking screen.

The illustration (`finder-mock.tsx`) is drawn in the DOM on the tokens: Inter, the app's light palette read from `@verso/tokens` (so it stays light in dark mode, like the screenshots), its radii and type ramp, in the app's points through `--pt`, one point of the 402 pt screen. "What do you want to play tonight?", the answer "something calm, about two hours" typed in a field, "Three from your list", and three picks with a one-line reason each: Outer Wilds, Stardew Valley and Portal 2. It is an illustration of what Verso is built to do, not the app's design: the finder is designed in Figma in wave C, and nothing in the code or the copy calls this its design. Nothing on it says it ships today; it says where the picks come from ("from your list"); screen readers hear one label describing it as an illustration.

Two choices on the sample content, flagged: the Portal 2 reason was proposed as "two hours exactly", but its story runs far longer than two hours, so the draft says "two hours gets you a few chapters" (rule 9, no invented number); and the picks carry no cover art, because the three covers are not in the repository and downloading IGDB art for a page is Rafa's call, so the cards lead with the title and the reason.

### The thesis in the copy

Added mid-round from Rafa's sentences in the site brief ("The thesis, in Rafa's words"); every line below is a slot built from his words, his to sign.

| Where | Draft | From his sentence |
|---|---|---|
| Hero line | "In an age of AI, your time is the scarce thing." | "In an age of AI, the most valuable resource is human time." |
| Hero subline | "Verso is a recommendation engine that works for you: it learns your taste the way you'd tell a friend, this one or that one, and tells you what's worth your evening." | "It's a recommendation engine that uses AI to work for you and ingests data in the way that's most natural to you, which is the Beli-style ranked-choice app." |
| Card 1 | "Your time is the scarce thing": the hours you get to yourself are the thing worth protecting | The first sentence, and "when you do have time to yourself" |
| Card 2 | "Let the AI sit through the bad one": an AI can read the whole book or watch the whole film with your taste in mind, before you spend ninety minutes finding out | "An AI can read an entire book with your perspective and see if you would like it", and "forty minutes to an hour and a half of a shitty movie" |
| Card 3 | "Taught the most natural way": this one or that one, one pick at a time; the ranking you build is how it learns your taste | "Ingests data in the way that's most natural to you, which is the Beli-style ranked-choice app" |
| Card 4 | "Never sold": your list is yours, no ads, never sold, free or paid | Decision 21, not his sentence |
| Step 3 | "Ask what tonight and get three picks from your own list, each with the reason in your terms." | The beta as it is (decision 24), echoing the thesis |

Two tenses, kept apart: the hero and the strip are what Verso is built to do, and the strip's heading says so ("What Verso is built to do"); How it works and the questions are the beta as it is. No line says the beta reads whole books today. Card 2's heading was proposed as "Let the AI watch the bad one for you"; "for you" is out (onboarding principle 13), so the draft says "sit through the bad one". The subline keeps "works for you", his own thesis phrase, the engine working on your behalf rather than a claim about the picks; it is his to keep or cut.

### Scroll height

`document.documentElement.scrollHeight`, headless Chrome, 2026-10-07:

| Page | 1440 × 900 | 390 × 844 |
|---|---|---|
| Unisound (the ceiling) | 5743 | 6763 |
| Round one | 9410 | 10533 |
| **Round two** | **4020** | **4706** |

No horizontal scroll at either width (`scrollWidth` equals the viewport).

### Deviations and what was not done

1. **The strip has a visible heading,** "What Verso is built to do", a slot. The brief named the four cards but no heading; every other section has one, and this one also marks the strip as intent rather than the beta's present.
2. **The hero's buttons stack full width below 480 px,** where the two do not fit one row.
3. **The movies slot is a phone** whose screen says "Movies, screens coming with the beta" on `bg/surface`, its icon on `bg/placeholder`, the app's fill for an empty slot; its text is set larger than the app's type so it reads at the strip's 200 px.
4. **The status bar and home indicator are drawn over the screenshots,** which have a blank band where the status bar goes; nothing in a frame is covered.
5. **The shots are still 1x.** Asked for 1748 px, Figma's MCP screenshot returns the frame at its own 402 × 874, so the phones' screenshots stay slightly soft on a retina display; a 2x export from Figma's export panel is the fix. The finder illustration is DOM, so it is sharp at any size.
6. **The favicon** still 404s; it waits on the logo.

## The tokens, and where the site departs from them

Every color is a token from `packages/tokens/tokens.json`, through the utilities `theme.css` generates, in light and dark by `prefers-color-scheme`.

- **The brand** (round four, decision 29) is two variables in `globals.css`: `--color-accent`, the `#006822` fill under a white label in both schemes, and `--color-accent-text`, brand text, icons and marks, equal to the fill in light and `#009B37` in dark ("Round four", the table of what reads which). They move into the tokens when the app adopts decision 29. No medium carries a color on the site. The filled button's hover, `--color-accent-hover`, is derived from the fill (mixed 14% toward the text color), not a new color.
- **Surfaces** are `bg/canvas` and `bg/surface`; hairlines are `border/separator`; the movies slot's icon well, the covers' fill while they load and the ask's waiting send button are `bg/placeholder`. Scene 2's divider and score pills are the app's `tier/loved` with `tier/label` text, as on the Ranking screen.
- **Inside the hero phone** the ask carries the brand, not a medium color (round four): the fill for the send button, the mark color held at its light value for the chip's icon, the caret and the pick numbers.
- **A phone's screen** carries the tokens' light values (`lightTheme.colors` through `CSS_VARIABLES`, from `@verso/tokens`) in both color schemes, because the screenshots it holds are light.
- **The filled button** is the brand fill with a white label in both schemes, 7.0:1 (round four). Rounds one to three used `bg/canvas` for the label on the games green, about 3.7:1 in light and black on green in dark; decision 29 fixed both ([../../docs/research/brand-color.md](../../docs/research/brand-color.md)).

Departures, each on purpose:

1. **The hero size.** The ramp tops out at the large title, 34 px, a phone screen's title. Every reference sets its hero at 56 to 96 px at desktop, so the hero is 36 px at phone width and grows to 56 px from 1024 up (`--text-display`, a `clamp()`), in Inter's Display cut at weight 600 and -0.025 em (round two; round one had the ramp's 700). Section titles stay on the ramp: title 1 at phone width, the large title from tablet up.
2. **The phone's shadow and metal.** The tokens have no shadow and a device is not a palette color, so these are the site's literals, in one block of `globals.css`: the shadow in black, four layers peaking at the app's `Cover` opacities (0.18 in light, 0.5 in dark, rule 30), with a 10% white ring in dark; the titanium edge and buttons as a gray gradient; the bezel near-black. They do not flip with the color scheme, as a phone does not.
3. **Tracking on headings,** from Inter's curve above. The app sets none; Inter at 56 px without it reads loose.
4. **The angled phone's thickness and glare** (round three): ten slice shades from `#6e6e73` to `#2c2c2e`, the device's metal like the titanium edge, and a sheen of white at 16% on the glass; the floor shadow is black at 30% under a blur. Device literals, not palette colors.

## How the shots are drawn

The phone frames (Fidelity round page, light) carry real covers and are the product shots. Since round two each sits whole in a CSS phone (`phone.tsx`, described under "Product shots, in phones"), at the screen's own 402 × 874 ratio, so nothing is cropped (rule 29). On the page since round three: Home, Search, Compare and Ranking in the strip's games side only; the hero's phone holds the drawn ask, and How it works draws its scenes. Since round four the scenes and the hero's picks use Steam's and TMDB's art at full size (`src/content/art.ts`), not crops of these frames, and the strip's movies side shows the movies Home (143:173, recolored by value, "Round four") and four slots until wave B builds the movie screens. The desktop frames (Web round page) are off the page; their files stay in `public/shots/`.

Figma renders a node at its own size and does not upscale, so the phone frames are 1x (402 × 874). Their screens are shown at about 190 to 250 px wide, so on a retina display they are slightly soft. A 2x export (Figma's own export panel, or `exportAsync` at scale 2) is the fix.

The Game page and Up next frames predate decision 26 (ownership out) and still show "I have this game" and "Owned only"; neither is on the page since round two.

## The copy

Every string lives in `src/content/copy.ts` (and the shot captions in `src/content/shots.ts`), each with a comment saying whether it is a **Slot** (plain product copy standing in for Rafa's sentence, which he replaces, per the voice rules) or a **Fact** (a name, a credit, a link, a label a rule requires). `grep -c '// Slot' src/content/*.ts` counts the slots.

## Round one (2026-10-07, afternoon), for the record

Round one's research and layout, as written then. Where round two differs (the libraries, the layout, the motion), round two wins.

### What reads as clean in 2026

Researched 2026-10-07, about 30 minutes: the six reference sites opened in headless Chrome at 1440 wide and measured, plus the sources linked below.

1. **One idea per screen, then breathing room.** Evil Martians' study of more than 100 developer-tool landing pages found two rules on nearly every page, "no salesy BS" and "clever and simple wins", and that most pages skip flashy interaction for solid type, a clear layout and space ([Evil Martians, 2025](https://evilmartians.com/chronicles/we-studied-100-devtool-landing-pages-here-is-what-actually-works-in-2025)). Measured section padding: Linear 128 px, Resend 96 px, Unisound 80 to 112 px. The site uses 96 px at phone width and 128 px from desktop up.
2. **A centered column with a max width.** Almost every page in the same study uses one; edge-to-edge layouts are rare. The site's column is 1100 px of content.
3. **Large type on a tight ramp.** Hero sizes measured: Linear 64 px at weight 510 with -0.022 em tracking, Vercel 64 px, Raycast 64 px, Cal.com 64 px, Unisound 60 px at -0.03 em, Resend 96 px (a serif). Below the hero, few sizes: a section title, a body, a caption. Inter's own tracking curve (`a + b·e^(c·size)`, a = -0.0223, b = 0.185, c = -0.1745, from [Inter's dynamic metrics](https://d.rsms.me/inter-website/v3/dynmetrics/)) gives about -0.022 em at 34 px and up, -0.017 em at 20 px, which is what the headings use.
4. **Real product over illustration.** Linear's hero is its own app; Cal.com's is a live booking widget; Unisound's is its dashboard in a plain browser frame. The study lists six hero visuals, from animated UI to abstract illustration, and the product-led ones dominate. Verso's are the Figma frames, labeled as design until real screens exist (site brief, "What it waits on", 4).
5. **One accent.** Linear, Vercel, Raycast and Resend are grayscale with a single brand color used sparingly; Unisound's one color is its logo and its links. The site is the tokens' grayscale with one accent variable.
6. **Restrained motion.** The same study found typography and breathing room put ahead of animation on most pages. The site has one fade-up on scroll and nothing else.
7. **No gradients or glass unless that is the brand.** Unisound's pastel wash and Resend's light streak are brand; Linear, Vercel and Cal.com are flat. Verso has no brand yet, so the site is flat.

What was refused from the references: Unisound's "AI-powered" eyebrow and its stat strip (Verso has no number yet, rule 9), testimonials and logo walls (none exist), Cal.com's sign-up-in-the-hero (the web is invite-only).

### The references, and what each does

| Site | Hero | Product shots | Borrowed |
|---|---|---|---|
| [linear.app](https://linear.app) | Left-aligned two-line headline, a one-line subline, the product UI full width below | Real app, edge to edge in a thin dark frame, no device | The left-aligned hero and the quiet subline; the 128 px rhythm |
| [cal.com](https://cal.com) | Split: headline and buttons left, the live product right, inside one white card on a gray canvas | The real widget, flat, hairline borders | The split hero with the product beside the text; the hairline-and-surface vocabulary |
| [unisound.io](https://unisound.io) | Centered headline, subline, one button, the dashboard below in a plain browser frame | Dashboard in a rounded frame with a soft shadow | The structure (the brief's choice): nav, hero, proof, three steps, features, FAQ beside its heading, the call to action in a surface panel, the footer |
| [resend.com](https://resend.com) | Left-aligned display headline, a two-line subline, two buttons, the second as plain text | Not studied past the fold | Two actions in the hero, the second visibly quieter |

Vercel and Raycast were looked at and not borrowed from: Vercel's hero is its logo, Raycast's is centered text over a dark field, and neither shows the product above the fold.

### Libraries, the minimum

| Need | Chosen | Why, and what was refused |
|---|---|---|
| Framework | Next.js 16.4 (App Router), `output: 'export'` | Decision 4 names it. A static export has no server to run or secure ([Next.js static exports](https://nextjs.org/docs/app/guides/static-exports)); the image optimizer, rewrites and headers are unavailable, which the site does not need |
| Styles | Tailwind v4 over `@verso/tokens/theme.css` | The app's own setup, so every utility is a token and the brand color is a value swap |
| Font | Inter through `next/font/google` | Downloaded at build time and served from the site: no reader's browser asks Google for anything (onboarding guidelines, principle 12). One variable file covers 400 to 700 |
| Icons | `lucide-react` | The app's set (`lucide-react-native`). Two icons: the arrow on "See how it works" and the FAQ chevron |
| Button | Written here, about 40 lines | shadcn/ui's Button is cva plus clsx plus tailwind-merge, and it styles from shadcn's own variables (`--primary`, `--background`, `--ring`, [shadcn theming](https://ui.shadcn.com/docs/theming)) that would have to be mapped onto the tokens. Two variants do not justify a theme layer |
| FAQ | Native `<details>` and `<summary>`, styled from tokens | Keyboard and screen-reader support built in, works with JavaScript off, find-in-page reaches closed answers in Chromium. A Radix accordion would add a dependency and the shadcn variables for no visible gain |
| Fade-up on scroll | An `IntersectionObserver` and a CSS transition, about 30 lines (`reveal-on-scroll.tsx`) | Motion's `motion` component cannot tree-shake below 34 KB; `LazyMotion` with `domAnimation` is 4.6 KB plus 15 KB ([Motion docs](https://motion.dev/docs/react-reduce-bundle-size)). CSS scroll-driven animation (`animation-timeline: view()`) needs no script, but Firefox still ships it disabled by default ([caniuse](https://caniuse.com/mdn-css_properties_animation-timeline_view)). One reveal is not worth either. Motion stays the upgrade if the brand round asks for choreography |
| Images | Plain `<img>` over WebP files in `public/shots/` | The static export has no optimizer; the files are encoded once, lossless (text in a 1x screenshot blurs under lossy), 14 to 84 KB each |

No component kit, no analytics, no third-party script, no font from anywhere but `next/font`. CI fails the build if a page loads a script from another host or a font from Google at runtime.

`next dev` writes an `AGENTS.md` into the package when it sees a coding agent; `agentRules: false` turns that off. The version-matched Next.js docs it would point at are in `node_modules/next/dist/docs/`.

### Layout

- Column 1100 px with a 24 px gutter, 16 px at phone width; no horizontal page scroll at 390.
- The nav is sticky on the canvas and gains a `border/separator` hairline once the page scrolls; at phone width the two section links fold away.
- Hero: text left, the compare shot right from 1024 up; stacked below.
- How it works: three columns from tablet up, on a subgrid so the three media panels share a height.
- Vision: four sections alternating text and image, the images on `bg/surface` panels.
- The product: a `bg/surface` band; six phone shots three across from tablet up, and a row that scrolls sideways inside the column at phone width, so six screens do not stack into 3,000 px; the desktop shot below.
- FAQ beside its heading (Unisound's layout); About with the photo slot; the call to action in a surface panel; the footer.
- Focus: one 2 px ring in the accent, 2 px outside the edge, for the keyboard only (the app's `interaction.ts`). A skip link precedes the nav.
- Motion: the fade-up hides only what starts below the fold, does nothing under `prefers-reduced-motion`, and never hides anything without JavaScript. Smooth anchor scrolling is on only when motion is allowed.
