-- pgTAP tests for
-- supabase/migrations/20261008100000_search_games_external_ids.sql.
-- Run with: supabase test db
--
-- The migration drops and recreates search_games to widen its return type, so
-- the new column is half of what needs checking. The other half is what a drop
-- takes with it: a function that came back `security definer` with execute
-- granted to anon would pass "does it return external_ids" and open the whole
-- catalog search to signed-out callers. So the definer flag, the search_path
-- pin and the grants are asserted again here, as tier_list_external_ids does
-- for tier_list.
--
-- The case that matters most is the bug itself: a game with no IGDB cover and
-- a Steam app id. Before this migration it came back with nothing to draw a
-- cover from; now it comes back with the Steam id.
--
-- When PR #62's search_aliases migration is present it has already added the
-- column and this migration skips itself, so every assertion here is written
-- to hold for either body: the column, the safety, and the ordering of an
-- exact title over a prefix match, which both bodies rank the same way.
--
-- Calls go through `set local role authenticated` plus a forged
-- request.jwt.claims, as a supabase-js rpc() would. Titles and ids are this
-- file's own, so a database that also carries the real mirrored catalog, or
-- another test file's fixtures, answers the same.

begin;
select plan(17);

-- Fixtures ---------------------------------------------------------------------
-- Three shapes of external_ids, because the column is jsonb that nothing
-- enforces: a game on Steam with no IGDB cover (the bug), a game IGDB has a
-- cover for and Steam does not sell, and a game with no ids at all. One film
-- shares the first game's title, to show the medium filter is unchanged.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000005a', 'search-ids@example.com');

insert into public.media_items (id, medium, title, year, cover_image_id, external_ids) values
  ('00000000-0000-0000-0000-0000000005e1', 'game', 'Quillfeather Lanterns', 2024, null,
   '{"igdb": 990000101, "steam": 2215430}'::jsonb),
  ('00000000-0000-0000-0000-0000000005e2', 'game', 'Quillfeather Lanterns Remastered', 2026, 'co9qfl',
   '{"igdb": 990000102}'::jsonb),
  ('00000000-0000-0000-0000-0000000005e3', 'game', 'Quillfeather Homebrew', 2019, null, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000005e4', 'movie', 'Quillfeather Lanterns', 2011, '/quill.jpg',
   '{"tmdb": 990000104}'::jsonb);

insert into public.game_details (media_item_id, igdb_id, genres, platforms, developer) values
  ('00000000-0000-0000-0000-0000000005e1', 990000101, '{puzzle}', '{PC}', 'Lantern House'),
  ('00000000-0000-0000-0000-0000000005e2', 990000102, '{puzzle,adventure}', '{PC,Switch}', 'Lantern House'),
  ('00000000-0000-0000-0000-0000000005e3', 990000103, '{}', '{}', null);

insert into public.movie_details (media_item_id, tmdb_id, genres, directors) values
  ('00000000-0000-0000-0000-0000000005e4', 990000104, '{Drama}', '{"Nobody At All"}');

-- Shape and safety --------------------------------------------------------------

-- 1
select has_function(
  'public', 'search_games', array['text', 'integer', 'public.medium'],
  'search_games survived the drop and create, with the same three arguments'
);

-- 2
select is(
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'search_games'),
  1::bigint,
  'exactly one function is called search_games, so PostgREST has no overload to resolve between'
);

-- 3
select matches(
  pg_get_function_result('public.search_games(text,integer,public.medium)'::regprocedure),
  'external_ids jsonb',
  'external_ids is declared in the return table, as jsonb'
);

-- 4
select is(
  (select p.prosecdef from pg_proc p
    where p.oid = 'public.search_games(text,integer,public.medium)'::regprocedure),
  false,
  'search_games is still security invoker'
);

-- 5
select ok(
  (select p.proconfig from pg_proc p
    where p.oid = 'public.search_games(text,integer,public.medium)'::regprocedure)
    @> array['search_path=public, extensions'],
  'its search_path is still pinned: the drop took that with the grants, and the create put it back'
);

