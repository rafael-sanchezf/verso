-- pgTAP tests for supabase/migrations/20261015120000_insertion_predictions.sql.
-- Run with: supabase test db
--
-- Six things are under test, in the migration's order:
--
-- 1. **The surface**: prediction_log accepts 'insertion' and still refuses an
--    unknown surface.
-- 2. **The functions' shape**: finish_insertion's signature, invoker setting,
--    search_path and grants unchanged; insertion_predictions definer, pinned,
--    for signed-in users only, 28000 without a user; ranking_tier_for_score
--    still closed to signed-in users.
-- 3. **A normal insertion**: exactly one row per call, with the medium, item,
--    source user, placed_by and the list size before the placement; the guess
--    equals the harness's leave-one-out prediction for the item; the first
--    insertion of an empty list carries the prior and no content score or
--    mean; and the placement is the one the arguments ask for, with the
--    comparison log written as before.
-- 4. **The other paths**: a provisional batch place writes source batch; the
--    Letterboxd import writes one row per film it places, source import, with
--    the list size before the import and each film's mark, and none for a
--    film it only moves.
-- 5. **Isolation**: a second user sees none of the first user's rows, in the
--    log or the view, and the helper answers from their own list.
-- 6. **prediction_calibration**: the bands and the errors on a fixture whose
--    scores are known to the decimal, the provisional place left out until
--    the user settles it, the import's dragged film in and its star-placed
--    film out; and the view's invoker setting and grants.
--
-- Users act through `set local role authenticated` plus a forged
-- request.jwt.claims, so every call goes through the grants and Row Level
-- Security as a supabase-js call would. Ids are in the ...233 range, for
-- VER-233.
--
-- The calibration fixture (user C) uses games with no details and no year, so
-- they carry no content feature, no prior row and no external score: the
-- profile is empty, every guess is the default prior of 6.5, and every number
-- in the view can be worked by hand. User A's games carry genres, so A's
-- guesses have a content score; those are checked against the internal
-- scorer called live, never as a hardcoded number, because the idf behind
-- them depends on the catalog.

begin;
select plan(46);

-- ==============================================================================
-- Fixture
-- ==============================================================================

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000233a', 'insertion-a@example.com'),
  ('00000000-0000-0000-0000-00000000233b', 'insertion-b@example.com'),
  ('00000000-0000-0000-0000-00000000233c', 'insertion-c@example.com'),
  ('00000000-0000-0000-0000-00000000233d', 'insertion-d@example.com'),
  ('00000000-0000-0000-0000-00000000233e', 'insertion-e@example.com');

-- A's games: two roguelikes and two shooters to rank, a third roguelike to
-- insert into that list.
insert into public.media_items (id, medium, title, year, external_ids) values
  ('00000000-0000-0000-0000-0000002330a1', 'game', 'Insertion Rogue One', 1990, '{"igdb": -923301}'),
  ('00000000-0000-0000-0000-0000002330a2', 'game', 'Insertion Rogue Two', 1990, '{"igdb": -923302}'),
  ('00000000-0000-0000-0000-0000002330a3', 'game', 'Insertion Shooter One', 1990, '{"igdb": -923303}'),
  ('00000000-0000-0000-0000-0000002330a4', 'game', 'Insertion Shooter Two', 1990, '{"igdb": -923304}'),
  ('00000000-0000-0000-0000-0000002330a5', 'game', 'Insertion Rogue Three', 1990, '{"igdb": -923305}');

insert into public.game_details (media_item_id, igdb_id, genres, platforms) values
  ('00000000-0000-0000-0000-0000002330a1', -923301, '{"Insertion Roguelike Test"}', '{"Insertion Test PS5"}'),
  ('00000000-0000-0000-0000-0000002330a2', -923302, '{"Insertion Roguelike Test"}', '{"Insertion Test PS5"}'),
  ('00000000-0000-0000-0000-0000002330a3', -923303, '{"Insertion Shooter Test"}', '{"Insertion Test PS5"}'),
  ('00000000-0000-0000-0000-0000002330a4', -923304, '{"Insertion Shooter Test"}', '{"Insertion Test PS5"}'),
  ('00000000-0000-0000-0000-0000002330a5', -923305, '{"Insertion Roguelike Test"}', '{"Insertion Test PS5"}');

