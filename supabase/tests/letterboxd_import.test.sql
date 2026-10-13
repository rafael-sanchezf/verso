-- pgTAP tests for supabase/migrations/20261012130000_letterboxd_import.sql.
-- Run with: supabase test db
--
-- Five parts: the structure (one placement column, main's placed_by; the two
-- tables, their policies and grants), the matcher (each of its three rules,
-- the year tolerance, the medium guard, the one-row-per-key shape), the
-- default import (watched and the diary, nothing ranked: rule 35), the import
-- the user chose to rank and confirmed (what it writes, what it leaves alone,
-- every order it refuses), and two-user isolation. Users act through
-- `set local role authenticated` plus a forged request.jwt.claims, so every
-- call goes through Row Level Security exactly as a supabase-js rpc() would.
--
-- `now()` is the transaction clock, so as in ranking_placed_at.test.sql the
-- row whose placed_at must *not* move is backdated to 2020 first.

begin;
select plan(54);

-- Fixtures --------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

insert into public.media_items (id, medium, title, year, cover_image_id, external_ids, metadata) values
  ('00000000-0000-0000-0000-0000000000a1', 'movie', 'Dune', 2021, '/dune.jpg', '{"tmdb": 438631}'::jsonb, '{"vote_count": 12000}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', 'movie', 'Arrival', 2016, '/arrival.jpg', '{"tmdb": 329865}'::jsonb, '{"vote_count": 18000}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a3', 'movie', 'The Godfather: Part II', 1974, '/godfather2.jpg', '{"tmdb": 240}'::jsonb, '{"vote_count": 11000}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a4', 'movie', 'Everything Everywhere All at Once', 2022, '/eeaao.jpg', '{"tmdb": 545611}'::jsonb, '{"vote_count": 6000}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a5', 'movie', 'Cats', 2019, '/cats.jpg', '{"tmdb": 480042}'::jsonb, '{"vote_count": 900}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a6', 'movie', 'Dune', 1984, '/dune84.jpg', '{"tmdb": 841}'::jsonb, '{"vote_count": 3000}'::jsonb),
  -- The game with a film's title: never a match.
  ('00000000-0000-0000-0000-0000000000b1', 'game', 'Dune', 2021, 'co0001', '{"igdb": 1}'::jsonb, '{}'::jsonb);

insert into public.movie_details (media_item_id, tmdb_id, genres) values
  ('00000000-0000-0000-0000-0000000000a1', 438631, '{"Science Fiction"}'),
  ('00000000-0000-0000-0000-0000000000a2', 329865, '{"Science Fiction",Drama}'),
  ('00000000-0000-0000-0000-0000000000a3', 240, '{Crime,Drama}'),
  ('00000000-0000-0000-0000-0000000000a4', 545611, '{Action,Comedy}'),
  ('00000000-0000-0000-0000-0000000000a5', 480042, '{Fantasy,Musical}'),
  ('00000000-0000-0000-0000-0000000000a6', 841, '{"Science Fiction"}');

insert into public.game_details (media_item_id, igdb_id, genres, platforms) values
  ('00000000-0000-0000-0000-0000000000b1', 1, '{strategy}', '{PC}');

-- Part A, structure --------------------------------------------------------------

-- 1
select hasnt_column('public', 'ranking_entries', 'placement_source',
  'no second placement column: an imported place is marked with placed_by, as the batch session''s are');

-- 2
select has_table('public', 'letterboxd_imports', 'letterboxd_imports exists');

-- 3
select has_table('public', 'letterboxd_import_films', 'letterboxd_import_films exists');

-- 4
select is(
  (select relrowsecurity from pg_class where oid = 'public.letterboxd_imports'::regclass),
  true,
  'letterboxd_imports has Row Level Security on'
);

-- 5
select is(
  (select relrowsecurity from pg_class where oid = 'public.letterboxd_import_films'::regclass),
  true,
  'letterboxd_import_films has Row Level Security on'
);

