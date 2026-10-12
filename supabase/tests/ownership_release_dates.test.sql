-- pgTAP tests for supabase/migrations/20260915235900_ownership_release_dates.sql.
-- Run with: supabase test db
--
-- Three things are under test: the columns and their defaults, the started_at
-- trigger, and that the new columns are as private as the rest of user_entries.
--
-- `owned_platforms`, the third column this migration added, was dropped by
-- 20261007100000_drop_ownership.sql (decision 26, ownership out of the
-- product). Its assertions left with it; supabase/tests/drop_ownership.test.sql
-- asserts that it is gone.
--
-- The structural assertions run as the migration's owner. Everything after
-- them acts as two users through `set local role authenticated` plus a forged
-- request.jwt.claims, so every write goes through Row Level Security exactly as
-- a supabase-js call would.

begin;
select plan(47);

-- Structure -------------------------------------------------------------------

-- media_items.release_date, and the index "Coming up" and "Upcoming" read.

select has_column('public', 'media_items', 'release_date', 'media_items has release_date');
select col_type_is('public', 'media_items', 'release_date', 'date', 'release_date is a date, not a timestamp');
select col_is_null('public', 'media_items', 'release_date', 'release_date is nullable: IGDB omits a date for unannounced games');
select col_type_is('public', 'media_items', 'year', 'smallint', 'year is kept for display alongside release_date');

select ok(
  to_regclass('public.media_items_medium_release_date') is not null,
  'media_items_medium_release_date exists'
);

select matches(
  pg_get_indexdef('public.media_items_medium_release_date'::regclass),
  'btree \(medium, release_date\)',
  'the release-date index leads with medium, so one medium scans by date'
);

-- user_entries: the two personal dates.

select has_column('public', 'user_entries', 'started_at', 'user_entries has started_at');
select col_type_is('public', 'user_entries', 'started_at', 'timestamp with time zone', 'started_at is a timestamptz');
select col_is_null('public', 'user_entries', 'started_at', 'started_at is nullable until the entry is played');

select has_column('public', 'user_entries', 'purchased_at', 'user_entries has purchased_at');
select col_type_is('public', 'user_entries', 'purchased_at', 'date', 'purchased_at is a date: nobody remembers the hour');
select col_is_null('public', 'user_entries', 'purchased_at', 'purchased_at is nullable and hand-entered only');

-- game_details: the triple in, the single column out.

select hasnt_column('public', 'game_details', 'time_to_beat_seconds', 'the old single time_to_beat_seconds column is gone');

select has_column('public', 'game_details', 'time_to_beat_hastily_seconds', 'game_details has time_to_beat_hastily_seconds');
select has_column('public', 'game_details', 'time_to_beat_normally_seconds', 'game_details has time_to_beat_normally_seconds');
select has_column('public', 'game_details', 'time_to_beat_completely_seconds', 'game_details has time_to_beat_completely_seconds');

select col_type_is('public', 'game_details', 'time_to_beat_hastily_seconds', 'integer', 'hastily is an integer count of seconds');
select col_type_is('public', 'game_details', 'time_to_beat_normally_seconds', 'integer', 'normally is an integer count of seconds');
select col_type_is('public', 'game_details', 'time_to_beat_completely_seconds', 'integer', 'completely is an integer count of seconds');

select col_is_null('public', 'game_details', 'time_to_beat_normally_seconds', 'time to beat is nullable: IGDB has no figure for most games');

-- The decision this migration is built on: Upcoming is derived, so the status
-- enum does not grow a wishlist value.
select enum_has_labels(
  'public',
  'entry_status',
  array['backlog', 'playing', 'played', 'dropped'],
  'entry_status is unchanged: no wishlist value, because Upcoming is a date comparison'
);

-- Fixtures --------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- Tunic is out; the sequel is not. Both are 'game', so the Upcoming query has
-- to separate them on date alone.
insert into public.media_items (id, medium, title, year, release_date) values
  ('00000000-0000-0000-0000-0000000000f1', 'game', 'Hades', 2020, date '2020-09-17'),
  ('00000000-0000-0000-0000-0000000000f2', 'game', 'Celeste', 2018, date '2018-01-25'),
  ('00000000-0000-0000-0000-0000000000f3', 'game', 'Tunic', 2022, date '2022-03-16'),
  ('00000000-0000-0000-0000-0000000000f4', 'game', 'Unannounced Sequel', null, null),
  ('00000000-0000-0000-0000-0000000000f5', 'game', 'Next Year''s Game', 2027, current_date + 200);

