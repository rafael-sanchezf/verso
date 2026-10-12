-- The two halves of the V3 prerequisite the medium filter left open.
--
-- ROADMAP.md, "After V0" and the V3 list: the reads and counts in
-- `packages/api` already take a medium and default to 'game' (work queue item
-- 23), but two things underneath them still assume there is only one medium in
-- the database. This migration closes both.
--
-- Part A, the backlog. `backlog_position` is numbered per user across every
-- medium, so a film in the backlog occupies a number in the games' sequence.
-- The read in views.ts filters by medium and the drag handle sends an index
-- counted inside that filtered list, which is safe only while every backlog row
-- is a game. From here the number is per user and per medium, which is what the
-- two lists have always meant.
--
-- Part B, the two catalog RPCs. `search_games` and `popular_games` hardcode
-- `medium = 'game'` and take no medium at all, so a film mirror would be
-- invisible to Search and to the signed-out wall. Both grow a `p_medium`
-- argument with a default of 'game', so every existing caller keeps working
-- without a change.
--
-- Both functions keep their names. `search_games` searches any medium now and
-- `popular_games` returns films, which makes the names a little narrow, but the
-- names are in the app, in the specs and in `database.types.ts`, and renaming a
-- PostgREST function is a change to every caller rather than to this file.
-- A rename is its own piece of work if it is ever worth doing.
--
-- Errors raised here use the SQLSTATEs the earlier files use, following the
-- legend in 20260915130000_ranking_functions.sql:
--   P0002  the entry is not the caller's, or is not in their backlog
--   23503  the entry names a media item the catalog does not have
--   28000  no authenticated user

-- ==============================================================================
-- Part A: the backlog is numbered per medium
-- ==============================================================================

-- A1. user_entries.medium ------------------------------------------------------
-- The medium of an entry is already a fact about the catalog row it points at,
-- so this column is derived and never chosen: the trigger below fills it from
-- `media_items` on every write. It is stored rather than joined because the
-- unique index and the trigger's max() probe both need it on this table, and an
-- index cannot reach across a join.
--
-- Nullable to begin with, because every existing row has to be given a value
-- before `not null` can be true of the table.

alter table public.user_entries
  add column medium public.medium;

-- The backfill. Every entry points at exactly one catalog row, and
-- `media_item_id` is `not null` with a foreign key, so this reaches every row
-- and leaves none null. It runs as the migration owner, so it covers every
-- user's entries rather than one caller's.

update public.user_entries e
set medium = m.medium
from public.media_items m
where m.id = e.media_item_id;

alter table public.user_entries
  alter column medium set not null;

-- The default is not the value any row ends up with. The trigger below assigns
-- from the catalog row on every insert and every update, and BEFORE row
-- triggers run ahead of the not-null check, so a write that names no medium
-- lands correctly with or without this line.
--
-- It is here for the callers. A not-null column with no default is a column
-- PostgREST reports as required, which `supabase gen types typescript` turns
-- into a required field on every insert into user_entries, which would make
-- `setStatus(client, id, 'playing')` name a column the caller is explicitly not
-- allowed to choose. Adding to the backlog stays a one-column write from the
-- app's point of view, which is the same promise backlog_position makes.
alter table public.user_entries
  alter column medium set default 'game';

comment on column public.user_entries.medium is
  'Which medium this entry is, copied from the media_items row it points at. Derived and never chosen by the caller: the user_entries_derive_medium trigger sets it on every insert and update, so a client that sends the wrong value has it corrected rather than refused. It is stored on the entry so that the backlog''s unique index and its per-medium numbering can be indexed at all.';

