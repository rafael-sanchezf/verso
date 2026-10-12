-- pgTAP tests for supabase/migrations/20260916084800_player_counts.sql.
-- Run with: supabase test db
--
-- Four things are under test: the shape of player_counts, who may read and
-- write it, the window and ordering of player_count_history, and the latest
-- reading per game.
--
-- The structural assertions run as the migration's owner. The behaviour ones
-- act as a signed-in user through `set local role authenticated` plus a forged
-- request.jwt.claims, and then as `anon`, so every read and every refused write
-- goes through Row Level Security and the grants exactly as a supabase-js call
-- would. The rows themselves are inserted as the owner, which is the only way
-- they ever get there: the Edge Function writes as the service role, and RLS is
-- bypassed for it the same way it is for the IGDB mirror.
--
-- The timestamps are relative to now() rather than fixed, because the function
-- under test has `now() - interval '7 days'` as its default window: a fixture
-- of literal dates would pass today and start failing a week from now.

begin;
select plan(55);

-- Structure -------------------------------------------------------------------

select has_table('public', 'player_counts', 'player_counts exists');
select has_column('public', 'player_counts', 'media_item_id', 'player_counts has media_item_id');
select has_column('public', 'player_counts', 'observed_at', 'player_counts has observed_at');
select has_column('public', 'player_counts', 'players', 'player_counts has players');
select col_type_is('public', 'player_counts', 'media_item_id', 'uuid', 'media_item_id is a uuid');
select col_type_is('public', 'player_counts', 'observed_at', 'timestamp with time zone', 'observed_at is a timestamptz');
select col_type_is('public', 'player_counts', 'players', 'integer', 'players is an integer');
select col_not_null('public', 'player_counts', 'observed_at', 'observed_at is not null');
select col_not_null('public', 'player_counts', 'players', 'players is not null: a missing reading is a missing row');
select col_is_pk('public', 'player_counts', array['media_item_id', 'observed_at'], 'the pair is the key: one reading per game per instant');
select col_has_check('public', 'player_counts', 'players', 'players has a check constraint');

select col_hasnt_default(
  'public', 'player_counts', 'observed_at',
  'observed_at has no default, so every row of a run carries the run''s own timestamp'
);

-- No user_id anywhere: this is catalog-shaped data about games, and the poll
-- must not be able to record who tracks what even by accident.
select hasnt_column('public', 'player_counts', 'user_id', 'a player count says nothing about who is playing');

select fk_ok(
  'public', 'player_counts', 'media_item_id',
  'public', 'media_items', 'id',
  'player_counts.media_item_id references the catalog'
);

select is(
  (select confdeltype from pg_constraint where conname = 'player_counts_media_item_id_fkey'),
  'c'::"char",
  'dropping a catalog row takes its history with it'
);

select ok(
  to_regclass('public.player_counts_item_recent') is not null,
  'player_counts_item_recent exists'
);

select matches(
  pg_get_indexdef('public.player_counts_item_recent'::regclass),
  'observed_at DESC',
  'the index is newest first, which is the order both reads want'
);

select matches(
  pg_get_indexdef('public.player_counts_item_recent'::regclass),
  'INCLUDE \(players\)',
  'players rides along in the index, so a week of one game is an index-only scan'
);

-- Row Level Security ----------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.player_counts'::regclass),
  'RLS on player_counts'
);

select policies_are(
  'public', 'player_counts',
  array['player counts are readable by signed-in users'],
  'exactly one policy: there is no way for a client to write a player count'
);

select is(
  (select polcmd::text from pg_policy where polrelid = 'public.player_counts'::regclass),
  'r',
  'the one policy is a select policy'
);

select table_privs_are(
  'public', 'player_counts', 'authenticated', array['SELECT'],
  'signed-in users may read player_counts and nothing else'
);

select table_privs_are(
  'public', 'player_counts', 'anon', array[]::text[],
  'player_counts is off the anonymous surface entirely'
);

select ok(
  has_table_privilege('service_role', 'public.player_counts', 'INSERT'),
  'the service role, which is what the Edge Function uses, can write'
);

-- player_count_history --------------------------------------------------------

