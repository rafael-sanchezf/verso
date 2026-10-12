-- pgTAP tests for the ranking and backlog RPCs in
-- supabase/migrations/20260915130000_ranking_functions.sql.
-- Run with: supabase test db
--
-- Two users act through `set local role authenticated` plus a forged
-- request.jwt.claims, so every call goes through Row Level Security exactly as
-- a supabase-js rpc() would. `set constraints all immediate` is used at a few
-- points to force the deferred unique constraint on
-- (user_id, medium, tier, position) to be checked mid-test; without it the
-- whole suite rolls back and the constraint would never be evaluated.

begin;
select plan(48);

-- Fixtures --------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- 'Hades' exists twice on purpose: once as a game, once as a movie, so
-- search_games can be shown to filter by medium.
insert into public.media_items (id, medium, title, year) values
  ('00000000-0000-0000-0000-0000000000f1', 'game', 'Hades', 2020),
  ('00000000-0000-0000-0000-0000000000f2', 'game', 'Celeste', 2018),
  ('00000000-0000-0000-0000-0000000000f3', 'game', 'Outer Wilds', 2019),
  ('00000000-0000-0000-0000-0000000000f4', 'game', 'Tunic', 2022),
  ('00000000-0000-0000-0000-0000000000f5', 'game', 'Hades II', 2024),
  ('00000000-0000-0000-0000-0000000000f6', 'game', 'Shades', 2021),
  ('00000000-0000-0000-0000-0000000000f7', 'movie', 'Hades', 1999);

insert into public.game_details (media_item_id, igdb_id, genres, platforms) values
  ('00000000-0000-0000-0000-0000000000f1', 1, '{roguelike,action}', '{PC,Switch}'),
  ('00000000-0000-0000-0000-0000000000f2', 2, '{platformer}', '{PC}'),
  ('00000000-0000-0000-0000-0000000000f3', 3, '{exploration}', '{PC}'),
  ('00000000-0000-0000-0000-0000000000f4', 4, '{"action-adventure"}', '{PC}'),
  ('00000000-0000-0000-0000-0000000000f5', 5, '{roguelike}', '{PC}'),
  ('00000000-0000-0000-0000-0000000000f6', 6, '{horror}', '{PC}');

-- Act as user A.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- insert_ranking_entry: front, end, middle ------------------------------------

-- 1
select is(
  public.insert_ranking_entry('00000000-0000-0000-0000-0000000000f1', 'game', 'loved', 0),
  0,
  'insert into an empty tier lands at position 0'
);

-- 2
select is(
  public.insert_ranking_entry('00000000-0000-0000-0000-0000000000f2', 'game', 'loved', 1),
  1,
  'insert at the end of the tier'
);

-- 3
select is(
  public.insert_ranking_entry('00000000-0000-0000-0000-0000000000f3', 'game', 'loved', 0),
  0,
  'insert at the front of the tier'
);

-- 4
select results_eq(
  $$ select t."position", t.title from public.tier_list('game', 'loved') t $$,
  $$ values (0, 'Outer Wilds'::text), (1, 'Hades'), (2, 'Celeste') $$,
  'inserting at the front shifts every later item down one'
);

-- 5
select is(
  public.insert_ranking_entry('00000000-0000-0000-0000-0000000000f4', 'game', 'loved', 1),
  1,
  'insert into the middle of the tier'
);

-- 6
select results_eq(
  $$ select t."position", t.title from public.tier_list('game', 'loved') t $$,
  $$ values (0, 'Outer Wilds'::text), (1, 'Tunic'), (2, 'Hades'), (3, 'Celeste') $$,
  'inserting in the middle shifts only the items below it'
);

-- 7
select is(
  public.insert_ranking_entry('00000000-0000-0000-0000-0000000000f5', 'game', 'loved', 99),
  4,
  'a position past the end of the tier is clamped to an append'
);

-- 8
select results_eq(
  $$ select t."position", t.title from public.tier_list('game', 'loved') t $$,
  $$ values (0, 'Outer Wilds'::text), (1, 'Tunic'), (2, 'Hades'), (3, 'Celeste'), (4, 'Hades II') $$,
  'the clamped insert lands last'
);

-- Force the deferred unique constraint to be checked on the state built so far.
set constraints all immediate;
set constraints all deferred;

-- insert_ranking_entry: rejections --------------------------------------------

-- 9
select throws_ok(
  $$ select public.insert_ranking_entry('00000000-0000-0000-0000-0000000000f1', 'game', 'loved', 0) $$,
  '23505',
  null,
  'ranking an item that is already ranked is rejected'
);

-- 10
select throws_ok(
  $$ select public.insert_ranking_entry('00000000-0000-0000-0000-0000000000ff', 'game', 'loved', 0) $$,
  '22023',
  null,
  'ranking an item that is not in the catalog is rejected'
);

-- 11
select throws_ok(
  $$ select public.insert_ranking_entry('00000000-0000-0000-0000-0000000000f7', 'game', 'loved', 0) $$,
  '22023',
  null,
  'ranking a movie as a game is rejected'
);

