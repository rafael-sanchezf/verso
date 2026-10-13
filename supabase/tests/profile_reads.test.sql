-- pgTAP tests for supabase/migrations/20261014100000_profile_reads.sql.
-- Run with: supabase test db
--
-- Seven things are under test:
--
-- 1. **Shape**: finished_from, its check and its trigger (kept only on the
--    playing-to-played write that sends it, cleared on every other path),
--    profiles.public, each function's security and pinned search_path, never
--    anon, 28000 without a user.
-- 2. **recent_activity**: the three kinds in order across media, the verb by
--    source (a log row and a dated import row are "watched", a bulk row is
--    not, a game reads "finished" only with finished_from), a ranking on the
--    day of its watch or finish folded into that line, the score, the limit,
--    the medium, the time zone moving a ranking's day and an unknown zone read
--    as UTC, and another user's events never in the list.
-- 3. **activity_month**: one month's events with their day, the medium, and a
--    month outside 1 to 12 refused.
-- 4. **ranker_percentile**: null under ten rankers and for a caller who ranked
--    nothing, the share with fewer ranked once the cohort is ten, ties not
--    counted as fewer, and the medium's own cohort.
-- 5. **profile_hours**: game playtime plus one runtime per diary row, by
--    medium.
-- 6. **profiles.public**: off by default, the owner turns it on, nobody else
--    can, everyone signed in can read it.
-- 7. **The avatars bucket**: public, 2 MB, three image types, and the owner's
--    folder only for insert, update, delete and select. Skipped with a note
--    on exactly the conditions the migration's storage section skips on
--    (pg_temp.storage_here below); the storage statements are strings, so
--    nothing here names a storage table outside the branch that runs when it
--    exists.
--
-- Users act through `set local role authenticated` plus a forged
-- request.jwt.claims. Ids are in the ...c4 range; TMDB and IGDB ids are
-- negative, so nothing meets a mirrored catalog. The percentile counts every
-- user's rankings, so the fixture removes every other user's rankings inside
-- this transaction (rolled back at the end) to make the cohort its own.

begin;
select plan(79);

-- The migration's storage section runs only when all four hold; the storage
-- tests below run on the same four and skip otherwise.
create function pg_temp.storage_here()
returns boolean
language sql
stable
as $$
  select to_regclass('storage.buckets') is not null
    and to_regclass('storage.objects') is not null
    and to_regprocedure('storage.foldername(text)') is not null
    and exists (
      select 1 from pg_catalog.pg_attribute a
      where a.attrelid = to_regclass('storage.buckets')
        and a.attname = 'allowed_mime_types'
        and not a.attisdropped
    );
$$;

-- ==============================================================================
-- 1. Shape
-- ==============================================================================

-- 1
select has_column('public', 'user_entries', 'finished_from', 'user_entries has finished_from');

-- 2
select col_is_null('public', 'user_entries', 'finished_from', 'finished_from is null until the log flow writes it');

-- 3
select has_column('public', 'profiles', 'public', 'profiles has public');

-- 4
select col_not_null('public', 'profiles', 'public', 'public is not null');

-- 5
select col_default_is('public', 'profiles', 'public', 'false', 'public is off by default');

-- 6
select ok(
  (select bool_and(not p.prosecdef and p.proconfig @> array['search_path=public, extensions'])
     from pg_proc p
    where p.oid in (
      'public.activity_events(public.medium, text, date, date)'::regprocedure,
      'public.user_entries_finished_from()'::regprocedure,
      'public.recent_activity(integer, public.medium, text)'::regprocedure,
      'public.activity_month(integer, integer, public.medium, text)'::regprocedure,
      'public.profile_hours(public.medium)'::regprocedure
    )),
  'the activity reads, profile_hours and the finished_from trigger are security invoker with a pinned search_path'
);

-- 7
select has_trigger('public', 'user_entries', 'user_entries_finished_from', 'the finished_from trigger is on user_entries');

-- 8
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=public, extensions']
     from pg_proc p
    where p.oid = 'public.ranker_percentile(public.medium)'::regprocedure),
  'ranker_percentile is security definer with a pinned search_path'
);

