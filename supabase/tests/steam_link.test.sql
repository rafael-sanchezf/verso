-- pgTAP tests for supabase/migrations/20260916210000_steam_link.sql.
-- Run with: supabase test db
--
-- Five things are under test: the shape of the two tables, who may touch them,
-- the single-use state that carries the OpenID round trip, the import gate, and
-- the playtime precedence rule -- which is the one piece of business logic in
-- the whole feature and lives in SQL precisely so it can be proved here, with
-- no stack, no network, and no Steam account.
--
-- The structural and service-role assertions run as the migration's owner,
-- which is what the Edge Functions' service role amounts to: RLS bypassed, the
-- way the IGDB mirror writes the catalog. The user-facing ones act through
-- `set local role authenticated` plus a forged request.jwt.claims, and then as
-- `anon`, so every read, every refused write, and every function call goes
-- through Row Level Security and the grants exactly as a supabase-js call
-- would.
--
-- Two users throughout, A and B, with overlapping libraries: every count is
-- scoped to the fixture ids, so a database that already has rows in it cannot
-- make a passing assertion out of someone else's data, and every "A cannot"
-- has a B whose rows are there to be reached.

begin;
select plan(112);

-- Structure: steam_library -----------------------------------------------------

select has_table('public', 'steam_library', 'steam_library exists');

select columns_are(
  'public', 'steam_library',
  array[
    'user_id', 'steam_app_id', 'media_item_id', 'name',
    'playtime_forever_minutes', 'playtime_2weeks_minutes',
    'last_played_at', 'fetched_at'
  ],
  'steam_library carries what Steam returns and nothing more'
);

select col_is_pk(
  'public', 'steam_library', array['user_id', 'steam_app_id'],
  'the pair is the key: a user owns an app once, so a re-import upserts rather than doubles'
);

select col_type_is('public', 'steam_library', 'playtime_forever_minutes', 'integer', 'total playtime is an integer');
select col_not_null('public', 'steam_library', 'playtime_forever_minutes', 'total playtime is not null: Steam always sends one');
select col_has_default('public', 'steam_library', 'playtime_forever_minutes', 'total playtime defaults to zero');
select col_is_null('public', 'steam_library', 'media_item_id', 'an app the catalog has no row for is still stored, unresolved');
select col_has_check('public', 'steam_library', 'steam_app_id', 'the app id has a check constraint');

select fk_ok(
  'public', 'steam_library', 'user_id',
  'auth', 'users', 'id',
  'steam_library.user_id references the account'
);

select fk_ok(
  'public', 'steam_library', 'media_item_id',
  'public', 'media_items', 'id',
  'steam_library.media_item_id references the catalog'
);

select is(
  (select confdeltype from pg_constraint where conname = 'steam_library_user_id_fkey'),
  'c'::"char",
  'deleting the account takes its library with it'
);

select is(
  (select confdeltype from pg_constraint where conname = 'steam_library_media_item_id_fkey'),
  'n'::"char",
  'a catalog row going away unresolves the library row, it does not delete the ownership fact'
);

select ok(
  to_regclass('public.steam_library_user_resolved') is not null,
  'steam_library_user_resolved exists'
);

select ok(
  to_regclass('public.steam_library_user_media_item') is not null,
  'steam_library_user_media_item exists'
);

-- Structure: steam_link_states -------------------------------------------------

select has_table('public', 'steam_link_states', 'steam_link_states exists');

select columns_are(
  'public', 'steam_link_states',
  array['state_hash', 'user_id', 'created_at', 'expires_at', 'consumed_at', 'response_nonce'],
  'steam_link_states holds a hash, an owner, a clock, and Valve''s nonce'
);

select col_is_pk(
  'public', 'steam_link_states', array['state_hash'],
  'the hash is the key, so the callback is a primary-key lookup'
);

select hasnt_column(
  'public', 'steam_link_states', 'state',
  'the state itself is never stored: a dump of this table contains nothing replayable'
);

select matches(
  pg_get_indexdef('public.steam_link_states_response_nonce_uniq'::regclass),
  'UNIQUE',
  'one assertion cannot be accepted twice, whatever state it arrives on'
);

