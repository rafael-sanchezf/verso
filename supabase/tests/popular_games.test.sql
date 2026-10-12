-- pgTAP tests for supabase/migrations/20260916160000_popular_games.sql and its
-- follow-up 20260916173000_popular_games_numeric.sql, which is why the sort
-- key is asserted to be numeric.
-- Run with: supabase test db
--
-- This is the first function in the schema that a signed-out visitor may call,
-- and the first `security definer` function anyone may call at all (the other,
-- `handle_new_user`, fires from a trigger), so half of this file is about what
-- it did *not* open. The claim being tested is narrow and needs both halves:
-- anon can call popular_games, and anon still reads nothing from media_items,
-- game_details, or anything else.
--
-- The fixture is 51 games so the cap and the null ordering can both be shown:
-- three named ones with high rating counts, 47 fillers, and one game whose
-- rating count is JSON null. Fifty rows come back, and the one left out is the
-- null. Every count is above nine billion, far past anything IGDB has ever
-- recorded, so the suite holds on a local database that also carries the
-- real mirrored catalog or another suite's leftovers; and one count is
-- fractional, because IGDB's field is a double and the cast has to survive it.

begin;
select plan(26);

-- Fixtures --------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com');

insert into public.media_items (id, medium, title, year, cover_image_id, external_ids, metadata) values
  ('00000000-0000-0000-0000-0000000000f1', 'game', 'Hades', 2020, 'co1r7f',
   '{"igdb": 113112, "steam": 1145360}'::jsonb, '{"total_rating_count": 9000009000}'::jsonb),
  -- No game_details row: the platforms column has to come back as an empty
  -- array rather than null, the way search_games handles the same join.
  ('00000000-0000-0000-0000-0000000000f2', 'game', 'No Details', 2021, null,
   '{"igdb": 2}'::jsonb, '{"total_rating_count": 9000008000.5}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f3', 'game', 'Celeste', 2018, 'co2dvv',
   '{"igdb": 26226}'::jsonb, '{"total_rating_count": 9000007000}'::jsonb),
  -- Nobody has rated it. The mirror writes JSON null for this.
  ('00000000-0000-0000-0000-0000000000f4', 'game', 'Unrated', 2024, null,
   '{"igdb": 4}'::jsonb, '{"total_rating_count": null}'::jsonb),
  -- A different medium with a count that would otherwise put it first.
  ('00000000-0000-0000-0000-0000000000f5', 'movie', 'Hades', 1999, null,
   '{"tmdb": 5}'::jsonb, '{"total_rating_count": 9000099999}'::jsonb);

insert into public.media_items (medium, title, metadata)
select 'game', 'Filler ' || i, jsonb_build_object('total_rating_count', 9000000000 + i)
from generate_series(1, 47) as i;

insert into public.game_details (media_item_id, igdb_id, genres, platforms) values
  ('00000000-0000-0000-0000-0000000000f1', 113112, '{roguelike}', '{PC,Switch}'),
  ('00000000-0000-0000-0000-0000000000f3', 26226, '{platformer}', '{PC}');

-- Shape and safety ------------------------------------------------------------

-- 1
select has_function(
  'public', 'popular_games', array['integer', 'public.medium'],
  'popular_games(integer, medium) exists: 20260916230000_per_medium_backlog_and_rpcs.sql dropped the one-argument signature and gave it a medium with a default'
);

-- 2
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.popular_games(integer,public.medium)'::regprocedure),
  true,
  'popular_games is security definer: it is the one read that does not belong to a user'
);

-- 3
select ok(
  (select p.proconfig from pg_proc p where p.oid = 'public.popular_games(integer,public.medium)'::regprocedure)
    @> array['search_path=public, extensions'],
  'its search_path is pinned, which a definer function cannot do without'
);

-- 4
select ok(
  has_function_privilege('anon', 'public.popular_games(integer,public.medium)', 'execute'),
  'anon may call it: that is the point'
);

-- 5
select ok(
  has_function_privilege('authenticated', 'public.popular_games(integer,public.medium)', 'execute'),
  'and so may a signed-in user, who reads the same catalog'
);

-- 6
select ok(
  to_regclass('public.media_items_game_rating_count') is not null,
  'the index that makes the ordering cheap exists'
);

