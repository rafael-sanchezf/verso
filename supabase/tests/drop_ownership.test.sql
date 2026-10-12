-- pgTAP tests for supabase/migrations/20261007100000_drop_ownership.sql.
-- Run with: supabase test db
--
-- Four things are under test: ownership is gone from the schema; tier_list
-- after its drop and create (shape, grants, search_path, and what it returns);
-- apply_steam_played_platforms, one assertion per rule; and that user_entries
-- is as private as it was, with two users.
--
-- The structural and service-role assertions run as the migration's owner,
-- which is what the Edge Function's service role amounts to. The user-facing
-- ones act through `set local role authenticated` plus a forged
-- request.jwt.claims, and then as `anon`, so every call goes through Row Level
-- Security and the grants exactly as a supabase-js call would.

begin;
select plan(43);

-- Ownership is gone -----------------------------------------------------------

-- 1
select hasnt_column('public', 'user_entries', 'owned_platforms',
  'user_entries has no owned_platforms: ownership left the product (decision 26)');

-- 2
select has_column('public', 'user_entries', 'played_platforms',
  'played_platforms stays: a ranked game was played, on the platforms the entry records (decision 19)');

-- 3
select hasnt_function('public', 'set_owned_platforms',
  'there is no set_owned_platforms, and none was added');

-- 4
select ok(
  (select relrowsecurity from pg_class where oid = 'public.user_entries'::regclass),
  'RLS is still on for user_entries after the column went'
);

-- 5
select policies_are(
  'public', 'user_entries',
  array['users manage their own entries'],
  'and its one owner-only policy is unchanged'
);

-- tier_list after the drop and create ------------------------------------------

-- 6
select matches(
  pg_get_function_result('public.tier_list(public.medium,public.tier)'::regprocedure),
  'platforms text\[\], played_platforms text\[\], placed_by text\)$',
  'tier_list ends with the catalog platforms, the caller''s played platforms and the provisional mark (20261007120000), and no owned list'
);

-- 7
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.tier_list(public.medium,public.tier)'::regprocedure),
  false,
  'tier_list is still security invoker'
);

-- 8
select ok(
  (select p.proconfig from pg_proc p where p.oid = 'public.tier_list(public.medium,public.tier)'::regprocedure)
    @> array['search_path=public, extensions'],
  'tier_list still pins its search_path: the drop took it and the create put it back'
);

-- 9
select ok(
  not has_function_privilege('anon', 'public.tier_list(public.medium,public.tier)', 'execute')
  and has_function_privilege('authenticated', 'public.tier_list(public.medium,public.tier)', 'execute')
  and has_function_privilege('service_role', 'public.tier_list(public.medium,public.tier)', 'execute'),
  'tier_list grants survived: authenticated and service_role, never anon'
);

-- apply_steam_played_platforms: structure --------------------------------------

-- 10
select has_function(
  'public', 'apply_steam_played_platforms', array['uuid'],
  'apply_steam_played_platforms(uuid) exists'
);

-- 11
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.apply_steam_played_platforms(uuid)'::regprocedure),
  false,
  'apply_steam_played_platforms is security invoker'
);

-- 12
select ok(
  (select p.proconfig from pg_proc p where p.oid = 'public.apply_steam_played_platforms(uuid)'::regprocedure)
    @> array['search_path=public, extensions'],
  'apply_steam_played_platforms pins its search_path'
);

-- 13
select function_privs_are(
  'public', 'apply_steam_played_platforms', array['uuid'],
  'authenticated', array[]::text[],
  'signed-in users cannot call it: it names a user id'
);

-- 14
select function_privs_are(
  'public', 'apply_steam_played_platforms', array['uuid'],
  'anon', array[]::text[],
  'and neither can anon'
);

-- 15
select ok(
  has_function_privilege('service_role', 'public.apply_steam_played_platforms(uuid)', 'execute'),
  'the service role can, which is what the steam-import Edge Function runs as'
);

-- Fixtures ----------------------------------------------------------------------
-- Ids in the ...-00000000035x range (item 35), so they cannot meet another
-- suite's. Every playtime figure is distinct.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000035a', 'own-a@example.com'),
  ('00000000-0000-0000-0000-00000000035b', 'own-b@example.com');