insert into public.game_details (media_item_id, igdb_id, platforms, genres) values
  ('00000000-0000-0000-0000-0000000000f1', 1, '{PC,"Nintendo Switch"}', '{roguelike}'),
  ('00000000-0000-0000-0000-0000000000f2', 2, '{PC}', '{platformer}'),
  ('00000000-0000-0000-0000-0000000000f3', 3, '{PC,"Nintendo Switch"}', '{"action-adventure"}');

-- time to beat: the check constraints --------------------------------------

select lives_ok(
  $$ update public.game_details
        set time_to_beat_hastily_seconds = 139240,
            time_to_beat_normally_seconds = 253600,
            time_to_beat_completely_seconds = 542700
      where igdb_id = 1 $$,
  'the time-to-beat triple accepts IGDB seconds'
);

select throws_ok(
  $$ update public.game_details set time_to_beat_hastily_seconds = -1 where igdb_id = 1 $$,
  '23514',
  null,
  'a negative hastily time is rejected'
);

select throws_ok(
  $$ update public.game_details set time_to_beat_normally_seconds = -1 where igdb_id = 1 $$,
  '23514',
  null,
  'a negative normally time is rejected'
);

select throws_ok(
  $$ update public.game_details set time_to_beat_completely_seconds = -1 where igdb_id = 1 $$,
  '23514',
  null,
  'a negative completely time is rejected'
);

select lives_ok(
  $$ update public.game_details set time_to_beat_hastily_seconds = 0 where igdb_id = 1 $$,
  'zero seconds is allowed: the constraint is >= 0, not > 0'
);

-- Act as user A ---------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- Entries ------------------------------------------------------------------------

insert into public.user_entries (id, user_id, media_item_id, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000f1', 'backlog');

insert into public.user_entries (user_id, media_item_id, status) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f2', 'backlog');

-- Upcoming is derived, not stored -----------------------------------------------

insert into public.user_entries (user_id, media_item_id, status) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f5', 'backlog'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f4', 'backlog');

-- The Upcoming segment: backlog entries whose release date is still ahead.
select results_eq(
  $$ select m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid()
        and e.status = 'backlog'
        and m.release_date > current_date
      order by m.release_date $$,
  $$ values ('Next Year''s Game'::text) $$,
  'Upcoming is backlog plus a future release_date, with no status of its own'
);

-- The Backlog segment: everything released. A game with no known
-- date is not claimed to be out (ui-principles rule 9).
select results_eq(
  $$ select m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid()
        and e.status = 'backlog'
        and m.release_date <= current_date
      order by m.title $$,
  $$ values ('Celeste'::text), ('Hades') $$,
  'Backlog is every released game you intend to play'
);

select is(
  (select count(*) from public.user_entries e
     join public.media_items m on m.id = e.media_item_id
    where e.user_id = auth.uid() and m.release_date is null),
  1::bigint,
  'a game with no release date falls in neither segment rather than being guessed into one'
);

-- The started_at trigger --------------------------------------------------------

-- 1. The first move to `playing` stamps now(). Inside a transaction now() is
--    the transaction timestamp, so this is exact rather than approximate.

select is(
  (select started_at from public.user_entries where id = '00000000-0000-0000-0000-0000000000e1'),
  null::timestamptz,
  'a backlog entry starts with no started_at'
);

update public.user_entries set status = 'playing'
 where id = '00000000-0000-0000-0000-0000000000e1';

select is(
  (select started_at from public.user_entries where id = '00000000-0000-0000-0000-0000000000e1'),
  now(),
  'moving an entry to playing stamps started_at with now()'
);

insert into public.user_entries (id, user_id, media_item_id, status) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000f3', 'playing');

select is(
  (select started_at from public.user_entries where id = '00000000-0000-0000-0000-0000000000e2'),
  now(),
  'inserting an entry straight into playing stamps started_at too'
);

-- 2. A value already there is never overwritten.

update public.user_entries set status = 'played'
 where id = '00000000-0000-0000-0000-0000000000e1';

select is(
  (select started_at from public.user_entries where id = '00000000-0000-0000-0000-0000000000e1'),
  now(),
  'leaving playing does not clear started_at'
);

update public.user_entries set started_at = timestamptz '2021-06-01 09:00:00+00'
 where id = '00000000-0000-0000-0000-0000000000e1';

update public.user_entries set status = 'playing'
 where id = '00000000-0000-0000-0000-0000000000e1';

select is(
  (select started_at from public.user_entries where id = '00000000-0000-0000-0000-0000000000e1'),
  timestamptz '2021-06-01 09:00:00+00',
  'going back to playing never overwrites a started_at that is already set'
);

