-- The film and TV half of the catalog: the tables the TMDB mirror writes and
-- the movie and show pages will read. The design this implements is
-- docs/design/film-tv-catalog.md, which decides what is mirrored, from which
-- requests, and on what schedule; the research under it is
-- docs/research/film-tv-data-sources.md. Neither is restated here, so read the
-- design doc before changing a column.
--
-- Seven tables. Two are the per-medium extensions the core schema leaves room
-- for (ROADMAP.md, the media-agnostic data model sketch): `movie_details` and
-- `tv_details` sit beside `game_details` and carry the facts only a film or a
-- series has. `tv_seasons` is the season list a show page needs long before
-- there are episode rows. `media_release_dates` and `media_certifications`
-- hold the two things TMDB keeps per country, and they are named for the
-- medium and not for film, because "when did it come out here" and "what is it
-- rated here" are questions every medium eventually asks. `watch_providers`
-- and `watch_availability` are the streaming half: the JustWatch directory
-- TMDB relays, and which of those services a title is on right now.
--
-- All of it is catalog, so none of it is per-user. "Dune is on Max" is a fact
-- about Dune, so every table here is shaped and secured exactly the way
-- `game_availability` is: readable by every signed-in user, written by nobody
-- but the service role, which bypasses Row Level Security the way the IGDB
-- mirror already does. The grants and the reasoning for them are at the bottom
-- of this file, in one block, because the answer is the same for all seven.
--
-- Names and status values are text and never enums. TMDB adds a series status,
-- a genre or a provider whenever it likes, and a new value should cost a row,
-- not a migration.

-- 1. movie_details -------------------------------------------------------------
-- The per-film extension, one row per `media_items` row with medium 'movie'.
--
-- The film's TMDB id lives here rather than only in `media_items.external_ids`
-- for a reason worth stating: TMDB numbers films and series in separate id
-- spaces, so a movie and a show can both be id 550. The unique constraint that
-- makes "have I already mirrored this title" answerable therefore has to be
-- per medium, which is exactly what a per-medium extension table gives us. It
-- is the same shape as `game_details.igdb_id`, and the mirror matches on it the
-- way `upsertBatch` matches games.

create table public.movie_details (
  media_item_id uuid primary key references public.media_items (id) on delete cascade,
  tmdb_id integer not null unique,
  runtime_minutes integer,
  genres text[] not null default '{}',
  directors text[] not null default '{}',
  writers text[] not null default '{}',
  top_cast jsonb not null default '[]'::jsonb,
  studio text,
  collection_tmdb_id integer,
  collection_name text,
  tagline text,
  overview text,
  backdrop_image_id text
);

comment on table public.movie_details is
  'The film-specific half of a catalog row, filled by the `tmdb-sync` command in packages/catalog from GET /3/movie/{id}. One row per media_items row with medium ''movie''. Written only by the service role; readable by every signed-in user. See docs/design/film-tv-catalog.md.';

comment on column public.movie_details.media_item_id is
  'The catalog row this extends. Primary key as well as foreign key, so a film has exactly one details row and dropping the catalog row drops this one with it.';

comment on column public.movie_details.tmdb_id is
  'TMDB''s `id` for the film. Unique, and unique per medium rather than across the catalog, because TMDB''s film and series ids are separate sequences that collide freely.';

comment on column public.movie_details.runtime_minutes is
  'TMDB''s `runtime`, in whole minutes. Null when TMDB has no runtime, and also null when TMDB has 0, because a zero-minute film is a missing value wearing a number.';

comment on column public.movie_details.genres is
  'The names from `genres[].name`, in response order. Names and not ids: the app shows these strings, and a genre TMDB renames should read as the new name on the next refresh.';

comment on column public.movie_details.directors is
  'Names from `credits.crew` where job is Director, in response order, deduplicated. A film with two directors keeps both, which is why this is an array and not a single column like `game_details.developer`.';

