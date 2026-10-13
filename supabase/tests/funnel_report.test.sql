-- pgTAP tests for supabase/migrations/20261012120000_funnel_report.sql.
-- Run with: supabase test db
--
-- 1. **Structure and grants.** All three functions exist, are security
--    definer with a pinned search_path, and are executable by the service
--    role alone; anon and authenticated hold no privilege on any of them.
-- 2. **The funnel** for two users who sign up the same Monday: A reaches every
--    step, B stops at first_session.
-- 3. **The day-7 boundary**, in calendar days from the sign-up day: A's open
--    on day 7 counts though it is only six and a half days after signing up;
--    B's open on day 6 does not, though it is barely an hour less.
-- 4. **The window.** p_since leaves out C, who signed up the week before;
--    p_until leaves out sign-ups at or after it (half-open) and any step
--    reached after it; a backwards window is refused.
-- 5. **The cohort split**: one row per week of sign-up.
-- 6. **The permission error** for a signed-in user and for anon, on every
--    function, and the service role's call that works.
--
-- The fixture's dates are in the winter of 2024-25, so no account a test run
-- creates at now() falls in any window below; the one open-window assertion
-- compares against the whole profiles table instead.

begin;
select plan(31);

-- Fixtures ---------------------------------------------------------------------
--
--   A  signs up Mon 2025-01-06 10:00 UTC. first_session 10:05, ten_ranked
--      10:30, first_pick Wed 01-08, app_open 10:01 and Mon 01-13 00:30
--      (UTC calendar day 7, 6 days 14.5 hours later).
--   B  signs up Mon 2025-01-06 10:00 UTC. app_open 10:59, first_session
--      11:00, app_open Sun 01-12 23:30 (calendar day 6, 6 days 13.5 hours
--      later), and a media_interest that is no step.
--   C  signs up Tue 2024-12-31 09:00 UTC, the week before. first_session the
--      same day, app_open Thu 01-09 (day 9), ten_ranked Mon 01-20.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f000a', 'funnel-a@example.com'),
  ('00000000-0000-0000-0000-0000000f000b', 'funnel-b@example.com'),
  ('00000000-0000-0000-0000-0000000f000c', 'funnel-c@example.com');

update public.profiles set created_at = '2025-01-06 10:00:00+00'
where id in ('00000000-0000-0000-0000-0000000f000a', '00000000-0000-0000-0000-0000000f000b');
update public.profiles set created_at = '2024-12-31 09:00:00+00'
where id = '00000000-0000-0000-0000-0000000f000c';

insert into public.events (user_id, kind, payload, created_at) values
  ('00000000-0000-0000-0000-0000000f000a', 'app_open', '{"platform": "ios"}', '2025-01-06 10:01:00+00'),
  ('00000000-0000-0000-0000-0000000f000a', 'first_session', '{"platform": "ios"}', '2025-01-06 10:05:00+00'),
  ('00000000-0000-0000-0000-0000000f000a', 'ten_ranked', '{"platform": "ios"}', '2025-01-06 10:30:00+00'),
  ('00000000-0000-0000-0000-0000000f000a', 'first_pick', '{"platform": "ios"}', '2025-01-08 12:00:00+00'),
  ('00000000-0000-0000-0000-0000000f000a', 'app_open', '{"platform": "ios"}', '2025-01-13 00:30:00+00'),
  ('00000000-0000-0000-0000-0000000f000b', 'app_open', '{"platform": "web"}', '2025-01-06 10:59:00+00'),
  ('00000000-0000-0000-0000-0000000f000b', 'first_session', '{"platform": "web"}', '2025-01-06 11:00:00+00'),
  ('00000000-0000-0000-0000-0000000f000b', 'media_interest', '{"medium": "tv", "platform": "web"}', '2025-01-06 11:00:00+00'),
  ('00000000-0000-0000-0000-0000000f000b', 'app_open', '{"platform": "web"}', '2025-01-12 23:30:00+00'),
  ('00000000-0000-0000-0000-0000000f000c', 'first_session', '{}', '2024-12-31 09:10:00+00'),
  ('00000000-0000-0000-0000-0000000f000c', 'app_open', '{}', '2025-01-09 18:00:00+00'),
  ('00000000-0000-0000-0000-0000000f000c', 'ten_ranked', '{}', '2025-01-20 20:00:00+00');