-- A2. The trigger that derives it ----------------------------------------------
-- Unconditional, on insert and on update alike. That covers the three cases
-- that matter and costs one primary key lookup per write: a new entry, an entry
-- whose `media_item_id` was repointed at another catalog row, and a client that
-- sent a medium of its own. The third is the reason this is an assignment and
-- not a check: the value is not the caller's to supply, so the correct response
-- to a wrong one is to overwrite it, not to fail the write.
--
-- BEFORE, so the value lands in the same tuple rather than costing a second
-- write, and so the row still has to pass the owner-only policy on
-- user_entries. Security invoker for the same reason: the select against
-- media_items goes through the catalog's own read policy, which every signed-in
-- user satisfies.
--
-- A media item that cannot be found is raised as 23503 rather than left to the
-- `not null` constraint. The foreign key on `media_item_id` would catch it too,
-- but foreign keys are checked at the end of the statement, so without this the
-- caller would see a confusing not-null violation on a column they never wrote
-- instead of the missing row they did write.

create or replace function public.set_entry_medium()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_medium public.medium;
begin
  select m.medium into v_medium
  from public.media_items m
  where m.id = new.media_item_id;

  if v_medium is null then
    raise exception using
      errcode = '23503',
      message = format('media item %s is not in the catalog', new.media_item_id);
  end if;

  new.medium := v_medium;
  return new;
end;
$$;

comment on function public.set_entry_medium() is
  'Copy media_items.medium onto the entry being written, whatever the caller sent. Fires before set_backlog_position, which numbers the backlog within that medium.';

-- The name is load bearing. Triggers on the same table for the same event fire
-- in alphabetical order, and set_backlog_position reads `new.medium` to decide
-- which sequence to append to, so this one has to fire first.
-- "user_entries_derive_medium" sorts before "user_entries_set_backlog_position"
-- (d before s) and before "user_entries_stamp_started_at". Renaming either one
-- to something that sorts differently would silently number new backlog entries
-- against a null medium, so do not rename one without the other.
--
-- This is now the third BEFORE trigger on user_entries. Like the other two it
-- no-ops in effect for an update that changes neither status nor the catalog row
-- it points at: it writes back the value the row already holds.

create trigger user_entries_derive_medium
  before insert or update on public.user_entries
  for each row execute function public.set_entry_medium();

-- A trigger function returning `trigger` cannot be called directly and is not
-- exposed by PostgREST, and Postgres checks execute permission at CREATE
-- TRIGGER time rather than at fire time, so this narrows the surface without
-- affecting the trigger. Same reasoning as set_backlog_position.
revoke all on function public.set_entry_medium() from public, anon;

-- A3. The uniqueness rule, now per medium --------------------------------------
-- The old index was on (user_id, backlog_position): one sequence per user,
-- whatever the entry was. The new one adds the medium in second place, so each
-- user holds one 0-based sequence per medium and a film at position 0 is no
-- longer in the way of a game at position 0.
--
-- Leading with (user_id, medium) makes it the index for "this user's backlog in
-- this medium, in order" and for the trigger's max() probe, exactly as the old
-- one served the unfiltered list. It is still partial and still cannot be
-- deferred, for the reasons the old file gives at length: a unique constraint
-- can be deferrable but cannot be partial, and a partial unique index cannot be
-- deferred. move_backlog_entry's two-phase renumber is what pays for that, and
-- it still is.
--
-- The name changes with the definition. An index called
-- user_entries_backlog_position_uniq that is not the index that file created is
-- worse than no name at all, and a test can assert the old one is gone.

drop index public.user_entries_backlog_position_uniq;

-- A4. Renumber what is already there -------------------------------------------
-- Dense 0-based numbering per (user_id, medium), keeping the order the user
-- already sees: `backlog_position` first, then `added_at`, then id, which is
-- exactly the ordering `backlog()` reads by and the ordering move_backlog_entry
-- rebuilds from. A database whose backlog is all games therefore comes out of
-- this with the list it went in with. Any second-medium rows that exist are
-- pulled out of the shared sequence and given their own, starting at 0.
--
-- This runs between the drop above and the create below, and that is not an
-- accident. A dense compaction is not safe under an immediate unique index: the
-- rows are updated in no particular order, so a row moving to position 2 can
-- meet a row that still holds 2 and has not been renumbered yet. With no unique
-- index in force for the length of one statement there is no intermediate state
-- to collide with, and the final state is unique by construction.
--
-- The two BEFORE triggers that already exist do not interfere. set_backlog_
-- position only assigns when the position is null, and these are not null;
-- stamp_started_at only fires on a move into 'playing', and status is untouched.

