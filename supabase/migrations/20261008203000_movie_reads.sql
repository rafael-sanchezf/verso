-- The movies side's reads: where a film sits (Watchlist or Calendar), the
-- Watchlist with its availability and the finder's filters, and the Calendar.
-- docs/design/movies-brief.md, "The states of a film", "Watchlist tab" and
-- "Data model"; decision 28 and the brief's second pass for what Home reads.
--
-- What it adds:
--
--   1. movie_release_state(film, region, today): the one rule that splits
--      want-to-watch films between the Watchlist and the Calendar, so the two
--      reads below can never disagree about a film.
--   2. movie_watchlist(today, on my services, max minutes, genres): the
--      caller's want-to-watch films that sit in the Watchlist, newest added
--      first, with where each streams. The Watchlist tab with its two chips,
--      and the finder's pool (Home's first row, decision 28) with the services
--      as the silent filter.
--   3. movie_calendar(today): the caller's films that sit in the Calendar,
--      plus every film with a planned day from today on, one row each with
--      its kind and its day, films in theaters now first.
--
-- All derived; nothing is stored beyond planned_on (the brief: "All derived;
-- nothing stored beyond planned_on"). Region and services come from the
-- caller's profile (20261008202000_watch_settings.sql), never from an
-- argument, so the Watchlist and the Calendar always answer for the settings
-- the user saved. Today is an argument, as it is for the games reads in
-- packages/api/src/views.ts: the app sends the day where the user is, and the
-- default, the server's UTC date, is for psql.
--
-- Not built, by decision 28: "On your services now" (popular films on the
-- user's services they have no entry for). The brief's first pass listed it
-- as a Home block; the second pass retired it ("services never title a row",
-- "nothing on Home is popularity or trending"), and the cold start's "Popular
-- with people who watch on Netflix" is suggestion_candidates with
-- p_provider_ids, which exists.
--
-- Errors raised here use the SQLSTATEs the earlier files use, following the
-- legend in 20260915130000_ranking_functions.sql:
--   28000  no authenticated user

-- ==============================================================================
-- 1. movie_release_state
-- ==============================================================================
--
-- The brief's rule: a want-to-watch film you can stream, or one that is
-- released and streaming nowhere, sits in the Watchlist; one that is
-- unreleased, in theaters, or streaming from a known future date sits in the
-- Calendar; when a calendar film starts streaming it moves to the Watchlist by
-- itself. In the region's dates (media_release_dates) and offers
-- (watch_availability), in this order, the first that holds:
--
--   watchlist       any current offer in the region (subscription, free, ads,
--                   rent or buy): it can be watched at home now.
--   opening         a theatrical date (TMDB types 2 and 3, limited and wide)
--                   after today. placement_on is that date.
--   streaming_soon  no theatrical date and a digital date (type 4) after
--                   today: a film going straight to streaming.
--   release         no regional date at all and TMDB's primary release date
--                   after today: unreleased, kind unknown. The screen says the
--                   date and not "In theaters", because nothing says it is.
--   in_theaters     a theatrical date in the last 120 days, today included,
--                   and no digital date yet or one still ahead.
--                   placement_on is the opening day ("In theaters since").
--   streaming_soon  a digital date after today, the theatrical run over.
--   watchlist       anything else: released and streaming nowhere.
--
-- The 120 days are what stop a 1985 film with no digital date in TMDB from
-- reading as in theaters for ever; most theatrical runs are four to twelve
-- weeks, and a film with a digital date is bounded by it instead.
--
-- Security invoker, catalog only: every signed-in user may read the dates and
-- the offers already. A film that is not one, or not in the catalog, has no
-- row.

create function public.movie_release_state(
  p_media_item_id uuid,
  p_region text default 'US',
  p_today date default current_date
)
returns table (
  media_item_id uuid,
  theatrical_on date,
  digital_on date,
  streams_now boolean,
  placement text,
  placement_on date
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with facts as (
    select
      m.id,
      m.release_date,
      (select min(d.released_on)
         from public.media_release_dates d
        where d.media_item_id = m.id and d.region = p_region and d.release_type in (2, 3)) as theatrical_on,
      (select min(d.released_on)
         from public.media_release_dates d
        where d.media_item_id = m.id and d.region = p_region and d.release_type = 4) as digital_on,
      exists (
        select 1
        from public.watch_availability w
        where w.media_item_id = m.id and w.region = p_region and w.removed_at is null
      ) as streams_now,
      coalesce(p_today, current_date) as today
    from public.media_items m
    where m.id = p_media_item_id
      and m.medium = 'movie'
  ),
  placed as (
    select
      f.*,
      case
        when f.streams_now then 'watchlist'
        when f.theatrical_on > f.today then 'opening'
        when f.theatrical_on is null and f.digital_on > f.today then 'streaming_soon'
        when f.theatrical_on is null and f.digital_on is null and f.release_date > f.today then 'release'
        when f.theatrical_on > f.today - 120 and (f.digital_on is null or f.digital_on > f.today) then 'in_theaters'
        when f.digital_on > f.today then 'streaming_soon'
        else 'watchlist'
      end as placement
    from facts f
  )
  select
    p.id,
    p.theatrical_on,
    p.digital_on,
    p.streams_now,
    p.placement,
    case p.placement
      when 'opening' then p.theatrical_on
      when 'in_theaters' then p.theatrical_on
      when 'streaming_soon' then p.digital_on
      when 'release' then p.release_date
    end
  from placed p;
$$;

comment on function public.movie_release_state(uuid, text, date) is
  'Where a want-to-watch film sits in a region on a day: watchlist (streamable now, or released and streaming nowhere), opening, in_theaters, streaming_soon or release (Calendar kinds), with the day the Calendar shows. The rule the Watchlist and the Calendar share. No row for an id that is not a film.';

revoke all on function public.movie_release_state(uuid, text, date) from public, anon;
grant execute on function public.movie_release_state(uuid, text, date) to authenticated, service_role;

-- ==============================================================================
-- 2. movie_watchlist
-- ==============================================================================
--
-- The caller's want-to-watch films whose placement is watchlist in the
-- profile's region, newest added first (the tab's default sort; Runtime, Year
-- and Rating sort on the client from the columns returned). The filters, all
-- off by default and every one a WHERE clause, the way suggestion_candidates
-- writes them:
--
--   p_on_my_services  on at least one of the profile's services with a
--                     subscription, free or ads offer: the "On my services"
--                     chip, and the finder's silent filter. With no services
--                     saved it matches nothing, and the screen offers "Pick
--                     your services" rather than a list that ignored the chip.
--   p_max_minutes     runtime at or under it; a film whose runtime is unknown
--                     fails, because a limit it might break is not a limit it
--                     meets (suggestion_candidates' rule).
--   p_genres          shares at least one; empty is no filter.
--
-- Each row carries where it streams, as watch_providers ids in JustWatch's
-- display order for the region: streams_on (subscription, free or ads),
-- on_my_services (those of them on the profile), rent_or_buy. That is the
-- row's third line ("Netflix", "Rent · Apple TV", "Not streaming") and the
-- poster's service pill, with no second round trip.
--
-- Security invoker on auth.uid(): the owner-only policy on user_entries
-- decides the rows, and the filter is written out as well.

create function public.movie_watchlist(
  p_today date default current_date,
  p_on_my_services boolean default false,
  p_max_minutes integer default null,
  p_genres text[] default null
)
returns table (
  media_item_id uuid,
  title text,
  year smallint,
  cover_image_id text,
  external_ids jsonb,
  release_date date,
  runtime_minutes integer,
  genres text[],
  directors text[],
  tmdb_score numeric,
  tmdb_vote_count integer,
  added_at timestamptz,
  streams_on integer[],
  on_my_services integer[],
  rent_or_buy integer[]
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_today date := coalesce(p_today, current_date);
  v_region text;
  v_providers integer[];
  v_on_my_services boolean := coalesce(p_on_my_services, false);
  v_genres text[] := case when cardinality(p_genres) > 0 then p_genres end;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'movie_watchlist requires an authenticated user';
  end if;

  select p.watch_region, p.watch_provider_ids
  into v_region, v_providers
  from public.profiles p
  where p.id = v_uid;

  v_region := coalesce(v_region, 'US');
  v_providers := coalesce(v_providers, '{}');

  return query
  with films as (
    select
      e.media_item_id,
      e.added_at,
      m.title,
      m.year,
      m.cover_image_id,
      m.external_ids,
      m.release_date,
      md.runtime_minutes,
      coalesce(md.genres, '{}'::text[]) as genres,
      coalesce(md.directors, '{}'::text[]) as directors,
      array(
        select w.provider_id
        from public.watch_availability w
        left join public.watch_providers wp on wp.provider_id = w.provider_id
        where w.media_item_id = e.media_item_id
          and w.region = v_region
          and w.removed_at is null
          and w.offer_type in ('flatrate', 'free', 'ads')
        group by w.provider_id
        order by min((wp.display_priorities ->> v_region)::integer) nulls last, w.provider_id
      ) as streams_on,
      array(
        select w.provider_id
        from public.watch_availability w
        left join public.watch_providers wp on wp.provider_id = w.provider_id
        where w.media_item_id = e.media_item_id
          and w.region = v_region
          and w.removed_at is null
          and w.offer_type in ('rent', 'buy')
        group by w.provider_id
        order by min((wp.display_priorities ->> v_region)::integer) nulls last, w.provider_id
      ) as rent_or_buy
    from public.user_entries e
    join public.media_items m on m.id = e.media_item_id
    left join public.movie_details md on md.media_item_id = m.id
    cross join lateral public.movie_release_state(e.media_item_id, v_region, v_today) s
    where e.user_id = v_uid
      and e.medium = 'movie'
      and e.status = 'backlog'
      and s.placement = 'watchlist'
      and (v_genres is null or coalesce(md.genres, '{}'::text[]) && v_genres)
      and (p_max_minutes is null or md.runtime_minutes <= p_max_minutes)
  ),
  mine as (
    select
      f.*,
      array(
        select u.provider_id
        from unnest(f.streams_on) with ordinality as u(provider_id, n)
        where u.provider_id = any (v_providers)
        order by u.n
      ) as on_my_services
    from films f
  )
  select
    x.media_item_id,
    x.title,
    x.year,
    x.cover_image_id,
    x.external_ids,
    x.release_date,
    x.runtime_minutes,
    x.genres,
    x.directors,
    sc.score,
    sc.score_count,
    x.added_at,
    x.streams_on,
    x.on_my_services,
    x.rent_or_buy
  from mine x
  left join public.external_scores sc
    on sc.media_item_id = x.media_item_id and sc.source = 'tmdb'
  where not v_on_my_services or cardinality(x.on_my_services) > 0
  order by x.added_at desc, x.media_item_id;
end;
$$;

comment on function public.movie_watchlist(date, boolean, integer, text[]) is
  'The caller''s want-to-watch films that sit in the Watchlist in their region on p_today, newest added first, optionally only those on their services, under a runtime, or sharing a genre; each with where it streams (streams_on, on_my_services, rent_or_buy as provider ids in display order) and its TMDB score. Security invoker on auth.uid().';

revoke all on function public.movie_watchlist(date, boolean, integer, text[]) from public, anon;
grant execute on function public.movie_watchlist(date, boolean, integer, text[]) to authenticated, service_role;

-- ==============================================================================
-- 3. movie_calendar
-- ==============================================================================
--
-- One row per film, the caller's:
--
--   going           any film with planned_on today or later, whatever its
--                   status (a rewatch in theaters is a plan too). on_date is
--                   the planned day. Wins over the film's own kind, because
--                   the user's date is the one the row is about.
--   in_theaters, opening, streaming_soon, release
--                   a want-to-watch film whose placement is not watchlist, in
--                   the profile's region; on_date is the day the kind names.
--
-- Films in theaters now come first (the Calendar's "Now" group), then every
-- other row by its day, soonest first, so the client draws month headers by
-- walking the list. Each row carries the film's theatrical and digital dates
-- as well, for the line under a going row ("In theaters Oct 22").
--
-- Security invoker on auth.uid(), as movie_watchlist.

create function public.movie_calendar(p_today date default current_date)
returns table (
  media_item_id uuid,
  title text,
  year smallint,
  cover_image_id text,
  external_ids jsonb,
  runtime_minutes integer,
  status public.entry_status,
  kind text,
  on_date date,
  planned_on date,
  theatrical_on date,
  digital_on date
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_today date := coalesce(p_today, current_date);
  v_region text;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'movie_calendar requires an authenticated user';
  end if;

  select p.watch_region into v_region
  from public.profiles p
  where p.id = v_uid;

  v_region := coalesce(v_region, 'US');

  return query
  with cal as (
    select
      e.media_item_id,
      m.title,
      m.year,
      m.cover_image_id,
      m.external_ids,
      md.runtime_minutes,
      e.status,
      case when e.planned_on >= v_today then 'going' else s.placement end as kind,
      case when e.planned_on >= v_today then e.planned_on else s.placement_on end as on_date,
      e.planned_on,
      s.theatrical_on,
      s.digital_on
    from public.user_entries e
    join public.media_items m on m.id = e.media_item_id
    left join public.movie_details md on md.media_item_id = m.id
    cross join lateral public.movie_release_state(e.media_item_id, v_region, v_today) s
    where e.user_id = v_uid
      and e.medium = 'movie'
      and (
        e.planned_on >= v_today
        or (e.status = 'backlog' and s.placement <> 'watchlist')
      )
  )
  select r.*
  from cal r
  order by (r.kind = 'in_theaters') desc, r.on_date, r.title, r.media_item_id;
end;
$$;

comment on function public.movie_calendar(date) is
  'The caller''s Calendar on p_today in their region: every film with a planned day from today on (kind going), and every want-to-watch film that is opening, in theaters, streaming soon or unreleased (release), one row each with the day its kind names; in theaters first, then soonest first. Security invoker on auth.uid().';

revoke all on function public.movie_calendar(date) from public, anon;
grant execute on function public.movie_calendar(date) to authenticated, service_role;
