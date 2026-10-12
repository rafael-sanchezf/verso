# What movie apps put on their Home screen

Looked 2026-10-06. Source: official iPhone App Store screenshots, saved in `docs/private/design/assets/home-references/`. These are marketing frames, not a live account. Anything not visible in a screenshot is marked unverified.

| App | Home tab called | Blocks from the top (what a card carries) | Question or filter on Home | Own list on Home | Screenshots (Home first) |
|---|---|---|---|---|---|
| Letterboxd | Unverified (first tab) | Popular this week; New from friends; Popular with friends (poster). (from release notes; the listing shows 2018-era frames, no Home) | No | Friends' activity yes; own watchlist no (unverified) | letterboxd-1 to 6 (film page, diary, review, list) |
| JustWatch | Home | "Users with similar preferences watched this" (poster, service logos, IMDb score, JustWatch %); "Most anticipated movies in theaters right now" | None on Home; type and service chips sit on the New tab | No, own Lists tab | justwatch-2 (Home), 1 (Popular), 4 (New) |
| Trakt | Home | Continue Watching (still, time remaining, title, runtime, check); Start Watching (poster, title, runtime); Upcoming Schedule (episode, "in 2 days"). Discover tab: Trending, Recommended, Anticipated | Mode chips at top (Media and two icons), purpose unverified | Yes, leads with it | trakt-2 (Home), 1, 5 (Discover), 6 |
| Plex | Discover | Chips Trending, Activity, People; Most Watchlisted This Week (poster); My Services (logos); Recommended On Your Services (poster) | Chips choose a feed; no question | No, separate Watchlist | plex-2 (Discover), 6 (On Demand) |
| Likewise | Home (For You) | Search bar "What's your mood?"; chips For You, New This Week, Trending, more; "Showing: TV & Movies, Books, Podcasts"; full-screen trailer card (poster, service badge, title, type, rating, year, friend avatars, genre chips, "Because you liked La La Land and Promising Young Woman") | Yes, mood as free text, plus a media filter | No, My Stuff tab | likewise-2 (Home), 3, 4, 5 |
| Mubi | Unverified | "MUBI Releases": stacked full-width stills with title art only | No | No (unverified) | mubi-2, 3 (curated collections) |
| Reelgood | Unverified (shown as Browse) | Your services row with Edit; New on Your Services (poster, rating, add); Popular Movies & TV; Most Anticipated. Listing last updated 2024-09 | Service row; Roulette (filter, then spin for a random pick) is a separate tab | No, Track tab | reelgood-2, 3, 5 (Roulette) |
| Netflix | Home | Chips Shows, Movies, Podcasts, New & Hot, Categories; hero (title, genre tags, Play, My List); rows such as Mobile Games, Podcasts: Now on Netflix | Type chips only | My List is under My Netflix in the screenshots; a Home row unverified | netflix-1 (Home), 3, 4 (My Netflix) |
| Apple TV | Home | Listing shows the Apple TV tab, not Home: hero carousel (title, type, genres, rating, one-line pitch, Play, add); Continue Watching. The Home tab itself is unverified | No | Continue Watching yes; watchlist unverified | appletv-1, 3 (Store) |
| Criterion Channel | Home | Hero carousel of collections (title art, blurb, See more); Popular Now (still, title, year, runtime); Featured Collections; Director Collections (film count); Programmers' Picks; Oscar Winners | No; sort and filter live on All Films | No | criterion-1, 3 (Home), 5 |
| Taste | For You | Chips For You, For Couples, For Friends; one card (still, title, year, type, service, "97% Match", "Recommended by" a named person, Watch Now). Listing last updated 2025-03 | Chips pick who you watch with | No | taste-1 (Home), 5 |

TV Time: the original listing (id431065232) returns nothing in the US store, so it is skipped. Movielens has no iPhone app.

## Observations, ranked

1. **No app asks how much time you have.** Runtime appears as card text (Trakt, Criterion, Plex detail) and never as a question or filter on Home. The only question on any Home is Likewise's "What's your mood?" search bar; Taste asks who you are watching with; Netflix and Plex chips choose a media type or feed.
2. **Reasons are rare and generic.** Likewise names two seed titles ("Because you liked..."), JustWatch labels a whole row "Users with similar preferences watched this", Taste shows a match percentage and a person's name, Plex says "Recommended on your services". None explains a pick from the user's own ratings beyond naming a title.
3. **Catalog first, self second.** Nine of eleven open on catalog or editorial: a hero, trending, new releases, or curated collections. Only Trakt opens on the user's own activity (Continue Watching, Start Watching, Upcoming). Apple TV puts Continue Watching under a hero. The watchlist lives in its own tab in every app where I could see it.
4. **Where to watch is the one card attribute everyone shares.** Service badges or a "your services" row appear on Home cards in JustWatch, Plex, Likewise, Reelgood and Taste (Trakt keeps them on the film page); three streaming guides build Home around the services the user subscribes to.
5. **Every Home is an endless scroll; none gives a short answer.** The closest to "decide for me" are Taste's single card and Reelgood's Roulette, a separate tab that returns one random title. Friends show up on Home only in Letterboxd (unverified), Likewise (avatars) and Plex (an Activity chip), and none shows a ranking position.

## Listings (all looked at 2026-10-06)

- Letterboxd: https://apps.apple.com/us/app/letterboxd/id1054271011 ; Home blocks from release notes: https://apkmirror.com/apk/letterboxd-limited/letterboxd/letterboxd-2-17-0-release
- JustWatch: https://apps.apple.com/us/app/justwatch-movies-tv-shows/id979227482
- Trakt: https://apps.apple.com/us/app/trakt-tv-time-to-watch/id1514873602
- Plex: https://apps.apple.com/us/app/plex-find-movies-and-tv-shows/id383457673
- Likewise: https://apps.apple.com/us/app/likewise-movie-tv-book-recs/id1264195462
- Mubi: https://apps.apple.com/us/app/mubi-stream-great-cinema/id626148774
- Reelgood: https://apps.apple.com/us/app/reelgood-streaming-guide/id1031391869
- Netflix: https://apps.apple.com/us/app/netflix/id363590051
- Apple TV: https://apps.apple.com/us/app/apple-tv/id1174078549
- Criterion Channel: https://apps.apple.com/us/app/the-criterion-channel/id1454275199
- Taste: https://apps.apple.com/us/app/taste-movie-tv-suggestions/id1361180197
