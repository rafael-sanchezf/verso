-- popular_games: compare the rating count as numeric, not int.
--
-- 20260916160000_popular_games.sql cast `metadata->>'total_rating_count'` to
-- int, in the index and in the function's order by. Review after it merged
-- (PR #21) found the cast unsafe: IGDB documents the field as a double, the
-- mirror writes it raw (`game.total_rating_count ?? null` in
-- packages/catalog/src/map.ts, with no integer check), and the one other
-- query that reads it, the Steam scores selection in packages/catalog/src/db.ts,
-- already casts it numeric. An int cast aborts the index build on the first
-- fractional value and, since an expression index is computed on every write,
-- would then fail the nightly upsert for that row.
--
-- 20260916160000 is also corrected in place, since the hosted project had not
-- applied it when this was written (ROADMAP.md, 2026-09-16). This file exists
-- for any database where the earlier wording ran: it drops and recreates the
-- index and replaces the function, so every path ends in the same state, and
-- where the corrected 20260916160000 ran first it is a no-op restatement. `nullif(..., '')`
-- turns an empty string into a null rather than an error; JSON null already
-- comes out of `->>` as SQL NULL; both sort last.
--
-- Everything else about the function is unchanged: same six columns, same
-- clamp to 1..50, still security definer with a pinned search_path, still
-- granted to anon. The grants are restated so the end state does not depend
-- on `create or replace` preserving the ACL, which it does.

drop index if exists public.media_items_game_rating_count;

create index media_items_game_rating_count
  on public.media_items ((nullif(metadata ->> 'total_rating_count', '')::numeric) desc nulls last, id)
  where medium = 'game';

create or replace function public.popular_games(p_limit integer default 20)
returns table (
  id uuid,
  title text,
  year smallint,
  cover_image_id text,
  external_ids jsonb,
  platforms text[]
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    m.id,
    m.title,
    m.year,
    m.cover_image_id,
    m.external_ids,
    coalesce(g.platforms, '{}'::text[])
  from public.media_items m
  left join public.game_details g on g.media_item_id = m.id
  where m.medium = 'game'
  order by nullif(m.metadata ->> 'total_rating_count', '')::numeric desc nulls last, m.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

comment on function public.popular_games(integer) is
  'The most-rated games in the catalog, at most fifty. Catalog data only, so it is readable signed out; the tables behind it are not.';

revoke all on function public.popular_games(integer) from public;
grant execute on function public.popular_games(integer) to anon, authenticated, service_role;