update public.user_entries e
set backlog_position = t.backlog_position
from (
  select
    b.id,
    (row_number() over (
       partition by b.user_id, b.medium
       order by b.backlog_position asc nulls last, b.added_at asc, b.id asc
     ))::integer - 1 as backlog_position
  from public.user_entries b
  where b.status = 'backlog'
) t
where e.id = t.id;

create unique index user_entries_medium_backlog_position_uniq
  on public.user_entries (user_id, medium, backlog_position)
  where backlog_position is not null;

-- A5. Should there be an index on (user_id, medium, status)? -------------------
-- Decided: no, not yet, and the reason is worth recording so the question is
-- not reopened by inspection of the column list alone.
--
-- The reads that look like they would use one are `playing`, `backlog`,
-- `upcoming`, `upNext` and `comingUp` in packages/api/src/views.ts, and the six
-- counts in profile.ts. Every one of them filters the medium through the
-- `media_items!inner` join it already needs for the title and the cover, not
-- through this column, so the planner never sees a predicate on
-- `user_entries.medium` at all and an index leading with it could not be used.
-- Adding one would cost every write to a hot table and buy nothing.
--
-- What those reads do use is `user_entries_user_status (user_id, status)` from
-- the core schema, which is unchanged, and for the backlog's order the new
-- unique index above, which already leads with (user_id, medium). Revisit this
-- the day a read filters `user_entries.medium` directly, which is a change to
-- views.ts and not to this file.

-- A6. set_backlog_position, scoped to the medium -------------------------------
-- One line different from the version in 20260916003100_backlog_ordering.sql:
-- the max() that finds the end of the list is now scoped to the entry's medium
-- as well as its user, so a new film is appended to the end of the films and
-- not to the end of everything. `new.medium` is filled by the trigger above,
-- which fires first.
--
-- Everything else about it is unchanged and the original file explains it: a
-- backlog entry with no position gets max + 1 or 0, an entry that is not in the
-- backlog has no position whatever the caller passed, a position the caller
-- supplied explicitly is left alone, and two concurrent appends race into a
-- 23505 on one of them rather than a silent duplicate.

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
      and e.medium = new.medium
      and e.backlog_position is not null;

    new.backlog_position := coalesce(v_max + 1, 0);
  end if;

  return new;
end;
$$;

comment on function public.set_backlog_position() is
  'Keep user_entries.backlog_position in step with status: append a backlog entry that has no position to the end of the user''s backlog in that entry''s medium, and clear the position of an entry that is not in the backlog.';

