-- pgTAP tests for supabase/migrations/20260916003100_backlog_ordering.sql.
-- Run with: supabase test db
--
-- Three things are under test: the column and its partial unique index, the
-- trigger that keeps the position in step with status, and move_backlog_entry.
--
-- The structural assertions run as the migration's owner. Everything after them
-- acts as two users through `set local role authenticated` plus a forged
-- request.jwt.claims, so every write goes through Row Level Security exactly as
-- a supabase-js call would, and every path is followed by the check that the
-- other user's backlog did not move.
--
-- Unlike ranking_functions.test.sql there is no `set constraints all
-- immediate` anywhere: the partial unique index cannot be deferred and is
-- checked as each row is written, so every assertion below already runs against
-- a fully enforced constraint. That is the property move_backlog_entry's
-- two-phase renumber exists to satisfy, and the collision tests near the end
-- are what prove the index is really doing the work.

begin;
select plan(84);

-- Structure -------------------------------------------------------------------

select has_column('public', 'user_entries', 'backlog_position', 'user_entries has backlog_position');
select col_type_is('public', 'user_entries', 'backlog_position', 'integer', 'backlog_position is an integer');
select col_is_null('public', 'user_entries', 'backlog_position', 'backlog_position is nullable: it is meaningless off the backlog');
select col_has_check('public', 'user_entries', 'backlog_position', 'backlog_position has a check constraint');

-- The backlog never touches ranking: this is a second, unrelated order.
select hasnt_column('public', 'ranking_entries', 'backlog_position', 'the backlog order is not on ranking_entries');

-- The index this file created has been replaced by the per-medium one in
-- 20260916230000_per_medium_backlog_and_rpcs.sql, under a name that says so.
-- Everything else in this suite is unchanged, because every fixture below is a
-- game and one medium's numbering is what this file always tested.
select ok(
  to_regclass('public.user_entries_medium_backlog_position_uniq') is not null,
  'user_entries_medium_backlog_position_uniq exists'
);

select matches(
  pg_get_indexdef('public.user_entries_medium_backlog_position_uniq'::regclass),
  'CREATE UNIQUE INDEX',
  'the backlog position index is unique'
);

select matches(
  pg_get_indexdef('public.user_entries_medium_backlog_position_uniq'::regclass),
  'btree \(user_id, medium, backlog_position\)',
  'the index leads with user_id and medium, so it is also the index one medium''s backlog is read through'
);

select matches(
  pg_get_indexdef('public.user_entries_medium_backlog_position_uniq'::regclass),
  'WHERE \(backlog_position IS NOT NULL\)',
  'the index is partial, so the null positions off the backlog cost nothing'
);

select has_function('public', 'move_backlog_entry', array['uuid', 'integer'], 'move_backlog_entry exists');
select function_returns('public', 'move_backlog_entry', array['uuid', 'integer'], 'integer', 'move_backlog_entry returns the position it used');
select isnt_definer('public', 'move_backlog_entry', array['uuid', 'integer'], 'move_backlog_entry is security invoker, so RLS is still the boundary');
select isnt_definer('public', 'set_backlog_position', array[]::text[], 'the trigger function is security invoker too');

select function_privs_are(
  'public', 'move_backlog_entry', array['uuid', 'integer'],
  'authenticated', array['EXECUTE'],
  'signed-in users can call move_backlog_entry'
);

select function_privs_are(
  'public', 'move_backlog_entry', array['uuid', 'integer'],
  'anon', array[]::text[],
  'move_backlog_entry is off the anonymous surface'
);

select has_trigger('public', 'user_entries', 'user_entries_set_backlog_position', 'the position trigger is on user_entries');

-- Fixtures --------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

insert into public.media_items (id, medium, title, year) values
  ('00000000-0000-0000-0000-0000000000f1', 'game', 'Hades', 2020),
  ('00000000-0000-0000-0000-0000000000f2', 'game', 'Celeste', 2018),
  ('00000000-0000-0000-0000-0000000000f3', 'game', 'Outer Wilds', 2019),
  ('00000000-0000-0000-0000-0000000000f4', 'game', 'Tunic', 2022),
  ('00000000-0000-0000-0000-0000000000f5', 'game', 'Hades II', 2024),
  ('00000000-0000-0000-0000-0000000000f6', 'game', 'Shades', 2021),
  ('00000000-0000-0000-0000-0000000000f7', 'game', 'Blue Prince', 2025);

