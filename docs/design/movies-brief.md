# Movies brief: the film product, from the medium outward

Written 2026-09-22 by the orchestrating session (Fable) after Rafa's reaction to the media structure round. His reaction, in one line: the media frames were built by reusing the games UI and swapping the nouns, without asking what each medium wants as its own product. He is right, and the cause was rule 24 as first written ("same skeleton, different facts"). This brief supersedes the Movies section of [media-brief.md](media-brief.md); the TV and Books sections there are held (see "What is held"). The catalog facts and the licensing calls of that round survive unchanged and are listed at the end.

## Third pass, 2026-10-12: the site is the source of truth

**Status: a round in Figma, drawn from this pass; nothing below is decided until Rafa's letters on the frames.** The drawing brief is [figma-kit/movies-site-round.md](../private/design/figma-kit/movies-site-round.md); the joint profile has its own brief, [profile-brief.md](profile-brief.md), drawn in the same round at his ask.

### What he said, decoded

Rafa, by voice, after seeing the eight frames of 2026-09-22 next to rankverso.com: the eight are "too outdated to rank after what I've seen from the mock". The site's phones under "Inside the app" (`apps/site/src/components/movie-screens.tsx`, drawn live on the tokens with real posters) are the source of truth for how the app looks: Home "is perfect as is", the compare step and the Ranking screen too, and the ask button at the top ("What do you want to watch?") is "absolutely needed". The site's hero, where the question is typed in the person's words and answered with three picks and a reason each (`ask-moment.tsx`), is what tapping that button should open. What he wants drawn is the screens the site does not show, in the site's language, plus the joint profile. Four things follow.

1. **The site's four phones are the design.** Home (`Home · Movies H · Rows by reason`, 143:173, in color on the brand board as 230:60), the compare step, Search and Ranking stand as drawn there: the poster is the card with the four facts as pills on its scrim and no title, the brand green is the one color, Inter at three weights, the tab bar's active tab in green. Every other movie screen is drawn in that language. The eight grayscale frames of 2026-09-22 are retired as drawings; what they decided about structure (the diary line, the two actions, the calendar's three kinds of date, the banner, the log sheet's two buttons) stands where this pass does not say otherwise, and the open questions below stand with them.
2. **The search row's second line is the year and the genre by default, and the person when the query is a person.** On the site, Search rows read "2021 · Denis Villeneuve" and Ranking rows "2024 · Sci-fi"; he wants one rule: genre is the default everywhere, as Ranking has it, and the line changes to what was searched for when that explains the result ("if I'm searching Denis Villeneuve and you show me two Dune movies, the director should show up"). So a title query shows "2021 · Sci-fi", and a query that matches a person (director first; actors later, when the catalog has them) shows "2021 · Denis Villeneuve". The year tells remakes apart. The Search spec and `search_games`'s movie twin carry the rule: the RPC returns both the genre and the matched person, and the row picks.
3. **The question screen is the site's hero.** Tapping the ask button opens a full-height sheet: the question as the large title, a field where the person types in their own words ("something for the whole family"), a short trace that names what the engine is doing ("Reading your ranked list", "Leaving out what you've seen", "Keeping it for every age"), then "Our recommendations, with the reason" and three picks, each a poster, the title with its number, and a reason that cites the person's own list. Drawn as two frames, `Ask · The question` and `Ask · The picks`. This replaces `Home · Movies E1 · The question` (132:106), whose three controls (how long, what kind, in your words) were the form version of the same ask; the typed line absorbs them, and chips for length and genre can return under the field if his letters want them (question 15). "Another three" is kept on the picks, bounded to three at a time as decision 24 says.
4. **The numbered picks over the list are a desktop thought.** How it works, step 3 on the site, shows six films on the watchlist with three of them numbered and the first one's reason. His read: "obviously you shouldn't be showing movies that you're not recommending", but the picks-over-the-list treatment "is something to consider, maybe for the desktop version". Recorded here and in [web-brief.md](web-brief.md)'s open items; not drawn in this round, which is the phone.

### The screens of the round

Twelve frames, 402 wide, drawn 2026-10-12 on the new page `Site round · movies` (256:2); the node ids and the drawing report are in the drawing brief. In the order of the brief: `Ask · The question`, `Ask · The picks`, `Movie page`, `Log sheet`, `Watchlist`, `Calendar`, `Search · A title`, `Search · A person`, `Ranking · To rank`, `Profile · Every medium`, `Profile · One medium`, `Edit profile`. Home and the compare step are not redrawn.

Where the site's language changes a screen's shape, against the sections below:

- **Movie page**: the poster leads the header at 120 wide (was 100); the diary line sits under it; "I watched this" is the brand green primary and "Want to watch" reads as the state when the film is already on the list; everything else as the Movie page section says.
- **Watchlist**: a grid of posters, three across, one pill on each for where it streams ("Netflix", "Rent", "Not streaming"), instead of rows with a trailing check; the film page is where "I watched this" lives, so the check leaves the row (question 16 asks whether a long press should log from the grid). The filters and the sort stay as the sub row.
- **Calendar**: rows, because dates lead; the date column in the brand green when the person is going (the medium color is gone, decision 29).
- **Ranking**: the site's phone plus the banner above the tools row.
- **Log sheet, Search**: unchanged in structure; redrawn on the tokens with posters.
- **Profile**: see [profile-brief.md](profile-brief.md).

### Rafa's letters on the site round, 2026-10-12

By voice, the same evening, after reading all twelve frames. Ranking: "beautiful in its current state", approved. Search: the person rule is "perfect"; add more match kinds, actors first. Calendar stays. His letters on the rest, decoded, with what changes:

