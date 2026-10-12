-- pgTAP tests for
-- supabase/migrations/20260916230000_per_medium_backlog_and_rpcs.sql.
-- Run with: supabase test db
--
-- Two claims, one file, because they are one migration and one prerequisite.
--
-- Part A is the backlog. The number a drag lands on is now per user and per
-- medium, so the test that matters most is the pair of negatives: a drag in the
-- films leaves every game's position exactly where it was, and a drag in the
-- games leaves every film's. Everything else here exists to make those two
-- meaningful, including the derived `medium` column, which is asserted to be
-- filled by the database and not by the caller.
--
-- Part B is the two catalog RPCs. Both were dropped and recreated to take a
-- medium, which is the shape work queue item 17 got wrong the first time: a
-- drop takes the grants and the pinned `search_path` with it, and a function
-- that came back `security definer` with execute granted to `anon` would pass
-- every "does it filter by medium" test in this file and still be a hole. So
-- the definer flag, the search_path pin and all four grants are asserted on
-- both functions, after the drop, as their own assertions.
--
-- Two users act through `set local role authenticated` plus a forged
-- request.jwt.claims, so every write goes through Row Level Security exactly as
-- a supabase-js call would. Counts are scoped to this file's fixture ids
-- (PR #24), except where the claim is genuinely about the whole catalog, which
-- is said where it happens.

begin;
select plan(54);

-- Fixtures ---------------------------------------------------------------------
-- Two games, three films and one series. 'Hades' is a game and a film, so
-- search_games can be shown to answer with one or the other and never both.
-- The rating counts are above nine billion, past anything IGDB or TMDB has ever
-- recorded, so the ordering assertions hold on a database that also carries the
-- real mirrored catalog.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

insert into public.media_items (id, medium, title, year, cover_image_id, external_ids, metadata) values
  ('00000000-0000-0000-0000-0000000000f1', 'game', 'Hades', 2020, 'co1r7f',
   '{"igdb": 113112}'::jsonb, '{"total_rating_count": 9000009000}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f2', 'game', 'Celeste', 2018, 'co2dvv',
   '{"igdb": 26226}'::jsonb, '{"total_rating_count": 9000008000}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f3', 'movie', 'Hades', 1999, '/hades.jpg',
   '{"tmdb": 501}'::jsonb, '{"vote_count": 9000005000}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f4', 'movie', 'Dune', 2021, '/dune.jpg',
   '{"tmdb": 438631}'::jsonb, '{"vote_count": 9000006000}'::jsonb),
  -- No vote count at all, the way TMDB leaves a title nobody has rated. It
  -- sorts last, which is the film half of the games' "Unrated" fixture.
  ('00000000-0000-0000-0000-0000000000f5', 'movie', 'Arrival', 2016, '/arrival.jpg',
   '{"tmdb": 329865}'::jsonb, '{"vote_count": null}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f6', 'tv', 'Severance', 2022, '/severance.jpg',
   '{"tmdb": 95396}'::jsonb, '{"vote_count": 9000004000}'::jsonb);

insert into public.game_details (media_item_id, igdb_id, genres, platforms) values
  ('00000000-0000-0000-0000-0000000000f1', 113112, '{roguelike,action}', '{PC,Switch}'),
  ('00000000-0000-0000-0000-0000000000f2', 26226, '{platformer}', '{PC}');

insert into public.movie_details (media_item_id, tmdb_id, genres, directors) values
  ('00000000-0000-0000-0000-0000000000f3', 501, '{Fantasy,Drama}', '{"Nobody At All"}'),
  ('00000000-0000-0000-0000-0000000000f4', 438631, '{"Science Fiction",Adventure}', '{"Denis Villeneuve"}'),
  ('00000000-0000-0000-0000-0000000000f5', 329865, '{"Science Fiction",Drama}', '{"Denis Villeneuve"}');

insert into public.tv_details (media_item_id, tmdb_id, genres, networks) values
  ('00000000-0000-0000-0000-0000000000f6', 95396, '{Drama,Mystery}', '{"Apple TV+"}');

-- Part A, structure ------------------------------------------------------------

-- 1
select has_column('public', 'user_entries', 'medium', 'user_entries carries the medium of the item it points at');

-- 2
select col_not_null('public', 'user_entries', 'medium', 'every entry has one: the column is not null');

-- 3
select ok(
  (select a.atttypid from pg_attribute a
     where a.attrelid = 'public.user_entries'::regclass and a.attname = 'medium')
  = 'public.medium'::regtype::oid,
  'and it is the same enum media_items, ranking_entries and comparisons use, not a text column of its own'
);

-- 4
select has_trigger('public', 'user_entries', 'user_entries_derive_medium', 'the trigger that derives it is on user_entries');

-- 5
-- Triggers on one table for one event fire in alphabetical order, and
-- set_backlog_position reads new.medium, so the order is part of the design and
-- not an accident of naming. This is the assertion that would fail if either
-- were renamed.
select is(
  (select array_agg(t.tgname::text order by t.tgname::text)
     from pg_trigger t
    where t.tgrelid = 'public.user_entries'::regclass and not t.tgisinternal),
  array['user_entries_derive_medium',
        'user_entries_set_backlog_position',
        'user_entries_stamp_started_at'],
  'derive_medium sorts first, so the medium is on the row before the backlog position is computed from it'
);

-- 6
select isnt_definer('public', 'set_entry_medium', array[]::text[], 'the trigger function is security invoker, so the catalog read goes through RLS');

-- 7
select function_privs_are(
  'public', 'set_entry_medium', array[]::text[],
  'anon', array[]::text[],
  'and it is off the anonymous surface, like set_backlog_position'
);

-- 8
select ok(
  to_regclass('public.user_entries_backlog_position_uniq') is null,
  'the old per-user index is gone: one sequence per user was the thing being fixed'
);

-- 9
select matches(
  pg_get_indexdef('public.user_entries_medium_backlog_position_uniq'::regclass),
  'CREATE UNIQUE INDEX',
  'the index that replaced it is still unique'
);

-- 10
select matches(
  pg_get_indexdef('public.user_entries_medium_backlog_position_uniq'::regclass),
  'btree \(user_id, medium, backlog_position\)',
  'over the three columns, with the medium between the user and the number'
);

-- 11
select matches(
  pg_get_indexdef('public.user_entries_medium_backlog_position_uniq'::regclass),
  'WHERE \(backlog_position IS NOT NULL\)',
  'and still partial, so the positions off the backlog cost nothing'
);

-- Part A, the trigger ----------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

insert into public.user_entries (id, user_id, media_item_id, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000f1', 'backlog');

-- 12
select is(
  (select medium from public.user_entries where id = '00000000-0000-0000-0000-0000000000e1'),
  'game'::public.medium,
  'an insert that names no medium gets the one its catalog row has'
);

-- A caller that sends a medium of its own sends it wrong, and is corrected
-- rather than refused: the value was never theirs to supply.
insert into public.user_entries (id, user_id, media_item_id, status, medium) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000f3', 'backlog', 'tv');

-- 13
select is(
  (select medium from public.user_entries where id = '00000000-0000-0000-0000-0000000000e2'),
  'movie'::public.medium,
  'a spoofed medium on insert is overwritten with the truth, not rejected'
);

update public.user_entries set medium = 'game'
 where id = '00000000-0000-0000-0000-0000000000e2';

-- 14
select is(
  (select medium from public.user_entries where id = '00000000-0000-0000-0000-0000000000e2'),
  'movie'::public.medium,
  'and so is a spoofed medium on an update that changes nothing else'
);

update public.user_entries set media_item_id = '00000000-0000-0000-0000-0000000000f6'
 where id = '00000000-0000-0000-0000-0000000000e2';

-- 15
select is(
  (select medium from public.user_entries where id = '00000000-0000-0000-0000-0000000000e2'),
  'tv'::public.medium,
  'repointing an entry at another catalog row moves its medium with it'
);

-- Put it back on the film it started as, so the numbering fixtures below read
-- the way they are written.
update public.user_entries set media_item_id = '00000000-0000-0000-0000-0000000000f3'
 where id = '00000000-0000-0000-0000-0000000000e2';

-- 16
select throws_ok(
  $$ insert into public.user_entries (user_id, media_item_id, status)
     values ('00000000-0000-0000-0000-00000000000a',
             '00000000-0000-0000-0000-0000000000ff', 'backlog') $$,
  '23503',
  null,
  'an entry naming a catalog row that does not exist is a foreign key error and not a confusing not-null one'
);

-- Part A, numbering per medium --------------------------------------------------
-- User A now holds one game and one film. Two more of each, in the order the
-- app would add them.

insert into public.user_entries (id, user_id, media_item_id, status) values
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000f2', 'backlog'),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000f4', 'backlog'),
  -- A film already watched, so the rule that an entry outside the backlog holds
  -- no position can be shown to be about status and not about medium.
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000f5', 'played');

-- 17
select results_eq(
  $$ select e.medium::text, e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog'
      order by e.medium, e.backlog_position $$,
  $$ values ('game'::text, 0, 'Hades'::text),
            ('game', 1, 'Celeste'),
            ('movie', 0, 'Hades'),
            ('movie', 1, 'Dune') $$,
  'two games and two films each number 0 and 1: the film no longer takes a number out of the games'
);

-- 18
select is(
  (select backlog_position from public.user_entries where id = '00000000-0000-0000-0000-0000000000e5'),
  null::integer,
  'and an entry that is not in the backlog still has no position, film or game'
);

-- Part A, move_backlog_entry ----------------------------------------------------

-- 19
select is(
  public.move_backlog_entry('00000000-0000-0000-0000-0000000000e4', 0),
  0,
  'a film can be dragged to the front of the films'
);

-- 20
select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog' and e.medium = 'movie'
      order by e.backlog_position $$,
  $$ values (0, 'Dune'::text), (1, 'Hades') $$,
  'the films renumber around it'
);