-- C's and D's games: no details, no year, so no feature and no prior row.
insert into public.media_items (id, medium, title, year)
select ('00000000-0000-0000-0000-0000002330c' || i)::uuid, 'game', 'Insertion Plain ' || i, null
from generate_series(1, 6) as i;

-- E's films.
insert into public.media_items (id, medium, title, year, external_ids) values
  ('00000000-0000-0000-0000-0000002330e1', 'movie', 'Insertion Film One', null, '{"tmdb": -923311}'),
  ('00000000-0000-0000-0000-0000002330e2', 'movie', 'Insertion Film Two', null, '{"tmdb": -923312}'),
  ('00000000-0000-0000-0000-0000002330e3', 'movie', 'Insertion Film Three', null, '{"tmdb": -923313}');

-- ==============================================================================
-- 1 and 2. Structure
-- ==============================================================================

-- 1
select is(
  (select pg_get_function_arguments('public.finish_insertion(uuid,public.medium,public.tier,integer,jsonb,text,text)'::regprocedure)),
  'p_media_item_id uuid, p_medium medium, p_tier tier, p_position integer, p_comparisons jsonb, p_placed_by text DEFAULT ''user''::text, p_source text DEFAULT ''user''::text',
  'finish_insertion keeps its arguments, with the optional source of 20261028110000_batch_insertion_source.sql last'
);

-- 2
select ok(
  (select not p.prosecdef and p.proconfig = array['search_path=public, extensions']
     from pg_proc p where p.oid = 'public.finish_insertion(uuid,public.medium,public.tier,integer,jsonb,text,text)'::regprocedure),
  'finish_insertion is still security invoker with its pinned search_path'
);

-- 3
select ok(
  has_function_privilege('authenticated', 'public.finish_insertion(uuid,public.medium,public.tier,integer,jsonb,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.finish_insertion(uuid,public.medium,public.tier,integer,jsonb,text,text)', 'execute'),
  'finish_insertion keeps its grants: signed-in users, not anon'
);

-- 4
select ok(
  (select p.prosecdef and p.proconfig = array['search_path=public, extensions']
     from pg_proc p where p.oid = 'public.insertion_predictions(public.medium,uuid[])'::regprocedure),
  'insertion_predictions is security definer with a pinned search_path, as batch_predictions is'
);

-- 5
select ok(
  has_function_privilege('authenticated', 'public.insertion_predictions(public.medium,uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.insertion_predictions(public.medium,uuid[])', 'execute'),
  'insertion_predictions is for signed-in users only'
);

-- 6
select ok(
  not has_function_privilege('authenticated', 'public.ranking_tier_for_score(numeric)', 'execute')
  and not has_function_privilege('authenticated', 'public.recommendation_scores(uuid,public.medium,uuid[],uuid)', 'execute'),
  'the scorer and ranking_tier_for_score stay closed to signed-in users'
);

-- 7
select ok(
  (select 'security_invoker=true' = any (coalesce(c.reloptions, '{}'))
     from pg_class c where c.oid = 'public.prediction_calibration'::regclass),
  'prediction_calibration runs as the caller'
);

-- 8
select ok(
  has_table_privilege('authenticated', 'public.prediction_calibration', 'select')
  and not has_table_privilege('anon', 'public.prediction_calibration', 'select'),
  'prediction_calibration is readable by signed-in users and not by anon'
);

-- 9
select is(
  (select proconfig from pg_proc where oid = 'public.apply_letterboxd_import(text[], jsonb, jsonb, uuid[])'::regprocedure),
  array['search_path=public, extensions'],
  'the restated import still pins its search_path'
);

