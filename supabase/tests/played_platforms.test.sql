-- pgTAP tests for supabase/migrations/20260923100000_played_platforms.sql.
-- Run with: supabase test db
--
-- Four things are under test: the column and its default; set_played_platforms
-- (who may call it, what it stores, what it refuses); tier_list returning the
-- played-on list after its drop and create; and that all of it is as private
-- as the rest of user_entries, with two users.
--
-- Written against this migration's tier_list, which also returned
-- `owned_platforms`. 20261007100000_drop_ownership.sql dropped that column and
-- created tier_list again without it (decision 26), so the assertions here
-- read the end state, and the one assertion about ownership being a separate
-- fact left with ownership. 20261007120000_onboarding_backend.sql then added
-- `placed_by` after the played-on list, so the played-on list is the last
-- column but one.
--
-- The structural assertions run as the migration's owner. Everything after
-- them acts as two users through `set local role authenticated` plus a forged
-- request.jwt.claims, so every call goes through Row Level Security exactly as
-- a supabase-js rpc() would.

begin;
select plan(46);

-- Fixtures --------------------------------------------------------------------
-- Ids in the ...-00000000028x range, so they cannot meet another suite's.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000028a', 'played-a@example.com'),
  ('00000000-0000-0000-0000-00000000028b', 'played-b@example.com');

-- Three catalog rows: a game on three platforms, a game on one, and a row with
-- no game_details at all (a mirror row the platforms question cannot apply to).
insert into public.media_items (id, medium, title, year) values
  ('00000000-0000-0000-0000-0000000028f1', 'game', 'Played Platforms Multi', 2021),
  ('00000000-0000-0000-0000-0000000028f2', 'game', 'Played Platforms Single', 2019),
  ('00000000-0000-0000-0000-0000000028f3', 'game', 'Played Platforms Bare', 2018);

insert into public.game_details (media_item_id, igdb_id, platforms) values
  ('00000000-0000-0000-0000-0000000028f1', 928001,
   '{"PC (Microsoft Windows)","PlayStation 5","Nintendo Switch"}'),
  ('00000000-0000-0000-0000-0000000028f2', 928002, '{"Nintendo Switch"}');

-- Structure -------------------------------------------------------------------

-- 1
select has_column('public', 'user_entries', 'played_platforms', 'user_entries has played_platforms');

-- 2
select col_type_is('public', 'user_entries', 'played_platforms', 'text[]',
  'played_platforms is text[], matching game_details.platforms');

-- 3
select col_not_null('public', 'user_entries', 'played_platforms',
  'played_platforms is NOT NULL: empty means not recorded, never null');

-- 4
select col_default_is('public', 'user_entries', 'played_platforms', '{}'::text[],
  'played_platforms defaults to empty, so no existing row needed a backfill');

-- 5
select has_function(
  'public', 'set_played_platforms', array['uuid', 'text[]'],
  'set_played_platforms(uuid, text[]) exists'
);

-- 6
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.set_played_platforms(uuid,text[])'::regprocedure),
  false,
  'set_played_platforms is security invoker, so RLS decides which entry it can write'
);

-- 7
select ok(
  (select p.proconfig from pg_proc p where p.oid = 'public.set_played_platforms(uuid,text[])'::regprocedure)
    @> array['search_path=public, extensions'],
  'set_played_platforms pins its search_path'
);

-- 8
select ok(
  not has_function_privilege('anon', 'public.set_played_platforms(uuid,text[])', 'execute'),
  'anon cannot call set_played_platforms'
);

-- 9
select ok(
  has_function_privilege('authenticated', 'public.set_played_platforms(uuid,text[])', 'execute'),
  'signed-in users can call set_played_platforms'
);

-- 10
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.tier_list(public.medium,public.tier)'::regprocedure),
  false,
  'tier_list is still security invoker after the drop and create'
);

-- 11
select ok(
  (select p.proconfig from pg_proc p where p.oid = 'public.tier_list(public.medium,public.tier)'::regprocedure)
    @> array['search_path=public, extensions'],
  'tier_list still pins its search_path: the drop took it and the create put it back'
);

-- 12
select ok(
  not has_function_privilege('anon', 'public.tier_list(public.medium,public.tier)', 'execute')
  and has_function_privilege('authenticated', 'public.tier_list(public.medium,public.tier)', 'execute')
  and has_function_privilege('service_role', 'public.tier_list(public.medium,public.tier)', 'execute'),
  'tier_list grants survived: authenticated and service_role, never anon'
);

-- 13
select matches(
  pg_get_function_result('public.tier_list(public.medium,public.tier)'::regprocedure),
  'platforms text\[\], played_platforms text\[\], placed_by text\)$',
  'tier_list declares played_platforms after the catalog platforms, followed only by the provisional mark'
);

-- Act as user A ---------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000028a","role":"authenticated"}';

-- User A tracks the multi-platform game as played.
insert into public.user_entries (user_id, media_item_id, status) values
  ('00000000-0000-0000-0000-00000000028a', '00000000-0000-0000-0000-0000000028f1',
   'played');

