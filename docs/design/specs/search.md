# Search and the add-to sheet

Frames `F · Search` (26:121) and `F · Search · add-to sheet` (26:189). Routes `app/(tabs)/search.tsx` and `app/add/[id].tsx` (a form sheet the shell registers). Owner: Search agent. Read [README.md](README.md) first.

**2026-10-07, ownership out (decision 26).** The add-to sheet's ownership row ("I have this game" and its chips, `setOwnedPlatforms`) left with ownership and Backlog's description is "Play it later": the option rows are the whole sheet, and the lines below that still name ownership describe what was there before.

## Search layout

- `ScreenHeader` "Search" with the `MediumChip`.
- Field row: side padding 16, bottom 16. The field fills the width: `bg/surface`, radius 12, padding 12 sides 10 vertical, row gap 8: the `search` icon 18 in `text/secondary`, a TextInput 17 with placeholder "Search games" in `text/secondary`. An inline field as drawn, not a navigation-bar search bar. Autocorrect off, return key "search", clear button while editing.
- Content column, side padding 16, gap 20.
- Idle (empty query):
  - "Recent" 13 semibold `text/secondary`; rows with vertical padding 12, gap 12: `clock` 16 `text/secondary`, the query 17 `text/primary`. Three shown.
  - "Popular" 13 semibold `text/secondary`. Frame says "Popular this week"; do "Popular", because no weekly signal exists and the label must not claim one (rule 9). Rows with vertical padding 10, gap 12: `Cover` 44 (radius 6); text column gap 2: title 16 medium, subtitle 13 `text/secondary` like "2025 · Switch 2, PC"; trailing add button: a `bg/surface` pill, padding 8 sides 4 vertical, with `plus` 18.
- Results (non-empty query, the "Search (behind)" layer of 26:189): the same row style, one per hit, replacing Recent and Popular.
- Tab bar.

## Search data

