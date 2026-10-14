-- The ask's candidate pool, bounded before it is scored, and a vote floor for
-- films (VER-199, VER-202; 2026-10-13).
--
-- Two cards, one migration, because both rewrite the film side of
-- suggestion_candidates and two `create or replace` from two branches would
-- overwrite each other.
--
-- VER-199. On the hosted project the first ask of a session failed with 57014
-- (statement timeout) and the Retry succeeded. suggestion_candidates built its
-- pool by reading every unseen item of the medium that passed the filters,
-- with the three details tables hash-joined whole (every game_details row for
-- a film question), and an item_prior lookup for each, then sorting all of it
-- by prior to keep 500. The read was the size of the catalog, and with a cold
-- cache the size of the catalog from disk; the Retry ran on the pages the
-- first call had warmed. The pool is now walked in audience order (TMDB's
-- vote_count for films and series, IGDB's total_rating_count for games, the
-- order popular_games and the decks already use) down the medium's audience
-- index, and the walk stops at the first 400 that pass every filter. The
-- scorer then sees 400 rather than 500 and still picks the best by predicted
-- score.
--
-- The bound is not the whole of the call. The scorer still builds the
-- caller's content profile, whose document frequencies count every item of
-- the medium carrying one of the caller's features
-- (recommendation_feature_idf): on the synthetic catalog in the test that is
-- most of a call, and on a cold cache it is a read of the medium the pool can
-- no longer cause but cannot remove. So the function also carries its own
-- statement_timeout of 15 seconds, which PostgREST hoists to the transaction
-- that calls it (db-hoisted-tx-settings, statement_timeout by default),
-- against the 8 seconds the authenticated role has on the hosted project.
--
-- VER-202. The ask "a funny movie under two hours" answered Ovenbird's Nest,
-- Free Sex, The Key: unflagged catalog rows (the mirror already drops what
-- TMDB flags adult, packages/catalog/src/tmdb.ts) with a handful of votes and
-- an extreme average, which is a high external score and so a high prior.
-- Films now need 50 TMDB votes to be a candidate, in suggestion_candidates and
-- in every row of movie_home_rows but the watchlist. A film already on the
-- person's own list (user_entries) always stays: the watchlist row is theirs,
-- and with p_include_backlog their backlog films join the pool whatever their
-- votes and whatever the cap. No title block list.
--
--   1. suggestion_candidates: the bounded pool and the floor.
--   2. movie_home_rows: the floor on the genre, because and popular rows.
--
-- No new index: the walk reads the two the popular reads already have,
-- media_items_game_rating_count (games) and media_items_film_vote_count
-- (films and series), each an ordered scan the planner can stop at the limit.