-- 21
select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog' and e.medium = 'game'
      order by e.backlog_position $$,
  $$ values (0, 'Hades'::text), (1, 'Celeste') $$,
  'and the games are exactly where they were: this is the whole point of the migration'
);

-- 22
select is(
  public.move_backlog_entry('00000000-0000-0000-0000-0000000000e3', 0),
  0,
  'and a game can be dragged to the front of the games'
);

-- 23
select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog' and e.medium = 'game'
      order by e.backlog_position $$,
  $$ values (0, 'Celeste'::text), (1, 'Hades') $$,
  'the games renumber around that one'
);

-- 24
select results_eq(
  $$ select e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog' and e.medium = 'movie'
      order by e.backlog_position $$,
  $$ values (0, 'Dune'::text), (1, 'Hades') $$,
  'and the films did not move, which is the same claim in the other direction'
);

-- 25
select is(
  public.move_backlog_entry('00000000-0000-0000-0000-0000000000e4', 99),
  1,
  'a position past the end clamps to the end of that medium''s list, not of every list'
);

-- 26
select is(
  public.move_backlog_entry('00000000-0000-0000-0000-0000000000e4', -7),
  0,
  'and a negative one clamps to the front'
);

-- 27
select is(
  (select array_agg(e.backlog_position order by e.backlog_position)
     from public.user_entries e
    where e.user_id = auth.uid() and e.status = 'backlog' and e.medium = 'movie'),
  array[0, 1],
  'the films are dense 0..n-1 after all of that'
);