insert into public.game_details (media_item_id, igdb_id, genres, platforms) values
  ('00000000-0000-0000-0000-0000000000f1', 1, '{roguelike}', '{PC}'),
  ('00000000-0000-0000-0000-0000000000f3', 3, '{exploration}', '{PC}');

-- Act as user A.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- Append on insert ------------------------------------------------------------
-- The app sends a status and nothing else; the position is the database's job.

insert into public.user_entries (id, user_id, media_item_id, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000f1', 'backlog'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000f2', 'backlog'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000f3', 'backlog'),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000f4', 'played'),
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000f5', 'playing');

select is(
  (select backlog_position from public.user_entries where id = '00000000-0000-0000-0000-0000000000e1'),
  0,
  'the first backlog entry is position 0'
);

select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog'
      order by e.backlog_position, e.added_at $$,
  $$ values (0, 'Hades'::text), (1, 'Celeste'), (2, 'Outer Wilds') $$,
  'each new backlog entry is appended to the end, never the front'
);

select is(
  (select backlog_position from public.user_entries where id = '00000000-0000-0000-0000-0000000000e4'),
  null::integer,
  'an entry inserted as played gets no position'
);

select is(
  (select backlog_position from public.user_entries where id = '00000000-0000-0000-0000-0000000000e5'),
  null::integer,
  'an entry inserted as playing gets no position'
);

-- Append on transition into the backlog ---------------------------------------

update public.user_entries set status = 'backlog'
 where id = '00000000-0000-0000-0000-0000000000e4';

select is(
  (select backlog_position from public.user_entries where id = '00000000-0000-0000-0000-0000000000e4'),
  3,
  'an entry updated into the backlog from another status is appended'
);

select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog'
      order by e.backlog_position, e.added_at $$,
  $$ values (0, 'Hades'::text), (1, 'Celeste'), (2, 'Outer Wilds'), (3, 'Tunic') $$,
  'the entry that joined the backlog lands last, not first'
);

-- Null on leaving the backlog -------------------------------------------------

update public.user_entries set status = 'playing'
 where id = '00000000-0000-0000-0000-0000000000e2';

select is(
  (select backlog_position from public.user_entries where id = '00000000-0000-0000-0000-0000000000e2'),
  null::integer,
  'leaving the backlog clears the position'
);

select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog'
      order by e.backlog_position, e.added_at $$,
  $$ values (0, 'Hades'::text), (2, 'Outer Wilds'), (3, 'Tunic') $$,
  'the gap the entry left stays open: gaps are allowed, the order is what matters'
);

update public.user_entries set status = 'dropped'
 where id = '00000000-0000-0000-0000-0000000000e5';

select is(
  (select backlog_position from public.user_entries where id = '00000000-0000-0000-0000-0000000000e5'),
  null::integer,
  'a status change between two non-backlog statuses leaves the position null'
);

-- An edit that is not about status must not renumber anything.

update public.user_entries set notes = 'about halfway'
 where id = '00000000-0000-0000-0000-0000000000e1';

select is(
  (select backlog_position from public.user_entries where id = '00000000-0000-0000-0000-0000000000e1'),
  0,
  'an unrelated edit to a backlog entry leaves its position alone'
);

-- A backlog entry always has a place, so clearing the position by hand is not a
-- state the trigger will leave the row in.

update public.user_entries set backlog_position = null
 where id = '00000000-0000-0000-0000-0000000000e1';

select is(
  (select backlog_position from public.user_entries where id = '00000000-0000-0000-0000-0000000000e1'),
  4,
  'clearing the position of a backlog entry re-appends it rather than leaving it placeless'
);

-- A position the caller supplies explicitly is kept, which is what makes a
-- restore or a bulk reorder possible without fighting the trigger.

insert into public.user_entries (id, user_id, media_item_id, status, backlog_position) values
  ('00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000f6', 'backlog', 10);

select is(
  (select backlog_position from public.user_entries where id = '00000000-0000-0000-0000-0000000000e6'),
  10,
  'a position supplied explicitly is kept, not overwritten by the append'
);

insert into public.user_entries (id, user_id, media_item_id, status) values
  ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000f7', 'backlog');

select is(
  (select backlog_position from public.user_entries where id = '00000000-0000-0000-0000-0000000000e7'),
  11,
  'the next append counts from the highest position in use, gaps included'
);

select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog'
      order by e.backlog_position, e.added_at $$,
  $$ values (2, 'Outer Wilds'::text), (3, 'Tunic'), (4, 'Hades'), (10, 'Shades'), (11, 'Blue Prince') $$,
  'the backlog reads in position order however sparse the numbers are'
);