-- ==============================================================================
-- 1. suggestion_candidates
-- ==============================================================================
--
-- Same signature, same columns, same filters as
-- 20260924120000_recommendation_foundations.sql section 6; what changed is how
-- the pool is drawn:
--
--   * the walk: unseen items of the medium (no entry of any status, not
--     ranked) passing every filter, in audience order, the first 400. A film
--     also needs 50 TMDB votes. A game or series has no floor: IGDB's rating
--     count is not TMDB's vote count, and series are held (decision 23);
--   * the caller's own: with p_include_backlog, their backlog items of the
--     medium passing every filter, whatever their audience and whatever the
--     cap. A film on their own list is never dropped by the floor.
--
-- The 400 come in by audience rather than by prior, so a little-seen item
-- with a high external score no longer crowds the pool, and a well-known
-- one with a middling score still gets scored; the answer is still the best
-- p_limit (1 to 50) of the pool by predicted_score, then prior_score.
--
-- The pool query is executed, not static, so it is planned every call with
-- the medium and the filters as constants (the comment on it says why). The
-- floor's `$1 <> 'movie' or audience >= 50` then folds to `audience >= 50`
-- for a film, a range on media_items_film_vote_count, so the walk never reads
-- the long tail below it. Planning costs about a millisecond.
--
-- statement_timeout = 15s: see the header. Set on the function, it applies to
-- a call through PostgREST (the app's, through the suggest function); a
-- direct SQL caller keeps their own.

create or replace function public.suggestion_candidates(
  p_medium public.medium,
  p_genres text[] default null,
  p_exclude_genres text[] default null,
  p_max_minutes integer default null,
  p_platforms text[] default null,
  p_provider_ids integer[] default null,
  p_region text default 'US',
  p_include_backlog boolean default false,
  p_limit integer default 30
)
returns table (
  media_item_id uuid,
  title text,
  year smallint,
  cover_image_id text,
  genres text[],
  minutes integer,
  prior_score numeric,
  content_score numeric,
  predicted_score numeric,
  confidence text,
  why jsonb
)
language plpgsql
stable
security definer
set search_path = public, extensions
set statement_timeout = '15s'
as $$
#variable_conflict use_column
declare
  -- The pool cap per medium, and the votes a film needs (VER-199, VER-202).
  c_pool_size constant integer := 400;
  c_vote_floor constant numeric := 50;
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 50);
  v_region text := coalesce(nullif(btrim(p_region), ''), 'US');
  v_include_backlog boolean := coalesce(p_include_backlog, false);
  v_genres text[] := case when cardinality(p_genres) > 0 then p_genres end;
  v_exclude_genres text[] := case when cardinality(p_exclude_genres) > 0 then p_exclude_genres end;
  v_platforms text[] := case when cardinality(p_platforms) > 0 then p_platforms end;
  v_providers integer[] := case when cardinality(p_provider_ids) > 0 then p_provider_ids end;
  v_pool uuid[];
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'suggestion_candidates requires an authenticated user';
  end if;

  if p_medium is null then
    raise exception using
      errcode = '22023',
      message = 'suggestion_candidates needs a medium';
  end if;

  if v_platforms is not null and p_medium <> 'game' then
    raise exception using
      errcode = '22023',
      message = format('a platform filter applies to games, not to %s', p_medium);
  end if;

  if v_providers is not null and p_medium = 'game' then
    raise exception using
      errcode = '22023',
      message = 'a streaming provider filter applies to films and series, not to games';
  end if;

  -- The pool. Row Level Security does not apply inside a definer function, so
  -- the caller's entries and rankings are filtered by v_uid by hand.
  --
  -- One query, written once and filled in per medium: the medium's details
  -- table, its length, its platforms, and the audience expression its index is
  -- built on. Executed rather than static so that it is planned for this
  -- medium and these filters every call: an unused filter folds away, the
  -- filters left sit on one details table's own columns where the planner has
  -- statistics for them, and the walk is the medium's audience index read in
  -- order with each row's details fetched by key. Static, it was one plan for
  -- three media, the details behind a coalesce of three left joins the planner
  -- could not estimate, and it sorted the medium instead. Every value goes in
  -- through USING; the format arguments are this function's own constants.
  execute format($sql$
    with passing as not materialized (
      select m.id, %1$s as audience
      from public.media_items m
      left join public.%2$I d on d.media_item_id = m.id
      where m.medium = $1
        and not exists (
          select 1
          from public.ranking_entries r
          where r.user_id = $8
            and r.media_item_id = m.id
        )
        -- an item with no genres shares none, and so passes an exclusion
        and ($2::text[] is null or d.genres && $2)
        and ($3::text[] is null or d.genres is null or not (d.genres && $3))
        and ($4::integer is null or %3$s <= $4)
        and ($5::text[] is null or %4$s && $5)
        and ($6::integer[] is null
             or exists (
               select 1
               from public.watch_availability w
               where w.media_item_id = m.id
                 and w.region = $7
                 and w.offer_type in ('flatrate', 'free', 'ads')
                 and w.removed_at is null
                 and w.provider_id = any ($6)
             ))
    )
    select array_agg(c.id)
    from (
      -- The walk: unseen, a film with its 50 votes, the first 400 by audience.
      (
        select p.id
        from passing p
        where ($1 <> 'movie' or p.audience >= $9)
          and not exists (
            select 1
            from public.user_entries e
            where e.user_id = $8
              and e.media_item_id = p.id
          )
        order by p.audience desc nulls last, p.id
        limit $10
      )
      union
      -- The caller's own backlog, when asked for: no floor, no cap.
      select p.id
      from passing p
      where $11
        and p.id in (
          select e.media_item_id
          from public.user_entries e
          where e.user_id = $8
            and e.status = 'backlog'
        )
    ) c
    $sql$,
    -- %1$s the audience, as media_items_game_rating_count and
    -- media_items_film_vote_count are built on it
    case p_medium
      when 'game' then $e$nullif(m.metadata ->> 'total_rating_count', '')::numeric$e$
      else $e$nullif(m.metadata ->> 'vote_count', '')::numeric$e$
    end,
    -- %2$I the details table
    case p_medium
      when 'game' then 'game_details'
      when 'movie' then 'movie_details'
      else 'tv_details'
    end,
    -- %3$s the length in minutes: IGDB's "normally" time to beat, a film's
    -- runtime, a series' episode runtime
    case p_medium
      when 'game' then 'round(d.time_to_beat_normally_seconds / 60.0)::integer'
      when 'movie' then 'd.runtime_minutes'
      else 'd.episode_runtime_minutes'
    end,
    -- %4$s the platforms (a platform filter on a film was refused above)
    case p_medium
      when 'game' then 'd.platforms'
      else 'null::text[]'
    end
  )
  into v_pool
  using p_medium, v_genres, v_exclude_genres, p_max_minutes, v_platforms, v_providers,
    v_region, v_uid, c_vote_floor, c_pool_size, v_include_backlog;

  if v_pool is null then
    return;
  end if;

  return query
  select
    m.id,
    m.title,
    m.year,
    m.cover_image_id,
    coalesce(g.genres, md.genres, td.genres, '{}'::text[]),
    case m.medium
      when 'game' then round(g.time_to_beat_normally_seconds / 60.0)::integer
      when 'movie' then md.runtime_minutes
      when 'tv' then td.episode_runtime_minutes
    end,
    s.prior_score,
    s.content_score,
    s.predicted_score,
    s.confidence,
    s.why
  from public.recommendation_scores(v_uid, p_medium, v_pool, null) s
  join public.media_items m on m.id = s.media_item_id
  left join public.game_details g on g.media_item_id = m.id
  left join public.movie_details md on md.media_item_id = m.id
  left join public.tv_details td on td.media_item_id = m.id
  order by s.predicted_score desc, s.prior_score desc, m.id
  limit v_limit;