insert into public.media_items (id, medium, title, year, external_ids) values
  ('00000000-0000-0000-0000-0000000035f1', 'game', 'Ownership Out Blank', 2020, '{"igdb": 935001, "steam": 935001}'),
  ('00000000-0000-0000-0000-0000000035f2', 'game', 'Ownership Out Switch', 2021, '{"igdb": 935002, "steam": 935002}'),
  ('00000000-0000-0000-0000-0000000035f3', 'game', 'Ownership Out Zero', 2019, '{"igdb": 935003, "steam": 935003}'),
  ('00000000-0000-0000-0000-0000000035f4', 'game', 'Ownership Out Already', 2018, '{"igdb": 935004, "steam": 935004}'),
  ('00000000-0000-0000-0000-0000000035f5', 'game', 'Ownership Out Mac Only', 2017, '{"igdb": 935005, "steam": 935005}'),
  ('00000000-0000-0000-0000-0000000035f6', 'game', 'Ownership Out Imported', 2016, '{"igdb": 935006, "steam": 935006}'),
  ('00000000-0000-0000-0000-0000000035f7', 'game', 'Ownership Out Untracked', 2015, '{"igdb": 935007, "steam": 935007}'),
  ('00000000-0000-0000-0000-0000000035f8', 'game', 'Ownership Out Bare', 2014, '{"steam": 935008}');

-- f8 has no game_details row at all: the catalog lists no platforms for it.
insert into public.game_details (media_item_id, igdb_id, platforms) values
  ('00000000-0000-0000-0000-0000000035f1', 935001, '{"PC (Microsoft Windows)","PlayStation 5"}'),
  ('00000000-0000-0000-0000-0000000035f2', 935002, '{"PC (Microsoft Windows)","PlayStation 5","Nintendo Switch"}'),
  ('00000000-0000-0000-0000-0000000035f3', 935003, '{"PC (Microsoft Windows)"}'),
  ('00000000-0000-0000-0000-0000000035f4', 935004, '{"PC (Microsoft Windows)","Xbox One"}'),
  ('00000000-0000-0000-0000-0000000035f5', 935005, '{Mac,Linux}'),
  ('00000000-0000-0000-0000-0000000035f6', 935006, '{"PC (Microsoft Windows)","Nintendo Switch"}'),
  ('00000000-0000-0000-0000-0000000035f7', 935007, '{"PC (Microsoft Windows)"}');

-- A's library: playtime on everything but f3, which reads zero.
insert into public.steam_library (user_id, steam_app_id, media_item_id, name, playtime_forever_minutes) values
  ('00000000-0000-0000-0000-00000000035a', 935001, '00000000-0000-0000-0000-0000000035f1', 'Blank', 601),
  ('00000000-0000-0000-0000-00000000035a', 935002, '00000000-0000-0000-0000-0000000035f2', 'Switch', 302),
  ('00000000-0000-0000-0000-00000000035a', 935003, '00000000-0000-0000-0000-0000000035f3', 'Zero', 0),
  ('00000000-0000-0000-0000-00000000035a', 935004, '00000000-0000-0000-0000-0000000035f4', 'Already', 44),
  ('00000000-0000-0000-0000-00000000035a', 935005, '00000000-0000-0000-0000-0000000035f5', 'Mac Only', 55),
  ('00000000-0000-0000-0000-00000000035a', 935006, '00000000-0000-0000-0000-0000000035f6', 'Imported', 66),
  ('00000000-0000-0000-0000-00000000035a', 935007, '00000000-0000-0000-0000-0000000035f7', 'Untracked', 77),
  ('00000000-0000-0000-0000-00000000035a', 935008, '00000000-0000-0000-0000-0000000035f8', 'Bare', 88);

-- B has f1 in their library too, with playtime, and an entry with nothing
-- recorded: the function takes one user and has to mean it.
insert into public.steam_library (user_id, steam_app_id, media_item_id, name, playtime_forever_minutes) values
  ('00000000-0000-0000-0000-00000000035b', 935001, '00000000-0000-0000-0000-0000000035f1', 'Blank', 909);

-- A's entries, one per rule. f6's 'Steam Deck' is a name the catalog does not
-- list for that game, which only the JSON import can write.
insert into public.user_entries (user_id, media_item_id, status, played_platforms, started_at) values
  ('00000000-0000-0000-0000-00000000035a', '00000000-0000-0000-0000-0000000035f1', 'playing', '{}', '2026-01-01T00:00:00Z'),
  ('00000000-0000-0000-0000-00000000035a', '00000000-0000-0000-0000-0000000035f2', 'played', '{"Nintendo Switch"}', null),
  ('00000000-0000-0000-0000-00000000035a', '00000000-0000-0000-0000-0000000035f3', 'played', '{}', null),
  ('00000000-0000-0000-0000-00000000035a', '00000000-0000-0000-0000-0000000035f4', 'played', '{"PC (Microsoft Windows)"}', null),
  ('00000000-0000-0000-0000-00000000035a', '00000000-0000-0000-0000-0000000035f5', 'played', '{}', null),
  ('00000000-0000-0000-0000-00000000035a', '00000000-0000-0000-0000-0000000035f6', 'backlog', '{"Steam Deck","Nintendo Switch"}', null),
  ('00000000-0000-0000-0000-00000000035a', '00000000-0000-0000-0000-0000000035f8', 'played', '{}', null);

