-- pgTAP tests for supabase/migrations/20260916223000_film_tv_catalog.sql.
-- Run with: supabase test db
--
-- Three things are under test across the seven tables the migration adds: the
-- shape the design doc specifies (docs/design/film-tv-catalog.md, the Schema
-- section, column for column), who may read and write them, and the handful of
-- rules the schema itself enforces rather than leaving to the mirror. The last
-- group is the interesting one, because those are the rules that hold even when
-- packages/catalog has a bug: a delete from the catalog takes every dependent
-- row with it, an offer type outside TMDB's five is refused, a release type
-- outside TMDB's six is refused, and an availability row cannot name a
-- provider the directory has never heard of.
--
-- The structural assertions run as the migration's owner. The behavioural ones
-- act as a signed-in user through `set local role authenticated` plus a forged
-- request.jwt.claims, and then as `anon`, so every read and every refused write
-- goes through Row Level Security and the grants exactly as a supabase-js call
-- would. The rows themselves are inserted as the owner, which is the only way
-- they ever get there: tmdb-sync writes as the service role, and RLS is
-- bypassed for it the same way it is for the IGDB mirror.
--
-- Every count is scoped to this file's own fixture ids. The suite has to pass
-- on a database the live packages/api tests have already dirtied, not only on a
-- fresh reset (PR #24).

begin;
select plan(232);

-- Structure: the seven tables ---------------------------------------------------

select has_table('public', 'movie_details', 'movie_details exists');
select has_table('public', 'tv_details', 'tv_details exists');
select has_table('public', 'tv_seasons', 'tv_seasons exists');
select has_table('public', 'media_release_dates', 'media_release_dates exists');
select has_table('public', 'media_certifications', 'media_certifications exists');
select has_table('public', 'watch_providers', 'watch_providers exists');
select has_table('public', 'watch_availability', 'watch_availability exists');

-- The columns, exactly. columns_are and not a pile of has_column, because the
-- design doc names a closed set and a column nobody designed is as much a
-- problem as a missing one.

select columns_are(
  'public', 'movie_details',
  array['media_item_id', 'tmdb_id', 'runtime_minutes', 'genres', 'directors',
        'writers', 'top_cast', 'studio', 'collection_tmdb_id', 'collection_name',
        'tagline', 'overview', 'backdrop_image_id', 'people_text'],
  'movie_details has exactly the columns the design doc lists, plus people_text (20261013100000_movie_screens.sql)'
);

select columns_are(
  'public', 'tv_details',
  array['media_item_id', 'tmdb_id', 'status', 'show_type', 'in_production',
        'first_air_date', 'last_air_date', 'networks', 'creators', 'genres',
        'origin_country', 'season_count', 'episode_count',
        'episode_runtime_minutes', 'next_episode_air_date', 'next_episode_season',
        'next_episode_number', 'next_episode_name', 'last_episode_air_date',
        'last_episode_season', 'last_episode_number', 'top_cast', 'overview',
        'backdrop_image_id'],
  'tv_details has exactly the columns the design doc lists'
);

select columns_are(
  'public', 'tv_seasons',
  array['media_item_id', 'season_number', 'tmdb_season_id', 'name',
        'episode_count', 'air_date', 'poster_image_id', 'overview'],
  'tv_seasons has exactly the columns the design doc lists'
);

select columns_are(
  'public', 'media_release_dates',
  array['media_item_id', 'region', 'release_type', 'released_on',
        'certification', 'note'],
  'media_release_dates has exactly the columns the design doc lists'
);

select columns_are(
  'public', 'media_certifications',
  array['media_item_id', 'region', 'certification'],
  'media_certifications has exactly the columns the design doc lists'
);

select columns_are(
  'public', 'watch_providers',
  array['provider_id', 'name', 'logo_image_id', 'display_priorities', 'refreshed_at'],
  'watch_providers has exactly the columns the design doc lists'
);

select columns_are(
  'public', 'watch_availability',
  array['media_item_id', 'region', 'provider_id', 'offer_type', 'first_seen_at',
        'last_seen_at', 'removed_at'],
  'watch_availability has exactly the columns the design doc lists'
);

-- Types -------------------------------------------------------------------------

select col_type_is('public', 'movie_details', 'media_item_id', 'uuid', 'movie_details.media_item_id is a uuid');
select col_type_is('public', 'movie_details', 'tmdb_id', 'integer', 'movie_details.tmdb_id is an integer, TMDB''s own number');
select col_type_is('public', 'movie_details', 'runtime_minutes', 'integer', 'runtime is whole minutes');
select col_type_is('public', 'movie_details', 'genres', 'text[]', 'genres are names in an array, not ids in a join table');
select col_type_is('public', 'movie_details', 'directors', 'text[]', 'a film can have two directors, so directors is an array');
select col_type_is('public', 'movie_details', 'writers', 'text[]', 'writers likewise');
select col_type_is('public', 'movie_details', 'top_cast', 'jsonb', 'top_cast is jsonb: a billing list the app renders and never queries into');
select col_type_is('public', 'movie_details', 'collection_tmdb_id', 'integer', 'collection_tmdb_id is an integer');

select col_type_is('public', 'tv_details', 'media_item_id', 'uuid', 'tv_details.media_item_id is a uuid');
select col_type_is('public', 'tv_details', 'tmdb_id', 'integer', 'tv_details.tmdb_id is an integer');
select col_type_is('public', 'tv_details', 'status', 'text', 'status is text, not an enum: TMDB owns that vocabulary');
select col_type_is('public', 'tv_details', 'show_type', 'text', 'show_type is text for the same reason');
select col_type_is('public', 'tv_details', 'in_production', 'boolean', 'in_production is a boolean');
select col_type_is('public', 'tv_details', 'first_air_date', 'date', 'first_air_date is a date, with no time and no zone, as TMDB sends it');
select col_type_is('public', 'tv_details', 'last_air_date', 'date', 'last_air_date is a date');
select col_type_is('public', 'tv_details', 'networks', 'text[]', 'networks is an array of names');
select col_type_is('public', 'tv_details', 'creators', 'text[]', 'creators is an array of names');
select col_type_is('public', 'tv_details', 'genres', 'text[]', 'tv genres are names in an array too');
select col_type_is('public', 'tv_details', 'origin_country', 'text[]', 'origin_country is an array: a co-production has several');
select col_type_is('public', 'tv_details', 'next_episode_air_date', 'date', 'next_episode_air_date is a date');
select col_type_is('public', 'tv_details', 'last_episode_air_date', 'date', 'last_episode_air_date is a date');
select col_type_is('public', 'tv_details', 'top_cast', 'jsonb', 'tv top_cast is jsonb, from aggregate_credits');

select col_type_is('public', 'tv_seasons', 'media_item_id', 'uuid', 'tv_seasons.media_item_id is a uuid');
select col_type_is('public', 'tv_seasons', 'season_number', 'integer', 'season_number is an integer, and 0 is the specials season');
select col_type_is('public', 'tv_seasons', 'tmdb_season_id', 'integer', 'tmdb_season_id is an integer');
select col_type_is('public', 'tv_seasons', 'air_date', 'date', 'a season air_date is a date');

select col_type_is('public', 'media_release_dates', 'media_item_id', 'uuid', 'media_release_dates.media_item_id is a uuid');
select col_type_is('public', 'media_release_dates', 'region', 'text', 'region is text, an ISO 3166-1 code');
select col_type_is('public', 'media_release_dates', 'release_type', 'smallint', 'release_type is a smallint: TMDB''s codes run 1 to 6');
select col_type_is('public', 'media_release_dates', 'released_on', 'date', 'released_on is a date, the date part of TMDB''s timestamp');

select col_type_is('public', 'media_certifications', 'media_item_id', 'uuid', 'media_certifications.media_item_id is a uuid');
select col_type_is('public', 'media_certifications', 'region', 'text', 'a certification region is text');
select col_type_is('public', 'media_certifications', 'certification', 'text', 'the certification itself is text, verbatim from TMDB');

select col_type_is('public', 'watch_providers', 'provider_id', 'integer', 'provider_id is TMDB''s integer, not one of ours');
select col_type_is('public', 'watch_providers', 'name', 'text', 'the provider name is text');
select col_type_is('public', 'watch_providers', 'logo_image_id', 'text', 'the logo is a stored path, built into a URL at render time');
select col_type_is('public', 'watch_providers', 'display_priorities', 'jsonb', 'display_priorities is one jsonb map of region to integer');
select col_type_is('public', 'watch_providers', 'refreshed_at', 'timestamp with time zone', 'refreshed_at is a timestamptz: the six-month ceiling is measured against it');

select col_type_is('public', 'watch_availability', 'media_item_id', 'uuid', 'watch_availability.media_item_id is a uuid');
select col_type_is('public', 'watch_availability', 'region', 'text', 'availability region is text');
select col_type_is('public', 'watch_availability', 'provider_id', 'integer', 'availability provider_id is an integer into watch_providers');
select col_type_is('public', 'watch_availability', 'offer_type', 'text', 'offer_type is text with a check, not an enum');
select col_type_is('public', 'watch_availability', 'first_seen_at', 'timestamp with time zone', 'first_seen_at is a timestamptz');
select col_type_is('public', 'watch_availability', 'last_seen_at', 'timestamp with time zone', 'last_seen_at is a timestamptz');
select col_type_is('public', 'watch_availability', 'removed_at', 'timestamp with time zone', 'removed_at is a timestamptz');

-- Nullability ---------------------------------------------------------------------
-- The pattern throughout: the identity columns and the collection columns are
-- not null, and everything TMDB may simply not have is nullable, because a
-- placeholder is a lie and an empty string is a null wearing a costume.

select col_not_null('public', 'movie_details', 'tmdb_id', 'a film row without a TMDB id is not a film row');
select col_not_null('public', 'movie_details', 'genres', 'genres is never null, only empty');
select col_not_null('public', 'movie_details', 'directors', 'directors is never null, only empty');
select col_not_null('public', 'movie_details', 'writers', 'writers is never null, only empty');
select col_not_null('public', 'movie_details', 'top_cast', 'top_cast is never null, only an empty array');
select col_is_null('public', 'movie_details', 'runtime_minutes', 'runtime is nullable: TMDB does not always have one');
select col_is_null('public', 'movie_details', 'studio', 'studio is nullable');
select col_is_null('public', 'movie_details', 'tagline', 'tagline is nullable, and an empty tagline is stored as null');

select col_not_null('public', 'tv_details', 'tmdb_id', 'a series row without a TMDB id is not a series row');
select col_not_null('public', 'tv_details', 'networks', 'networks is never null, only empty');
select col_not_null('public', 'tv_details', 'creators', 'creators is never null, only empty');
select col_not_null('public', 'tv_details', 'genres', 'tv genres is never null, only empty');
select col_not_null('public', 'tv_details', 'origin_country', 'origin_country is never null, only empty');
select col_not_null('public', 'tv_details', 'top_cast', 'tv top_cast is never null, only an empty array');
select col_is_null('public', 'tv_details', 'status', 'status is nullable');
select col_is_null('public', 'tv_details', 'in_production', 'in_production is nullable: unknown is not false');
select col_is_null('public', 'tv_details', 'next_episode_air_date', 'next_episode_air_date is nullable, and that null is what "No date announced" reads from');

select col_not_null('public', 'tv_seasons', 'media_item_id', 'a season belongs to a series');
select col_not_null('public', 'tv_seasons', 'season_number', 'a season has a number');
select col_is_null('public', 'tv_seasons', 'tmdb_season_id', 'tmdb_season_id is nullable');
select col_is_null('public', 'tv_seasons', 'air_date', 'a season announced with no date has a null air_date');

select col_not_null('public', 'media_release_dates', 'media_item_id', 'a release date belongs to a film');
select col_not_null('public', 'media_release_dates', 'region', 'a release date without a country is meaningless');
select col_not_null('public', 'media_release_dates', 'release_type', 'a release date without a kind is meaningless');
select col_not_null('public', 'media_release_dates', 'released_on', 'released_on is the row: it cannot be null');
select col_is_null('public', 'media_release_dates', 'certification', 'the per-entry certification is nullable');
select col_is_null('public', 'media_release_dates', 'note', 'the note is nullable');

select col_not_null('public', 'media_certifications', 'media_item_id', 'a certification belongs to a title');
select col_not_null('public', 'media_certifications', 'region', 'a certification without a country is meaningless');
select col_not_null('public', 'media_certifications', 'certification', 'a row saying a title is rated nothing is the absence of a row');

select col_not_null('public', 'watch_providers', 'provider_id', 'a provider has an id');
select col_not_null('public', 'watch_providers', 'name', 'a provider has a name');
select col_not_null('public', 'watch_providers', 'display_priorities', 'display_priorities is never null, only an empty map');
select col_not_null('public', 'watch_providers', 'refreshed_at', 'refreshed_at is not null');
select col_is_null('public', 'watch_providers', 'logo_image_id', 'logo_image_id is nullable');

select col_not_null('public', 'watch_availability', 'media_item_id', 'an offer is for a title');
select col_not_null('public', 'watch_availability', 'region', 'an offer is in a region');
select col_not_null('public', 'watch_availability', 'provider_id', 'an offer is from a provider');
select col_not_null('public', 'watch_availability', 'offer_type', 'an offer has a kind');
select col_not_null('public', 'watch_availability', 'first_seen_at', 'first_seen_at is not null');
select col_not_null('public', 'watch_availability', 'last_seen_at', 'last_seen_at is not null');
select col_is_null('public', 'watch_availability', 'removed_at', 'removed_at is nullable, and null is what "on the service right now" means');

-- Defaults -------------------------------------------------------------------------
-- Read straight out of information_schema, because the point of each of these is
-- the exact expression: an array column that defaults to NULL instead of '{}'
-- turns every read into a coalesce.

select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'movie_details' and column_name = 'genres'),
  '''{}''::text[]', 'movie_details.genres defaults to the empty array');
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'movie_details' and column_name = 'directors'),
  '''{}''::text[]', 'movie_details.directors defaults to the empty array');
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'movie_details' and column_name = 'writers'),
  '''{}''::text[]', 'movie_details.writers defaults to the empty array');
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'movie_details' and column_name = 'top_cast'),
  '''[]''::jsonb', 'movie_details.top_cast defaults to the empty json array');

