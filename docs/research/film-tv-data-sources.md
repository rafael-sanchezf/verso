# Film and TV data sources for a ranking and watchlist app

Research date: September 16, 2026. Scope: what Verso can honestly display on a movie or series screen once the app adds film and TV alongside games, and where each fact legitimately comes from. Official documentation was preferred, then maintained open source libraries, then community writeups. Several pages refused automated fetches: the Letterboxd API page returns 403, `awardsdatabase.oscars.org` returns 403 to non browser clients and renders through JavaScript, the OMDb Patreon page returns 404, and `developer.fandango.com` no longer resolves. Where I could not read a page I say so and cite what I could confirm. Wikidata coverage numbers in Section D were measured by me against the live Query Service on the research date, not taken from a writeup.

Convention used below: "official" means the data owner publishes and supports the API; "unofficial" means reverse engineered or scraped, even if a well maintained library wraps it.

## 1. Summary table

| Source | Data | Official? | Auth | Cost | Risk |
|---|---|---|---|---|---|
| TMDB API v3/v4 | Catalog: movies and TV, runtime, genres, release dates by country and type, certifications, credits, collections, keywords, images, external IDs, vote_average, popularity, seasons and episodes | Yes | v3 API key or v4 bearer read token | Free for non commercial; commercial needs a written agreement | Low technically, medium legally |
| TMDB watch/providers (JustWatch) | Per region flatrate, rent, buy, free, ads provider lists | Yes (relayed) | Same TMDB key | Free; JustWatch attribution mandatory | Medium |
| JustWatch GraphQL | Same offers plus provider deep links | No; public but undocumented endpoint | None | Free | High |
| Reelgood | Availability | No public API | n/a | Third party scrapers only | High |
| IMDb non commercial datasets | averageRating, numVotes, basics, crew, episodes, principals, akas | Yes | None | Free, personal and non commercial only | High for a published app |
| IMDb API (AWS Data Exchange) | Licensed ratings and metadata, GraphQL | Yes | AWS account and contract | Enterprise; secondary reports say about 150,000 USD/year | Low technically, out of budget |
| Rotten Tomatoes | Tomatometer, audience score | No public API; Fandango feeds by authorization only | n/a | Secondary reports say from about 60,000 USD/year | High |
| Metacritic | Metascore, user score | No API; Fandom terms forbid automated access | n/a | n/a | High |
| OMDb API | Relays IMDb rating, Metascore and an RT percentage | Yes (the site), unlicensed for what it relays | API key | Free 1,000 req/day; Patreon from about 1 USD/month | High legally |
| TMDB vote_average | TMDB user score 0 to 10 with vote_count | Yes | Same TMDB key | Free | Low |
| Trakt API | Watched history, ratings, watchlist, playback progress | Yes | OAuth 2.0 | API app creation requires Trakt VIP (4.99 USD/month) since Aug 2026; commercial use by approval | Medium to high |
| Letterboxd API | Films, ratings, diary, lists | Yes, but request only | OAuth 2.0 | Free if granted; no guarantee of access | High (access) |
| Letterboxd CSV export | Diary, ratings, watched dates, rewatch flag | Yes | User uploads the file | Free | Low |
| Netflix viewing activity | Title and date | Yes (account export) | User uploads the file | Free | Low value |
| Simkl | Watched history, imports from many trackers | Yes | API key plus OAuth | Free tier | Medium |
| Plex (Tautulli) and Jellyfin (Playback Reporting) | Play dates, play counts, durations | Yes for Jellyfin; Tautulli wraps Plex | Local server token | Free, self hosted | Medium |
| Apple TV app | Watch history | No export at all | n/a | n/a | Not available |
| Wikidata | P444 review scores with P447 source, P166 awards, P1411 nominations, TMDB and IMDb IDs | Yes | None; mandatory User-Agent | Free, CC0 | Low legally, medium on coverage |
| Academy Awards Database, Emmys, BAFTA, Golden Globes, Cannes | Official award records | No APIs | n/a | Scrape only | High |
| Kaggle Oscars dataset (unanimad/the-oscar-award) | Oscar winners and nominees 1927 to 2026 | No; a scrape | Kaggle account | Free | Medium |

## 2. Section A: the film and TV catalog (TMDB)

### 2.1 What TMDB exposes for movies

`GET https://api.themoviedb.org/3/movie/{id}` returns `runtime` (minutes), `genres`, `release_date` (the primary date only), `status`, `vote_average`, `vote_count`, `popularity`, `budget`, `revenue`, `tagline`, `overview`, `homepage`, `imdb_id`, `belongs_to_collection`, `production_companies`, `production_countries`, `spoken_languages`, `origin_country`, `poster_path` and `backdrop_path`. Everything else arrives through `append_to_response`, which accepts a comma separated list of up to 20 sub endpoints in one round trip. The ones Verso needs:

- `release_dates`: an array per `iso_3166_1` country, each entry carrying `certification`, `release_date`, `note`, and a `type` code. The codes are 1 premiere, 2 theatrical limited, 3 theatrical, 4 digital, 5 physical, 6 TV. This is the only place the digital and physical dates live; the top level `release_date` will not tell you when something hit streaming.
- `credits`: `cast` ordered by an `order` field (so "top billed" is just the first N of `cast`), and `crew` where you filter `job == "Director"` and `job` in the writing set (Screenplay, Writer, Story) rather than trusting `department` alone.
- `external_ids`: `imdb_id`, `wikidata_id`, plus social handles. The `wikidata_id` is the join key for Section C and Section D and saves you a SPARQL lookup by TMDB ID.
- `keywords`, `images`, `videos`, `watch/providers`, `recommendations`, `similar`.

