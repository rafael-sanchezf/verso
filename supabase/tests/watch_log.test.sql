-- pgTAP tests for supabase/migrations/20261008200000_watch_log.sql.
-- Run with: supabase test db
--
-- Four things are under test:
--
-- 1. **The table and its grants**: RLS from its first migration, one owner
--    policy, the insert grant without user_id, the update grant without
--    media_item_id or user_id, nothing for anon.
-- 2. **The before-write trigger**: the trims, the entry created or moved to
--    played, finished_at at the latest watched_on, and the refusals (a game, a
--    series, an unknown item, a row for someone else).
-- 3. **The after-change trigger**: finished_at following an edited day and a
--    deleted row, down to null, with status left alone.
-- 4. **Two users**: B sees, edits and deletes none of A's rows, and B's diary
--    moves B's entry only. Then the cascade from auth.users.
--
-- Users act through `set local role authenticated` plus a forged
-- request.jwt.claims, so every write goes through the grants and Row Level
-- Security as a supabase-js call would. Ids are in the ...b1 range; the
-- fixture's TMDB and IGDB ids are negative, so nothing meets a mirrored
-- catalog.

begin;
select plan(49);

-- ==============================================================================
-- 1. Structure and grants
-- ==============================================================================

-- 1
select has_table('public', 'watch_log', 'watch_log exists');

-- 2
select ok(
  (select relrowsecurity from pg_class where oid = 'public.watch_log'::regclass),
  'RLS is on for watch_log from its first migration'
);

-- 3
select policies_are(
  'public', 'watch_log',
  array['users manage their own diary'],
  'watch_log has one policy, owner-only for every command'
);

-- 4
select col_is_null('public', 'watch_log', 'watched_on', 'watched_on is nullable since 20261013100000_movie_screens.sql: a bulk or import row may have no day (the check that keeps a log row dated is in movie_screens.test.sql)');

-- 5
select col_hasnt_default('public', 'watch_log', 'watched_on', 'watched_on has no default: the app sends the day where the user is');

-- 6
select col_default_is('public', 'watch_log', 'user_id', 'auth.uid()', 'user_id defaults to the caller');

-- 7
select ok(
  has_table_privilege('authenticated', 'public.watch_log', 'select')
  and has_table_privilege('authenticated', 'public.watch_log', 'delete'),
  'signed-in users may read and delete diary rows (the policy decides whose)'
);

-- 8
select ok(
  has_column_privilege('authenticated', 'public.watch_log', 'media_item_id', 'insert')
  and has_column_privilege('authenticated', 'public.watch_log', 'watched_on', 'insert')
  and has_column_privilege('authenticated', 'public.watch_log', 'place', 'insert')
  and has_column_privilege('authenticated', 'public.watch_log', 'note', 'insert')
  and not has_column_privilege('authenticated', 'public.watch_log', 'user_id', 'insert')
  and not has_column_privilege('authenticated', 'public.watch_log', 'id', 'insert')
  and not has_column_privilege('authenticated', 'public.watch_log', 'created_at', 'insert'),
  'the insert grant is the film, the day, the place and the note: the user, the id and the clock come from the defaults'
);

-- 9
select ok(
  has_column_privilege('authenticated', 'public.watch_log', 'watched_on', 'update')
  and has_column_privilege('authenticated', 'public.watch_log', 'place', 'update')
  and has_column_privilege('authenticated', 'public.watch_log', 'note', 'update')
  and not has_column_privilege('authenticated', 'public.watch_log', 'media_item_id', 'update')
  and not has_column_privilege('authenticated', 'public.watch_log', 'user_id', 'update'),
  'the update grant is the day, the place and the note: a row never moves to another film or user'
);

-- 10
select ok(
  not has_table_privilege('anon', 'public.watch_log', 'select')
  and not has_table_privilege('anon', 'public.watch_log', 'insert')
  and not has_table_privilege('anon', 'public.watch_log', 'update')
  and not has_table_privilege('anon', 'public.watch_log', 'delete'),
  'anon has no privilege on watch_log at all'
);

-- 11
select has_trigger('public', 'watch_log', 'watch_log_before_write', 'the before-write trigger is on watch_log');

-- 12
select has_trigger('public', 'watch_log', 'watch_log_after_change', 'the after-change trigger is on watch_log');

