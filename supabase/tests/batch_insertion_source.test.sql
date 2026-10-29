-- pgTAP tests for supabase/migrations/20261028110000_batch_insertion_source.sql.
-- Run with: supabase test db
--
-- Four things are under test:
--
-- 1. **The shape**: finish_insertion takes p_source as an optional seventh
--    argument defaulting to user, the six-argument function is gone, and the
--    invoker setting, search_path and grants are as before.
-- 2. **The source in the row**: a game the batch session's answers placed
--    logs source batch with placed_by user; a provisional one logs batch and
--    prior; a call that sends no source, user, or null logs user; a prior
--    place logs batch whatever the source; the named-argument call PostgREST
--    makes reaches it; the comparisons and the placement are written as
--    before.
-- 3. **Refusals**: a source other than user or batch raises 22023 before
--    anything is written.
-- 4. **prediction_calibration**: the answers' batch games count under batch
--    and the log flow's under user, the provisional ones stay out until the
--    user settles them, and then join batch; and a second user sees none of
--    it.
--
-- Users act through `set local role authenticated` plus a forged
-- request.jwt.claims, as a supabase-js call would. The games have no details
-- and no year, so every guess is the default prior. Rows are counted per item,
-- never in total, so another file's fixtures cannot move a number here. Ids
-- are in the ...237 range, for VER-237.

begin;
select plan(26);

-- ==============================================================================
-- Fixture
-- ==============================================================================

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000237a', 'batch-source-a@example.com'),
  ('00000000-0000-0000-0000-00000000237b', 'batch-source-b@example.com');

insert into public.media_items (id, medium, title, year)
select ('00000000-0000-0000-0000-0000002370a' || i)::uuid, 'game', 'Batch Source Plain ' || i, null
from generate_series(1, 9) as i;

-- ==============================================================================
-- 1. The shape
-- ==============================================================================

-- 1
select ok(
  to_regprocedure('public.finish_insertion(uuid,public.medium,public.tier,integer,jsonb,text,text)') is not null
  and to_regprocedure('public.finish_insertion(uuid,public.medium,public.tier,integer,jsonb,text)') is null,
  'finish_insertion takes the source as a seventh argument, and the six-argument function is gone'
);

-- 2
select is(
  (select pg_get_function_arguments('public.finish_insertion(uuid,public.medium,public.tier,integer,jsonb,text,text)'::regprocedure)),
  'p_media_item_id uuid, p_medium medium, p_tier tier, p_position integer, p_comparisons jsonb, p_placed_by text DEFAULT ''user''::text, p_source text DEFAULT ''user''::text',
  'the source is optional and defaults to user, so every existing caller makes the call it made'
);

-- 3
select ok(
  (select not p.prosecdef and p.proconfig = array['search_path=public, extensions']
     from pg_proc p where p.oid = 'public.finish_insertion(uuid,public.medium,public.tier,integer,jsonb,text,text)'::regprocedure),
  'finish_insertion is still security invoker with its pinned search_path'
);

-- 4
select ok(
  has_function_privilege('authenticated', 'public.finish_insertion(uuid,public.medium,public.tier,integer,jsonb,text,text)', 'execute')
  and has_function_privilege('service_role', 'public.finish_insertion(uuid,public.medium,public.tier,integer,jsonb,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.finish_insertion(uuid,public.medium,public.tier,integer,jsonb,text,text)', 'execute')
  and not has_function_privilege('public', 'public.finish_insertion(uuid,public.medium,public.tier,integer,jsonb,text,text)', 'execute'),
  'finish_insertion: signed-in users and the service role, never anon or public'
);

-- 5
select matches(
  col_description('public.prediction_calibration'::regclass,
    (select a.attnum from pg_attribute a where a.attrelid = 'public.prediction_calibration'::regclass and a.attname = 'source')::integer),
  'batch \(the batch session: games its answers placed',
  'the view''s source column says what batch now covers'
);

-- ==============================================================================
-- 2. The source in the row
-- ==============================================================================

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000237a","role":"authenticated"}';

-- The log flow's call, as it was: no mark, no source.
select public.finish_insertion('00000000-0000-0000-0000-0000002370a1', 'game', 'loved', 0, '[]'::jsonb);

-- 6
select results_eq(
  $$ select components ->> 'source', components ->> 'placed_by'
       from public.prediction_log
      where user_id = '00000000-0000-0000-0000-00000000237a'
        and media_item_id = '00000000-0000-0000-0000-0000002370a1' $$,
  $$ values ('user', 'user') $$,
  'a call that sends no source logs user, as the log flow always has'
);

