# Comparable products: how "recommended for you" and "taste match" are built from ratings, rankings, and play/watch history

Research date: 2026-09-24. All claims dated where the source gives a date. "Published" means the company's own page, blog, or paper. "Third party" means press, reverse engineering, or a competitor's write-up. Several primary sites (criticker.com, flickchart.com, netflixtechblog.com, backloggd.medium.com) block automated fetches; where that happened I used Wayback Machine captures of the same URL and say so.

## Criticker: Taste Compatibility Index (TCI) and Probable Score Index (PSI)

### Takeaway
Criticker publishes its entire method, and it is simple enough to run in SQL overnight. Each user's ratings are turned into percentiles. TCI is the mean absolute percentile difference over the titles two users share (lower is better). PSI averages the percentiles of your 10 closest users (out of your stored top 1,000) who rated the title, then maps that back onto your own scale. PSI appears only when at least 3 of your top 1,000 have rated the title, and recommendations start after 10 ratings. It runs on a two-person team, it covers film, TV and games, and it shows the math behind every number. That makes it the closest public analog to a Beli-style Rec score plus Match Score.

### Cited Findings
**Normalization (percentiles)**
- Criticker compares the percentile rank of each rating, not the raw score, because "a rating of 75 can mean something different for each user." Published formula: `percentile = floor((num_lower + (num_matching / 2) / total_ratings) * 100)`. Worked example: with 251 ratings, 195 lower than 85 and 10 equal to 85, a new 85 is the 79th percentile. Percentiles run 0 to 99 and can never reach 100 — [Criticker "How Criticker Works" (/explain/), Wayback capture 2025](https://web.archive.org/web/2025/https://www.criticker.com/explain/)
- "In order to generate percentiles at all, you must have at least five distinct ratings" — [Criticker /explain/, Wayback 2025](https://web.archive.org/web/2025/https://www.criticker.com/explain/)
- Scale is 0 to 100. Criticker says 5-star or 10-point scales cause clumping ("everything often ends up at '3.5' or '4 stars'"). It "will adjust to whatever system you adopt... as long as there's at least some difference in your scores" — [Criticker's Predictive Algorithm Explained, Wayback capture (page footer © 2026)](https://web.archive.org/web/2024/https://www.criticker.com/critickers-algorithm-explained/)
- Scores are colored by percentile (e.g. if 65 is your lowest rating it is treated as the 0th percentile and shown red). Users can define custom colors and "quips" for score ranges — [Criticker Help/FAQ, Wayback capture (footer © 2025)](https://web.archive.org/web/2023/https://www.criticker.com/help/)

**TCI (user-user similarity)**
- "If my percentile for Miller's Crossing is 68, and yours is 85, that's a difference of 17. The TCI is simply the average of all such differences, across titles which we both have rated." Lower TCI means closer taste. The worked example calls a TCI of 10.67 "really good" — [Criticker /explain/](https://web.archive.org/web/2025/https://www.criticker.com/explain/); [Algorithm Explained](https://web.archive.org/web/2024/https://www.criticker.com/critickers-algorithm-explained/)
- Criticker stores each user's "top 1000 TCIs (or 2000 if you're a sponsor)" — [/explain/](https://web.archive.org/web/2025/https://www.criticker.com/explain/)
- Overlap gate, version 1: TCIs are computed only with users "with whom you have at least 10% of your titles in common" (with 251 ratings you need 25 in common). The user can set this from 10% to 50% on their profile — [/explain/](https://web.archive.org/web/2025/https://www.criticker.com/explain/)
- Overlap gate, version 2: "Once you have at least 10 titles rated, Criticker will start matching you to other users. As long as you have 3 titles in common with another user, we will generate your ... TCI. This three-title minimum raises, the more ratings you have" — [Algorithm Explained](https://web.archive.org/web/2024/https://www.criticker.com/critickers-algorithm-explained/). (The two pages agree if the 3-title floor is the small-profile case of the 10% rule. Neither page says so explicitly.)
- Transparency: "On any other user's profile page, you can see the math behind the TCI generation": every shared title, the difference, and the resulting average — [/explain/](https://web.archive.org/web/2025/https://www.criticker.com/explain/); [Algorithm Explained](https://web.archive.org/web/2024/https://www.criticker.com/critickers-algorithm-explained/)

**PSI (predicted score)**
- "Criticker gathers your top ten TCIs who've given it a rating. As long as at least three of your top 1000 TCIs have rated this film, a prediction can be made. The percentiles of their ratings are averaged, and that resulting average percentile is applied to your rating scale." Example: average percentile 56.33 → your PSI 77 for Tenet — [Algorithm Explained](https://web.archive.org/web/2024/https://www.criticker.com/critickers-algorithm-explained/)
- Second example: 229 of your top 1,000 have seen The NeverEnding Story. The top 10 of them average the 46th percentile, which becomes a PSI of 72 "because 46% of your ratings (117 of 251) are below 72." "PSIs can only be built if at least 3 of your top 1000 have rated the title in question" — [/explain/](https://web.archive.org/web/2025/https://www.criticker.com/explain/)
- "Whenever you visit a particular title, the PSI is generated from scratch." Early on, "with every title you rate, your TCIs might change drastically" — [Algorithm Explained](https://web.archive.org/web/2024/https://www.criticker.com/critickers-algorithm-explained/)
- Naming is inconsistent on Criticker's own pages: "Probable Score Index" (FAQ), "Probable Rating Indicator" (/explain/ heading), "Probable Score" (FAQ answer) — [FAQ](https://web.archive.org/web/2023/https://www.criticker.com/help/); [/explain/](https://web.archive.org/web/2025/https://www.criticker.com/explain/)

**Minimum-data gates and product surface**
- Home page: "Start getting recommendations after rating just ten titles." It advertises 22,331,000 ratings and imports from Letterboxd, IMDb, and CSV (capture 2025) — [Criticker home via /faq/ redirect, Wayback 2025](https://web.archive.org/web/2025/https://www.criticker.com/faq/)
- FAQ: "50 is a good start, but recommendations really start improving after 100" — [Criticker Help/FAQ](https://web.archive.org/web/2023/https://www.criticker.com/help/)
- Explanation surface: "We show all of the calculations behind our recommendations, so you can see exactly which users contributed to the prediction and the math behind how we arrived at your Probable Score." There is a "PSI List" and a "TCI list" / "Best TCIs" page — [FAQ](https://web.archive.org/web/2023/https://www.criticker.com/help/); nav on [/explain/](https://web.archive.org/web/2025/https://www.criticker.com/explain/)
- Negative feedback: a built-in "Ignored titles" collection "to tell us to stop recommending a particular title" — [FAQ](https://web.archive.org/web/2023/https://www.criticker.com/help/)
- Operations: launched 2005. "Developed and maintained by a team of just two people," bootstrapped. Sponsors get "full daily PSI and TCI updates" — [FAQ](https://web.archive.org/web/2023/https://www.criticker.com/help/)
- Criticker runs a games site (games.criticker.com) with the same algorithm pages — [games.criticker.com/explain](https://games.criticker.com/explain/) (seen in search results; fetch blocked by Cloudflare)

### Inferences
- The published percentile formula has misplaced parentheses. The worked example (79 from 195, 10 and 251) only works as `floor(((num_lower + num_matching/2) / total) * 100)`, which is the standard mid-rank percentile.
- Verso's 0-10 positional score is already a within-user rank, so Criticker's normalization step comes for free. TCI over positional percentiles is a single SQL aggregate over shared items, easy to run as a nightly job.
- "Sponsors get full daily updates" suggests free users' TCIs and PSIs are refreshed less often than daily. The PSI on a title page is recomputed on view from the stored TCI list. That split (neighbors precomputed in batch, prediction computed on read) fits Postgres plus nightly jobs well.
- The PSI gate (≥3 neighbors among the top 1,000, using the best 10) is effectively a kNN with an explicit confidence floor. Verso could show "not enough overlap yet" instead of a number, as Criticker does.
- Criticker hides nothing, and its differentiator is "you can see exactly which users contributed." For a friends-first app, "Alex and Sam, your closest matches, both ranked this in their top tier" is the Criticker explanation in social form.

### Gaps
- The live criticker.com FAQ and help pages returned Cloudflare 403 to automated fetches. Content comes from Wayback captures (2023 to 2026 footers), and the current live wording was not verified.
- Criticker publishes no accuracy numbers (e.g. mean error of PSI vs actual rating).
- The exact update cadence for non-sponsors was not found.

## Flickchart: rankings from pairwise matchups, confidence, "For You," and chart comparison

### Takeaway
Flickchart builds each user's chart from head-to-head matchups with a "weighted ranking algorithm" that uses confidence levels. It hides a movie's score (⏳) until the movie has had enough matchups. It now has a "For You" recommendations page, but it publishes no method details, thresholds, or user-to-user compatibility feature. Global rankings use a Bayesian average of each film's position in individual charts, not its win rate.

### Cited Findings
- Current FAQ: a "more sophisticated weighted ranking algorithm." "Each matchup influences your entire chart, not just the two movies involved." Placement uses "confidence levels and statistical models," and movies are "positioned based on overall context of your entire ranking history" — [Flickchart FAQ, fetched 2026-09-24](https://www.flickchart.com/faq)
- Confidence gate: "Movies need to reach a threshold of matchups before Flickchart has high confidence in their placement." An hourglass ⏳ means "the movie doesn't have enough rankings yet to earn a score." No number is published — [Flickchart FAQ](https://www.flickchart.com/faq)
- Global influence scales with chart size: "Someone with 1,000 ranked movies will have significantly more impact than someone with only 75 ranked films" — [Flickchart FAQ](https://www.flickchart.com/faq)
- "For You" page: analyzes "your existing rankings and preferences," identifies "patterns in your favorite genres, directors, actors, and themes," "compares your taste with similar users," and "recommendations improve in accuracy as you rank more movies." No launch date or algorithm is given — [Flickchart FAQ](https://www.flickchart.com/faq)
- The FAQ does not mention compatibility, chart comparison, or "twins" between users — [Flickchart FAQ](https://www.flickchart.com/faq)
- Global rankings (Nov 21, 2010): "The new algorithm uses a Bayesian formula to take into account those movies that have been ranked by fewer total users, but whose average rankings are very high... this does not use a movie's winning percentage... but rather the average position where each movie exists on everyone's individual Flickchart" — [Flickchart blog, "The Global Rankings 2," Wayback](https://web.archive.org/web/2016/http://www.flickchart.com/blog/the-global-rankings-2-rankings-reloaded/)
- User reaction in the same post's comments: a film "seen by 3 people" ranked "7,000 spots ahead of Star Wars: Phantom Menace." Commenters asked for a minimum count such as "at least 100." A founder replied they would "continue to tweak" — [same post](https://web.archive.org/web/2016/http://www.flickchart.com/blog/the-global-rankings-2-rankings-reloaded/)
- A search-engine summary of the FAQ said Flickchart uses "the percentile position a movie has in your chart" rather than absolute position for globals. I could not confirm this wording on the fetched FAQ — [Flickchart FAQ (search snippet)](https://www.flickchart.com/faq)

### Inferences
- Flickchart's hidden score before a confidence threshold is directly analogous to Verso's comparison log. A ranked item placed with few comparisons (e.g. a "too close" tie, or an early binary-search exit) could carry lower weight in taste-match math.
- The 2010 Bayesian backlash is a cautionary tale for any community "top" list or group recommendation that averages positions: the prior strength needs tuning, or small-sample items dominate.
- Using chart position (a percentile) rather than win rate is the same design Verso already has (a positional 0-10 score).

### Gaps
- No published description of the "weighted ranking algorithm" (Elo, Bradley-Terry, or other), the matchup threshold, or how "For You" works. The launch date of "For You" was not found.
- No evidence found of a Flickchart user-to-user compatibility score, current or historical.

## Steam: Interactive Recommender (playtime neural model), Discovery Queue, friends and "players like you," review-score thresholds

### Takeaway
Valve trains a neural model only on playtime histories. The only game attribute it is fed is release date. It uses no tags or review scores, it normalizes playtime per game so short games are not penalized, and it exposes popularity ("mainstream-ness") and recency as user sliders. Valve publicly states its cold-start limit (it cannot recommend unplayed new releases) and pairs the model with a Discovery Queue for new games. It explains recommendations with short reason strings such as "Players like you love this game," friends who play a game, or "similar to games you play."

### Cited Findings
- Jul 11, 2019 (Steam Labs): "a neural-network model that is trained to recommend games based on a user's playtime history, along with other salient data. We train the model based on data from many millions of Steam users and many billions of play sessions" — [Steam blog, "Introducing the Interactive Recommender," Jul 11, 2019](https://store.steampowered.com/news/posts/?feed=steam_blog&enddate=1563000000)
- Same post: "the only information about a game that gets explicitly fed into the process is the release date... using release date as part of the model training process yields better quality results than simply applying it as filter on the output. Notably, we do not use information about tags or review scores when creating the model." Tag filtering is applied to the final results only — [Steam blog, Jul 11, 2019](https://store.steampowered.com/news/posts/?feed=steam_blog&enddate=1563000000)
- Why not content similarity: "just because you play a lot of Beat Saber, doesn't mean we should only ever recommend you VR rhythm games" — [Steam blog, Jul 11, 2019](https://store.steampowered.com/news/posts/?feed=steam_blog&enddate=1563000000)
- Popularity slider: "We chose 'popularity' just because there might not be a more accurate term, but you could also think of it as 'mainstream-ness'... especially for people who play a lot of games, digging into the 'niche' end of the range can be a very effective way to find hidden gems" — [Steam blog, Jul 11, 2019](https://store.steampowered.com/news/posts/?feed=steam_blog&enddate=1563000000)
- Cold start: "The model can't recommend games that don't have players yet... when re-trained it picks up on new releases with just a few days of data. That said, it can't fill the role played by the Discovery Queue in surfacing brand new content" — [Steam blog, Jul 11, 2019](https://store.steampowered.com/news/posts/?feed=steam_blog&enddate=1563000000)
- Normalization: "Your playtime data is normalized to reflect the distribution of playtime in each game, ensuring that all games are on an equal footing" (short games vs thousand-hour games) — [Steam blog, Jul 11, 2019](https://store.steampowered.com/news/posts/?feed=steam_blog&enddate=1563000000)
- Mar 18, 2020 (store-wide launch, formerly "Steam Labs Experiment 002"): results appear on the store homepage, and customizations carry over. Valve began applying the model elsewhere: "when viewing the page for a particular game, you may sometimes see 'Players like you love this game' shown as a reason why the game is relevant to you." The same model powers "Experiment 008: Play Next" (owned but unplayed games) — [Steam blog, "Introducing The Steam Interactive Recommender," Mar 18, 2020](https://store.steampowered.com/news/posts/?feed=steam_blog&enddate=1584723646)
- Evaluation: Valve measured "clickthrough rates, and conversion rates to wishlist and purchases," which "compared favorably with other Steam features... consistently over the following months," with "well over 10,000 different games purchased as a result of visits to the Interactive Recommender page" — [Steam blog, Mar 18, 2020](https://store.steampowered.com/news/posts/?feed=steam_blog&enddate=1584723646)
- Discovery Queue (Discovery Update, Sep 22, 2014): "a queue of 12 titles personalized for each user, which includes recommended titles, new titles, and popular releases." Inputs: games you've been playing, what friends recommend and enjoy, followed Curators, and well-reviewed titles by category. Owned games are filtered by default, with a "Not Interested" option — [Steam Discovery Update page](https://store.steampowered.com/about/newstore)
- Press at launch: in the queue "you can see why each game is being recommended specifically to you; maybe it's because you have friends who play it, or it's similar to other games you play" (third party) — [Digital Trends, 2014](https://www.digitaltrends.com/gaming/steam-now-makes-easier-find-new-games-share-faves/)
- Discovery Queue redesign in July 2022 (third party, not read in detail) — [GamingOnLinux, Jul 2022](https://www.gamingonlinux.com/2022/07/valve-gives-the-discovery-queue-a-makeover-to-help-you-find-your-next-game/)
- Review-score labels (for context; Valve has never officially published them, and third parties reverse-engineered them): Overwhelmingly Positive = 95%+ positive with 500+ reviews; Very Positive = 80%+ with 50+ reviews; Positive = 80%+ with 10-49; Mostly Positive = 70-79%; Mixed = 40-69%. Only reviews from direct Steam purchases count — [Steam Page Analyzer](https://www.steampageanalyzer.com/blog/steam-review-score-thresholds); [Bugnet blog](https://bugnet.io/blog/steam-review-score-thresholds-explained)

### Inferences
- Steam's playtime normalization per game is the implicit-signal version of Criticker's per-user percentile. Both avoid comparing raw magnitudes across very different distributions. Verso's positional score already normalizes per user. If Verso ever imports playtime, per-game normalization is the Steam lesson.
- Two knobs worth copying for a small team: a popularity-vs-niche blend weight and a recency window. MovieLens (below) found users disagree strongly on the right setting, and Steam exposes both as sliders.
- Valve pairs a collaborative model with separate "new releases" and "friends" surfaces rather than forcing one model to do everything. A small tracker can do the same with a CF row, a "friends ranked this" row, and a "new and well-ranked" row.
- The reason strings are short, one-clause justifications ("Players like you love this game," "friends play this"). A per-row or per-item reason is cheap and does not require exposing the model.

### Gaps
- Valve has not published the network architecture, embedding size, retraining cadence (beyond "a few days of data"), or how "other salient data" is defined.
- I found no 2024-2026 Valve post changing the Interactive Recommender's signals. Not confirmed either way.

## Netflix: Prize lessons, percentage match (2017 to 2024), rows, and the shift to implicit signals and ranking

### Takeaway
Netflix's public lessons transfer directly to a small app. Of the Prize ensemble, it put only two models (SVD matrix factorization and RBM, linearly blended) into production. It ranks by a blend of predicted preference and popularity rather than predicted rating alone. It treats explanations and "awareness" as trust-builders. It organizes the homepage as titled rows, each row an explanation. It replaced 5 stars with thumbs in 2017 (200% more ratings) and showed a personal "% match." By January 2024 it said it would likely drop the % match in favor of descriptive tags.

### Cited Findings
**Prize lessons (Apr 6, 2012, Amatriain and Basilico)**
- Netflix's RMSE baseline was 0.9525, and the target was 0.8572. The first Progress Prize went to an 8.43% improvement from "a final combination of 107 algorithms" after "more than 2000 hours of work." "SVD by itself provided a 0.8914 RMSE, while RBM alone provided... 0.8990 RMSE. A linear blend of these two reduced the error to 0.88." Those two went into production — [Netflix TechBlog, "Beyond the 5 stars (Part 1)," Wayback](https://web.archive.org/web/2024/https://netflixtechblog.com/netflix-recommendations-beyond-the-5-stars-part-1-55838468f429)
- On the $1M Grand Prize ensemble: "the additional accuracy gains that we measured did not seem to justify the engineering effort needed to bring them into a production environment" — [same](https://web.archive.org/web/2024/https://netflixtechblog.com/netflix-recommendations-beyond-the-5-stars-part-1-55838468f429)
- "75% of what people watch is from some sort of recommendation" (2012) — [same](https://web.archive.org/web/2024/https://netflixtechblog.com/netflix-recommendations-beyond-the-5-stars-part-1-55838468f429)
- Explanation and trust: "We want members to be aware of how we are adapting to their tastes. This not only promotes trust in the system, but encourages members to give feedback." Recommendations are explained as matching "your explicit taste preferences and ratings, your viewing history, or even your friends' recommendations." Genre rows are explained "using a member's implicit genre preferences — recent plays, ratings, and other interactions — or explicit feedback provided through our taste preferences survey" — [same](https://web.archive.org/web/2024/https://netflixtechblog.com/netflix-recommendations-beyond-the-5-stars-part-1-55838468f429)
- Rows: "Each row has a title that conveys the intended meaningful connection between the videos in that group." Each genre row has "3 layers of personalization: the choice of genre itself, the subset of titles selected within that genre, and the ranking of those titles." Placing the most tailored rows higher increased retention — [same](https://web.archive.org/web/2024/https://netflixtechblog.com/netflix-recommendations-beyond-the-5-stars-part-1-55838468f429)
- Ranking beyond rating prediction: "Using predicted ratings on their own as a ranking function can lead to items that are too niche or unfamiliar being recommended." Illustrative model: `frank(u,v) = w1·p(v) + w2·r(u,v) + b` (popularity plus predicted rating), with weights learned via learning-to-rank — [Netflix TechBlog, "Beyond the 5 stars (Part 2)," Wayback](https://web.archive.org/web/2024/https://netflixtechblog.com/netflix-recommendations-beyond-the-5-stars-part-2-d9b96aa399f5)

**2015 paper (Gomez-Uribe and Hunt, ACM TMIS)**
- Recommendations drive about 80% of hours streamed. Members lose interest after roughly 60 to 90 seconds of browsing. Personalization and recommendations save "over $1 billion per year" by reducing churn. Components: Personalized Video Ranker (PVR), Top-N Video Ranker, Continue Watching Ranker, and video-video similarity ("sims") powering "Because You Watched" rows — [New America case study summarizing Gomez-Uribe and Hunt 2015](https://www.newamerica.org/insights/why-am-i-seeing-this/case-study-netflix/); paper: [ACM DL](https://dl.acm.org/doi/10.1145/2843948)
- A member reviews "10 to 20 titles (perhaps 3 in detail) on one or two screens" (secondary summary) — [Quartz via search](https://qz.com/622316/netflix-knows-exactly-how-long-youll-look-for-something-to-watch-before-giving-up)

**Thumbs and % match (2017)**
- Mar 16, 2017: thumbs replaced 5 stars. In 2016 tests with hundreds of thousands of members, thumbs "led to 200% more ratings being given." The new "percent-match feature" was "designed to indicate how good of a match a show or movie is for you," with examples like "a 95% or even 100% match" — [TechCrunch, Mar 16, 2017](https://techcrunch.com/2017/03/16/netflix-is-replacing-five-star-ratings-with-thumbs-up-or-down/)
- Apr 6, 2017: the % match "is a prediction of what Netflix thinks you may enjoy watching." It is individual and not a measure of overall popularity — [FlatpanelsHD, Apr 6, 2017](https://www.flatpanelshd.com/news.php?subaction=showfull&id=1491463502)
- Reported but not verified here: titles under 50% match show no match number (from a search summary of Variety 2017) — [Variety, 2017](https://variety.com/2017/digital/news/netflix-thumbs-vs-stars-1202010492/)

**Current help-center wording (fetched 2026-09-24)**
- Netflix says it learns what you might like from "the genres you watch, your viewing history, the ratings of Netflix members who have similar tastes to you." Ratings are "Not for me," "I like this," and "Love this!" The page describes flagging a good match with an icon rather than a percentage — [Netflix Help Center](https://help.netflix.com/en/node/9898) (read through a summarizing fetch tool; exact icon wording not independently confirmed)

**Dropping % match (2024)**
- Jan 17, 2024: Netflix confirmed to IndieWire that it will "likely" drop match percentages in favor of tags. Per the New York Times, it has over 3,000 tags maintained by 30 full-time employees, and viewer interest drops "precipitously" after 53 seconds — [MobileSyrup, Jan 17, 2024](https://mobilesyrup.com/2024/01/17/netflix-content-match-percentages-tags-report/); [IndieWire](https://www.indiewire.com/news/business/match-percentages-netflix-going-away-1234944402/)
- Conflict: one search summary claimed "Match launched in 2021." That contradicts the 2017 TechCrunch and FlatpanelsHD reports and is probably a confusion with the 2021 "Play Something" / "Surprise Me" button — [comicbook.com (search snippet)](https://comicbook.com/movies/news/netflix-match-percentage-remove-streaming-algorithm-tags/) vs [TechCrunch 2017](https://techcrunch.com/2017/03/16/netflix-is-replacing-five-star-ratings-with-thumbs-up-or-down/)

**Recent direction (implicit sequences)**
- March 2025: Netflix described a single transformer "foundation model" trained autoregressively on tokenized interaction histories (hundreds of billions of interactions, 300M+ users), replacing many specialized models (secondary summaries of the TechBlog post) — [ZenML summary](https://www.zenml.io/llmops-database/foundation-model-for-personalized-recommendation-at-scale); original: [Netflix TechBlog](https://netflixtechblog.com/foundation-model-for-personalized-recommendation-1a0bd8e02d39)
- July 2026: Netflix TechBlog published "GenRec: Towards LLM-Native Recommendation at Netflix" (title seen in search results only; not read) — [Netflix TechBlog](https://netflixtechblog.com/genrec-towards-llm-native-recommendation-at-netflix-f20be6f643e3)

### Inferences
- A two-model blend was "good enough" at Netflix scale. For Verso, a baseline (item mean plus user bias) plus one neighborhood or factorization model is the right level of ambition.
- The % match story is a caution for a Beli-style "Rec score." Netflix's number was personal but hard to interpret, and in 2024 it moved toward descriptive tags ("why"), not better numbers ("how much"). A displayed number should come with a reason string and a hide-below-threshold rule.
- Netflix and MovieLens (below) both found that sorting by predicted score alone surfaces obscure items, and both blend in popularity. The same will happen with a small user base, where kNN predictions for rarely ranked items are noisy.
- Rows with titles such as "Because you ranked X" or "Your friends' top tier" are Netflix's cheapest explanation mechanism and map well to a mobile home screen.

### Gaps
- The original netflixtechblog.com pages were Cloudflare-blocked. Text came from Wayback captures.
- I found no Netflix statement defining the % match computation or its display threshold. The "<50% hidden" claim is unverified.
- Whether any % match remains on any Netflix surface in September 2026 was not confirmed.

## Letterboxd: official features (none for recs or compatibility) and third-party tools

### Takeaway
As of September 2026 I found no official Letterboxd personalized-recommendation or user-compatibility feature. Recent official discovery work is curated "Featured Lists," better search, and a rental "Video Store" (December 2025). Third-party tools fill the gap. The best-documented one uses SVD collaborative filtering on scraped ratings, and taste-compatibility tools exist but mostly do not publish their math.

### Cited Findings
- Recent official changes found: "Featured Lists" for discovery, upgraded search (acronyms, misspellings), and Letterboxd Video Store launched December 2025 — [TechCrunch, Nov 20, 2025](https://techcrunch.com/2025/11/20/letterboxd-to-launch-new-movie-rental-feature-in-december); [Wikipedia: Letterboxd](https://en.wikipedia.org/wiki/Letterboxd)
- Sam Learner's "Letterboxd Recommendations": star ratings are mapped to 1-10 (half stars included) and "folded into a model that's been trained on a sample of ratings from other users... using singular value decomposition (SVD)." Every unrated movie is scored and the top predictions returned (50 per filter set). The maximum user-selectable training sample is "about five million ratings, though there are over 50 million ratings in the full dataset" — [GitHub README, sdl60660/letterboxd_recommendations](https://github.com/sdl60660/letterboxd_recommendations); live at [letterboxd.samlearner.com](https://letterboxd.samlearner.com/)
- Same author on limitations: the model "is completely blind to genres, themes, directors, cast." It "tends to recommend very popular movies often, regardless of an individual user's taste" and "occasionally just completely whiffs" — [README](https://github.com/sdl60660/letterboxd_recommendations)
- Toolboxd "Taste Compatibility" (letterboxd.tools, by Daniel Quandt): "Not affiliated with Letterboxd. Built on their API." Its page shows "Model trained 2026-06-30 · 9,999 films · 315,760 taste profiles." The scoring method is not disclosed — [Toolboxd compatibility](https://letterboxd.tools/tools/compatibility). A search snippet describes a head-to-head readout with "the films you agree and clash on, and what's on both watchlists" — [Toolboxd](https://letterboxd.tools/)
- Other community tools exist (not read): Match Letter, a Streamlit pair-similarity app, and a profile-compare tool — [matchletter.com](https://www.matchletter.com/); [jsalvasoler/letterboxd_user_comparison](https://github.com/jsalvasoler/letterboxd_user_comparison); [vn-ki/letterboxd-compare](https://github.com/vn-ki/letterboxd-compare)

### Inferences
- Demand for "compatibility with a friend" on Letterboxd is strong enough to spawn several unofficial tools. A first-party taste-match feature is a differentiator in this category, not table stakes.
- The popularity bias Learner reports from plain SVD on a small sample matches the Netflix and MovieLens experience. Verso will need to de-bias popularity or at least expose a niche/mainstream control.
- The compatibility tools display agreements and clashes (specific shared films), which is Criticker's transparency move in a friendlier form.

### Gaps
- Absence of an official Letterboxd feature is inferred from search results and recent coverage. I did not find a Letterboxd statement ruling it out.
- The methods of Toolboxd, Match Letter, and similar tools are undisclosed or unread.

## Goodreads and StoryGraph: book recommendations and how they are explained

### Takeaway
Goodreads launched algorithmic recommendations in September 2011 after buying Discovereads. It requires 20 ratings, uses co-shelving plus "enjoyed by the same people," and explains recommendations by shelf or genre plus seed books. StoryGraph (revamped December 21, 2023) leans on an explicit Reading Preferences Survey (with free text, "reference reads," and content-warning exclusions) feeding an ML system. Its recommendations are organized as shelves of a personal "bookstore," including a "books similar users loved" row and an "Out of your comfort zone" row. It publishes no method details.

### Cited Findings
- Goodreads acquired Discovereads (algorithmic book recommendations) in March 2011 — [Wikipedia: Goodreads (citing NYT, Mar 10, 2011)](https://en.wikipedia.org/wiki/Goodreads); [Newswire](https://www.newswire.com/news/goodreads-acquires-discovereads-to-build-algorithmic-book-recommendations-120011)
- Sep 15, 2011 launch post (Kyusik Chung): "combines multiple proprietary algorithms which analyze 20 billion data points," mapping "how often they appear on the same bookshelves and whether they were enjoyed by the same people." Users must "rate at least 20 books." Recommendations can be dismissed with "not interested," and users choose which shelves feed recommendations — [Goodreads blog, Sep 15, 2011](https://www.goodreads.com/blog/show/303-announcing-goodreads-personalized-recommendations)
- Explanation style (same post): "If you're approaching this as Historical Fiction and have enjoyed [two titles], then a great recommendation for you is [title]." On the recommendations page, hovering shows "the book or books the recommendation was based on" (third-party description) — [Goodreads blog](https://www.goodreads.com/blog/show/303-announcing-goodreads-personalized-recommendations); [Libraries & Legends, Mar 3, 2024](https://librariesandlegends.wordpress.com/2024/03/03/how-to-customise-goodreads-to-get-5-star-book-recommendations/)
- Critics in 2020-2023 called Goodreads recommendations "increasingly... primitive" next to StoryGraph — [Wikipedia: Goodreads (citing New Statesman Sep 10, 2020; Washington Post Jul 1, 2023)](https://en.wikipedia.org/wiki/Goodreads)
- StoryGraph revamp, Dec 21, 2023: a personalized "bookstore" with "lists curated just for you, including genre picks, suggestions based on your recent reads, books similar users loved," plus an "Out of your comfort zone" list. The Reading Preferences Survey includes "reference reads" — [StoryGraph changelog, "Revamped Recommendations"](https://roadmap.thestorygraph.com/changelog/revamped-recommendations)
- StoryGraph staff (Nadia, Sep 14 and 16, 2023): recommendations use "a much more complex machine learning system" driven primarily by the reading preferences survey. The overhaul "will be more clear about why a certain book was recommended to you." The request was marked planned, with 11 votes — [StoryGraph roadmap request](https://roadmap.thestorygraph.com/requests-ideas/posts/add-something-to-recommendations-to-let-me-know-why-it-s-recomme)
- Survey guidance (from search snippet; page fetch was 403): best results when the free-text answer is "a simple, comma-separated list." Books with content warnings the user lists are excluded. There is an "Advanced Configuration" section, and answers can be edited anytime — [StoryGraph recommendations survey guidelines](https://app.thestorygraph.com/recommendations/guidelines)
- Third-party claims (not verified from StoryGraph): the AI was built by Rob Frelow, one of its founders, and it uses ratings, moods, pace and DNFs — [Cybernews](https://cybernews.com/news/storygraph-viable-goodreads-alternative/); [App Store listing](https://apps.apple.com/us/app/storygraph-reading-tracker/id1570489264)

### Inferences
- Both use the minimum-ratings gate (Goodreads 20, Criticker 10). StoryGraph's survey is a way to skip that gate by collecting explicit preferences on day one. For Verso, an onboarding "pick what you've played and loved" step plays the same role.
- StoryGraph's "books similar users loved" and "Out of your comfort zone" rows show that a small team can present CF output as labeled shelves instead of a single score.
- Goodreads' explanation ("because you shelved X as historical fiction and liked Y and Z") is the item-item neighborhood explanation. It needs only the seed items that contributed, which Verso can store alongside each recommendation.

### Gaps
- No published algorithm details for current Goodreads (2024-2026) or for StoryGraph's ML model. StoryGraph's survey guidelines page returned 403.
- I found no StoryGraph user-to-user compatibility score.

## MovieLens (GroupLens): published algorithms, prediction display, and cold-start onboarding research

### Takeaway
MovieLens went through user-user CF (1997), item-item CF (2003, then LensKit in 2012), and by 2014 a user-selectable menu including FunkSVD and a special new-user recommender. Until v4 it sorted by predicted rating; v4 blends in popularity. Onboarding moved from "rate 5" (v0) to "rate 15" (v3, popular-but-not-top-150 movies shown 10 at a time) to no gate with group-based elicitation (v4, 2014). Rashid et al. (2002) showed that choosing items the user is likely to know (popularity, or log-popularity times entropy) cuts signup effort more than threefold versus the old strategy. A 2015 GroupLens study found users diverge on how much popularity or recency they want, and 85% changed the default when given control.

### Cited Findings
- Algorithm history: "1997: user-user CF... 1999: user-user CF via Net Perceptions... 2003: item-item CF via MultiLens... 2012: item-item CF via LensKit... 2014: users able to select... from: a non-personalized algorithm, a recommender that supports new users [Chang et al. 2015], item-item CF and FunkSVD via LensKit" — [Harper and Konstan, "The MovieLens Datasets: History and Context," ACM TiiS 2015](https://files.grouplens.org/papers/harper-tiis2015.pdf)
- Ordering: "MovieLens, until the release of v4, ordered lists of movies strictly based on user-personalized predicted rating values... v4 blends a popularity factor in with predicted rating" — [Harper and Konstan 2015](https://files.grouplens.org/papers/harper-tiis2015.pdf)
- Prediction display: v0-v3 used a star image "where the color represented prediction or actual rating." v4 merged view and input into one five-star widget — [Harper and Konstan 2015](https://files.grouplens.org/papers/harper-tiis2015.pdf)
- Onboarding gates: "Early versions, starting in v0, required users to rate 5 movies before entering the system... shown movies 10 at a time, where nine were randomly chosen... and the tenth chosen from a hand-chosen list of highly-recognizable titles. In v3, the process was changed to require 15 ratings... selected for their popularity, excluding the most popular 50-150 movies. Version v4 dropped the 15 rating requirement, instead developing a special new user recommender, based on a faster group-based personalization process [Chang et al. 2015]. We do not yet know the long-term benefits and costs of dropping this barrier" — [Harper and Konstan 2015](https://files.grouplens.org/papers/harper-tiis2015.pdf)
- Group recommendations: v2 had persistent "groups" (PolyLens) for "jointly-optimized recommendations." v3 replaced them with pairwise "buddies" because "group creation was too hard and groups were too inflexible." About 9,000 users used buddies, connecting with a median of 1 other user (avg 1.8) — [Harper and Konstan 2015](https://files.grouplens.org/papers/harper-tiis2015.pdf)
- Scale context: MovieLens "averaged 20-30 new user sign ups every day" — [Harper and Konstan 2015](https://files.grouplens.org/papers/harper-tiis2015.pdf)
- Group-based elicitation paper: Chang, Harper and Terveen, "Using Groups of Items for Preference Elicitation in Recommender Systems," CSCW 2015, pp. 1258-1269. It collects preferences on groups of items rather than single items (details not read) — [search result citing CSCW '15](https://arxiv.org/html/2307.09985v3)
- Rashid et al. 2002 ("Getting to Know You," IUI): six strategies (Random, Popularity, Entropy, Pop*Ent, log Pop*Ent, Item-Item personalized). In a live test with 351 new users (302 completed), Random and Entropy were dropped after a pilot because users would have to see "prohibitively" many titles. "The Classique strategy required over three times the effort of the best strategies, Popularity and Item-Item personalized." "Popularity provides a good balance between effort and accuracy. Pop*Ent trades effort for more accuracy; Item-Item personalized trades accuracy for less effort" — [Rashid et al., IUI 2002 (PDF)](https://cs.fit.edu/~pkc/apweb/related/rashid-iui02.pdf)
- Follow-up: Rashid, Karypis and Riedl, "Learning Preferences of New Users in Recommender Systems: An Information Theoretic Approach," SIGKDD Explorations 10(2), 2008 (not read) — [ACM DL](https://dl.acm.org/doi/10.1145/1540276.1540302)
- User control (Harper et al., RecSys 2015): scores are a linear blend of percentile-scaled predicted rating, popularity and age. "Even blending in 5% popularity" sharply cuts the number of unique top-20 movies across users. When given controls, "15% of subjects chose the original recommender... the remaining 85% chose a configuration one or more steps from the initial setting." The median chosen popularity weight was 0.021 (IQR 0.000-0.193). "There is no globally optimal setting that works for all users" — [Harper et al., "Putting Users in Control of their Recommendations," RecSys 2015](https://files.grouplens.org/papers/harper-recsys2015.pdf)

### Inferences
- The MovieLens path (user-user, then item-item, then factorization plus a popularity blend) is the canonical small-team progression. Item-item kNN on Verso's positional scores is the natural first model, with a popularity term kept small (a few percent) or user-tunable.
- The onboarding lesson for Verso's cold start: show items people are likely to have played (popular, with the very top excluded to gain information, as v3 did), then adapt with item-item once a few are ranked. Head-to-head ranking needs at least two items per tier to produce information, so the onboarding list should maximize "have played it" probability.
- MovieLens' group feature failed on friction (persistent groups were hard to create). Pairwise "buddies" chosen per request fits Verso's "pair or group" recommendation better than persistent group objects.

### Gaps
- The Chang et al. 2015 group-elicitation paper and the Ekstrand et al. 2015 "letting users choose algorithms" paper were not retrievable (GroupLens URLs returned HTML, not PDFs), so their quantitative results are not recorded here.
- Current (2026) MovieLens algorithm defaults were not checked.

## Game trackers: Backloggd, GG, Grouvee, SavePoint, Backloggr

### Takeaway
None of the dedicated game trackers has a published collaborative "people with your taste" recommender with a match score. Backloggd has a "Discovery Engine" in open beta (June to July 2025) that surfaces highly rated games you haven't played, with library-aware filters. SavePoint's paid "Decision Engine" picks three games from your backlog for tonight by mood, time and platform. I found no evidence of personalized recommendations in GG, Grouvee, or Backloggr.

### Cited Findings
- Backloggd 1.14.4: "New Discovery Engine (Open beta)," alongside "Further adjustments to weighted ratings" and a "Backloggd's Top 100 (Backer beta)" — [Backloggd on X, status 1937871015960359201 (mid-2025)](https://x.com/BackloggdApp/status/1937871015960359201)
- Discovery Engine description: "a custom algorithm to bubble up highly rated games you haven't played, and unique filters to tailor discovery around your library." It is open to signed-in users and returns a list of 60 games. Version 1.14.5 (July 2025) added a detailed mode and "a better sorting algorithm" — [Backloggd Medium, "Discover New Games" mini-update (search summary)](https://backloggd.medium.com/discover-new-games-mini-update-f373539b410e); [Developer Update: July 2025](https://backloggd.medium.com/developer-update-july-2025-6a76ee8baae4)
- Backloggd's 2026 plans include cleaning up "betas... such as the Discovery Engine" (search summary; page blocked) — [Backloggd, "Looking Back at 2025"](https://backloggd.medium.com/looking-back-at-2025-5428076d3f80)
- Backloggd moved game averages to a Bayesian average in 1.14: "The less ratings a game has, the more it's 'pulled' towards the average of all game averages," replacing a "dynamic threshold for number of ratings" that "was never perfect" (Mar 28, 2025) — [Backloggd Developer Update: March 2025, Wayback](https://web.archive.org/web/2025/https://backloggd.medium.com/developer-update-march-2025-3e0601ac9efc)
- SavePoint (Two Average Gamers, 2026 FAQ): "the Decision Engine actually picks three games for you to play tonight given your time and mood, instead of dumping a list back in your lap." It is a TAG Pro feature ($9/month or $99/year). The catalog has "32,990 video games from IGDB and 2,316 board games from BoardGameGeek." Steam import carries "Playtime... as hoursPlayed." No method is published — [SavePoint FAQ](https://savepoint.twoaveragegamers.com/faq)
- Platform is a Decision Engine input according to a TAG comparison article (TAG makes SavePoint, so this is not an independent source) — [Two Average Gamers, "Backloggd vs GG vs SavePoint"](https://www.twoaveragegamers.com/backloggd-vs-gg-vs-savepoint/)
- GG (ggapp.io) markets discovery of "hidden gems, trending releases, and highly-rated games all based on community feedback." That is community-level ranking, and I found no personal CF — [GG App Store listing](https://apps.apple.com/us/app/gg/id1320588074); [ggapp.io](https://ggapp.io/)

### Inferences
- The games-tracker category is open for a real "people who rank like you" recommender and a friend taste-match. Verso would be first among the trackers found.
- SavePoint's "three picks for tonight by mood, time, platform" is a context filter over the backlog, not taste modeling. It is compatible with Verso's rule that the backlog never touches ranking: a backlog picker can use predicted scores without writing to rankings.
- Backloggd's move to Bayesian averages shows the same small-sample problem Flickchart hit in 2010, and a prior-weighted mean is the standard fix.

### Gaps
- Backloggd Medium posts were blocked (403). Discovery Engine details come from search summaries and one X post, and its algorithm is not public.
- No information was found on Backloggr. For Grouvee, no evidence of personalized recommendations was found (a Digital Trends article on it returned empty).

## Content-based precedents and Spotify: Music Genome, Jinni, TasteDive, Likewise, Discover Weekly, Blend

### Takeaway
Content-based "genome" systems (Pandora with up to 400 expert-scored attributes, Jinni with about 2,200 "genes" partly derived by NLP) show the cost of hand or NLP tagging. Jinni shut its consumer service in 2015. Mainstream practice (Spotify) is hybrid: collaborative filtering plus content models. Spotify Blend is the best-documented two-person precedent. It chose "maximize the joy" (each person's most relevant tracks, with equal representation) over "minimize the misery," and it shows a "taste match" percentage whose formula is unpublished.

### Cited Findings
- Pandora: "Each song in the Music Genome Project is analyzed using up to 400 distinct musical characteristics by a trained music analyst." Analysts typically hold "a four-year degree in music theory, composition or performance" — [Pandora MGP page (© 2005-2026)](https://www.pandora.com/corporate/mgp.shtml). Conflict: secondary sources say about 450 genes and 20-30 minutes per track — [Wikipedia: Music Genome Project](https://en.wikipedia.org/wiki/Music_Genome_Project)
- Jinni: a "movie genome" of about 2,200 "genes" (mood, style, plot, setting), derived partly via NLP and sentiment analysis of reviews. The public service shut down in June 2015 and pivoted to B2B for pay-TV/OTT operators — [Wikipedia: Jinni (search summary)](https://en.wikipedia.org/wiki/Jinni_(search_engine)); [TechCrunch, Oct 5, 2009](https://techcrunch.com/2009/10/05/ready-for-your-close-up-jinni-goes-into-public-beta/)
- TasteDive (formerly TasteKid): cross-media recommendations (music, movies, TV, books, games, podcasts) from like, dislike and "meh" ratings plus tags and trends. It is described as powered by Qloo's "Taste AI" (third-party summaries) — [HandWiki: TasteDive](https://handwiki.org/wiki/TasteDive); [TasteDive API docs](https://tastedive-api-documentation.readthedocs.io/en/latest/)
- Likewise: founded October 2017 by former Microsoft staff (Larry Cohen, Ian Morris, Michael Dix), with Bill Gates funding. "Users receive recommendations from the Likewise algorithm, people they follow, and the Likewise editorial team." It reached 1 million users by July 2020 — [Wikipedia: Likewise, Inc.](https://en.wikipedia.org/wiki/Likewise,_Inc.). Onboarding: pick a category, then tap titles you like (third party) — [How-To Geek](https://www.howtogeek.com/48156/icydk-likewise-app-offers-actually-good-recommendations/). A 2024 release cites "600 million consumer recommendations" and an AI agent — [PR Newswire](https://www.prnewswire.com/news-releases/entertainment-discovery-platform-likewise-introduces-new-ai-powered-mobile-app-upgrades-to-its-content-recommendations-ecosystem-302087504.html)
- Spotify Discover Weekly: launched 2015. By June 30, 2025 it had passed 100 billion tracks streamed and drove "more than 56 million new artist discoveries" weekly, "77% coming from emerging artists." It updates every Monday with 30 tracks, and Premium users can pick up to five genres to shape it (2025) — [Spotify Newsroom, Jun 30, 2025](https://newsroom.spotify.com/2025-06-30/discover-weekly-turns-10-celebrating-100-billion-tracks-streamed-and-a-decade-of-personalized-discovery/)
- Discover Weekly method (third party only, not confirmed from Spotify here): collaborative filtering trained on user playlists (reported "700 million" playlists), NLP on web text about artists and tracks, and CNN audio models on spectrograms, merged in a hybrid — [HackerNoon](https://hackernoon.com/spotifys-discover-weekly-how-machine-learning-finds-your-new-music-19a41ab76efe)
- Spotify Blend (launched Aug 31, 2021): combines "taste profiles – made from their listening history, their saved music, and more – into one shared playlist" — [Spotify Newsroom, Aug 31, 2021](https://newsroom.spotify.com/2021-08-31/how-spotifys-newest-personalized-experience-blend-creates-a-playlist-for-you-and-your-bestie/)
- Blend engineering (Dec 7, 2021, Jen Lamere): optimizes Relevance, Coherence, Equality ("Are both users in the Blend represented equally?") and Democratic ("Does music that both users like rise to the top?"). "Our solution is more about maximizing the joy, where we try to select the songs that are most personally relevant to a user," rather than "minimize the misery." "If we have two users with no common music listening history, it's significantly more difficult." The taste match score is surfaced in "Blend Data Stories," and its computation is not described — [Spotify Engineering](https://engineering.atspotify.com/2021/12/a-look-behind-blend-the-personalized-playlist-for-youand-you)
- Blend expanded to groups of up to 10 people (Mar 30, 2022) — [TechCrunch](https://techcrunch.com/2022/03/30/spotify-expands-its-music-matching-playlist-blend-to-work-with-up-to-10-people-including-select-artists)
- Users report taste match percentages shifting over time as listening changes (community thread, not official) — [Spotify Community](https://community.spotify.com/t5/Content-Questions/My-taste-match-percentages-in-my-blends-recently-dropped/td-p/6169434/highlight/true/page/3)

### Inferences
- Hand-built genomes are out of reach for a one-person team. Verso's content side should come free from IGDB and TMDB metadata (genres, themes, franchises), used only as a fallback or for explanations. That matches Steam's decision to keep tags out of the core model.
- For "pair or group" recommendations, the Blend framing (relevance per person plus equal representation, with shared likes rising) is a documented alternative to averaging scores. Group-recommendation literature (MovieLens PolyLens) calls these "average" vs "least misery" strategies. Spotify explicitly chose per-person relevance with fairness.
- Spotify shows a single "taste match" percentage without disclosing its math, and users notice when it moves. If Verso shows a Match Score, it should explain what moves it (shared items, agreement), as Criticker does.

### Gaps
- No primary Spotify source on the Discover Weekly model or the Blend taste-match formula was found in this session.
- TasteDive's current (2026) status and method are known only from secondary summaries.

## Cross-cutting: how predictions are explained, how confidence is shown, and minimum-data gates

### Takeaway
Across products, the minimum-data gate for personal predictions clusters at 10 to 20 rated items (Criticker 10, MovieLens historically 5 then 15, Goodreads 20). Predictions are further gated per item by neighbor support (Criticker: at least 3 close users). Explanations take one of three forms: full math (Criticker), a seed item or shelf ("because you liked X," Goodreads and Netflix rows), or a social or cohort reason ("Players like you love this game," friends who play it). Displayed percentages (Netflix % match, Spotify taste match) are the least explained, and Netflix moved away from its % match in 2024.

### Cited Findings
| Product | Personal prediction shown | Match between users | Minimum-data gate | Explanation style |
|---|---|---|---|---|
| Criticker | PSI on the user's own scale (e.g. 77/100) | TCI (average percentile gap; lower is better), top 1,000 stored | Recommendations after 10 ratings. Percentiles need ≥5 distinct ratings. TCI needs ≥3 shared titles or ≥10% overlap (user-adjustable 10-50%). PSI needs ≥3 of the top-1,000 neighbors to have rated the title | Full math: contributing users and differences — [/explain/](https://web.archive.org/web/2025/https://www.criticker.com/explain/); [Algorithm](https://web.archive.org/web/2024/https://www.criticker.com/critickers-algorithm-explained/) |
| Flickchart | "For You" list (no score published) | None found | Per-movie matchup threshold (⏳ until confident), number unpublished | Genres, directors, actors, themes, similar users (FAQ wording) — [FAQ](https://www.flickchart.com/faq) |
| Steam | Ranked list with popularity and recency sliders | Implicit ("players like you") | Cold start: needs players; picks up new games "with just a few days of data" after retraining | "Players like you love this game"; friends play it; similar to games you play — [2019](https://store.steampowered.com/news/posts/?feed=steam_blog&enddate=1563000000), [2020](https://store.steampowered.com/news/posts/?feed=steam_blog&enddate=1584723646) |
| Netflix | % match (2017 to about 2024), then tags and an icon | None | Not published | Row titles ("Because you watched"), genre rows explained by implicit prefs or survey — [2012 blog](https://web.archive.org/web/2024/https://netflixtechblog.com/netflix-recommendations-beyond-the-5-stars-part-1-55838468f429) |
| Goodreads | Recommendation list | None | 20 ratings | Shelf or genre plus seed books — [2011 blog](https://www.goodreads.com/blog/show/303-announcing-goodreads-personalized-recommendations) |
| StoryGraph | Curated "bookstore" rows | None found | Preferences survey (no stated minimum) | Row labels ("books similar users loved," "Out of your comfort zone") — [changelog](https://roadmap.thestorygraph.com/changelog/revamped-recommendations) |
| MovieLens | Predicted stars (color-coded vs actual) | Buddies / groups for joint recommendations | v0: 5 ratings; v3: 15; v4: none (group elicitation) | Top picks list; user-tunable popularity and recency in research — [Harper and Konstan](https://files.grouplens.org/papers/harper-tiis2015.pdf) |
| Spotify Blend | Shared playlist | Taste match % (formula unpublished) | Harder with no shared history | Data Stories — [Spotify Eng](https://engineering.atspotify.com/2021/12/a-look-behind-blend-the-personalized-playlist-for-youand-you) |

- Confidence display examples: Flickchart's ⏳ "not enough rankings yet to earn a score" — [FAQ](https://www.flickchart.com/faq). Criticker simply shows no PSI when fewer than 3 top neighbors have rated a title — [/explain/](https://web.archive.org/web/2025/https://www.criticker.com/explain/). Netflix reportedly hid the match below 50% (unverified) — [Variety 2017](https://variety.com/2017/digital/news/netflix-thumbs-vs-stars-1202010492/)
- Popularity blending is near-universal. Netflix: rank = w1·popularity + w2·predicted rating — [Part 2](https://web.archive.org/web/2024/https://netflixtechblog.com/netflix-recommendations-beyond-the-5-stars-part-2-d9b96aa399f5). MovieLens v4 blends popularity — [Harper and Konstan](https://files.grouplens.org/papers/harper-tiis2015.pdf). Steam exposes a popularity slider — [Steam 2019](https://store.steampowered.com/news/posts/?feed=steam_blog&enddate=1563000000). Users disagree on the right amount — [Harper et al. 2015](https://files.grouplens.org/papers/harper-recsys2015.pdf)

### Inferences
- A defensible default for Verso: no personal predictions until about 10 ranked items per medium. Show a predicted score only when at least 3 sufficiently overlapping users (or friends) have ranked the item. Otherwise show a reason-only recommendation ("popular with people who ranked X highly") or nothing.
- For a Match Score between two users, Criticker's TCI over positional percentiles plus a minimum overlap (≥3 shared items, rising to about 10% of the smaller library) is fully published, cheap, and explainable ("you agree on A, B, C; you split on D"). Displaying it as a percentage is a presentation choice. Netflix's and Spotify's unexplained percentages drew confusion, so pair the percentage with the agree and clash list.
- The comparison log gives Verso a confidence signal none of these products expose except Flickchart: items placed with few or "too close" comparisons can be down-weighted in TCI and PSI, and marked with a ⏳-style state.

### Gaps
- No product found publishes offline accuracy of its user-facing prediction (e.g. PSI error). Only Netflix (RMSE during the Prize) and Valve (CTR and conversion, qualitatively) give any evaluation signal.
- I found no public A/B evidence on whether showing a numeric predicted score, rather than a reason string, improves engagement. Netflix's 2024 move away from % match is the only directional signal, and it came via press, not a Netflix publication.