-- move_ranking_entry: within a tier -------------------------------------------

-- 12
select is(
  public.move_ranking_entry('00000000-0000-0000-0000-0000000000f5', 'loved', 0),
  0,
  'move up to the front of the tier'
);

-- 13
select results_eq(
  $$ select t."position", t.title from public.tier_list('game', 'loved') t $$,
  $$ values (0, 'Hades II'::text), (1, 'Outer Wilds'), (2, 'Tunic'), (3, 'Hades'), (4, 'Celeste') $$,
  'moving up pushes the items it passed down one'
);

-- 14
select is(
  public.move_ranking_entry('00000000-0000-0000-0000-0000000000f5', 'loved', 2),
  2,
  'move down inside the tier'
);

-- 15
select results_eq(
  $$ select t."position", t.title from public.tier_list('game', 'loved') t $$,
  $$ values (0, 'Outer Wilds'::text), (1, 'Tunic'), (2, 'Hades II'), (3, 'Hades'), (4, 'Celeste') $$,
  'moving down closes the old gap before opening the new one'
);

-- 16
select is(
  public.move_ranking_entry('00000000-0000-0000-0000-0000000000f5', 'loved', 99),
  4,
  'a move past the end of the tier is clamped to last'
);

-- 17
select results_eq(
  $$ select t."position", t.title from public.tier_list('game', 'loved') t $$,
  $$ values (0, 'Outer Wilds'::text), (1, 'Tunic'), (2, 'Hades'), (3, 'Celeste'), (4, 'Hades II') $$,
  'the clamped move lands last'
);

-- move_ranking_entry: across tiers --------------------------------------------

-- 18
select is(
  public.move_ranking_entry('00000000-0000-0000-0000-0000000000f5', 'liked', 0),
  0,
  'move across tiers'
);

-- 19
select results_eq(
  $$ select t."position", t.title from public.tier_list('game', 'loved') t $$,
  $$ values (0, 'Outer Wilds'::text), (1, 'Tunic'), (2, 'Hades'), (3, 'Celeste') $$,
  'the tier the item left closes its gap'
);

-- 20
select results_eq(
  $$ select t."position", t.title from public.tier_list('game', 'liked') t $$,
  $$ values (0, 'Hades II'::text) $$,
  'the item lands in the tier it moved to'
);

-- 21
select is(
  public.move_ranking_entry('00000000-0000-0000-0000-0000000000f5', 'loved', 1),
  1,
  'move back across tiers into the middle'
);

-- 22
select results_eq(
  $$ select t."position", t.title from public.tier_list('game', 'loved') t $$,
  $$ values (0, 'Outer Wilds'::text), (1, 'Hades II'), (2, 'Tunic'), (3, 'Hades'), (4, 'Celeste') $$,
  'moving back across tiers opens a gap at the target position'
);

-- 23
select is(
  (select count(*) from public.tier_list('game', 'liked')),
  0::bigint,
  'the tier the item left is empty again'
);

set constraints all immediate;
set constraints all deferred;

-- remove_ranking_entry --------------------------------------------------------

-- 24
select lives_ok(
  $$ select public.remove_ranking_entry('00000000-0000-0000-0000-0000000000f5') $$,
  'remove an item from the middle of the tier'
);

-- 25
select results_eq(
  $$ select t."position", t.title from public.tier_list('game', 'loved') t $$,
  $$ values (0, 'Outer Wilds'::text), (1, 'Tunic'), (2, 'Hades'), (3, 'Celeste') $$,
  'removing from the middle closes the gap'
);

-- 26
select throws_ok(
  $$ select public.remove_ranking_entry('00000000-0000-0000-0000-0000000000f5') $$,
  'P0002',
  null,
  'removing an item that is not ranked is rejected'
);

-- 27
select throws_ok(
  $$ select public.move_ranking_entry('00000000-0000-0000-0000-0000000000f5', 'loved', 0) $$,
  'P0002',
  null,
  'moving an item that is not ranked is rejected'
);

set constraints all immediate;
set constraints all deferred;

-- finish_insertion ------------------------------------------------------------
-- The payload carries a user_id belonging to user B. It must be ignored.

-- 28
select is(
  public.finish_insertion(
    '00000000-0000-0000-0000-0000000000f5',
    'game',
    'loved',
    2,
    $json$[
      {"user_id": "00000000-0000-0000-0000-00000000000b",
       "item_a": "00000000-0000-0000-0000-0000000000f5",
       "item_b": "00000000-0000-0000-0000-0000000000f1",
       "outcome": "a",
       "context": {"tier": "loved", "sameGenre": true, "tierSize": 4}},
      {"user_id": "00000000-0000-0000-0000-00000000000b",
       "item_a": "00000000-0000-0000-0000-0000000000f5",
       "item_b": "00000000-0000-0000-0000-0000000000f3",
       "outcome": "b",
       "context": {"tier": "loved", "sameGenre": false, "tierSize": 4}}
    ]$json$::jsonb
  ),
  2,
  'finish_insertion places the item and returns its position'
);