select fk_ok(
  'public', 'steam_link_states', 'user_id',
  'auth', 'users', 'id',
  'a pending link attempt belongs to an account'
);

-- Row Level Security and grants -------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.steam_library'::regclass),
  'RLS on steam_library'
);

select policies_are(
  'public', 'steam_library',
  array['users manage their own steam library'],
  'one policy, the same shape user_entries has'
);

select is(
  (select polcmd::text from pg_policy where polrelid = 'public.steam_library'::regclass),
  '*',
  'the policy covers every operation: the rows are the user''s own data and they may delete them'
);

select table_privs_are(
  'public', 'steam_library', 'authenticated',
  array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'signed-in users have exactly the DML the policy then scopes to their own rows'
);

select table_privs_are(
  'public', 'steam_library', 'anon', array[]::text[],
  'a library is off the anonymous surface entirely'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.steam_link_states'::regclass),
  'RLS on steam_link_states'
);

select policies_are(
  'public', 'steam_link_states', array[]::text[],
  'no policy at all: RLS on with nothing allowed is how "service role only" is spelled'
);

select table_privs_are(
  'public', 'steam_link_states', 'authenticated', array[]::text[],
  'signed-in users have no privilege on the state table'
);

select table_privs_are(
  'public', 'steam_link_states', 'anon', array[]::text[],
  'and neither does anyone signed out'
);

select ok(
  has_table_privilege('service_role', 'public.steam_link_states', 'INSERT'),
  'the service role, which is what the Edge Function uses, can write states'
);

-- The functions: existence, security mode, and who may call them ----------------

select has_function('public', 'start_steam_link_state', array['uuid', 'text', 'integer'], 'start_steam_link_state exists');
select has_function('public', 'consume_steam_link_state', array['text', 'text'], 'consume_steam_link_state exists');
select has_function('public', 'begin_steam_import', array['uuid', 'interval'], 'begin_steam_import exists');
select has_function('public', 'apply_steam_playtime', array['uuid'], 'apply_steam_playtime exists');
select has_function('public', 'unlink_steam', array[]::text[], 'unlink_steam exists');
select has_function('public', 'forget_steam_link_attempts', array[]::text[], 'forget_steam_link_attempts exists');
select has_function('public', 'steam_backlog_candidates', array['integer'], 'steam_backlog_candidates exists');

select isnt_definer('public', 'unlink_steam', array[]::text[], 'unlink_steam is security invoker, so RLS is still the boundary');
select isnt_definer('public', 'steam_backlog_candidates', array['integer'], 'steam_backlog_candidates is security invoker, so it cannot show another user''s library');
select is_definer('public', 'forget_steam_link_attempts', array[]::text[], 'forget_steam_link_attempts is definer on purpose: it is the one way into a service-role-only table, and it takes no arguments');

select function_privs_are(
  'public', 'start_steam_link_state', array['uuid', 'text', 'integer'],
  'authenticated', array[]::text[],
  'a signed-in user cannot open a link attempt for a user id they name'
);

select function_privs_are(
  'public', 'consume_steam_link_state', array['text', 'text'],
  'authenticated', array[]::text[],
  'a signed-in user cannot spend a state'
);

select function_privs_are(
  'public', 'begin_steam_import', array['uuid', 'interval'],
  'authenticated', array[]::text[],
  'a signed-in user cannot claim an import slot for a user id they name, and so cannot skip the rate limit'
);

select function_privs_are(
  'public', 'apply_steam_playtime', array['uuid'],
  'authenticated', array[]::text[],
  'a signed-in user cannot run the playtime write for a user id they name'
);

select function_privs_are(
  'public', 'unlink_steam', array[]::text[],
  'authenticated', array['EXECUTE'],
  'unlinking is the user''s own act'
);

select function_privs_are(
  'public', 'unlink_steam', array[]::text[],
  'anon', array[]::text[],
  'unlink_steam is off the anonymous surface'
);

select function_privs_are(
  'public', 'forget_steam_link_attempts', array[]::text[],
  'authenticated', array['EXECUTE'],
  'dropping your own pending attempts is your own act too'
);