- `searchGames(client, query, { limit: 20 })`, debounced 250 ms, cached under `['search', query]`. Row subtitle: `{year} · {platforms}` from `SearchGameRow.year` and `.platforms`, falling back to the year alone, then the developer. `SearchGameRow` carries `cover_image_id` and `external_ids` (the latter since 2026-10-08); pass the row to `coverCandidates` as it is, so a hit IGDB has no cover for falls back to its Steam art.
- Recent queries: the last ten strings in AsyncStorage under `search.recent`, three shown. A query is stored when a result row is opened or an add happens, not on every keystroke.
- Popular: `popularGames(client, 5)` from `@verso/api` (the `popular_games` function, merged 2026-09-16: the most-rated games by IGDB's count, catalog columns only, readable signed out), cached under `['popular']` for the session. `PopularGameRow` carries `id`, `title`, `year`, `cover_image_id`, `external_ids`, `platforms`; pass the row to `coverCandidates` as it is. Until Rafa pushes the migration to the hosted project the call fails; show the section's skeleton, never an error, in that case.

## Search behavior

- Tap a row: push `/game/[id]` with `from: 'Search'`. Tap the plus: open `/add/[id]`. A game the user already tracks shows a `check` in place of the plus (not drawn; convention) and the sheet still opens so the status can change.
- Tap a Recent row: run that query.
- No results (`F · Search · no results` 38:1144, dark 39:1492; drawn 2026-09-16, awaiting reaction): the field shows the query 17 `text/primary` with a trailing `x` at 16 in `text/secondary` that clears it; the content column centers an `EmptyState` (bottom padding 120 so it sits above the true center): `search` icon, "No games match “{query}”", "Check the spelling or try a shorter title.", no action. The iOS "Cancel" beside a focused field is not drawn; convention (rule 7).

## Playing intent (batch 1, 2026-09-23)

From phone-feedback entry 1: Home's empty Playing card has "Search a new game" (home.md), and one tap on a result should mark it Playing with no sheet and no further step. Not drawn: the rows and the pill are the drawn ones with another glyph, so no Figma round.

- Route: the Search tab with `?intent=playing`, built by `searchHref('playing')` in `src/screens/search/intent.ts` (the pathname is the typed route). Any other value, or none, is plain Search.
- On arrival the param is taken off the route (the tab stays mounted, as with Ranking's `focus`), the field is cleared and focused so the keyboard is up.
- A one-line hint under the header, above the field: "Pick the game you're playing", 15 `text/secondary`, side padding 16, bottom 12.
- Every game row, results and Popular, carries `play` 18 `text/primary` in the same `bg/surface` pill instead of the plus or the check. Recent rows are unchanged.
- Tap the pill: `setStatus(client, id, 'playing')`, which creates the entry when there is none; `invalidateEntry`; wait for `['playing']` to come back; then navigate to Home, where the game is the Playing hero. While the write is in flight that pill shows a spinner and the others do nothing; a failure is an alert ("Couldn't mark it playing") and nothing moves. The query goes into Recent, as for an add.
- A game already tracked takes the same one tap: from the backlog it moves to Playing; from Played or Dropped it becomes Playing again, keeping its place in the ranking and its first `started_at`; one already Playing stays as it is and Home shows it.
- Tap a row: the game page, as in plain Search. Coming back from it finds the intent still on.
- The intent lasts for that visit: it ends when another tab is selected, including the move to Home after a pick. Opening a game page is not leaving. "Cancel" in the field clears the query and keeps the intent.

## Add-to sheet (26:189)

- A form sheet at about 45% of the height (top at 479 of 874): `bg/canvas`, top radius 24, grabber, padding top 12, sides 16, bottom safe area, column gap 8, items stretched.
- Game row (bottom padding 6, gap 12): `Cover` 40 (radius 6), title 17 semibold, "Add to…" 14 `text/secondary`.
- Three option rows, each `bg/surface`, radius 12, padding 14 sides 13 vertical, space-between: title 16 semibold over a description 12 `text/secondary` on the left, `chevron-right` 16 `text/secondary` on the right.
  - "Backlog" / "Play it later, owned or not": `moveToBacklog(client, id)`, `invalidateEntry`, dismiss.
  - "Playing now" / "Started it": `setStatus(client, id, 'playing')`, `invalidateEntry`, dismiss.
  - "I finished this" / "Rank it now", filled `medium/games` with `bg/canvas` text: `markFinished(client, id)`, `invalidateEntry`, dismiss, then push `/game/[id]` with `from: 'Search', log: '1'`.
  - 2026-10-22 (VER-224, [feature-ideas item 13](../../feature-ideas.md#13-rank-this-not-i-finished-this)), built: the filled row reads "Rank this" / "Place it in your list" (Spanish "Clasifícalo" / "Ubícalo en tu lista") and writes `startRanking(client, id)`, not `markFinished`: no finished date, an untracked or backlogged game becomes played, a Playing or Dropped one keeps its status. Then dismiss and push the game page with `log: '1'` as before.
- Ownership row, `bg/surface`, radius 12, padding 14 sides 13 vertical: "I have this game" 16 semibold over "On these platforms" 12 `text/secondary`; on the right the game's platforms as chips: owned = `Chip` owned (1.5px `medium/games` border, `check` 14, label 13 medium); not owned = plain `bg/surface` chip. When they do not fit, the chip row scrolls horizontally. Toggling calls `setOwnedPlatforms(client, id, next)` at once and never changes status (rule 19). Frame draws a bordered chip without a check for PC; do border and check together for owned, plain for not owned, as the game page frame does.
- Load `gamePage(client, id)` under `['game', id]` for the title, cover, platforms, release date, and current entry; one round trip and the same cache the game page uses.
- **A game that is not out (batch 1, 2026-09-23; phone feedback entry 7).** When `releaseState(page.releaseDate)` from `@verso/api` says unreleased, the sheet shows one option row instead of three and no ownership row: "Want to play" / "Out {date} · shows in Coming up", plain `bg/surface`, with `moveToBacklog(client, id)`, `invalidateEntry`, dismiss, the same as "Backlog". The date is the README's release-date form (`Nov 19` this year, `Feb 2027` next, `2028` beyond), the form Coming up and Upcoming print for the same game. Unreleased means a release date after today where the user is, the split `upcoming()` makes, so the game then lists in Home's Coming up and Next's Upcoming. A game with no date keeps the full sheet, because IGDB omits the date for old games as well as announced ones (views.ts); only a stored release status saying unreleased turns an undated game into the one row, reading "Release date to be announced", and the mirror stores no status yet. A game already tracked gets the same rows as one that is not. One row breaks rule 3 on purpose: nothing else is true of a game that is not out. "Want to play" names the act; the list is still Backlog (rule 18), and Rafa's "wish list" is recorded, not adopted. No Figma pass: it is one row of the drawn sheet's own style. Built in `screens/search/add-options.ts`.
