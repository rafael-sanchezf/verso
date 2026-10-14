# Film and TV catalog: the TMDB mirror

Written 2026-09-16 by the orchestrating session, ahead of V3, while the media structure round ([media-brief.md](media-brief.md), PR #43) waits for Rafa's reactions. This is the backend half of "Catalog from TMDB": what is mirrored, from which requests, into which tables, on what schedule. It decides nothing about screens; every fact it stores is one the brief or the research names. The research it leans on is [../research/film-tv-data-sources.md](../research/film-tv-data-sources.md); read that first and do not re-derive it.

The one-line version: the same mirror as IGDB, one request per title instead of one per page, a popularity threshold instead of a rating threshold, and three extra rules the TMDB terms impose (attribution, a six-month cache ceiling, a written license before any paid tier).

## What stays the same as the games mirror

- TMDB is mirrored into Postgres by a scheduled script in `packages/catalog`. The app never calls TMDB; it reads `media_items` and the extension tables through `packages/api`, and it builds image URLs at render time from stored paths (tech-stack.md: store the id, hotlink the CDN).
- The core tables are untouched. `media_items` gets rows with `medium = 'movie'` and `medium = 'tv'`; `external_ids` gains `tmdb`, `imdb`, `wikidata` (and `tvdb` for series); `external_scores` gains the source `tmdb`. Rankings, entries, comparisons, and lists already key by medium.
- Catalog tables are readable by every signed-in user and written only by the service role, with the grants `game_availability` uses (revoke write privileges, keep `select` for `anon` with no policy so a signed-out read is an empty set, not an error). Every new table has RLS and a pgTAP suite whose counts are scoped to its own fixture ids (PR #24).
- One command, resumable: nothing accumulates in memory, each batch commits, and a run that dies is resumed by running it again because `refreshed_at` gates what is fetched.
- Secrets from the environment only. The token is `TMDB_API_READ_ACCESS_TOKEN` (TMDB's own name for the v4 read access token, which works as a bearer on every v3 route). Without it the command skips with one log line and the scheduled job stays green, the way `opencritic-scores` does; a missing secret is a run with nothing to do, not a red workflow.

## Access and terms

Rafa creates a TMDB account, requests an API key (free, "Developer" type, a short form) and copies the **API Read Access Token** from the same settings page into `.env` and into a repository secret named `TMDB_API_READ_ACCESS_TOKEN`. Steps in [tmdb-setup.md](tmdb-setup.md).

Three rules from the terms (research 2.4 and 3.1) are design constraints, not later polish:

1. **Attribution.** The TMDB logo, unmodified, and the sentence "This product uses the TMDB API but is not endorsed or certified by TMDB", in a static place (Settings, About, beside the IGDB credit). Every availability row carries "Streaming data by JustWatch" and links to TMDB's watch page for the title (`https://www.themoviedb.org/movie/{tmdb_id}/watch?locale={region}`, `/tv/` for series). The app's job; the mirror stores nothing for it.
2. **Six-month cache ceiling.** No mirrored row may go longer than six months without being re-fetched. The nightly staleness pass (below) refreshes rows older than 150 days, stalest first, which keeps every row inside the window with slack for a job that fails for a few weeks.
3. **Commercial use.** A free app with no ads, subscription, or purchase is inside the free tier. Before any paid tier ships, a written license from sales@themoviedb.org. Recorded in the roadmap next to pricing.

## Scope: what is mirrored

TMDB holds over a million films and a couple of hundred thousand series. The mirror carries a popularity-thresholded core plus every title anyone has touched (V3, ROADMAP.md). Two rules, applied in sequence, the way `catalogTrim` is one rule applied twice:

**Discovery** decides which ids to fetch at all. Sources: TMDB's daily id exports (`https://files.tmdb.org/p/exports/movie_ids_MM_DD_YYYY.json.gz` and `tv_series_ids_MM_DD_YYYY.json.gz`, public, no key, published by 08:00 UTC, kept three months; one JSON object per line with `id`, `original_title` or `original_name`, `popularity`, `adult`, and for movies `video`). An id is discovered when `adult` is false and `popularity` is at or above the medium's threshold. The thresholds are constants in `packages/catalog` chosen by measuring the export on 2026-09-16 to land near 40,000 films and 15,000 series (the measured distribution is recorded in [tmdb-setup.md](tmdb-setup.md) under "Sizing", and the constants carry the numbers in their comments). Every id already in the catalog is always in the set, whatever its popularity today.

**Keep** decides, once the detail is fetched, whether the row is written: not `adult`; `poster_path` present (a row with no art is not showable, as with IGDB covers); a non-empty title; and either `vote_count >= 1` or a primary release date (first air date for series) within the last 730 days or in the future, so new releases are searchable before anyone votes. The analog of the games rule, with TMDB's fields.

**Never deleted.** A row that stops matching either rule stays; a user may have ranked it, and `media_items` rows cascade into rankings and comparisons. When TMDB answers 404 for an id we hold, the run stamps `metadata.tmdb_missing_at` and leaves the row alone; the staleness pass skips rows carrying that stamp for 90 days and then tries once more.

**Not mirrored in this pass**, each a later job: episodes (one request per season; fetched on demand when a user starts a show, since the pointer and "up to date" need them and the catalog does not); people beyond the names and profile paths in `top_cast`; collection membership beyond the id and name; images beyond `poster_path`, `backdrop_path`, and provider logos; keywords, videos, recommendations; awards and the Wikidata P444 scores (a Wikidata pass keyed by `external_ids.wikidata`, the film analog of `wikidata-ids`); the on-demand fetch for search misses (built 2026-10-13, VER-158; see "Search misses" below).

## Requests

One request per title, everything in `append_to_response` (up to 20 sub-resources in one round trip), `language=en-US`:

- Movie: `GET /3/movie/{id}?append_to_response=credits,external_ids,release_dates,watch/providers`.
- Series: `GET /3/tv/{id}?append_to_response=aggregate_credits,external_ids,content_ratings,watch/providers`. `aggregate_credits` rather than `credits` because a show's `credits` is the latest season's cast, while the aggregate is ordered by episodes across the run, which is what "top cast" means for a series.

Rate: TMDB says the old 40-per-10-seconds cap is gone and current limits "sit somewhere in the 40 requests per second range" and can change without notice (research 2.3). The client spends half of that, 20 starts a second and 8 in flight, through the existing `RateLimiter` (a published allowance is a budget to spend; the `IntervalLimiter` shape is for undocumented endpoints). A 429 backs off honouring `Retry-After`, capped as `http.ts` caps it; a second 429 in a row halves the pace for the rest of the run. Request timeouts as the other clients set them.

Cost: a 55,000-title core is 55,000 requests, about 46 minutes at 20 a second; a nightly run is a few thousand.

The other requests a run makes: the two provider directories (`GET /3/watch/providers/movie` and `/tv`, all regions in one response each), the changes feeds (`GET /3/movie/changes?start_date&end_date&page` and `/tv/changes`, paginated, a window of at most 14 days), and the daily exports (files, not API calls).

## The command: `tmdb-sync`

`pnpm catalog:tmdb-sync` (`tsx src/cli.ts tmdb-sync`), with the flags the other commands have and these:

- `--full`: the whole discovery set, minus rows refreshed within `--stale-days`, so a run that dies is resumed by running it again. Run by hand once, then again only after a threshold change.
- default (nightly), four passes in this order, sharing one `--budget` of requests (default 20,000):
  1. **Providers.** Refresh `watch_providers` from the two directory responses. Two requests, always first, so the availability rows written later never reference a provider the table lacks.
  2. **Changes.** Ids from `/movie/changes` and `/tv/changes` over the last 26 hours (the IGDB delta's window), intersected with the ids the catalog holds. Re-fetch those. Everything else in the feed is a title we never chose to mirror.
  3. **Entrants.** Today's export, filtered by the discovery rule, minus ids the catalog holds. Fetch those. This is how a film crosses the threshold on its way up.
  4. **Staleness.** Catalog rows with `refreshed_at` older than `--stale-days` (default 150), stalest first, until the budget is spent. This is the six-month rule.
- `--medium movie|tv` to run one medium; both by default.
- `--regions US` (comma-separated ISO 3166-1) for which regions' availability, certifications, and release dates to store. Default `US`, the one market V1 stores for games; the column exists so a second market is a flag and not a migration.
- `--max-ids N`: stop after N titles. Smoke tests.
- `--dry-run`: fetch and map, write nothing. `DATABASE_URL` is optional on a dry run: without it the catalog is treated as empty, every discovered id counts as an entrant, and `--dry-run --max-ids 5` becomes a smoke test of the token and the mapping with no database at all. With it, a dry run reads the catalog to select and still writes nothing.

Every pass logs a line with its counts and the run ends with a summary in the `runSync` style (fetched, kept, upserted per medium, requests and retries, duration, row counts, database size).

The first real run, once the secret exists, is a `workflow_dispatch` with dry-run and `--max-ids 5`, then a `--full` by hand from a laptop, then the schedule.

## Schedule

`.github/workflows/tmdb-sync.yml`, daily at 14:00 UTC (the export is published by 08:00; the catalog sync runs at 09:00 with a 60-minute timeout, Steam scores at 11:00, availability at 12:00, OpenCritic at 13:00; 14:00 leaves no overlap on the pooler). Timeout 120 minutes. Secrets `TMDB_API_READ_ACCESS_TOKEN` and `DATABASE_URL`. `workflow_dispatch` inputs: `full`, `medium`, `budget`, `max-ids`, `dry-run`. One concurrency group, `cancel-in-progress: false`.

## Schema

One migration, `supabase/migrations/20260916223000_film_tv_catalog.sql`, with a comment on every table and column in the style of `20260916183000_game_availability.sql`. Every table: primary key as stated, foreign keys to `media_items (id) on delete cascade`, RLS enabled, the select policy for `authenticated`, `revoke all ... from anon, authenticated; grant select ... to anon, authenticated`. Text columns for names and status values, never enums: a new TMDB status is a new row, not a migration.

### `media_items` (existing), for `medium in ('movie', 'tv')`

| column | movie | tv |
|---|---|---|
| `title` | `title` | `name` |
| `year` | year of `release_date`, read in UTC; null when absent | year of `first_air_date` |
| `release_date` | `release_date` (TMDB's primary date; the per-region dates live in `media_release_dates`); null when empty | `first_air_date` |
| `cover_image_id` | `poster_path` verbatim, leading slash included (`/kqjL17yufvn9OVLyXYpvtyrFfak.jpg`); null when absent | same |
| `external_ids` | `{ tmdb: <int>, imdb?: 'tt0137523', wikidata?: 'Q190050' }` | plus `tvdb?: <int>` |
| `metadata` | `{ popularity, vote_average, vote_count, backdrop_path, original_title, original_language, adult, tmdb_status }` | same with `original_name` under `original_title`, plus `tmdb_type` |
| `refreshed_at` | the run's timestamp | same |

`external_ids` and `metadata` are merged with `||`, adding and updating keys and never dropping one, as the games mirror does. Empty strings from TMDB (`imdb_id: ""`, `release_date: ""`) are nulls, never stored. The stored `poster_path` keeps TMDB's leading slash so a stored value is always exactly what TMDB returned; the app's URL builder appends it to `https://image.tmdb.org/t/p/{size}` (poster sizes `w92, w154, w185, w342, w500, w780, original`, 2:3).

### `movie_details`

| column | type | from |
|---|---|---|
| `media_item_id` | uuid pk, fk cascade | |
| `tmdb_id` | integer not null unique | `id` |
| `runtime_minutes` | integer | `runtime`; null when TMDB has 0 or null |
| `genres` | text[] not null default '{}' | `genres[].name` |
| `directors` | text[] not null default '{}' | `credits.crew` where `job = 'Director'`, response order, deduplicated |
| `writers` | text[] not null default '{}' | `credits.crew` where `job in ('Screenplay', 'Writer', 'Story')`, response order, deduplicated |
| `top_cast` | jsonb not null default '[]' | first 10 of `credits.cast` by `order`: `[{ tmdb_person_id, name, character, profile_path }]` |
| `studio` | text | `production_companies[0].name` |
| `collection_tmdb_id` | integer | `belongs_to_collection.id` |
| `collection_name` | text | `belongs_to_collection.name` |
| `tagline` | text | `tagline`, null when empty |
| `overview` | text | `overview`, null when empty |
| `backdrop_image_id` | text | `backdrop_path` verbatim |

### `tv_details`

| column | type | from |
|---|---|---|
| `media_item_id` | uuid pk, fk cascade | |
| `tmdb_id` | integer not null unique | `id` |
| `status` | text | `status` (`Returning Series`, `Ended`, `Canceled`, `In Production`, `Planned`, `Pilot`) |
| `show_type` | text | `type` (`Scripted`, `Miniseries`, `Documentary`, `Reality`, `Talk Show`, `News`, `Video`) |
| `in_production` | boolean | `in_production` |
| `first_air_date` | date | `first_air_date` |
| `last_air_date` | date | `last_air_date` |
| `networks` | text[] not null default '{}' | `networks[].name` |
| `creators` | text[] not null default '{}' | `created_by[].name` |
| `genres` | text[] not null default '{}' | `genres[].name` |
| `origin_country` | text[] not null default '{}' | `origin_country` |
| `season_count` | integer | `number_of_seasons` (seasons 1 and up, TMDB's convention) |
| `episode_count` | integer | `number_of_episodes` |
| `episode_runtime_minutes` | integer | `episode_run_time[0]`, null when the array is empty; the per-episode figures arrive with episodes later |
| `next_episode_air_date` | date | `next_episode_to_air.air_date` |
| `next_episode_season` | integer | `next_episode_to_air.season_number` |
| `next_episode_number` | integer | `next_episode_to_air.episode_number` |
| `next_episode_name` | text | `next_episode_to_air.name` |
| `last_episode_air_date` | date | `last_episode_to_air.air_date` |
| `last_episode_season` | integer | `last_episode_to_air.season_number` |
| `last_episode_number` | integer | `last_episode_to_air.episode_number` |
| `top_cast` | jsonb not null default '[]' | first 10 of `aggregate_credits.cast` in response order: `[{ tmdb_person_id, name, character, profile_path, episode_count }]` with `character` from `roles[0].character` |
| `overview` | text | `overview`, null when empty |
| `backdrop_image_id` | text | `backdrop_path` verbatim |

The `next_episode_*` columns are nulled when `next_episode_to_air` is null: "No date announced" on the show page is `status = 'Returning Series' and next_episode_air_date is null` (brief), and a stale date would say the wrong thing.

### `tv_seasons`

One row per season as TMDB lists it, season 0 (specials) included; the app excludes season 0 from progress and "up to date" (research 7).

| column | type | from |
|---|---|---|
| `media_item_id` | uuid, fk cascade | |
| `season_number` | integer | `seasons[].season_number` |
| `tmdb_season_id` | integer | `seasons[].id` |
| `name` | text | `seasons[].name` |
| `episode_count` | integer | `seasons[].episode_count` |
| `air_date` | date | `seasons[].air_date` |
| `poster_image_id` | text | `seasons[].poster_path` verbatim |
| `overview` | text | `seasons[].overview`, null when empty |

Primary key `(media_item_id, season_number)`. Replaced whole on every refresh of the show (delete, then insert, in the show's transaction): a season list is derived data with no history worth keeping.

### `media_release_dates`

Movies only. TMDB has no per-region dates for series.

| column | type | from |
|---|---|---|
| `media_item_id` | uuid, fk cascade | |
| `region` | text | `release_dates.results[].iso_3166_1` |
| `release_type` | smallint, check between 1 and 6 | `type`: 1 premiere, 2 theatrical (limited), 3 theatrical, 4 digital, 5 physical, 6 TV |
| `released_on` | date not null | `release_date`, the date part |
| `certification` | text | `certification`, null when empty |
| `note` | text | `note`, null when empty |

Primary key `(media_item_id, region, release_type, released_on)`. Only the regions in `--regions` are stored. Replaced whole per title on every refresh. "In theaters Nov 19" and "Streaming Dec 3" on Home and Next are types 3 and 4 for the user's region; the top-level `release_date` on `media_items` is TMDB's primary date and is what the games-style "upcoming" read uses until the app carries a region.

### `media_certifications`

Movies and series, one certification per region: what the header line shows ("PG-13", "TV-MA"), blank when the region has none (rule 9).

| column | type | from |
|---|---|---|
| `media_item_id` | uuid, fk cascade | |
| `region` | text | |
| `certification` | text not null | movies: the certification on the region's type-3 (theatrical) entry, failing that the first non-empty certification among the region's entries in response order; series: `content_ratings.results[].rating` for the region |

Primary key `(media_item_id, region)`. Empty strings are skipped, so a region with no rating has no row. Only the regions in `--regions`. Replaced whole per title on every refresh.

### `watch_providers`

The JustWatch provider directory as TMDB relays it, one row per provider across both media.

| column | type | from |
|---|---|---|
| `provider_id` | integer pk | `provider_id` |
| `name` | text not null | `provider_name` |
| `logo_image_id` | text | `logo_path` verbatim |
| `display_priorities` | jsonb not null default '{}' | `display_priorities`, region to integer |
| `refreshed_at` | timestamptz not null default now() | |

Upserted from the two directory responses at the start of every run; a provider that appears on a title but not in the directory (it happens; the relay lags) is upserted from the title's own `provider_name` and `logo_path` before the availability row that needs it, so the foreign key below always holds.

### `watch_availability`

The film analog of `game_availability`, with the same history rules: the row is the relationship, `removed_at is null` means "on the service right now" and is the only condition the read side applies, rows are never deleted, and a title that comes back keeps its `first_seen_at`.

| column | type | from |
|---|---|---|
| `media_item_id` | uuid, fk cascade | |
| `region` | text not null | `watch/providers.results` key |
| `provider_id` | integer not null, fk `watch_providers` | `provider_id` |
| `offer_type` | text not null, check in ('flatrate', 'free', 'ads', 'rent', 'buy') | which array the provider sat in |
| `first_seen_at` | timestamptz not null default now() | |
| `last_seen_at` | timestamptz not null default now() | |
| `removed_at` | timestamptz | |

Primary key `(media_item_id, region, provider_id, offer_type)`. Index `(media_item_id) include (region, provider_id, offer_type) where removed_at is null`, as `game_availability_current`. Reconciled per title and region on every fetch of that title: offers seen get `last_seen_at` set to the run's timestamp and `removed_at` cleared; offers of that title and region not seen get `removed_at` set (once). Since provider changes are invisible to TMDB's changes feed (research 3.1), a title's availability is only as fresh as its last fetch; a `tmdb-availability` command that re-polls tracked and popular titles on its own budget is the follow-up, and it reuses this reconciliation.

### `external_scores`

Source `tmdb`: `score = round(vote_average * 10, 2)`, `score_count = vote_count`, written only when `vote_count >= 1`, in the title's transaction. Ten times TMDB's 0-10 average so that every source in the table shares the 0-100 scale (`igdb_*`, `steam`, `metacritic`, `opencritic` all do); the app divides by ten to show "7.9 TMDB" and suppresses the figure under a vote threshold it chooses (rule 21; research 4.5). `'tmdb'` joins `ExternalScoreSource` in `packages/catalog` and `ScoreSource` in `packages/api`.

## Writes

Per batch of the store's `BATCH_SIZE` (500) titles, one transaction and one statement per table for the whole batch, in this order: `media_items` (insert when no `movie_details`/`tv_details` row carries the `tmdb_id`, else update by `media_item_id`, the way `upsertBatch` matches games through `game_details.igdb_id`; the two id spaces overlap, a film and a series can share a number, which is why the identity lives in the per-medium table and never in `external_ids`), the details rows, `external_scores`, then the derived tables (seasons, release dates, certifications) as delete-then-insert, each delete scoped to a title and the regions it asked about, then the availability reconciliation (one upsert of every offer seen, one close-out over every title-and-region pair the batch asked about). Each batch is its own transaction, so a run that dies has committed everything before the failure. The batch's 404s are stamped in one statement too.

Batched since 2026-10-12 (VER-163). Until then each title was its own eight to ten statements, so a 500-title batch cost up to about 5,000 round trips through the Supavisor pooler at tens of milliseconds each; the first cloud full pull wrote about 100 films a minute and hit the job's two-hour timeout at 12,467 films. A batch is now at most ten statements plus `begin` and `commit`, however many offers, dates or seasons it carries, each expanded with `jsonb_to_recordset` or `unnest` the way the games mirror's `upsertBatch` already was, with the per-title path's own conflict clauses, so the rows that land are the same. The per-title path stays in `db.ts` as `upsertMoviesPerTitle` and `upsertShowsPerTitle` only as the reference the tests compare the batched one against, and can go after the batched path has finished a hosted full pull. Not applied: a direct connection on port 5432 instead of the session pooler would drop the pooler hop, but it is IPv6-only on Supabase Free, which GitHub's runners cannot reach (see `dev-toolchain.md`), and at a dozen round trips a batch the hop no longer matters.

Nothing here writes `user_entries`, `ranking_entries`, or anything a user owns.

## Read side, later

Not in this pass, listed so nobody rebuilds the mirror for them:

- Covers by medium: `coverCandidates` in `packages/api/src/covers.ts` builds IGDB URLs from `cover_image_id`; a movie or series row needs the TMDB builder instead, so the read models carry `medium` and the function branches on it. The `Cover` primitive takes 2:3 for posters (brief).
- Done the same day (migration `20260916230000_per_medium_backlog_and_rpcs.sql`, PR #52): `p_medium` on `search_games` and `popular_games`, with films and series ordered by `metadata->>'vote_count'` over the partial index `media_items_film_vote_count`, the way `media_items_game_rating_count` serves games; and the backlog numbered per medium through a derived `user_entries.medium`.
- `MoviePage` and `ShowPage` read models in `packages/api/src/views.ts` beside `gamePage`, embedding the details, seasons, certifications for the user's region, and current availability.
- The user's region and streaming services as a settings row (brief, decision 3), and the "On my services" join.
- Episodes on demand, the awards and P444 passes, `tmdb-availability`.

## Search misses

Built 2026-10-13 (VER-158). A film under the popularity line is not in the catalog, so a search for it finds nothing. Search's empty state for films offers one button, "Search TMDB for “{query}”", which calls the Edge Function `supabase/functions/tmdb-lookup` and runs the search again (and opens the film's page when the search still does not list it).

- **The match.** `GET /3/search/movie?query&include_adult=false&language=en-US&page=1`, adult results and `video` records dropped as the mirror drops them, posterless results dropped because the keep rule would refuse them, then the first result whose title or original title is the query (case, accents and punctuation folded), else TMDB's first. A caller that knows the id passes `tmdbId` and skips the search.
- **The film.** The nightly run's own request (`movieDetailPath` in `packages/catalog/src/tmdb-paths.ts`), keep rule (`keepMovie`), mapping (`mapMovie`) and statements (`writeMovieBatch` in `tmdb-write.ts`), imported from `packages/catalog` by relative path rather than copied, for the US region the nightly run stores. Those three modules are Node-free and spell their relative imports with `.ts` so Deno can follow them. One transaction per film, behind an advisory lock on the TMDB id so two people missing on the same film at once cannot write it twice.
- **The connection.** The mirror's tables are written only by the service side and the write needs its transaction and `||` merges, so the function writes through the platform's `SUPABASE_DB_URL` with `pg`, the driver the nightly run uses. The caller's JWT is checked as `suggest` checks it, and the meter runs as the caller.
- **The meter.** Five lookups per person per minute (`TMDB_LOOKUP_PER_MINUTE`), counted from the caller's own `events` rows of kind `tmdb_lookup`, which the function writes before it asks TMDB. No new table: `events` is owner insert and read, never updated or deleted, and already indexed on `(user_id, kind, created_at)`.
- **Series** are not looked up yet: TV is held (decision 23), and the function takes no medium.