end;
$$;

comment on function public.suggestion_candidates(public.medium, text[], text[], integer, text[], integer[], text, boolean, integer) is
  'The caller''s suggestion candidates in one medium: unseen items passing every filter, the first 400 by audience (TMDB votes, IGDB rating count; a film needs 50 votes) plus, with p_include_backlog, the caller''s backlog whatever its votes, scored against the caller''s own list, best p_limit (1 to 50) by predicted score. Security definer bound to auth.uid(); the caller cannot name another user.';

revoke all on function public.suggestion_candidates(public.medium, text[], text[], integer, text[], integer[], text, boolean, integer) from public, anon;
grant execute on function public.suggestion_candidates(public.medium, text[], text[], integer, text[], integer[], text, boolean, integer) to authenticated, service_role;

-- ==============================================================================
-- 2. movie_home_rows
-- ==============================================================================
--
-- As 20261013100000_movie_screens.sql section 4 defines it, with the vote
-- floor: a film in a genre row, a because row or the popular row needs 50
-- TMDB votes. The watchlist row is the caller's own list and keeps every film
-- on it. Those rows never offer a film the caller tracks or ranked, so the
-- floor never drops one of theirs. The 3,000-film base walk still goes down
-- item_prior by prior and now skips what is under the floor; a loved film's
-- directors' films are found whatever their prior and kept when they have the
-- votes.

