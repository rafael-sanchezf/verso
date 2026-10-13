-- The funnel report: the read side of the events the app has logged since the
-- onboarding backend (20261007120000_onboarding_backend.sql, section 3).
-- docs/design/specs/onboarding.md, "Events (the funnel, wave A)"; ROADMAP.md
-- V0, "The funnel events". Nothing read `events` until now; this is the one
-- place that does, and only as the service role.
--
-- What it adds, in file order:
--
--   1. funnel_users(since, until): internal, one row per account that signed
--      up in the window, with whether it reached each step. The two reports
--      below are counts over it, so they can never disagree about a user.
--   2. funnel_report(since, until): one row per step, the number of distinct
--      users who reached it.
--   3. funnel_report_by_cohort(since, until): the same steps, one row per week
--      of sign-up, so one wave of testers can be told apart from the next.
--
-- The steps, in order:
--
--   signed_up      a profile created in the window (handle_new_user writes it
--                  in the same second as the account)
--   first_session  a first_session event: the questionnaire's Continue
--   ten_ranked     a ten_ranked event: the ranked count first reached ten
--   first_pick     a first_pick event: the finder's first pick. Nothing logs
--                  it until the finder is built, so it reads 0 until then.
--   day_7_return   derived, never logged: an app_open on a calendar day at
--                  least seven days after the day the user signed up
--
-- ## A cohort funnel, not an activity count
--
-- The window picks the people, not the events: a user is in the report when
-- their profile was created in [p_since, p_until), and each later step counts
-- them when they reached it at any time before p_until. That is what makes the
-- steps a funnel (everyone in a step signed up in the window) and what lets a
-- report for one month be run again months later and give the same numbers, the
-- way a report as of a date should. Both bounds are optional; null is open.
-- The window is half-open, so consecutive windows never count a user twice.
--
-- Each step counts the users who reached it, not those who reached it and
-- every step before it. The app enforces the order for a new account (no
-- ranking before the questionnaire); an account from before the events table
-- (Rafa's own, the test accounts) has rankings and no first_session, and a
-- strict funnel would hide that rather than show it. Pass p_since to leave
-- those accounts out: the first accounts that can have logged first_session
-- signed up after 20261007120000 reached the hosted project.
--
-- ## Day 7 is counted from the sign-up day
--
-- The anchor is the profile's created_at, not the first app_open. An event
-- cannot be older than its account, so the sign-up day is never later than the
-- first open, and it is the cohort's own key. Counting from the first app_open
-- would start the clock late twice over: for an account that predates the
-- app_open hook (its first logged open is weeks after it signed up, so a
-- genuine return reads as day 0), and for a user whose day-0 open was lost
-- (useAppOpenEvent drops a failed write and tries on the next foreground).
-- The brief's alternative, the earlier of the two, is the sign-up day in every
-- case, so it is written as that. Any later open counts, not only one on day
-- seven exactly; "day 7" means "came back a week or more after joining".
--
-- Calendar days are UTC days, because the server stores instants and the
-- device's day is not in the row. app_open is logged once per local day, so a
-- user in New York who signs up at 21:00 and opens again at 21:00 a week
-- later is on day 7 either way; only opens within a few hours of local
-- midnight can land a day early or late. A user who signed up less than seven
-- days before p_until (or now) cannot have returned yet, so the newest week of
-- the cohort report reads low on this step until it is a week old.
--
-- ## Grants: the service role only, and security definer
--
-- The report reads every user's events and profile, which no signed-in user
-- may do (events is owner-read only). So all three functions are revoked from
-- public, anon and authenticated and granted to service_role alone, the way
-- recommendation_loo is in 20260924120000_recommendation_foundations.sql. They
-- are security definer with a pinned search_path so that what they can read
-- does not depend on the caller's row-level-security bypass: the owner of the
-- tables reads them, and only a caller who already holds execute can ask. The
-- way to run it is `pnpm funnel` with the database connection string
-- (packages/catalog/src/funnel-cli.ts; docs/process/hosted-setup.md, section
-- 12), or the SQL editor. Nothing in the app calls these, and the counts carry
-- no user ids out.
--
-- Errors raised here use the SQLSTATEs the earlier files use, following the
-- legend in 20260915130000_ranking_functions.sql:
--   22023  a bad argument: p_since not before p_until

-- ==============================================================================
-- 1. funnel_users: who signed up in the window, and how far each one got
-- ==============================================================================

create or replace function public.funnel_users(
  p_since timestamptz default null,
  p_until timestamptz default null
)
returns table (
  user_id uuid,
  signed_up_at timestamptz,
  first_session boolean,
  ten_ranked boolean,
  first_pick boolean,
  day_7_return boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if p_since is not null and p_until is not null and p_since >= p_until then
    raise exception using
      errcode = '22023',
      message = format('p_since (%s) must be before p_until (%s)', p_since, p_until);
  end if;

  return query
  select
    p.id,
    p.created_at,
    exists (
      select 1 from public.events e
      where e.user_id = p.id and e.kind = 'first_session'
        and (p_until is null or e.created_at < p_until)
    ),
    exists (
      select 1 from public.events e
      where e.user_id = p.id and e.kind = 'ten_ranked'
        and (p_until is null or e.created_at < p_until)
    ),
    exists (
      select 1 from public.events e
      where e.user_id = p.id and e.kind = 'first_pick'
        and (p_until is null or e.created_at < p_until)
    ),
    -- The sign-up day plus seven, in UTC calendar days (header, "Day 7").
    exists (
      select 1 from public.events e
      where e.user_id = p.id and e.kind = 'app_open'
        and (p_until is null or e.created_at < p_until)
        and (e.created_at at time zone 'UTC')::date >= (p.created_at at time zone 'UTC')::date + 7
    )
  from public.profiles p
  where (p_since is null or p.created_at >= p_since)
    and (p_until is null or p.created_at < p_until);
end;
$$;

comment on function public.funnel_users(timestamptz, timestamptz) is
  'Internal, service role only. One row per account whose profile was created in [p_since, p_until) (null is open), with whether it reached first_session, ten_ranked and first_pick before p_until, and day_7_return: an app_open on a UTC calendar day at least seven days after the sign-up day. funnel_report and funnel_report_by_cohort count over it.';

-- ==============================================================================
-- 2. funnel_report: one row per step
-- ==============================================================================

create or replace function public.funnel_report(
  p_since timestamptz default null,
  p_until timestamptz default null
)
returns table (
  step_order integer,
  step text,
  users bigint
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select s.step_order, s.step, s.users
  from (
    select
      count(*) as signed_up,
      count(*) filter (where u.first_session) as first_session,
      count(*) filter (where u.ten_ranked) as ten_ranked,
      count(*) filter (where u.first_pick) as first_pick,
      count(*) filter (where u.day_7_return) as day_7_return
    from public.funnel_users(p_since, p_until) u
  ) c
  cross join lateral (
    values
      (1, 'signed_up', c.signed_up),
      (2, 'first_session', c.first_session),
      (3, 'ten_ranked', c.ten_ranked),
      (4, 'first_pick', c.first_pick),
      (5, 'day_7_return', c.day_7_return)
  ) as s (step_order, step, users)
  order by s.step_order;
$$;

comment on function public.funnel_report(timestamptz, timestamptz) is
  'Service role only. The onboarding funnel for the accounts that signed up in [p_since, p_until) (null is open): one row per step (signed_up, first_session, ten_ranked, first_pick, day_7_return) with the number of distinct users who reached it before p_until. Each step counts everyone who reached it, not only those who reached every earlier step.';

-- ==============================================================================
-- 3. funnel_report_by_cohort: the same steps, one row per week of sign-up
-- ==============================================================================
--
-- Weeks start on Monday, in UTC (date_trunc's ISO week), and are named by
-- that Monday. Only weeks with at least one sign-up appear. Wide rather than
-- one row per week and step, because the cohorts are read across.

create or replace function public.funnel_report_by_cohort(
  p_since timestamptz default null,
  p_until timestamptz default null
)
returns table (
  cohort_week date,
  signed_up bigint,
  first_session bigint,
  ten_ranked bigint,
  first_pick bigint,
  day_7_return bigint
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    date_trunc('week', u.signed_up_at at time zone 'UTC')::date,
    count(*),
    count(*) filter (where u.first_session),
    count(*) filter (where u.ten_ranked),
    count(*) filter (where u.first_pick),
    count(*) filter (where u.day_7_return)
  from public.funnel_users(p_since, p_until) u
  group by 1
  order by 1;
$$;

comment on function public.funnel_report_by_cohort(timestamptz, timestamptz) is
  'Service role only. funnel_report split by week of sign-up: one row per UTC week (named by its Monday) with at least one account created in [p_since, p_until), and the number of its users who reached each step before p_until.';

-- ==============================================================================
-- Grants
-- ==============================================================================

revoke all on function public.funnel_users(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.funnel_report(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.funnel_report_by_cohort(timestamptz, timestamptz) from public, anon, authenticated;

grant execute on function public.funnel_users(timestamptz, timestamptz) to service_role;
grant execute on function public.funnel_report(timestamptz, timestamptz) to service_role;
grant execute on function public.funnel_report_by_cohort(timestamptz, timestamptz) to service_role;
