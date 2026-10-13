# Screen specs

Written 2026-09-16 by the orchestrating session from the Fidelity round frames (the light set, node ids below; the dark set is the same layout with the Dark mode value of every token). One document per build agent. Read this file first, then your screen's file, then [../ui-principles.md](../ui-principles.md) for the rules the specs cite by number. The frames are awaiting Rafa's approval; when a frame changes, the spec changes here, and the spec, not the Figma file, is what a screen agent builds from. Screen agents never call Figma.

**2026-10-07, ownership out (decision 26).** `owned_platforms`, `setOwnedPlatforms` and the Next tab's owned filter are gone, `PlatformOwnership` is `PlatformPlayed` (`{ name, played }`), `app/game/[id]/platforms.tsx` is the played-on picker the game page opens, and the `Chip` variant shell.md calls `owned` is `played`, drawn the same; the lines below that still name ownership describe what was there before.

Figma file: https://www.figma.com/design/<figma-file-key>, page `Fidelity round` (26:2), page `Components` (26:3).

## Files

| Spec | Frames (light node ids) | Owner |
|---|---|---|
| [shell.md](shell.md) | `Tab bar` component set 32:375, Icons section 28:2, the shared tab headers | Phase 1 shell agent |
| [signed-out.md](signed-out.md) | F · Signed out 26:4 | Phase 1 shell agent |
| [home.md](home.md) | F · Home 26:33, F · Home · long press 26:313 | Home agent |
| [search.md](search.md) | F · Search 26:121, F · Search · add-to sheet 26:189 | Search agent |
| [game-page.md](game-page.md) | F · Game page 26:249 | Game page agent |
| [log-flow.md](log-flow.md) | F · Log · tier sheet 26:348, F · Log · compare 26:385, F · Log · confirm 26:415 | Log flow agent |
| [ranking.md](ranking.md) | F · Ranking 26:453, F · Ranking · grid 26:565 | Ranking agent |
| [next.md](next.md) | F · Next · Backlog 26:670, F · Next · Upcoming 26:752 | Next agent |
| [profile.md](profile.md) | F · Profile 26:809 | Profile agent |
| [onboarding.md](onboarding.md) (2026-10-07) | `R2 · Media` 137:34, `R2 · Platforms` 132:58, `Seed games` 96:46, `R2 · Deck page · Slider A` 152:202, `R2 · Link Steam` 136:153, `Ranking · Doors` 105:35, `Search · Add many` 106:70, page 93:2 (structure frames) | Onboarding agent (PR 4) |
| [batch-session.md](batch-session.md) (2026-10-07) | `R2 · Session` 134:30, `R2 · Review` 135:185, page 93:2 (structure frames) | Session agent (PR 4) |
| the empty and first-run states, in each screen's file | F · Home · first run A 38:713, F · Home · first run B 38:854, F · Home · Playing empty 38:1013, F · Search · no results 38:1144, F · Ranking · empty 39:925, F · Next · Backlog · empty 39:1072, F · Next · Upcoming · empty 39:1186, F · Profile · empty 39:1273; the `EmptyState` component set 37:102 | the screen's agent |

Dark frames, same order: 32:593, 32:622, 32:695, 32:748, 32:808, 32:874, 32:909, 32:947, 32:977, 32:1015, 32:1112, 32:1202, 32:1269, 32:1311. States round dark frames, same order as the row above: 39:1368, 39:1401, 39:1429, 39:1492, 39:1506, 39:1515, 39:1532, 39:1549.

## How to read a spec

