# Onboarding flows: SavePoint, Backloggd, GG, Steam's Interactive Recommender, the Xbox app, the PlayStation App (as of 2026-10-01)

Raw note from a research sub-agent of the first (stalled) inventory run on 2026-10-01, kept because its findings are dated and sourced, several from live visits to the sign-up pages (viewed, never submitted; no accounts created). Method caveats from the agent: its web search budget ran out partway; reddit.com was blocked, so user reports come from Trustpilot and the app stores.

## SavePoint (Two Average Gamers)

- Flow: the catalog of 35,349 games is searchable with no account; "Start tracking free" leads to a shared WordPress login at twoaveragegamers.com; "CREATE ACCOUNT" is labeled "STEP 1 OF 2... Set up your login. Profile details come next": Continue with Google, or username, email, password, and an optional newsletter box; step 2 unverified (it needs an account).
- Format: a credential form; no chips, no favorites search, no deck observed.
- Minimum items required: none (the free tier is "unlimited game logs"). Skippable: there is no taste step to skip.
- Imports: the free tier gets one manual Backloggd CSV upload. Steam, Xbox, and PSN linking is Pro-only (9 USD a month or 99 USD a year), reached later on a connections page: Steam through the official API, Xbox through OpenXBL, PSN through a manually copied NPSSO token. None of it is offered at sign-up.
- Asked later: the Decision Engine (mood, time available, platform, three picks for tonight) is Pro-only and on demand; it cannot run before a library exists.
- Screens before first useful result: none to browse; about two steps to a free account; the personalized result is behind payment.
- Company statement: the founder on the homepage: "I built the app I needed... Backloggd is great for video games. BGG is great for tabletop. Neither tells you what to actually play tonight." No metrics.
- Sources: company statements, direct observation 2026-10-01: [homepage](https://savepoint.twoaveragegamers.com/), [FAQ](https://savepoint.twoaveragegamers.com/faq), [Create an Account](https://www.twoaveragegamers.com/register/).
- Gaps: a naming collision with an unrelated "savepoint" app on Google Play (Save Point Studios, package gg.savepoint.app), not this product; no App Store listing found for the TAG SavePoint, which may be web-only; step 2 undocumented.

## Backloggd

- Flow: backloggd.com/users/sign_up, one form: username, password, email, first name, two consent boxes (terms; "I'm at least 13"), Register; email confirmation before the account works (user report); an empty library, everything afterwards manual.
- Format: a text form. The Discovery Engine is a filter panel (obscurity range, release years, genres, platform, exclude wishlist, backlog, and playing) over a global ratings list, not an onboarding wizard.
- Minimum items required: none. Skippable: everything after credentials and verification.
- Imports: none; no Steam, Xbox, PSN, or OAuth linking; logging is manual against an IGDB-backed search. The only import in this ecosystem runs the other way (SavePoint ingests Backloggd's CSV).
- Asked later: an optional bio; favorite-game profile slots (changelog 1.11.0, February 2024); the Discovery Engine, open to signed-in users since its 2025-06-24 beta launch, more useful as the library grows (library-aware filters added 2025-07-02 and 2026-01-12).
- Screens before first useful result: about two, and the result is globally rated games filtered by your library, not personal matching.
- Company statement: "Registration page updated for a better sign-up experience" (changelog 1.17.0, 2026-04-10). No metrics.
- Sources: company statements, direct observation 2026-10-01: [registration page](https://backloggd.com/users/sign_up), [changelog](https://backloggd.com/changelog/); teardown, [MakeUseOf, undated](https://www.makeuseof.com/backloggd-how-to-track-and-rate-video-games/); user reports, [Trustpilot, 2026-08-02 and 2026-02-06](https://www.trustpilot.com/review/backloggd.com).
- Gaps: no Reddit; whether a native app has a different first run.

## GG

- Flow: ggapp.io is browsable logged out (Explore, Trending); "Join GG" opens one modal: email, username, password, Join. That is the whole flow.
- Format: a three-field modal; no chips, favorites search, deck, or terms box in the modal.
- Minimum items required: none. Skippable: nothing else is asked.
- Imports: none at any tier. Elite (5 USD a month or 49 USD a year, confirmed live) buys profile backdrops, list pinning and cloning, ad-free browsing, early access; a competitor's teardown says the same ("no automated imports at all, on any tier").
- Asked later: an optional favorite-games showcase and Elite's customization.
- Screens before first useful result: no taste-personalized screens exist; Discover is "based on community feedback" (App Store description), visible logged out.
- Company statement: App Store notes for v1.7.0 (July 2020): "Removed the restrictive onboarding flow". 4.2 stars on 203 ratings (2026-10-01). No metrics.
- Sources: company statements, direct observation 2026-10-01: [ggapp.io](https://ggapp.io/), [Elite pricing](https://ggapp.io/elite); company statement, [App Store listing v1.11.0, 2025-04-27](https://apps.apple.com/us/app/gg/id1320588074) and its reviews (2019-11-25, 2020-08-12, 2022-10-01); teardown (competitor), [GG App Review, Two Average Gamers](https://www.twoaveragegamers.com/gg-app-review/).
- Gaps: the native app's first run not tested; no forum reports.

## Steam's Interactive Recommender

- Flow: a page inside the Steam store, gated behind sign-in; a live visit and a Wayback snapshot of 2026-01-05 both redirect anonymous visitors to Sign In; a 2021 snapshot reads "In order to use the Interactive Recommender, you need to sign into your Steam account." Signed in (not tested), a recommended-games grid with two post-hoc sliders, popularity and recency.
- Format: no explicit onboarding input ever. The model reads playtime, recency, and counts over about a user's fifty most-played games plus each candidate's release date, and excludes tags, reviews, and any survey (Valve's blog, 2019-07-11 and 2020-03-18). The sliders re-weight output; they do not seed it.
- Minimum items required: none to complete, but the model needs non-zero playtime; a third-party technical teardown (GitHub, undated) tested a three-game account with playtime on one and got "no recommendation at all" once that game was excluded: a real cold-start cliff for near-empty accounts.
- Skippable: nothing is asked; sign-in is mandatory to see the page.
- Imports: the Steam account is the ledger. Asked later: nothing, by design.
- Screens before first useful result: one for an account with playtime; potentially never for a new account until playtime accrues. Valve's own stated limitation is the new-release cold start ("can't recommend games that don't have players yet"); the teardown found the user-side version.
- Company rationale: a neural model trained on play behavior and release date so recommendations reflect what you actually play, accepting the cold-start gap rather than adding a survey (Valve, 2019 and 2020).
- Sources: company statements, [Wayback captures of the recommender page, 2021 and 2026-01-05](https://web.archive.org/web/2021/https://store.steampowered.com/recommender/) and the live redirect, 2026-10-01; company statements, Steam blog posts of [2019-07-11](https://store.steampowered.com/news/posts/?feed=steam_blog&enddate=1563000000) and [2020-03-18](https://store.steampowered.com/news/posts/?feed=steam_blog&enddate=1584723646); teardown, [woctezuma/steam-labs-recommender, GitHub](https://github.com/woctezuma/steam-labs-recommender).
- Gaps: the signed-in new-account screen not observed; the empty-state finding rests on the third-party teardown, consistent with Valve's design.

## The Xbox app

- Flow: install (Android updated 2026-09-29; iOS 2609.3.1 about 2026-09-30); the first screen is Microsoft account sign-in ("Sign in or sign up" plus "Set up a console"); then Home with friends, Game Pass, and "customized recommendations" for Store offers (store copy).
- Format: account sign-in only; no chips, deck, genre picker, or favorites. Minimum items: none. Skippable: sign-in is mandatory; nothing taste-related exists.
- Imports: the sign-in is the connection; the account holds the purchase and play ledger. Asked later: recommendations accrue passively from Store and account use, togglable in settings (a Microsoft support description, paraphrased; the page would not render).
- Screens before first useful result: about one to two. Aggregates: 1.7 million App Store ratings at 4.7; 2.32 million Play reviews, 100 million plus installs, 4.5 (2026-10-01).
- Sources: company statements, [Google Play listing](https://play.google.com/store/apps/details?id=com.microsoft.xboxone.smartglass) and [App Store listing v2609.3.1](https://apps.apple.com/us/app/xbox/id736179781), 2026-10-01, with reviews dated 2018 to 2026; teardown, [unstar.app, 2026](https://unstar.app/blog/xbox-app-wont-sign-in-button-does-nothing-reviews-2026); reference, [Wikipedia, Xbox (app)](https://en.wikipedia.org/wiki/Xbox_(app)).
- Gaps: the support page did not render; no new account created; no Reddit.

## The PlayStation App

- Flow: install; "Sign in to your account" with "Create an account for PSN" on the welcome screen (PlayStation support); optional console pairing (Settings, Pair Console to App, or a QR or manual code from a PS5); Home with friends' status, Store deals and news, trophies.
- Format: a PSN sign-in or creation form plus optional pairing; no chips, deck, favorites, or genre question. Minimum items: none. Skippable: the account is required ("An account for PlayStation is required to use this app", App Store); pairing is optional.
- Imports: the PSN account carries purchases and trophies; no library step. Asked later: none found; Sony documents only app settings (autoplay, mobile-data video quality).
- Screens before first useful result: about two, to Store deals and news, not a personalized list; no evidence of per-user collaborative recommendations. Aggregates: Play 1.1 million reviews, 3.5 stars, 100 million plus downloads; App Store 92 thousand ratings, 4.2 (2026-10-01). Reviews dated 2026-07-03, 2026-07-06, and 2026-08-16 complain about sign-in and account locks, not taste setup.
- Sources: company statements, [PlayStation App features and support](https://www.playstation.com/en-us/support/games/playstation-app-features/), [Google Play listing](https://play.google.com/store/apps/details?id=com.scee.psxandroid), [App Store listing v26.9.1](https://apps.apple.com/us/app/playstation-app/id410896080), 2026-10-01, with reviews 2021 to 2026; press, [Push Square, June 2026](https://www.pushsquare.com/news/2026/06/ps5-adds-custom-gta-6-start-up-screen-sony-rebrands-ps-app-as-pre-orders-go-live); reference, [Wikipedia, PlayStation App](https://en.wikipedia.org/wiki/PlayStation_App).
- Gaps: no account created; no Reddit; whether account creation on the welcome screen is a recent rollout is loosely sourced.

## Cross-app notes

Taste-onboarding depth tracks how platform-native the app is. Xbox, PlayStation, and Steam's recommender, all run by the platform holder, ask nothing: personalization is inferred from purchase and play history behind a mandatory sign-in, and a new or low-activity account gets an empty or generic state, not a substitute quiz; Steam's cold-start cliff is the best documented. The three independent trackers (SavePoint, Backloggd, GG) also ask no taste question at sign-up: a bare credentials form, an empty collection, and library-building as an ongoing manual search-and-log activity. Their smarter features (SavePoint's Decision Engine, Backloggd's Discovery Engine) need an existing library and sit behind later, opt-in navigation, one of them paywalled. The one platform-connection moment (SavePoint's Steam, Xbox, and PSN sync) is paid and deliberately high-friction for PSN, never a free sign-up offer. Two implications for Verso: there is no games-app precedent for "three favorites, then ten cards", so Verso's flow is more onboarding-forward than any comparable, which is defensible because its ranking needs comparison data where these apps fall back on community or behavioral signals; library links are post-onboarding progressive features in every app studied; and a "not enough comparisons yet" state must be designed for users who stop short of ten, the way Steam's recommender has to, rather than assuming the target is hit.