-- The backlog never touches ranking -------------------------------------------
-- Two of these games are also ranked. The two orders are unrelated numbers, and
-- neither function may disturb the other.

select is(
  public.insert_ranking_entry('00000000-0000-0000-0000-0000000000f1', 'game', 'loved', 0),
  0,
  'a backlog game can also be ranked'
);

select is(
  public.insert_ranking_entry('00000000-0000-0000-0000-0000000000f3', 'game', 'loved', 1),
  1,
  'and so can a second one'
);

-- Move up ---------------------------------------------------------------------

select is(
  public.move_backlog_entry('00000000-0000-0000-0000-0000000000e7', 0),
  0,
  'move the last entry to the front'
);

select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog'
      order by e.backlog_position, e.added_at $$,
  $$ values (0, 'Blue Prince'::text), (1, 'Outer Wilds'), (2, 'Tunic'), (3, 'Hades'), (4, 'Shades') $$,
  'a move renumbers the whole backlog densely, closing every gap it finds'
);

select results_eq(
  $$ select t."position", t.title from public.tier_list('game', 'loved') t $$,
  $$ values (0, 'Hades'::text), (1, 'Outer Wilds') $$,
  'moving a backlog entry does not touch the ranked list'
);

-- Move down -------------------------------------------------------------------

select is(
  public.move_backlog_entry('00000000-0000-0000-0000-0000000000e7', 3),
  3,
  'move an entry down the list'
);

select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog'
      order by e.backlog_position, e.added_at $$,
  $$ values (0, 'Outer Wilds'::text), (1, 'Tunic'), (2, 'Hades'), (3, 'Blue Prince'), (4, 'Shades') $$,
  'moving down closes the gap behind the entry before opening one in front of it'
);

-- Move to the ends -------------------------------------------------------------

select is(
  public.move_backlog_entry('00000000-0000-0000-0000-0000000000e3', 4),
  4,
  'move to the last position'
);

select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog'
      order by e.backlog_position, e.added_at $$,
  $$ values (0, 'Tunic'::text), (1, 'Hades'), (2, 'Blue Prince'), (3, 'Shades'), (4, 'Outer Wilds') $$,
  'the entry moved to the end is last and everything above it closed up one'
);

select is(
  public.move_backlog_entry('00000000-0000-0000-0000-0000000000e3', 0),
  0,
  'move back to the first position'
);

select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog'
      order by e.backlog_position, e.added_at $$,
  $$ values (0, 'Outer Wilds'::text), (1, 'Tunic'), (2, 'Hades'), (3, 'Blue Prince'), (4, 'Shades') $$,
  'the entry moved to the front is first and everything below it moved down one'
);

-- Out of range: clamped, as move_ranking_entry clamps ---------------------------

select is(
  public.move_backlog_entry('00000000-0000-0000-0000-0000000000e1', 99),
  4,
  'a position past the end of the backlog is clamped to last'
);

select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog'
      order by e.backlog_position, e.added_at $$,
  $$ values (0, 'Outer Wilds'::text), (1, 'Tunic'), (2, 'Blue Prince'), (3, 'Shades'), (4, 'Hades') $$,
  'the clamped move lands last rather than erroring on a stale client'
);

select is(
  public.move_backlog_entry('00000000-0000-0000-0000-0000000000e1', -7),
  0,
  'a negative position is clamped to first'
);

select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog'
      order by e.backlog_position, e.added_at $$,
  $$ values (0, 'Hades'::text), (1, 'Outer Wilds'), (2, 'Tunic'), (3, 'Blue Prince'), (4, 'Shades') $$,
  'the clamped move lands first, and no position ever goes negative'
);

select is(
  public.move_backlog_entry('00000000-0000-0000-0000-0000000000e1', null),
  4,
  'a null position appends, matching move_ranking_entry'
);

select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog'
      order by e.backlog_position, e.added_at $$,
  $$ values (0, 'Outer Wilds'::text), (1, 'Tunic'), (2, 'Blue Prince'), (3, 'Shades'), (4, 'Hades') $$,
  'the appended entry is last'
);

-- A drag that ends where it started -------------------------------------------

select is(
  public.move_backlog_entry('00000000-0000-0000-0000-0000000000e6', 3),
  3,
  'moving an entry to the position it already holds is allowed'
);

select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog'
      order by e.backlog_position, e.added_at $$,
  $$ values (0, 'Outer Wilds'::text), (1, 'Tunic'), (2, 'Blue Prince'), (3, 'Shades'), (4, 'Hades') $$,
  'a move to the same position leaves the list exactly as it was'
);