-- 6
select policies_are(
  'public', 'letterboxd_imports',
  array['users manage their own letterboxd imports'],
  'letterboxd_imports has the owner-only policy and nothing else'
);

-- 7
select policies_are(
  'public', 'letterboxd_import_films',
  array['users manage their own letterboxd import films'],
  'letterboxd_import_films has the owner-only policy and nothing else'
);

-- 8
select ok(
  not has_table_privilege('anon', 'public.letterboxd_imports', 'select')
  and not has_table_privilege('anon', 'public.letterboxd_import_films', 'select'),
  'anon reads neither import table'
);

-- 9
select ok(
  not has_column_privilege('authenticated', 'public.letterboxd_imports', 'file_names', 'update')
  and not has_table_privilege('authenticated', 'public.letterboxd_import_films', 'update'),
  'the record is not rewritten after the fact: only the counts are updatable'
);

-- 10
select ok(
  not has_function_privilege('anon', 'public.apply_letterboxd_import(text[], jsonb, jsonb, uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.match_letterboxd_films(jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.apply_letterboxd_import(text[], jsonb, jsonb, uuid[])', 'execute')
  and has_function_privilege('authenticated', 'public.match_letterboxd_films(jsonb)', 'execute'),
  'both functions are for signed-in users only'
);

-- 11
select is(
  (select proconfig from pg_proc where oid = 'public.apply_letterboxd_import(text[], jsonb, jsonb, uuid[])'::regprocedure),
  array['search_path=public, extensions'],
  'the write pins its search_path'
);

-- Part B, the matcher ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- 12
select results_eq(
  $$ select media_item_id, match from public.match_letterboxd_films(
       '[{"key":"k","title":"Whatever The File Says","year":1999,"tmdb_id":438631}]'::jsonb) $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid, 'tmdb'::text) $$,
  'a tmdbID matches exactly, whatever the title and year say'
);

-- 13
select results_eq(
  $$ select media_item_id, match from public.match_letterboxd_films(
       '[{"key":"k","title":"Dune","year":2021,"tmdb_id":null}]'::jsonb) $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid, 'title'::text) $$,
  'the same title and year is a title match, and picks the 2021 Dune over the 1984 one and over the game'
);

-- 14
select results_eq(
  $$ select media_item_id, match from public.match_letterboxd_films(
       '[{"key":"k","title":"Dune","year":1984,"tmdb_id":null}]'::jsonb) $$,
  $$ values ('00000000-0000-0000-0000-0000000000a6'::uuid, 'title'::text) $$,
  'the year picks between two films of one title'
);

-- 15
select results_eq(
  $$ select media_item_id, match from public.match_letterboxd_films(
       '[{"key":"k","title":"Arrival","year":2017,"tmdb_id":null}]'::jsonb) $$,
  $$ values ('00000000-0000-0000-0000-0000000000a2'::uuid, 'title'::text) $$,
  'a year one off still matches: Letterboxd and TMDB date films differently'
);

-- 16
select results_eq(
  $$ select media_item_id, match from public.match_letterboxd_films(
       '[{"key":"k","title":"the godfather part ii","year":1974,"tmdb_id":null}]'::jsonb) $$,
  $$ values ('00000000-0000-0000-0000-0000000000a3'::uuid, 'title'::text) $$,
  'case and punctuation do not stop a title match'
);

-- 17
select results_eq(
  $$ select media_item_id, match from public.match_letterboxd_films(
       '[{"key":"k","title":"Everything Everywhere Al at Once","year":2022,"tmdb_id":null}]'::jsonb) $$,
  $$ values ('00000000-0000-0000-0000-0000000000a4'::uuid, 'fuzzy'::text) $$,
  'a near miss is a fuzzy match, and says so'
);

-- 18
select results_eq(
  $$ select key, media_item_id, title, match from public.match_letterboxd_films(
       '[{"key":"none","title":"A Film Nobody Mirrored","year":2001,"tmdb_id":null},
         {"key":"dune","title":"Dune","year":2021,"tmdb_id":null}]'::jsonb) $$,
  $$ values ('none'::text, null::uuid, null::text, null::text),
            ('dune'::text, '00000000-0000-0000-0000-0000000000a1'::uuid, 'Dune'::text, 'title'::text) $$,
  'one row per key in input order, nulls for a film the catalog does not have'
);

