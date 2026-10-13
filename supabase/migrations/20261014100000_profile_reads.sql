-- The profile reads: activity across media, the ranker percentile, the hours,
-- the public flag, and the avatar bucket.
-- docs/private/design/movies-build.md, PR 4; docs/design/profile-brief.md
-- (the page, Rafa's letters of 2026-10-12 and round two: the stats in Beli's
-- shape, Recent collapsed to a calendar, the verb by source).
--
-- What it adds, in file order:
--
--   1. user_entries.finished_from: 'playing' when the log flow moved a game
--      from Playing to played, so Profile can say "Finished X". The app
--      writes it (PR 5); a trigger clears it on every other path.
--   2. activity_events: one row per thing the caller did, across media, in
--      an optional date range. The helper the two reads below share.
--   3. recent_activity(limit, medium, time zone): Profile's Recent rows.
--   4. activity_month(year, month, medium, time zone): the Activity calendar.
--   5. ranker_percentile(medium): the "Top N% of rankers" tile.
--   6. profile_hours(medium): the Hours tile.
--   7. profiles.public: the public profile switch, which nothing reads yet.
--   8. The avatars bucket and its owner-only policies, where storage exists.
--
-- Errors raised here use the SQLSTATEs the earlier files use, following the
-- legend in 20260915130000_ranking_functions.sql:
--   28000  no authenticated user
--   22023  a limit below one, or a month outside 1 to 12

-- ==============================================================================
-- 1. user_entries.finished_from
-- ==============================================================================
--
-- Rafa's rule on the verb (profile-brief, round two): a thing entered on its
-- own, later, says what happened ("Watched X", "Finished X") with that day; a
-- thing entered in bulk says "Ranked X". For films the diary row's source
-- carries it (20261013100000_movie_screens.sql). For games there is no diary,
-- and finished_at alone cannot tell "I finished this" in the log flow from a
-- date typed into the details sheet or a game ranked from the deck, so the log
-- flow says it: when it moves a game from playing to played it sends
-- finished_from = 'playing' beside status and finished_at, in the same write
-- (PR 5 of the build). Null otherwise, which is every row before that PR.
--
-- One value for now, kept as text with a check rather than an enum so a
-- second origin (a game dropped then finished, say) is one constraint, not a
-- type migration. user_entries keeps its owner-only policy; the column rides
-- the table's grants like finished_at does.
--
-- The trigger keeps the column honest, so the read never has to second-guess
-- it. On every update:
--
--   * status anything but played: cleared. A game moved back to Playing, to
--     the backlog or to dropped is not finished.
--   * playing to played: kept only when this write sent it. An update that
--     does not name the column carries the old value, and the old value is
--     null whenever the entry was in Playing (the rule above), so "sent it"
--     is "differs from the old row". markFinished from the game page, which
--     sends no finished_from, leaves it null.
--   * any other way into played (backlog, dropped, the diary's upsert for a
--     film): cleared, since nothing was being played.
--   * played staying played: the value can be cleared but not newly set, so
--     a later write cannot claim a finish the log flow never recorded.
--
-- Update only, not insert: the app's writes are upserts (writeEntry), and a
-- before-insert change to the proposed row would reach the conflict's update
-- as `excluded` and erase the log flow's value. A brand-new entry written
-- straight to played has no Playing behind it, and the app never sends the
-- column there.

alter table public.user_entries
  add column finished_from text
    constraint user_entries_finished_from_check check (finished_from is null or finished_from = 'playing');

comment on column public.user_entries.finished_from is
  'Where a finished game came from: playing when the log flow moved it from Playing to played in one write (Profile then reads "Finished X" on finished_at), null otherwise. Cleared by user_entries_finished_from whenever the entry leaves played or reaches it any other way. Read for games only.';

create function public.user_entries_finished_from()
returns trigger
language plpgsql
security invoker
set search_path = public, extensions
as $$
begin
  if new.status is distinct from 'played' then
    new.finished_from := null;
  elsif old.status = 'playing' then
    if new.finished_from is not distinct from old.finished_from then
      new.finished_from := null;
    end if;
  elsif old.status is distinct from 'played' then
    new.finished_from := null;
  elsif new.finished_from is not null and new.finished_from is distinct from old.finished_from then
    new.finished_from := old.finished_from;
  end if;
  return new;
