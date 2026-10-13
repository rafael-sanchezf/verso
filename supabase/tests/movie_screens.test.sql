-- pgTAP tests for supabase/migrations/20261013100000_movie_screens.sql.
-- Run with: supabase test db
--
-- Seven things are under test:
--
-- 1. **Shape**: the source column and its checks, the grants, each function's
--    security and pinned search_path, never anon, 28000 without a user.
-- 2. **The diary's source**: a log row needs a day, a bulk or import row may
--    have none, the finished_at mirror reads dated rows only and leaves the
--    entry alone when every row is undated, and the source cannot be changed.
-- 3. **Search by person**: people_text, the person tier, person_match in the
--    brief's order (director, cast, writer), a title above a person at equal
--    closeness, and null on the games path and on a title match.
-- 4. **movie_page**: the row, the region's certification, every score by
--    source, the offers in order with mine, and no row for a game.
-- 5. **movie_home_rows**: the watchlist first, a genre the caller ranks high,
--    "Because you loved" for each Loved film with six candidates above the
--    median, nothing seen, the candidate's fields, the popular row only when
--    nothing else has anything to say, and another user's rows untouched.
-- 6. **deck_candidates for films**: released films with a poster the caller
--    has not tracked, most voted first, and the games path unchanged.
-- 7. **Cost**: movie_home_rows on a 25,000-film synthetic catalog under the
--    300 ms ceiling, best of three.
--
-- Users act through `set local role authenticated` plus a forged
-- request.jwt.claims. Ids are in the ...b5 range; TMDB ids are negative and
-- provider ids are above 1,995,000,000, so nothing meets a mirrored catalog.
-- Names carry "Msx" or invented surnames for the same reason.

begin;
select plan(65);

-- ==============================================================================
-- 1. Shape
-- ==============================================================================

-- 1
select has_column('public', 'watch_log', 'source', 'watch_log has source');

-- 2
select col_not_null('public', 'watch_log', 'source', 'source is not null');

-- 3
select col_default_is('public', 'watch_log', 'source', 'log', 'source defaults to log, which every earlier row was');

-- 4
select ok(
  has_column_privilege('authenticated', 'public.watch_log', 'source', 'insert')
  and not has_column_privilege('authenticated', 'public.watch_log', 'source', 'update'),
  'a client writes the source once and never changes it'
);

-- 5
select is(
  (select attgenerated from pg_attribute
    where attrelid = 'public.movie_details'::regclass and attname = 'people_text'),
  's'::"char",
  'people_text is a stored generated column'
);

-- 6
select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'movie_details_people_trgm')
  and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'movie_details_directors'),
  'people_text has its trigram index and directors their GIN index'
);

-- 7
select ok(
  (select bool_and(p.proconfig @> array['search_path=public, extensions'])
     from pg_proc p
    where p.oid in (
      'public.movie_page(uuid,text,date)'::regprocedure,
      'public.movie_home_rows(text,date)'::regprocedure,
      'public.search_games(text,integer,public.medium)'::regprocedure,
      'public.deck_candidates(text[],integer,integer,public.medium)'::regprocedure
    )),
  'all four pin their search_path'
);

-- 8
select results_eq(
  $$ select p.oid::regprocedure::text, p.prosecdef
       from pg_proc p
      where p.oid in (
        'public.movie_page(uuid,text,date)'::regprocedure,
        'public.movie_home_rows(text,date)'::regprocedure,
        'public.search_games(text,integer,public.medium)'::regprocedure,
        'public.deck_candidates(text[],integer,integer,public.medium)'::regprocedure
      )
      order by 1 $$,
  $$ values
       ('deck_candidates(text[],integer,integer,medium)', true),
       ('movie_home_rows(text,date)', true),
       ('movie_page(uuid,text,date)', false),
       ('search_games(text,integer,medium)', false) $$,
  'movie_page and search_games are invoker; movie_home_rows and deck_candidates are definer, because the scorer is service role only'
);

-- 8b
select ok(
  (select p.proconfig @> array['search_path=pg_catalog, public']
     from pg_proc p where p.oid = 'public.movie_people_text(text[],text[],jsonb)'::regprocedure),
  'movie_people_text pins its search_path too'
);

-- 9
select ok(
  not has_function_privilege('anon', 'public.movie_page(uuid,text,date)', 'execute')
  and not has_function_privilege('anon', 'public.movie_home_rows(text,date)', 'execute')
  and not has_function_privilege('anon', 'public.deck_candidates(text[],integer,integer,public.medium)', 'execute')
  and not has_function_privilege('anon', 'public.search_games(text,integer,public.medium)', 'execute')
  and has_function_privilege('authenticated', 'public.movie_page(uuid,text,date)', 'execute')
  and has_function_privilege('authenticated', 'public.movie_home_rows(text,date)', 'execute')
  and has_function_privilege('authenticated', 'public.deck_candidates(text[],integer,integer,public.medium)', 'execute')
  and has_function_privilege('authenticated', 'public.search_games(text,integer,public.medium)', 'execute'),
  'signed-in users can call all four, anon none'
);

-- 10
select is(
  (select count(*)::integer from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('deck_candidates', 'search_games')),
  2,
  'one deck_candidates and one search_games: no overload left for PostgREST to choose between'
);

-- 11
select throws_ok(
  $$ select * from public.movie_home_rows('US', '2026-10-13') $$,
  '28000',
  null,
  'movie_home_rows without a user is 28000'
);

-- ==============================================================================
-- Fixtures
-- ==============================================================================
--
-- A ranks six films (two Loved), so one genre qualifies (Msx Horror: three
-- ranked, mean percentile 0.75) and the median score is 6.35. B has one
-- dropped film and nothing else. C has one film on the watchlist.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000b50aa', 'screens-a@example.com'),
  ('00000000-0000-0000-0000-0000000b50bb', 'screens-b@example.com'),
  ('00000000-0000-0000-0000-0000000b50cc', 'screens-c@example.com');

insert into public.watch_providers (provider_id, name, logo_image_id, display_priorities) values
  (1995000001, 'Screens P1', '/p1.png', '{"US": 2, "GB": 1}'),
  (1995000002, 'Screens P2', '/p2.png', '{"US": 1}'),
  (1995000003, 'Screens P3', null, '{"US": 3}');

