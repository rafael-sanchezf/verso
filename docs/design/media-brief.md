# Media brief: movies, TV, books

Written 2026-09-16 by the orchestrating session (Fable) at Rafa's request, ahead of V3. This is the structure round for the three media the switcher already draws: what each screen shows for a film, a series, and a book, and why. Grayscale frames are on the Figma page `Structure round · media` (https://www.figma.com/design/<figma-file-key>), one row per medium, a note above each frame. React the way the games rounds were reacted to: a letter per variant, a line per objection; silence means the default. The data-source research these calls lean on is in [../research/film-tv-data-sources.md](../research/film-tv-data-sources.md) and [../research/book-data-sources.md](../research/book-data-sources.md).

The rule that governs everything here is the roadmap's: the core is media-agnostic and only the enrichment differs. So the log flow, the tiers, the prompt, the Ranking list, Profile, Search's structure, the tab set, and the switcher are not redrawn. What is drawn is exactly where a medium differs: Home, the detail page, the Next tab, and the rows.

**Superseded in part, 2026-09-22.** Rafa's reaction to these frames: they reuse the games UI and swap the nouns instead of asking what each medium wants as its own product. The Movies section below is replaced by [movies-brief.md](movies-brief.md), written from the medium outward; the TV and Books sections are held until TV's ranking unit (season, episode, or show) is decided, and each gets its own brief when it returns. What stands from this document: the analog map's catalog and licensing calls (IMDb, TMDB, Wikidata, awards, availability, the imports), the data model notes, and the frames as reference. Rule 24 was rewritten the same day.

## The frames

Page `Structure round · media` (42:2). Notes sit above each frame. Detail pages that do not fit the fold are drawn at their full height, so the Show page and the two taller rows boards run past 874.

| Medium | Row y | Frames (node ids, left to right) |
|---|---|---|
| Movies | 120 | Home A · Tonight-led 42:81, Home B · List-led 43:94, Movie page 44:95, Next · Want to watch 45:85, Rows 46:66 |
| TV | 1160 | Home A · Show-led 55:97, Home B · Episode-led 56:104, Show page 57:94, Show · Seasons 58:62, Next · Want to watch 59:85, Rows 60:84 |
| Books | 2480 | Home A · Reading-led 48:94, Home B · Pace-led 49:80, Book page 50:67, Next · Want to read 51:90, Rows 52:95 |

Drawn 2026-09-16 by one Opus agent per medium from the kit and brief in [figma-kit/](../private/design/figma-kit/README.md); the orchestrating session drew Movies Home A to set the pattern and reviewed every frame. Judgment calls the agents made where this brief was silent (extra sample titles, a 28-point "Seasons" title, small white buttons inside surface cards, the Watching header saying "See all") are conventions, not decisions, and can be reversed on the frames.

## What stays the same across media