-- 6
select ok(
  not has_function_privilege('anon', 'public.search_games(text,integer,public.medium)', 'execute'),
  'the drop did not hand anon the execute grant back'
);

-- 7
select ok(
  has_function_privilege('authenticated', 'public.search_games(text,integer,public.medium)', 'execute'),
  'signed-in users can still call it'
);

-- 8
select ok(
  has_function_privilege('service_role', 'public.search_games(text,integer,public.medium)', 'execute'),
  'and so can the service role'
);

-- 9
select ok(
  obj_description('public.search_games(text,integer,public.medium)'::regprocedure, 'pg_proc')
    ~ 'external_ids',
  'the comment the drop took came back, and says what the new column is for'
);

-- Act as a signed-in user.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000005a","role":"authenticated"}';

-- The new column ----------------------------------------------------------------

-- 10
select results_eq(
  $$ select s.media_item_id, s.cover_image_id, s.external_ids
       from public.search_games('Quillfeather Lanterns') s
      where s.media_item_id = '00000000-0000-0000-0000-0000000005e1' $$,
  $$ values ('00000000-0000-0000-0000-0000000005e1'::uuid, null::text,
             '{"igdb": 990000101, "steam": 2215430}'::jsonb) $$,
  'a game with no IGDB cover comes back with the Steam id its cover falls back to'
);

-- 11
select is(
  (select s.external_ids ->> 'steam' from public.search_games('Quillfeather Lanterns') s
    where s.media_item_id = '00000000-0000-0000-0000-0000000005e1'),
  '2215430',
  'the Steam app id reads out of the column the way coverCandidates reads it'
);

-- 12
select is(
  (select s.external_ids from public.search_games('Quillfeather Lanterns Remastered') s
    where s.media_item_id = '00000000-0000-0000-0000-0000000005e2'),
  '{"igdb": 990000102}'::jsonb,
  'a game with no Steam id returns its ids as stored, with no steam key to fall back to'
);

-- 13
select is(
  (select s.external_ids from public.search_games('Quillfeather Homebrew') s
    where s.media_item_id = '00000000-0000-0000-0000-0000000005e3'),
  '{}'::jsonb,
  'a catalog row with no external ids returns an empty object, not null'
);

-- 14
select is(
  (select s.external_ids from public.search_games('Quillfeather Lanterns', 20, 'movie') s
    where s.media_item_id = '00000000-0000-0000-0000-0000000005e4'),
  '{"tmdb": 990000104}'::jsonb,
  'a film carries its own ids, through the same column'
);

-- What did not change -------------------------------------------------------------

-- 15
select results_eq(
  $$ select s.media_item_id, s.title, s.year, s.cover_image_id, s.igdb_id, s.developer,
            s.genres, s.platforms
       from public.search_games('Quillfeather Lanterns') s
      where s.media_item_id in ('00000000-0000-0000-0000-0000000005e1',
                                '00000000-0000-0000-0000-0000000005e2') $$,
  $$ values ('00000000-0000-0000-0000-0000000005e1'::uuid, 'Quillfeather Lanterns'::text,
             2024::smallint, null::text, 990000101, 'Lantern House'::text,
             array['puzzle'], array['PC']),
            ('00000000-0000-0000-0000-0000000005e2'::uuid, 'Quillfeather Lanterns Remastered'::text,
             2026::smallint, 'co9qfl'::text, 990000102, 'Lantern House'::text,
             array['puzzle','adventure'], array['PC','Switch']) $$,
  'every column it returned before still comes back, exact title first and the prefix match after'
);

-- 16
select is(
  (select count(*) from public.search_games('Quillfeather Lanterns') s
    where s.media_item_id = '00000000-0000-0000-0000-0000000005e4'),
  0::bigint,
  'games are still the default, and the film of the same title stays out'
);

-- 17
select is(
  (select count(*) from public.search_games('   ')),
  0::bigint,
  'a blank query still returns nothing'
);

select * from finish();
rollback;