comment on column public.movie_details.writers is
  'Names from `credits.crew` where job is Screenplay, Writer or Story, in response order, deduplicated. Filtered by job and not by department, because TMDB''s writing department holds novelists and script coordinators too.';

comment on column public.movie_details.top_cast is
  'The first ten of `credits.cast` by TMDB''s `order` field, as [{tmdb_person_id, name, character, profile_path}]. Jsonb rather than a people table because V3 shows a billing list and never asks a question about a person; a people table is a later pass if a screen ever needs one.';

comment on column public.movie_details.studio is
  'The first entry of `production_companies[].name`, which is TMDB''s convention for the lead studio. Only the first: a film with nine production companies still has one line on the page.';

comment on column public.movie_details.collection_tmdb_id is
  'The id from `belongs_to_collection`, null when the film is in none. Stored without fetching the collection itself, so the app knows a film is part of a series and can fetch the parts later if a screen ever wants them.';

comment on column public.movie_details.collection_name is
  'The name from `belongs_to_collection`, for example "The Lord of the Rings Collection". Kept beside the id so a header line needs no second request.';

comment on column public.movie_details.tagline is
  'TMDB''s `tagline`. Null when TMDB returns the empty string, which it does often; an empty string and "no tagline" are the same fact, and only one of them should be storable.';

comment on column public.movie_details.overview is
  'TMDB''s `overview`, the synopsis paragraph. Null when empty, for the same reason as the tagline.';

comment on column public.movie_details.backdrop_image_id is
  'TMDB''s `backdrop_path` verbatim, leading slash included. Stored as the path and never as a URL, so a size change is a client change: the app appends it to https://image.tmdb.org/t/p/{size}, as tech-stack.md says to do with IGDB covers.';

-- The same index `game_details` has on its genres, for the same read: a genre
-- filter or a "more like this" is a containment test on the array, and GIN is
-- the only index that answers one.

create index movie_details_genres on public.movie_details using gin (genres);

-- 2. tv_details ----------------------------------------------------------------
-- The per-series extension, one row per `media_items` row with medium 'tv'.
--
-- Wider than `movie_details` because a series has a present tense a film does
-- not: it is running or it has ended, it has a last episode and possibly a next
-- one, and the show page answers "when is the next one" from the columns here
-- rather than from episode rows, which this pass does not mirror at all.

create table public.tv_details (
  media_item_id uuid primary key references public.media_items (id) on delete cascade,
  tmdb_id integer not null unique,
  status text,
  show_type text,
  in_production boolean,
  first_air_date date,
  last_air_date date,
  networks text[] not null default '{}',
  creators text[] not null default '{}',
  genres text[] not null default '{}',
  origin_country text[] not null default '{}',
  season_count integer,
  episode_count integer,
  episode_runtime_minutes integer,
  next_episode_air_date date,
  next_episode_season integer,
  next_episode_number integer,
  next_episode_name text,
  last_episode_air_date date,
  last_episode_season integer,
  last_episode_number integer,
  top_cast jsonb not null default '[]'::jsonb,
  overview text,
  backdrop_image_id text
);

comment on table public.tv_details is
  'The series-specific half of a catalog row, filled by the `tmdb-sync` command in packages/catalog from GET /3/tv/{id}. One row per media_items row with medium ''tv''. Written only by the service role; readable by every signed-in user. See docs/design/film-tv-catalog.md.';

comment on column public.tv_details.media_item_id is
  'The catalog row this extends. Primary key as well as foreign key, so a series has exactly one details row and dropping the catalog row drops this one with it.';

comment on column public.tv_details.tmdb_id is
  'TMDB''s `id` for the series. Unique within this table only: TMDB''s series ids share their numbers with film ids, so this constraint and movie_details'' are deliberately separate.';

comment on column public.tv_details.status is
  'TMDB''s `status`: Returning Series, Ended, Canceled, In Production, Planned or Pilot. Text and not an enum, because TMDB owns this vocabulary and has added to it before.';

