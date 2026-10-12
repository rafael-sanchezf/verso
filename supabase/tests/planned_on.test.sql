-- pgTAP tests for supabase/migrations/20261008201000_planned_on.sql.
-- Run with: supabase test db
--
-- Three things are under test:
--
-- 1. **The column**: a nullable date with no default, its partial index, and
--    the two diary triggers still invoker with a pinned search_path after the
--    restatement.
-- 2. **The clearing**: a diary row on or after the planned day clears it,
--    logged or edited there; a row before it, an edit to an earlier day, a
--    change of note and a delete do not.
-- 3. **Two users**: B's diary never clears A's plan, and B cannot write A's
--    planned day.
--
-- Users act through `set local role authenticated` plus a forged
-- request.jwt.claims. Ids are in the ...b2 range; TMDB ids are negative.

begin;
select plan(18);

-- ==============================================================================
-- 1. Structure
-- ==============================================================================

-- 1
select has_column('public', 'user_entries', 'planned_on', 'user_entries has planned_on');

-- 2
select col_type_is('public', 'user_entries', 'planned_on', 'date', 'planned_on is a date: a day, not an hour');

-- 3
select col_is_null('public', 'user_entries', 'planned_on', 'planned_on is nullable: most entries have no plan');

-- 4
select col_hasnt_default('public', 'user_entries', 'planned_on', 'planned_on has no default');

-- 5
select has_index('public', 'user_entries', 'user_entries_user_planned_on', 'the calendar''s partial index on (user_id, planned_on) exists');

-- 6
select ok(
  (select bool_and(not p.prosecdef and p.proconfig @> array['search_path=public, extensions'])
     from pg_proc p
    where p.oid in ('public.watch_log_before_write()'::regprocedure, 'public.watch_log_after_change()'::regprocedure)),
  'both diary trigger functions are still security invoker with a pinned search_path'
);

-- ==============================================================================
-- Fixtures
-- ==============================================================================

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000b20aa', 'plan-a@example.com'),
  ('00000000-0000-0000-0000-0000000b20bb', 'plan-b@example.com');

insert into public.media_items (id, medium, title, year, external_ids) values
  ('00000000-0000-0000-0000-0000000b2f01', 'movie', 'Plan Film One', 2026, '{"tmdb": -82001}'),
  ('00000000-0000-0000-0000-0000000b2f02', 'movie', 'Plan Film Two', 2026, '{"tmdb": -82002}'),
  ('00000000-0000-0000-0000-0000000b2f03', 'movie', 'Plan Film Three', 2026, '{"tmdb": -82003}');

-- ==============================================================================
-- 2. The clearing, as A
-- ==============================================================================

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000b20aa","role":"authenticated"}';

insert into public.user_entries (user_id, media_item_id, planned_on) values
  ('00000000-0000-0000-0000-0000000b20aa', '00000000-0000-0000-0000-0000000b2f01', '2026-10-24'),
  ('00000000-0000-0000-0000-0000000b20aa', '00000000-0000-0000-0000-0000000b2f02', '2026-10-24'),
  ('00000000-0000-0000-0000-0000000b20aa', '00000000-0000-0000-0000-0000000b2f03', '2026-11-10');

-- 7
select results_eq(
  $$ select status::text, planned_on from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b2f01' $$,
  $$ values ('backlog'::text, '2026-10-24'::date) $$,
  'the owner writes a planned day on a want-to-watch film through the existing policy'
);

insert into public.watch_log (media_item_id, watched_on) values ('00000000-0000-0000-0000-0000000b2f01', '2026-10-20');

-- 8
select is(
  (select planned_on from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b2f01'),
  '2026-10-24'::date,
  'a watch before the planned day leaves the plan: watching at home does not cancel the tickets'
);

insert into public.watch_log (media_item_id, watched_on, place) values ('00000000-0000-0000-0000-0000000b2f01', '2026-10-24', 'theater');

-- 9
select results_eq(
  $$ select status::text, planned_on, finished_at from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b2f01' $$,
  $$ values ('played'::text, null::date, '2026-10-24'::date) $$,
  'a watch on the planned day clears it'
);

insert into public.watch_log (media_item_id, watched_on) values ('00000000-0000-0000-0000-0000000b2f02', '2026-10-30');

-- 10
select is(
  (select planned_on from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b2f02'),
  null::date,
  'a watch after the planned day clears it too: the plan slipped, the film was seen'
);

insert into public.watch_log (media_item_id, watched_on) values ('00000000-0000-0000-0000-0000000b2f03', '2026-10-01');

-- 11
select is(
  (select planned_on from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b2f03'),
  '2026-11-10'::date,
  'an earlier watch leaves a later plan (a rewatch in theaters)'
);

update public.watch_log set note = 'Saw it at home first' where media_item_id = '00000000-0000-0000-0000-0000000b2f03';

-- 12
select is(
  (select planned_on from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b2f03'),
  '2026-11-10'::date,
  'a change of note clears nothing'
);

update public.watch_log set watched_on = '2026-09-15' where media_item_id = '00000000-0000-0000-0000-0000000b2f03';

-- 13
select results_eq(
  $$ select planned_on, finished_at from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b2f03' $$,
  $$ values ('2026-11-10'::date, '2026-09-15'::date) $$,
  'an edit to an earlier day moves finished_at and leaves the plan'
);

update public.watch_log set watched_on = '2026-11-12' where media_item_id = '00000000-0000-0000-0000-0000000b2f03';

-- 14
select results_eq(
  $$ select planned_on, finished_at from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b2f03' $$,
  $$ values (null::date, '2026-11-12'::date) $$,
  'an edit that moves a row onto or past the planned day clears it'
);

update public.user_entries set planned_on = '2026-12-01' where media_item_id = '00000000-0000-0000-0000-0000000b2f03';
delete from public.watch_log where media_item_id = '00000000-0000-0000-0000-0000000b2f03';

-- 15
select is(
  (select planned_on from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000b2f03'),
  '2026-12-01'::date,
  'a delete never clears a plan'
);

-- ==============================================================================
-- 3. Two users
-- ==============================================================================

update public.user_entries set planned_on = '2026-12-05' where media_item_id = '00000000-0000-0000-0000-0000000b2f02';

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000b20bb","role":"authenticated"}';

insert into public.watch_log (media_item_id, watched_on) values ('00000000-0000-0000-0000-0000000b2f02', '2026-12-06');
update public.user_entries set planned_on = null where media_item_id = '00000000-0000-0000-0000-0000000b2f03';

-- 16
select is(
  (select count(*) from public.user_entries where planned_on is not null),
  0::bigint,
  'B sees no planned day of A''s'
);

reset role;

-- 17
select is(
  (select planned_on from public.user_entries
    where user_id = '00000000-0000-0000-0000-0000000b20aa' and media_item_id = '00000000-0000-0000-0000-0000000b2f02'),
  '2026-12-05'::date,
  'B''s watch of the same film after A''s planned day leaves A''s plan alone'
);

-- 18
select is(
  (select planned_on from public.user_entries
    where user_id = '00000000-0000-0000-0000-0000000b20aa' and media_item_id = '00000000-0000-0000-0000-0000000b2f03'),
  '2026-12-01'::date,
  'B cannot clear A''s planned day'
);

select * from finish();
rollback;
