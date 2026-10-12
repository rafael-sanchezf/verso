# How Beli ranks restaurants, and what to borrow for a games version

Research notes compiled 2026-09-07 for a developer building a comparison-based ranking system for video games. Beli (beliapp.com) is the primary subject; Flickchart and other pairwise ranking apps are covered for contrast.

## Scope and how to read this document

Beli publishes no help center, FAQ, or engineering blog describing its ranking mechanic. The official website (beliapp.com) contains only marketing copy, privacy policy, terms, and contact links. The App Store description likewise describes features, not mechanics. Founder interviews (WSJ, Harvard Crimson, Founder Brew, Abridged) talk about philosophy, not implementation. Everything below about the algorithm is therefore reconstructed from consistent third-party accounts: design critiques, user blog posts, App Store reviews, and two technically literate writeups (Anson Biggs, Gary Angel) that describe the behavior as binary search.

Each section separates **Confirmed** (stated by multiple independent sources or by Beli's own copy) from **Inferred** (a reasonable reading of the evidence, or a single source's interpretation). Reddit was not accessible to the search tooling used here, so user threads there are not cited. Two Medium posts (a friction log and a redesign case study) and the NYU Washington Square News article could not be fetched directly; where their content is used it came from search snippets and is marked as such. Corrected 2026-09-24 in two places, marked inline: the 15-item recommendation gate is from the Long Beach Post, and the -11% match is now verified from an App Store review. The recommendation layer itself (Rec score, Match Score, thresholds, what Beli has and has not shipped through 2026) is researched further in [recommendation-engine.md](recommendation-engine.md).

## TL;DR

