# Video game data sources for a backlog tracker and ranking app

Research date: September 7, 2026. Scope: what a hobby or indie developer can pull programmatically for a "Beli or Letterboxd for games" product. Official documentation was preferred, then maintained open source libraries, then community writeups. Several official pages (IGDB docs, Giant Bomb, MobyGames, Fandom terms, SteamGridDB API page, RapidAPI pricing) sit behind Cloudflare or JavaScript rendering; where I could not read the page directly I say so and cite what I could confirm.

Convention used below: "official" means the data owner publishes and supports the API; "unofficial" means reverse engineered or scraped, even if a well maintained library wraps it.

## 1. Summary table

| Source | Data | Official? | Auth | Cost | Risk |
|---|---|---|---|---|---|
| IGDB (via Twitch) | Catalog: titles, covers, screenshots, artworks, release dates, platforms, genres, themes, companies, summaries, videos, external store IDs, ratings, time to beat, popularity | Yes | Twitch app Client ID + client credentials OAuth token | Free; commercial use allowed with user facing attribution (partner agreement by email) | Low |
| RAWG | Catalog: titles, background image, screenshots, platforms, genres, tags, stores, Metacritic score, average playtime, ESRB | Yes | API key | Free: unlimited personal with attribution and backlink; commercial free to 20,000 req/month and under 100k MAU; paid tiers above | Medium |
| Giant Bomb | Catalog: games, releases, platforms, franchises, characters, images in 8 sizes | Yes (legacy) | API key query param | Free, non commercial only; 200 req/resource/hour | High |
| SteamGridDB | Community art: vertical/horizontal/square grids, heroes, logos, icons, by name or Steam/GOG/Epic/eShop ID | Yes (community site) | Free API key | Free; limits unpublished; terms page not readable by me | Medium |
| Steam storefront (appdetails, appreviews, CDN art) | Store metadata, header/capsule/library art, Metacritic score field, review summary | Undocumented Valve endpoints | None | Free; roughly 200 appdetails calls per 5 min per IP (community observed) | Medium |
| Wikidata / Wikipedia | Structured facts, cross database IDs (Steam, IGDB, HLTB, Metacritic, OpenCritic, MobyGames, store IDs), summaries | Yes | None; mandatory User-Agent | Free; CC0 (Wikidata), CC BY-SA (Wikipedia text) | Low |
| MobyGames | Deep historical catalog, covers, screenshots, credits, Moby Score, critic and player scores | Yes | API key | Paid: Hobbyist 9.99 USD/mo non commercial at 0.2 req/s; commercial from 99.99 USD/mo | Medium |
| Metacritic | Metascore and user score | No API; Fandom terms forbid automated access | n/a | Scraping only; legal exposure | High |
| OpenCritic | Top critic average, percent recommended, tier, review list | Yes, via RapidAPI | RapidAPI key | Basic free: 200 req/day, 25 searches/day, 4 req/s; paid tiers exist | Low to medium |
| Steam user reviews (appreviews) | review_score (0 to 9), description, positive/negative totals | Documented on Steamworks | None | Free; limit undocumented | Low to medium |
| Steam Web API (player data) | Owned games, playtime (total, 2 weeks, per OS, Deck), recently played, achievements, current player count, profile | Yes | Web API key; user must have public Game details | Free; 100,000 calls/day per key | Low |
| Steam OpenID | Account linking, returns SteamID64 | Yes | OpenID 2.0 | Free | Low |
| SteamDB / Steam Charts | Historical concurrent players | No; SteamDB forbids scraping, no API | n/a | n/a | High (do not scrape) |
| PlayStation Network (psn-api, PSNAWP) | Played titles with play duration to the second, play counts, first/last played, trophies, recently played | No; reverse engineered mobile app API | NPSSO cookie to OAuth tokens (refresh token about 2 months) | Free | High |
| Xbox via OpenXBL (xbl.io) | Title history with last played, achievements, per title MinutesPlayed stat, presence, Game Pass lists | No; third party proxy | OpenXBL API key (Microsoft sign in) | Free 150 req/hour; 5 to 35 USD/mo for 500 to 5,000 req/hour | Medium |
| Xbox via xbox-webapi-python | Same Xbox Live services directly | No; unofficial | Microsoft OAuth with your own Azure app | Free | Medium to high |
| Nintendo Switch (Parental Controls "Moon" API via nxapi) | Per day, per title playing time rounded down to 5 minutes, per user, since console was linked | No; reverse engineered | Nintendo Account session token for the Parental Controls app; console must be linked in Nintendo's app | Free | High (no reliable consumer path) |
| HowLongToBeat (howlongtobeatpy and friends) | Main story, main plus extras, completionist, all styles hours | No; scraping with obfuscated search key | None | Free; broke about 7 times between Aug 2024 and Aug 2026 | High |
| IGDB game_time_to_beats | hastily, normally, completely (seconds), submission count | Yes | Same as IGDB | Free | Low |
| Game Pass catalog (catalog.gamepass.com + displaycatalog) | Current Game Pass console, PC and EA Play lists | Undocumented Microsoft endpoints | None | Free | Medium |
| GeForce NOW list (static.nvidiagrid.net) | Supported games with store links | Semi official public JSON | None | Free | Low to medium |
| IsThereAnyDeal API v2 | Subscriptions a game is currently in, prices, bundles | Yes | API key (OAuth for user features) | Free; 1,000 req per 5 min; commercial OK if app is public; attribution requested | Low |
| PS Plus and Nintendo Switch Online catalogs | Catalog membership | No API | n/a | Scrape or curate manually | High |

## 2. Section A: game catalog and metadata

### 2.1 IGDB via the Twitch API

What it exposes. The v4 API at `https://api.igdb.com/v4/` covers games, alternative names, covers, screenshots, artworks, videos, release dates (with region and status), platforms and platform families, genres, themes, keywords, game modes, player perspectives, involved companies, franchises and collections, DLC and expansion relations, remakes and remasters, similar games, language supports, age ratings, websites, external games (IDs on Steam, GOG, Epic, Microsoft, PlayStation and others), popularity primitives, and `game_time_to_beats`. The docs also list a multiquery endpoint, webhooks, an MCP server, and CSV data dumps (dumps are listed under the partnership features).

Rating fields on `games`: `rating` and `rating_count` (IGDB user ratings), `aggregated_rating` and `aggregated_rating_count` ("Rating based on external critic scores"), `total_rating` and `total_rating_count` (blend of the two). All are 0 to 100 doubles.

Images. Every image object has an `image_id`; build URLs as `https://images.igdb.com/igdb/image/upload/t_{size}/{image_id}.jpg`. The API returns a default `url` using `t_thumb`. Sizes from the docs: `cover_small` 90x128, `cover_big` 264x374, `logo_med` 284x160, `screenshot_med` 569x320, `screenshot_big` 889x500, `screenshot_huge` 1280x720, `thumb` 90x90, `micro` 35x35, `720p` 1280x720, `1080p` 1920x1080. Append `_2x` to any size for retina, so `t_cover_big_2x` is 528x748. Removed or replaced images stay on the CDN for 30 days, which matters for cache design.

Auth. Create a Twitch account with two factor auth, register an application in the Twitch developer console, then request an app access token with `POST https://id.twitch.tv/oauth2/token?client_id=...&client_secret=...&grant_type=client_credentials`. The response includes `expires_in` (the example is about 64 days). Send `Client-ID` and `Authorization: Bearer` headers on every request. Requests are POST with an APIcalypse body such as `fields name,cover.image_id; where id = 1942;`.

Rate limits. 4 requests per second and up to 8 open requests at a time; excess returns 429.

Cost and terms. The getting started section says the API is free for non commercial use under the Twitch Developer Services Agreement and points commercial users to partner@igdb.com. The business FAQ on the same page is more generous: "The API is free for both non-commercial and commercial projects", commercial partnership asks for "user facing attribution to IGDB.com" in a static location, and storing or caching data locally is explicitly allowed and preferred ("we prefer if you store and serve the data to your end users"). Data retrieved may be kept even if a partnership ends. A 2020 Twitch developer forum thread has IGDB staff saying commercial use "should be fine" after the Pro tier was folded into the free tier. Practical reading: email partner@igdb.com before monetizing, add a visible "Data from IGDB.com" credit, and cache aggressively.