- One ranked list per medium, the four tiers with the same names (Loved it, Liked it, It was fine, Didn't like it), binary-search insertion, the confirm step, "Which did you enjoy more?" and the genre variant of the prompt. Nothing about ranking knows the medium except the genre vocabulary.
- Tabs: Home, Search, Ranking, Next, Profile, with the medium's icon set. Search is still for finding a specific thing; discovery lives on Home.
- Search rows, Ranking rows, and Next rows keep their shape (cover, title, two meta lines, one trailing control). Only the meta lines and the trailing control change.
- Every score carries its source (rule 21). Nothing is shown when the source has nothing (rule 20). No number is ever invented (rule 9).
- The statuses are the same four in the data (queued, in progress, done, dropped) with per-medium labels (rule 18). A medium may hide one of them in the UI; movies hide the in-progress one.

## The analog map

The games screens were designed around a handful of facts. Each has an analog in the other media, or deliberately none.

| Games | Movies | TV | Books |
|---|---|---|---|
| Playing (in progress) | hidden; a film is one sitting | Watching, with a season and episode pointer | Reading, with a page pointer |
| Backlog | Want to watch | Want to watch | Want to read |
| Played / Dropped | Watched / Didn't finish | Finished / Dropped | Finished / Didn't finish |
| "I finished this" | "I watched this" | "I finished this" | "I finished this" |
| Ownership by platform (rule 19) | none; availability replaces it | none; availability replaces it | ownership by format: paper, ebook, audiobook, library |
| Platforms row on the page | Where to watch: streaming providers, yours marked | Where to watch | Formats, yours marked |
| "Owned only" filter on Next | "On my services" | "On my services" | "Owned only" |
| Time to beat | Runtime | Episodes × runtime, "~25 h" total, plus per-episode | Pages and a reading estimate, "245 pages · ~4.5 h" (median page count across editions × 1.1 min) |
| Upcoming: unreleased games by date | unreleased films by theatrical date; streaming dates for films already out | unreleased shows, next seasons, and next episodes | unreleased books, including the next book in a series you are reading |
| Developer | Director | Creator, network | Author |
| Search disambiguator: platforms | year and director (remakes) | years and season count | author and year |
| Critics: Metacritic / OpenCritic | Rotten Tomatoes, only if a licensed or open source exists (see research) | same | none exists; awards carry that weight |
| Players: Steam phrase / IGDB | TMDB user score, labeled TMDB | TMDB | Hardcover's average, labeled "Hardcover" with its rating count, hidden under about 100 ratings; never Goodreads, Amazon, StoryGraph, or Google Books |
| Steam concurrent players | none in this round | none | none |
| Awards: none drawn (The Game Awards could join later through the same path) | Oscars, BAFTAs, Golden Globes: wins and nominations | Emmys, Golden Globes: wins only, nominations hidden (Wikidata undercounts them) | Booker, Pulitzer, Hugo, Nebula, National Book Award, Women's Prize |
| Steam import of playtime | Letterboxd CSV (exact TMDB ids, watched dates, rewatches); Trakt as an optional import, VIP account required since 2026-08 | Trakt (per-episode history); TV Time closed 2026-07 and is no import path | Goodreads and StoryGraph CSV |
| Cover 3:4 | Poster 2:3 | Poster 2:3 | Cover fit into 2:3 on `bg/surface`, never stretched |

Decisions embedded in the table, each dated 2026-09-16:

1. **IMDb ratings are not drawn.** Confirmed by the research: IMDb's datasets are for personal, non-commercial use and its licensed API is priced for enterprises, and OMDb holds no license for the numbers it relays. The user score for film and TV is TMDB's, labeled "TMDB", suppressed under a vote threshold; the page links out to IMDb through the id TMDB carries. Rotten Tomatoes and Metacritic numbers exist for roughly one film in ten on Wikidata (P444 with the source as a qualifier), CC0, and are shown labeled "Rotten Tomatoes" with a caption "via Wikidata, as of {date}" under the score line, no RT branding; the audience score is too sparse and is not shown. If Rafa wants IMDb while the app is his alone, the non-commercial dataset can fill the slot, but it must leave before the first store submission.
2. **Awards are a fact, not a score.** They get their own line on the detail page, "Won 6 Oscars · 10 nominations ›", with the categories behind the tap, and they are hidden when there are none (absent data and zero awards are indistinguishable, so never a zero). Source: Wikidata, keyed by the TMDB or Open Library id, refreshed by the mirror; the query has to read both the work's statements and the people's statements qualified "for work" and deduplicate by category, or Best Picture counts once per producer. Films get wins and nominations; series get wins only, "Won 2 Emmys ›", because Wikidata's Emmy nominations are mostly missing. Awards never enter the ranking.
3. **Availability replaces ownership for film and TV.** "Where to watch" comes from TMDB's watch providers for the user's region; the user's own services are a setting (a provider list in Profile, Settings), and the providers you have are marked. There is no "I have this film" in this round; digital purchases and discs are a later ownership fact if anyone asks for it.
4. **Books keep ownership, by format.** Paper, ebook, audiobook, library loan. Same rule 19, same "I have this book" row, formats instead of platforms.
5. **TV is ranked as a show, tracked by episode.** One ranking entry per series; progress is stored per episode (season 0 specials excluded) and shown as a pointer, "S2 · E5 of 10", with "mark season watched" and "watched up to here" writing the episode rows underneath, because nobody taps sixty checkboxes; "Up to date" is derived (every aired numbered episode watched and no next episode scheduled), never a status the user sets. A miniseries drops the seasons screen and the returning/ended line and reads like a film. Re-ranking a show after a new season is a re-insertion (remove, then the comparisons again; the comparison log keeps both). Ranking seasons within a show is a later idea.
6. **Movies have no in-progress state on screen.** A film is watched in a sitting; the queue and the log are enough. The data keeps the status so a half-watched film can be modeled later.
7. **Every medium's time figure is one number.** Runtime, total watch time, reading estimate: one figure in the row and on the page, with the detail (per-episode runtime, pages, audiobook length) behind a tap, the same treatment as "~25 h ›" for games.

What the film and TV research added, beyond the table (2026-09-16, [../research/film-tv-data-sources.md](../research/film-tv-data-sources.md)): TMDB's terms cap any cached copy at six months, so the mirror needs a `refreshed_at` and a re-fetch job, and they require the TMDB logo with the exact sentence "This product uses the TMDB API but is not endorsed or certified by TMDB" in a static place (Settings, About, beside the IGDB credit); a paid tier needs a written TMDB license first. Every availability row carries "Streaming data by JustWatch" and links to TMDB's watch page, since no deep links exist. Certification is blank when the user's region has none (rule 9). The next-episode line reads "No date announced" when a returning show has none. Total watch time is "about" and is not shown when no episode has a runtime. Anime numbering and split cours are a known limitation, documented and not half-solved.

## Movies

Sample data in the frames: Dune (2021), Past Lives, Oppenheimer, The Holdovers, Anatomy of a Fall, Dune: Part Three (unreleased).

### Home, two variants

**A · Tonight-led** (default). Three blocks. *Tonight*: one hero card with the pick, the top film in Want to watch that is on one of your services or in theaters; poster, title, "2021 · 2 h 35 · Netflix"; "Another" in the block header reshuffles; when nothing on your list is available, the pick is the top of the queue with "Rent · Apple TV" or "Not streaming". *Want to watch*: the numbered cards that slide sideways (Up next B), subtitle = availability. *Coming up*: date-led rows, "OCT 22 · Dune: Part Three · In theaters" and "DEC 3 · Anatomy of a Fall · Streaming on Hulu". Why: Rafa's own held decision was that a movie home leads with suggestions; a film is chosen in the moment, and "what is on the services I pay for, tonight, in the time I have" is the question. This is the suggestion feature in its smallest useful form, filtered by your list and your services, no recommendation engine.

**B · List-led.** *Want to watch* as a hero plus two small tiles (the Playing A layout), availability as the subtitles; *Coming up* as in A; *Recently ranked*: your last three placements with the score badge, so a medium with no in-progress state still has a payoff on Home. Why draw it: B needs no provider data or settings and is the honest fallback if "your services" is not ready when movies ship.

### Movie page

Compact header (Game B, decided): poster 2:3 at 100 wide, title 24 bold, then three meta lines: "2021 · 2 h 35 · PG-13", the genres, the director. Score line: "94% Rotten Tomatoes · 7.9 TMDB", "You 8.7" once ranked. Awards line under the scores, hidden when none. Actions: "I watched this" (primary, medium color) and "Want to watch". Status line: "Watched Sep 2 · Change" or "On your list since Aug 30". *Where to watch*: provider chips, the ones you have outlined, then "Your services: Netflix, Max ›" and a JustWatch credit in caption size. *Details*: Released (theatrical), Streaming since (digital date), Runtime, Studio, Part of (the collection, "Dune ›"), Added; the plus adds watched date, rewatch count, where you watched. *Cast*: three names with round placeholders, "See all ›". *About*: the overview.

### Next

Header "Up next", segments Want to watch | Upcoming, sub row "12 films · your order", "On my services" chip, Sort. Rows: poster, title, "2021 · 2 h 35", third line availability: "Netflix", "In theaters", "Rent · Apple TV", "Not streaming". The trailing control is a check ("I watched this", opens the tier sheet), not a play button, because starting a film is not a state; the drag handle stays. Upcoming rows are date-led with the date's kind: "In theaters Nov 19", "Streaming Dec 3".

### Rows

Search row: poster, "Dune", "2021 · Denis Villeneuve", trailing plus; the director disambiguates remakes. Ranking row: rank, poster, "Dune", "2021 · Sci-fi", score badge. Compare card: poster, title, "2021 · 2 h 35". Add-to sheet: Want to watch, I watched this; no "Watching now".

## TV

Sample data: Severance, The Bear, Shōgun, Andor, Slow Horses, The Pitt.

### Home, two variants

**A · Show-led** (default). *Watching*: a hero with the poster, title, "S2 · E5 of 10 · Apple TV+", a progress bar, and the next episode as a line with a check ("Next: E6 · 48 min"); two small "Also watching" tiles with their pointer. *Up next*: the want-to-watch queue, numbered, "3 seasons · Netflix". *Coming up*: date-led rows of what airs next for shows you watch and premieres you wait for: "THU 18 · Severance · S3E4 · Apple TV+", "JAN 2027 · The Bear · Season 5". Why: parity with games, and the show stays the unit you rank.

**B · Episode-led.** *New episodes* first: a checklist of aired, unwatched episodes across your shows ("Severance · S3E4 · 52 min", a circle to check), three then "See all"; then *Watching* (hero and tiles); then *Up next*. Coming up folds into New episodes with future dates grayed. Why draw it: this is how TV Time and Trakt users live, by the episode, and it suits people following many airing shows. The cost is that the show recedes.

### Show page

Header: poster, title, "2022– · TV-MA · Apple TV+", genres, creator. Scores: "97% Rotten Tomatoes · 8.4 TMDB", the Wikidata caption under it. Awards: "Won 2 Emmys ›", wins only (decision 2). Actions: "I finished this" and "Want to watch". *Progress* card (the TV-specific block): "Season 2 · Episode 5 of 10", bar, "Next: E6 · Attila · 48 min", "+1 episode" and "Seasons ›"; an "Up to date" badge when the pointer is at the last aired episode. *Where to watch* as for movies. *Details*: First aired, Status ("Returning · next season 2027" or "Ended 2019"), Episodes ("19 · ~48 min · ~15 h total"), Network, Added; the plus adds started, finished, rewatch. *Cast*, *About*.

### Seasons screen

Pushed from "Seasons ›". One row per season: "Season 1 · 9 episodes · 2022 · 9/9 ✓", "Season 2 · 10 episodes · 2025 · 5/10" with a bar, "Season 3 · airs 2027" grayed. The current season is expanded: episode rows "6 · Attila · 48 min" with a check each; "Mark season watched" at the bottom of the expanded season. Specials (TMDB's season 0) sit last and never count toward "Up to date".

### Next

Segments Want to watch | Upcoming, "8 shows · your order", "On my services", Sort. Rows: poster, title, "3 seasons · 30 ep · ~25 h" (the total is TV's time to beat), availability on line three; the trailing play button starts the show (Watching, S1E1); drag. Upcoming: date-led premieres, both unreleased shows and next seasons of shows on any of your lists, "OCT 3 · The Bear · Season 5 · FX".

### Rows

Search row: "Severance", "2022– · 2 seasons". Ranking row: "Severance", "2022 · Drama", badge. Watching row: progress bar and "S2E6 · 48 min" with a check. Episode row: number, title, runtime, check. Compare card: poster, title, "2022–". Add-to sheet: Want to watch, Watching now, I finished this.

What the book research added ([../research/book-data-sources.md](../research/book-data-sources.md), 2026-09-16): Open Library is CC0 with monthly dumps, so the mirror can be as full as the catalog sync wants (IGDB-style) rather than search-only; Hardcover's GraphQL API supplies what Open Library cannot (series position with a denominator, audiobook length, which formats exist, the community rating), and its terms allow aggregate data when labeled as Hardcover's; Google Books is out, its terms forbid charging users and reordering results. Awards need an allowlist of prize categories (Wikidata's "award received" is polluted with lists like NPR's top 100), a branch that follows the author's items, and the shortlist-versus-longlist qualifier. Goodreads' CSV export keeps one read date and a read count, so re-reads import as a count without dates.

## Books

Sample data: Piranesi (Susanna Clarke), The Name of the Wind, Tomorrow, and Tomorrow, and Tomorrow, Project Hail Mary, Demon Copperhead, The Doors of Stone (unreleased, book 3 of a series). Import, the Steam analog for books: Goodreads CSV first, StoryGraph CSV second, as uploaded files.

### Home, two variants

**A · Reading-led** (default). *Reading*: hero with cover, title, author, "p. 112 of 245 · 46%", a progress bar, "Update" as the trailing action; two "Also reading" tiles with their page. *Up next*: numbered queue, "245 pages · ~4.5 h". *Coming up*: date-led, unreleased books on your list and the next book in a series you are reading: "OCT 14 · The Doors of Stone · Book 3". Why: parity; people do read two or three books at once, so the also-reading tiles earn their place more than they do for games.

**B · Pace-led.** The same three blocks, but the Reading hero leads with pace: "112 of 245 · ~40 pages a day · done by Oct 3", and "Update progress" is the card's one control; the third block is *Next in series* (series you have started, with the next unread book and an Add) instead of Coming up. Why draw it: pace is the one thing every reading app shows and games have no equivalent for; Next in series is the books-specific "coming up". If Rafa likes the pace line but not the block swap, it folds into A's hero.

### Book page

Header: cover fit into 2:3, title, the author as the first meta line in `text/primary` (the author is the fact that matters most for a book; the developer is not for a game), then "2020 · 245 pages · ~4.5 h", genres, and a series line "Book 1 of 3 · The Kingkiller Chronicle ›" when it applies. Score line: "4.2 Hardcover" with a caption "1,203 ratings on Hardcover", the one community rating a published app may show (Hardcover allows aggregate data when it is named as theirs; Goodreads, Amazon, StoryGraph, and Google Books are all closed), hidden under about 100 ratings; Open Library's own ratings are too thin to use. Awards: "Won the Women's Prize 2021 · Hugo finalist ›". Actions: "I finished this" and "Want to read". Progress line while reading: "Reading · p. 112 of 245 · Update". *Formats*: chips Paper, Ebook, Audiobook ("Audiobook · 7 h 12" when the length is known), the ones you own outlined, then "I have this book · Kindle ›". *Details*: Published, Pages, Publisher, Added; the plus adds started, finished, the format you read it in, re-reads. *About*: the description. "More by the author" is a later block.

### Next

Segments Want to read | Upcoming, "9 books · your order", "Owned only", Sort. Rows: cover, title, author, "245 pages · ~4.5 h · Kindle", third line "Added Aug 30" or "Not owned"; play starts reading; drag. Upcoming: date-led.

### Rows

Search row: cover, "Piranesi", "Susanna Clarke · 2020", plus. Ranking row: "Piranesi", "2020 · Fantasy", badge. Reading row: progress bar and "p. 112 of 245". Compare card: cover, title, author. Add-to sheet: Want to read, Reading now, I finished this, then "I have this book" with the formats as toggles.

## Data model notes for the roadmap

- `medium` gains `book`. `entry_status` values are the games words (`backlog`, `playing`, `played`, `dropped`); before V3 they are renamed to the generic set (`queued`, `in_progress`, `done`, `dropped`) in one migration, while the data is one person's, so a film row never reads "played" in an export. The app labels them per medium.
- `movie_details`: tmdb id, runtime, certification (per region), directors, writers, top cast, genres, collection, release dates by kind (theatrical, digital), studio, overview, poster and backdrop ids. `tv_details`: tmdb id, status, first and last air dates, networks, creators, genres, seasons (number, episode count, air date), episode runtime, next episode to air. `book_details`: Open Library work id, primary ISBN-13, authors, page count, publication date, publisher, series and ordinal, subjects, description, cover id, formats known to exist.
- `user_entries` gains a progress pointer (season and episode for TV, page for books) and `owned_formats` for books beside `owned_platforms`; a later cleanup can merge the two into one per-medium column.
- New: an `awards` table (media item, award, category, year, result won or nominated, Wikidata id, fetched at); an `episode_progress` table (user, media item, season, episode, watched at) under the pointer; a user settings row (region from day one, streaming provider ids); `external_scores` sources `tmdb`, `rotten_tomatoes` (with the route it came by in metadata), and the book source the research names. Watch providers per item and region, refreshed on a schedule.
- The catalog's backend half for film and TV is designed and built in [film-tv-catalog.md](film-tv-catalog.md) (2026-09-16, from this brief and the research); nothing there decides a screen.
- Catalog scope: TMDB has over a million films and the Open Library over forty million editions, so the mirror carries a popularity-thresholded core (TMDB's daily id exports and popularity; Open Library's reading-log counts) plus every item anyone has touched, and search misses are fetched on demand through an Edge Function that writes into the mirror. Both licenses allow the mirror (TMDB with a six-month refresh ceiling, Open Library as CC0). The app still never calls TMDB, Open Library, or Hardcover directly.
- The `Cover` primitive takes a per-medium ratio (3:4 for games, 2:3 otherwise) and fits book covers on `bg/surface`.

## Questions for Rafa, with the defaults

1. Movies Home: A (Tonight-led) or B (list-led)? Default A.
2. TV Home: A (show-led) or B (episode-led)? Default A.
3. Books Home: A (reading-led) or B (pace-led)? Default A, with B's pace line folded into A's hero if you like it.
4. IMDb left out for licensing, TMDB's score labeled TMDB in its place; Rotten Tomatoes only through a source the research clears. Agree? Default yes.
5. TV ranked as a show, progress by episode, "Up to date" derived. Default yes.
6. No in-progress state for movies on screen. Default yes.
7. "Up next" as the Next header in every medium, or a verb per medium ("Watch next", "Read next")? Default "Up next".
8. "My streaming services" as a Profile setting, region included. Default yes.
9. Rename the four status values to generic words before V3. Default yes.
10. Awards phrasing, "Won 6 Oscars · 10 nominations ›", and the award set per medium in the analog map. Default as written.