-- Films. r: A's ranked; h: unseen horror; d1x: D1's comedy; w: watchlist;
-- p1: A played, unranked; s: search; mp1: the movie page; u1 unreleased; np1
-- no poster; bd: B's dropped film; cw: C's watchlist film.
insert into public.media_items (id, medium, title, year, release_date, cover_image_id, external_ids, metadata) values
  ('00000000-0000-0000-0000-0000000b5f01', 'movie', 'Msx Ranked One', 2001, '2001-01-01', '/r1.jpg', '{"tmdb": -85001}', '{"vote_count": 100}'),
  ('00000000-0000-0000-0000-0000000b5f02', 'movie', 'Msx Ranked Two', 2002, '2002-01-01', '/r2.jpg', '{"tmdb": -85002}', '{"vote_count": 100}'),
  ('00000000-0000-0000-0000-0000000b5f03', 'movie', 'Msx Ranked Three', 2003, '2003-01-01', '/r3.jpg', '{"tmdb": -85003}', '{"vote_count": 100}'),
  ('00000000-0000-0000-0000-0000000b5f04', 'movie', 'Msx Ranked Four', 2004, '2004-01-01', '/r4.jpg', '{"tmdb": -85004}', '{"vote_count": 100}'),
  ('00000000-0000-0000-0000-0000000b5f05', 'movie', 'Msx Ranked Five', 2005, '2005-01-01', '/r5.jpg', '{"tmdb": -85005}', '{"vote_count": 100}'),
  ('00000000-0000-0000-0000-0000000b5f06', 'movie', 'Msx Ranked Six', 2006, '2006-01-01', '/r6.jpg', '{"tmdb": -85006}', '{"vote_count": 100}'),
  ('00000000-0000-0000-0000-0000000b5f11', 'movie', 'Msx Horror One', 2011, '2011-01-01', '/h1.jpg', '{"tmdb": -85011}', '{"vote_count": 900100}'),
  ('00000000-0000-0000-0000-0000000b5f12', 'movie', 'Msx Horror Two', 2012, '2012-01-01', '/h2.jpg', '{"tmdb": -85012}', '{"vote_count": 900200}'),
  ('00000000-0000-0000-0000-0000000b5f13', 'movie', 'Msx Horror Three', 2013, '2013-01-01', '/h3.jpg', '{"tmdb": -85013}', '{"vote_count": 900300}'),
  ('00000000-0000-0000-0000-0000000b5f14', 'movie', 'Msx Horror Four', 2014, '2014-01-01', '/h4.jpg', '{"tmdb": -85014}', '{"vote_count": 900400}'),
  ('00000000-0000-0000-0000-0000000b5f15', 'movie', 'Msx Horror Five', 2015, '2015-01-01', '/h5.jpg', '{"tmdb": -85015}', '{"vote_count": 900500}'),
  ('00000000-0000-0000-0000-0000000b5f16', 'movie', 'Msx Horror Six', 2016, '2016-01-01', '/h6.jpg', '{"tmdb": -85016}', '{"vote_count": 900600}'),
  ('00000000-0000-0000-0000-0000000b5f17', 'movie', 'Msx Horror Seven', 2017, '2017-01-01', '/h7.jpg', '{"tmdb": -85017}', '{"vote_count": 900700}'),
  ('00000000-0000-0000-0000-0000000b5f18', 'movie', 'Msx Director Comedy', 2018, '2018-01-01', '/d1x.jpg', '{"tmdb": -85018}', '{"vote_count": 50}'),
  ('00000000-0000-0000-0000-0000000b5f21', 'movie', 'Msx Watch One', 2020, '2020-01-01', '/w1.jpg', '{"tmdb": -85021}', '{"vote_count": 900900}'),
  ('00000000-0000-0000-0000-0000000b5f22', 'movie', 'Msx Watch Two', 2020, '2020-02-01', '/w2.jpg', '{"tmdb": -85022}', '{"vote_count": 10}'),
  ('00000000-0000-0000-0000-0000000b5f23', 'movie', 'Msx Played One', 2019, '2019-01-01', '/p1.jpg', '{"tmdb": -85023}', '{"vote_count": 900800}'),
  ('00000000-0000-0000-0000-0000000b5f31', 'movie', 'Msx Arrivalia', 2016, '2016-11-11', '/s1.jpg', '{"tmdb": -85031}', '{"vote_count": 30}'),
  ('00000000-0000-0000-0000-0000000b5f32', 'movie', 'Msx Dunewind', 2021, '2021-10-22', '/s2.jpg', '{"tmdb": -85032}', '{"vote_count": 40}'),
  ('00000000-0000-0000-0000-0000000b5f33', 'movie', 'Msx Blackroom', 2010, '2010-01-01', '/s3.jpg', '{"tmdb": -85033}', '{"vote_count": 20}'),
  ('00000000-0000-0000-0000-0000000b5f34', 'movie', 'Qorvath Days', 2000, '2000-01-01', '/s4.jpg', '{"tmdb": -85034}', '{"vote_count": 10}'),
  ('00000000-0000-0000-0000-0000000b5f35', 'movie', 'Msx Writerly', 2005, '2005-01-01', '/s5.jpg', '{"tmdb": -85035}', '{"vote_count": 10}'),
  ('00000000-0000-0000-0000-0000000b5f37', 'movie', 'Msx Twofold', 2007, '2007-01-01', '/s7.jpg', '{"tmdb": -85037}', '{"vote_count": 10}'),
  ('00000000-0000-0000-0000-0000000b5f41', 'movie', 'Msx Page Film', 2021, '2021-10-22', '/mp1.jpg', '{"tmdb": -85041}', '{"vote_count": 10}'),
  ('00000000-0000-0000-0000-0000000b5f51', 'movie', 'Msx Unreleased', 2099, '2099-01-01', '/u1.jpg', '{"tmdb": -85051}', '{"vote_count": 999999}'),
  ('00000000-0000-0000-0000-0000000b5f52', 'movie', 'Msx No Poster', 2001, '2001-01-01', null, '{"tmdb": -85052}', '{"vote_count": 999998}'),
  ('00000000-0000-0000-0000-0000000b5f53', 'movie', 'Msx Dropped', 2001, '2001-01-01', '/bd.jpg', '{"tmdb": -85053}', '{"vote_count": 999997}'),
  ('00000000-0000-0000-0000-0000000b5f54', 'movie', 'Msx C Watch', 2001, '2001-01-01', '/cw.jpg', '{"tmdb": -85054}', '{"vote_count": 5}'),
  ('00000000-0000-0000-0000-0000000b5e01', 'game', 'Msx Qorvath Game', 2020, '2020-01-01', 'g1', '{"igdb": -85101}', '{"total_rating_count": 5}');

