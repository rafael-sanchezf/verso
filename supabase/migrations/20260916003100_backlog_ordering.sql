-- User-ordered backlog positions.
--
-- docs/design/ui-principles.md rule 11, "Order belongs to the user": lists that
-- represent intent are user-ordered by drag, with the app's sort as a starting
-- point only. docs/design/ui-brief.md makes that concrete for the Next tab:
-- Backlog is user-ordered by long-press drag and the drag handle is essential,
-- while Upcoming (a backlog entry whose release_date is still ahead) is ordered
-- by that date and is not user-ordered. So the order is one integer on the
-- entry, and Upcoming simply ignores it.
--
-- The backlog never touches ranking (CLAUDE.md). This migration adds nothing to
-- ranking_entries and reads nothing from it; `backlog_position` and
-- `ranking_entries.position` are unrelated numbers that happen to share a name.
--
-- Three pieces:
--   1. user_entries.backlog_position, meaningful only while status = 'backlog';
--   2. a trigger, so the app never sends a position: appending and clearing are
--      the database's job;
--   3. move_backlog_entry(), the drag handle's one RPC, which renumbers the
--      caller's backlog densely in a single transaction.
--
-- Errors raised here use these SQLSTATEs, following the legend in
-- 20260915130000_ranking_functions.sql:
--   P0002  the entry is not the caller's, or is not in their backlog
--   28000  no authenticated user

-- 1. The column ----------------------------------------------------------------
-- Nullable, because it is meaningful only while the entry is in the backlog:
-- null is "this entry has no place in the queue", which is the truth for a
-- Playing, Played, or Dropped entry. The trigger below keeps that in step with
-- status so no caller has to.
--
-- The check is written the long way (`is null or >= 0`) to match
-- playtime_minutes and the time-to-beat triple; a bare `>= 0` would also admit
-- null, but stating it makes the intent readable at the point of definition.

alter table public.user_entries
  add column backlog_position integer
    check (backlog_position is null or backlog_position >= 0);

comment on column public.user_entries.backlog_position is
  'The user''s own order for this entry in their backlog, 0 first. Null unless status = ''backlog''. Maintained by trigger and by move_backlog_entry; gaps are allowed, so read the list ordered by (backlog_position, added_at).';

-- Backfill ---------------------------------------------------------------------
-- `add column` leaves every existing row null, backlog rows included, and the
-- trigger below only fires on writes from here on. Without this, every backlog
-- entry that already exists would sit outside the index and outside the order
-- until someone happened to touch it.
--
-- The seed order is `added_at`, which is the app's current sort and, per rule
-- 11, is a starting point only: the first drag replaces it. Ties break on id so
-- the result is deterministic. Partitioned by user_id, so each user is numbered
-- from 0 against their own backlog and never against anyone else's.
--
-- This runs before the unique index is created and before the trigger exists,
-- so nothing interferes with it; it runs as the migration owner, so it covers
-- every user's rows rather than one caller's.

update public.user_entries e
set backlog_position = t.backlog_position
from (
  select
    b.id,
    (row_number() over (partition by b.user_id order by b.added_at asc, b.id asc))::integer - 1
      as backlog_position
  from public.user_entries b
  where b.status = 'backlog'
) t
where e.id = t.id;

