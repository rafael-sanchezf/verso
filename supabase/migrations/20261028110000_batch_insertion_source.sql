-- The batch session says so: its games log source 'batch' (VER-237,
-- 2026-10-28).
--
-- 20261015120000_insertion_predictions.sql logs the engine's guess for every
-- placement, with components.source naming the path that placed the item. It
-- could not tell the batch session from the log flow: both call
-- finish_insertion once per game with the same arguments and the same
-- comparison context, so a batch game the person's own answers placed was
-- logged 'user', and 'batch' meant only a provisional place ("Place the rest
-- for me", placed_by 'prior'). Its header left the marker to a follow-up:
-- "Telling the two apart needs the app to say so (a key in the call)". This
-- is that key.
--
-- Why the difference matters: the batch session starts each game at the slot
-- batch_predictions guesses and checks it against its predicted neighbours,
-- so the engine's guess shapes which questions are asked. The log flow's
-- questions never see the guess. A placement the guess steered leans toward
-- the guess, which is the bias the calibration view exists to keep out of the
-- 'user' rows (docs/design/recommendation-engine.md, "One rule the idea
-- needs"). With the marker, 'user' is the log flow alone and 'batch' is every
-- game the batch session wrote, its answers' places and its provisional ones.
--
-- What it changes:
--
--   1. finish_insertion gains p_source text default 'user', after p_placed_by:
--      'user' (the log flow, and any caller that sends nothing) or 'batch'
--      (the batch session, which now sends it for every game). Defaulted, so
--      every existing caller, including an app build that predates it, makes
--      the call it made and logs what it logged. A 'prior' place still logs
--      'batch' whatever p_source says, as before: only the batch session
--      places by the prior. Adding an argument changes the function's
--      identity, so the six-argument function is dropped and the
--      seven-argument one created, with its comment and grants.
--   2. prediction_calibration.source's comment says what the sources now
--      mean. The view itself is unchanged: it already groups by source and
--      keeps a 'prior' place out until the user settles it.
--
-- The body is 20261015120000_insertion_predictions.sql's, with the source
-- checked beside the mark and written in place of the mapping. Nothing else
-- in the call changes: the guess, the comparisons, the placement and the row
-- are written as before, and a refused call leaves no row. Rows already in
-- the log keep the source they were written with.
--
-- Errors raised here use the SQLSTATEs the earlier files use, following the
-- legend in 20260915130000_ranking_functions.sql:
--   28000  no authenticated user
--   22023  a bad comparison list, mark or source

-- ==============================================================================
-- 1. finish_insertion takes the source
-- ==============================================================================

drop function if exists public.finish_insertion(uuid, public.medium, public.tier, integer, jsonb, text);

create function public.finish_insertion(
  p_media_item_id uuid,
  p_medium public.medium,
  p_tier public.tier,
  p_position integer,
  p_comparisons jsonb,
  p_placed_by text default 'user',
  p_source text default 'user'
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
  v_source text := coalesce(p_source, 'user');
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

  if v_source not in ('user', 'batch') then
    raise exception using
      errcode = '22023',
      message = format('p_source must be user or batch, not %s', v_source);
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
  -- The default prior of 6.5 only stands in when the scorer had no row. A
  -- 'prior' place is the batch session's whatever the source says.
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
      'source', case v_placed_by when 'prior' then 'batch' else v_source end,
      'placed_by', v_placed_by
    )
  );

  return v_position;
end;
$$;

comment on function public.finish_insertion(uuid, public.medium, public.tier, integer, jsonb, text, text) is
  'Log the comparisons from one insertion and place the item with its placed_by (user or prior, default user), as a single transaction, and log the engine''s guess for the item, made from the list before it landed, as one prediction_log row with surface insertion and the caller''s p_source (user, the default, or batch for the batch session; a prior place is always batch). The caller owns every row written.';

revoke all on function public.finish_insertion(uuid, public.medium, public.tier, integer, jsonb, text, text) from public, anon;
grant execute on function public.finish_insertion(uuid, public.medium, public.tier, integer, jsonb, text, text) to authenticated, service_role;

-- ==============================================================================
-- 2. What the sources mean now
-- ==============================================================================

comment on column public.prediction_calibration.source is
  'Which path placed the items: user (the log flow, and any call that does not say batch), batch (the batch session: games its answers placed, and provisional places the user later settled; rows logged before the app sent the marker hold only the latter) or import (Letterboxd).';