Recent changes. The docs carry an "Important Changes" notice moving enum fields to table based fields (for example `category` to `game_type`, `status` to `game_status`) with a six month migration window from February 18 to August 31, after which old names are removed. New code should use the new names.

Account linking. Not applicable; this is catalog data.

Stability risk. Low. Owned by Twitch (Amazon) since 2019, docs updated in 2026, a large ecosystem of wrappers.

Docs: https://api-docs.igdb.com/

### 2.2 RAWG API

What it exposes. About 500,000 games with name, release date, background image and screenshots, platforms, parent platforms, stores, genres, tags, developers, publishers, ESRB rating, RAWG user rating, a `metacritic` score field, an average `playtime` field, and descriptions. Endpoints are documented at `https://api.rawg.io/docs/` and `https://rawg.io/apidocs`.

Auth. A single API key passed as the `key` query parameter.

Cost and terms (API Terms of Service, last updated March 1, 2021). Personal non commercial use is free without a stated request cap, but you must "attribute RAWG as the source of the data and/or images and add an active hyperlink from every page where the data of RAWG is used". Commercial use is free up to 20,000 requests per month as long as you stay under 100,000 monthly active users or 500,000 page views per month; beyond that, Business (50,000 requests/month, paid through Stripe) and Enterprise (1,000,000 requests/month). The terms prohibit redistribution of the data, and RAWG reserves the right to change the free quota unilaterally. There is no stated caching rule, so caching is not forbidden, but the per page backlink requirement applies wherever RAWG data appears.

Stability risk. Medium. The API works and the docs page was modified in May 2026, but the terms have not been touched since 2021, the company is small, and the backlink rule is a real product constraint. Treat RAWG as a secondary or fallback catalog, not the spine of the app.

Docs: https://rawg.io/apidocs and https://rawg.io/tos_api

### 2.3 Giant Bomb API

What it exposes. Games, releases, platforms, franchises, characters, companies, concepts, reviews and videos from the Giant Bomb wiki, returned as JSON (also XML and JSONP via `format`). Image objects carry `icon_url`, `medium_url`, `screen_url`, `small_url`, `super_url`, `thumb_url`, `tiny_url` and `original_url`.

Auth. Free API key from a logged in profile, sent as the `api_key` query parameter.

Rate limits and terms. 200 requests per resource per hour, HTTP 420 when exceeded, and a descriptive User-Agent is required. The API is free for non commercial use only; commercial use requires permission from Giant Bomb.

Status in 2026. Fandom sold Giant Bomb to its staff in May 2025 (VGC, May 11, 2025). The site announced that the wiki is going "open source" with a community GitHub repository (`Giant-Bomb-Dot-Com/giant-bomb-wiki`), whose scripts still use a "GiantBomb legacy API key". Forum users report the API and third party apps broke during the Red Ventures and Fandom transitions. The official docs and forums are behind a Cloudflare challenge that blocked my fetches.

Stability risk. High. The API is explicitly called legacy, the wiki is being re-platformed, and the license is non commercial. Useful only as an enrichment source for a hobby build.

Docs: https://www.giantbomb.com/api/ (behind Cloudflare); third party summary at https://jentic.com/apis/giantbomb.com/giantbomb

### 2.4 SteamGridDB

What it exposes. User uploaded custom artwork: grids (vertical 600x900, 342x482 and 660x930; horizontal 460x215 and 920x430; square 512x512 and 1024x1024), heroes (1920x620, 3840x1240, 1600x650), logos and icons. Assets can be filtered by style (for example `alternate`, `blurred`, `white_logo`, `material`, `no_logo`), dimensions, mime type, static versus animated, and NSFW or humor flags. Games can be searched by name or fetched by platform ID with `type` values `steam`, `gog`, `origin`, `egs`, `bnet`, `uplay`, `flashpoint`, `eshop`. I confirmed the platform list, the `steam` and `game` lookup forms, and the 460x215 and 920x430 examples from the official Node wrapper README; the full dimension and style lists come from the API v2 reference page, which is JavaScript rendered and did not return content to my fetches.

Auth. Free API key generated at `https://www.steamgriddb.com/profile/preferences/api`, sent as a bearer token to `https://www.steamgriddb.com/api/v2`.

Limits and terms. No published numeric rate limit; the SteamTinkerLaunch wiki warns that heavy use gets rate limited. The terms of service page also did not render for me, so I could not confirm commercial rules. Beyond the terms, the content itself is fan made and frequently derived from publisher key art, so it is not safe to ship as default box art in a commercial app. Sensible use: an opt in "choose custom cover" feature where the user picks the image.

Stability risk. Medium. Long running community project with official API and wrappers in Node, Python, Rust and .NET, but it is a volunteer site.

Docs: https://www.steamgriddb.com/api/v2 and https://github.com/SteamGridDB/node-steamgriddb

### 2.5 Steam Store API and storefront endpoints