-- 1. Structure and grants --------------------------------------------------------

-- 1
select has_function('public', 'funnel_users', array['timestamp with time zone', 'timestamp with time zone'],
  'funnel_users(since, until) exists');
-- 2
select has_function('public', 'funnel_report', array['timestamp with time zone', 'timestamp with time zone'],
  'funnel_report(since, until) exists');
-- 3
select has_function('public', 'funnel_report_by_cohort', array['timestamp with time zone', 'timestamp with time zone'],
  'funnel_report_by_cohort(since, until) exists');

-- 4
select is(
  (select count(*) from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('funnel_users', 'funnel_report', 'funnel_report_by_cohort')
      and prosecdef
      and proconfig @> array['search_path=public, extensions']),
  3::bigint,
  'all three are security definer with the search_path pinned'
);

-- 5
select ok(
  not has_function_privilege('authenticated', 'public.funnel_users(timestamptz, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.funnel_report(timestamptz, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.funnel_report_by_cohort(timestamptz, timestamptz)', 'execute'),
  'authenticated may execute none of them'
);

-- 6
select ok(
  not has_function_privilege('anon', 'public.funnel_users(timestamptz, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.funnel_report(timestamptz, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.funnel_report_by_cohort(timestamptz, timestamptz)', 'execute'),
  'anon may execute none of them'
);

-- 7
select ok(
  has_function_privilege('service_role', 'public.funnel_users(timestamptz, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.funnel_report(timestamptz, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.funnel_report_by_cohort(timestamptz, timestamptz)', 'execute'),
  'the service role may execute all three'
);

-- 2 and 3. The funnel and the day-7 boundary ------------------------------------
-- The window [Mon 01-06, Sat 02-01) holds A and B only.

-- 8
select results_eq(
  $$ select step_order, step, users from public.funnel_report('2025-01-06', '2025-02-01') $$,
  $$ values (1, 'signed_up'::text, 2::bigint), (2, 'first_session', 2), (3, 'ten_ranked', 1),
            (4, 'first_pick', 1), (5, 'day_7_return', 1) $$,
  'A and B: both signed up and reached first_session; only A ranked ten, picked, and came back on day 7'
);

-- 9
select results_eq(
  $$ select user_id, first_session, ten_ranked, first_pick, day_7_return
     from public.funnel_users('2025-01-06', '2025-02-01') order by user_id $$,
  $$ values ('00000000-0000-0000-0000-0000000f000a'::uuid, true, true, true, true),
            ('00000000-0000-0000-0000-0000000f000b'::uuid, true, false, false, false) $$,
  'A reaches every step; B stops at first_session'
);

-- 10
select is(
  (select day_7_return from public.funnel_users('2025-01-06', '2025-02-01')
    where user_id = '00000000-0000-0000-0000-0000000f000a'),
  true,
  'an open on calendar day 7 counts, though it is 6 days 14.5 hours after signing up'
);

-- 11
select is(
  (select day_7_return from public.funnel_users('2025-01-06', '2025-02-01')
    where user_id = '00000000-0000-0000-0000-0000000f000b'),
  false,
  'an open on calendar day 6 does not, though it is only an hour less'
);

-- 12
select is(
  (select day_7_return from public.funnel_users('2024-12-30', '2025-02-01')
    where user_id = '00000000-0000-0000-0000-0000000f000c'),
  true,
  'an open on day 9 counts: any day from the seventh on'
);

-- 13
select is(
  (select count(*) from public.funnel_users('2025-01-06', '2025-02-01')),
  2::bigint,
  'events of a kind that is no step (media_interest) add no row and no step'
);

-- 4. The window ---------------------------------------------------------------------

-- 14
select results_eq(
  $$ select users from public.funnel_report('2024-12-30', '2025-02-01') order by step_order $$,
  $$ values (3::bigint), (3), (2), (1), (2) $$,
  'widening p_since to the week before brings C in: three signed up, two ranked ten, two came back'
);