end;
$$;

comment on function public.user_entries_finished_from() is
  'Keep user_entries.finished_from to the log flow''s playing-to-played write: cleared when status is not played, kept on the playing-to-played update only when that write sent it, cleared on any other way into played, and never newly set on an entry already played.';

create trigger user_entries_finished_from
  before update on public.user_entries
  for each row execute function public.user_entries_finished_from();

revoke all on function public.user_entries_finished_from() from public, anon;

-- ==============================================================================
-- 2. activity_events
-- ==============================================================================
--
-- One row per event, across media, for the caller (Row Level Security on
-- ranking_entries, watch_log and user_entries decides whose; the explicit
-- auth.uid() filters are there for the planner):
--
--   ranked    a ranking_entries row, on the day of placed_at (which only a
--             placement writes, never a move or a neighbour's shift). Every
--             bulk row and every undated import row reaches Recent this way:
--             the deck's session and the Letterboxd import place the film, and
--             a diary row with no day says nothing about when, so it adds no
--             line of its own (rule 35: the ranking never implies a date).
--   watched   a dated diary row from the log sheet (source 'log', always
--             dated) or from a Letterboxd export that carried a date (source
--             'import'), on watched_on, as the profile brief has it. A
--             rewatch is another line.
--   finished  a game whose entry is played with finished_from 'playing', on
--             finished_at.
--
-- The log sheet's "Save and rank", the games log flow and the Letterboxd
-- import write a watch or a finish and a placement together. Two lines for one
-- act would read as a stutter, so a ranked event is left out when the same
-- item has a watched or finished event on the same day: that line carries the
-- score instead ("Finished X · 9.4", PR 5's verbs). A film watched last week
-- and ranked today keeps both lines, because both happened.
--
-- The score is the item's derived score now (ranking_percentiles, the number
-- the app shows), on every kind, null when it is not ranked. Never a rank
-- number (round two: "I just need to know the score").
--
-- placed_at is a timestamp; the day it falls on depends on where the person
-- is, so the caller passes its IANA time zone (the app sends the device's).
-- A zone pg_timezone_names does not list (a typo, an offset like '+05:00',
-- null) is read as UTC rather than raised, so a device reporting something odd
-- still gets its Recent and its calendar. watched_on and finished_at are
-- already the person's days. occurred_at is the moment when one is stored
-- (placed_at, the diary row's created_at) and null for a finish, whose entry
-- keeps a day only; it orders the events of one day and gives Recent its
-- relative time.
--
-- p_from and p_to bound the days, both inclusive, either null for open:
-- activity_month passes its month so the work stays inside it, and
-- recent_activity passes neither. The fold above compares days inside the same
-- range, so a range never splits a watch from its placement.
--
-- Security invoker, with a pinned search_path like every function here, which
-- means the planner does not inline it: it runs once per call, which is what
-- the range parameters are for.

create function public.activity_events(
  p_medium public.medium default null,
  p_time_zone text default 'UTC',
  p_from date default null,
  p_to date default null
)
returns table (
  kind text,
  on_date date,
  occurred_at timestamptz,
  media_item_id uuid,
  medium public.medium,
  title text,
  cover_image_id text,
  external_ids jsonb,
  score numeric,
  place text
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_tz text := 'UTC';
begin
  if p_time_zone is not null
    and exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_time_zone)
  then
    v_tz := p_time_zone;
  end if;

  return query
  with
  scores as (
    select rp.media_item_id, rp.score
    from public.ranking_percentiles rp
    where rp.user_id = v_uid
      and (p_medium is null or rp.medium = p_medium)
  ),
  watched as (
    select w.media_item_id, w.watched_on as on_date, w.created_at as occurred_at, w.place
    from public.watch_log w
    join public.media_items m on m.id = w.media_item_id
    where w.user_id = v_uid
      and w.source in ('log', 'import')
      and w.watched_on is not null
      and (p_from is null or w.watched_on >= p_from)
      and (p_to is null or w.watched_on <= p_to)
      and (p_medium is null or m.medium = p_medium)
  ),
  finished as (
    select e.media_item_id, e.finished_at as on_date
    from public.user_entries e
    join public.media_items m on m.id = e.media_item_id
    where e.user_id = v_uid
      and m.medium = 'game'
      and (p_medium is null or p_medium = 'game')
      and e.status = 'played'
      and e.finished_from = 'playing'
      and e.finished_at is not null
      and (p_from is null or e.finished_at >= p_from)
      and (p_to is null or e.finished_at <= p_to)
  ),
  ranked as (
    select x.media_item_id, x.on_date, x.occurred_at
    from (
      select
        r.media_item_id,
        (r.placed_at at time zone v_tz)::date as on_date,
        r.placed_at as occurred_at
      from public.ranking_entries r
      where r.user_id = v_uid
        and (p_medium is null or r.medium = p_medium)
    ) x
    where (p_from is null or x.on_date >= p_from)
      and (p_to is null or x.on_date <= p_to)
  ),
  events as (
    select 'watched'::text as kind, w.media_item_id, w.on_date, w.occurred_at, w.place
    from watched w
    union all
    select 'finished', f.media_item_id, f.on_date, null::timestamptz, null::text
    from finished f
    union all
    select 'ranked', r.media_item_id, r.on_date, r.occurred_at, null::text
    from ranked r
    where not exists (select 1 from watched w where w.media_item_id = r.media_item_id and w.on_date = r.on_date)
      and not exists (select 1 from finished f where f.media_item_id = r.media_item_id and f.on_date = r.on_date)
  )
  select
    ev.kind,
    ev.on_date,
    ev.occurred_at,
    ev.media_item_id,
    m.medium,
    m.title,
    m.cover_image_id,
    m.external_ids,
    s.score,
    ev.place
  from events ev
  join public.media_items m on m.id = ev.media_item_id
  left join scores s on s.media_item_id = ev.media_item_id;
end;
$$;

comment on function public.activity_events(public.medium, text, date, date) is
  'The caller''s events across media, unordered, with on_date between p_from and p_to (inclusive, null for open): ranked (a placement, on placed_at''s day in p_time_zone, UTC when the zone is unknown), watched (a dated log or import diary row), finished (a game played with finished_from playing). A ranking on the same day as a watch or finish of the same item is folded into that line. Each with the item and its current score. The helper recent_activity and activity_month share.';

revoke all on function public.activity_events(public.medium, text, date, date) from public, anon;
grant execute on function public.activity_events(public.medium, text, date, date) to authenticated, service_role;

-- ==============================================================================
-- 3. recent_activity
-- ==============================================================================
--
-- Profile's Recent: the newest events first, across media unless a medium is
-- asked (the medium switcher on Profile). Two or three rows on the page and
-- "See all ›" to Activity (round one), so the default limit is ten.
-- Newest by day, then by moment within the day (a finish, which has no
-- moment, after the timed events of its day), then by title so two of an
-- import's placements, which share a timestamp, keep a stable order.

create function public.recent_activity(
  p_limit integer default 10,
  p_medium public.medium default null,
  p_time_zone text default 'UTC'
)
returns table (
  kind text,
  on_date date,
  occurred_at timestamptz,
  media_item_id uuid,
  medium public.medium,
  title text,
  cover_image_id text,
  external_ids jsonb,
  score numeric,
  place text
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception using
      errcode = '28000',
      message = 'recent_activity requires an authenticated user';
  end if;

  if p_limit is null or p_limit < 1 then
    raise exception using
      errcode = '22023',
      message = format('limit must be 1 or more, got %s', coalesce(p_limit::text, 'null'));
  end if;

  return query
  select a.*
  from public.activity_events(p_medium, p_time_zone, null, null) a
  order by a.on_date desc, a.occurred_at desc nulls last, a.title, a.media_item_id
  limit p_limit;
end;
$$;

comment on function public.recent_activity(integer, public.medium, text) is
  'Profile''s Recent: the caller''s events newest first (activity_events), p_limit of them, across media or in one. p_time_zone is the device''s IANA zone, for the day a ranking fell on; an unknown zone reads as UTC.';

revoke all on function public.recent_activity(integer, public.medium, text) from public, anon;
grant execute on function public.recent_activity(integer, public.medium, text) to authenticated, service_role;

-- ==============================================================================
-- 4. activity_month
-- ==============================================================================
--
-- The Activity calendar (round one: "when you click on recent, it expands to
-- show you a calendar"): every event of one month with its day of the month,
-- newest first, so the grid draws one poster per day and "+N" for the rest
-- (round two) and the list under it reads in the same order as Recent. The
-- grid's grouping is the app's; the rows are not capped, a month is small.

create function public.activity_month(
  p_year integer,
  p_month integer,
  p_medium public.medium default null,
  p_time_zone text default 'UTC'
)
returns table (
  day integer,
  kind text,
  on_date date,
  occurred_at timestamptz,
  media_item_id uuid,
  medium public.medium,
  title text,
  cover_image_id text,
  external_ids jsonb,
  score numeric,
  place text
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_first date;
begin
  if auth.uid() is null then
    raise exception using
      errcode = '28000',
      message = 'activity_month requires an authenticated user';
  end if;

  if p_month is null or p_month not between 1 and 12 or p_year is null or p_year not between 1900 and 9999 then
    raise exception using
      errcode = '22023',
      message = format('a month is a year from 1900 and a month from 1 to 12, got %s-%s',
        coalesce(p_year::text, 'null'), coalesce(p_month::text, 'null'));
  end if;

  v_first := make_date(p_year, p_month, 1);

  return query
  select extract(day from a.on_date)::integer, a.*
  from public.activity_events(p_medium, p_time_zone, v_first, (v_first + interval '1 month' - interval '1 day')::date) a
  order by a.on_date desc, a.occurred_at desc nulls last, a.title, a.media_item_id;
end;
$$;

comment on function public.activity_month(integer, integer, public.medium, text) is
  'The Activity calendar: the caller''s events (activity_events) in one month, newest first, each with its day of the month. Across media or in one.';

revoke all on function public.activity_month(integer, integer, public.medium, text) from public, anon;
grant execute on function public.activity_month(integer, integer, public.medium, text) to authenticated, service_role;

-- ==============================================================================
-- 5. ranker_percentile
-- ==============================================================================
--
-- "Top 8% of rankers" (round one, the stats in Beli's shape): the caller's
-- share of rankers who have ranked fewer items than they have, 0 to 100, one
-- decimal. Across media (every ranked item, whatever its medium) or in one.
--
-- The cohort is the users with at least one ranked item in scope: someone who
-- signed up and ranked nothing is not a ranker, and counting them would flatter
-- everyone. The caller with nothing ranked gets null, as does any caller while
-- the cohort is under ten (the build's default 4), so the tile hides rather
-- than saying "Top 100%" of a cohort of one. Ties count as not fewer, so the
-- top of a tie does not claim to beat the others.
--
-- Security definer, because the count runs over every user's rankings, which
-- the owner-only policy hides from the caller. It takes no user argument,
-- works on auth.uid() alone and returns one number about the caller; no other
-- user's count or identity leaves it.

create function public.ranker_percentile(
  p_medium public.medium default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_mine bigint;
  v_cohort bigint;
  v_fewer bigint;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'ranker_percentile requires an authenticated user';
  end if;

  with counts as (
    select r.user_id, count(*) as n
    from public.ranking_entries r
    where p_medium is null or r.medium = p_medium
    group by r.user_id
  )
  select
    (select c.n from counts c where c.user_id = v_uid),
    count(*),
    count(*) filter (where c.n < (select c2.n from counts c2 where c2.user_id = v_uid))
  into v_mine, v_cohort, v_fewer
  from counts c;

  if v_mine is null or v_cohort < 10 then
    return null;
  end if;

  return round(100.0 * v_fewer / v_cohort, 1);
end;
$$;

comment on function public.ranker_percentile(public.medium) is
  'The caller''s share of rankers (users with at least one ranked item, across media or in p_medium) who have ranked fewer items, 0 to 100 with one decimal. Null when the caller has ranked nothing or the cohort is under ten. Security definer over every user''s counts; returns the caller''s number only.';

revoke all on function public.ranker_percentile(public.medium) from public, anon;
grant execute on function public.ranker_percentile(public.medium) to authenticated, service_role;

-- ==============================================================================
-- 6. profile_hours
-- ==============================================================================
--
-- The Hours tile ("128 h" on All, "64 h" on one medium). Games: the sum of
-- user_entries.playtime_minutes (the Steam import's playtime and the details
-- sheet's), over every status, since an hour played on a dropped game was
-- still played. Films: one runtime per diary row, every source, so a rewatch
-- counts twice and "Seen before Verso" counts once; a film with no runtime in
-- the catalog adds nothing. TV adds nothing until its unit is decided.
--
-- Hours with one decimal; the tile rounds. Security invoker: the caller's own
-- rows under their owner-only policies.

create function public.profile_hours(
  p_medium public.medium default null
)
returns numeric
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_minutes bigint;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'profile_hours requires an authenticated user';
  end if;

  select
    coalesce((
      select sum(e.playtime_minutes)
      from public.user_entries e
      join public.media_items m on m.id = e.media_item_id
      where e.user_id = v_uid
        and m.medium = 'game'
        and (p_medium is null or p_medium = 'game')
    ), 0)
    + coalesce((
      select sum(md.runtime_minutes)
      from public.watch_log w
      join public.movie_details md on md.media_item_id = w.media_item_id
      where w.user_id = v_uid
        and (p_medium is null or p_medium = 'movie')
    ), 0)
  into v_minutes;

  return round(v_minutes / 60.0, 1);
end;
$$;

comment on function public.profile_hours(public.medium) is
  'The caller''s hours, one decimal, across media or in one: games'' playtime_minutes summed over every entry, plus one film runtime per diary row. TV adds nothing yet.';

revoke all on function public.profile_hours(public.medium) from public, anon;
grant execute on function public.profile_hours(public.medium) to authenticated, service_role;

-- ==============================================================================
-- 7. profiles.public
-- ==============================================================================
--
-- The Edit profile switch, off by default (profile-brief, Edit profile). On,
-- it will make /u/<handle> show the rankings, tiers and scores, never notes,
-- the diary, the backlog or hours; nothing reads it until that page exists
-- (the web brief's item 8). Readable like platforms (every signed-in user can
-- read profiles, the social layer needs it) and written by the owner through
-- the existing "users update their own profile" policy.

alter table public.profiles
  add column public boolean not null default false;

comment on column public.profiles.public is
  'Whether the public profile page (/u/<username>) is on: rankings, tiers and scores, never notes, the diary, the backlog or hours. Off by default; the owner writes it. Nothing reads it until the page ships.';

-- ==============================================================================
-- 8. The avatars bucket
-- ==============================================================================
--
-- Edit profile's "Change photo" (profile-brief): the app resizes to 512 and
-- uploads to avatars/<uid>/<name>, then writes the object's public URL to
-- profiles.avatar_url (uploadAvatar in packages/api/src/profiles.ts).
--
--   * Public read through the bucket's public flag: the public URL is served
--     without a policy, which is how an avatar appears beside a handle.
--   * 2 MB and three image types: a 512 square in JPEG, PNG or WebP is far
--     under it; HEIC is left out because the web and Android cannot draw it.
--   * Insert, update, delete and select on storage.objects for the owner's own
--     folder only, the first path segment being their user id. Select is
--     owner-only too: the public URL does not need it, and a select open to
--     everyone would let anyone list the bucket, which is every user's id.
--
-- Guarded, because CI starts the stack without storage-api: where the storage
-- schema is missing the section is skipped with a notice, and the pgTAP skips
-- its storage tests on the same four conditions (its pg_temp.storage_here).
-- On the hosted project and a full local stack it always runs. Re-running it
-- is harmless: the bucket is upserted and each policy is dropped before it is
-- made.

do $$
begin
  if to_regclass('storage.buckets') is null
    or to_regclass('storage.objects') is null
    or to_regprocedure('storage.foldername(text)') is null
    or not exists (
      select 1 from pg_catalog.pg_attribute a
      where a.attrelid = to_regclass('storage.buckets')
        and a.attname = 'allowed_mime_types'
        and not a.attisdropped
    )
  then
    raise notice 'profile_reads: no storage schema here, the avatars bucket and its policies are skipped';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists "users read their own avatars" on storage.objects;
  drop policy if exists "users upload their own avatars" on storage.objects;
  drop policy if exists "users replace their own avatars" on storage.objects;
  drop policy if exists "users delete their own avatars" on storage.objects;

  create policy "users read their own avatars" on storage.objects
    for select to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

  create policy "users upload their own avatars" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

  create policy "users replace their own avatars" on storage.objects
    for update to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text))
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

  create policy "users delete their own avatars" on storage.objects
    for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
end;
$$;