-- 7
select matches(
  pg_get_indexdef('public.media_items_game_rating_count'::regclass),
  'DESC NULLS LAST',
  'it is ordered the way the function reads it, so the limit can stop early'
);

-- 8
select matches(
  pg_get_indexdef('public.media_items_game_rating_count'::regclass),
  'WHERE \(medium = ''game''',
  'and it is partial on the games, which is the only medium V0 has'
);

-- 9
select matches(
  pg_get_indexdef('public.media_items_game_rating_count'::regclass),
  'numeric',
  'the sort key is cast to numeric, because IGDB counts can be fractional and an int cast would fail the write'
);

-- 10
select ok(
  not exists (
    select 1 from pg_proc p, unnest(p.proacl) as acl
    where p.oid = 'public.popular_games(integer,public.medium)'::regprocedure
      and acl::text like '=X/%'
  ),
  'PUBLIC has no execute entry: the revoke closed the default grant every new function gets'
);

-- Signed out ------------------------------------------------------------------
-- The half that matters: what anon can reach, and what it still cannot.

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

-- 11
select is(
  (select count(*) from public.media_items),
  0::bigint,
  'anon still reads nothing from media_items directly'
);

-- 12
select is(
  (select count(*) from public.game_details),
  0::bigint,
  'nor from game_details'
);

-- 13
select is(
  (select count(*) from public.external_scores),
  0::bigint,
  'nor from external_scores, which the function does not touch either'
);

-- 14
select is(
  (select count(*) from public.popular_games(3)),
  3::bigint,
  'but anon can call popular_games and get rows'
);

-- 15
select results_eq(
  $$ select p.title from public.popular_games(3) p $$,
  $$ values ('Hades'::text), ('No Details'), ('Celeste') $$,
  'most-rated first'
);

-- 16
select results_eq(
  $$ select p.id, p.title, p.year, p.cover_image_id, p.external_ids, p.platforms
       from public.popular_games(1) p $$,
  $$ values ('00000000-0000-0000-0000-0000000000f1'::uuid, 'Hades'::text, 2020::smallint,
             'co1r7f'::text, '{"igdb": 113112, "steam": 1145360}'::jsonb,
             array['PC','Switch']) $$,
  'the row carries the six columns a Search row and a cover need'
);

-- 17
select is(
  (select p.platforms from public.popular_games(3) p where p.title = 'No Details'),
  '{}'::text[],
  'a game with no game_details row comes back with an empty platform list, not null'
);

-- 18
select is(
  (select count(*) from public.popular_games(20) p where p.title = 'Hades' and p.year = 1999),
  0::bigint,
  'the movie with the same title and a higher count is not a popular game'
);

-- 19
select is(
  (select count(*) from public.popular_games(1000)),
  50::bigint,
  'the limit is capped at fifty however much is asked for'
);

-- 20
select is(
  (select count(*) from public.popular_games(1000) p where p.title = 'Unrated'),
  0::bigint,
  'the one game of the fifty-one left out is the unrated one: nulls sort last'
);

-- 21
select is(
  (select count(*) from public.popular_games(1000) p where p.title = 'Filler 1'),
  1::bigint,
  'while the least-rated game that anyone has rated is still in'
);

-- 22
select is(
  (select count(*) from public.popular_games(0)),
  1::bigint,
  'a limit below one is clamped to one row rather than returning nothing'
);

-- 23
select is(
  (select count(*) from public.popular_games(-5)),
  1::bigint,
  'including a negative one'
);

-- 24
select is(
  (select count(*) from public.popular_games(null)),
  20::bigint,
  'and a null limit falls back to the default of twenty'
);

-- Signed in -------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- 25
select results_eq(
  $$ select p.title from public.popular_games(2) p $$,
  $$ values ('Hades'::text), ('No Details') $$,
  'a signed-in user gets the same catalog list'
);

-- 26
select is(
  (select count(*) from public.media_items
    where id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2',
                 '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f4',
                 '00000000-0000-0000-0000-0000000000f5')
       or title like 'Filler %'),
  52::bigint,
  'and can still read the catalog directly -- all 52 fixture rows, movie included -- which anon cannot'
);

select * from finish();
rollback;
