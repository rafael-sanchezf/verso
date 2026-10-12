-- popular_games: the one catalog read a signed-out visitor may make.
--
-- Two screens want it. The signed-out cover wall (docs/design/specs/
-- signed-out.md) draws a collage from a fixed list of fifteen IGDB image ids
-- kept in the shell, because the catalog is not readable signed out, and the
-- spec says to "replace it with a public 'popular' read when one exists".
-- Search's "Popular" list (docs/design/specs/search.md) reads the same
-- ordering and says an index or an RPC can come later. This is that read.
--
-- ## Why this one is security definer
--
-- Every other function in this schema is `security invoker` and works on
-- `auth.uid()`, because every other function touches rows that belong to
-- somebody. This one does not. `media_items` and `game_details` are the IGDB
-- mirror: catalog data, written by the service role, read-only to everyone
-- else, and identical for every user. There is nothing here that RLS is
-- protecting from one user on behalf of another.
--
-- So it runs as its owner and is granted to `anon`, which lets a signed-out
-- visitor see fifteen real covers instead of a hardcoded collage. What that
-- does *not* do is open the tables: `anon` still has no select policy on
-- `media_items` or `game_details` and still reads nothing from them directly.
-- The function is the whole of the anonymous surface -- six columns, one
-- ordering, at most fifty rows -- and the pgTAP suite checks both halves of
-- that sentence.
--
-- `set search_path` matters more here than in an invoker function: a definer
-- function that resolved a name through the caller's search_path would run the
-- caller's code as the owner. Everything below is schema-qualified as well.
--
-- ## The ordering
--
-- `metadata->>'total_rating_count'` is IGDB's count of ratings, written by the
-- mirror (`packages/catalog/src/map.ts`) as a number or JSON null. It is a
-- sort key and is never shown: rule 21, one scoreboard per source, and this is
-- not a score. Popularity, not quality -- which is what "Popular" claims.
--
-- The cast is `numeric`, not `int` (corrected 2026-09-16 after this file
-- merged and before it reached the hosted project): IGDB documents the field
-- as a double, the mirror writes it raw with no integer check, and the Steam
-- scores selection in packages/catalog/src/db.ts already casts it numeric. An
-- int cast would abort the index build on the first fractional value and,
-- since an expression index is computed on every write, would then fail the
-- nightly upsert for that row. `nullif(..., '')` turns an empty string into a
-- null rather than an error; a JSON null already comes out of `->>` as SQL
-- NULL; both sort last. 20260916173000_popular_games_numeric.sql restates the
-- same end state for any database where the earlier wording of this file ran.

-- The index that makes it cheap: the sort key and the tie-break, in the
-- direction the function reads them, over the games only. Partial, because
-- V0's catalog is games and a movie mirror would want its own.
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
  -- m.id is a tie-break and not decoration: without it, two games with the
  -- same rating count could swap places between calls and a cover wall would
  -- reshuffle on every render.
  order by nullif(m.metadata ->> 'total_rating_count', '')::numeric desc nulls last, m.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

comment on function public.popular_games(integer) is
  'The most-rated games in the catalog, at most fifty. Catalog data only, so it is readable signed out; the tables behind it are not.';

revoke all on function public.popular_games(integer) from public;
grant execute on function public.popular_games(integer) to anon, authenticated, service_role;
