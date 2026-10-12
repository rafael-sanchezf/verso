-- pgTAP tests for supabase/migrations/20260916183000_game_availability.sql.
-- Run with: supabase test db
--
-- Four things are under test: the shape of game_availability, the identity the
-- primary key states, who may read and write it, and the meaning of
-- `removed_at` -- which is the only part of this table a reader has to
-- understand, because "on the service right now" is `removed_at is null` and
-- nothing else.
--
-- The structural assertions run as the migration's owner. The behavioural ones
-- act as a signed-in user through `set local role authenticated` plus a forged
-- request.jwt.claims, and then as `anon`, so every read and every refused write
-- goes through Row Level Security and the grants exactly as a supabase-js call
-- would. The rows themselves are inserted as the owner, which is the only way
-- they ever get there: the nightly job writes as the service role, and RLS is
-- bypassed for it the same way it is for the IGDB mirror.
--
-- Every count is scoped to this file's own fixture ids. The suite has to pass
-- on a database the live packages/api tests have already dirtied, not only on
-- a fresh reset (PR #24).

begin;
select plan(57);

-- Structure -------------------------------------------------------------------

select has_table('public', 'game_availability', 'game_availability exists');
select has_column('public', 'game_availability', 'media_item_id', 'game_availability has media_item_id');
select has_column('public', 'game_availability', 'service', 'game_availability has service');
select has_column('public', 'game_availability', 'region', 'game_availability has region');
select has_column('public', 'game_availability', 'source_ref', 'game_availability has source_ref');
select has_column('public', 'game_availability', 'first_seen_at', 'game_availability has first_seen_at');
select has_column('public', 'game_availability', 'last_seen_at', 'game_availability has last_seen_at');
select has_column('public', 'game_availability', 'removed_at', 'game_availability has removed_at');

select col_type_is('public', 'game_availability', 'media_item_id', 'uuid', 'media_item_id is a uuid');
select col_type_is('public', 'game_availability', 'service', 'text', 'service is text, not an enum: a new subscription is a new row, never a migration');
select col_type_is('public', 'game_availability', 'region', 'text', 'region is text');
select col_type_is('public', 'game_availability', 'source_ref', 'text', 'source_ref is text: a Microsoft product id is not a number');
select col_type_is('public', 'game_availability', 'first_seen_at', 'timestamp with time zone', 'first_seen_at is a timestamptz');
select col_type_is('public', 'game_availability', 'last_seen_at', 'timestamp with time zone', 'last_seen_at is a timestamptz');
select col_type_is('public', 'game_availability', 'removed_at', 'timestamp with time zone', 'removed_at is a timestamptz');

select col_not_null('public', 'game_availability', 'service', 'service is not null');
select col_not_null('public', 'game_availability', 'region', 'region is not null');
select col_not_null('public', 'game_availability', 'first_seen_at', 'first_seen_at is not null');
select col_not_null('public', 'game_availability', 'last_seen_at', 'last_seen_at is not null');
select col_is_null('public', 'game_availability', 'source_ref', 'source_ref is nullable: not every source hands us an id');
select col_is_null('public', 'game_availability', 'removed_at', 'removed_at is nullable, and null is what "available now" means');

select col_default_is('public', 'game_availability', 'region', 'US', 'region defaults to US, the one market V1 asks any source about');

select col_is_pk(
  'public', 'game_availability', array['media_item_id', 'service', 'region'],
  'the triple is the key: one row per game per service per market'
);

-- No user_id anywhere: which services a game is on is a fact about the game,
-- and the job must not be able to record who asked even by accident.
select hasnt_column('public', 'game_availability', 'user_id', 'availability says nothing about who is playing');

select fk_ok(
  'public', 'game_availability', 'media_item_id',
  'public', 'media_items', 'id',
  'game_availability.media_item_id references the catalog'
);

select is(
  (select confdeltype from pg_constraint where conname = 'game_availability_media_item_id_fkey'),
  'c'::"char",
  'dropping a catalog row takes its availability with it'
);

select ok(
  to_regclass('public.game_availability_current') is not null,
  'game_availability_current exists'
);

select matches(
  pg_get_indexdef('public.game_availability_current'::regclass),
  'INCLUDE \(service, region, first_seen_at\)',
  'the game page read rides entirely in the index'
);

select matches(
  pg_get_indexdef('public.game_availability_current'::regclass),
  'WHERE \(removed_at IS NULL\)',
  'and it is partial, so every row of every game that ever left a service is out of the scan'
);

select ok(
  to_regclass('public.game_availability_service_current') is not null,
  'game_availability_service_current exists'
);

select matches(
  pg_get_indexdef('public.game_availability_service_current'::regclass),
  'btree \(service, region\) WHERE \(removed_at IS NULL\)',
  'the job closes out one service a night without scanning the table'
);

-- Row Level Security ----------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.game_availability'::regclass),
  'RLS on game_availability'
);