-- 19
select is(
  (select count(*) from public.match_letterboxd_films(
     '[{"key":"k","title":"Dune","year":2021,"tmdb_id":null}]'::jsonb)
   where media_item_id = '00000000-0000-0000-0000-0000000000b1'),
  0::bigint,
  'a game is never a match for a film'
);

-- Part C, the default import: watched and the diary, nothing ranked ---------------

-- A already ranked Dune (1984) through the loop, dropped Cats, and planned to
-- see Everything Everywhere on a day before the file says they watched it.
select public.insert_ranking_entry('00000000-0000-0000-0000-0000000000a6', 'movie', 'loved', 0);
reset role;
update public.ranking_entries
set placed_at = '2020-01-01T00:00:00Z', updated_at = '2020-01-01T00:00:00Z'
where media_item_id = '00000000-0000-0000-0000-0000000000a6';
set local role authenticated;

insert into public.user_entries (user_id, media_item_id, status)
values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a5', 'dropped');
insert into public.user_entries (user_id, media_item_id, status, planned_on)
values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a4', 'backlog', '2023-11-01');

create temp table default_films as
select '[
  {"letterboxd_uri":"https://boxd.it/1","title":"Dune","year":2021,"rating":4.5,
   "watched_dates":["2024-08-09","2024-03-01","2024-08-09"],"rewatches":1,
   "media_item_id":"00000000-0000-0000-0000-0000000000a1","outcome":"watched"},
  {"letterboxd_uri":"https://boxd.it/4","title":"Everything Everywhere All at Once","year":2022,"rating":null,
   "watched_dates":["2023-11-19"],"rewatches":0,
   "media_item_id":"00000000-0000-0000-0000-0000000000a4","outcome":"watched"},
  {"letterboxd_uri":"https://boxd.it/5","title":"Cats","year":2019,"rating":0.5,
   "watched_dates":[],"rewatches":0,
   "media_item_id":"00000000-0000-0000-0000-0000000000a5","outcome":"watched"},
  {"letterboxd_uri":"https://boxd.it/9","title":"A Film Nobody Mirrored","year":2001,"rating":3,
   "watched_dates":[],"rewatches":0,"media_item_id":null,"outcome":"unmatched"},
  {"letterboxd_uri":"https://boxd.it/3","title":"The Godfather: Part II","year":1974,"rating":5,
   "watched_dates":[],"rewatches":0,
   "media_item_id":"00000000-0000-0000-0000-0000000000a3","outcome":"skipped"}
]'::jsonb as films;
grant select on default_films to authenticated;

-- 20
select results_eq(
  $$ select ranked, watched, unmatched, skipped, diary
       from public.apply_letterboxd_import(array['ratings.csv', 'diary.csv'], (select films from default_films)) $$,
  $$ values (0, 3, 1, 1, 3) $$,
  'the default import ranks nothing, marks three watched, and writes three diary rows (the repeated date once)'
);

-- 21
select results_eq(
  $$ select media_item_id, placed_by from public.ranking_entries
      where user_id = '00000000-0000-0000-0000-00000000000a' and medium = 'movie' $$,
  $$ values ('00000000-0000-0000-0000-0000000000a6'::uuid, 'user'::text) $$,
  'the movie ranking is exactly what it was, a rated film included (rule 35)'
);

-- 22
select results_eq(
  $$ select media_item_id, watched_on, place, note from public.watch_log
      where user_id = '00000000-0000-0000-0000-00000000000a'
      order by media_item_id, watched_on $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid, '2024-03-01'::date, null::text, null::text),
            ('00000000-0000-0000-0000-0000000000a1'::uuid, '2024-08-09'::date, null::text, null::text),
            ('00000000-0000-0000-0000-0000000000a4'::uuid, '2023-11-19'::date, null::text, null::text) $$,
  'every watched date is one diary row, with no place and no note'
);