select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'tv_details' and column_name = 'networks'),
  '''{}''::text[]', 'tv_details.networks defaults to the empty array');
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'tv_details' and column_name = 'creators'),
  '''{}''::text[]', 'tv_details.creators defaults to the empty array');
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'tv_details' and column_name = 'genres'),
  '''{}''::text[]', 'tv_details.genres defaults to the empty array');
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'tv_details' and column_name = 'origin_country'),
  '''{}''::text[]', 'tv_details.origin_country defaults to the empty array');
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'tv_details' and column_name = 'top_cast'),
  '''[]''::jsonb', 'tv_details.top_cast defaults to the empty json array');

select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'watch_providers' and column_name = 'display_priorities'),
  '''{}''::jsonb', 'watch_providers.display_priorities defaults to the empty map');
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'watch_providers' and column_name = 'refreshed_at'),
  'now()', 'watch_providers.refreshed_at defaults to now()');

select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'watch_availability' and column_name = 'first_seen_at'),
  'now()', 'watch_availability.first_seen_at defaults to now()');
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'watch_availability' and column_name = 'last_seen_at'),
  'now()', 'watch_availability.last_seen_at defaults to now()');

-- Primary keys ------------------------------------------------------------------------
-- Each one is a claim about identity, which is why they are worth asserting
-- rather than assuming.

