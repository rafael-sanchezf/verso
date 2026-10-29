-- pgTAP tests for supabase/migrations/20261028100000_insert_ranking_entry_prediction.sql.
-- Run with: supabase test db
--
-- Four things are under test:
--
-- 1. **The grant state**: insert_ranking_entry keeps its signature, security
--    invoker and pinned search_path, and is executable by signed-in users and
--    the service role, never anon. The grant stays because finish_insertion,
--    security invoker, places through it as the signed-in user: with
--    authenticated's grant gone, finish_insertion fails with 42501.
-- 2. **A direct call logs**: exactly one prediction_log row for the item,
--    surface insertion, content-v1, source user (batch for a 'prior' place),
--    placed_by, the list size before the placement, and the guess the helper
--    gave before the item landed; the placement itself unchanged. Also when
--    another function that is not finish_insertion is the caller.
-- 3. **finish_insertion still writes one row, not two**: its nested call to
--    insert_ranking_entry leaves the row to finish_insertion, with or without
--    comparisons, for a user or a prior place.
-- 4. **Refusals and isolation**: an item already ranked or not in the catalog
--    raises as before and leaves no row; a second user sees none of the
--    first user's rows.
--
-- Users act through `set local role authenticated` plus a forged
-- request.jwt.claims, as a supabase-js call would. The games have no details
-- and no year, so they carry no feature and no prior row: every guess is the
-- default prior of 6.5, needs_more_data, and the rows can be checked by hand.
-- Ids are in the ...238 range, for VER-238.

begin;
select plan(24);

-- ==============================================================================
-- Fixture
-- ==============================================================================

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000238a', 'direct-a@example.com'),
  ('00000000-0000-0000-0000-00000000238b', 'direct-b@example.com');

insert into public.media_items (id, medium, title, year)
select ('00000000-0000-0000-0000-0000002380a' || i)::uuid, 'game', 'Direct Plain ' || i, null
from generate_series(1, 8) as i;

-- ==============================================================================
-- 1. The grant state
-- ==============================================================================

-- 1
select is(
  (select pg_get_function_arguments('public.insert_ranking_entry(uuid,public.medium,public.tier,integer,text)'::regprocedure)),
  'p_media_item_id uuid, p_medium medium, p_tier tier, p_position integer, p_placed_by text DEFAULT ''user''::text',
  'insert_ranking_entry keeps its exact signature'
);

-- 2
select ok(
  (select not p.prosecdef and p.proconfig = array['search_path=public, extensions']
     from pg_proc p where p.oid = 'public.insert_ranking_entry(uuid,public.medium,public.tier,integer,text)'::regprocedure),
  'insert_ranking_entry is still security invoker with its pinned search_path'
);

-- 3
select ok(
  has_function_privilege('authenticated', 'public.insert_ranking_entry(uuid,public.medium,public.tier,integer,text)', 'execute')
  and has_function_privilege('service_role', 'public.insert_ranking_entry(uuid,public.medium,public.tier,integer,text)', 'execute')
  and not has_function_privilege('anon', 'public.insert_ranking_entry(uuid,public.medium,public.tier,integer,text)', 'execute')
  and not has_function_privilege('public', 'public.insert_ranking_entry(uuid,public.medium,public.tier,integer,text)', 'execute'),
  'insert_ranking_entry: signed-in users and the service role, never anon or public'
);

-- 4
select ok(
  exists (select 1 from pg_proc p where p.proname = 'finish_insertion' and p.pronamespace = 'public'::regnamespace)
  and not exists (
    select 1 from pg_proc p
    where p.proname = 'finish_insertion' and p.pronamespace = 'public'::regnamespace and p.prosecdef
  ),
  'finish_insertion is security invoker, so its nested call needs authenticated''s grant'
);

-- ==============================================================================
-- 2. A direct call logs
-- ==============================================================================

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000238a","role":"authenticated"}';

-- 5
select is(
  public.insert_ranking_entry('00000000-0000-0000-0000-0000002380a1', 'game', 'loved', 0),
  0,
  'a direct call into an empty tier lands at position 0, as before'
);

-- 6
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
      where user_id = '00000000-0000-0000-0000-00000000238a'
        and media_item_id = '00000000-0000-0000-0000-0000002380a1' $$,
  $$ values ('game', 'insertion', 6.50::numeric, 'needs_more_data', 'content-v1',
             0, null::text, 6.5::numeric, 'default', null::text, 'user', 'user') $$,
  'and writes the row finish_insertion would: the prior, no content score, no mean, list size 0, source user'
);

-- What the engine says about the second game before it lands.
create temp table guess_a2 on commit drop as
select * from public.insertion_predictions('game', array['00000000-0000-0000-0000-0000002380a2'::uuid]);

-- 7
select is(
  public.insert_ranking_entry('00000000-0000-0000-0000-0000002380a2', 'game', 'loved', 0),
  0,
  'a second direct call at the front of the tier'
);

-- 8
select results_eq(
  $$ select l.predicted_score, l.confidence,
            (l.components ->> 'list_size')::integer,
            (l.components ->> 'prior_score')::numeric,
            (l.components ->> 'mean_baseline')::numeric,
            l.components ->> 'predicted_tier'
       from public.prediction_log l
      where l.user_id = '00000000-0000-0000-0000-00000000238a'
        and l.media_item_id = '00000000-0000-0000-0000-0000002380a2' $$,
  $$ select g.predicted_score, g.confidence, g.list_size, g.prior_score, g.mean_baseline, g.predicted_tier::text
       from guess_a2 g $$,
  'the row holds the guess the helper gave before the game landed, at list size 1 with the first game''s score as the mean'
);