-- 22b
select is(
  (select array_agg(distinct source) from public.watch_log where user_id = '00000000-0000-0000-0000-00000000000a'),
  array['import'],
  'and every one is an import row, not a log row (source, 20261013100000_movie_screens.sql)'
);

-- 23
select results_eq(
  $$ select media_item_id, status::text, finished_at, planned_on
       from public.user_entries
      where user_id = '00000000-0000-0000-0000-00000000000a'
      order by media_item_id $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid, 'played', '2024-08-09'::date, null::date),
            ('00000000-0000-0000-0000-0000000000a4'::uuid, 'played', '2023-11-19'::date, null::date),
            ('00000000-0000-0000-0000-0000000000a5'::uuid, 'played', null::date, null::date) $$,
  'watched films are played, finished on their latest watch by the diary, the plan the watch reached cleared; a skipped film gets no entry'
);

-- 24
select is(
  (select medium from public.user_entries where media_item_id = '00000000-0000-0000-0000-0000000000a1'),
  'movie'::public.medium,
  'the entry trigger derived the medium for the inserted rows'
);

-- 25
select results_eq(
  $$ select media_item_id from public.played_not_ranked('movie') $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid),
            ('00000000-0000-0000-0000-0000000000a4'::uuid),
            ('00000000-0000-0000-0000-0000000000a5'::uuid) $$,
  'the imported films wait in the Ranking banner''s drain, newest watch first'
);

-- 26
select results_eq(
  $$ select file_names, film_count, ranked_count, watched_count, unmatched_count, skipped_count, diary_count
       from public.letterboxd_imports where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  $$ values (array['ratings.csv', 'diary.csv'], 5, 0, 3, 1, 1, 3) $$,
  'the upload is recorded with its files and counts'
);

-- 27
select results_eq(
  $$ select title, outcome, tier::text, position, media_item_id, rating, watched_dates, rewatches
       from public.letterboxd_import_films
      where user_id = '00000000-0000-0000-0000-00000000000a'
      order by title $$,
  $$ values ('A Film Nobody Mirrored', 'unmatched', null::text, null::integer, null::uuid, 3.0::numeric(2,1), '{}'::date[], 0),
            ('Cats', 'watched', null::text, null::integer, '00000000-0000-0000-0000-0000000000a5'::uuid, 0.5::numeric(2,1), '{}'::date[], 0),
            ('Dune', 'watched', null::text, null::integer, '00000000-0000-0000-0000-0000000000a1'::uuid, 4.5::numeric(2,1), '{2024-03-01,2024-08-09}'::date[], 1),
            ('Everything Everywhere All at Once', 'watched', null::text, null::integer, '00000000-0000-0000-0000-0000000000a4'::uuid, null::numeric(2,1), '{2023-11-19}'::date[], 0),
            ('The Godfather: Part II', 'skipped', null::text, null::integer, '00000000-0000-0000-0000-0000000000a3'::uuid, 5.0::numeric(2,1), '{}'::date[], 0) $$,
  'every film of the upload is recorded with what the file said and what became of it, the rating kept though nothing was ranked'
);

-- 28
select results_eq(
  $$ select diary from public.apply_letterboxd_import(array['diary.csv'], (select films from default_films)) $$,
  $$ values (0) $$,
  'the same export again writes no diary row it already has'
);

-- 29
select is(
  (select count(*) from public.watch_log where user_id = '00000000-0000-0000-0000-00000000000a'),
  3::bigint,
  'and the diary still holds three watches'
);

-- 30
select throws_ok(
  $$ select * from public.apply_letterboxd_import(
       '{}'::text[],
       '[{"title":"Arrival","year":2016,"rating":4,"watched_dates":[],"rewatches":0,
          "media_item_id":"00000000-0000-0000-0000-0000000000a2","outcome":"ranked"}]'::jsonb) $$,
  '22023',
  'a film marked ranked needs the confirmed order in p_tiers',
  'without a confirmed order, a ranked film is refused: the database cannot rank by accident'
);