- **Log sheet.** "Where" goes: which service you watched on does not matter when logging. The note is "Notes", marked optional, so nobody skips ranking because they do not want to write. The sheet is Date, Notes (optional), Save and rank, Save.
- **Watchlist.** The service pill on each card goes: "our platform should be smart and know which subscriptions I have", so the grid shows what is on your services by default, and where a film streams is a fact for the movie page, "not something relevant on my home screen". Keep the grid; add zoom, "zoom in and zoom out and see a huge panel". The three pills "don't accomplish" filtering: he wants on my services, under X hours with a slider, genre, director, "a ton of ways to filter", the design left to Claude. The proposal is below.
- **Search.** Beyond the director, actors; and other kinds Claude proposes. The catalog already carries `directors`, `writers` and `top_cast` on `movie_details`, so director, writer and the ten top-billed actors cost one index each; studio, franchise ("Part of") and decade are the next three, from fields the mirror has. Query 17's default stands, widened: directors and actors at the beta, writers behind them.

**The Watchlist filters, proposed.** The sub row becomes "12 films · On your services" (the default scope, a tap toggles to "Everywhere") at the left and one "Filters" chip at the right with a count when any is set. The chip opens a sheet: Length, a slider from 1 h to 4 h with "Any" at the end ("Under 2 h" reads above the knob); Genre, chips, multi-select; Director, a field with suggestions from the list's own films; Decade, chips; Mood, the engine's tags, later; Sort, Added · Runtime · Year · Rating. Set filters show as removable chips under the sub row. Zoom is a pinch, three columns by default, two for large cards, five for the dense panel; the same `pickCard` at three widths, no control on screen. Drawn as `Watchlist` redrawn, `Watchlist · Filters` and `Watchlist · Zoomed`.

### Questions for Rafa, with the defaults

Numbered after the second pass's list.

15. Does the ask sheet need chips under the field for length and genre, or is the typed line enough? Default: the typed line alone, chips later if people type the same constraints every time.
16. On the Watchlist grid, should a long press open the log sheet, so a film can be logged without opening its page? Default yes, undrawn (a gesture, not a control).
17. Search by person: directors only at the beta, actors when the catalog mirrors cast? Default yes.
15 to 18 stand as asked on 2026-10-12 with their defaults, 16 now answered by the pinch (a long press on a card opens the log sheet).

18. The movie page's primary once a film is watched: "Log another watch" in the brand green, or the diary line's "Change" with no primary button? Default: the diary line alone, the primary button gone, "Rank it ›" on the line when unranked.

## Second pass, 2026-10-06: Home is the engine's front door

**Status: decided 2026-10-07**, after seven drawn rounds in one day (D1 to D3, E1, F1 and F2, G, H). The approved Home is `Home · Movies H · Rows by reason` (143:173): a filled, iconed "What do you want to watch?" button that opens the question as a sheet (`Home · Movies E1 · The question`, 132:106); under it rows of picks, every row a reason, the watchlist first as a large carousel, then two or three genre rows (the genre word alone), then two or three "Because you loved *Film*" rows, the engine choosing which rows appear and seven at most; the poster is the card, with four pills on its foot (service, genre, year, duration) and no title; services never title a row; nothing on Home is the diary or the calendar. The italics on the film title are kept for now, decided later. The sections below are the record of how it got there: the first proposal (one question, three answers, with the evidence), then Rafa's letters round by round.

Rafa's first reaction to the movies round, by voice, before the rest of his letters: Home only, the other screens after Home is redrawn. This section supersedes "Home: 'What do you want to watch?'" below and question 1 of the list at the end; everything else in this brief stands until he reacts to it.

### What he said, decoded

1. **Home as drawn is poor, in all three variants, and is reframed now**, before the rest of the round is reacted to and before any movie screen is coded.
2. **"On my services" is the wrong lead.** There is always something to watch; supply is not the problem on a couch with four subscriptions. The question the screen answers is whether I will like it, not whether I can reach it. Services become a fact on each pick and a silent default filter, never a question the user is asked.
3. **After the reframe, the compendium is the sensor, not the show.** The watchlist, the diary, and the ranking are how the engine learns (decision 21); Home is not where they are displayed back. Coming up and Recently watched leave Home.
4. **The ideal is the AI version**, asking in your own words. Not a chatbot to start ("I'm not sure you can start with a chatbot"), but the opener should feel like one: "What are you interested in watching?"
5. **He leans C, stripped to the question and its answer.** "How long do you have? What are you watching?" is the recommendation-engine vision on one screen; the blocks under it made C "feel like it's doing too much".
6. **Asked for**: the work on what information matters about a film at the moment of choosing and what Home should show, this reframe, then the other screens.

Inferred, tell Claude if any is wrong: (a) "I don't know if it's not interested in the movie" is read as "whether I'm interested in the movie", the fit question, against "because it's on a service", the supply question; (b) the strip is the whole screen, not just C's lower blocks: Home becomes one block, which amends rule 3 for movies Home; (c) "reframe early" splits item 8: Home now, the letters on the other eight frames after the new Home is drawn; (d) games Home is untouched by this reaction, and the Tonight block of wave C opens this same question; (e) "Who's watching?" is held for the group engine (V2) rather than drawn dimmed, because a dead control does not belong on a screen he wants to do one thing.

### What matters at the moment of choosing

