# Attribute "genomes" for films and games: what exists, how it was built, and what a small commercial app may use

> Researcher notes for VER-303, written 2026-10-29 (final version). Current to October 2026; older facts carry their dates.
> Access notes for the report writer: theatlantic.com is blocked in the fetch tool, and the Everand/Medium copies of the Atlantic article were refused by the permission classifier (walled copies), so Netflix's 2014 details come from secondary excerpts and the Irish Times. files.grouplens.org has an invalid certificate, so GroupLens README license text was read only through a third-party mirror of the ml-100k README. quanticfoundry.com, letterboxd.com, mobygames.com and netflixtechblog.com return 403 to fetch tools; where I relied on search-result summaries instead of the page itself I say so. I did not use any API key or read any repository file; counts that need IGDB or TMDB credentials are listed as gaps. "Observed" means I made an unauthenticated request to a public endpoint on 2026-10-29.

## Netflix: human taggers, altgenres, and the 2024 shift to descriptive tags

### Takeaway
Netflix is the only large expert-scored graded film vocabulary I found: paid, trained taggers scored titles on many content dimensions from a long manual, and a script combined tags into 76,897 micro-genres (Madrigal's count, January 2014). The scale is reported as 1 to 5 but I could not read the Atlantic text itself. In January 2024 Netflix said it would likely drop the percent match in favor of more than 3,000 descriptive tags, with about 30 full-time staff on tags. None of it is available to outside apps.

### Cited Findings
- Alexis Madrigal (The Atlantic, published January 2014; the blog Pixel Envy links it on January 2, 2014) scraped Netflix and counted 76,897 micro-genres; Netflix calls them "altgenres" — [Waterloo course page quoting the article](https://poetry-contingency.uwaterloo.ca/netflix-algorithms-humans/); [Refinery29, Jan 2014](https://refinery29.com/en-us/2014/01/60036/netflix-has-76897-subgenres); [Pixel Envy, Jan 2 2014](https://pxlnv.com/linklog/how-netflix-reverse-engineered-hollywood/)
- Netflix "paid people to watch films and tag them with all kinds of metadata"; taggers worked from a 36-page training document on how to rate films, covering sexually suggestive content, goriness, romance levels, and narrative elements such as plot conclusiveness — [Benton Foundation excerpt](https://www.benton.org/headlines/how-netflix-reverse-engineered-hollywood); [Waterloo page](https://poetry-contingency.uwaterloo.ca/netflix-algorithms-humans/)
- Conflict on document length: Pixel Envy says the method began with a 24-page document Todd Yellin wrote himself, versus the 36-page training document above — [Pixel Envy](https://pxlnv.com/linklog/how-netflix-reverse-engineered-hollywood/) vs [Benton](https://www.benton.org/headlines/how-netflix-reverse-engineered-hollywood)
- Scale: an Irish Times piece (July 10, 2014) says attributes such as gore, "cerebral", "sad" and "upbeat" are rated one to five, and its gore example uses zero for no gore, so the working range looks like 0 to 5 — [Irish Times, Jul 2014](https://www.irishtimes.com/culture/film/trust-busters-and-monkey-boxing-why-netflix-watches-everything-you-watch-1.1860471) (read through the fetch tool's summary, not line by line). A FlowingData summary (Jan 3, 2014) is reported in search results as saying many values are scalar from 1 to 5 and every movie receives a romance rating — [FlowingData](https://flowingdata.com/2014/01/03/how-netflix-creates-movie-micro-genres/) (page returned 403; snippet only)
- Taggers also answer yes/no content questions (car chases, a bar setting, a monkey) and tag topics and qualities such as "critically acclaimed"; local taggers are recruited for cultural nuance (e.g. "witty" differs for Irish/British vs US audiences) — [Irish Times, Jul 2014](https://www.irishtimes.com/culture/film/trust-busters-and-monkey-boxing-why-netflix-watches-everything-you-watch-1.1860471)
- How altgenre names are made: engineers wrote a "rudimentary" script over the human tags; Madrigal reverse-engineered a template of region, adjectives, noun genre, then optional modifiers such as "Based On", "Set In", "About", and an age range — [Waterloo page](https://poetry-contingency.uwaterloo.ca/netflix-algorithms-humans/). Most frequent adjectives were "romantic", "classic", "dark", "critically acclaimed"; the 1980s was the most-used era — [Refinery29](https://refinery29.com/en-us/2014/01/60036/netflix-has-76897-subgenres)
- Count of the altgenres differs by report: 76,897 (Madrigal's scrape), "over 76,000" (Waterloo), "more than 75,000 microgenres" (Irish Times, Jul 2014) — sources above
- Tagger staffing: "over 40" hand-taggers per a Wired interview reported in 2012 — [Blavity quoting Wired](https://blavity.com/update-so-how-does-netflix-categorize-titles-in-its-film-tv-libraries); a team of 75 with 30 dedicated to tagging per a PC-WELT interview (date not verified) — [PC-WELT](https://www.pcwelt.de/article/1167915/netflix-pc-welt-interview-mit-dem-herrn-der-tags.html); the New York Times reported about 30 full-time employees working on tags (January 2024) — [MobileSyrup, Jan 17 2024](https://mobilesyrup.com/2024/01/17/netflix-content-match-percentages-tags-report/)
- Todd Yellin, then a Netflix VP, started the tagging effort when he joined in 2005 — [Daily Dot](https://lede-v2.dailydot.com/netflix-tagger-program) (low-authority, undated) 
- January 2024: Netflix told IndieWire it would "likely" drop the match percentage from the title pop-up; Netflix uses over 3,000 tags to describe titles (example tags: "suspenseful", "exciting", "mind-bending", "epic world"); Netflix told the NYT that the chance of watching drops "precipitously" after 53 seconds of browsing — [MobileSyrup, Jan 17 2024](https://mobilesyrup.com/2024/01/17/netflix-content-match-percentages-tags-report/). Reports disagree on timing; one says the feature was still visible on Netflix UK in January 2024 and Netflix gave no removal date — summarized from [Voi](https://voi.id/en/amp/350392) and [TechRound](https://techround.co.uk/news/netflix-remove-feature-browse-page-soon) via search results; I did not confirm whether removal shipped
- Netflix's help center describes recommendation inputs about titles as genre, categories, actors, release year and says nothing about tags or the match score — [Netflix Help Center](https://help.netflix.com/en/node/100639) (read 2026-10-29)
- Netflix tech-blog items exist (Video Annotator, 2024, builds video classifiers with vision-language models and active learning; AVA image frames) but the blog returned 403, so I did not read them — known only via [search summary of a podcast page](https://metacast.app/podcast/snacks-weekly-on-data-science/qJ6911rU/building-video-classifiers-with-vision-language-models-and-active-learning-netflix/r4oJYEp0)

### Inferences
- The 2014 system is graded (scalar scores per attribute) and human-produced; the 2024 tag vocabulary (3,000+) is a different unit from the 76,897 altgenres, which were combinations of a smaller set of tags with genre nouns.
- Do not state "1 to 5" as settled in the final report; say "reported as one to five, with zero used for absence in at least one example".
- Nothing here is licensable: no public feed, no API found.

### Gaps
- Full Atlantic text (exact scale, full attribute list, how many attributes) not read.
- Netflix Tech Blog posts on tagging/machine tagging not read (403); no first-party Netflix statement beyond the help center page.
- Whether the match percentage was actually removed after January 2024 not confirmed.

## MovieLens Tag Genome (and the Book Genome)

### Takeaway
A dense movie-by-tag matrix of continuous 0 to 1 relevance scores (about 1,100 tags x 9,734 movies), predicted by a model from user tags, ratings and review text and checked against a 5-point user survey; the original model's mean absolute error is about 0.83 points on that 1-to-5 scale (about 0.21 on 0 to 1). It is research data: redistribution is not normally permitted and the MovieLens README terms I could verify bar commercial use without permission.

### Cited Findings
- Paper: Vig, Sen, Riedl, "The Tag Genome: Encoding Community Knowledge to Support Novel Interaction", ACM TiiS 2(3):13, 2012, DOI 10.1145/2362394.2362395; evaluates several learning models against user-provided ground truth; applied in Movie Tuner, which lets users move to nearby items along tag dimensions; 7-week field trial with 2,531 users plus a survey — [researchr record](https://researchr.org/publication/VigSR12); [DOI](https://dx.doi.org/10.1145/2362394.2362395); 157 citations on [Semantic Scholar, read 2026-10-29](https://api.semanticscholar.org/graph/v1/paper/DOI:10.1145/2362394.2362395?fields=citationCount)
- Method: multilevel nonlinear regression predicting movie-tag relevance from tag applications, ratings, and review text; eight features including tag-applied (binary), LSI similarity of tags and of review text, tag frequency in reviews, average rating, rating similarity — [Kotkov, Maslov, Neovius, SIGIR 2021](https://research.abo.fi/ws/files/50027691/3404835.3463019.pdf) (read from the PDF; CC BY 4.0 per [ir.webis.de record](https://ir.webis.de/anthology/2021.sigirconf_conference-2021.191/) via search)
- Ground truth: users rated how strongly a tag applies to a movie they had watched on a 5-point Likert scale from "not at all" to "very strongly"; 58,903 responses, 7,740 marked "not sure", 51,163 usable — [Kotkov et al. 2021](https://research.abo.fi/ws/files/50027691/3404835.3463019.pdf)
- Human noise: only 5,942 of 40,013 rated movie-tag pairs had more than one score; mean standard deviation 0.74 points (0.71 for objective tags such as "courtroom", 0.87 for subjective tags such as "bad acting"); the paper states a minimum possible mean absolute error of 0.19 for the whole dataset and 0.041 for its test set (the unit is not spelled out; most pairs have a single score, so these floors are weak) — [Kotkov et al. 2021](https://research.abo.fi/ws/files/50027691/3404835.3463019.pdf)
- Measured accuracy (10-fold cross-validation, MAE on the 1-to-5 scale, which is the 0-to-1 error multiplied by 4): predict-the-average baseline 1.451, Vig et al. model 0.833, TagDL neural model 0.811 (2.6% better) — [Kotkov et al. 2021](https://research.abo.fi/ws/files/50027691/3404835.3463019.pdf)
- Subjective vs objective tags: of 1,084 survey tags, 821 were judged objective and 263 subjective by two judges (Cohen's kappa 0.4, "fair") — [Kotkov et al. 2021](https://research.abo.fi/ws/files/50027691/3404835.3463019.pdf)
- Releases: 2014 genome "computed using a machine learning algorithm on user-contributed content" (tags, ratings, textual reviews), 1,128 tags, 9,734 movies (blog dated April 2, 2014) — [GroupLens blog](https://grouplens.org/blog/author/jvig/). The March 2014 dataset page rounds this to about 11 million scores, 1,100 tags, 10,000 movies — [GroupLens Tag Genome 2014](https://grouplens.org/datasets/movielens/tag-genome/). The December 2021 release has 10.5 million scores, 1,084 tags, 9,734 movies and includes the inputs to regenerate the genome by the 2012 method or the Kotkov 2021 method — [GroupLens Tag Genome 2021](https://grouplens.org/datasets/movielens/tag-genome-2021/). MovieLens 20M/Latest carry 12 million/14 million scores over 1,100 tags and MovieLens 25M 15 million over 1,129 tags — [GroupLens MovieLens](https://grouplens.org/datasets/movielens/)
- The tag count differences (1,128, 1,100, 1,129, 1,084, 1,071) are different releases and rounding, plus Kotkov removing actor and director names (1,071 tags); 9,734 movies x 1,128 tags is about 11.0 million, which matches the 11 million figure, so the matrix is dense — arithmetic on the sources above
- Book Genome: scores generated with two algorithms, Glmer (Vig 2012) and TagDL (Kotkov 2021); code on GitHub; tag and book counts not on the page — [GroupLens Book Genome](https://grouplens.org/datasets/book-genome/)
- License: the GroupLens genome pages state no license and no commercial-use terms (only a copyright line); the MovieLens page tells users to read each README, requires a request form for permission, and says "We typically do not permit public redistribution" — [GroupLens Tag Genome 2021](https://grouplens.org/datasets/movielens/tag-genome-2021/); [GroupLens MovieLens](https://grouplens.org/datasets/movielens/). The ml-100k README (read via a third-party mirror, not the genome README) says the user "may not use this information for any commercial or revenue-bearing purposes" and may not redistribute without separate permission — [mirror of MovieLens README](https://git.camilstaps.nl/university/NWI-IBI008-Data-Mining/tree/Assignment%205/data/MovieLens_README.txt). Search results report the same clause in other GroupLens READMEs but wording varies by release — via search summary

### Inferences
- Raters themselves disagree by about 0.74 points on pairs rated more than once, and the model's average error is about 0.8 points, so an individual movie-tag score is coarse on a 5-point scale; it is better as a ranking signal than as a displayed number.
- The method (tags + ratings + review text -> regression) is reproducible, but the data are non-commercial research data. Treat MovieLens/Tag Genome as unusable in a commercial app without a written GroupLens permission.

### Gaps
- Original TiiS paper figures (RMSE/correlation in the paper itself, Movie Tuner trial outcomes) not read; the numbers above come from the 2021 paper that reproduces the baseline.
- Exact license text of the tag genome READMEs not read (certificate error); the commercial clause is confirmed only on the ml-100k README via a mirror.
- Book Genome size not found.

## Jinni Entertainment Genome (short)

### Takeaway
Jinni's "Entertainment Genome" combined a taxonomy built by film professionals with automatic indexing of metadata and reviews by proprietary NLP; reported size is about 2,200 "genes". The consumer service shut in 2015 and it is not a data source anyone can license from a public API.

### Cited Findings
- Taxonomy created by film professionals; titles indexed automatically from metadata and reviews using a proprietary NLP solution that assigns semantic tags to content and users; attributes include mood, tone, plot, structure — [Wikipedia, Movie Genome](https://en.wikipedia.org/wiki/Movie_Genome) (page gives no gene count and no date; sources cited are 2008-2009)
- About 2,200 "genes" is reported in press coverage of Jinni — [Nocamels, 2010](https://nocamels.com/2010/10/jinni-helps-your-computer-understand-mood-and-sentiment-so-you-can-find-just-the-movie-youre-looking-for/) (figure from a search-result summary; I did not open the page)
- Microsoft licensed Jinni's semantic video discovery for Xbox Video; Jinni closed its public service in June 2015 and sells to pay-TV/OTT operators and advertisers — [GamesBeat](https://gamesbeat.com/xbox-video-getting-improved-content-discovery-from-jinni-movie-search-engine/); [Wikipedia, Jinni](https://en.wikipedia.org/wiki/Jinni_(search_engine)) (via search summary)

### Inferences
- The gene count was marketing-reported and is the one number that varies (2,000 vs 2,200 vs "thousands").

### Gaps
- No accuracy data, no scale (binary vs graded), no license; the company is B2B only.

## Letterboxd themes and nanogenres

### Takeaway
Letterboxd's "themes" and "nanogenres" are not a Letterboxd-built vocabulary: they come from Nanocrowd, which clusters the language in viewers' reviews into small collections. No count and no API exposure found; Letterboxd's API policy excludes recommendation projects.

### Cited Findings
- Letterboxd partnered with Nanocrowd in March 2022 to show nanogenres and similar-film recommendations — [Wikipedia, Letterboxd](https://en.wikipedia.org/wiki/Letterboxd); [Nanocrowd post dated March 1, 2022](https://nanocrowd.com/nanocrowd-letterboxd/). This conflicts with the brief's "around 2023 to 2024": the integration is dated 2022 by both sources
- Nanocrowd's ViewerVoice platform clusters titles into nanogenre collections by the emotional content of viewer reviews, each capturing "a specific reaction"; nanogenres roll up into broader themes and genres; the platform uses reviews from Letterboxd and other sites; the post gives no total count and no scale; example: Looper returns 72 similar films — [Nanocrowd on Letterboxd, Mar 1 2022](https://nanocrowd.com/nanocrowd-letterboxd/)
- Nanocrowd describes film-page links for Similar Films, Themes and Nanogenres — [Nanocrowd](https://nanocrowd.com/viewers-reactions-light-your-way-to-find-great-things-to-watch/) (via search summary)
- A blogger found the stats page did not explain nanogenres and that clicking one did not surface new recommendations — [Laura Michet](https://blog.lauramichet.com/weird-madness-chaos/) (via search summary; opinion)
- Letterboxd API: access by request only; not granted for data-analysis, visualization or recommendation projects, LLM/GPT use, private projects, or anything that recreates paid-subscription features; the page points developers to TMDB for film metadata — [Letterboxd API page](https://letterboxd.com/api-beta/) (page returned 403; read through a search-result summary). The general terms bar competing businesses and automated extraction — [Letterboxd terms](https://letterboxd.com/terms) (search summary)

### Inferences
- Nanogenres are an unsupervised review-text clustering product (membership, not graded scores), owned by a third party, so there is nothing to fetch even if a request were approved.

### Gaps
- Number of themes/nanogenres, whether the API returns them, and Nanocrowd's licensing terms: not found.

## Steam user-defined tags (games)

### Takeaway
Steam has about 429 tags in total (observed 2026-10-29), each applied by players as a binary vote and shown with a vote weight, with only the top 20 per game exposed. Valve uses the top 20 tags to find similar games. There is no documented official fetch and the terms around reuse are old and personal-use oriented; SteamSpy offers tags with votes.

### Cited Findings
- Launch: February 12, 2014 beta, "Tag" any title with genres, themes, attributes or any other term; most popular tags shown on the product page — [Valve announcement, Feb 12 2014](https://store.steampowered.com/news/12398)
- August 11, 2014: beta label removed; tags applied "more than 4 million times"; Valve merged separate per-language tag pools into one globally translated list and merged near-duplicates (four mod-friendly variants became one "Moddable" tag); "More like this" drew about three times the traffic; "Recommended for you" now based on recently played games — [Valve announcement, Aug 11 2014](https://store.steampowered.com/news/14128)
- Steamworks doc: "hundreds of approved tags"; non-limited players, developers and moderators can add tags; a tag's weight grows as more players apply it; tags are ordered by weight and developers set the initial order in the Tag Wizard; Steam uses a game's top 20 tags to find similar games; overlap matters more than order; less common tags carry more weight than very common ones like "Action" — [Steamworks, Steam Tags](https://partner.steamgames.com/doc/store/tags) (read 2026-10-29)
- Observed 2026-10-29: the store endpoint `store.steampowered.com/tagdata/populartags/english` returned 429 tags (names like Indie, Action, Singleplayer, Cricket, Rugby, Reboot); `api.steampowered.com/IStoreService/GetTagList/v1/?language=english` returned tag ids and names without authentication
- Observed 2026-10-29: the Elden Ring store page embeds its top 20 tags with raw vote counts (Souls-like 7,655; Open World 5,609; Dark Fantasy 5,338; RPG 5,107; Difficult 5,007); `IStoreBrowseService/GetItems/v1` with `include_tag_count` returned `tagids` and a `weight` per tag (Souls-like 1,079) where weight equals vote count divided by about 7.09 for every tag, so weight is a normalized count. Asking for 100 tags still returned at most 20 on all nine of nine valid sampled apps (Stardew Valley, Balatro, Hades, Hollow Knight, Baldur's Gate 3, Football Manager 2024 which returned 13, Let Them Trade, The Last of Us Part I, Dragon's Dogma 2)
- The public `store.steampowered.com/api/appdetails` response has no tags; it returns `genres` (e.g. Action, RPG) and `categories` (Single-player, Co-op, PvP, Steam Cloud...) (observed 2026-10-29 for appid 1245620)
- SteamSpy API: `appdetails` returns "tags - game's tags with votes"; data refreshes once a day; allowed 1 request per second (1 per 60 seconds for the 'all' request); some apps hidden at developer request — [SteamSpy API doc](https://steamspy.com/api.php) (read 2026-10-29)
- Terms: the Steam Web API Terms of Use (last updated July 2010) license the API and "Steam Data" to distribute to end users "for their personal use via your Application", cap calls at 100,000 per day, forbid implying Valve endorsement and unsolicited marketing, and Valve may change or end the API without notice — [Steam Web API Terms](https://steamcommunity.com/dev/apiterms) (read 2026-10-29). The Steam Subscriber Agreement grants a personal, non-commercial license to Content and Services unless commercial use is expressly allowed (reading by a third party, not legal advice) — [ConductAtlas analysis](https://conductatlas.com/platform/steam/steam-subscriber-agreement/provision/CA-P-029790/non-exclusive-personal-non-commercial-use-license/); [agreement](https://store.steampowered.com/agreement). I found no clause naming tags or scraping specifically

### Inferences
- Steam tags are crowd-produced, effectively graded by vote share per game (a binary label plus a vote count), with the genre-like and the descriptive ("Atmospheric", "Great Soundtrack") tags in one vocabulary of about 430. They are the richest free crowd game vocabulary, but the top-20 cap means long-tail attributes are cut off per game.
- Whether a commercial app may store Steam tags is unresolved by what I could read: the unauthenticated store endpoints are not in the documented Web API, and the written terms are personal-use oriented. Treat as a legal question, not a technical one.

### Gaps
- Coverage across the long tail of games (share of games with at least 5, 10 or 20 tags) not measured; I sampled only ten apps.
- Valve's current use of tags in recommendations beyond the top-20 statement and the 2014 post is not published in what I read.
- SteamSpy's own terms and its current availability for commercial use not found.
- Console-only and non-Steam games have no Steam tags (obvious but not sourced).

## IGDB: genres, themes, player perspectives, game modes, multiplayer modes, keywords

### Takeaway
IGDB offers small, curated, unscored taxonomies (23 genres, 22 themes, 7 player perspectives, 6 game modes per its contribution guidelines) plus free-text keywords and per-platform multiplayer-mode records; every attribute is binary and crowd/editor contributed. It is free and cacheable, but commercial use is described inconsistently within the docs: a commercial partnership with user-facing attribution is the stated route.

### Cited Findings
- Endpoints `/genres`, `/themes`, `/keywords`, `/player_perspectives`, `/game_modes`, `/multiplayer_modes`; the taxonomy endpoints return only id, name, slug, url, created_at, updated_at, checksum (no weights, no scores); the games object carries `genres`, `themes`, `keywords`, `player_perspectives`, `game_modes`, `multiplayer_modes`, `similar_games` — [IGDB API docs](https://api-docs.igdb.com/) (public page read 2026-10-29)
- Multiplayer mode records are per game and per platform with fields campaigncoop, dropin, lancoop, offlinecoop, offlinecoopmax, offlinemax, onlinecoop, onlinecoopmax, onlinemax, splitscreen, splitscreenonline — [IGDB API docs](https://api-docs.igdb.com/)
- Genres (23): Adventure, Arcade, Card & Board Game, Fighting, Hack and Slash/Beat 'em up, Indie, MOBA, Music, Pinball, Platform, Point-and-Click, Puzzle, Quiz/Trivia, Racing, RTS, RPG, Shooter, Simulator, Sport, Strategy, Tactical, Turn-based Strategy, Visual Novel; defined as classification "based on its gameplay" — [IGDB contribution guidelines, Genres](https://github.com/twitchtv/igdb-contribution-guidelines/wiki/Genres)
- Themes (22): 4X, Action, Business, Comedy, Drama, Educational, Erotic, Fantasy, Historical, Horror, Kids, Mystery, Non-fiction, Open World, Party, Romance, Sandbox, Science fiction, Stealth, Survival, Thriller, Warfare; defined as classification by visual or narrative features rather than gameplay — [IGDB contribution guidelines, Themes](https://github.com/twitchtv/igdb-contribution-guidelines/wiki/Themes)
- Player perspectives (7): Auditory, Bird View/Isometric, First Person, Side View, Text, Third Person, Virtual Reality — [IGDB contribution guidelines, Player Perspectives](https://github.com/twitchtv/igdb-contribution-guidelines/wiki/Player-Perspectives)
- Game modes (6): Single Player, Multiplayer, Co-Op, Split Screen, MMO, Battle Royale — [IGDB contribution guidelines, Game Modes](https://github.com/twitchtv/igdb-contribution-guidelines/wiki/Game-Modes). These lists come from the contribution wiki, not a live API query, so IGDB may have added entries since (I had no credentials to query)
- Keywords: described as "words or phrases that get tagged to a game", e.g. "world war 2", "steampunk"; the guidelines call them the third level of categorization; no total count, no cap per game, no moderation rule stated — [IGDB API docs](https://api-docs.igdb.com/); [IGDB contribution guidelines, Keywords](https://github.com/twitchtv/igdb-contribution-guidelines/wiki/Keywords)
- Scale of the database: Wikipedia reports 428,000 games (196,500 DLC or re-releases) as of March 2023; user-contributed edits are published after IGDB staff validation — [Wikipedia, IGDB](https://en.wikipedia.org/wiki/IGDB)
- Terms: the getting-started text says the API is "free for non-commercial usage under the terms of the Twitch Developer Service Agreement" with a commercial partnership via partner@igdb.com; the business FAQ on the same page says the API is free for both non-commercial and commercial projects, commercial partnership requires "user facing attribution" to IGDB.com, local storage and caching are allowed ("we prefer" it), and data may be kept if the partnership ends. Rate limit 4 requests per second — [IGDB API docs](https://api-docs.igdb.com/) (the two statements on the page are not identical in scope; flagged as an internal inconsistency)
- A Twitch/IGDB staff reply on January 6, 2020 said an app asking about commercial use should be fine "currently" with a community update on commercial specifics to follow — [Twitch dev forum](https://discuss.dev.twitch.com/t/commercial-use-of-igdb-api/23567)
- Newer item: IGDB has a beta MCP server with `semantic_search_games` ("embeddings + re-ranking") and an `aggregate` tool, requiring separate MCP credentials; the page says features may change without notice — [IGDB API docs](https://api-docs.igdb.com/)

### Inferences
- IGDB attributes carry no per-game strength, so they can only support filtering and set-overlap similarity, not graded matching.
- Per the brief, Verso mirrors only genres (not themes, player_perspectives, game_modes, keywords or multiplayer_modes) from IGDB; those fields cost no extra access or license, since they come from the same free API under the same terms. The open question is signal quality and per-game coverage, not availability.

### Gaps
- Coverage on popular versus long-tail games (share of games with any theme or any keyword), keyword vocabulary size, and keyword quality: not measured and not found in public sources (needs an authenticated count; IGDB's MCP `get_entities` reports record counts but needs separate credentials).
- Twitch Developer Service Agreement text not read directly.
- Third-party remarks that crowd data varies in quality are generic and weak evidence.

## Quantic Foundry Gamer Motivation Model

### Takeaway
Twelve motivations (six pairs, three clusters) measured by survey on people, built by factor analysis on a very large self-selected sample; per-game profiles are derived from respondents' favorite games and sold as custom audience reports to studios, not published as a licensable table.

### Cited Findings
- Structure: 12 motivations in six pairs (Action: Destruction, Excitement; Social: Competition, Community; Mastery: Challenge, Strategy; Achievement: Completion, Power; Immersion: Fantasy, Story; Creativity: Design, Discovery) and three clusters (Action-Social "bright", Mastery-Achievement "tall", Immersion-Creativity "wide") — [Quantic Foundry Gamer Motivation Model reference (PDF)](https://quanticfoundry.com/wp-content/uploads/2019/04/Gamer-Motivation-Model-Reference.pdf) (read from the PDF; the brief's "6 clusters" corresponds to the six pairs)
- Method: online 5-minute survey, factor analysis iterated until stable factors emerged; Cronbach's alpha 0.75 or higher, test-retest r = .73, moderate correlations with Big Five traits — [reference PDF](https://quanticfoundry.com/wp-content/uploads/2019/04/Gamer-Motivation-Model-Reference.pdf)
- Sample and bias: the PDF states 1.25 million+ gamers (unique IPs), 74% male, median age 23, 33% North America, about 80% recruited through social-media sharing, no incentive — [reference PDF](https://quanticfoundry.com/wp-content/uploads/2019/04/Gamer-Motivation-Model-Reference.pdf). Sample figures differ by source and date: 30,000+ at the July 2015 first version (FAQ), 140,000 (2015 post), 400,000+ (GDC 2019 talk), 1.25 million (this PDF), 1.75 million (homepage), over 2 million (Player Driven interview) — [QF how-we-developed-v2, 2015](https://quanticfoundry.com/2015/07/20/how-we-developed-the-gamer-motivation-profile-v2/); [GDC Vault](https://gdcvault.com/play/1025742/contactUs); [Player Driven](https://playerdriven.substack.com/p/quantic-foundrys-nick-yee-on-gamer) (the older figures via search summaries)
- Per-game data: respondents list favorite games, "our data links game titles/franchises with demographic and motivation variables"; output is audience percentile ranks per motivation versus the average gamer for a given game or franchise — [reference PDF](https://quanticfoundry.com/wp-content/uploads/2019/04/Gamer-Motivation-Model-Reference.pdf). The Player Driven interview says the consumer recommender finds the 1,000 most similar gamers and surfaces popular games among them, and publishes no per-game motivation figures — [Player Driven](https://playerdriven.substack.com/p/quantic-foundrys-nick-yee-on-gamer)
- Commercial offering: custom analyses, portfolio reviews and custom surveys for studios; no published pricing; a sample report states it is for the recipient's sole use and needs written permission to share — [Player Driven](https://playerdriven.substack.com/p/quantic-foundrys-nick-yee-on-gamer); report-terms claim comes from a search summary of an industry-library listing and is not verified. A competitor (Solsten) argues the model rests on behavioral data from a few games — [Solsten](https://solsten.io/blog/solsten-vs-quantic-foundry) (competitor claim)

### Inferences
- The 12 motivations are a user-side dimension, not an item attribute set; mapping them to games requires either Quantic Foundry's audience reports (not publicly licensable) or building the mapping yourself from users' own rankings.
- Use as a conceptual vocabulary (12 labeled axes) is free; use of its data is a sales conversation.

### Gaps
- No public per-game motivation table found; no licensing terms found; quanticfoundry.com returned 403 to fetch tools.

## GameRefinery (now Liftoff): mobile game feature taxonomy

### Takeaway
A paid B2B analyst taxonomy for mobile games: 260 manually tracked features, plus ML-detected tags for 100k+ games; not an open data source.

### Cited Findings
- Analysts manually analyze and track 260 features (core, meta, down to individual ad features) with more than 2,500 analyst overview pages; in October 2020 ML models trained on app-store metadata began automatically tagging 51 features and 45 visual styles, extending coverage to more than 100,000 games; automatic tags are replaced when analysts fully analyze a game — [GameRefinery, Oct 29 2020](https://gamerefinery.com/product-update-october-2020-automated-tags)
- Genre taxonomy is three layers (four categories, genres, 52 subgenres; each game gets exactly one of each) — [GameRefinery help docs](https://docs.gamerefinery.com/en/articles/2278730-what-are-categories-genres-and-subgenres) (undated)
- A 2020 add-on assigns each game player archetypes, sold as a paid feature — [Game World Observer, May 21 2020](https://gameworldobserver.com/2020/05/21/gamerefinery-now-segments-players-motivations-archetypes) (via search summary)
- The service sits under Liftoff ("Back to Liftoff" navigation on the site) — [GameRefinery site](https://gamerefinery.com/product-update-october-2020-automated-tags)

### Inferences
- Mobile-only and subscription; not relevant to a Steam/console/PC game-ranking app except as a model for how to define a feature checklist.

### Gaps
- Current (2026) feature count and any public data license not found; accuracy of the ML tags not published in what I read.

## Glitchwave, Rate Your Music descriptors, and MobyGames

### Takeaway
Glitchwave and RYM use community-voted genres and descriptors; MobyGames has an editorial taxonomy and a keyed API. I could not read primary terms or attribute counts for any of the three.

### Cited Findings
- Glitchwave is the video-game site in the Rate Your Music family and the game equivalent of RYM; its game genres have subgenres (34 under the action category) — [Glitchwave wiki](https://www.glitchwave.com/wiki/Games); [Glitchwave genres](https://glitchwave.com/games/genre/) (via search summary)
- RYM changed in August 2024 so that genres and descriptors can be rated one to three stars; descriptors for songs are no longer inherited from albums; in December 2024 the genre queue stopped showing voting ratios — [RYM community posts via search summary](https://lr.eu.psf.lt/r/rateyourmusic) (secondary)
- MobyGames: personal non-commercial reprinting is allowed with credit; large-scale commercial database use needs direct contact; up to 20 screenshots may be used commercially or not with credit; a third-party doc says the API key stopped being free in September 2024; a MobyPro page references a "non-commercial API" tier; documented limit of 720 requests per hour was noted by a forum user — [MobyGames FAQ](https://Mobygames.com/info/faq6); [MobyPro](https://Mobygames.com/mobypro/); [third-party doc](https://www.moritzjung.dev/obsidian-media-db-plugin-docs/reference/mobygames) (all via search summaries; pages not opened)

### Inferences
- None of the three offers a graded vector; all are binary labels with voting or editorial control.

### Gaps
- Glitchwave descriptor counts, whether games have descriptors, any API or license; MobyGames API terms, price, attribute vocabulary; RYM terms. All unconfirmed.

## TMDB keywords (films)

### Takeaway
TMDB keywords are a free-form crowd vocabulary of about 98,000 distinct keywords (observed), available through a simple endpoint, but TMDB's current terms say the free API excludes commercial use and prohibit ML/AI use and derivatives of TMDB content.

### Cited Findings
- Endpoint: `GET /3/movie/{movie_id}/keywords` returns `id` and `keywords[]` of `{id, name}`; example movie 550 returns 15 keywords (e.g. "based on novel or book", "dystopia") — [TMDB API reference](https://developer.themoviedb.org/reference/movie-keywords). The append-to-response doc shows `append_to_response=videos,images` and does not mention keywords, so keyword support through append_to_response is not confirmed on the page I read — [TMDB docs](https://developer.themoviedb.org/docs/append-to-response)
- Observed 2026-10-29 in TMDB's public daily export `keyword_ids_10_29_2026.json.gz`: 98,126 keyword ids, names such as "prison", "underdog", "helsinki, finland", "factory worker", "guerrilla warfare" (people, places, plot devices, themes mixed; no grades, no categories) — [export file](http://files.tmdb.org/p/exports/keyword_ids_10_29_2026.json.gz)
- Observed 2026-10-29 in `movie_ids_10_29_2026.json.gz`: 1,266,484 movie ids; by TMDB's own popularity field, 460,120 have popularity of 1 or more, 9,287 have 5 or more, 2,100 have 10 or more — [export file](http://files.tmdb.org/p/exports/movie_ids_10_29_2026.json.gz)
- Terms (page read 2026-10-29, undated): free API access "does not permit any commercial use"; commercial use requires a separate written agreement that may involve fees; charging users for an app integrating TMDB or earning revenue from it counts as commercial; cache no longer than six months; the TMDB logo and a not-endorsed notice are required; ML/AI use of TMDB content is prohibited, and training or validating an AI system on TMDB content or collecting datasets of TMDB content is treated as commercial use; no "derivatives of the TMDB APIs or TMDB Content"; non-sublicensable — [TMDB API Terms of Use](https://www.themoviedb.org/api-terms-of-use)
- Quality: a Plex forum commenter calls TMDB keywords thin compared to IMDb (opinion, not a measurement); datasets describe TMDB as complete for popular films and thinner for obscure titles because contributions are voluntary — [Plex forum](https://forums.plex.tv/t/scrape-imdb-keywords-and-the-parental-guide/779709); [UCLA data note](https://globalcinemetrics.humspace.ucla.edu/data/) (both via search summaries)
- The Letterboxd API page itself points developers to TMDB for film metadata — [Letterboxd API page](https://letterboxd.com/api-beta/) (via search summary)

### Inferences
- Keyword coverage per film (share of films with 0, 1-5, 6+ keywords, split by popularity) cannot be read from public documents; it needs a sample through the API with a key. A stratified sample of a few hundred films by popularity bucket (using the export's popularity field) would answer it.
- Under the terms as read, even a tool that stores TMDB keywords, sends them with overview text to a model, or derives scores from them sits at or past the "derivative" and "ML/AI" prohibitions; the six-month cache limit also conflicts with long-lived mirroring. These are my readings of the terms, not legal advice.

### Gaps
- Keyword coverage by popularity, average keywords per film, and keyword quality: not measured or found.
- Whether commercial licenses allow ML use: not stated on the page.

## Comparison table and what a small commercial app could actually use

### Takeaway
The only large graded, expert- or model-scored vocabularies (Netflix tags, Tag Genome, Quantic Foundry, GameRefinery) are proprietary or non-commercial research data. The freely licensable game vocabularies (IGDB taxonomies and keywords, Steam tag counts through unofficial routes) are binary crowd or editor labels; for films, TMDB keywords are free-form and licensed non-commercially unless TMDB signs a commercial agreement.

### Cited Findings
| System | Domain | Attributes | Scale | Produced by | Coverage | Measured accuracy | Commercial availability |
|---|---|---|---|---|---|---|---|
| Netflix taggers and tags | Film, TV | 3,000+ tags (2024); 76,897 altgenres (2014); full attribute list unknown | Reported 1 to 5 (0 to 5 in one example); other tags binary | Trained human taggers plus scripts; ML added later | Full Netflix catalog | None published | Proprietary, no API found — [Waterloo](https://poetry-contingency.uwaterloo.ca/netflix-algorithms-humans/); [MobileSyrup](https://mobilesyrup.com/2024/01/17/netflix-content-match-percentages-tags-report/) |
| MovieLens Tag Genome | Film | 1,128 tags (2014); 1,084 (2021) | Continuous 0 to 1 per movie-tag | Regression/neural model over user tags, ratings, reviews | 9,734 movies, dense | MAE 0.83 (1-5 scale) vs 1.45 baseline; raters' own SD 0.74 on repeated pairs | Research data; redistribution not normally permitted; ml-100k README bars commercial use — [Kotkov 2021](https://research.abo.fi/ws/files/50027691/3404835.3463019.pdf); [GroupLens](https://grouplens.org/datasets/movielens/) |
| Tag Genome for books | Books | Not found | 0 to 1 | Glmer + TagDL | Not found | Not found | Same family of terms — [GroupLens Book Genome](https://grouplens.org/datasets/book-genome/) |
| Jinni Entertainment Genome | Film, TV | About 2,200 genes (press) | Unknown | Expert taxonomy plus NLP indexing | Not found | None | B2B only; consumer site closed 2015 — [Wikipedia](https://en.wikipedia.org/wiki/Movie_Genome) |
| Letterboxd themes/nanogenres | Film | Count unknown | Membership (clusters) | Nanocrowd NLP on reviews | Not found | None | No API exposure found; API excludes recommendation use — [Nanocrowd](https://nanocrowd.com/nanocrowd-letterboxd/); [Letterboxd API](https://letterboxd.com/api-beta/) |
| Steam tags | Games (Steam) | About 429 tags | Binary label with vote count (weight); top 20 per game exposed | Players, developers, moderators | Almost every Steam title (2014 Valve post); long tail unmeasured | None published | No official documented fetch; Web API terms (2010) personal-use; SteamSpy returns tags with votes — [Steamworks](https://partner.steamgames.com/doc/store/tags); [Valve 2014](https://store.steampowered.com/news/14128); [SteamSpy](https://steamspy.com/api.php) |
| IGDB genres/themes/perspectives/modes | Games | 23 / 22 / 7 / 6 | Binary | Editors and validated community edits | Not measured | None | Free; cache allowed; commercial via partnership with attribution — [IGDB docs](https://api-docs.igdb.com/) |
| IGDB keywords | Games | Free-form, count unknown | Binary | Community | Not measured | None | Same IGDB terms — [IGDB docs](https://api-docs.igdb.com/) |
| Quantic Foundry | Gamers (and by audience, games) | 12 motivations, 6 pairs, 3 clusters | Percentile ranks of audiences | Survey + factor analysis, self-selected sample 1.25M+ | Titles named by respondents | Alpha 0.75+; test-retest .73 | Custom paid reports; no public per-game table — [reference PDF](https://quanticfoundry.com/wp-content/uploads/2019/04/Gamer-Motivation-Model-Reference.pdf) |
| GameRefinery (Liftoff) | Mobile games | 260 features; 51 ML feature tags; 45 visual styles; 52 subgenres | Binary | Analysts, plus ML on store metadata | 2.5k analyst, 100k+ ML | Not published | Paid B2B — [GameRefinery](https://gamerefinery.com/product-update-october-2020-automated-tags) |
| MobyGames | Games | Not found | Not found | Editorial | Not found | None | Keyed API, no longer free per a third-party doc; commercial bulk use needs contact — [MobyGames FAQ](https://Mobygames.com/info/faq6) |
| Glitchwave / RYM | Games, music, film | Not found | 1 to 3 star ratings for descriptors (RYM, 2024) | Community voting | Not found | None | No API or license found — [RYM posts](https://lr.eu.psf.lt/r/rateyourmusic) |
| TMDB keywords | Film | About 98,126 keywords (observed 2026-10-29) | Binary | Community | Not measured | None | Free API excludes commercial use; ML/AI use and derivatives prohibited — [TMDB terms](https://www.themoviedb.org/api-terms-of-use) |

### Inferences
- What a small commercial app can legally fetch today with the least friction: IGDB genres, themes, perspectives, modes, multiplayer-mode flags and keywords (free, cacheable, attribution if a commercial partnership applies). For films, nothing richer than TMDB's genres and keywords is open, and those carry the commercial/ML restrictions above.
- Graded attribute vectors for items are not available from any licensable public source I found; the Netflix and Tag Genome approaches were built from either paid experts or large user tag and review corpora that the app would have to produce itself.
- The Tag Genome result implies a ceiling: even with dedicated labeled data, a model predicts a 1-to-5 tag strength to about 0.8 points average error, and raters themselves disagree by about 0.74 points, so any attribute score an app derives from ranking behavior should be expected to be noisy for subjective tags and cleaner for objective ones.

### Gaps
- Items marked "not found/not measured" above, notably IGDB and TMDB coverage on popular versus long-tail titles (needs an authenticated sample), Steam long-tail tag coverage, Letterboxd counts, and the legal reading of the Steam, IGDB-Twitch and GroupLens genome terms by counsel.