-- 9
select ok(
  not has_function_privilege('anon', 'public.activity_events(public.medium, text, date, date)', 'execute')
  and not has_function_privilege('anon', 'public.recent_activity(integer, public.medium, text)', 'execute')
  and not has_function_privilege('anon', 'public.activity_month(integer, integer, public.medium, text)', 'execute')
  and not has_function_privilege('anon', 'public.ranker_percentile(public.medium)', 'execute')
  and not has_function_privilege('anon', 'public.profile_hours(public.medium)', 'execute'),
  'anon cannot execute any of the five'
);

-- 10
select ok(
  has_function_privilege('authenticated', 'public.recent_activity(integer, public.medium, text)', 'execute')
  and has_function_privilege('authenticated', 'public.activity_month(integer, integer, public.medium, text)', 'execute')
  and has_function_privilege('authenticated', 'public.ranker_percentile(public.medium)', 'execute')
  and has_function_privilege('authenticated', 'public.profile_hours(public.medium)', 'execute'),
  'signed-in users can execute the four reads'
);

-- ==============================================================================
-- Fixtures
-- ==============================================================================
--
-- A: films f1 (logged 09-02 on Netflix, ranked the same evening), f2 (seen
-- before Verso, a bulk row, ranked 09-10 at 03:00 UTC, which is 09-09 in New
-- York), f3 (an import row dated 09-05, ranked by the import that day), f4
-- (logged 08-15 and 10-01, never ranked); games g1 (finished from Playing on
-- 09-08 and ranked that day, 600 minutes), g2 (finished 09-08 by date alone,
-- ranked 09-09), g3 (finished from Playing once, now back in Playing, 90
-- minutes). The games reach played the way the app's writes would: an entry
-- in Playing, then one update to played.
-- B: f1 logged and ranked on 09-20.
-- C1 to C9: the cohort for the percentile, ranking the games x1 to x9.

delete from public.ranking_entries;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c40aa', 'profile-a@example.com'),
  ('00000000-0000-0000-0000-0000000c40bb', 'profile-b@example.com'),
  ('00000000-0000-0000-0000-0000000c40c1', 'profile-c1@example.com'),
  ('00000000-0000-0000-0000-0000000c40c2', 'profile-c2@example.com'),
  ('00000000-0000-0000-0000-0000000c40c3', 'profile-c3@example.com'),
  ('00000000-0000-0000-0000-0000000c40c4', 'profile-c4@example.com'),
  ('00000000-0000-0000-0000-0000000c40c5', 'profile-c5@example.com'),
  ('00000000-0000-0000-0000-0000000c40c6', 'profile-c6@example.com'),
  ('00000000-0000-0000-0000-0000000c40c7', 'profile-c7@example.com'),
  ('00000000-0000-0000-0000-0000000c40c8', 'profile-c8@example.com'),
  ('00000000-0000-0000-0000-0000000c40c9', 'profile-c9@example.com');

insert into public.media_items (id, medium, title, year, cover_image_id, external_ids) values
  ('00000000-0000-0000-0000-0000000c4f01', 'movie', 'Profile Film One', 2021, '/p1.jpg', '{"tmdb": -84001}'),
  ('00000000-0000-0000-0000-0000000c4f02', 'movie', 'Profile Film Two', 2022, '/p2.jpg', '{"tmdb": -84002}'),
  ('00000000-0000-0000-0000-0000000c4f03', 'movie', 'Profile Film Three', 2023, '/p3.jpg', '{"tmdb": -84003}'),
  ('00000000-0000-0000-0000-0000000c4f04', 'movie', 'Profile Film Four', 2024, '/p4.jpg', '{"tmdb": -84004}'),
  ('00000000-0000-0000-0000-0000000c4e01', 'game', 'Profile Game One', 2020, 'pg1', '{"igdb": -84101}'),
  ('00000000-0000-0000-0000-0000000c4e02', 'game', 'Profile Game Two', 2020, 'pg2', '{"igdb": -84102}'),
  ('00000000-0000-0000-0000-0000000c4e03', 'game', 'Profile Game Three', 2020, 'pg3', '{"igdb": -84103}');