-- 15
select results_eq(
  $$ select users from public.funnel_report('2025-01-06', '2025-01-13') order by step_order $$,
  $$ values (2::bigint), (2), (1), (1), (0) $$,
  'p_until at Mon 01-13 00:00 drops A''s return at 00:30 and keeps the pick of 01-08'
);

-- 16
select results_eq(
  $$ select users from public.funnel_report('2024-12-30', '2025-01-07') order by step_order $$,
  $$ values (3::bigint), (3), (1), (0), (0) $$,
  'a step reached after p_until is not counted: C''s ten_ranked of 01-20 and return of 01-09 drop'
);

-- 17
select is(
  (select users from public.funnel_report('2024-12-30', '2025-01-06 10:00:00+00') where step = 'signed_up'),
  1::bigint,
  'the window is half-open: a sign-up at exactly p_until is left out'
);

-- 18
select is(
  (select users from public.funnel_report('2025-01-06 10:00:00+00', null) where step = 'signed_up')
    - (select count(*) from public.profiles where created_at >= '2025-01-06 10:00:00+00'),
  0::bigint,
  'and a sign-up at exactly p_since is in; a null p_until is open'
);

-- 19
select is(
  (select users from public.funnel_report() where step = 'signed_up'),
  (select count(*) from public.profiles),
  'with no window, every profile is counted'
);

-- 20
select is(
  (select users from public.funnel_report(null, '2025-02-01') where step = 'signed_up')
    - (select count(*) from public.profiles where created_at < '2025-02-01'),
  0::bigint,
  'a null p_since is open'
);

-- 21
select throws_ok(
  $$ select * from public.funnel_report('2025-02-01', '2025-01-06') $$,
  '22023',
  null,
  'a window that ends before it starts is refused'
);

-- 22
select throws_ok(
  $$ select * from public.funnel_report('2025-01-06', '2025-01-06') $$,
  '22023',
  null,
  'and so is an empty one'
);

-- 5. The cohort split -------------------------------------------------------------

-- 23
select results_eq(
  $$ select cohort_week, signed_up, first_session, ten_ranked, first_pick, day_7_return
     from public.funnel_report_by_cohort('2024-12-30', '2025-02-01') $$,
  $$ values ('2024-12-30'::date, 1::bigint, 1::bigint, 1::bigint, 0::bigint, 1::bigint),
            ('2025-01-06'::date, 2::bigint, 2::bigint, 1::bigint, 1::bigint, 1::bigint) $$,
  'one row per week of sign-up, named by its Monday, oldest first: C''s week, then A and B''s'
);

-- 24
select is(
  (select sum(signed_up) from public.funnel_report_by_cohort('2024-12-30', '2025-02-01')),
  (select users from public.funnel_report('2024-12-30', '2025-02-01') where step = 'signed_up')::numeric,
  'the weeks add up to the report'
);

-- 25
select throws_ok(
  $$ select * from public.funnel_report_by_cohort('2025-02-01', '2025-01-06') $$,
  '22023',
  null,
  'the cohort report refuses a backwards window too'
);

-- 6. Who may call it ---------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000f000a","role":"authenticated"}';

-- 26
select throws_ok(
  $$ select * from public.funnel_report() $$,
  '42501',
  null,
  'a signed-in user gets a permission error from funnel_report'
);

-- 27
select throws_ok(
  $$ select * from public.funnel_report_by_cohort() $$,
  '42501',
  null,
  'and from funnel_report_by_cohort'
);

-- 28
select throws_ok(
  $$ select * from public.funnel_users() $$,
  '42501',
  null,
  'and from funnel_users'
);

reset role;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

-- 29
select throws_ok(
  $$ select * from public.funnel_report() $$,
  '42501',
  null,
  'anon gets a permission error too'
);

reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';

-- 30
select results_eq(
  $$ select users from public.funnel_report('2025-01-06', '2025-02-01') order by step_order $$,
  $$ values (2::bigint), (2), (1), (1), (1) $$,
  'the service role reads every user''s funnel'
);

-- 31
select is(
  (select count(*) from public.funnel_report_by_cohort('2024-12-30', '2025-02-01')),
  2::bigint,
  'and the cohort split'
);

reset role;

select * from finish();
rollback;
