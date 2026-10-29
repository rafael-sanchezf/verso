-- insert_ranking_entry called directly logs its insertion prediction too
-- (VER-238, 2026-10-28).
--
-- 20261015120000_insertion_predictions.sql made every placement write the
-- engine's guess to prediction_log: finish_insertion one row per call,
-- apply_letterboxd_import one row per film. It left insert_ranking_entry
-- alone, on the grounds that no screen calls it. But the function is granted
-- to authenticated, so any signed-in client could place a game through it and
-- leave no prediction behind, which breaks "every insertion is a prediction"
-- for that placement.
--
-- ## Why not revoke it from authenticated
--
-- The tidy fix would be to close the door: revoke execute from authenticated
-- and keep it for service_role. It cannot be done alone. finish_insertion is
-- security invoker and places through insert_ranking_entry, so the nested
-- call runs as the signed-in user and needs the same grant; with it revoked,
-- every finish_insertion call (the log flow, the batch session, the seeds)
-- fails with 42501, "permission denied for function insert_ranking_entry".
-- Revoking would mean restating finish_insertion as well (security definer,
-- or with the placement inlined), and finish_insertion is being restated for
-- the batch marker (VER-237): two restatements from two branches overwrite
-- each other in migration order, so the later one would quietly undo this
-- one. Fourteen live api test files and eight pgTAP files also place their
-- fixtures through insert_ranking_entry as a signed-in user.
--
-- ## What this does instead
--
-- insert_ranking_entry writes, for a direct call, the row finish_insertion
-- would have written for the same call with no comparisons: the guess from
-- insertion_predictions, made after the argument checks and before the
-- shift, and one prediction_log row with surface insertion, model_version
-- content-v1, source user (batch for a 'prior' place, as finish_insertion
-- maps it) and placed_by, inserted after the placement as the caller through
-- prediction_log's owner-only insert policy. A direct call and a
-- finish_insertion with an empty comparison list now place the same way and
-- log the same row, so the calibration view has nothing new to tell apart.
--
-- When finish_insertion is the caller it has already made the guess and
-- writes the row itself, so insert_ranking_entry writes none. The function
-- reads its own call stack (GET DIAGNOSTICS ... PG_CONTEXT) for a
-- finish_insertion frame: the stack is the server's, a client cannot write
-- into it, and a client can reach insert_ranking_entry only through
-- PostgREST (a stack of one frame) or through finish_insertion. The match is
-- on the name, not the argument list, so a finish_insertion with another
-- signature is still recognized. Any other function that comes to call
-- insert_ranking_entry gets the row written for it, which is the safe side.
--
-- The grants, the signature and security invoker are unchanged; the body is
-- 20261007120000_onboarding_backend.sql's, with the guess and the row added.
-- A refused call (an unknown item, one already ranked, a bad mark) raises
-- the error it always raised before the guess is made, and leaves no row.

create or replace function public.insert_ranking_entry(
  p_media_item_id uuid,
  p_medium public.medium,
  p_tier public.tier,
  p_position integer,
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
  v_placed_by text := coalesce(p_placed_by, 'user');
  v_catalog_medium public.medium;
  v_count integer;
  v_position integer;
  v_stack text;
  v_log boolean;
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
      message = 'insert_ranking_entry requires an authenticated user';
  end if;

  if v_placed_by not in ('user', 'prior') then
    raise exception using
      errcode = '22023',
      message = format('p_placed_by must be user or prior, not %s', v_placed_by);
  end if;

  select m.medium into v_catalog_medium
  from public.media_items m
  where m.id = p_media_item_id;

  if v_catalog_medium is null then
    raise exception using
      errcode = '22023',
      message = format('no media item %s in the catalog', p_media_item_id);
  end if;

  if v_catalog_medium <> p_medium then
    raise exception using
      errcode = '22023',
      message = format('media item %s is a %s, not a %s', p_media_item_id, v_catalog_medium, p_medium);
  end if;

  if exists (
    select 1 from public.ranking_entries r
    where r.user_id = v_uid and r.media_item_id = p_media_item_id
  ) then
    raise exception using
      errcode = '23505',
      message = format('media item %s is already ranked; use move_ranking_entry to change its place', p_media_item_id);
  end if;

  -- The guess, unless finish_insertion is the caller and logs it itself. A
  -- null medium skips it, so that call fails where it always failed (the
  -- placement's not-null column) rather than in the helper.
  get diagnostics v_stack = pg_context;
  v_log := p_medium is not null
    and v_stack !~ 'PL/pgSQL function (public\.)?finish_insertion\(';

  if v_log then
    select g.list_size, g.mean_baseline, g.prior_score, g.prior_from, g.content_score,
           g.predicted_score, g.predicted_tier, g.confidence
    into v_list_size, v_mean, v_prior, v_prior_from, v_content,
         v_predicted, v_predicted_tier, v_confidence
    from public.insertion_predictions(p_medium, array[p_media_item_id]) g;
  end if;

  select count(*) into v_count
  from public.ranking_entries r
  where r.user_id = v_uid and r.medium = p_medium and r.tier = p_tier;

  v_position := least(greatest(coalesce(p_position, v_count), 0), v_count);

  -- The shift. These rows are being moved out of the way, not placed, so
  -- neither placed_at nor placed_by is in the set list.
  update public.ranking_entries r
  set position = r.position + 1,
      updated_at = now()
  where r.user_id = v_uid
    and r.medium = p_medium
    and r.tier = p_tier
    and r.position >= v_position;

  insert into public.ranking_entries (user_id, medium, tier, media_item_id, position, placed_at, placed_by)
  values (v_uid, p_medium, p_tier, p_media_item_id, v_position, now(), v_placed_by);

  -- The guess's row, as finish_insertion writes it for a call with no
  -- comparisons: as the caller, through prediction_log's insert policy.
  if v_log then
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
  end if;

  return v_position;
end;
$$;

comment on function public.insert_ranking_entry(uuid, public.medium, public.tier, integer, text) is
  'Insert a ranked item at a position in the caller''s tier, shifting later items down, stamping placed_at and recording placed_by (user or prior, default user) on the new row only. Returns the position used. Called directly, it also logs the engine''s guess for the item, made from the list before it landed, as the one prediction_log row finish_insertion would write for the same call with no comparisons; called by finish_insertion, it leaves that row to finish_insertion.';

revoke all on function public.insert_ranking_entry(uuid, public.medium, public.tier, integer, text) from public, anon;
grant execute on function public.insert_ranking_entry(uuid, public.medium, public.tier, integer, text) to authenticated, service_role;