select policies_are(
  'public', 'game_availability',
  array['availability is readable by signed-in users'],
  'exactly one policy: there is no way for a client to invent an availability row'
);

select is(
  (select polcmd::text from pg_policy where polrelid = 'public.game_availability'::regclass),
  'r',
  'the one policy is a select policy'
);

select table_privs_are(
  'public', 'game_availability', 'authenticated', array['SELECT'],
  'signed-in users may read game_availability and nothing else'
);

select table_privs_are(
  'public', 'game_availability', 'anon', array['SELECT'],
  'a signed-out caller may ask, and RLS is what answers: no policy, so no rows'
);

select ok(
  has_table_privilege('service_role', 'public.game_availability', 'INSERT'),
  'the service role, which is what the nightly job uses, can write'
);

-- Fixtures --------------------------------------------------------------------
-- Three games. One is on two services now and was on a third until last month;
-- one is on nothing at all; one is only ever used to prove the cascade.

insert into public.media_items (id, medium, title, year, external_ids) values
  ('00000000-0000-0000-0000-0000000000a1', 'game', 'Availability Hades', 2020, '{"igdb": 9000001, "steam": 1145360}'),
  ('00000000-0000-0000-0000-0000000000a2', 'game', 'Availability Celeste', 2018, '{"igdb": 9000002, "steam": 504230}'),
  ('00000000-0000-0000-0000-0000000000a3', 'game', 'Availability Outer Wilds', 2019, '{"igdb": 9000003}');

insert into public.game_availability
  (media_item_id, service, region, source_ref, first_seen_at, last_seen_at, removed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'game_pass_console', 'US', '9NPDN9R45JX4',
   now() - interval '90 days', now(), null),
  ('00000000-0000-0000-0000-0000000000a1', 'geforce_now', 'US', '100932911',
   now() - interval '400 days', now(), null),
  ('00000000-0000-0000-0000-0000000000a1', 'ea_play', 'US', 'BWVBNCMF22ZK',
   now() - interval '300 days', now() - interval '31 days', now() - interval '30 days'),
  ('00000000-0000-0000-0000-0000000000a3', 'geforce_now', 'US', '100238411',
   now() - interval '10 days', now(), null);

-- The identity the key states ---------------------------------------------------

select throws_ok(
  $$ insert into public.game_availability (media_item_id, service, region)
     values ('00000000-0000-0000-0000-0000000000a1', 'game_pass_console', 'US') $$,
  '23505',
  null,
  'a game cannot be on one service in one market twice'
);

select lives_ok(
  $$ insert into public.game_availability (media_item_id, service, region)
     values ('00000000-0000-0000-0000-0000000000a1', 'game_pass_console', 'GB') $$,
  'the same game on the same service in another market is a different row'
);

delete from public.game_availability
 where media_item_id = '00000000-0000-0000-0000-0000000000a1' and region = 'GB';

select lives_ok(
  $$ insert into public.game_availability (media_item_id, service)
     values ('00000000-0000-0000-0000-0000000000a2', 'game_pass_pc') $$,
  'the job may write a row with nothing but the game and the service'
);

select is(
  (select region from public.game_availability
    where media_item_id = '00000000-0000-0000-0000-0000000000a2'),
  'US',
  'and it lands in US'
);

select ok(
  (select first_seen_at = last_seen_at and removed_at is null
     from public.game_availability
    where media_item_id = '00000000-0000-0000-0000-0000000000a2'),
  'a brand new row is seen now, first and last, and is not removed'
);

delete from public.game_availability
 where media_item_id = '00000000-0000-0000-0000-0000000000a2';

-- removed_at semantics ----------------------------------------------------------
-- The whole contract of this table in four assertions: null means now, a
-- timestamp means gone, history survives, and a game that comes back keeps the
-- date it first arrived.

select is(
  (select count(*) from public.game_availability
    where media_item_id = '00000000-0000-0000-0000-0000000000a1'),
  3::bigint,
  'the game has three rows, because one of them is a service it has left'
);

select results_eq(
  $$ select service from public.game_availability
      where media_item_id = '00000000-0000-0000-0000-0000000000a1'
        and removed_at is null
      order by service $$,
  $$ values ('game_pass_console'), ('geforce_now') $$,
  'and only two of them are what "where to play" means'
);

select is(
  (select service from public.game_availability
    where media_item_id = '00000000-0000-0000-0000-0000000000a1' and removed_at is not null),
  'ea_play',
  'the row it left is still there, dated: "left in March" is worth more than a missing row'
);