insert into public.movie_details (media_item_id, tmdb_id, runtime_minutes, genres, directors, writers, top_cast) values
  ('00000000-0000-0000-0000-0000000b5f01', -85001, 100, '{"Msx Horror","Msx Thriller"}', '{"Msx Director One"}', '{}', '[]'),
  ('00000000-0000-0000-0000-0000000b5f02', -85002, 100, '{"Msx Horror"}', '{"Msx Director Two"}', '{}', '[]'),
  ('00000000-0000-0000-0000-0000000b5f03', -85003, 100, '{"Msx Horror","Msx Drama"}', '{"Msx Director Three"}', '{}', '[]'),
  ('00000000-0000-0000-0000-0000000b5f04', -85004, 100, '{"Msx Comedy"}', '{"Msx Director Four"}', '{}', '[]'),
  ('00000000-0000-0000-0000-0000000b5f05', -85005, 100, '{"Msx Comedy"}', '{"Msx Director Five"}', '{}', '[]'),
  ('00000000-0000-0000-0000-0000000b5f06', -85006, 100, '{"Msx Drama"}', '{"Msx Director Six"}', '{}', '[]'),
  ('00000000-0000-0000-0000-0000000b5f11', -85011, 91, '{"Msx Horror","Msx Thriller"}', '{"Msx Director H"}', '{}', '[]'),
  ('00000000-0000-0000-0000-0000000b5f12', -85012, 92, '{"Msx Horror","Msx Thriller"}', '{"Msx Director H"}', '{}', '[]'),
  ('00000000-0000-0000-0000-0000000b5f13', -85013, 93, '{"Msx Horror","Msx Thriller"}', '{"Msx Director H"}', '{}', '[]'),
  ('00000000-0000-0000-0000-0000000b5f14', -85014, 94, '{"Msx Horror","Msx Thriller"}', '{"Msx Director H"}', '{}', '[]'),
  ('00000000-0000-0000-0000-0000000b5f15', -85015, 95, '{"Msx Horror","Msx Thriller"}', '{"Msx Director H"}', '{}', '[]'),
  ('00000000-0000-0000-0000-0000000b5f16', -85016, 96, '{"Msx Horror","Msx Thriller"}', '{"Msx Director H"}', '{}', '[]'),
  ('00000000-0000-0000-0000-0000000b5f17', -85017, 97, '{"Msx Horror"}', '{"Msx Director H"}', '{}', '[]'),
  ('00000000-0000-0000-0000-0000000b5f18', -85018, 98, '{"Msx Comedy"}', '{"Msx Director One"}', '{}', '[]'),
  ('00000000-0000-0000-0000-0000000b5f21', -85021, 120, '{"Msx Horror"}', '{}', '{}', '[]'),
  ('00000000-0000-0000-0000-0000000b5f22', -85022, 120, '{"Msx Drama"}', '{}', '{}', '[]'),
  ('00000000-0000-0000-0000-0000000b5f23', -85023, 120, '{"Msx Horror"}', '{}', '{}', '[]'),
  ('00000000-0000-0000-0000-0000000b5f31', -85031, 116, '{"Msx Scifi"}', '{"Qorvath Villeneux"}', '{"Ezrin Spaitz"}',
    '[{"tmdb_person_id": -1, "name": "Tymora Chalamex", "character": "Louise", "profile_path": null}]'),
  ('00000000-0000-0000-0000-0000000b5f32', -85032, 155, '{"Msx Scifi"}', '{"Qorvath Villeneux"}', '{}',
    '[{"tmdb_person_id": -2, "name": "Ylsa Ferguse", "character": "Jessica", "profile_path": null}]'),
  ('00000000-0000-0000-0000-0000000b5f33', -85033, 90, '{"Msx Drama"}', '{"Hollin Brask"}', '{}',
    '[{"tmdb_person_id": -3, "name": "Qorvath Villeneux", "character": "Himself", "profile_path": null}]'),
  ('00000000-0000-0000-0000-0000000b5f34', -85034, 90, '{"Msx Drama"}', '{"Nobody Elsewhere"}', '{}', '[]'),
  ('00000000-0000-0000-0000-0000000b5f35', -85035, 90, '{"Msx Drama"}', '{"Pell Durno"}', '{"Ezrin Spaitz"}', '[]'),
  ('00000000-0000-0000-0000-0000000b5f37', -85037, 90, '{"Msx Drama"}', '{"Ulmo Kestrane"}', '{}',
    '[{"tmdb_person_id": -4, "name": "Ulmo Kestranel", "character": "Twin", "profile_path": null}]'),
  ('00000000-0000-0000-0000-0000000b5f41', -85041, 155, '{"Msx Scifi","Msx Adventure"}', '{"Qorvath Villeneux"}', '{"Ezrin Spaitz","Erik Rothmar"}',
    '[{"tmdb_person_id": -5, "name": "Tymora Chalamex", "character": "Paul", "profile_path": "/t.jpg"}]'),
  ('00000000-0000-0000-0000-0000000b5f51', -85051, 100, '{"Msx Drama"}', '{}', '{}', '[]'),
  ('00000000-0000-0000-0000-0000000b5f52', -85052, 100, '{"Msx Drama"}', '{}', '{}', '[]'),
  ('00000000-0000-0000-0000-0000000b5f53', -85053, 100, '{"Msx Drama"}', '{}', '{}', '[]'),
  ('00000000-0000-0000-0000-0000000b5f54', -85054, 100, '{"Msx Drama"}', '{}', '{}', '[]');