select function_privs_are(
  'public', 'steam_backlog_candidates', array['integer'],
  'authenticated', array['EXECUTE'],
  'signed-in users can read their own candidates'
);

select function_privs_are(
  'public', 'steam_backlog_candidates', array['integer'],
  'anon', array[]::text[],
  'candidates are off the anonymous surface'
);

-- Fixtures ----------------------------------------------------------------------
-- Two users with overlapping Steam libraries. Every playtime figure is distinct
-- so an assertion about which row was written cannot pass by coincidence.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com'),
  -- C exists only to try to claim someone else's Steam account.
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com');

insert into public.media_items (id, medium, title, year, cover_image_id, external_ids) values
  ('00000000-0000-0000-0000-0000000000f1', 'game', 'Hades', 2020, 'co_f1', '{"igdb": 1, "steam": 1145360}'),
  ('00000000-0000-0000-0000-0000000000f2', 'game', 'Celeste', 2018, 'co_f2', '{"igdb": 2, "steam": 504230}'),
  ('00000000-0000-0000-0000-0000000000f3', 'game', 'Outer Wilds', 2019, 'co_f3', '{"igdb": 3, "steam": 753640}'),
  ('00000000-0000-0000-0000-0000000000f4', 'game', 'Tunic', 2022, 'co_f4', '{"igdb": 4, "steam": 553420}'),
  ('00000000-0000-0000-0000-0000000000f5', 'game', 'Stardew Valley', 2016, 'co_f5', '{"igdb": 5, "steam": 413150}'),
  ('00000000-0000-0000-0000-0000000000f7', 'game', 'Dredge', 2023, 'co_f7', '{"igdb": 7, "steam": 1562430}');

-- A's library. 999999 is the unresolved case: a tool, a demo, or a game the
-- catalog has not mirrored. It is stored and it is never a candidate.
insert into public.steam_library
  (user_id, steam_app_id, media_item_id, name, playtime_forever_minutes, playtime_2weeks_minutes, last_played_at)
values
  ('00000000-0000-0000-0000-00000000000a', 1145360, '00000000-0000-0000-0000-0000000000f1', 'Hades', 1200, 60, now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000000a', 504230, '00000000-0000-0000-0000-0000000000f2', 'Celeste', 300, null, now() - interval '200 days'),
  ('00000000-0000-0000-0000-00000000000a', 753640, '00000000-0000-0000-0000-0000000000f3', 'Outer Wilds', 0, null, null),
  ('00000000-0000-0000-0000-00000000000a', 413150, '00000000-0000-0000-0000-0000000000f5', 'Stardew Valley', 700, null, now() - interval '9 days'),
  ('00000000-0000-0000-0000-00000000000a', 553420, '00000000-0000-0000-0000-0000000000f4', 'Tunic', 450, null, now() - interval '30 days'),
  ('00000000-0000-0000-0000-00000000000a', 1562430, '00000000-0000-0000-0000-0000000000f7', 'Dredge', 0, null, null),
  ('00000000-0000-0000-0000-00000000000a', 999999, null, 'Some Level Editor', 10, null, null);

-- B owns Hades too, with a different figure, so "A sees only A's" is a claim
-- about rows that genuinely exist for both.
insert into public.steam_library
  (user_id, steam_app_id, media_item_id, name, playtime_forever_minutes)
values
  ('00000000-0000-0000-0000-00000000000b', 1145360, '00000000-0000-0000-0000-0000000000f1', 'Hades', 5000);

-- A's entries. The four precedence cases, in order: no source yet, a manual
-- figure, a zero on the Steam side, and a figure Steam wrote last time.
insert into public.user_entries
  (user_id, media_item_id, status, playtime_minutes, playtime_source, played_platforms, started_at)
values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', 'playing', null, null, '{"Nintendo Switch"}', '2026-01-01T00:00:00Z'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f2', 'played', 999, 'manual', '{}', null),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f3', 'backlog', null, null, '{}', null),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f5', 'backlog', 100, 'steam', '{}', null);