select has_function('public', 'player_count_history', array['uuid', 'timestamptz'], 'player_count_history exists');
select function_returns('public', 'player_count_history', array['uuid', 'timestamptz'], 'setof record', 'player_count_history returns rows');
select isnt_definer('public', 'player_count_history', array['uuid', 'timestamptz'], 'player_count_history is security invoker, so RLS is still the boundary');

select function_privs_are(
  'public', 'player_count_history', array['uuid', 'timestamptz'],
  'authenticated', array['EXECUTE'],
  'signed-in users can call player_count_history'
);

select function_privs_are(
  'public', 'player_count_history', array['uuid', 'timestamptz'],
  'anon', array[]::text[],
  'player_count_history is off the anonymous surface'
);

-- latest_player_counts --------------------------------------------------------

select has_view('public', 'latest_player_counts', 'latest_player_counts exists');

select ok(
  (select 'security_invoker=true' = any (coalesce(reloptions, '{}'))
     from pg_class where oid = 'public.latest_player_counts'::regclass),
  'the view runs as the caller, so it cannot hand out rows their own policy would refuse'
);

select table_privs_are(
  'public', 'latest_player_counts', 'authenticated', array['SELECT'],
  'signed-in users may read the latest counts'
);

select table_privs_are(
  'public', 'latest_player_counts', 'anon', array[]::text[],
  'the latest counts are off the anonymous surface too'
);

-- Fixtures --------------------------------------------------------------------
-- Three games: one with a week and a half of readings, one with two, one with
-- none. Player numbers are distinct so an assertion about order cannot pass by
-- coincidence.

insert into public.media_items (id, medium, title, year, external_ids) values
  ('00000000-0000-0000-0000-0000000000f1', 'game', 'Hades', 2020, '{"igdb": 1, "steam": 1145360}'),
  ('00000000-0000-0000-0000-0000000000f2', 'game', 'Celeste', 2018, '{"igdb": 2, "steam": 504230}'),
  ('00000000-0000-0000-0000-0000000000f3', 'game', 'Outer Wilds', 2019, '{"igdb": 3}');

insert into public.player_counts (media_item_id, observed_at, players) values
  ('00000000-0000-0000-0000-0000000000f1', now() - interval '10 days', 1000),
  ('00000000-0000-0000-0000-0000000000f1', now() - interval '3 days', 2000),
  ('00000000-0000-0000-0000-0000000000f1', now() - interval '1 hour', 3000),
  ('00000000-0000-0000-0000-0000000000f1', now() - interval '5 minutes', 4000),
  ('00000000-0000-0000-0000-0000000000f2', now() - interval '2 hours', 500),
  ('00000000-0000-0000-0000-0000000000f2', now() - interval '30 minutes', 600);

-- The constraints, from the writing side ---------------------------------------

select throws_ok(
  $$ insert into public.player_counts (media_item_id, observed_at, players)
     values ('00000000-0000-0000-0000-0000000000f3', now(), -1) $$,
  '23514',
  null,
  'a negative player count is refused'
);

select lives_ok(
  $$ insert into public.player_counts (media_item_id, observed_at, players)
     values ('00000000-0000-0000-0000-0000000000f3', now() - interval '45 minutes', 0) $$,
  'zero players is a real reading, not a missing one'
);

select throws_ok(
  $$ insert into public.player_counts (media_item_id, observed_at, players)
     values ('00000000-0000-0000-0000-0000000000f1', now() - interval '1 hour', 9999) $$,
  '23505',
  null,
  'the same game cannot have two readings for one instant'
);

delete from public.player_counts where media_item_id = '00000000-0000-0000-0000-0000000000f3';

-- Reading, as a signed-in user -------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is(
  (select count(*) from public.player_counts
    where media_item_id in ('00000000-0000-0000-0000-0000000000f1',
                            '00000000-0000-0000-0000-0000000000f2',
                            '00000000-0000-0000-0000-0000000000f3')),
  6::bigint,
  'a signed-in user can read the whole series: these are facts about games, not about people'
);

select results_eq(
  $$ select h.players from public.player_count_history('00000000-0000-0000-0000-0000000000f1') h $$,
  $$ values (2000), (3000), (4000) $$,
  'the default window is the last seven days, oldest first'
);

select results_eq(
  $$ select h.players from public.player_count_history(
       '00000000-0000-0000-0000-0000000000f1', now() - interval '11 days') h $$,
  $$ values (1000), (2000), (3000), (4000) $$,
  'a wider window reaches further back, still oldest first'
);