-- Positions never collide ------------------------------------------------------

select is(
  (select array_agg(e.backlog_position order by e.backlog_position)
     from public.user_entries e
    where e.user_id = auth.uid() and e.status = 'backlog'),
  array[0, 1, 2, 3, 4],
  'the backlog is dense 0..n-1 after a move, whatever gaps it started with'
);

select is(
  (select count(distinct e.backlog_position) from public.user_entries e
    where e.user_id = auth.uid() and e.backlog_position is not null),
  (select count(*) from public.user_entries e
    where e.user_id = auth.uid() and e.backlog_position is not null),
  'no two of the caller''s entries share a position'
);

select throws_ok(
  $$ update public.user_entries set backlog_position = 0
      where id = '00000000-0000-0000-0000-0000000000e1' $$,
  '23505',
  null,
  'the index refuses a second entry at a position already taken'
);

select throws_ok(
  $$ update public.user_entries set backlog_position = 0
      where user_id = auth.uid() and status = 'backlog' $$,
  '23505',
  null,
  'the index refuses a bulk collapse of the whole backlog onto one position'
);

select throws_ok(
  $$ update public.user_entries set backlog_position = -1
      where id = '00000000-0000-0000-0000-0000000000e1' $$,
  '23514',
  null,
  'the check constraint refuses a negative position'
);

-- Invalid moves ----------------------------------------------------------------

select throws_ok(
  $$ select public.move_backlog_entry('00000000-0000-0000-0000-0000000000e2', 0) $$,
  'P0002',
  null,
  'an entry that is not in the backlog cannot be moved'
);

select throws_ok(
  $$ select public.move_backlog_entry('00000000-0000-0000-0000-0000000000ff', 0) $$,
  'P0002',
  null,
  'an entry id that does not exist cannot be moved'
);

select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog'
      order by e.backlog_position, e.added_at $$,
  $$ values (0, 'Outer Wilds'::text), (1, 'Tunic'), (2, 'Blue Prince'), (3, 'Shades'), (4, 'Hades') $$,
  'a rejected move leaves the backlog exactly as it was'
);

-- And the other direction: a ranking move must not disturb the backlog.

select is(
  public.move_ranking_entry('00000000-0000-0000-0000-0000000000f1', 'loved', 1),
  1,
  'the ranked list can be reordered independently'
);

select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog'
      order by e.backlog_position, e.added_at $$,
  $$ values (0, 'Outer Wilds'::text), (1, 'Tunic'), (2, 'Blue Prince'), (3, 'Shades'), (4, 'Hades') $$,
  'moving a ranked item does not touch the backlog order'
);

-- Two-user isolation: act as user B ---------------------------------------------

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is(
  (select count(*) from public.user_entries),
  0::bigint,
  'user B cannot see user A entries'
);

-- Positions are per user: user A is sitting on 0 through 4 and user B still
-- starts at 0.

insert into public.user_entries (id, user_id, media_item_id, status) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b',
   '00000000-0000-0000-0000-0000000000f1', 'backlog');

select is(
  (select backlog_position from public.user_entries where id = '00000000-0000-0000-0000-0000000000b1'),
  0,
  'user B''s first backlog entry is position 0, not numbered against user A''s backlog'
);

insert into public.user_entries (id, user_id, media_item_id, status) values
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-00000000000b',
   '00000000-0000-0000-0000-0000000000f2', 'backlog');

select is(
  (select backlog_position from public.user_entries where id = '00000000-0000-0000-0000-0000000000b2'),
  1,
  'user B''s append counts against user B''s backlog only'
);

select throws_ok(
  $$ select public.move_backlog_entry('00000000-0000-0000-0000-0000000000e3', 0) $$,
  'P0002',
  null,
  'a user cannot move another user''s backlog entry'
);

select throws_ok(
  $$ select public.move_backlog_entry('00000000-0000-0000-0000-0000000000e2', 0) $$,
  'P0002',
  null,
  'a user cannot move another user''s entry that is not in a backlog either'
);

update public.user_entries set backlog_position = 42
 where id = '00000000-0000-0000-0000-0000000000e1';

select is(
  (select count(*) from public.user_entries where backlog_position = 42),
  0::bigint,
  'user B''s attempt to renumber a row they cannot see touches nothing'
);

update public.user_entries set status = 'playing'
 where id = '00000000-0000-0000-0000-0000000000e1';