-- 9
select results_eq(
  $$ select media_item_id, position, placed_by from public.tier_list('game', 'loved') $$,
  $$ values ('00000000-0000-0000-0000-0000002380a2'::uuid, 0, 'user'::text),
            ('00000000-0000-0000-0000-0000002380a1'::uuid, 1, 'user'::text) $$,
  'the placement is unchanged: the second game is in front and the first shifted down'
);

-- 10
select is(
  public.insert_ranking_entry('00000000-0000-0000-0000-0000002380a3', 'game', 'fine', 0, 'prior'),
  0,
  'a direct call with the prior mark places'
);

-- 11
select results_eq(
  $$ select components ->> 'source', components ->> 'placed_by', (components ->> 'list_size')::integer
       from public.prediction_log
      where user_id = '00000000-0000-0000-0000-00000000238a'
        and media_item_id = '00000000-0000-0000-0000-0000002380a3' $$,
  $$ values ('batch', 'prior', 2) $$,
  'and logs source batch, as finish_insertion maps a prior place'
);

-- Called from inside another function: pgTAP's lives_ok runs the statement
-- from its own PL/pgSQL frame, which is not finish_insertion.

-- 12
select lives_ok(
  $$ select public.insert_ranking_entry('00000000-0000-0000-0000-0000002380a4', 'game', 'liked', 0) $$,
  'a direct call made from inside another function places'
);

-- 13
select is(
  (select count(*) from public.prediction_log
    where user_id = '00000000-0000-0000-0000-00000000238a'
      and media_item_id = '00000000-0000-0000-0000-0000002380a4'),
  1::bigint,
  'and writes its row too: only finish_insertion as the caller skips it'
);

-- ==============================================================================
-- 3. finish_insertion still writes one row, not two
-- ==============================================================================

-- 14
select is(
  public.finish_insertion('00000000-0000-0000-0000-0000002380a5', 'game', 'liked', 1, '[]'::jsonb),
  1,
  'finish_insertion with no comparisons places through insert_ranking_entry'
);

-- 15
select results_eq(
  $$ select count(*)::integer, min(components ->> 'source'), min(components ->> 'placed_by')
       from public.prediction_log
      where user_id = '00000000-0000-0000-0000-00000000238a'
        and media_item_id = '00000000-0000-0000-0000-0000002380a5' $$,
  $$ values (1, 'user', 'user') $$,
  'and its item has exactly one row, source user: the nested call wrote none'
);

-- 16
select is(
  public.finish_insertion(
    '00000000-0000-0000-0000-0000002380a6', 'game', 'loved', 1,
    '[{"item_a":"00000000-0000-0000-0000-0000002380a6","item_b":"00000000-0000-0000-0000-0000002380a2","outcome":"b","context":{}},
      {"item_a":"00000000-0000-0000-0000-0000002380a6","item_b":"00000000-0000-0000-0000-0000002380a1","outcome":"a","context":{}}]'::jsonb
  ),
  1,
  'finish_insertion with answers lands where they put it'
);

-- 17
select is(
  (select count(*) from public.prediction_log
    where user_id = '00000000-0000-0000-0000-00000000238a'
      and media_item_id = '00000000-0000-0000-0000-0000002380a6'),
  1::bigint,
  'one row for it as well'
);

-- 18
select is(
  public.finish_insertion('00000000-0000-0000-0000-0000002380a7', 'game', 'fine', 1, '[]'::jsonb, 'prior'),
  1,
  'finish_insertion with the prior mark places'
);

-- 19
select results_eq(
  $$ select count(*)::integer, min(components ->> 'source'), min(components ->> 'placed_by')
       from public.prediction_log
      where user_id = '00000000-0000-0000-0000-00000000238a'
        and media_item_id = '00000000-0000-0000-0000-0000002380a7' $$,
  $$ values (1, 'batch', 'prior') $$,
  'and one row, source batch'
);

-- 20
select is(
  (select count(*) from public.prediction_log where user_id = '00000000-0000-0000-0000-00000000238a'),
  7::bigint,
  'seven placements, seven rows: four direct, three through finish_insertion'
);

-- ==============================================================================
-- 4. Refusals and isolation
-- ==============================================================================

-- 21
select throws_ok(
  $$ select public.insert_ranking_entry('00000000-0000-0000-0000-0000002380a1', 'game', 'disliked', 0) $$,
  '23505',
  null,
  'a game already ranked is refused as before'
);

-- 22
select throws_ok(
  $$ select public.insert_ranking_entry('00000000-0000-0000-0000-0000002380ff', 'game', 'loved', 0) $$,
  '22023',
  null,
  'an id the catalog does not have is refused as before'
);

-- 23
select is(
  (select count(*) from public.prediction_log where user_id = '00000000-0000-0000-0000-00000000238a'),
  7::bigint,
  'and neither refusal left a row'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000238b","role":"authenticated"}';

select public.insert_ranking_entry('00000000-0000-0000-0000-0000002380a8', 'game', 'loved', 0);

-- 24
select results_eq(
  $$ select user_id, media_item_id, (components ->> 'list_size')::integer from public.prediction_log $$,
  $$ values ('00000000-0000-0000-0000-00000000238b'::uuid, '00000000-0000-0000-0000-0000002380a8'::uuid, 0) $$,
  'B sees only their own row, made from their own empty list, and none of A''s'
);

select * from finish();
rollback;