-- The uniqueness rule, as a partial unique index -------------------------------
-- Partial, so the many null positions on Playing/Played/Dropped entries cost
-- nothing and do not collide (null is never equal to null, but the predicate
-- keeps them out of the index entirely).
--
-- Unlike ranking_entries' `unique (user_id, medium, tier, position) deferrable
-- initially deferred`, this one cannot be deferred: a unique *constraint* can be
-- deferrable but cannot be partial, and a partial unique *index* cannot be
-- deferred. That is a deliberate trade. Partial wins because it is also the
-- index the backlog is read through, and because deferral only buys the right
-- to pass through duplicate states mid-transaction -- which move_backlog_entry
-- avoids by construction instead, by parking every row above the occupied range
-- before it assigns final positions (see the two phases below).
--
-- Leading with user_id makes it the index for "this user's backlog in order"
-- and for the trigger's max() probe, so it earns its keep as more than a
-- constraint. Positions are per user: two users both having a position 0 is the
-- normal case, never a conflict.

create unique index user_entries_backlog_position_uniq
  on public.user_entries (user_id, backlog_position)
  where backlog_position is not null;

-- 2. The trigger ---------------------------------------------------------------
-- Two rules, so that adding to the backlog stays a one-column write from the
-- app's point of view ("set status = 'backlog'") and nothing client-side ever
-- computes a position:
--
--   1. an entry that is in the backlog with no position gets max + 1 for that
--      user, or 0 when it is the first. That covers both paths the app has:
--      inserted straight into 'backlog', and updated into 'backlog' from
--      another status (where rule 2 had already cleared the old position).
--      A position the caller supplied explicitly is left alone, which is what
--      makes a restore-from-backup or a future bulk reorder possible.
--   2. an entry that is not in the backlog has no position, whatever the caller
--      passed. Leaving 'backlog' frees the slot.
--
-- Rule 1 is a standing rule rather than a transition guard (unlike
-- stamp_started_at, which deliberately respects a hand-cleared date): a backlog
-- row with no position has no meaning to preserve, and the invariant "every
-- backlog row has a position" is what lets move_backlog_entry renumber the list
-- without a null case and the index above cover the whole list.
--
-- New positions are appended, never prepended, because the app's sort is only a
-- starting point (rule 11): a new entry joins the end of the queue and the user
-- drags it where they want it.
--
-- BEFORE, so the value lands in the same tuple rather than costing a second
-- write, and so it composes with RLS: the row still has to pass the owner-only
-- policy on user_entries. The max() is scoped to new.user_id, so an entry can
-- never be numbered against another user's backlog. Two concurrent appends can
-- compute the same max + 1; the unique index above turns that into a 23505 on
-- one of them rather than a silent duplicate, which is the correct outcome for
-- a race the user can simply repeat.

create or replace function public.set_backlog_position()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_max integer;
begin
  if new.status <> 'backlog' then
    new.backlog_position := null;
    return new;
  end if;

  if new.backlog_position is null then
    select max(e.backlog_position) into v_max
    from public.user_entries e
    where e.user_id = new.user_id
      and e.backlog_position is not null;

    new.backlog_position := coalesce(v_max + 1, 0);
  end if;

  return new;
end;
$$;

comment on function public.set_backlog_position() is
  'Keep user_entries.backlog_position in step with status: append a backlog entry that has no position to the end of the user''s backlog, and clear the position of an entry that is not in the backlog.';

create trigger user_entries_set_backlog_position
  before insert or update on public.user_entries
  for each row execute function public.set_backlog_position();

-- A trigger function returning `trigger` cannot be called directly and is not
-- exposed by PostgREST, and Postgres checks execute permission at CREATE
-- TRIGGER time rather than at fire time, so this narrows the surface without
-- affecting the trigger. Same reasoning as stamp_started_at.
revoke all on function public.set_backlog_position() from public, anon;

-- 3. move_backlog_entry --------------------------------------------------------
-- The long-press drag handle's one call. Like the ranking RPCs it is
-- `security invoker` with no user id parameter, so Row Level Security is still
-- the boundary and a caller cannot name someone else's row; every statement is
-- additionally scoped to auth.uid() so the intent is on the page.
--
-- Out-of-range positions are CLAMPED, not rejected, exactly as
-- move_ranking_entry clamps: a drag cannot express an invalid position, so an
-- out-of-range argument means a stale client, and dropping the item at the
-- nearest end is what the user saw happen. A null position appends, matching
-- move_ranking_entry's `coalesce(p_position, v_count)`.
--
-- The whole backlog is renumbered densely, so the gaps that removals leave are
-- closed by the next drag and positions stay small. That is why this takes one
-- entry and not a whole ordering: the client sends the one row the finger moved
-- and the database derives the rest, so two devices dragging different rows
-- cannot overwrite each other's list wholesale.
--
-- Two phases, because the partial unique index is checked immediately:
--
--   phase 1 parks every backlog row at offset + its current position, where
--           offset is one past the highest position in use. Each row moves to a
--           value nothing holds, so no intermediate state ever collides, and
--           the relative order is preserved because the shift is constant.
--   phase 2 assigns the final 0..n-1 from that parked order, splicing the moved
--           entry in at its new index. Every final value is below offset while
--           every row not yet updated is at or above it, so again nothing
--           collides.
--
-- Both phases run under the same transaction as the caller's rpc() call, so the
-- list is never observably half-renumbered.

create or replace function public.move_backlog_entry(
  p_entry_id uuid,
  p_new_position integer
)
returns integer
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_status public.entry_status;
  v_count integer;
  v_offset integer;
  v_position integer;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'move_backlog_entry requires an authenticated user';
  end if;

  select e.status into v_status
  from public.user_entries e
  where e.id = p_entry_id and e.user_id = v_uid;

  -- Not found covers both "no such entry" and "not yours": RLS has already
  -- hidden another user's row, so the caller cannot tell the two apart, which
  -- is the point.
  if not found then
    raise exception using
      errcode = 'P0002',
      message = format('entry %s is not one of your entries', p_entry_id);
  end if;

  if v_status <> 'backlog' then
    raise exception using
      errcode = 'P0002',
      message = format('entry %s is %s, not in the backlog', p_entry_id, v_status);
  end if;

  -- The number of *other* backlog entries, so the highest legal target index is
  -- v_count and the clamp reads the same as move_ranking_entry's.
  select count(*) into v_count
  from public.user_entries e
  where e.user_id = v_uid
    and e.status = 'backlog'
    and e.id <> p_entry_id;

  v_position := least(greatest(coalesce(p_new_position, v_count), 0), v_count);

  -- One past the highest position this user holds. The coalesce cannot fire
  -- while the invariant holds (the entry we just found is in the backlog, so it
  -- has a position), but a null offset would null every position and send the
  -- rows straight back through the trigger, so it is worth the three words.
  select coalesce(max(e.backlog_position) + 1, 1) into v_offset
  from public.user_entries e
  where e.user_id = v_uid
    and e.backlog_position is not null;

  -- Phase 1: park the list above every position in use.
  update public.user_entries e
  set backlog_position = e.backlog_position + v_offset
  where e.user_id = v_uid
    and e.status = 'backlog';

  -- Phase 2: renumber densely, with the moved entry spliced in at v_position.
  update public.user_entries e
  set backlog_position = t.new_position
  from (
    select o.id,
           case when o.old_rank < v_position then o.old_rank else o.old_rank + 1 end
             as new_position
    from (
      select e2.id,
             (row_number() over (
                order by e2.backlog_position asc nulls last, e2.added_at asc, e2.id asc
              ))::integer - 1 as old_rank
      from public.user_entries e2
      where e2.user_id = v_uid
        and e2.status = 'backlog'
        and e2.id <> p_entry_id
    ) o
    union all
    select p_entry_id, v_position
  ) t
  where e.id = t.id
    and e.user_id = v_uid;

  return v_position;
end;
$$;

comment on function public.move_backlog_entry(uuid, integer) is
  'Move one of the caller''s backlog entries to a new position, renumbering their backlog densely in one transaction. Out-of-range positions are clamped; null appends. Returns the position used.';

-- Grants -----------------------------------------------------------------------
-- Signed-in users only, matching the ranking RPCs. RLS inside the function is
-- what actually protects the rows; this keeps it off the anonymous surface.

revoke all on function public.move_backlog_entry(uuid, integer) from public, anon;

grant execute on function public.move_backlog_entry(uuid, integer) to authenticated, service_role;