insert into public.user_entries (user_id, media_item_id, status, started_at) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f5',
   'playing', timestamptz '2019-01-01 00:00:00+00')
on conflict (user_id, media_item_id) do update
  set status = excluded.status, started_at = excluded.started_at;

select is(
  (select started_at from public.user_entries
    where user_id = '00000000-0000-0000-0000-00000000000a'
      and media_item_id = '00000000-0000-0000-0000-0000000000f5'),
  timestamptz '2019-01-01 00:00:00+00',
  'a hand-entered started_at survives the same statement that sets playing'
);

-- Clearing the date on a game you are playing is a deliberate edit, so the
-- trigger leaves it cleared rather than re-stamping on the next write.
update public.user_entries set started_at = null
 where id = '00000000-0000-0000-0000-0000000000e2';

update public.user_entries set notes = 'about halfway'
 where id = '00000000-0000-0000-0000-0000000000e2';

select is(
  (select started_at from public.user_entries where id = '00000000-0000-0000-0000-0000000000e2'),
  null::timestamptz,
  'clearing started_at by hand on a playing entry is respected, not re-stamped'
);

-- 3. No other status ever sets it.

insert into public.user_entries (id, user_id, media_item_id, status) values
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000f4', 'played')
on conflict (user_id, media_item_id) do update set status = excluded.status;

select is(
  (select started_at from public.user_entries
    where user_id = '00000000-0000-0000-0000-00000000000a'
      and media_item_id = '00000000-0000-0000-0000-0000000000f4'),
  null::timestamptz,
  'played does not stamp started_at: only playing does'
);

update public.user_entries set status = 'dropped'
 where user_id = '00000000-0000-0000-0000-00000000000a'
   and media_item_id = '00000000-0000-0000-0000-0000000000f4';

select is(
  (select started_at from public.user_entries
    where user_id = '00000000-0000-0000-0000-00000000000a'
      and media_item_id = '00000000-0000-0000-0000-0000000000f4'),
  null::timestamptz,
  'dropped does not stamp started_at either'
);

update public.user_entries set purchased_at = date '2024-12-25'
 where user_id = '00000000-0000-0000-0000-00000000000a'
   and media_item_id = '00000000-0000-0000-0000-0000000000f4';

select is(
  (select started_at from public.user_entries
    where user_id = '00000000-0000-0000-0000-00000000000a'
      and media_item_id = '00000000-0000-0000-0000-0000000000f4'),
  null::timestamptz,
  'recording a purchase on a game you never started leaves started_at null'
);

-- purchased_at is hand-entered only ------------------------------------------

select is(
  (select purchased_at from public.user_entries
    where user_id = '00000000-0000-0000-0000-00000000000a'
      and media_item_id = '00000000-0000-0000-0000-0000000000f4'),
  date '2024-12-25',
  'purchased_at stores the hand-entered date unchanged'
);

select is(
  (select purchased_at from public.user_entries where id = '00000000-0000-0000-0000-0000000000e2'),
  null::date,
  'nothing sets purchased_at automatically'
);

-- Two-user isolation on the new columns ---------------------------------------

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is(
  (select count(*) from public.user_entries),
  0::bigint,
  'user B cannot see user A entries, new columns included'
);

update public.user_entries set started_at = timestamptz '1999-01-01 00:00:00+00', purchased_at = date '1999-01-01';
select is(
  (select count(*) from public.user_entries where purchased_at = date '1999-01-01'),
  0::bigint,
  'user B cannot rewrite the personal dates on rows they cannot see'
);

select throws_ok(
  $$ insert into public.user_entries (user_id, media_item_id, status)
     values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f3',
             'playing') $$,
  '42501',
  null,
  'user B cannot create an entry in user A''s name'
);

-- User B's own entry behaves exactly like user A's.
insert into public.user_entries (id, user_id, media_item_id, status) values
  ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-00000000000b',
   '00000000-0000-0000-0000-0000000000f1', 'playing');

select is(
  (select started_at from public.user_entries where id = '00000000-0000-0000-0000-0000000000e9'),
  now(),
  'the trigger stamps user B''s own entry, so it is not an owner-specific rule'
);

-- Back to user A: nothing user B did landed.

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is(
  (select started_at from public.user_entries where id = '00000000-0000-0000-0000-0000000000e1'),
  timestamptz '2021-06-01 09:00:00+00',
  'user A''s started_at survived user B''s attempt to overwrite it'
);

select is(
  (select count(*) from public.user_entries where user_id = '00000000-0000-0000-0000-00000000000b'),
  0::bigint,
  'user A cannot see user B''s entry either'
);

select * from finish();
rollback;
