-- Ranking and backlog RPCs. Everything the app needs to place, move, and remove
-- a ranked item lives here so a single supabase-js rpc() call is one atomic
-- transaction and the position shuffle never round-trips through the client.
--
-- See docs/design/ranking-algorithm.md (Option A) and the engine in
-- packages/core/src/ranking.ts, which produces the arguments for
-- finish_insertion.
--
-- Every function is `security invoker`, so Row Level Security still decides
-- what the caller can touch, and every one works on auth.uid() only. There is
-- no user_id parameter anywhere: a caller cannot name someone else's rows.
--
-- ranking_entries has `unique (user_id, medium, tier, position) deferrable
-- initially deferred`. The shift statements below lean on that: they walk
-- through states with duplicate positions and the constraint is only checked
-- when the transaction commits.

-- Helpers ---------------------------------------------------------------------

-- Errors raised here use these SQLSTATEs so the app can branch on them:
--   23505  the item is already ranked
--   P0002  the item is not ranked (move/remove)
--   22023  unknown media item, or medium does not match the catalog row
--   28000  no authenticated user

-- 1. insert_ranking_entry -----------------------------------------------------
-- Insert the item at p_position in (medium, tier) and shift everything from
-- that position down one slot. p_position is clamped to [0, tier size], so
-- "append" can be a large number and a stale client cannot fail on an
-- off-by-one.

create or replace function public.insert_ranking_entry(
  p_media_item_id uuid,
  p_medium public.medium,
  p_tier public.tier,
  p_position integer
)
returns integer
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_catalog_medium public.medium;
  v_count integer;
  v_position integer;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'insert_ranking_entry requires an authenticated user';
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

  select count(*) into v_count
  from public.ranking_entries r
  where r.user_id = v_uid and r.medium = p_medium and r.tier = p_tier;

  v_position := least(greatest(coalesce(p_position, v_count), 0), v_count);

  update public.ranking_entries r
  set position = r.position + 1,
      updated_at = now()
  where r.user_id = v_uid
    and r.medium = p_medium
    and r.tier = p_tier
    and r.position >= v_position;

  insert into public.ranking_entries (user_id, medium, tier, media_item_id, position)
  values (v_uid, p_medium, p_tier, p_media_item_id, v_position);

  return v_position;
end;
$$;

comment on function public.insert_ranking_entry(uuid, public.medium, public.tier, integer) is
  'Insert a ranked item at a position in the caller''s tier, shifting later items down. Returns the position used.';

-- 2. move_ranking_entry -------------------------------------------------------
-- Drag-to-reorder and the confirm step's up/down nudges. Closes the gap the
-- item leaves behind, then opens one at the target. The medium is not a
-- parameter: an item cannot change medium.

create or replace function public.move_ranking_entry(
  p_media_item_id uuid,
  p_tier public.tier,
  p_position integer
)
returns integer
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_medium public.medium;
  v_old_tier public.tier;
  v_old_position integer;
  v_count integer;
  v_position integer;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'move_ranking_entry requires an authenticated user';
  end if;

  select r.medium, r.tier, r.position
  into v_medium, v_old_tier, v_old_position
  from public.ranking_entries r
  where r.user_id = v_uid and r.media_item_id = p_media_item_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = format('media item %s is not ranked', p_media_item_id);
  end if;

  -- Close the gap the item leaves. It keeps its own position for now, which
  -- briefly duplicates a position; the deferred unique constraint allows that.
  update public.ranking_entries r
  set position = r.position - 1,
      updated_at = now()
  where r.user_id = v_uid
    and r.medium = v_medium
    and r.tier = v_old_tier
    and r.position > v_old_position
    and r.media_item_id <> p_media_item_id;

  select count(*) into v_count
  from public.ranking_entries r
  where r.user_id = v_uid
    and r.medium = v_medium
    and r.tier = p_tier
    and r.media_item_id <> p_media_item_id;

  v_position := least(greatest(coalesce(p_position, v_count), 0), v_count);

  -- Open the gap at the target.
  update public.ranking_entries r
  set position = r.position + 1,
      updated_at = now()
  where r.user_id = v_uid
    and r.medium = v_medium
    and r.tier = p_tier
    and r.position >= v_position
    and r.media_item_id <> p_media_item_id;

  update public.ranking_entries r
  set tier = p_tier,
      position = v_position,
      updated_at = now()
  where r.user_id = v_uid and r.media_item_id = p_media_item_id;

  return v_position;
end;
$$;

comment on function public.move_ranking_entry(uuid, public.tier, integer) is
  'Move one of the caller''s ranked items to another tier or position, closing the old gap and opening a new one. Returns the position used.';

-- 3. remove_ranking_entry -----------------------------------------------------