insert into public.user_entries (user_id, media_item_id, status, playtime_minutes, playtime_source)
values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000f1', 'played', null, null);

insert into public.platform_links (user_id, platform, external_user_id) values
  ('00000000-0000-0000-0000-00000000000b', 'steam', '76561198000000002');

-- The single-use state --------------------------------------------------------
-- The whole point of this table: a handle that works once, briefly, for one
-- user, and cannot be told apart from a wrong guess when it does not work.

select ok(
  public.start_steam_link_state(
    '00000000-0000-0000-0000-00000000000a',
    repeat('a', 64)
  ) > now(),
  'opening a link attempt returns an expiry in the future'
);

-- The CTE is not decoration. `x between a and b` is parsed into
-- `x >= a and x <= b` with the left expression *copied*, so a volatile function
-- written straight into a BETWEEN is called twice -- and the second call here
-- would insert the same state_hash again and die on the primary key. A CTE
-- holding a volatile function is never inlined, so this evaluates it once.
with started as (
  select public.start_steam_link_state(
    '00000000-0000-0000-0000-00000000000a',
    repeat('b', 64),
    5
  ) as expires_at
)
select ok(
  s.expires_at between now() + interval '55 seconds' and now() + interval '65 seconds',
  'a TTL below a minute is clamped up to one, so a client cannot ask for a state that is already dead'
)
from started s;

select throws_ok(
  $$ select public.start_steam_link_state('00000000-0000-0000-0000-00000000000a', 'not-a-sha256') $$,
  '23514',
  null,
  'a state hash that is not 64 hex characters is refused'
);

select is(
  public.consume_steam_link_state(repeat('a', 64), 'nonce-1'),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'a fresh state hands back the user it was bound to'
);

select is(
  public.consume_steam_link_state(repeat('a', 64), 'nonce-2'),
  null::uuid,
  'the same state a second time is null: a replayed callback loses'
);

select is(
  public.consume_steam_link_state(repeat('c', 64), 'nonce-3'),
  null::uuid,
  'a state nobody issued is null, indistinguishable from one already spent'
);

insert into public.steam_link_states (state_hash, user_id, expires_at)
values (repeat('d', 64), '00000000-0000-0000-0000-00000000000a', now() - interval '1 minute');

select is(
  public.consume_steam_link_state(repeat('d', 64), 'nonce-4'),
  null::uuid,
  'an expired state is null too, ten minutes being the whole life of a link attempt'
);

select throws_ok(
  $$ select public.consume_steam_link_state(repeat('b', 64), 'nonce-1') $$,
  '23505',
  null,
  'Valve''s response_nonce is unique: the same assertion cannot be accepted on a second state'
);

select is(
  (select count(*) from public.steam_link_states where user_id = '00000000-0000-0000-0000-00000000000a'),
  3::bigint,
  'the states are still there after being spent, so a failure can still be explained'
);

-- The import gate --------------------------------------------------------------

select results_eq(
  $$ select allowed, steam_id from public.begin_steam_import('00000000-0000-0000-0000-00000000000a') $$,
  $$ values (false, null::text) $$,
  'an unlinked user is refused with no steam id: the app should offer the link, not a retry'
);

insert into public.platform_links (user_id, platform, external_user_id) values
  ('00000000-0000-0000-0000-00000000000a', 'steam', '76561198000000001');

select results_eq(
  $$ select allowed, retry_after_seconds, steam_id from public.begin_steam_import('00000000-0000-0000-0000-00000000000a') $$,
  $$ values (true, 0, '76561198000000001'::text) $$,
  'a linked user who has never imported is allowed, and gets their SteamID64 back'
);

select ok(
  (select last_synced_at from public.platform_links
    where user_id = '00000000-0000-0000-0000-00000000000a' and platform = 'steam') is not null,
  'the slot is claimed at the start of the import, so a run that dies still costs its ten minutes'
);

select ok(
  (select allowed from public.begin_steam_import('00000000-0000-0000-0000-00000000000a')) is false,
  'a second import straight afterwards is refused'
);