select is(
  (select count(*) from public.user_entries where status = 'playing'),
  0::bigint,
  'user B cannot knock another user''s entry out of its backlog either'
);

-- User B's own backlog behaves exactly like user A's.

select is(
  public.move_backlog_entry('00000000-0000-0000-0000-0000000000b2', 0),
  0,
  'user B can move their own backlog entry'
);

select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog'
      order by e.backlog_position, e.added_at $$,
  $$ values (0, 'Celeste'::text), (1, 'Hades') $$,
  'user B''s move renumbers user B''s backlog'
);

select is(
  (select count(*) from public.user_entries),
  2::bigint,
  'user B still sees only their own two entries'
);

-- A backlog of one: the boundary a new user's first drag hits.

update public.user_entries set status = 'played'
 where id = '00000000-0000-0000-0000-0000000000b1';

select is(
  public.move_backlog_entry('00000000-0000-0000-0000-0000000000b2', 0),
  0,
  'the only entry in a backlog can be moved to the only position there is'
);

select is(
  public.move_backlog_entry('00000000-0000-0000-0000-0000000000b2', 9),
  0,
  'and a position past the end of a one-entry backlog clamps to 0, not to 1'
);

select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog'
      order by e.backlog_position, e.added_at $$,
  $$ values (0, 'Celeste'::text) $$,
  'a one-entry backlog survives being dragged onto itself'
);

update public.user_entries set status = 'backlog'
 where id = '00000000-0000-0000-0000-0000000000b1';

select is(
  (select backlog_position from public.user_entries where id = '00000000-0000-0000-0000-0000000000b1'),
  1,
  'and the entry that left rejoins at the end'
);

-- Back to user A: nothing user B did landed -------------------------------------

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog'
      order by e.backlog_position, e.added_at $$,
  $$ values (0, 'Outer Wilds'::text), (1, 'Tunic'), (2, 'Blue Prince'), (3, 'Shades'), (4, 'Hades') $$,
  'user A''s backlog is untouched by user B''s writes and by user B''s move'
);

select is(
  (select status from public.user_entries where id = '00000000-0000-0000-0000-0000000000e1'),
  'backlog'::public.entry_status,
  'user A''s entry is still in the backlog user B tried to pull it out of'
);

-- And user A moving does not renumber user B.

select is(
  public.move_backlog_entry('00000000-0000-0000-0000-0000000000e1', 0),
  0,
  'user A can still move their own entry'
);

select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog'
      order by e.backlog_position, e.added_at $$,
  $$ values (0, 'Hades'::text), (1, 'Outer Wilds'), (2, 'Tunic'), (3, 'Blue Prince'), (4, 'Shades') $$,
  'user A''s move lands'
);

-- Both users, seen from outside RLS ----------------------------------------------

reset role;
reset request.jwt.claims;

select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = '00000000-0000-0000-0000-00000000000a' and e.status = 'backlog'
      order by e.backlog_position, e.added_at $$,
  $$ values (0, 'Hades'::text), (1, 'Outer Wilds'), (2, 'Tunic'), (3, 'Blue Prince'), (4, 'Shades') $$,
  'user A''s backlog, read without RLS, is what user A sees'
);

select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = '00000000-0000-0000-0000-00000000000b' and e.status = 'backlog'
      order by e.backlog_position, e.added_at $$,
  $$ values (0, 'Celeste'::text), (1, 'Hades') $$,
  'user B''s backlog survived every one of user A''s renumbers'
);

select is(
  (select count(*) from public.user_entries
    where backlog_position = 0
      and user_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')),
  2::bigint,
  'two users both holding position 0 is the normal case, not a conflict'
);

select is(
  (select count(*) from public.user_entries
    where status = 'backlog' and backlog_position is null),
  0::bigint,
  'no backlog entry anywhere is left without a position'
);

select is(
  (select count(*) from public.user_entries
    where status <> 'backlog' and backlog_position is not null),
  0::bigint,
  'no entry outside the backlog is left holding a position'
);

select is(
  (select count(distinct (user_id, backlog_position)) from public.user_entries
    where backlog_position is not null),
  (select count(*) from public.user_entries where backlog_position is not null),
  'no two entries of the same user share a position, across both backlogs'
);

-- No authenticated user ----------------------------------------------------------

select throws_ok(
  $$ select public.move_backlog_entry('00000000-0000-0000-0000-0000000000e1', 0) $$,
  '28000',
  null,
  'move_backlog_entry refuses to run without an authenticated user'
);

select * from finish();
rollback;