insert into public.media_items (id, medium, title, external_ids)
select
  ('00000000-0000-0000-0000-0000000c4d0' || n)::uuid,
  'game',
  'Profile Cohort Game ' || n,
  jsonb_build_object('igdb', -84200 - n)
from generate_series(1, 9) n;

insert into public.movie_details (media_item_id, tmdb_id, runtime_minutes, genres) values
  ('00000000-0000-0000-0000-0000000c4f01', -84001, 120, '{"Profile Drama Test"}'),
  ('00000000-0000-0000-0000-0000000c4f02', -84002, 100, '{"Profile Drama Test"}'),
  ('00000000-0000-0000-0000-0000000c4f03', -84003, 90, '{"Profile Drama Test"}'),
  ('00000000-0000-0000-0000-0000000c4f04', -84004, 95, '{"Profile Drama Test"}');

-- A's games: all three in Playing, then the log flow's write for g1 and g3
-- (played with finished_from), a date alone for g2, and g3 back to Playing.
insert into public.user_entries (user_id, media_item_id, status, playtime_minutes) values
  ('00000000-0000-0000-0000-0000000c40aa', '00000000-0000-0000-0000-0000000c4e01', 'playing', 600),
  ('00000000-0000-0000-0000-0000000c40aa', '00000000-0000-0000-0000-0000000c4e02', 'playing', null),
  ('00000000-0000-0000-0000-0000000c40aa', '00000000-0000-0000-0000-0000000c4e03', 'playing', 90);

update public.user_entries set status = 'played', finished_at = '2026-09-08', finished_from = 'playing'
where media_item_id = '00000000-0000-0000-0000-0000000c4e01';
update public.user_entries set status = 'played', finished_at = '2026-09-08'
where media_item_id = '00000000-0000-0000-0000-0000000c4e02';
update public.user_entries set status = 'played', finished_at = '2026-08-01', finished_from = 'playing'
where media_item_id = '00000000-0000-0000-0000-0000000c4e03';
update public.user_entries set status = 'playing'
where media_item_id = '00000000-0000-0000-0000-0000000c4e03';

-- Rankings with their moments. A: f1 and f2 Loved, f3 Liked; g1 Loved, g2 Liked.
insert into public.ranking_entries (user_id, medium, tier, media_item_id, position, placed_at) values
  ('00000000-0000-0000-0000-0000000c40aa', 'movie', 'loved', '00000000-0000-0000-0000-0000000c4f01', 0, '2026-09-02 20:00+00'),
  ('00000000-0000-0000-0000-0000000c40aa', 'movie', 'loved', '00000000-0000-0000-0000-0000000c4f02', 1, '2026-09-10 03:00+00'),
  ('00000000-0000-0000-0000-0000000c40aa', 'movie', 'liked', '00000000-0000-0000-0000-0000000c4f03', 0, '2026-09-05 03:00+00'),
  ('00000000-0000-0000-0000-0000000c40aa', 'game', 'loved', '00000000-0000-0000-0000-0000000c4e01', 0, '2026-09-08 15:00+00'),
  ('00000000-0000-0000-0000-0000000c40aa', 'game', 'liked', '00000000-0000-0000-0000-0000000c4e02', 0, '2026-09-09 12:00+00'),
  ('00000000-0000-0000-0000-0000000c40bb', 'movie', 'loved', '00000000-0000-0000-0000-0000000c4f01', 0, '2026-09-20 12:00+00');

-- A's diary, as A, through the grants.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000c40aa","role":"authenticated"}';

insert into public.watch_log (media_item_id, watched_on, place, source) values
  ('00000000-0000-0000-0000-0000000c4f01', '2026-09-02', 'Netflix', 'log'),
  ('00000000-0000-0000-0000-0000000c4f02', null, null, 'bulk'),
  ('00000000-0000-0000-0000-0000000c4f03', '2026-09-05', null, 'import'),
  ('00000000-0000-0000-0000-0000000c4f04', '2026-08-15', null, 'log'),
  ('00000000-0000-0000-0000-0000000c4f04', '2026-10-01', 'theater', 'log');

-- 11
select throws_ok(
  $$ insert into public.user_entries (media_item_id, user_id, status, finished_from)
     values ('00000000-0000-0000-0000-0000000c4d09', '00000000-0000-0000-0000-0000000c40aa', 'played', 'dropped') $$,
  '23514',
  null,
  'finished_from is playing or null'
);