-- The comparison is inside the subquery for the same reason as above: BETWEEN
-- copies its left operand, and this one claims an import slot.
select ok(
  (select r.retry_after_seconds >= 1 and r.retry_after_seconds <= 600
     from public.begin_steam_import('00000000-0000-0000-0000-00000000000a') r),
  'and it says how long to wait, which is at most the ten-minute window'
);

select results_eq(
  $$ select allowed, steam_id from public.begin_steam_import(
       '00000000-0000-0000-0000-00000000000a', interval '0 seconds') $$,
  $$ values (true, '76561198000000001'::text) $$,
  'the window is an argument, so the caller decides the policy and this function only enforces it'
);

select ok(
  (select allowed from public.begin_steam_import('00000000-0000-0000-0000-00000000000b')) is true,
  'one user''s rate limit is not another''s: the lock is on their own row'
);

-- One Steam account, one person -------------------------------------------------
-- platform_links' primary key is (user_id, platform), which says a user has one
-- Steam account and nothing about the other direction. Without the unique index
-- below, C could claim B's SteamID64 and the next import would hand C B's
-- library, B's playtime and B's owned-but-untracked list.

select ok(
  to_regclass('public.platform_links_platform_external_uniq') is not null,
  'platform_links_platform_external_uniq exists'
);

select matches(
  pg_get_indexdef('public.platform_links_platform_external_uniq'::regclass),
  'UNIQUE',
  'and it is unique, which is the whole of the claim'
);

select throws_ok(
  $$ insert into public.platform_links (user_id, platform, external_user_id)
     values ('00000000-0000-0000-0000-00000000000c', 'steam', '76561198000000002') $$,
  '23505',
  null,
  'C cannot claim the SteamID64 B is already linked to'
);

select lives_ok(
  $$ insert into public.platform_links (user_id, platform, external_user_id)
     values ('00000000-0000-0000-0000-00000000000c', 'steam', '76561198000000003') $$,
  'C can link a Steam account of their own'
);

select lives_ok(
  $$ update public.platform_links set external_user_id = '76561198000000009'
      where user_id = '00000000-0000-0000-0000-00000000000c' and platform = 'steam' $$,
  'and re-linking to a different Steam account is still an ordinary write'
);

-- Playtime precedence ----------------------------------------------------------
-- Decision 4, one assertion per clause.

select is(
  public.apply_steam_playtime('00000000-0000-0000-0000-00000000000a'),
  2,
  'two of A''s four entries change: the one with no source, and the one Steam already owned'
);

select results_eq(
  $$ select playtime_minutes, playtime_source from public.user_entries
      where user_id = '00000000-0000-0000-0000-00000000000a'
        and media_item_id = '00000000-0000-0000-0000-0000000000f1' $$,
  $$ values (1200, 'steam'::text) $$,
  'an entry with no playtime source takes Steam''s figure and says so'
);

select results_eq(
  $$ select playtime_minutes, playtime_source from public.user_entries
      where user_id = '00000000-0000-0000-0000-00000000000a'
        and media_item_id = '00000000-0000-0000-0000-0000000000f5' $$,
  $$ values (700, 'steam'::text) $$,
  'a figure Steam wrote last time is refreshed'
);

select results_eq(
  $$ select playtime_minutes, playtime_source from public.user_entries
      where user_id = '00000000-0000-0000-0000-00000000000a'
        and media_item_id = '00000000-0000-0000-0000-0000000000f2' $$,
  $$ values (999, 'manual'::text) $$,
  'a figure the user typed is never overwritten, however wrong Steam thinks it is'
);

select results_eq(
  $$ select playtime_minutes, playtime_source from public.user_entries
      where user_id = '00000000-0000-0000-0000-00000000000a'
        and media_item_id = '00000000-0000-0000-0000-0000000000f3' $$,
  $$ values (null::integer, null::text) $$,
  'a zero from Steam writes nothing: "never played" and "playtime hidden" look identical from the API'
);

select is(
  public.apply_steam_playtime('00000000-0000-0000-0000-00000000000a'),
  0,
  'running it again changes nothing, so an import that found no news reports none'
);

