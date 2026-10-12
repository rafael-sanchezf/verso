# Onboarding flows: Apple Music, YouTube Music, JustWatch (as of 2026-10-01)

Raw note from a research sub-agent of the first (stalled) inventory run on 2026-10-01, kept because its findings are dated and sourced. Method caveats from the agent: its web search budget ran out mid-task; several pages returned 403 or paywall redirects; web.archive.org could not be fetched; its clearest JustWatch sources date from 2019 to 2022.

## Apple Music

- Flow: (1) open Music; the Apple ID already exists at the OS level, so there is no in-app account step; (2) a subscribe or start-trial prompt if not subscribed (commercial, not personalization); (3) a genre screen of "bubbles"; (4) Next; (5) an artist screen of bubbles with a "More Artists" control; (6) Done; (7) a populated Listen Now tab.
- Format: a bubble field with a three-way gesture: one tap likes, a double tap loves (the bubble grows), tap and hold removes. The same mechanic for genres and then artists; no search box, checkboxes, or sliders.
- Minimum items required: none found.
- Skippable: not documented; progression is Next and Done. An Apple Community moderator confirmed the flow is one-time and cannot be re-triggered later.
- Imports: none during onboarding. A playlist transfer tool (Spotify and others, built with SongShift technology) lives in Settings, Apps, Apple Music, "Transfer Music from Other Music Services", with the US rollout reported through 2025.
- Asked later: long-press Love and Suggest Less Like This; one to five star ratings on library songs; favorite artists boosting Listen Now; the annual Replay; the transfer tool as a deferred import.
- Screens before first useful result: about 3 preference screens plus the subscription prompt. Confidence medium (corroborated from a 2015 teardown through Apple's current support page; not verified on a 2026 build).
- Company rationale: none; Apple documents the mechanic, not the reasoning. No metrics.
- Sources: company statement, [Get personalized recommendations in Music on iPhone, Apple Support](https://support.apple.com/guide/iphone/get-personalized-recommendations-iph2b1748696/ios), accessed 2026-10-01; teardown, [How to tell Apple Music what you like, iMore, updated 2015-08-19](https://www.imore.com/how-tell-apple-music-what-you); user report, [Apple Community thread 252974549](https://discussions.apple.com/thread/252974549); teardown, [The Apple Music Algorithm in 2026, 2026-04-28](https://beatstorapon.com/blog/the-apple-music-algorithm-in-2026-a-comprehensive-guide-for-artists-labels-and-data-scientists/); press, [MacRumors, 2025-05-14](https://www.macrumors.com/2025/05/14/apple-music-transfer-tool/); press, [AppleInsider, 2025-08-26](https://appleinsider.com/articles/25/08/26/apple-music-migration-tool-will-finally-help-us-spotify-users-switch).
- Gaps: no minimum or skip confirmed from primary sources; no 2026 screenshot verification; no metrics; no first-party rationale.

## YouTube Music

- Flow: (1) first launch, already signed into a Google Account; if that account has YouTube history, Home may already be tailored; (2) an artist-pick screen, a scrollable grid of recommended artists to tap; (3) Home populated from the picks plus existing Google signals; (4) optional, non-gating: a "Your music tuner" radio builder and a Samples tab.
- Format: tap-based artist tiles from recommendations, not a search box, genre chips, or sliders; genre narrowing is derived from the picks.
- Minimum items required: reported as five artists in two sources (2021, 2024); neither confirms an enforced floor.
- Skippable: not confirmed for the artist screen; the radio builder and Samples are optional.
- Imports: none as a step; the app inherits the Google account's YouTube history and Premium entitlement automatically, which YouTube's blog frames as recommendations already waiting.
- Asked later: Not interested on Home items; Don't recommend artist or channel; like and dislike on songs; a deeper radio builder asking for up to thirty favorite artists; friend-based Taste Match playlists once enough shared listening accumulates.
- Screens before first useful result: about 2. Confidence medium.
- Company statement: "The more you listen, the more fine-tuned your recommendations will be" (blog.youtube, 2024-07-12): ongoing listening matters more than the initial pick. No metrics.
- Sources: company statement, [Here's how to get started on YouTube Music, YouTube Blog, 2024-07-12](https://blog.youtube/news-and-events/get-started-youtube-music/); teardown, [How to Add Artists in YouTube Music, Alphr, 2021-06-16](https://www.alphr.com/add-artists-youtube-music/); teardown, [These 5 Tricks Helped Fix My YouTube Music Recommendations, How-To Geek, 2024-06-27](https://www.howtogeek.com/these-tricks-helped-fix-my-youtube-music-recommendations/); company statement, [Manage your recommendations and search results, YouTube Help](https://support.google.com/youtube/answer/6342839), accessed 2026-10-01.
- Gaps: no confirmed minimum or skippability; Page Flows and an eight-screen directory listing could not be rendered; a Billboard explainer was paywalled; a Medium teardown returned 403.

## JustWatch

- Flow (best reconstruction): (1) open the app or site; (2) optionally choose a sign-up method (email, Google, Facebook, Apple), described as deferrable, with search usable without an account; (3) select a country; (4) select the streaming services you subscribe to from a row of icons; (5) a catalog view (Popular, New, provider-filtered), where genre is a filter inside browsing, not an onboarding question; (6) sign-in prompted when the user first uses the Watchlist or wants sync.
- Format: service selection as tap-to-select icons; no genre-chip onboarding step was found in any source, a correction to the brief's assumption; the genre "Watchbar" is a persistent filter.
- Minimum items required: none; any number of services.
- Skippable: country and services adjustable later; account creation deferrable until Watchlist or sync; no step described as unskippable.
- Imports: sign-in methods only. No self-serve watch-history import at onboarding; one Google Play review describes support manually migrating TV Time history.
- Asked later: thumbs-style like and dislike on titles while browsing; a "Hide Seen/Disliked" feature named by a help article title (the article 404'd); sign-in gated to Watchlist use.
- Screens before first useful result: about 3 (country, services, catalog) with the account deferred, 4 to 5 with sign-up first. Confidence low to medium (sources 2019 to 2022).
- Company statement: none on the core onboarding. JustWatch TV, announced 2026-09-15, is built into the existing app and site so users move from discovery to watching without a new account, per press quoting CEO David Croyé and SVP Quentin Carbonell. No metrics.
- Sources: teardown, [TapSmart, 2019-06-28](https://www.tapsmart.com/tips-and-tricks/stream-via-justwatch-dont-search-individual-streaming-apps/); teardown, [TroyPoint, 2021-02-19](https://troypoint.com/justwatch/); teardown, [Wonder of Tech, about 2022-01-07](https://wonderoftech.com/justwatch-app/); press, [Consumer Reports, updated 2024-05-02](https://www.consumerreports.org/electronics-computers/streaming-media/find-where-shows-and-movies-are-streaming-a3855465221); company statements via press, [Cord Cutters News, 2026-09-15](https://cordcuttersnews.com/the-app-that-tells-you-where-to-stream-is-launching-its-own-streaming-service-with-free-movies-rentals-and-more/); company pages, [TV pairing](https://www.justwatch.com/tv/new) and [service integration](https://www.justwatch.com/us/service-integration).
- Gaps: sources disagree on whether the account step precedes or follows service selection; JustWatch's own getting-started article and current store screenshots were inaccessible; whether JustWatch TV adds a first-run prompt is unknown; an unattributable lead about a swipeable rating quiz could not be traced and is omitted.

## Cross-app notes

Apple Music and YouTube Music skip identity entirely because the platform account exists before the app opens, so screen one is taste input; JustWatch, without that, shows a sign-up choice near first launch and still defers it until a gated feature needs it. The two music apps use abstract taste selection (genre or artist bubbles and tiles) with no catalog browsing; JustWatch's onboarding is structural (which services you pay for) rather than taste-based, and its genre selector is a persistent filter, not an onboarding question. Apple Music's bubble gesture is the richest format found: like, love, and dislike in one tap vocabulary on one screen. All three defer their heavier asks (Apple's transfer tool, JustWatch's account and Watchlist gate) to settings or a later feature gate. The one first-party rationale across the three is YouTube's: ongoing listening matters more than the initial pick, an argument for a light first-run ask.
