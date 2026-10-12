# Ranking, list and grid

Frames `F · Ranking` (26:453) and `F · Ranking · grid` (26:565). Route `app/(tabs)/ranking.tsx`. Owner: Ranking agent. Read [README.md](README.md) first.

## Shared header

- `ScreenHeader` "Ranking" (bottom padding 10 in the list, 12 in the grid) with the `MediumChip`.
- Tools row, side padding 16, bottom 8, space-between. Filters on the left, chips with gap 8, padding 12 sides 6 vertical, label 14 medium: "All" (`Chip` filled while no filter is active), "Genre ▾", "Platform ▾" (`FilterChip` surface; an active filter reads its value with that value's icon at 16 before it, the genre's icon and "RPG ▾" or the platform's mark and "PS5 ▾", and becomes filled, icon included, while "All" turns to surface). The view toggle on the right: `bg/surface`, radius 8, padding 2, gap 2, two 16pt icons `list` and `grid-2x2` each padded 10 sides 4 vertical with radius 6, the selected one on `bg/canvas`. Frame for the grid omits the toggle; do keep it in both views so the user can come back.
- Genre and Platform open a sheet (`MenuChip` over the in-screen `Sheet`): the title, "Genre" or "Platform", in `title-3` centered, then "Any" and one row per value present in the ranking. A row is the value's icon at 16 in a 16pt slot ("Any" keeps the slot empty so the labels line up), the label at 17, and a 16pt `check` on the value in force; rows are at least 44 high with hairline `border/separator` lines between them, and the list scrolls past 60% of the screen height. A tap chooses and closes the sheet; the backdrop closes it without choosing.
  - Genre values read as the display name the rows use, with a capital because the label starts a line (`genreLabel`: "Platformer", "RPG", "Adventure game"), never the lower-case form the rows and the comparison prompt use mid-sentence. A genre with no display name (Indie) is not offered. Each draws its Lucide icon (`GenreIcon`, the table in `GENRE_ICONS` in `src/lib/format.ts`, one per genre, none shared).
  - Platform values read as the short name ("PS5", "PC", "Switch") beside the glyph the game page draws (`PlatformIcon` at 16, mark only: no suffix, since the name beside it already says which PlayStation, and a gamepad for a platform with no mark). The values are derived in one function, `platformOptions`, and choosing one filters by the same rule (`platformsOf`).
  - Changed 2026-10-12 (phone feedback entry 4): the values are where the user played each ranked game, the union of `tier_list`'s `played_platforms`, and a game with no played platform recorded counts as being on its catalog platforms. Before, they were every catalog platform of every ranked game, which offered Linux, Mac and iOS to someone with no games on them. "The menu follows where I play it, not where it exists" is inferred from Rafa's words and is his to confirm.
  - Both lists are sorted by the label as read, not by IGDB's name.
  - Changed 2026-09-23 (phone feedback batch 1, entries 2, 3, 5; roadmap item 29): this was a native menu, and it became the app's sheet so the genre icons and platform glyphs can be drawn. A native action sheet takes only strings, and `@expo/ui`'s menus and `Link.Menu` take only SF Symbols, which is why Home's long-press menu still draws system icons. No Figma round: the pattern is the app's existing in-screen sheet, and the Ranking frames still draw the chips without icons.
- Filters are client-side over the one global list (open question 2): rank numbers and scores keep their global values; the list shows a subset. Drag is off while any filter is active (List, below).

## List

- Side padding 16, scrolls.
- Tier divider (vertical padding 8, gap 10): a 2pt line flex 1, the label, a 2pt line, all in the tier color; labels LOVED, LIKED, FINE, DIDN'T LIKE at 12 semibold. A tier with no games has no divider.
- Row (vertical padding 9, gap 12): global rank 17 bold `text/secondary` at width 22; `Cover` 40 (radius 6); text column gap 2: title 16 medium, "{year} · {first genre display name}" 13 `text/secondary` (the year alone without a genre); `ScoreBadge` regular on the right.
- Long-press drag to reorder, always on (Q11 default): the row lifts; the drop calls `moveRankingEntry(client, { mediaItemId, tier, position })` with the tier and position of the slot it landed in (crossing a divider changes tier), optimistic, then `invalidateRanking`. Drag is off while a filter is active because the visible order is not the whole list.
- Tap a row: push `/game/[id]` with `from: 'Ranking'`.

## Grid

- Side padding 16, rows with gap 12, three cells per row with gap 12, cells flex 1.
- Cell: a poster column with a 3pt `medium/games` bar on top and the cover below at 150 high, full width, no radius (the collection wall reads as tiles); a footer row gap 6: a rank badge (`text/primary` fill, radius 6, padding 6 sides 1 vertical, 11 bold `bg/canvas`) and the title 12 medium at width 84 (two lines).
- Continuous across tiers, no dividers, global numbering. Tap: game page. No drag in the grid.
- This is the shareable collection wall (rule 15); a share image comes later, so no share button in V0.

## Data

- Four `tierList(client, 'game', tier)` calls in parallel under `['ranking']`, assembled loved, liked, fine, disliked; the score per row from `scoreForPosition(tier, position, tierSize)`; the global rank by running count. Row fields: `media_item_id`, `title`, `year`, `cover_image_id`, `external_ids`, `genres`, `platforms`, `played_platforms`, `position`. `tier_list` returns `external_ids` as of 2026-09-16, so a row goes to `coverCandidates` as it is and a game with no IGDB cover falls back to Steam art rather than the placeholder.

## States

- Empty ranking (`F · Ranking · empty` 39:925, dark 39:1506; drawn 2026-09-16, awaiting reaction): the header stays, the filters and view toggle row is hidden (nothing to filter, rule 20), and the list area centers an `EmptyState` (bottom padding 120): `trophy`, "Nothing ranked yet", "Finish a game and rank it from its page.", button "Find a game you've played" → the Search tab.
- The view and the filters persist for the session only.