The use case is literal (decision 7 of 2026-09-22): on the couch, need something, pull up the app. The evidence pass on how people choose and what the best products show at that moment is [research/movies-home-notes/choosing-what-to-watch.md](../research/movies-home-notes/choosing-what-to-watch.md) (2026-10-06, about twenty sources, every number dated, the unverified ones marked). What it says, in five lines: Nielsen measured 10.5 minutes a session spent choosing in 2023 and a fifth of viewers giving up; Netflix's own paper says a member loses interest after 60 to 90 seconds and 10 to 20 titles, three of them looked at closely; when 2,500 adults were asked what the choice depends on, mood came first (63%), schedule second (53%), who is watching third (42%), and convenience of the service fourth (37%); Netflix's one-button "Play Something" was removed within two years for low use, because people open the app with a title or a genre in mind; and in the one controlled study of explanations (Herlocker, 2000), a reason tied to films the user rated highly was among the best, critics' scores raised nothing, and more explanation data did worse than none. The lists below are the design read of that and of the engine's own inputs ([recommendation-engine.md](recommendation-engine.md), "The model's job").

**Inputs the finder asks for, ranked by how much each changes the answer.**

1. **What kind, as mood first and genre second.** Mood is the top-cited factor and the one the chips cannot carry today, so it enters as one optional line of your own words ("something light", "like Past Lives but shorter"): the `suggest` function already takes a `note` of up to 280 characters and hands it to the model as context, so this costs nothing and is the bridge to the AI version without a chatbot. Genre chips from the user's Loved and Liked tiers sit beside it, none selected by default; with nothing selected the engine answers from the taste profile alone, which is the point of having one. The catalog's mood vocabulary (engine stage 4) later lets the chips carry mood too.
2. **How long do you have.** The one hard constraint every evening has, the second most cited, and runtime is in the catalog for every film. Three segments: Under 1 h 30, About 2 h, Any. Maps to `maxMinutes`.
3. **Who is watching.** Third most cited, and the group engine is V2; until then it is not on the screen (inference e).