Collections. `belongs_to_collection` gives an id, name and artwork; `GET /collection/{id}` lists the parts. Coverage is good for studio franchises (Marvel, Bond, Star Wars) and patchy for loose trilogies.

### 2.2 What TMDB exposes for TV

`GET /3/tv/{id}` returns `status` (Returning Series, Ended, Canceled, In Production, Planned, Pilot), `in_production`, `type` (Scripted, Miniseries, Documentary, Reality, Talk Show, Video), `first_air_date`, `last_air_date`, `networks`, `created_by`, `number_of_seasons`, `number_of_episodes`, `episode_run_time` (an array, often empty or a single value), `seasons` (each with `season_number`, `name`, `air_date`, `episode_count`, `poster_path`), `next_episode_to_air` and `last_episode_to_air` (each a full episode stub with `air_date`, `episode_number`, `season_number`, `name`, `runtime`), plus the usual genres, images, popularity and vote fields. `append_to_response=content_ratings` returns one `rating` string per `iso_3166_1` with a `descriptors` array. `GET /3/tv/{id}/season/{n}` returns the full episode list with per episode `air_date`, `runtime`, `episode_number`, `overview`, `still_path`, `vote_average`, `guest_stars` and `crew`.

### 2.3 Auth, limits, images

Auth. v3 uses an `api_key` query parameter; v4 uses `Authorization: Bearer <read access token>`. Both come from the same account settings page, and the v4 bearer token works against v3 routes, so use the bearer form everywhere.

Rate limits. The docs say the old 40 requests per 10 seconds cap was disabled in December 2019 and that current limits "sit somewhere in the 40 requests per second range" (TMDB, Rate Limiting). Handle 429 and back off; the number can change without notice.

Images. `https://image.tmdb.org/t/p/{size}/{file_path}`, where the base and the size lists come from `GET /3/configuration`. Poster sizes are `w92, w154, w185, w342, w500, w780, original` and posters are 2:3. Backdrops are `w300, w780, w1280, original` at 16:9. Logos are `w45` through `w500`, profiles are `w45, w185, h632`, stills are `w92, w185, w300`. For a phone list row `w185` posters are enough; `w500` for the detail hero, `w780` backdrops for the header.

Mirroring. TMDB publishes daily ID exports at `https://files.tmdb.org/p/exports/movie_ids_MM_DD_YYYY.json.gz`, `tv_series_ids_...`, plus person, collection, network, keyword and production company files. The job "runs every day starting at around 7:00 AM UTC" with everything available by 08:00 UTC, and files are deleted after three months. There is also a changes API (`/movie/changes`, `/tv/changes`) for incremental sync, which is what a nightly mirror should actually key off.

### 2.4 The terms, which are the real constraint

Attribution is mandatory and specific: you "must use the TMDB logo to identify Your use" and display the notice "This product uses the TMDB API but is not endorsed or certified by TMDB" (TMDB, API Terms of Use and FAQ). The logo cannot be recolored, flipped or stretched, and the service may only be called "TMDB" or "The Movie Database".

Caching is allowed but capped. The terms prohibit you from "Cache, for longer than 6 months, any information obtained through or from TMDB". So the nightly mirror Verso already runs for IGDB is permitted for TMDB too, with one extra rule: every mirrored row needs a `refreshed_at` column and anything older than six months must be re-fetched or dropped. Design the sync so that no row can go stale past that window.

Commercial use is the sharp edge. The terms say deriving revenue "for commercial or monetary gain, directly or indirectly" is "only permitted under a separate written agreement", and they name "Charging users a fee for Your Application" as an example. The FAQ's test is whether "the primary purpose is to create revenue for the benefit of the owner". A free app with no ads, no subscription and no in app purchase is inside the free tier. The moment Verso adds a paid tier it is outside it, and the fix is an email to sales@themoviedb.org, not a reinterpretation. Community posts quote a commercial key at 149 USD/month; I could not confirm that from TMDB directly and several 2025 and 2026 forum threads asking exactly this question have no staff reply, so treat the number as unconfirmed and get a quote before pricing anything.

Practical reading for Verso: TMDB is the right catalog spine, the mirror is legal, and the paid tier is a business decision with a licensing step attached to it. Put that step in the roadmap next to the pricing decision, not after it.

Docs: https://developer.themoviedb.org/docs/getting-started and https://www.themoviedb.org/api-terms-of-use

## 3. Section B: streaming availability

### 3.1 TMDB watch/providers

`GET /3/movie/{id}/watch/providers` and the TV equivalent return a `results` object keyed by ISO 3166-1 country. Each country has a `link` and up to five arrays: `flatrate` (included with a subscription), `rent`, `buy`, `free`, and `ads`. Each provider entry is `{provider_id, provider_name, logo_path, display_priority}`, where `logo_path` goes through the same image CDN and `display_priority` is JustWatch's suggested ordering for that country.

Attribution. The endpoint documentation is blunt: "you must attribute the source of the data as JustWatch", and "If we find any usage not complying with these terms we will revoke access to the API". So the availability row needs a visible JustWatch credit, and the `link` field is what you link it to.