select is(
  (select count(*) from public.user_entries where user_id = '00000000-0000-0000-0000-00000000000a'),
  4::bigint,
  'the import never creates an entry: Tunic and Dredge are owned and still untracked'
);

-- The played-on list was `owned_platforms` here until decision 26 dropped that
-- column (20261007100000_drop_ownership.sql). The claim is the same one: the
-- playtime write touches no platform list. Adding PC to where a game was
-- played is apply_steam_played_platforms' job, asserted in
-- supabase/tests/drop_ownership.test.sql.
select is(
  (select played_platforms from public.user_entries
    where user_id = '00000000-0000-0000-0000-00000000000a'
      and media_item_id = '00000000-0000-0000-0000-0000000000f1'),
  '{"Nintendo Switch"}'::text[],
  'the playtime write leaves the played-on list alone: that is apply_steam_played_platforms'' job'
);

select is(
  (select started_at from public.user_entries
    where user_id = '00000000-0000-0000-0000-00000000000a'
      and media_item_id = '00000000-0000-0000-0000-0000000000f1'),
  '2026-01-01T00:00:00Z'::timestamptz,
  'the started_at trigger does not fire for a playtime write, because the status did not change'
);

select is(
  (select backlog_position from public.user_entries
    where user_id = '00000000-0000-0000-0000-00000000000a'
      and media_item_id = '00000000-0000-0000-0000-0000000000f5'),
  1,
  'and neither does the backlog trigger: a Steam figure does not reshuffle the user''s queue'
);

select results_eq(
  $$ select playtime_minutes, playtime_source from public.user_entries
      where user_id = '00000000-0000-0000-0000-00000000000b'
        and media_item_id = '00000000-0000-0000-0000-0000000000f1' $$,
  $$ values (null::integer, null::text) $$,
  'B''s entry for the same game is untouched: the function takes one user and means it'
);

-- As a signed-in user ----------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is(
  (select count(*) from public.steam_library),
  7::bigint,
  'A sees their own seven library rows'
);

select is(
  (select count(*) from public.steam_library where user_id = '00000000-0000-0000-0000-00000000000b'),
  0::bigint,
  'and none of B''s, even when they name B'
);

select is(
  (select max(playtime_forever_minutes) from public.steam_library
    where steam_app_id = 1145360),
  1200,
  'the same game in two libraries reads as the caller''s own figure, never the other one'
);

select throws_ok(
  $$ insert into public.steam_library (user_id, steam_app_id, playtime_forever_minutes)
     values ('00000000-0000-0000-0000-00000000000b', 220, 5) $$,
  '42501',
  null,
  'A cannot write a row into B''s library'
);

select lives_ok(
  $$ insert into public.steam_library (user_id, steam_app_id, playtime_forever_minutes)
     values ('00000000-0000-0000-0000-00000000000a', 220, 5) $$,
  'A can write their own: the rows are their data, as on user_entries'
);

select is(
  (select count(*) from public.steam_library where user_id = '00000000-0000-0000-0000-00000000000a' and steam_app_id = 220),
  1::bigint,
  'and the row they wrote is there'
);

delete from public.steam_library where user_id = '00000000-0000-0000-0000-00000000000a' and steam_app_id = 220;

select throws_ok(
  $$ update public.steam_library set user_id = '00000000-0000-0000-0000-00000000000b'
       where user_id = '00000000-0000-0000-0000-00000000000a' and steam_app_id = 1145360 $$,
  '42501',
  null,
  'A cannot hand one of their rows to B either: the policy checks the row going in as well as the row coming out'
);

select throws_ok(
  $$ select count(*) from public.steam_link_states $$,
  '42501',
  null,
  'the state table is not readable by a signed-in user at all'
);

select throws_ok(
  $$ insert into public.steam_link_states (state_hash, user_id, expires_at)
     values (repeat('e', 64), '00000000-0000-0000-0000-00000000000a', now() + interval '1 hour') $$,
  '42501',
  null,
  'and it is not writable either, so nobody can mint themselves a state'
);