select col_is_pk('public', 'movie_details', 'media_item_id',
  'a film has exactly one details row, keyed by the catalog row it extends');
select col_is_pk('public', 'tv_details', 'media_item_id',
  'a series has exactly one details row');
select col_is_pk('public', 'tv_seasons', array['media_item_id', 'season_number'],
  'a season is identified by its show and its number, specials included');
select col_is_pk('public', 'media_release_dates',
  array['media_item_id', 'region', 'release_type', 'released_on'],
  'the date is part of the key: a film can be released twice the same way in the same country');
select col_is_pk('public', 'media_certifications', array['media_item_id', 'region'],
  'one certification per title per region, which is what a header line shows');
select col_is_pk('public', 'watch_providers', 'provider_id',
  'a provider is TMDB''s id and nothing else');
select col_is_pk('public', 'watch_availability',
  array['media_item_id', 'region', 'provider_id', 'offer_type'],
  'the offer type is part of the key: Apple TV renting it and selling it are two rows');

-- tmdb_id, unique per medium and not across the catalog ----------------------------------

select ok(
  exists (select 1 from pg_constraint
           where conrelid = 'public.movie_details'::regclass
             and contype = 'u'
             and conkey = array[(select attnum from pg_attribute
                                  where attrelid = 'public.movie_details'::regclass
                                    and attname = 'tmdb_id')]),
  'movie_details.tmdb_id is unique'
);