-- What the nightly job's reconciliation does, written out as the two statements
-- it runs: everything it saw gets that run's instant as last_seen_at and a
-- cleared removed_at, then everything it did not see and had not already closed
-- gets removed_at.
--
-- Both statements take the run's instant as a parameter rather than calling
-- now(), which is also how packages/catalog writes them, and for a reason this
-- file would otherwise hide: now() is the *transaction's* start time, so a
-- close-out written as `last_seen_at < now()` can never fire against rows the
-- same transaction just touched. Two explicit instants, two minutes and one
-- minute ago, stand in for two nightly runs.
update public.game_availability
   set last_seen_at = now() - interval '2 minutes', removed_at = null
 where media_item_id = '00000000-0000-0000-0000-0000000000a1'
   and service = 'ea_play' and region = 'US';

select ok(
  (select removed_at is null and first_seen_at < now() - interval '299 days'
     from public.game_availability
    where media_item_id = '00000000-0000-0000-0000-0000000000a1' and service = 'ea_play'),
  'a game that comes back is available again and keeps the day it first arrived'
);

update public.game_availability
   set removed_at = now() - interval '1 minute'
 where service = 'ea_play' and region = 'US' and removed_at is null
   and last_seen_at < now() - interval '1 minute'
   -- The real statement is scoped to a service and a region and nothing else,
   -- which is right for a job that has just seen the whole service. Here it is
   -- scoped to this file's fixtures as well, because the suite has to be safe
   -- on a database the live packages/api tests have already written ea_play
   -- rows to (PR #24). The predicate under test is the three lines above.
   and media_item_id in ('00000000-0000-0000-0000-0000000000a1',
                         '00000000-0000-0000-0000-0000000000a2',
                         '00000000-0000-0000-0000-0000000000a3');

select ok(
  (select removed_at is not null
     from public.game_availability
    where media_item_id = '00000000-0000-0000-0000-0000000000a1' and service = 'ea_play'),
  'and a run that no longer finds it closes the row again rather than deleting it'
);

-- Reading, as a signed-in user ---------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is(
  (select count(*) from public.game_availability
    where media_item_id in ('00000000-0000-0000-0000-0000000000a1',
                            '00000000-0000-0000-0000-0000000000a2',
                            '00000000-0000-0000-0000-0000000000a3')),
  4::bigint,
  'a signed-in user can read every row: these are facts about games, not about people'
);

select results_eq(
  $$ select service, region from public.game_availability
      where media_item_id = '00000000-0000-0000-0000-0000000000a1'
        and removed_at is null
      order by service $$,
  $$ values ('game_pass_console', 'US'), ('geforce_now', 'US') $$,
  'the game page read is one game, removed rows excluded'
);

select is(
  (select count(*) from public.game_availability
    where media_item_id = '00000000-0000-0000-0000-0000000000a2' and removed_at is null),
  0::bigint,
  'a game on no subscription has nothing to show, which is not an error'
);

-- Writing, as a signed-in user ----------------------------------------------------
-- All three are refused before RLS even has an opinion, because the grant is
-- SELECT alone. Same SQLSTATE either way, which is the point: a client has no
-- way to tell a missing policy from a missing privilege, and no way through.

select throws_ok(
  $$ insert into public.game_availability (media_item_id, service, region)
     values ('00000000-0000-0000-0000-0000000000a2', 'game_pass_console', 'US') $$,
  '42501',
  null,
  'a signed-in user cannot put a game on Game Pass'
);

select throws_ok(
  $$ update public.game_availability set removed_at = null $$,
  '42501',
  null,
  'a signed-in user cannot bring a removed row back'
);

select throws_ok(
  $$ delete from public.game_availability $$,
  '42501',
  null,
  'a signed-in user cannot delete history'
);

select is(
  (select count(*) from public.game_availability
    where media_item_id in ('00000000-0000-0000-0000-0000000000a1',
                            '00000000-0000-0000-0000-0000000000a2',
                            '00000000-0000-0000-0000-0000000000a3')),
  4::bigint,
  'and none of that changed anything'
);

-- Signed out -----------------------------------------------------------------------

set local role anon;

select is(
  (select count(*) from public.game_availability
    where media_item_id in ('00000000-0000-0000-0000-0000000000a1',
                            '00000000-0000-0000-0000-0000000000a2',
                            '00000000-0000-0000-0000-0000000000a3')),
  0::bigint,
  'a signed-out caller sees nothing: an empty answer, not an error a screen has to handle'
);

select throws_ok(
  $$ insert into public.game_availability (media_item_id, service)
     values ('00000000-0000-0000-0000-0000000000a2', 'ea_play') $$,
  '42501',
  null,
  'nor write one'
);

-- Cascade ----------------------------------------------------------------------------

reset role;

delete from public.media_items where id = '00000000-0000-0000-0000-0000000000a1';

select is(
  (select count(*) from public.game_availability
    where media_item_id in ('00000000-0000-0000-0000-0000000000a1',
                            '00000000-0000-0000-0000-0000000000a2',
                            '00000000-0000-0000-0000-0000000000a3')),
  1::bigint,
  'removing a game from the catalog removes its availability, closed rows included'
);

select * from finish();
rollback;