-- 13
select ok(
  (select bool_and(not p.prosecdef and p.proconfig @> array['search_path=public, extensions'])
     from pg_proc p
    where p.oid in ('public.watch_log_before_write()'::regprocedure, 'public.watch_log_after_change()'::regprocedure)),
  'both trigger functions are security invoker with a pinned search_path'
);

-- 14
select ok(
  not has_function_privilege('anon', 'public.watch_log_before_write()', 'execute')
  and not has_function_privilege('anon', 'public.watch_log_after_change()', 'execute'),
  'anon cannot execute either trigger function'
);

-- ==============================================================================
-- Fixtures
-- ==============================================================================
--
-- Three films, a game and a series. A tracks f2 as backlog and f3 as dropped;
-- f1 is tracked by nobody. B tracks nothing.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000b10aa', 'diary-a@example.com'),
  ('00000000-0000-0000-0000-0000000b10bb', 'diary-b@example.com');

insert into public.media_items (id, medium, title, year, cover_image_id, external_ids) values
  ('00000000-0000-0000-0000-0000000b1f01', 'movie', 'Diary Film One', 2021, '/d1.jpg', '{"tmdb": -81001}'),
  ('00000000-0000-0000-0000-0000000b1f02', 'movie', 'Diary Film Two', 2022, '/d2.jpg', '{"tmdb": -81002}'),
  ('00000000-0000-0000-0000-0000000b1f03', 'movie', 'Diary Film Three', 2023, '/d3.jpg', '{"tmdb": -81003}'),
  ('00000000-0000-0000-0000-0000000b1e01', 'game', 'Diary Game', 2020, 'dg1', '{"igdb": -81101}'),
  ('00000000-0000-0000-0000-0000000b1d01', 'tv', 'Diary Series', 2020, '/ds.jpg', '{"tmdb": -81201}');

insert into public.movie_details (media_item_id, tmdb_id, genres) values
  ('00000000-0000-0000-0000-0000000b1f01', -81001, '{"Diary Drama Test"}'),
  ('00000000-0000-0000-0000-0000000b1f02', -81002, '{"Diary Drama Test"}'),
  ('00000000-0000-0000-0000-0000000b1f03', -81003, '{"Diary Drama Test"}');

insert into public.user_entries (user_id, media_item_id, status) values
  ('00000000-0000-0000-0000-0000000b10aa', '00000000-0000-0000-0000-0000000b1f02', 'backlog'),
  ('00000000-0000-0000-0000-0000000b10aa', '00000000-0000-0000-0000-0000000b1f03', 'dropped');

-- ==============================================================================
-- 2. The before-write trigger, as A
-- ==============================================================================

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000b10aa","role":"authenticated"}';

insert into public.watch_log (media_item_id, watched_on, place, note)
values ('00000000-0000-0000-0000-0000000b1f01', '2026-09-02', '  Netflix ', '   ');

-- 15
select results_eq(
  $$ select user_id, place, note from public.watch_log where media_item_id = '00000000-0000-0000-0000-0000000b1f01' $$,
  $$ values ('00000000-0000-0000-0000-0000000b10aa'::uuid, 'Netflix'::text, null::text) $$,
  'the row is the caller''s, the place is trimmed, and a blank note is null'
);

-- 16
select results_eq(
  $$ select status::text, finished_at from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b1f01' $$,
  $$ values ('played'::text, '2026-09-02'::date) $$,
  'a film nobody tracked gets its entry from the first row: played, finished on the day watched'
);

insert into public.watch_log (media_item_id, watched_on) values ('00000000-0000-0000-0000-0000000b1f01', '2026-08-01');