-- 12
select is(
  (select finished_from from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000c4e01'),
  'playing',
  'the log flow''s write, Playing to played with finished_from sent, keeps it'
);

-- 13
select is(
  (select finished_from from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000c4e03'),
  null,
  'a game moved back to Playing has its finished_from cleared'
);

insert into public.user_entries (media_item_id, user_id, status) values
  ('00000000-0000-0000-0000-0000000c4d01', '00000000-0000-0000-0000-0000000c40aa', 'backlog'),
  ('00000000-0000-0000-0000-0000000c4d02', '00000000-0000-0000-0000-0000000c40aa', 'playing'),
  ('00000000-0000-0000-0000-0000000c4d03', '00000000-0000-0000-0000-0000000c40aa', 'playing');

update public.user_entries set status = 'played', finished_from = 'playing'
where media_item_id = '00000000-0000-0000-0000-0000000c4d01';
update public.user_entries set status = 'played', finished_at = '2026-09-01'
where media_item_id = '00000000-0000-0000-0000-0000000c4d02';
update public.user_entries set status = 'played', finished_from = 'playing'
where media_item_id = '00000000-0000-0000-0000-0000000c4d03';

-- 14
select is(
  (select finished_from from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000c4d01'),
  null,
  'the backlog straight to played is no finish from Playing, whatever the write sends'
);

-- 15
select is(
  (select finished_from from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000c4d02'),
  null,
  'Playing to played without sending it (markFinished from the game page) leaves it null'
);

-- 16
select is(
  (select finished_from from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000c4d03'),
  'playing',
  'a second log-flow write keeps it too'
);

update public.user_entries set status = 'dropped'
where media_item_id = '00000000-0000-0000-0000-0000000c4d03';
update public.user_entries set finished_from = 'playing'
where media_item_id = '00000000-0000-0000-0000-0000000c4e02';

-- 17
select is(
  (select finished_from from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000c4d03'),
  null,
  'played to dropped clears it'
);

-- 18
select is(
  (select finished_from from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000c4e02'),
  null,
  'an entry already played cannot be given it by a later write'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000c40bb","role":"authenticated"}';

insert into public.watch_log (media_item_id, watched_on, source) values
  ('00000000-0000-0000-0000-0000000c4f01', '2026-09-20', 'log');

-- ==============================================================================
-- 2. recent_activity
-- ==============================================================================

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000c40aa","role":"authenticated"}';

-- 19
select results_eq(
  $$ select kind, on_date, media_item_id from public.recent_activity() $$,
  $$ values
       ('watched'::text, '2026-10-01'::date, '00000000-0000-0000-0000-0000000c4f04'::uuid),
       ('ranked', '2026-09-10', '00000000-0000-0000-0000-0000000c4f02'),
       ('ranked', '2026-09-09', '00000000-0000-0000-0000-0000000c4e02'),
       ('finished', '2026-09-08', '00000000-0000-0000-0000-0000000c4e01'),
       ('watched', '2026-09-05', '00000000-0000-0000-0000-0000000c4f03'),
       ('watched', '2026-09-02', '00000000-0000-0000-0000-0000000c4f01'),
       ('watched', '2026-08-15', '00000000-0000-0000-0000-0000000c4f04') $$,
  'Recent across media, newest first: a log row and a dated import row are watched, a game finished from Playing is finished, the rest ranked'
);

-- 20
select is(
  (select count(*) from public.recent_activity(50) where media_item_id = '00000000-0000-0000-0000-0000000c4f01'),
  1::bigint,
  'f1 logged and ranked the same day is one line, the watch'
);

-- 21
select is(
  (select count(*) from public.recent_activity(50) where media_item_id = '00000000-0000-0000-0000-0000000c4e01'),
  1::bigint,
  'g1 finished from Playing and ranked the same day is one line, the finish'
);

-- 22
select is(
  (select kind from public.recent_activity(50) where media_item_id = '00000000-0000-0000-0000-0000000c4f02'),
  'ranked',
  'a bulk row reads ranked, on the day it was placed, never watched'
);

-- 23
select results_eq(
  $$ select kind, on_date from public.recent_activity(50) where media_item_id = '00000000-0000-0000-0000-0000000c4f03' $$,
  $$ values ('watched'::text, '2026-09-05'::date) $$,
  'a dated import row reads watched on its date, the import''s placement folded in (the profile brief)'
);

-- 24
select is(
  (select kind from public.recent_activity(50) where media_item_id = '00000000-0000-0000-0000-0000000c4e02'),
  'ranked',
  'a game finished by date alone, with no finished_from, reads ranked'
);

-- 25
select is(
  (select count(*) from public.recent_activity(50) where media_item_id = '00000000-0000-0000-0000-0000000c4e03'),
  0::bigint,
  'a game back in Playing, unranked, has no line'
);

-- 26
select ok(
  (select bool_and(a.score = rp.score)
     from public.recent_activity(50) a
     join public.ranking_percentiles rp on rp.media_item_id = a.media_item_id
    where a.media_item_id in ('00000000-0000-0000-0000-0000000c4f01', '00000000-0000-0000-0000-0000000c4e01', '00000000-0000-0000-0000-0000000c4f02')),
  'the watch, the finish and the ranking each carry the item''s score as the app shows it'
);

-- 27
select ok(
  (select bool_and(score is null) from public.recent_activity(50) where media_item_id = '00000000-0000-0000-0000-0000000c4f04'),
  'an unranked film''s watches carry no score'
);

-- 28
select results_eq(
  $$ select place, medium::text, title, cover_image_id from public.recent_activity(50) where media_item_id = '00000000-0000-0000-0000-0000000c4f01' $$,
  $$ values ('Netflix'::text, 'movie'::text, 'Profile Film One'::text, '/p1.jpg'::text) $$,
  'a watch carries its place and the item''s medium, title and cover'
);

-- 29
select ok(
  (select occurred_at = '2026-09-10 03:00+00'::timestamptz from public.recent_activity(50) where media_item_id = '00000000-0000-0000-0000-0000000c4f02')
  and (select occurred_at is null from public.recent_activity(50) where media_item_id = '00000000-0000-0000-0000-0000000c4e01'),
  'a ranking''s moment is placed_at; a finish has a day and no moment'
);

-- 30
select results_eq(
  $$ select media_item_id from public.recent_activity(3) $$,
  $$ values
       ('00000000-0000-0000-0000-0000000c4f04'::uuid),
       ('00000000-0000-0000-0000-0000000c4f02'),
       ('00000000-0000-0000-0000-0000000c4e02') $$,
  'the limit takes the newest'
);

-- 31
select results_eq(
  $$ select kind, media_item_id from public.recent_activity(10, 'game') $$,
  $$ values ('ranked'::text, '00000000-0000-0000-0000-0000000c4e02'::uuid), ('finished', '00000000-0000-0000-0000-0000000c4e01') $$,
  'one medium: the games alone'
);

-- 32
select is(
  (select count(*) from public.recent_activity(10, 'movie') where medium <> 'movie'),
  0::bigint,
  'one medium: the films alone'
);

-- 33
select is(
  (select count(*) from public.recent_activity(10, 'movie')),
  5::bigint,
  'and all five of A''s film lines'
);

-- 34
select is(
  (select on_date from public.recent_activity(50, null, 'America/New_York') where media_item_id = '00000000-0000-0000-0000-0000000c4f02'),
  '2026-09-09'::date,
  'a ranking placed at 03:00 UTC falls on the day before in New York'
);

-- 35
select results_eq(
  $$ select kind, on_date, media_item_id from public.recent_activity(50, null, 'Not/AZone') $$,
  $$ select kind, on_date, media_item_id from public.recent_activity(50, null, 'UTC') $$,
  'an unknown zone reads as UTC rather than failing'
);

-- 36
select results_eq(
  $$ select kind, on_date, media_item_id from public.activity_month(2026, 9, null, '+05:00') $$,
  $$ select kind, on_date, media_item_id from public.activity_month(2026, 9, null, null) $$,
  'so do an offset-style zone and a null one'
);

-- 37
select is(
  (select on_date from public.recent_activity(50, null, 'America/New_York') where media_item_id = '00000000-0000-0000-0000-0000000c4f04' order by on_date desc limit 1),
  '2026-10-01'::date,
  'a watch keeps its own day whatever the time zone'
);

-- 38
select throws_ok(
  $$ select * from public.recent_activity(0) $$,
  '22023',
  null,
  'a limit below one is refused'
);

-- 39
select is(
  (select count(*) from public.recent_activity(50) where on_date = '2026-09-20'),
  0::bigint,
  'B''s watch and ranking are not in A''s activity'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000c40bb","role":"authenticated"}';

-- 40
select results_eq(
  $$ select kind, on_date, media_item_id from public.recent_activity() $$,
  $$ values ('watched'::text, '2026-09-20'::date, '00000000-0000-0000-0000-0000000c4f01'::uuid) $$,
  'B sees B''s one line, the watch with the ranking folded in, and none of A''s'
);

-- ==============================================================================
-- 3. activity_month
-- ==============================================================================

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000c40aa","role":"authenticated"}';

-- 41
select results_eq(
  $$ select day, kind, media_item_id from public.activity_month(2026, 9) $$,
  $$ values
       (10, 'ranked'::text, '00000000-0000-0000-0000-0000000c4f02'::uuid),
       (9, 'ranked', '00000000-0000-0000-0000-0000000c4e02'),
       (8, 'finished', '00000000-0000-0000-0000-0000000c4e01'),
       (5, 'watched', '00000000-0000-0000-0000-0000000c4f03'),
       (2, 'watched', '00000000-0000-0000-0000-0000000c4f01') $$,
  'September: every event of the month with its day, newest first'
);

-- 42
select results_eq(
  $$ select day, kind, media_item_id from public.activity_month(2026, 8) $$,
  $$ values (15, 'watched'::text, '00000000-0000-0000-0000-0000000c4f04'::uuid) $$,
  'August: the one watch, and nothing from September or October'
);

-- 43
select results_eq(
  $$ select day, kind from public.activity_month(2026, 9, 'game') $$,
  $$ values (9, 'ranked'::text), (8, 'finished') $$,
  'one medium in one month'
);

-- 44
select is(
  (select day from public.activity_month(2026, 9, null, 'America/New_York') where media_item_id = '00000000-0000-0000-0000-0000000c4f02'),
  9,
  'the time zone moves a ranking''s day in the month too'
);

-- 45
select is(
  (select count(*) from public.activity_month(2026, 11)),
  0::bigint,
  'a month with nothing is empty'
);

-- 46
select throws_ok(
  $$ select * from public.activity_month(2026, 13) $$,
  '22023',
  null,
  'a month outside 1 to 12 is refused'
);

-- ==============================================================================
-- 4. ranker_percentile
-- ==============================================================================

-- 47
select is(public.ranker_percentile(), null, 'two rankers: no percentile, the tile hides');

reset role;

-- The cohort: C1 to C8 rank 1 to 8 games, one more each; C9 ranks
-- nothing. With A (5 across media, 2 games, 3 films) and B (1 film), ten
-- rankers across media.
insert into public.ranking_entries (user_id, medium, tier, media_item_id, position)
select
  c.user_id,
  'game',
  'liked',
  ('00000000-0000-0000-0000-0000000c4d0' || g.n)::uuid,
  g.n - 1
from (values
  ('00000000-0000-0000-0000-0000000c40c1'::uuid, 1),
  ('00000000-0000-0000-0000-0000000c40c2', 2),
  ('00000000-0000-0000-0000-0000000c40c3', 3),
  ('00000000-0000-0000-0000-0000000c40c4', 4),
  ('00000000-0000-0000-0000-0000000c40c5', 5),
  ('00000000-0000-0000-0000-0000000c40c6', 6),
  ('00000000-0000-0000-0000-0000000c40c7', 7),
  ('00000000-0000-0000-0000-0000000c40c8', 8)
) as c (user_id, n_ranked)
cross join lateral generate_series(1, c.n_ranked) as g (n);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000c40aa","role":"authenticated"}';

-- 48
select is(
  public.ranker_percentile(),
  50.0,
  'ten rankers across media: A''s 5 beats B (1) and C1 to C4 (1 to 4), five of ten'
);

-- 49
select is(
  public.ranker_percentile('game'),
  null,
  'in games the cohort is nine (A and C1 to C8): no percentile'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000c40c5","role":"authenticated"}';

-- 50
select is(
  public.ranker_percentile(),
  50.0,
  'a tie is not fewer: C5''s 5 and A''s 5 each beat the same five, neither beats the other'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000c40c8","role":"authenticated"}';

-- 51
select is(public.ranker_percentile(), 90.0, 'the most ranked beats the other nine: 90');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000c40c9","role":"authenticated"}';

-- 52
select is(public.ranker_percentile(), null, 'a caller who ranked nothing is not a ranker: null');

-- ==============================================================================
-- 5. profile_hours
-- ==============================================================================

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000c40aa","role":"authenticated"}';

-- 53
select is(
  public.profile_hours('game'),
  11.5,
  'games: 600 and 90 minutes of playtime, whatever the status'
);

-- 54
select is(
  public.profile_hours('movie'),
  8.3,
  'films: one runtime per diary row, every source, a rewatch twice (120 + 100 + 90 + 95 + 95 minutes)'
);

-- 55
select is(public.profile_hours(), 19.8, 'every medium: 1,190 minutes');

-- 56
select is(public.profile_hours('tv'), 0.0, 'TV adds nothing yet');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000c40bb","role":"authenticated"}';

-- 57
select is(public.profile_hours(), 2.0, 'B''s hours are B''s one watch');

-- ==============================================================================
-- 6. profiles.public
-- ==============================================================================

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000c40aa","role":"authenticated"}';

-- 58
select is(
  (select public from public.profiles where id = '00000000-0000-0000-0000-0000000c40aa'),
  false,
  'a new profile is not public'
);

update public.profiles set public = true where id = '00000000-0000-0000-0000-0000000c40aa';
update public.profiles set public = true where id = '00000000-0000-0000-0000-0000000c40bb';

-- 59
select is(
  (select public from public.profiles where id = '00000000-0000-0000-0000-0000000c40aa'),
  true,
  'the owner turns it on'
);

-- 60
select is(
  (select public from public.profiles where id = '00000000-0000-0000-0000-0000000c40bb'),
  false,
  'A cannot turn B''s on: the update policy is the owner''s'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000c40bb","role":"authenticated"}';

-- 61
select is(
  (select public from public.profiles where id = '00000000-0000-0000-0000-0000000c40aa'),
  true,
  'B reads A''s flag, like platforms'
);

-- ==============================================================================
-- 7. The avatars bucket, where storage exists
-- ==============================================================================

reset role;

-- 62
select case
  when not pg_temp.storage_here() then skip('no storage schema here (CI runs without storage-api): the avatars bucket is not made', 1)
  else results_eq(
    $$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars' $$,
    $$ values (true, 2097152::bigint, array['image/jpeg', 'image/png', 'image/webp']::text[]) $$,
    'avatars is public, 2 MB, JPEG, PNG and WebP'
  )
end;

-- 63
select case
  when not pg_temp.storage_here() then skip('no storage schema here: no avatar policies', 1)
  else results_eq(
    $$ select policyname::text collate "default", cmd::text collate "default" from pg_policies
        where schemaname = 'storage' and tablename = 'objects' and policyname like '%their own avatars'
        order by policyname $$,
    $$ values
         ('users delete their own avatars'::text, 'DELETE'::text),
         ('users read their own avatars', 'SELECT'),
         ('users replace their own avatars', 'UPDATE'),
         ('users upload their own avatars', 'INSERT') $$,
    'four owner-only policies on storage.objects, select included'
  )
end;

-- 64
select case
  when not pg_temp.storage_here() then skip('no storage schema here', 1)
  else ok(
    (select bool_and(roles = array['authenticated']::name[]) from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname like '%their own avatars'),
    'every avatar policy is for signed-in users only; anon reads through the public URL'
  )
end;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000c40aa","role":"authenticated"}';

-- 65
select case
  when not pg_temp.storage_here() then skip('no storage schema here', 1)
  else lives_ok(
    $$ insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-0000000c40aa/1.jpg') $$,
    'A uploads into A''s folder'
  )
end;

-- 66
select case
  when not pg_temp.storage_here() then skip('no storage schema here', 1)
  else throws_ok(
    $$ insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-0000000c40bb/1.jpg') $$,
    '42501',
    null,
    'A cannot upload into B''s folder'
  )
end;

-- 67
select case
  when not pg_temp.storage_here() then skip('no storage schema here', 1)
  else throws_ok(
    $$ insert into storage.objects (bucket_id, name) values ('avatars', 'loose.jpg') $$,
    '42501',
    null,
    'nor at the bucket''s root, outside any folder'
  )
end;

-- 68
select case
  when not pg_temp.storage_here() then skip('no storage schema here', 1)
  else throws_ok(
    $$ update storage.objects set name = '00000000-0000-0000-0000-0000000c40bb/1.jpg'
        where bucket_id = 'avatars' and name = '00000000-0000-0000-0000-0000000c40aa/1.jpg' $$,
    '42501',
    null,
    'A cannot move A''s photo into B''s folder'
  )
end;

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000c40bb","role":"authenticated"}';

-- 69
select case
  when not pg_temp.storage_here() then skip('no storage schema here', 1)
  else results_eq(
    $$ select count(*)::integer from storage.objects where bucket_id = 'avatars' $$,
    $$ values (0) $$,
    'B lists none of A''s objects'
  )
end;

-- 70
select case
  when not pg_temp.storage_here() then skip('no storage schema here', 1)
  else lives_ok(
    $$ update storage.objects set name = '00000000-0000-0000-0000-0000000c40bb/taken.jpg'
        where bucket_id = 'avatars' and name = '00000000-0000-0000-0000-0000000c40aa/1.jpg' $$,
    'B''s update of A''s photo runs and matches nothing'
  )
end;

-- Direct deletes are refused by storage's own guard unless this is set; the
-- policies are what is under test here.
set local storage.allow_delete_query = 'true';

-- 71
select case
  when not pg_temp.storage_here() then skip('no storage schema here', 1)
  else lives_ok(
    $$ delete from storage.objects where bucket_id = 'avatars' $$,
    'B''s delete across the bucket runs and matches nothing'
  )
end;

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000c40aa","role":"authenticated"}';

-- 72
select case
  when not pg_temp.storage_here() then skip('no storage schema here', 1)
  else results_eq(
    $$ select name from storage.objects where bucket_id = 'avatars' $$,
    $$ values ('00000000-0000-0000-0000-0000000c40aa/1.jpg'::text) $$,
    'A''s photo is still there, under its name, and A can see it'
  )
end;

-- 73
select case
  when not pg_temp.storage_here() then skip('no storage schema here', 1)
  else lives_ok(
    $$ update storage.objects set name = '00000000-0000-0000-0000-0000000c40aa/2.jpg'
        where bucket_id = 'avatars' and name = '00000000-0000-0000-0000-0000000c40aa/1.jpg' $$,
    'A replaces A''s own photo'
  )
end;

-- 74
select case
  when not pg_temp.storage_here() then skip('no storage schema here', 1)
  else lives_ok(
    $$ delete from storage.objects where bucket_id = 'avatars' $$,
    'A deletes A''s own photo'
  )
end;

-- 75
select case
  when not pg_temp.storage_here() then skip('no storage schema here', 1)
  else results_eq(
    $$ select count(*)::integer from storage.objects where bucket_id = 'avatars' $$,
    $$ values (0) $$,
    'and it is gone'
  )
end;

-- ==============================================================================
-- 28000 without a user
-- ==============================================================================

reset role;
set local request.jwt.claims to '{}';

-- 76
select throws_ok($$ select * from public.recent_activity() $$, '28000', null, 'recent_activity needs a signed-in user');

-- 77
select throws_ok($$ select * from public.activity_month(2026, 9) $$, '28000', null, 'activity_month needs a signed-in user');

-- 78
select throws_ok($$ select public.ranker_percentile() $$, '28000', null, 'ranker_percentile needs a signed-in user');

-- 79
select throws_ok($$ select public.profile_hours() $$, '28000', null, 'profile_hours needs a signed-in user');

select * from finish();
rollback;