select ok(
  exists (select 1 from pg_constraint
           where conrelid = 'public.tv_details'::regclass
             and contype = 'u'
             and conkey = array[(select attnum from pg_attribute
                                  where attrelid = 'public.tv_details'::regclass
                                    and attname = 'tmdb_id')]),
  'tv_details.tmdb_id is unique, separately, because TMDB numbers films and series apart'
);

-- Foreign keys, and the cascade they carry -------------------------------------------------

select fk_ok('public', 'movie_details', 'media_item_id', 'public', 'media_items', 'id',
  'movie_details.media_item_id references the catalog');
select fk_ok('public', 'tv_details', 'media_item_id', 'public', 'media_items', 'id',
  'tv_details.media_item_id references the catalog');
select fk_ok('public', 'tv_seasons', 'media_item_id', 'public', 'media_items', 'id',
  'tv_seasons.media_item_id references the catalog');
select fk_ok('public', 'media_release_dates', 'media_item_id', 'public', 'media_items', 'id',
  'media_release_dates.media_item_id references the catalog');
select fk_ok('public', 'media_certifications', 'media_item_id', 'public', 'media_items', 'id',
  'media_certifications.media_item_id references the catalog');
select fk_ok('public', 'watch_availability', 'media_item_id', 'public', 'media_items', 'id',
  'watch_availability.media_item_id references the catalog');
select fk_ok('public', 'watch_availability', 'provider_id', 'public', 'watch_providers', 'provider_id',
  'watch_availability.provider_id references the provider directory');

select is((select confdeltype from pg_constraint where conname = 'movie_details_media_item_id_fkey'),
  'c'::"char", 'dropping a catalog row takes its movie_details row with it');
select is((select confdeltype from pg_constraint where conname = 'tv_details_media_item_id_fkey'),
  'c'::"char", 'dropping a catalog row takes its tv_details row with it');
select is((select confdeltype from pg_constraint where conname = 'tv_seasons_media_item_id_fkey'),
  'c'::"char", 'dropping a catalog row takes its seasons with it');
select is((select confdeltype from pg_constraint where conname = 'media_release_dates_media_item_id_fkey'),
  'c'::"char", 'dropping a catalog row takes its release dates with it');
select is((select confdeltype from pg_constraint where conname = 'media_certifications_media_item_id_fkey'),
  'c'::"char", 'dropping a catalog row takes its certifications with it');
select is((select confdeltype from pg_constraint where conname = 'watch_availability_media_item_id_fkey'),
  'c'::"char", 'dropping a catalog row takes its availability with it, closed rows included');

select is((select confdeltype from pg_constraint where conname = 'watch_availability_provider_id_fkey'),
  'a'::"char",
  'the provider reference does not cascade: deleting a provider that still has offers is refused, which is the right answer for a directory row'
);

-- The check constraints -----------------------------------------------------------------

select ok(
  exists (select 1 from pg_constraint
           where conrelid = 'public.media_release_dates'::regclass
             and conname = 'media_release_dates_release_type_check' and contype = 'c'),
  'media_release_dates carries a named check on release_type'
);

select ok(
  exists (select 1 from pg_constraint
           where conrelid = 'public.watch_availability'::regclass
             and conname = 'watch_availability_offer_type_check' and contype = 'c'),
  'watch_availability carries a named check on offer_type'
);

-- Indexes ---------------------------------------------------------------------------------

select ok(to_regclass('public.movie_details_genres') is not null, 'movie_details_genres exists');
select matches(pg_get_indexdef('public.movie_details_genres'::regclass), 'USING gin \(genres\)',
  'and it is a GIN index, the only kind that answers a containment test on an array');

select ok(to_regclass('public.tv_details_genres') is not null, 'tv_details_genres exists');
select matches(pg_get_indexdef('public.tv_details_genres'::regclass), 'USING gin \(genres\)',
  'and so is the series one, matching game_details_genres');

select ok(to_regclass('public.watch_availability_current') is not null, 'watch_availability_current exists');
select matches(pg_get_indexdef('public.watch_availability_current'::regclass),
  'INCLUDE \(region, provider_id, offer_type\)',
  'the movie and show page read rides entirely in the index');
select matches(pg_get_indexdef('public.watch_availability_current'::regclass),
  'WHERE \(removed_at IS NULL\)',
  'and it is partial, so every row of every title that ever left a service is out of the scan');

select ok(to_regclass('public.watch_availability_provider_current') is not null,
  'watch_availability_provider_current exists');
