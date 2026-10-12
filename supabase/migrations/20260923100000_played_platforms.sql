-- Played-on platforms, the backend half.
-- ROADMAP.md work queue item 28, decision 19; docs/private/phone-feedback.md entry 8.
--
-- Decision 19: ranking means played, not owned. A ranked game was played, but
-- it may have been rented, borrowed, or sold since, so `owned_platforms` is the
-- wrong fact to ask for when a game is ranked and the wrong fact to filter the
-- ranked list by. The entry now records the platforms it was played on, asked
-- once in the log flow's confirm step (the screens are item 32 and wait for
-- Rafa's word). Ownership stays exactly what it was: a separate, optional fact
-- that the Next tab's owned filter and the wish list read.
--
-- Three things here:
--
--   1. `user_entries.played_platforms`, the twin of `owned_platforms`.
--   2. `set_played_platforms(media item, platforms)`, the one writer, which
--      validates names against the catalog the way `setOwnedPlatforms` in
--      packages/api does and upserts the entry the way every writer there does.
--   3. `tier_list` returning both lists per row, so the Ranking tab's platform
--      filter (entry 4) can follow where a game was played instead of every
--      platform the catalog lists it on.
--
-- Errors raised here use the SQLSTATEs the earlier files use, following the
-- legend in 20260915130000_ranking_functions.sql:
--   22023  a platform the catalog does not list for this game
--   23503  the media item is not in the catalog (raised by set_entry_medium)
--   28000  no authenticated user

-- 1. user_entries.played_platforms --------------------------------------------
-- The same shape as `owned_platforms` for the same reasons, which
-- 20260915235900_ownership_release_dates.sql gives at length: the values are
-- platform names exactly as `game_details.platforms` spells them (IGDB's long
-- form, 'PC (Microsoft Windows)'), so a screen marks the platforms a game was
-- played on by intersecting two text[] with no lookup table, and empty means
-- "not recorded" so nothing needs a null check and no row needs a backfill.
--
-- Empty is "not recorded", not "never played". Every entry that exists today
-- was written before the question was ever asked, and the log flow's step is
-- skippable, so an empty list on a ranked game is the normal case and a screen
-- falls back to whatever it showed before (entry 4: the catalog list).
--
-- No check constraint and no trigger ties the names to the catalog, and that
-- is the same choice `owned_platforms` made. Validation lives in the writer
-- (set_played_platforms below), not on the column, because:
--
--   * the JSON import restores the column as the document spells it
--     (packages/api/src/export.ts), and a round trip that quietly dropped a
--     platform, or refused a whole file over one, would not be a round trip;
--   * the catalog is a mirror that the nightly sync rewrites. A column rule
--     would turn IGDB renaming a platform into every later write to that entry
--     failing, including writes that never touched the platforms.

alter table public.user_entries
  add column played_platforms text[] not null default '{}';

comment on column public.user_entries.played_platforms is
  'Platforms the user played this on, as the names in game_details.platforms. Empty means not recorded. Independent of owned_platforms and of status. Written by set_played_platforms, which refuses names the catalog does not list for the game.';

-- 2. set_played_platforms ------------------------------------------------------
-- The one writer. It follows `setOwnedPlatforms` in packages/api/src/entries.ts
-- rule for rule, so the two lists behave the same way for a caller:
--
--   * An empty array (or null) clears the list, with no catalog lookup, so
--     clearing works even for a media item with no game_details row behind it.
--   * Names are matched against `game_details.platforms` without regard to case
--     or surrounding spaces and stored in the catalog's spelling, because the
--     game page ticks the platforms by intersecting arrays and "playstation 5"
--     would never meet "PlayStation 5".
--   * A name the catalog does not list for this game refuses the whole write
--     with 22023. The message names the refused platforms, and DETAIL is a JSON
--     object `{"unknown": [...], "known": [...]}` (the refused names as sent,
--     and what the catalog does list) so `setPlayedPlatforms` can throw the
--     same `UnknownPlatformError` `setOwnedPlatforms` throws.
--   * What is stored is in catalog order with duplicates collapsed, so the
--     glyph row does not reshuffle between writes.
--   * It upserts: touching any fact about a game you do not track creates the
--     entry with the table's default status, `backlog`, the same promise every
--     writer in entries.ts makes. In the flow this exists for, the entry is
--     already there (ranking follows "I finished this", which writes it), so
--     the insert branch is the rare one.
--
-- Unlike ownership, this is a database function rather than a table write from
-- the client. The reason is the round trip: `setOwnedPlatforms` reads the
-- catalog and then writes, two requests; here the read and the write are one
-- call and one transaction. `setOwnedPlatforms` is left as it is.
--
-- Security invoker on auth.uid(), with no user id parameter, like every other
-- function over user data in this project. Row Level Security is still the
-- boundary: the insert and the update go through the owner-only policy on
-- user_entries, and the catalog read goes through game_details' own read
-- policy, which every signed-in user satisfies.