insert into public.user_entries (user_id, media_item_id, status) values
  ('00000000-0000-0000-0000-00000000035b', '00000000-0000-0000-0000-0000000035f1', 'played');

-- The backlog trigger numbered f6; remember where, to show the write left it.
create temporary table own_before as
  select backlog_position from public.user_entries
   where user_id = '00000000-0000-0000-0000-00000000035a'
     and media_item_id = '00000000-0000-0000-0000-0000000035f6';

-- apply_steam_played_platforms: what it does ------------------------------------

-- 16
select is(
  public.apply_steam_played_platforms('00000000-0000-0000-0000-00000000035a'),
  3,
  'three of A''s seven entries change: the blank one, the Switch one, and the imported one'
);

-- 17
select is(
  (select played_platforms from public.user_entries
    where user_id = '00000000-0000-0000-0000-00000000035a'
      and media_item_id = '00000000-0000-0000-0000-0000000035f1'),
  array['PC (Microsoft Windows)'],
  'an entry with nothing recorded and Steam playtime records PC'
);

-- 18
select is(
  (select played_platforms from public.user_entries
    where user_id = '00000000-0000-0000-0000-00000000035a'
      and media_item_id = '00000000-0000-0000-0000-0000000035f2'),
  array['PC (Microsoft Windows)', 'Nintendo Switch'],
  'it adds and never replaces: the user''s Switch stays, PC joins it, in catalog order'
);

-- 19
select is(
  (select played_platforms from public.user_entries
    where user_id = '00000000-0000-0000-0000-00000000035a'
      and media_item_id = '00000000-0000-0000-0000-0000000035f3'),
  '{}'::text[],
  'a zero from Steam records nothing: "never played" and "playtime hidden" look the same'
);

-- 20
select is(
  (select played_platforms from public.user_entries
    where user_id = '00000000-0000-0000-0000-00000000035a'
      and media_item_id = '00000000-0000-0000-0000-0000000035f4'),
  array['PC (Microsoft Windows)'],
  'an entry that already says PC is left as it is, and not counted'
);

-- 21
select is(
  (select played_platforms from public.user_entries
    where user_id = '00000000-0000-0000-0000-00000000035a'
      and media_item_id = '00000000-0000-0000-0000-0000000035f5'),
  '{}'::text[],
  'a game the catalog does not list on PC gets no PC, the rule set_played_platforms enforces'
);

-- 22
select is(
  (select played_platforms from public.user_entries
    where user_id = '00000000-0000-0000-0000-00000000035a'
      and media_item_id = '00000000-0000-0000-0000-0000000035f8'),
  '{}'::text[],
  'and neither does a game with no game_details row'
);

-- 23
select is(
  (select played_platforms from public.user_entries
    where user_id = '00000000-0000-0000-0000-00000000035a'
      and media_item_id = '00000000-0000-0000-0000-0000000035f6'),
  array['PC (Microsoft Windows)', 'Nintendo Switch', 'Steam Deck'],
  'a name the catalog does not list is kept, after the catalog names, rather than dropped'
);

-- 24
select is(
  (select count(*) from public.user_entries
    where user_id = '00000000-0000-0000-0000-00000000035a'),
  7::bigint,
  'the import never creates an entry: the untracked library game stays a candidate'
);

-- 25
select is(
  public.apply_steam_played_platforms('00000000-0000-0000-0000-00000000035a'),
  0,
  'running it again changes nothing, so an import with no news reports none'
);

-- 26
select results_eq(
  $$ select playtime_minutes, playtime_source, status::text, started_at from public.user_entries
      where user_id = '00000000-0000-0000-0000-00000000035a'
        and media_item_id = '00000000-0000-0000-0000-0000000035f1' $$,
  $$ values (null::integer, null::text, 'playing'::text, '2026-01-01T00:00:00Z'::timestamptz) $$,
  'it touches only the played-on list: no playtime, the same status, the same started date'
);

-- 27
select is(
  (select backlog_position from public.user_entries
    where user_id = '00000000-0000-0000-0000-00000000035a'
      and media_item_id = '00000000-0000-0000-0000-0000000035f6'),
  (select backlog_position from own_before),
  'and the backlog trigger leaves the user''s queue where it was'
);

-- 28
select is(
  (select played_platforms from public.user_entries
    where user_id = '00000000-0000-0000-0000-00000000035b'
      and media_item_id = '00000000-0000-0000-0000-0000000035f1'),
  '{}'::text[],
  'B''s entry for the same game is untouched: the function takes one user'
);

