# Next: Backlog and Upcoming

Frames `F · Next · Backlog` (26:670) and `F · Next · Upcoming` (26:752). Route `app/(tabs)/next.tsx` with the param `segment=backlog|upcoming` (Profile links to Upcoming). Owner: Next agent. Read [README.md](README.md) first.

**2026-10-07, ownership out (decision 26).** The "Owned only" chip, the "Not owned" chip on a row and the owned platforms in the row text left the Next tab with ownership: every Backlog row trails the Start button, line two reads the platforms the game was played on (else the catalog's first, as before), Upcoming reads the catalog's platforms, and the lines below that still name ownership describe what was there before.

## Header and segments

- `ScreenHeader` "Up next" (the tab says "Next"; rule 8 allows the expansion) with the `MediumChip`.
- `SegmentedControl`, side padding 16, bottom 12: "Backlog" with a 16pt `layers` icon, "Upcoming" with `calendar`. The icon slots in the frame are unfilled squares; these two are the convention (Rafa, 2026-09-16: the squares are to be icons; the code already draws these two).

## Backlog segment

- Sub row, side padding 16, bottom 8, space-between: "{n} games · your order" 13 `text/secondary` ("· by date added", "· by release date", "· by time to beat" when sorted); on the right a `Chip` outlined "Owned only" 13 medium (toggle; active = `Chip` filled) and "Sort ▾" 13 medium `text/primary` → a native menu: Your order, Date added, Release date, Time to beat.
- Rows (vertical padding 10, gap 12): `Cover` 44 (radius 6); text column gap 2: title 16 medium; line two 13 `text/secondary` "{owned platforms joined by ' · '} · ~{time to beat}" dropping what is missing (first catalog platform when nothing is owned); line three 12 `text/secondary`, the first available of "Started {date}", "{hours} played", "Added {date}". Trailing: owned → a Start button (`bg/surface` pill, padding 10 sides 5 vertical, `play` 14); not owned → `Chip` outlined "Not owned" 11 semibold → `/game/[id]/platforms`. Then the drag handle `grip-vertical` 18 `text/secondary`.
- Drag by the handle (rule 11) → `moveBacklogEntry(client, { entryId: entry.id, position })`, optimistic, then `invalidateEntry`. Handles hide while a sort other than "Your order" or the owned filter is active, because the order on screen is then not the user's.
- Start → `setStatus(client, id, 'playing')` (the database stamps `startedAt`), `invalidateEntry`; the row leaves the list. One tap, rule 10.
- Tap a row: push `/game/[id]` with `from: 'Next'`.

## Upcoming segment

- Sub row: "{n} games · by release date" 13 medium `text/secondary`, nothing on the right.
- Rows (vertical padding 10, gap 12): `Cover` 44 (radius 6); text column gap 2: title 16 medium, platforms 13 `text/secondary` joined with " · " (owned first, else catalog, at most three); trailing the release date 13 `text/secondary` in the README's release-date format.
- No drag, no start button. Tap: game page.

## Data

- `backlog(client)` under `['backlog']` in the user's order; `upcoming(client)` under `['upcoming']`. Counts from the lists. Sorting and the owned filter are client-side.

## Empty states

- Empty backlog (`F · Next · Backlog · empty` 39:1072, dark 39:1515) and empty upcoming (`F · Next · Upcoming · empty` 39:1186, dark 39:1532), drawn 2026-09-16, awaiting reaction: header and segments stay, the count and sort sub row is hidden, and the list area centers an `EmptyState` (bottom padding 120). Backlog: `layers`, "Your backlog is empty", "Add games you want to play from Search.", button "Search games" → the Search tab. Upcoming: `calendar`, "Nothing upcoming", "Unreleased games you add land here.", no action.
