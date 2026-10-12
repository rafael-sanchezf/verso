-- pgTAP tests for supabase/migrations/20260916140000_ranking_placed_at.sql.
-- Run with: supabase test db
--
-- The whole point of the column is which writes do *not* touch it, so that is
-- what most of this file asserts.
--
-- One wrinkle shapes every test below: `now()` is the transaction clock, and
-- pgTAP runs the suite in one transaction. Every row this file writes would
-- otherwise carry the identical timestamp, and "the insert stamped a fresh
-- placed_at" would be indistinguishable from "the shift left the old one
-- alone". So rows are backdated by hand to 2020 before each act, and each
-- assertion says which timestamps moved to now() and which stayed in 2020.
-- Backdating goes through Row Level Security like everything else here: a user
-- may write their own ranking rows, and the app's path to them is the
-- functions.
--
-- The migration's backfill (`placed_at = updated_at` for rows that existed
-- before the column did) is not asserted: it is a one-shot statement over a
-- table that a freshly migrated local stack creates empty. The NOT NULL
-- constraint below is the part of it that is still true tomorrow.
--
-- Two users act through `set local role authenticated` plus a forged
-- request.jwt.claims, so every call goes through RLS exactly as a supabase-js
-- rpc() would.

begin;
select plan(26);

-- Fixtures --------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

insert into public.media_items (id, medium, title, year) values
  ('00000000-0000-0000-0000-0000000000f1', 'game', 'Hades', 2020),
  ('00000000-0000-0000-0000-0000000000f2', 'game', 'Celeste', 2018),
  ('00000000-0000-0000-0000-0000000000f3', 'game', 'Outer Wilds', 2019),
  ('00000000-0000-0000-0000-0000000000f4', 'game', 'Tunic', 2022),
  ('00000000-0000-0000-0000-0000000000f5', 'game', 'Hades II', 2024);

-- Structure -------------------------------------------------------------------

-- 1
select has_column('public', 'ranking_entries', 'placed_at', 'ranking_entries has placed_at');

-- 2
select col_type_is(
  'public', 'ranking_entries', 'placed_at', 'timestamp with time zone',
  'placed_at is a timestamptz, like updated_at beside it'
);

-- 3
select col_not_null(
  'public', 'ranking_entries', 'placed_at',
  'placed_at is NOT NULL: a ranked row was placed at some point, and the backfill gave the old rows a date'
);

-- 4
select is(
  (select pg_get_expr(d.adbin, d.adrelid)
     from pg_attrdef d
     join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = 'public.ranking_entries'::regclass and a.attname = 'placed_at'),
  'now()',
  'placed_at defaults to now(), so a writer that forgets it still gets the truth'
);

-- Act as user A.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- An insert stamps the new row ------------------------------------------------

select public.insert_ranking_entry('00000000-0000-0000-0000-0000000000f1', 'game', 'loved', 0);
select public.insert_ranking_entry('00000000-0000-0000-0000-0000000000f2', 'game', 'loved', 1);
select public.insert_ranking_entry('00000000-0000-0000-0000-0000000000f3', 'game', 'loved', 2);

-- 5
select is(
  (select count(*) from public.ranking_entries r where r.placed_at = now()),
  3::bigint,
  'insert_ranking_entry stamps placed_at on the row it creates'
);

-- 6
select is(
  (select count(*) from public.ranking_entries r where r.placed_at = r.updated_at),
  3::bigint,
  'a freshly placed row has the same placed_at and updated_at: nothing has happened to it yet'
);

-- An insert that shifts its neighbours does not re-place them ------------------

-- Backdate everything so the next transaction clock is distinguishable.
update public.ranking_entries
set placed_at = '2020-01-01T00:00:00Z', updated_at = '2020-01-01T00:00:00Z';

-- Tunic goes in at the front of a tier of three, shifting all three down one.
select public.insert_ranking_entry('00000000-0000-0000-0000-0000000000f4', 'game', 'loved', 0);

-- 7
select is(
  (select r.placed_at from public.ranking_entries r
    where r.media_item_id = '00000000-0000-0000-0000-0000000000f4'),
  now(),
  'the placed game is stamped with the placement'
);

-- 8
select is(
  (select count(*) from public.ranking_entries r
    where r.media_item_id <> '00000000-0000-0000-0000-0000000000f4'
      and r.placed_at = '2020-01-01T00:00:00Z'),
  3::bigint,
  'the three games the insert shifted keep the placed_at they already had'
);

-- 9
select is(
  (select count(*) from public.ranking_entries r
    where r.media_item_id <> '00000000-0000-0000-0000-0000000000f4'
      and r.updated_at = now()),
  3::bigint,
  'those same three rows were written: updated_at moved, which is what makes the assertion above mean something'
);

-- 10
select results_eq(
  $$ select t."position", t.title from public.tier_list('game', 'loved') t $$,
  $$ values (0, 'Tunic'::text), (1, 'Hades'), (2, 'Celeste'), (3, 'Outer Wilds') $$,
  'the shift itself still works'
);

-- A move is not a placement ---------------------------------------------------

update public.ranking_entries
set placed_at = '2020-01-01T00:00:00Z', updated_at = '2020-01-01T00:00:00Z';

-- Drag Outer Wilds from the bottom of the tier to the top.
select public.move_ranking_entry('00000000-0000-0000-0000-0000000000f3', 'loved', 0);

-- 11
select is(
  (select r.placed_at from public.ranking_entries r
    where r.media_item_id = '00000000-0000-0000-0000-0000000000f3'),
  '2020-01-01T00:00:00Z'::timestamptz,
  'move_ranking_entry does not touch placed_at on the row it moves'
);

