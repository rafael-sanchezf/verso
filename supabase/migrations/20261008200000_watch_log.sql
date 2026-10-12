-- The diary: one row each time a film was watched.
-- docs/design/movies-brief.md, "The log sheet", "The states of a film" and
-- "Data model"; ROADMAP.md, V0's Movies bullet and wave B.
--
-- Rafa's rules of 2026-09-22 this table carries: watched is not ranked (rule
-- 35), the diary is the entry (a date, an optional place, an optional note),
-- and rewatches are normal, so a film can have many rows. Ranking stays where
-- it is, in ranking_entries; nothing here reads or writes it.
--
-- What it adds, in file order:
--
--   1. watch_log, owner-only from this first migration.
--   2. watch_log_before_write, BEFORE INSERT OR UPDATE: trims place and note
--      (blank is null, as setNotes stores the games note), and on insert
--      refuses a writer who is not the row's user and a media item that is not
--      a film, then upserts the caller's entry with status played and
--      finished_at set to the latest watched_on including the new row. A film
--      nobody tracked yet gets its entry here, so "I watched this" from Search
--      is one write.
--   3. watch_log_after_change, AFTER UPDATE OF watched_on OR DELETE: puts
--      finished_at back in step with the rows that remain.
--
-- finished_at mirrors the diary: it is always the latest watched_on of the
-- caller's rows for that film, or null once the last row is deleted. It is
-- mirrored rather than read from here because every read that already shows a
-- finished date (the export, the drain's order, the Profile counts) reads the
-- entry. Status is never moved back when a row is deleted: a film can be
-- watched with no diary row (the deck's "Seen before Verso"), so removing a
-- row says nothing about whether it was watched.
--
-- Films only for now. TV is held until its ranking unit is decided (rule 38),
-- and a game is played, not watched. Widening it is one line in the trigger.
--
-- The diary does not hang off user_entries: removing an entry (removeEntry)
-- leaves its diary rows, the way it leaves the ranking and the comparison log,
-- and the next row logged recreates the entry.
--
-- Errors raised here use the SQLSTATEs the earlier files use, following the
-- legend in 20260915130000_ranking_functions.sql:
--   22023  the media item is not a film
--   23503  the media item is not in the catalog
--   42501  a row written for another user

-- ==============================================================================
-- 1. watch_log
-- ==============================================================================
--
-- user_id defaults to auth.uid() and is not in the insert grant, as on events:
-- a client names the film and the day, never the user. media_item_id is in the
-- insert grant and not the update grant, so a row cannot be moved to another
-- film after the fact, which is what keeps the finished_at mirror of both films
-- right without a trigger that follows a row across items.
--
-- place is free text by the brief: a provider's name as the log sheet's chip
-- showed it ("Netflix"), 'theater', 'other', or null. A name rather than a
-- provider id, so the row still reads right after the directory renames a
-- service. watched_on has no default: the app sends the day where the user is
-- standing (todayLocal in packages/api), because the database's current_date
-- is UTC and would log yesterday every evening west of Greenwich.

create table public.watch_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  media_item_id uuid not null references public.media_items (id) on delete cascade,
  watched_on date not null,
  place text
    constraint watch_log_place_check check (place is null or char_length(place) between 1 and 100),
  note text,
  created_at timestamptz not null default now()
);

comment on table public.watch_log is
  'The diary: one row each time the user watched a film (date, optional place, optional note). The first row marks the entry played; user_entries.finished_at mirrors the latest watched_on. Owner-only. Never ranks anything.';
comment on column public.watch_log.id is 'The diary row.';
comment on column public.watch_log.user_id is 'Whose diary. Defaults to auth.uid() and is not in the insert grant; the policy refuses anyone else.';
comment on column public.watch_log.media_item_id is 'The film. Not updatable by the owner, so a row never moves between films.';
comment on column public.watch_log.watched_on is 'The day it was watched, where the user is (the app sends its local date). The diary''s order and the finished_at mirror read it.';
comment on column public.watch_log.place is 'Where: a streaming service''s name as the log sheet showed it, theater, other, or null. Trimmed; blank is null.';
comment on column public.watch_log.note is 'What stood out, optional. Trimmed; blank is null. For films the note lives here, not on user_entries.notes.';
comment on column public.watch_log.created_at is 'When the row was written. The tie-break after watched_on, so two watches on one day keep the order they were logged in.';

-- The film's own rows ("Watched 2x · last Sep 2", and the mirror's max()), and
-- the diary as a list, newest first.
create index watch_log_user_item_watched
  on public.watch_log (user_id, media_item_id, watched_on desc);
create index watch_log_user_watched
  on public.watch_log (user_id, watched_on desc, created_at desc);

alter table public.watch_log enable row level security;

create policy "users manage their own diary" on public.watch_log
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.watch_log from anon, authenticated;
grant select, delete on public.watch_log to authenticated;
grant insert (media_item_id, watched_on, place, note) on public.watch_log to authenticated;
grant update (watched_on, place, note) on public.watch_log to authenticated;

-- ==============================================================================
-- 2. watch_log_before_write
-- ==============================================================================
--
-- BEFORE, so the trims land in the same tuple and the place check sees the
-- trimmed value, and so the entry is written in the same statement as the row:
-- if the row is then refused (its policy, its check), the entry write rolls
-- back with it. Security invoker: the entry upsert goes through the owner-only
-- policy on user_entries like any other writer's.
--
-- The writer check comes first so that a row naming someone else is refused
-- with a sentence about the diary, rather than with the user_entries policy's
-- refusal of the upsert below. auth.uid() is null for the service role and the
-- migration owner, who bypass RLS and may write any user's diary (an import).
--
-- The upsert sets status played whatever it was (want to watch, dropped), and
-- finished_at to the latest day across the caller's rows for the film plus this
-- one. The new row is not in the table yet, which is why it is folded in by
-- greatest() rather than read back.

create function public.watch_log_before_write()
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
      finished_at = excluded.finished_at;

  return new;
end;
$$;

comment on function public.watch_log_before_write() is
  'Trim a diary row''s place and note; on insert, refuse another user''s row and anything but a film, and upsert the writer''s entry as played with finished_at at the latest watched_on.';

create trigger watch_log_before_write
  before insert or update on public.watch_log
  for each row execute function public.watch_log_before_write();

revoke all on function public.watch_log_before_write() from public, anon;

-- ==============================================================================
-- 3. watch_log_after_change
-- ==============================================================================
--
-- AFTER, because the rows that remain are what the mirror is read from, and
-- they are only visible once the change has happened. Fires on a change of
-- watched_on and on delete; a change of place or note moves nothing. Both the
-- old and the new film are recomputed, which is one film for every write a
-- client can make (media_item_id is not in its update grant) and two only for
-- the service role.
--
-- An entry that is gone (removed by the user, or going with the account in
-- the same cascade) matches no row and nothing is written. The is distinct
-- from guard skips a write that would change nothing, which is most deletes of
-- an older watch.

create function public.watch_log_after_change()
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

  return null;
end;
$$;

comment on function public.watch_log_after_change() is
  'Put user_entries.finished_at back in step with the diary after a row''s day changes or a row is deleted: the latest watched_on left, or null when none is. Never changes status.';

create trigger watch_log_after_change
  after update of watched_on or delete on public.watch_log
  for each row execute function public.watch_log_after_change();

revoke all on function public.watch_log_after_change() from public, anon;