Beli is a positional ranking system dressed up as a rating system. You pick one of three tiers (liked, fine, didn't like), then answer a handful of "this one or that one" questions against restaurants already in your list, and the app inserts the new restaurant into a strict order. The 0 to 10 score is read off the position in that order, so scores shift every time you add a place. There is no evidence of Elo, Bradley-Terry, TrueSkill, or any latent-score model in Beli itself. Comparisons are not constrained by cuisine, price, or location, and that is the single most common complaint. Flickchart, by contrast, does use a confidence-weighted latent model where each matchup moves the whole chart.

---

## 1. The rating flow when a user logs a restaurant

### Confirmed

1. **Two entry points.** Searching a restaurant offers "Been to" (rank it now) or "Bookmark" (add to Want to Try). The two core lists are "Been" and "Want to Try". (UChicago bite; Julia, Little Thoughts)

2. **Step one is a three-tier tap.** The app shows three buttons: a green "I liked it!", a yellow "It was fine", and a red "I didn't like it". (Harvard Crimson 2026; Spoon University Brown; UChicago bite)

3. **Step two is metadata.** Labels/tags (date night, casual business, and so on), friends you went with, favorite dishes, photos, and optional notes. (Spoon University Brown; UChicago bite; App Store description via MWM mirror: "Add tags to help organize and filter your lists")

4. **Step three is head-to-head comparison.** The screen shows the new restaurant versus one restaurant you have already rated, and you tap the one you enjoyed more. The Pratt 2022 critique: "When ranking restaurants you are forced to decide between the restaurant you are scoring with one other restaurant you have evaluated in the past."

5. **Escape hatches exist.** You can mark a comparison "Too tough", skip it, or go back to the previous comparison if you changed your mind. (Spoon University Emory: "you can decide that the comparison is too tough, skip it, or go back to the previous comparison"; Pratt 2022: users can "skip, or it's 'Too Tough' to decide which contributes to the restaurant's score when ranking"; an App Store reviewer: "although you can say 'too tough,' I wish I could opt out of it completely")

6. **The loop is short and ends on its own.** Sources describe "a couple of taps" (Sid Jha), "a few comparisons" (Anson Biggs), and a whole logging flow of "approximately five clicks" (Julia). Spoon Emory: the process "is repeated until the comparisons make clear where this restaurant's score should fall in relation to the others." The Crimson writer recalls being asked about a tasting menu and a British pie shop before his birthday dinner landed at "6.2/10" as his "76th top rated restaurant".

7. **Comparison candidates come from the same tier.** Julia's account: after the tier tap the app has you "compare it against similar-rated establishments." Gary Angel: "Beli takes your starting classification and then does a binary search of your previous ratings within that broad classification."

8. **Scores are hidden at first.** Users must "complete 10 reviews to unlock the scores feature." (Pratt 2024) Personalized recommendations need "at least 15 ranked restaurants." (Long Beach Post, 2023-06-06. Corrected 2026-09-24: this was attributed to an NYU Washington Square News snippet; read directly, that article states no threshold.)

9. **Your first rating gets a tier baseline.** Spoon Emory: "Your first-ever rating is given a baseline score for whether you liked it, thought it was fine, or didn't like it. But, this changes as you accumulate more rated restaurants."

### Inferred

- **Candidate selection is binary search over the tier's sublist**, i.e., the pivot is the middle of the remaining interval, not random and not a nearest-neighbor guess. This is the explicit reading of two technically minded observers (Anson Biggs describes it as "a binary insertion sort"; Gary Angel as "a binary search"). It is consistent with the small, self-terminating number of questions everyone reports. Nobody reports random opponents. Expect roughly ceil(log2(k)) questions where k is the number of restaurants already in that tier; Anson Biggs gives the worst case as floor(log2(n) + 1).

- **What "Too tough" does is not public.** Pratt 2022 says it "contributes to the restaurant's score"; Anson Biggs says "it's unclear how this actually decides a ranking." Two implementations fit the evidence: (a) treat it as a tie and place the new item adjacent to the pivot, ending the search; or (b) swap in a different pivot from the same interval and continue. Skip most likely does (b). Design your own version deliberately rather than copying an unknown.

- **The tier acts as an anchor, not just a filter.** Because a first rating gets a tier-specific baseline and comparisons stay within the tier, the three tiers almost certainly map to three non-overlapping score bands, with the position inside the band determining the decimal. The band boundaries are not published.

---

## 2. How the 0 to 10 score is derived

### Confirmed

- The output is a strict ranked list plus a decimal score per item, e.g. "6.2/10 ... 76th top rated restaurant" (Crimson 2026). Ivey Business Review: "Through repeated comparisons, the app then determines a personalized score out of ten points."
- Scores are relative to your own list and change as the list grows. Spoon Emory (baseline "changes as you accumulate more rated restaurants"); Spoon Brown ("The app automatically ranks your restaurant list by the score with the new restaurant added"); Crumble's guide (search snippet): "your ordered list is then mapped onto a 0-10 scale, with each score interpolated from its position" and "Rankings shift every time you add a place."
- Beli's founders frame the design as a way to avoid the 4-star clustering of Google and Yelp. Startup Signals: "everything clusters around 4 stars ... Beli pushes you to give real scores, from 1s to 10s." Thelen (Abridged/PBS KVIE): ranking yields "more honest and personalized feedback."
- A user's list is never shown as a list of comparisons; the comparisons are discarded from the UI once the item is placed. There is no visible "confidence" or "needs more matchups" state (contrast Flickchart, section 7).

### Inferred

- **The score is purely positional: a linear interpolation of rank onto the 0.0 to 10.0 scale, most likely within tier bands.** Anson Biggs: "you end up with a ranked list, which then a linear interpolation is ran on to give everything a rating 0.0-10.0." Crumble independently says "interpolated from its position." No source describes win counts, ratings that update by margin, or probabilistic estimates.
- **There is no Elo / Bradley-Terry / TrueSkill layer.** One essayist (Sid Jha) calls it "a chess-like Elo ranking with custom parameters," but he offers no evidence and his own description ("after a couple of taps, you have placed the restaurant in a list") is insertion, not Elo. Elo would not converge to a stable position in two or three matchups, and Elo scores would not shift for untouched items when a new one is added. Treat the Elo label as loose language.
- **Re-ranking one item shifts others' displayed scores** because it changes positions. It does not change their relative order. Users notice this as "drift": Emma Cho complains the "10-point scale becomes meaningless as the number of visits grows" and mocks distinctions between "an 8.2 and another an 8.3." With a dense list, adjacent items differ by 10/(n-1) points, so a 200-item list has gaps of about 0.05.
- **The claim that "your favourite is always a 10"** appeared in search summaries attributed to Wikipedia and the Long Beach Post, but neither page actually says it when read directly. Treat it as plausible (it follows from linear interpolation of a full-range band) but unverified. If Beli uses tier bands, the top of "I liked it" would be 10 and the bottom of "I didn't like it" would be near 0, with the exact middle band unknown.

---

## 3. Comparing across categories (cuisine, price, city)

### Confirmed

- **Comparisons are not constrained by cuisine, price, or location.** This is the most frequently voiced complaint in every channel:
  - App Store review: "It's not fair to rank a Korean BBQ restaurant against a brunch pancake spot ... A fancy dinner date spot isn't comparable to a bagel shop," with the suggestion to "rank restaurants ONLY amongst other restaurants in their category."
  - App Store review (Cdsk76752, Aug 2026): "there should be more tiers to ranking restaurants ... the ranking system doesnt make sense between a casual restaurant vs a michellin star experience because the expectation is different."
  - Gary Angel: "After I've rated fifteen bakeries, Beli ought to limit the comparisons to within the category. That would make new rankings easier and more accurate because they are more apples to apples."
  - Pratt 2022: "Beli can expand the constraints by comparing restaurants within the same category (such as by cuisine or $$$ amount)."
  - Food Network: "you have to compare eateries of every cuisine and price point with each other, a Michelin-starred restaurant, a food truck, a hole in the wall."
  - Taste Cooking quotes a critic: "How do I compare the tacos stand on the side of the road that I love with a three-Michelin-star restaurant?"
  - Sid Jha: "Rating all meals in the same way flattens the experience" (a vacation splurge versus a casual work dinner).
- **The only comparison constraint is the tier** (liked / fine / didn't like). See section 1.
- **Filtering happens after the fact, not during ranking.** The App Store copy says "Add tags to help organize and filter your lists." A "Taste Profile" summarizes what you love most; third-party descriptions say it breaks down your rankings by cuisine, city, and country (search snippets; the Zillennial review describes a year-end summary of "your top five cuisines and what city you tend to eat in the most"). Recommendations can be sorted "based on price point and location" (Today.com), and the rec engine leans on cuisine preferences: "if you tend to rate Asian cuisines highly ... Beli will try to recommend more restaurants that fall under that category" (Zillennial).
- **Place types.** Beli covers "restaurant, bar, bakery, coffee/tea, and ice cream/dessert" (Zillennial). Whether bars and coffee shops share the restaurant ranking or have separate lists is not documented; the cross-category complaints suggest they share one list.

### Inferred

- Beli has chosen a single global order per user as the product's core object (one list, one map, one leaderboard count). That is why cuisine-scoped comparison has not shipped despite years of requests: a per-cuisine ranking would fragment the "your #1 restaurant" identity that drives sharing. For a games app the same tension applies: per-genre lists are more honest, but "my #1 game of all time" is what people screenshot.
- The "Too tough" button is Beli's only mitigation for incomparable pairs. It is a pressure valve, not a fix.

---

## 4. The "Want to Try" list (backlog)

### Confirmed

- Bookmarking adds a place to Want to Try; ranking adds it to Been. (Julia; UChicago bite)
- You can bookmark "directly from Instagram and TikTok posts, putting them right into your 'Want to Try' list." (Food Network; Wikipedia)
- Want to Try items appear on the same map as ranked items, with different pins. (Zillennial; Spoon Brown)
- Friends' profiles show "Places you both want to try". (Pratt 2024)
- When you save a restaurant you have not visited, Beli shows two numbers: a personalized prediction (the "Rec score") and "the average rating that your friends have given the restaurant." (Spoon Emory; Julia calls them "Rec score" and "Friend score")
- Bookmarks feed the recommendation engine as an intent signal: users "can bookmark ones they want to try (building even more platform intelligence)." (HBS Digital Innovation case)
- Recommendations are suppressed for sparse users or sparse cities: "Recommendations may not appear on your profile if you haven't tried enough places or if you are in a city where there are not enough ranked restaurants yet." (Spoon Brown)

### Inferred

- Want to Try has no effect on the ranking algorithm. Nothing in any source suggests bookmarked items are ever used as comparison pivots or that bookmarking pre-seeds a tier. The interaction is one-way: visit, then tap "Been to", which starts the section 1 flow and (presumably) removes the bookmark.
- The predicted Rec score on a backlog item is essentially a collaborative-filtering estimate expressed on the same 0 to 10 scale as your own list, which is what makes it legible.

---

## 5. How the friends layer uses rankings

### Confirmed

- **Match Score.** The App Store copy: "Check out your 'Match Score' with your friends to see who really shares your tastes." Pratt 2024 describes the leaderboard as showing "all users on the platform, with a color coded % match indicating the similarity in preferences," where green scores nudge you to follow that person. Startup Signals: "each friend has a 'taste similarity score' to you, helping you weigh their recommendations." Zillennial: the compatibility is used to "predict if you'll like or dislike a food place that your friends have been to and rated."
- **Two scores on every restaurant page.** Wikipedia (citing WSJ and Food Network): "The app calculates two scores for the establishment based on the user's rank, one predicting how much the user liked the restaurant and the other stating how much a user's friends on Beli liked the restaurant." Today.com: the friend rating "averages all of a user's friends' scores for a particular spot."
- **Recommendations are platform-wide, not just friends.** Long Beach Post, 2023-06-06 (corrected 2026-09-24 from an NYU WSN snippet): "Beli looks for users from all over with similar taste for those recommendations, not just people nearby or a friend's ranking." WSJ (via To Vima): "The more restaurants users rate, the more accurately the app's algorithm can recommend others based on their preferences and connect them to users with similar taste."
- **Feed and leaderboards.** The home feed shows "past restaurants that your friends have gone to and the score that they gave" (UChicago bite). Leaderboards rank users "based on how many restaurants they have logged" (Today.com), city-wide and platform-wide, with streaks (Wikipedia; Ivey). Over 80% of users join via referral (Ivey).
- **Community average is gated.** App Store review (TRC1904, Jul 2026): "the average score feature should be a basic feature. You can only access it if you refer someone." Another reviewer (macatack1205) wants to toggle between "the average ratings" and "what the app thinks I would like."

### Inferred

- Match Score is almost certainly a similarity over co-ranked restaurants (something like a rank correlation or normalized score distance over the intersection of two Been lists), given that it can be negative and that users complain it looks wrong when the overlap is small. An App Store review of 2026-03-30 (v8.4.5) reads "my friend has 10 restaurants ranked similarly to me but we have a -11% match"; verified verbatim 2026-09-24, one reviewer. A mean-centered correlation over the shared places explains it without a bug (two people who loved the same places in a slightly different order correlate negatively); see [recommendation-engine.md](recommendation-engine.md). Negative values do indicate a correlation-style metric rather than a 0 to 100 percentage.
- The Rec score is a standard user-user or item-item collaborative filter operating on positional 0 to 10 scores. Positional scores are handy for this because every user's list spans the same range regardless of how generous they are.

---

## 6. Known complaints and how users fix mistakes

### Confirmed complaints

| Complaint | Source |
|---|---|
| Comparison flow is tedious; wish to opt out entirely | App Store review quoted in Apple listing |
| Forced comparisons across incompatible cuisines / price levels | App Store reviews; Gary Angel; Pratt 2022; Food Network; Taste Cooking; Emma Cho |
| Want more than three tiers (takeout vs casual vs fine dining) | App Store review (Cdsk76752) |
| Decimal precision feels fake as the list grows (8.2 vs 8.3) | Emma Cho |
| Community average score locked behind referral | App Store review (TRC1904) |
| Cannot toggle predicted score vs average on search | App Store review (macatack1205) |
| Match percentages seem inaccurate (-11% with a friend who ranked 10 places similarly) | App Store review, 2026-03-30, verified 2026-09-24 |
| Herd mentality toward hyped venues; elite-restaurant focus | Taste Cooking; Wikipedia |
| Streak pressure and performative posting | Wikipedia; Emma Cho |
| Early users get little value until the list is long | HBS case; the 10-rating and 15-rating unlock thresholds |

### Confirmed re-ranking behavior

- "You can always go back and rerank a restaurant to have a higher or lower score if your opinions change." (Spoon University Brown)
- Users "can override ratings if desired." (Food Network)
- A WineBerserkers forum user: Beli compiles ratings "into a single ordered list of favorite places that you can then re-adjust."
- The App Store reviewer who praised accuracy noted "the spot-on scores I see for places I've already been," implying the positional scores feel right to many users once the list is large.

### Inferred

- Re-ranking means re-running the comparison flow for that item (re-pick a tier, answer a fresh binary search), not dragging it to a new slot or typing a number. No source describes drag-and-drop or direct numeric entry. TikTok has a topic page titled "How to Add Exact Rating to Beli," which suggests users want that, but the page could not be read and there is no evidence the feature exists.
- Because a binary insertion is deterministic, one wrong or careless answer places an item permanently in the wrong half of the tier until the user notices and re-ranks. Beli offers no "confidence" or "review recent placements" prompt. This is the biggest practical weakness of the approach and the easiest to fix in a new design (see section 9).

---

## 7. How Flickchart and other pairwise apps do it

### Flickchart (movies, since 2009)

- **Matchups:** historically random pairs from your ranked set plus popular unranked films (Wikipedia). The current FAQ says the system "tailors the matchups to your taste in film" and introduces "more diverse and obscure titles" over time, so selection is now algorithmic, though still not a search toward a slot.
- **Position updates:** unlike Beli, a matchup does not slot the movie between two neighbors. FAQ: "Each matchup influences your entire chart, not just the two movies involved," with "Statistical confidence" and "Holistic analysis" of "your overall ranking history." Movies "need to reach a threshold of matchups before Flickchart has high confidence in their placement." This is a latent-score, confidence-weighted model.
- **Score:** a "Flickscore," "a numerical representation (0-100) of where a movie sits in your personal rankings."
- **Global chart:** since 2010 it uses "a Bayesian formula" over "the average position where each movie exists on everyone's individual Flickchart," explicitly not win percentage, to keep blockbusters from monopolizing the top 100 (Flickchart blog). User influence is weighted by how many movies they have ranked (FAQ).
- **Filters:** you can filter your own chart and the community chart by genre, decade, director, actor (FAQ; Shortlist's roundup: "slice by year, decade, genre, actor or director"). Filtering is a view over the global order, not a separate ranking.
- **Manual editing:** none. You re-rank a movie by putting it back into matchups (FAQ).
- **Known pain:** the "Flickchartism" blog post describes a chart that "kept jumping around" after "over 90,000 rankings" because the author mixed criteria ("like" versus "admire"), and prescribes one fixed "ranking philosophy" per user. Wikipedia notes critics saying "films of inferior quality can get stuck near the top" until they draw "the right duels."

### Shortlist (movies, mobile)

- Explicitly **binary insertion**: "a new film only has to be compared against the ones near where it lands." Five films take "6 to 8 taps in every one of the 120 possible orders." Tiers (S/A/B/C/D) are drawn on top of the strict order after the fact: the ranking produces a "strict order first, then the bands are drawn on top of it." No skip option is mentioned. This is the closest public analogue to Beli's mechanic, with tiers as output rather than input.

### Flick (movies and TV, iOS)

- A "this or that" comparative system "like filling out a bracket," with a per-content-type option to choose "comparative or manual" rating. Useful precedent for offering both modes.

### My Ranking (general lists, iOS)

- Free tier uses a proprietary "Smart Sort" ("fewer questions than you'd expect"); Pro unlocks Elo, Swiss tournament, and elimination brackets. Lists cap at 128 items.

### Sortr (general lists, web)

- Head-to-head with skip and ties; "20 items take roughly 60 matchups instead of 190," and "calling a tie merges items and shortens the run." That count is consistent with a comparison sort (n log2 n is about 86 for n=20; merge-insertion is about 62). Three or more finishers of the same sorter produce a consensus ranking.

### PickYourFav (general lists, web)

- Uses "the Bradley-Terry model" with adaptive pairing that prioritizes "the comparisons most likely to sharpen your final ranking." Quick mode is about 12 matchups, deep mode about 32. Skip is supported.

### Smaller tools worth knowing

- ryanpbrewster/pairwise-ranked uses Ford-Johnson merge-insertion sort and asks only for comparisons the sort still needs, because "comparisons are the most expensive part."
- 1000minds' PAPRIKA method generates "the most informative pairs," runs "consistency checks," and caps at 30 alternatives.
- comparisonranker.com admits the generic weakness: "it requires a large number of comparisons to rank a list of options accurately."

---

## 8. Algorithm options for a games ranking system

| Approach | Comparisons per new item | What the score means | Strengths | Weaknesses | Used by |
|---|---|---|---|---|---|
| Binary insertion into a strict order (optionally within tiers) | ceil(log2 k), k = items in the tier (Wikipedia, Insertion sort) | Position, mapped to 0 to 10 by interpolation | Fewest taps; deterministic; instantly produces a full order; trivially explainable | No noise tolerance: one bad answer misplaces the item; scores of every item drift when any item is added; no confidence signal; intransitive preferences have nowhere to go | Beli (inferred), Shortlist |
| Full comparison sort of an existing collection (merge sort or Ford-Johnson merge-insertion) | Total about n log2 n minus 1.415n for Ford-Johnson, close to the log2(n!) lower bound of about n log2 n minus 1.443n (Wikipedia, Merge-insertion sort) | Position | Optimal when bulk-importing a backlog of 30 to 100 already-played games | Long session up front; same fragility as insertion; awkward to pick up again | Sortr, pairwise-ranked |
| Elo (online rating) | Never "done"; typically 10 to 20 matchups before an item settles | Latent strength, update R' = R + K(S minus E), E = 1/(1+10^((Rb minus Ra)/400)) (Wikipedia, Elo) | Tolerates inconsistent answers; supports endless casual re-comparison; well understood | Order dependent; K-factor is a hard tuning knob; no uncertainty; slow convergence for a single new item; global drift | My Ranking (Pro), many hobby apps |
| Glicko / Glicko-2 | Similar to Elo but faster for new items because a high rating deviation makes early updates larger | Latent strength plus RD (uncertainty), RD grows with inactivity via RD = min(sqrt(RD0^2 + c^2 t), 350) (Wikipedia, Glicko) | Adds a confidence measure you can show ("needs 3 more comparisons"); handles stale items | More parameters; still order dependent; still no strict order without a tie-break rule | Chess servers |
| TrueSkill | A few matchups shrink sigma substantially; Xbox shows the conservative estimate mu minus 3 sigma (Wikipedia, TrueSkill) | Gaussian belief (mu, sigma) | Principled Bayesian updates; natural "confidence" bar; can rank a new item from a handful of well-chosen opponents | Designed for multiplayer matchmaking, overkill for one user's list; the leaderboard is by mu minus 3 sigma, which penalizes under-compared items | Xbox Live |
| Bradley-Terry with MLE (batch) | Any number; recompute from all stored comparisons | P(i beats j) = p_i / (p_i + p_j); fit by Zermelo/MM iteration (Wikipedia, Bradley-Terry) | Order independent; stable; bootstrap gives confidence intervals; the reason Chatbot Arena moved off Elo ("game order does not matter", LMSYS blog) | Needs a connected comparison graph; an item that never loses has an unbounded estimate unless you add a prior; no answer for a brand-new item until it has comparisons; recomputation is O(comparisons) per pass | PickYourFav, LMSYS Chatbot Arena |
| Counting / Copeland (rank by wins) | Many; needs broad coverage | Win count or win rate | Assumption-free and provably near-optimal for top-k recovery (Shah and Wainwright) | Wasteful for a personal list; no per-item insertion story | Research baseline |
| Active / adaptive selection on top of any of the above | O(d log n) when preferences have low-dimensional structure (Jamieson and Nowak) | Depends on the underlying model | Asks only informative pairs; noise-tolerant variants exist; merge-sort schedulers beat "Active Elo" under equal budgets (Surprise-Guided MergeSort) | Implementation complexity; needs item features (genre, platform) to do better than binary search | PickYourFav, 1000minds, research systems |

Practical reading of the table:

- Binary insertion wins on taps and clarity, which is why the two consumer hits (Beli, Shortlist) use it. Its fragility is fixable with a cheap UX step (confirm neighbors after insertion) rather than a heavier model.
- Latent models (Elo family, Bradley-Terry, TrueSkill) win on robustness and on supporting an endless "refine" mode, which is Flickchart's whole loop, but they never produce a crisp "this game is #17" without more comparisons than users will give a new entry.
- Bradley-Terry with a weak prior is the right batch model if you store comparisons as events. It is order independent, gives confidence intervals, and you can always derive a strict order from the fitted strengths.
- Whatever you pick, store every comparison as an immutable event (winner, loser, timestamp, and the context such as "same genre" or "too close"). Sid Jha's observation that Beli's mechanic can be rebuilt "in Google sheets" in half an hour is correct; the durable asset is the comparison log, and a log lets you switch algorithms later.

---

## 9. Recommendation for a games version

The genre problem is real, and Beli's history is the warning: a single global list with unconstrained pivots is the number one complaint from users and from every design critique, and Beli has not fixed it in five years, likely because the global "#1" is the product. For games the incomparability is arguably worse (a 4-hour narrative indie versus a 300-hour live-service shooter versus a puzzle game). Three concrete designs, in increasing order of complexity:

### Option A: Beli-faithful insertion with genre-aware pivots and a confirm step

Keep Beli's shape because it is the fastest known flow, and patch its two weaknesses.

- **Tiers as input.** Loved / Liked / Fine / Didn't finish or didn't like. Four rather than three (the most-requested change on Beli). Each tier owns a fixed band of the 0 to 10 scale, for example Loved 8.5 to 10, Liked 6.5 to 8.4, Fine 4 to 6.4, Didn't like 0 to 3.9. Position inside the band is linear.
- **Binary search within the tier, but choose the pivot smartly.** At each step the search interval defines which items are eligible; among those eligible, prefer an item sharing a genre or platform tag with the new game, then fall back to the true midpoint. This keeps the O(log k) guarantee while making most questions apples-to-apples. This is exactly the "compare within the category once you have enough of them" fix Gary Angel and Pratt asked for, without fragmenting the list.
- **Two escape hatches with defined semantics.** "Too close" ends the search and places the new game directly adjacent to the pivot (below it by default). "Can't compare" swaps in another eligible pivot from the same interval, preferring a different genre-neutral one, and after two consecutive "can't compare" answers ends the search at the interval midpoint.
- **Confirm step.** After insertion show the new game between its two neighbors and ask "look right?" with one-tap nudges up or down. This removes the silent misplacement problem that Beli and Flickchart both suffer from.
- **Genre views are filters.** Any genre or platform list is a filtered view of the single order, and the displayed score in that view can optionally be re-interpolated within the filter so the best RPG shows as 10 in the RPG view. Beli's Taste Profile and Flickchart's chart filters are the precedents.

Best for: fastest logging, screenshot-friendly "my top 10," small to medium collections. Weakest when a user has hundreds of games and inconsistent moods.

### Option B: Rank within buckets, stitch buckets with a small latent model

Take the users' request literally and compare like with like, then reassemble a global view.

- Each game belongs to one primary **bucket** (a genre cluster or a "mood" the user picks at logging time: story, competitive, cozy, puzzle, and so on). Insertion is Option A's binary search but restricted to the bucket, so every question is within-bucket and "too tough" nearly disappears.
- To produce a global 0 to 10, ask a few **anchor comparisons across buckets** (only when a bucket gains its 3rd, 6th, 12th item, for example: "your favorite puzzle game or your #3 RPG?"). Fit a per-bucket offset with a tiny Bradley-Terry over bucket anchors, then place each bucket's linear band on the global scale. Show the global list labeled as "blended" so users understand cross-genre positions are approximate.
- Fallback: buckets with fewer than 3 items use the global insertion path until they grow.

Best for: users with strong genre identities, large libraries, and a dislike of forced comparisons. Cost: multi-genre games need a primary bucket, tiny buckets get coarse scores, and the global list is less "true" than in Option A. This is the design Beli's critics describe when they say "rank restaurants ONLY amongst other restaurants in their category," so expect it to be the most requested if you ship Option A first.

### Option C: Latent score model with a Flickchart-style refine loop

Use Bradley-Terry (batch, with a Gaussian prior on log-strength so undefeated games stay finite) or TrueSkill-style Gaussian updates, and make comparisons an ongoing activity rather than an insertion ritual.

- **Logging a game** asks for the tier (this seeds the prior mean) and three to five adaptively chosen opponents (pick pairs with the highest expected information, favoring same-genre items early). The game appears with a score and a visible confidence indicator.
- **Refine mode** offers quick matchups any time, like Flickchart, and every answer can move any item. Store all comparisons; refit nightly or on demand.
- **Genre handling** is a per-genre offset term in the model (strength = global + genre term for the user), which lets the fit explain "this user systematically favors RPGs" without forcing a bucket choice; cross-genre answers are still used but explain less.
- **Display** maps fitted strength to 0 to 10 via the user's own percentile, so the scale stays comparable across users for the social layer.

Best for: an app whose retention loop is comparing (Flickchart's model) and for later social features (predicted scores and match percentages fall out of the same latent model). Cost: new games do not get a crisp position for several comparisons, scores are harder to explain, and users can end up with "a chart going nowhere" if the question wording is inconsistent, exactly Flickchart's failure mode.

### Cross-cutting advice regardless of option

1. **Fix the question.** Flickchart's veterans learned the hard way that mixing "which is better" with "which do I love" makes charts unstable. Pick one prompt and print it on the comparison screen, for example "Which would you rather play again tonight?"
2. **Keep the backlog separate.** Beli's Want to Try never touches ranking; keep your backlog the same way, and only show a predicted score there once you have enough data (Beli gates predictions behind 15 ranked items and scores behind 10).
3. **Show neighbors, not just numbers.** Alvin Wan's critique applies to games too: derived scores still need calibration, and "relative to" display (this game sits between X and Y) is more legible than 7.3.
4. **Do not gate basic aggregates behind referrals.** Beli's most resented decision is hiding the community average behind a referral wall.
5. **Log everything.** Store comparisons as events so you can migrate from Option A to B or C without losing history.

---

## Sources

Beli: official and press

- [Beli App | Restaurant List Keeping (beliapp.com)](https://beliapp.com/)
- [Beli on the App Store (id1478375386)](https://apps.apple.com/us/app/beli/id1478375386)
- [Beli App Store ratings and reviews](https://apps.apple.com/us/app/beli/id1478375386?see-all=reviews&platform=ipad)
- [Beli app description mirror (MWM)](https://mwm.ai/apps/beli/1478375386)
- [Beli (app) on Wikipedia](https://en.wikipedia.org/wiki/Beli_(app))
- [WSJ via To Vima: The App That Makes Rating Restaurants Fun Again](https://www.tovima.com/wsj/the-app-that-makes-rating-restaurants-fun-again-and-gets-better-the-more-you-use-it/)
- [Harvard Crimson: The Harvard Business School Grads Behind Beli (2025)](https://www.thecrimson.com/article/2025/5/1/beli-judith-eliot-frost/)
- [Harvard Crimson: An Ode to Beli (2026)](https://www.thecrimson.com/article/2026/2/26/beli-inquiry/)
- [Founder Brew: Beli's married co-founders](https://www.founderbrew.com/stories/beli-founders-judy-thelen-eliot-frost-partnership-superpower)
- [Abridged / PBS KVIE: Why Gen Z diners use Beli](https://www.abridged.org/news/beli-app-sacramento/)
- [Food Network: How Beli Became Gen Z's Yelp](https://www.foodnetwork.com/fn-dish/news/beli-app-trend)
- [Today.com: How the Beli App Is Gamifying Our Restaurant Experiences](https://www.today.com/food/trends/what-is-beli-app-rcna217748)
- [Taste Cooking: Beli Invites the Loneliest Generation to Dine Out](https://tastecooking.com/beli-invites-the-loneliest-generation-to-dine-out/)
- [Long Beach Post: Get restaurant recs from the people you trust most with Beli](https://lbpost.com/esd/hi-lo/get-restaurant-recs-from-the-people-you-trust-most-with-beli/)
- [NYU Washington Square News: Why NYU students are obsessed with Beli (read directly 2026-09-24; states no threshold)](https://nyunews.com/culture/dining/2023/10/16/beli-app/)
- [Ivey Business Review: Beli, A Recipe for Revenue](https://www.iveybusinessreview.ca/magazine/articles/beli)
- [HBS Digital Innovation and Transformation: Beli, Knowing What Your Belly Wants](https://aiinstitute.hbs.edu/platform-digit/submission/beli-knowing-what-your-belly-wants/)

Beli: technical writeups, design critiques, user accounts

- [Anson Biggs: Beli, Rating Has Never Been So Good](https://notes.ansonbiggs.com/rating-has-never-been-so-good/)
- [HackerNoon republication: Beli's Binary Search Rating System Explained](https://hackernoon.com/belis-binary-search-rating-system-explained)
- [Gary Angel (LinkedIn): Analytics and User-Reviews, Beli does it (almost) right](https://www.linkedin.com/pulse/analytics-user-reviews-beli-does-almost-right-gary-angel-l2vvc)
- [IXD@Pratt: Design Critique, Beli iOS app (2022)](https://ixd.prattsi.org/2022/02/design-critique-beli-ios-app/)
- [IXD@Pratt: Design Critique, Beli App (2024)](https://ixd.prattsi.org/2024/09/design-critique-beli-app/)
- [Spoon University (Emory): Rate, Save, and Recommend Restaurants on App Beli](https://spoonuniversity.com/school/emory/rate-save-and-recommend-restaurants-on-app-beli/)
- [Spoon University (Brown): Beli, The New App Personalizing Restaurant Reviews](https://spoonuniversity.com/school/brown/beli-the-new-app-personalizing-restaurant-reviews-and-recommendations/)
- [UChicago bite: Beli App, Restaurant List Keeping](https://uchicagobite.com/blog/2023/3/1/beli-app-restaurant-hot-spots)
- [Julia, Little Thoughts: Why I Love Beli App](https://jteesang.substack.com/p/why-i-love-beli-app)
- [Jason D. (Medium): Why I Use Beli (search snippet only)](https://medium.com/@jason_jason_jason/why-i-use-beli-the-restaurant-recommendations-app-27f896a9de60)
- [Arthur Huang, Startup Signals: Beli, your food diary and dining advisor](https://startupsignals.substack.com/p/beli-your-food-diary-and-dining-advisor)
- [Sid Jha, Snapshots: Beli, Food for thought](https://www.readsnapshots.com/p/beli-food-for-thought)
- [Daily Dropout: beli, your favorite restaurants ranked](https://dailydropout.substack.com/p/beli-your-favorite-restaurants-ranked)
- [Emma Carolyn Cho: too full for beli](https://emmacarolyncho.substack.com/p/too-full-for-beli)
- [The Zillennial Zine: Beli App Review](https://thezillennialzine.com/2024/01/23/beli-app-review/)
- [Alvin Wan: Compare dishes, instead of scoring restaurants](https://alvinwan.com/compare-dishes-instead-of-scoring-restaurants/)
- [WineBerserkers forum: Beli app for rating/finding restaurants](https://www.wineberserkers.com/t/beli-app-for-rating-finding-restaurants/334219)
- [Crumble: 6 Best Restaurant Ranking Apps (search snippet only)](https://crumble.me/guides/restaurant-ranking-apps)
- [JustUseApp: Beli reviews](https://justuseapp.com/en/app/1478375386/beli/reviews)

Flickchart and other pairwise ranking apps

- [Flickchart FAQ](https://www.flickchart.com/faq)
- [Flickchart blog: The Global Rankings 2, Rankings Reloaded](https://www.flickchart.com/blog/the-global-rankings-2-rankings-reloaded/)
- [Flickchart blog: Flickchartism](https://www.flickchart.com/blog/flickchartism-to-achieve-a-perfect-chart-you-need-a-perfect-ideology/)
- [Flickchart on Wikipedia](https://en.wikipedia.org/wiki/Flickchart)
- [Shortlist: 6 Best Movie Ranking Apps](https://shortlist.watch/best-movie-ranking-apps)
- [Shortlist: Movie Tier List in 6 to 8 Taps](https://shortlist.watch/movie-tier-list)
- [Flick: Rate Movies and Shows (App Store)](https://apps.apple.com/us/app/flick-movie-ratings/id6504503117)
- [My Ranking, Compare and Rank (App Store)](https://apps.apple.com/us/app/my-ranking-compare-rank/id6761020668)
- [Sortr](https://sortr.io/)
- [PickYourFav](https://pickyourfav.net/)
- [ryanpbrewster/pairwise-ranked (GitHub)](https://github.com/ryanpbrewster/pairwise-ranked)
- [1000minds pairwise ranking tool](https://www.1000minds.com/pairwise-ranking-tool)
- [Pairwise Comparison Ranker](https://comparisonranker.com/)

Algorithms and research

- [Elo rating system (Wikipedia)](https://en.wikipedia.org/wiki/Elo_rating_system)
- [Glicko rating system (Wikipedia)](https://en.wikipedia.org/wiki/Glicko_rating_system)
- [TrueSkill (Wikipedia)](https://en.wikipedia.org/wiki/TrueSkill)
- [Bradley-Terry model (Wikipedia)](https://en.wikipedia.org/wiki/Bradley%E2%80%93Terry_model)
- [Insertion sort, binary insertion (Wikipedia)](https://en.wikipedia.org/wiki/Insertion_sort)
- [Merge-insertion sort (Wikipedia)](https://en.wikipedia.org/wiki/Merge-insertion_sort)
- [LMSYS: Chatbot Arena leaderboard update, Elo to Bradley-Terry (Dec 2023)](https://lmsys.org/blog/2023-12-07-leaderboard/)
- [Jamieson and Nowak: Active Ranking using Pairwise Comparisons (arXiv 1109.3701)](https://arxiv.org/abs/1109.3701)
- [Shah and Wainwright: Simple, Robust and Optimal Ranking from Pairwise Comparisons (arXiv 1512.08949)](https://arxiv.org/abs/1512.08949)
- [Surprise-Guided MergeSort: Budget-Efficient Human-in-the-Loop Ranking (arXiv 2606.15623)](https://arxiv.org/abs/2606.15623)