-- ==============================================================================
-- 1. The surface
-- ==============================================================================

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000233b","role":"authenticated"}';

-- 10
select lives_ok(
  $$ insert into public.prediction_log (medium, media_item_id, surface, predicted_score, confidence, model_version)
     values ('game', '00000000-0000-0000-0000-0000002330a5', 'insertion', 7.5, 'medium', 'content-v1') $$,
  'prediction_log accepts surface insertion'
);

-- 11
select throws_ok(
  $$ insert into public.prediction_log (medium, media_item_id, surface, predicted_score, confidence, model_version)
     values ('game', '00000000-0000-0000-0000-0000002330a5', 'bogus', 7.5, 'medium', 'content-v1') $$,
  '23514',
  null,
  'and still refuses a surface it does not know'
);

-- ==============================================================================
-- 3. A normal insertion
-- ==============================================================================

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000233a","role":"authenticated"}';

-- The first insertion of an empty list.
select public.finish_insertion('00000000-0000-0000-0000-0000002330a1', 'game', 'loved', 0, '[]'::jsonb);

-- 12
select results_eq(
  $$ select medium::text, surface, predicted_score, confidence, model_version,
            (components ->> 'list_size')::integer,
            components ->> 'content_score',
            (components ->> 'prior_score')::numeric,
            components ->> 'prior_from',
            components ->> 'mean_baseline',
            components ->> 'source',
            components ->> 'placed_by'
       from public.prediction_log
      where user_id = '00000000-0000-0000-0000-00000000233a'
        and media_item_id = '00000000-0000-0000-0000-0000002330a1' $$,
  $$ values ('game', 'insertion', 6.50::numeric, 'needs_more_data', 'content-v1',
             0, null::text, 6.5::numeric, 'default', null::text, 'user', 'user') $$,
  'the first insertion of an empty list writes the prior, a null content score and no mean, at list size 0'
);

-- Three more, so A has a profile: the roguelikes loved, the shooters fine.
select public.finish_insertion('00000000-0000-0000-0000-0000002330a2', 'game', 'loved', 1, '[]'::jsonb);
select public.finish_insertion('00000000-0000-0000-0000-0000002330a3', 'game', 'fine', 0, '[]'::jsonb);
select public.finish_insertion('00000000-0000-0000-0000-0000002330a4', 'game', 'fine', 1, '[]'::jsonb);

-- 13
select is(
  (select count(*) from public.prediction_log where user_id = '00000000-0000-0000-0000-00000000233a'),
  4::bigint,
  'four insertions, four rows'
);

-- What the engine says about the third roguelike before it lands, as the
-- helper reports it.
create temp table guess_a5 on commit drop as
select * from public.insertion_predictions('game', array['00000000-0000-0000-0000-0000002330a5'::uuid]);

-- 14
select is(
  public.finish_insertion(
    '00000000-0000-0000-0000-0000002330a5', 'game', 'loved', 1,
    '[{"item_a":"00000000-0000-0000-0000-0000002330a5","item_b":"00000000-0000-0000-0000-0000002330a1","outcome":"b",
       "context":{"tier":"loved","sameGenre":true,"tierSize":2,"pivotReason":{"kind":"genre","genre":"Insertion Roguelike Test"}}},
      {"item_a":"00000000-0000-0000-0000-0000002330a5","item_b":"00000000-0000-0000-0000-0000002330a2","outcome":"a",
       "context":{"tier":"loved","sameGenre":true,"tierSize":2,"pivotReason":{"kind":"genre","genre":"Insertion Roguelike Test"}}}]'::jsonb
  ),
  1,
  'finish_insertion returns the position the arguments ask for'
);