Not asked: **services** (set once in Settings, applied silently, the way every aggregator does it; every pick says where it streams; when nothing on your services fits, the result says so and offers "Show everything"); **scores** (an input to the engine, never to the user); **the watchlist** (a source, not a filter); **a surprise button as the main path** (Play Something's lesson).

**What a pick shows, ranked.**

1. **Poster at 2:3, title, year.** Netflix found the artwork was over four fifths of what people look at while browsing, about two seconds a title; rule 29 keeps it whole.
2. **The reason, in your own terms.** "You put Past Lives in Loved and dropped two three-hour epics; this is 1 h 45 and quieter." Under 25 words, cites one or two of your own films, names one shared trait, no number. The kind of reason that performed best in the one controlled study, and the line that makes the screen Verso's and not JustWatch's.
3. **Runtime**, against the time you said: "1 h 45".
4. **Where to watch**, one chip: your service ("Netflix"), or "Rent · Apple TV", or "Not on your services" when "Show everything" is on. The handoff to the remote, never the question.
5. **One tag word**, the trait the reason names ("Quiet", "Sci-fi"), when the reason does not already say it.
6. **Confidence**, in words, read through your list: "Would land near Past Lives · Liked", or "A stretch" when confidence is low. Never a percentage: a match number is the kind of explanation that did worse than none.
7. **Origin**, small: "On your watchlist" or "New to you", so the user knows when the engine went outside what they already meant to watch.

Left off Home, on purpose: the TMDB and Rotten Tomatoes line (the page keeps it; critics' scores raised acceptance by nothing, and review sites are what the product replaces, reframe point 6), synopsis, director and cast (the page; people look closely at about three titles, so the detail lives behind the tap), awards (the page), popularity and "on your services now" lists (the community prior lives inside the engine, not on the screen), release dates and the calendar (the Watchlist tab's second segment), the diary and "Rank it" nudges (Profile and the Ranking banner), "Surprise me" (it is the button with nothing set), friends (V2, and only when the signal is real), and a fourth pick.

### Home as it now stands: one question, three answers

- **Switcher row**, as every Home (rule 4).
- **The question.** Title, then the inputs: the segmented control first (three segments read faster than chips and the time is the quickest thing to say), then the genre chips (sideways scroll, "More ▾"), then the one-line field for mood in your words. Two taps and the button; the line is optional. Then **"Find something"**, full width, medium color. Under the button, one 13-gray line: "On Netflix, Hulu, Max · Change", so the silent filter is visible and one tap from Settings.
- **The answer, inline, not a sheet.** The form collapses to one summary row ("About 2 h · Thriller · Change") and three pick cards fill the screen: poster 2:3 at 96 wide, title 20 semibold, "2023 · 1 h 45", the where chip and the tag word, the reason in 14, the confidence in 13 gray, the origin as a 12 caption. Tap a card for the movie page, where "I watched this" opens the log sheet (unchanged). "Another three" under the cards. A swipe on a card is **"Not tonight"**, which the engine records (a `dismissed_at` on `prediction_log`, one column; the rejection is signal, the same as a dropped game); the card leaves and the next candidate slides in.
- **Nothing else.** No Coming up, no Recently watched, no popular row. One optional line under the picks is the only candidate for a second element, "3 watched films to rank ›", because unranked films are what the engine is hungriest for; question 6 below, default off, since the Ranking tab's banner already carries it.
- **First run and empty states** (rule 14, the same hierarchy as [onboarding-brief.md](onboarding-brief.md), section 5): fewer than five ranked films, the picks come from the community prior for your services and say so ("Popular with people who watch on Netflix"); no watchlist, no difference, the engine picks from the catalog; no services set, the picks say where they stream and the line under the button reads "Pick your services ›"; before the first model-written reason, the permission step, and "Not now" still shows three picks with the engine's plain reasons; nothing matching the time and kind on your services, "Nothing on your services fits · Show everything" with the three best picks from everywhere.
- **Where the blocks went.** Coming up is the Calendar segment, as drawn. Recently watched is Profile's diary, as drawn in B. The "Rank it" chips are the Ranking banner. Nothing is lost; it is no longer on Home.
- **Games Home** is unchanged by this pass; wave C's Tonight block opens this same question on games with platform chips in place of the services line, decided when that round is drawn.

**Rule 36 is rewritten** ("Home is one question and its answer for movies") and **rule 3 gains the exception** (movies Home is one block, because the screen is a request, not a page). **Decision 28** in the roadmap. Both dated 2026-10-06.

**What the engine needs for this**, both small: `suggestion_candidates` for movies includes the user's watchlist (status queued) and returns the origin, since `p_include_backlog` defaults to false and a watchlist film is the most likely right answer; `prediction_log.dismissed_at` for "Not tonight". The `note`, `maxMinutes`, genres and `providerIds` fields already exist in the `suggest` body.

### The frames to draw

Rule 3 wants two or three variants per decision, so the question's shape is the variable and the answer is shared:

- **Home D1 · Ask, then answer** (the default, Rafa's lean): the form as described, the picks appear under it after the tap.
- **Home D2 · Answer first**: three picks at zero taps, from the defaults (Any, no kind, your services, your taste), with the question as a compact control row above them; changing a chip re-picks. Why draw it: zero taps to a film is the strongest answer to Nielsen's ten minutes, and the prior means the cards are never empty. The cost: picks before the user has said anything can read as noise, which is the complaint about A and B, and Netflix's no-input "Play Something" died of low use because people arrive with something in mind.
- **Home D3 · One line**: a single text field, "What are you in the mood for?", with the time segments and the genre chips under it as suggestions, and the picks below. Why draw it: his AI instinct as a screen that can ship now, because `note` already exists. The cost: typing on a couch.
- **Picks** (shared results state, D1's collapsed row above three cards and "Another three"), **Cold start** (fewer than five ranked: the prior's picks, labeled), **Nothing fits** ("Show everything").

The drawing brief is [figma-kit/movies-home-round.md](../private/design/figma-kit/movies-home-round.md). **Drawn 2026-10-06**, the same night, as a new row at y 4640 on `Structure round · movies`: D1 125:55, D2 126:81, D3 127:53, Picks 128:80, Cold start 129:94, Nothing fits 130:43; the agent's judgment calls are listed in the drawing brief. What the leading apps put on Home, for comparison, is [research/movies-home-notes/home-screens.md](../research/movies-home-notes/home-screens.md) with their App Store screenshots in [assets/home-references/](../private/design/assets/home-references/): no app asks for time, reasons are rare and generic, nine of eleven open on the catalog, and none gives a bounded answer. Awaiting Rafa's letters.

### Rafa's letters, 2026-10-07

On the six frames: none of D1, D2, D3 as drawn. "You are overestimating how people take length into account when picking what to watch." Home shows movies first, like JustWatch, with a button that takes you to the filters. Then on the card: "E1 cards, but don't think we need the full description. Make the poster the biggest part and have maybe a small logo about genre / year / duration / platform. All else is irrelevant and current cards show too much information."

What that settles, pending his look at the E1 frames: Home is picks first at zero taps, from the user's taste and services, bounded to three with "Another three"; the question (what kind, how long, in your words) lives behind one full-width control, "What do you want to watch?", as a sheet; the pick card is the poster plus four small facts with an icon each (genre, year, duration, service) and no reason, confidence or origin on the card. The reason from the user's own list, the thing no other app shows, moves to the movie page the card opens, where it is one line above "I watched this" (Claude's proposal, not yet reacted to). The ranked lists above stand as the record of the evidence; the card's cut is Rafa's call on what the screen needs, not a reversal of what the engine computes. Drawn the same day as `Home · Movies E1 · Picks first` (131:85) and `Home · Movies E1 · The question` (132:106); see the drawing brief. Questions 1, 2, 4 and 9 below are answered by this; 3, 5, 6, 7, 8 and 10 stand.

On E1, the same day: "too much wasted white space, the poster is only a third of the card. Make the poster the full card and have the four icons (platform, genre, year, duration) overlaid on top of the poster. The title is in the poster so it does not need to be restated." Drawn as `Home · Movies F1 · Full posters` (135:82, three full-width posters stacked, one fills the screen) and `Home · Movies F2 · Carousel` (136:135, one poster at nearly full width, swipe for the next two, dots), each with the four facts as white pills on a scrim at the poster's foot and no title text. His pick, the same day: "I like F2 carousel, but also enable scrolling similar to JustWatch." Drawn as `Home · Movies G · Carousel and rows` (140:189): the carousel as the first row under the button, titled Tonight, then the page scrolls through two more rows of smaller posters with the service pill alone, "Because you loved Past Lives" (the reason as a row title, Likewise's form, which is where the reason lives now that it left the card) and "New on your services"; "Another three" is gone, the carousel loads three more past the third. Every row is picks from the engine; the diary and the calendar stay off Home. Rows he can swap in: From your watchlist, Popular with people like you, Still in theaters. His letters on G, the same day: keep the UI ("it works on existing UIs for Netflix and other tools"); "Tonight" is not a reason, and "New on your services" is not a valid one ("I don't think people watch movies because of their view on X service"); every carousel should carry its own recommendation reason, "because you loved X" and "people like you liked Y" being the shape; come up with the set of categories, check what is realistic to ship, then go; and the "What do you want to watch?" control should be bigger, with an icon, more colorful, so it pops. The row catalog below is the answer; the button is redrawn with the rows once he picks.

### The row catalog: every row is a reason

Each row title names the reason in the user's own terms. Services never title a row; they stay the silent filter and the pill on the poster. Nothing editorial, trending or popular titles a row either: those are what a platform wants you to see. Ordered by how personal the reason is; "Beta" means the engine's stage 1 (the content profile over the user's own list plus the community prior, built in PRs #63 and #64) can fill it today, "V2" means it waits for neighbors or friends.

| Row title (the reason) | What fills it | Ships |
|---|---|---|
| **Because you loved {Past Lives}** | Films sharing a genre, director, decade or (later) mood tag with one Loved film, scored by the content profile; one row per top film, rotated | Beta |
| **More from {Celine Song}** | A director you ranked highly, the films of theirs you have not logged | Beta |
| **{Thrillers}, the way you rank them** | The user's strongest Loved genre, scored by the content profile and the prior | Beta |
| **You said you wanted to watch these** | The watchlist, ordered by predicted fit; the reason is the user's own intent | Beta |
| **A stretch worth taking** | High predicted score outside the user's usual genres; the engine's "a stretch" label as a row | Beta |
| **From the {1990s} you keep ranking high** | Decade affinity from the content profile | Beta |
| **Loved by people with your taste** | Neighbors on rank percentiles, after the harness shows them beating the baseline (decision 24) | V2 |
| **Your friends loved these** | The social layer | V2 |
| **Because of your games** | The cross-media bridge (engine stage 4) | Later |
| **Under {100} minutes you would love** | Runtime cap plus content score; a reason only when the user asked for time in the sheet | Beta, inside the sheet's result rather than on Home |

Retired: "Tonight", "New on your services", "On your services now", "Popular", "Trending", "Coming up", "Recently watched".

The first row is the engine's best three across every reason (what the `suggest` function returns), titled by the reason behind the first pick ("Because you loved Past Lives" when that is why) rather than by a time of day; the rows under it are the single-reason rows above, in the order the user's list supports them (a user with no strong director skips "More from"). Five rows at most on first load, more on scroll; the row count is a config value, not a design.

**Rafa's order, 2026-10-07**: the watchlist first ("that's most relevant"), then two or at most three genre rows the engine chooses from the user's rankings ("if the person has a ton of ratings on horror movies, maybe a horror thing; it has to be intelligent, it can't be set in stone"), then two or three rows on specific films the user rated highly; the engine drives which rows appear, five to seven rows at most. Drawn as `Home · Movies H · Rows by reason` (143:173): the button filled in the medium color, 56 tall, an icon at the left; "You wanted to watch these" as the large carousel; "Horror, the way you rank it" and "Thrillers, the way you rank them"; "Because you loved Past Lives" and "Because you loved The Zone of Interest". A row with nothing to say is skipped, so a user with no watchlist opens on a genre row (inferred). Row selection, proposed for the engine: a genre row when the user has at least three ranked films in it with a mean percentile in the top half, ordered by that mean; a film row for each Loved film with at least six unseen candidates scoring above the user's median, ordered by rank; the watchlist row whenever the pool has one film; the cap at seven. His letters on H, first: "the way you rank it" goes; say the genre, or "horror movies similar to ones you like"; "Because you loved X" is fine; and the genre or the film title must read apart from the rest of the title, italics for the variable part. Applied in place: "*Horror*, like the ones you love", "*Thrillers*, like the ones you love", "Because you loved *Past Lives*", "Because you loved *The Zone of Interest*", "You wanted to watch these" unchanged. Netflix and Apple TV title their rows "Because you watched X" and plain genre names, so the shape is the one people know. **Rule for every row title**: the variable part (a genre, a film, later a director or a decade) in italics, the rest plain words, and the rest never describes the engine ("the way you rank it" is retired). Then: "like the ones you love" goes too; the genre row is the genre word alone, as Netflix and Apple TV do; the italics on the film stay for now, a minor call for later; "after that we should be good for the home screen" and on to the other movie screens. Applied: "Horror", "Thrillers". Home decided; see the status line at the top of this pass. Questions 11 and 13 are answered; 12 is answered by the watchlist row being first.

Questions: 11. The row order above, or a different first five? 12. "You said you wanted to watch these" on Home, or does the watchlist stay in its tab only? Default on Home, since it is the one row whose reason is the user's own word. 13. The button: the medium color filled, 56 tall, an icon at the left (a sparkle for the engine, or a search glass), "What do you want to watch?" in 17 semibold white? Default yes.

### Questions for Rafa, with the defaults

Silence means the default. A letter per variant, a line per objection, as before.

1. The title: "What do you want to watch?" (drawn), "What are you interested in watching?" (his words), or "What are you in the mood for?" Default the first; D3 carries the third.
2. Time segments Under 1 h 30 · About 2 h · Any? Default yes.
3. Picks from the watchlist and the catalog mixed, labeled by origin, with the watchlist favored on ties? Default yes. The alternative is watchlist first, catalog only when it runs dry.
4. The one-line "in your words" field on Home in V0? Default yes, optional, under the chips.
5. "Not tonight" as a swipe that the engine records? Default yes.
6. A "3 watched films to rank ›" line under the picks? Default no; the Ranking banner carries it.
7. "Who's watching?" held for V2 rather than drawn dimmed? Default held.
8. Rule 3 amended so movies Home is one block? Default yes.
9. D1 the default, D2 and D3 drawn for the reaction? Default yes, six frames.
10. The new Home goes through `hig-review` before his letters (figma-workflow step 4)? Default yes.

## What Rafa decided on 2026-09-22

Recorded from his spoken reaction to the eight points Claude listed; inferences are marked.

1. **Movies are rebuilt as their own product**, and they are the only medium beside games in V0. TV and books wait.
2. **The watchlist is a pool, not a queue.** "100% agree." No order, no numbers, no drag; filters instead.
3. **TV's ranking unit is an open question**, pinned: by season (his lean, with the show's own score either entered by hand or averaged from its seasons), by episode ("may be a little heavy, specifically for longer series"), or the whole show. Nothing on TV moves until it is answered.
4. **Watched is not ranked.** Agreed. Logging a film and ranking it are two steps.
5. **The diary is the entry.** Agreed. The watched date and the note are what a film log is, not optional metadata.
6. **TV keeps its total hours.** He would not remove "~20 h" from a show: "how long will it actually take me to watch this full show" is worth seeing. Applies when TV comes back.
7. **Movies Home is functional, not informational.** "You're using the app to find the next movie." The screen asks what you want to watch today and filters; games Home stays informational, because when you want to play a game you just play it. The use case is literal: on the couch, need something, pull up the app.
8. **Streaming and theaters are separate.** The watchlist is for what you will stream. A calendar shows the theatrical releases you care about, and when you have tickets you set the date you are going. A cinephile goes once a month and wants to know when the films they want open.

Inferred, tell Claude if any is wrong: (a) books are held with TV, since he said "only the movies piece"; (b) TV and books disappear from the switcher in V0 rather than sitting there as placeholders; (c) movies get their own tab set, which rule 4 already allows; (d) the movies round is drawn and reacted to before any movie screen is coded, per rule 1; (e) the phone milestone stays first, since it is Rafa's runbook rather than build work, and the movie screens are coded after this round is approved and before the V1 games items.

## The product in one line

You are on the couch and need something to watch: the app finds it, from your watchlist and your services, in the time you have. Afterwards you log it in a line and, if you care, rank it. When a film you want opens in theaters, you know the date.

## How a film differs from a game, and what follows

| Fact about films | What the games design assumed | What the movie product does |
|---|---|---|
| Chosen in the moment, most nights, under constraints (what is on my services, how long I have, who is on the couch) | You know what you will play next; Home shows it | Home is a finder: a question, filters, picks |
| A watchlist is a pool of a hundred maybes | A backlog is a short ordered commitment | No order, no numbers, no drag; filter and sort |
| A film is one sitting; the date is the memory | Playing is a state; the date is a smear | No in-progress state; the diary row (date, where, note) is the log |
| A film person logs 200 a year and imports 800 | Thirty games a year, each worth four comparisons | Watched is a first-class state without a ranking; ranking is offered, skippable, and never implied; imports never rank |
| Rewatches are normal | Played once | "I watched this" on a watched film adds a diary row; the page counts them |
| Theaters are planned weeks ahead and dated | Nothing planned; release dates are for wishlists | A calendar of openings you care about, with your ticketed date |
| Watching is often shared | Single player | A "who's watching" slot on the finder, reserved for the friends layer (V2, [feature-ideas.md](../feature-ideas.md#9-ai-suggestions-personal-and-group)) |
| The director is the author | The developer is a detail | Director in the header and the search row; studio dropped |

The ranking loop itself (four tiers, binary insertion, the prompt, the confirm step) is not in the table because it suits films at least as well as games. Head-to-head is how people already argue about films. What changes is everything around the loop.

## The states of a film

Same four values in the data (queued, in progress, done, dropped; media-brief.md's rename) with these rules for movies:

- **Want to watch.** One status. Where it shows depends on the film, never on a choice: a film you can stream, or one that is released and streaming nowhere, sits in the Watchlist; a film that is unreleased, in theaters, or streaming from a known future date sits in the Calendar. When a calendar film starts streaming it moves to the Watchlist by itself.
- **Going.** A film on the calendar can carry a date you are going: "Going Fri Oct 24". A new fact, `planned_on`, on the entry. It is a date, not a status.
- **Watched.** Set by the first diary row. A diary row is a date, an optional place (a service, "In theaters", "Other"), and an optional note. A film can have many.
- **Ranked.** A `ranking_entries` row, as today. Independent of Watched; a watched film is not ranked until the user ranks it.
- **In progress** is never shown (media-brief.md decision 6, kept). **Didn't finish** is hidden for movies too (question 4): a film you turned off is a diary row with a note, or nothing.

## Tabs for movies

Home, Search, Ranking, Watchlist, Profile. "Watchlist" replaces "Next" (rule 8: the tab and its page share a name; rule 18: the medium's own word). The tab bar takes a medium; the icons stay per medium as decided 2026-09-15.

## Home: "What do you want to watch?"

**Superseded 2026-10-06** by the second pass above: Home is one question and three answers, and the blocks below left the screen. Kept as the record of the round that was drawn.

Three variants, since Rafa said "we can play around with it". Every variant keeps the switcher row and three blocks (rule 3); the first block is the finder and is the point of the screen.

**A · Filters-first** (default). Under the switcher, the question as the block title: "What do you want to watch?". A chip row that scrolls sideways: "On my services" (on by default), "Under 2 h", then three genre chips from the user's Loved and Liked tiers ("Sci-fi", "Thriller", "Comedy"), then "More ▾". Under the chips, two groups of rows. *From your watchlist*: the watchlist films that match, up to three, poster, title, "2021 · 2 h 35 · Netflix", "See all" when there are more. *On your services now*: three popular films on the user's services with no entry, same row, a "+" trailing control that adds to the watchlist. A "Surprise me" secondary button at the end of the block picks one match at random and opens its page. Second block, *Coming up*: one to three date rows, ticketed films first ("FRI 24 · Dune: Part Three · Going" with the date in the medium color), then openings ("OCT 22 · The Smashing Machine · In theaters"), then streaming arrivals ("DEC 3 · Anatomy of a Fall · Streaming on Hulu"); "See all" opens the Calendar. Third block, *Recently watched*: the last three diary rows, "Dune · Sep 2", with a "Rank it" chip on the ones not ranked and the score badge on the ones that are. Why: the finder is the couch question with the constraints as the controls, the picks come from your own list first because that is what a watchlist is for, and the third block gives an unranked film its second chance.

**B · Pick-led.** The finder is one hero card: *Tonight* with the poster, "Dune", "2021 · 2 h 35 · Netflix", and two buttons inside the card, "Another" and "Watched it" (the log sheet). Under the hero the same chip row as A, which changes what "Another" picks from. Then *Also fits*: three more matching rows. Then *Coming up* as in A. Recently watched moves to Profile. Why draw it: one strong suggestion is faster than a list when the constraints are already right; it is the old Tonight-led frame made functional. The cost: with no watchlist, or nothing on your services, the hero has nothing to say and the screen empties.

**C · Ask-led.** The finder is a short form: "How long do you have?" as a segmented control (Under 1 h 30 · About 2 h · Any), "What kind?" as genre chips, "Who's watching?" as two chips (Just me · With someone, the second dimmed with "Friends come later"), then a full-width "Find something" button in the medium color. Tapping it slides a results sheet with three picks from your watchlist and, under a divider, three from your services. Then *Coming up* and *Recently watched* as in A. Why draw it: this is the suggestion feature of V1 ([feature-ideas.md](../feature-ideas.md#9-ai-suggestions-personal-and-group)) as a form, and it is the variant that most obviously grows into the group version. The cost: two taps before any film shows.

In every variant the empty states follow rule 14: an empty watchlist turns the finder into "Add films you want to watch" with a "Search" button, and no services set turns the "On my services" chip into a prompt to pick them in Settings.

## Movie page

The media round's page with the changes below; everything not named stays as drawn (poster 2:3 at 100 wide, title 24, "2021 · 2 h 35 · PG-13", genres, director; the score line with sources and the Wikidata caption; the awards line; where to watch with the JustWatch credit; cast; about).

- **Actions.** "I watched this" (primary, medium color) opens the log sheet, not the tier sheet. "Want to watch" stays.
- **The diary line** replaces the status line. Unwatched and on a list: "On your watchlist" (no "since" date). Watched once: "Watched Sep 2 · Netflix · Change". Watched more than once: "Watched 2× · last Sep 2 ›" opening the diary rows. Watched but not ranked: the line gains a "Rank it ›" in the medium color, because the page is where a skipped ranking is most likely to be taken up. The note, when written, sits under the line in 14 gray, two lines then "…".
- **Theatrical line**, only while it applies. Unreleased: "In theaters Oct 22 · Going? ›". In theaters: "In theaters now · Going? ›". Ticketed: "Going Fri Oct 24 · Change". Tapping "Going?" opens a date picker; the film is on the calendar either way. "Where to watch" shows an "In theaters" chip while a film is in theaters and nothing is streaming.
- **Where to watch** loses the "Your services: Netflix, Max ›" row; the services are a setting, and the outlined chips already say which are yours.
- **Details** keeps Released, Streaming since (or "Streaming from Dec 3" when the date is ahead), Runtime, and Part of; drops Studio and Added (question 7); the "+" goes, because the diary holds every personal field.
- **Later blocks**, not drawn: "More by Denis Villeneuve", the trailer.

## The log sheet

The movie's log flow begins here rather than at the tier sheet. A bottom sheet from "I watched this" on the page, from the check on a Watchlist row, from the add-to sheet in Search, and from the long press on a Home row.

- Title: the film, small poster. First row: **Date**, "Today" with the day's date, tap to change (a wheel, never a full calendar screen). Second row: **Where**, chips of the user's services plus "In theaters" and "Other", one tappable, none required; the chip is preselected when the film is on exactly one of your services. Third row: **What stood out?**, a one-line note, optional (this is idea 3 of [feature-ideas.md](../feature-ideas.md#3-a-note-when-you-rank) arriving for movies first). When a diary row already exists, a line above the buttons says "2nd watch".
- Two buttons: **Save and rank** (primary, medium color) and **Save** (secondary). "Save and rank" continues into the tier sheet, the comparisons, and the confirm step exactly as for games. "Save" closes the sheet and the film is Watched, unranked; the Ranking tab's banner and the page's "Rank it" pick it up later. Question 5 asks which is primary.
- Imports (Letterboxd CSV) and bulk entry write diary rows and never rank; their ranking is the session below.

## Watchlist tab

Header "Watchlist"; on the right the medium pill. Segments **Watchlist | Calendar**.

**Watchlist.** Sub row: "12 films", then chips "On my services" and "Under 2 h" (both filters, off by default, no "your order" text), then "Sort ▾" with Added (newest first, the default), Runtime, Year, Rating. Rows: poster, title, "2021 · 2 h 35", third line the availability ("Netflix", "Rent · Apple TV", "Not streaming"); the trailing control is a check that opens the log sheet. No rank numbers, no drag handle. A "Not streaming" film keeps its chip in the control's place; "Notify me when it streams" is a later feature on that chip.

**Calendar.** Date-led rows grouped under month headers, three kinds, each labeled by its kind so streaming arrivals and openings never read alike: "GOING · FRI OCT 24 · Dune: Part Three" with the date column in the medium color; "OCT 22 · The Smashing Machine · In theaters", trailing "Going? ›"; "DEC 3 · Anatomy of a Fall · Streaming on Hulu" with no trailing control. A "Now" group at the top holds films in theaters today ("In theaters since Nov 3"). Question 2 asks whether streaming arrivals belong here at all; the default keeps them, theatrical first, because a watchlist film reaching Netflix is the other date a film person waits for. Question 3 asks whether the calendar is a segment (drawn) or its own tab.

## Ranking

The loop and the list are unchanged. Two additions: a **banner** above the list when watched, unranked films exist, "14 watched films to rank ›", opening a ranking session (tier, comparisons, next film, no confirm step per film, one review screen at the end; the session of [feature-ideas.md](../feature-ideas.md#1-bulk-entry)); and the empty state's copy, "Rank the films you've watched" with "Add a film" when nothing is watched and "Rank 14 films" when the banner would show.

## Profile

Stat tiles: **Watched**, **This year**, **Ranked**, **Hours** (kept; Rafa keeps hours for TV and the same reasoning holds for films). Recent activity becomes the diary: rows "Dune · Sep 2 · Netflix" with the score badge when ranked, "See all" pushing the full diary grouped by month. Later: most-watched director, a year in review.

## Search

Row: poster, "Dune", "2021 · Denis Villeneuve", trailing plus (the director disambiguates remakes, as before). Add-to sheet: "Want to watch" and "I watched this" (the log sheet); nothing about services. Popular and recent as for games, through `popular_games` with the movie medium.

## Data model

- **`watch_log`**, the diary: id, user, media item, `watched_on` (date), `place` (text: a provider name, `theater`, `other`, or null), `note` (text, null), created at. Owner-only Row Level Security with a policy test. A `before insert` trigger sets the entry's status to done when it is not already; `user_entries.finished_at` mirrors the latest row for the reads that already use it. `user_entries.notes` stays the games note; for movies the note lives on the diary row.
- **`user_entries.planned_on`** (date, null): the ticketed date. Cleared by the trigger when a diary row lands on or after it.
- **The finder read**, in `packages/api`: watchlist rows filtered by the user's providers (`watch_availability` joined to the settings row's provider ids and region), runtime ceiling, and genres; and "on your services now" as `popular_games` for the movie medium intersected with the user's providers and minus the user's entries. The settings row (region, provider ids) named in media-brief.md is now a V0 prerequisite for movies.
- **Calendar reads**: entries with `planned_on` ahead; watchlist entries whose region theatrical date is ahead or whose digital date is ahead (`media_release_dates`); "in theaters now" as theatrical date on or before today with no digital date yet. All derived; nothing stored beyond `planned_on`.
- **Unranked count**: entries with status done and no `ranking_entries` row, per medium; the same read bulk entry needs.
- The tab bar and the switcher take a medium; the switcher lists games and movies in V0 (question 6).

## What is held

- **TV.** Nothing is drawn or built for TV until the ranking unit is decided (decision 3 above). The TV frames on `Structure round · media` stay as reference; the TMDB mirror's TV half stays because it is data, not a screen. The three options and Rafa's lean are recorded in [ROADMAP.md](../../ROADMAP.md) under V3. The total-hours figure survives when TV comes back.
- **Books.** Held with TV (inferred). The Books frames stay as reference.

## What survives from the media round unchanged

IMDb is not shown and TMDB's score is, labeled; Rotten Tomatoes only as Wikidata's CC0 value with the caption; awards as one line, hidden when none (rule 25); availability replaces ownership (rule 26); one time figure, the runtime (rule 28); poster 2:3, never cropped (rule 29); the TMDB and JustWatch attribution; the six-month cache ceiling; Letterboxd CSV as the first import; no in-progress state for films.

## The frames

Page `Structure round · movies` (71:2), drawn 2026-09-22 by one Opus agent from the kit and the drawing brief in [figma-kit/](../private/design/figma-kit/movies-round.md), fourteen calls, every frame reviewed by the orchestrating session. Frames 402 wide, 520 apart in x, one note above each; the tall ones carry a hairline and a "fold" label where the phone's screen ends at 874.

| Row y | Frames (node ids, left to right) |
|---|---|
| 120 | Home A · Filters-first 72:138, Home B · Pick-led 73:104, Home C · Ask-led 74:113, Home C · Results 75:60 |
| 1760 | Movie page · Watched 76:81, Movie page · In theaters 77:65, Log sheet 78:27, Watchlist 79:82, Calendar 80:90 |
| 3200 | Ranking · To rank 81:80, Profile · Diary 82:80, Rows · Movies 83:79 |

Judgment calls the agent made where the briefs were silent, conventions rather than decisions: the three-segment control at 15 semibold with no icon; the Results sheet starting at y 191 so its six rows fit; the Watchlist filter chips hand-built at 13 with a 1 px stroke; the log sheet's backdrop showing the page's score line and actions under the dim; an invented About paragraph for The Smashing Machine.

Sample data: Dune (2021), Past Lives, Oppenheimer, The Holdovers, Anatomy of a Fall, The Smashing Machine (in theaters), Dune: Part Three (unreleased, ticketed).

## Questions for Rafa, with the defaults

Silence means the default. React the way the games rounds were reacted to: a letter per variant, a line per objection.

1. ~~Home: A (filters-first), B (pick-led), or C (ask-led)? Default A.~~ Answered 2026-10-06: none of the three; see the second pass at the top.
2. Calendar: theatrical only, or streaming arrivals too, labeled? Default both, theatrical first.
3. Calendar as the second segment of Watchlist, or its own tab? Default segment.
4. "Didn't finish" hidden for movies? Default hidden.
5. Log sheet: "Save and rank" primary and "Save" secondary? Default yes.
6. Switcher in V0: games and movies only, TV and books hidden until they have a product? Default hidden.
7. Studio and Added dropped from Details, and the "+" with them? Default dropped.
8. The tab is "Watchlist" for movies? Default yes.
9. TV: held until the ranking unit is decided; the lean is per season with the show's score averaged from its seasons or entered by hand. Default hold, nothing drawn.
10. Order of work: this round now; the movie screens coded after approval and before the V1 games items (Steam link screens, bulk entry), with the phone milestone still first? Default yes.

**2026-10-08, the first row retitled.** Frame H's first row (143:61 in 143:173) now reads "Based on your rankings" instead of "You wanted to watch these". Rafa's rule from his brand board: a surface that shows recommendations is labelled as recommendations, never in words that read like the person's own list. "Recommended based on your rankings" did not fit beside "See all". The row's place and its pool are unchanged ([brand-identity.md](brand-identity.md)).