comment on column public.tv_details.show_type is
  'TMDB''s `type`: Scripted, Miniseries, Documentary, Reality, Talk Show, News or Video. Named show_type because `type` is a reserved word in enough tools to be a nuisance. Miniseries is the one the show page can draw without season navigation at all.';

comment on column public.tv_details.in_production is
  'TMDB''s `in_production`. Close to `status` but not the same claim: a cancelled show can still be in production on its final season, so the page reads both.';

comment on column public.tv_details.first_air_date is
  'TMDB''s `first_air_date`. Also copied to media_items.release_date and media_items.year, so the medium-agnostic reads (Upcoming, the year on a list row) work without touching this table.';

comment on column public.tv_details.last_air_date is
  'TMDB''s `last_air_date`, the day the most recent episode aired. Null for a series that has not started.';

comment on column public.tv_details.networks is
  'Names from `networks[].name`, in response order. The network is what a header line credits ("HBO", "Netflix"), and it is not the same thing as where you can watch it, which is watch_availability.';

comment on column public.tv_details.creators is
  'Names from `created_by[].name`, the series analog of a film''s directors. Often empty on documentary and reality programming, which is a fact about the data and not a gap to fill.';

comment on column public.tv_details.genres is
  'The names from `genres[].name`, in response order, as on movie_details.';

comment on column public.tv_details.origin_country is
  'TMDB''s `origin_country`, an array of ISO 3166-1 codes. A series can carry several when it is a co-production.';

comment on column public.tv_details.season_count is
  'TMDB''s `number_of_seasons`, which counts seasons 1 and up and excludes season 0. The specials season is in tv_seasons but is never part of this number, and the app''s progress and "up to date" follow the same rule (research 7).';

comment on column public.tv_details.episode_count is
  'TMDB''s `number_of_episodes`, again seasons 1 and up only.';

comment on column public.tv_details.episode_runtime_minutes is
  'The first entry of TMDB''s `episode_run_time`, null when the array is empty, which it often is. One number is a poor description of a show whose episodes run 22 to 75 minutes, so anything derived from it is an estimate and the app labels it as one (research 7). The reliable per-episode figures arrive with episodes, which this pass does not mirror.';

comment on column public.tv_details.next_episode_air_date is
  'The `air_date` of `next_episode_to_air`. Null when TMDB has nothing scheduled, and that null is load-bearing: "No date announced" on the show page is status Returning Series with this column null, so a stale date left behind by an earlier refresh would say the wrong thing. All four next_episode columns are written together and nulled together.';

comment on column public.tv_details.next_episode_season is
  'The `season_number` of `next_episode_to_air`.';

comment on column public.tv_details.next_episode_number is
  'The `episode_number` of `next_episode_to_air`.';

comment on column public.tv_details.next_episode_name is
  'The `name` of `next_episode_to_air`. Frequently a placeholder like "Episode 4" on an unannounced episode, which the app may choose not to show.';

comment on column public.tv_details.last_episode_air_date is
  'The `air_date` of `last_episode_to_air`. With the season and episode numbers beside it this is the cheap denominator for "you have seen 5 of 8 aired episodes" without paging every season (research 7).';

comment on column public.tv_details.last_episode_season is
  'The `season_number` of `last_episode_to_air`.';

comment on column public.tv_details.last_episode_number is
  'The `episode_number` of `last_episode_to_air`.';

comment on column public.tv_details.top_cast is
  'The first ten of `aggregate_credits.cast` in response order, as [{tmdb_person_id, name, character, profile_path, episode_count}], with character taken from roles[0].character. The aggregate credits and not `credits`, because a series'' `credits` is only its latest season''s cast while the aggregate is ordered by episodes across the whole run, which is what "top cast" means for a show.';

comment on column public.tv_details.overview is
  'TMDB''s `overview`. Null when empty.';

comment on column public.tv_details.backdrop_image_id is
  'TMDB''s `backdrop_path` verbatim, leading slash included, built into a URL at render time exactly as movie_details.backdrop_image_id is.';

create index tv_details_genres on public.tv_details using gin (genres);

