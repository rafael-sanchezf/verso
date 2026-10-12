-- The ticketed date: user_entries.planned_on.
-- docs/design/movies-brief.md, "The states of a film" ("Going. A film on the
-- calendar can carry a date you are going ... a date, not a status") and
-- "Data model" ("Cleared by the trigger when a diary row lands on or after
-- it"); ROADMAP.md rule 37 (streaming and theaters are separate).
--
-- What it adds:
--
--   1. user_entries.planned_on, a date, null by default, written by the owner
--      through the existing owner-only policy like every other entry field.
--   2. The diary's two triggers from 20261008200000_watch_log.sql, restated
--      with the clearing: a diary row whose watched_on is on or after the
--      planned day clears it, whether the row is logged (before-write) or an
--      existing row's day is moved there (after-change). A row before the
--      planned day leaves it: an earlier watch at home does not cancel the
--      tickets.
--
-- Nothing else clears it. A planned day that passes with no diary row simply
-- drops off the calendar, which reads planned_on from today on; the app can
-- offer "Did you go?" from that, and nothing here guesses.
--
-- Same signatures, so `create or replace` keeps the triggers bound and the
-- grants as they were; the revokes are restated anyway.

-- ==============================================================================
-- 1. user_entries.planned_on
-- ==============================================================================

alter table public.user_entries
  add column planned_on date;

comment on column public.user_entries.planned_on is
  'The day the user is going to see this, the ticketed date of the movies Calendar ("Going Fri Oct 24"). A date, not a status; any status may carry one. Cleared by the diary''s triggers when a watch_log row lands on or after it; nothing else clears it.';

-- The calendar's read: this user's entries with a planned day from today on.
-- Partial, because almost every entry has none.
create index user_entries_user_planned_on
  on public.user_entries (user_id, planned_on)
  where planned_on is not null;

-- ==============================================================================
-- 2. The diary's triggers, with the clearing
-- ==============================================================================

-- 2a. watch_log_before_write ----------------------------------------------------
-- The body of 20261008200000_watch_log.sql, plus planned_on in the upsert's
-- update branch. A new entry has no planned day to clear.

create or replace function public.watch_log_before_write()
returns trigger
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_medium public.medium;
  v_latest date;
begin
  new.place := nullif(btrim(new.place), '');
  new.note := nullif(btrim(new.note), '');

  if tg_op <> 'INSERT' then
    return new;
  end if;

  if v_uid is not null and new.user_id is distinct from v_uid then
    raise exception using
      errcode = '42501',
      message = 'a diary row belongs to the user who writes it';
  end if;

  select m.medium into v_medium
  from public.media_items m
  where m.id = new.media_item_id;

  if v_medium is null then
    raise exception using
      errcode = '23503',
      message = format('media item %s is not in the catalog', new.media_item_id);
  end if;

  if v_medium <> 'movie' then
    raise exception using
      errcode = '22023',
      message = format('the diary is for films; media item %s is a %s', new.media_item_id, v_medium);
  end if;

  select greatest(new.watched_on, max(w.watched_on)) into v_latest
  from public.watch_log w
  where w.user_id = new.user_id
    and w.media_item_id = new.media_item_id;

  insert into public.user_entries (user_id, media_item_id, status, finished_at)
  values (new.user_id, new.media_item_id, 'played', v_latest)
  on conflict (user_id, media_item_id) do update
  set status = 'played',
      finished_at = excluded.finished_at,
      planned_on = case
        when public.user_entries.planned_on <= new.watched_on then null
        else public.user_entries.planned_on
      end;

  return new;
end;
$$;

comment on function public.watch_log_before_write() is
  'Trim a diary row''s place and note; on insert, refuse another user''s row and anything but a film, and upsert the writer''s entry as played with finished_at at the latest watched_on, clearing a planned_on the new watch is on or after.';

revoke all on function public.watch_log_before_write() from public, anon;

-- 2b. watch_log_after_change ----------------------------------------------------
-- The body of 20261008200000_watch_log.sql, plus the clearing when an edit
-- moves a row's day onto or past the planned day. Only an UPDATE can do that;
-- a delete never clears a plan.

create or replace function public.watch_log_after_change()
returns trigger
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_pair record;
begin
  for v_pair in
    select old.user_id as user_id, old.media_item_id as media_item_id
    union
    select new.user_id, new.media_item_id where tg_op = 'UPDATE'
  loop
    update public.user_entries e
    set finished_at = latest.watched_on
    from (
      select max(w.watched_on) as watched_on
      from public.watch_log w
      where w.user_id = v_pair.user_id
        and w.media_item_id = v_pair.media_item_id
    ) latest
    where e.user_id = v_pair.user_id
      and e.media_item_id = v_pair.media_item_id
      and e.finished_at is distinct from latest.watched_on;
  end loop;

  if tg_op = 'UPDATE' then
    update public.user_entries e
    set planned_on = null
    where e.user_id = new.user_id
      and e.media_item_id = new.media_item_id
      and e.planned_on <= new.watched_on;
  end if;

  return null;
end;
$$;

comment on function public.watch_log_after_change() is
  'Put user_entries.finished_at back in step with the diary after a row''s day changes or a row is deleted (the latest watched_on left, or null), and clear a planned_on an edited day is on or after. Never changes status.';

revoke all on function public.watch_log_after_change() from public, anon;
