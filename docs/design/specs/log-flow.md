# Log flow: tier sheet, comparisons, confirm

Frames `F · Log · tier sheet` (26:348), `F · Log · compare` (26:385), `F · Log · confirm` (26:415). Route `app/log/[id].tsx`, a form sheet that opens at the tier step and expands to full height for the comparisons and the confirm step: one continuous surface from "I finished this" to placement (ui-principles, "Things Rafa specifically wants"). Owner: Log flow agent. The game page pushes this route after `markFinished`. Read [README.md](README.md) first.

**2026-10-22 (VER-224, [feature-ideas item 13](../../feature-ideas.md#13-rank-this-not-i-finished-this)).** Built. The flow runs from "Rank this" to placement, not from "I finished this": the game page pushes this route after `startRanking`, which never writes a finished date and leaves a Playing or Dropped game in its status, so a game is not necessarily finished when it is ranked. The left card's subtitle for a game reads "ranking now" (Spanish "clasificando ahora"), not "just finished"; a film keeps "just watched". Closing early leaves the game unranked in whatever status `startRanking` left it. The lines below are kept as written; where they say "just finished" or `markFinished`, this note wins.

## Step 1, the tier sheet (26:348)

- The sheet at about 44% of the height (top at 489 of 874): `bg/canvas`, top radius 24, grabber, padding top 12, sides 16, bottom safe area, column gap 10, centered.
- "How was {title}?" 20 bold centered.
- Four rows, `bg/surface`, radius 14, padding 14, row gap 12: a 28pt dot in the tier color (`tier/loved`, `tier/liked`, `tier/fine`, `tier/disliked`; tier icons come later, dots for now), the label 17 semibold ("Loved it", "Liked it", "It was fine", "Didn't like it"), `chevron-right` 16 `text/secondary`.
- Tap a tier: load `tierList(client, 'game', tier)`, build `RankableItem`s (`id` = `media_item_id`, `genres`) and the new item from `gamePage` (`id`, `game.genres`), call `startInsertion(tier, newItem, list)`, expand the sheet to full height, show step 2. An empty tier skips to step 3 (the engine is `done` at once).

## Step 2, compare (26:385), full height

- Padding sides 16, top and bottom safe areas.
- Top row (bottom padding 8): `x` 20 on the left closes the flow; the game stays played and unranked, nothing to confirm. Centered: a row of dots, one per `maxQuestions(list.length)`, 6pt with gap 6, the answered ones filled `text/primary` and the rest `border/separator`, and under them the `TierChip` for the chosen tier (rule 33; the frame's "1 of ~3" counter is dropped, Rafa 2026-09-16).
- The stage (prompt, pair, hatches) is centered vertically so the cards' midpoint sits on the screen's midpoint (approved 2026-09-16); the frame's 156pt spacer is that centering at this height. Stage column gap 16:
  - The prompt 22 bold centered: `comparisonPrompt(state)`, "Which did you enjoy more?" or "Which RPG did you enjoy more?". 22 so the genre form fits on one line.
  - The pair, row gap 12, two cards flex 1, `bg/surface`, radius 16, padding 12, column gap 8, centered: `Cover` 140 (radius 10); title 16 semibold on one line, ellipsized; subtitle 13 `text/secondary`; a genre tag (`bg/placeholder` pill, padding 8 sides 3 vertical, 12 semibold `text/secondary`) showing `genreCue(state)` on both cards only when it is not null.
  - The left card is always the new game, subtitle "just finished". The right card is the pivot, `state.list[state.pivotIndex]`, subtitle "ranked #{global rank} · {score}" with `scoreForPosition(tier, pivotIndex, list.length)` and the global rank from the better tiers' sizes (load the other tiers once from `['ranking']`; until then show the score alone).
  - Escape hatches, row gap 12: two small secondary Buttons flex 1 (14 medium, vertical padding 12): "Too close to call" → `answer(state, 'too_close')`; "Can't compare these" → `answer(state, 'cant_compare')`. Secondary on purpose (rule 12).
- Tap the left card → `answer(state, 'a')`, the new game wins; the right card → `answer(state, 'b')`. A short press-scale on the tapped card and a crossfade to the next pair (Reanimated); the pair never slides in from the side.
- When `state.done` becomes true → step 3.

## Step 3, confirm (26:415), full height

- Header column gap 6, bottom padding 20: "Look right?" 28 bold; "{title} lands at #{global rank} in {Loved | Liked | Fine | Didn't like}. Nudge it if that feels off." 15 `text/secondary`.
- Neighbors: `applyInsertion(state)` sliced to two rows above and two below the new game (fewer at the ends). Rows with padding 12, gap 12: global rank 17 `text/secondary` at width 22, `Cover` 40 (radius 6), title 16 medium flex, score 15 `text/secondary`. The new game's row: `bg/surface`, a 2px `medium/games` border, radius 14, rank 17 bold `text/primary`, title 16 semibold, score 15 bold `text/primary`. Scores from `scoreForPosition` over the provisional list (tier size + 1).
- Nudges row, top padding 20, gap 12: small secondary Buttons "▲ Move up" and "▼ Move down" (15 medium, vertical padding 12). Each moves the provisional insertion index by one within the tier, clamped, and re-renders the neighbors and scores; disabled at the ends and when the tier was empty. Local only until Done.
- Spacer, then the contrast Button "Done" (regular size) → `finishInsertion(client, insertionToFinishArgs({ ...state, insertAt }, ids))` with the nudged index, then `invalidateRanking(queryClient, id)` and dismiss. The game page behind shows the ranked state. On failure show a one-line error and keep Done enabled.
- Empty tier: a single highlighted row and the text "First in {tier}"; nudges disabled.

## Notes

- Every answer is an event: the engine's `records` reach the database inside `finishInsertion`; never write comparisons separately, and never call `insertRankingEntry` from this flow.
- Closing at any step leaves the game played and unranked; the game page then offers "Rank it" (see game-page.md).
- Genre matching ignores "Indie" upstream (`DEFAULT_IGNORED_GENRES`); nothing to do on screen.
- The `ids` map for `insertionToFinishArgs` is the identity when `RankableItem.id` is the `media_items` id, which it is here.