create or replace function public.movie_home_rows(
  p_region text default null,
  p_today date default current_date
)
returns table (
  row_index integer,
  kind text,
  title text,
  variable_part text,
  about_media_item_id uuid,
  candidates jsonb
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  -- The votes a film needs to be offered outside the watchlist (VER-202).
  c_vote_floor constant numeric := 50;
  v_uid uuid := auth.uid();
  v_region text := nullif(upper(btrim(p_region)), '');
  v_today date := coalesce(p_today, current_date);
  v_providers integer[];
  v_profile_region text;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'movie_home_rows requires an authenticated user';
  end if;

  select p.watch_provider_ids, p.watch_region into v_providers, v_profile_region
  from public.profiles p
  where p.id = v_uid;
  v_providers := coalesce(v_providers, '{}');
  -- No region asked for: the profile's, the one movie_watchlist reads, so the
  -- watchlist row's membership and every row's service pills agree.
  v_region := coalesce(v_region, v_profile_region, 'US');

  return query
  with
  -- The caller's ranked films with their percentile and score.
  ranked as (
    select rp.media_item_id, rp.tier, rp.overall_rank, rp.pct, rp.score
    from public.ranking_percentiles rp
    where rp.user_id = v_uid
      and rp.medium = 'movie'
  ),
  stats as (
    select percentile_cont(0.5) within group (order by r.score) as median
    from ranked r
  ),
  seen as (
    select e.media_item_id from public.user_entries e where e.user_id = v_uid
    union
    select r.media_item_id from public.ranking_entries r where r.user_id = v_uid
  ),
  -- 1. The watchlist, as the Watchlist tab reads it.
  watch as (
    select w.media_item_id, w.ordinality as n
    from public.movie_watchlist(v_today) with ordinality as w
    where w.ordinality <= 12
  ),
  -- 2. Genres the caller ranks high.
  genre_pick as (
    select
      g.genre,
      row_number() over (order by avg(r.pct) desc, count(*) desc, g.genre) as n
    from ranked r
    join public.movie_details md on md.media_item_id = r.media_item_id
    cross join unnest(md.genres) as g(genre)
    group by g.genre
    having count(*) >= 3 and avg(r.pct) > 0.5
    order by avg(r.pct) desc, count(*) desc, g.genre
    limit 3
  ),
  -- 3. Loved films in rank order; six looked at, three rows at most kept.
  loved as (
    select
      r.media_item_id,
      r.overall_rank,
      m.title,
      coalesce(md.genres, '{}'::text[]) as genres,
      coalesce(md.directors, '{}'::text[]) as directors
    from ranked r
    join public.media_items m on m.id = r.media_item_id
    left join public.movie_details md on md.media_item_id = r.media_item_id
    where r.tier = 'loved'
    order by r.overall_rank
    limit 6
  ),
  -- The unseen films with the best prior and 50 votes, walked down
  -- item_prior's (medium, prior_score) index: the 3,000 every genre and loved
  -- film draws its pool from, read once rather than once a pool.
  base as materialized (
    select ip.media_item_id as id, ip.prior_score as prior, md.genres
    from public.item_prior ip
    join public.movie_details md on md.media_item_id = ip.media_item_id
    join public.media_items m on m.id = ip.media_item_id
    where ip.medium = 'movie'
      and exists (select 1 from genre_pick union all select 1 from loved)
      and not exists (select 1 from seen s where s.media_item_id = ip.media_item_id)
      and nullif(m.metadata ->> 'vote_count', '')::numeric >= c_vote_floor
    order by ip.prior_score desc, ip.media_item_id
    limit 3000
  ),
  -- Each genre's pool: its 80 best by prior.
  genre_pool as (
    select x.genre, x.id
    from (
      select
        gp.genre,
        b.id,
        row_number() over (partition by gp.genre order by b.prior desc, b.id) as rn
      from genre_pick gp
      join base b on b.genres @> array[gp.genre]
    ) x
    where x.rn <= 80
  ),
  -- Each loved film's pool: its directors' other unseen films with 50 votes,
  -- found through movie_details_directors whatever their prior, then the
  -- films sharing two of its genres (every genre, when it has only one), 80
  -- at most by prior.
  because_pool as (
    select l.media_item_id as loved_id, md.media_item_id as id
    from loved l
    join public.movie_details md
      on cardinality(l.directors) > 0
     and md.directors && l.directors
    join public.media_items m on m.id = md.media_item_id
    where not exists (select 1 from seen s where s.media_item_id = md.media_item_id)
      and nullif(m.metadata ->> 'vote_count', '')::numeric >= c_vote_floor
    union
    select x.loved_id, x.id
    from (
      select
        l.media_item_id as loved_id,
        b.id,
        row_number() over (partition by l.media_item_id order by b.prior desc, b.id) as rn
      from loved l
      join base b
        on b.genres && l.genres
       and (select count(*) from unnest(b.genres) as ug(g) where ug.g = any (l.genres))
           >= least(2, cardinality(l.genres))
    ) x
    where x.rn <= 80
  ),
  scored as (
    select s.media_item_id, s.predicted_score, s.prior_score
    from public.recommendation_scores(
      v_uid,
      'movie',
      (select coalesce(array_agg(distinct p.id), '{}')
         from (select gp.id from genre_pool gp union select bp.id from because_pool bp) p),
      null
    ) s
  ),
  genre_rows as (
    select
      gp.genre,
      gp.n,
      array(
        select x.id
        from genre_pool x
        join scored s on s.media_item_id = x.id
        where x.genre = gp.genre
        order by s.predicted_score desc, s.prior_score desc, x.id
        limit 12
      ) as ids
    from genre_pick gp
  ),
  because_rows as (
    select q.*, row_number() over (order by q.overall_rank) as n
    from (
      select
        l.media_item_id,
        l.title,
        l.overall_rank,
        array(
          select x.id
          from because_pool x
          join scored s on s.media_item_id = x.id
          where x.loved_id = l.media_item_id
          order by s.predicted_score desc, s.prior_score desc, x.id
          limit 12
        ) as ids
      from loved l
      where (
        select count(*)
        from because_pool x
        join scored s on s.media_item_id = x.id
        where x.loved_id = l.media_item_id
          and s.predicted_score > (select st.median from stats st)
      ) >= 6
    ) q
  ),
  rows_by_reason as (
    select
      1 as grp,
      1::bigint as n,
      'watchlist'::text as kind,
      'You wanted to watch these'::text as title,
      null::text as variable_part,
      null::uuid as about,
      array(select w.media_item_id from watch w order by w.n) as ids
    union all
    select 2, g.n, 'genre', g.genre, g.genre, null::uuid, g.ids
    from genre_rows g
    union all
    select 3, b.n, 'because', 'Because you loved ' || b.title, b.title, b.media_item_id, b.ids
    from because_rows b
    where b.n <= 3
  ),
  kept as (
    select r.*
    from rows_by_reason r
    where cardinality(r.ids) > 0
  ),
  fallback as (
    select
      4 as grp,
      1::bigint as n,
      'popular'::text as kind,
      'Popular'::text as title,
      null::text as variable_part,
      null::uuid as about,
      array(
        select pg.id
        from public.popular_games(50, 'movie') with ordinality as pg
        join public.media_items m on m.id = pg.id
        where pg.cover_image_id is not null
          and not exists (select 1 from seen s where s.media_item_id = pg.id)
          and nullif(m.metadata ->> 'vote_count', '')::numeric >= c_vote_floor
        order by pg.ordinality
        limit 12
      ) as ids
    where not exists (select 1 from kept)
  ),
  all_rows as (
    select k.* from kept k
    union all
    select f.* from fallback f where cardinality(f.ids) > 0
  ),
  numbered as (
    select
      (row_number() over (order by a.grp, a.n))::integer as row_index,
      a.*
    from all_rows a
  )
  select
    nr.row_index,
    nr.kind,
    nr.title,
    nr.variable_part,
    nr.about,
    (
      select coalesce(jsonb_agg(
               jsonb_build_object(
                 'media_item_id', m.id,
                 'title', m.title,
                 'year', m.year,
                 'cover_image_id', m.cover_image_id,
                 'external_ids', m.external_ids,
                 'runtime_minutes', md.runtime_minutes,
                 'genres', coalesce(md.genres, '{}'::text[]),
                 'streams_on', to_jsonb(av.streams_on),
                 'on_my_services', to_jsonb(array(
                   select u.provider_id
                   from unnest(av.streams_on) with ordinality as u(provider_id, k)
                   where u.provider_id = any (v_providers)
                   order by u.k
                 ))
               )
               order by c.ord
             ), '[]'::jsonb)
      from unnest(nr.ids) with ordinality as c(id, ord)
      join public.media_items m on m.id = c.id
      left join public.movie_details md on md.media_item_id = m.id
      cross join lateral (
        select array(
          select w.provider_id
          from public.watch_availability w
          left join public.watch_providers wp on wp.provider_id = w.provider_id
          where w.media_item_id = m.id
            and w.region = v_region
            and w.removed_at is null
            and w.offer_type in ('flatrate', 'free', 'ads')
          group by w.provider_id
          order by min((wp.display_priorities ->> v_region)::integer) nulls last, w.provider_id
        ) as streams_on
      ) av
    )
  from numbered nr
  order by nr.row_index;
end;
$$;

comment on function public.movie_home_rows(text, date) is
  'Home''s rows by reason for the caller, in order: the watchlist, up to three genres they rank high, up to three "Because you loved" a Loved film, or one Popular row when none has anything to say; at most twelve candidates each, best predicted first, each with where it streams in the region and which of those are the caller''s services. Security definer bound to auth.uid().';

revoke all on function public.movie_home_rows(text, date) from public, anon;
grant execute on function public.movie_home_rows(text, date) to authenticated, service_role;