-- 17
select is(
  (select finished_at from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b1f01'),
  '2026-09-02'::date,
  'an older watch logged later leaves finished_at at the latest day'
);

insert into public.watch_log (media_item_id, watched_on, place, note)
values ('00000000-0000-0000-0000-0000000b1f01', '2026-09-20', 'theater', 'Rewatch on the big screen');

-- 18
select is(
  (select finished_at from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b1f01'),
  '2026-09-20'::date,
  'a newer watch moves finished_at to its day'
);

-- 19
select is(
  (select count(*) from public.watch_log where media_item_id = '00000000-0000-0000-0000-0000000b1f01'),
  3::bigint,
  'a film can have many diary rows: rewatches are normal'
);

-- 20
select is(
  (select count(*) from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b1f01'),
  1::bigint,
  'and still exactly one entry'
);

insert into public.watch_log (media_item_id, watched_on) values ('00000000-0000-0000-0000-0000000b1f02', '2026-10-01');

-- 21
select results_eq(
  $$ select status::text, finished_at, backlog_position from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b1f02' $$,
  $$ values ('played'::text, '2026-10-01'::date, null::integer) $$,
  'a want-to-watch film moves to played and leaves the backlog'
);

insert into public.watch_log (media_item_id, watched_on) values ('00000000-0000-0000-0000-0000000b1f03', '2026-10-02');

-- 22
select is(
  (select status::text from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b1f03'),
  'played',
  'a dropped film watched after all moves to played'
);

-- 23
select throws_ok(
  $$ insert into public.watch_log (media_item_id, watched_on) values ('00000000-0000-0000-0000-0000000b1e01', '2026-10-01') $$,
  '22023',
  null,
  'a game cannot be logged in the diary'
);

-- 24
select throws_ok(
  $$ insert into public.watch_log (media_item_id, watched_on) values ('00000000-0000-0000-0000-0000000b1d01', '2026-10-01') $$,
  '22023',
  null,
  'nor can a series, while TV is held'
);

-- 25
select throws_ok(
  $$ insert into public.watch_log (media_item_id, watched_on) values ('00000000-0000-0000-0000-0000000b1fff', '2026-10-01') $$,
  '23503',
  null,
  'a media item the catalog does not have is 23503'
);

-- 26
select is(
  (select count(*) from public.user_entries
    where media_item_id in ('00000000-0000-0000-0000-0000000b1e01', '00000000-0000-0000-0000-0000000b1d01')),
  0::bigint,
  'a refused row writes no entry'
);

-- 27
select throws_ok(
  $$ insert into public.watch_log (user_id, media_item_id, watched_on)
     values ('00000000-0000-0000-0000-0000000b10bb', '00000000-0000-0000-0000-0000000b1f01', '2026-10-01') $$,
  '42501',
  null,
  'a client cannot name the user, not even another one'
);

-- 28
select throws_ok(
  $$ insert into public.watch_log (media_item_id, watched_on, place) values ('00000000-0000-0000-0000-0000000b1f01', '2026-10-01', repeat('x', 101)) $$,
  '23514',
  null,
  'a place over 100 characters is refused'
);

-- 29
select throws_ok(
  $$ insert into public.watch_log (media_item_id, watched_on) values ('00000000-0000-0000-0000-0000000b1f01', null) $$,
  '23514',
  null,
  'a log row needs a day (watch_log_dated_log_check, 20261013100000_movie_screens.sql)'
);

-- ==============================================================================
-- 3. The after-change trigger, as A
-- ==============================================================================

update public.watch_log set watched_on = '2026-07-01'
 where media_item_id = '00000000-0000-0000-0000-0000000b1f01' and watched_on = '2026-09-20';

-- 30
select is(
  (select finished_at from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b1f01'),
  '2026-09-02'::date,
  'moving the latest watch to an earlier day puts finished_at on the latest that remains'
);

update public.watch_log set place = '  ', note = ' Better the second time '
 where media_item_id = '00000000-0000-0000-0000-0000000b1f01' and watched_on = '2026-07-01';

-- 31
select results_eq(
  $$ select place, note from public.watch_log where media_item_id = '00000000-0000-0000-0000-0000000b1f01' and watched_on = '2026-07-01' $$,
  $$ values (null::text, 'Better the second time'::text) $$,
  'an edit is trimmed too: a blank place is null'
);

-- 32
select throws_ok(
  $$ update public.watch_log set media_item_id = '00000000-0000-0000-0000-0000000b1f02'
      where media_item_id = '00000000-0000-0000-0000-0000000b1f01' $$,
  '42501',
  null,
  'a row cannot be moved to another film'
);

delete from public.watch_log
 where media_item_id = '00000000-0000-0000-0000-0000000b1f01' and watched_on = '2026-09-02';

-- 33
select is(
  (select finished_at from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b1f01'),
  '2026-08-01'::date,
  'deleting the latest watch puts finished_at on the latest that remains'
);

delete from public.watch_log where media_item_id = '00000000-0000-0000-0000-0000000b1f01';

-- 34
select results_eq(
  $$ select status::text, finished_at from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b1f01' $$,
  $$ values ('played'::text, null::date) $$,
  'deleting every row clears finished_at and leaves the film watched'
);

delete from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b1f02';

-- 35
select is(
  (select count(*) from public.watch_log where media_item_id = '00000000-0000-0000-0000-0000000b1f02'),
  1::bigint,
  'removing the entry leaves its diary, as it leaves a ranking'
);

insert into public.watch_log (media_item_id, watched_on) values ('00000000-0000-0000-0000-0000000b1f02', '2026-10-05');

-- 36
select results_eq(
  $$ select status::text, finished_at from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b1f02' $$,
  $$ values ('played'::text, '2026-10-05'::date) $$,
  'and the next row recreates the entry, finished on the latest of all the rows'
);

-- ==============================================================================
-- 4. Two users
-- ==============================================================================

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000b10bb","role":"authenticated"}';

-- 37
select is((select count(*) from public.watch_log), 0::bigint, 'B sees none of A''s diary');

update public.watch_log set note = 'hacked' where media_item_id = '00000000-0000-0000-0000-0000000b1f02';
delete from public.watch_log where media_item_id = '00000000-0000-0000-0000-0000000b1f03';

insert into public.watch_log (media_item_id, watched_on, place) values ('00000000-0000-0000-0000-0000000b1f02', '2026-10-06', 'Max');

-- 38
select results_eq(
  $$ select status::text, finished_at from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b1f02' $$,
  $$ values ('played'::text, '2026-10-06'::date) $$,
  'B''s row makes B''s own entry'
);

-- 39
select is((select count(*) from public.watch_log), 1::bigint, 'B sees B''s one row');

-- 40
select is((select count(*) from public.user_entries), 1::bigint, 'B sees B''s one entry');

reset role;

-- 41
select is(
  (select count(*) from public.watch_log
    where user_id = '00000000-0000-0000-0000-0000000b10aa' and note = 'hacked'),
  0::bigint,
  'B''s update reached none of A''s rows'
);

-- 42
select is(
  (select count(*) from public.watch_log
    where user_id = '00000000-0000-0000-0000-0000000b10aa' and media_item_id = '00000000-0000-0000-0000-0000000b1f03'),
  1::bigint,
  'B''s delete reached none of A''s rows'
);

-- 43
select is(
  (select finished_at from public.user_entries
    where user_id = '00000000-0000-0000-0000-0000000b10aa' and media_item_id = '00000000-0000-0000-0000-0000000b1f02'),
  '2026-10-05'::date,
  'B''s later watch of the same film leaves A''s finished_at alone'
);

-- 44
select is(
  (select count(*) from public.watch_log where user_id = '00000000-0000-0000-0000-0000000b10aa'),
  3::bigint,
  'A''s diary is intact: two rows of f2 and one of f3 (f1''s were all deleted above)'
);

-- 45: the service role may write any user's diary (an import), but a session
-- that is somebody cannot write as somebody else, whatever its grants.
set local role service_role;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000b10aa","role":"service_role"}';

select throws_ok(
  $$ insert into public.watch_log (user_id, media_item_id, watched_on)
     values ('00000000-0000-0000-0000-0000000b10bb', '00000000-0000-0000-0000-0000000b1f03', '2026-10-01') $$,
  '42501',
  'a diary row belongs to the user who writes it',
  'a session with a user cannot write a row for another, even with the column grant'
);

set local request.jwt.claims to '{"role":"service_role"}';

insert into public.watch_log (user_id, media_item_id, watched_on)
values ('00000000-0000-0000-0000-0000000b10bb', '00000000-0000-0000-0000-0000000b1f03', '2026-10-03');

-- 46
select results_eq(
  $$ select status::text, finished_at from public.user_entries
      where user_id = '00000000-0000-0000-0000-0000000b10bb' and media_item_id = '00000000-0000-0000-0000-0000000b1f03' $$,
  $$ values ('played'::text, '2026-10-03'::date) $$,
  'the service role writes a named user''s row, and the trigger makes that user''s entry'
);

-- 47: anon
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok(
  $$ select count(*) from public.watch_log $$,
  '42501',
  null,
  'anon cannot read the diary at all'
);

-- 48 and 49: the cascade from auth.users takes the diary with the account and
-- leaves the other user's.
reset role;

delete from auth.users where id = '00000000-0000-0000-0000-0000000b10bb';

select is(
  (select count(*) from public.watch_log where user_id = '00000000-0000-0000-0000-0000000b10bb'),
  0::bigint,
  'deleting an account deletes its diary'
);

select is(
  (select count(*) from public.watch_log where user_id = '00000000-0000-0000-0000-0000000b10aa'),
  3::bigint,
  'and leaves everyone else''s'
);

select * from finish();
rollback;