-- A7. move_backlog_entry, scoped to the medium ---------------------------------
-- Same signature, same clamping, same two phases, same one-transaction promise.
-- The medium is read alongside the status in the first select, because the
-- entry being moved is what decides which list is being reordered, and every
-- statement after it carries that medium as well as auth.uid(). A drag in the
-- films list therefore renumbers the films and leaves the games' numbers exactly
-- where they were.
--
-- The clamp is now against the number of other backlog entries in that medium,
-- which is the number of rows the list the finger is in actually has. Before
-- this it was counted across every medium, so a user with films and games would
-- have been allowed to drop a game past the end of the games.
--
-- The two phases are the original ones and exist for the same reason: the
-- partial unique index is checked immediately, so phase 1 parks every row of
-- this user's backlog in this medium above every position in use, and phase 2
-- assigns the final 0..n-1 from that parked order. Adding the medium to both
-- narrows what is parked and what is renumbered; it does not change the argument
-- that nothing collides, since the index now includes the medium too.

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
  v_medium public.medium;
  v_count integer;
  v_offset integer;
  v_position integer;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'move_backlog_entry requires an authenticated user';
  end if;

  select e.status, e.medium into v_status, v_medium
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

  -- The number of *other* backlog entries in the same medium, so the highest
  -- legal target index is v_count and the clamp reads the same as
  -- move_ranking_entry's.
  select count(*) into v_count
  from public.user_entries e
  where e.user_id = v_uid
    and e.medium = v_medium
    and e.status = 'backlog'
    and e.id <> p_entry_id;

  v_position := least(greatest(coalesce(p_new_position, v_count), 0), v_count);

  -- One past the highest position this user holds in this medium. The coalesce
  -- cannot fire while the invariant holds (the entry we just found is in the
  -- backlog, so it has a position), but a null offset would null every position
  -- and send the rows straight back through the trigger, so it is worth the
  -- three words.
  select coalesce(max(e.backlog_position) + 1, 1) into v_offset
  from public.user_entries e
  where e.user_id = v_uid
    and e.medium = v_medium
    and e.backlog_position is not null;

  -- Phase 1: park this medium's list above every position in use.
  update public.user_entries e
  set backlog_position = e.backlog_position + v_offset
  where e.user_id = v_uid
    and e.medium = v_medium
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
        and e2.medium = v_medium
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
  'Move one of the caller''s backlog entries to a new position, renumbering that medium''s backlog densely in one transaction and leaving the caller''s other media untouched. Out-of-range positions are clamped; null appends. Returns the position used.';

-- `create or replace` keeps the access list, so these two statements are a
-- restatement and not a repair. They are here so the end state of the file does
-- not depend on that, the way 20260916173000_popular_games_numeric.sql restates
-- the grants it did not need to.

revoke all on function public.move_backlog_entry(uuid, integer) from public, anon;

grant execute on function public.move_backlog_entry(uuid, integer) to authenticated, service_role;

-- ==============================================================================
-- Part B: the catalog RPCs take a medium
-- ==============================================================================
--
-- Both functions are dropped and recreated rather than replaced, because
-- `create or replace function` cannot add a parameter (it would create an
-- overload) and cannot change a `returns table` at all. Work queue item 17
-- learned the rest of that lesson the hard way: a drop takes the grants and the
-- pinned `search_path` with it, so both have to be restated below and both are
-- asserted in the test suite.
--
-- Dropping the old signature first is also what keeps PostgREST usable. Two
-- functions of the same name with different arity are an overload, and
-- PostgREST resolves an rpc() call by the argument names it was given, so
-- leaving the two-argument `search_games` in place would give it two candidates
-- for `{p_query, p_limit}` and an ambiguity error. One function per name, with
-- defaults, is what makes `searchGames(client, query, { limit })` keep working
-- untouched.

-- B1. search_games -------------------------------------------------------------
-- Trigram search over the catalog of one medium. The GIN index it reads,
-- media_items_title_trgm, is over every title and not partial on medium, so it
-- serves films and series as it stands.
--
-- The genre list comes from whichever extension table holds the row.
-- `game_details`, `movie_details` and `tv_details` all carry a `genres` array
-- and a media item is in exactly one of them, so a coalesce over three left
-- joins is the whole of it. `igdb_id`, `developer` and `platforms` stay as they
-- were and are null or empty for a film or a series, which is the truth about
-- them rather than a gap: the return shape is unchanged so that no caller and no
-- generated type has to move for a column that a film was never going to have.

drop function if exists public.search_games(text, integer);

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
$$;

comment on function public.search_games(text, integer, public.medium) is
  'Trigram search of one medium''s catalog, exact title first, then prefix matches, then similarity. Defaults to games; genres come from whichever extension table holds the row.';

revoke all on function public.search_games(text, integer, public.medium) from public, anon;