-- 28
select is(
  (select array_agg(e.backlog_position order by e.backlog_position)
     from public.user_entries e
    where e.user_id = auth.uid() and e.status = 'backlog' and e.medium = 'game'),
  array[0, 1],
  'and so are the games, in their own sequence'
);

-- 29
-- Two media both holding position 0 for one user is the normal case now, in
-- exactly the way two users both holding 0 always was.
select is(
  (select count(*) from public.user_entries e
    where e.user_id = auth.uid() and e.backlog_position = 0),
  2::bigint,
  'one user holds position 0 twice, once per medium, and the index allows it'
);

-- Part A, the second user --------------------------------------------------------

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

insert into public.user_entries (id, user_id, media_item_id, status) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b',
   '00000000-0000-0000-0000-0000000000f1', 'backlog'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-00000000000b',
   '00000000-0000-0000-0000-0000000000f3', 'backlog');

-- 30
select results_eq(
  $$ select e.medium::text, e.backlog_position
       from public.user_entries e
      where e.user_id = auth.uid() and e.status = 'backlog'
      order by e.medium $$,
  $$ values ('game'::text, 0), ('movie', 0) $$,
  'user B starts at 0 in each medium, numbered against neither user A nor their own other medium'
);

-- 31
select throws_ok(
  $$ select public.move_backlog_entry('00000000-0000-0000-0000-0000000000e4', 1) $$,
  'P0002',
  null,
  'and cannot drag user A''s film any more than they could drag a game'
);