-- 31
select throws_ok(
  $$ select * from public.apply_letterboxd_import(
       '{}'::text[], '[]'::jsonb, null, array['00000000-0000-0000-0000-0000000000a2'::uuid]) $$,
  '22023',
  'p_moved needs the confirmed order in p_tiers',
  'and so is a dragged film'
);

-- Part D, the ranking the user chose and confirmed ---------------------------------

-- 32
select results_eq(
  $$ select ranked, watched, unmatched, skipped, diary from public.apply_letterboxd_import(
       array['ratings.csv'],
       '[
         {"letterboxd_uri":"https://boxd.it/1","title":"Dune","year":2021,"rating":4.5,
          "watched_dates":["2024-08-09"],"rewatches":0,
          "media_item_id":"00000000-0000-0000-0000-0000000000a1","outcome":"ranked"},
         {"letterboxd_uri":"https://boxd.it/2","title":"Arrival","year":2016,"rating":4,
          "watched_dates":[],"rewatches":0,
          "media_item_id":"00000000-0000-0000-0000-0000000000a2","outcome":"ranked"},
         {"letterboxd_uri":"https://boxd.it/5","title":"Cats","year":2019,"rating":0.5,
          "watched_dates":[],"rewatches":0,
          "media_item_id":"00000000-0000-0000-0000-0000000000a5","outcome":"ranked"},
         {"letterboxd_uri":"https://boxd.it/3","title":"The Godfather: Part II","year":1974,"rating":5,
          "watched_dates":[],"rewatches":0,
          "media_item_id":"00000000-0000-0000-0000-0000000000a3","outcome":"skipped"}
       ]'::jsonb,
       '{"loved":["00000000-0000-0000-0000-0000000000a1","00000000-0000-0000-0000-0000000000a6"],
         "liked":["00000000-0000-0000-0000-0000000000a2"],
         "fine":[],
         "disliked":["00000000-0000-0000-0000-0000000000a5"]}'::jsonb,
       array['00000000-0000-0000-0000-0000000000a2'::uuid]
     ) $$,
  $$ values (3, 0, 0, 1, 0) $$,
  'the confirmed import reports three ranked, one skipped, and no diary row it already had'
);

-- 33
select results_eq(
  $$ select r.tier::text, r.media_item_id, r.position, r.placed_by
       from public.ranking_entries r
      where r.user_id = '00000000-0000-0000-0000-00000000000a' and r.medium = 'movie'
      order by r.tier, r.position $$,
  $$ values ('loved', '00000000-0000-0000-0000-0000000000a1'::uuid, 0, 'prior'),
            ('loved', '00000000-0000-0000-0000-0000000000a6'::uuid, 1, 'user'),
            ('liked', '00000000-0000-0000-0000-0000000000a2'::uuid, 0, 'user'),
            ('disliked', '00000000-0000-0000-0000-0000000000a5'::uuid, 0, 'prior') $$,
  'the tiers read exactly as confirmed: the stars'' places are prior, the dragged one and the earned one user'
);

-- 34
select results_eq(
  $$ select media_item_id, placed_by from public.tier_list('movie', 'loved') $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid, 'prior'::text),
            ('00000000-0000-0000-0000-0000000000a6'::uuid, 'user'::text) $$,
  'tier_list carries the mark, so the review''s ≈ shows on an imported place'
);

-- 35
select is(
  (select placed_at from public.ranking_entries where media_item_id = '00000000-0000-0000-0000-0000000000a6'),
  '2020-01-01T00:00:00Z'::timestamptz,
  'moving the earned placement down one did not re-place it'
);

-- 36
select is(
  (select updated_at from public.ranking_entries where media_item_id = '00000000-0000-0000-0000-0000000000a6'),
  now(),
  'but it did count as a write'
);