select is(
  (select count(*) from public.player_count_history(
     '00000000-0000-0000-0000-0000000000f1', now() - interval '10 minutes')),
  1::bigint,
  'a narrow window is a narrow answer'
);

select is(
  (select count(*) from public.player_count_history(
     '00000000-0000-0000-0000-0000000000f1',
     (select observed_at from public.player_counts
       where media_item_id = '00000000-0000-0000-0000-0000000000f1' and players = 2000))),
  3::bigint,
  'p_since is inclusive: a reading exactly on the edge is in the window'
);

select is(
  (select count(*) from public.player_count_history('00000000-0000-0000-0000-0000000000f2')),
  2::bigint,
  'the history is one game only, never the whole table'
);

select is(
  (select count(*) from public.player_count_history('00000000-0000-0000-0000-0000000000f3')),
  0::bigint,
  'a game nobody has polled has an empty history, not an error'
);

select results_eq(
  $$ select l.media_item_id, l.players from public.latest_player_counts l
      where l.media_item_id in ('00000000-0000-0000-0000-0000000000f1',
                                '00000000-0000-0000-0000-0000000000f2',
                                '00000000-0000-0000-0000-0000000000f3')
      order by l.media_item_id $$,
  $$ values ('00000000-0000-0000-0000-0000000000f1'::uuid, 4000),
            ('00000000-0000-0000-0000-0000000000f2'::uuid, 600) $$,
  'the latest view is the newest reading per game, one row each'
);

select is(
  (select players from public.latest_player_counts
    where media_item_id = '00000000-0000-0000-0000-0000000000f1'),
  4000,
  'the game page reads one game latest count by id'
);

select is(
  (select count(*) from public.latest_player_counts
    where media_item_id = '00000000-0000-0000-0000-0000000000f3'),
  0::bigint,
  'a game with no readings has no latest row: nothing to show, and the UI has to say so'
);

-- Writing, as a signed-in user -------------------------------------------------
-- All three are refused before RLS even has an opinion, because the grant is
-- SELECT alone. Same SQLSTATE either way, which is the point: a client has no
-- way to tell a missing policy from a missing privilege, and no way through.

select throws_ok(
  $$ insert into public.player_counts (media_item_id, observed_at, players)
     values ('00000000-0000-0000-0000-0000000000f1', now(), 999999) $$,
  '42501',
  null,
  'a signed-in user cannot invent a player count'
);

select throws_ok(
  $$ update public.player_counts set players = 1 $$,
  '42501',
  null,
  'a signed-in user cannot rewrite history'
);

select throws_ok(
  $$ delete from public.player_counts $$,
  '42501',
  null,
  'a signed-in user cannot delete history'
);

select is(
  (select count(*) from public.player_counts
    where media_item_id in ('00000000-0000-0000-0000-0000000000f1',
                            '00000000-0000-0000-0000-0000000000f2',
                            '00000000-0000-0000-0000-0000000000f3')),
  6::bigint,
  'and none of that changed anything'
);

-- Signed out --------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$ select * from public.player_counts $$,
  '42501',
  null,
  'a signed-out caller cannot read the table'
);

select throws_ok(
  $$ select * from public.latest_player_counts $$,
  '42501',
  null,
  'a signed-out caller cannot read the latest view'
);

select throws_ok(
  $$ select * from public.player_count_history('00000000-0000-0000-0000-0000000000f1') $$,
  '42501',
  null,
  'a signed-out caller cannot call the history function'
);

-- Cascade -------------------------------------------------------------------------

reset role;

delete from public.media_items where id = '00000000-0000-0000-0000-0000000000f2';

select is(
  (select count(*) from public.player_counts
    where media_item_id in ('00000000-0000-0000-0000-0000000000f1',
                            '00000000-0000-0000-0000-0000000000f2',
                            '00000000-0000-0000-0000-0000000000f3')),
  4::bigint,
  'removing a game from the catalog removes its series'
);

select is(
  (select count(*) from public.latest_player_counts
    where media_item_id in ('00000000-0000-0000-0000-0000000000f1',
                            '00000000-0000-0000-0000-0000000000f2',
                            '00000000-0000-0000-0000-0000000000f3')),
  1::bigint,
  'and its latest reading goes with it'
);

select * from finish();
rollback;
