-- tier_list returns external_ids, so a Ranking row can draw a cover.
--
-- `coverCandidates` in packages/api/src/covers.ts builds the list of URLs worth
-- trying from two facts: `media_items.cover_image_id` (IGDB) and
-- `media_items.external_ids.steam` (Steam's CDN, the fallback for the games
-- IGDB has no cover for). tier_list carried the first and not the second, so
-- every row on the Ranking tab that IGDB has no art for fell through to the
-- placeholder even when Steam had box art for it. docs/design/specs/ranking.md
-- said so in its Data section; this closes it.
--
-- The column has to be added by drop-and-create: Postgres will not let `create
-- or replace function` change a return type, and a `returns table` is one.
-- Dropping takes the grants with it, so they are written again below, the same
-- way 20260915130000_ranking_functions.sql wrote them.
--
-- Still `security invoker` on `auth.uid()`, with no user id parameter. Row
-- Level Security is still the boundary, and `external_ids` is catalog data
-- readable by any signed-in user anyway -- what this function gates is *which
-- rows*, and that has not changed.

drop function if exists public.tier_list(public.medium, public.tier);

create function public.tier_list(
  p_medium public.medium,
  p_tier public.tier
)
returns table (
  media_item_id uuid,
  "position" integer,
  title text,
  year smallint,
  cover_image_id text,
  external_ids jsonb,
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
    m.external_ids,
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
  'The caller''s ranked items in one tier, best first, joined with catalog details. external_ids carries the Steam app id a cover falls back to.';

revoke all on function public.tier_list(public.medium, public.tier) from public, anon;
grant execute on function public.tier_list(public.medium, public.tier) to authenticated, service_role;