create function public.set_played_platforms(
  p_media_item_id uuid,
  p_platforms text[]
)
returns public.user_entries
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_known text[];
  v_unknown text[];
  v_played text[];
  v_entry public.user_entries;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'set_played_platforms requires an authenticated user';
  end if;

  if coalesce(cardinality(p_platforms), 0) = 0 then
    v_played := '{}';
  else
    select g.platforms into v_known
    from public.game_details g
    where g.media_item_id = p_media_item_id;

    -- No game_details row (a film, a series, or no such media item at all)
    -- means the catalog lists no platforms, so every name is unknown. That is
    -- what setOwnedPlatforms does too: it reports the names rather than a
    -- missing row, and the empty `known` list says why.
    v_known := coalesce(v_known, '{}');

    select array_agg(u.name order by u.ord) into v_unknown
    from unnest(p_platforms) with ordinality as u(name, ord)
    where u.name is null
       or not exists (
         select 1 from unnest(v_known) as k(name)
         where lower(k.name) = lower(btrim(u.name))
       );

    if v_unknown is not null then
      raise exception using
        errcode = '22023',
        message = format(
          'not a platform this game is on: %s',
          array_to_string(v_unknown, ', ', '(null)')
        ),
        detail = json_build_object('unknown', v_unknown, 'known', v_known)::text;
    end if;

    -- Catalog order and catalog spelling. `known` is walked rather than the
    -- argument, which is also what collapses 'PS5' sent twice into one.
    select coalesce(array_agg(k.name order by k.ord), '{}') into v_played
    from unnest(v_known) with ordinality as k(name, ord)
    where exists (
      select 1 from unnest(p_platforms) as u(name)
      where lower(btrim(u.name)) = lower(k.name)
    );
  end if;

  insert into public.user_entries (user_id, media_item_id, played_platforms)
  values (v_uid, p_media_item_id, v_played)
  on conflict (user_id, media_item_id)
    do update set played_platforms = excluded.played_platforms
  returning * into v_entry;

  return v_entry;
end;
$$;

comment on function public.set_played_platforms(uuid, text[]) is
  'Set the platforms the caller played one game on, creating the entry if there is none. Names are matched to game_details.platforms ignoring case and stored in catalog spelling and order; an unknown name refuses the write with 22023 and a JSON DETAIL of {unknown, known}. An empty array clears the list. Returns the whole entry.';

revoke all on function public.set_played_platforms(uuid, text[]) from public, anon;

grant execute on function public.set_played_platforms(uuid, text[]) to authenticated, service_role;

-- 3. tier_list returns both platform lists -------------------------------------
-- Entry 4: the Ranking tab's platform filter offered Linux, Mac, and iOS,
-- because the only platforms a tier row carried were the catalog's. Each row
-- now carries the caller's two lists beside the catalog one: where it was
-- played (the filter's source once item 32 lands) and where it is owned (what
-- the filter falls back on for an entry with nothing recorded, and what the
-- rest of the app already shows).
--
-- The entry is a left join. A ranking outlives its entry by design (removing an
-- entry never unranks, see removeEntry in packages/api), so a ranked game with
-- no entry is a real row, and it comes back with both lists empty rather than
-- not at all. The join is on the ranking's own user id, which is auth.uid() by
-- the where clause, so it can only ever reach the caller's entry; RLS on
-- user_entries would hide anyone else's anyway.
--
-- Drop and create, as 20260916150000_tier_list_external_ids.sql had to, because
-- `create or replace` cannot change a `returns table`. The drop takes the
-- grants and the pinned search_path with it, so both are written again below
-- and both are asserted in the suite (item 17's lesson). The two new columns go
-- at the end, so every column a caller reads today keeps its place.

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
  platforms text[],
  played_platforms text[],
  owned_platforms text[]
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
    coalesce(e.played_platforms, '{}'::text[]),
    coalesce(e.owned_platforms, '{}'::text[])
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
  'The caller''s ranked items in one tier, best first, joined with catalog details. external_ids carries the Steam app id a cover falls back to; played_platforms and owned_platforms are the caller''s own lists from the entry, empty when nothing is recorded or the entry is gone.';

revoke all on function public.tier_list(public.medium, public.tier) from public, anon;
grant execute on function public.tier_list(public.medium, public.tier) to authenticated, service_role;
