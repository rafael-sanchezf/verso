# Group recommendation: combining several people's predicted preferences into one pick (state as of September 2026)

Scope note: these notes cover the math and practice of "recommend something none of us has seen that we would all like" for groups of two to five, with constraints (genre, runtime, streaming availability, platforms). Everything is aimed at a system that already has, per user and candidate item, a predicted 0 to 10 score and a confidence, stored in Postgres. Sources were read in September 2026; where only a search-engine summary or a secondary source was available, that is flagged.

Shared notation used throughout:
- G = the group, members u in G, n = |G|.
- i = a candidate item (film, show, game).
- s(u,i) = member u's predicted score for i on 0 to 10 (for items u has ranked, the rank-derived score).
- c(u,i) in (0,1] = confidence; sigma(u,i) = standard error of s(u,i) where available.
- mu(i) = a prior for item i (for example the item's mean predicted score across all users, or a Bayesian-shrunk catalog rating mapped to 0 to 10).
- t = a "misery" threshold on 0 to 10 (a score below t means "I'd be unhappy watching this").
- S(G,i) = the group score used to rank candidates.

Running two-person example used in every formula below (A is a heavy user, B is the partner). Five candidate films nobody has seen:

| item | s(A,i) | s(B,i) | mean | min | max | abs diff |
|---|---|---|---|---|---|---|
| F1 | 8.5 | 6.0 | 7.25 | 6.0 | 8.5 | 2.5 |
| F2 | 7.0 | 7.0 | 7.00 | 7.0 | 7.0 | 0.0 |
| F3 | 9.5 | 4.0 | 6.75 | 4.0 | 9.5 | 5.5 |
| F4 | 6.0 | 9.0 | 7.50 | 6.0 | 9.0 | 3.0 |
| F5 | 5.0 | 5.5 | 5.25 | 5.0 | 5.5 | 0.5 |

---

## Q1. Aggregation strategies (Masthoff's catalog and later fairness variants): formulas, and what user studies found people actually prefer, especially for pairs and one-shot decisions

### Takeaway
User studies consistently find that people aggregate by averaging while avoiding misery (Average, Average Without Misery, Least Misery), that Multiplicative/Borda-style rules score well on predicted satisfaction, and that "Most Pleasure" (give it to whoever loves it most) is judged least fair and least satisfying for a single shared choice; no rule wins in every preference distribution. For a pair, the score-based rules (average, least misery, most pleasure, Amer-Yahia's relevance-minus-disagreement consensus, multiplicative) collapse into one family, "mean minus a penalty on |a - b|", while the rank-based voting rules (Borda, Copeland, plurality) become badly tie-prone and throw away intensity, so a single tunable penalty is the practical choice.

### Cited Findings

Masthoff's experiments and the strategy catalog
- Masthoff 2004 (UMUAI 14, "Group modeling: selecting a sequence of television items to suit a group of viewers"): in the first experiment, when humans chose a sequence of TV items for a group from individual ratings, they used the Average (Additive Utilitarian), Average Without Misery and Least Misery strategies, and cared about fairness and about avoiding individual misery; a second experiment measured how satisfied people believed they would be with sequences chosen by different strategies and compared that with satisfaction functions — [Masthoff 2004, Springer abstract](https://link.springer.com/article/10.1023/B:USER.0000010138.79319.fd); [Aberdeen research portal](https://abdn.elsevierpure.com/en/publications/group-modeling-selecting-a-sequence-of-television-items-to-suit-a)
- Secondary (search-engine summary of Masthoff's handbook chapter and a paper citing it, not read in full): the Multiplicative strategy was the most successful in satisfying all individuals, and Borda count was among the best performers in Masthoff's Experiment 2 — [Masthoff 2015 chapter "Group Recommender Systems: Aggregation, Satisfaction and Group Attributes"](https://link.springer.com/chapter/10.1007/978-1-4899-7637-6_22); [paper citing Experiment 2](https://www.researchgate.net/publication/342810350_Evaluation_of_Group_Modelling_Strategy_in_Model-Based_Collaborative_Filtering_Recommendation/fulltext/5f0714a7a6fdcc4ca459b7c3/Evaluation-of-Group-Modelling-Strategy-in-Model-Based-Collaborative-Filtering-Recommendation.pdf)
- Barile et al. summarize Masthoff's experiments as showing "there is no winning strategy — different strategies perform well in different scenarios" — [Barile et al. 2021, CEUR Vol-2955 paper 11, p.3](https://ceur-ws.org/Vol-2955/paper11.pdf)
- Definitions as used in the recent user-study literature: Additive Utilitarian (ADD) recommends the item with the highest sum of ratings; Fairness (FAI) ranks items as if members choose in turn, suited to repeated decisions; Approval Voting (APP) recommends the item with the most ratings above a threshold; Least Misery (LMS) recommends the item with the highest minimum rating; Majority (MAJ) the item with the most ratings representing the majority; Most Pleasure (MPL) the item with the highest individual rating — [Barile et al. 2021](https://ceur-ws.org/Vol-2955/paper11.pdf)
- The ADD and LMS rules written for two users: a_ADD = argmax_a [r1(a) + r2(a)] and a_LMS = argmax_a min{r1(a), r2(a)}; the two rules often select different options from the same ratings ("core-conflict profiles") — [Du, arXiv 2608.23966, 25 Aug 2026](https://arxiv.org/pdf/2608.23966)

User studies of perceived fairness, consensus, satisfaction
- Barile, Najafian, Draws, Inel, Rieger, Hada, Tintarev (2021, preregistered, n = 399 Prolific participants, between-subjects, 5 strategies x 3 explanation types, a 4-person restaurant scenario): participants could discriminate between strategies and gave clearly worse evaluations to Most Pleasure on fairness, consensus and satisfaction; the level of explanation had no effect; "users' perceptions of fairness, consensus, and satisfaction are primarily formed based on the social choice aggregation strategies" — [Barile et al. 2021](https://ceur-ws.org/Vol-2955/paper11.pdf). The journal version (UMUAI 2023) repeats the 399-participant design — [Barile et al. 2023, UMUAI](https://link.springer.com/article/10.1007/s11257-023-09363-0)
- In the Barile et al. 2021 figure, Least Misery had the highest mean fairness perception when an explanation was shown (roughly +1.3 on a -3..+3 scale) while Most Pleasure sat near -1.5 to -2 on all three measures (read from the plotted means) — [Barile et al. 2021, Figure 1](https://ceur-ws.org/Vol-2955/paper11.pdf)
- Tran et al. (2019), as summarized by Barile et al.: explanations tied to ADD and MAJ helped most to increase perceived fairness, consensus and satisfaction, and perceived fairness or consensus correlated with satisfaction — [Barile et al. 2021, section 2.2](https://ceur-ws.org/Vol-2955/paper11.pdf)
- The relative performance and perceived suitability of strategies depends on the distribution of preferences within a group — [Du 2026 citing Barile et al. 2024 and Waterschoot et al. 2025](https://arxiv.org/pdf/2608.23966)

PolyLens (MovieLens groups, the only large deployed movie-group study)
- PolyLens used least misery: "the group's happiness was the minimum of the individual members' happiness scores", merged members' recommendation lists sorted by least misery, and excluded any movie any member had already rated — [O'Connor, Cosley, Konstan, Riedl 2001](https://files.grouplens.org/papers/poly-camera-final.pdf)
- Groups were overwhelmingly pairs: 257 of 338 groups had 2 members, 53 had 3, 16 had 4, 12 more; about 35% of groups were named as a pair of personal names and 10% as families — [PolyLens 2001, Table I](https://files.grouplens.org/papers/poly-camera-final.pdf)
- Survey (143 responses): 95% satisfied or very satisfied with group recommendations; 77% found group recommendations more helpful than individual ones when deciding on a movie — [PolyLens 2001, Table V](https://files.grouplens.org/papers/poly-camera-final.pdf)
- "Several users disliked the 'minimize misery' policy", and one pointed out it ignores rating-scale differences ("Mark's '5' is Dan's '3'"); the authors "got away with" the simple method because groups were small and users could review individual recommendations — [PolyLens 2001, Lessons Learned](https://files.grouplens.org/papers/poly-camera-final.pdf)
- Users viewed fewer movies per group request than per individual request partly because "the system's predicted score falls off quickly because of the 'minimum individual score' social value function" — [PolyLens 2001](https://files.grouplens.org/papers/poly-camera-final.pdf)
- PolyLens's design discussion names long-term fairness ("giving greater weight to people who 'lost out' in previous recommendations") and expert weighting as possible social value functions — [PolyLens 2001](https://files.grouplens.org/papers/poly-camera-final.pdf)

Relevance-plus-disagreement (the SQL-friendly consensus family)
- Amer-Yahia, Roy, Chawla, Das, Yu (VLDB 2009): group relevance rel(G,i) = (1/|G|) * sum_u relevance(u,i) (Average) or min_u relevance(u,i) (Least Misery); group disagreement dis(G,i) = 2/(|G|(|G|-1)) * sum over pairs |relevance(u,i) - relevance(v,i)| (average pairwise) or (1/|G|) * sum_u (relevance(u,i) - mean)^2 (variance); consensus F(G,i) = w1 * rel(G,i) + w2 * (1 - dis(G,i)), w1 + w2 = 1; Least Misery is the special case w1 = 1 with min-relevance — [Amer-Yahia et al. 2009](http://www.vldb.org/pvldb/vol2/vldb09-858.pdf)
- Their Mechanical Turk user study found "incorporating disagreements is critical to the effectiveness of group recommendation"; they also chose score aggregation over profile aggregation for flexibility and efficiency, and showed the scoring works with top-k threshold algorithms over per-user sorted lists — [Amer-Yahia et al. 2009](http://www.vldb.org/pvldb/vol2/vldb09-858.pdf)

Fairness-aware and envy-free variants (for lists, not single picks)
- Kaya, Bridge, Tintarev (RecSys 2020), GFAR: an ordered top-N is fair if relevance is balanced across members "for each prefix of the top-N"; greedy algorithm maximizing the probability that the list contains at least one relevant item for every member, with relevance derived from each member's individual ranking (Borda-based); significantly better than all other algorithms in about 43% of cases, especially for large groups with divergent interests — [Kaya et al. 2020](https://dl.acm.org/doi/10.1145/3383313.3412232); [ACM full text listing](https://dl.acm.org/doi/fullHtml/10.1145/3383313.3412232)
- Serbos et al. (WWW 2017): m-proportionality (a member considers a package fair if it contains at least m items they like, e.g. in their personal top-Delta%) and m-envy-freeness (member u is envy-free for item i if r(u,i) is in the top-delta% of {r(v,i) : v in G}; the package is fair to u if at least m items are envy-free for u) — [Serbos et al. 2017 PDF](https://i.cs.hku.hk/~nikos/WWW17.pdf); [ResearchGate record](https://www.researchgate.net/publication/315870191_Fairness_in_Package-to-Group_Recommendations)

Surveys and books
- Jameson and Smyth (2007) frame group recommendation as four subtasks: acquiring preferences, generating recommendations, explaining them, and helping members settle on a final decision — [Jameson & Smyth 2007, The Adaptive Web](https://link.springer.com/chapter/10.1007/978-3-540-72079-9_20)
- Dara, Chowdary, Kumar (2020, J. Intell. Inf. Syst. 54:271-295) survey group recommenders across domains by aggregation and preference model — [Semantic Scholar](https://www.semanticscholar.org/paper/A-survey-on-group-recommender-systems-Dara-Chowdary/9e6148b9a7e4d1813f94bf4677786bc78a95ed43)
- Felfernig, Boratto, Stettinger, Tkalcic, "Group Recommender Systems: An Introduction", second edition Springer 2024 (first edition 2018), covering aggregation algorithms, preference construction, explanations, UI and psychological aspects — [Amazon listing, 2nd ed.](https://www.amazon.com/Group-Recommender-Systems-Introduction-Communication/dp/3031449428); [ResearchGate, 1st ed.](https://www.researchgate.net/publication/328118222_Group_Recommender_Systems_-_An_Introduction)

Group dynamics (why one-shot aggregation is only half the story)
- Delic, Neidhardt, Nguyen, Ricci (2018, Information Technology & Tourism 19:87-116) observed groups before, during and after choosing a travel destination together — [Semantic Scholar](https://www.semanticscholar.org/paper/An-observational-user-study-for-group-recommender-Delic-Neidhardt/3d6e6fb3f350082c53019d6b3ff66a23c4affc92)
- Delic et al. found group decision-making "can be a highly dynamic process, where individual preferences can be constructed and may change during the process" (as cited in a 2025 position paper) — [Rethinking Group Recommender Systems in the Era of Generative AI, arXiv 2507.00535](https://arxiv.org/html/2507.00535)
- Delic, Masthoff, Neidhardt, Werthner (UMAP 2018), 150 participants in 41 groups: social centrality was hardly an indicator of social influence in "equality matching" groups — [Utrecht University portal](https://research-portal.uu.nl/en/publications/how-to-use-social-relationships-in-group-recommenders-empirical-e); [search summary of the paper](https://www.researchgate.net/publication/326215347_How_to_Use_Social_Relationships_in_Group_Recommenders_Empirical_Evidence)

LLMs as aggregators (2025 to 2026)
- Waterschoot, Tintarev, Barile (May 2025): LLMs execute specified social-choice rules near-perfectly for small cases (2 users x 5 items) but performance deteriorates beyond roughly 100 ratings; in-context examples lifted Phi4 from 57% to 85% on high-complexity cases — [arXiv 2505.05016](https://arxiv.org/html/2505.05016v1)
- Du (25 Aug 2026): three LLMs (GPT-5.6 Sol, Claude Sonnet 5, Qwen 3.6 Plus) executed ADD and LMS perfectly when told which to use, but when the aggregation rule was unspecified or delegated, the outcomes differed across models and preference settings — [arXiv 2608.23966](https://arxiv.org/pdf/2608.23966)

### Inferences

Every rule as a formula, with the two-person worked example (A 8.5 / B 6.0 is F1)

1. Average / Additive Utilitarian: S(G,i) = (1/n) * sum_u s(u,i). F1 = (8.5 + 6.0)/2 = 7.25. Ranking F4 7.50 > F1 7.25 > F2 7.00 > F3 6.75 > F5 5.25. Winner F4.
2. Least Misery: S = min_u s(u,i). F1 = 6.0. Ranking F2 7.0 > F1 = F4 6.0 > F5 5.0 > F3 4.0. Winner F2.
3. Most Pleasure: S = max_u s(u,i). F1 = 8.5. Winner F3 (9.5), the film B is predicted to dislike (4.0). This is the rule users rated worst for a single shared choice (Barile et al.).
4. Average Without Misery: S = mean if min_u s(u,i) >= t, else excluded. With t = 6.0: F3 and F5 drop, winner F4 (7.5), F1 survives at 7.25. With t = 6.5: F1 and F4 drop, winner F2. The rule is only as good as t, and t should be in each member's own terms (see Q3 on normalization).
5. Multiplicative (Nash product): S = prod_u s(u,i), or equivalently the geometric mean (prod_u s(u,i))^(1/n) = exp(mean_u ln s(u,i)). F1 = 8.5 * 6.0 = 51.0 (geomean 7.14). F4 54.0 (7.35) > F1 51.0 (7.14) > F2 49.0 (7.00) > F3 38.0 (6.16) > F5 27.5 (5.24). Winner F4. For two people a*b = mean^2 - (a - b)^2/4, so multiplicative is "average with a penalty that grows with the square of the disagreement". It needs a ratio scale (0 must mean "worst"); on a 0 to 10 rank-derived score this holds roughly, but clamp s at a small positive floor before taking ln.
6. Borda count: each member ranks the m candidates; points_u(i) = m - rank_u(i) (top gets m-1, bottom 0); S = sum_u points_u(i). With m = 5: A ranks F3 4, F1 3, F2 2, F4 1, F5 0; B ranks F4 4, F2 3, F1 2, F5 1, F3 0. Totals F1 5, F2 5, F4 5, F3 4, F5 1: a three-way tie. With two voters Borda totals are sums of two ranks, so ties are common and intensity (A's 9.5 vs 8.5) is discarded.
7. Copeland: item x beats y if more members prefer x to y; S(x) = wins - losses over all other candidates. With two members "more members" means both, so Copeland reduces to counting Pareto dominance. Here F1, F2, F4 each Pareto-dominate only F5 (score +1), F3 ties everything (0), F5 is -3. Three-way tie again. Copeland is nearly useless for pairs and costs an O(m^2) self-join.
8. Plurality: each member votes for their single top item; S = number of first-place votes. A votes F3, B votes F4: 1-1 tie. Useful for pairs only when both share a top pick (which is exactly the swipe-to-match "match" event).
9. Approval voting: S = number of members with s(u,i) >= t. With t = 7.0: F2 gets 2, F1, F3, F4 get 1, winner F2 (same as least misery). With t = 6.0: F1, F2, F4 tie at 2. For pairs, approval with "both approve" is the same as a misery filter.
10. Fairness (turn-taking, Masthoff): for a sequence, members take turns picking their favourite remaining item. For a one-shot pick this is "whose turn it is picks": A's turn gives F3, B's turn gives F4. It only makes sense as fairness across sessions (see the deficit counter in Q9).
11. Most Respected Person / dictator: S = s(leader, i). Not a fairness rule; included for completeness.
12. Amer-Yahia consensus: F = w1 * (mean/10) + w2 * (1 - |a - b|/10) for two members (average pairwise disagreement of two people is just |a - b|). With w1 = 0.8, w2 = 0.2: F1 0.80*0.725 + 0.20*0.75 = 0.730; F2 0.760; F4 0.740; F3 0.630; F5 0.610. Winner F2, then F4, then F1. The variance variant for pairs is (a - b)^2/4 (F1: 1.5625), which behaves like the multiplicative penalty.

The pair collapse (the most useful fact for a two-person product)
- For two members, min(a,b) = mean - |a - b|/2 and max(a,b) = mean + |a - b|/2. So Average, Least Misery, Most Pleasure and Amer-Yahia's consensus are all members of one family:
  S_lambda(i) = mean(i) - lambda * |a - b|, with lambda in [-0.5, 0.5].
  lambda = 0 is Average, lambda = 0.5 is Least Misery, lambda = -0.5 is Most Pleasure, and Amer-Yahia with weights (w1, w2) is lambda = w2/w1 (0.25 for 0.8/0.2).
- Worked example at lambda = 0.25: F2 7.00 > F4 6.75 > F1 6.625 > F3 5.375 > F5 5.125. At lambda = 0.1: F4 7.20 > F1 7.00 = F2 7.00. The F4/F2 break-even is 7.5 - 3*lambda = 7.0, lambda = 1/6. So one tunable number spans the whole debate between "maximize the total" and "protect the less happy person", and it is a single SQL expression.
- For n > 2 the analogue is mean - lambda * stddev_pop (variance disagreement) or mean - lambda * (max - min); Least Misery is no longer exactly in the family, and it gets harsher as n grows because the chance that someone scores low rises with n.

What the evidence implies for Verso's one-shot "film tonight" decision
- Most Pleasure is the wrong final rule for a single shared item (worst-rated in Barile et al.). Spotify's Blend did choose "maximize the joy" (Q6), but that is a playlist of many tracks where each person's picks alternate; the analogue in Verso is a shortlist where each person has at least one of their strong picks, not a final pick by max.
- Pure Least Misery was the PolyLens choice and several users disliked it; the literature consensus (Masthoff: average plus misery avoidance; Amer-Yahia: disagreement matters) points to Average Without Misery or a moderate disagreement penalty (lambda roughly 0.15 to 0.3) or Multiplicative, which all behave similarly for pairs.
- Rank-based voting rules (Borda, Copeland, Plurality) are designed for many voters; with two they are tie-prone and discard intensity. Use them only as tie-breakers or not at all.

### Gaps
- I could not read Masthoff's handbook chapters (2011, 2015) in full; the claim that Multiplicative was best at "satisfying all individuals" and Borda among the best in Experiment 2 comes from search-engine summaries of the chapter and of a citing paper, not the primary text. The exact experimental numbers (group of three, participant counts) are not verified here.
- I found no user study that isolates pairs (dyads) as a condition; PolyLens is the best evidence that pairs dominate real movie groups, and the Barile/Tran scenarios used four people. Whether couples tolerate more imbalance than friend groups (because of repeated interaction) is untested in what I found.
- The Delic et al. (2018) observational paper's specific numbers (preference change rates, satisfaction with the group choice) were not accessible (Springer redirect); only the summary claims above are cited.
- Baltrunas, Makcinskas, Ricci (RecSys 2010, "Group recommendations with rank aggregation and collaborative filtering") is the standard offline comparison of rank aggregation by group size and within-group similarity, but the ACM PDF was blocked and its results are not cited here — [ACM](https://dl.acm.org/doi/pdf/10.1145/1864708.1864733)
- The exact GFAR normalization of Borda scores into relevance probabilities is reconstructed from the paper's description, not copied from the paper (the ACM full text returned 403).

---

## Q2. Merging profiles vs merging recommendations vs merging predictions: which is standard, and trade-offs at small scale

### Takeaway
The standard in both the classic literature and practice is to aggregate per-member predictions (score aggregation) or per-member ranked lists, not to build a merged pseudo-user; it is easier to explain, cheap when individual predictions are already computed, and lets the UI show each member's score, which PolyLens users wanted. Profile merging can surface more serendipitous items but biases toward the member with more data and can produce group scores outside any member's range.

### Cited Findings
- PolyLens laid out the two approaches: a "pseudo-user" built by merging rating profiles or choosing a single neighbourhood for the group, versus generating each member's recommendation list and merging the lists. Pseudo-users can find serendipitous items but "using the union of the group's individual ratings leads to recommendations biased toward users with more ratings", may satisfy many but not all members, and the group prediction "may lie outside the range of any individual predictions, which may be disorienting to users and difficult to explain". Merging lists is easy to explain ("the system believes three of you would like it a lot, but two of you wouldn't like it at all"), is efficient because individual recommendations are computed anyway, but is "less likely to identify unexpected, serendipitous items" — [PolyLens 2001](https://files.grouplens.org/papers/poly-camera-final.pdf)
- Amer-Yahia et al. distinguish preference aggregation (merge members' prior ratings into one virtual user) from score aggregation (compute each member's recommendations and merge scores), and state that score aggregation "typically offers better flexibility ... and more opportunities for efficiency improvement", which is why they adopt it — [Amer-Yahia et al. 2009](http://www.vldb.org/pvldb/vol2/vldb09-858.pdf)
- Barile et al. describe the same split as "aggregated models" vs "aggregated predictions or strategies" — [Barile et al. 2021](https://ceur-ws.org/Vol-2955/paper11.pdf)
- Profile merging has been used for TV households (Yu et al., UMUAI 2006, "TV program recommendation for multiple viewers based on user profile merging") — [Springer](https://link.springer.com/article/10.1007/s11257-006-9005-6)
- Masthoff's 2015 chapter notes that group recommendation techniques can also be applied to individuals, in particular to solve cold start — [Masthoff 2015 chapter page](https://link.springer.com/chapter/10.1007/978-1-4899-7637-6_22) (from the chapter's published abstract as returned by search; not read in full)

### Inferences
- For Verso, merging predictions is the natural choice: the personal recommender already produces s(u,i) and c(u,i) per user, the aggregation is a GROUP BY over a predictions table, and the composite UI (group score plus each member's score) falls out for free.
- Profile merging would be actively harmful for Verso's typical pair (a 200-film heavy user plus a 5-pick guest): the union profile is essentially the heavy user's profile, which is the PolyLens bias. The guest's taste would disappear.
- The one place a merged "pair embedding" might help is candidate generation for serendipity (for example, nearest neighbours of the midpoint of two user vectors), feeding a candidate set that is then scored by per-member predictions. That keeps explanation and fairness on the per-member side.
- Plumbing implication: if the personal recommender stores only each user's top-K predictions, the intersection of two top-K lists can be tiny for divergent pairs, and a disliked item simply has no row (so least misery cannot see the misery). Group queries need per-member predictions for the whole eligible candidate set, either precomputed for a catalog subset (for example the few thousand most-available titles per region) or computed on demand for the candidate set in an Edge Function.

### Gaps
- I found no published head-to-head of profile merging vs prediction merging specifically for groups of two with very unequal data, which is Verso's typical case; the inference above rests on PolyLens's qualitative argument.

---

## Q3. Confidence and weighting (200 ranked films vs 5 grid picks), and bootstrapping a non-user from 5 to 10 picks

### Takeaway
Treat confidence as uncertainty about a member's score, not as a lower say in the decision: shrink the uncertain member's prediction toward an item prior (so a guest neither dominates nor gets ignored), keep member weights equal, and normalize every member's scores to their own scale (percentile or z) first. For the guest, a 5 to 10 pick grid built from well-known, diverse titles (Netflix's "choose 3 titles", MovieLens's elicitation research) is enough to fold the guest into an item-similarity or factor model; PolyLens shows invite-a-non-member is valued but conversion is modest.

### Cited Findings
Scale and normalization
- PolyLens users complained the least-misery method "does not take into account differences in rating scales (e.g., Mark's '5' is Dan's '3')" — [PolyLens 2001](https://files.grouplens.org/papers/poly-camera-final.pdf)
- Criticker normalizes each user's ratings to percentiles of that user's own list; the Taste Compatibility Index (TCI) between two users is the average absolute percentile difference over co-rated titles (e.g. 68th vs 85th percentile is a difference of 17); a TCI needs at least 3 titles in common, and Criticker only considers users with at least 10% of your titles in common; predictions average the percentiles of your best 1,000 matches and map the result onto your own rating scale — [Criticker explain page and TCI page, via search summary](https://www.criticker.com/explain/); [Criticker TCIs](https://www.criticker.com/tcis/)

Member weighting in the literature
- Weighted group aggregation exists mainly to model influence, not uncertainty: Quintarelli et al. (RecSys 2016) weight members of ephemeral groups (together for the first time) by "contextual influence", the ability of an individual in a given situation to direct the group's decision; expertise has been modelled by counting a user's ratings on predefined popular items, and "Most Respected Person" uses the expert's ratings — [Quintarelli et al. 2016 (ACM)](https://dl.acm.org/doi/10.1145/2959100.2959137); [search summary of related work](https://www.semanticscholar.org/paper/Recommending-New-Items-to-Ephemeral-Groups-Using-Quintarelli-Rabosio/0946dff96c25eb8c50338143a2d12f0dd0bcef9f)
- PolyLens lists "weigh the opinion of expert members more highly" and long-term fairness weighting as candidate social value functions — [PolyLens 2001](https://files.grouplens.org/papers/poly-camera-final.pdf)

Cold start and quick-start elicitation
- Netflix asks new accounts and new profiles to choose a few titles they like (widely described as 3) to "jump start" recommendations; the step is optional, and skipping it starts you on "a diverse and popular set of titles"; once you engage, viewing behaviour supersedes the initial picks — [Netflix Help Center](https://help.netflix.com/en/node/100639); [UserOnboarding.Academy on "choose 3 shows"](https://useronboarding.academy/user-onboarding-inspirations/netflix-signup-onboarding)
- Rashid et al. (IUI 2002, MovieLens) compared strategies for choosing which items to show a new user; a popularity strategy presents items in descending number of ratings; entropy alone "may not be an effective strategy" because it often picks items users are unlikely to have an opinion about; popularity and entropy are not strongly correlated — [Rashid et al. 2002](https://cs.fit.edu/~pkc/apweb/related/rashid-iui02.pdf) (via search summary)
- Watchworthy's onboarding quiz asks users to mark TV shows as liked, disliked, interested or not interested, and it supplements with parent company Ranker's first-party data — [TechCrunch, 20 Mar 2024](https://techcrunch.com/2024/03/20/watchworthy-will-now-tell-you-which-streaming-services-to-cancel-and-which-to-keep)
- Matched (Taste Labs) starts with "Calculates your taste" before swiping, and "continues to learn your taste" from each swipe — [App Store listing, read Sept 2026](https://apps.apple.com/us/app/matched-movie-app-for-couples/id1623287922)

Non-member participation
- PolyLens: users valued being able to invite non-members by email; group creators sent 391 invitations to non-members and 95 were accepted; the 77 invitees who joined made significantly more recommendation requests in their first 30 days than a control group of other new users (872 vs 459; 47% vs 32% returned after the first visit); 21% found it hard to add members, mainly because members had to already be MovieLens users — [PolyLens 2001, Tables III and V, Outreach](https://files.grouplens.org/papers/poly-camera-final.pdf)
- Reelgood's Swipe With Friends (Jan 2021) needed "no app to download, no account needed. Just share a url" — [Android Police, 16 Jan 2021](https://www.androidpolice.com/2021/01/16/swipe-with-friends-is-like-tinder-for-finding-movies-and-shows-to-watch/)

Spotify Blend and low-data members
- Spotify's Blend team noted that pairs with little or no shared listening history are "significantly more difficult" and they needed "an approach that worked for both types of pairs" — [Spotify Engineering, 7 Dec 2021](https://engineering.atspotify.com/2021/12/a-look-behind-blend-the-personalized-playlist-for-youand-you)

### Inferences

Principle: confidence changes the estimate, not the vote
- The member in the room counts as one person regardless of how much data we have. Down-weighting an uncertain member in the welfare function (S = sum w_u s_u / sum w_u with w_u = confidence) quietly hands the decision to the heavy user. Instead, shrink each uncertain prediction toward a prior, then aggregate with equal weights.

Step 1, normalize to each member's own scale (addresses "Mark's 5 is Dan's 3")
- Percentile form (Criticker-style, fits Verso's rank-derived lists): q(u,i) = predicted percentile of i within u's own ranked list, on 0 to 10 (q = 10 * percentile). For a ranked list with strict order this is already how Verso's 0 to 10 score is derived, so for heavy users s(u,i) may already be close to a percentile; for predictions, map the predicted score through the user's own empirical score distribution.
- z form: z(u,i) = (s(u,i) - mean_u)/sd_u, then rescale to 0 to 10 with a common mean and sd. Either works in SQL (percent_rank() over a window, or joins to a per-user stats row).

Step 2, shrink by confidence toward an item prior
- Simple credibility form (one line of SQL): s'(u,i) = mu(i) + c_u * (s(u,i) - mu(i)), with c_u = n_u/(n_u + k), n_u = number of items the member has ranked (or picks, for a guest), k = a pseudo-count (for example 10 to 20).
- Worked example on F1, mu(F1) = 7.0, k = 10: A has n = 200, c_A = 200/210 = 0.952, s'(A) = 7.0 + 0.952 * 1.5 = 8.43. Guest B has n = 5, c_B = 5/15 = 0.333, s'(B) = 7.0 + 0.333 * (6.0 - 7.0) = 6.67. Pair score at lambda = 0.25: mean 7.55, |diff| 1.76, S = 7.55 - 0.44 = 7.11 (raw was 6.625). If instead the guest's raw prediction were 9.5, it would shrink to 7.83: the guest's strong like counts but cannot dominate either.
- Contrast with the wrong approach (confidence as vote weight): (0.952 * 8.5 + 0.333 * 6.0)/(0.952 + 0.333) = 7.85, which is essentially A's opinion.
- Bayesian form, when the recommender gives sigma(u,i): posterior mean = (s/sigma^2 + mu/tau^2)/(1/sigma^2 + 1/tau^2), posterior sd = (1/sigma^2 + 1/tau^2)^(-1/2), with tau = the spread of the item prior. With s(B) = 6.0, sigma = 2.0, mu = 7.0, tau = 1.5: posterior mean = (1.5 + 3.11)/(0.25 + 0.444) = 6.64, sd 1.20.

Step 3, decide how uncertainty interacts with the misery veto (a real design choice)
- Misery probability for member u: P(s_true(u,i) < t), approximated as Phi((t - s)/sigma). Postgres has no built-in normal CDF, but the logistic approximation Phi(x) ~ 1/(1 + exp(-1.702 x)) is one expression. Example t = 5.0: B at s = 6.0, sigma = 2.0 gives x = -0.5, Phi ~ 0.31 (logistic 0.30); A at 8.5, sigma 0.8 gives about 0. Group misery risk = 1 - prod_u (1 - P_u) ~ 0.31.
- If the veto uses a lower confidence bound (exclude if s - sigma < t), the uncertain guest gets more veto power (6.0 - 2.0 = 4.0 < 5 would exclude F1). If the veto uses the shrunk mean, the guest gets less. Recommended middle ground: apply the misery threshold to the shrunk mean, and show high-risk items only with an explicit "not sure she'll like this" flag rather than silently dropping them. Revisit once real "we watched it" outcomes exist (Q8).

Bootstrapping the guest from 5 to 10 grid picks
- Grid composition: 24 to 40 titles, chosen for recognizability (popularity) and spread across genres and eras (Rashid et al.: pure entropy picks items people have not seen; Netflix: fall back to a diverse popular set). Allow an optional "hard no" chip row for genres (horror, musicals), which maps directly to a filter.
- Scoring the guest without training (pure SQL): with a precomputed item-item similarity table sim(i,j) (co-ranking or embedding cosine), s(g,i) = mu(i) + beta * (mean_{j in picks} sim(i,j) - sim_baseline(i)), with a low fixed confidence (for example c_g = n_picks/(n_picks + k)).
- Scoring the guest with the existing factor model (if the personal recommender is matrix factorization): "fold in" a user vector by solving the k x k least-squares system against fixed item factors, treating picks as positive implicit feedback. That is a few milliseconds in an Edge Function; the resulting predictions go into the same predictions table under a session-scoped guest id.
- Criticker's rule of thumb (TCI needs at least 3 common titles) suggests user-user neighbour methods are too thin for a 5-pick guest; item-based or fold-in methods fit better.
- If the guest's picks overlap the host's ranked top tier, that overlap is itself a strong explanation hook ("you both love Heat").

### Gaps
- Spotify has not published how Blend handles a member with little listening history beyond the statement that low-overlap pairs are harder; no Spotify method for cold-start Blend members was found.
- I did not find a published study that tests shrinkage vs weighting for unequal-data members inside a group recommender; the recommendation above is a principled inference, not an empirical result.
- Netflix's exact onboarding count ("3") comes from a secondary onboarding teardown; the Netflix Help Center says "a few titles".
- Criticker's own "quick start" flow details were not readable (403); only the TCI mechanics are cited.

---

## Q4. The "none of us has seen it" constraint, its cost, the rewatch slot, and hard constraints (genre, runtime, streaming)

### Takeaway
Excluding anything any member has seen is standard (PolyLens did it) but it removes exactly the best-known, best-liked titles for heavy users; products handle "one of you loved it" through shared-watchlist and "hide watched" filters rather than a formal rewatch slot, so a separate, labelled rewatch lane is an open design space. Streaming and genre constraints are hard filters applied before scoring; nearly every consumer pair app filters by services, usually "any service one of us has".

### Cited Findings
- PolyLens "decided not to recommend movies that any member of the group had already rated (and therefore seen)" — [PolyLens 2001](https://files.grouplens.org/papers/poly-camera-final.pdf)
- Amer-Yahia et al.'s formal problem statement likewise requires that no member has rated a recommended item — [Amer-Yahia et al. 2009, section 2.3](http://www.vldb.org/pvldb/vol2/vldb09-858.pdf)
- Letterboxd lets you view another member's watchlist filtered to "In your watchlist" (the intersection of both watchlists) and "Hide watched films" — [Letterboxd help center](https://letterboxd.zendesk.com/hc/en-us/articles/15179318694287-Can-I-compare-my-watchlist-with-another-member-s); feature announced by Letterboxd on X — [Letterboxd on X](https://x.com/letterboxd/status/699356719843921920)
- Third-party Letterboxd tools: Watchlist Match reads each public watchlist, finds the intersection, and ranks shared films by Letterboxd average rating, for two or more users — [Watchlist Match](https://watchlistmatch.com/); Toolboxd finds films a whole group wants to watch and compares two users head to head — [Toolboxd](https://letterboxd.tools/); others: [Boxdbud](https://boxdbud.io/), [letterbox-wl-overlap on GitHub](https://github.com/joshkeating/letterbox-wl-overlap)
- Streaming filters: Reelgood's Swipe With Friends filters across 150+ services in the US and UK plus type, IMDb score, genre, year range and popularity — [Android Police 2021](https://www.androidpolice.com/2021/01/16/swipe-with-friends-is-like-tinder-for-finding-movies-and-shows-to-watch/); Matched lets couples filter matches "by mood, streaming, etc." — [App Store](https://apps.apple.com/us/app/matched-movie-app-for-couples/id1623287922); Movie Swiper filters by genre, year or streaming platform — [Google Play](https://play.google.com/store/apps/details?id=com.github.freshmorsikov.moviematcher&hl=en); a vendor review credits JustWatch with showing "what is available across all your shared subscriptions" — [TasteRay review, 6 Aug 2026 (vendor)](https://www.tasteray.com/review/best-movie-apps-for-couples)
- PolyLens users asked for temporary subgroups ("if only three of us are going to the movies, and there are five in the group, we don't want the other two skewing our average") — [PolyLens 2001](https://files.grouplens.org/papers/poly-camera-final.pdf)

### Inferences
Cost of the constraint
- If member u has seen a fraction p_u of the eligible pool and seen-sets were independent, the unseen-by-all fraction would be prod_u (1 - p_u): two members at 50% and 30% leave 35%. Seen-sets are positively correlated (everyone saw the famous ones), so the true remaining pool is somewhat larger than that, but it is systematically missing the canonical, high-prior titles. The practical cost is on quality at the top of the list, not pool size.
- For heavy-user pairs, the remaining candidates skew toward lesser-known titles where predictions are less confident, so confidence handling (Q3) matters more exactly when the constraint bites.

Rewatch / "share a favourite" lane (separate slot, separate score)
- Eligible: i seen by exactly the members in a subset H (usually one person), rated highly by them (for example Verso top tier, or actual score r(h,i) >= 8.5), not "dropped" by anyone, unseen by the rest, and predicted s(v,i) >= t for every unseen member v.
- Score: R(i) = mean over unseen members v of s'(v,i) (the newcomer's experience matters most), tie-broken by the host's actual score r(h,i). Label explicitly: "Rafa's 9.4, you'd probably like it (7.8)".
- For games, "played" by one member does not remove co-op novelty; treat "played solo, never co-op" as still eligible in the rewatch lane.

Watchlist intersection as an intent signal
- An item on every member's backlog/watchlist is the strongest possible prior (it is what Letterboxd and Watchlist Match surface). Add a boost term: S'(i) = S(i) + b * (members with i in backlog)/n, or show a dedicated "on both your watchlists" row before model picks.

Hard constraints (filters before scoring, all SQL WHERE clauses)
- Availability: "on a service one of us has" means the union of the members' provider sets in the session's region; show the provider logo per item. Offer "intersection only" as a toggle when members are in different homes (remote watch).
- Runtime: runtime_min <= max_runtime; for TV, count episodes or season length separately.
- Genre: include/exclude arrays; guest "hard no" genres from the grid are excludes.
- Subgroup: the session is defined by who is present, not by a persistent group (PolyLens lesson).

### Gaps
- No product found publishes a formal "rewatch slot" for groups; the Letterboxd filters and third-party intersections are the closest precedent. Whether people want to rewatch with a partner at all, by medium, is not studied in the sources found.
- No empirical data found on how much the "unseen by all" filter shrinks the pool for real heavy-user pairs.

---

## Q5. Explanation: what a good group explanation looks like, and research on explanations, consensus and satisfaction

### Takeaway
The best-supported explanation is simply showing each member's own predicted score next to the group score (PolyLens's composite view, which 93 to 94% of users wanted), plus a concrete "because" anchor per person; recent controlled studies find that explaining the aggregation rule itself adds little to perceived fairness or understanding, because perceptions are driven by which rule picked the item. Explanations should be generated from the chosen rule's actual numbers, not left to an LLM to decide.

### Cited Findings
- PolyLens implemented a "composite" interface showing the group prediction plus each member's individual prediction; 94% preferred being able to see each member's personal recommendations and 93% preferred letting others see theirs; 97% (798 of 819) of members actually shared; some users said seeing individual recommendations "was essential to making good use of group recommendations" — [PolyLens 2001, Tables VI and figures](https://files.grouplens.org/papers/poly-camera-final.pdf)
- PolyLens's example of an explainable merged list: "the system believes that three of you would like it a lot, but two of you wouldn't like it at all" — [PolyLens 2001](https://files.grouplens.org/papers/poly-camera-final.pdf)
- Barile et al. 2021 (n = 399): no effect of explanation level (none, basic, detailed) on fairness, consensus or satisfaction; the aggregation strategy drove perceptions — [Barile et al. 2021](https://ceur-ws.org/Vol-2955/paper11.pdf)
- Tran et al. (2019), per Barile et al.: explanations for ADD and MAJ helped most, and perceived fairness/consensus correlated with satisfaction — [Barile et al. 2021](https://ceur-ws.org/Vol-2955/paper11.pdf)
- Group explanations have goals beyond single-user ones: fairness, consensus, and privacy preservation (not disclosing members' confidential preferences); Quijano-Sanchez et al. added personality and tie strength to generate "tactful" explanations that avoid damaging friendships — [Barile et al. 2021, section 2.2](https://ceur-ws.org/Vol-2955/paper11.pdf)
- Waterschoot, Yera Toledo, Tintarev, Barile (2025, n = 271, 3 strategies x 3 explanation types): textual or multimodal explanations did not increase subjective or objective understanding; Least Misery was objectively understood better than Approval Voting; Additive Utilitarian had higher subjective understanding than Approval Voting; the authors suggest picking strategies partly for understandability — [arXiv 2505.04273](https://arxiv.org/html/2505.04273)
- Spotify Blend explains with a taste-match score and "the songs that bring you two together", and shows which songs were added for which friend — [Spotify newsroom, 30 Mar 2022](https://newsroom.spotify.com/2022-03-30/discover-and-listen-to-music-with-even-more-friends-and-family-plus-some-of-your-favorite-artists-with-spotifys-newest-blend-update/); Blend "data stories" communicate shared artists and taste match — [Spotify Engineering 2021](https://engineering.atspotify.com/2021/12/a-look-behind-blend-the-personalized-playlist-for-youand-you)
- The 2025 GenAI position paper argues group recommenders should give feature-based explanations and side-by-side comparisons — [arXiv 2507.00535](https://arxiv.org/html/2507.00535)
- LLMs asked to aggregate without a specified rule produce inconsistent aggregation outcomes across models — [Du 2026](https://arxiv.org/pdf/2608.23966); LLM-generated group recommendations' explanations do not always correspond to the observed recommendation (as summarized in Du 2026, citing Waterschoot et al. 2025a) — [Du 2026](https://arxiv.org/pdf/2608.23966)

### Inferences
- A good pair explanation for Verso has three parts, all computable: (1) each person's predicted score on their own scale ("you 8.4, Sam 7.1"); (2) one anchor per person from their own top tier, chosen as the nearest neighbour of the candidate in that person's ranked list ("you ranked Heat top tier; Sam picked Collateral"); (3) the shared hook if one exists (same genre, director, or it is on both watchlists). Template: "You loved X, Sam loved Y; this sits between them" when anchors differ, "You both loved X" when they coincide.
- Because friends already see each other's lists in Verso, the PolyLens privacy result transfers well; for a guest, show only what the guest picked in the session and never expose the host's low scores for the guest's picks (tactfulness).
- Do the aggregation in SQL and hand the LLM (if any) only the numbers and anchors to phrase; do not let an LLM choose the rule (Du 2026).
- Group-level taste match (Blend-style) is a cheap, shareable delight feature: for two members with percentile lists, a TCI-like number = 100 - mean absolute percentile difference over co-ranked items (Criticker's method), shown only when co-ranked items >= 3 to 10.

### Gaps
- No study found tests anchor-based ("you loved X, she loved Y") explanations for pairs specifically; the evidence is for rule-based explanations and composite displays.

---

## Q6. Product precedents: Spotify Blend and Jam, Netflix profiles, Letterboxd and third-party tools, JustWatch/Reelgood, swipe-to-match apps, MovieLens, 2024 to 2026 launches

### Takeaway
Two interaction patterns dominate: (1) a continuously generated blend from both histories (Spotify Blend, Watchworthy Watch Together) that favours individual relevance with visible attribution, and (2) swipe-to-match over a filtered catalogue (Reelgood, Matched, MovieMatch, many small apps) where the "aggregation" is simply unanimous approval and personal history is used little or not at all. Big streamers (Netflix) solved the household problem with per-person profiles and have no group recommender; film trackers (Letterboxd) offer watchlist intersection only.

### Cited Findings
Spotify
- Blend (engineering post by Jen Lamere, 7 Dec 2021) balances relevance, coherence, equality and "democratic" (tracks both like); the team chose to "maximize the joy", which "values relevance over democratic and coherent attributes", validated with employee testing and heuristic reviews by the Data Curation team across varied taste-overlap scores; a latency fix cut generation time to about a tenth — [Spotify Engineering](https://engineering.atspotify.com/2021/12/a-look-behind-blend-the-personalized-playlist-for-youand-you)
- Blend expanded on 30 Mar 2022 from two people to up to 10, plus Blends with 20 featured artists; shows taste-match scores, which songs were added for which friend, updates daily, available to Free and Premium — [Spotify newsroom](https://newsroom.spotify.com/2022-03-30/discover-and-listen-to-music-with-even-more-friends-and-family-plus-some-of-your-favorite-artists-with-spotifys-newest-blend-update/); [TechCrunch](https://techcrunch.com/2022/03/30/spotify-expands-its-music-matching-playlist-blend-to-work-with-up-to-10-people-including-select-artists/)
- The taste-match score is calculated from how similar or different members' listening is; users reported taste-match percentages changing in late 2024 — [TechCrunch 2022](https://techcrunch.com/2022/03/30/spotify-expands-its-music-matching-playlist-blend-to-work-with-up-to-10-people-including-select-artists/); [Spotify Community thread](https://community.spotify.com/t5/Content-Questions/My-taste-match-percentages-in-my-blends-recently-dropped/td-p/6169434)
- Jam (26 Sep 2023): a real-time shared queue; Premium users start it, Free and Premium can join; recommendations find "the overlaps in listening preferences"; built on the same technology as Blend, which had created over 45 million blended playlists by then; up to 32 participants — [Spotify newsroom](https://newsroom.spotify.com/2023-09-26/spotify-jam-personalized-collaborative-listening-session-free-premium-users/); [TechCrunch](https://techcrunch.com/2023/09/26/spotify-launches-jam-a-real-time-collaborative-playlist-controlled-by-up-to-32-people)

Netflix
- Netflix introduced individual profiles in 2013 so that a shared account's recommendations stopped being a "mishmash" across household members; about three-quarters of viewing was attributed to home-page recommendations, and multi-user households had reduced their effectiveness — [TechCrunch, 1 Aug 2013](https://techcrunch.com/2013/08/01/netflix-user-profiles/)
- Academic work has proposed group recommenders on top of Netflix-style data ("Netflix recommendations for groups", ASIS&T 2010) — [ACM](https://dl.acm.org/doi/10.5555/1920331.1920522)
- Netflix onboarding: pick a few titles, optional, falls back to diverse popular titles — [Netflix Help Center](https://help.netflix.com/en/node/100639)

Letterboxd and tools
- Native "In your watchlist" filter on another member's watchlist and "Hide watched films" — [Letterboxd help](https://letterboxd.zendesk.com/hc/en-us/articles/15179318694287-Can-I-compare-my-watchlist-with-another-member-s)
- Watchlist Match (intersection ranked by Letterboxd average rating), Toolboxd, Boxdbud, Matchletter watchlist compare — [Watchlist Match](https://watchlistmatch.com/); [Toolboxd](https://letterboxd.tools/); [Boxdbud](https://boxdbud.io/); [Matchletter](https://www.matchletter.com/watchlist-compare.html)

Streaming guides and social feeds
- Reelgood Swipe With Friends (Jan 2021): share a URL, no account, 150+ services US/UK, filters, match notification when both like a title — [Android Police](https://www.androidpolice.com/2021/01/16/swipe-with-friends-is-like-tinder-for-finding-movies-and-shows-to-watch/)
- JustWatch: custom lists shareable with friends and family; no dedicated group-matching feature found — [JustWatch support](https://support.justwatch.com/article/what-are-custom-lists)
- Plex Discover Together (launched Aug 2022 as a beta for Plex Pass, later to all users): activity feed of friends' watchlists, ratings and history, a People tab, and "Friends History" on title pages; a social feed rather than a group recommender — [TechCrunch, 10 Aug 2022](https://techcrunch.com/2022/08/10/plex-introduces-a-social-experience-to-its-streaming-app-with-launch-of-discover-together/); [Next TV](https://www.nexttv.com/news/plexs-community-features-available-to-all-users)
- Watchworthy (owned by Ranker) launched "Watch Together" in March 2024: friend requests, then "Group Worthy Suggestions" from everyone's tastes; covers 200+ services; TechCrunch doubted precision with unlimited friends — [TechCrunch, 20 Mar 2024](https://techcrunch.com/2024/03/20/watchworthy-will-now-tell-you-which-streaming-services-to-cancel-and-which-to-keep)

Swipe-to-match and pair apps
- MovieMatch for Plex (open source): Tinder-style swipes over a Plex library; titles that two or more people swipe right on show as matches, with the most right-swiped first — [GitHub](https://github.com/LukeChannings/moviematch); [blog walkthrough](https://joszuijderwijk.nl/blog/moviematch/)
- Matched (Taste Labs, Inc.; iPhone): taste calculation, then swiping; a match when both swipe right creates a shared list; filters by mood and streaming; "recommendations from likeminded couples"; 4.7 stars from 281 ratings; last updated 16 Nov 2024 (v1.6.1); Premium $2.99/month or $19.99/year (listing read Sept 2026) — [App Store](https://apps.apple.com/us/app/matched-movie-app-for-couples/id1623287922). A vendor review describes the Android version as buggy and lower rated — [TasteRay (vendor)](https://www.tasteray.com/review/best-movie-apps-for-couples)
- Other current swipe apps: Swipe and Watch (room code, match when everyone swipes right) — [App Store](https://apps.apple.com/us/app/swipe-and-watch-movie-picker/id6738925201); Movie Swiper web app (free, no signup) — [movieswiper.app](https://movieswiper.app/); Movie Night (filters by genre, date, services) — [landing page](https://moviestogether.github.io/landing/); NextWatch by Couple Co (v2.0 added a Partner beta with a shared watchlist and AI suggestions) — [Google Play](https://play.google.com/store/apps/details?id=com.cjpixelstudios.nexwatch&hl=en)
- Vendor claims from 2026 roundups (treat as marketing): Taste.io offers a compatibility percentage but requires both partners to rate many titles; TasteRay has partners describe a shared mood; MatchWatch has each person choose privately from a shared set, then reveals the overlap; "several Tinder-style movie-matching apps [were] discontinued over the years" (no names given) — [TasteRay, 6 Aug 2026](https://www.tasteray.com/review/best-movie-apps-for-couples); [MatchWatch blog 2026](https://www.matchwatch.tv/blog/best-movie-apps-for-couples-2026)

MovieLens
- PolyLens ran from May 2000 as a MovieLens extension; by Feb 2001 it had 338 groups, 819 members, about 7,000 group requests; about a quarter of groups were used only on the day they were formed, about a quarter of early groups were still in use 7 to 9 months later, and the remaining groups were used for weeks or months before lying fallow (break-even around 55 days); 80% of members (not just creators) requested group recommendations — [PolyLens 2001](https://files.grouplens.org/papers/poly-camera-final.pdf)

Research view of how people actually decide
- Jannach et al. (quoted in a 2025 position paper): "it remains unclear how often and when people would engage with a dedicated group recommendation tool – such as for movies – by explicitly specifying their preferences and ratings, and then relying primarily on a system generated ranked list"; groups may prefer to discuss options on existing communication platforms — [arXiv 2507.00535](https://arxiv.org/html/2507.00535)

### Inferences
- Verso's structural advantage over every swipe app: both people already have rich, ranked histories (at least the host does), so the deck can be pre-ranked by a group score and short (10 to 20 cards) instead of a random catalogue crawl; the swipe becomes the final consensus step (Jameson and Smyth's fourth subtask), not the whole recommender.
- Blend's "maximize the joy" works because a playlist gives each person many turns; the film equivalent is a balanced shortlist, not a max-based pick.
- Netflix's profile model shows why incumbents avoid groups: the recommender only sees one profile per session, so "who is on the couch" is unobservable. Verso's explicit session (who is present, which services) is the missing input and a differentiator.
- The Jannach critique argues for a shareable result (a link or card into iMessage/WhatsApp) rather than requiring everyone to sit in the app.

### Gaps
- No primary source found for the names or shutdown dates of discontinued swipe apps (Moviematch-style services, "Picky", "Filmswipe", "Popcorn"); I could not verify that apps by those exact names exist or existed.
- No Netflix statement found explaining why it has no group recommender; the explanation above is inference.
- No 2025 to 2026 launch by a major streamer (Netflix, Disney+, Max, Prime Video, Apple TV) of a group-recommendation or "pick together" feature was found in searches; absence of evidence, not confirmed absence.
- TasteDive and "what should we watch" recommenders were not researched in depth beyond the vendor roundup mention.

---

## Q7. Games specifically: recommending a multiplayer or co-op game for a group given owned platforms and libraries

### Takeaway
Games add hard feasibility constraints that films do not have: a shared platform (or crossplay), a player count that fits the group, a co-op or versus mode, and ownership or cost. Existing tools are library-intersection filters (Steam's own library filter and third-party comparers), not taste-aware group recommenders; IGDB's multiplayer_modes data is enough to encode the feasibility side.

### Cited Findings
- Steam can filter a friend's game list, or your own library, to games you both own, and the library filter can combine a friend with multiplayer filters (community forum description) — [Tildes thread](https://tildes.net/~games/1k9m/is_there_a_tool_method_to_find_games_you_have_in_common_with_someone_else)
- Third-party comparers: Steam friends filters (compare multiple Steam libraries, see games in common, filter by tags and features) — [lorenzostanco.com](https://www.lorenzostanco.com/lab/steam/friends/); Steam Navigator compare libraries — [steamnavigator.com](https://steamnavigator.com/compare_games); "What To Play Together" (a developer's tool for common games between Steam users) — [Medium](https://medium.com/@marcin.bigos99/i-have-created-a-tool-to-find-common-games-between-steam-users-what-to-play-together-a4ee26082b2a)
- Steam Remote Play Together lets local co-op games be played with friends online as if in the same room — [TechRadar](https://www.techradar.com/news/steam-will-soon-let-offline-multiplayer-games-be-played-with-friends-online)
- IGDB's multiplayer_modes endpoint exposes campaigncoop, dropin, lancoop, offlinecoop, offlinecoopmax, offlinemax, onlinecoop, onlinecoopmax, onlinemax, platform, splitscreen and splitscreenonline — [IGDB API field list (third-party copy of docs)](https://tech.dukeyin.com/2023/06/14/igdb-api-documents/); [IGDB API](https://www.igdb.com/api)

### Inferences
Feasibility filter (SQL WHERE), per candidate game i and session group G of size n:
- Platform: exists platform p such that every member has access to p (or the game supports crossplay across the members' platforms), and multiplayer_modes row for (i, p) has onlinecoop = true with onlinecoopmax >= n (remote session) or offlinecoop/splitscreen with offlinecoopmax >= n (same couch). For versus games use onlinemax/offlinemax.
- Ownership: count members who own i (or have it via a subscription). Rank "everyone owns it" first, then "k members would need to buy it" with price shown; never hide the purchase cost.
- Status: exclude if any member dropped it; "played solo" by one member does not exclude a co-op run (Q4 rewatch lane).
- Taste scoring then uses the same per-member predicted scores and the same aggregation as films; for co-op, least-misery pressure is higher (a bored player ruins the session for everyone), so a larger lambda or a misery floor is justified.
- Session length is the game analogue of runtime: filter on HowLongToBeat-type data or tags ("session-based", "drop-in") when the group wants "one evening".

### Gaps
- No product was found that combines per-member taste predictions with library intersection and co-op feasibility for game groups; existing tools stop at "games you both own".
- Steam's store "friends who own / want this" indicators were not verified from an official Steam source in this pass.
- IGDB does not obviously expose a reliable crossplay field in the listed multiplayer_modes fields; crossplay data source is an open question.
- Verso's data model (per the brief) has backlog and played/dropped statuses but no ownership or platform-access per user; that data would have to be added or asked in the session.

---

## Q8. Evaluation: how to measure whether a group recommendation was good

### Takeaway
The field mostly evaluates offline with synthetic groups built from individual ratings (per-member accuracy aggregated into mean and minimum, plus fairness metrics), and it acknowledges a gap between that and real group satisfaction. Verso can do better than the literature because it can observe the real outcome: which item the pair picked, whether they watched it, and how each member ranked it afterwards.

### Cited Findings
- Because large datasets of group decisions are lacking, group recommenders are usually evaluated offline against individual feedback with artificially generated groups, analysing quality per member and aggregating into overall performance and fairness; the area "lacks ground rules and agreement on best practices for offline evaluation" — [Group Recommender Systems community, Medium (search summary; page returned 403)](https://medium.com/@thegrscom/offline-evaluation-of-group-recommender-systems-caveats-solutions-479d29fb5121); [RecSys 2022 tutorial on offline evaluation for group recommenders](https://dl.acm.org/doi/fullHtml/10.1145/3523227.3547371)
- A 2025 survey of 110 group-recommender papers quantifies a growing "rift" in communities, datasets, objectives and baselines — [Bridging the Rift, UMAP 2025 Adjunct](https://doi.org/10.1145/3708319.3733658)
- User studies measure perceived fairness, perceived consensus and satisfaction on Likert scales (for example "The group recommendation is fair to all group members") — [Barile et al. 2021](https://ceur-ws.org/Vol-2955/paper11.pdf)
- The 2025 GenAI position paper calls for "multi-faceted human-centric evaluation approaches" beyond dominant offline experiments, including decision process quality — [arXiv 2507.00535](https://arxiv.org/html/2507.00535)
- Kaya et al. evaluate top-N group lists by whether relevance is balanced for every member at every prefix (the GFAR objective), with harder cases being larger and more divergent groups — [Kaya et al. 2020](https://dl.acm.org/doi/10.1145/3383313.3412232)
- PolyLens measured usage (requests per user, group lifecycles) and survey satisfaction rather than accuracy — [PolyLens 2001](https://files.grouplens.org/papers/poly-camera-final.pdf)

### Inferences
Online, per session (log every session as an append-only event, like comparisons):
- Acceptance@k: chosen item was in the top k shown (k = 1, 3, 5). Also "time to decision" and number of swipes before a match.
- Watch-through: "we watched it" confirmed (a follow-up prompt next day, or status changed to seen/played for all present members). This is the primary label.
- Realized per-member utility: after watching, each member places the item in their Verso ranking; convert to percentile p(u,i). Session metrics: mean_u p(u,i), min_u p(u,i), and a misery rate = share of sessions where some member put it in their bottom tier.
- Prediction calibration for groups: realized p(u,i) minus predicted, split by host vs guest (tests the shrinkage choice in Q3).
- Fairness over time for a recurring pair: deficit(u) = cumulative sum over sessions of (p(u,chosen) - mean over members p(v,chosen)); a healthy pair oscillates around zero.

Offline, before launch:
- Build synthetic pairs from real friend pairs (they follow each other), hide each member's actual later rankings of items both saw after a cutoff, and score each rule by mean and min held-out percentile of its top pick, plus 1-proportionality of its top 3 (does each member have one of their personal top-quartile items?). Sweep lambda in [0, 0.5].

### Gaps
- Kaya et al.'s exact evaluation metric names and values could not be read (403).
- No published dataset of real couples' movie-night decisions with post-watch ratings was found; Verso's own logs would be novel.

---

## Q9. Recommendation for what to build first (synthesis for Verso)

### Takeaway
Build a pair-first "tonight" session that runs one SQL query over precomputed per-member predictions: hard filters (unseen by all, availability on any member's service in region, runtime, genre, platform/players for games), per-member percentile normalization, confidence shrinkage toward an item prior, and a single group score S = mean - lambda * |a - b| (lambda about 0.2 to 0.25, with a misery floor), then show a balanced shortlist of 3 to 5 with each person's score and anchors, plus a labelled rewatch lane and a watchlist-intersection row, and let both people swipe or tap to confirm. Log the session and the "we watched it" outcome to tune lambda.

### Cited Findings
- Score aggregation over individual predictions is efficient, explainable and the dominant approach — [Amer-Yahia et al. 2009](http://www.vldb.org/pvldb/vol2/vldb09-858.pdf); [PolyLens 2001](https://files.grouplens.org/papers/poly-camera-final.pdf)
- People aggregate by average while avoiding misery, and penalizing disagreement matters — [Masthoff 2004](https://link.springer.com/article/10.1023/B:USER.0000010138.79319.fd); [Amer-Yahia et al. 2009](http://www.vldb.org/pvldb/vol2/vldb09-858.pdf)
- Most Pleasure is perceived as least fair for a single shared choice — [Barile et al. 2021](https://ceur-ws.org/Vol-2955/paper11.pdf)
- Real movie groups are mostly pairs, and members want to see each other's predictions — [PolyLens 2001](https://files.grouplens.org/papers/poly-camera-final.pdf)
- Non-member invites are valued; link-based, no-account sessions exist in the market — [PolyLens 2001](https://files.grouplens.org/papers/poly-camera-final.pdf); [Android Police on Reelgood 2021](https://www.androidpolice.com/2021/01/16/swipe-with-friends-is-like-tinder-for-finding-movies-and-shows-to-watch/)
- Balanced lists (every member has something relevant at every prefix) matter most for larger, divergent groups — [Kaya et al. 2020](https://dl.acm.org/doi/10.1145/3383313.3412232)

### Inferences

Build order
1. Session object: members present (users and a guest id), medium, region, services (union of members' providers, overridable), max runtime, genre includes/excludes; for games, platform and "same couch or remote".
2. Guest link: grid of 24 to 40 recognizable, diverse titles; pick 5 to 10 favourites plus optional "hard no" genres; fold into predictions under a session-scoped guest id with low confidence (Q3).
3. Group query (below): filters, normalization, shrinkage, pair score, misery floor, watchlist boost.
4. Result screen: a watchlist-intersection row (if any), a shortlist of 3 to 5 chosen greedily so each member has at least one of their personal top-quartile candidates (1-proportionality, a light GFAR), each card with group score, each member's score and one anchor each; a separate "share a favourite" rewatch row.
5. Final step: both tap or swipe the short deck; first mutual yes wins (plurality with unanimity = match). Share card for chat apps.
6. Logging: session, shown list, positions, choice, watched confirmation, later rankings. Use this to tune lambda and the misery threshold per pair over time, and keep a per-pair deficit counter to tilt future sessions toward whoever has "lost out" (Masthoff's fairness strategy and PolyLens's long-term fairness idea, applied across sessions).
7. Groups of 3 to 5 reuse the same query with mean - lambda * stddev_pop and a stricter misery floor; switch the shortlist builder to full GFAR only if divergent groups turn out to be common.

SQL sketch (Postgres; one row per candidate; parameters prefixed with colon)

    WITH members AS (
      SELECT unnest(:member_ids::uuid[]) AS user_id
    ),
    cand AS (
      SELECT m.id AS item_id
      FROM media_item m
      WHERE m.medium = :medium
        AND (:max_runtime IS NULL OR m.runtime_min <= :max_runtime)
        AND NOT (m.genre_ids && :exclude_genres)
        AND NOT EXISTS (                       -- unseen / unplayed by everyone present
          SELECT 1 FROM user_entry e
          WHERE e.item_id = m.id
            AND e.user_id IN (SELECT user_id FROM members)
            AND e.status IN ('seen','played','dropped'))
        AND EXISTS (                           -- on a service one of us has
          SELECT 1 FROM availability a
          WHERE a.item_id = m.id AND a.region = :region
            AND a.provider_id = ANY(:provider_ids))
    ),
    p AS (                                     -- normalized, shrunk per-member scores
      SELECT pr.item_id, pr.user_id,
             ip.mu + (pr.pct_score - ip.mu) * us.n / (us.n + :k) AS s
      FROM prediction pr
      JOIN cand c        ON c.item_id = pr.item_id
      JOIN item_prior ip ON ip.item_id = pr.item_id
      JOIN user_stats us ON us.user_id = pr.user_id
      WHERE pr.user_id IN (SELECT user_id FROM members)
    ),
    g AS (
      SELECT item_id,
             count(*)                    AS n_scored,
             avg(s)                      AS mean_s,
             min(s)                      AS min_s,
             max(s) - min(s)             AS spread,
             stddev_pop(s)               AS sd_s,
             exp(avg(ln(greatest(s, 0.1)))) AS geo_s
      FROM p GROUP BY item_id
    )
    SELECT g.*,
           g.mean_s - :lambda * g.spread                    -- pair score (use sd_s for n > 2)
             + :watch_boost * (SELECT count(*) FROM backlog b
                               WHERE b.item_id = g.item_id
                                 AND b.user_id IN (SELECT user_id FROM members))::float
                              / :n_members AS group_score
    FROM g
    WHERE g.n_scored = :n_members          -- every member has a prediction
      AND g.min_s >= :misery_floor         -- average without misery
    ORDER BY group_score DESC
    LIMIT 50;

Notes on the sketch: pct_score is the member's prediction mapped to their own percentile scale (Q3); item_prior.mu can be the item's mean predicted score across all users; the rewatch lane is a second query that flips the "unseen by everyone" condition to "seen and top-tier for exactly one member, unseen by the rest"; Borda (rank() over partition by user) and Copeland (pairwise self-join on the top 50) are cheap to add for comparison but are not recommended as the default for pairs.

Defaults to start from (to be tuned with logged outcomes)
- lambda = 0.2 (between Average and Least Misery; for the worked example it picks F2 over F4, the break-even being 1/6).
- misery_floor = the 30th percentile of each member's own scale (in 0 to 10 percentile units, 3.0), applied to shrunk scores.
- k (shrinkage pseudo-count) = 10.
- Shortlist size 3 to 5; deck for swipe 10 to 20.

### Gaps
- The default parameter values above are starting points derived from the worked example and the literature's qualitative findings, not from any published tuning on couples' movie choices.
- Table and column names in the SQL sketch are illustrative; they are not taken from Verso's schema, which was out of scope for this research.