-- 32
select is(
  public.move_backlog_entry('00000000-0000-0000-0000-0000000000b2', 0),
  0,
  'user B''s own film moves, in a list of one'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- 33
select results_eq(
  $$ select e.medium::text, e.backlog_position, m.title
       from public.user_entries e
       join public.media_items m on m.id = e.media_item_id
      where e.user_id = auth.uid() and e.status = 'backlog'
      order by e.medium, e.backlog_position $$,
  $$ values ('game'::text, 0, 'Celeste'::text),
            ('game', 1, 'Hades'),
            ('movie', 0, 'Dune'),
            ('movie', 1, 'Hades') $$,
  'user A''s two lists survived every one of user B''s writes and moves'
);

-- Part B, the signatures ----------------------------------------------------------

reset role;
reset request.jwt.claims;

-- 34
select hasnt_function(
  'public', 'search_games', array['text', 'integer'],
  'the two-argument search_games is gone, so PostgREST has no overload to resolve between'
);

-- 35
select has_function(
  'public', 'search_games', array['text', 'integer', 'public.medium'],
  'and the one that replaced it takes a medium'
);

-- 36
select is(
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'search_games'),
  1::bigint,
  'exactly one function is called search_games'
);

-- 37
select hasnt_function(
  'public', 'popular_games', array['integer'],
  'the one-argument popular_games is gone too'
);

-- 38
select has_function(
  'public', 'popular_games', array['integer', 'public.medium'],
  'replaced by one that takes a medium'
);

-- 39
select is(
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'popular_games'),
  1::bigint,
  'and exactly one function is called popular_games'
);

-- Part B, what the drop took and the create had to put back ------------------------
-- Work queue item 17's lesson, asserted rather than assumed, on both functions.

-- 40
select is(
  (select p.prosecdef from pg_proc p
    where p.oid = 'public.search_games(text,integer,public.medium)'::regprocedure),
  false,
  'search_games came back security invoker, as every function that reads on behalf of a user is'
);

-- 41
select ok(
  (select p.proconfig from pg_proc p
    where p.oid = 'public.search_games(text,integer,public.medium)'::regprocedure)
    @> array['search_path=public, extensions'],
  'its search_path pin survived the drop and create'
);

-- 42
select ok(
  not has_function_privilege('anon', 'public.search_games(text,integer,public.medium)', 'execute'),
  'the drop did not hand anon the execute grant back'
);

-- 43
select ok(
  has_function_privilege('authenticated', 'public.search_games(text,integer,public.medium)', 'execute'),
  'signed-in users can still call it'
);

-- 44
select ok(
  has_function_privilege('service_role', 'public.search_games(text,integer,public.medium)', 'execute'),
  'and so can the service role'
);

-- 45
select is(
  (select p.prosecdef from pg_proc p
    where p.oid = 'public.popular_games(integer,public.medium)'::regprocedure),
  true,
  'popular_games is still security definer: it is still the one read that belongs to nobody'
);