select matches(pg_get_indexdef('public.watch_availability_provider_current'::regclass),
  'btree \(provider_id, region\) WHERE \(removed_at IS NULL\)',
  'the job closes out one provider and region at a time without scanning the table');

-- Row Level Security --------------------------------------------------------------------------

select ok((select relrowsecurity from pg_class where oid = 'public.movie_details'::regclass), 'RLS on movie_details');
select ok((select relrowsecurity from pg_class where oid = 'public.tv_details'::regclass), 'RLS on tv_details');
select ok((select relrowsecurity from pg_class where oid = 'public.tv_seasons'::regclass), 'RLS on tv_seasons');
select ok((select relrowsecurity from pg_class where oid = 'public.media_release_dates'::regclass), 'RLS on media_release_dates');
select ok((select relrowsecurity from pg_class where oid = 'public.media_certifications'::regclass), 'RLS on media_certifications');
select ok((select relrowsecurity from pg_class where oid = 'public.watch_providers'::regclass), 'RLS on watch_providers');
select ok((select relrowsecurity from pg_class where oid = 'public.watch_availability'::regclass), 'RLS on watch_availability');

select policies_are('public', 'movie_details',
  array['movie details are readable by signed-in users'], 'movie_details has exactly one policy');
select policies_are('public', 'tv_details',
  array['tv details are readable by signed-in users'], 'tv_details has exactly one policy');
select policies_are('public', 'tv_seasons',
  array['tv seasons are readable by signed-in users'], 'tv_seasons has exactly one policy');
select policies_are('public', 'media_release_dates',
  array['release dates are readable by signed-in users'], 'media_release_dates has exactly one policy');
select policies_are('public', 'media_certifications',
  array['certifications are readable by signed-in users'], 'media_certifications has exactly one policy');
select policies_are('public', 'watch_providers',
  array['watch providers are readable by signed-in users'], 'watch_providers has exactly one policy');
select policies_are('public', 'watch_availability',
  array['watch availability is readable by signed-in users'], 'watch_availability has exactly one policy');

-- The single most important security fact in this migration, asserted once over
-- all seven: not one of those policies is a write policy, so there is no path
-- by which a client invents a streaming offer or moves a release date.
select is(
  (select count(*) from pg_policy
    where polrelid in ('public.movie_details'::regclass, 'public.tv_details'::regclass,
                       'public.tv_seasons'::regclass, 'public.media_release_dates'::regclass,
                       'public.media_certifications'::regclass, 'public.watch_providers'::regclass,
                       'public.watch_availability'::regclass)
      and polcmd <> 'r'),
  0::bigint,
  'no insert, update or delete policy exists on any of the seven tables'
);

select table_privs_are('public', 'movie_details', 'authenticated', array['SELECT'],
  'signed-in users may read movie_details and nothing else');
select table_privs_are('public', 'tv_details', 'authenticated', array['SELECT'],
  'signed-in users may read tv_details and nothing else');
select table_privs_are('public', 'tv_seasons', 'authenticated', array['SELECT'],
  'signed-in users may read tv_seasons and nothing else');
select table_privs_are('public', 'media_release_dates', 'authenticated', array['SELECT'],
  'signed-in users may read media_release_dates and nothing else');
select table_privs_are('public', 'media_certifications', 'authenticated', array['SELECT'],
  'signed-in users may read media_certifications and nothing else');
select table_privs_are('public', 'watch_providers', 'authenticated', array['SELECT'],
  'signed-in users may read watch_providers and nothing else');
select table_privs_are('public', 'watch_availability', 'authenticated', array['SELECT'],
  'signed-in users may read watch_availability and nothing else');

select table_privs_are('public', 'movie_details', 'anon', array['SELECT'],
  'anon may ask about movie_details, and RLS is what answers: no policy, so no rows');
select table_privs_are('public', 'tv_details', 'anon', array['SELECT'],
  'anon may ask about tv_details');
select table_privs_are('public', 'tv_seasons', 'anon', array['SELECT'],
  'anon may ask about tv_seasons');
select table_privs_are('public', 'media_release_dates', 'anon', array['SELECT'],
  'anon may ask about media_release_dates');
select table_privs_are('public', 'media_certifications', 'anon', array['SELECT'],
  'anon may ask about media_certifications');
select table_privs_are('public', 'watch_providers', 'anon', array['SELECT'],
  'anon may ask about watch_providers');
select table_privs_are('public', 'watch_availability', 'anon', array['SELECT'],
  'anon may ask about watch_availability');

select ok(
  has_table_privilege('service_role', 'public.movie_details', 'INSERT')
  and has_table_privilege('service_role', 'public.tv_details', 'INSERT')
  and has_table_privilege('service_role', 'public.tv_seasons', 'INSERT')
  and has_table_privilege('service_role', 'public.media_release_dates', 'INSERT')
  and has_table_privilege('service_role', 'public.media_certifications', 'INSERT')
  and has_table_privilege('service_role', 'public.watch_providers', 'INSERT')
  and has_table_privilege('service_role', 'public.watch_availability', 'INSERT'),
  'the service role, which is what tmdb-sync uses, can write every one of them'
);

-- Fixtures ------------------------------------------------------------------------------------
-- A film and a series with a full set of dependent rows, plus one spare of each
-- medium used only to prove things about the tmdb_id constraints. Fixed uuids,
-- and every count below is scoped to them.

