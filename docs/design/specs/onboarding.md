# Onboarding: media, platforms, the seeds, the deck page, Link Steam, and the doors

Written 2026-10-07 by the orchestrating session from the approved round 2 structure frames on the page `Structure round · bulk entry` (93:2): `R2 · Media` 137:34, `R2 · Platforms` 132:58, `Seed games` 96:46 (round 1, confirmed), `R2 · Deck page · Slider A` 152:202, `R2 · Link Steam` 136:153, `Ranking · Doors` 105:35 and `Search · Add many` 106:70 (round 1, confirmed). Structure frames are grayscale: sizes, order, and copy come from the frames; colors, type, and the primitives come from [README.md](README.md) and the fidelity round's conventions. The decisions are 20, 25, 26, 27 in `ROADMAP.md`; the reasoning is idea 1 of `docs/feature-ideas.md` (third pass and its reactions) and `docs/design/onboarding-guidelines.md`, whose copy rules bind every string here. The session and the review are in [batch-session.md](batch-session.md). Owner: the onboarding agent (PR 4 in `docs/private/design/bulk-entry-build.md`). Read README.md first.

**2026-10-28, "Rank this" reaches onboarding (VER-281, after VER-224).** The seeds' "Rank", the deck's "Rank" and Search's add-many pill write `startRanking(client, id)`, not `markFinished`: the game becomes played with no finished date (an untracked or backlogged game; a Playing or Dropped one keeps its status and gets no write), because "a game I love", "how it was" and "I know what I played" say played, never finished. The deck's played-on pre-fill and everything after the writes are unchanged. A game left unranked by an abandoned session therefore reads as played and undated in Ranking's banner. The lines below are kept as written; where they say `markFinished`, this note wins.

## Routes

