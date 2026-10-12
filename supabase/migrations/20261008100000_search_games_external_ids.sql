-- search_games returns external_ids, so a Search result can draw a Steam cover.
--
-- `coverCandidates` in packages/api/src/covers.ts builds the list of URLs worth
-- trying from two facts: `media_items.cover_image_id` (IGDB) and
-- `media_items.external_ids.steam` (Steam's CDN, the fallback for the games
-- IGDB has no cover for). search_games carried the first and not the second, so
-- a result with no IGDB cover drew the grey placeholder even when the game has
-- a Steam app id, on Search and on the onboarding seeds alike. tier_list had the
-- same gap and 20260916150000_tier_list_external_ids.sql closed it the same
-- way; popular_games has returned the column since it was written.
--
-- The whole blob rather than just the Steam id, because that is the shape every
-- other read hands to `coverCandidates` (`CoverSourceRow` in covers.ts), and the
-- parse of an untyped jsonb id stays in one place in the app rather than moving
-- into SQL here.
--
-- The body is the one in 20260916230000_per_medium_backlog_and_rpcs.sql, part
-- B1, with one column added to the return table and one to the select. Nothing
-- about matching or ranking changes.
--
-- ## Nothing to do when the column is already there
--
-- PR #62 (search-smarter, 20260923110000_search_aliases.sql) rewrites this
-- function with aliases and word matching and returns `external_ids` too. Its
-- file is dated before this one, so a fresh replay runs it first; and either
-- PR can be merged and pushed to the hosted project before the other. Run
-- unconditionally, this file would replace #62's body with the older one
-- whenever it ran second. So it checks the function's return table first and
-- stops if `external_ids` is already in it: whichever order the two land in,
-- the end state is the newest body with the column. Hence the DO block and the
-- dynamic DDL, which plain SQL cannot make conditional.
--
-- Drop and create, because `create or replace function` cannot change a
-- `returns table`. The drop takes the grants, the comment and the pinned
-- search_path with it (work queue item 17), so all three are written again
-- below and asserted in supabase/tests/search_games_external_ids.test.sql.
--
-- Still `security invoker`: `external_ids` is catalog data that any signed-in
-- user can already read off `media_items`, so the function reaches nothing new.

do $guard$
begin
  if pg_catalog.pg_get_function_result(
       'public.search_games(text,integer,public.medium)'::pg_catalog.regprocedure
     ) ~ 'external_ids jsonb'
  then
    raise notice 'search_games already returns external_ids; nothing to do';
    return;
  end if;

  execute 'drop function if exists public.search_games(text, integer, public.medium)';

  execute $ddl$
create function public.search_games(
  p_query text,
  p_limit integer default 20,
  p_medium public.medium default 'game'
)
returns table (
  media_item_id uuid,
  title text,
  year smallint,
  cover_image_id text,
  external_ids jsonb,
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
  v_medium public.medium := coalesce(p_medium, 'game');
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
    m.external_ids,
    g.igdb_id,
    g.developer,
    coalesce(g.genres, md.genres, td.genres, '{}'::text[]),
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
  left join public.movie_details md on md.media_item_id = m.id
  left join public.tv_details td on td.media_item_id = m.id
  where m.medium = v_medium
    and (m.title operator(extensions.%) v_term or m.title ilike v_prefix)
  order by rank_score desc, m.title asc
  limit v_limit;
end;
$$
  $ddl$;

  execute $ddl$
comment on function public.search_games(text, integer, public.medium) is
  'Trigram search of one medium''s catalog, exact title first, then prefix matches, then similarity. Defaults to games; genres come from whichever extension table holds the row; external_ids is returned as media_items stores it, for the Steam cover fallback.'
  $ddl$;

  execute 'revoke all on function public.search_games(text, integer, public.medium) from public, anon';
  execute 'grant execute on function public.search_games(text, integer, public.medium) to authenticated, service_role';
end
$guard$;