insert into public.media_items (id, medium, title, year, release_date, cover_image_id, external_ids, metadata) values
  ('00000000-0000-0000-0000-0000000000b1', 'movie', 'Catalog Fixture Film', 1999,
   '1999-03-31', '/fixtureFilmPoster.jpg',
   '{"tmdb": 9100001, "imdb": "tt0000001"}', '{"popularity": 41.5, "vote_average": 8.2, "vote_count": 1200}'),
  ('00000000-0000-0000-0000-0000000000b2', 'tv', 'Catalog Fixture Series', 2022,
   '2022-02-18', '/fixtureSeriesPoster.jpg',
   '{"tmdb": 9100001, "tvdb": 400001}', '{"popularity": 88.0, "vote_average": 8.4, "vote_count": 3400}'),
  ('00000000-0000-0000-0000-0000000000b3', 'movie', 'Catalog Fixture Film Two', 2001, null, null, '{}', '{}'),
  ('00000000-0000-0000-0000-0000000000b4', 'tv', 'Catalog Fixture Series Two', 2024, null, null, '{}', '{}');

insert into public.watch_providers (provider_id, name, logo_image_id, display_priorities) values
  (9900001, 'Fixture Flatrate', '/fixtureFlatrate.jpg', '{"US": 3, "GB": 7}'),
  (9900002, 'Fixture Storefront', '/fixtureStorefront.jpg', '{"US": 12}');

insert into public.movie_details
  (media_item_id, tmdb_id, runtime_minutes, genres, directors, writers, top_cast,
   studio, collection_tmdb_id, collection_name, tagline, overview, backdrop_image_id)
values
  ('00000000-0000-0000-0000-0000000000b1', 9100001, 139,
   '{"Drama", "Thriller"}', '{"Fixture Director"}', '{"Fixture Writer", "Fixture Novelist"}',
   '[{"tmdb_person_id": 1, "name": "Fixture Lead", "character": "Narrator", "profile_path": "/lead.jpg"}]'::jsonb,
   'Fixture Pictures', 700001, 'The Fixture Collection', 'Mischief. Mayhem. Fixtures.',
   'A film that exists only to be asserted about.', '/fixtureFilmBackdrop.jpg');

insert into public.tv_details
  (media_item_id, tmdb_id, status, show_type, in_production, first_air_date, last_air_date,
   networks, creators, genres, origin_country, season_count, episode_count,
   episode_runtime_minutes, next_episode_air_date, next_episode_season, next_episode_number,
   next_episode_name, last_episode_air_date, last_episode_season, last_episode_number,
   top_cast, overview, backdrop_image_id)
values
  ('00000000-0000-0000-0000-0000000000b2', 9200001, 'Returning Series', 'Scripted', true,
   '2022-02-18', '2025-03-21', '{"Fixture Network"}', '{"Fixture Creator"}',
   '{"Drama", "Mystery"}', '{"US"}', 2, 19, 45,
   null, null, null, null, '2025-03-21', 2, 10,
   '[{"tmdb_person_id": 2, "name": "Fixture Regular", "character": "Self", "profile_path": "/regular.jpg", "episode_count": 19}]'::jsonb,
   'A series that exists only to be asserted about.', '/fixtureSeriesBackdrop.jpg');

insert into public.tv_seasons
  (media_item_id, season_number, tmdb_season_id, name, episode_count, air_date, poster_image_id, overview)
values
  ('00000000-0000-0000-0000-0000000000b2', 0, 500000, 'Specials', 3, null, '/specials.jpg', null),
  ('00000000-0000-0000-0000-0000000000b2', 1, 500001, 'Season 1', 9, '2022-02-18', '/season1.jpg', 'The first one.');

insert into public.media_release_dates
  (media_item_id, region, release_type, released_on, certification, note)
values
  ('00000000-0000-0000-0000-0000000000b1', 'US', 3, '1999-10-15', 'R', null),
  ('00000000-0000-0000-0000-0000000000b1', 'US', 4, '1999-12-03', null, 'Digital');

insert into public.media_certifications (media_item_id, region, certification) values
  ('00000000-0000-0000-0000-0000000000b1', 'US', 'R'),
  ('00000000-0000-0000-0000-0000000000b2', 'US', 'TV-MA');

insert into public.watch_availability
  (media_item_id, region, provider_id, offer_type, first_seen_at, last_seen_at, removed_at)
values
  ('00000000-0000-0000-0000-0000000000b1', 'US', 9900001, 'flatrate',
   now() - interval '60 days', now(), null),
  ('00000000-0000-0000-0000-0000000000b1', 'US', 9900002, 'rent',
   now() - interval '200 days', now(), null),
  ('00000000-0000-0000-0000-0000000000b1', 'US', 9900002, 'buy',
   now() - interval '200 days', now() - interval '31 days', now() - interval '30 days'),
  ('00000000-0000-0000-0000-0000000000b2', 'US', 9900001, 'flatrate',
   now() - interval '10 days', now(), null);

-- What the schema refuses -----------------------------------------------------------------------
-- These four are the rules that hold even when packages/catalog has a bug, which
-- is the only reason to put them in the database rather than in the mapper.

select throws_ok(
  $$ insert into public.watch_availability (media_item_id, region, provider_id, offer_type)
     values ('00000000-0000-0000-0000-0000000000b2', 'US', 9900002, 'subscription') $$,
  '23514', null,
  'an offer type outside TMDB''s five is refused: flatrate, free, ads, rent and buy are the whole vocabulary'
);

