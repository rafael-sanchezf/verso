-- pgTAP tests for supabase/migrations/20260916150000_tier_list_external_ids.sql.
-- Run with: supabase test db
--
-- The migration drops and recreates tier_list to widen its return type, so
-- three things need checking and not just the new column: that the function is
-- still `security invoker`, that the grants survived the drop, and that it
-- still shows a caller only their own rows. A function that came back as
-- `security definer` with execute granted to anon would pass a naive "does it
-- return external_ids" test and hand one user's ranked list to everybody.
--
-- Two users act through `set local role authenticated` plus a forged
-- request.jwt.claims, so every call goes through Row Level Security exactly as
-- a supabase-js rpc() would.

begin;
select plan(17);

-- Fixtures --------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- Three shapes of external_ids, because the column is jsonb that nothing
-- enforces: a game on Steam, a game that is not, and one with no ids at all.
insert into public.media_items (id, medium, title, year, cover_image_id, external_ids) values
  ('00000000-0000-0000-0000-0000000000f1', 'game', 'Hades', 2020, 'co1r7f',
   '{"igdb": 113112, "steam": 1145360}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f2', 'game', 'Celeste', 2018, 'co2dvv',
   '{"igdb": 26226}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f3', 'game', 'Homebrew', 2019, null, '{}'::jsonb);

insert into public.game_details (media_item_id, igdb_id, genres, platforms) values
  ('00000000-0000-0000-0000-0000000000f1', 113112, '{roguelike,action}', '{PC,Switch}'),
  ('00000000-0000-0000-0000-0000000000f2', 26226, '{platformer}', '{PC}');

-- Shape and safety ------------------------------------------------------------

-- 1
select has_function(
  'public', 'tier_list', array['public.medium', 'public.tier'],
  'tier_list survived the drop and create'
);

-- 2
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.tier_list(public.medium,public.tier)'::regprocedure),
  false,
  'tier_list is still security invoker, so RLS still decides which rows it sees'
);

-- 3
select ok(
  (select p.proconfig from pg_proc p where p.oid = 'public.tier_list(public.medium,public.tier)'::regprocedure)
    @> array['search_path=public, extensions'],
  'its search_path is still pinned: the drop took that with the grants, and the create put it back'
);

-- 4
select ok(
  not has_function_privilege('anon', 'public.tier_list(public.medium,public.tier)', 'execute'),
  'the drop did not hand anon the execute grant back'
);

-- 5
select ok(
  has_function_privilege('authenticated', 'public.tier_list(public.medium,public.tier)', 'execute'),
  'signed-in users can still call it'
);

-- 6
select ok(
  has_function_privilege('service_role', 'public.tier_list(public.medium,public.tier)', 'execute'),
  'and so can the service role'
);

-- 7
select matches(
  pg_get_function_result('public.tier_list(public.medium,public.tier)'::regprocedure),
  'external_ids jsonb',
  'external_ids is declared in the return table, as jsonb'
);

-- Act as user A.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select public.insert_ranking_entry('00000000-0000-0000-0000-0000000000f1', 'game', 'loved', 0);
select public.insert_ranking_entry('00000000-0000-0000-0000-0000000000f2', 'game', 'loved', 1);
select public.insert_ranking_entry('00000000-0000-0000-0000-0000000000f3', 'game', 'loved', 2);

-- The new column --------------------------------------------------------------

-- 8
select results_eq(
  $$ select t."position", t.external_ids from public.tier_list('game', 'loved') t $$,
  $$ values (0, '{"igdb": 113112, "steam": 1145360}'::jsonb),
            (1, '{"igdb": 26226}'::jsonb),
            (2, '{}'::jsonb) $$,
  'tier_list returns external_ids exactly as media_items stores it, row by row'
);

-- 9
select is(
  (select t.external_ids ->> 'steam' from public.tier_list('game', 'loved') t where t."position" = 0),
  '1145360',
  'the Steam app id a cover falls back to comes through'
);

-- 10
select is(
  (select t.external_ids from public.tier_list('game', 'loved') t where t."position" = 2),
  '{}'::jsonb,
  'a catalog row with no external ids returns an empty object, not null'
);

-- 11
select results_eq(
  $$ select t."position", t.title, t.year, t.cover_image_id, t.genres, t.platforms
       from public.tier_list('game', 'loved') t order by t."position" $$,
  $$ values (0, 'Hades'::text, 2020::smallint, 'co1r7f'::text, array['roguelike','action'], array['PC','Switch']),
            (1, 'Celeste', 2018::smallint, 'co2dvv'::text, array['platformer'], array['PC']),
            (2, 'Homebrew', 2019::smallint, null::text, '{}'::text[], '{}'::text[]) $$,
  'every column the function returned before still comes back, in order'
);

-- 12
select is(
  (select count(*) from public.tier_list('game', 'liked')),
  0::bigint,
  'an empty tier is still empty'
);

-- Row Level Security: act as user B -------------------------------------------

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

-- 13
select is(
  (select count(*) from public.tier_list('game', 'loved')),
  0::bigint,
  'the second user sees none of the first user ranked list'
);

select public.insert_ranking_entry('00000000-0000-0000-0000-0000000000f2', 'game', 'loved', 0);

-- 14
select results_eq(
  $$ select t.title, t.external_ids from public.tier_list('game', 'loved') t $$,
  $$ values ('Celeste'::text, '{"igdb": 26226}'::jsonb) $$,
  'the second user sees their own one row, with its own catalog ids'
);

-- 15
select is(
  (select count(*) from public.tier_list('game', 'loved') t
    where t.external_ids ->> 'steam' is not null),
  0::bigint,
  'and nothing of the Steam-backed game the first user ranked'
);

-- Back to user A --------------------------------------------------------------

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- 16
select is(
  (select count(*) from public.tier_list('game', 'loved')),
  3::bigint,
  'the first user tier is untouched by the second user'
);

-- 17
select is(
  (select t.external_ids from public.tier_list('game', 'loved') t where t."position" = 0),
  '{"igdb": 113112, "steam": 1145360}'::jsonb,
  'and still carries the ids it started with'
);

select * from finish();
rollback;