-- 15
select results_eq(
  $$ select media_item_id, position, placed_by from public.tier_list('game', 'loved') $$,
  $$ values ('00000000-0000-0000-0000-0000002330a1'::uuid, 0, 'user'::text),
            ('00000000-0000-0000-0000-0000002330a5'::uuid, 1, 'user'::text),
            ('00000000-0000-0000-0000-0000002330a2'::uuid, 2, 'user'::text) $$,
  'the placement is unchanged: the new game lands between the two it was compared with'
);

-- 16
select is(
  (select count(*) from public.comparisons
    where user_id = '00000000-0000-0000-0000-00000000233a'
      and item_a = '00000000-0000-0000-0000-0000002330a5'),
  2::bigint,
  'and its two answers are in the comparison log, as before'
);

-- 17
select is(
  (select count(*) from public.prediction_log
    where user_id = '00000000-0000-0000-0000-00000000233a'
      and media_item_id = '00000000-0000-0000-0000-0000002330a5'),
  1::bigint,
  'one insertion writes exactly one row for its item'
);

-- 18
select results_eq(
  $$ select medium::text, surface, (components ->> 'list_size')::integer, components ->> 'source', components ->> 'placed_by'
       from public.prediction_log
      where user_id = '00000000-0000-0000-0000-00000000233a'
        and media_item_id = '00000000-0000-0000-0000-0000002330a5' $$,
  $$ values ('game', 'insertion', 4, 'user', 'user') $$,
  'surface insertion, the right medium, source user, and list_size the four ranked before it'
);

-- 19
select results_eq(
  $$ select l.predicted_score, l.confidence,
            (l.components ->> 'content_score')::numeric,
            (l.components ->> 'prior_score')::numeric,
            (l.components ->> 'mean_baseline')::numeric,
            l.components ->> 'predicted_tier'
       from public.prediction_log l
      where l.user_id = '00000000-0000-0000-0000-00000000233a'
        and l.media_item_id = '00000000-0000-0000-0000-0000002330a5' $$,
  $$ select g.predicted_score, g.confidence, g.content_score, g.prior_score, g.mean_baseline, g.predicted_tier::text
       from guess_a5 g $$,
  'the row holds the guess the helper gave before the game landed'
);

-- 20
select is(
  (select (components ->> 'mean_baseline')::numeric from public.prediction_log
    where user_id = '00000000-0000-0000-0000-00000000233a'
      and media_item_id = '00000000-0000-0000-0000-0000002330a5'),
  7.23::numeric,
  'the mean baseline is the list before it: 10, 8.5, 6.4 and 4.0 average 7.23'
);

-- 21
select ok(
  (select (components ->> 'content_score') is not null from public.prediction_log
    where user_id = '00000000-0000-0000-0000-00000000233a'
      and media_item_id = '00000000-0000-0000-0000-0000002330a5'),
  'with a profile behind it, the guess has a content score'
);

-- ==============================================================================
-- 5. Isolation
-- ==============================================================================

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000233b","role":"authenticated"}';

select public.finish_insertion('00000000-0000-0000-0000-0000002330a1', 'game', 'liked', 0, '[]'::jsonb);

-- 22
select is(
  (select count(*) from public.prediction_log where user_id = '00000000-0000-0000-0000-00000000233a'),
  0::bigint,
  'B sees none of A''s predictions'
);

-- 23
select is(
  (select count(*) from public.prediction_log where surface = 'insertion'),
  2::bigint,
  'B sees their own two: the one logged by hand and their insertion'
);

-- 24
select is(
  (select count(*) from public.prediction_calibration where user_id <> '00000000-0000-0000-0000-00000000233b'),
  0::bigint,
  'and nobody else''s calibration'
);

-- 25
select is(
  (select list_size from public.insertion_predictions('game', array['00000000-0000-0000-0000-0000002330a5'::uuid])),
  1,
  'the helper answers from B''s list of one, not A''s five'
);

-- 26
select throws_ok(
  $$ insert into public.prediction_log (user_id, medium, media_item_id, surface, predicted_score, confidence, model_version)
     values ('00000000-0000-0000-0000-00000000233a', 'game', '00000000-0000-0000-0000-0000002330a5', 'insertion', 7.5,
             'medium', 'content-v1') $$,
  '42501',
  null,
  'B cannot log an insertion guess as A'
);