-- 7
select is(
  public.finish_insertion(
    '00000000-0000-0000-0000-0000002370a2', 'game', 'loved', 1,
    '[{"item_a":"00000000-0000-0000-0000-0000002370a2","item_b":"00000000-0000-0000-0000-0000002370a1","outcome":"b","context":{"tier":"loved"}}]'::jsonb,
    'user', 'batch'
  ),
  1,
  'a batch game its answers placed lands where they put it'
);

-- 8
select results_eq(
  $$ select count(*)::integer, min(components ->> 'source'), min(components ->> 'placed_by'), min((components ->> 'list_size')::integer)
       from public.prediction_log
      where user_id = '00000000-0000-0000-0000-00000000237a'
        and media_item_id = '00000000-0000-0000-0000-0000002370a2' $$,
  $$ values (1, 'batch', 'user', 1) $$,
  'and logs one row, source batch, placed_by user, from the list of one before it'
);

-- 9
select is(
  (select count(*) from public.comparisons
    where user_id = '00000000-0000-0000-0000-00000000237a'
      and item_a = '00000000-0000-0000-0000-0000002370a2'),
  1::bigint,
  'its answer is in the comparison log, as before'
);

-- 10
select results_eq(
  $$ select media_item_id, position, placed_by from public.tier_list('game', 'loved') $$,
  $$ values ('00000000-0000-0000-0000-0000002370a1'::uuid, 0, 'user'::text),
            ('00000000-0000-0000-0000-0000002370a2'::uuid, 1, 'user'::text) $$,
  'and the placement is the one the arguments ask for'
);

select public.finish_insertion('00000000-0000-0000-0000-0000002370a3', 'game', 'fine', 0, '[]'::jsonb, 'prior', 'batch');

-- 11
select results_eq(
  $$ select components ->> 'source', components ->> 'placed_by'
       from public.prediction_log
      where user_id = '00000000-0000-0000-0000-00000000237a'
        and media_item_id = '00000000-0000-0000-0000-0000002370a3' $$,
  $$ values ('batch', 'prior') $$,
  'a provisional batch place logs batch and prior'
);

select public.finish_insertion('00000000-0000-0000-0000-0000002370a4', 'game', 'fine', 1, '[]'::jsonb, 'user', 'user');
select public.finish_insertion('00000000-0000-0000-0000-0000002370a5', 'game', 'liked', 0, '[]'::jsonb, 'user', null);

-- 12
select results_eq(
  $$ select media_item_id, components ->> 'source'
       from public.prediction_log
      where user_id = '00000000-0000-0000-0000-00000000237a'
        and media_item_id in ('00000000-0000-0000-0000-0000002370a4', '00000000-0000-0000-0000-0000002370a5')
      order by media_item_id $$,
  $$ values ('00000000-0000-0000-0000-0000002370a4'::uuid, 'user'), ('00000000-0000-0000-0000-0000002370a5'::uuid, 'user') $$,
  'an explicit user source and a null one both log user, the way a null mark is user'
);

select public.finish_insertion('00000000-0000-0000-0000-0000002370a6', 'game', 'liked', 1, '[]'::jsonb, 'prior', 'user');

-- 13
select results_eq(
  $$ select components ->> 'source', components ->> 'placed_by'
       from public.prediction_log
      where user_id = '00000000-0000-0000-0000-00000000237a'
        and media_item_id = '00000000-0000-0000-0000-0000002370a6' $$,
  $$ values ('batch', 'prior') $$,
  'a prior place logs batch whatever the source says: only the batch session places by the prior'
);

-- What the engine says about the seventh game before it lands.
create temp table guess_a7 on commit drop as
select * from public.insertion_predictions('game', array['00000000-0000-0000-0000-0000002370a7'::uuid]);

-- 14
select is(
  public.finish_insertion(
    p_media_item_id => '00000000-0000-0000-0000-0000002370a7',
    p_medium => 'game',
    p_tier => 'liked',
    p_position => 2,
    p_comparisons => '[]'::jsonb,
    p_source => 'batch'
  ),
  2,
  'the named-argument call PostgREST makes, with the source and no mark, reaches it'
);

-- 15
select results_eq(
  $$ select components ->> 'source', components ->> 'placed_by'
       from public.prediction_log
      where user_id = '00000000-0000-0000-0000-00000000237a'
        and media_item_id = '00000000-0000-0000-0000-0000002370a7' $$,
  $$ values ('batch', 'user') $$,
  'and logs batch with the mark''s default, user'
);

