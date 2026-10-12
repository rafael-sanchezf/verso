# The mathematics of personal score prediction from ranked lists and head-to-head comparisons

Scope: how to predict user u's 0 to 10 score for an item u has not ranked, when the data is per-user tiered rankings built by binary insertion plus a log of pairwise comparisons. The recommended build order (a synthesis of all nine questions) is at the end of the last section, under "Recommended build order".

Notation used throughout (plain text, no LaTeX). Every formula below uses these symbols unless redefined locally.

- u, v: users. i, j, x: items (one medium at a time; never mix games and movies in one similarity).
- I_u: set of items u has ranked. n_u = |I_u|.
- I_uv = I_u ∩ I_v: items both have ranked ("co-ranked"). n_uv = |I_uv|.
- s_ui: u's derived 0 to 10 positional score for item i (computed at read time from tier band and within-tier position).
- t_ui: u's tier for i, coded loved = 3, liked = 2, fine = 1, disliked = 0.
- pos_ui: 1-based position of i in u's overall list (1 = best). pct_ui: u's percentile for i in [0, 1] (defined in question 3).
- mu_u: mean of s_ui over I_u. sigma_u: standard deviation of s_ui over I_u. mu: global mean of all s_ui.
- sim(u, v): a user-user similarity; sim'(u, v): the same after shrinkage.
- N_x(u): the neighbors of u (top-k by sim') who have ranked item x.
- b_ui: a baseline (non-personalized plus bias) estimate for u on i.
- The comparison log row: (u, a, b, outcome in {a, b, too_close, cant_compare}, context, ts).
- sigmoid(z) = 1 / (1 + exp(-z)). ln = natural log. Phi = standard normal CDF.

Illustrative tier bands used in worked examples only (NOT Verso's actual bands, which were not researched): loved [8, 10], liked [6, 8), fine [4, 6), disliked [0, 4).

---

## 1. Similarity between two users from ranked lists, stability at 5 to 15 overlaps, shrinkage, sign, and displayed match percentage

### Takeaway
Use a correlation on co-ranked items (Pearson on positional scores, or Kendall tau / its "fraction of agreeing head-to-heads" form, which matches Verso's semantics exactly), then shrink it by n_uv / (n_uv + beta) with beta around 5 to 20 at Verso's scale; at 5 to 15 overlaps every raw correlation is very noisy (an r of 0.74 on 8 items has a 95% interval of roughly 0.07 to 0.95), so shrinkage and a prior are not optional. Correlations can be negative; overlap measures (Jaccard, RBO, tier-match) cannot. A displayed "match %" is best defined as a shrunk agreement rate where chance = 50% (or chance = 0% if you want negatives to be possible, which is likely how a negative "match" arises).

### Cited Findings
- Pearson on co-rated items as implemented in Surprise: pearson_sim(u, v) = sum over i in I_uv of (r_ui - mu_u)(r_vi - mu_v) / ( sqrt(sum (r_ui - mu_u)^2) * sqrt(sum (r_vi - mu_v)^2) ). Only common items are used. — [Surprise similarity docs](https://surprise.readthedocs.io/en/stable/similarities.html)
- Surprise also defines MSD similarity: msd(u, v) = (1 / n_uv) * sum over I_uv of (r_ui - r_vi)^2 and msd_sim = 1 / (msd + 1) ("the +1 term is just here to avoid dividing by zero"), and a shrunk baseline Pearson: pearson_baseline_shrunk_sim(u, v) = ((n_uv - 1) / (n_uv - 1 + shrinkage)) * rho_uv, where rho_uv is Pearson computed on residuals r - b (baseline); default shrinkage = 100. — [Surprise similarity docs](https://surprise.readthedocs.io/en/stable/similarities.html)
- Koren's shrunk item-item correlation: s_ij = (n_ij / (n_ij + lambda4)) * rho_ij, where n_ij is the number of users who rated both; "A typical value for lambda4 is 100" (Netflix-scale data). — [Koren 2010, Factor in the Neighbors, TKDD](https://courses.ischool.berkeley.edu/i290-dm/s11/SECURE/a1-koren.pdf)
- Significance weighting (Herlocker et al.): w'_uv = (min(n_uv, gamma) / gamma) * w_uv. "Using gamma >= 25 could significantly improve the accuracy of the predicted ratings, and ... a value of 50 for gamma gave the best results", but "the optimal value ... is data dependent" and should be cross-validated. — [Nikolakopoulos, Ning, Desrosiers, Karypis, "Trust your neighbors" survey](https://arxiv.org/pdf/2109.04584)
- The continuous alternative (shrinkage, Bayesian justification: posterior mean between prior 0 and the data estimate): w'_uv = (n_uv / (n_uv + beta)) * w_uv, with beta chosen by cross-validation; "a typical value for beta is 100" as reported for Netflix. — [Trust your neighbors survey](https://arxiv.org/pdf/2109.04584)
- Herlocker's significance weighting is described as weighting unreliable similarities by n/50, n = number of co-ratings; the Hoeffding-CF paper argues this does not answer "whose co-ratings are useful enough" and instead applies a Hoeffding-bound significance test to decide whether a neighbor is informative. — [Matuszyk and Spiliopoulou, Hoeffding-CF](https://kmd.cs.ovgu.de/pub/matuszyk/MatuszykSpiliopoulou14.pdf)
- Kendall tau-a = (n_c - n_d) / n_0, n_0 = n(n - 1)/2 pairs; tau-b = (n_c - n_d) / sqrt((n_0 - n_1)(n_0 - n_2)) adjusts for ties (n_1, n_2 = tied pairs in each list). Under independence Var[tau_a] = 2(2n + 5) / (9n(n - 1)). For bivariate normal data, Greiner's relation r = sin((pi/2) * tau). Range -1 to +1. — [Wikipedia, Kendall rank correlation coefficient](https://en.wikipedia.org/wiki/Kendall_rank_correlation_coefficient)
- Weighted Kendall tau (Vigna 2015, scipy.stats.weightedtau): each exchange (discordant pair) is weighted by adding the weights of the ranks of the two elements, with default hyperbolic weigher "rank r is mapped to weight 1/(r+1)" so disagreements near the top cost more; rank 0 is most important. — [SciPy weightedtau docs](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.weightedtau.html)
- Rank-biased overlap: RBO(S, T, p) = (1 - p) * sum over d = 1..infinity of p^(d-1) * A_d, where A_d = |S[1..d] ∩ T[1..d]| / d is the overlap proportion at depth d; range 0 (disjoint) to 1 (identical); smaller p = more top-weighted; "p = 0.9 means that the first 10 ranks have 86% of the weight ... to give the top 50 ranks the same weight involves taking p = 0.98". Designed for indefinite, non-conjoint (different items), top-weighted rankings. Extrapolated point estimate: RBO_EXT(S, T, p, k) = (X_k / k) * p^k + ((1 - p)/p) * sum over d = 1..k of (X_d / d) * p^d, X_d = overlap count at depth d, k = evaluated depth; report as RBO_EXT [RBO_MIN to RBO_MAX]. — [Webber, Moffat, Zobel 2010, A Similarity Measure for Indefinite Rankings](http://blog.mobile.codalism.com/research/papers/wmz10_tois.pdf)
- Negative correlations as neighbors: "negative rating correlations are less reliable than positive ones"; experiments found they "provide no significant improvement in the prediction accuracy", though in some settings they help; decide case by case. — [Trust your neighbors survey](https://arxiv.org/pdf/2109.04584)
- Criticker's user-user similarity (TCI) is the mean absolute difference of percentiles on titles both users rated (lower = more similar; "a TCI of 10.67 is really good"), requires at least 3 titles in common (the minimum rises with more ratings), and by default only considers users who share at least 10% of your titles (adjustable 10% to 50%). See question 9 for the full method. — [Criticker, How Criticker Works (archived 2025-08-18)](http://web.archive.org/web/20250818065350/https://www.criticker.com/explain/); [Criticker's Algorithm Explained (archived 2026-01-29)](http://web.archive.org/web/20260129213429/https://www.criticker.com/critickers-algorithm-explained/)
- Beli shows a color-coded "% match" on its leaderboard indicating similarity in preferences; the formula is not public in any source found. — [IXD@Pratt design critique of Beli](https://ixd.prattsi.org/2024/09/design-critique-beli-app/)

### Inferences
Worked micro-example (computed for these notes; illustrative bands above). Users A and B co-rank 8 games:

| item | s_A | tier A | s_B | tier B | pos A | pos B |
|---|---|---|---|---|---|---|
| G1 | 9.6 | loved | 7.5 | liked | 1 | 3 |
| G2 | 8.9 | loved | 9.8 | loved | 2 | 1 |
| G3 | 7.8 | liked | 8.6 | loved | 3 | 2 |
| G4 | 7.1 | liked | 5.2 | fine | 4 | 6 |
| G5 | 6.4 | liked | 6.9 | liked | 5 | 4 |
| G6 | 5.5 | fine | 6.1 | liked | 6 | 5 |
| G7 | 4.2 | fine | 2.0 | disliked | 7 | 8 |
| G8 | 1.5 | disliked | 4.5 | fine | 8 | 7 |

- Pearson on positional scores (co-ranked means 6.375 and 6.325): r = 0.739.
- Spearman rho = 1 - 6 * sum(d^2) / (n(n^2 - 1)) with d = rank difference: sum d^2 = 14, rho = 1 - 84/504 = 0.833.
- Kendall: of 28 pairs, n_c = 23 concordant, n_d = 5 discordant (G1-G2, G1-G3, G4-G5, G4-G6, G7-G8), tau = (23 - 5)/28 = 0.643. Concordance rate n_c / (n_c + n_d) = 82.1%, i.e. "you would answer 82% of head-to-heads between these 8 games the same way". Note (1 + tau_a)/2 = concordance rate exactly when there are no ties, which makes tau the natural similarity for a head-to-head product.
- Tier agreement: exact tier match 2/8 = 25%; mean absolute tier distance 0.75 on a 0 to 3 scale, so 1 - 0.75/3 = 0.75.
- Jaccard of loved sets: {G1, G2} vs {G2, G3} = 1/3. One item moving a tier swings this by 0.33, so it is useless as a primary similarity at this overlap; fine as a "you both loved X" explanation.
- Mean absolute score difference = 1.5 points (Criticker-style TCI on a 0 to 100 scale = 15).
- RBO on co-ranked lists is a poor fit: the two co-ranked lists contain exactly the same 8 items (conjoint), so overlap at depth 8 is total by construction; RBO@8 truncated = 0.39 (p = 0.9) and RBO_EXT = 0.82. RBO belongs on each user's top-k of ALL ranked items (different items), where it measures "do our favorites coincide".
- Shrinkage at n = 8: n/(n + 10) = 0.444, so r' = 0.33 and tau' = 0.29; Herlocker min(n, 50)/50 = 0.16 gives r' = 0.12; Koren/Surprise (n - 1)/(n - 1 + 100) = 0.065 gives r' = 0.05. The Netflix-scale constants (50, 100) effectively zero out every Verso pair; beta must be refit to Verso's scale by leave-one-out (question 8). A starting point of beta ≈ 10 (half-weight at 10 overlaps) is an educated guess, not a published value.
- Noise at small overlap (standard statistics, computed here): 95% Fisher interval for r = 0.739 at n = 8 is z = atanh(r) ± 1.96/sqrt(n - 3), i.e. r in [0.07, 0.95]. Null standard deviation of tau: 0.41 at n = 5, 0.29 at n = 8, 0.25 at n = 10, 0.19 at n = 15, 0.13 at n = 30, 0.10 at n = 50. Fisher SE of z: 0.71, 0.45, 0.38, 0.29, 0.19, 0.15 for the same n. So below about 10 overlaps, a similarity is mostly noise, and below 5 it should not be computed at all (Criticker's floor is 3).
- Which is most stable at 5 to 15 overlaps: rank-based measures (Kendall tau-b, Spearman) are more robust than Pearson to one outlier score, and Pearson on positional scores already behaves like a rank measure within a tier plus a tier-gap term across tiers. Tier-match and loved-Jaccard are too coarse; RBO answers a different question. Recommended primary: tau-b on co-ranked items (ties = too_close pairs if you choose to encode them) or Pearson on positional scores, both shrunk. Secondary, for "you agree on favorites": weighted tau (hyperbolic weights), computed with the user's own positions as ranks.
- Key implementation fact: in the weighted-average prediction formula sum(sim * dev) / sum(|sim|), multiplying every neighbor's similarity by the same constant cancels. Shrinkage therefore changes predictions only through (a) which neighbors are selected and how they are relatively weighted (n_uv differs by neighbor) and (b) a damping term or prior in the denominator (question 2). It is not cosmetic, but it does nothing if all neighbors have the same overlap.
- Sign: Pearson, Spearman, Kendall, weighted tau all range -1 to +1 and can be negative. Jaccard, RBO, tier-match rate, MSD-sim are in [0, 1]. Criticker TCI is a distance in [0, ~50] (lower better).
- Displayed "match %" options, all computable in SQL:
  1. Shrunk head-to-head agreement, chance = 50%: match = 50 + 50 * tau_b * n_uv / (n_uv + beta). Example: 50 + 50 * 0.643 * 0.444 = 64%. Never negative; 50% reads as "coin flip". Honest and easy to explain ("you pick the same winner 64% of the time, adjusted for how few games you share").
  2. Chance-normalized distance (Criticker style converted to a match), chance = 0%: match = 100 * (1 - MAD_uv / MAD_chance) * shrink, where MAD_uv = mean |s_ui - s_vi| over I_uv and MAD_chance = the mean absolute difference between random pairs of users on the same items (estimate from Verso's own data; for two independent uniform 0 to 10 scores it is 10/3 = 3.33). Example: 1 - 1.5/3.33 = 55%. Anti-correlated users get a negative value (fully reversed uniform lists give MAD 5.0, match -50%). A scale with chance at 0 is the most plausible mechanism for a negative "match" like the one reported for Beli, but that is an inference, not verified.
  3. Correlation as percent: 100 * r' (can be negative, -100 to 100).
  Showing "Not enough overlap" below n_uv = 5 is better than showing any number.
- SQL sketch (Postgres has a built-in corr(y, x) aggregate):
  `select a.user_id u, b.user_id v, count(*) n, corr(a.score, b.score) r from ranked a join ranked b on a.item_id = b.item_id and a.user_id < b.user_id and a.medium = b.medium group by 1, 2 having count(*) >= 5;`
  Kendall needs an item-pair self-join per user pair (O(n_uv^2) rows per pair), fine at hundreds of users; precompute tau for friend pairs and top candidate neighbors only at 10k users.

### Gaps
- Beli's actual match-score formula and whether it can go negative: no public source found in this session.
- No published study found that compares Pearson vs Kendall vs RBO specifically at 5 to 15 overlaps for recommendation accuracy; the stability ranking above is from sampling-variance formulas, not from a recommender benchmark.
- Herlocker et al. (1999, 2002) primary papers were not read directly; the gamma = 50 figure is taken from the survey and the Hoeffding-CF paper that cite them ([Herlocker et al. 2002, ACM](https://dl.acm.org/doi/abs/10.1023/A:1020443909834)).

---

## 2. Neighborhood collaborative filtering (user-user and item-item): formulas, normalization, neighbor count, minimum overlap, confidence, and tiny-data behavior vs matrix factorization

### Takeaway
Mean-centered (or baseline-residual) user-user kNN with shrunk similarities, k around 20 to 40 but "all available up to k" at Verso's size, and a minimum of about 3 contributing neighbors is the standard, explainable, retrain-free method, and it is the right first CF model. With dozens of users, user-user beats item-item (more users than items is the condition for item-item); item-item becomes attractive once many items have 20+ rankers. Neighborhood methods remain competitive with far more complex models in careful benchmarks, but classic Pearson kNN can fail to beat a good non-personalized baseline on top-K, so the baseline predictor must be built first and kept as the fallback.

### Cited Findings
- Surprise kNN prediction rules (user-based shown; item-based is symmetric), defaults k = 40, min_k = 1:
  - KNNBasic: r_hat_ui = sum over v in N_i^k(u) of sim(u, v) * r_vi / sum of sim(u, v). If fewer than min_k neighbors, prediction = global mean.
  - KNNWithMeans: r_hat_ui = mu_u + sum sim(u, v) * (r_vi - mu_v) / sum sim(u, v). If fewer than min_k neighbors, "the neighbor aggregation is set to zero (so the prediction ends up being equivalent to the mean mu_u)".
  - KNNWithZScore: r_hat_ui = mu_u + sigma_u * sum sim(u, v) * (r_vi - mu_v)/sigma_v / sum sim(u, v).
  - KNNBaseline: r_hat_ui = b_ui + sum sim(u, v) * (r_vi - b_vi) / sum sim(u, v); falls back to the baseline b_ui.
  — [Surprise k-NN inspired algorithms](https://surprise.readthedocs.io/en/stable/knn_inspired.html)
- Koren's item-item form: r_hat_ui = b_ui + sum over j in S^k(i; u) of s_ij * (r_uj - b_uj) / sum s_ij, where S^k(i; u) = the k items u rated that are most similar to i. Two stated advantages: explainability ("each past rating ... receives a separate term ... we can isolate its unique contributions") and new ratings ("can provide updated recommendations immediately after users enter new ratings ... without needing to retrain"). Item-item is preferred at Netflix scale for scalability, accuracy and because "users are familiar with items previously preferred by them, but do not know those allegedly like-minded users". — [Koren 2010](https://courses.ischool.berkeley.edu/i290-dm/s11/SECURE/a1-koren.pdf)
- Koren's concerns about classic neighborhood schemes: not justified by a formal model; similarity isolates pairs rather than considering the neighbor set jointly; interpolation weights sum to one, forcing full reliance on neighbors even when they are weak. — [Koren 2010](https://courses.ischool.berkeley.edu/i290-dm/s11/SECURE/a1-koren.pdf)
- Top-K results on Netflix (fraction of cases where a held-out 5-star movie is ranked first among 1000 random movies): new neighborhood model 0.077, WgtNgbr and SVD about 0.043; the classic correlation-based neighborhood model "could not improve much upon a nonpersonalized scheme" (MovieAvg). RMSEs: MovieAvg 1.053, CorNgbr 0.9406, WgtNgbr 0.9107, SVD (100 factors) 0.9025, new neighborhood model 0.9002. — [Koren 2010](https://courses.ischool.berkeley.edu/i290-dm/s11/SECURE/a1-koren.pdf)
- Normalization: mean-centering h(r_ui) = r_ui - mu_u; Z-score h(r_ui) = (r_ui - mu_u)/sigma_u. "An initial investigation found mean-centering and Z-score to give comparable results, subsequent analysis showed Z-score to have more significant benefits", but Z-score "can be more sensitive than mean-centering and, more often, predict ratings that are outside the rating scale". If normalization does not help, "preference-based filtering" predicts relative preferences instead of absolute values. — [Trust your neighbors survey](https://arxiv.org/pdf/2109.04584)
- Neighbor count: accuracy vs k "typically follows a concave function"; small k (< 20) gives low accuracy, too many (> 50) dilutes strong relations; "a number of neighbors between 20 to 50 is most often described in the literature", but tune by cross-validation. "A small number of high-confidence neighbors is by far preferable to a large number of neighbors for which the similarity weights are not trustable." — [Trust your neighbors survey](https://arxiv.org/pdf/2109.04584)
- User-based vs item-based choice depends on the users-to-items ratio: with 1,000 users, 100 items, 10,000 ratings (uniform), user-user similarities use about 1 common rating on average while item-item use about 10. Item-based is more accurate when users greatly outnumber items (Amazon); systems with fewer users than items "may benefit more from user-based neighborhood methods". Item-based is more stable and easier to explain; user-based is more serendipitous. — [Trust your neighbors survey](https://arxiv.org/pdf/2109.04584)
- Neighbor pre-filtering: top-N filtering, threshold filtering (keep sim > w_min), negative filtering; combinable. — [Trust your neighbors survey](https://arxiv.org/pdf/2109.04584)
- In a reproducibility study of 18 recent (neural) top-N algorithms, "only 7 of them could be reproduced with reasonable effort", and 6 of those "can often be outperformed with comparably simple heuristic methods, e.g., based on nearest-neighbor or graph-based techniques". — [Ferrari Dacrema, Cremonesi, Jannach 2019](https://arxiv.org/abs/1907.06902)
- Criticker's production recommender is a plain user-user method: top 10 most compatible users who rated the title, unweighted average of their percentiles, minimum 3 contributors (question 9). — [Criticker explain page (archived)](http://web.archive.org/web/20250818065350/https://www.criticker.com/explain/)

### Inferences
- Recommended user-user formula for Verso (baseline-residual form, damped):
  pred_ux = b_ux + sum over v in N_x(u) of sim'(u, v) * (s_vx - b_vx) / (sum over v in N_x(u) of |sim'(u, v)| + lambda)
  where b_ux = baseline (question 3 or 7; the simplest is b_ux = mu_u + (mean over raters v of x of (s_vx - mu_v)) shrunk, i.e. item bias), lambda ≈ 0.5 to 2 is a damping constant (the prior's weight in similarity units) so that a single weak neighbor cannot move the prediction far. Keep only sim' > 0 neighbors at first (negative filtering) and require |N_x(u)| >= 3.
- Worked micro-example (numbers computed for these notes). Target user A (mu_A = 6.375), item X unranked by A. Three neighbors ranked X:
  - B: sim' = 0.33, mu_B = 6.3, s_BX = 8.8, deviation +2.5
  - C: sim' = 0.50, mu_C = 5.8, s_CX = 7.9, deviation +2.1
  - D: sim' = 0.20, mu_D = 6.9, s_DX = 6.0, deviation -0.9
  sum |sim'| = 1.03; numerator = 0.825 + 1.05 - 0.18 = 1.695; undamped aggregate = 1.646, so pred = 6.375 + 1.646 = 8.02. Damped with lambda = 1: 6.375 + 1.695/2.03 = 7.21 (lambda = 0.5 gives 7.48; lambda = 2 gives 6.93). Illustrative reason string (agreement figures invented for the example): "Two players who pick the same winner as you in most shared head-to-heads rank it in their loved tier."
- Confidence for a kNN prediction (computed here): weighted SD of neighbor deviations around the aggregate = sqrt(sum |sim'| * (dev_v - agg)^2 / sum |sim'|) = 1.26; effective neighbor count n_eff = (sum |sim'|)^2 / sum sim'^2 = 2.66; standard error ≈ 1.26 / sqrt(2.66) = 0.77, so "8.0 ± 1.5" at about 95%. Label bands from (n_eff, SE): e.g. n_eff < 3 or SE > 1.5 → "needs more data"; SE 0.75 to 1.5 → "medium"; SE < 0.75 and n_eff >= 5 → "high". Thresholds are inferences to be tuned by LOO calibration (question 7).
- Minimum overlap: n_uv >= 5 to compute a similarity at all, and use the Criticker-style relative rule too (overlap >= 10% of the smaller list) to avoid a 300-item user matching a 6-item user on 5 blockbusters. Both are tunable.
- Tiny-data comparison with MF: with dozens of users, each item has only a handful of rankers, and a factor model with f latent dimensions needs several ratings per item per dimension to identify item vectors; kNN makes no such demand and degrades gracefully to the baseline. In addition kNN needs no retraining after each new ranking (Koren's "new ratings" property), which suits an app where a ranking session changes scores immediately. So kNN (plus baseline) first, MF later (question 5).
- Item-item at Verso: compute adjusted-cosine or Pearson item-item similarity only for items with >= 10 to 20 co-rankers; it becomes the better "because you loved X" explainer once catalog overlap exists, and it can be precomputed nightly (item relations are stable, per Koren).

### Gaps
- No source quantifies exactly how many users or co-ratings are needed before item-item overtakes user-user; the 1,000-user example is illustrative only.
- The damped-denominator variant (sum |sim| + lambda) is a common practitioner form but a primary source for it was not located in this session; treat lambda as a tuning parameter.

---

## 3. Positional scores as the model input: why they work, what they distort, and corrections

### Takeaway
Positional scores are rank-normalized per user, which removes the rating-scale habits (harsh vs generous raters) that plague star ratings; this is exactly Criticker's argument for percentiles. The distortions are: small lists are forced to span the band (with 8 items, adjacent items differ by about 1.4 points and the top item is pinned to the band top), equal spacing ignores "too close" judgments, and tier bands make the score partly cardinal (tier) and partly ordinal (position). Use tier plus shrunk within-tier percentile as the modeling input, and map predictions back through the user's own list.

### Cited Findings
- Criticker normalizes to percentiles because "a rating of 75 can mean something different for each user, comparing ratings is not good enough"; example: a 60 in your bottom 13% and another user's 28 in their bottom 13% means "you actually both agree". — [Criticker explain (archived)](http://web.archive.org/web/20250818065350/https://www.criticker.com/explain/); [Criticker algorithm explained (archived)](http://web.archive.org/web/20260129213429/https://www.criticker.com/critickers-algorithm-explained/)
- Criticker percentile (mid-rank): percentile = floor(((num_lower + num_matching/2) / total_ratings) * 100), range 0 to 99; example: 250 prior ratings, new rating 85, 195 lower, 10 at 85, total 251 gives 79. Percentiles require at least five distinct ratings. (The page prints the parentheses as floor((num_lower + (num_matching / 2) / total_ratings) * 100), which does not reproduce its own example; the grouping above does: (195 + 5)/251 = 0.797.) — [Criticker explain (archived)](http://web.archive.org/web/20250818065350/https://www.criticker.com/explain/)
- Rank-based preference data sidesteps scale issues: "an item preferred to another one remains so regardless of the rating scale", the motivation for preference-based filtering. — [Trust your neighbors survey](https://arxiv.org/pdf/2109.04584)
- Z-score normalization can push predictions outside the scale, one reason mean-centering on a bounded scale is safer. — [Trust your neighbors survey](https://arxiv.org/pdf/2109.04584)

### Inferences
- Why positional scores are a good input: every user's list spans roughly the same range, so mu_u and sigma_u vary much less across users than with stars; mean-centering then mostly removes the effect of tier mix (a user who marks most games "loved" has a high mu_u). Pearson on positional scores equals Pearson on (tier band + within-tier rank), a reasonable blend of cardinal (tier) and ordinal (position) information.
- Distortions:
  1. Small lists: with n items in a tier and linear spacing, adjacent items differ by (band width)/(n - 1). A 2-item loved tier puts one item at 10.0 and one at 8.0 even if the user sees them as equal; an 8-item list spans the full 0 to 10 in 1.43-point steps. Early scores are therefore extreme and move a lot as items are added.
  2. Equal spacing: position 3 vs 4 always differ by the same amount, although a too_close answer said they are nearly equal and a lopsided answer said they are far apart.
  3. Bands cap the reading: a disliked item can never score above the disliked band top regardless of neighbors; conversely, a within-tier predicted percentile only makes sense conditional on a predicted tier.
  4. Tier mix is not comparable across users: one user's "fine" tier may be another's "liked".
- Corrections (all cheap in SQL):
  1. Within-tier mid-rank percentile: q_ui = (n_t - k + 0.5) / n_t, where k = 1-based position within tier t (1 = best) and n_t = tier size; never exactly 0 or 1. (Postgres percent_rank() gives (rank - 1)/(n - 1), which pins the ends; prefer the mid-rank form.)
  2. Shrink toward the tier midpoint for small tiers: s*_ui = m_t + (s_ui - m_t) * n_t / (n_t + kappa), where m_t = band midpoint and kappa ≈ 2 to 3 (tunable). A tier of 1 item sits at the midpoint; a tier of 30 is nearly unchanged.
  3. Use the pair (t_ui, q_ui) as the modeling target: e.g. a composite z_ui = t_ui + q_ui (0 to 4 scale) or a normal-score transform of the overall mid-rank percentile, z_ui = Phi^-1(pct_ui) with pct_ui = (n_u - pos_ui + 0.5)/n_u (Blom-type rank-based normal scores are a standard way to turn ranks into interval-like values).
  4. Encode too_close pairs as near ties (question 4) if you later fit strengths; keep positional scores for display.
- Mapping a prediction back to 0 to 10 (Criticker PSI style, recommended): predict a percentile pct_hat (or a (tier, q) pair) from neighbors, then read the score the user's own list assigns at that percentile, i.e. find the insertion position pos_hat = round((1 - pct_hat) * n_u) + 1 and return the score that position would receive (interpolating between neighbors in the list). This guarantees the prediction is on the user's own scale and means "if you played it, it would probably land about here", which also yields the predicted tier for free.

### Gaps
- No published evaluation of Beli-style banded positional scores as CF input was found; the distortion analysis is derived from the construction, not from an empirical study.
- The best kappa for tier shrinkage and the best choice between composite z and normal scores must come from Verso's own leave-one-out tests.

---

## 4. Latent-strength models on the comparison log: Bradley-Terry, Plackett-Luce, Thurstone, TrueSkill, Elo; per-user fitting, pooling across users, and whether the log adds information beyond the final order

### Takeaway
Bradley-Terry (logistic), Thurstone (probit), and Elo/TrueSkill (online approximations) all model P(i beats j) from latent strengths; Plackett-Luce extends this to full rankings. Per user, a binary-insertion log of consistent answers is perfectly separable, so an unregularized per-user fit does not exist; with a prior it just reproduces the order. The log's extra value for prediction is narrow: too_close answers (near ties), cant_compare (incomparability), revisions over time, and context. Pooling across users (item strengths plus per-user deviations, ideally low-rank) is where these models earn their keep, and at that point a pooled Bradley-Terry with low-rank user offsets is the same thing as pairwise matrix factorization (question 5).

### Cited Findings
- Bradley-Terry: P(i > j) = p_i / (p_i + p_j), equivalently P(i > j) = 1 / (1 + exp(beta_j - beta_i)) with beta = ln p. MLE satisfies Zermelo's condition p_i = W_i / sum over j of (w_ij + w_ji)/(p_i + p_j) (W_i = total wins of i, w_ij = wins of i over j); iterate and renormalize. A faster alternative iteration also appears: p_i' = [sum_j w_ij * p_j/(p_i + p_j)] / [sum_j w_ji / (p_i + p_j)]. A unique MLE requires a strongly connected comparison graph: every item must both win and lose at least once. Elo is the same model with base 10 and scale 400: P(i > j) = 10^(R_i/400) / (10^(R_i/400) + 10^(R_j/400)). Plackett-Luce generalizes to rankings of N items. — [Wikipedia, Bradley-Terry model](https://en.wikipedia.org/wiki/Bradley%E2%80%93Terry_model); faster iteration from [Newman, Efficient computation of rankings from pairwise comparisons](https://arxiv.org/pdf/2207.00076) (attribution per search results; the Wikipedia summary tool attributed it to Hunter 2004, which may be wrong); MLE existence also treated in [Existence of MLE in the Bradley-Terry model and its extensions](https://arxiv.org/pdf/math/0412232)
- Ties (Davidson 1970): P(tie between i and j) = nu * sqrt(pi_i * pi_j) / (pi_i + pi_j + nu * sqrt(pi_i * pi_j)), with nu >= 0 a global tie propensity; given a non-tie, P(i beats j) is the ordinary Bradley-Terry probability; the tie probability is maximal when pi_i = pi_j. — [Davidson-Luce model paper, summarizing Davidson 1970](https://arxiv.org/pdf/1909.07123); original: [Davidson 1970, JASA 65(329)](https://www.tandfonline.com/doi/abs/10.1080/01621459.1970.10481082)
- TrueSkill represents skill as a Gaussian (mu, sigma), default mu = 25, sigma = 25/3 ≈ 8.333; leaderboards use the conservative estimate mu - 3*sigma; draws are modeled by a draw margin epsilon (a draw when the performance difference is small); 2-player matches need about 12 games per player to identify skill, possibly up to three times more. — [Microsoft Research, TrueSkill](https://www.microsoft.com/en-us/research/project/trueskill-ranking-system/)
- choix (Python) implements Bradley-Terry (pairwise), Plackett-Luce (rankings), top-1 lists, and a network choice model, with Luce Spectral Ranking, Minorization-Maximization, Rank Centrality, and approximate Bayesian inference by expectation propagation; the docs include notes on regularization. — [choix documentation](https://choix.lum.li/en/latest/)
- Hierarchical/Bayesian Bradley-Terry: partial pooling samples parameters from a common distribution, pooling estimates toward each other; Hunter (2004) generalized Bradley-Terry models allow linear predictors on strengths. (Search-result summaries; primary papers not read.) — [Bayesian BT model to compare ML methods (JMLR)](https://dl.acm.org/doi/pdf/10.5555/3648699.3649040); [Efficient Bayesian Inference for Generalized Bradley-Terry Models](https://www.researchgate.net/publication/47702521_Efficient_Bayesian_Inference_for_Generalized_Bradley-Terry_Models)
- Adaptive pairwise questions ("Do you prefer item A over B?") can drive a Bayesian latent factor model, with the next question chosen by information gain; validated on Netflix ratings and a TV viewership dataset. — [Balakrishnan and Chopra, Two of a kind or the ratings game?](https://link.springer.com/article/10.1007/s11704-012-2871-7)

### Inferences
- Model definitions for implementation (standard forms; not re-verified line by line in this session):
  - Bradley-Terry per user: P_u(i > j) = sigmoid(theta_ui - theta_uj).
  - Thurstone Case V: P_u(i > j) = Phi((theta_ui - theta_uj) / (sigma * sqrt(2))). Nearly indistinguishable from BT in practice (logistic vs normal link).
  - Plackett-Luce for an ordered list pi(1) > pi(2) > ... > pi(n): P = product over k = 1..n of exp(theta_pi(k)) / sum over m = k..n of exp(theta_pi(m)). A tiered list can be treated as PL within each tier plus an ordinal model across tiers.
  - Elo online update after u answers a vs b: E = 1 / (1 + 10^((R_b - R_a)/400)); R_a ← R_a + K * (S - E), R_b ← R_b - K * (S - E), with S = 1 (a wins), 0 (b wins), 0.5 (too_close); cant_compare = no update.
  - Davidson with too_close as tie: add the tie probability above; nu is learned from the too_close rate.
  - Ordinal tier model (cumulative logit): P(t_ui >= t) = sigmoid(theta_ui - c_t), thresholds c_1 < c_2 < c_3 shared or per user.
- Why a per-user fit on the log is degenerate: binary insertion only asks questions consistent with the current order, and a consistent user's answers are all implied by the final order. The top item never loses and the bottom item never wins, so the MLE does not exist (strengths diverge; the connectivity condition above fails). With an L2 prior (choix's regularization, or TrueSkill's Gaussian prior) the fit exists but is a smoothed version of the positions, with the spacing set by how many times each item was compared, which reflects the insertion path rather than the strength of preference.
- What the log adds beyond the order, for prediction:
  1. too_close: a genuine near-tie signal that equal positional spacing throws away. Use it to compress spacing (Davidson tie term) or as ties in tau-b.
  2. cant_compare: an incomparability signal, likely cross-genre; useful as a feature for content similarity ("these two are not substitutes").
  3. Revisions and timestamps: if items are re-inserted, contradictions over time indicate uncertain or drifting preferences; this can down-weight an item's score in similarity computations.
  4. Context: if the context field records the tier or session, it can separate "honest" comparisons from forced ones.
  5. A held-out test set for free: logged comparisons are real binary judgments, so "pairwise accuracy on logged comparisons" is a clean evaluation metric (question 8).
  For the core score prediction, the final order (positional scores) already carries nearly all the information; the log is a secondary refinement.
- Pooling across users (the useful direction):
  - Item strengths with per-user random offsets: P_u(i > j) = sigmoid((beta_i + delta_ui) - (beta_j + delta_uj)), delta_ui ~ Normal(0, tau^2). beta_i is a "community strength" from all users' comparisons, a better non-personalized prior than an average score because it is scale-free. Fit beta by regularized BT (choix) nightly in Python over all implied or logged pairs.
  - Low-rank user offsets: delta_ui = p_u · q_i (f-dimensional dot product). This is pairwise logistic matrix factorization, i.e. BPR-style training on explicit comparisons (question 5). The hierarchical BT and the pairwise MF are the same model family.
  - Covariate offsets: delta_ui = w_u · x_i (x_i = genre/developer features), a per-user content model trained on pairs (question 6).
- Training pairs: either the logged comparisons (about n log2 n per user) or all implied pairs from each user's order (n(n - 1)/2; 44,850 pairs for a 300-item list). Implied pairs contain more (redundant) constraints and are the usual choice for ranking losses; sample them per epoch rather than materializing them.
- Elo/TrueSkill are online conveniences, useful if you want a running "community strength" updated per comparison in an Edge Function without batch refits; batch regularized BT is more accurate for a nightly job.

### Gaps
- Hunter 2004 (MM algorithms for generalized BT) was not read directly; the MM iteration above is the Zermelo/Wikipedia form.
- No study was found that measures how much a comparison log improves score prediction over the final order alone; the analysis above is reasoning from the model structure.
- choix's exact regularization semantics (alpha as L2 strength) were not confirmed from the docs page fetched.

---

## 5. Matrix factorization and pairwise/listwise learning: FunkSVD, ALS, SVD++, BPR, CofiRank, ListRank-MF, collaborative ranking; minimum data to beat kNN; costs at 10k users

### Takeaway
Factor models (FunkSVD/ALS on scores, or BPR / pairwise logistic MF / listwise MF on the orders) beat well-tuned neighborhoods on large data mostly by small margins, and need enough rankers per item to learn item vectors; at dozens to a few hundred users they are not worth it. At 10k users with about 100 items each (about 1M rankings) any of them trains in seconds to minutes on a CPU in Python; none needs a GPU. The best fit for Verso's data is a pairwise or listwise loss on each user's order (BPR-style / Plackett-Luce MF), with baseline biases, blended with kNN.

### Cited Findings
- Baseline predictor b_ui = mu + b_u + b_i, fitted by regularized least squares min sum (r_ui - mu - b_u - b_i)^2 + lambda1 (sum b_u^2 + sum b_i^2), or by the decoupled shrunk averages b_i = sum over raters u of (r_ui - mu) / (lambda2 + |R(i)|), then b_u = sum over items i of (r_ui - mu - b_i) / (lambda3 + |R(u)|); "Typical values in the Netflix dataset are: lambda2 = 25, lambda3 = 10." — [Koren 2010](https://courses.ischool.berkeley.edu/i290-dm/s11/SECURE/a1-koren.pdf)
- Netflix scale reference points: SVD with 100 factors RMSE 0.9025; factor models with 50 to 200 factors 0.9046 to 0.9009; integrated models with 100/200 factors 0.8966/0.8953; movie-average baseline 1.053; Cinematch 0.9514. — [Koren 2010](https://courses.ischool.berkeley.edu/i290-dm/s11/SECURE/a1-koren.pdf)
- BPR: optimization criterion BPR-Opt, "the maximum posterior estimator derived from a Bayesian analysis", trained by stochastic gradient descent with bootstrap sampling of triples (u, i, j); model x_uij = x_ui - x_uj passed through a sigmoid; L2 regularization; beat WR-MF, SVD-MF and adaptive kNN on AUC in the paper's experiments ("the importance of optimizing models for the right criterion"). — [Rendle et al. 2009, BPR](https://arxiv.org/abs/1205.2618)
- ListRank-MF (Shi, Larson, Hanjalic, RecSys 2010): listwise learning to rank with MF, minimizing cross-entropy between predicted and ground-truth top-one probabilities; complexity linear in the number of observed ratings; compared favorably with item-based CF and CofiRank. — [ACM DL, ListRank-MF](https://dl.acm.org/doi/10.1145/1864708.1864764)
- Collaborative ranking from pairwise comparisons (Preference Completion / AltSVM): fits a low-rank score matrix to sparse pairwise preferences; convex relaxation generalizes with "O(r log^2 d) pairwise comparisons" per user (r = rank, d = number of items), close to matrix completion's sample complexity; AltSVM alternates SVM-like subproblems, parallelizes, and outperforms baselines including CofiRank on NDCG on moderately large datasets. — [Park, Neeman, Zhang, Sanghavi, Dhillon, Preference Completion](https://arxiv.org/abs/1507.04457)
- Pairwise-preference versions of both MF and nearest-neighbor exist (with user-user similarities designed for pairwise data). — [Kalloori, Ricci, Tkalcic, RecSys 2016](https://dl.acm.org/doi/10.1145/2959100.2959142)
- Implicit-feedback ALS (Hu, Koren, Volinsky): preference p_ui = 1 if r_ui > 0 else 0, confidence c_ui = 1 + alpha * r_ui ("alpha = 40 was found to produce good results"), alternative c_ui = 1 + alpha * log(1 + r_ui/epsilon); loss min sum c_ui (p_ui - x_u · y_i)^2 + lambda (sum ||x_u||^2 + sum ||y_i||^2); one ALS sweep costs O(f^2 N + f^3 m) for users (N = nonzeros, m = users), "linear in the size of the input"; the model admits an item-item style explanation of each recommendation. — [Hu, Koren, Volinsky 2008](http://yifanhu.net/PUB/cf.pdf)
- LightFM represents users and items as sums of the latent factors of their content features; it "outperforms both collaborative and content-based models in cold-start or sparse interaction data scenarios" and "performs at least as well as a pure collaborative matrix factorisation model where interaction data is abundant". — [Kula 2015, LightFM](https://arxiv.org/abs/1507.08439)
- Netflix production after the Prize: the two best components were MF ("SVD", RMSE 0.8914) and RBMs (0.8990), linearly blended to 0.88; the full Prize ensemble was not deployed because the additional accuracy "did not seem to justify the engineering effort". — [Netflix Tech Blog, Beyond the 5 stars, Part 1](https://netflixtechblog.com/netflix-recommendations-beyond-the-5-stars-part-1-55838468f429)

### Inferences
- Formulas for implementation (standard forms):
  - FunkSVD / biased MF on positional scores: s_hat_ui = mu + b_u + b_i + q_i · p_u. SGD per observed (u, i): e = s_ui - s_hat_ui; b_u += eta (e - reg * b_u); b_i += eta (e - reg * b_i); p_u += eta (e * q_i - reg * p_u); q_i += eta (e * p_u - reg * q_i).
  - SVD++: s_hat_ui = mu + b_u + b_i + q_i · (p_u + |N(u)|^(-1/2) * sum over j in N(u) of y_j), where N(u) can be Verso's implicit set (backlog, playing, dropped items). This is the natural way to use backlog status without letting it touch ranking.
  - BPR on Verso orders: for each user, sample i ranked above j (or a logged comparison won by i); x_uij = x_ui - x_uj with x_ui = b_i + p_u · q_i; maximize sum ln sigmoid(x_uij) - lambda ||Theta||^2; SGD step Theta += eta * ((exp(-x_uij) / (1 + exp(-x_uij))) * d x_uij / d Theta - lambda * Theta). Unlike classic BPR, Verso has explicit negatives (disliked items), so j need not be sampled from unranked items.
  - Plackett-Luce / top-one listwise MF: P(i first among list L_u) = exp(x_ui) / sum over j in L_u of exp(x_uj); minimize cross-entropy against the target distribution from the user's positional scores (ListRank-MF uses softmax of the observed scores as target).
  - Output mapping: pairwise/listwise models produce x_ui on an arbitrary scale; convert to Verso's 0 to 10 by predicting the insertion position in u's list (compare x_ux with x_ui for ranked items i; pct_hat = fraction of u's ranked items with x_ui < x_ux) and reading the score at that position (question 3).
- Minimum data where MF beats kNN: no source gives a threshold. Order-of-magnitude reasoning: an item vector of f factors needs well over f rankers to be estimated, and the user needs O(f log^2 d) comparisons (Preference Completion bound, constants unknown). With f = 10 to 20, expect MF to start helping only once a meaningful share of candidate items have 20 to 50+ rankers, i.e. hundreds to low thousands of active users per medium. Verso's insertion log gives about log2(tier size) comparisons per insertion (about 4 to 7), so a 100-item user supplies roughly 400 to 600 logged comparisons and 4,950 implied pairs; per-user data volume is not the bottleneck, rankers per item is.
- Costs at 10k users, 100 items each (N ≈ 1M rankings, f = 32): one ALS half-sweep ≈ f^2 N + f^3 m ≈ 1.0e9 + 3.3e8 flops, i.e. seconds on one CPU core; BPR with 50 epochs over 1M sampled pairs per epoch is a few minutes in numpy/implicit/LightFM. User-user similarity via an inverted index costs sum over items of (raters_i)^2 row-pairs, which is dominated by the most popular titles (an item ranked by 5,000 users alone yields 12.5M pairs), so at 10k users either cap candidate neighbors (e.g. only users sharing >= 5 items found through sampled popular items), or compute similarities in Python with sparse matrix products (X X^T on a 10k x items sparse matrix is fast), then write top-50 neighbors per user back to Postgres.
- Where it runs: kNN, baselines, and content scores fit in SQL plus a nightly pg_cron job at dozens to low thousands of users. MF, BPR, BT pooling need iterative optimization: run a small Python job (GitHub Actions scheduled workflow or any container) that reads from and writes back to Supabase; an Edge Function (Deno/TypeScript) is suitable for serving precomputed factors (dot products at read time), not for training.

### Gaps
- No published learning curve found for "BPR/MF vs kNN as a function of users" on explicit ranking data; the threshold above is an inference.
- CofiRank's primary paper (Weimer et al., NIPS 2007) was not retrieved; it is referenced only through ListRank-MF and Preference Completion comparisons.
- Kalloori et al. 2016 result numbers (pairwise kNN vs pairwise MF) were not accessible (ACM paywall).
- Supabase Edge Function CPU and wall-clock limits were not checked in this session.

---

## 6. Content-based and hybrid methods for cold start; blending as data grows; contextual bandits

### Takeaway
Content profiles from a user's loved and liked tiers (genre, developer/director, cast, tags, platform, era), weighted by mean-centered positional score and IDF, give usable predictions from the first 5 to 10 ranked items and require no other users; they are the cold-start workhorse and the natural "reason" generator. Blend content, kNN, and baseline by inverse-variance (confidence) weights that shift automatically as neighbor evidence grows; move to a feature-augmented factor model (LightFM style) once MF is justified.

### Cited Findings
- LightFM's hybrid (users and items as sums of feature embeddings) outperforms both pure collaborative and pure content models in cold-start and sparse settings and matches pure MF when data is abundant. — [Kula 2015, LightFM](https://arxiv.org/abs/1507.08439)
- Item-item neighborhood explanations are preferred because users know the items they liked but not the "allegedly like-minded users"; each contributing item receives a separable term. — [Koren 2010](https://courses.ischool.berkeley.edu/i290-dm/s11/SECURE/a1-koren.pdf)
- MovieLens addresses new-user cold start with preference elicitation, asking new users to rate how much they enjoy groups of movies (per search-result summary). — [Wikipedia, MovieLens](https://en.wikipedia.org/wiki/MovieLens)
- Adaptive pairwise questions chosen by information gain are an elicitation strategy for cold start (a direct analogue of Verso's "which is better?" prompts). — [Balakrishnan and Chopra](https://link.springer.com/article/10.1007/s11704-012-2871-7)
- Early MovieLens elicitation research tested popularity, entropy, popularity*entropy and item-item personalized strategies for choosing which items to show new users, presenting pages of ten movies "until the user rates ten or more movies"; popularity*entropy performed best for a given number of presented movies in offline tests. — [Rashid et al. 2002, Getting to Know You](https://cs.fit.edu/~pkc/apweb/related/rashid-iui02.pdf)

### Inferences
- Content profile (SQL-friendly):
  - Item feature vector x_i[f] in {0, 1} for each feature f (genre, developer, publisher, director, top-billed cast, tags, platform family, decade), multiplied by idf(f) = ln(N_items / n_f), where n_f = number of catalog items with f.
  - User weights from centered scores: w_ui = s_ui - mu_u (or tier weights loved +2, liked +1, fine 0, disliked -2 if you want tier-only).
  - Profile P_u[f] = sum over i in I_u of w_ui * x_i[f] / sum over i in I_u of |w_ui| (only features seen at least twice, to avoid one-item overfitting).
  - Raw content affinity a_ux = cosine(P_u, x_x) = sum_f P_u[f] x_x[f] / (||P_u|| * ||x_x||), in [-1, 1].
  - Map to 0 to 10 per user by a 1-D calibration fitted on the user's own items (leave-one-out): regress s_ui on a_ui (shrunk toward a global slope), or convert a_ux to a percentile among a_ui for i in I_u and read the score at that percentile (question 3).
  - Alternative with better calibration: per-user ridge regression s_ui ≈ mu_u + sum_f beta_uf x_i[f], penalty lambda * sum_f (beta_uf - beta_f_global)^2 (hierarchical shrinkage toward the population weights). With 20 to 300 items per user and a few dozen features, this is well posed; needs Python or a small TypeScript linear solver.
  - Embedding similarity (text embeddings of summaries, or item vectors from MF) can replace TF-IDF later; the math is identical (cosine to a weighted profile centroid).
- Community prior (non-personalized baseline for all users): prior_x = Bayesian-shrunk community score, e.g. m_x = (n_x * avg_x + C * g) / (n_x + C), where avg_x = mean Verso positional score among raters of x, g = global mean, C = pseudo-count (5 to 20); when n_x is small, fall back to external scores (IGDB, Metacritic, OpenCritic, TMDB) rescaled to Verso's 0 to 10 by a quantile mapping fitted on items that have both. Then personalize it as b_ux = m_x + (mu_u - g) (user offset) or map m_x's community percentile onto u's list.
- Blending as data grows (weighted hybrid with automatic switching):
  pred_ux = (w0 * prior_ux + wc * content_ux + wk * knn_ux) / (w0 + wc + wk), with w0 = 1 (fixed prior weight), wc = n_u / (n_u + kc) * rel_c (kc ≈ 10, rel_c = content model's LOO reliability for this user), wk = sum over neighbors of |sim'| (or n_eff / SE^2 if you have the kNN error estimate). With no neighbors wk = 0 and the formula becomes content plus prior; as neighbors accumulate kNN dominates. This is an inverse-variance (precision-weighted) blend; its weights can later be learned by linear regression on LOO predictions (a stacking blend like the Netflix SVD+RBM linear blend).
- Feature-augmented stage: once MF is justified, LightFM (Python) with item features (genres, developer, cast) and user features (platforms owned, favorite genres from onboarding) subsumes the content model and handles new items on day one.
- Contextual bandits (brief): to avoid recommending only near-certain items, score candidates by an upper-confidence rule, e.g. LinUCB: ucb_ux = x_x · theta_u + alpha * sqrt(x_x^T A_u^-1 x_x), with A_u = lambda I + sum over shown items of x x^T (standard form, not verified in this session). Simpler for Verso: add alpha * SE_ux (the prediction's standard error) to the score for a small "explore" slot, and use Balakrishnan-Chopra-style information-gain choice of which "which is better?" question to ask during onboarding. Bandits need a reward signal (added to backlog, then ranked); they are a later-stage optimization, not a V1 need.

### Gaps
- No source quantifies how many ranked items a content profile needs to beat the community average; "5 to 10" is an inference from the fact that profiles need repeated features to be stable.
- The Wikipedia/search summary about MovieLens's group-based elicitation was not verified against the primary GroupLens paper ([Harper and Konstan 2015](https://dl.acm.org/doi/10.1145/2827872)).

---

## 7. Calibration and confidence: mapping back to 0 to 10, expressing uncertainty, and gating thresholds

### Takeaway
Predict on a normalized scale (residual, percentile, or strength), then map back through the user's own list so the number means "where it would land if you ranked it"; attach a confidence derived from effective neighbor count and neighbor disagreement, and check calibration with leave-one-out. Practice clusters around: 10 ratings to start (Criticker), at least 3 overlapping items to compare two users and at least 3 contributing neighbors per prediction (Criticker), recommendations "really start improving after 100" (Criticker), and about 15 for Beli (unconfirmed).

### Cited Findings
- Criticker: "you need to rate at least 10 titles before Criticker can start generating recommendations"; matching starts at 10 ratings; a TCI needs 3 titles in common and "this three-title minimum raises, the more ratings you have"; default 10% overlap rule; a PSI needs at least 3 of your top 1000 TCIs to have rated the title and uses the top 10 of them. — [Criticker's Algorithm Explained (archived 2026-01-29)](http://web.archive.org/web/20260129213429/https://www.criticker.com/critickers-algorithm-explained/)
- Criticker FAQ: "50 is a good start, but recommendations really start improving after 100." — [Criticker FAQ (archived 2026-05-03)](http://web.archive.org/web/20260503110838/https://www.criticker.com/faq/)
- Criticker maps predictions back to the user's scale: "Criticker is simply translating percentile back to rating. In your list of 251 ratings, 46% of them (or 117) have a rating less than 72", so an average neighbor percentile of 46 becomes a PSI of 72. (0.46 * 251 = 115.5, not 117; the page's own example is slightly inconsistent, probably from ties.) — [Criticker explain (archived)](http://web.archive.org/web/20250818065350/https://www.criticker.com/explain/)
- Surprise fallback semantics: with fewer than min_k neighbors, KNNWithMeans returns the user mean and KNNBaseline returns the baseline. — [Surprise kNN docs](https://surprise.readthedocs.io/en/stable/knn_inspired.html)
- TrueSkill's conservative estimate mu - 3 sigma is a standard way to rank under uncertainty (99% belief the true value is higher). — [Microsoft Research, TrueSkill](https://www.microsoft.com/en-us/research/project/trueskill-ranking-system/)
- Elicitation must balance sign-up burden against early recommendation quality; users can abandon a long sign-up process. — [Rashid et al. 2002](https://cs.fit.edu/~pkc/apweb/related/rashid-iui02.pdf)

### Inferences
- Mapping to 0 to 10 (three equivalent routes, pick one per model):
  1. Residual models (kNN, baseline, FunkSVD) already predict on the positional-score scale; clip to [0, 10] and to the predicted tier's band if you also predict a tier.
  2. Percentile models (Criticker-style, pairwise, content affinity): convert predicted percentile to the user's list position and read the score there (question 3). This is the most faithful to Verso's "score derived from position".
  3. For display, round to one decimal like the user's own scores, and show predicted tier ("probably liked").
- Confidence (per prediction): combine (a) n_eff = (sum |sim'|)^2 / sum sim'^2 (kNN) or number of rankers of the item (baseline), (b) SE from neighbor disagreement (question 2 example: 0.77), (c) the user's own list size n_u (small lists mean an unstable scale). Show as a label, not a raw interval: "High" (SE < 0.75, n_eff >= 5), "Medium", "Needs more data" (n_eff < 3 or n_u < 10). For ranking a recommendation list, sort by a conservative score pred - z * SE (TrueSkill-style mu - k*sigma, with k ≈ 1 for recommendations, not 3).
- Calibration check: on leave-one-out predictions, bucket by predicted score and by confidence label; verify mean actual ≈ mean predicted per bucket and that |error| grows as confidence falls. If predictions are compressed toward the mean (typical of shrinkage), fit a per-medium isotonic or linear recalibration s_actual ≈ a + b * pred on LOO pairs and apply it before display.
- Gating thresholds for Verso (inferences combining the evidence above):
  - Per user: content-only personal scores from about 5 ranked items (show as low confidence); collaborative scores from 10 ranked items (Criticker's start); "recommendations improve" messaging until about 50 to 100.
  - Per user pair: similarity only if n_uv >= 5 (Criticker allows 3, but the noise figures in question 1 argue for more) and n_uv >= 10% of the smaller list.
  - Per prediction: at least 3 contributing neighbors (Criticker), else fall back to content plus prior with the "needs more data" label.
  - Beli's reported 15-item gate sits inside this range and is a reasonable single number for a UI gate.

### Gaps
- Beli's 15-item gate: a search summary stated "at least 15 ranked restaurants" is needed for personalized recommendations, but the underlying article could not be identified among the results (candidates: [Spoon University on Beli](https://spoonuniversity.com/school/brown/beli-the-new-app-personalizing-restaurant-reviews-and-recommendations/), [Long Beach Post on Beli](https://lbpost.com/esd/hi-lo/get-restaurant-recs-from-the-people-you-trust-most-with-beli/)); Wikipedia does not mention a threshold ([Wikipedia, Beli](https://en.wikipedia.org/wiki/Beli_(app))).
- MovieLens's historical sign-up minimum (commonly remembered as 15 ratings) was not confirmed from a primary source in this session.
- No published calibration study for positional-score predictions exists that I found.

---

## 8. Evaluation with little data: leave-one-out, precision@k, NDCG, rank correlation, and testing with 20 users

### Takeaway
With 20 users, evaluate offline by leave-one-out over every ranked item of every user (thousands of predictions), always against three baselines (community prior, user mean, item-bias baseline), and report per-user-averaged MAE on the 0 to 10 scale, pairwise accuracy on logged comparisons, per-user Kendall/Spearman between predicted and actual scores, and top-k metrics with "loved" as relevant. A/B tests are underpowered at this size; use within-user comparisons and behavioral proxies instead, and avoid sampled ranking metrics.

### Cited Findings
- Sampled metrics "are inconsistent with their exact version" and "do not persist relative statements, e.g., 'algorithm A is better than B', not even in expectation"; with very small samples "all metrics collapse to the AUC metric". — [Rendle, arXiv 1912.02263](https://arxiv.org/abs/1912.02263)
- Koren's top-K protocol: for each held-out 5-star rating, rank it against 1,000 random items and report the distribution of its percentile rank; small RMSE differences translated into large top-K differences, and classic Pearson kNN barely beat the non-personalized MovieAvg on this test. — [Koren 2010](https://courses.ischool.berkeley.edu/i290-dm/s11/SECURE/a1-koren.pdf)
- MAE computed per user and then averaged "counts all users equally", the protocol used in the MovieLens elicitation study. — [Rashid et al. 2002](https://cs.fit.edu/~pkc/apweb/related/rashid-iui02.pdf)
- Many published algorithm gains disappear against properly tuned simple baselines (kNN, graph). — [Ferrari Dacrema et al. 2019](https://arxiv.org/abs/1907.06902)

### Inferences
- Leave-one-out protocol for Verso (per medium):
  1. For each user u and each ranked item i: remove i from u's list, recompute u's positional scores for the remaining items (the scale shifts when an item is removed; that is realistic), recompute u's similarities without i, predict s_hat_ui, and compare with the true s_ui (from the full list) and with the true tier.
  2. Metrics: MAE_u = mean |s_hat_ui - s_ui|; tier accuracy (exact and within one); per-user Spearman or Kendall between s_hat_ui and s_ui over all i; pairwise accuracy on the log = fraction of logged comparisons (a vs b, outcome a or b) where s_hat of the held-out item orders correctly against the other item's actual score (ignore too_close and cant_compare); coverage = share of (u, i) with a non-fallback prediction.
  3. Top-k: for each user hold out a random 20% of items, rank held-out items plus all unranked candidate items by prediction, relevant = held-out items in loved (or loved plus liked); report precision@10, recall@10, NDCG@10 with gain = (2^t_ui - 1), and discount 1/log2(rank + 1): DCG@k = sum over r = 1..k of gain_r / log2(r + 1); NDCG = DCG / ideal DCG. Rank against all candidates, not sampled negatives (Rendle).
  4. Baselines to beat, in order: global mean of positional scores; user mean mu_u; community prior m_x mapped to u's scale; baseline b_ui = mu + b_u + b_i with shrinkage. A method that does not beat b_ui on MAE and pairwise accuracy should not ship.
- Statistics with 20 users: compute the metric per user, then the mean difference between methods across users with a paired bootstrap (resample users, 10,000 draws) or a Wilcoxon signed-rank test; with 20 users only large effects (for example a 0.3 to 0.5 point MAE gap) will be detectable. Hyperparameters (beta, lambda, k, kappa) should be tuned by nested LOO or on a separate half of users to avoid overfitting the 20.
- Online testing at small scale: randomized A/B across 20 users will not reach significance; prefer (a) within-user interleaving (mix two models' top picks in one list and count which model's items are added to backlog or opened), (b) explicit feedback prompts ("was this prediction close?" after the user actually ranks a recommended item, which is the gold standard: predicted score vs actual score on items recommended and then ranked), and (c) logging every prediction shown with its model version so later rankings become a growing, honest test set.
- Data requirement to beat the community average, per method (inferences, to be confirmed by the LOO harness): baseline b_ui needs about 3 to 5 ranked items for u and 5+ rankers for the item; content-based needs about 5 to 10 ranked items with repeated features; user-user kNN needs about 10+ ranked items for u, 3+ neighbors with n_uv >= 5 who ranked the item; item-item needs 10 to 20+ co-rankers per item pair; MF/BPR needs hundreds to thousands of users per medium (question 5).

### Gaps
- No published small-sample (about 20 users) evaluation methodology specific to recommenders was found; the protocol above adapts standard LOO and paired testing.
- Interleaving methods for recommenders (as opposed to search) were not researched in this session.

---

## 9. Criticker TCI and PSI exact method; MovieLens's kNN; Netflix Prize lessons for small teams

### Takeaway
Criticker's published method is simple and fully specified: per-user percentiles, TCI = mean absolute percentile difference over shared titles (with overlap minimums), store the best 1000 matches, and PSI = unweighted mean percentile of the top 10 matches who rated the title (at least 3), mapped back through your own rating distribution. It is effectively user-user kNN on percentiles with a hard top-10 cutoff and no similarity weighting, and it is the closest public analogue to what Verso needs. Netflix's lesson is that a regularized baseline plus a neighborhood model plus (later) one factor model, linearly blended, captures most of the value; giant ensembles are not worth the engineering.

### Cited Findings
- Criticker's pipeline (quotes and numbers):
  - Rating scale 0 to 100; "you need to rate at least 10 titles before Criticker can start generating recommendations"; scores are normalized to percentiles because rating habits differ. — [Criticker's Algorithm Explained (archived 2026-01-29)](http://web.archive.org/web/20260129213429/https://www.criticker.com/critickers-algorithm-explained/)
  - Percentile = floor(((num_lower + num_matching/2) / total_ratings) * 100), range 0 to 99; percentiles need at least five distinct ratings. — [How Criticker Works (archived 2025-08-18)](http://web.archive.org/web/20250818065350/https://www.criticker.com/explain/)
  - TCI: "If my percentile for Miller's Crossing is 68, and yours is 85, that's a difference of 17. The TCI is simply the average of all such differences, across titles which we both have rated." — [How Criticker Works (archived)](http://web.archive.org/web/20250818065350/https://www.criticker.com/explain/)
  - TCI eligibility: at least 3 titles in common ("This three-title minimum raises, the more ratings you have"); only users with whom you share at least 10% of your titles (251 ratings means 25 in common), adjustable 10% to 50% on your profile. "A TCI of 10.67 is really good!" — [Algorithm Explained (archived)](http://web.archive.org/web/20260129213429/https://www.criticker.com/critickers-algorithm-explained/); [How Criticker Works (archived)](http://web.archive.org/web/20250818065350/https://www.criticker.com/explain/)
  - Storage: top 1000 TCIs (2000 for sponsors); sponsors get "full daily PSI and TCI updates", implying non-sponsors get less frequent recomputation. — [How Criticker Works (archived)](http://web.archive.org/web/20250818065350/https://www.criticker.com/explain/); [Criticker FAQ (archived 2026-05-03)](http://web.archive.org/web/20260503110838/https://www.criticker.com/faq/)
  - PSI: "Criticker gathers your top ten TCIs who've given it a rating. As long as at least three of your top 1000 TCIs have rated this film, a prediction can be made. The percentiles of their ratings are averaged, and that resulting average percentile is applied to your rating scale." Example: average percentile 56.33 maps to 77 on one user's scale. — [Algorithm Explained (archived)](http://web.archive.org/web/20260129213429/https://www.criticker.com/critickers-algorithm-explained/)
  - Mapping back: "Criticker is simply translating percentile back to rating" (average percentile 46 becomes PSI 72 because 46% of the user's ratings are below 72). — [How Criticker Works (archived)](http://web.archive.org/web/20250818065350/https://www.criticker.com/explain/)
  - Transparency: all calculations behind a recommendation are shown, including which users contributed. — [Criticker FAQ (archived)](http://web.archive.org/web/20260503110838/https://www.criticker.com/faq/)
  - Note: the live Criticker pages sit behind a Cloudflare challenge; the text above comes from Wayback Machine snapshots dated 2025-08-18 (explain), 2026-01-29 (algorithm), and 2026-05-03 (FAQ). The FAQ glossary spells PSI as "Probable Score Indicator" in one place and "Probable Score Index" in another.
- MovieLens: offered users a choice of recommenders including a popularity recommender, an item-item CF recommender using cosine similarity, a FunkSVD recommender ("50 features and 125 training epochs per feature"), and a group-points item-item variant (per search-result summary). — [Wikipedia, MovieLens](https://en.wikipedia.org/wiki/MovieLens); [MovieLens field experiment, arXiv 2309.13296](https://arxiv.org/pdf/2309.13296)
- Netflix Prize lessons: baseline predictors with shrunk biases (lambda2 = 25, lambda3 = 10), shrunk similarities (lambda = 100), neighborhood explainability and no-retrain updates. — [Koren 2010](https://courses.ischool.berkeley.edu/i290-dm/s11/SECURE/a1-koren.pdf). Production used a linear blend of two models (MF 0.8914, RBM 0.8990, blend 0.88) and skipped the full ensemble. — [Netflix Tech Blog](https://netflixtechblog.com/netflix-recommendations-beyond-the-5-stars-part-1-55838468f429)

### Inferences
- Criticker in Verso notation:
  - pct_ui = (#{j in I_u : s_uj < s_ui} + 0.5 * #{j in I_u : s_uj = s_ui}) / n_u. (Verso lists are strict orders, so this is (n_u - pos_ui + 0.5)/n_u.)
  - TCI(u, v) = (100 / n_uv) * sum over i in I_uv of |pct_ui - pct_vi|, defined if n_uv >= max(3, 0.10 * n_u). Lower is better; independent users average about 33.3.
  - PSI_ux: take the top 10 users by lowest TCI among those who ranked x (need at least 3), pbar = mean of pct_vx, then PSI = u's score at percentile pbar.
- What Criticker leaves on the table, and the cheap upgrades for Verso: (1) no shrinkage for small overlaps (a 3-title TCI can rank above a 60-title TCI); use a shrunk distance TCI' = (n_uv * TCI + beta * 33.3) / (n_uv + beta). (2) Unweighted average of the top 10; weight by similarity instead. (3) No confidence shown; add the neighbor spread. (4) No content fallback; add question 6's content score. (5) It ignores item popularity bias; the baseline-residual form (question 2) handles it.
- Recommended build order (synthesis across all nine questions):
  1. V1, from the first dozens of users (SQL plus pg_cron, nightly, with instant per-user recompute of the cheap parts):
     - Community prior per item: Bayesian-shrunk Verso average, falling back to external community scores mapped by quantiles onto the 0 to 10 scale.
     - Baseline b_ui = mu + b_u + b_i with Koren-style shrunk averages (tune lambda2, lambda3 on LOO; start near 5 and 3 at Verso's scale rather than Netflix's 25 and 10).
     - Content profile score (question 6), mapped through the user's own list.
     - User-user kNN on percentiles or mean-centered positional scores, similarity = Kendall tau-b or Pearson on co-ranked items with n_uv >= 5, shrinkage n_uv/(n_uv + beta) with beta around 10, positive neighbors only, top-k up to 30, at least 3 contributors, damped denominator; prediction mapped to 0 to 10 through the user's own list (Criticker PSI style).
     - Precision-weighted blend of prior, content, and kNN with a confidence label and a reason string (the top contributing neighbors or loved items and shared features).
     - Match % between friends: shrunk head-to-head agreement, 50 + 50 * tau_b * n_uv/(n_uv + beta), hidden below 5 shared items.
     - LOO evaluation harness from day one; ship only what beats the baseline.
  2. V2, once candidate items commonly have 10 to 20+ rankers: item-item kNN for "because you loved X" explanations and as a second CF signal; use too_close as ties; learned (stacked) blend weights from LOO predictions.
  3. V3, at hundreds to thousands of active users per medium: a nightly Python job training a pairwise/listwise factor model on each user's order (BPR-style logistic loss on implied pairs, with item biases = pooled Bradley-Terry strengths, optionally LightFM with content features and SVD++-style implicit backlog signals); serve factors from Postgres; blend with kNN linearly as Netflix did. Consider bandit-style exploration only after this, with a clear reward (recommended, then ranked).
  Reasoning: at Verso's starting scale almost all signal is in the user's own list and in a few overlapping neighbors; kNN plus baseline plus content is explainable, updates instantly, runs in the database, and degrades gracefully; the literature shows simple neighborhoods remain hard to beat when tuned, and the factor-model gains appear at scales Verso will reach only later.

### Gaps
- Criticker's pages do not say whether TCI uses any weighting beyond the plain average, how "the minimum raises" is computed as ratings grow, or how ties at the top-10 cutoff are handled.
- MovieLens's current production algorithm details were taken from a search summary, not from a GroupLens primary paper read in this session.
- No Netflix Prize retrospective specifically written for small teams was found beyond the Netflix tech blog and Koren's papers.