-- Every unseen candidate scores 9.9 outside, so it beats A's median.
insert into public.external_scores (media_item_id, source, score, score_count)
select m.id, 'tmdb', 99, 500
from public.media_items m
where m.id::text like '00000000-0000-0000-0000-0000000b5f1%';

insert into public.external_scores (media_item_id, source, score, score_count) values
  ('00000000-0000-0000-0000-0000000b5f41', 'tmdb', 79.00, 1200),
  ('00000000-0000-0000-0000-0000000b5f41', 'rotten_tomatoes', 93.00, null);

insert into public.media_certifications (media_item_id, region, certification) values
  ('00000000-0000-0000-0000-0000000b5f41', 'US', 'PG-13'),
  ('00000000-0000-0000-0000-0000000b5f41', 'GB', '12A');

insert into public.watch_availability (media_item_id, region, provider_id, offer_type, removed_at) values
  ('00000000-0000-0000-0000-0000000b5f11', 'US', 1995000001, 'flatrate', null),
  ('00000000-0000-0000-0000-0000000b5f11', 'US', 1995000002, 'ads', null),
  ('00000000-0000-0000-0000-0000000b5f11', 'US', 1995000003, 'rent', null),
  ('00000000-0000-0000-0000-0000000b5f41', 'US', 1995000001, 'flatrate', null),
  ('00000000-0000-0000-0000-0000000b5f41', 'US', 1995000001, 'rent', null),
  ('00000000-0000-0000-0000-0000000b5f41', 'US', 1995000002, 'rent', null),
  ('00000000-0000-0000-0000-0000000b5f41', 'US', 1995000003, 'flatrate', '2026-09-01'),
  ('00000000-0000-0000-0000-0000000b5f41', 'GB', 1995000001, 'buy', null);

insert into public.ranking_entries (user_id, medium, tier, media_item_id, position) values
  ('00000000-0000-0000-0000-0000000b50aa', 'movie', 'loved', '00000000-0000-0000-0000-0000000b5f01', 0),
  ('00000000-0000-0000-0000-0000000b50aa', 'movie', 'loved', '00000000-0000-0000-0000-0000000b5f02', 1),
  ('00000000-0000-0000-0000-0000000b50aa', 'movie', 'liked', '00000000-0000-0000-0000-0000000b5f03', 0),
  ('00000000-0000-0000-0000-0000000b50aa', 'movie', 'fine', '00000000-0000-0000-0000-0000000b5f04', 0),
  ('00000000-0000-0000-0000-0000000b50aa', 'movie', 'disliked', '00000000-0000-0000-0000-0000000b5f05', 0),
  ('00000000-0000-0000-0000-0000000b50aa', 'movie', 'disliked', '00000000-0000-0000-0000-0000000b5f06', 1);

insert into public.user_entries (user_id, media_item_id, status, added_at) values
  ('00000000-0000-0000-0000-0000000b50aa', '00000000-0000-0000-0000-0000000b5f01', 'played', '2026-01-01'),
  ('00000000-0000-0000-0000-0000000b50aa', '00000000-0000-0000-0000-0000000b5f02', 'played', '2026-01-01'),
  ('00000000-0000-0000-0000-0000000b50aa', '00000000-0000-0000-0000-0000000b5f03', 'played', '2026-01-01'),
  ('00000000-0000-0000-0000-0000000b50aa', '00000000-0000-0000-0000-0000000b5f04', 'played', '2026-01-01'),
  ('00000000-0000-0000-0000-0000000b50aa', '00000000-0000-0000-0000-0000000b5f05', 'played', '2026-01-01'),
  ('00000000-0000-0000-0000-0000000b50aa', '00000000-0000-0000-0000-0000000b5f06', 'played', '2026-01-01'),
  ('00000000-0000-0000-0000-0000000b50aa', '00000000-0000-0000-0000-0000000b5f21', 'backlog', '2026-10-02'),
  ('00000000-0000-0000-0000-0000000b50aa', '00000000-0000-0000-0000-0000000b5f22', 'backlog', '2026-10-01'),
  ('00000000-0000-0000-0000-0000000b50aa', '00000000-0000-0000-0000-0000000b5f23', 'played', '2026-10-01'),
  ('00000000-0000-0000-0000-0000000b50bb', '00000000-0000-0000-0000-0000000b5f53', 'dropped', '2026-10-01'),
  ('00000000-0000-0000-0000-0000000b50cc', '00000000-0000-0000-0000-0000000b5f54', 'backlog', '2026-10-01');

update public.profiles set watch_provider_ids = array[1995000001] where id = '00000000-0000-0000-0000-0000000b50aa';

-- The nightly refresh, which the pools walk.
select public.refresh_item_priors('movie');

-- ==============================================================================
-- 2. The diary's source, as A
-- ==============================================================================

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000b50aa","role":"authenticated"}';

-- 12
select throws_ok(
  $$ insert into public.watch_log (media_item_id, watched_on) values ('00000000-0000-0000-0000-0000000b5f31', null) $$,
  '23514',
  null,
  'a log row needs a day'
);

-- 13
select throws_ok(
  $$ insert into public.watch_log (media_item_id, watched_on, source) values ('00000000-0000-0000-0000-0000000b5f31', '2026-10-01', 'guess') $$,
  '23514',
  null,
  'a source outside log, bulk and import is refused'
);

insert into public.watch_log (media_item_id, source) values ('00000000-0000-0000-0000-0000000b5f31', 'bulk');

-- 14
select results_eq(
  $$ select e.status::text, e.finished_at, w.source, w.watched_on
       from public.user_entries e
       join public.watch_log w on w.media_item_id = e.media_item_id
      where e.media_item_id = '00000000-0000-0000-0000-0000000b5f31' $$,
  $$ values ('played'::text, null::date, 'bulk'::text, null::date) $$,
  'a bulk row with no day makes the film played and leaves finished_at empty'
);

insert into public.watch_log (media_item_id, watched_on, source) values ('00000000-0000-0000-0000-0000000b5f31', '2026-09-02', 'import');