-- 37
select is(
  (select placed_at from public.ranking_entries where media_item_id = '00000000-0000-0000-0000-0000000000a1'),
  now(),
  'an imported placement is placed now'
);

-- 38
select is(
  (select count(*) from public.ranking_entries
    where user_id = '00000000-0000-0000-0000-00000000000a' and medium = 'game'),
  0::bigint,
  'the game ranking is untouched'
);

-- The orders the write refuses. Each leaves the ranking exactly as test 33 read it.

-- 39
select throws_ok(
  $$ select * from public.apply_letterboxd_import(
       '{}'::text[], '[]'::jsonb,
       '{"loved":["00000000-0000-0000-0000-0000000000a6"],"liked":["00000000-0000-0000-0000-0000000000a2"],
         "fine":[],"disliked":["00000000-0000-0000-0000-0000000000a5"]}'::jsonb) $$,
  '22023',
  'the confirmed order leaves out 1 films already ranked',
  'an order that drops a ranked film is refused'
);

-- 40
select throws_ok(
  $$ select * from public.apply_letterboxd_import(
       '{}'::text[],
       '[{"title":"Dune","year":2021,"rating":5,"watched_dates":[],"rewatches":0,
          "media_item_id":"00000000-0000-0000-0000-0000000000a1","outcome":"ranked"}]'::jsonb,
       '{"loved":["00000000-0000-0000-0000-0000000000a1","00000000-0000-0000-0000-0000000000a6"],
         "liked":["00000000-0000-0000-0000-0000000000a2"],"fine":[],
         "disliked":["00000000-0000-0000-0000-0000000000a5"]}'::jsonb) $$,
  '22023',
  'a film the caller already ranked cannot be imported as ranked; its place stays',
  're-importing a film already ranked is refused'
);

-- 41
select throws_ok(
  $$ select * from public.apply_letterboxd_import(
       '{}'::text[],
       '[{"title":"Dune","year":2021,"rating":5,"watched_dates":[],"rewatches":0,
          "media_item_id":"00000000-0000-0000-0000-0000000000b1","outcome":"ranked"}]'::jsonb,
       '{"loved":["00000000-0000-0000-0000-0000000000b1","00000000-0000-0000-0000-0000000000a1","00000000-0000-0000-0000-0000000000a6"],
         "liked":["00000000-0000-0000-0000-0000000000a2"],"fine":[],
         "disliked":["00000000-0000-0000-0000-0000000000a5"]}'::jsonb) $$,
  '22023',
  'every matched film must be a movie in the catalog',
  'a game in the order is refused'
);

-- 42
select throws_ok(
  $$ select * from public.apply_letterboxd_import(
       '{}'::text[], '[]'::jsonb,
       '{"loved":["00000000-0000-0000-0000-0000000000a1","00000000-0000-0000-0000-0000000000a6","00000000-0000-0000-0000-0000000000a3"],
         "liked":["00000000-0000-0000-0000-0000000000a2"],"fine":[],
         "disliked":["00000000-0000-0000-0000-0000000000a5"]}'::jsonb) $$,
  '22023',
  '1 films in the confirmed order are neither ranked nor in the import',
  'an order with a film that is neither ranked nor imported is refused'
);

-- 43
select throws_ok(
  $$ select * from public.apply_letterboxd_import(
       '{}'::text[], '[]'::jsonb,
       '{"best":["00000000-0000-0000-0000-0000000000a1"]}'::jsonb) $$,
  '22023',
  'p_tiers has unknown tiers: best',
  'an unknown tier name is refused'
);

-- 44
select throws_ok(
  $$ select * from public.apply_letterboxd_import(
       '{}'::text[], '[]'::jsonb,
       '{"loved":["00000000-0000-0000-0000-0000000000a1","00000000-0000-0000-0000-0000000000a6"],
         "liked":["00000000-0000-0000-0000-0000000000a2","00000000-0000-0000-0000-0000000000a1"],"fine":[],
         "disliked":["00000000-0000-0000-0000-0000000000a5"]}'::jsonb) $$,
  '22023',
  '1 films appear more than once in the confirmed order',
  'a film listed twice is refused'
);