-- 46
select ok(
  (select p.proconfig from pg_proc p
    where p.oid = 'public.popular_games(integer,public.medium)'::regprocedure)
    @> array['search_path=public, extensions'],
  'and its search_path is still pinned, which a definer function cannot do without'
);

-- 47
select ok(
  has_function_privilege('anon', 'public.popular_games(integer,public.medium)', 'execute')
  and has_function_privilege('authenticated', 'public.popular_games(integer,public.medium)', 'execute')
  and has_function_privilege('service_role', 'public.popular_games(integer,public.medium)', 'execute'),
  'all three roles kept the execute grant the drop removed'
);

-- 48
select ok(
  not exists (
    select 1 from pg_proc p, unnest(p.proacl) as acl
    where p.oid = 'public.popular_games(integer,public.medium)'::regprocedure
      and acl::text like '=X/%'
  ),
  'and PUBLIC has no execute entry: the revoke closed the default grant the create handed out again'
);

-- 49
select ok(
  to_regclass('public.media_items_film_vote_count') is not null
  and pg_get_indexdef('public.media_items_film_vote_count'::regclass) ~ 'btree \(medium,'
  and pg_get_indexdef('public.media_items_film_vote_count'::regclass) ~ 'vote_count'
  and pg_get_indexdef('public.media_items_film_vote_count'::regclass) ~ 'numeric'
  and pg_get_indexdef('public.media_items_film_vote_count'::regclass) ~ 'DESC NULLS LAST'
  and pg_get_indexdef('public.media_items_film_vote_count'::regclass) ~ 'WHERE',
  'the film and series ordering has a partial index leading with medium and casting the vote count to numeric, so the medium is a condition and the rest is the order'
);

-- Part B, search_games ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- 50
select results_eq(
  $$ select s.media_item_id, s.year from public.search_games('Hades') s
      where s.media_item_id in ('00000000-0000-0000-0000-0000000000f1',
                                '00000000-0000-0000-0000-0000000000f3') $$,
  $$ values ('00000000-0000-0000-0000-0000000000f1'::uuid, 2020::smallint) $$,
  'search_games still answers with the game by default, and never with the film of the same title'
);

-- 51
select results_eq(
  $$ select s.media_item_id, s.year, s.genres, s.igdb_id, s.platforms
       from public.search_games('Hades', 20, 'movie') s
      where s.media_item_id in ('00000000-0000-0000-0000-0000000000f1',
                                '00000000-0000-0000-0000-0000000000f3') $$,
  $$ values ('00000000-0000-0000-0000-0000000000f3'::uuid, 1999::smallint,
             array['Fantasy','Drama'], null::integer, '{}'::text[]) $$,
  'asked for films it answers with the film, whose genres come from movie_details and whose IGDB id and platforms are honestly empty'
);

-- 52
select is(
  (select s.genres from public.search_games('Severance', 20, 'tv') s
    where s.media_item_id = '00000000-0000-0000-0000-0000000000f6'),
  array['Drama', 'Mystery'],
  'and a series takes its genres from tv_details, through the same coalesce'
);

-- Part B, popular_games ------------------------------------------------------------

-- 53
select results_eq(
  $$ select p.id from public.popular_games(2, 'movie') p $$,
  $$ values ('00000000-0000-0000-0000-0000000000f4'::uuid),
            ('00000000-0000-0000-0000-0000000000f3'::uuid) $$,
  'popular_games ordered by medium ''movie'' is the films by TMDB vote count, most voted first, and the unvoted one is below both'
);

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

-- 54
select ok(
  (select count(*) from public.popular_games(50, 'movie') p
    where p.id in ('00000000-0000-0000-0000-0000000000f1',
                   '00000000-0000-0000-0000-0000000000f2',
                   '00000000-0000-0000-0000-0000000000f6')) = 0
  and (select count(*) from public.popular_games(50, 'movie') p
        where p.id = '00000000-0000-0000-0000-0000000000f4') = 1
  and (select count(*) from public.media_items) = 0,
  'a signed-out visitor gets the films and never a game or a series, and still reads nothing from media_items directly'
);

select * from finish();
rollback;