-- 3. tv_seasons ----------------------------------------------------------------
-- One row per season as TMDB lists it in the series response, season 0
-- included. Season 0 is where TMDB files specials, and it is excluded from
-- `tv_details.season_count` and from the app's progress and "up to date"
-- (research 7); it is stored anyway, because a specials list is worth showing
-- even when it counts towards nothing.
--
-- Derived data with no history worth keeping, so the mirror replaces a show's
-- seasons whole on every refresh, deleting and re-inserting inside the show's
-- transaction. A season TMDB renumbers should leave nothing behind.

create table public.tv_seasons (
  media_item_id uuid not null references public.media_items (id) on delete cascade,
  season_number integer not null,
  tmdb_season_id integer,
  name text,
  episode_count integer,
  air_date date,
  poster_image_id text,
  overview text,
  primary key (media_item_id, season_number)
);

comment on table public.tv_seasons is
  'The season list of a series, from the `seasons` array of GET /3/tv/{id}, season 0 (specials) included. Replaced whole on every refresh of the show. Written only by the service role; readable by every signed-in user.';

comment on column public.tv_seasons.media_item_id is
  'The series this season belongs to. Dropping the series from the catalog drops its seasons.';

comment on column public.tv_seasons.season_number is
  'TMDB''s `season_number`. Part of the key, because the number is how the app and the user both name a season; 0 is the specials season.';

comment on column public.tv_seasons.tmdb_season_id is
  'TMDB''s own id for the season, which is what GET /3/tv/{id}/season/{n} is keyed by. Stored now so the later episodes pass has it without re-fetching the show.';

comment on column public.tv_seasons.name is
  'TMDB''s `name` for the season, usually "Season 3" but sometimes the real title of a limited run, which is why it is stored rather than generated from the number.';

comment on column public.tv_seasons.episode_count is
  'TMDB''s `episode_count` for the season. The denominator of a season progress bar, and only an estimate while the season is still airing.';

comment on column public.tv_seasons.air_date is
  'TMDB''s `air_date` for the season, the day its first episode aired. Null for an announced season with no date yet.';

comment on column public.tv_seasons.poster_image_id is
  'TMDB''s `poster_path` for the season, verbatim with its leading slash. Seasons often have their own art, and a season row drawn with the series poster looks wrong.';

comment on column public.tv_seasons.overview is
  'TMDB''s `overview` for the season. Null when empty.';

-- 4. media_release_dates ---------------------------------------------------------
-- Movies only. TMDB keeps no per-region dates for series, so a show's dates are
-- the two columns on tv_details and nothing here.
--
-- There is no single release date for a film: a festival premiere in one
-- country, a limited run, a wide theatrical date, a digital date and a physical
-- date, all different and all per country (research 8). The top-level
-- `media_items.release_date` picks one of them, and it is wrong for anyone
-- outside the primary market, which is why "In theaters Nov 19" and "Streaming
-- Dec 3" on Home and Next come from this table and not from that column.
--
-- Replaced whole per title on every refresh, and only for the regions the run
-- was asked for.

create table public.media_release_dates (
  media_item_id uuid not null references public.media_items (id) on delete cascade,
  region text not null,
  release_type smallint not null
    constraint media_release_dates_release_type_check check (release_type between 1 and 6),
  released_on date not null,
  certification text,
  note text,
  primary key (media_item_id, region, release_type, released_on)
);

comment on table public.media_release_dates is
  'Per-region, per-kind release dates for films, from the `release_dates` sub-resource of GET /3/movie/{id}. Movies only: TMDB keeps no per-region dates for series. Replaced whole per title on every refresh. Written only by the service role; readable by every signed-in user.';

comment on column public.media_release_dates.media_item_id is
  'The film this date belongs to. Dropping the film drops its dates.';

comment on column public.media_release_dates.region is
  'The ISO 3166-1 country code from `results[].iso_3166_1`. Only the regions a run was asked for with --regions are stored, which is US alone today, the one market V1 stores for games. Every read of this table is filtered by the user''s region or it will lie to anyone who travels (research 8).';