-- 45
select throws_ok(
  $$ select * from public.apply_letterboxd_import(
       '{}'::text[], '[]'::jsonb,
       '{"loved":["00000000-0000-0000-0000-0000000000a1","00000000-0000-0000-0000-0000000000a6"],
         "liked":["00000000-0000-0000-0000-0000000000a2"],"fine":[],
         "disliked":["00000000-0000-0000-0000-0000000000a5"]}'::jsonb,
       array['00000000-0000-0000-0000-0000000000a6'::uuid]) $$,
  '22023',
  'p_moved may only name films imported as ranked',
  'a drag mark on a film the import did not rank is refused'
);

-- 46
select is(
  (select count(*) from public.letterboxd_imports where user_id = '00000000-0000-0000-0000-00000000000a'),
  3::bigint,
  'none of the refused calls recorded an upload'
);

-- A call with no films and a complete order is a reorder of what is there.

-- 47
select results_eq(
  $$ select ranked from public.apply_letterboxd_import(
       '{}'::text[], '[]'::jsonb,
       '{"loved":["00000000-0000-0000-0000-0000000000a6","00000000-0000-0000-0000-0000000000a1"],
         "liked":["00000000-0000-0000-0000-0000000000a2"],"fine":[],
         "disliked":["00000000-0000-0000-0000-0000000000a5"]}'::jsonb) $$,
  $$ values (0) $$,
  'a call that imports nothing still accepts a complete order'
);

-- 48
select results_eq(
  $$ select media_item_id, position, placed_by from public.ranking_entries
      where user_id = '00000000-0000-0000-0000-00000000000a' and tier = 'loved'
      order by position $$,
  $$ values ('00000000-0000-0000-0000-0000000000a6'::uuid, 0, 'user'),
            ('00000000-0000-0000-0000-0000000000a1'::uuid, 1, 'prior') $$,
  'and applies it, each row keeping its mark'
);

-- Part E, isolation ----------------------------------------------------------------

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

-- 49
select is(
  (select count(*) from public.letterboxd_imports)
    + (select count(*) from public.letterboxd_import_films)
    + (select count(*) from public.watch_log),
  0::bigint,
  'B sees none of A''s import records and none of the diary rows A''s import wrote'
);

-- 50
select throws_ok(
  $$ insert into public.letterboxd_imports (user_id, file_names)
     values ('00000000-0000-0000-0000-00000000000a', '{}') $$,
  '42501',
  null,
  'B cannot write an import record in A''s name'
);

-- 51
select results_eq(
  $$ select ranked from public.apply_letterboxd_import(
       array['ratings.csv'],
       '[{"title":"Arrival","year":2016,"rating":3,"watched_dates":[],"rewatches":0,
          "media_item_id":"00000000-0000-0000-0000-0000000000a2","outcome":"ranked"}]'::jsonb,
       '{"loved":[],"liked":[],"fine":["00000000-0000-0000-0000-0000000000a2"],"disliked":[]}'::jsonb) $$,
  $$ values (1) $$,
  'B imports with an order that is complete for B, whatever A has ranked'
);

-- 52
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is(
  (select count(*) from public.ranking_entries where user_id = '00000000-0000-0000-0000-00000000000a' and medium = 'movie')
    + (select count(*) from public.letterboxd_imports),
  4::bigint + 4::bigint,
  'A''s ranking and records are untouched by B''s import'
);

-- 53
reset role;
set local request.jwt.claims to '{}';
select throws_ok(
  $$ select * from public.apply_letterboxd_import('{}'::text[], '[]'::jsonb) $$,
  '28000',
  null,
  'signed out, the write is refused before it reads anything'
);

-- The deferred unique constraint on (user_id, medium, tier, position) is
-- checked at commit, and this suite rolls back. Forcing it here proves the
-- renumbering left every tier consistent; a failure aborts the run rather
-- than failing a test.
set constraints all immediate;

select * from finish();
rollback;