appdetails. `GET https://store.steampowered.com/api/appdetails?appids={appid}&cc=us&l=english` returns name, type, `steam_appid`, `required_age`, `short_description`, `about_the_game`, `header_image`, `capsule_image`, screenshots, movies, genres, categories, `release_date`, `metacritic` (score and URL), platforms, developers, publishers, `price_overview`, `recommendations.total`, achievements, and packages. The community documentation (RJackson's StorefrontAPI wiki) quotes Valve: "This API is not actively documented, under development, and not meant for public consumption. It may change at any time without notice." Multiple appids in one call only work when `filters=price_overview`. Community consensus puts the limit around 200 requests per 5 minutes per IP, returning 429 or 403 beyond that; cache responses for at least a day.

Image CDN. Store assets follow predictable paths without any API call: `https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/header.jpg` (460x215), `capsule_616x353.jpg`, `library_600x900.jpg` (and `library_600x900_2x.jpg`), `library_hero.jpg` (3840x1240) and `logo.png`. Newer titles also live under `shared.akamai.steamstatic.com/store_item_assets/steam/apps/{appid}/`. Not every asset exists for older apps, so fall back on a HEAD check.

Terms. These storefront endpoints are outside the Steam Web API key system, so the only written terms are the Steam Subscriber Agreement and general site terms. Valve has tolerated them for a decade and half the analytics industry depends on them, but there is no promise of stability.

Stability risk. Medium. Undocumented but very stable in practice.

Docs: https://wiki.teamfortress.com/wiki/User:RJackson/StorefrontAPI and https://myopic.design/tools/steam-asset-scraper/

### 2.6 Wikidata and Wikipedia as a fallback

Wikidata. Structured items for hundreds of thousands of games under CC0. Useful properties: P400 platform, P577 publication date, P136 genre, P178 developer, P123 publisher, P404 game mode, P408 software engine, P18 image, P154 logo. Cross database identifiers make Wikidata a good join table: P1733 Steam application ID, P2725 GOG ID, P6278 Epic Games Store ID, P8084 Nintendo eShop ID, P5885 Microsoft Store product ID, P5944 and P5971 PlayStation Store IDs (North America and Europe), P1712 Metacritic ID, P2864 OpenCritic ID, P2816 HowLongToBeat ID, P11688 MobyGames game ID, P5247 Giant Bomb ID, P6337 PCGamingWiki ID, and IGDB game ID (P5794). Query with SPARQL at `https://query.wikidata.org/sparql` or fetch entities via the wbgetentities API.

Correction, 2026-09-16 (from building the OpenCritic job, work queue item 14). P5794's value is the IGDB **slug**, not the numeric id our catalog stores: its formatter is `https://www.igdb.com/games/$1` and its format constraint is `^[a-z\d]+...`. The number lives in [P9043](https://www.wikidata.org/wiki/Property:P9043) "Internet Game Database numeric game ID", whose own description reads "use as qualifier for P5794" — so it hangs off the P5794 statement rather than off the item, and the `wdt:` shortcut cannot reach it. Joining our IGDB ids to [P2864](https://www.wikidata.org/wiki/Property:P2864) OpenCritic ID therefore goes item → statement → qualifier: `?item p:P5794 ?st . ?st pq:P9043 ?igdb . ?item wdt:P2864 ?opencritic .`, with the ids bound as *strings* in a `VALUES` block because both are external identifiers. Keep `wdt:` on P2864, which skips deprecated-rank statements. Verified against the live endpoint the same day; see [P5794](https://www.wikidata.org/wiki/Property:P5794) for the slug format. Anything else joining on an IGDB id — Metacritic, HowLongToBeat, the store ids above — has to go through the same qualifier.

Correction, 2026-09-16 (from building the cross-linking job, work queue item 14 and V1 "Cross-linking IDs"). **P1712 "Metacritic ID" is the wrong property for a game.** It is the older cross-medium identifier and its format constraint now demands the full `game/<slug>/(critic|user)-reviews/?platform=<platform>` form rather than a bare slug, which is not what the game formatter URL takes. The game identifier is [P12054](https://www.wikidata.org/wiki/Property:P12054) "Metacritic game ID", formatter `https://www.metacritic.com/game/$1/`, format `^(?!1300\d{6})\-?[a-z\d]+(\-[a-z\d]+){0,19}\-?$`; the lookahead excludes the numeric form, which is [P12078](https://www.wikidata.org/wiki/Property:P12078) "Metacritic numeric game ID" and is a qualifier on P12054 rather than a property of its own. Coverage measured the same day over the 147,617 Wikidata items carrying a P9043 IGDB number: P12054 on 16,778 of them, [P1712](https://www.wikidata.org/wiki/Property:P1712) on 38. Two more numbers from that pass, for anyone extending the list above: P8084 Nintendo eShop ID is *not* single-valued (no single-value constraint, and a required-qualifier constraint on P400 platform, so one value per console), and PlayStation has no single property at all, P5944 and P5971 holding different region-locked strings with region-locked formatter URLs.

Limits. The Query Service enforces a 60 second query deadline, 60 seconds of processing time per 60 second window per client, at most 30 erroring queries per minute, and 5 parallel queries per IP; violations get 429 and repeat offenders get banned. Wikimedia's API etiquette requires a meaningful User-Agent (`clientname/version (contact) framework/version`), serial rather than parallel requests, batching with `|`, and the `maxlag` parameter for background jobs. Clients without a proper User-Agent risk being blocked without notice.

Wikipedia. The REST summary endpoint (`/api/rest_v1/page/summary/{title}`) gives a short description and thumbnail. Text is CC BY-SA 4.0 (attribution and share alike). Box art on English Wikipedia is usually uploaded under fair use and cannot be reused in your app; only Commons hosted images have reusable licenses.

Stability risk. Low legally and technically, but coverage is uneven for indie titles, and it is a fallback for descriptions and ID linking rather than a primary catalog.

Docs: https://www.wikidata.org/wiki/Wikidata:WikiProject_Video_games/Properties and https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual

### 2.7 MobyGames API

What it exposes. The deepest historical catalog: games and add ons, descriptions, release dates per platform, developers and publishers, genres, cover images, screenshots, credits, Moby Score, critic score, player score, and official URLs. Endpoints include `/games`, `/games/recent`, `/games/random`, `/games/{game_id}/platforms/{platform_id}/covers` and screenshots, plus `/platforms` and `/genres`. Auth is a private `api_key` from the MobyPro API page.

Cost and limits (from the 2024 MobyPro restructuring thread and the subscribe page). Hobbyist API 9.99 USD/month, non commercial only, 0.2 requests per second (about 720 per hour). Commercial: Bronze 99.99 USD/month at 1 request/second, Silver 499.99 USD/month at 4 requests/second with support, Gold 4,999.99 USD/month at 8 requests/second. Attribution "Data by MobyGames.com" is required wherever the data is used. The docs page itself is behind Cloudflare; I confirmed the tiers and rules through the forum announcement and search summaries.

Stability risk. Medium. Official, but the price moved from free to paid in 2024, and hobby access is explicitly non commercial.

Docs: https://www.mobygames.com/info/api/ and https://www.mobygames.com/forum/3/thread/270120/important-changes-to-mobypro-subscription-service/

## 3. Section B: critic and user review scores

### 3.1 Metacritic

There is no official Metacritic API and no developer program. Metacritic is a Fandom property. Fandom's Terms of Service for GameSpot, Metacritic, TV Guide, Comic Vine and GameFAQs were revised August 22, 2025; the Fandom Terms of Use (revised October 2025) prohibit using "any robot, spider, scraper or other automated means to access the Services" without express written permission, and separately prohibit any device to "scrape, extract, retrieve or index any portion of the content". Fandom pages blocked my automated fetches too, which is consistent.

Scraping status. Community scrapers exist (Apify actors, PHP packages such as hooshid/metacritic-scraper, Python projects). Their maintainers note they break whenever the site changes and need updates a few times a year. Some commercial "Metacritic API" listings on RapidAPI are also unofficial scrapers.

Legal risk for a consumer app. High. You would be breaching the terms of a large media company on every request, and review excerpts are copyrighted. Aggregated numbers are facts, but the terms of use still bind you.

Safer alternatives. Steam's appdetails already returns a `metacritic` object (score and URL) for many games, because Valve licenses that display; IGDB's `aggregated_rating` is a critic aggregate; RAWG exposes a `metacritic` field it collects itself. Show one of those and link out to the Metacritic page (Wikidata gives the slug) rather than scraping.

Correction, 2026-09-16 (from building the cross-linking job). The property to link out with is [P12054](https://www.wikidata.org/wiki/Property:P12054) "Metacritic game ID" — formatter `https://www.metacritic.com/game/$1/` — and **not** [P1712](https://www.wikidata.org/wiki/Property:P1712) "Metacritic ID" as this paragraph originally said. P1712 is the older cross-medium identifier, its constraint now demands the `game/<slug>/(critic|user)-reviews/?platform=<platform>` form, and it covers 38 of the 147,617 Wikidata items that carry an IGDB numeric id against P12054’s 16,778 (measured the same day). Prefer the URL Valve hands us in `appdetails` where we have it, since it names the platform the slug has no room for; fall back to P12054. See 2.6 for how a P12054 value is reached from an IGDB id.

### 3.2 OpenCritic API

Official, distributed through RapidAPI (`opencritic-api.p.rapidapi.com`). Endpoints include game search, game details (with `topCriticScore`, `percentRecommended`, tier such as Mighty, Strong, Fair or Weak, review counts, images and trailers), popular and hall of fame lists, reviews for a game with pagination, latest updates, platforms and tags.

Auth. RapidAPI application key sent in the RapidAPI headers; you subscribe to a plan on RapidAPI.

Cost. Basic plan is free with 200 requests per day, 25 searches per day and 4 requests per second (numbers confirmed from the opencritic-mcp package page, which wraps the same API). Paid tiers exist on the RapidAPI pricing page, which is JavaScript rendered and did not expose its numbers to my fetches; check it before budgeting. RapidAPI bills the card on file at subscription and renewal.

Practical notes. The search quota is the binding constraint. Store OpenCritic IDs on your game records (Wikidata P2864 covers many titles, and IGDB `websites` sometimes includes OpenCritic links) so you spend requests on details, not searches. Cache results for at least a day. OpenCritic's FAQ describes the scoring method but does not publish separate API terms, so follow RapidAPI's terms and credit OpenCritic visibly.

Stability risk. Low to medium. Official and stable since 2019, but quotas are small and the paid tiers are the real path for a growing app.

Docs: https://rapidapi.com/opencritic-opencritic-default/api/opencritic-api

### 3.3 Steam user reviews and the review summary

`GET https://store.steampowered.com/appreviews/{appid}?json=1` is documented on the Steamworks site ("User Reviews - Get List"). Parameters: `filter` (recent, updated, all), `language` (use `all`), `day_range` (up to 365, only with filter all), `cursor` (start with `*`), `review_type` (all, positive, negative), `purchase_type` (all, non_steam_purchase, steam), `num_per_page` (default 20, max 100), and `filter_offtopic_activity`. The `query_summary` object carries `num_reviews`, `review_score` (0 to 9 bucket), `review_score_desc` (for example "Very Positive"), `total_positive`, `total_negative` and `total_reviews`. Pass `num_per_page=0` and `purchase_type=all&language=all` to get just the summary. No key is needed and no rate limit is documented; community scrapers stay around one request per 600 ms.

Stability risk. Low to medium. Documented by Valve, though it is a store endpoint rather than the keyed Web API.

Docs: https://partner.steamgames.com/doc/store/getreviews

### 3.4 IGDB rating fields

Covered in 2.1: `rating` (IGDB users), `aggregated_rating` (external critics), `total_rating` (blend), each with a `_count`. They are free, cacheable and cover the whole catalog, which makes them the best default score for an MVP, with OpenCritic layered on for major releases.

## 4. Section C: Steam player data

### 4.1 Steam Web API key, terms and limits

Register a key at `https://steamcommunity.com/dev/apikey`. Requirements: a Steam account that is not limited (at least 5 USD spent), a domain name (use `localhost` for development), and confirmation in the Steam Mobile Authenticator. The Steam Web API Terms of Use state "You are limited to one hundred thousand (100,000) calls to the Steam Web API per day", require you to keep the key confidential, to show Valve names, logos and links per the documentation without `nofollow`, to post a privacy policy covering non public user data, to retrieve Steam data about an end user only as requested by that user, to store it in the countries named in your privacy policy, and not to use the API for unsolicited marketing or in ways that imply Valve endorsement. Higher quotas are case by case with Valve. Commercial use is not prohibited.

### 4.2 Endpoints

Base URL `https://api.steampowered.com/`. The Steamworks docs describe the methods; the community mirror at steamapi.xpaw.me lists parameters generated from `GetSupportedAPIList`.

- `IPlayerService/GetOwnedGames/v1` with `steamid`, `include_appinfo` (adds name and icon), `include_played_free_games`, `appids_filter`, plus `include_free_sub`, `skip_unvetted_apps`, `language` and `include_extended_appinfo` (confirmed on the xpaw listing). Each game returns `appid`, `playtime_forever` (minutes), `playtime_2weeks`, per platform totals (`playtime_windows_forever`, `playtime_mac_forever`, `playtime_linux_forever`, `playtime_deck_forever`), `rtime_last_played` (unix time), `img_icon_url` and `has_community_visible_stats`. Valve's note: it "Returns a list of games owned by the player if their owned games/game details are visible to you".
- `IPlayerService/GetRecentlyPlayedGames/v1` with `steamid` and `count` (0 for all); returns games played in the last two weeks with `playtime_2weeks` and `playtime_forever`.
- `ISteamUserStats/GetPlayerAchievements/v1` (`key`, `steamid`, `appid`, `l`) and `GetSchemaForGame/v2` (`key`, `appid`, `l`) for names, descriptions and icons; `GetGlobalAchievementPercentagesForApp/v2` (`gameid`, no key).
- `ISteamUserStats/GetNumberOfCurrentPlayers/v1` (`appid`, no key) returns the current concurrent player count only, no history.
- `ISteamUser/GetPlayerSummaries/v2` (`steamids`, up to 100) for persona name, avatar and `communityvisibilitystate`; `ISteamUser/ResolveVanityURL/v1` to turn a custom profile URL into a SteamID64.

### 4.3 Privacy settings the user needs

The profile must be Public and the "Game details" sub setting must be Public. If Game details is private or friends only, `GetOwnedGames` returns `{"response":{}}` and achievements are unavailable. If the user enables "Always keep my total playtime private", games are returned but every `playtime_forever` is 0. Your onboarding must tell users to open Steam Privacy Settings, set Game details to Public and untick the playtime privacy box, at least for the initial sync. Concurrent player counts are unaffected by privacy settings.

### 4.4 Steam OpenID login for linking accounts

Steam is an OpenID 2.0 provider at `https://steamcommunity.com/openid`. You redirect the user to Steam, they sign in on Valve's page, and Steam redirects back with an assertion whose `claimed_id` is `https://steamcommunity.com/openid/id/<steamid64>`. Your library must verify the assertion with Steam (`check_authentication`) before trusting the ID. There are no scopes and no tokens: OpenID proves identity only, and you then read public data with your own Web API key. Valve provides official "Sign in through Steam" button images. Well used libraries: passport-steam and node-steam-openid (Node), python-social-auth and django-allauth (Python), omniauth-steam (Ruby).

### 4.5 Steam Charts and SteamDB for concurrent player history

Neither is an API. SteamDB's FAQ: "Does SteamDB have an API? ... This will most likely mean an API at some point", and "We also do not allow scraping/crawling on SteamDB". Academic scraping requires an application and is explicitly not for commercial use. SteamDB itself gets everything from Valve's API, including exact concurrent counts. steamcharts.com publishes no API and its robots.txt returns 404. Third party scraper marketplaces (Apify, Parse.bot, Anysite) resell scraped SteamDB or Steam Charts data, which inherits the same problem.

The legitimate path is the one SteamDB uses: poll `GetNumberOfCurrentPlayers` for the games you care about every 15 to 30 minutes and store the series yourself. You will not have history before you start.

Docs: https://steamcommunity.com/dev/apiterms, https://partner.steamgames.com/doc/webapi/IPlayerService, https://partner.steamgames.com/doc/webapi/ISteamUserStats, https://partner.steamgames.com/doc/features/auth, https://steamdb.info/faq/

## 5. Section D: PlayStation Network playtime and library

### 5.1 Is there an official API?

No. Sony's developer programs are for game studios shipping on PlayStation, not for third parties reading player data. Everything below is reverse engineered from the PlayStation mobile app and web, and Sony can change or block it at any time.

### 5.2 What psn-api (Node) and PSNAWP (Python) do

psn-api (achievements-app, MIT, 420 stars, last push August 2026) and PSNAWP (isFakeAccount, last push May 2026) wrap the same endpoints. PSNAWP self limits to 300 requests per 15 minutes since v2.1.0 and its README warns: "Excessive use of API may lead to your PSN account being temporarily or permanently banned." Forks such as psn-api-user-playtime and PSNAWP-HA (Home Assistant) exist.

Auth flow (NPSSO). The user signs in at playstation.com, then opens `https://ca.account.sony.com/api/v1/ssocookie` to read a 64 character `npsso` value. The library exchanges the NPSSO for an authorization code, then for an access token (short lived, a few hours at most, commonly about one hour) and a refresh token that lasts about two months. The NPSSO itself is valid about two months, and generating a new one on the same account invalidates the previous one. psn-api's docs are blunt: the NPSSO "is equivalent to your password", so it must never be logged or stored in plain text.

Data available.
- `getUserPlayedGames` (the gamelist v2 endpoint) returns the played titles for an account ordered by recency, each with `titleId`, name, `category` (`ps4_game`, `ps5_native_game`, `pspc_game`), `imageUrl`, `playCount`, `playDuration` as an ISO 8601 duration "accurate to 1 second", `firstPlayedDateTime`, `lastPlayedDateTime` and a `concept` object linking regional title IDs. It supports `limit` and `offset` with `totalItemCount`. It works for `me` and for other account IDs whose privacy settings allow it. This is the "GetUserPlayedTitles" data the question refers to.
- `getRecentlyPlayedGames` (GraphQL `gameLibraryTitlesRetrieve`) for the authenticated user only, with `limit` and category filters.
- Trophies: `getUserTitles` (trophy titles with progress), `getTitleTrophies`, `getUserTrophiesEarnedForTitle`, `getUserTrophyProfileSummary`.
- `getPurchasedGames` (PS4 and PS5 only), profile lookup by online ID, universal search.

Coverage limits. Play duration exists for PS4, PS5 and PlayStation PC titles only. PS3 and Vita have no playtime, which Exophase also states for its PSN playtime feature. Other users' data requires their "Games" or gaming history privacy setting to be "Anyone" (friends only will fail for a service account).

### 5.3 How risky is it?

High. The maintainer of PSNAWP, asked about repercussions, answered that "There is a non zero risk that your account could get banned", higher with spam or rate limit abuse, and recommends an alt account. If a NPSSO leaks, an attacker can read account data and attempt account takeover through support. Sony's terms generally prohibit accessing PSN with unauthorized software; I did not fetch the current terms text, so verify the exact clause before launch. Breakage history: Sony has retired legacy profile endpoints and changed the gamelist and trophy APIs over the years, and both libraries have shipped fixes; the libraries are active in 2026, but any change on Sony's side is a same day outage for you.

### 5.4 What other apps do

- Backloggd has no PSN, Steam, Xbox or Switch import at all; a storefront import request has been open since December 2022.
- Backloggr (iOS, launched 2025) lets users connect Steam, PSN and Xbox, imports libraries with trophies and achievements, and auto marks games Mastered when a Platinum is earned. It does not publish its method; since there is no official route, it must be using the same NPSSO based token flow, most likely through an in app web login that captures the cookie on the device.
- Exophase added automatic PSN playtime tracking for PS4 and PS5 (not PS3 or Vita), which matches the gamelist endpoint above.
- PSN Leaderboard sells an unofficial PSN API at 20 USD/month where users prove ownership by putting a key in their PSN "About Me" field; it respects PSN privacy settings. It shows a workable pattern for public data without asking users for credentials.

Recommended pattern if you do ship it: do the NPSSO exchange on the client (mobile app web view or a browser extension), send only the refresh token to your server, encrypt it at rest, rotate on failure, and rate limit hard. Offer a "public profile by online ID" mode that only reads data the user has already made public.

Docs: https://github.com/achievements-app/psn-api, https://psn-api.achievements.app/api-docs/users, https://github.com/isFakeAccount/psnawp

## 6. Section E: Xbox

### 6.1 Official position

Microsoft's Xbox services APIs (title history, achievements, user stats, profile) are documented in the Game Development Kit and require a title registered in Partner Center. Reading arbitrary players' data from a third party web app is not a supported scenario. The GDK docs note that event based stats include a native "minutes played" stat, which is why playtime exists in the backend at all.

### 6.2 OpenXBL (xbl.io)

A third party hosted proxy to Xbox Live, "Not affiliated with Microsoft or Xbox". You sign in with a Microsoft account at xbl.io, verify a phone number and create an API key, sent as `X-Authorization`. Pricing: Free 150 requests/hour (no card), Small 5 USD/month for 500/hour, Medium 15 USD/month for 2,500/hour, Large 35 USD/month for 5,000/hour, Enterprise custom; limits reset hourly, 429 when exceeded, and Microsoft's own Xbox Live rate limits also apply. The OpenAPI spec in the OpenXBL/Docs repository lists the endpoints.

Relevant endpoints from the spec: `/api/v2/account`, `/api/v2/player/summary` and `/player/summary/{xuid}`, `/api/v2/player/titleHistory` and `/player/titleHistory/{xuid}` (titles with `titleHistory.lastTimePlayed`, achievement progress and gamerscore, images, devices), `POST /api/v2/player/stats` with `xuids` and `stats: [{ name: "MinutesPlayed", titleId }]`, `/api/v2/achievements` variants including per title and per player, `/api/v2/presence`, `/api/v2/friends`, `/api/v2/recent-players`, `/api/v2/gamepass/all|pc|ea-play|no-controller`, `/api/v2/marketplace/*`, `/api/v2/search`. The Go client's types confirm `titleHistory.lastTimePlayed` and that `MinutesPlayed` "is the stat name Xbox uses for a title's playtime, though most but not all titles report it".

Is playtime exposed? Yes, indirectly: title history gives last played only; per title minutes come from the stats endpoint, and older Xbox 360 titles often report nothing.

Account linking. Your API key acts as the OpenXBL account holder, so with a plain key you read other players by XUID and only what their Xbox privacy settings expose (game history visible to Everyone). OpenXBL also offers an app authorization flow where a user signs in through xbl.io and your app receives a user scoped key; I could not fetch the console page that documents it, so confirm the current flow on xbl.io before relying on it.

Stability risk. Medium. It has run for years, but it is a one company proxy, the free quota is tiny for a consumer app, and Microsoft could cut it off.

### 6.3 xbox-webapi-python (OpenXbox)

MIT licensed, last push August 2026. It authenticates with Microsoft OAuth (default OpenXbox client ID, or your own Azure app registration), obtains XSTS tokens and calls Xbox Live services directly: titlehub `get_title_history`, `get_title_info`, achievements, presence, people, and userstats for `MinutesPlayed`. It removes the third party proxy and its hourly caps, at the cost of running an unofficial client against Microsoft endpoints under your own OAuth app. Risk medium to high; suitable for a personal tool more than a public product.

Docs: https://xbl.io/pricing, https://github.com/OpenXBL/Docs, https://github.com/OpenXbox/xbox-webapi-python

## 7. Section F: Nintendo Switch playtime

Honest answer first: there is no reliable consumer grade path. What exists is a reverse engineered parental controls API that yields coarse, per day data only after the user links their console in Nintendo's app.

### 7.1 Where Nintendo stores play activity

The nxapi maintainer laid it out in issue #8. The full per title play log (launch count, total minutes, first and last played) that a Switch shows on a profile is stored on the Nintendo Switch accounts server (BAAS) and is only reachable from a console. The Nintendo Switch Online app API (Coral) does not expose it. The Parental Controls app API ("Moon") records play time per user per day, "rounded down to 300 seconds (5 minutes)", plus first played date. The My Nintendo app had a play history API, but it returned empty for non Japanese accounts.

### 7.2 The Parental Controls (Moon) API via nxapi

Data. `nxapi pctl devices` lists linked consoles; `daily-summaries {device}` returns per day `playingTime`, `playedApps` with per title `playingTime` and `firstPlayDate`, and `devicePlayers` for per user breakdowns; `monthly-summaries` and `monthly-summary {device} {YYYY-MM}` return daily totals, ranked `playedApps` and insights such as average playing time; `dump-summaries` downloads everything to disk so you can keep your own history. Field names come from `src/api/moon-types.ts`.

Auth. The user logs into a Nintendo Account through a login URL that nxapi generates for the Parental Controls app's OAuth client (a different session token from the NSO app). No third party "f token" service is needed for Moon data (nxapi: "Nintendo Switch Parental Controls data can be fetched without sending an access token to a third-party API"). The Moon access token expires after about 15 minutes and must be renewed with the session token. The console must be linked to the Parental Controls app using Nintendo's own app first, which also puts the console under parental control settings (limits can be left off). Data exists only from the link date forward, and Nintendo's support pages do not state a retention period, so dump and store it.

Fragility. Nintendo checks app version headers, so clients must track the current Parental Controls app version (nxapi pulls remote configuration for this). nxapi's last tagged release is v1.6.1 from March 2023, although commits continued through March 2026; the library is AGPL-3.0, which matters for a closed source app. Alternatives include pynintendoparental (Python, used by a Home Assistant integration) and udondan/switch-parental-controls (CLI and MCP server). The maintainer's ban assessment: console bans, "No"; account bans, "extremely unlikely", though Nintendo did silently ban a small number of SplatNet 3 users of one unrelated app.

Verdict. High risk and low value for a general audience: 5 minute granularity, per day rather than lifetime totals, no history before linking, a parental controls setup step most adult players will not do, and Nintendo's terms. Support manual entry for Switch, and revisit only if Nintendo ships an official service.

Docs: https://github.com/samuelthomas2774/nxapi, https://github.com/samuelthomas2774/nxapi/issues/8, https://github.com/samuelthomas2774/nxapi/blob/main/docs/cli.md

## 8. Section G: time to beat data

### 8.1 HowLongToBeat

No official API, and the site actively resists automation: the search endpoint is protected by a key or hash that must be scraped from the site's JavaScript bundles, and it changed to Turbopack bundling in August 2026 to make that harder. howlongtobeatpy (ScrappyCocco) is the most maintained wrapper: version 1.0.23 shipped August 25, 2026 to fix "an api error due to a website change... looks like they're trying to hide the endpoint more", and its issue tracker shows outages in August 2024, February 2025, November 2025 (bot protection), February 2026, March 2026, May 2026 and August 2026. Each result carries main story, main plus extras, completionist, all styles, review score and a similarity score. The original JavaScript library (ckatzorke/howlongtobeat) has not been pushed since June 2024 and has open "broken search" issues from 2025 and 2026. HLTB has no published API terms, which means no permission for commercial use either.

Risk: high. If you use it, do it only for links (Wikidata P2816 gives HLTB IDs) or for a background enrichment job you are prepared to see fail for weeks.

### 8.2 IGDB game_time_to_beats

Official endpoint `https://api.igdb.com/v4/game_time_to_beats` with fields `game_id`, `hastily`, `normally`, `completely` (all "Average time (in seconds)") and `count` ("Total number of time to beat submissions for this game"). Query by `where game_id = X;`. Times are community submitted on IGDB and coverage is thinner than HLTB for smaller games, but it is free, cacheable and stable.

### 8.3 Alternatives

RAWG exposes an average `playtime` field of unclear provenance. Steam gives you real playtime for your own users, so once you have a user base you can compute your own "median playtime among users who marked Completed" and show it as a first party stat with no third party dependency.

Docs: https://api-docs.igdb.com/ (Game Time To Beat), https://github.com/ScrappyCocco/HowLongToBeat-PythonAPI

## 9. Section H: subscription and streaming availability

### 9.1 Xbox Game Pass

Microsoft runs an undocumented but stable public catalog: `GET https://catalog.gamepass.com/sigls/v2?id={siglId}&language=en-us&market=US` returns product IDs for a collection, with collection IDs used by the Game-Pass-API tool: console `f6f1f99f-9b49-4ccd-b3bf-4d9767a77f5e`, PC `fdd9e2a7-0fee-49f6-ad69-4354098401ff`, EA Play `b8900d09-a491-44cc-916e-32b5acae621b`. Resolve products with `GET https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds={ids}&market=US&languages=en-us` for titles, images, release dates, prices and platform flags (Xbox One, Series, Windows, Cloud). No key is required; 150 plus markets are supported. The community tools carry the standard disclaimer that this is unofficial and not guaranteed. Match to your catalog through Microsoft Store product IDs (IGDB external_games has a `microsoft` source; Wikidata P5885). OpenXBL also proxies `/api/v2/gamepass/*` if you already pay for it.

### 9.2 PlayStation Plus

No API. The monthly Game Catalog is announced on the PlayStation Blog, and community projects scrape store.playstation.com collections; PlatPrices sells a paid PlayStation Store API with prices and history. Risk high and maintenance heavy; a curated list refreshed monthly by hand is realistic for an MVP.

### 9.3 Nintendo Switch Online

No API. The classic library (NES, SNES, N64, Game Boy, GBA, GameCube on Switch 2) is small and changes a few titles a month; maintain it manually or from Wikipedia's lists under CC BY-SA attribution.

### 9.4 GeForce NOW

NVIDIA publishes the supported game list as public JSON at `https://static.nvidiagrid.net/supported-public-game-list/gfnpc.json` (plus locale variants such as `locales/gfnpc-en-US.json`) with title, store, `steamUrl` and publisher fields. It powers NVIDIA's own site and has been used by community tools for years; it is not a documented API, so expect field changes without notice. Map to your catalog via the Steam app ID in `steamUrl`.

### 9.5 IsThereAnyDeal API v2

Official and useful: `/games/subs/v1` lists "all subscriptions the game is current in" (added in API 2.7.0), alongside search, lookup, overview, prices and bundles. Auth is an API key (`key` param or `ITAD-API-Key` header) with OAuth 2.0 PKCE for user features. Verified accounts get 1,000 requests per 5 minutes. Terms: commercial use is allowed "IF the resulting app is available to public", you "SHOULD provide a link to IsThereAnyDeal.com", you "MUST NOT change provided data", and access can be revoked without notice. ITAD's coverage is PC centric (Game Pass PC, EA Play, Ubisoft+, Humble and similar); check its subscriptions page for what it tracks before relying on it for console services.

Docs: https://github.com/NikkelM/Game-Pass-API, https://docs.isthereanydeal.com/, https://static.nvidiagrid.net/supported-public-game-list/gfnpc.json

## 10. Recommended stack for MVP

1. Catalog: IGDB as the single source of truth. Mirror the fields you need into your own database (allowed and encouraged), refresh with `updated_at` polling or webhooks, and store `image_id` so you can render `t_cover_big_2x` covers and `t_1080p` screenshots. Keep `external_games` so each game maps to Steam, GOG, Epic, Microsoft and PlayStation IDs. Add a static "Data provided by IGDB.com" credit and email partner@igdb.com once you plan to charge or run ads.
2. Cover fallback: Steam CDN `library_600x900_2x.jpg` and `header.jpg` for anything with a Steam app ID, with a HEAD check and your own cache.
3. Scores: IGDB `total_rating` and `aggregated_rating` everywhere; Steam `appreviews` summary for Steam titles cached daily; OpenCritic Basic for the top few hundred current titles using stored OpenCritic IDs so you spend the 25 daily searches wisely. Display Metacritic only from Steam's `metacritic` field and link out.
4. Steam import: Sign in through Steam (OpenID) to get the SteamID64, then `GetOwnedGames` with `include_appinfo=1&include_played_free_games=1`, `GetRecentlyPlayedGames`, and `GetPlayerAchievements` on demand. Sync on login and once a day; 100,000 calls per day is plenty for thousands of users if you avoid per game fan out. Build a privacy checklist screen (profile Public, Game details Public, playtime not hidden) with an "I fixed it, retry" button.
5. Concurrent players: `GetNumberOfCurrentPlayers` on demand for the game page, plus a 15 to 30 minute cron that stores counts for games your users track.
6. Time to beat: IGDB `game_time_to_beats`; link out to HLTB using Wikidata IDs instead of scraping.
7. Availability: nightly job over the Game Pass catalog and the GeForce NOW JSON, ITAD `/games/subs/v1` for PC subscriptions, and a hand curated PS Plus and NSO list.
8. Cross linking: a nightly Wikidata SPARQL job keyed by IGDB ID or Steam app ID to collect Metacritic, OpenCritic, HLTB and store IDs (CC0, no attribution burden).

Compliance checklist for the MVP: Valve logo and link (no nofollow) on pages using Steam data plus a privacy policy that names where you store it; IGDB credit; OpenCritic credit; ITAD link; do not display RAWG data unless you accept the per page backlink rule.

## 11. Deferred or risky

- PlayStation import (psn-api or PSNAWP): high value, high risk. Defer until the Steam import is solid; when you build it, keep NPSSO handling on the device, store only encrypted refresh tokens, and expect breakage. Consider a read only "public PSN ID" mode first.
- Xbox via OpenXBL: workable in phase 2 for achievements and last played, with `MinutesPlayed` from the stats endpoint. Budget the paid tier; 150 requests per hour will not survive a launch. xbox-webapi-python only if you are comfortable running your own OAuth app against unofficial endpoints.
- Nintendo Switch: no. Manual entry only. Revisit if Nintendo offers an official service.
- HowLongToBeat scraping: no. Link out.
- Metacritic scraping: no. Use Steam's licensed field, IGDB aggregates, and links.
- SteamDB or Steam Charts scraping: no. Build your own history from Valve's endpoint.
- Giant Bomb: skip; legacy API, non commercial license, platform in transition.
- MobyGames: only if you need retro depth and can pay for the commercial tier; the hobby tier is non commercial.
- RAWG: keep as an emergency fallback; the backlink requirement and 2021 era terms make it a poor primary.
- SteamGridDB: later, as an opt in "pick a custom cover" feature, once you have read its terms.
- PS Plus catalog scraping: no; curate by hand.

## 12. Sources

Catalog and metadata
- [IGDB API docs](https://api-docs.igdb.com/)
- [Twitch dev forum: Commercial use of IGDB API](https://discuss.dev.twitch.com/t/commercial-use-of-igdb-api/23567)
- [RAWG API docs](https://rawg.io/apidocs)
- [RAWG API reference](https://api.rawg.io/docs/)
- [RAWG API Terms of Service](https://rawg.io/tos_api)
- [Giant Bomb API (third party summary at Jentic)](https://jentic.com/apis/giantbomb.com/giantbomb)
- [Giant Bomb forum: Update on the Giant Bomb Website](https://www.giantbomb.com/forums/general-discussion-30/update-on-the-giant-bomb-website-1938877/)
- [Giant Bomb wiki GitHub repository](https://github.com/Giant-Bomb-Dot-Com/giant-bomb-wiki)
- [VGC: Giant Bomb sold by Fandom](https://www.videogameschronicle.com/news/giant-bomb-sold-by-fandom-will-continue-independently/)
- [SteamGridDB API v2](https://www.steamgriddb.com/api/v2)
- [SteamGridDB Node wrapper](https://github.com/SteamGridDB/node-steamgriddb)
- [SteamGridDB API key preferences](https://www.steamgriddb.com/profile/preferences/api)
- [SteamTinkerLaunch wiki: SteamGridDB](https://github.com/frostworx/steamtinkerlaunch/wiki/SteamGridDB)
- [Steam Storefront API (community documentation)](https://wiki.teamfortress.com/wiki/User:RJackson/StorefrontAPI)
- [Steamworks Web API practical guide (appdetails rate limits)](https://github.com/burkanbogaz/steamworks-api)
- [Steam asset URL patterns (Myopic Design)](https://myopic.design/tools/steam-asset-scraper/)
- [Wikidata WikiProject Video games: Properties](https://www.wikidata.org/wiki/Wikidata:WikiProject_Video_games/Properties)
- [Wikidata WikiProject Video games: Identifiers](https://www.wikidata.org/wiki/Wikidata:WikiProject_Video_games/Properties/identifiers)
- [Wikidata Query Service User Manual (limits)](https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual)
- [MediaWiki API:Etiquette](https://www.mediawiki.org/wiki/API:Etiquette)
- [MobyGames API documentation](https://www.mobygames.com/info/api/)
- [MobyGames forum: Important Changes to MobyPro Subscription Service](https://www.mobygames.com/forum/3/thread/270120/important-changes-to-mobypro-subscription-service/)
- [MobyGames API subscribe page](https://www.mobygames.com/api/subscribe/)

Review scores
- [Fandom Terms of Service (GameSpot, Metacritic, TV Guide, Comic Vine, GameFAQs)](https://www.fandom.com/terms-of-service-pp1)
- [Fandom Terms of Use](https://www.fandom.com/terms-of-use)
- [hooshid/metacritic-scraper on Packagist](https://packagist.org/packages/hooshid/metacritic-scraper)
- [OpenCritic API on RapidAPI](https://rapidapi.com/opencritic-opencritic-default/api/opencritic-api)
- [OpenCritic API pricing on RapidAPI](https://rapidapi.com/opencritic-opencritic-default/api/opencritic-api/pricing)
- [opencritic-mcp package page (plan limits)](https://libraries.io/npm/opencritic-mcp)
- [OpenCritic FAQ](https://opencritic.com/faq)
- [Steamworks: User Reviews Get List](https://partner.steamgames.com/doc/store/getreviews)

Steam player data
- [Steam Web API Terms of Use](https://steamcommunity.com/dev/apiterms)
- [Steam Web API key registration](https://steamcommunity.com/dev/apikey)
- [Steamworks: IPlayerService](https://partner.steamgames.com/doc/webapi/IPlayerService)
- [Steamworks: ISteamUserStats](https://partner.steamgames.com/doc/webapi/ISteamUserStats)
- [Steamworks: User Authentication and Ownership (OpenID)](https://partner.steamgames.com/doc/features/auth)
- [Steam Web API reference (xpaw, IPlayerService parameters)](https://steamapi.xpaw.me/#IPlayerService)
- [Steam Community: GetOwnedGames and privacy settings](https://steamcommunity.com/discussions/forum/7/1729827777339922602/)
- [SteamDB FAQ](https://steamdb.info/faq/)
- [Steam Charts](https://steamcharts.com/)

PlayStation
- [psn-api (achievements-app)](https://github.com/achievements-app/psn-api)
- [psn-api Users API docs](https://psn-api.achievements.app/api-docs/users)
- [psn-api: Authenticating manually](https://psn-api.achievements.app/authentication/authenticating-manually)
- [PSNAWP](https://github.com/isFakeAccount/psnawp)
- [PSNAWP discussion: repercussions of unofficial API use](https://github.com/isFakeAccount/psnawp/discussions/106)
- [Exophase forum: PSN playtime tracking now supported](https://forums.exophase.com/threads/psn-playtime-tracking-now-supported.48075/)
- [PSN Leaderboard API](https://www.psnleaderboard.com/api/)
- [PS Playtime: public profile settings](https://psplaytime.com/insights/public-profile)
- [Backloggd review (import status)](https://www.twoaveragegamers.com/backloggd-review/)
- [Backloggr on the App Store](https://apps.apple.com/us/app/backloggr-video-game-tracker/id6761012462)

Xbox
- [OpenXBL pricing](https://xbl.io/pricing)
- [OpenXBL getting started](https://xbl.io/getting-started)
- [OpenXBL Docs repository (OpenAPI spec)](https://github.com/OpenXBL/Docs)
- [openxbl-go package docs](https://pkg.go.dev/github.com/wolveix/openxbl-go)
- [xbox-webapi-python](https://github.com/OpenXbox/xbox-webapi-python)
- [xbox-webapi-python titlehub docs](https://xbox-webapi-python.readthedocs.io/en/latest/source/xbox.webapi.api.provider.titlehub/)
- [Microsoft GDK: Event based vs title managed stats](https://learn.microsoft.com/en-us/gaming/gdk/docs/services/player-data/stats-leaderboards/live-stats-eb-vs-tm)

Nintendo
- [nxapi](https://github.com/samuelthomas2774/nxapi)
- [nxapi issue #8: NSO API for user games and playtime](https://github.com/samuelthomas2774/nxapi/issues/8)
- [nxapi CLI docs](https://github.com/samuelthomas2774/nxapi/blob/main/docs/cli.md)
- [nxapi Moon library docs](https://github.com/samuelthomas2774/nxapi/blob/main/docs/lib/moon.md)
- [nxapi Moon API types](https://github.com/samuelthomas2774/nxapi/blob/main/src/api/moon-types.ts)
- [pynintendoparental](https://github.com/pantherale0/pynintendoparental)
- [Nintendo support: How to check play time and usage activity](https://www.nintendo.com/en-gb/Support/Parental-Controls/How-to-Check-Play-Time-and-Usage-Activity-on-Nintendo-Switch-1494766.html)

Time to beat
- [howlongtobeatpy (HowLongToBeat-PythonAPI)](https://github.com/ScrappyCocco/HowLongToBeat-PythonAPI)
- [howlongtobeatpy on PyPI](https://pypi.org/project/howlongtobeatpy/)
- [ckatzorke/howlongtobeat](https://github.com/ckatzorke/howlongtobeat)

Subscription availability
- [Game-Pass-API (NikkelM)](https://github.com/NikkelM/Game-Pass-API)
- [xbox-store-api (lucasromerodb)](https://github.com/lucasromerodb/xbox-store-api)
- [GeForce NOW supported games JSON](https://static.nvidiagrid.net/supported-public-game-list/gfnpc.json)
- [GeForce-Now-Games (SkYNewZ)](https://github.com/SkYNewZ/GeForce-Now-Games)
- [IsThereAnyDeal API docs](https://docs.isthereanydeal.com/)
- [IsThereAnyDeal API changelog](https://github.com/IsThereAnyDeal/API/blob/master/CHANGELOG.md)
- [PlatPrices PlayStation Store API](https://platprices.com/developers.php)
- [ps-plus-games-api (Squirrels)](https://github.com/Squirrels/ps-plus-games-api)


## 13. Addendum, 2026-09-25: the other stores, and IGDB PopScore

Checked for the bulk entry deck ([../feature-ideas.md](../feature-ideas.md#1-bulk-entry)), by a web search of official docs first. Sections 4 to 7 above stand; this covers what they did not.

- **Epic Games Store.** Epic Online Services exposes ownership only for the calling product (`EOS_Ecom_QueryEntitlements`); developers asking Epic for a full-library endpoint are told none exists. Legendary and Heroic authenticate with the launcher's hardcoded client credentials and call undocumented launcher endpoints. Not feasible officially; unofficial route carries terms and ban risk. https://dev.epicgames.com/docs/en-US/api-ref/functions/eos-ecom-query-entitlements, https://github.com/legendary-gl/legendary/blob/master/legendary/api/egs.py
- **GOG.** No official third-party library API; Heroic and Lutris use `auth.gog.com` and `embed.gog.com/account/getFilteredProducts`, both undocumented and community-documented only. Not feasible officially. https://www.gog.com/forum/general/unofficial_gog_api_documentation
- **Apple App Store and Game Center.** GameKit data is per app unless two developers share a Game Center group; StoreKit transactions are the calling app's only; Screen Time's FamilyControls needs a case-by-case entitlement and its picker returns opaque tokens, not app names; sandboxing prevents enumerating installed apps. Not feasible. https://developer.apple.com/documentation/gamekit, https://developer.apple.com/documentation/storekit/transaction, https://developer.apple.com/documentation/xcode/configuring-family-controls
- **Google Play Games Services.** The REST API returns the authenticated player's progress for the calling application only. Not feasible. https://developers.google.com/games/services/web/api/rest/v1/achievements/list
- **Battle.net.** OAuth with `wow.profile`, `sc2.profile`, `d3.profile`, `openid`; each scope opens one game's profile; no account-wide library. Not feasible. https://community.developer.battle.net/documentation/guides/using-oauth
- **EA App, Ubisoft Connect.** No third-party library API found, official or otherwise. Not feasible.
- **Backloggr and Exophase.** Backloggr is on the App Store (id 6761012462) and advertises PlayStation, Xbox, Steam, and Switch imports without disclosing the method; no ban reports attributed to it were found. Exophase links PSN the same undisclosed way. Consistent with the NPSSO finding in 5.2; nothing new confirmed.
- **OpenXBL.** Pricing confirmed: free 150 requests an hour, 5 USD for 500, 15 USD for 2,500, 35 USD for 5,000. An end-user "sign in with Xbox" flow issuing a user-scoped key is suggested by the `OpenXBL/XboxAppDemo` repository but its documentation page could not be fetched; unconfirmed. https://xbl.io/pricing, https://github.com/OpenXBL/XboxAppDemo
- **IGDB PopScore.** `popularity_primitives` (`game_id`, `value`, `popularity_type`, `external_popularity_source`, `calculated_at`) and `popularity_types` shipped June 2024 with four IGDB-native types, ids 1 to 4: Visits, Want to Play, Playing, Played, refreshed daily across every platform; Steam and Twitch types were announced as coming and their ids could not be confirmed from the docs (403 to automated fetches). No statement found that these calls are exempt from the 4 requests a second limit; assume they count. The `games` fields `hypes`, `follows`, `rating_count`, `aggregated_rating_count`, `total_rating_count`, `collection`, `collections`, `franchise`, `franchises`, `parent_game`, `version_parent`, `remakes`, `remasters` all exist; `parent_game` covers DLC, editions, and ports, `version_parent` the same game's editions. https://medium.com/igdb/introducing-igdb-popscore-your-ultimate-tool-for-tracking-gaming-trends-b8d9beacf16a, https://raw.githubusercontent.com/DmitryScaletta/igdb-api-types/master/api.json
- **PC library aggregators as a fallback.** GOG Galaxy 2.0 has no official export (community tools only; only its Epic and Xbox integrations are GOG-built). Playnite has no native CSV export (feature request #791 open) but the `playnite-json` extension exports title, source, platform, and playtime as JSON. Feasible as an unofficial upload path. https://github.com/zachvlat/playnite-json, https://github.com/JosefNemec/Playnite/issues/791

Verdict for the product: Steam remains the only account link with an official route; every other store is closed to third parties, and the deck plus manual entry is the path for console players.


## 14. Addendum, 2026-09-28: per-title sales figures

Checked because Rafa wants sales to lead the popularity order for consoles where a publisher prints them ([../feature-ideas.md](../feature-ideas.md#1-bulk-entry), decision 20). Web search of official pages first, 2026-09-28.

- **Nintendo investor relations.** `https://www.nintendo.co.jp/ir/en/finance/software/index.html` with `switch.html` (ten titles) and the Switch 2 list on the index (six titles as of today), plus legacy `wiiu.html` and `3ds.html`: life-to-date worldwide units in millions, dated to the quarter end ("as of June 30, 2026"), refreshed with earnings (about February, May, August, November). Plain HTML, a title and a figure per row, no PDF. Only the current top six to ten per platform. Usable, official.
- **Sony.** No per-title page; one-off milestones on the PlayStation Blog and in earnings decks for a few first-party titles. Not usable as a feed.
- **Microsoft.** Publishes no unit figures at all since about 2015, by stated policy. Not usable.
- **Circana (NPD).** A monthly top twenty by dollar sales, rank only, at `https://www.circana.com/post/top-10-video-games`; units and dollars are a licensed subscription. Usable as a rank cross-check only.
- **Wikipedia "List of best-selling ... video games".** Pages exist for Switch, Switch 2, PlayStation 5, PlayStation 4, PC, Xbox One, and all platforms (about fifty rows: rank, title, sales in millions, series, platforms, release year, developer, publisher, reference); no page for Xbox Series X|S. Figures cite publisher earnings and press releases. Text is CC BY-SA 4.0; the figures are facts, attribution kept anyway. Fetched with the MediaWiki parse API (`action=parse&page=...&prop=wikitext|text&format=json`), then the wikitable parsed. Changes irregularly; poll monthly. Usable, compiled, cite.
- **Wikidata P2664 "units sold".** Exists, with a point-in-time qualifier and references, but patchy: Mario Kart 8 Deluxe has seven dated statements, Breath of the Wild and Grand Theft Auto V have none. A supplement the nightly job (item 22) can read, never a bulk feed.
- **VGChartz.** Stopped its own software estimates in 2018 and now relays official figures; no API or reuse terms. Not usable. Kaggle datasets scraped from it inherit the stale estimates. Backfill only, if ever, with the caveat shown.
- **Famitsu, Media Create, GSD, GfK, UK Chart-Track.** Weekly or monthly ranks in press write-ups, units behind subscriptions. Not usable.
- **SteamSpy, IGDB PopScore.** Ownership estimates and engagement scores, not units; SteamSpy degraded in 2026, PopScore's Steam types still unconfirmed. Not sales.

Recommended ingest: Nintendo IR quarterly and Wikipedia's per-platform lists monthly, both into one `title_sales` table (media item, platform or all, units, as-of date, source, reference URL), matched to the catalog by title and year with the unresolved rows kept for review; Wikidata P2664 layered on where present. That covers the head of every console's list, about the top fifty to a hundred titles, which is exactly the part of the deck that sales should order; below it IGDB's signals take over.
