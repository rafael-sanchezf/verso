# Home

Frames `F · Home` (26:33) and `F · Home · long press` (26:313). Route `app/(tabs)/index.tsx`. Owner: Home agent. Read [README.md](README.md) first. Uses `Cover`, `Text`, `Icon`, `EmptyState` from the shell; the Home cards are Home's own components under `src/screens/home/`.

**2026-10-07, ownership out (decision 26).** The subtitle chains below read the played-on platforms wherever they read the owned ones (the Playing hero and cards, Up next), and Coming up reads the first catalog platform alone, since a game that is not out has been played nowhere.

**2026-10-12, Coming up date column fixed (phone-feedback entry 13).** The date column is a fixed 44 points wide, centered, so every cover in the block starts at the same x; a date this year is the month over the day (`title-3` bold), a date next year is the month over the year in `subheadline` bold (smaller than the day), and a date further out is the year alone. Next year never shows the day, because the catalog stores no date precision and a real day cannot be told from IGDB's placeholder for a month or quarter.

## Layout, top to bottom

- Media switcher row: side padding 16, bottom padding 12, space-between, vertically centered.
  - Left, the active medium: the logo mark at 28 (the V placeholder, `assets/logo/v-bars-games.svg`) then "Games" 30 bold in `medium/games`, gap 8.
  - Right, the other media: `book-open`, `film`, `tv` at 28, gap 10, stroked in `medium/books`, `medium/movies`, `medium/tv`.
- Content column: top padding 8, gap 24 between blocks, scrolls.
- Playing block (side padding 16, gap 12): "Playing" 22 bold.
  - Hero card: `bg/surface`, radius 16, padding 12, row gap 16, centered: `Cover` 96 (radius 8); text column gap 4: title 17 semibold `text/primary` (wraps), subtitle 15 `text/secondary`.
  - "Also playing" row under the hero: gap 12, cards flex 1: `bg/surface`, radius 12, padding 10 sides 8 vertical, row gap 10: `Cover` 36 (radius 6), title 15 medium on one line.
- Up next block (gap 12): a header row with side padding 16, space-between: "Up next" 22 bold and "See all" 15 `text/secondary`. Cards in a horizontal scroll starting at 16, gap 12: `bg/surface`, radius 12, padding left 10, right 12, vertical 10, row gap 10: rank 20 bold `text/secondary`, `Cover` 44 (radius 6), text column gap 2: title 15 medium at width 120 (wraps to two lines), subtitle 13 `text/secondary`.
- Coming up block (side padding 16, gap 6): "Coming up" 22 bold; rows with vertical padding 6, gap 12: a date column (44 wide, centered; was padding 6 sides until 2026-10-12) with the month 11 semibold uppercase `text/secondary` over the day 20 bold `text/primary`; `Cover` 40 (radius 6); text column gap 2: title 16 medium, subtitle 13 `text/secondary`.
- Tab bar from the shell.

## Data

- Playing: `playing(client)`, most recently started first. The hero is the first row; the rest are "Also playing" cards (the row scrolls horizontally when there are more than two).
- Up next: `upNext(client, 3)`. Coming up: `comingUp(client, 3)`.
- Hero and small-card subtitle (rule 9 chain): `{owned platforms joined by ", "} · {hours played}`; without hours: `{platforms} · Started {date}`; without a started date: the platforms alone; without ownership: the first catalog platform.
- Up next subtitle: `~30 h` from time to beat; else the owned platform; else the year.
- Coming up: month and day from `releaseDate` (always present here); subtitle = owned platform, else the first catalog platform.
- The rank numbers on Up next cards are 1, 2, 3, the backlog order.

## Behavior