Two builds make PR 4 in parallel; the split and the seam between them are in [batch-session.md](batch-session.md#two-builds-one-stack-the-hand-off-2026-10-07-after-pr-73). Agent A owns everything in this file; Agent B owns the session and the review.


```
app/onboarding/_layout.tsx      a Stack with no tab bar, headerShown false, gestureEnabled false on every screen
app/onboarding/media.tsx        Media
app/onboarding/platforms.tsx    Platforms; ?edit=1 when opened from "Add a platform"
app/onboarding/seeds.tsx        Three games you love
app/onboarding/deck.tsx         The deck page; ?from=ranking for a returning user
app/onboarding/session.tsx      The comparison session (batch-session.md)
app/onboarding/review.tsx       Look right? (batch-session.md)
app/onboarding/steam.tsx        Link Steam
```

The root layout's session gate sends a signed-in user whose profile has no `media` to `/onboarding/media`; a user with media and platforms never sees the stack again except through the doors. The stack's own order: media → platforms → seeds → deck → session → review → steam (PC players only) → the tabs. Say in the PR what the root layout needs (the gate condition and the route group); do not edit `app/_layout.tsx` yourself, describe the change.

## Segmentation (guidelines, "Two users, one tool")

A **new user** has no `profiles.media`. A **returning user** has media and platforms and three or more ranked games; they enter through the doors below and skip media, platforms, and seeds. The deck page shows "Add a platform" in place of nothing for them. Everything else is the same screens.

## Media (137:34)

- Padding sides 16, top safe area + 8, column gap 18. "Let's set up Verso" 15 `text/secondary`; "What do you want to keep track of?" 28 bold; "Pick one or more. You can add the rest later." 15 `text/secondary`. The three title lines sit with 6pt gaps.
- A 2 by 2 grid, gap 10, tiles flex 1, height 164, `bg/surface`, radius 14, padding 18 sides 14 vertical, content centered with gap 8: a 28pt `Icon` (`gamepad-2`, `film`, `tv`, `book-open` in `text/secondary`), the name 17 semibold, a third line. Games and Movies are live: a picked tile has a 1.5pt `medium/games` border and a `check` 15 `medium/games` third line; unpicked, no border and an empty third line. TV and Books are held: full opacity, the name in `text/secondary`, a `Chip` "Coming soon" (`bg/placeholder`), and under it, inside the tile, a row gap 6 of `bell` 14 `text/secondary` and "Notify me when available" 11 `text/secondary`. Tapping a held tile toggles that bell line between "Notify me when available" and "We'll tell you" with `bell-ring`, and calls `logEvent('media_interest', { medium })` once (the second tap does nothing; no event is removed).
- "Continue" (primary Button, regular) enabled once a live tile is picked; there is no skip. Tap: `setProfileMedia(picked)` then `logEvent('first_session', {})` then push platforms when games is picked. When only movies is picked, push the tabs and say so in the PR: the movies onboarding is the movies session's work, and until it lands a movies-only user goes to Home.

## Platforms (132:58)

- Same title block: "Let's set up your ranking" 15 `text/secondary`; "Where do you play?" 28 bold; "Now or before. Tap every one." 15 `text/secondary`.
- One list, column gap 10, from `PLATFORM_FAMILIES` in `@verso/core`: a family tile per family, full width, `bg/surface`, radius 12, padding 14, row gap 12: `Icon` 24 `text/secondary` in a 24pt slot (`gamepad-2` for every family for now), the family name 17 semibold, a spacer, then `chevron-right` 15 `text/secondary` when unpicked or `check` 15 `medium/games` when picked; a picked tile has the 1.5pt `medium/games` border. Tapping a family toggles it. A picked family with generations shows them directly under its tile, indented 12 (padding left 12, bottom 4): its picks as `Chip`s in a wrapping row gap 8, the chip label the plain generation name (`PS5`, `PS4`, `PS3`, `Older`), a picked chip in the `owned`-style variant (1.5pt `medium/games` border, `check` 14) and an unpicked chip plain. Picking a family picks its first generation by default (PS5, Series X|S, Switch 2, iOS); unpicking a family clears its chips. PC has no chips (it asks nothing further). No hint about backward compatibility anywhere: the deck assumes it.
- "Continue" (primary, regular), then "Skip for now" 15 `text/secondary` centered, as a `TextButton` with a 44pt hit region. Continue: `setProfilePlatforms(expandPlatforms(picks))` then push seeds. Skip: push seeds with an empty profile; the deck then uses the catalog's popularity with no platform filter and says "Popular everywhere" in its meta line.
- `?edit=1`: the same screen titled "Add a platform", picks pre-filled from the profile's platforms (a pick is on when every IGDB name it stands for is in the profile), Continue writes and pops back to the deck page.

## Three games you love (96:46, confirmed in round 2)

- "Three games you love" 28 bold; "They go straight into your ranking and tune what we ask about next." 15 `text/secondary`.
- The search field from Search (reuse `SearchField` and the debounce from `screens/search/`), results as `GameRow`s with a plus pill; tapping a result adds it to "YOUR THREE" (caption 12 semibold `text/secondary`) as a row with a `check` circle, and clears the field. The third slot, while empty, is a dashed 44 by `coverHeight(44)` placeholder and "Add a third" 16 `text/secondary`.
- "Rank these" (primary) is live from two seeds; "Their genres tune the deck; you can always add more later." 13 `text/secondary` under it. Tap: for each seed `markFinished(client, id)`; then open the session (batch-session.md) with the seeds as Loved and no predictions, which costs at most three questions; the session's review is skipped for the seeds (go straight to the deck page after their writes), because three rows need no review.

## The deck page (152:202)

- Header, padding sides 16 bottom 8: `x` 20 on the left, a 44pt hit region, "Done for now": with marks, go to the session; without, go to the tabs (new user) or back (returning). Centered: a 160 by 4 progress bar (`bg/placeholder` track, `medium/games` fill) and under it "{n} of 10" 13 `text/secondary`, where n is ranked games plus marked rows on this page, capped at the display only (the count keeps going past ten; the bar is full from ten).
- Meta line 13 `text/secondary`: "Popular on {platform labels} · tap how it was", the labels being the user's picked generations' short names, the first two joined with "and" and the rest dropped ("Popular on Switch 2 and PS5"); "Popular everywhere" with no platforms. For a returning user a `TextButton` "Add a platform" (13, `text/primary`, chevron) sits at the right end of this line and opens platforms with `?edit=1`.
- The axis: above the list, aligned with the slider column (padding left 56, width 56 + track width), four words 11 `text/secondary` centered over their stops: "Didn't like", "Fine", "Liked", "Loved".
- Rows, from `deckCandidates(client, platforms, 10, offset)` ordered by `orderDeck(rows, { pinned: 3 })` from `@verso/core`, each a column gap 8, padding 10 vertical, hairline `border/separator` under it: the top line is `Cover` 44 (radius 6), title 16 medium on one line ellipsized, meta 13 `text/secondary` "{year} · {platform short names}" (`platformShortName`, the user's platforms first, at most three); under it, indented to the text column, the `TierSlider` and its word.
- **`TierSlider`** (build it in `screens/onboarding/tier-slider.tsx`; say in the PR if it belongs in `src/ui`): a track about 220 wide, 3pt `border/separator` line with four 10pt stops at 0, 1/3, 2/3, 1 (hollow when untouched: `bg/canvas` fill, 1pt `border/separator` stroke); the value is one of `null | 'disliked' | 'fine' | 'liked' | 'loved'`, never continuous. A tap on the track snaps to the nearest stop; a horizontal pan (gesture handler, with `activeOffsetX` so the vertical scroll wins a vertical drag) moves the thumb with the finger and snaps on release. The thumb is a 24pt circle; the fill runs from the left end to the thumb. Color: interpolate through `tierPalette(theme)` from `tier/disliked` at stop 0 to `tier/loved` at stop 3 for both the fill and the thumb (Reanimated `interpolateColor`); the thumb carries the stop's icon at 12pt in `tier/label` color: `thumbs-down`, `meh`, `thumbs-up`, `heart` (the fidelity round may replace them; keep them in one map). After the track, the word 13 semibold in the tier color ("Didn't like", "Fine", "Liked", "Loved") or "Slide" 13 `text/secondary` when untouched. Accessibility: `accessibilityRole="adjustable"`, `accessibilityLabel` "How was {title}", `accessibilityValue` the word, increment and decrement actions moving one stop. Reduce Motion: snap without the color tween.
- Untouched rows are "not played" and are remembered for the session only (never asked again on a later page in this session; nothing is written).
- After the list: a spacer, "Show 10 more" 15 `text/secondary` centered (`TextButton`, 44pt region) that appends the next page (offset + 10) below, and "Rank these {n}" (primary, regular) pinned 16 above the bottom safe area, disabled at zero. Tap: for each marked row `markFinished(client, id)` (status played; played-on pre-filled from the profile when the game is on exactly one of the user's platforms, through `setPlayedPlatforms`), then open the session with the (item, tier) pairs. A write that fails shows an `ErrorLine` and keeps the button enabled; marks are local state until the writes.
- Returning user (`?from=ranking`): the same page; rows exclude anything with an entry (the SQL does); the header's `x` goes back.

## Link Steam (136:153), PC players only

- Shown after the review when the profile's platforms include `PC (Microsoft Windows)` and `getSteamLink` says not linked; everyone else goes to the tabs.
- Centered column, width 370, gap 14: the Steam mark 56 (`bg/placeholder` square until the fidelity round supplies it), "Play on PC?" 28 bold, "Link Steam and we read your game list and hours played, so ranking is one tap per game." 15 `text/secondary` centered width 330, then two lines 13 `text/secondary` with a 14pt `Icon` each (`list` and `shield`): "We read: your games and hours. Steam needs Game details set to Public; we show you how." and "We never read friends, messages or purchases. Unlink any time in Settings."
- Two Buttons the same size (regular, full width): "Link Steam" primary → the `LinkSteamButton` flow from `screens/steam/` (PR 5), and on a linked return push the import and candidates screens of that flow, then the tabs; "Not now" secondary → the tabs. No header, no `x`.

## The doors (returning users)

- **Ranking's empty state** (105:35, round 1, confirmed): the `EmptyState` with "Nothing ranked yet" and "Two ways to start.", two Buttons width 300: "Rank popular games" (primary) → `/onboarding/deck?from=ranking`; "I know what I played" (secondary) → Search in the add-many intent. Replace the current single-action empty state in `screens/ranking/`.
- **Ranking's banner** (104:79): when `playedNotRanked(client, 'game')` is not empty, a `bg/surface` radius 12 row above the list: `Icon` 22 `medium/games`, "{n} played games to rank" 15 medium, chevron → the session over those games with no tiers yet (the session asks the tier first for each; see batch-session.md "Untiered items").
- **Search's add-many intent** (106:70): `?intent=addmany`, read once and taken off the route like the playing intent (`screens/search/intent.ts`): the title reads "Add many", a counter chip "{n} added" in `medium/games` at the right of the header, every row's pill is a check circle (`medium/games` with a white `check` when added, a plus otherwise); a tap calls `markFinished(client, id)` at once and adds the row to an "ADDED" list under the results; "Rank {n} games" (primary) pinned above the tab bar opens the session over the added games. Leaving the tab ends the intent as the playing intent does.

## Events (the funnel, wave A)

`logEvent(client, kind, payload)` from `@verso/api`, called through `logAppEvent` in `apps/mobile/src/lib/log-event.ts`, which adds `{ platform: Platform.OS }` ("ios", "android" or "web") to every payload so the web cohort can be told apart (web brief, question 10): `first_session` at Media's Continue; `ten_ranked` once, when the ranked count first reaches ten (the review's Done, or the single log flow); `media_interest` per held medium; `app_open` once per calendar day on foreground (a `lib/` hook, owner-only rows). `first_pick` waits for the finder.

**The report** (2026-10-12, VER-21). `supabase/migrations/20261012120000_funnel_report.sql` adds `funnel_report(since, until)`, one row per step with the count of distinct users, and `funnel_report_by_cohort(since, until)`, the same steps by week of sign-up (Monday, UTC), so each wave of testers reads as its own rows. Service role only, like the recommendation harness; nothing in the app calls them. Rafa runs `DATABASE_URL='<connection string>' pnpm funnel --since <date>` ([hosted-setup.md](../../process/hosted-setup.md), section 12), which prints both as plain tables.

- **The steps**, in order: `signed_up` (a profile created in the window), `first_session`, `ten_ranked`, `first_pick` (0 until the finder logs it), `day_7_return`.
- **A cohort funnel.** The window picks people by sign-up, half-open; each step counts those of them who reached it before `until`. Each step counts everyone who reached it, not only those who reached every earlier step, so an account from before the events table (ranked, no `first_session`) shows as what it is; `--since` leaves those out.
- **Day 7 is derived, never logged**: an `app_open` on a UTC calendar day at least seven days after the sign-up day. Anchored on the sign-up day rather than the first `app_open`, because an event is never older than its account and the first open can be lost or, for an older account, weeks late. `day_7_return` stays reserved in `EventKind` and is not sent.
- **Not split by platform yet.** The key is in every new row's payload; the split is a filter on the report when the web cohort exists.

## Copy rules (guidelines, principles 11 to 13)

No "personalized", "for you", "tailored", "we know your taste". Every row says what it is ("Popular on Switch 2"). Nothing in this stack starts a trial, a notification prompt, or a friends step. "Not now" and "Skip for now" are real controls with 44pt regions, never a dimmed link.

## Deviations in the build (2026-10-07, PR 4, the onboarding agent)

- Frame draws "Skip for now" under Platforms' Continue; in `?edit=1` do "Cancel", which goes back to the deck without writing, because skipping means nothing there.
- Frame draws the seeds with two filled and the third slot as the dashed placeholder "Add a third"; with fewer seeds do the same placeholder for each empty slot, "Add a first" and "Add a second", and a tap on a seed's check takes it back out.
- Frame draws "Rank these {n}" on the deck page; at zero do "Rank these", disabled, rather than "Rank these 0".
- Frame draws "Rank {n} games" in Search's add-many intent; do "Rank 1 game" in the singular, and show the button only once a game is added.