Deep links. There are none. The `link` is a TMDB page for that title and locale (for example `.../movie/550-fight-club/watch?locale=US`), which then hands off to JustWatch. Verso cannot open Netflix directly on the right title from this endpoint. Either send users to the TMDB watch page, or build your own provider deep links from app URL schemes and accept that they break.

Refresh. TMDB staff on the forums say the data is transmitted from JustWatch once per 24 hours and that new titles can lag another day or two behind that. Critically, watch provider changes are not tracked in TMDB's change history, so the nightly incremental sync will not surface them. Availability has to be polled on its own schedule: refresh it for titles a user is tracking, lazily on detail view with a short cache, rather than sweeping the catalog.

Provider directory. `GET /3/watch/providers/movie` and `/tv` list every provider with `provider_id`, `provider_name`, `logo_path` and `display_priorities` per country; `GET /3/watch/providers/regions` lists the supported countries.

Modeling "my streaming services". Store the provider directory as its own table keyed by `provider_id` with a per region priority. A user's subscriptions are `(user_id, provider_id, region)` rows, chosen from the providers available in their region. The availability table is `(media_id, region, provider_id, offer_type, fetched_at)` where `offer_type` is one of flatrate, rent, buy, free, ads. "On one of my services" is then an inner join, and it must be region scoped or it will lie to anyone who travels.

### 3.2 JustWatch directly, and Reelgood

JustWatch runs a public GraphQL endpoint that needs no credentials, and wrappers such as `simple-justwatch-python-api` use it. It carries what TMDB relays plus per offer price, quality (SD, HD, 4K) and real provider deep links. It is undocumented, has no published terms permitting this use, and JustWatch sells a commercial Content Insights product, which tells you how they would prefer you got it. Reelgood has no public API either; the Apify "Reelgood scraper" actually scrapes JustWatch's GraphQL underneath.

Verdict: use TMDB's relay. It is the same JustWatch data with an explicit permission and a written attribution rule attached. Do not reach past it for deep links.

Docs: https://developer.themoviedb.org/reference/movie-watch-providers

## 4. Section C: scores

### 4.1 IMDb

Non commercial datasets. `https://datasets.imdbws.com/` publishes seven gzipped TSV files refreshed daily: `title.basics`, `title.akas`, `title.crew`, `title.episode`, `title.principals`, `title.ratings` and `name.basics`. `title.ratings.tsv.gz` is exactly `tconst`, `averageRating` ("weighted average of all the individual user ratings") and `numVotes`. IMDb says these subsets are "available for access to customers for personal and non-commercial use" and that "You can hold local copies of this data".

Can a hobby app on the App Store use them? No. "Personal and non-commercial" does not stretch to a published product with users, even a free one, and the same page points anyone else at the licensed product. Using the datasets to power an IMDb rating on a shipped screen is a licensing violation regardless of whether money changes hands. They are fine for offline analysis, for a local prototype, and for nothing that ships.

Licensed IMDb API. Sold exclusively through AWS Data Exchange as "IMDb Essential Metadata for Movies/TV/OTT", GraphQL backed, covering IMDb's 1 to 10 rating alongside title and name metadata. Pricing is not published; secondary sources put entry pricing around 150,000 USD/year plus usage, negotiated with AWS. Out of reach, and worth saying plainly so nobody revisits it.

### 4.2 Rotten Tomatoes

No public API. Access to the Tomatometer runs through Fandango's data feeds, granted by authorization only; the terms page I tried (`developer.fandango.com`) no longer resolves, and secondary sources put the annual fee at around 60,000 USD for scores plus up to 20 review snippets. Scraping is explicitly out: the Rotten Tomatoes Terms of Use say you shall not "use any robots, spiders, crawlers, devices, scripts" to "scrape, data mine, or aggregate any content", and separately prohibit using the content to train any AI tool.

### 4.3 Metacritic

Unchanged from the games research: a Fandom property, no API, and Fandom's Terms of Use prohibit automated access to the Services without written permission. See `docs/research/game-data-sources.md` section 3.1. The same conclusion carries to film and TV.

### 4.4 OMDb