-- 14
select is(
  (select played_platforms from public.user_entries
    where media_item_id = '00000000-0000-0000-0000-0000000028f1'),
  '{}'::text[],
  'a new entry starts with nothing recorded'
);

-- What it stores ---------------------------------------------------------------

-- 15
select is(
  (select e.played_platforms
     from public.set_played_platforms(
       '00000000-0000-0000-0000-0000000028f1',
       array['nintendo switch', '  PLAYSTATION 5 ', 'Nintendo Switch']
     ) e),
  array['PlayStation 5', 'Nintendo Switch'],
  'names match without regard to case or spaces, come back in catalog spelling and catalog order, duplicates collapsed'
);

-- 16
select is(
  (select played_platforms from public.user_entries
    where media_item_id = '00000000-0000-0000-0000-0000000028f1'),
  array['PlayStation 5', 'Nintendo Switch'],
  'and that is what the table holds'
);

-- 17
select is(
  (select status::text from public.user_entries
    where media_item_id = '00000000-0000-0000-0000-0000000028f1'),
  'played',
  'and the status is untouched'
);

-- 18
select is(
  (select count(*) from public.user_entries
    where media_item_id = '00000000-0000-0000-0000-0000000028f1'),
  1::bigint,
  'a second write updates the one entry rather than adding another'
);

-- What it refuses ---------------------------------------------------------------

-- 19
select throws_ok(
  $$ select public.set_played_platforms(
       '00000000-0000-0000-0000-0000000028f1',
       array['PlayStation 5', 'Dreamcast']) $$,
  '22023',
  'not a platform this game is on: Dreamcast',
  'a platform the catalog does not list for this game is refused with 22023, naming it'
);

-- 20
select is(
  (select played_platforms from public.user_entries
    where media_item_id = '00000000-0000-0000-0000-0000000028f1'),
  array['PlayStation 5', 'Nintendo Switch'],
  'and the refusal is the whole write: the valid name alongside it was not stored either'
);

-- 21
select throws_ok(
  $$ select public.set_played_platforms('00000000-0000-0000-0000-0000000028f1', array[null::text]) $$,
  '22023',
  null,
  'a null name is not a platform'
);

-- 22
select throws_ok(
  $$ select public.set_played_platforms('00000000-0000-0000-0000-0000000028f3', array['PC (Microsoft Windows)']) $$,
  '22023',
  null,
  'a row with no game_details lists no platforms, so any name is refused'
);

-- A token with the authenticated role and no subject: execute is granted, and
-- auth.uid() is null.
set local request.jwt.claims to '{"role":"authenticated"}';

