# Onboarding brief: the questionnaire, the deck, and the first pick

Written 2026-10-01 for decision 25 (the questionnaire before the deck) and decision 24 (the beta's first pick), after Rafa asked what onboarding questionnaires ask in the industry and for a proposed set of questions. It sits on the bulk-entry deck of decision 20, drawn 2026-09-28 ([figma-kit/bulk-entry-round.md](../private/design/figma-kit/bulk-entry-round.md)), the movies brief ([movies-brief.md](movies-brief.md)), the engine's content profile ([recommendation-engine.md](recommendation-engine.md#layer-1-the-content-profile)), and eleven research notes written 2026-10-01 in [../research/onboarding-notes/](../research/onboarding-notes/): an evidence review of preference elicitation ([preference_elicitation.md](../research/onboarding-notes/preference-elicitation.md)), two inventories of what apps ask at sign-up ([video and music](../research/onboarding-notes/media-app-onboarding-video-music.md), [books and games](../research/onboarding-notes/media-app-onboarding-books-games.md)), and eight per-app cluster notes, one with live walkthroughs of Duolingo, Headspace, Stitch Fix, and TasteRay, and one on the games apps and platform holders. Nothing here is decided; the questions at the end wait for Rafa, and the new frames go through Figma before any code.

## Third pass, 2026-10-06: what Rafa's reaction changed

Rafa gave his letters on the bulk-entry round by voice on 2026-10-06; the decode, the flow as it now stands, the arithmetic of the comparison session, and ten questions are in [../feature-ideas.md](../feature-ideas.md#1-bulk-entry), third pass. What it changes in this brief:

- Section 2, "Where": the platform question is families first (five tiles), generations only for the families tapped, plain names, and backward compatibility assumed rather than shown or unticked. The drawn Platforms A and B both retire.
- Section 3, "Three you love": unchanged, confirmed.
- Section 4, "The deck": Deck B, a page of about ten rows, with the four tier chips on each row so one tap says played and how it was; no third answer, so the deck fills no backlog; the Steam card leaves the front of the deck and becomes a "Link Steam" screen at the end of the flow for PC players only; "Ten reached" becomes a line on the review. The tier sheet and the per-game compare step inside the deck give way to one comparison session after the page, asked in value order with a soft target of about one question per game and the ✕ on every question; what is left unresolved is placed by the community prior and marked provisional for the review to fix ([ranking-algorithm.md](ranking-algorithm.md#the-batch-session-2026-10-06)).
- Everywhere: ownership leaves the product (decision 26), so no screen in this flow mentions having a game.
- The movies deck (section 4's variant) is designed in the movies session under the same page shape, with rule 35 deciding what a tap on a film does.

The frames to draw become one round of about ten: the platforms screen, the deck page, the session question, the review with provisional rows, Link Steam, and the five onboarding frames listed below. **Drawn 2026-10-06** for the games side and the media picker (six frames, node ids in [figma-kit/bulk-entry-round-2.md](../private/design/figma-kit/bulk-entry-round-2.md#drawn-2026-10-06-node-ids-and-judgment-calls)); the four movies frames (Services, Seed films, the film page, the Letterboxd card) are drawn with the movies session's round. **Approved 2026-10-07** as drawn, with the deck row's tier dots replaced by a four-stop slider (two variants drawn; A or B is Rafa's last letter). The four movies frames were **drawn 2026-10-08** as a row at y 6880 on the same page (Services 243:66, Seed films 244:46, Film page 245:221, Letterboxd 246:18), with nine judgment calls listed in [figma-kit/movies-onboarding-round.md](../private/design/figma-kit/movies-onboarding-round.md#judgment-calls-positions-the-decided-text-leaves-open); proposals, awaiting Rafa's letters.

## The proposal in one paragraph

Ask one routing question (which media), one structural question per medium (where you play, where you watch), and then let the user answer everything else with titles: three they love, then a deck of popular titles answered one tap at a time, with a tier and a comparison or two for each one played. No genre checklist, no mood survey, no "why are you here", no time or companion question, no demographics, no notifications or contacts prompt, no username. Imports are offered as the first card of the deck where a user is likely arriving from somewhere (Steam for PC players, Letterboxd for film people) and skipped with one tap. The flow ends, in the December beta, with the permission step and the first pick with its reason, which is the whole point of the session. The evidence says this is the shape that works: revealed choices on concrete items beat stated categories, a handful of well-chosen items carries most of the achievable cold-start accuracy, comparing two things is cheaper and at least as informative as rating one, context is best derived where it is used, and the first session decides retention.

## What the industry asks

The thirty or so products inventoried fall into three onboarding jobs, and Verso has to do two of them.

**Recommendation-first apps ask one taste screen and defer everything else.** Netflix's new-profile picker asks for "a few titles" (three in every teardown), is explicitly optional, and skippers get "a diverse and popular set" ([Netflix Help Center](https://help.netflix.com/en/node/100639), fetched 2026-10-01). Spotify asks for at least three artists on iOS and asks nothing on its web sign-up. TikTok's interest picker is skippable and the feed plays in one or two taps. Pinterest asks for five topics as a hard gate. Apple Music runs genre bubbles then artist bubbles with a like, love, or remove gesture. YouTube Music asks for about five artists and says "The more you listen, the more fine-tuned your recommendations will be" ([YouTube Blog, 2024-07-12](https://blog.youtube/news-and-events/get-started-youtube-music/)). None asks for both favorites and a genre survey; it is one or the other, kept short.

**Availability-first apps ask where, not what.** JustWatch and Reelgood ask for country and the streaming services you pay for, and nothing about taste; genre is a filter inside browsing. Reelgood added a profile step to onboarding in August 2024 "for a personalized start" and no taste step.

**Logging and ranking apps ask nothing and gate the payoff behind self-paced ratings.** Letterboxd asks nothing and has no recommender by design ("one big, organic recommendation engine", [its FAQ](https://letterboxd.com/about/faq/)). Criticker starts matching at ten ratings. MovieLens required fifteen until 2014, measured that this caused "dropout before users reached the homepage", and replaced it with preferences over groups of films, which took less than half the time ([GroupLens, 2015-03-11](https://grouplens.org/blog/onboarding-new-users-in-recommender-systems/)). Trakt and Simkl ask nothing and surface imports. The game trackers (Backloggd, GG, SavePoint) ask no taste question at sign-up, each a bare credentials form into an empty library; SavePoint asks for time, mood, and platform only when picking tonight's game, and sells its Steam, Xbox, and PSN sync as a paid, later feature; Steam's recommender has no onboarding, reads playtime, and returns nothing for a near-empty account ([games cluster note](../research/onboarding-notes/cluster-games-apps.md)). So there is no games-app precedent for three favorites and ten cards; Verso's flow is more onboarding-forward than any comparable, which is defensible because its ranking needs comparisons where those apps fall back on community or behavioral signals. Beli is the one app whose onboarding gate is social: four friend invites before Continue, reported as non-skippable, with forty-two App Store review mentions of forced invites and users who installed and deleted it three times over the years ([cluster note](../research/onboarding-notes/cluster-letterboxd-criticker-tasteio-movielens-beli.md)).

**Two patterns from outside media are tempting and the evidence on them is narrow.** Duolingo asks why you are learning, your level, and a daily time goal before any account exists; its published tests show a commitment mechanic (a streak wager) lifting day-7 retention by 14% and goal and streak separation lifting day-14 retention by 3.3% (Duolingo blog, 2017-05-10, via the [books and games inventory](../research/onboarding-notes/media-app-onboarding-books-games.md)). Headspace's goals quiz roughly doubled trial-to-course-start conversion in an April 2026 test and changed actual meditation days not at all, which is the caution: a completion win is not a behavior win. StoryGraph replaces a ratings gate with a long stated-preference survey (genres, moods, pace, reference reads, turn-offs, content warnings), and the one recent review that faults it faults the lack of an adaptive layer, not the survey. The newest entrants (Achriom, TasteRay) abandon the rating gate for an import or a free-text box.

**TasteRay is the nearest structural analog to Verso's flow, and its lesson is about length.** Walked live on 2026-10-01 ([cluster note](../research/onboarding-notes/cluster-duolingo-headspace-stitchfix-tasteray.md)): a goal multi-select, then "Pick 3 titles you love" from a grid of popular posters or a search, an AI-written taste summary, a skippable list of content exclusions, a required free-text "What's on your mind lately?", then a one-title-per-screen rating loop with seven sentiment buttons that was still labeled "Step 5 of 6" after nine titles, against the site's own promise that "a few is enough". The three-titles step and the one-card loop are Verso's seeds and deck; the lesson is that a deck must feel short, not be advertised as short: a visible count toward ten, the one "ten reached" card, and a way out on every card, all of which the drawn round already has. Headspace's goal screen, walked the same day, shows Skip and Continue side by side; Duolingo asks "How did you hear about us?" as a screen, which Verso does not need because each beta channel gets its own TestFlight link.

**What the research adds** ([preference_elicitation.md](../research/onboarding-notes/preference-elicitation.md), ten rules with their evidence): ask about things the user has probably encountered that still split opinion (Rashid and colleagues, IUI 2002: popularity times entropy gave the best accuracy per unit of effort, pure entropy was "shockingly poor", and a random eight ratings matched fifty-seven ratings chosen by chasing similarity); concrete instances beat categories and demographics (the same paper; Netflix's 2017 move from stars to thumbs after people rated documentaries five stars and watched comedies); comparisons beat ratings on effort and fit (Loepp, Hussein, Ziegler, CHI 2014; Sepliarskaia and colleagues, RecSys 2018, up to three times fewer questions); context helps only on dense logged segments, by 13 to 21 percent, not from a one-time stated answer (Adomavicius and colleagues, ACM TOIS 2005); household structure is inferred per session, never asked (the shared-account literature and Netflix's per-profile design); demographics add little to media taste (Pazzani 1999 through 2024); a motivational "why are you here" question has no study behind it for a media recommender; and every 2025 to 2026 benchmark agrees the first session predicts retention months out (Amplitude: a fourfold gap in day-1 activation between the top decile and the median; RevenueCat: 80 to 89 percent of trial starts on day 0; UXCam: a 38 percent drop from the first onboarding step to the second).

What this confirms about the existing design: the deck is Verso's taste screen, and it is the stronger kind. The platform question is the games analog of the services question every availability tool asks. The ten-ranked goal sits inside the 3 to 15 band every product uses. What it changes: the deck's movies variant needs drawing, the movies branch needs its services question, and three questions Claude had been weighing (goal, time available, who you watch with) are dropped from onboarding and left to the surfaces that use them.

## The flow, screen by screen

Account creation stays as built (email, Google, Apple before the store). The flow below opens the moment an account exists (decision 20) and is reachable again later from Ranking's doors and the switcher.

### 1. "What do you want to keep track of?"

The one routing question (decision 25). Four tiles: Games and Movies live; TV and Books drawn dimmed with "Coming", tappable to register interest ("Tell me when"), which writes an event and tells Rafa the demand for each held medium at no cost. Nothing preselected; at least one required; both allowed. One line under the tiles: "You can add more later." Feeds: the chosen media on the profile, the switcher (only chosen media, "Add a medium" where the others were), the order of what follows.

Why it is the only stated question: it routes rather than profiles, which is the one kind of question with evidence behind it; the equivalent of Netflix's Kids toggle or Likewise's "which content types". No app in the inventory asks a motivational goal, and the research has no study of one for media, so there is no "why are you here" screen.

### 2. Where (per chosen medium)

**Games: "Where do you play?"**, now or before, the Platforms frame as drawn (A, families with the compatibility chips, is Claude's lean; Rafa picks A or B). Skippable: "Skip for now" leaves the deck on popular games across every platform, the Netflix and TikTok fallback. Feeds: the profile's platforms, the deck's candidates, the played-on prefill, the ranking filter, the finder's platform filter.

**Movies: "Where do you watch?"**, a new frame, the analog of Platforms: a grid of streaming-service logos to tap (Netflix, Max, Disney+, Prime Video, Hulu, Apple TV+, Paramount+, Peacock, Criterion, and the region's others from TMDB's provider list), a "Theaters" chip on by default, and a one-line region confirmation read from the device locale ("United States · Change"). Skippable: the finder's "On my services" chip becomes a prompt to pick them in Settings (rule 14, already in the movies brief). Feeds: the settings row (region, provider ids) that the finder, the calendar, and availability already depend on; the movies brief made it a V0 prerequisite, and this is where it is collected.

These are structural facts, not taste, and every availability tool asks them first; they also make the deck's "Popular on Switch" and the finder's "On your services" true from the first card.

### 3. "Three you love" (per medium)

**Games: "Three games you love"**, the Seed games frame as drawn: search, two result rows, three slots, "Rank these" live with two. They enter the ranking in Loved and tune the deck's order through their genres and developers. **Movies: "Three films you love"**, the same frame with posters at 2:3. They enter Loved too: the user has said love, so ranking is chosen, not implied (rule 35 holds; inferred, flagged as question 3).

Why favorites and not genres: it is the most answerable question in the flow and the one every recommendation-first app asks in some form (Netflix's three titles, Spotify's three artists, Letterboxd's Four Favorites); it gives the engine its first content-profile features and the deck its personal ordering (Rashid's recommendation: popularity first, item-item personalization as soon as one rating exists); and a genre checklist would be the survey twice, as the bulk-entry decode already said. Two seeds suffice to continue; three is the ask.

### 4. The deck (per medium)

As drawn for games (Deck A, the card stack, is Claude's lean): one card at a time, cover, title, year, platforms, the popularity figure with its source; three answers. Progress toward ten ranked, the "ten reached" card once, the ✕ as "Done for now" on every card. The Steam card first for anyone who picked PC, as drawn. One counterpoint from the research: every games app studied treats a library link as a later, progressive feature, never a sign-up offer. The card stays, because for a PC player it replaces dozens of deck cards with one tap, it is skipped with one tap, and Rafa's default of 2026-09-28 (feature-ideas question 12) stands; the import screens that follow it are owed either way.

**Movies**, the variant decision 25 implies and nobody has drawn: the same card with a 2:3 poster, "2014 · 2 h 49 · Netflix", and the answers **Seen it**, **Want to watch**, **Skip**. Seen it opens the tier sheet with a fourth line, "Just log it", because watched is not ranked unless the user chooses (rule 35); the tier tap writes the diary row and the ranking, "Just log it" writes the diary row alone. Want to watch adds to the watchlist pool (rule 34). A film logged from the deck has no watch date; its diary row reads "Seen before Verso" until the user edits it (inferred, flagged as question 4). The Letterboxd card first, the analog of the Steam card: "Have a Letterboxd? Import your diary and skip the deck", with "Not now" (question 5).

**What the deck shows, and in what order.** Popular on the user's platforms or services first (sales figures where printed, IGDB and TMDB signals otherwise, per decision 20), boosted by the seeds' genres, developers, and directors, editions and series collapsed. The research adds one refinement for later: the best items to ask about are popular and divisive (Rashid's popularity times entropy), so once the community prior holds a spread per item, the deck's order should favor titles people disagree about over titles everyone rates the same. Popularity alone at first (question 9).

**Why the deck is the taste screen, and why it is not a quiz.** Every answer is a revealed choice on a concrete title. "Played it" plus a tier plus one or two comparisons is the elicitation the literature favors over any rating, and the five and ten thresholds the engine uses are inside the band every product uses. The ten-reached card is the one visible gate; the content profile switching on at five is not shown, because MovieLens's lesson is that visible gates cause dropout and restructuring them away cut time in half. Beli's gates (four invites, ten reviews, thirty ratings) are the counterexample to keep in view.

### 5. Permission, then the first pick (December, with the finder)

**Permission**, before the first pick: "Verso sends your list to an AI model to write the reason behind each pick. Nothing else leaves, and you can turn this off in Settings." **Allow** and **Not now**. Not now does not block: the finder still shows three picks, with plain reasons the engine writes from its own data ("Loved by people who ranked Hades at the top"), and the model's reasons appear if permission is given later. Apple's guideline 5.1.2(i) requires the disclosure and the explicit consent (decision 24); the consent is stored on the profile and enforced in the suggest function, which refuses to call the model without it.

**"Tonight"**: the finder's first answer from the user's ten, with the reason in their own terms, and the time and platform chips available to change the question. For a user who stopped before five ranked, the pick comes from the community prior for their platforms or services and says so ("Popular with people who play on Switch"), never an empty state: Steam's recommender shows what the alternative looks like. This is where onboarding ends and Home begins. In the October friends build, before the finder exists, the flow ends at the Review screen and Home as drawn; the permission and Tonight frames belong to the finder round (wave C) and the flow simply continues into them once they land.

### If both media were picked

Run the first-tapped medium through to its first pick, then offer the second ("Set up movies too?") with "Later"; the other medium's setup stays one tap away in the switcher and on its Ranking doors (question 6). Two decks back to back would be the long onboarding the benchmarks warn about.

## What is deliberately not asked, and where it is asked instead

| Not at onboarding | Why | Where instead |
|---|---|---|
| Genres, moods, "what are you into" | Stated categories predict worse than picks; the seeds and the deck answer it with titles; a checklist would be the survey twice | The seeds and the deck; the engine's content profile; mood tags when the catalog is read for them (stage 4) |
| How much time you have | Context helps only on dense logged segments, never from a one-time answer; SavePoint asks it at the point of use | The finder's time chips, every time |
| Who you watch or play with | Household structure is inferred per session; a standing answer cannot say who is present tonight | The group session, when it ships (V2); the finder's "Who's watching" chips |
| Why you are here | No study for a media recommender; costs a screen; the media picker is the evidenced version | Nothing; the funnel events record what people do first |
| Age, gender, location as demographics | Weak for media taste; valuable only for ads, which Verso does not sell | Region is read from the locale for availability and confirmed in one line |
| Notifications | A permission prompt before value is the measured drop | When there is something to notify: a ticketed date, a new episode later |
| Contacts, invites, friends | Beli's gate is the cautionary tale; friends are a launch feature | Follows at launch; the group pick's guest link after |
| Username, photo, bio | The provider seeds a name (decision 12); sharing is a launch feature | Profile, when sharing arrives |
| How you heard about Verso | A screen Duolingo spends on attribution | A TestFlight link per channel, recorded in the funnel events |
| A "rate this" or slider step | Comparisons beat ratings on effort and fit | Nothing; the tier and the head-to-head are the ratings |

## What each answer feeds

| Answer | Where it lives | Who reads it |
|---|---|---|
| Media to track | `profiles.media` (new, a text array of media) | The switcher, Home, the deck's order, the Ranking doors |
| Interest in TV or Books | An `events` row (`medium_interest`) | Rafa, as demand for the held media |
| Platforms played | `profiles.platforms` (decision 20) | The deck's candidates, `played_platforms` prefill, the ranking filter, the finder |
| Streaming services, theaters, region | The settings row (region, provider ids) from the movies brief | The finder, the calendar, availability, the deck's "on your services" |
| Three you love | `ranking_entries` in Loved, `user_entries` as played or seen | The content profile from its first items, the deck's boost, the pivot choice |
| Deck answers | `user_entries`, `ranking_entries`, `comparisons` (append-only), the watchlist and backlog | Everything the engine does; the funnel's "ten ranked" event |
| AI permission | `profiles.ai_consent_at` (new, null until granted) | The suggest function, which refuses the model call without it; Settings |
| Imports | `steam_library`, the Letterboxd import tables (proposed in the roadmap's data model) | The deck (skipped cards), the diary, the ranking banner |

## The frames to draw

Added to the Figma page `Structure round · bulk entry` (93:2) as a fourth row, in the kit's conventions, for one reaction together with item 11: **Media** (the four tiles, two live, two "Coming"); **Services** (the movies analog of Platforms, with the region line); **Seed films** (the Seed games frame with 2:3 posters); **Deck · Film card** (Seen it, Want to watch, Skip, with the tier sheet's "Just log it" line in a second state); **Deck · Letterboxd** (the import card). The **Permission** and **Tonight** frames are drawn with the finder round in November, since they are the finder's screens, and this brief only fixes their place at the end of the flow. Five frames; one Opus agent in one session; node ids recorded in the kit file when drawn.

## Inferences to flag

1. TV and Books appear in the media picker as "Coming" with a tap that records interest, rather than being hidden (decision 18 hid them from the switcher; the picker is a different surface).
2. Region is read from the device locale and confirmed in one line, not asked.
3. The movies seeds enter Loved, because "films you love" is the user choosing to rank.
4. A film logged from the deck has no watch date; the diary says "Seen before Verso".
5. The permission step's "Not now" degrades to plain reasons rather than blocking picks, and consent is enforced server-side.
6. In October the flow ends at Review and Home; from the December beta it ends at the first pick.
7. The three context questions (goal, time, companions) are out of onboarding on the evidence, not on taste.

## Questions for Rafa, with the defaults

1. The media picker: nothing preselected, both allowed, TV and Books shown as "Coming" with "Tell me when"? Default yes.
2. Movies get "Where do you watch?" (services, a Theaters chip, the region line) before the seeds, skippable? Default yes.
3. "Three films you love" are ranked in Loved, like the games seeds? Default yes.
4. The movies deck answers are Seen it, Want to watch, Skip, with Seen it opening the tier sheet and "Just log it" declining the ranking; deck-logged films carry no date? Default yes.
5. The Letterboxd import is the first movies deck card for everyone, one tap to skip, like the Steam card? Default yes.
6. With both media picked, the first-tapped medium runs to its first pick and the second is offered once, with Later? Default yes.
7. Permission's "Not now" shows picks with plain reasons instead of blocking? Default yes.
8. Nothing else is asked at onboarding: no genres, no time or companion question, no goal screen, no demographics, no notifications or contacts prompt, no username? Default yes.
9. The deck orders by popularity alone at first, with a divisiveness term once the community prior holds a spread per item? Default yes.
10. Trying the app before signing up (TikTok, Letterboxd, and since September Likewise allow it) is recorded as a later idea and not built now? Default yes.
