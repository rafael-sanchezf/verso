-- Ownership out of the product.
-- ROADMAP.md work queue item 35, decision 26; docs/private/design/bulk-entry-build.md,
-- PR 1.
--
-- Decision 26 (Rafa, 2026-10-06): "the game should track your preferences and
-- anything that you have played and are thinking of playing; any ownership
-- discussion is out of scope". Rule 19 retires. What decision 19 kept stands:
-- a ranked game was played, on the platforms the entry records in
-- `played_platforms` (20260923100000_played_platforms.sql), and that list is
-- now the only per-entry platform fact.
--
-- Four things here:
--
--   1. `tier_list` loses its `owned_platforms` column. Dropped and created, as
--      20260923100000_played_platforms.sql did, because `create or replace`
--      cannot change a `returns table`; the drop takes the grants and the pinned
--      search_path with it, so both are written again below and asserted in
--      supabase/tests/drop_ownership.test.sql (item 17's lesson).
--   2. `user_entries.owned_platforms` is dropped. Nothing else in the schema
--      reads it: no view selects it (the drop would refuse if one did), no
--      trigger or index names it, and `tier_list` was the one function body
--      that did. There was never a `set_owned_platforms`; ownership was written
--      by a table update from packages/api, which goes in the same pull request.
--   3. The Steam import records where a game was played instead.
--      `apply_steam_played_platforms` adds 'PC (Microsoft Windows)' to the
--      played-on list of every entry the user already tracks whose Steam
--      library row has playtime above zero. Inferred from decision 19 (Steam
--      hours on a game are hours played on PC, Steam Deck included) and flagged
--      in the pull request.
--   4. The comments that described ownership are restated without it.
--
-- The data in `owned_platforms` is not copied anywhere. Owning and having
-- played are different claims (decision 19's whole point), so moving one list
-- into the other would invent played-on answers nobody gave; and the column
-- had no reader left once the screens stop asking.

-- 1. tier_list without owned_platforms ------------------------------------------
-- The same body as 20260923100000_played_platforms.sql minus one column. The
-- remaining columns keep their order, so every caller that reads them by name
-- or by position (the Ranking tab, the exports, the engine) is unaffected.

drop function if exists public.tier_list(public.medium, public.tier);

-- 2. user_entries.owned_platforms ------------------------------------------------

alter table public.user_entries
  drop column owned_platforms;

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
  platforms text[],
  played_platforms text[]
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
    coalesce(g.platforms, '{}'::text[]),
    coalesce(e.played_platforms, '{}'::text[])
  from public.ranking_entries r
  join public.media_items m on m.id = r.media_item_id
  left join public.game_details g on g.media_item_id = m.id
  left join public.user_entries e
    on e.user_id = r.user_id
   and e.media_item_id = r.media_item_id
  where r.user_id = auth.uid()
    and r.medium = p_medium
    and r.tier = p_tier
  order by r.position;
$$;

comment on function public.tier_list(public.medium, public.tier) is
  'The caller''s ranked items in one tier, best first, joined with catalog details. external_ids carries the Steam app id a cover falls back to; played_platforms is the caller''s own list from the entry, empty when nothing is recorded or the entry is gone.';

revoke all on function public.tier_list(public.medium, public.tier) from public, anon;
grant execute on function public.tier_list(public.medium, public.tier) to authenticated, service_role;

comment on column public.user_entries.played_platforms is
  'Platforms the user played this on, as the names in game_details.platforms. Empty means not recorded. Independent of status. Written by set_played_platforms, which refuses names the catalog does not list for the game, and by apply_steam_played_platforms, which adds PC for a game with Steam playtime.';

-- 3. apply_steam_played_platforms -------------------------------------------------
-- The Steam import's half of decision 19. Its rules, one per clause:
--
--   e.media_item_id = s.media_item_id    only games the user already tracks.
--                                        An UPDATE: the import still never
--                                        creates an entry, and a library game
--                                        with no entry stays a candidate.
--   s.playtime_forever_minutes > 0       a zero says nothing, exactly as in
--                                        apply_steam_playtime: "never played"
--                                        and "total playtime hidden" look the
--                                        same from the API.
--   PC in game_details.platforms         the name has to be one the catalog
--                                        lists for the game, which is the rule
--                                        set_played_platforms enforces for the
--                                        user; a name outside it would never be
--                                        drawn on the game page.
--   PC not already on the list           so a second import changes nothing and
--                                        reports zero.
--
-- It adds, it never replaces. A user who said "Switch" and has forty hours on
-- Steam played on both, and the two answers do not conflict the way two
-- playtime figures do, so the user's list keeps everything on it and gains PC.
-- The result is in catalog order, as set_played_platforms stores it; a name
-- the catalog does not list (only the JSON import can put one there) is kept
-- after the catalog names rather than dropped.
--
-- What it does not touch: playtime (apply_steam_playtime), status,
-- backlog_position, and every date. The BEFORE triggers on user_entries leave
-- an update that changes neither `status` nor the media item as it found it,
-- which the suite asserts for the started date and the backlog position.
--
-- Unlinking does not take PC back off, for the reason imported playtime stays:
-- it is the user's record now, and it stays true after the link is gone.
--
-- Service role only, like apply_steam_playtime: it names a user id, and the
-- Edge Function that calls it has already verified that user's JWT.

create function public.apply_steam_played_platforms(p_user_id uuid)
returns integer
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
declare
  v_pc constant text := 'PC (Microsoft Windows)';
  v_updated integer;
begin
  update public.user_entries e
  set played_platforms =
        array(
          select k.name
          from unnest(g.platforms) with ordinality as k(name, ord)
          where k.name = v_pc
             or k.name = any(e.played_platforms)
          order by k.ord
        )
        || array(
          select p.name
          from unnest(e.played_platforms) with ordinality as p(name, ord)
          where not (p.name = any(g.platforms))
          order by p.ord
        )
  from public.steam_library s
  join public.game_details g on g.media_item_id = s.media_item_id
  where s.user_id = p_user_id
    and e.user_id = p_user_id
    and s.media_item_id is not null
    and e.media_item_id = s.media_item_id
    and s.playtime_forever_minutes > 0
    and v_pc = any(g.platforms)
    and not (v_pc = any(e.played_platforms));

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

comment on function public.apply_steam_played_platforms(uuid) is
  'Add PC to the played-on list of every entry a user already tracks whose Steam library row has playtime above zero, when the catalog lists PC for the game. Adds, never replaces; catalog order. Returns how many entries changed. Updates only: never creates an entry, never touches playtime, status, or any date.';

revoke all on function public.apply_steam_played_platforms(uuid) from public, anon, authenticated;
grant execute on function public.apply_steam_played_platforms(uuid) to service_role;

-- 4. The comments that described ownership -----------------------------------------
-- apply_steam_playtime's said it never touched owned_platforms; it still never
-- touches a platform list, and the played-on one now has its own function.
-- steam_backlog_candidates keeps its job under decision 26: a library game the
-- user has no entry for is offered as something they may be thinking of
-- playing, which is a backlog, not a collection.

comment on function public.apply_steam_playtime(uuid) is
  'Copy Steam playtime onto the entries a user already tracks, never over a manual figure and never from a zero. Returns how many entries changed. Updates only: an import never creates an entry, and this never touches played_platforms (apply_steam_played_platforms does), status, or any date.';

comment on function public.steam_backlog_candidates(integer) is
  'Games in the caller''s Steam library, resolved to the catalog, that they have no entry for: offered as games they may be thinking of playing (decision 26). Least played first, then by title. A read only: the app offers these and the user accepts, because the backlog is theirs.';