-- 29
select is(
  public.apply_steam_played_platforms('00000000-0000-0000-0000-00000000035b'),
  1,
  'and B''s own run marks B''s entry'
);

-- tier_list, as user A -------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000035a","role":"authenticated"}';

select public.insert_ranking_entry('00000000-0000-0000-0000-0000000035f2', 'game', 'liked', 0);
select public.insert_ranking_entry('00000000-0000-0000-0000-0000000035f3', 'game', 'liked', 1);
select public.insert_ranking_entry('00000000-0000-0000-0000-0000000035f7', 'game', 'liked', 2);

-- 30
select results_eq(
  $$ select t."position", t.title, t.platforms, t.played_platforms
       from public.tier_list('game', 'liked') t order by t."position" $$,
  $$ values (0, 'Ownership Out Switch'::text,
               array['PC (Microsoft Windows)', 'PlayStation 5', 'Nintendo Switch'],
               array['PC (Microsoft Windows)', 'Nintendo Switch']),
            (1, 'Ownership Out Zero', array['PC (Microsoft Windows)'], '{}'::text[]),
            (2, 'Ownership Out Untracked', array['PC (Microsoft Windows)'], '{}'::text[]) $$,
  'tier_list returns the catalog platforms and the caller''s played platforms, empty for a ranking with no entry'
);

-- 31
select is(
  (select count(*) from public.tier_list('game', 'liked')),
  3::bigint,
  'the left join to the entry neither drops a ranked row nor duplicates one'
);

-- 32
select throws_ok(
  $$ select public.apply_steam_played_platforms('00000000-0000-0000-0000-00000000035a') $$,
  '42501',
  null,
  'a signed-in user cannot run the import''s write, not even on their own id'
);

-- 33
select throws_ok(
  $$ select owned_platforms from public.user_entries $$,
  '42703',
  null,
  'a client still asking for owned_platforms is told the column does not exist'
);

-- 34
select is(
  (select e.played_platforms
     from public.set_played_platforms('00000000-0000-0000-0000-0000000035f3', array['pc (microsoft windows)']) e),
  array['PC (Microsoft Windows)'],
  'set_played_platforms still writes the list through the changed row type'
);

-- Row Level Security: act as user B -------------------------------------------

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000035b","role":"authenticated"}';

-- 35
select is(
  (select count(*) from public.user_entries
    where user_id = '00000000-0000-0000-0000-00000000035a'),
  0::bigint,
  'user B sees none of user A''s entries'
);

-- 36
select is(
  (select count(*) from public.tier_list('game', 'liked')),
  0::bigint,
  'user B''s tier_list carries none of user A''s rows'
);

-- 37
update public.user_entries set played_platforms = '{"PlayStation 5"}'
  where user_id = '00000000-0000-0000-0000-00000000035a';
select is(
  (select count(*) from public.user_entries where played_platforms = '{"PlayStation 5"}'),
  0::bigint,
  'user B''s blanket update of user A''s played platforms touches nothing'
);

-- 38
select throws_ok(
  $$ insert into public.user_entries (user_id, media_item_id, played_platforms)
     values ('00000000-0000-0000-0000-00000000035a', '00000000-0000-0000-0000-0000000035f7',
             '{"PC (Microsoft Windows)"}') $$,
  '42501',
  null,
  'user B cannot create an entry in user A''s name'
);

-- 39
select is(
  (select played_platforms from public.user_entries
    where media_item_id = '00000000-0000-0000-0000-0000000035f1'),
  array['PC (Microsoft Windows)'],
  'user B sees their own entry, marked by their own run'
);

-- Signed out --------------------------------------------------------------------

reset role;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

-- 40
select throws_ok(
  $$ select * from public.tier_list('game', 'liked') $$,
  '42501',
  null,
  'anon cannot execute tier_list at all'
);

-- 41
select throws_ok(
  $$ select public.apply_steam_played_platforms('00000000-0000-0000-0000-00000000035a') $$,
  '42501',
  null,
  'anon cannot run the import''s write'
);

-- 42
select is(
  (select count(*) from public.user_entries),
  0::bigint,
  'and reads no entries directly'
);

reset role;

-- 43
select is(
  (select played_platforms from public.user_entries
    where user_id = '00000000-0000-0000-0000-00000000035a'
      and media_item_id = '00000000-0000-0000-0000-0000000035f2'),
  array['PC (Microsoft Windows)', 'Nintendo Switch'],
  'seen as the owner of the database, user A''s list is what the import left, untouched by user B'
);

select * from finish();
rollback;