-- 23
select throws_ok(
  $$ select public.set_played_platforms('00000000-0000-0000-0000-0000000028f1', array['Nintendo Switch']) $$,
  '28000',
  null,
  'a caller with no user id is refused before anything is read'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000028a","role":"authenticated"}';

-- 24
select throws_ok(
  $$ select public.set_played_platforms('00000000-0000-0000-0000-0000000028ff', '{}') $$,
  '23503',
  null,
  'clearing on a media item that does not exist fails on the catalog row, not silently'
);

-- Clearing and creating ------------------------------------------------------------

-- 25
select is(
  (select e.played_platforms from public.set_played_platforms('00000000-0000-0000-0000-0000000028f1', '{}') e),
  '{}'::text[],
  'an empty list clears it'
);

-- 26
select is(
  (select e.played_platforms from public.set_played_platforms('00000000-0000-0000-0000-0000000028f1', null) e),
  '{}'::text[],
  'and so does null'
);

-- 27
select is(
  (select e.played_platforms from public.set_played_platforms('00000000-0000-0000-0000-0000000028f3', '{}') e),
  '{}'::text[],
  'clearing needs no catalog lookup, so it works on a row with no game_details'
);

-- Leave the multi-platform game recorded for the tier_list assertions.
select public.set_played_platforms('00000000-0000-0000-0000-0000000028f1', array['PlayStation 5']);

-- 28
select is(
  (select e.status::text || ':' || array_to_string(e.played_platforms, ',')
     from public.set_played_platforms('00000000-0000-0000-0000-0000000028f2', array['Nintendo Switch']) e),
  'backlog:Nintendo Switch',
  'on a game with no entry yet it creates one, with the table''s default status, like every writer in entries.ts'
);

-- 29
select is(
  (select user_id from public.user_entries
    where media_item_id = '00000000-0000-0000-0000-0000000028f2'),
  '00000000-0000-0000-0000-00000000028a'::uuid,
  'the entry it creates belongs to the caller, from auth.uid() and no parameter'
);

-- tier_list --------------------------------------------------------------------

select public.insert_ranking_entry('00000000-0000-0000-0000-0000000028f1', 'game', 'loved', 0);
select public.insert_ranking_entry('00000000-0000-0000-0000-0000000028f2', 'game', 'loved', 1);
select public.insert_ranking_entry('00000000-0000-0000-0000-0000000028f3', 'game', 'loved', 2);

-- The bare game's entry is removed, so its ranking outlives it: the case the
-- left join exists for.
delete from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000028f3';

-- 30
select results_eq(
  $$ select t."position", t.played_platforms
       from public.tier_list('game', 'loved') t order by t."position" $$,
  $$ values (0, array['PlayStation 5']),
            (1, array['Nintendo Switch']),
            (2, '{}'::text[]) $$,
  'tier_list returns the caller''s played platforms per row, and an empty list for a ranking with no entry'
);

-- 31
select results_eq(
  $$ select t."position", t.title, t.platforms
       from public.tier_list('game', 'loved') t order by t."position" $$,
  $$ values (0, 'Played Platforms Multi'::text,
               array['PC (Microsoft Windows)', 'PlayStation 5', 'Nintendo Switch']),
            (1, 'Played Platforms Single', array['Nintendo Switch']),
            (2, 'Played Platforms Bare', '{}'::text[]) $$,
  'the catalog platforms still come back beside them, unchanged'
);

-- 32
select is(
  (select count(*) from public.tier_list('game', 'loved')),
  3::bigint,
  'the left join to the entry neither drops a ranked row nor duplicates one'
);

-- Row Level Security: act as user B -------------------------------------------

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000028b","role":"authenticated"}';

-- 33
select is(
  (select count(*) from public.user_entries
    where media_item_id in ('00000000-0000-0000-0000-0000000028f1', '00000000-0000-0000-0000-0000000028f2')),
  0::bigint,
  'user B sees none of user A''s entries, played platforms included'
);

-- 34
select is(
  (select count(*) from public.tier_list('game', 'loved')),
  0::bigint,
  'user B''s tier_list carries none of user A''s rows'
);

-- 35
update public.user_entries set played_platforms = '{"Nintendo Switch"}'
  where media_item_id = '00000000-0000-0000-0000-0000000028f1';
select is(
  (select count(*) from public.user_entries where played_platforms = '{"Nintendo Switch"}'),
  0::bigint,
  'user B''s direct update of user A''s played platforms touches nothing'
);

-- 36
select throws_ok(
  $$ insert into public.user_entries (user_id, media_item_id, played_platforms)
     values ('00000000-0000-0000-0000-00000000028a', '00000000-0000-0000-0000-0000000028f3',
             '{"PC (Microsoft Windows)"}') $$,
  '42501',
  null,
  'user B cannot create an entry with played platforms in user A''s name'
);

-- User B calls the function on the same game user A has already recorded.

-- 37
select is(
  (select e.user_id::text || ':' || array_to_string(e.played_platforms, ',')
     from public.set_played_platforms('00000000-0000-0000-0000-0000000028f1', array['pc (microsoft windows)']) e),
  '00000000-0000-0000-0000-00000000028b:PC (Microsoft Windows)',
  'user B''s call creates user B''s own entry, since there is no user id to name anyone else'
);

-- 38
select is(
  (select count(*) from public.user_entries),
  1::bigint,
  'and user B now sees exactly that one entry'
);

select public.insert_ranking_entry('00000000-0000-0000-0000-0000000028f1', 'game', 'loved', 0);

-- 39
select results_eq(
  $$ select t.media_item_id, t.played_platforms from public.tier_list('game', 'loved') t $$,
  $$ values ('00000000-0000-0000-0000-0000000028f1'::uuid, array['PC (Microsoft Windows)']) $$,
  'user B''s tier_list shows user B''s list for the same game, not user A''s'
);

-- Back to user A: nothing user B did landed. -----------------------------------

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000028a","role":"authenticated"}';

-- 40
select is(
  (select played_platforms from public.user_entries
    where media_item_id = '00000000-0000-0000-0000-0000000028f1'),
  array['PlayStation 5'],
  'user A''s played platforms survived user B''s update and user B''s own call'
);

-- 41
select is(
  (select count(*) from public.user_entries where user_id = '00000000-0000-0000-0000-00000000028b'),
  0::bigint,
  'user A cannot see user B''s entry either'
);

-- 42
select results_eq(
  $$ select t."position", t.played_platforms from public.tier_list('game', 'loved') t order by t."position" $$,
  $$ values (0, array['PlayStation 5']), (1, array['Nintendo Switch']), (2, '{}'::text[]) $$,
  'user A''s tier_list is unchanged by user B'
);

-- Signed out --------------------------------------------------------------------

reset role;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

-- 43
select throws_ok(
  $$ select public.set_played_platforms('00000000-0000-0000-0000-0000000028f1', array['PlayStation 5']) $$,
  '42501',
  null,
  'anon cannot execute set_played_platforms at all'
);

-- 44
select throws_ok(
  $$ select * from public.tier_list('game', 'loved') $$,
  '42501',
  null,
  'anon cannot execute tier_list at all'
);

-- 45
select is(
  (select count(*) from public.user_entries),
  0::bigint,
  'and reads no entries directly'
);

reset role;

-- 46
select is(
  (select played_platforms from public.user_entries
    where user_id = '00000000-0000-0000-0000-00000000028a'
      and media_item_id = '00000000-0000-0000-0000-0000000028f1'),
  array['PlayStation 5'],
  'seen as the owner of the database, user A''s list is exactly what user A last wrote'
);

select * from finish();
rollback;