select lives_ok(
  $$ insert into public.watch_availability (media_item_id, region, provider_id, offer_type)
     values ('00000000-0000-0000-0000-0000000000b2', 'US', 9900002, 'free'),
            ('00000000-0000-0000-0000-0000000000b2', 'US', 9900002, 'ads'),
            ('00000000-0000-0000-0000-0000000000b2', 'US', 9900002, 'rent'),
            ('00000000-0000-0000-0000-0000000000b2', 'US', 9900002, 'buy') $$,
  'and all five of them are accepted'
);

delete from public.watch_availability
 where media_item_id = '00000000-0000-0000-0000-0000000000b2' and provider_id = 9900002;

select throws_ok(
  $$ insert into public.media_release_dates (media_item_id, region, release_type, released_on)
     values ('00000000-0000-0000-0000-0000000000b1', 'GB', 0, '1999-11-12') $$,
  '23514', null,
  'a release type of 0 is refused: TMDB''s codes start at 1'
);

select throws_ok(
  $$ insert into public.media_release_dates (media_item_id, region, release_type, released_on)
     values ('00000000-0000-0000-0000-0000000000b1', 'GB', 7, '1999-11-12') $$,
  '23514', null,
  'and a release type of 7 is refused: they stop at 6'
);

select lives_ok(
  $$ insert into public.media_release_dates (media_item_id, region, release_type, released_on)
     values ('00000000-0000-0000-0000-0000000000b1', 'GB', 1, '1999-09-10'),
            ('00000000-0000-0000-0000-0000000000b1', 'GB', 6, '2001-04-01') $$,
  'both ends of the range are accepted, premiere and TV'
);

delete from public.media_release_dates
 where media_item_id = '00000000-0000-0000-0000-0000000000b1' and region = 'GB';

select throws_ok(
  $$ insert into public.watch_availability (media_item_id, region, provider_id, offer_type)
     values ('00000000-0000-0000-0000-0000000000b2', 'US', 9999999, 'flatrate') $$,
  '23503', null,
  'an offer cannot name a provider the directory has never heard of, which is why the provider pass runs first'
);

select throws_ok(
  $$ insert into public.watch_availability (media_item_id, region, provider_id, offer_type)
     values ('00000000-0000-0000-0000-0000000000b1', 'US', 9900001, 'flatrate') $$,
  '23505', null,
  'and a title cannot be on one provider in one region with one offer type twice'
);

select throws_ok(
  $$ insert into public.movie_details (media_item_id, tmdb_id)
     values ('00000000-0000-0000-0000-0000000000b3', 9100001) $$,
  '23505', null,
  'two films cannot share a TMDB id'
);

select lives_ok(
  $$ insert into public.tv_details (media_item_id, tmdb_id)
     values ('00000000-0000-0000-0000-0000000000b4', 9100001) $$,
  'but a series may carry the same number as a film, because TMDB numbers the two mediums apart'
);

delete from public.tv_details where media_item_id = '00000000-0000-0000-0000-0000000000b4';