comment on column public.media_release_dates.release_type is
  'TMDB''s `type` code: 1 premiere, 2 theatrical limited, 3 theatrical, 4 digital, 5 physical, 6 TV. Checked between 1 and 6 because those are every code TMDB defines, and a 0 or a 7 in this column would be a mapping bug that a screen would quietly render as a missing date.';

comment on column public.media_release_dates.released_on is
  'The date part of TMDB''s `release_date` for this entry. Part of the key: a film can hold two entries of the same kind in the same country, a re-release being the usual reason, and both of them are true.';

comment on column public.media_release_dates.certification is
  'The certification TMDB attached to this particular entry, for example R on the US theatrical row. Null when TMDB sends the empty string. The one certification a header line shows is resolved into media_certifications; this column keeps the per-entry value it was resolved from.';

comment on column public.media_release_dates.note is
  'TMDB''s free-text `note`, for example "Sundance Film Festival" or "IMAX". Null when empty. It is usually what tells a premiere row apart from the theatrical row that follows it.';

-- 5. media_certifications --------------------------------------------------------
-- One certification per title per region: what a header line shows, "PG-13" or
-- "TV-MA", and nothing at all when the region has none.
--
-- Both media, unlike release dates, because TMDB does keep a rating per country
-- for series through `content_ratings`. The two sources are resolved to the
-- same single answer per region by the mirror: for a film the region's
-- theatrical (type 3) certification, failing that the first non-empty one among
-- that region's entries in response order; for a series the region's `rating`.
--
-- Empty strings are skipped rather than stored, so a region with no rating has
-- no row and the header line simply omits it. That is rule 9: show what you
-- know, and say nothing where you know nothing.

create table public.media_certifications (
  media_item_id uuid not null references public.media_items (id) on delete cascade,
  region text not null,
  certification text not null,
  primary key (media_item_id, region)
);

comment on table public.media_certifications is
  'The one age rating a title carries in a region, resolved by the mirror from a film''s `release_dates` or a series'' `content_ratings`. One row per title per region, and no row at all where the region has no rating. Replaced whole per title on every refresh. Written only by the service role; readable by every signed-in user.';

comment on column public.media_certifications.media_item_id is
  'The title this rating belongs to. Dropping the title drops its certifications.';

comment on column public.media_certifications.region is
  'The ISO 3166-1 country code the rating is from. Part of the key, because a certification is only meaningful with the country attached: an 18 means one thing from the BBFC and nothing at all in the United States.';

comment on column public.media_certifications.certification is
  'The rating itself, verbatim from TMDB: G, PG, PG-13, R and NC-17 in the US for films, TV-Y through TV-MA for series, U through 18 for the BBFC. Not null, because a row saying a title is rated nothing is the absence of a row.';

-- 6. watch_providers ---------------------------------------------------------------
-- The JustWatch provider directory as TMDB relays it, from GET
-- /3/watch/providers/movie and /tv, both of which return every region in one
-- response. One row per provider across both media: Netflix is provider 8
-- whether it is carrying a film or a series.
--
-- Refreshed at the start of every run, before any availability row is written,
-- so the foreign key below always holds. A provider that turns up on a title
-- but is missing from the directory (the relay lags, and it happens) is
-- upserted from that title's own provider_name and logo_path first.
--
-- Not a catalog row in the media_items sense, so it has no media_item_id and no
-- cascade; it is a small shared dimension table that outlives any one title.

create table public.watch_providers (
  provider_id integer primary key,
  name text not null,
  logo_image_id text,
  display_priorities jsonb not null default '{}'::jsonb,
  refreshed_at timestamptz not null default now()
);

comment on table public.watch_providers is
  'The JustWatch streaming provider directory as TMDB relays it, from GET /3/watch/providers/movie and /tv. Refreshed at the start of every tmdb-sync run, before any watch_availability row that references it. Written only by the service role; readable by every signed-in user. Availability shown to a user carries a "Streaming data by JustWatch" credit, which the TMDB API terms require.';