-- 12
select is(
  (select r.updated_at from public.ranking_entries r
    where r.media_item_id = '00000000-0000-0000-0000-0000000000f3'),
  now(),
  'the move did happen: updated_at on the moved row is now()'
);

-- 13
select is(
  (select count(*) from public.ranking_entries r where r.placed_at = '2020-01-01T00:00:00Z'),
  4::bigint,
  'nor on the rows the move shifted out of its way'
);

-- 14
select is(
  (select r."position" from public.ranking_entries r
    where r.media_item_id = '00000000-0000-0000-0000-0000000000f3'),
  0,
  'the move itself still works'
);

-- A move to another tier is still not a placement.
select public.move_ranking_entry('00000000-0000-0000-0000-0000000000f3', 'liked', 0);

-- 15
select is(
  (select r.placed_at from public.ranking_entries r
    where r.media_item_id = '00000000-0000-0000-0000-0000000000f3'),
  '2020-01-01T00:00:00Z'::timestamptz,
  'changing a game tier does not re-place it either'
);

-- finish_insertion ------------------------------------------------------------
-- The one call the app makes per ranked game, so this is the path that has to
-- stamp the date the Profile tab shows.

update public.ranking_entries
set placed_at = '2020-01-01T00:00:00Z', updated_at = '2020-01-01T00:00:00Z';

select public.finish_insertion(
  '00000000-0000-0000-0000-0000000000f5',
  'game',
  'loved',
  0,
  $json$[
    {"item_a": "00000000-0000-0000-0000-0000000000f5",
     "item_b": "00000000-0000-0000-0000-0000000000f4",
     "outcome": "a",
     "context": {"tier": "loved", "sameGenre": false, "tierSize": 3}}
  ]$json$::jsonb
);

-- 16
select is(
  (select r.placed_at from public.ranking_entries r
    where r.media_item_id = '00000000-0000-0000-0000-0000000000f5'),
  now(),
  'finish_insertion stamps placed_at, because it places through insert_ranking_entry'
);

-- 17
select is(
  (select count(*) from public.ranking_entries r
    where r.media_item_id <> '00000000-0000-0000-0000-0000000000f5'
      and r.placed_at = '2020-01-01T00:00:00Z'),
  4::bigint,
  'and leaves every other row placed when it was placed'
);

-- Re-ranking is a new placement -----------------------------------------------

select public.remove_ranking_entry('00000000-0000-0000-0000-0000000000f1');
select public.insert_ranking_entry('00000000-0000-0000-0000-0000000000f1', 'game', 'fine', 0);

-- 18
select is(
  (select r.placed_at from public.ranking_entries r
    where r.media_item_id = '00000000-0000-0000-0000-0000000000f1'),
  now(),
  'unranking a game and ranking it again places it again: the row is new and so is its date'
);

-- The order the Profile tab reads ---------------------------------------------
-- placed_at descending, then tier and position, which is what recentRankings
-- asks PostgREST for.

-- 19
select results_eq(
  $$ select r.media_item_id from public.ranking_entries r
      order by r.placed_at desc, r.tier asc, r."position" asc $$,
  $$ values ('00000000-0000-0000-0000-0000000000f5'::uuid),
            ('00000000-0000-0000-0000-0000000000f1'),
            ('00000000-0000-0000-0000-0000000000f4'),
            ('00000000-0000-0000-0000-0000000000f2'),
            ('00000000-0000-0000-0000-0000000000f3') $$,
  'recent activity is the two rows placed at now(), best tier first, then the backdated rows by tier and position'
);

-- Row Level Security: act as user B -------------------------------------------

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

-- 20
select is(
  (select count(*) from public.ranking_entries),
  0::bigint,
  'a second user sees none of the first user placements'
);

-- 21
select is(
  (select count(*) from public.ranking_entries r where r.placed_at = '2020-01-01T00:00:00Z'),
  0::bigint,
  'including the backdated ones, which are the ones this suite reasons about'
);

select public.insert_ranking_entry('00000000-0000-0000-0000-0000000000f1', 'game', 'loved', 0);
select public.insert_ranking_entry('00000000-0000-0000-0000-0000000000f2', 'game', 'loved', 0);

-- 22
select is(
  (select count(*) from public.ranking_entries r where r.placed_at = now()),
  2::bigint,
  'the second user gets their own placements, on the same catalog rows'
);

-- 23
select is(
  (select count(*) from public.ranking_entries),
  2::bigint,
  'and still sees only their own two'
);

-- Back to user A --------------------------------------------------------------

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- 24
select is(
  (select count(*) from public.ranking_entries r where r.placed_at = '2020-01-01T00:00:00Z'),
  3::bigint,
  'nothing the second user did re-placed a row of the first user'
);

-- Ownership, checked without RLS ----------------------------------------------

reset role;
reset request.jwt.claims;

-- 25
select is(
  (select count(*) from public.ranking_entries where user_id = '00000000-0000-0000-0000-00000000000a'),
  5::bigint,
  'user A holds the five rows this suite placed for them, and no row the second user wrote'
);

-- 26
select is(
  (select count(distinct user_id) from public.ranking_entries where placed_at = '2020-01-01T00:00:00Z'),
  1::bigint,
  'the backdated rows belong to exactly one user: no write crossed the boundary'
);

-- Final check that every position shuffle left the deferred unique constraint
-- satisfiable. A failure here aborts the run rather than failing a test.
set constraints all immediate;

select * from finish();
rollback;