-- Reading, as a signed-in user --------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is(
  (select count(*) from public.movie_details
    where media_item_id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b3')),
  1::bigint,
  'a signed-in user reads movie_details: the catalog is a fact about films, not about people'
);

select is(
  (select count(*) from public.tv_details
    where media_item_id in ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b4')),
  1::bigint,
  'and tv_details'
);

select is(
  (select count(*) from public.tv_seasons
    where media_item_id = '00000000-0000-0000-0000-0000000000b2'),
  2::bigint,
  'and the season list, specials season included, because storing it and counting it are different questions'
);

select is(
  (select count(*) from public.media_release_dates
    where media_item_id = '00000000-0000-0000-0000-0000000000b1'),
  2::bigint,
  'and the per-region release dates, which is where "In theaters" and "Streaming" come from'
);

select is(
  (select count(*) from public.media_certifications
    where media_item_id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2')),
  2::bigint,
  'and the certifications, one per title per region'
);

select is(
  (select count(*) from public.watch_providers where provider_id in (9900001, 9900002)),
  2::bigint,
  'and the provider directory, which it needs to draw a logo beside an offer'
);

select is(
  (select count(*) from public.watch_availability
    where media_item_id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2')),
  4::bigint,
  'and every availability row, the closed one included'
);

select results_eq(
  $$ select provider_id, offer_type from public.watch_availability
      where media_item_id = '00000000-0000-0000-0000-0000000000b1' and removed_at is null
      order by provider_id, offer_type $$,
  $$ values (9900001, 'flatrate'), (9900002, 'rent') $$,
  'though "where can I watch this" is the three that are still open, which is removed_at is null and nothing else'
);

-- Writing, as a signed-in user ----------------------------------------------------------------------
-- Twenty-one refusals, because there are seven tables and three ways to write.
-- All of them fail before RLS has an opinion, because the grant is SELECT
-- alone: a client cannot tell a missing policy from a missing privilege, and
-- has no way through either one.

select throws_ok($$ insert into public.movie_details (media_item_id, tmdb_id)
  values ('00000000-0000-0000-0000-0000000000b3', 9100999) $$, '42501', null,
  'a signed-in user cannot insert into movie_details');
select throws_ok($$ update public.movie_details set tagline = 'rewritten' $$, '42501', null,
  'nor update it');
select throws_ok($$ delete from public.movie_details $$, '42501', null,
  'nor delete from it');

select throws_ok($$ insert into public.tv_details (media_item_id, tmdb_id)
  values ('00000000-0000-0000-0000-0000000000b4', 9200999) $$, '42501', null,
  'a signed-in user cannot insert into tv_details');
select throws_ok($$ update public.tv_details set status = 'Ended' $$, '42501', null,
  'nor cancel a show by hand');
select throws_ok($$ delete from public.tv_details $$, '42501', null,
  'nor delete from it');

select throws_ok($$ insert into public.tv_seasons (media_item_id, season_number)
  values ('00000000-0000-0000-0000-0000000000b2', 9) $$, '42501', null,
  'a signed-in user cannot invent a season');
select throws_ok($$ update public.tv_seasons set episode_count = 99 $$, '42501', null,
  'nor renumber one');
select throws_ok($$ delete from public.tv_seasons $$, '42501', null,
  'nor delete one');

select throws_ok($$ insert into public.media_release_dates (media_item_id, region, release_type, released_on)
  values ('00000000-0000-0000-0000-0000000000b1', 'US', 5, '2000-01-01') $$, '42501', null,
  'a signed-in user cannot insert a release date');
select throws_ok($$ update public.media_release_dates set released_on = '2030-01-01' $$, '42501', null,
  'nor move one');
select throws_ok($$ delete from public.media_release_dates $$, '42501', null,
  'nor delete one');

select throws_ok($$ insert into public.media_certifications (media_item_id, region, certification)
  values ('00000000-0000-0000-0000-0000000000b1', 'GB', '15') $$, '42501', null,
  'a signed-in user cannot insert a certification');
select throws_ok($$ update public.media_certifications set certification = 'G' $$, '42501', null,
  'nor re-rate a film');
select throws_ok($$ delete from public.media_certifications $$, '42501', null,
  'nor delete a rating');

select throws_ok($$ insert into public.watch_providers (provider_id, name)
  values (9900003, 'Invented Streaming') $$, '42501', null,
  'a signed-in user cannot add a provider');
select throws_ok($$ update public.watch_providers set name = 'Renamed' $$, '42501', null,
  'nor rename one');
select throws_ok($$ delete from public.watch_providers $$, '42501', null,
  'nor delete one');

select throws_ok($$ insert into public.watch_availability (media_item_id, region, provider_id, offer_type)
  values ('00000000-0000-0000-0000-0000000000b2', 'US', 9900002, 'flatrate') $$, '42501', null,
  'a signed-in user cannot put a film on a service');
select throws_ok($$ update public.watch_availability set removed_at = null $$, '42501', null,
  'nor bring a removed row back');
select throws_ok($$ delete from public.watch_availability $$, '42501', null,
  'nor delete history');

select is(
  (select count(*) from public.watch_availability
    where media_item_id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2')),
  4::bigint,
  'and none of that changed anything'
);

-- Signed out ----------------------------------------------------------------------------------------
-- An empty answer on every table, not an error. A movie page opened before sign
-- in should find nothing to draw rather than a failure it has to special-case.

set local role anon;

select is((select count(*) from public.movie_details
  where media_item_id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b3')),
  0::bigint, 'a signed-out caller sees no movie_details, and it is not an error');
select is((select count(*) from public.tv_details
  where media_item_id in ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b4')),
  0::bigint, 'nor tv_details');
select is((select count(*) from public.tv_seasons
  where media_item_id = '00000000-0000-0000-0000-0000000000b2'),
  0::bigint, 'nor seasons');
select is((select count(*) from public.media_release_dates
  where media_item_id = '00000000-0000-0000-0000-0000000000b1'),
  0::bigint, 'nor release dates');
select is((select count(*) from public.media_certifications
  where media_item_id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2')),
  0::bigint, 'nor certifications');
select is((select count(*) from public.watch_providers where provider_id in (9900001, 9900002)),
  0::bigint, 'nor providers');
select is((select count(*) from public.watch_availability
  where media_item_id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2')),
  0::bigint, 'nor availability');

select throws_ok(
  $$ insert into public.watch_availability (media_item_id, region, provider_id, offer_type)
     values ('00000000-0000-0000-0000-0000000000b2', 'US', 9900002, 'flatrate') $$,
  '42501', null,
  'and it cannot write one either'
);

-- The cascade ------------------------------------------------------------------------------------------
-- One delete from the catalog, six tables emptied. This is the assertion that
-- lets the design doc say a row is never deleted: the only delete that ever
-- happens to these tables is the one that follows the title out of the catalog.

reset role;

delete from public.media_items
 where id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2');

select is((select count(*) from public.movie_details
  where media_item_id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b3')),
  0::bigint, 'removing a film from the catalog removes its movie_details row');
select is((select count(*) from public.tv_details
  where media_item_id in ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b4')),
  0::bigint, 'and a series takes its tv_details row');
select is((select count(*) from public.tv_seasons
  where media_item_id = '00000000-0000-0000-0000-0000000000b2'),
  0::bigint, 'and its seasons');
select is((select count(*) from public.media_release_dates
  where media_item_id = '00000000-0000-0000-0000-0000000000b1'),
  0::bigint, 'and its release dates');
select is((select count(*) from public.media_certifications
  where media_item_id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2')),
  0::bigint, 'and its certifications');
select is((select count(*) from public.watch_availability
  where media_item_id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2')),
  0::bigint, 'and its availability, the closed rows included');

select is((select count(*) from public.watch_providers where provider_id in (9900001, 9900002)),
  2::bigint,
  'the providers survive, because a directory row is not about any one title'
);

select * from finish();
rollback;
