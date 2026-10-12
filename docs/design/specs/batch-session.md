# The batch session and the review

Written 2026-10-07 by the orchestrating session from `R2 · Session` 134:30 and `R2 · Review` 135:185 (page 93:2), the design in `docs/design/ranking-algorithm.md` ("The batch session", "Estimate first, then ask"), and the engine in `packages/core/src/batch.ts` (PR 2) with the reads and writes of PR 3 (`batch_predictions`, `played_not_ranked`, `finishInsertion` with `placedBy`). Owner: the session agent (PR 4), or the onboarding agent if one agent builds both. Read [README.md](README.md), [onboarding.md](onboarding.md), and [log-flow.md](log-flow.md) first; the compare step's pieces in `screens/log/` are reused here, never duplicated.

## Input

A session starts from one of three places with a list of `{ mediaItemId, tier | null }`: the deck page (tiers from the sliders), the seeds (all Loved), or the played-not-ranked drain (tiers null). It loads, in parallel: the four `tierList`s (the existing order per tier, each row's score from `scoreForPosition`), `batchPredictions(client, 'game', ids)` for the new items, and the catalog rows it needs for the cards (`gamePage` is too heavy; use the deck rows passed in, or `playedNotRanked` rows). Then `startBatch` from `@verso/core` as PR #72 shaped it: each item carries its own `predictedScore` and `confidence` (copy the `batchPredictions` rows onto the items), the tiers' existing lists beside them, and the tie-break is the order the items arrived in (the deck's popularity order). Each question carries the game's `InsertionState`, so `comparisonPrompt` and `genreCue` work on it unchanged, and `batchFinishArgs` gives the writes tier by tier, best position first, reading positions from the lists so a drag in the review writes where the game moved.

**Untiered items** (the drain): before the comparisons, a tier pass: one screen per item, the tier sheet of log-flow.md (its four rows) with the item's cover and title above, "{i} of {n}" in the header; a tap assigns the tier and moves on. Then the session continues as below.

## The session (134:30)

- Full-height screen in the onboarding stack. Header, padding sides 16 bottom 8: `x` 20 on the left (44pt region) and, centered, the 160 by 4 progress bar with "About {remainingEstimate(state)} more to place everything" 13 `text/secondary` under it; the bar fills as questions are answered against the first estimate.
- The stage centered vertically, column gap 16: the `TierChip` of the question's tier; the prompt 22 bold centered from `comparisonPrompt` (the genre form when the pair shares a genre); the pair as the log flow's two cards (`CompareCard`): a new item's subtitle is "just played", an existing one's is "ranked #{global rank} · {score}"; the two hatches as in log-flow.md ("Too close to call", "Can't compare these"); then, 8 below, "Place the rest for me" 15 `text/secondary` centered as a `TextButton` with a 44pt region.
- A tap on a card calls `answerBatch(state, 'a' | 'b')`; the hatches call `answerBatch` with `too_close` and `cant_compare`. Crossfade to the next question as the log flow does. When `nextQuestion(state)` is null, go to the review.
- "Place the rest for me" and the `x` both call `placeRest(state)` and go to the review; nothing is written yet. Reduce Motion: no crossfade.

## The review (135:185)

- Header column gap 6: "Look right?" 28 bold; the meta line 15 `text/secondary`: "{new} new · {provisional} placed by us · drag to fix", or "{new} new · drag to fix" when nothing is provisional; when the ranked count will reach ten with this session, the meta line reads "Ten ranked." in `text/primary` 15 medium instead (the pick's line comes with the finder).
- The list is built from `applyBatch(state)` merged into the existing tier lists, then cut to what matters: every new row, with up to two existing rows above and up to two below it as anchors; stretches of existing rows between anchors collapse into one row "· · ·  {k} more  · · ·" 13 `text/secondary` centered, which expands in place on tap. A user with three ranked games sees all three. Tier dividers as in ranking.md (the `TierChip` and a hairline).
- Rows as the ranking rows (global rank 17 `text/secondary` width 28, `Cover` 40, title 16 medium, meta 13 `text/secondary` "{year} · {first genre display name}", the `ScoreBadge`, the `≡` drag handle 16 `text/secondary` at the end): an existing row has no background; a **new row** has `medium/games` at 12 % opacity as its background, radius 8, padding 6 vertical 8 sides (existing rows share the padding without the fill so the columns align); a **provisional** row (`placedBy === 'prior'`) carries the fill and, instead of the badge, "≈ {score}" 15 semibold `text/secondary`. Scores from `scoreForPosition` over the merged provisional lists.
- Drag: long-press on a row's handle reorders within its tier using the sortable list the Ranking tab already uses (`react-native-sortables`); a drag across a divider is refused (the row springs back) because tiers are chosen, not dragged. A dragged row becomes `placedBy: 'user'` and loses its `≈`. Collapsed rows are not drag targets; expand first.
- "Done" (primary, regular) then "Rank more" 15 `text/secondary` centered (`TextButton`): Done writes one `finishInsertion(client, { ...args, placedBy })` per new item in tier order, from the arguments `applyBatch` returns (`insertionToFinishArgs` per game: the item's final position and its own log of answers), then `invalidateRanking` for each, logs `ten_ranked` if the count crossed ten, and pushes the next screen of the stack (Link Steam or the tabs for a new user; back to where the door was for a returning user). A failed write shows an `ErrorLine` under the button, keeps Done enabled, and retries only the failed items. "Rank more" goes back to the deck page (returning) or to Search's add-many intent.

## Notes

- Every answer is an event and reaches the database inside `finishInsertion`, exactly as the log flow does; nothing is written during the session, so closing the app mid-session loses only the unwritten batch, and the played entries written by the deck page remain in the drain for next time.
- The `placedBy` mark is what later insertions read to prefer provisional pivots (PR 3's `tier_list` returns it; `choosePivot` in core takes a `preferProvisional` hint if PR 2 added one, else nothing changes here).
- No copy says "personalized". The header's count is an estimate and says "About".

## Two builds, one stack: the hand-off (2026-10-07, after PR #73)

PR 4 is built as two halves in parallel worktrees, each from `main`. **Build A** owns `app/onboarding/_layout.tsx`, `media.tsx`, `platforms.tsx`, `seeds.tsx`, `deck.tsx`, `steam.tsx`, the folder `screens/onboarding/` except `session/`, the Ranking empty-state doors and Search's add-many intent. **Build B** owns `app/onboarding/session.tsx` and `review.tsx`, the folder `screens/onboarding/session/`, and the Ranking banner. Expo Router registers both agents' routes from their files, so neither edits the other's layout file; B's two routes take the stack's default options.

The seam is one module B writes and A calls, `screens/onboarding/session/session-store.ts`, whose shape is fixed here so both can build at once:

```ts
export type SessionSource = 'seeds' | 'deck' | 'drain' | 'add-many';
export interface SessionItem { mediaItemId: string; tier: Tier | null; row: OnboardingGameRow }
export interface SessionRequest { source: SessionSource; items: SessionItem[]; onDone: 'steam-or-tabs' | 'back' | 'deck' }
// A module-level store (a tiny zustand-free holder: a variable plus a subscribe), not the router's params.
export function startSession(request: SessionRequest): void   // A calls this, then router.push('/onboarding/session')
export function useSessionRequest(): SessionRequest | null     // B reads it on the session screen
export function clearSession(): void                           // B clears it after the review's Done
```

`OnboardingGameRow` is the row shape `@verso/api` exports from PR #73 (`deckCandidates`, `playedNotRanked` return it with extras); A passes the deck rows it already has, so B never refetches covers. `onDone` says where the review goes after its writes: `steam-or-tabs` for the new user's stack (Link Steam when the profile has PC and no link, else the tabs), `back` for the drain and add-many, `deck` for the seeds (the seeds' review is skipped, see onboarding.md). B's screens are mounted inside A's stack, so B uses the same header conventions (no native header, the `x` or the progress in its own top row).

The query keys and invalidation helpers PR #73 put in `@verso/api` (`onboardingQueryKeys`, `invalidateOnboarding`, `invalidateProfile`) are folded into `apps/mobile/src/lib/query-keys.ts` and `invalidate.ts` by **A**, in the first commit of its branch, and B imports them from `@/lib` as every screen does; until A's PR merges, B imports them from `@verso/api` and says so in its PR.

One nuance from PR #73: `batchPredictions` reads the stored ranking only, so the tiers tapped in the current session do not shape the guess yet. The session still starts from the engine's guess for items it has scores for; items with no score use binary insertion. Recorded as a follow-up for the harness, not a blocker.

## Deviations from the frames (2026-10-07, the session agent)

- Frame draws the `≡` handle on every review row; do it on the new rows only, with a blank 44pt column on ranked rows so the scores stay in one column. The ranked rows' order is the Ranking tab's to change, and `batchFinishArgs` needs it kept.
- Frame draws a drag across a divider springing back; do one sortable list per tier with no over-drag, so a row cannot be carried past its divider and settles inside its own tier.
- Frame draws every stretch between anchors folded; do fold only runs of four or more ranked rows, so a fold always saves lines and a user with three ranked games sees all three. A tier the session did not touch folds whole when it holds four or more.
- Frame draws 8 of padding on both sides of a new row; do 8 on the left and let the handle's 44pt region be the right side, so the handle meets the touch target without widening the row.