-- ==============================================================================
-- 6. prediction_calibration on a fixture worked by hand (user C)
-- ==============================================================================
--
-- Five plain games appended to Loved, then a sixth alone in Fine. With no
-- features the profile is empty, so every guess is the default prior, 6.5,
-- which reads as Liked. At the end Loved holds five: 10, 9.6, 9.3, 8.9, 8.5;
-- the Fine game is the band's midpoint, 5.2.
--
--   item  list before   mean before   final   |6.5 - final|   |mean - final|
--   c1    0             (none)        10      3.5             -
--   c2    1             9.3           9.6     3.1             0.3
--   c3    2             9.25          9.3     2.8             0.05
--   c4    3             9.27          8.9     2.4             0.37
--   c5    4             9.25          8.5     2.0             0.75
--   c6    5             9.26          5.2     1.3             4.06
--
-- Under 5: n 5, needs_more_data, mean error of the guess 13.8 / 5 = 2.76, of
-- the mean 1.47 / 4 = 0.3675, so 0.368, no tier hit. 5 to 9: n 1, medium,
-- errors 1.3, 4.06 and 1.3, no tier hit.

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000233c","role":"authenticated"}';

select public.finish_insertion('00000000-0000-0000-0000-0000002330c1', 'game', 'loved', null, '[]'::jsonb);
select public.finish_insertion('00000000-0000-0000-0000-0000002330c2', 'game', 'loved', null, '[]'::jsonb);
select public.finish_insertion('00000000-0000-0000-0000-0000002330c3', 'game', 'loved', null, '[]'::jsonb);
select public.finish_insertion('00000000-0000-0000-0000-0000002330c4', 'game', 'loved', null, '[]'::jsonb);
select public.finish_insertion('00000000-0000-0000-0000-0000002330c5', 'game', 'loved', null, '[]'::jsonb);

select public.finish_insertion('00000000-0000-0000-0000-0000002330c6', 'game', 'fine', 0, '[]'::jsonb);

-- 27
select results_eq(
  $$ select (components ->> 'list_size')::integer, (components ->> 'mean_baseline')::numeric
       from public.prediction_log
      where user_id = '00000000-0000-0000-0000-00000000233c'
      order by (components ->> 'list_size')::integer $$,
  $$ values (0, null::numeric), (1, 9.3), (2, 9.25), (3, 9.27), (4, 9.25), (5, 9.26) $$,
  'each guess records the list size and the mean before its placement'
);

-- 28
select results_eq(
  $$ select list_size_band, list_size_min, confidence, source, n, tier_hit_rate,
            mae_predicted, mae_content, mae_user_mean, mae_prior
       from public.prediction_calibration
      where user_id = '00000000-0000-0000-0000-00000000233c'
      order by list_size_min $$,
  $$ values ('under 5', 0, 'needs_more_data', 'user', 5, 0.000, 2.760, null::numeric, 0.368, 2.760),
            ('5 to 9', 5, 'medium', 'user', 1, 0.000, 1.300, null::numeric, 4.060, 1.300) $$,
  'the calibration reports both bands with the errors worked by hand'
);

-- 29
select results_eq(
  $$ select medium::text, model_version from public.prediction_calibration
      where user_id = '00000000-0000-0000-0000-00000000233c' group by 1, 2 $$,
  $$ values ('game', 'content-v1') $$,
  'per medium and model version'
);

-- A's sixth row: the third roguelike landed in Loved, the guess it was given
-- is checked against its current score, read here independently.

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000233a","role":"authenticated"}';

