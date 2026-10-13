# Import from Letterboxd

Coded from conventions on 2026-10-01, not drawn: Rafa asked for it built, and the screen is a pushed settings-style page plus the batch session's review rows. Rebuilt on today's main on 2026-10-12 (VER-43) under rule 35 and ROADMAP.md decision 35. A Figma pass is his call; if one happens, this file follows the frame.

Route: `app/import/letterboxd.tsx`, pushed from Settings → Data → "Import from Letterboxd", with the stack header titled "Letterboxd". Components in `src/screens/letterboxd/`.

## The rule it keeps

Watched is not ranked (rule 35). The default import marks every matched film watched and writes each watched date as a diary row (`watch_log`); it ranks nothing, and the films wait in the Ranking banner's drain (`played_not_ranked`). A Letterboxd rating is not a comparison, so ranking from the stars is a choice the user makes on the review screen: the whole draft is shown, can be dragged, and is written only on its own confirm (decision 35).

## States

**Pick.** Title "Bring your films over", one paragraph on what will happen (watched with the diary by default; the stars can place them as a draft you check), a `bg/surface` card with three numbered steps (export from Letterboxd, open the zip in Files, choose `ratings.csv` and `diary.csv`), the primary button "Choose files", and under it, 13 `text/secondary`: "Nothing is saved until you confirm on the next screen." The picker allows several files. A failure to read (not a Letterboxd file, no films) returns here with an `ErrorLine` above the button.

**Reading.** The same page with three skeleton rows and "Matching your films to the catalog…" in place of the button. Reads only: the files, four `tierList('movie', …)` calls, `matchLetterboxdFilms` in batches of 200.

**Review.** Title "Look right?", the headline for the choice as it stands ("42 films to mark watched · 2 not found", or with ranking on "40 films to rank · 2 watched, unrated · 2 not found"), a line with how many watches go into the diary, and one 12pt line per file picked saying what it was. When any film has a rating, a `SegmentedControl` with "Mark watched" (selected by default) and "Rank from my stars", and a 13pt line under it saying what the selected segment does. With ranking on, the draft list follows. Then up to three sections of titles, each with a one-line hint: "Marked watched" (or, with ranking on, "Watched, not ranked"), "Not in the catalog", "Already in your ranking" (twelve titles shown, "and N more"). The footer never scrolls: primary "Mark N films watched", or with ranking on "Confirm ranking and import N films"; secondary "Cancel" (back to Pick, nothing written; with ranking on and a film moved, the native alert "Discard this import?" first). A failed write shows an `ErrorLine` above the buttons and stays on Review so the confirm can be tried again.

**Done.** An `EmptyState` card: "N films marked watched" or "N films ranked", the body saying that watched films wait to be ranked, how many watches went into the diary, and how many were not found; a "Done" action pops the screen.

## The draft list

`ReviewList` draws its rows as the batch session's review does (`screens/onboarding/session/review-rows.tsx`), with the Ranking tab's drag across tier lines: all four tier dividers (`TierChip` and a hairline) are present even when empty, so a film can be dropped into any tier. An imported row: rank, 40pt poster, catalog title, "2021 · ★★★★½", the row on `brand/text` at 12%, and the `≡` handle, the only place a drag starts. Until the user moves it, its score reads "≈ 8.4" (the stars placed it, written as `placed_by = 'prior'`); once dragged it shows the `ScoreBadge` (written as 'user'). When the match was fuzzy and the titles differ, a 12pt third line "In your file as “…”". An existing row: no fill and no handle, "already ranked" in place of the stars; it moves when an import lands around it and cannot be picked up. VoiceOver gets "Move up" and "Move down" on imported rows, which step across a tier line as a drag does. Ranks and scores recompute on every drop.

## Data

- `foldFilms(readLetterboxdFile(...))` in `@verso/core`: one film per Letterboxd URI, latest rating, every watched date, rewatches.
- `proposeRanking` in `@verso/core`: stars doubled into `TIER_BANDS`; ties by last watched date, then title; existing films keep their order and imports slot in by score, the earned place winning a tie.
- `matchLetterboxdFilms` in `@verso/api`: `match` is 'tmdb', 'title', 'fuzzy' or null.
- `applyLetterboxdImport` in `@verso/api`: every film with its outcome; `tiers` null by default, or the whole movie order as dragged plus `moved` when the user chose to rank. The database refuses a 'ranked' film without an order. After it: `invalidateAllEntries`, `['ranking']`, `['tier']`.
- Watched dates: one `watch_log` row per date the user's diary does not already hold for that film, so importing the same export twice adds nothing. The diary's trigger marks the entry played (a dropped film included, as logging a watch does), mirrors `finished_at`, and clears a `planned_on` the watch reached. A film with no date is marked played with no diary row.
- A film the user already ranked is skipped whatever the file says; a second file row resolving to the same catalog film is skipped too.

## Open

1. The Ranking tab and its banner read games only, so the imported films wait in the movie drain (`played_not_ranked('movie')`) and a movie ranking chosen here is in the database, but neither shows on a tab until the movies round is coded.
2. The band mapping (4 stars is Liked) and the tie order are Rafa's to change; both are one function in `@verso/core`.
3. A film the catalog does not have is listed and dropped. The search-miss Edge Function (ROADMAP, M2) is the way to fetch it on demand.
4. The status rename (branch `status-rename`) restates every function that writes `played`; `apply_letterboxd_import` joins that list when it lands.