select throws_ok(
  $$ select public.consume_steam_link_state(repeat('e', 64), null) $$,
  '42501',
  null,
  'a signed-in user cannot call the consume function to find out whether a state exists'
);

select throws_ok(
  $$ select public.apply_steam_playtime('00000000-0000-0000-0000-00000000000b') $$,
  '42501',
  null,
  'nor the playtime write, for themselves or for anyone else'
);

-- steam_backlog_candidates ------------------------------------------------------

select results_eq(
  $$ select title, playtime_forever_minutes from public.steam_backlog_candidates() $$,
  $$ values ('Dredge'::text, 0), ('Tunic'::text, 450) $$,
  'the candidates are the games A owns on Steam and does not track, least played first'
);

select is(
  (select count(*) from public.steam_backlog_candidates() where title in ('Hades', 'Celeste', 'Outer Wilds', 'Stardew Valley')),
  0::bigint,
  'a game A already tracks is not a candidate, whatever its status'
);

select is(
  (select count(*) from public.steam_backlog_candidates() where name = 'Some Level Editor'),
  0::bigint,
  'an app the catalog cannot resolve is not a candidate: it is nothing the app could show or rank'
);

select is(
  (select count(*) from public.steam_backlog_candidates(1)),
  1::bigint,
  'the limit is honoured'
);

select is(
  (select count(*) from public.steam_backlog_candidates(100000)),
  2::bigint,
  'and an absurd limit is clamped rather than refused'
);

select is(
  (select media_item_id from public.steam_backlog_candidates(1)),
  '00000000-0000-0000-0000-0000000000f7'::uuid,
  'a candidate carries the catalog id, so accepting one is an ordinary entry write'
);

-- Unlink -------------------------------------------------------------------------

select lives_ok(
  $$ select public.forget_steam_link_attempts() $$,
  'a user can drop their own pending link attempts'
);

reset role;

select is(
  (select count(*) from public.steam_link_states where user_id = '00000000-0000-0000-0000-00000000000a'),
  0::bigint,
  'and they are gone'
);

insert into public.steam_link_states (state_hash, user_id, expires_at)
values (repeat('f', 64), '00000000-0000-0000-0000-00000000000b', now() + interval '10 minutes');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok(
  $$ select public.unlink_steam() $$,
  'unlinking is a single call'
);

select is(
  (select count(*) from public.steam_library),
  0::bigint,
  'the library is gone'
);

select is(
  (select count(*) from public.platform_links where platform = 'steam'),
  0::bigint,
  'and so is the link'
);

select results_eq(
  $$ select playtime_minutes, playtime_source from public.user_entries
      where media_item_id = '00000000-0000-0000-0000-0000000000f1' $$,
  $$ values (1200, 'steam'::text) $$,
  'imported playtime stays, still labelled steam: it is the user''s data now'
);

select lives_ok(
  $$ select public.forget_steam_link_attempts() $$,
  'dropping attempts when there are none is not an error'
);

reset role;

select is(
  (select count(*) from public.steam_library where user_id = '00000000-0000-0000-0000-00000000000b'),
  1::bigint,
  'B''s library survived A''s unlink'
);

select is(
  (select count(*) from public.platform_links where user_id = '00000000-0000-0000-0000-00000000000b'),
  1::bigint,
  'and so did B''s link'
);

select is(
  (select count(*) from public.steam_link_states where user_id = '00000000-0000-0000-0000-00000000000b'),
  1::bigint,
  'and B''s pending attempt, which A''s forget_steam_link_attempts could not reach'
);

-- Signed out ---------------------------------------------------------------------

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok(
  $$ select count(*) from public.steam_library $$,
  '42501',
  null,
  'a signed-out caller cannot read a library at all'
);

select throws_ok(
  $$ select count(*) from public.steam_link_states $$,
  '42501',
  null,
  'nor the state table'
);

select throws_ok(
  $$ select public.steam_backlog_candidates() $$,
  '42501',
  null,
  'nor call for candidates'
);

select throws_ok(
  $$ select public.unlink_steam() $$,
  '42501',
  null,
  'nor unlink anything'
);

reset role;

select * from finish();
rollback;
