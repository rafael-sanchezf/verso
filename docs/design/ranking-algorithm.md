# Ranking algorithm: the options explained

Written 2026-09-07 to make the options in [docs/research/beli-ranking-algorithm.md](../research/beli-ranking-algorithm.md) concrete enough to decide on. Uses a running example of one user's list of played games.

## The problem in one sentence

Given a new game the user just finished, and a list of games they have already ranked, figure out where the new game belongs by asking as few "this one or that one?" questions as possible, and turn the resulting position into a 0 to 10 score.

2026-10-22 (VER-224, [feature-ideas item 13](../feature-ideas.md#13-rank-this-not-i-finished-this)): read "just finished" here and "finishes" in the example below as "chose to rank". The app no longer ties ranking to finishing: the game page's button is "Rank this", ranking never writes a finished date, and a game still in Playing or one that was dropped can be ranked. Nothing in the engine changes; it never knew about finishing.

## What Beli does (the baseline)

Beli's system is two ideas stacked on top of each other.

**Idea 1: tiers first.** Before any comparison, the user picks a bucket: liked it, it was fine, did not like it. This does two jobs. It shrinks the list the new item has to be compared against (only games in the same tier), and it fixes which band of the 0 to 10 scale the score will land in. A game in "liked it" can never score below a game in "it was fine," no matter how the comparisons go.

**Idea 2: binary-search insertion inside the tier.** The tier already holds an ordered list of games. To find where the new one goes, the app shows the game in the middle of that list and asks "which is better?" The answer throws away half the list. It repeats on the remaining half until there is only one gap left. That is where the new game is inserted.

The number of questions is roughly log2 of the tier size. A tier of 8 games takes 3 questions. A tier of 64 takes 6. A tier of 500 takes 9. This is why Beli feels fast even for people with hundreds of restaurants.

**The score** is then read off the position. If the "liked it" band is 7.0 to 10.0 and a game is ranked 3rd of 10 in that tier, it gets a score near the top of the band. When an 11th game is added, everyone's score shifts slightly because the positions are re-spread across the same band. There is no hidden strength number. The list order is the only state.

## Worked example

Suppose the user's "liked it" tier already contains eight games in this order, best first:

1. Hades
2. Elden Ring
3. Outer Wilds
4. Celeste
5. Baldur's Gate 3
6. Hollow Knight
7. Tunic
8. Stardew Valley

The user finishes Slay the Spire and puts it in "liked it." The search goes:

- **Question 1**, midpoint of positions 1 to 8, which is Celeste (position 4). "Slay the Spire or Celeste?" User picks Slay the Spire. So it belongs in positions 1 to 4.
- **Question 2**, midpoint of 1 to 4, which is Elden Ring (position 2). "Slay the Spire or Elden Ring?" User picks Elden Ring. So it belongs in positions 3 to 4.
- **Question 3**, midpoint of 3 to 4, which is Outer Wilds (position 3). "Slay the Spire or Outer Wilds?" User picks Outer Wilds. So it goes into position 4, between Outer Wilds and Celeste.

Three questions, done. Slay the Spire is now 4th of 9 in the tier, and its score is interpolated inside the "liked it" band accordingly.

Notice what happened in question 2: a roguelike deckbuilder was compared to an open-world action RPG. That is the cross-genre problem. The user probably can answer it, but the answer means something fuzzier than "Slay the Spire or Hades?" would.

## Option A: Beli's flow with genre-aware pivots, escape hatches, and a confirm step

Keep everything above, and change three things.

**Smarter pivot choice.** At each step, the search has a range of eligible positions (1 to 8, then 1 to 4, then 3 to 4 in the example). Plain binary search always asks about the exact midpoint. Option A instead looks at the eligible games and prefers one that shares a genre with the new game, as long as it is not too far from the midpoint. If Hades (roguelike) is at position 1 and the range is 1 to 4, the midpoint is 2 or 3, and Hades is at 1, that is within reach, so ask about Hades instead of Elden Ring. This costs at most one extra question in the worst case and makes most comparisons apples to apples.

The important property: it is still one global list. Genre only influences which question gets asked, never where the game is allowed to land. Any genre view is a filter over the single order.

**Two escape hatches with defined meaning.**

- "Too close to call" ends the search and places the new game directly below the game it was being compared to. It treats the two as effectively tied.
- "Can't compare these" swaps in a different eligible game from the same range, preferring one that shares a genre, without narrowing the range. After two of these in a row, the search stops and places the game at the middle of the current range.

**Confirm step.** After insertion, show the new game between its two neighbors: "Slay the Spire lands between Outer Wilds and Celeste. Look right?" with up and down nudges. This catches the one careless tap that would otherwise silently misplace a game forever, which is a known Beli and Flickchart failure.

Strengths: fewest taps, deterministic, instantly explainable ("it's between X and Y"), trivial to build. Weaknesses: no memory of contradictions. If the user says Slay the Spire beats Outer Wilds today and Outer Wilds beats Slay the Spire next month during a different insertion, nothing notices. Scores drift every time anything is added, which is fine for a personal list but produces fake precision like 8.2 vs 8.3.

## Option B: rank within genre buckets, stitch a global list

Take the genre complaint literally. Every game gets one primary bucket (a genre cluster, or a "mood" the user picks: story, competitive, cozy, puzzle, and so on). Insertion is the same binary search as Option A, but restricted to the bucket, so every question is within-bucket.

To produce one global 0 to 10 across buckets, the app occasionally asks anchor questions across buckets, for example when a bucket reaches 3, 6, or 12 games: "your favorite puzzle game, or your third-best RPG?" Those anchors fit a per-bucket offset that says roughly how the user values one bucket against another, and each bucket's list is placed on the global scale using that offset.

Strengths: comparisons are always sensible, "can't compare" nearly disappears, works well for users with strong genre identities and large libraries. Weaknesses: multi-genre games need a single primary bucket, tiny buckets get coarse scores, and the global list is explicitly approximate ("blended"). Beli's critics ask for exactly this, so if we ship A first, expect requests for B.

## Option C: a latent score model with an ongoing refine loop

Stop thinking of ranking as inserting into a list. Instead, every game has a hidden strength number with an uncertainty around it. Every comparison the user ever answers is stored, and the strengths are re-fit from all of them (Bradley-Terry is the standard model; TrueSkill is the Bayesian cousin). The displayed list is the strengths sorted.

Logging a game asks for the tier (which seeds the starting strength) and three to five comparisons chosen to be maximally informative, favoring same-genre opponents early. The game appears with a score and a visible confidence indicator ("needs 3 more comparisons"). At any time the user can open a refine mode and answer quick matchups, Flickchart style, and every answer can move any game.

Genre is handled inside the model as a per-genre offset for that user, so the fit can explain "this user systematically favors RPGs" without forcing bucket choices.

Strengths: tolerates inconsistent answers, gives confidence, supports endless casual refinement, and the same latent scores later power predicted scores and friend match percentages in the social layer. Weaknesses: a new game does not get a crisp position until several comparisons are in, scores are harder to explain than "between X and Y," and Flickchart shows that if the comparison prompt is inconsistent, users end up with a chart that never settles.

## Your proposal, and how it maps

The proposal from 2026-09-07: use genre as an extra pivot when there is enough data. If the genre has enough ranked games, run the five to seven comparisons within that genre. If not, compare against whatever the user has already ranked. Always keep an escape hatch.

This is Option A's genre-aware pivot rule with a threshold, and it is the right instinct. One detail needs a decision, because "compare only within genre" and "one global list" pull against each other.

Return to the example. Say the user has five roguelikes in the "liked it" tier and the threshold is five, so the search for Slay the Spire runs only against roguelikes. Suppose the roguelikes sit at global positions 1, 6, 9, 14, and 20 in the tier, and the search concludes Slay the Spire is better than the roguelike at position 9 and worse than the one at position 6. The genre search is finished, but positions 7 and 8 are non-roguelikes the game was never compared against. Where exactly does it go?

Three ways to resolve the gap:

1. **Place adjacent to the winner.** Put it at position 7, right below the roguelike it lost to. Cheapest, zero extra questions, but the placement relative to positions 7 and 8 is arbitrary.
2. **Spend one or two more questions on the gap.** Run a short binary search over the non-genre games in the gap (here, positions 7 and 8). This is the most accurate and usually costs one extra question. It is also exactly what Option A's "prefer genre peers, fall back to midpoint" rule produces naturally: the search prefers genre peers while there are any in range, then falls back to whatever is left.
3. **Place at the gap midpoint.** Split the difference with no questions. Same cost as 1, slightly less biased.

Recommendation: implement your rule as Option A's pivot preference with a threshold rather than as a hard "genre only" filter. Concretely, at each step, if the current range contains a same-genre game, ask about that one; if it does not, ask about the midpoint. With a threshold of five or more genre peers in the tier, the first three or so questions will naturally be within genre, and the last one or two will resolve the exact slot against neighbors. That gives you the within-genre feel you want, keeps one truthful global list, and never asks more questions than plain binary search plus one.

The "can't compare" hatch then covers the remaining odd matchup, and the "too close" hatch covers real ties.

## Things to fix regardless of option

- **One comparison prompt, printed on screen.** Flickchart users who mixed "which is better" with "which did I enjoy more" got unstable charts. Candidate: "Which would you rather play again tonight?" Decide the wording once.
- **Store every comparison as an event** (winner, loser, timestamp, context such as "same genre" or "too close"). Option A only needs the list order, but the log is what makes moving to Option C a recompute instead of a data loss.
- **Show neighbors, not just the number.** "Sits between Outer Wilds and Celeste" is more legible and more honest than 8.3.
- **Backlog never touches ranking.** Beli's Want to Try list is completely separate from the ranked list. Keep ours the same.
- **Four tiers, not three.** Beli's most-requested change. Loved, liked, fine, did not like. Each owns a fixed band of the 0 to 10 scale.

## Recommended decision

Ship Option A for V0 with the genre-preference rule described above, four tiers, both escape hatches, the confirm step, and a full comparison log. Revisit Option B if users ask for genre-only lists, and Option C when the social layer needs predicted scores and match percentages, since by then the comparison log will be large enough to fit a latent model well.

Amended 2026-09-24: the social layer does not need Option C. Predicted scores and match percentages come straight from the positional scores, which are already per-user percentiles, and a per-user latent model fit on the insertion log has no unique answer, because binary insertion never asks a question the current order would contradict. Option C stays a possibility only as a pooled, cross-user model once items commonly have dozens of rankers. The reasoning and the design are in [recommendation-engine.md](recommendation-engine.md).


## The batch session (2026-10-06)

Rafa's ask, from the bulk-entry reaction of 2026-10-06: a user marks ten games as played and gives each a tier; then the app asks an optimized number of comparisons over all of them at once, "five or so, or you can get the number to get it right", instead of tier, comparisons, confirm for each game in turn. This section says what the number is and what a budget below it buys.

**What the tiers already pay for.** Comparisons happen inside a tier (Option A inserts into the tier's list), so the tier taps split the problem into four small sorts and nothing is ever asked across tiers. Most of a game's score is the band its tier owns; the position inside the band moves the score by at most the band's width.

**The floor.** Ordering n items needs at least ceil(log2 n!) comparisons, and merge insertion (Ford–Johnson) meets that bound up to about eleven items:

| n | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 10 |
|---|---|---|---|---|---|---|---|---|
| ceil(log2 n!) | 1 | 3 | 5 | 7 | 10 | 13 | 16 | 22 |
| binary insertion, one by one | 1 | 3 | 5 | 8 | 11 | 14 | 17 | 25 |

The engine's binary insertion is within three of the floor at ten items, so no batching strategy halves the count; it changes which questions are asked first and lets the user stop.

**A worked session.** Three seeds already in Loved; ten games marked: 3 Loved, 4 Liked, 2 Fine, 1 Didn't like. Merging 3 into 3 by binary insertion: 2 + 3 + 3 = 8 at worst, about 7 on average. Four Liked from nothing: 5. Two Fine: 1. One: 0. About 14 comparisons at worst, 12 typical, for ten games: 1.2 to 1.4 per game, the same count the one-at-a-time flow would reach.

**Why five is not a cap.** Five answers distinguish at most 2^5 = 32 orders; a single tier of four already needs five. A hard cap of five would leave most of a ten-game session unordered. What five comparisons do buy, asked well, is the pairing pass: every game compared once with a neighbour in its tier, which settles the top and bottom of each tier and halves the uncertainty of every item.

**The order of asking.** Ask the comparison that resolves the most first: pair the items of the largest tier (n/2 questions), then insert the losers into the chain of winners by binary search, tier by tier from the largest. Genre-preferring pivot choice and both escape hatches apply as in Option A, and every answer is stored as the same event.

**The stop rule, and what fills the gap.** The session shows how many questions are left to place everything ("about 6 more") and has the ✕ on every question. When the user stops, every unresolved pair is treated as "too close to call" by the system rather than by the user: the items are placed in the order of their community prior (`item_prior`, the engine's layer 0) and marked provisional. Provisional rows show lightly in the review, where a drag settles them; later, when a new game is inserted into that tier, the pivot choice prefers a provisional item within reach of the midpoint, so ordinary use retires the marks without a separate chore. No synthetic comparison ever enters the log: only answers do.

**Cost against today's loop, per game.** Today: open the add sheet or the game page, tap the tier sheet open, tap a tier, answer about 1.4 comparisons, confirm, navigate to the next game, about seven taps. In the session: one tier chip on the deck row, about 1.4 comparisons, one review for the whole batch, about two and a half taps.

**What it needs.** In `packages/core`, a `batchSession` over a set of (item, tier) pairs: the question order above, the stop rule, provisional placement from a prior supplied by the caller, and `finishInsertion` as the write per game so an interrupted session loses nothing. In the database, a provisional mark on `ranking_entries` (a `placed_by` of `user` or `prior`) and the pivot preference that reads it. No change to the score, the bands, or the log.


### Estimate first, then ask (2026-10-06, later)

Rafa's challenge the same evening: fifty games should not mean fifty comparisons; guess the rest from what was answered, give the user a "place it for me" button, and let the review's drag catch the misses. The repo already holds the estimator.

**The guess.** Before any question, every marked game gets a predicted score on the user's own scale from `recommendation_scores` ([recommendation-engine.md](recommendation-engine.md)): the community prior (how people in general score it) blended with the user's content profile (what their own tiers say about genres, developers, decades), the blend weighted by how much the user has ranked. The profile is rebuilt from the tiers the user just tapped, so a batch of ten tiered games already informs the guess for each of them, and a returning user with thirty ranked games gets a much better guess than a new user with three seeds. The predicted score, read into the tier's band, gives every game a provisional slot with zero questions.

**Asking where the guess is weak.** Each insertion starts from the predicted slot instead of the tier's midpoint: compare the game with its predicted neighbour, and widen outward only when the answer disagrees (an exponential search from the guess, then binary search inside the bracket). The cost per game is about 2 + 2·log2(d), with d the number of positions the guess was off by: two questions when the guess is right and the game lands between two ranked games (one question cannot check both sides, as PR #72 showed; one at the top or bottom of a tier), four when it is off by one, and never worse than twice plain binary insertion when the guess is useless (this is the bound of Bai and Coester, "Sorting with Predictions", NeurIPS 2023). The session orders its questions by expected value: pairs whose predicted scores are closest and whose confidence is lowest first, so the early answers fix the most.

**Stopping.** "Place the rest for me" sits on every question. Stopping keeps the predicted order for everything unanswered, marked provisional; the answers given stand as the only events in the log. The soft target of about one question per game is a progress line, not a gate.

**The review.** Not the whole list (Rafa, 2026-10-06, later: a hundred ranked games must not mean a hundred rows): every new row, framed by about two existing neighbours above and below, the stretches between collapsed into a count that expands on tap; new rows highlighted in the medium color, provisional rows with a lighter mark, long-press to drag. A drag writes the user's placement and the row loses its mark; it is recorded as a placement event, not as a comparison. Later insertions prefer provisional rows as pivots when they sit within reach of the midpoint, so ordinary use retires the marks.

**What the guess is worth is measurable.** The leave-one-out harness already asks, per ranked item, how far the prediction was from the user's own score; adding the within-tier position error gives the number this design rests on, and the review's drags are the online version of the same measurement. Until there is data, the review is the safety net and the guess is a convenience, which is the honest order.

**Measured (PR #72, 2026-10-07).** On the worked example with perfect answers: 13 questions with no guess (14 at worst), 9 with right guesses, 14.8 on average with random guesses over a thousand trials (18 at worst), 17 with reversed guesses; every run lands the true order, and the header's estimate starts at 12 to 13 and never rises. Guesses are compared to the existing scores without being clamped to the tier's band, so a Liked game predicted 9.1 is guessed at the top of Liked.

**Fifty games, then.** Fifty tier taps on the deck pages (about two minutes), a run of questions the user ends when they like (ten questions is about half a minute), and one review. A full order by questions alone would have cost about 130 comparisons; the guess takes most of that off the table and the drag takes the rest.