comment on column public.watch_providers.provider_id is
  'JustWatch''s provider id as TMDB passes it through, for example 8 for Netflix. TMDB''s own number and not one of ours, so availability rows can be written straight from a title response with no lookup.';

comment on column public.watch_providers.name is
  'TMDB''s `provider_name`, the display name. The app draws the logo and uses this as its alt text and its fallback.';

comment on column public.watch_providers.logo_image_id is
  'TMDB''s `logo_path` verbatim with its leading slash, built into a URL at render time against image.tmdb.org like every other path in this migration. Logo sizes run w45 through w500.';

comment on column public.watch_providers.display_priorities is
  'TMDB''s `display_priorities`, a region code to integer map, which is JustWatch''s suggested ordering of providers within that country. Jsonb rather than a row per region because the app reads it whole and never queries into it, and because the set of regions changes under us.';

comment on column public.watch_providers.refreshed_at is
  'When the directory pass last wrote this row. The six-month cache ceiling in the TMDB terms applies to every mirrored row, this one included.';

-- 7. watch_availability -------------------------------------------------------------
-- Which services a title is on, the film analog of game_availability, with the
-- same history rules and for the same reasons: the row is the relationship and
-- not an observation of it, `removed_at is null` means "on the service right
-- now" and is the only condition the read side ever applies, rows are never
-- deleted, and a title that comes back keeps the day it first arrived.
--
-- One row per title per region per provider per offer type, because the same
-- provider can carry the same film two ways at once: Apple TV rents it and
-- sells it, and those are different rows and different sentences on the page.
--
-- One caveat belongs in the schema and not only in the job: provider changes
-- are invisible to TMDB's changes feed (research 3.1), so a title's
-- availability is only ever as fresh as the last time the title itself was
-- fetched. A dedicated re-poll of tracked and popular titles is the follow-up,
-- and it reuses this table's reconciliation unchanged.