-- 16
select results_eq(
  $$ select l.predicted_score, l.confidence, l.model_version,
            (l.components ->> 'list_size')::integer,
            (l.components ->> 'prior_score')::numeric,
            l.components ->> 'prior_from'
       from public.prediction_log l
      where l.user_id = '00000000-0000-0000-0000-00000000237a'
        and l.media_item_id = '00000000-0000-0000-0000-0000002370a7' $$,
  $$ select g.predicted_score, g.confidence, 'content-v1'::text, g.list_size, g.prior_score, g.prior_from
       from guess_a7 g $$,
  'the rest of the row is written as before: the helper''s guess, content-v1, the six ranked before it'
);

-- ==============================================================================
-- 3. Refusals
-- ==============================================================================

-- 17
select throws_ok(
  $$ select public.finish_insertion(
       '00000000-0000-0000-0000-0000002370a8', 'game', 'disliked', 0,
       '[{"item_a":"00000000-0000-0000-0000-0000002370a8","item_b":"00000000-0000-0000-0000-0000002370a1","outcome":"b","context":{}}]'::jsonb,
       'user', 'import') $$,
  '22023',
  'p_source must be user or batch, not import',
  'import is the Letterboxd path''s own source and finish_insertion refuses it'
);

-- 18
select throws_ok(
  $$ select public.finish_insertion('00000000-0000-0000-0000-0000002370a8', 'game', 'disliked', 0, '[]'::jsonb, 'user', 'session') $$,
  '22023',
  null,
  'and any other word'
);

-- 19
select ok(
  not exists (select 1 from public.ranking_entries where media_item_id = '00000000-0000-0000-0000-0000002370a8')
  and not exists (select 1 from public.prediction_log where media_item_id = '00000000-0000-0000-0000-0000002370a8')
  and not exists (select 1 from public.comparisons where item_a = '00000000-0000-0000-0000-0000002370a8'),
  'a refused source writes nothing: no placement, no row, no comparison'
);

-- ==============================================================================
-- 4. prediction_calibration
-- ==============================================================================

-- 20
select results_eq(
  $$ select source, sum(n)::integer
       from public.prediction_calibration
      where user_id = '00000000-0000-0000-0000-00000000237a'
      group by source
      order by source $$,
  $$ values ('batch', 2), ('user', 3) $$,
  'the answers'' two batch games count under batch, the three user calls under user, the two provisional ones nowhere'
);

-- The user settles the provisional place in the fine tier.
select public.move_ranking_entry('00000000-0000-0000-0000-0000002370a3', 'fine', 1);

-- 21
select is(
  (select placed_by from public.ranking_entries where media_item_id = '00000000-0000-0000-0000-0000002370a3'),
  'user',
  'the move settles it'
);

-- 22
select results_eq(
  $$ select source, sum(n)::integer
       from public.prediction_calibration
      where user_id = '00000000-0000-0000-0000-00000000237a'
      group by source
      order by source $$,
  $$ values ('batch', 3), ('user', 3) $$,
  'and it joins the batch rows, not the user rows'
);

-- 23
select is(
  (select count(*) from public.prediction_log
    where user_id = '00000000-0000-0000-0000-00000000237a'
      and media_item_id in (
        '00000000-0000-0000-0000-0000002370a1', '00000000-0000-0000-0000-0000002370a2',
        '00000000-0000-0000-0000-0000002370a3', '00000000-0000-0000-0000-0000002370a4',
        '00000000-0000-0000-0000-0000002370a5', '00000000-0000-0000-0000-0000002370a6',
        '00000000-0000-0000-0000-0000002370a7')),
  7::bigint,
  'seven placements, seven rows: the source adds none'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000237b","role":"authenticated"}';

select public.finish_insertion('00000000-0000-0000-0000-0000002370a9', 'game', 'loved', 0, '[]'::jsonb, 'user', 'batch');

-- 24
select is(
  (select count(*) from public.prediction_log where user_id = '00000000-0000-0000-0000-00000000237a'),
  0::bigint,
  'B sees none of A''s rows'
);

-- 25
select results_eq(
  $$ select media_item_id, components ->> 'source' from public.prediction_log $$,
  $$ values ('00000000-0000-0000-0000-0000002370a9'::uuid, 'batch') $$,
  'and B''s own batch game reads batch'
);

-- 26
select is(
  (select count(*) from public.prediction_calibration where user_id <> '00000000-0000-0000-0000-00000000237b'),
  0::bigint,
  'and none of A''s calibration'
);

select * from finish();
rollback;