grant execute on function public.search_games(text, integer, public.medium) to authenticated, service_role;

-- B2. popular_games ------------------------------------------------------------
-- Still the one catalog read a signed-out visitor may make, and still
-- `security definer` for the reason 20260916160000_popular_games.sql gives:
-- `media_items` is the mirror, it belongs to nobody, and there is nothing here
-- that RLS is protecting from one user on behalf of another. Taking a medium
-- widens the anonymous surface from six columns of one medium to six columns of
-- any one medium, and not by a single table: the tables stay closed to `anon`,
-- the function is still the whole of what it can reach, and the suite checks
-- both halves of that sentence for films as it already did for games.
--
-- ## Two orderings, so two branches
--
-- Games are ordered by IGDB's `total_rating_count`, exactly as before, over the
-- partial index the earlier file built.
--
-- Films and series are ordered by TMDB's `vote_count`, which the TMDB mirror
-- writes into `metadata` (docs/design/film-tv-catalog.md, the metadata column
-- of the field table). `vote_count` and not `popularity`, though TMDB gives
-- both: `vote_count` is how many people have rated the title, which is the same
-- question `total_rating_count` answers for a game, while `popularity` is a
-- daily trend score that decays. A list ordered by a trend score is a list
-- claiming a weekly signal, and rule 9 says the label must not claim one. It is
-- a sort key either way and is never shown (rule 21).
--
-- Both casts are `numeric` and both go through `nullif(..., '')`, which is the
-- correction PR #26 made to the games ordering and the same reasoning applies to
-- TMDB's field: it is a number the mirror writes raw, an int cast would abort an
-- expression index build on the first fractional value, an empty string would
-- raise rather than sort, and a JSON null already comes out of `->>` as SQL
-- NULL. Both sort last.
--
-- `platforms` is empty for a film or a series. The column exists because a
-- Search row draws it for a game, and neither `movie_details` nor `tv_details`
-- has anything that belongs in it: where to watch a film is `watch_availability`
-- and a region, which is a different question and a different read.

-- The index for the film and series ordering. It leads with `medium` so that
-- `where m.medium = p_medium` is an index condition and the two columns after it
-- give the ordering, which lets the planner read it as an ordered scan and stop
-- at the limit instead of sorting the catalog. Partial on the two media it
-- serves, so the 69,000 games in the mirror are not in it.
create index media_items_film_vote_count
  on public.media_items (
    medium,
    (nullif(metadata ->> 'vote_count', '')::numeric) desc nulls last,
    id
  )
  where medium in ('movie', 'tv');

drop function if exists public.popular_games(integer);

create function public.popular_games(
  p_limit integer default 20,
  p_medium public.medium default 'game'
)
returns table (
  id uuid,
  title text,
  year smallint,
  cover_image_id text,
  external_ids jsonb,
  platforms text[]
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  -- A null medium falls back to games the way a null limit falls back to
  -- twenty. Without this, `popular_games(null, null)` would compare the medium
  -- against null and return nothing, which is a silently empty cover wall.
  v_medium public.medium := coalesce(p_medium, 'game');
begin
  if v_medium = 'game' then
    return query
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
    limit v_limit;
  else
    return query
    select
      m.id,
      m.title,
      m.year,
      m.cover_image_id,
      m.external_ids,
      '{}'::text[]
    from public.media_items m
    where m.medium = v_medium
    order by nullif(m.metadata ->> 'vote_count', '')::numeric desc nulls last, m.id
    limit v_limit;
  end if;
end;
$$;

comment on function public.popular_games(integer, public.medium) is
  'The most-rated titles of one medium, at most fifty: IGDB''s rating count for games, TMDB''s vote count for films and series. Catalog data only, so it is readable signed out; the tables behind it are not.';

revoke all on function public.popular_games(integer, public.medium) from public;

grant execute on function public.popular_games(integer, public.medium) to anon, authenticated, service_role;