-- 15
select is(
  (select finished_at from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b5f31'),
  '2026-09-02'::date,
  'a dated import row is mirrored into finished_at'
);

-- 16
select throws_ok(
  $$ insert into public.watch_log (media_item_id, source) values ('00000000-0000-0000-0000-0000000b5f31', 'bulk') $$,
  '23505',
  null,
  'a film has one bulk row: ticking Seen twice is one fact'
);

insert into public.watch_log (media_item_id, watched_on) values ('00000000-0000-0000-0000-0000000b5f31', '2026-10-05');

-- 17
select results_eq(
  $$ select source, watched_on from public.watch_log
      where media_item_id = '00000000-0000-0000-0000-0000000b5f31'
      order by watched_on desc nulls last, created_at, source $$,
  $$ values ('log'::text, '2026-10-05'::date), ('import'::text, '2026-09-02'::date),
            ('bulk'::text, null::date) $$,
  'a row with no source is a log row; the three sources sit side by side, undated last'
);

-- 18
select is(
  (select finished_at from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b5f31'),
  '2026-10-05'::date,
  'the latest dated watch is finished_at'
);

delete from public.watch_log where media_item_id = '00000000-0000-0000-0000-0000000b5f31' and watched_on is not null;

-- 19
select is(
  (select finished_at from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b5f31'),
  null::date,
  'when the dated rows go and only an undated one is left, the day they gave finished_at goes with them'
);

insert into public.watch_log (media_item_id, watched_on) values ('00000000-0000-0000-0000-0000000b5f32', '2026-10-01');
insert into public.watch_log (media_item_id, source) values ('00000000-0000-0000-0000-0000000b5f32', 'bulk');
delete from public.watch_log where media_item_id = '00000000-0000-0000-0000-0000000b5f32' and source = 'bulk';

-- 20
select is(
  (select finished_at from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b5f32'),
  '2026-10-01'::date,
  'deleting an undated bulk row never changes finished_at'
);

-- 21
select throws_ok(
  $$ update public.watch_log set source = 'bulk' $$,
  '42501',
  null,
  'the source cannot be changed after the fact'
);

-- ==============================================================================
-- 3. Search by person
-- ==============================================================================

-- 22
select is(
  (select people_text from public.movie_details where media_item_id = '00000000-0000-0000-0000-0000000b5f31'),
  'Qorvath Villeneux; Tymora Chalamex; Ezrin Spaitz',
  'people_text is the directors, the cast in billing order, then the writers'
);

-- 23
select results_eq(
  $$ select title, person_match from public.search_games('qorvath villeneux', 20, 'movie')
      where title like 'Msx%' order by title $$,
  $$ values ('Msx Arrivalia'::text, 'Qorvath Villeneux'::text),
            ('Msx Blackroom', 'Qorvath Villeneux'),
            ('Msx Dunewind', 'Qorvath Villeneux'),
            ('Msx Page Film', 'Qorvath Villeneux') $$,
  'a director''s full name finds the films they directed or acted in, and says who'
);

-- 24
select set_eq(
  $$ select title from public.search_games('villeneux', 20, 'movie') where person_match = 'Qorvath Villeneux' $$,
  $$ values ('Msx Arrivalia'::text), ('Msx Blackroom'), ('Msx Dunewind'), ('Msx Page Film') $$,
  'the surname alone finds them too'
);

-- 25
select is(
  (select person_match from public.search_games('tymora', 20, 'movie') where title = 'Msx Arrivalia'),
  'Tymora Chalamex',
  'an actor''s name finds the film and names the actor'
);

-- 26
select set_eq(
  $$ select title from public.search_games('ezrin spaitz', 20, 'movie') where person_match = 'Ezrin Spaitz' $$,
  $$ values ('Msx Arrivalia'::text), ('Msx Writerly'), ('Msx Page Film') $$,
  'a writer''s name finds the films they wrote'
);

-- 27
select is(
  (select person_match from public.search_games('ulmo kestran', 20, 'movie') where title = 'Msx Twofold'),
  'Ulmo Kestrane',
  'when a director and a cast member both match, the director is named'
);

-- 28
select results_eq(
  $$ select title, person_match from public.search_games('qorvath', 3, 'movie') limit 1 $$,
  $$ values ('Qorvath Days'::text, null::text) $$,
  'a title starting with the term ranks above a person whose name does, at equal closeness'
);

-- 29
select is(
  (select person_match from public.search_games('msx arrivalia', 5, 'movie') where title = 'Msx Arrivalia'),
  null,
  'a film found by its title has no person_match: the row shows its genre'
);

-- 30
select results_eq(
  $$ select title, person_match from public.search_games('msx qorvath game', 5, 'game') where title = 'Msx Qorvath Game' $$,
  $$ values ('Msx Qorvath Game'::text, null::text) $$,
  'the games path never names a person'
);

-- 31
select is(
  (select count(*)::integer from public.search_games('qorvath villeneux', 20, 'game') where title like 'Msx %' and title <> 'Msx Qorvath Game'),
  0,
  'a person search in games finds no films'
);

-- ==============================================================================
-- 4. movie_page
-- ==============================================================================

-- 32
select results_eq(
  $$ select title, year, runtime_minutes, genres, directors, writers, certification, awards, placement
       from public.movie_page('00000000-0000-0000-0000-0000000b5f41', 'US', '2026-10-13') $$,
  $$ values ('Msx Page Film'::text, 2021::smallint, 155, '{"Msx Scifi","Msx Adventure"}'::text[],
             '{"Qorvath Villeneux"}'::text[], '{"Ezrin Spaitz","Erik Rothmar"}'::text[],
             'PG-13'::text, null::text, 'watchlist'::text) $$,
  'the film, its details, the US certification, no awards yet, and where it sits'
);

-- 33
select is(
  (select scores from public.movie_page('00000000-0000-0000-0000-0000000b5f41', 'US', '2026-10-13'))
    - 'tmdb' - 'rotten_tomatoes',
  '{}'::jsonb,
  'scores carries every source the film has, and nothing else'
);

-- 34
select results_eq(
  $$ select (scores -> 'tmdb' ->> 'score')::numeric, (scores -> 'tmdb' ->> 'score_count')::integer,
            (scores -> 'rotten_tomatoes' ->> 'score')::numeric
       from public.movie_page('00000000-0000-0000-0000-0000000b5f41', 'US', '2026-10-13') $$,
  $$ values (79.00::numeric, 1200, 93.00::numeric) $$,
  'TMDB''s average and count, and Rotten Tomatoes under its own source'
);

-- 35
select is(
  (select availability from public.movie_page('00000000-0000-0000-0000-0000000b5f41', 'US', '2026-10-13')),
  '[{"provider_id": 1995000002, "name": "Screens P2", "logo_image_id": "/p2.png", "offer_type": "rent", "mine": false},
    {"provider_id": 1995000001, "name": "Screens P1", "logo_image_id": "/p1.png", "offer_type": "flatrate", "mine": true},
    {"provider_id": 1995000001, "name": "Screens P1", "logo_image_id": "/p1.png", "offer_type": "rent", "mine": false}]'::jsonb,
  'current US offers in display order then offer type; mine only for a subscription on the caller''s service; the removed and the GB offer left out'
);

-- 36
select results_eq(
  $$ select certification, jsonb_array_length(availability)
       from public.movie_page('00000000-0000-0000-0000-0000000b5f41', 'gb', '2026-10-13') $$,
  $$ values ('12A'::text, 1) $$,
  'the region decides the certification and the offers, and is forgiven its case'
);

-- 36b
update public.profiles set watch_region = 'GB' where id = '00000000-0000-0000-0000-0000000b50aa';
select results_eq(
  $$ select certification, jsonb_array_length(availability)
       from public.movie_page('00000000-0000-0000-0000-0000000b5f41', null, '2026-10-13') $$,
  $$ values ('12A'::text, 1) $$,
  'with no region asked for, the page reads the caller''s own watch_region'
);
update public.profiles set watch_region = 'US' where id = '00000000-0000-0000-0000-0000000b50aa';

-- 37
select is(
  (select count(*)::integer from public.movie_page('00000000-0000-0000-0000-0000000b5e01', 'US', '2026-10-13')),
  0,
  'a game has no movie page'
);

-- 37b
select results_eq(
  $$ select media_item_id, genres, platforms from public.tier_list('movie', 'loved') $$,
  $$ values ('00000000-0000-0000-0000-0000000b5f01'::uuid, '{"Msx Horror","Msx Thriller"}'::text[], '{}'::text[]),
            ('00000000-0000-0000-0000-0000000b5f02'::uuid, '{"Msx Horror"}'::text[], '{}'::text[]) $$,
  'tier_list reads a ranked film''s genres from movie_details, so the film Ranking and the genre pivot have them'
);

-- ==============================================================================
-- 5. movie_home_rows
-- ==============================================================================

-- 38
select results_eq(
  $$ select row_index, kind, title, variable_part, about_media_item_id
       from public.movie_home_rows('US', '2026-10-13') order by row_index $$,
  $$ values
       (1, 'watchlist'::text, 'You wanted to watch these'::text, null::text, null::uuid),
       (2, 'genre', 'Msx Horror', 'Msx Horror', null),
       (3, 'because', 'Because you loved Msx Ranked One', 'Msx Ranked One', '00000000-0000-0000-0000-0000000b5f01'::uuid),
       (4, 'because', 'Because you loved Msx Ranked Two', 'Msx Ranked Two', '00000000-0000-0000-0000-0000000b5f02'::uuid) $$,
  'A''s Home: the watchlist, the one genre A ranks high, and a row for each Loved film, in rank order'
);

-- 39
select is(
  (select array(select c ->> 'media_item_id' from jsonb_array_elements(candidates) c)
     from public.movie_home_rows('US', '2026-10-13') where kind = 'watchlist'),
  array['00000000-0000-0000-0000-0000000b5f21', '00000000-0000-0000-0000-0000000b5f22'],
  'the watchlist row is movie_watchlist''s films, newest added first'
);

-- 40
select is(
  (select count(*)::integer
     from public.movie_home_rows('US', '2026-10-13') r
     cross join jsonb_array_elements(r.candidates) c
    where r.kind <> 'watchlist'
      and (c ->> 'media_item_id')::uuid in (
        select media_item_id from public.user_entries
        union select media_item_id from public.ranking_entries)),
  0,
  'no film A tracks or ranked is offered in a genre or a because row'
);

-- 41
select ok(
  (select bool_and(c ->> 'title' like 'Msx Horror%')
     from public.movie_home_rows('US', '2026-10-13') r
     cross join jsonb_array_elements(r.candidates) c
    where r.kind = 'genre'),
  'the genre row offers films of the genre'
);

-- 42
select ok(
  (select bool_or(c ->> 'media_item_id' = '00000000-0000-0000-0000-0000000b5f18')
     from public.movie_home_rows('US', '2026-10-13') r
     cross join jsonb_array_elements(r.candidates) c
    where r.about_media_item_id = '00000000-0000-0000-0000-0000000b5f01'),
  'a loved film''s row includes its director''s other film, though it shares no genre'
);

-- 43
select is(
  (select c - 'external_ids'
     from public.movie_home_rows('US', '2026-10-13') r
     cross join jsonb_array_elements(r.candidates) c
    where r.kind = 'genre' and c ->> 'media_item_id' = '00000000-0000-0000-0000-0000000b5f11'),
  '{"media_item_id": "00000000-0000-0000-0000-0000000b5f11", "title": "Msx Horror One", "year": 2011,
    "cover_image_id": "/h1.jpg", "runtime_minutes": 91, "genres": ["Msx Horror", "Msx Thriller"],
    "streams_on": [1995000002, 1995000001], "on_my_services": [1995000001]}'::jsonb,
  'a candidate carries its card''s facts, where it streams in display order, and which of those are A''s'
);

-- 44
select ok(
  (select bool_and(jsonb_array_length(candidates) between 1 and 12) and count(*) <= 7
     from public.movie_home_rows('US', '2026-10-13')),
  'every row has one to twelve candidates, and there are seven rows at most'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000b50bb","role":"authenticated"}';

-- 45
select results_eq(
  $$ select row_index, kind, title, variable_part from public.movie_home_rows('US', '2026-10-13') $$,
  $$ values (1, 'popular'::text, 'Popular'::text, null::text) $$,
  'B, with no ranking and no watchlist, gets one popular row so Home is never empty'
);

-- 46
select ok(
  (select jsonb_array_length(candidates) > 0
          and not candidates @> '[{"media_item_id": "00000000-0000-0000-0000-0000000b5f53"}]'
     from public.movie_home_rows('US', '2026-10-13')),
  'the popular row leaves out the film B dropped, the most voted in the fixture'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000b50cc","role":"authenticated"}';

-- 47
select results_eq(
  $$ select kind, candidates -> 0 ->> 'media_item_id' from public.movie_home_rows('US', '2026-10-13') $$,
  $$ values ('watchlist'::text, '00000000-0000-0000-0000-0000000b5f54'::text) $$,
  'C, with a watchlist and no ranking, gets the watchlist alone: no popular row once something has a reason'
);

-- ==============================================================================
-- 6. deck_candidates for films, as A
-- ==============================================================================

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000b50aa","role":"authenticated"}';

-- 48
select is(
  (select count(*)::integer
     from public.deck_candidates(null, 50, 0, 'movie') d
     join public.media_items m on m.id = d.media_item_id
    where m.medium <> 'movie'),
  0,
  'the film deck has films only'
);

-- 49
select is(
  (select count(*)::integer
     from public.deck_candidates(null, 50, 0, 'movie') d
    where d.media_item_id in (
      '00000000-0000-0000-0000-0000000b5f51', '00000000-0000-0000-0000-0000000b5f52',
      '00000000-0000-0000-0000-0000000b5f21', '00000000-0000-0000-0000-0000000b5f23',
      '00000000-0000-0000-0000-0000000b5f01')),
  0,
  'no unreleased film, no film without a poster, nothing A tracks or ranked'
);

-- 50
select is(
  (select (array_agg(d.media_item_id order by d.popularity_rank))[1:2]
     from public.deck_candidates(array['PS5'], 50, 0, 'movie') d
    where d.media_item_id::text like '00000000-0000-0000-0000-0000000b5%'),
  array['00000000-0000-0000-0000-0000000b5f53', '00000000-0000-0000-0000-0000000b5f17']::uuid[],
  'most voted first among the films this suite wrote, whatever else the catalog holds, and p_platforms is ignored for films'
);

-- 51
select results_eq(
  $$ select popularity_rank, platforms from public.deck_candidates(null, 2, 1, 'movie') $$,
  $$ values (2, '{}'::text[]), (3, '{}'::text[]) $$,
  'ranks continue across pages, and a film has no platforms'
);

-- 52
select is(
  (select count(*)::integer
     from public.deck_candidates(null, 50, 0) d
     join public.media_items m on m.id = d.media_item_id
    where m.medium <> 'game'),
  0,
  'the default deck is still games'
);

-- 53
select ok(
  (select bool_or(d.boost <> 0) from public.deck_candidates(null, 50, 0, 'movie') d
    where d.media_item_id::text like '00000000-0000-0000-0000-0000000b5f1%'),
  'A''s film profile weighs the film deck, as the games profile weighs the games deck'
);

-- 54
select throws_ok(
  $$ select * from public.deck_candidates(null, 10, -1, 'movie') $$,
  '22023',
  null,
  'a negative offset is still 22023'
);

-- ==============================================================================
-- 5b. Anonymous
-- ==============================================================================

reset role;

-- 21b
select throws_ok(
  $$ update public.watch_log set source = 'import' where source = 'bulk' $$,
  '42501',
  null,
  'even the owner cannot change a row''s source: the trigger keeps how it was written'
);

set local role anon;

-- 55
select throws_ok(
  $$ select * from public.movie_page('00000000-0000-0000-0000-0000000b5f41') $$,
  '42501',
  null,
  'anon cannot read a movie page'
);

-- 56
select throws_ok(
  $$ select * from public.movie_home_rows() $$,
  '42501',
  null,
  'anon cannot read Home''s rows'
);

reset role;

-- ==============================================================================
-- 7. Cost: 25,000 films
-- ==============================================================================
--
-- A synthetic catalog the size of the hosted mirror's films, with titles and
-- names built from syllables so they spread over trigrams as real ones do, ten
-- providers, a third of the films streaming; and a user with sixty ranked
-- films (fifteen Loved) and twenty on the watchlist, so every row kind is
-- built. Priors refreshed and statistics taken, as the nightly job leaves the
-- hosted project. movie_home_rows is security definer, so timing it as the
-- owner with the user's claims set is the path a signed-in call takes.

create function pg_temp.word(n bigint) returns text language sql immutable as $$
  select initcap(
    substr('bcdfghjklmnprstvz', 1 + (n % 17)::int, 1) || substr('aeiou', 1 + ((n / 17) % 5)::int, 1) ||
    substr('bcdfghjklmnprstvz', 1 + ((n / 85) % 17)::int, 1) || substr('aeiou', 1 + ((n / 1445) % 5)::int, 1) ||
    substr('lnrst', 1 + ((n / 7225) % 5)::int, 1)
  )
$$;
create function pg_temp.person(n bigint) returns text language sql immutable as $$
  select pg_temp.word((n * 7919) % 36125) || ' ' || pg_temp.word((n * 104729 + 17) % 36125)
$$;
create function pg_temp.film(i integer) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-00c5-' || lpad(to_hex(i), 12, '0'))::uuid
$$;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000b50dd', 'screens-cost@example.com');

insert into public.watch_providers (provider_id, name, display_priorities)
select 1995000100 + p, 'Screens Cost P' || p, jsonb_build_object('US', 100 + p) from generate_series(1, 10) p;

insert into public.media_items (id, medium, title, year, release_date, cover_image_id, external_ids, metadata)
select
  pg_temp.film(i),
  'movie',
  case when i % 4 = 0 then 'The ' else '' end || pg_temp.word(i * 31) || case when i % 2 = 0 then ' ' || pg_temp.word(i * 7 + 3) else '' end,
  (1950 + i % 76)::smallint,
  make_date(1950 + i % 76, 1 + i % 12, 1 + i % 28),
  '/cost' || i || '.jpg',
  jsonb_build_object('tmdb', -950000 - i),
  jsonb_build_object('vote_count', (i * 7919) % 30000)
from generate_series(1, 25000) i;

insert into public.movie_details (media_item_id, tmdb_id, runtime_minutes, genres, directors, writers, top_cast)
select
  pg_temp.film(i),
  -950000 - i,
  80 + i % 100,
  array(select distinct 'Cost G' || g from unnest(array[i % 19, (i / 19) % 19, (i / 361) % 19]) with ordinality as x(g, k) where k <= 1 + i % 3),
  array[pg_temp.person(i % 9000)],
  array[pg_temp.person(20000 + i % 12000), pg_temp.person(20000 + (i * 13) % 12000)],
  (select jsonb_agg(jsonb_build_object('tmdb_person_id', (i * 31 + k) % 30000, 'name', pg_temp.person(50000 + (i * 31 + k) % 30000), 'character', 'Role ' || k, 'profile_path', null) order by k)
     from generate_series(1, 10) k)
from generate_series(1, 25000) i;

insert into public.external_scores (media_item_id, source, score, score_count)
select pg_temp.film(i), 'tmdb', 40 + (i * 37) % 50, (i * 7919) % 30000
from generate_series(1, 25000) i;

insert into public.watch_availability (media_item_id, region, provider_id, offer_type)
select pg_temp.film(i), 'US', 1995000100 + 1 + (i + k) % 10, case when k = 0 then 'flatrate' else 'rent' end
from generate_series(1, 25000) i cross join generate_series(0, 1) k
where i % 3 = 0;

insert into public.ranking_entries (user_id, medium, tier, media_item_id, position)
select '00000000-0000-0000-0000-0000000b50dd', 'movie',
  (case when j <= 15 then 'loved' when j <= 35 then 'liked' when j <= 50 then 'fine' else 'disliked' end)::public.tier,
  pg_temp.film(j * 37),
  case when j <= 15 then j - 1 when j <= 35 then j - 16 when j <= 50 then j - 36 else j - 51 end
from generate_series(1, 60) j;

insert into public.user_entries (user_id, media_item_id, status, added_at)
select '00000000-0000-0000-0000-0000000b50dd'::uuid, pg_temp.film(j * 37), 'played'::public.entry_status, now()
from generate_series(1, 60) j
union all
select '00000000-0000-0000-0000-0000000b50dd'::uuid, pg_temp.film(j * 41 + 5000), 'backlog'::public.entry_status, now() - j * interval '1 day'
from generate_series(1, 20) j;

update public.profiles set watch_provider_ids = array[1995000101, 1995000102] where id = '00000000-0000-0000-0000-0000000b50dd';

select public.refresh_item_priors('movie');
analyze public.media_items;
analyze public.movie_details;
analyze public.external_scores;
analyze public.watch_availability;
analyze public.item_prior;
analyze public.user_entries;
analyze public.ranking_entries;

-- JIT compiles a plan once its estimated cost passes a threshold; on a CI
-- runner that compile is most of a first call's time and none of the work.
set local jit = off;

create function pg_temp.best_of_three_ms() returns numeric language plpgsql as $$
declare
  v_start timestamptz;
  v_best numeric;
  v_ms numeric;
begin
  for i in 1..3 loop
    v_start := clock_timestamp();
    perform * from public.movie_home_rows('US', '2026-10-13');
    v_ms := extract(epoch from clock_timestamp() - v_start) * 1000;
    v_best := least(coalesce(v_best, v_ms), v_ms);
  end loop;
  return round(v_best, 1);
end;
$$;

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000b50dd","role":"authenticated"}';

-- 57
select results_eq(
  $$ select kind, count(*)::integer from public.movie_home_rows('US', '2026-10-13') group by kind order by kind $$,
  $$ values ('because'::text, 3), ('genre', 3), ('watchlist', 1) $$,
  'on 25,000 films the cost user gets all seven rows: the watchlist, three genres, three loved films'
);

-- 58
select ok(
  (select bool_and(jsonb_array_length(candidates) = 12) from public.movie_home_rows('US', '2026-10-13')),
  'and every row is full'
);

select diag('movie_home_rows on 25,000 films, best of three: ' || pg_temp.best_of_three_ms() || ' ms');

-- 59
-- The ceiling is 300 ms, the build plan's, on a developer's machine. CI's
-- runners are slower and shared, so the db job sets verso.perf_ceiling_ms on
-- the database (.github/workflows/ci.yml); the number measured is in the diag
-- above either way.
select cmp_ok(
  pg_temp.best_of_three_ms(),
  '<',
  coalesce(nullif(current_setting('verso.perf_ceiling_ms', true), '')::numeric, 300),
  'movie_home_rows answers inside the ceiling (300 ms, or verso.perf_ceiling_ms) on a 25,000-film catalog'
);

-- 60
select ok(
  exists (select 1 from public.search_games(pg_temp.person(77), 5, 'movie') where person_match = pg_temp.person(77)),
  'on 25,000 films a director''s name still finds their films and names them'
);

create function pg_temp.plan_of(p_query text) returns text language plpgsql as $$
declare
  v_line text;
  v_plan text := '';
begin
  for v_line in execute 'explain ' || p_query loop
    v_plan := v_plan || v_line || E'\n';
  end loop;
  return v_plan;
end;
$$;

create function pg_temp.search_ms(p_term text) returns numeric language plpgsql as $$
declare
  v_start timestamptz := clock_timestamp();
begin
  perform * from public.search_games(p_term, 20, 'movie');
  return round((extract(epoch from clock_timestamp() - v_start) * 1000)::numeric, 1);
end;
$$;

-- 61
-- search_games runs with enable_seqscan off; the person arm's prefix pattern
-- is planned here the same way.
set local enable_seqscan = off;
select ok(
  pg_temp.plan_of($q$ select md.media_item_id from public.movie_details md where md.people_text ilike '% tom%' $q$)
    ~ 'movie_details_people_trgm',
  'a person prefix is answered from the people_text trigram index'
);
set local enable_seqscan = on;

select diag('search_games(''tom'', 20, ''movie'') on 25,000 films: ' || pg_temp.search_ms('tom') || ' ms');

-- ==============================================================================
-- Done
-- ==============================================================================

select * from finish();
rollback;
