-- Every insertion is a prediction (VER-233, Rafa, 2026-10-15).
--
-- When a user ranks an item, the engine guesses from their already ranked
-- items of that medium where it will land; once the item is placed, the guess
-- is compared with the result, which measures how the engine performs for
-- that person. This is the online half of the harness: recommendation_loo
-- (20260924120000_recommendation_foundations.sql) replays a list that exists,
-- and this logs the guess at the moment the list grew, from the list as it
-- stood, so nothing about the item can leak into it.
--
-- What it adds, in file order:
--
--   1. prediction_log.surface gains 'insertion'.
--   2. insertion_predictions(medium, items): the engine's guess for items the
--      caller is about to place, with the two baselines it has to beat (the
--      caller's mean, the item's prior) and the list size it was made from.
--      Security definer bound to auth.uid(), as batch_predictions is.
--   3. finish_insertion writes one prediction_log row per call, surface
--      insertion, computed before the item is placed.
--   4. apply_letterboxd_import writes one row per film it places.
--   5. prediction_calibration: a security invoker view of those rows against
--      the entries' current places, per user, medium, model version, list
--      size band, confidence and source.
--
-- ## model_version
--
-- Every row this file writes says model_version 'content-v1': the content
-- model of the foundations migration (the prior blended with the content
-- score by w = n / (n + 10)), the name the foundations' own example uses. A
-- later scorer writes its own name, so the view never mixes the two.
--
-- ## The three paths, and how each is told apart
--
-- components.source says which path placed the item:
--
--   user    finish_insertion with placed_by 'user': the log flow's one game,
--           and also each game the batch session's answers placed.
--   batch   finish_insertion with placed_by 'prior': the batch session's
--           "Place the rest for me", the only caller that sends 'prior'.
--   import  apply_letterboxd_import, which places films in one statement and
--           never calls finish_insertion, so it writes its own rows.
--
-- The batch session calls finish_insertion once per game with that game's
-- answers, exactly as the log flow does, and nothing in the call says which
-- screen made it: the comparisons carry the same context, the arguments are
-- the same. So a batch game the user's answers placed reads 'user' here, and
-- 'batch' means a provisional place. Telling the two apart needs the app to
-- say so (a key in the call), which this migration does not change; it is a
-- follow-up, and until then the user rows are the honest ones to read.
--
-- insert_ranking_entry is left alone: it is granted, but no screen calls it
-- (every placement goes through finish_insertion or the import), and a row
-- written by it would carry no source.
--
-- ## The prediction never touches the placement
--
-- The guess is computed before the comparisons and the placement are
-- written, and its row is inserted after the placement returns, so a refused
-- call (an unknown item, one already ranked) raises the error it always
-- raised and leaves no row. Nothing inside the transaction reads the row. The
-- position the item lands at is p_position clamped, as before.
--
-- ## Why a helper and not the scorer in each caller
--
-- recommendation_scores takes a user id and is service-role only (the
-- foundations' header). finish_insertion and apply_letterboxd_import are
-- security invoker, so the guess comes from insertion_predictions, security
-- definer with its own auth.uid() check and no user argument, the way
-- batch_predictions reaches the scorer. The callers then insert the row as
-- the user, through prediction_log's owner-only insert policy. A signed-in
-- user can call the helper directly; it tells them what batch_predictions
-- already tells them about their own list, plus the two baselines.
--
-- Errors raised here use the SQLSTATEs the earlier files use, following the
-- legend in 20260915130000_ranking_functions.sql:
--   28000  no authenticated user
--   22023  no medium, or too many items

-- ==============================================================================
-- 1. prediction_log.surface gains 'insertion'
-- ==============================================================================

alter table public.prediction_log
  drop constraint prediction_log_surface_check,
  add constraint prediction_log_surface_check
    check (surface in ('suggest', 'item_page', 'group', 'insertion'));

comment on column public.prediction_log.surface is
  'Where it was made: suggest (the three picks), item_page, group, or insertion (the engine''s guess for an item the user was placing, written by finish_insertion and apply_letterboxd_import, never shown).';
comment on column public.prediction_log.components is
  'The parts of the score as the scorer returned them. For surface insertion: list_size (ranked items in the medium before the placement), content_score (null with no profile), prior_score and prior_from, mean_baseline (the user''s mean before the placement, null on an empty list), predicted_tier, source (user, batch or import) and placed_by.';

-- ==============================================================================
-- 2. insertion_predictions: the guess, before the item lands
-- ==============================================================================
--
-- For the caller and the items given, from the caller's stored ranking of the
-- medium: recommendation_scores' prior, content score, blend and confidence,
-- the tier the blend reads as (ranking_tier_for_score), and beside them the
-- list size and the list's mean, rounded to two decimals as the harness
-- rounds it. On an empty list the mean is null, the content score is null
-- and the prediction is the prior.
--
-- Items of another medium and ids the catalog does not have are left out, as
-- batch_predictions leaves them out. Rows come back in the order given. At
-- most 10,000 ids: a Letterboxd export that ranks every film can be
-- thousands, which batch_predictions' 500 would refuse.
--
-- Security definer for the reason in the header: a pinned search_path, its
-- own auth.uid() check, auth.uid() passed to the internal functions.

create function public.insertion_predictions(
  p_medium public.medium,
  p_items uuid[]
)
returns table (
  media_item_id uuid,
  list_size integer,
  mean_baseline numeric,
  prior_score numeric,
  prior_from text,
  content_score numeric,
  predicted_score numeric,
  predicted_tier public.tier,
  confidence text
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_n integer;
  v_mean numeric;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'insertion_predictions requires an authenticated user';
  end if;

  if p_medium is null then
    raise exception using
      errcode = '22023',
      message = 'insertion_predictions needs a medium';
  end if;

  if cardinality(p_items) > 10000 then
    raise exception using
      errcode = '22023',
      message = format('insertion_predictions takes at most 10000 items, not %s', cardinality(p_items));
  end if;

  if p_items is null or cardinality(p_items) = 0 then
    return;
  end if;

  -- n and mu of the list as stored: the list size and the mean baseline
  select count(*)::integer, round(avg(s.score), 2)
  into v_n, v_mean
  from public.recommendation_user_scores(v_uid, p_medium, null) s;

  return query
  select
    s.media_item_id,
    v_n,
    v_mean,
    s.prior_score,
    s.why -> 'prior' ->> 'from',
    s.content_score,
    s.predicted_score,
    public.ranking_tier_for_score(s.predicted_score),
    s.confidence
  from public.recommendation_scores(v_uid, p_medium, p_items, null) s
  join (
    select u.id, min(u.ord) as ord
    from unnest(p_items) with ordinality as u(id, ord)
    group by u.id
  ) o on o.id = s.media_item_id
  order by o.ord;
end;
$$;

comment on function public.insertion_predictions(public.medium, uuid[]) is
  'The engine''s guess for items the caller is about to place, from their stored ranking of the medium: list_size and mean_baseline of that list, the prior and where it came from, the content score (null with no profile), the blended predicted_score, the tier it reads as, and the confidence. Unknown ids and items of another medium are left out; at most 10,000 ids. Security definer bound to auth.uid().';

revoke all on function public.insertion_predictions(public.medium, uuid[]) from public, anon;
grant execute on function public.insertion_predictions(public.medium, uuid[]) to authenticated, service_role;

-- ==============================================================================
-- 3. finish_insertion logs the guess
-- ==============================================================================
--
-- The body of 20261007120000_onboarding_backend.sql with the guess added: it
-- is computed after the argument checks and before anything is written, then
-- the comparisons and the placement are written exactly as before, and the
-- row goes in after the placement returns. Same signature, so `create or
-- replace` keeps the grants and the comment; both are written again anyway.
--
-- The guess is skipped when the item or the medium is null, so those calls
-- fail where they always failed (the placement's not-null columns) rather
-- than in the helper. When the scorer has no row (it always has one for an
-- item of the medium; the placement refuses any other), the row would carry
-- the default prior and no predicted tier, but the refused placement rolls it
-- back with the call. ranking_tier_for_score is service-role only, which is
-- why the tier comes from the helper and the view never calls it.

create or replace function public.finish_insertion(
  p_media_item_id uuid,
  p_medium public.medium,
  p_tier public.tier,
  p_position integer,
  p_comparisons jsonb,
  p_placed_by text default 'user'
)
returns integer
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_comparisons jsonb := coalesce(p_comparisons, '[]'::jsonb);
  v_placed_by text := coalesce(p_placed_by, 'user');
  v_position integer;
  v_list_size integer;
  v_mean numeric;
  v_prior numeric;
  v_prior_from text;
  v_content numeric;
  v_predicted numeric;
  v_predicted_tier public.tier;
  v_confidence text;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'finish_insertion requires an authenticated user';
  end if;

  if jsonb_typeof(v_comparisons) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'p_comparisons must be a JSON array of comparison objects';
  end if;

  if v_placed_by not in ('user', 'prior') then
    raise exception using
      errcode = '22023',
      message = format('p_placed_by must be user or prior, not %s', v_placed_by);
  end if;

  -- The guess, from the list as it stands before this item lands.
  if p_media_item_id is not null and p_medium is not null then
    select g.list_size, g.mean_baseline, g.prior_score, g.prior_from, g.content_score,
           g.predicted_score, g.predicted_tier, g.confidence
    into v_list_size, v_mean, v_prior, v_prior_from, v_content,
         v_predicted, v_predicted_tier, v_confidence
    from public.insertion_predictions(p_medium, array[p_media_item_id]) g;
  end if;

  insert into public.comparisons (user_id, medium, item_a, item_b, outcome, context)
  select
    v_uid,
    p_medium,
    (c ->> 'item_a')::uuid,
    (c ->> 'item_b')::uuid,
    (c ->> 'outcome')::public.comparison_outcome,
    coalesce(c -> 'context', '{}'::jsonb)
  from jsonb_array_elements(v_comparisons) as c;

  v_position := public.insert_ranking_entry(p_media_item_id, p_medium, p_tier, p_position, v_placed_by);

  -- The guess's row, as the caller, through prediction_log's insert policy.
  -- The default prior of 6.5 only stands in when the scorer had no row.
  insert into public.prediction_log (
    medium, media_item_id, surface, predicted_score, confidence, model_version, components
  )
  values (
    p_medium,
    p_media_item_id,
    'insertion',
    coalesce(v_predicted, v_prior, 6.5),
    coalesce(v_confidence, 'needs_more_data'),
    'content-v1',
    jsonb_build_object(
      'list_size', v_list_size,
      'content_score', v_content,
      'prior_score', coalesce(v_prior, 6.5),
      'prior_from', coalesce(v_prior_from, 'default'),
      'mean_baseline', v_mean,
      'predicted_tier', v_predicted_tier,
      'source', case v_placed_by when 'prior' then 'batch' else 'user' end,
      'placed_by', v_placed_by
    )
  );

  return v_position;
end;
$$;

comment on function public.finish_insertion(uuid, public.medium, public.tier, integer, jsonb, text) is
  'Log the comparisons from one insertion and place the item with its placed_by (user or prior, default user), as a single transaction, and log the engine''s guess for the item, made from the list before it landed, as one prediction_log row with surface insertion (source user, or batch for a prior place). The caller owns every row written.';

revoke all on function public.finish_insertion(uuid, public.medium, public.tier, integer, jsonb, text) from public, anon;
grant execute on function public.finish_insertion(uuid, public.medium, public.tier, integer, jsonb, text) to authenticated, service_role;

-- ==============================================================================
-- 4. apply_letterboxd_import logs a guess per film it places
-- ==============================================================================
--
-- Restated whole, the body 20261013100000_movie_screens.sql left, with one
-- block added inside the ranking branch, before the existing placements move
-- and the new ones are inserted: one prediction_log row per film the import
-- places, from the movie ranking before the import, source import, placed_by
-- prior or (dragged on the review) user. Every guess of one import is made
-- from the same list, the one the user had before the file, so list_size is
-- the same on all of them. Same arguments and return table, so `create or
-- replace` keeps the grants; the comment and grants are written again.

create or replace function public.apply_letterboxd_import(
  p_file_names text[],
  p_films jsonb,
  p_tiers jsonb default null,
  p_moved uuid[] default '{}'
)
returns table (
  import_id uuid,
  ranked integer,
  watched integer,
  unmatched integer,
  skipped integer,
  diary integer
)
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_import_id uuid;
  v_films jsonb := coalesce(p_films, '[]'::jsonb);
  v_rank boolean := p_tiers is not null and jsonb_typeof(p_tiers) <> 'null';
  v_moved uuid[] := coalesce(p_moved, '{}'::uuid[]);
  v_bad text;
  v_count integer;
  v_ranked integer;
  v_watched integer;
  v_unmatched integer;
  v_skipped integer;
  v_diary integer;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'apply_letterboxd_import requires an authenticated user';
  end if;

  if jsonb_typeof(v_films) <> 'array' then
    raise exception using errcode = '22023', message = 'p_films must be a JSON array of film objects';
  end if;

  if v_rank then
    if jsonb_typeof(p_tiers) <> 'object' then
      raise exception using errcode = '22023', message = 'p_tiers must be null or a JSON object of tier name to id array';
    end if;

    select string_agg(k, ', ') into v_bad
    from jsonb_object_keys(p_tiers) k
    where k not in ('loved', 'liked', 'fine', 'disliked');
    if v_bad is not null then
      raise exception using errcode = '22023', message = format('p_tiers has unknown tiers: %s', v_bad);
    end if;
  end if;

  -- The confirmed order, flattened, and the films, parsed, in two temp tables
  -- the statements below read. Created once per transaction and emptied on
  -- entry, so a second call in the same transaction (the test suite's case)
  -- neither trips over the first call's tables nor reads its rows.
  if to_regclass('pg_temp.lb_placed') is null then
    create temp table lb_placed (
      tier public.tier,
      media_item_id uuid,
      position integer
    ) on commit drop;
  end if;
  if to_regclass('pg_temp.lb_film') is null then
    create temp table lb_film (
      ord integer,
      letterboxd_uri text,
      title text,
      year smallint,
      rating numeric(2, 1),
      watched_dates date[],
      rewatches integer,
      media_item_id uuid,
      outcome text
    ) on commit drop;
  end if;
  -- truncate rather than delete: PostgREST runs the authenticated role with
  -- pg-safeupdate, which refuses a DELETE with no WHERE clause.
  truncate lb_placed, lb_film;

  if v_rank then
    insert into lb_placed (tier, media_item_id, position)
    select t.tier, e.id::uuid, (e.ord - 1)::integer
    from unnest(array['loved', 'liked', 'fine', 'disliked']::public.tier[]) as t(tier)
    cross join lateral jsonb_array_elements_text(coalesce(p_tiers -> t.tier::text, '[]'::jsonb))
      with ordinality as e(id, ord);
  end if;

  insert into lb_film (ord, letterboxd_uri, title, year, rating, watched_dates, rewatches, media_item_id, outcome)
  select
    e.ord,
    nullif(e.film ->> 'letterboxd_uri', ''),
    e.film ->> 'title',
    nullif(e.film ->> 'year', '')::smallint,
    nullif(e.film ->> 'rating', '')::numeric(2, 1),
    coalesce(
      (select array_agg(distinct d::date order by d::date)
         from jsonb_array_elements_text(coalesce(e.film -> 'watched_dates', '[]'::jsonb)) as d),
      '{}'::date[]
    ),
    coalesce(nullif(e.film ->> 'rewatches', '')::integer, 0),
    nullif(e.film ->> 'media_item_id', '')::uuid,
    e.film ->> 'outcome'
  from jsonb_array_elements(v_films) with ordinality as e(film, ord);

  -- Shape checks on the films.
  if exists (select 1 from lb_film f where f.title is null or f.title = '') then
    raise exception using errcode = '22023', message = 'every film needs a title';
  end if;
  if exists (select 1 from lb_film f where f.outcome is null or f.outcome not in ('ranked', 'watched', 'unmatched', 'skipped')) then
    raise exception using errcode = '22023', message = 'every film needs an outcome of ranked, watched, unmatched or skipped';
  end if;
  if exists (select 1 from lb_film f where f.outcome in ('ranked', 'watched') and f.media_item_id is null) then
    raise exception using errcode = '22023', message = 'a ranked or watched film needs a media_item_id';
  end if;
  if exists (
    select 1 from lb_film f
    left join public.media_items m on m.id = f.media_item_id
    where f.media_item_id is not null and (m.id is null or m.medium <> 'movie')
  ) then
    raise exception using errcode = '22023', message = 'every matched film must be a movie in the catalog';
  end if;

  if not v_rank then
    -- Rule 35: without a confirmed order nothing is ranked.
    if exists (select 1 from lb_film f where f.outcome = 'ranked') then
      raise exception using errcode = '22023', message = 'a film marked ranked needs the confirmed order in p_tiers';
    end if;
    if cardinality(v_moved) > 0 then
      raise exception using errcode = '22023', message = 'p_moved needs the confirmed order in p_tiers';
    end if;
  else
    -- The confirmed order must be complete and consistent.
    select count(*) into v_count
    from (select media_item_id from lb_placed group by media_item_id having count(*) > 1) d;
    if v_count > 0 then
      raise exception using errcode = '22023', message = format('%s films appear more than once in the confirmed order', v_count);
    end if;

    select count(*) into v_count
    from public.ranking_entries r
    where r.user_id = v_uid and r.medium = 'movie'
      and not exists (select 1 from lb_placed p where p.media_item_id = r.media_item_id);
    if v_count > 0 then
      raise exception using errcode = '22023', message = format('the confirmed order leaves out %s films already ranked', v_count);
    end if;

    select count(*) into v_count
    from lb_placed p
    where not exists (select 1 from public.ranking_entries r where r.user_id = v_uid and r.media_item_id = p.media_item_id)
      and not exists (select 1 from lb_film f where f.outcome = 'ranked' and f.media_item_id = p.media_item_id);
    if v_count > 0 then
      raise exception using errcode = '22023', message = format('%s films in the confirmed order are neither ranked nor in the import', v_count);
    end if;

    select count(*) into v_count
    from lb_film f
    where f.outcome = 'ranked'
      and not exists (select 1 from lb_placed p where p.media_item_id = f.media_item_id);
    if v_count > 0 then
      raise exception using errcode = '22023', message = format('%s films marked ranked are missing from the confirmed order', v_count);
    end if;

    if exists (
      select 1 from lb_film f
      join public.ranking_entries r on r.user_id = v_uid and r.media_item_id = f.media_item_id
      where f.outcome = 'ranked'
    ) then
      raise exception using errcode = '22023', message = 'a film the caller already ranked cannot be imported as ranked; its place stays';
    end if;

    if exists (
      select 1 from unnest(v_moved) as m(id)
      where not exists (select 1 from lb_film f where f.outcome = 'ranked' and f.media_item_id = m.id)
    ) then
      raise exception using errcode = '22023', message = 'p_moved may only name films imported as ranked';
    end if;
  end if;

  -- Writes --------------------------------------------------------------------------

  insert into public.letterboxd_imports (user_id, file_names)
  values (v_uid, coalesce(p_file_names, '{}'::text[]))
  returning id into v_import_id;

  -- Entries: played. finished_at is the diary's to set below; an entry with no
  -- dated watch keeps whatever it had. The BEFORE triggers derive the medium
  -- and clear the backlog position as they do for any status change.
  insert into public.user_entries (user_id, media_item_id, status)
  select distinct on (f.media_item_id)
    v_uid,
    f.media_item_id,
    'played'::public.entry_status
  from lb_film f
  where f.outcome in ('ranked', 'watched')
  order by f.media_item_id, f.ord
  on conflict (user_id, media_item_id) do update
  set status = 'played'::public.entry_status;

  -- The diary: one row per watched date not already in it. user_id comes from
  -- the column default (auth.uid()); watch_log_before_write moves finished_at
  -- to the latest watch and clears a planned_on the watch reaches.
  insert into public.watch_log (media_item_id, watched_on, source)
  select distinct f.media_item_id, d.day, 'import'
  from lb_film f
  cross join lateral unnest(f.watched_dates) as d(day)
  where f.outcome in ('ranked', 'watched')
    and not exists (
      select 1 from public.watch_log w
      where w.user_id = v_uid
        and w.media_item_id = f.media_item_id
        and w.watched_on = d.day
    )
  order by f.media_item_id, d.day;
  get diagnostics v_diary = row_count;

  if v_rank then
    -- The engine's guess for each film this import places (VER-233), from
    -- the movie ranking as it stands before the two statements below change
    -- it: one prediction_log row per new placement, surface insertion,
    -- source import. Films already ranked are moved, not placed, and get no
    -- row. Nothing in this call reads the rows back.
    insert into public.prediction_log (
      medium, media_item_id, surface, predicted_score, confidence, model_version, components
    )
    select
      'movie'::public.medium,
      g.media_item_id,
      'insertion',
      g.predicted_score,
      g.confidence,
      'content-v1',
      jsonb_build_object(
        'list_size', g.list_size,
        'content_score', g.content_score,
        'prior_score', g.prior_score,
        'prior_from', g.prior_from,
        'mean_baseline', g.mean_baseline,
        'predicted_tier', g.predicted_tier,
        'source', 'import',
        'placed_by', case when g.media_item_id = any (v_moved) then 'user' else 'prior' end
      )
    from public.insertion_predictions(
      'movie'::public.medium,
      array(
        select p.media_item_id
        from lb_placed p
        where not exists (
          select 1 from public.ranking_entries r where r.user_id = v_uid and r.media_item_id = p.media_item_id
        )
        order by p.tier, p.position
      )
    ) g;

    -- Existing placements move to where the confirmed order puts them. A move
    -- the user did not make, so updated_at only: never placed_at or placed_by.
    update public.ranking_entries r
    set tier = p.tier,
        position = p.position,
        updated_at = now()
    from lb_placed p
    where r.user_id = v_uid
      and r.media_item_id = p.media_item_id
      and (r.tier <> p.tier or r.position <> p.position);

    -- New placements, from the import: the stars' guess unless dragged.
    insert into public.ranking_entries (user_id, medium, tier, media_item_id, position, placed_at, placed_by)
    select
      v_uid,
      'movie'::public.medium,
      p.tier,
      p.media_item_id,
      p.position,
      now(),
      case when p.media_item_id = any (v_moved) then 'user' else 'prior' end
    from lb_placed p
    where not exists (
      select 1 from public.ranking_entries r where r.user_id = v_uid and r.media_item_id = p.media_item_id
    );
  end if;

  -- The record.
  insert into public.letterboxd_import_films (
    import_id, user_id, letterboxd_uri, title, year, rating, watched_dates, rewatches,
    media_item_id, outcome, tier, position
  )
  select
    v_import_id, v_uid, f.letterboxd_uri, f.title, f.year, f.rating, f.watched_dates, f.rewatches,
    case when f.outcome = 'unmatched' then null else f.media_item_id end,
    f.outcome,
    case when f.outcome = 'ranked' then p.tier end,
    case when f.outcome = 'ranked' then p.position end
  from lb_film f
  left join lb_placed p on p.media_item_id = f.media_item_id and f.outcome = 'ranked'
  order by f.ord;

  select
    count(*) filter (where f.outcome = 'ranked'),
    count(*) filter (where f.outcome = 'watched'),
    count(*) filter (where f.outcome = 'unmatched'),
    count(*) filter (where f.outcome = 'skipped')
  into v_ranked, v_watched, v_unmatched, v_skipped
  from lb_film f;

  update public.letterboxd_imports i
  set film_count = v_ranked + v_watched + v_unmatched + v_skipped,
      ranked_count = v_ranked,
      watched_count = v_watched,
      unmatched_count = v_unmatched,
      skipped_count = v_skipped,
      diary_count = v_diary
  where i.id = v_import_id;

  truncate lb_placed, lb_film;

  return query select v_import_id, v_ranked, v_watched, v_unmatched, v_skipped, v_diary;
end;
$$;

comment on function public.apply_letterboxd_import(text[], jsonb, jsonb, uuid[]) is
  'Write one confirmed Letterboxd import as a single transaction: mark the films played, write one diary row per watched date the diary lacks, and only when p_tiers is given (the user chose to rank from stars and confirmed) renumber the caller''s movie tiers from it, imported rows placed_by prior unless dragged (p_moved, user), each new placement with the engine''s guess logged in prediction_log (surface insertion, source import) from the ranking before the import. Records the upload. Refuses a ranked film without an order, and an order that drops a ranked film, includes an unknown one, or re-ranks a film the caller already placed.';

revoke all on function public.apply_letterboxd_import(text[], jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.apply_letterboxd_import(text[], jsonb, jsonb, uuid[]) to authenticated, service_role;

-- ==============================================================================
-- 5. prediction_calibration: the guesses against where the items are now
-- ==============================================================================
--
-- One row per user, medium, model version, list-size band, confidence and
-- source, over the insertion rows whose item is still ranked. The outcome is
-- the entry's current tier and score (ranking_percentiles, the score the app
-- shows), so it moves as the list grows around the item: the guess was on the
-- user's scale, and the scale is the list.
--
-- Which rows count:
--
--   * The latest insertion row per user and item. A removed item that was
--     ranked again has a row for each placement, and only the latest is
--     about the place it holds.
--   * Only items still ranked: a row whose entry is gone has no outcome.
--   * Only entries placed_by 'user'. A 'prior' place (the batch session's
--     "Place the rest for me", an import's star guess) is the engine's own
--     guess, or the stars', and scoring a guess against itself says nothing.
--     It counts once the user settles it (a drag resets the mark to user).
--
-- The bands are the list size when the guess was made: under 5, 5 to 9, 10
-- to 24, 25 to 49, 50 and up. The first band is the confidence label's
-- needs_more_data, so the two read together.
--
-- The tier hit compares the tier the guess read as (components.predicted_tier,
-- from ranking_tier_for_score at write time) with the entry's tier. The three
-- errors are mean absolute errors against the entry's score: of the blend
-- that was logged, of the user's mean before the placement, and of the
-- item's prior, the two baselines the engine has to beat, as
-- recommendation_loo_summary reports them. content's error is beside them,
-- over the rows that had a content score. Rounded to three decimals, as the
-- harness rounds.
--
-- `security_invoker = true`, so prediction_log's and ranking_entries'
-- owner-only policies decide the rows: a signed-in user reads their own
-- calibration, and the service role (the harness script, the SQL editor)
-- reads everyone's. No call to a service-role-only function happens here.

create view public.prediction_calibration
with (security_invoker = true) as
  with latest as (
    select distinct on (pl.user_id, pl.media_item_id)
      pl.user_id,
      pl.medium,
      pl.media_item_id,
      pl.model_version,
      pl.confidence,
      pl.predicted_score,
      pl.components
    from public.prediction_log pl
    where pl.surface = 'insertion'
    order by pl.user_id, pl.media_item_id, pl.shown_at desc, pl.id desc
  ),
  outcomes as (
    select
      l.user_id,
      l.medium,
      l.model_version,
      l.confidence,
      l.components ->> 'source' as source,
      (l.components ->> 'list_size')::integer as list_size,
      l.predicted_score,
      (l.components ->> 'predicted_tier')::public.tier as predicted_tier,
      (l.components ->> 'content_score')::numeric as content_score,
      (l.components ->> 'mean_baseline')::numeric as mean_baseline,
      (l.components ->> 'prior_score')::numeric as prior_score,
      p.tier as true_tier,
      p.score as true_score
    from latest l
    join public.ranking_entries r
      on r.user_id = l.user_id
     and r.media_item_id = l.media_item_id
     and r.medium = l.medium
    join public.ranking_percentiles p
      on p.user_id = r.user_id
     and p.media_item_id = r.media_item_id
    where r.placed_by = 'user'
  ),
  banded as (
    select
      o.*,
      case
        when o.list_size < 5 then 0
        when o.list_size < 10 then 5
        when o.list_size < 25 then 10
        when o.list_size < 50 then 25
        else 50
      end as list_size_min
    from outcomes o
  )
  select
    b.user_id,
    b.medium,
    b.model_version,
    case b.list_size_min
      when 0 then 'under 5'
      when 5 then '5 to 9'
      when 10 then '10 to 24'
      when 25 then '25 to 49'
      else '50 and up'
    end as list_size_band,
    b.list_size_min,
    b.confidence,
    b.source,
    count(*)::integer as n,
    round(avg(case when b.predicted_tier = b.true_tier then 1.0 else 0.0 end), 3) as tier_hit_rate,
    round(avg(abs(b.predicted_score - b.true_score)), 3) as mae_predicted,
    round(avg(abs(b.content_score - b.true_score)), 3) as mae_content,
    round(avg(abs(b.mean_baseline - b.true_score)), 3) as mae_user_mean,
    round(avg(abs(b.prior_score - b.true_score)), 3) as mae_prior
  from banded b
  group by b.user_id, b.medium, b.model_version, b.list_size_min, b.confidence, b.source;

comment on view public.prediction_calibration is
  'How the engine''s insertion guesses did, per user, medium, model version, list-size band, confidence and source: the latest guess per item still ranked and settled by the user (placed_by user), against the entry''s current tier and score. Runs as the caller, so a user reads their own and the service role reads all.';
comment on column public.prediction_calibration.user_id is 'Whose guesses.';
comment on column public.prediction_calibration.medium is 'Which list; never compared across media (rule 24).';
comment on column public.prediction_calibration.model_version is 'The scorer that made the guesses, content-v1 for the content model, so two models are never averaged together.';
comment on column public.prediction_calibration.list_size_band is 'How many items were ranked in the medium when the guess was made: under 5, 5 to 9, 10 to 24, 25 to 49, or 50 and up.';
comment on column public.prediction_calibration.list_size_min is 'The band''s lower bound (0, 5, 10, 25, 50), for sorting the bands.';
comment on column public.prediction_calibration.confidence is 'The confidence label the guess carried: high, medium or needs_more_data.';
comment on column public.prediction_calibration.source is 'Which path placed the items: user (the log flow, and batch games the answers placed), batch (a provisional batch place the user later settled) or import (Letterboxd).';
comment on column public.prediction_calibration.n is 'How many guesses the row averages.';
comment on column public.prediction_calibration.tier_hit_rate is 'The share of guesses whose predicted tier is the entry''s current tier, 0 to 1.';
comment on column public.prediction_calibration.mae_predicted is 'Mean absolute error of the logged predicted_score against the entry''s current score.';
comment on column public.prediction_calibration.mae_content is 'Mean absolute error of the content score alone, over the guesses that had one; null when none did.';
comment on column public.prediction_calibration.mae_user_mean is 'Mean absolute error of the user''s mean before the placement, the first baseline; null when every guess was made on an empty list.';
comment on column public.prediction_calibration.mae_prior is 'Mean absolute error of the item''s prior, the second baseline.';

revoke all on public.prediction_calibration from anon, authenticated;
grant select on public.prediction_calibration to authenticated;