create table public.watch_availability (
  media_item_id uuid not null references public.media_items (id) on delete cascade,
  region text not null,
  provider_id integer not null references public.watch_providers (provider_id),
  offer_type text not null
    constraint watch_availability_offer_type_check
    check (offer_type in ('flatrate', 'free', 'ads', 'rent', 'buy')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (media_item_id, region, provider_id, offer_type)
);

comment on table public.watch_availability is
  'Where a film or series can be watched, from the `watch/providers` sub-resource of a title fetch, which TMDB relays from JustWatch. Written only by the service role; readable by every signed-in user. Rows are never deleted: a title that leaves a service keeps its row with removed_at set, exactly as game_availability does.';

comment on column public.watch_availability.media_item_id is
  'The title this offer is for. Dropping the title from the catalog drops its availability, closed rows included.';

comment on column public.watch_availability.region is
  'The ISO 3166-1 country code, which is the key of TMDB''s `results` object. Availability is per region by construction: a provider id valid in the US may not exist in Spain at all, so a read that is not filtered by region is wrong rather than merely broad (research 8).';

comment on column public.watch_availability.provider_id is
  'The provider, by TMDB''s id, into watch_providers. A real foreign key and not a loose integer, so the app can always draw a logo and a name for a row it reads. It is why the provider directory pass runs first in every sync.';

comment on column public.watch_availability.offer_type is
  'Which of TMDB''s five arrays the provider sat in: flatrate (included with a subscription), free, ads, rent or buy. Checked, unlike the text columns elsewhere in this migration, because these five are TMDB''s whole vocabulary here and a sixth value would mean the mapping had invented one. "On my services" means flatrate, free and ads; rent and buy cost money and the page has to say so.';

comment on column public.watch_availability.first_seen_at is
  'The first run that saw this title on this provider in this region with this offer. Never rewritten, not even when a removed row comes back, so it stays the honest answer to "since when".';

comment on column public.watch_availability.last_seen_at is
  'The most recent run that saw it. Every row a run writes carries that run''s single timestamp, which is what makes the close-out exact.';

comment on column public.watch_availability.removed_at is
  'When a run first failed to find the offer. Null means it is there now, and that is the only condition the read side applies. A title that returns has this cleared and keeps its original first_seen_at.';

-- The question the app asks, one title at a time on the movie or show page and
-- a handful at a time on a list row: "where can I watch this right now". The
-- primary key already leads with media_item_id, so what this index adds is what
-- the key cannot: the partial predicate, which keeps every row of every title
-- that ever left a service out of the scan, and the payload, which makes the
-- read index-only so the availability strip never touches the heap. The same
-- index game_availability_current is, for the same read.

create index watch_availability_current
  on public.watch_availability (media_item_id)
  include (region, provider_id, offer_type)
  where removed_at is null;

-- The job's question, which is the mirror image: "everything currently on this
-- provider in this region", asked when a run closes out the offers it no longer
-- sees. Without it that update is a sequential scan of what will be the largest
-- table here, since it grows with titles times regions times providers times
-- offer types.

create index watch_availability_provider_current
  on public.watch_availability (provider_id, region)
  where removed_at is null;

-- 8. Row Level Security ---------------------------------------------------------------
-- The same shape as game_availability and the catalog tables in the core
-- schema, and for the same reasons, stated once for all seven tables.
--
-- Readable by every signed-in user, written by nobody but the service role,
-- which bypasses RLS the way the IGDB and TMDB mirrors both need it to. There
-- is deliberately no insert, update or delete policy anywhere in this file, so
-- there is no way for a client to invent a streaming offer, move a release
-- date, or bring a removed row back.
--
-- The grants are narrower than Supabase's defaults. Supabase hands `anon` and
-- `authenticated` full DML on a new table in `public`; taking the write
-- privileges away makes "read-only" true of the privilege as well as of the
-- policy, and makes it something the pgTAP suite can assert directly.
--
-- `anon` keeps the SELECT privilege and gets no policy, which is not the same
-- refusal: revoking the privilege makes a signed-out read an error, while an
-- absent policy makes it an empty set. A movie page opened before sign-in
-- should find nothing to draw rather than a permission failure every screen has
-- to special-case. The rows are just as closed either way.

alter table public.movie_details enable row level security;
alter table public.tv_details enable row level security;
alter table public.tv_seasons enable row level security;
alter table public.media_release_dates enable row level security;
alter table public.media_certifications enable row level security;
alter table public.watch_providers enable row level security;
alter table public.watch_availability enable row level security;

create policy "movie details are readable by signed-in users" on public.movie_details
  for select to authenticated using (true);

create policy "tv details are readable by signed-in users" on public.tv_details
  for select to authenticated using (true);

create policy "tv seasons are readable by signed-in users" on public.tv_seasons
  for select to authenticated using (true);

create policy "release dates are readable by signed-in users" on public.media_release_dates
  for select to authenticated using (true);

create policy "certifications are readable by signed-in users" on public.media_certifications
  for select to authenticated using (true);

create policy "watch providers are readable by signed-in users" on public.watch_providers
  for select to authenticated using (true);

create policy "watch availability is readable by signed-in users" on public.watch_availability
  for select to authenticated using (true);

revoke all on public.movie_details from anon, authenticated;
revoke all on public.tv_details from anon, authenticated;
revoke all on public.tv_seasons from anon, authenticated;
revoke all on public.media_release_dates from anon, authenticated;
revoke all on public.media_certifications from anon, authenticated;
revoke all on public.watch_providers from anon, authenticated;
revoke all on public.watch_availability from anon, authenticated;

grant select on public.movie_details to anon, authenticated;
grant select on public.tv_details to anon, authenticated;
grant select on public.tv_seasons to anon, authenticated;
grant select on public.media_release_dates to anon, authenticated;
grant select on public.media_certifications to anon, authenticated;
grant select on public.watch_providers to anon, authenticated;
grant select on public.watch_availability to anon, authenticated;