OMDb relays an IMDb rating and vote count, a `Metascore`, and a `Ratings` array whose three members are labelled Internet Movie Database, Rotten Tomatoes and Metacritic. Free tier is 1,000 requests per day with a key; higher limits and the poster API come through Patreon from roughly 1 USD/month (the Patreon page 404'd for me, so treat the tier detail as secondary).

Be precise about what OMDb's own terms say, because this is where people get it wrong. The site footer states "All content licensed under CC BY-NC 4.0" and "This site is not endorsed by or affiliated with IMDb.com". Its legal page grants users only a "non-exclusive license to use and copy other users' Contributions solely for personal, non-commercial purposes" and states "You may not build a business utilizing the Contributions, whether or not for profit."

So OMDb does two things at once: it applies a CC BY-NC label to data it does not own, and it forbids exactly the use Verso would make of it. There is no license from IMDb, Fandango or Fandom behind any of it. Relaying an IMDb or Rotten Tomatoes number through OMDb into Verso's UI is not a licensed path to those scores; it is the same violation with an extra hop. Do not use it.

### 4.5 TMDB vote_average

`vote_average` (0 to 10) and `vote_count` come with every movie and TV record, cost nothing extra, are cacheable under the same six month rule, and are the only score Verso has a clear right to render. Coverage is universal across the catalog. The honest label is "TMDB users", not "rating" and not "score", and `vote_count` should be shown or used as a suppression threshold, because a 10.0 from four votes is noise.

### 4.6 Trakt

Official REST API with OAuth 2.0. Documented limits: 1,000 GET calls per 5 minutes, and 1 POST/PUT/DELETE per second, with 429 plus a `Retry-After` header when exceeded. Ratings and watched history are available through `/sync/*`.

The problem is new in 2026. Since early August 2026, creating a Trakt API application requires a Trakt VIP subscription at 4.99 USD/month, and developers reported existing applications disappearing. Commercial use, meaning apps that monetize Trakt data or generate significant traffic, has always required approval through their forums. A dependency that can vanish on a billing state is a poor foundation; it is fine as an optional user import, not as a data source.

### 4.7 Letterboxd

The API is real, uses OAuth 2.0 with client credentials for public data and authorization code for member data, and is "available by request only" via api@letterboxd.com, with no guarantee of a reply or access. Its own API page returned 403 to my fetch, so this is from Letterboxd's stated process as reported in current summaries. Apply if you want it, but plan as though it will not arrive. The CSV export in Section E covers the actual user need without waiting on anyone.

### 4.8 Wikidata P444 as the only licensed route to RT and Metacritic numbers

Wikidata models a review score as P444 (a string like "93%" or "90/100") qualified by P447 "review score by" pointing at the aggregator item: Rotten Tomatoes is Q105584, Metacritic is Q150248, IMDb is Q37312. P459 "determination method" distinguishes Tomatometer from audience score. Everything on Wikidata is CC0.

Measured coverage on the research date, counting only items that also carry a TMDB movie ID (P4947):

| Statement | Films with a TMDB ID |
|---|---|
| Any P444 review score | 26,991 |
| P444 with P447 = Rotten Tomatoes | 26,273 |
| P444 with P447 = Metacritic | 10,263 |
| Total films carrying a TMDB movie ID | 281,675 |

So roughly one film in ten has a Rotten Tomatoes score on Wikidata, skewed hard toward notable releases. For the films a ranking app's users actually argue about, coverage is decent; for the long tail it is absent.

Is displaying it legitimate? Yes, with care. The value is a CC0 community contributed fact, not a feed from Fandango, and facts are not the copyrighted part. Two conditions make it honest rather than laundering: label it by source and by date ("Rotten Tomatoes, per Wikidata, as of 2026-04-11" using the P585 qualifier or the statement reference), and never present it as live or as Verso's own. Do not lift the Tomatometer logo, the fresh and rotten icons, or any RT branding; those are trademarks and the terms above still bind you. If Fandango objects, you remove a Wikidata backed field, which is a small blast radius.

## 5. Section D: awards

### 5.1 Where structured awards data actually lives

Nowhere official. `awardsdatabase.oscars.org` has no API, renders through JavaScript, and returns 403 to non browser clients. Emmys (emmys.com), BAFTA, the Golden Globes and Cannes publish browsable archives and no machine readable interface. That leaves Wikidata, and it is better than you would expect if you query it correctly and worse than you would hope if you do not.

### 5.2 The Wikidata model and its four pitfalls

Awards use P166 "award received" and P1411 "nominated for", both taking an award **category** item (Academy Award for Best Picture is Q102427, itself an instance of "award for best film"), qualified by P585 point in time, P1686 "for work", P1346 winner, and P805 statement is subject of.

I measured the shape against Oppenheimer (TMDB movie 872585), which won 7 Oscars from 13 nominations.

Pitfall 1: most of the awards are not on the film. Querying the film item alone returns 4 Oscar wins and 1 nomination. The acting, directing, cinematography, editing and score statements live on the **person**, with P1686 "for work" pointing back at the film. Union the two directions and you get 7 distinct winning categories and, with nominations, 13 distinct categories. That matches reality exactly. Query one direction only and you under report by half.

Pitfall 2: a win usually does not come with a matching nomination statement. Cinematography, Film Editing and Original Score appear only as P166 wins, never as P1411. So "nominations" is not `COUNT(P1411)`; it is the count of distinct categories in the union of P166 and P1411 for that ceremony. Wins is the count of distinct P166 categories.

Pitfall 3: shared awards duplicate. Best Picture is held by each of the three producers, so a naive count returns 3 wins for one Oscar. Always `COUNT(DISTINCT ?category)`, never count statements.

Pitfall 4: contradictions and sloppy dates. Oppenheimer's film item carries Best Picture as both won and nominated. P585 values are inconsistent: some are the real ceremony date (2024-03-10), many are a January 1st placeholder, some are the announcement date. Group by year, not by exact date, and prefer the ceremony item when one is linked.

### 5.3 How good is it, per award body

Film is usable. Across the whole graph, 8,587 films with a TMDB ID carry at least one P166 and 11,057 carry at least one P1411, out of 281,675. That is thin overall but dense where it matters, and the Oppenheimer test shows the Oscars specifically reconcile to the official count once both directions are queried. BAFTA, Golden Globes and the guild awards appear on the same items with the same shape.

TV is materially worse. Succession (TMDB TV 76331) returns about 10 Primetime Emmy wins against 19 in reality, nominations are almost entirely missing, and the modeling is looser: the series item itself carries "Golden Globe Award for Best Actor", which is a person's award attached to the wrong entity. There are only 63,662 TV series carrying a TMDB TV ID at all.

Verdict for the UI. "Won 2 Oscars" is reliable for films when you query both directions and dedupe by category. "5 nominations" is reliable for films and unreliable for series. For TV, show Emmy **wins** with a light touch and do not show a nomination count at all. Never show a zero: absent data and genuinely zero awards are indistinguishable here, so render the awards row only when the union returns something.

### 5.4 The SPARQL shape

All awards and nominations for the film with TMDB ID X, both directions, deduplicated by category:

```sparql
SELECT DISTINCT ?result ?category ?categoryLabel ?year WHERE {
  ?film wdt:P4947 "872585" .          # P4983 for a TV series, P345 for an IMDb ID
  {
    ?film p:P166 ?st . BIND("won" AS ?result)
  } UNION {
    ?film p:P1411 ?st . BIND("nominated" AS ?result)
  } UNION {
    ?person p:P166 ?st . ?st pq:P1686 ?film . BIND("won" AS ?result)
  } UNION {
    ?person p:P1411 ?st . ?st pq:P1686 ?film . BIND("nominated" AS ?result)
  }
  ?st ps:P166|ps:P1411 ?category .
  OPTIONAL { ?st pq:P585 ?time . BIND(YEAR(?time) AS ?year) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
```

Then, in the sync job rather than in SPARQL: filter `?category` to the bodies you display by walking its class (Academy Award, Primetime Emmy Award, BAFTA, Golden Globe), collapse to distinct categories, and compute wins as distinct won categories and nominations as distinct categories overall. Query Service limits are the ones already documented in the games research: a 60 second deadline, 60 seconds of processing per 60 second window, 5 parallel queries per IP, and a real User-Agent is mandatory.

### 5.5 Fallback

`unanimad/the-oscar-award` on Kaggle is a scrape of the Academy Awards Database covering 1927 to 2026 as a single CSV of ceremony, year, category, nominee, film and a winner boolean. Kaggle's page did not load for me (reCAPTCHA), so I could not confirm the license field; the dataset is widely described as CC0 but verify that on the page before shipping it. It is a good cross check for Oscars specifically and covers nothing else. Use it to validate the Wikidata job, not to replace it.

## 6. Section E: user history import (the Steam analog)

There is no Steam here. No single service holds most people's viewing history, and the one that held the most just deleted it: TV Time shut down on July 15, 2026, and every account's watch history was permanently deleted, so it is not an import path at all.

| Source | Watched dates | Rewatch counts | Ratings | Notes |
|---|---|---|---|---|
| Trakt (OAuth) | Yes, `watched_at` ISO 8601 per play | Yes, one row per play | Yes, `/sync/ratings` | Best fidelity; gated behind VIP for new API apps since Aug 2026 |
| Letterboxd CSV | Yes, `WatchedDate` | Flag only, not a count | Yes, `Rating` or `Rating10` | Films only; no TV |
| Netflix CSV | Date only | No | No | Title strings only, no IDs |
| Simkl | Yes | Yes | Yes | Also imports from Trakt, MAL, Netflix |
| Plex via Tautulli | Yes | Yes | No | Self hosted only |
| Jellyfin Playback Reporting | Yes | Yes | No | Self hosted only |
| Apple TV app | No export | No | No | Not available |

Trakt. `/sync/history` returns every play with a distinct `watched_at`, which is how rewatches are represented, and accepts the same shape on POST. `/sync/ratings`, `/sync/watchlist` and `/sync/playback` cover the rest. This is the only source that gives Verso everything it wants in one OAuth flow, and the VIP gate is the reason it cannot be the only one.

Letterboxd CSV. The export is a zip; `diary.csv` and `ratings.csv` are the useful members. The documented import columns are `LetterboxdURI`, `tmdbID`, `imdbID`, `Title`, `Year`, `Directors`, `Rating` (0.5 to 5 in half steps), `Rating10`, `WatchedDate` (YYYY-MM-DD), `Rewatch` (boolean), `Tags` and `Review`. The presence of `tmdbID` in the format is a gift: matching is exact, not fuzzy. `Rewatch` is a flag on a diary entry, so a rewatch **count** is derived by grouping diary rows per film, not read from a field. Films only.

Netflix. The Viewing activity page has a "Download all" button producing a two column `Title,Date` CSV with dates in M/D/YY. The fuller GDPR style data request yields `CONTENT_INTERACTION/ViewingActivity.csv` with profile name, duration and device. Neither has IDs or ratings, and episodes arrive as one free text string like `Show: Season 1: Episode Title`, which needs parsing and fuzzy matching per row. Low value, high support cost; treat it as a phase 3 nicety if users ask.

Plex and Jellyfin. Jellyfin's Playback Reporting plugin exposes play events through its own API; Plex history is usually read via Tautulli. Both give dates and play counts. These are power user paths and each needs a server URL and a token, so they belong behind an "advanced" affordance if at all.

Recommended order: Letterboxd CSV first (no OAuth, no partner approval, exact TMDB IDs, and it is the population most likely to care about ranking films), then Trakt OAuth for TV history, then nothing else until users ask.

## 7. Section F: TV specifics

Seasons and specials. The `seasons` array includes season 0 when a show has specials. Per TMDB's TV Bible, season 0 is where specials live and it is not counted in the show's episode totals, so `number_of_seasons` and `number_of_episodes` cover seasons 1 and up only. Verso should mirror that: exclude season 0 from progress and completion, and surface specials as an optional extra list. A user who has watched every numbered episode is "caught up" even with specials unwatched.

Can the app compute "you have seen 5 of 8 aired episodes"? Yes, from TMDB alone. Walk the season details for seasons 1 and up, count episodes whose `air_date` is not null and is on or before today, and intersect with the user's watched set. `last_episode_to_air` gives you the cheap version of the denominator without paging every season, and `next_episode_to_air` is null exactly when nothing is scheduled, which is the honest signal for "you are up to date". Two caveats: `air_date` is a plain date with no timezone and reflects the original network airing, so a user in a different region can be "ahead" of it by a day; and a streaming season dump has every episode on one date, which makes the aired count jump from 0 to 10 in one step rather than weekly.

Episode runtime reliability. Poor enough that total watch time is an estimate, and should be labelled as one. The series level `episode_run_time` is an array that is frequently empty or a single number that does not describe a show whose episodes range from 22 to 75 minutes. Per episode `runtime` in the season details is better but is null on a lot of older, non English and reality programming. The workable rule: sum per episode `runtime` where present, fill gaps with the median runtime of that show's episodes that do have one, fall back to `episode_run_time[0]`, and if neither exists show nothing rather than a guess. Prefix the number with "about".

Anime. Two problems. First, numbering: TMDB records the original broadcast order, while fansubs, streaming platforms and most fan discussion use absolute episode numbering. TMDB's episode groups endpoint (`/tv/{id}/episode_groups`) holds alternate orderings for shows that have them, but coverage is inconsistent and your mirror would need per show handling. Second, structure: anime cours are routinely entered as separate series rather than separate seasons, so what a user calls one show is several TMDB IDs with no reliable link between them. Neither problem is solvable generically. Ship the TMDB structure as is, and expect anime users to complain.

Miniseries. Easier. `type` is "Miniseries" and `status` is "Ended" with one season, so the UI can drop "returning/ended" and season navigation entirely and treat it closer to a film. Watch out for limited series that got renewed, where `type` stays "Miniseries" while `number_of_seasons` climbs.

What users actually mark. Trakt tracks per episode with one tap mark season, per season progress bars and a continue watching view, and scrobbles automatically when connected to Plex, Jellyfin, Emby or Infuse. Serializd is per episode and per season with half star ratings on individual episodes and a diary. TV Time, before it closed, was per episode with no per episode ratings. The common pattern across all of them: the storage model is per episode, and the **interaction** model is per season plus a "mark everything up to here" affordance, because nobody taps 62 checkboxes. For Verso this matters beyond bookkeeping: the head to head comparison should rank the series, or arguably the season, never the episode. Store per episode, rank per series, and let "mark season watched" write the episode rows underneath.

## 8. Section G: regional data

Certifications. Movies carry a certification per country per release type inside `release_dates`, so a single film can hold "R" for the US theatrical entry and a different value for the same country's TV release. TV carries one `rating` per country via `content_ratings`. The US values are the MPA set (G, PG, PG-13, R, NC-17) and TV Parental Guidelines (TV-Y through TV-MA); the UK values are BBFC (U, PG, 12A, 12, 15, 18). `GET /3/certification/movie/list` and `/certification/tv/list` return the valid values per country with their meanings, which you need anyway to order them and to avoid rendering a certification the user's country does not use.

Release dates. There is no single release date. A film can have a festival premiere in one country, a limited theatrical run, a wide theatrical date, a digital date and a physical date, all different, all per country. The top level `release_date` picks one and will be wrong for anyone outside the primary market.

Providers. Availability is per region by construction, and the provider set itself differs: a `provider_id` valid in the US may not exist in Spain, and `display_priority` is per country.

What to store per region. One `region` column threaded through three tables: certifications `(media_id, region, certification, release_type)`, release dates `(media_id, region, release_type, date)`, and availability `(media_id, region, provider_id, offer_type, fetched_at)`. The user gets one `region` on their profile, defaulted from the device locale and editable, and every one of those three reads is filtered by it. Get this in the first migration; retrofitting a region column into a shipped schema is the kind of work that eats a week.

## 9. Recommended stack for MVP

1. Catalog: TMDB as the single source of truth for movies and TV, mirrored into Postgres exactly the way IGDB already is. Pull the daily ID exports for discovery and the changes API for incremental updates. Add a `refreshed_at` on every mirrored row and a job that re-fetches anything approaching six months, because the terms cap the cache at six months.
2. Attribution: the TMDB logo plus "This product uses the TMDB API but is not endorsed or certified by TMDB", unmodified, in a static location. A JustWatch credit wherever availability appears.
3. Images: `image.tmdb.org` with `w185` posters in lists, `w500` on detail, `w780` backdrops. Store `poster_path` and build URLs at render time so a size change is a client change.
4. Availability: TMDB watch/providers, refreshed on its own schedule (it is invisible to the changes API), region scoped, with a `(user_id, provider_id, region)` table for "my services" sourced from `/watch/providers/regions` and the provider list.
5. Scores: TMDB `vote_average` with `vote_count` as the default, labelled "TMDB users", suppressed below a vote threshold. Add a nightly Wikidata SPARQL job keyed by the `wikidata_id` already in TMDB's `external_ids` to pick up P444 with P447, and show Rotten Tomatoes and Metacritic values labelled by source and date where they exist. No IMDb rating in the MVP.
6. Awards: nightly Wikidata job using the two direction query in 5.4, deduplicated by category, wins and nominations for films, wins only for series, row hidden entirely when empty.
7. History import: Letterboxd CSV upload first (exact `tmdbID` matching, no partner approval). Trakt OAuth second, clearly marked as requiring a Trakt account.
8. TV progress: per episode rows, seasons 1 and up, season 0 excluded from completion. "Up to date" means `next_episode_to_air` is null or in the future and all aired episodes are watched.
9. Regional: a `region` on the user profile from day one, threaded through certifications, release dates and availability.

Compliance checklist for the MVP: TMDB logo and the exact disclaimer sentence; JustWatch credit on the availability row; a six month cache ceiling enforced in code; no IMDb rating, no Rotten Tomatoes or Metacritic branding, and any RT or Metacritic number labelled as sourced from Wikidata with its date; a meaningful User-Agent on every Wikidata request; a licensing conversation with sales@themoviedb.org before any paid tier ships.

## 10. Deferred or risky

- TMDB commercial license: not optional once Verso charges. Email sales@themoviedb.org before pricing, not after. The 149 USD/month figure circulating on forums is unconfirmed.
- IMDb ratings: no. The non commercial datasets do not cover a published app, and the licensed API is enterprise priced.
- Rotten Tomatoes and Metacritic direct: no. No public API, terms forbid scraping, and the licensed feeds are far out of budget. Wikidata P444 is the only honest route, with caveats.
- OMDb: no. Its own terms forbid building a business on it, and it holds no license for the IMDb and Rotten Tomatoes numbers it relays.
- JustWatch GraphQL directly: no, even for deep links. Use TMDB's relay and link to the TMDB watch page.
- Trakt as a data source: no. As an optional user import, yes, with the VIP gate disclosed in the UI.
- Letterboxd API: apply, but do not plan around it. The CSV import covers the need.
- Netflix CSV import: defer. Title strings with no IDs, no ratings, high matching cost.
- Plex and Jellyfin imports: defer to a power user setting.
- Awards for TV: show wins only, no nomination counts, until Wikidata's Emmy coverage improves.
- Anime absolute numbering and multi cour series: known broken, no generic fix. Document the limitation rather than half solving it.
- Total watch time: ship it as "about N hours" or not at all. Per episode runtime is too patchy to state precisely.
- Oscars from Kaggle: only as a validation cross check for the Wikidata job, and confirm the license on the dataset page first.

## 11. Sources

Catalog
- [TMDB API getting started](https://developer.themoviedb.org/docs/getting-started)
- [TMDB API Terms of Use](https://www.themoviedb.org/api-terms-of-use)
- [TMDB API FAQ (attribution, commercial use)](https://developer.themoviedb.org/docs/faq)
- [TMDB rate limiting](https://developer.themoviedb.org/docs/rate-limiting)
- [TMDB image basics](https://developer.themoviedb.org/docs/image-basics)
- [TMDB configuration details (image sizes)](https://developer.themoviedb.org/reference/configuration-details)
- [TMDB movie details](https://developer.themoviedb.org/reference/movie-details)
- [TMDB movie release dates](https://developer.themoviedb.org/reference/movie-release-dates)
- [TMDB TV series details](https://developer.themoviedb.org/reference/tv-series-details)
- [TMDB TV season details](https://developer.themoviedb.org/reference/tv-season-details)
- [TMDB TV content ratings](https://developer.themoviedb.org/reference/tv-series-content-ratings)
- [TMDB TV episode groups](https://developer.themoviedb.org/reference/tv-series-episode-groups)
- [TMDB daily ID exports](https://developer.themoviedb.org/docs/daily-id-exports)
- [TMDB TV Bible: seasons](https://www.themoviedb.org/bible/tv/59f73eb49251416e71000026)
- [TMDB Talk: guideline on how to deal with TV specials](https://www.themoviedb.org/talk/65003246d7dcd200acb03370)
- [TMDB Talk: clarification on free app use and commercial license](https://www.themoviedb.org/talk/681a1956bbbf46d7f66404f9)

Streaming availability
- [TMDB movie watch providers](https://developer.themoviedb.org/reference/movie-watch-providers)
- [TMDB watch providers list](https://developer.themoviedb.org/reference/watch-providers-movie-list)
- [TMDB Talk: how fresh is the JustWatch data](https://www.themoviedb.org/talk/673f68df46541bbcd379ee55)
- [TMDB Talk: changes API and watch information](https://www.themoviedb.org/talk/63de2458373ac200cafd16e6)
- [simple-justwatch-python-api](https://pypi.org/project/simple-justwatch-python-api)
- [JustWatch Content Insights (commercial product)](https://media.justwatch.com/content-insights)

Scores
- [IMDb non-commercial datasets](https://data.imdb.com/non-commercial-datasets/)
- [IMDb datasets download](https://datasets.imdbws.com/)
- [IMDb API getting access (AWS Data Exchange)](https://data.imdb.com/documentation/api-documentation/getting-access/)
- [AWS Marketplace: IMDb Essential Metadata (API)](https://aws.amazon.com/marketplace/pp/prodview-wdqq4hg3bcbws)
- [Rotten Tomatoes Terms of Use](https://www.rottentomatoes.com/policies/terms-of-use)
- [Fandango API license terms and conditions (PDF)](https://images.fandango.com/doc/FandangoAPILicenseTermsandConditions.pdf)
- [OMDb API](https://www.omdbapi.com/)
- [OMDb API legal](https://www.omdbapi.com/legal.htm)
- [Trakt API documentation](https://trakt.docs.apiary.io/)
- [trakt/trakt-api on GitHub](https://github.com/trakt/trakt-api)
- [Trakt forums: updating Trakt limits for 2026](https://forums.trakt.tv/t/updating-trakt-limits-for-2026/101592)
- [Trakt locks its API behind a VIP subscription](https://ettayeb.fr/en/selfhosted/trakt-api-paywall-selfhosted-media/)
- [Letterboxd API (beta)](https://letterboxd.com/api-beta/)
- [Wikidata P444 review score](https://www.wikidata.org/wiki/Property:P444)

Awards
- [Wikidata P166 award received](https://www.wikidata.org/wiki/Property:P166)
- [Wikidata P1411 nominated for](https://www.wikidata.org/wiki/Property:P1411)
- [Wikidata P4947 TMDB movie ID](https://www.wikidata.org/wiki/Property:P4947)
- [Wikidata P4983 TMDB TV series ID](https://www.wikidata.org/wiki/Property:P4983)
- [Wikidata WikiProject Movies: properties](https://www.wikidata.org/wiki/Wikidata:WikiProject_Movies/Properties)
- [Wikidata Query Service user manual (limits)](https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual)
- [Academy Awards Database](https://awardsdatabase.oscars.org/)
- [Oscars.org awards databases](https://www.oscars.org/oscars/awards-databases)
- [Kaggle: The Oscar Award 1927 to 2026](https://www.kaggle.com/datasets/unanimad/the-oscar-award)

History import and TV tracking
- [Letterboxd: importing data (CSV columns)](https://letterboxd.com/about/importing-data/)
- [Netflix: how to see viewing history](https://help.netflix.com/en/node/101917)
- [Simkl: import from Trakt](https://simkl.com/apps/import/trakt/)
- [Tracearr: import watch history from Tautulli and Playback Reporting](https://docs.tracearr.com/getting-started/import)
- [TV Time is shutting down (official support article)](https://whipmedia.freshdesk.com/support/solutions/articles/68000029988-tv-time-is-shutting-down)
- [Serializd vs Trakt: per episode and per season tracking](https://www.achriom.com/blog/serializd-vs-trakt/)

## 12. What the screens can show

One line each, with the source and the label the UI puts next to the number. Verso labels every score by its source and never fakes a number.

- **Runtime.** Yes. TMDB `runtime` for films, per episode `runtime` for TV. No label needed.
- **Certification.** Yes, with caveat. TMDB `release_dates` (films) and `content_ratings` (TV), filtered to the user's region, blank when that region has no entry. Label: the value alone, for example "R" or "15".
- **Director and top cast.** Yes. TMDB `credits`, crew filtered to `job == "Director"`, cast sorted by `order`. No label needed.
- **Genres.** Yes. TMDB `genres`. No label needed.
- **Theatrical and streaming release dates.** Yes. TMDB `release_dates` by region, type 3 for theatrical and type 4 for digital. Label each date with its type ("In theaters", "Digital").
- **Where it is streaming, and on which of my services.** Yes, with caveat. TMDB watch/providers for the user's region, joined to their provider list. Caveat: no deep links, so the row links to the TMDB watch page. Label: "Streaming data by JustWatch".
- **TMDB user score.** Yes. TMDB `vote_average` with `vote_count`, suppressed below a threshold. Label: "TMDB users".
- **IMDb rating.** No. The datasets are personal and non commercial only and the licensed API is enterprise priced. Link out to the IMDb page using `external_ids.imdb_id` instead.
- **Rotten Tomatoes critic score.** With caveat. Wikidata P444 qualified by P447 = Q105584, present for roughly one in ten films. No RT logo or fresh/rotten iconography. Label: "Rotten Tomatoes, via Wikidata" plus the statement date.
- **Rotten Tomatoes audience score.** No. Wikidata coverage for the audience number is far thinner than for the Tomatometer and too sparse to display consistently.
- **Metacritic.** With caveat. Wikidata P444 qualified by P447 = Q150248, about 10,000 films. Label: "Metacritic, via Wikidata" plus the date.
- **Awards won, films.** Yes. Wikidata P166 through the two direction query, deduplicated by category. Label: "Won 7 Oscars" with the body named.
- **Award nominations, films.** Yes. Distinct union of P166 and P1411 categories, never `COUNT(P1411)`. Label: "13 nominations" with the body named.
- **Awards won, TV.** With caveat. Wikidata coverage undercounts Emmys (Succession returns about 10 of 19). Show wins, hide the row when empty, never show a zero.
- **Award nominations, TV.** No. Wikidata's nomination coverage for series is too incomplete to state.
- **Franchise or collection.** Yes. TMDB `belongs_to_collection` and `/collection/{id}`. Label: the collection name.
- **TV status (returning or ended).** Yes. TMDB `status` and `in_production`. Label: the status string, mapped to friendly text.
- **Seasons and episode counts.** Yes. TMDB `number_of_seasons` and `number_of_episodes`, seasons 1 and up, season 0 specials excluded.
- **Next episode air date.** Yes, with caveat. TMDB `next_episode_to_air`. Caveat: the date has no timezone and is the original network date. Label: "Next episode" plus the date, or "No date announced" when null and the show is still returning.
- **Total watch time (episodes times runtime).** With caveat. Summed per episode `runtime` with the show's median filling gaps, nothing shown when there is no runtime data at all. Label: "about N hours".
- **Watched history import.** Yes. Letterboxd CSV (films, exact `tmdbID`, `WatchedDate`, rewatch derived by grouping diary rows) and Trakt OAuth (films and TV, `watched_at` per play, so real rewatch counts). Label: name the source in the import flow, and disclose that Trakt now requires a VIP account.
