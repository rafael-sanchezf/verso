-- Ownership, full release dates, and personal fields.
-- ROADMAP.md work queue item 6, as revised 2026-09-15.
--
-- The shape of the Next tab decides this migration. From
-- docs/design/ui-brief.md, "Round 3 reactions": Backlog holds every released
-- game you intend to play, owned or not, and Upcoming holds the unreleased
-- ones. Those are one status and a date comparison, not two statuses, so:
--
--   * `entry_status` is untouched. No wishlist value. "Upcoming" is derived at
--     read time as `status = 'backlog' and release_date > current_date`, which
--     means a game moves out of Upcoming on its release day with no write.
--   * `media_items` gains a full `release_date`, because a year cannot answer
--     "has this come out yet". `year` stays for display (ui-principles rule 9:
--     show what you know) and both come from IGDB's `first_release_date`.
--   * Ownership is its own fact (ui-principles rule 19), independent of
--     status: you can own a gift you will never start, and want a game you do
--     not own. So it is a column on the entry, not a status value.

-- 1. media_items.release_date -------------------------------------------------
-- Filled by packages/catalog from IGDB's `first_release_date` (unix seconds,
-- read in UTC so the mirror produces the same date on a laptop in New York and
-- on a GitHub runner). Nullable: IGDB omits the field for announced games with
-- no date, and "we do not know" must stay distinguishable from a guess.

alter table public.media_items
  add column release_date date;

comment on column public.media_items.release_date is
  'First release date from IGDB, read in UTC. Null when the source has no date. `year` is the display form of the same fact.';

-- "Coming up" on Home and the Upcoming segment on Next both scan one medium
-- ordered by date, so the index leads with medium and carries the date.
create index media_items_medium_release_date
  on public.media_items (medium, release_date);

-- 2. user_entries.owned_platforms ---------------------------------------------
-- Empty means not owned, which is the default, so ownership needs no backfill
-- and no null check anywhere.
--
-- The values are platform name strings exactly as `game_details.platforms`
-- stores them (IGDB's platform names, e.g. 'Nintendo Switch'), so the game
-- page can render every platform a game is on and tick the ones you own it on
-- by intersecting two text[] with no lookup table. That couples us to IGDB's
-- spelling; the alternative, a platform dimension table, is not worth it until
-- a second catalog source exists.

alter table public.user_entries
  add column owned_platforms text[] not null default '{}';

comment on column public.user_entries.owned_platforms is
  'Platforms the user owns this on, as the names in game_details.platforms. Empty means not owned. Independent of status.';

-- 3. user_entries.started_at --------------------------------------------------
-- When the user started playing. Set by trigger the first time the entry
-- becomes `playing`, and hand-editable forever after (docs/design/
-- ui-principles.md, "Data honesty": playtime, started date, and purchased date
-- are always enterable by hand).

alter table public.user_entries
  add column started_at timestamptz;

comment on column public.user_entries.started_at is
  'When the user started playing. Stamped by trigger on the first move to `playing`; always hand-editable and never overwritten after that.';

-- 4. user_entries.purchased_at ------------------------------------------------
-- Hand-entered only. No automation: no source we have knows when you bought a
-- game. A date rather than a timestamp, because nobody remembers the hour.

alter table public.user_entries
  add column purchased_at date;

comment on column public.user_entries.purchased_at is
  'When the user bought this. Hand-entered only; nothing writes it automatically.';

-- 5. The started_at trigger ---------------------------------------------------
-- Three properties, in the order they are tested in
-- supabase/tests/ownership_release_dates.test.sql:
--
--   1. the first move to `playing` stamps now(), on insert or on update;
--   2. a value already there is never overwritten, whoever wrote it;
--   3. no other status ever sets it.
--
-- The `old.status is distinct from 'playing'` guard is what makes it a
-- transition rather than a standing rule. Without it, a user who deliberately
-- clears the date on a game they are playing would have it re-stamped by the
-- next unrelated edit, which is property 2 in spirit even though the column is
-- null at that instant.
--
-- BEFORE, so the value is written in the same tuple rather than costing a
-- second write, and so it composes with RLS: the row still has to pass the
-- owner-only policy on user_entries.

create or replace function public.stamp_started_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'playing'
     and new.started_at is null
     and (tg_op = 'INSERT' or old.status is distinct from 'playing')
  then
    new.started_at := now();
  end if;

  return new;
end;
$$;

comment on function public.stamp_started_at() is
  'Stamp user_entries.started_at with now() the first time an entry becomes `playing`, never overwriting an existing value.';

create trigger user_entries_stamp_started_at
  before insert or update on public.user_entries
  for each row execute function public.stamp_started_at();

-- A trigger function returning `trigger` cannot be called directly and is not
-- exposed by PostgREST, and Postgres checks execute permission at CREATE
-- TRIGGER time rather than at fire time, so this narrows the surface without
-- affecting the trigger.
revoke all on function public.stamp_started_at() from public, anon;

-- 6. game_details time to beat ------------------------------------------------
-- IGDB's `game_time_to_beats` endpoint returns three averages per game, all in
-- seconds: `hastily` (to the credits), `normally` (credits plus some extras),
-- and `completely` (100%). Confirmed against the endpoint 2026-09-15; see
-- packages/catalog/src/igdb.ts.
--
-- Three columns rather than a jsonb blob because the backlog sorts and filters
-- on them ("what can I finish this weekend", ROADMAP V1), and the game page
-- shows one figure with the other two behind a tap.
--
-- The single `time_to_beat_seconds` column from the core schema is dropped,
-- not renamed: nothing ever read it (no catalog writer, no RPC, no app code),
-- it was always null in every row, and leaving it would make "which of these
-- four is the one to show" a question the app has to answer.

alter table public.game_details
  drop column time_to_beat_seconds;

alter table public.game_details
  add column time_to_beat_hastily_seconds integer
    check (time_to_beat_hastily_seconds is null or time_to_beat_hastily_seconds >= 0),
  add column time_to_beat_normally_seconds integer
    check (time_to_beat_normally_seconds is null or time_to_beat_normally_seconds >= 0),
  add column time_to_beat_completely_seconds integer
    check (time_to_beat_completely_seconds is null or time_to_beat_completely_seconds >= 0);

comment on column public.game_details.time_to_beat_hastily_seconds is
  'IGDB average seconds to reach the credits without notable extras.';
comment on column public.game_details.time_to_beat_normally_seconds is
  'IGDB average seconds to finish while mixing in some extras. The single figure the game page shows.';
comment on column public.game_details.time_to_beat_completely_seconds is
  'IGDB average seconds to reach 100% completion.';
