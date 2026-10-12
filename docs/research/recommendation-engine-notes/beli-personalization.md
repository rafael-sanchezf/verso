# Beli's personalization and recommendation layer (Rec score, Match Score, Taste Profile, Friend score, similar-taste recs, group features), state as of September 2026

Research compiled 2026-09-24. Builds on `docs/research/beli-ranking-algorithm.md` (sections 4 and 5) and does not repeat its ranking-mechanic material.

Labels used on every finding:
- **[Confirmed]**: stated in Beli's own copy (App Store listing, beliapp.com, job postings, privacy policy), by a Beli founder or employee, or by two or more independent sources.
- **[Single-source]**: stated by one independent, non-Beli source. Probably true, but not corroborated.
- **[Inferred]**: my reading of the evidence. Each one says what supports it and what would contradict it.

Access notes: Reddit was not searched because the tooling cannot reach it. Google Play pages came back truncated both times I tried, so Play reviews and Play "What's new" text are missing. Three pages returned 403: Medium (Jason D., Audrey Wu's "Redesigning Beli") and Peerlist. Google Patents does not render through the fetch tool. The InProd podcast page returned 404. I found no podcast transcripts. Where a finding comes only from a search-engine summary, I say so.

---

## 1. What Beli shows as a personalized prediction ("Rec score"), where it appears, its scale, and whether it explains itself

### Takeaway
Beli shows two numbers on any restaurant you have not ranked. The "Rec score" is Beli's prediction of how much you will like the place. The "Friend score" is the plain average of your friends' scores. The prediction is the default number on restaurant pages and in search results. Recommendations also show up as a list on your profile and as curated "Top 10" guides on the home screen. I found no evidence that Beli ever explains a Rec score ("because you liked X").

### Cited Findings
- [Confirmed] **Two scores per restaurant.** Wikipedia (citing WSJ and Food Network, fetched 2026-09-24) says the app calculates "one predicting how much the user liked the restaurant and the other stating how much a user's friends on Beli liked the restaurant." — [Wikipedia: Beli (app)](https://en.wikipedia.org/wiki/Beli_(app))
- [Confirmed] **The names are "Rec score" and "Friend score".** NYU WSN (2023-10-16) glosses "Rec Score" as "Beli's prediction of your liking" and "Friend Score" as "what your friends on the app thought of the restaurant." — [Washington Square News](https://nyunews.com/culture/dining/2023/10/16/beli-app/). Julia's Substack (2024-07-01): "For new restaurants that you haven't ranked, you can see two scores: 1) Rec score and 2) Friend score." — [Little Thoughts](https://jteesang.substack.com/p/why-i-love-beli-app)
- [Confirmed] **The prediction comes from your own ratings.** Spoon University Emory (undated, pre-2024): "Beli gives you a rating based on how much they think you would like it based on your other ratings." — [Spoon Emory](https://spoonuniversity.com/school/emory/rate-save-and-recommend-restaurants-on-app-beli/). Long Beach Post (2023-06-06): "Restaurants are then assigned a score for the user to see, which tells the user how much Beli thinks they will like a place." — [Long Beach Post](https://lbpost.com/esd/hi-lo/get-restaurant-recs-from-the-people-you-trust-most-with-beli/)
- [Confirmed] **The Friend score is an unweighted average.** Today.com (2025-07-17): the friend rating "averages all of a user's friends' scores for a particular spot." — [Today](https://www.today.com/food/trends/what-is-beli-app-rcna217748). Spoon Brown: "the average of your friends' scores on restaurant pages." — [Spoon Brown](https://spoonuniversity.com/school/brown/beli-the-new-app-personalizing-restaurant-reviews-and-recommendations/). Spoon Emory: "the average rating that your friends have given the restaurant."
- [Single-source, 2026] **Search results show the prediction by default, with no toggle to the average.** App Store review by macatack1205 (2026-04-04, v8.4.5, 5 stars): "I do wish on the search feature you could just see the average ratings instead of what the app thinks I would like. Please allow me to toggle this." — [MWM mirror of App Store reviews](https://mwm.ai/apps/beli/1478375386); also on [App Store reviews](https://apps.apple.com/us/app/beli/id1478375386?see-all=reviews&platform=iphone)
- [Confirmed] **The community average is a third number, and it sits behind a referral wall.** Valley Magazine (Penn State, 2025-04-17) lists the invite rewards as reservation priority, a social handle in your bio, and "seeing the average scores of different restaurants"; "The more people one invites to the app, the more features they are able to unlock." — [Valley Magazine](https://www.valleymagazinepsu.com/foodies-unite-meet-beli/). App Store review TRC1904 (Jul 19; the prior file dates it 2026): "the average score feature should be a basic feature. You can only access it if you refer someone." — [App Store reviews](https://apps.apple.com/us/app/beli/id1478375386?see-all=reviews&platform=iphone). App Store review name12232 (2026-02-26, v8.3.4) mocks locking "quality features behind a 'Invite 3 friends' gate." — [MWM mirror](https://mwm.ai/apps/beli/1478375386). A Facebook "fesshole" post title, seen only as a search snippet, says onboarding "made me invite 4 friends," so the reported count varies between 3 and 4. — [Facebook (snippet only)](https://www.facebook.com/fesshole/posts/downloaded-the-new-food-review-app-beli-but-it-made-me-invite-4-friends-before-u/1547114706653515/)
- [Confirmed] **Recommendations appear as a list on your profile.** Spoon Brown: "Recommendations may not appear on your profile if you haven't tried enough places or if you are in a city where there are not enough ranked restaurants yet." Today.com (2025-07-17): users "sort through recs based on price point and location."
- [Confirmed] **Curated guides and "Featured lists" sit on the home screen.** Pratt design critique (2026-09-09) describes "Featured lists" such as "Top 10 Brooklyn" and "Top 10 NYC Mexican" with a progress label ("You've been to 0 of 15"). — [IXD@Pratt 2026](https://ixd.prattsi.org/2026/09/a-design-critique-of-beli-restaurant-discovery-and-social-platform/). Spoon Emory: guides are built "based on the labels given on the ratings," are "city-specific," and include examples like "Top 10 Dinner with Parents NYC" and "Top 10 Healthy Eats NYC." Today.com: city guides draw on "the public's collective experiences."
- [Confirmed] **Beli's own copy promises personalization without explaining it.** App Store description (fetched 2026-09-24): "Get personalized recommendations you are sure to love." — [App Store](https://apps.apple.com/us/app/beli/id1478375386)
- [Single-source] **A reviewer calls the predictions accurate.** App Store review by aidan-O-93 (2022-03-28): "The accuracy of the relative ranking of preferences is evident in the spot-on scores I see for places I've already been to and had forgotten to rate." — [App Store](https://apps.apple.com/us/app/-/id1478375386)
- [Single-source, ~2025] **An analyst calls them "directionally helpful".** Startup Signals (Arthur Huang, cites Q2 2025 numbers) says the predicted score blends "crowd sourced reviews and your unique taste profile," and that predictions "aren't perfect, but they are directionally helpful." — [Startup Signals](https://startupsignals.substack.com/p/beli-your-food-diary-and-dining-advisor)

### Inferences
- [Inferred] **The Rec score is almost certainly on the same 0 to 10 scale as your own list.** Evidence: every source treats it as directly comparable with the Friend score and with your own scores, and the aidan-O-93 review compares predictions against places he later ranked. Would contradict: a screenshot showing a percentage or a star rating. I found no screenshot or source text stating the numeric range.
- [Inferred] **Beli does not explain why it recommends a place.** Evidence: no source, review, or critique quotes a "because you liked X" or "people with your taste" line, and the one explanatory phrase is Beli's generic marketing. Would contradict: any screenshot of an explanation string. This matters for Verso, because an unexplained score is exactly what reviewers complain about when it looks wrong (section 7).
- [Inferred] **Beli defaults to the personal prediction and holds back the crowd average.** The personal number is shown by default and the crowd number sits behind the referral wall. This is a product choice consistent with Frost's stated goal of avoiding "outsized impact from certain people" (section 4), and it doubles as a growth lever.

### Gaps
- No primary screenshot text for the Rec score UI, such as a label, a color band, or a confidence indicator.
- I could not confirm whether there is a dedicated "Recs" or "For you" tab in the 2026 app (v9.x). The Pratt 2026 critique does not list the tab structure.

---

## 2. Thresholds that gate personalization

### Takeaway
Three gates are documented, set at different times: 10 ranked places to see scores, 15 ranked places before personalized recommendations appear, and a per-city density gate that can suppress recommendations. A fourth gate, reported in August 2026, requires 30 ranked places with at least 10 in one city before you can share a custom guide. The community average is gated by referrals, not by activity.

### Cited Findings
- [Single-source, 2024] **10 ranked places unlock scores.** "complete 10 reviews to unlock the scores feature." — [IXD@Pratt 2024](https://ixd.prattsi.org/2024/09/design-critique-beli-app/)
- [Single-source, 2023] **15 ranked places before personalized recommendations.** "with enough data (at least 15 ranked restaurants), the app can then begin to suggest personalized recommendations." — [Long Beach Post, 2023-06-06](https://lbpost.com/esd/hi-lo/get-restaurant-recs-from-the-people-you-trust-most-with-beli/). *Correction to the prior file:* it attributed this number to NYU WSN via a search snippet. Fetched directly, the NYU WSN piece does not state a threshold. The verbatim source is Long Beach Post.
- [Single-source] **A per-city density gate can suppress recommendations.** "Recommendations may not appear on your profile if you haven't tried enough places or if you are in a city where there are not enough ranked restaurants yet." — [Spoon Brown](https://spoonuniversity.com/school/brown/beli-the-new-app-personalizing-restaurant-reviews-and-recommendations/)
- [Single-source, 2026-08-04] **Guide sharing needs 30 ranked places, at least 10 in one city.** Users can "share custom guides" after "ranking 30 restaurants and at least 10 in a city." — [Boston Globe](https://www.bostonglobe.com/2026/08/04/lifestyle/beli-restaurant-rating-app/)
- [Single-source, 2026-04-04] **Metadata is thin in small cities.** macatack1205: "price and cuisine info is early days bc of the smaller data size, so app is best paired with Google Maps if in a less popular city." — [MWM mirror](https://mwm.ai/apps/beli/1478375386)
- [Confirmed] **Referral gate for the average score.** See section 1 (Valley Magazine 2025; TRC1904; name12232 2026).

### Inferences
- [Inferred] **The 10 and 15 numbers are cold-start gates for two separate computations.** A personal 0 to 10 scale needs enough items to interpolate meaningfully. A similar-user search needs enough ranked items to find overlap with other users. Would contradict: evidence that the Rec score is purely content-based and could run from 1 rating.
- [Inferred] **The thresholds may have changed since 2023 and 2024.** They date from 2023 (15) and 2024 (10). I found no 2026 statement of either number.
- [Inferred] **The per-city gate points to neighborhood-style collaborative filtering.** It implies the candidate pool comes from ratings by other users in the same city, and that a minimum count of co-ranking users per candidate restaurant is required. A global embedding model would degrade gradually rather than switch off.

### Gaps
- No 2025 or 2026 confirmation of the 10 and 15 thresholds.
- The exact city-density threshold is unknown.
- Whether the 15 counts all ranked places or only those in the current city is unknown.

---

## 3. How the Match Score is computed or described, including negatives, overlap, and complaints

### Takeaway
Match is a percentage between you and any other user. It is shown on friend profiles and, color-coded, on the platform-wide leaderboard, and it can be negative. The -11% report is now verified verbatim from a March 2026 App Store review. Beli has never published the formula. The combination of negative values and a complaint that 10 similarly ranked shared places produced -11% fits a mean-centered correlation over co-ranked places. Such a metric rewards agreeing on the order and ignores agreeing that everything was good.

### Cited Findings
- [Confirmed] **Beli's own copy.** "Check out your 'Match Score' with your friends to see who really shares your tastes." — [App Store](https://apps.apple.com/us/app/beli/id1478375386)
- [Single-source, 2024-09] **Shown for everyone on the leaderboard, color-coded.** "The leaderboard section shows me all users on the platform, with a color coded % match," and "The match scores that were green marked, encouraged me to follow users with similar tastes." — [IXD@Pratt 2024](https://ixd.prattsi.org/2024/09/design-critique-beli-app/)
- [Single-source, ~2025] **Framed as a weight on friends' opinions.** "each friend has a 'taste similarity score' to you, helping you weigh their recommendations and discover like-minded diners." — [Startup Signals](https://startupsignals.substack.com/p/beli-your-food-diary-and-dining-advisor)
- [Single-source, 2024-01-23] **Used to predict whether you will like a friend's places.** "Based on that similarity or difference, they can predict if you'll like or dislike a food place that your friends have been to and rated." — [Zillennial Zine](https://thezillennialzine.com/2024/01/23/beli-app-review/)
- [Confirmed as a displayed value, single reviewer] **Negative matches exist, and they look wrong with small overlap.** App Store review "Gorgeous app, eh AI" by courtneyjchen (2026-03-30, v8.4.5, 3 stars as mirrored): "The profile match percentages are also extremely inaccurate: my friend has 10 restaurants ranked similarly to me but we have a -11% match." — [MWM mirror of App Store reviews](https://mwm.ai/apps/beli/1478375386). *This verifies the figure the prior file marked unverified.*
- [Single-source, 2023] **Founder framing is user-to-restaurant matching, not user-to-user.** Thelen: "Our main goal is to match the perfect pair (of user to restaurant)." — [Long Beach Post](https://lbpost.com/esd/hi-lo/get-restaurant-recs-from-the-people-you-trust-most-with-beli/)
- [Confirmed as data handling] **The privacy policy covers user-to-user suggestions and derived preference data.** Beli uses data for "identifying and suggesting connections with other users of the Service," and holds "Derived data ... based on your activities ... which could include your profile data, preferences, interests" (effective 2024-03-05). — [Beli App Privacy Policy](https://beliapp.com/app-privacy-policy)
- [Not Beli; context only] **A third-party "Beli Blend" tool.** It computes its own compatibility as "0.7 × restaurant_cosine + 0.3 × cuisine_cosine", with a Pearson correlation on mean-centered scores for shared restaurants and a cosine on cuisine vectors, falling back to whichever term has data. It maps to 0 to 100. The repo states "Beli has no public web app, no official API, and its Terms of Service prohibit scraping and reverse-engineering." This is a hobbyist's design, **not Beli's formula**. — [GitHub trishatjokro/beli-blend](https://github.com/trishatjokro/beli-blend)

### Inferences
- [Inferred] **The Match Score is a correlation-type similarity (range about -100% to +100%) over the two users' co-ranked restaurants, most likely Pearson or Spearman on positional scores.**
  - For: values go negative; the label is a percentage; the complaint centers on a small shared set; and Beli's scores are positional, so a rank correlation is natural.
  - Against, or unknown: no source states that only co-ranked items are used; there could also be shrinkage toward 0 for small overlaps, cuisine terms, or tier agreement.
- [Inferred] **Why "10 ranked similarly" can still come out near -10%.** Mean-centered correlation discards the level at which both users agree. Illustration only, not Beli's formula: A scores five shared places 9.5, 9.0, 8.5, 8.0, 7.5 and B scores them 8.0, 9.5, 7.5, 9.0, 8.5. Both "liked" all five, yet Pearson r = -0.10, displayed as "-10%". A user reads "we both loved these ten places" as high similarity, while the metric reads "we disagree on their order." This single mechanism explains the courtneyjchen complaint without assuming a bug.
- [Inferred] **Small overlaps are not shrunk toward zero.** With n = 10 the sampling noise of r is large (standard error about 0.33). A -11% on 10 items is statistically indistinguishable from 0 or +30%. Beli appears to show the raw value, or at least does not visibly damp it. Would contradict: evidence that match percentages cluster near 0 for new friends.
- [Inferred] **Match and Rec score likely share one similarity engine.** The Zillennial and Startup Signals descriptions of match as a weight on friends' opinions fit a user-user collaborative filter in which the Rec score is a similarity-weighted average of other users' scores. The Friend score, by contrast, is unweighted (Today.com).

### Gaps
- No Beli statement of the Match formula, the minimum overlap, whether match ignores tiers, or whether bookmarks count.
- Whether Match is symmetric, and whether it is computed per city or globally, is unknown.
- Reddit threads on "negative match" could not be accessed.

---

## 4. What Beli staff have said about the model, and what job postings and patents reveal

### Takeaway
No Beli founder or engineer has publicly described the recommendation algorithm: no engineering blog, conference talk, or patent was found. Founder quotes stay at the philosophy level: personal taste, similar-taste users "from all over", a friends-first order of trust, and "democratic" influence. 2026 job postings confirm an in-house team working on "personalization," "ranking," "recommendation systems," natural-language understanding and content summarization. The stack is Python/Django, Postgres and GCP. The company is tiny: 5 people in May 2025 and 10 full-time in August 2026.

### Cited Findings
- [Confirmed, founder] **Recommendations were the point of the list tool from the start.** "can we create a really good restaurant list keeping tool and, through that, provide a lot better recommendations?" — [Harvard Crimson, 2025-05-01](https://www.thecrimson.com/article/2025/5/1/beli-judith-eliot-frost/)
- [Confirmed, founder] **An order of trust: yours, then friends', then personalized.** "Let's bring together all the opinions that matter to you: yours, your friends' and then ultimately personalized recommendations." — [InsideHook, 2025-12-16](https://www.insidehook.com/food/does-dining-out-count-beli-app). Thelen (2023): "The number one trusted recommendations are from your friends" and "Taste is subjective ... Beli puts all the opinions that matter into one place." — [Long Beach Post](https://lbpost.com/esd/hi-lo/get-restaurant-recs-from-the-people-you-trust-most-with-beli/)
- [Confirmed, WSJ reporting 2025-05-10] **More ratings, better recs and better similar-user matches.** "The more restaurants users rate, the more accurately the app's algorithm can recommend others based on their preferences and connect them to users with similar taste." Thelen: "Taste is personal. If I don't like something, it doesn't mean you shouldn't like it." — [WSJ via To Vima](https://www.tovima.com/wsj/the-app-that-makes-rating-restaurants-fun-again-and-gets-better-the-more-you-use-it/)
- [Single-source, 2023] **Similar users are sought platform-wide.** "Beli looks for users from all over with similar taste for those recommendations—not just people nearby." — [Long Beach Post](https://lbpost.com/esd/hi-lo/get-restaurant-recs-from-the-people-you-trust-most-with-beli/)
- [Search-summary only] **No outsized influencers.** Frost says they "didn't want outsized impact from certain people" and like that Beli is "democratic." This appeared in the search summary for InsideHook; the fetched article paraphrases the same idea.
- [Confirmed, 2026-08-04] **Trust over reach.** "users only see ratings from people they know and follow in their feeds"; "Trust is the most important thing to us." Future plans: "integrate better explore tools and make it easier for users to plan their dining experiences." — [Boston Globe](https://www.bostonglobe.com/2026/08/04/lifestyle/beli-restaurant-rating-app/)
- [Confirmed, Beli job posting, Summer 2026, removed 2026-04-12] **AI/ML Engineer Intern.** Develop "natural language understanding, content summarization, personalization, or ranking" models, production-ready "for millions of users"; Master's or PhD preferred. — [Built In](https://builtin.com/job/ai-ml-engineer-intern-summer-2026/7634925)
- [Confirmed, Beli job posting, Summer 2026, removed 2026-04-12] **Data Science Intern.** Work on "one of the world's largest restaurant and dining datasets," with the CTO and CEO; A/B tests; Python, SQL, pandas, matplotlib, Tableau, Looker. — [Built In NYC](https://www.builtinnyc.com/job/data-science-intern-summer-2026/7634920)
- [Confirmed, Beli job posting, open 2026-09] **Senior Backend Infrastructure Engineer** ($200k to $260k). "Python / Django," "TypeScript / Angular," "Postgres," GCP ("Cloud Run, GKE, Cloud SQL, Pub/Sub, Cloud Tasks..."), Docker, GitHub Actions. Mentions "recommendation systems" and "a highly personalized consumer platform." Names no ML libraries, embeddings or vector databases. — [Beli on Breezy](https://beli.breezy.hr/p/893b5379a9f6-senior-backend-infrastructure-engineer); [open roles list](https://beli.breezy.hr/)
- [Confirmed, Beli job posting] **Senior Software Engineer.** Engineers "operate like full product teams," from Figma prototypes to A/B tests. — [Beli on Breezy](https://beli.breezy.hr/p/88951770ccfa-senior-software-engineer)
- [Confirmed, with a conflict] **Team size.** "team of five" (WSJ, 2025-05-10); "a team of eight other full-time employees" besides the two founders (Boston Globe, 2026-08-04). Built In's company profile says 41 employees, which conflicts with both press accounts and is probably stale or inflated.
- [Search-summary only] **Podcasts.** The InProd E7 (Judy and Eliot) chapter list includes "Recommendations Based on Data," and The Feed ep. 105 (2024-02-26) mentions "the power of its data to unlock personalized recommendations." No transcripts were reachable (Buzzsprout 404; Spotify page had no notes). — [InProd E7 (404)](https://www.buzzsprout.com/2150877/episodes/13004592-e7-a-new-age-of-restaurant-reviews-with-judy-and-eliot-frost-beli); [The Feed ep. 105](https://creators.spotify.com/pod/profile/thefeedglobal/episodes/105--Curating-top-restaurant-lists-with-Judy--Eliot-Frost-of-Beli-App-e2g29vk)
- [Confirmed negative result] **No patents found.** Google Patents and Justia searches for Beli, Beli Inc, Eliot Frost and Judith Thelen returned no filings; the hits were unrelated restaurant-ordering patents. — [Google Patents search](https://patents.google.com/?assignee=Beli&q=restaurant+ranking) (did not render); [web search restricted to patent sites](https://patents.justia.com/patents-by-us-classification/705/15)
- [Single-source, 2024-01-12] **Outside analyst: ordered lists make affinity easy to score.** "An ordered preference set makes it easy to score affinities and expertise across all categories and within specific categories." He also notes that "Beli relies on its social component to solve most of the clustering and segmentation issues." He proposes, rather than reports, a query hierarchy up to "What's the most liked Italian restaurant near me by people who are expert in Italian restaurants." — [Gary Angel, LinkedIn](https://www.linkedin.com/pulse/analytics-user-reviews-beli-does-almost-right-gary-angel-l2vvc)

### Inferences
- [Inferred] **The engine is most likely a batch-computed neighborhood collaborative filter (user-user, possibly blended with item-item and cuisine priors), running in Postgres/Python on GCP.**
  - For: "users from all over with similar taste" is user-user CF language. Spoon Emory's "from the ratings you have given similar restaurants" is item-item language. Startup Signals says "blend[s] crowd sourced reviews and your unique taste profile." A 5 to 10 person team with a Django/Postgres/Cloud Tasks stack suits nightly batch jobs. The per-city suppression gate fits too (section 2).
  - Against: a 2026 AI/ML intern posting for "personalization, or ranking" models means learned models are at least being prototyped. Any posting naming embeddings, two-tower retrieval or a vector store would shift this toward a latent-factor model. None was found.
- [Inferred] **Beli's 2026 AI work is aimed at review and menu text as much as at recommendations.** "Content summarization" and "natural language understanding" in the intern posting point to summarizing notes and reviews or to natural-language search. No shipped feature confirming this was found.

### Gaps
- No Beli engineering blog, talk, or LinkedIn post describing the model.
- The podcast audio (InProd E7, The Feed 105) could be transcribed to check the "Recommendations Based on Data" segment; that was not done here.
- The full text of the 2026 AI/ML intern posting was not retrievable; Peerlist returned 403.

---

## 5. How cuisine, price, location, tags, dietary settings and bookmarks feed recommendations

### Takeaway
Cuisine preference is described as a driver of recs. Price and location work as user-applied sort and filter controls, not as automatic reranking. Use-case tags narrow recs. Bookmarks are an intent signal. A 2026 review reports that a vegetarian dietary setting did not stop steakhouse and BBQ recs, so dietary settings are at best soft signals. I found no evidence of automatic distance reranking or of excluding places the user already knows.

### Cited Findings
- [Single-source, 2024-01-23] **Cuisine leaning.** "Beli will also give you personalized recommendations based on what types of cuisine you tend to like." — [Zillennial Zine](https://thezillennialzine.com/2024/01/23/beli-app-review/)
- [Single-source] **Similar-restaurant logic.** "Beli curates recommendations for you from the ratings you have given similar restaurants." — [Spoon Emory](https://spoonuniversity.com/school/emory/rate-save-and-recommend-restaurants-on-app-beli/)
- [Confirmed] **Price and location are sort and filter controls.** "sort through recs based on price point and location" — [Today, 2025-07-17](https://www.today.com/food/trends/what-is-beli-app-rcna217748). App Store review KFish1829 (2023-01-28): "the ability to filter by price, location, cuisine, etc." — [App Store](https://apps.apple.com/us/app/-/id1478375386)
- [Single-source, 2022-03-28] **Use-case tags narrow recs.** "The option to tag certain places for certain use cases (nice dinner out versus late night eats) fine-tunes the recommendations based on what you want at the time." — aidan-O-93, [App Store](https://apps.apple.com/us/app/-/id1478375386)
- [Single-source, 2026-03-30] **The dietary setting does not act as a hard filter, and known places recur.** "Despite hundreds of entries and dietary restrictions set to vegetarian, my top recommendations are still steakhouses, BBQ places, and chains I've already been to. This feels easily solvable with filtering." — courtneyjchen, [MWM mirror](https://mwm.ai/apps/beli/1478375386)
- [Confirmed] **Bookmarks.** Bookmarking to Want to Try feeds the platform ("building even more platform intelligence," HBS case) and appears on friend profiles as "Places you both want to try" (Pratt 2024). — see the prior file, section 4; [IXD@Pratt 2024](https://ixd.prattsi.org/2024/09/design-critique-beli-app/)
- [Confirmed] **Location data.** The privacy policy covers "Precise geolocation data when you authorize the Service to access your device's location" and "Location-based advertising." — [Privacy Policy, eff. 2024-03-05](https://beliapp.com/app-privacy-policy)
- [Single-source, 2026] **No "similar restaurants" feature.** App Store review Atibas28 (Aug 21, year not shown): "One feature I wish it had was the option to search for restaurants that are alike ... five 'similar' restaurants based either on meta-data or combination of meta-data and others likes who liked things like me." — [App Store reviews](https://apps.apple.com/us/app/beli/id1478375386?see-all=reviews&platform=iphone)

### Inferences
- [Inferred] **Cuisine is a soft prior, not a filter.** Evidence: Zillennial says recs lean toward liked cuisines, yet a vegetarian got steakhouses in 2026. Would contradict: a filter UI that hides restaurant types.
- [Inferred] **Recs are city- or map-scoped rather than reranked by distance.** Evidence: the per-city gate, the city-specific guides, and "sort by location" as a user action. Would contradict: a "near you" rec rail.
- [Inferred] **Recs may not exclude places you visited but never ranked.** courtneyjchen's "chains I've already been to" suggests the exclusion set is only the Been list. The Atibas28 request suggests there is no item-to-item "more like this" surface.

### Gaps
- Whether bookmarks change the Rec score itself, or only list membership, is undocumented.
- Whether price is used as a similarity feature, as opposed to a filter, is unknown.
- When the dietary-restriction setting shipped, and what it does, is undocumented beyond the one review.

---

## 6. What Beli added in 2025 and 2026 (taste profile, group features, AI, lists)

### Takeaway
The documented 2025 and 2026 additions are recap and identity features ("Beli Plated 2025" with a "Food Squad"), reservation and ordering partnerships, Featured lists, and a jump from app version 8.x (spring 2026) to 9.x (September 2026) whose release notes say only "UX improvements." **I found no evidence that Beli has shipped a group recommendation, a "plan dinner with friends" flow, a "Beli Match" feature, or a "Supper Club".** The founders named easier dining planning as future work in August 2026. Search engines attribute "AI group dining with swipe matching" to Beli, but that comes from a job-seeker's portfolio clone.

### Cited Findings
- [Confirmed] **Current version.** App Store version 9.17.0, about 2026-09-18, "What's New": "UX improvements"; 4.8/5 from 17K ratings; Editors' Choice. — [App Store](https://apps.apple.com/us/app/beli/id1478375386). Reviews from Feb to Apr 2026 were on v8.3.4 to v8.4.5 — [MWM mirror](https://mwm.ai/apps/beli/1478375386). Search snippets show Google Play updates on 2026-07-30, 2026-09-18 and 2026-09-22; the Play page could not be read.
- [Confirmed] **Beli Plated 2025 (year-end recap, late Nov or early Dec 2025).** It includes top five restaurants, top five moments (for example "when you rated a meal a 10.0 or ranked your 50th spot"), cuisine rankings, a count of new places, "how many minutes you spent dining out this year," a personality section, and a "Food Squad" of the friends you ate with most, shown as "nine seats." — [Spoon University](https://spoonuniversity.com/news/what-your-2025-beli-plated-says-about-you/)
- [Single-source, 2024-07-01] **Midyear Snack (mid-year recap).** It shows "favorite meals, dishes, and the cities I've explored." — [Culture Curve](https://culturecurve.substack.com/p/midyear-snack-how-belis-new-feature)
- [Confirmed] **Taste Profile contents.** It breaks rankings down "by cuisine, city, or country" (Spoon Brown) and summarizes countries, cities, cuisines and total count (Spoon Emory). Friend profiles have "a playlist tab that reveals their preferences in a highly categorized manner" (Pratt 2024). I found no 2025 or 2026 Taste Profile redesign.
- [Confirmed] **Featured lists and guides.** See section 1 (Pratt 2026-09-09; Spoon Emory). The Boston Globe (2026-08) says users can now share their own custom guides once past the 30-and-10 threshold.
- [Confirmed, 2025 to 2026] **Partnerships.** Beli "recently partnered with OpenTable, SevenRooms (reservations), and Grubhub (ordering)" — [People via Yahoo (2026, cites 120M ratings)](https://www.yahoo.com/lifestyle/articles/fell-love-trying-restaurants-now-203433368.html). Wikipedia lists TikTok, Instagram and OpenTable integrations. Bookmarking from Instagram and TikTok posts is noted as a "Recent feature" — [Food Network, 2025-08-04](https://www.foodnetwork.com/fn-dish/news/beli-app-trend). Reservation priority is an invite reward (Valley Magazine 2025).
- [Confirmed] **Planning is stated as future work.** Founders plan to "integrate better explore tools and make it easier for users to plan their dining experiences." — [Boston Globe, 2026-08-04](https://www.bostonglobe.com/2026/08/04/lifestyle/beli-restaurant-rating-app/)
- [Proposal, not a feature] **"Plans with friends".** Startup Signals suggests Beli could "invite friend to explore a mutually bookmarked restaurant." — [Startup Signals](https://startupsignals.substack.com/p/beli-your-food-diary-and-dining-advisor)
- [Not Beli, misattributed in search] **The group-dining clone.** The "AI-powered group dining recommendations with swipe interface" and "Base Hunger Points = Party Size × 10 × Hunger Multiplier" features belong to github.com/tor-iv/beli-app. That repo is a portfolio project by Victor Cox IV ("built to showcase my passion for food tech and demonstrate my ability to contribute from day one"), weighting cuisine, price, rating, distance, dietary needs and party size. — [GitHub tor-iv/beli-app](https://github.com/tor-iv/beli-app)
- [Confirmed] **Existing multi-person signals.** "Places you both want to try" on friend profiles (Pratt 2024); tagging dining companions (Taste Cooking; NYU WSN); "Food Squad" (Plated 2025).
- [Single-source, 2026-02-26] **Feature bloat.** A review complains of "featuritis. There are way too many features! PMs need to chill out! ... Work on the recs algorithm or something." — name12232, [MWM mirror](https://mwm.ai/apps/beli/1478375386)
- [Single-source, 2026-03-30] **"AI" is a user's label.** The courtneyjchen review is titled "Gorgeous app, eh AI" and calls the recommendations "AI-powered features." It is not clear whether Beli itself markets anything as AI.

### Inferences
- [Inferred] **Beli's multi-person layer is companion history, not group recommendation.** Its pieces are shared bookmarks, companion tags, and Food Squad. The raw material for a group recommendation exists: the intersection of two users' Want to Try lists plus each member's Rec score. But no source shows Beli combining scores across people. The Boston Globe "plan their dining experiences" line suggests it is on the roadmap.
- [Inferred] **Something substantive probably shipped in the 8.x-to-9.x jump (April to September 2026).** App Store notes are boilerplate, so the content is unknown. A check of Beli's Instagram or TikTok, or an in-app look, would settle it.

### Gaps
- Beli's Instagram, TikTok and LinkedIn posts were not reachable, so feature announcements may be missing.
- The Google Play "What's new" text was not readable.
- No evidence either way on "Beli Match" or "Supper Club" as product names.
- The Nikki Lee Medium post "Beli Menu Search Feature" was not fetched; from the title it may be a proposal, not a shipped feature.

---

## 7. What reviews and critics say works and does not work about recs and match

### Takeaway
Praise centers on ranking-derived accuracy and on discovering "hidden gems" through similar-taste users. Complaints center on four things: match percentages that look wrong with close friends; recs that ignore stated constraints (vegetarian) and resurface known chains; the prediction being forced on users instead of an average; and a herd or hype effect in the aggregate "top" lists. The complaint tone is sharper in 2026 than in 2022 to 2024.

### Cited Findings
- [Single-source] **What works.**
  - "Find new restaurants to try based on people who have similar tastes. Kind of like if Yelp or TripAdvisor only gave you recs based on people with tastes similar to yours." (Aallliiee)
  - "The best part is that it gives you recommended places to try based on your ratings!" (Shelby.francioli)
  - "I've already found most of my favorite recent discoveries via this app." (Alexander Tas)
  - All undated on the page. — [JustUseApp review mirror](https://justuseapp.com/en/app/1478375386/beli/reviews)
- [Single-source, 2022] **Discovery away from habit.** "Beli curates a path away from the over-used local haunts and into the hidden gems you always walk by." — aidan-O-93, [App Store](https://apps.apple.com/us/app/-/id1478375386)
- [Single-source, 2026-03-30] **Wrong match and constraint-blind recs.** See sections 3 and 5 (courtneyjchen). The same review: "Most of my friends have the app, but few actually use it," which starves the friend-based signals.
- [Single-source, 2026-04-04] **Wants the average, not the prediction.** See section 1 (macatack1205). The same reviewer praises that the rating system avoids "a flood of 4.5+ like on google."
- [Confirmed] **Herd and hype effect in aggregate lists.** Taste Cooking (undated, cites 60M reviews, so about mid-2025): "Beli contributes to unmerited buzz and makes hyped reservations even more impossible to snag." The top of Beli's city-wide list is described as "generic, unoriginal restaurants with questionable hype" (a search snippet names 4 Charles Prime Rib and Don Angie). — [Taste Cooking](https://tastecooking.com/beli-invites-the-loneliest-generation-to-dine-out/). Wikipedia: criticism for "focusing on elite restaurants and generating 'unmerited buzz'." — [Wikipedia](https://en.wikipedia.org/wiki/Beli_(app))
- [Single-source, ~2025] **Predictions are "directionally helpful" but "aren't perfect."** — [Startup Signals](https://startupsignals.substack.com/p/beli-your-food-diary-and-dining-advisor)
- [Confirmed] **The referral wall on the average score is resented** (TRC1904; name12232). See section 1.
- [Single-source, 2026] **Users want item-to-item "similar restaurants."** (Atibas28). See section 5.

### Inferences
- [Inferred] **The hype complaint targets aggregate and editorial surfaces, not the personal Rec score.** Those surfaces are city leaderboards, "Top 10" guides and Featured lists. A similarity-weighted collaborative filter over positional scores should resist popularity bias better than raw counts. But if the neighbor pool is dominated by heavy users who chase the same hyped places, popular items still win. Evidence for the split: all hype critiques cite "top" lists, and none cites an individual Rec score.
- [Inferred] **"Wrong match with close friends" has two likely causes.** (a) Correlation ignores level agreement, as shown in section 3. (b) Close friends often visit the same places together and then rank them independently, which produces many co-ranked items with noisy within-tier order.

### Gaps
- No access to Reddit (r/beli, r/FoodNYC) or to Google Play reviews, where more complaints about match and recs likely live.
- No developer responses to reviews were visible.

---

## 8. Beli's scale as of 2026, which bounds what a collaborative filter can do

### Takeaway
By August 2026 Beli had about 120 million ratings across about 2 million establishments in 50,000+ cities, run by a 10-person full-time team. User counts and DAU are not disclosed. Rating volume roughly doubled from May 2025 (58M) to August 2026 (120M). The long tail is huge: an average of about 60 ratings per establishment, heavily skewed toward a few major cities.

### Cited Findings (chronological)
- [Single-source] **2022 to Q2 2025.** 2.5M ratings (2022), 6M (Q2 2023), 58M (Q2 2025); about 5-person team; 80% of users under 35; about 10% international. — [Startup Signals](https://startupsignals.substack.com/p/beli-your-food-diary-and-dining-advisor)
- [Confirmed] **May 2025.** "over 58 million ratings"; "80%" of growth from "referrals, word-of-mouth"; "a team of five." — [WSJ via To Vima, 2025-05-10](https://www.tovima.com/wsj/the-app-that-makes-rating-restaurants-fun-again-and-gets-better-the-more-you-use-it/). "30 million rankings in the past year." — [Harvard Crimson, 2025-05-01](https://www.thecrimson.com/article/2025/5/1/beli-judith-eliot-frost/)
- [Single-source] **About mid-2025.** "over 60 million global reviews"; "10% of its user base is international." — [Taste Cooking](https://tastecooking.com/beli-invites-the-loneliest-generation-to-dine-out/)
- [Confirmed] **September 2025.** "75 million total global reviews across 30,000 cities." — [Wikipedia](https://en.wikipedia.org/wiki/Beli_(app)); [InsideHook, 2025-12-16](https://www.insidehook.com/food/does-dining-out-count-beli-app)
- [Single-source] **November 2025.** "80 million restaurant ratings worldwide." — [Abridged/PBS KVIE, 2025-11-26](https://www.abridged.org/news/beli-app-sacramento/)
- [Confirmed] **August 2026.** "120 million restaurant ratings worldwide across 2 million establishments in over 50,000 cities"; founders plus "eight other full-time employees." — [Boston Globe, 2026-08-04](https://www.bostonglobe.com/2026/08/04/lifestyle/beli-restaurant-rating-app/); 120M and 50,000+ cities also in [People via Yahoo](https://www.yahoo.com/lifestyle/articles/fell-love-trying-restaurants-now-203433368.html)
- [Confirmed] **Funding.** $5.3M Series A from Goodwater (Nov 2023); $12M total by June 2025, including FirstMark. — [Wikipedia](https://en.wikipedia.org/wiki/Beli_(app))
- [Confirmed] **Users.** Founders "declined to share daily active user data" (Wikipedia). The 2026 AI/ML posting says "millions of users" ([Built In](https://builtin.com/job/ai-ml-engineer-intern-summer-2026/7634925)). The App Store shows 17K ratings.
- [Conflict] **Founding year.** People/Yahoo says the company was founded in 2019; most sources say it launched in 2021.

### Inferences
- [Inferred] **Beli is dense in a few cities and sparse everywhere else.** 120M ratings over 2M places is about 60 per place on average, but NYC and other big cities dominate. That makes neighborhood collaborative filtering work well there, and explains the per-city suppression gate and the "less popular city" complaint (macatack1205). A team of 10 running a neighborhood filter in Postgres at this scale is plausible if similarities are precomputed in batch.
- [Inferred] **For Verso the numbers point the other way.** Game, movie, TV and book catalogs are global rather than city-scoped. So a much smaller user base can reach Beli-like overlap per item. The long tail of obscure titles is the analogue of Beli's small cities.

### Gaps
- Registered users, MAU and DAU: not disclosed.
- Per-city distribution of ratings: not disclosed.

---

## 9. What a multi-medium ranking app (games, movies, TV, books) can borrow

### Takeaway
Borrow the two-number display (personal prediction plus friends' average), the cold-start gates, platform-wide similar-taste neighbors, and match as a displayed percentage. Fix the three places where Beli is visibly weak: unexplained predictions, a match metric that misreads shared enthusiasm and noisy small overlaps, and preference constraints (dietary, in Beli's case) that do not act as hard filters. Group recommendation is open ground, because Beli has not shipped one.

### Cited Findings
- These are all drawn from sections 1 to 8 above; no new sources.

### Inferences
- [Inferred] **Show two numbers on unranked items, as Beli does.** A predicted score on the user's own 0 to 10 scale, plus the friends' average (Today; NYU WSN). Let users toggle to a community average and do not gate it behind referrals; that gate is Beli's most resented choice (TRC1904, name12232, macatack1205).
- [Inferred] **Gate by data volume, per medium.** Beli uses 10 ranked items to show scores and 15 before recommendations, plus a density gate for sparse pools (Pratt 2024; Long Beach Post 2023; Spoon Brown). For Verso the "city" analogue is the medium, so run a gate per medium: 15 ranked games unlock game recs, and ranked movies do not count toward it.
- [Inferred] **Make Match robust where Beli's is not.**
  - Compute it over co-ranked items only.
  - Shrink toward 0 by overlap, for example r × n/(n+k), and hide it below a minimum overlap.
  - Blend in level agreement (tier agreement or mean absolute score difference) so two people who both loved the same ten games do not read -11%.
  - Show the overlap count next to the percentage.
  - Beli's -11% complaint (2026-03-30) is exactly the failure this prevents.
- [Inferred] **Explain every prediction.** Show the top two or three contributing neighbors or items ("people who ranked Hades and Celeste like you did loved this"). Beli offers no explanation, and its unexplained misses read as "extremely inaccurate."
- [Inferred] **Treat explicit constraints as hard filters, not soft priors.** The equivalents are platform owned, "no horror," or age rating. Exclude items already logged anywhere, including items the user owns or has played but not ranked.
- [Inferred] **Watch popularity bias on aggregate surfaces.** Beli's hype critiques hit its top lists. Use Bayesian-shrunk averages (as Flickchart does; see the prior file) and a diversity term on editorial lists.
- [Inferred] **Group recommendation is unclaimed.** The Beli primitives are "places you both want to try" and companion tags. A natural Verso extension is the intersection of members' backlogs, ranked by a least-misery or average of members' predicted scores ("movie night" or "co-op game night"). Label it as new, since there is no Beli precedent to copy.
- [Inferred] **Start with neighborhood collaborative filtering.** Beli appears to run a batch neighborhood CF on positional scores with a tiny team. Positional 0 to 10 scores already normalize for generous and harsh raters, so a user-user or item-item CF over them is a sound V1. Latent-factor or embedding models can wait until overlap is dense.

### Gaps
- Whether Beli weights the Rec score by Match, or shrinks it toward the crowd mean for sparse users, is unknown, so there is no confirmed formula to copy.