- Tap any card or row: push `/game/[id]` with `from: 'Home'`.
- "See all": switch to the Next tab, Backlog segment. Coming up shows three at most and has no "see all".
- Long press on the hero or a small card (26:313): the card lifts (shadow 0 8 24 at 25% black) over a 30% dim and an iOS context menu appears beside it: "Mark as finished" (16 semibold in `medium/games`, icon `check`), "Log hours" (16, icon `clock`), "Move to backlog" (16, icon `layers`). Use the native context menu (Expo Router `Link.Menu`, `@expo/ui` ContextMenu, or zeego); the frame is the intent, not a custom overlay. The frame's icons were placeholder squares; the Lucide picks above are the convention.
  - Mark as finished: `markFinished(client, id)`, `invalidateEntry`, then push `/game/[id]` with `from: 'Home', log: '1'` so the tier sheet opens over the game page.
  - Log hours: push `/game/[id]/hours`.
  - Move to backlog: `moveToBacklog(client, id)`, `invalidateEntry`; the card leaves Playing.
- Tapping another medium in the switcher: the tapped icon becomes the active one (its name and color slide in; the games mark shrinks back to the `gamepad-2` icon in `medium/games`), and the content area shows an `EmptyState` "{Books, Movies, TV} arrive after games." with the tab bar unchanged. Games is the only medium with data in V0; the switch is visual state that resets when the tab is left. Tap, never swipe (rule 6).
- Pull to refresh invalidates the three lists.

## Empty and first-run states (drawn 2026-09-16, States round, awaiting Rafa's reaction)

Frames `F · Home · Playing empty` (38:1013), `F · Home · first run A` (38:713), `F · Home · first run B` (38:854); dark 39:1429, 39:1368, 39:1401. Every state uses the shell's `EmptyState` (shell.md) inside a `bg/surface` card with radius 16 that takes the block's slot; the block title stays.

- No playing games (38:1013): "Playing" 22 bold, then the card: `EmptyState` with the `play` icon and "Nothing playing"; what follows depends on the backlog (revised 2026-09-23, batch 1, from phone-feedback entry 1 as refined; the frame's layout is unchanged, only the actions, so no Figma round). Up next and Coming up unchanged.
  - With a backlog: "Start a game from your backlog.", the primary button "Pick from backlog" → the Next tab, Backlog segment (as drawn), and under it the secondary button "Search a new game" → the Search tab in the Playing intent (search.md).
  - With no backlog: "Search for the game you're playing." and the single primary button "Search a new game" → the same. The backlog is not mentioned.
  - "A backlog" is the list Up next already reads (`['backlog']`, released backlog games), so the card needs no read of its own. A backlog of only unreleased games counts as none: they cannot be started, and the Backlog segment does not list them. Until that read answers (or if it fails), the card shows the with-backlog version. `playingEmptyCard` in `src/screens/home/rules.ts`, tested.
  - Not drawn, convention: the second button is `EmptyState`'s `secondaryAction` (shell.md), the secondary `Button` at the small size, 6pt under the primary. On the `bg/surface` card its fill is the card's own, so it reads as a text button under the green one.
- Empty backlog (as in 38:854): the "Up next" header without "See all"; then, inside the block's 16pt side padding, the card: `layers`, "Your backlog is empty", "Add games you want to play from Search.", button "Search games" → the Search tab.
- Nothing upcoming: hide the block (rule 20).
- First run, all three empty, two variants for Rafa to pick from:
  - A, dedicated (38:713): the switcher row stays; the content column holds one card (`bg/surface`, radius 16, padding 20, column gap 16): "Add your first game" 22 bold; three step rows (gap 12, row gap 12, centered) with an icon at 22 in `text/primary` and text 15 `text/primary`: `search` "Add what you're playing or just finished", `trophy` "Rank what you finish, two at a time", `layers` "Keep the rest in your backlog"; the primary Button "Add a game" (regular) → the Search tab. Nothing below the card.
  - B, blocks in place (38:854): "Playing" over a card with no action (`play`, "Nothing playing", "Start a game from your backlog and it shows up here."), then the empty backlog block above; Coming up hidden. Unchanged by the 2026-09-23 revision of the Playing card: the empty backlog card under it already leads to Search.
  - Until Rafa picks, build B: its two cards are needed for the partial states anyway, and A is one extra component if chosen.