- **Colors since decision 29** (adopted in code 2026-10-08, #76): wherever a spec below names `medium/games` or any other medium color, read `brand/primary` for a fill (with `brand/on-primary`, white, on it) and `brand/text` for text, icons and indicators (`#006822` light, `#009B37` dark). No medium has a color. Tier chips, dots and badges follow [shell.md](shell.md): the four deep solids of option A with white labels and a tier icon. Destructive and error text is `text/destructive`, never `tier/disliked`.

- Sizes are points at the frame width of 402 (iPhone 17 Pro). Content sits inside 16pt side padding unless a spec says otherwise; horizontal carousels start at 16 and bleed off the right edge.
- The frames' 59pt top and 34pt bottom are the status bar and the home indicator. Use safe-area insets, never those numbers.
- Colors are named by token: `bg/canvas`, `bg/surface`, `bg/placeholder`, `text/primary`, `text/secondary`, `border/separator`, `medium/games` (and books, movies, tv), `tier/loved`, `tier/liked`, `tier/fine`, `tier/disliked`, `tier/label`. Use the theme the shell builds from `packages/tokens/tokens.json`; never a hex value. `medium/games` is the accent everywhere in V0 because the app is always in one medium (rule 4).
- Type is Inter on the ten-style ramp in tokens: `large-title` 34/700, `title-1` 28/700, `title-2` 22/700, `title-3` 20/600, `headline` 17/600, `body` 17/400, `callout` 16/400, `subheadline` 15/400, `footnote` 13/400, `caption` 12/400. The frames also use off-ramp sizes (30, 24, 18, 14, 11, 10) and Medium (500) and Semi Bold (600) at body sizes, so each spec gives size and weight per element and the `Text` primitive takes explicit overrides. "17 semibold" means size 17, weight 600.
- Strings in the frames are sample data (Silksong, Hades, "Rafa Sanchez"). Each spec says which field a string comes from and what replaces it when the field is empty.
- The frames drew covers at 3:4; IGDB's art is 264 by 374, and since #55 the `Cover` primitive uses that ratio (`coverHeight(width)` in `@/ui`, which every fixed row height derives from). It takes a width and a radius and derives the height, walks `coverCandidates(row)` on error, draws `bg/placeholder` when the list is empty, never crops the art (rule 29), and draws its edge, a hairline `border/separator` and a soft shadow, in light and dark (rule 30).
- "Frame draws X; do Y" notes are deliberate deviations, each also listed in the PR.

## Route map

Built by the shell as placeholder files and registered in the root stack with their presentation. A screen agent replaces only the files it owns and never edits `app/_layout.tsx` or `app/(tabs)/_layout.tsx`.

```
app/_layout.tsx                 root Stack: fonts, theme, QueryClientProvider, session gate   shell
app/(auth)/sign-in.tsx          Signed out                                                    shell
app/(tabs)/_layout.tsx          tab bar                                                       shell
app/(tabs)/index.tsx            Home                                                          Home agent
app/(tabs)/search.tsx           Search                                                        Search agent
app/(tabs)/ranking.tsx          Ranking, list and grid                                        Ranking agent
app/(tabs)/next.tsx             Next, Backlog and Upcoming; accepts ?segment=upcoming         Next agent
app/(tabs)/profile.tsx          Profile                                                       Profile agent
app/settings.tsx                Settings list, pushed from Profile                            Profile agent
app/import/letterboxd.tsx       Import from Letterboxd, pushed from Settings → Data           letterboxd-import.md
app/game/[id]/index.tsx         Game page, pushed over the tabs (no tab bar)                  Game page agent
app/game/[id]/hours.tsx         Log-hours sheet (Home links here too)                         Game page agent
app/game/[id]/details.tsx       Add-detail sheet                                              Game page agent
app/game/[id]/platforms.tsx     Ownership picker sheet (Next and Search link here too)        Game page agent
app/add/[id].tsx                Add-to sheet over Search                                      Search agent
app/log/[id].tsx                Log flow: tier sheet, comparisons, confirm                    Log flow agent
app/preview.tsx                 dev-only gallery of every primitive                           shell
```

Params: `id` is `media_items.id`. Whoever pushes the game page passes `from` (the tab label: Home, Search, Ranking, Next, Profile) and the game page uses it as the back title. `log=1` on the game page opens the log flow as soon as the page has loaded. `add`, `log`, `hours`, `details`, `platforms` are iOS form sheets. Each agent owns its route files and a folder `apps/mobile/src/screens/<name>/` for its components. `apps/mobile/src/ui/` belongs to the shell: if a primitive you need is missing, build it inside your screen folder and say so in the PR rather than editing `src/ui`.

## Data

`@verso/api` is the only way to the database and `@verso/core` holds the ranking engine and pure helpers. Screens read through TanStack Query with the keys in `src/lib/query-keys.ts` (shell):

- `['playing']`, `['backlog']`, `['upcoming']`: `playing`, `backlog`, `upcoming` in `views.ts` (`upNext` and `comingUp` are the same lists limited to three).
- `['game', id]`: `gamePage`. `['player-count', id]`: `latestPlayerCount`.
- `['ranking']`: the four `tierList` calls as a record keyed by tier, `Record<Tier, TierListRow[]>` with keys loved, liked, fine, disliked (the shape the Ranking tab stores; every other reader of the key returns exactly that so the cache is never populated with two shapes). `['tier', tier]`: one tier.
- `['profile', 'stats']`, `['profile', 'recent']`: `profileStats`, `recentRankings`. `['profile', 'me']`: `getMyProfile` (lands with the auth-profiles PR).
- `['search', query]`: `searchGames`. `['popular']`: `popularGames(client, 5)`.
- **2026-10-07, the onboarding backend (PR 3).** `['deck', platforms sorted, limit, offset]`: `deckCandidates`; `['played-not-ranked', medium]`: `playedNotRanked`; `['batch-predictions', medium, ids sorted]`: `batchPredictions`. Built by `onboardingQueryKeys` in `@verso/api` (fold it into `query-keys.ts`), with `invalidateOnboarding` (call it from `invalidateEntry` and `invalidateRanking`) and `invalidateProfile` (after `setProfilePlatforms` and `setProfileMedia`). `Profile` gains `platforms` and `media` (null for a new user), `TierListRow` gains `placed_by`, and the three reads return camelCase rows that `orderDeck` and a batch item take as they are.

After a mutation call the shell's helpers: `invalidateEntry(queryClient, id)` after any `entries.ts` write (status, finished, ownership, hours, dates, notes, remove) and `invalidateRanking(queryClient, id)` after any `ranking.ts` write. They invalidate every key above that could show that game.

## Shared rules (ui-principles.md)

- Rule 9, show what you know: every subtitle has a fallback chain, spelled out per row in the specs. Never an empty line, never an invented number.
- Rule 20, hide what is empty: rows for missing personal facts do not render.
- Rule 21, one scoreboard per source: a score always carries its source label.
- Rule 7, conventions first: patterns the frames never drew (sort menus, filter menus, the settings list, the log-hours sheet, the change-status menu, the add-detail sheet, notes, the ellipsis menu) are coded from iOS conventions, native where a native control exists (action sheets, alerts, context menus, form sheets, date pickers), and listed in the PR. The first-run and empty states were drawn 2026-09-16 (the States round, the fourth and fifth rows of the Fidelity page, plus the `EmptyState` component) and each screen's file now specifies them; they await Rafa's reaction like the rest of the fidelity round. The sign-in steps are built plainly by decision (signed-out.md).
- Loading: skeleton blocks in `bg/placeholder` at the row's size. Errors: one line in `text/secondary` with a "Retry" text button. Neither is drawn.

## Formatting helpers (shell provides `src/lib/format.ts`)

- Hours: `~30 h` from `timeToBeat.normallySeconds` rounded to the nearest hour; `14 h played` from `playtimeMinutes` rounded, `40 min played` under an hour.
- Release dates: `Sep 24` in the current year, `Feb 2027` next year, `2028` further out (IGDB's date precision is not stored, so a far date shows only its year).
- Personal dates: `Sep 2` this year, else `Sep 2, 2025`. Full dates on the game page: `Sep 17, 2020`.
- Relative: `Today`, `Yesterday`, the weekday name within seven days, else `Sep 3`.
- Platforms: joined with `, ` in Search rows and on the game page ownership line, with ` · ` in Next rows; at most three, then `+2`.
- Genres: `genreDisplayName` from core, nulls skipped, at most two joined with `, `.
- In Spanish (decision 36, [spanish-build.md](../spanish-build.md)): the same shapes with the day first and the RAE's lowercase month, `24 sept`, `feb 2027`, `2 sept 2025`, `17 sept 2020`; `Hoy`, `Ayer`, then `Lunes`; `14 h jugadas`, `40 min jugados`. Platforms and `~30 h` are the same.

## Global rank

Rank numbers are global across tiers, as the Ranking list numbers them: the best game in Loved is 1 and the count runs on through Liked, Fine, and Didn't like. Global rank = items in better tiers + position within the tier + 1. Scores come from `scoreForPosition(tier, position, tierSize)` in core and are never stored.