-- 29
select results_eq(
  $$ select t."position", t.title from public.tier_list('game', 'loved') t $$,
  $$ values (0, 'Outer Wilds'::text), (1, 'Tunic'), (2, 'Hades II'), (3, 'Hades'), (4, 'Celeste') $$,
  'finish_insertion shifts positions the same way insert_ranking_entry does'
);

-- 30
select is(
  (select count(*) from public.comparisons),
  2::bigint,
  'finish_insertion writes one comparison row per answer'
);

-- 31
select is(
  (select c.outcome::text from public.comparisons c
    where c.item_b = '00000000-0000-0000-0000-0000000000f1'),
  'a',
  'the outcome from the payload is stored'
);

-- 32
select is(
  (select c.context ->> 'tier' from public.comparisons c
    where c.item_b = '00000000-0000-0000-0000-0000000000f3'),
  'loved',
  'the comparison context from the payload is stored'
);

-- Row Level Security: act as user B -------------------------------------------

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

-- 33
select is(
  public.insert_ranking_entry('00000000-0000-0000-0000-0000000000f1', 'game', 'loved', 0),
  0,
  'a second user can rank an item the first user has already ranked'
);

-- 34
select results_eq(
  $$ select t."position", t.title from public.tier_list('game', 'loved') t $$,
  $$ values (0, 'Hades'::text) $$,
  'tier_list shows only the caller rows'
);

-- 35
select throws_ok(
  $$ select public.move_ranking_entry('00000000-0000-0000-0000-0000000000f3', 'liked', 0) $$,
  'P0002',
  null,
  'a user cannot move another user ranking'
);

-- 36
select throws_ok(
  $$ select public.remove_ranking_entry('00000000-0000-0000-0000-0000000000f3') $$,
  'P0002',
  null,
  'a user cannot remove another user ranking'
);

-- 37
select is(
  (select count(*) from public.comparisons),
  0::bigint,
  'a user cannot see another user comparisons'
);

-- 38
select is(
  public.finish_insertion(
    '00000000-0000-0000-0000-0000000000f2',
    'game',
    'loved',
    1,
    $json$[
      {"user_id": "00000000-0000-0000-0000-00000000000a",
       "item_a": "00000000-0000-0000-0000-0000000000f2",
       "item_b": "00000000-0000-0000-0000-0000000000f1",
       "outcome": "b",
       "context": {"tier": "loved", "sameGenre": false, "tierSize": 1}}
    ]$json$::jsonb
  ),
  1,
  'finish_insertion works for the second user too'
);

-- 39
select is(
  (select count(*) from public.comparisons),
  1::bigint,
  'the second user sees only the comparison they just wrote'
);

-- search_games ----------------------------------------------------------------

-- 40
select results_eq(
  $$ select s.title from public.search_games('Hades') s $$,
  $$ values ('Hades'::text), ('Hades II'), ('Shades') $$,
  'search_games ranks the exact title first, then the prefix match, then similarity'
);

-- 41
select is(
  (select s.genres from public.search_games('Hades', 1) s),
  array['roguelike', 'action']::text[],
  'search_games joins game_details onto the catalog row'
);

-- 42
select is(
  (select count(*) from public.search_games('Hades', 1)),
  1::bigint,
  'search_games honours p_limit'
);

-- 43
select is(
  (select count(*) from public.search_games('   ')),
  0::bigint,
  'a blank query returns nothing'
);

-- 44
select is(
  (select count(*) from public.search_games('Hades')),
  3::bigint,
  'search_games ignores the movie with the same title'
);

-- Back to user A: nothing user B did touched user A ---------------------------

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- 45
select results_eq(
  $$ select t."position", t.title from public.tier_list('game', 'loved') t $$,
  $$ values (0, 'Outer Wilds'::text), (1, 'Tunic'), (2, 'Hades II'), (3, 'Hades'), (4, 'Celeste') $$,
  'the first user tier is untouched by the second user'
);

-- Ownership, checked without RLS ----------------------------------------------

reset role;
reset request.jwt.claims;

-- 46
select is(
  (select count(*) from public.comparisons where user_id = '00000000-0000-0000-0000-00000000000a'),
  2::bigint,
  'user A comparisons are stored with user A as the owner, not the payload user_id'
);

-- 47
select is(
  (select count(*) from public.comparisons where user_id = '00000000-0000-0000-0000-00000000000b'),
  1::bigint,
  'user B comparisons are stored with user B as the owner, not the payload user_id'
);

-- 48
select is(
  (select count(*) from public.ranking_entries where user_id = '00000000-0000-0000-0000-00000000000b'),
  2::bigint,
  'user B has exactly the two rankings they created'
);

-- Final check that every position shuffle left the deferred unique constraint
-- satisfiable. A failure here aborts the run rather than failing a test.
set constraints all immediate;

select * from finish();
rollback;