create or replace function public.remove_ranking_entry(p_media_item_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_medium public.medium;
  v_tier public.tier;
  v_position integer;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'remove_ranking_entry requires an authenticated user';
  end if;

  delete from public.ranking_entries r
  where r.user_id = v_uid and r.media_item_id = p_media_item_id
  returning r.medium, r.tier, r.position
  into v_medium, v_tier, v_position;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = format('media item %s is not ranked', p_media_item_id);
  end if;

  update public.ranking_entries r
  set position = r.position - 1,
      updated_at = now()
  where r.user_id = v_uid
    and r.medium = v_medium
    and r.tier = v_tier
    and r.position > v_position;
end;
$$;

comment on function public.remove_ranking_entry(uuid) is
  'Unrank one of the caller''s items and close the gap it leaves in its tier.';

-- 4. finish_insertion ---------------------------------------------------------
-- One RPC per ranked game: write the comparison log the insertion produced,
-- then place the item. p_comparisons is a JSON array of
--   {"item_a": uuid, "item_b": uuid, "outcome": ..., "context": {...}}
-- Any user_id in the payload is ignored; the rows are always the caller's.

create or replace function public.finish_insertion(
  p_media_item_id uuid,
  p_medium public.medium,
  p_tier public.tier,
  p_position integer,
  p_comparisons jsonb
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

  insert into public.comparisons (user_id, medium, item_a, item_b, outcome, context)
  select
    v_uid,
    p_medium,
    (c ->> 'item_a')::uuid,
    (c ->> 'item_b')::uuid,
    (c ->> 'outcome')::public.comparison_outcome,
    coalesce(c -> 'context', '{}'::jsonb)
  from jsonb_array_elements(v_comparisons) as c;

  return public.insert_ranking_entry(p_media_item_id, p_medium, p_tier, p_position);
end;
$$;

comment on function public.finish_insertion(uuid, public.medium, public.tier, integer, jsonb) is
  'Log the comparisons from one insertion and place the item, as a single transaction. The caller owns every row written.';

-- 5. search_games -------------------------------------------------------------
-- Trigram search over the game catalog, using the media_items_title_trgm GIN
-- index. Ranked by pg_trgm similarity with a boost for a prefix match and a
-- larger one for an exact title, so "Hades" beats "Hades II" beats "Shades".

create or replace function public.search_games(
  p_query text,
  p_limit integer default 20
)
returns table (
  media_item_id uuid,
  title text,
  year smallint,
  cover_image_id text,
  igdb_id integer,
  developer text,
  genres text[],
  platforms text[],
  score real
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_term text := nullif(btrim(p_query), '');
  v_prefix text;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  if v_term is null then
    return;
  end if;

  -- The query is user input, so neutralize LIKE metacharacters before it is
  -- used as a prefix pattern.
  v_prefix := replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select
    m.id,
    m.title,
    m.year,
    m.cover_image_id,
    g.igdb_id,
    g.developer,
    coalesce(g.genres, '{}'::text[]),
    coalesce(g.platforms, '{}'::text[]),
    (
      extensions.similarity(m.title, v_term)
      + case
          when lower(m.title) = lower(v_term) then 1.0
          when m.title ilike v_prefix then 0.3
          else 0.0
        end
    )::real as rank_score
  from public.media_items m
  left join public.game_details g on g.media_item_id = m.id
  where m.medium = 'game'
    and (m.title operator(extensions.%) v_term or m.title ilike v_prefix)
  order by rank_score desc, m.title asc
  limit v_limit;
end;
$$;

comment on function public.search_games(text, integer) is
  'Trigram search of the game catalog, exact title first, then prefix matches, then similarity.';

-- 6. tier_list ----------------------------------------------------------------
-- The caller's ordered tier with everything the comparison screen and the
-- genre-preferring pivot in packages/core need.

create or replace function public.tier_list(
  p_medium public.medium,
  p_tier public.tier
)
returns table (
  media_item_id uuid,
  "position" integer,
  title text,
  year smallint,
  cover_image_id text,
  genres text[],
  platforms text[]
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    r.media_item_id,
    r.position,
    m.title,
    m.year,
    m.cover_image_id,
    coalesce(g.genres, '{}'::text[]),
    coalesce(g.platforms, '{}'::text[])
  from public.ranking_entries r
  join public.media_items m on m.id = r.media_item_id
  left join public.game_details g on g.media_item_id = m.id
  where r.user_id = auth.uid()
    and r.medium = p_medium
    and r.tier = p_tier
  order by r.position;
$$;

comment on function public.tier_list(public.medium, public.tier) is
  'The caller''s ranked items in one tier, best first, joined with catalog details.';

-- Grants ----------------------------------------------------------------------
-- Signed-in users only. RLS inside each function is what actually protects the
-- rows; this just keeps the RPCs off the anonymous surface.

revoke all on function public.insert_ranking_entry(uuid, public.medium, public.tier, integer) from public, anon;
revoke all on function public.move_ranking_entry(uuid, public.tier, integer) from public, anon;
revoke all on function public.remove_ranking_entry(uuid) from public, anon;
revoke all on function public.finish_insertion(uuid, public.medium, public.tier, integer, jsonb) from public, anon;
revoke all on function public.search_games(text, integer) from public, anon;
revoke all on function public.tier_list(public.medium, public.tier) from public, anon;

grant execute on function public.insert_ranking_entry(uuid, public.medium, public.tier, integer) to authenticated, service_role;
grant execute on function public.move_ranking_entry(uuid, public.tier, integer) to authenticated, service_role;
grant execute on function public.remove_ranking_entry(uuid) to authenticated, service_role;
grant execute on function public.finish_insertion(uuid, public.medium, public.tier, integer, jsonb) to authenticated, service_role;
grant execute on function public.search_games(text, integer) to authenticated, service_role;
grant execute on function public.tier_list(public.medium, public.tier) to authenticated, service_role;
