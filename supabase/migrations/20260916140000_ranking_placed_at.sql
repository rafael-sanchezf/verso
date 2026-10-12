-- placed_at on ranking_entries: when the user put this game where it is, as
-- opposed to when the row was last written.
--
-- The ranking functions in 20260915130000_ranking_functions.sql stamp
-- `updated_at` on every row they touch, and placing a game in the middle of a
-- tier shifts everything below it down one slot. Those shifted rows are not
-- activity: the user ranked one game, not eleven. Profile's recent activity
-- list read `updated_at` because it was the only column there was, so a single
-- insert near the top of a full tier could push a week of real placements out
-- of the list (work queue item 12, and the note above `recentRankings` in
-- packages/api/src/profile.ts).
--
-- So: one column that only a placement writes.
--
--   insert_ranking_entry   stamps it, and with it finish_insertion, which
--                          places through insert_ranking_entry
--   move_ranking_entry     never touches it -- a drag, a nudge, or a change of
--                          tier moves the game, it does not re-place it
--   the position shifts    never touch it, which is the whole point
--
-- Re-ranking a game after removing it is a new placement: remove_ranking_entry
-- deletes the row, and the insert that follows writes a fresh placed_at.
--
-- No index. A user's ranked list is hundreds of rows at most, all of them
-- behind `user_id` in the primary key, so the ordered read that wants this
-- column sorts a handful of rows it was already fetching.

alter table public.ranking_entries
  add column placed_at timestamptz not null default now();

-- Existing rows: the best available answer is the timestamp they already
-- carry. It is exact for every ranking that was never shifted, and no worse
-- than what the recent-activity list was showing before this migration.
update public.ranking_entries set placed_at = updated_at;

comment on column public.ranking_entries.placed_at is
  'When the user placed this item: written on insert, never by a move or by the position shifts a neighbour''s insert causes. Use it for "recently ranked"; updated_at is the last write of any kind.';

-- insert_ranking_entry --------------------------------------------------------
-- Unchanged except for the explicit placed_at on the insert. It is what the
-- column default would do anyway; spelling it out keeps the one statement that
-- is allowed to write it visible next to the shift above it, which is not.

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

  -- The shift. These rows are being moved out of the way, not placed, so
  -- placed_at is deliberately absent from the set list.
  update public.ranking_entries r
  set position = r.position + 1,
      updated_at = now()
  where r.user_id = v_uid
    and r.medium = p_medium
    and r.tier = p_tier
    and r.position >= v_position;

  insert into public.ranking_entries (user_id, medium, tier, media_item_id, position, placed_at)
  values (v_uid, p_medium, p_tier, p_media_item_id, v_position, now());

  return v_position;
end;
$$;

comment on function public.insert_ranking_entry(uuid, public.medium, public.tier, integer) is
  'Insert a ranked item at a position in the caller''s tier, shifting later items down and stamping placed_at on the new row only. Returns the position used.';

-- move_ranking_entry ----------------------------------------------------------
-- Not redefined. Its three update statements set position, tier, and
-- updated_at, and none of them names placed_at, so a move already leaves the
-- placement date alone. The pgTAP suite pins that behaviour rather than
-- trusting the reading.