-- 30
select results_eq(
  $$ select c.n, c.mae_predicted
       from public.prediction_calibration c
      where c.user_id = '00000000-0000-0000-0000-00000000233a' and c.list_size_min = 0 and c.confidence = 'needs_more_data' $$,
  $$ select count(*)::integer, round(avg(abs(l.predicted_score - p.score)), 3)
       from public.prediction_log l
       join public.ranking_percentiles p on p.user_id = l.user_id and p.media_item_id = l.media_item_id
      where l.user_id = '00000000-0000-0000-0000-00000000233a' $$,
  'A''s five guesses, all under five, are averaged against the scores the list shows now'
);

-- ==============================================================================
-- 4 and 6. The batch path, and the provisional place left out (user D)
-- ==============================================================================

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000233d","role":"authenticated"}';

select public.finish_insertion('00000000-0000-0000-0000-0000002330c1', 'game', 'liked', 0, '[]'::jsonb, 'user');
select public.finish_insertion('00000000-0000-0000-0000-0000002330c2', 'game', 'liked', 1, '[]'::jsonb, 'prior');

-- 31
select results_eq(
  $$ select media_item_id, (components ->> 'list_size')::integer, components ->> 'source', components ->> 'placed_by'
       from public.prediction_log
      where user_id = '00000000-0000-0000-0000-00000000233d'
      order by (components ->> 'list_size')::integer $$,
  $$ values ('00000000-0000-0000-0000-0000002330c1'::uuid, 0, 'user', 'user'),
            ('00000000-0000-0000-0000-0000002330c2'::uuid, 1, 'batch', 'prior') $$,
  'a provisional batch place writes source batch with placed_by prior'
);

-- 32
select results_eq(
  $$ select source, n from public.prediction_calibration
      where user_id = '00000000-0000-0000-0000-00000000233d' order by source $$,
  $$ values ('user', 1) $$,
  'the provisional place is left out of the calibration'
);

select public.move_ranking_entry('00000000-0000-0000-0000-0000002330c2', 'liked', 0);

-- 33
select results_eq(
  $$ select source, n, mae_predicted from public.prediction_calibration
      where user_id = '00000000-0000-0000-0000-00000000233d' order by source $$,
  $$ values ('batch', 1, 1.900), ('user', 1, 0.000) $$,
  'once the user drags it, it counts as batch: guessed 6.5, now 8.4 at the top of Liked; the other is 6.5 at its bottom'
);

-- 34
select is(
  (select count(*) from public.prediction_log where user_id = '00000000-0000-0000-0000-00000000233d'),
  2::bigint,
  'a move writes no prediction'
);

-- ==============================================================================
-- 4 and 6. The import path (user E)
-- ==============================================================================

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000233e","role":"authenticated"}';

select public.finish_insertion('00000000-0000-0000-0000-0000002330e1', 'movie', 'loved', 0, '[]'::jsonb);

-- 35
select results_eq(
  $$ select ranked from public.apply_letterboxd_import(
       array['ratings.csv'],
       '[
         {"title":"Insertion Film Two","year":null,"rating":4.5,"watched_dates":[],"rewatches":0,
          "media_item_id":"00000000-0000-0000-0000-0000002330e2","outcome":"ranked"},
         {"title":"Insertion Film Three","year":null,"rating":3,"watched_dates":[],"rewatches":0,
          "media_item_id":"00000000-0000-0000-0000-0000002330e3","outcome":"ranked"}
       ]'::jsonb,
       '{"loved":["00000000-0000-0000-0000-0000002330e2","00000000-0000-0000-0000-0000002330e1"],
         "liked":["00000000-0000-0000-0000-0000002330e3"],
         "fine":[],
         "disliked":[]}'::jsonb,
       array['00000000-0000-0000-0000-0000002330e3'::uuid]
     ) $$,
  $$ values (2) $$,
  'the import ranks its two films, the first above the film already ranked'
);

