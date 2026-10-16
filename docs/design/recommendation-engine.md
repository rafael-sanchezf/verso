# Recommendation engine: how it would work

Written 2026-09-24 from [docs/research/recommendation-engine.md](../research/recommendation-engine.md), the way [ranking-algorithm.md](ranking-algorithm.md) was written from the Beli research: concrete enough to decide on, with worked numbers. It is the thinking behind idea 9 of [feature-ideas.md](../feature-ideas.md#9-ai-suggestions-personal-and-group), whose two-stage sketch (candidates in SQL, a model picks three and explains, a meter from day one) stands and is refined in three places named below. Nothing here is decided; the questions at the end wait for Rafa, with defaults. There is no data yet, so every constant is a starting value with the test that settles it, not a tuned number.

## The two problems, one sentence each

**Personal.** Given a user's ranked lists, predict for every item they have not tried where it would land on their own list, and pick three that fit the moment (medium, genre, time available, a service they pay for), each with a reason drawn from their own list.

**Group.** Given two or more people on a couch, find something none of them has seen, available to at least one of them, that every one of them would place high, and show each person their own number.

## What Verso already has that Beli had to build

The ranking loop has done the hard part. Star-rating products spend most of their modeling effort undoing the fact that one person's 7 is another's 9. Verso's 0 to 10 score is read off a position in a strict order, so every user's list spans the same range and every score is already a percentile of that user's taste. Criticker, the one comparable product that publishes its whole method, starts by converting each user's ratings into exactly this.

The rest of the signal, all stored today:

- **Tiers and positions** (`ranking_entries`): a full order per medium, the input to everything below.
- **The comparison log** (`comparisons`): its best early uses are not modeling. A per-user strength model fit on it is degenerate, because binary insertion never asks a question the current order would contradict, so the top item never loses and the fit has no unique answer. What the log does give: "too close" answers are real near-ties that equal spacing throws away; "can't compare" marks items that are not substitutes; and the whole log is a free held-out test set of real head-to-head judgments, which is how the engine gets evaluated.
- **Statuses and backlog** (`user_entries`): Dropped is a negative signal no star app has; the backlog is intent, which Beli says it feeds into recommendations.
- **Notes** (idea 3) and, for films, the diary: weak for accuracy, strong for the reason line and for a cached taste summary.
- **Catalog features**: genres, developer or director, cast, decade, platforms, runtime or time to beat, community scores by source, and streaming availability by provider and region. The filters of the movies Home ("On my services," "Under 2 h") are the group feature's hard filters already.

Similarities and predictions never cross media (rule 24, "same loop, own product"). Cross-media help is a labeled slot, below.

## The personal engine, layer by layer

Four layers, each switched on by the data a user has, each beating the one before it or not shipping. The model sits on top and never computes a score.

| Layer | What it needs | Switches on at | What it produces |
|---|---|---|---|
| 0. Community prior | Other users' rankings of the item; external scores as the fallback | Always | A shrunk average per item: the floor every layer must beat |
| 1. Content profile | The user's own tiers plus catalog features | About 5 ranked items in the medium | A score per item and the first reason ("three of your Loved games are roguelikes") |
| 2. Neighbors | Users who co-ranked 5 or more items with this user | About 10 ranked items; 3 or more neighbors who ranked the item | The collaborative score with a standard error |
| 3. Factors | Hundreds to thousands of active users per medium | Later, when items commonly have dozens of rankers | A pooled model blended with layer 2 |

### Layer 0: the community prior

For item x with n_x Verso rankers whose mean score is avg_x, and a global mean g:

```
m_x = (n_x * avg_x + C * g) / (n_x + C)        C about 5 to 20
```

When n_x is small, fall back to `external_scores` (IGDB, Steam, OpenCritic; TMDB for film and TV) rescaled to 0 to 10 through a quantile map fitted on items that have both. This is the Bayesian average Flickchart adopted after a film seen by three people outranked The Phantom Menace by seven thousand places, and the one Backloggd adopted in 2025. It is also the number the group feature shrinks a guest toward.

### Layer 1: the content profile

The user's weight on each item is its score minus their mean; the profile is the weighted sum of the item's features (genre, developer or director, cast, tags, decade, platform family), each feature discounted by how common it is in the catalog, and a feature counts only if it appears on two or more of the user's items. A candidate's content score is the cosine between the profile and its features, mapped onto the user's scale. It needs no other users, so it is the engine of the first months, and it writes the most legible reasons.

### Layer 2: neighbors, which is Criticker's method with three fixes

Criticker computes each user's percentiles, finds the users whose percentiles agree most on shared titles, and predicts a title's percentile as the average of the ten closest users who rated it, then reads that percentile back onto the user's own scale. Verso does the same on positional scores, with three fixes Criticker lacks.

**Fix 1, shrink small overlaps.** Two users who share eight items are mostly noise: the 95% range on a correlation of 0.74 at eight items runs from 0.07 to 0.95. Multiply every similarity by n_uv / (n_uv + beta), where n_uv is the count of co-ranked items and beta is the overlap at which a similarity counts half. The textbook constants (50 to 100) were set at Netflix scale and would zero out every pair Verso will have for a year; beta near 10 is the starting value. Compute no similarity below five shared items, or below 10% of the smaller list, so a 300-item user does not match a 6-item user on five blockbusters. Keep positive similarities only.

**Fix 2, damp the prediction.** With b_ux the user's baseline for the item (their mean at first; later the mean plus user and item offsets), N the user's top neighbors who ranked x (up to 30, at least 3), and sim' the shrunk similarity:

```
pred_ux = b_ux + sum over v in N of sim'(u,v) * (s_vx - b_vx)
                 / ( sum over v in N of |sim'(u,v)| + lambda )
```

Worked: user A has a mean of 6.375 and has not ranked X. Three neighbors ranked it: B (sim' 0.33, deviation +2.5), C (0.50, +2.1), D (0.20, -0.9). Undamped, the prediction is 8.02. With lambda = 1 it is 7.21; the damping keeps one neighbor with a similarity built on eight shared games from swinging the number by a point.

**Fix 3, carry a confidence.** The same numbers give an effective neighbor count (2.66 here) and a standard error (0.77, so "about 7.2, give or take 1.5"). Shown as a label, never an interval: High (standard error under 0.75 and five or more effective neighbors), Medium, or Needs more data (fewer than three neighbors, an error over 1.5, or fewer than ten items ranked). Lists sort by prediction minus one standard error, so a confident 7.5 outranks a wild 8.0.

### Read the number back through the user's own list

A prediction is a percentile. Instead of a bare number, find the position that percentile would take in the user's list and say so: "would land between Outer Wilds and Celeste, probably Liked." The number sits small beside it. This is Criticker's translation step and the ranking design's rule to show neighbors rather than a score, and it gives the predicted tier for free.

### Blending, without a switch in code

The three scores combine by how much each can be trusted: the prior at a fixed weight, the content score weighted by the user's item count and its own measured accuracy for that user, and the neighbor score weighted by the total similarity behind it. With no neighbors the neighbor weight is zero and the user gets content plus prior; as neighbors accumulate they take over. The weights can later be fit by a regression on the harness's leave-one-out predictions, which is the one-developer version of Netflix's two-model blend.

### Every insertion is a prediction (Rafa, 2026-10-15)

Rafa's idea, from a voice note of 2026-10-14: with no crowd to learn from, make each ranking action a training example for that one person. When someone ranks their fiftieth film, the engine first says, from the forty-nine already placed, where this one would land; the person then places it; the gap between the two is the learning signal and, summed over a list, the measure of how well the engine knows that person. Fifty ranked films are fifty prediction-against-outcome pairs from one user, with no other user needed.

**What already exists.** The content profile (layer 1) is exactly the per-user model the idea needs, built from the features that carry the load when there are no neighbors: genre, director or developer, cast, decade, platform family. `prediction_log` stores a prediction with its confidence, model version and components, and its outcome joins from `ranking_entries` later. The leave-one-out harness `recommendation_loo` already scores every item of a list against the rest. `batch_predictions` already makes the engine's guess for every item of a batch session. The blend above already says the content score is weighted by "its own measured accuracy for that user". What is missing is the measurement itself, taken the honest way.

**What is new, in three pieces.**

1. *A prospective row at every insertion.* The harness is retrospective: it holds one item out of the finished list and predicts it from everything else, including items ranked later, which is hindsight. The idea's row is written at the moment of insertion, from the list as it stood then, with the outcome unknown: `prediction_log` gains the surface `insertion`, and `finish_insertion` writes one row per placement (predicted score and tier, confidence, `components` with the list size and the content and prior parts) before it places the item. Inside `finish_insertion` rather than in the app, so every path writes it: the log flow, the batch session, the seeds, the Letterboxd import. The outcome is the placement, joined as today. One `recommendation_scores` call over one item is a few milliseconds; the harness ran the full candidate pass over 70,000 games in about 0.4 s.
2. *A calibration view per user and medium.* Over the insertion rows: the tier hit rate (predicted tier against the tier the item landed in), the absolute error on the score, both split by the list size at the time (under 5, 5 to 9, 10 to 24, 25 to 49, 50 and up) and by the confidence label, so the view answers whether "high" lands closer than "medium" and at what list size the content profile starts beating the person's own mean and the community prior. The same split by `model_version` is the before-and-after for any change to the scorer.
3. *The content weight from the measurement.* The blend's per-user content weight comes from this view instead of a constant: a person whose insertion rows show the content profile at half the error of their mean gets a heavier content weight than one whose rows show no gain. This is the regression on leave-one-out predictions the blend already anticipates, fed by prospective rows instead.

**Worked.** A list of 49 films, mean 6.4. The fiftieth is a 2019 Korean thriller; the profile has weight on the director, on thriller, and on the 2010s, each discounted by catalog frequency. `recommendation_scores` says 7.3, "would land between Prisoners and Zodiac, probably Liked", confidence Medium, prior 7.8 (the film is widely loved). The person places it at #12 of 49, score 7.6: error 0.3 for the content score, 0.2 for the prior, 1.2 for the mean. One row, three errors, the list size 49 in `components`. At 300 such rows across a dozen testers the calibration view is the first real number on the engine, before a single neighbor exists.

**One rule the idea needs.** The prediction is written at insertion and never read during it. If the guess chose the pivot or the starting tier, the placement would lean toward the guess and the row would confirm the engine rather than test it, which is the bias Rafa named. Ranking stays Option A: the person's comparisons alone place the item; the batch session's provisional placement by `item_prior` is already marked `placed_by` and is excluded from the calibration view until the person confirms it.

**Caveats.** Below five items the profile is empty and the row carries the prior and the mean only, which is still a data point about the prior. A Letterboxd import inserts in file order, not in the order the person formed their taste, so its rows are kept but flagged by `components.source` and reported separately. A "too close" or "can't compare" placement is a looser outcome and is marked as such.

**Cost.** One migration (the surface check, the write inside `finish_insertion`, the `prediction_calibration` view, pgTAP for the write on every insertion path and for the view's splits), about half a day in one PR, no app change. The blend's weight (piece 3) waits until the view has rows from more than one person. Inferred and flagged: that the write belongs in SQL rather than the app, and that the view's list-size bands are the five above.

### The model's job: pick three of thirty and say why

The research is consistent from 2023 to 2026: a language model ranking a whole catalog does worse than a trained model, and it invents titles (from under 3% on a famous film catalog to about half on an obscure product catalog); the same model choosing among twenty to thirty retrieved candidates does well, favors niche items, and writes reasons that measurably raise trust and clicks when they cite the user's own items. Generic reasons score below no reason at all. So:

- SQL owns the score and returns about 30 candidates, each with its predicted score, confidence, and a "why retrieved" field (a neighbor, a content match, the prior).
- The Edge Function labels them c01 to c30 and declares the three picks and the "because" items as enum fields in the structured output, so the model cannot name anything outside the list; the server renders every title itself and falls back to SQL's top three with a template reason if validation fails.
- The prompt carries a cached taste summary of 150 to 250 tokens per user and medium (rebuilt by a batch job when the list changes), the user's top tier, two or three recent decisive comparisons, and the request. Never the raw log: models do not read order well.
- The reason cites one or two of the user's own items, names one shared trait, stays under about 25 words, and carries the confidence label; a low-confidence pick is labeled "a stretch."
- Thinking off. About 2,500 tokens in and 200 out, which is $0.0035 a request on Claude Haiku 4.5 and $0.009 on Sonnet 5 at the 2026-09-24 prices, so a heavy user costs about a dime a month and the `suggestion_requests` meter keeps the worst case in cents. Recheck prices when it is built. (2026-10-08: on Claude Haiku 5.5 thinking is adaptive at effort low and a request is about $0.0007; see the change note under PR B.)
- Test the model's three against SQL's top three by interleaving them in one slot, not by an A/B split, which needs a hundred times the users. Verso has a label no click can match: whether a recommended item is later ranked, and in which tier.

## Where the AI is

Rafa asked 2026-09-24 where a language model fits, since the engine above is mostly arithmetic, and whether that framing holds up outside the engineering. It does hold: collaborative filtering is machine learning, and the stage-5 factor model is a trained one. A language model earns its place in seven spots, ordered by how visible each is to a user, each grounded on SQL candidates and fixed ids because a model asked to recommend from an open catalog invents titles (from under 3% on a famous film catalog to about half on an obscure one). None of these is scheduled; each names the stage it belongs to so it lands when that stage does.

1. **Ask in plain language.** "Something like Hades but chill, under two hours, four of us" parsed by the model into the SQL filters and soft preferences (genre, mood, time, player count, services), with follow-ups ("why not Celeste?", "something older"). The movies Home already asks "What do you want to watch?" with chips (its Ask-led variant C is this as a form), and idea 9's request sheet has genre, time, and group; the free-text field is the addition. Stage 1 for one person, stage 3 for the room. Not before the chip version ships.
2. **The reason line.** The model picks three of about thirty candidates and says why in the user's own terms. Stage 1; already in "The model's job" above.
3. **Your taste in a paragraph.** The cached summary per user and medium that every prompt carries, written from tiers, notes, comparisons, and what was dropped, is also a product surface: Beli's Taste Profile as prose on Profile, shareable, refreshed when the list changes; year-in-review grows from it. Stage 1 as the cache, the Profile surface whenever Profile is next touched.
4. **The group card.** Each group pick gets a pitch written for the people in the room ("you loved Heat, Sam picked Collateral, this has the same nighttime LA"), and the guest's free text is parsed by the model. The model never computes the group rule. Stage 3.
5. **Reading the catalog.** A batch job writes the shared mood and theme vocabulary (40 to 80 tags across IGDB themes, TMDB keywords, and book subjects) and the text embeddings in pgvector. This is what makes "something cozy" and "games like Outer Wilds" work beyond genre labels, and it is the bridge for "Because of your games." Invisible to the user; stage 4.
6. **Notes into highlights.** "What stood out?" notes (idea 3) parsed into the one-tap highlights of idea 5 (story, gameplay, art, music, multiplayer) so a free-text note feeds the content profile and the reasons without a second prompt. With idea 3's note step, or stage 4.
7. **A model as judge** in the evaluation harness, scoring picks and reasons offline before interleaving decides. Stage 0, optional.

The framing in one line, for a pitch: the math finds what people with your taste actually love, from head-to-head data no star-rating app collects; the AI understands what you are asking for tonight and explains the answer in your own words. The defensible part is the comparison data and the taste graph; the model is rented and any competitor can rent it, so the pitch is AI over a signal nobody else has, not AI on its own.

## Match: the number between two friends

The roadmap schedules a match percentage in V2. Beli's is the cautionary tale: a reviewer in 2026 wrote that a friend "has 10 restaurants ranked similarly to me but we have a -11% match." A mean-centered correlation over shared places explains that without a bug: two people who both loved the same five places in a slightly different order correlate negatively, because the metric scores only the order and discards the level at which they agree, and at ten shared items its noise is about plus or minus 0.33 anyway.

Verso's version counts agreeing head-to-heads, which is what a head-to-head product should count. For two users' shared items, Kendall's tau is the share of item pairs they order the same way minus the share they order differently; (1 + tau) / 2 is the share of head-to-heads between those items the two would answer the same way. Displayed:

```
match = 50 + 50 * tau * n_uv / (n_uv + beta)
```

Chance is 50%, it can never go negative, and it reads as "you pick the same winner 64% of the time, adjusted for how few games you share" (the worked pair in the research: eight shared games, 23 of 28 pairs ordered the same way, tau 0.643, shrunk to 64%). Rules: hidden below five shared items; the overlap count beside it ("over 8 games"); the items the two agree and clash on listed under it, which is Criticker's transparency and what the third-party Letterboxd tools show; and "you both loved" as the headline when it applies, so two friends with the same top tier never read as strangers. Pearson is one aggregate in Postgres; tau needs a self-join per pair, trivial at hundreds of users and precomputed for friend pairs and top neighbors at thousands.

## The group engine

Nobody in the comparable set does this with taste. Beli has not shipped a group feature; Netflix answered the household with profiles; Letterboxd intersects watchlists; the swipe apps require a unanimous yes over a catalog they know nothing about; Spotify Blend takes turns, which suits a playlist and not one film. The only large deployed movie-group study, PolyLens on MovieLens in 2001, found that 257 of 338 groups were pairs and 94% of users wanted to see each member's own number beside the group's. Verso already knows each member's taste in the form a group rule needs: comparable per-person scores with a confidence.

### A session, not a group

Who is present, the medium, the region, the union of services, the time available, genres in or out; for games, the platform in the room and whether the players are on one couch or online. PolyLens users asked for temporary subgroups, and MovieLens later replaced persistent groups with pairwise buddies because creating groups was too much friction. A session is one screen and one row.

### Hard filters first, in SQL

Unseen by everyone present (any status but backlog counts as seen). On a service one of you has (a subscription, free, or ad-supported offer in the session's region, not removed; an "only what we both have" toggle for two homes). Runtime under the time available. Genres in or out. A stated constraint that is only a soft lean surfaces steakhouses for a vegetarian, per Beli's reviews; here every constraint is a WHERE clause. The query sketch, on the real `media_items`, `movie_details`, `user_entries`, and `watch_availability` columns, is in the research.

### Every member's prediction for every candidate

If the personal engine stores only each user's top fifty, a film one member would hate has no row, and the misery rule cannot see the misery. The group query needs each present member's prediction for the whole filtered candidate set, computed on demand in the Edge Function for the few hundred rows the filters leave. This is the one plumbing consequence the feature-ideas sketch did not name.

### The guest, shrunk rather than weighted

A partner who is not on Verso gets the one-off link from the sketch: a grid of 24 to 40 recognizable titles spread across genres and eras (pure information-value selection surfaces films people have not seen), five to ten favorites, and an optional row of "hard no" genres that become filters. Five picks are too few for neighbors (Criticker needs three shared titles just to compare two users), so the guest is scored by item similarity to their picks, at low confidence, under a session-scoped id.

Then the rule that matters: confidence changes the estimate, never the vote. Each member's prediction is shrunk toward the item's prior by c_u = n_u / (n_u + k), with n_u their ranked or picked count and k about 10, and members are averaged with equal weight. Worked on a film with a prior of 7.0: the host with 200 films and a raw 8.5 becomes 8.43; the guest with 5 picks and a raw 6.0 becomes 6.67; the pair score is 7.11. The tempting alternative, weighting each vote by confidence, gives 7.85, which is the host deciding alone. The person on the couch counts as one person however much Verso knows about them.

### One rule with one knob

Every score-based rule in the group literature, for two people, is the same formula:

```
S(i) = mean(i) - lambda * |a - b|        lambda in [-0.5, 0.5]
```

lambda = 0 is the plain average; 0.5 is least misery (the minimum); -0.5 is most pleasure (the maximum); 0.25 is the consensus rule from the database literature that found "incorporating disagreements is critical." Five films neither has seen:

| Film | Host | Guest | Average | Least misery | Most pleasure | mean - 0.2 × diff |
|---|---|---|---|---|---|---|
| F1 | 8.5 | 6.0 | 7.25 | 6.0 | 8.5 | 6.75 |
| F2 | 7.0 | 7.0 | 7.00 | **7.0** | 7.0 | **7.00** |
| F3 | 9.5 | 4.0 | 6.75 | 4.0 | **9.5** | 5.65 |
| F4 | 6.0 | 9.0 | **7.50** | 6.0 | 9.0 | 6.90 |
| F5 | 5.0 | 5.5 | 5.25 | 5.0 | 5.5 | 5.15 |

Most pleasure picks the film the guest is predicted to dislike, and in a preregistered study of 399 people it rated worst for fairness and satisfaction. Pure least misery, which PolyLens shipped, drew complaints too. What people do by hand is average while avoiding anyone's misery, which is the feature-ideas sketch's "floor for every member" plus a moderate penalty: start at lambda = 0.2 with a floor at each member's 30th percentile, applied to the shrunk scores, and show a film that fails the floor with "not sure Sam will like this" rather than dropping it silently. For three or more, replace |a - b| with the standard deviation; least misery gets harsher as the group grows, so a fixed lambda does not. Co-op games justify a larger lambda, because one bored player ends the session for everyone. The vote-counting rules (Borda, Copeland, plurality) tie constantly with two voters and are tie-breakers only. The rule runs in SQL, never in the model: told which rule to apply, current models execute it perfectly; left to choose, they disagree with each other.

### What the result shows

- A shortlist of three to five, chosen so each member has at least one of their own top-quartile candidates on it, each card with every member's number on their own scale ("you 8.4, Sam 7.1"), one anchor per person from their top tier ("you loved Heat; Sam picked Collateral"), and any shared hook. A guest never sees the host's low scores on the guest's picks.
- A **rewatch lane**, labeled: a film one member ranked top-tier and nobody else has seen, scored by the others' predictions ("Rafa's 9.4; you'd probably like it, 7.8"). The unseen-by-all filter removes the canonical films first and skews the pool toward less confident predictions; this lane gives them back honestly.
- An **"on both your watchlists"** row shown first when it is not empty.
- A deck of ten to twenty to swipe, where the first mutual yes wins, as the confirmation step, not the recommender; then a share card for the chat where the decision is really made.

### Games

A film needs a screen; a game needs a shared platform or crossplay, a player count that fits, and a co-op or versus mode. IGDB's multiplayer modes (online and offline co-op with their maximums, split screen, per platform) are the missing mirror the sketch already names; crossplay is not obviously in IGDB and per-user platform access beyond owned platforms is not stored, both open. Everyone-owns-it ranks first; otherwise the card shows who would have to buy and the price. A member who played a game solo has not ruled out a co-op run, so for games "unseen" means "not played together," a session flag.

### Logging is the tuning

Log every session and its picks. The primary label is "we watched it"; after that each member ranks the film in their own list, which gives realized percentiles per member: the mean, the minimum, a misery rate (how often someone puts the pick in their bottom tier), and calibration split by host and guest. For a recurring pair, a running deficit (each member's realized percentile minus the pair mean, summed) should hover around zero; when it drifts, later sessions tilt toward whoever keeps losing, which is fairness across nights rather than within one pick. This is what settles lambda, the floor, and k, and nothing else can.

## Cross-media: a labeled slot that fades

Transfer between media reliably helps a user who is new to the target medium (a Microsoft study saw precision double for cold-start users with a second domain's history; Spotify's music-to-podcast bootstrap raised consumption by up to half) and shrinks to nothing as the user ranks in that medium, where same-medium data is more precise. The only study with games is asymmetric: game history improved film picks by 44%, film history hurt game picks by 8%, on Amazon categories rather than any tracker. Plausibly game taste carries tone and theme a film can match, while film taste says nothing about roguelikes versus open worlds.

For Verso: a "Because of your games" slot on movies (and later books) for a user with few films ranked, weighted by k / (k + n_target) so it fades, built on content bridges rather than co-consumption, which does not exist yet: a shared theme and mood vocabulary of 40 to 80 tags written across IGDB themes, TMDB keywords, and book subjects by a batch job; a table of creator, franchise, and adaptation links for high-precision explainable picks; and one text-embedding model over synopsis plus tags in pgvector for nearest-neighbor candidates across catalogs. The model then names the shared trait over candidates that came from those bridges. No medium's list or similarity is merged with another's.

## What this changes in the existing documents

- **[ranking-algorithm.md](ranking-algorithm.md)** expected to revisit Option C "when the social layer needs predicted scores and match percentages." It does not: predictions and Match come straight from positional percentiles, and a per-user latent model on the insertion log is degenerate. Option C stays a possibility only as a pooled, cross-user model at layer 3 scale. Amended there with the date.
- **[feature-ideas.md, idea 9](../feature-ideas.md#9-ai-suggestions-personal-and-group)** stands, refined in three places: the group rule is the floor plus a disagreement penalty, with the guest shrunk rather than weighted and the rule in SQL; the group query needs every member's prediction for the whole candidate set; and the model picks by fixed candidate ids and never names a title the server did not send.
- **ROADMAP V2, "match percentage"**: specified as above (chance at 50%, never negative, hidden below five shared items, with the overlap and the agree and clash lists).
- **Rule 24**: similarities and predictions never cross media; the cross-media slot is labeled and fades.
- **[beli-ranking-algorithm.md](../research/beli-ranking-algorithm.md)**: two attributions corrected the same day (the 15-item gate is from the Long Beach Post, 2023; the -11% match is verified from a 2026 App Store review).

## Alternatives considered and set aside for now

- **A factor model first** (matrix factorization, BPR). Compute is not the constraint: at ten thousand users it trains in minutes on one CPU. Rankers per item is, and no source gives the point at which factors beat neighbors. Layer 3, when the harness says so.
- **The model as the recommender** over the catalog. Hallucinated titles, weak at popularity and collaborative statistics, and beaten by trained models in the realistic setting. Picker and explainer only.
- **A merged group profile** (one pseudo-user from all members). Biased toward whoever ranked more; for Verso's typical pair it is simply the host. Aggregate predictions, not profiles.
- **Weighting the guest's vote by confidence.** Hands the decision to the host (7.85 against 7.11 above). Shrink the estimate instead.
- **A Beli-style raw correlation for Match.** The -11% problem, and at ten shared items a correlation cannot be told from zero.
- **Fitting Bradley-Terry per user on the comparison log.** No unique fit under binary insertion; with a prior it only smooths the positions. Use the order; use the log for ties, stability, and evaluation.
- **Netflix-style percentage on every item.** Netflix itself said in 2024 it would likely drop it for descriptive tags. A number without a reason does not age well; the neighbors phrase and the reason lead, the number follows.

## Build order, tied to the versions

Each stage ships only what beats the stage before it in the harness; "moves on when" is a data condition, not a date.

| Stage | Version | What gets built | Runs where | Moves on when |
|---|---|---|---|---|
| 0. Instruments | Now, before any recommender | A leave-one-out harness per medium; `prediction_log`; the `suggestion_requests` meter; a percentile view over `ranking_entries` | SQL views and a script | Always first |
| 1. Prior and content | V1, the personal suggestion | `item_prior` with the external-score fallback; the content profile read back through the user's list; a SQL candidate function returning about 30 rows with score, confidence, and why; the Edge Function that picks three by enum ids with a grounded reason | pg_cron nightly for priors and feature weights; the candidate function on read; one Edge Function | Content beats the baseline on error and pairwise accuracy for users with five or more items |
| 2. Neighbors and Match | V2, social | Nightly similarity job (Pearson through `corr()`, tau for friend pairs), shrunk with beta about 10 and five or more shared items; a top-30 neighbor table; neighbor predictions blended by precision; the Friend score (plain average of friends); Match with the agree and clash lists; a community-average toggle, never gated | pg_cron nightly; predictions on read for one item, nightly for lists | Neighbors beat stage 1 in leave-one-out at a coverage worth showing |
| 3. Group sessions | V2, group suggestions | The session; the guest grid link; the group query over per-member predictions for the whole filtered set; shortlist, rewatch lane, watchlist row, deck, share card; session and "we watched it" logging; IGDB multiplayer modes mirrored | Edge Function computing member predictions for the filtered set; SQL aggregation | Enough logged sessions to tune lambda and the floor per medium |
| 4. Items and bridges | When items commonly have 10 to 20 rankers | Item-item neighbors for "because you loved X"; "too close" as ties; blend weights fit by regression; the theme and mood vocabulary; `item_links`; pgvector embeddings for the cross-medium slot | pg_cron nightly; batch jobs | The cross-medium slot beats popularity for new-to-medium users |
| 5. Factors | Hundreds to thousands of active users per medium | Pairwise factorization on implied pairs with pooled item strengths, optionally with content features and backlog as implicit signal; a linear blend with neighbors; guest fold-in; an exploration slot | A nightly Python job on a GitHub Actions schedule writing factors to Postgres, as the IGDB mirror runs; Edge Functions serve dot products | Beats stage 4 in the harness and in interleaving |

Stages 1 through 4 need no training loop. Stage 3 is the part no comparable product has.

## What can be built before there is data, and the first batch (2026-09-24)

Rafa's call the same day: this is a core feature, so everything that does not need a crowd's preference data gets built now, and the friends test tells the rest. What follows sorts the design by what it needs, then names the batch. No screen is in it: screens go through Figma first, and the engine is the kind of backend the repo has always built ahead of its screens.

**Needs no data at all, buildable now.** The percentile view over `ranking_entries`; `item_prior` from external scores with the Verso average blended in as it appears; the content profile and the candidate function, which need only the user's own list and the catalog (Rafa's list already exists); every filter (genre, runtime, platform, service); `prediction_log` and the `suggestion_requests` meter; the leave-one-out harness, which on one list of thirty games already produces its first number; the suggest Edge Function with enum-grounded picks; the IGDB multiplayer-modes mirror (catalog only); the group session tables and the group query, tested on fixtures.

**Buildable now, silent until overlaps exist.** The similarity job and the neighbor prediction: the code is data-independent and testable on synthetic users, and it returns nothing until two users share five items. It ships as part of the blend with a weight of zero.

**Ships with defaults, tuned by the harness and the logs.** beta, lambda, the neighbor count, the gates, the group penalty, the misery floor, the guest shrinkage.

**Needs data to exist.** Match between friends (and the follow model of V2), factor models, the cross-medium bridges' value, whether neighbors beat content at all.

**Needs Figma.** The Suggest sheet and its three cards, Match on a profile, the group session and its guest link, the taste paragraph on Profile.

### The first batch: two PRs from `main`, not stacked

Two more wait behind them: the IGDB multiplayer mirror, because PR #62 (search smarter) edits the same catalog files; and the neighbors, the group tables, and the group query, because they call the foundations below and a PR on an open PR is not allowed (memory: #19 landed on the wrong branch). Neither batch touches `packages/api`, `packages/catalog`, or `database.types.ts`, which the five open PRs of batch 1 edit.

**PR A, the foundations, one migration `20260924120000_recommendation_foundations.sql` with a pgTAP suite.** Reuses the score band math (`packages/core/src/ranking.ts`, `scoreForPosition`: loved 8.5 to 10, liked 6.5 to 8.4, fine 4 to 6.4, disliked 0 to 3.9; linear inside the band, a lone item at the midpoint, one decimal) and `tier_list`'s SQL if it already computes it.

1. `ranking_percentiles`, a `security invoker` view: user, medium, item, tier, position, tier size, overall rank (1 is best: tiers in order, then position), `n_ranked`, `pct` = (n_ranked − rank + 0.5) / n_ranked, `score`. And `user_rank_stats`: user, medium, `n_ranked`, mean score, standard deviation.
2. `item_prior` (media item, medium, `n_rankers`, `mean_score`, `external_score` on 0 to 10, `prior_score`, `computed_at`), the catalog grants (`game_availability`'s pattern), and `refresh_item_priors(p_medium default null)`, service role only, scheduled nightly through pg_cron with the guard the player-count migration uses. The external score is the first present in the order `metacritic`, `opencritic`, `igdb_critics`, `steam`, `igdb_users`, `tmdb`, each rescaled linearly to 0 to 10 (the quantile map waits for items that have both); the prior is (n × mean + C × g) / (n + C) with C = 10 and g the external score, else the medium's Verso mean, else 6.5.
3. `prediction_log` (id, user, medium, item, `surface` in suggest, item_page, group; `predicted_score`, `confidence`, `model_version`, `components` jsonb, `request_id`, `shown_at`) and `suggestion_requests` (id, user, medium, `kind` in personal, group; `model`, `input_tokens`, `output_tokens`, `candidate_count`, `request` jsonb, `picks` jsonb, `created_at`). Both owner insert and select, no update or delete, with a policy test each. `count_suggestion_requests(p_since interval)` returns the caller's count.
4. The content model, internal (revoked from `authenticated` and `anon`, callable by the service role and by the public function below): `recommendation_content_profile(p_user_id, p_medium, p_exclude_item default null)` returns (feature, weight). Features are `genre:` values, `developer:` (games) or `director:` (films, from `movie_details.directors`), `decade:`, and `platform:` (games); a feature counts only on two or more of the user's items; the weight is the sum over the user's items of (score − user mean) × idf(feature), divided by the sum of |score − user mean|, with idf = ln(items in the medium / items with the feature). `recommendation_scores(p_user_id, p_medium, p_items uuid[], p_exclude_item default null)` returns, per item, `prior_score`, `content_score` (the cosine between profile and item features, mapped onto the user's scale: mean + cosine × (max − mean) when positive, mean + cosine × (mean − min) when negative), `predicted_score` = (prior + w × content) / (1 + w) with w = n_ranked / (n_ranked + 10), `confidence` (needs_more_data below 5 ranked items, medium below 15, high at 15 and above, since no neighbor error exists yet), and `why` jsonb (the three features that contributed most, with their weights). The prior comes from `item_prior` when the row exists and from the external score inline otherwise.
5. `suggestion_candidates(p_medium, p_genres text[] default null, p_exclude_genres text[] default null, p_max_minutes integer default null, p_platforms text[] default null, p_provider_ids integer[] default null, p_region text default 'US', p_include_backlog boolean default false, p_limit integer default 30)`, `security invoker` on `auth.uid()`: catalog items of the medium with no entry for the caller (backlog entries excluded unless asked), filtered by genres (`game_details.genres` or `movie_details.genres`; the TV column as the agent finds it), by runtime (`movie_details.runtime_minutes`, or `game_details.time_to_beat_seconds` / 60), by platforms (games, any overlap), and by service (`watch_availability` in the region, `offer_type` in flatrate, free, ads, `removed_at` null, provider in the list); the 500 best by prior are scored by `recommendation_scores`, and the top `p_limit` return by `predicted_score` then `prior_score`, with title, year, cover, genres, the runtime or time to beat, `prior_score`, `content_score`, `predicted_score`, `confidence`, and `why`. Limit clamped to 1 to 50.
6. The harness, service role only: `recommendation_loo(p_user_id, p_medium)` returns, for each of the user's ranked items, the true score and tier, the content prediction with that item excluded, its tier, the absolute error, and the errors of two baselines (the user's mean; the item's prior); `recommendation_loo_summary(p_user_id, p_medium)` returns n, the three mean absolute errors, tier accuracy, and the Spearman correlation between predicted and true scores. A comment in the migration shows the loop that runs it for every user.
7. `supabase/tests/recommendation_foundations.test.sql`: two users, six or more games with genres, developers, decades, and external scores, one film; the percentiles for a three-item list (0.833, 0.5, 0.167) and the band math against `scoreForPosition`; the prior on worked numbers; RLS on both log tables; the internal functions refused to `authenticated`; the profile of a user who loved two roguelikes and disliked a shooter; the candidate function excluding entries and honoring each filter; the harness summary on the fixture user.

Built 2026-09-24 as PR #64 (work queue item 33), 84 pgTAP assertions, with these departures from the list above, each for a reason in the migration: TMDB's score is stored on 0 to 100 like every other source, so all six divide by ten; the time-to-beat column is `time_to_beat_normally_seconds`; `item_prior` also stores `external_source` and `baseline_score` (the value the prior shrinks toward, which the harness needs to take a user's own ranking back out of an item's prior); `user_rank_stats` adds the min and max the content score maps between; the summary reports the content score's error on its own as a fourth number; a platform filter on films or a provider filter on games raises 22023 rather than being ignored, an empty array means no filter, and an item with unknown length fails a runtime cap; idf is counted live (about 0.4 s for candidates on a 70,000-game catalog) and moves into the nightly job if that grows. The grant decision went to `security definer` bound to `auth.uid()`, so no function that scores a list ever takes a user id from the caller.

**PR B, the `suggest` Edge Function, `supabase/functions/suggest/`, Deno tests with no network.** POST with the caller's JWT (the platform gate stays on). Body: medium, genres, excludeGenres, maxMinutes, platforms, providerIds, region, includeBacklog, and an optional free-text `note` passed to the model as context only. Steps: a client on the anon key with the caller's Authorization header so RLS applies; the meter (`count_suggestion_requests` over 24 hours against `SUGGEST_DAILY_LIMIT`, default 20; 429 with a plain body when over); `suggestion_candidates`; with fewer than three candidates, return them with a template reason and no model call; otherwise the taste context (`tier_list` for loved and liked, the top ten by score; dropped entries, up to five; recent notes) and one Messages API call with structured output whose `pick1`, `pick2`, `pick3` are enums of the candidate labels c01 to cNN, each with a reason under about 200 characters and the user's own items it cites, model from `SUGGEST_MODEL` (default Claude Haiku 4.5), about 400 output tokens, thinking off; validation maps labels back to ids and any failure falls back to SQL's top three with a template reason built from `why` ("because you put X in Loved") and the response says `fallback: true`; one `suggestion_requests` row with the token counts and three `prediction_log` rows, surface suggest; the response carries the picks (id, title, reason, predicted score, confidence) and the candidates. `index.ts` stays thin; `suggest.ts` takes an injected `fetch` and a small database interface so the tests cover the prompt (at most 30 candidates, the user's items named), a valid structured reply, a reply naming a label outside the list, the meter at its limit, the template path, and the token accounting. CI's functions job gains the test line; `.env.example` gains `ANTHROPIC_API_KEY`; the runbook gains a section for `supabase secrets set ANTHROPIC_API_KEY`, the deploy, the two optional variables, and a curl smoke test. The agent reads the `claude-api` skill first for the current API shape, model ids, and prices.

Built 2026-09-24 as PR #63 (work queue item 34), 24 Deno tests, with these departures: plain HTTP to the Messages API rather than the SDK, because an npm import in a module the tests load breaks `deno test` in this repo; `auth.getUser()` in the entry point, which turns away the anon key and gives the user id the log rows need; each pick is `{label, reason, because}` with `because` an enum of the user's top ten Loved and Liked titles (left out of the schema when there are none, since an empty enum is invalid); one or two candidates are still logged and count toward the meter, a fallback keeps the model tried and the tokens billed, and a failed log write is a 500 so every request is either counted or refused; thinking is disabled explicitly, so `SUGGEST_MODEL` must be a model that accepts that; `SUGGEST_DAILY_LIMIT=0` turns suggestions off, unknown body fields are refused, and the note is capped at 280 characters.

Changed 2026-10-08, at Rafa's request: the default model is Claude Haiku 5.5 (`claude-haiku-5-5`, released 2026-10-07). Haiku 5.5 thinks adaptively by default and its migration guide documents no way to turn that off, so the request sends adaptive thinking at effort low instead of thinking disabled, and `SUGGEST_MODEL` must now be a model that accepts adaptive thinking with an effort level, which Haiku 4.5 is not. Thinking counts against the output ceiling, so `max_tokens` went from 400 to 4,000. The answer is still read from the reply's text block by type, since a thinking block can come first, and a `refusal` stop from Haiku 5.5's safety classifiers is its own fallback reason, with the same SQL picks and template reasons as every other failure. About $0.0007 a request at $0.10 and $0.50 per million tokens, counting the new tokenizer's 30% more tokens and an unmeasured 500 tokens of thinking; the arithmetic is in `docs/process/hosted-setup.md`, section 7.


## Schema sketch, proposed

Every user table with Row Level Security and a policy test from its first migration, as always.

- **`item_prior`** (media item, medium, rankers, mean percentile, prior score, computed at): catalog-like, written by the service role, readable by signed-in users.
- **`user_similarity`** (user a, user b, medium, shared count, Pearson, tau, shrunk similarity, computed at): service role only; friends read their Match, overlap, and agree and clash lists through a `security invoker` function that checks the follow; neighbors are never exposed as rows.
- **`predictions`** (user, media item, model version, score, standard error, confidence, components as JSON, computed at): owner-read, service-role write; nightly for each user's candidate lists, on demand for one item.
- **`prediction_log`** (user, media item, surface, score shown, confidence, model version, shown at; the later outcome joined from `ranking_entries`): owner-only; the harness's online half.
- **`taste_summaries`** (user, medium, summary, token count, built at): owner-only; rebuilt by a batch job when the list changes.
- **`suggestion_requests`** (user, kind, model, tokens, created at): the meter, from the sketch.
- **`group_sessions`** (host, medium, region, providers, runtime cap, genres in and out, platform, created at), **`group_session_members`** (session, user or guest token, picks, hard-no genres), **`group_session_picks`** (session, media item, group score, per-member scores as JSON, lane, shown, chosen, watched at): host-owned, members read their own session through the session id.
- Later: **`item_tags`** (item, tag, weight), **`item_links`** (item, item, kind), **`game_multiplayer`** from IGDB, and a pgvector column on `media_items`.

## Inferences to flag

Claude's calls that Rafa did not make, each reversible: (a) the group feature is the differentiator and is worth building before any factor model; (b) a guest who is not on Verso is scored by item similarity to their picks rather than by neighbors; (c) the version each stage lands in; (d) that the "recommendations unlocked" gate is 15 items, Beli's number, with content scores shown at low confidence from 5; (e) that the model picks rather than only explains, pending the interleaving test.

## Questions for Rafa, with the defaults

1. Build stage 0 now (the prediction log, the meter, the harness, the percentile view), ahead of V1's suggestion feature? Default yes; it is small, and every constant above is a guess until it exists.
2. A prediction's headline: "would land between X and Y, probably Liked" with the number small, or the number first, Beli-style? Default the neighbors phrase first.
3. Match: chance at 50%, never negative, hidden below five shared items, with the overlap count and the agree and clash lists, and "you both loved" as the headline when it applies? Default yes.
4. The group rule: average minus a disagreement penalty (lambda 0.2) with a floor per member, every member's own number on every card? Default yes.
5. The guest: shrunk toward the item's average, never down-weighted, and never shown the host's low scores on the guest's picks? Default yes.
6. The rewatch lane and the "on both your watchlists" row in the group result? Default yes to both, as labeled rows.
7. The "Because of your games" slot on movies for a user new to films: V1 or later? Default later, stage 4.
8. The model picks the three (tested against SQL's top three by interleaving) or only explains SQL's picks? Default it picks, from about 30, by enum ids.
9. Gates: content scores from 5 ranked items with a low-confidence label, collaborative from 10, "recommendations unlocked" in the UI at 15? Default yes.