-- 36
select results_eq(
  $$ select media_item_id, medium::text, surface, (components ->> 'list_size')::integer,
            components ->> 'source', components ->> 'placed_by'
       from public.prediction_log
      where user_id = '00000000-0000-0000-0000-00000000233e'
      order by components ->> 'source', media_item_id $$,
  $$ values ('00000000-0000-0000-0000-0000002330e2'::uuid, 'movie', 'insertion', 1, 'import', 'prior'),
            ('00000000-0000-0000-0000-0000002330e3'::uuid, 'movie', 'insertion', 1, 'import', 'user'),
            ('00000000-0000-0000-0000-0000002330e1'::uuid, 'movie', 'insertion', 0, 'user', 'user') $$,
  'one row per film the import placed, source import, list_size the one film before it, each with its mark; the moved film gets none'
);

-- 37
select results_eq(
  $$ select (components ->> 'mean_baseline')::numeric, (components ->> 'prior_score')::numeric, confidence
       from public.prediction_log
      where user_id = '00000000-0000-0000-0000-00000000233e' and components ->> 'source' = 'import'
      order by media_item_id $$,
  $$ values (9.30, 6.5, 'needs_more_data'), (9.30, 6.5, 'needs_more_data') $$,
  'both guesses are made from the list before the file: the lone Loved film at 9.3'
);

-- 38
select results_eq(
  $$ select source, n from public.prediction_calibration
      where user_id = '00000000-0000-0000-0000-00000000233e' order by source $$,
  $$ values ('import', 1), ('user', 1) $$,
  'the dragged film counts, the star-placed one waits'
);

-- 39
select results_eq(
  $$ select r.media_item_id, r.tier::text, r.position
       from public.ranking_entries r
      where r.user_id = '00000000-0000-0000-0000-00000000233e'
      order by r.tier, r.position $$,
  $$ values ('00000000-0000-0000-0000-0000002330e2'::uuid, 'loved', 0),
            ('00000000-0000-0000-0000-0000002330e1'::uuid, 'loved', 1),
            ('00000000-0000-0000-0000-0000002330e3'::uuid, 'liked', 0) $$,
  'and the import placed the films exactly as confirmed'
);

-- 40
select results_eq(
  $$ select ranked from public.apply_letterboxd_import(
       array['watched.csv'],
       '[{"title":"Insertion Film Three","year":null,"rating":null,"watched_dates":[],"rewatches":0,
          "media_item_id":"00000000-0000-0000-0000-0000002330e3","outcome":"watched"}]'::jsonb
     ) $$,
  $$ values (0) $$,
  'an import that ranks nothing'
);

-- 41
select is(
  (select count(*) from public.prediction_log where user_id = '00000000-0000-0000-0000-00000000233e'),
  3::bigint,
  'writes no prediction'
);

-- ==============================================================================
-- Errors
-- ==============================================================================

-- 42
select throws_ok(
  $$ select public.finish_insertion('00000000-0000-0000-0000-0000002330e1', 'movie', 'liked', 0, '[]'::jsonb) $$,
  '23505',
  null,
  'a refused placement raises what it always raised'
);

-- 43
select throws_ok(
  $$ select public.finish_insertion('00000000-0000-0000-0000-0000002330e2', 'game', 'liked', 0, '[]'::jsonb) $$,
  '22023',
  null,
  'an item of another medium is still 22023 from the placement, not a failure of the guess'
);

-- 44
select is(
  (select count(*) from public.prediction_log where user_id = '00000000-0000-0000-0000-00000000233e'),
  3::bigint,
  'and the refused calls left no row'
);

-- 45
select throws_ok(
  $$ select * from public.insertion_predictions(null, array['00000000-0000-0000-0000-0000002330e1'::uuid]) $$,
  '22023',
  null,
  'the helper needs a medium'
);

set local request.jwt.claims to '{"role":"authenticated"}';

-- 46
select throws_ok(
  $$ select * from public.insertion_predictions('game', array['00000000-0000-0000-0000-0000002330a5'::uuid]) $$,
  '28000',
  null,
  'and a user'
);

reset role;

select * from finish();
rollback;
