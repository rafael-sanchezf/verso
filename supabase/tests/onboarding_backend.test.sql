-- pgTAP tests for supabase/migrations/20261007120000_onboarding_backend.sql.
-- Run with: supabase test db
--
-- Seven things are under test, in the migration's order:
--
-- 1. **profiles.platforms and profiles.media**: their types and defaults, the
--    checks that refuse an empty answer, a null and a blank, and the owner-only
--    update.
-- 2. **The provisional mark**: placed_by's column and check; the new
--    signatures of insert_ranking_entry and finish_insertion with the old
--    overloads gone; the mark written, defaulted and refused; the shifts that
--    leave a neighbour's mark alone; move_ranking_entry resetting the moved
--    row; tier_list returning it; and the grants and search_path of every
--    function the migration dropped and created.
-- 3. **events**: RLS from its first migration, owner insert and read only, no
--    update and no delete, the insert grant limited to kind and payload, the
--    checks, and the cascade from auth.users.
-- 4. **deck_candidates**: the platform filter, both exclusions (an entry of any
--    status, a ranking), the popularity order and rank across pages, the
--    clamps, the boost against the profile computed independently, and user B
--    answered from B's state alone.
-- 5. **batch_predictions**: the caller's own numbers, equal to the internal
--    scorer's for the caller and different from another user's, the order
--    given, what is left out, and the size cap.
-- 6. **played_not_ranked**: the rows, newest first, per medium, per user.
-- 7. Every new function: 28000 without a user, 42501 for anon, the definer or
--    invoker setting and the pinned search_path.
--
-- Users act through `set local role authenticated` plus a forged
-- request.jwt.claims, so every call goes through the grants and Row Level
-- Security as a supabase-js call would. The fixture's platforms and genres
-- start with "Deck" and end in "Test", its IGDB and TMDB ids are negative, and
-- its rating counts are in the trillions, so none of it meets a mirrored
-- catalog and the deck's fixture games lead any page even on a database that
-- carries one. Anything that depends on the size of the catalog (the idf
-- inside a boost) is asserted by sign or against the internal functions
-- called live, never as a hardcoded number. Ids are in the ...036 range, for
-- item 36.

begin;
select plan(118);

-- ==============================================================================
-- 1. profiles.platforms and profiles.media: structure
-- ==============================================================================

-- 1
select has_column('public', 'profiles', 'platforms', 'profiles has platforms');

-- 2
select ok(
  (select atttypid from pg_attribute where attrelid = 'public.profiles'::regclass and attname = 'platforms')
    = 'text[]'::regtype,
  'profiles.platforms is text[]: IGDB names, as game_details.platforms spells them'
);

-- 3
select col_not_null('public', 'profiles', 'platforms', 'profiles.platforms is not null');

-- 4
select col_default_is('public', 'profiles', 'platforms', '{}', 'profiles.platforms defaults to empty: not answered, or skipped');

-- 5
select has_column('public', 'profiles', 'media', 'profiles has media');

-- 6
select ok(
  (select atttypid from pg_attribute where attrelid = 'public.profiles'::regclass and attname = 'media')
    = 'public.medium[]'::regtype,
  'profiles.media is public.medium[]'
);

-- 7
select col_is_null('public', 'profiles', 'media', 'profiles.media is nullable: null means the questionnaire is unanswered');

-- ==============================================================================
-- 2. placed_by and the ranking functions: structure
-- ==============================================================================

-- 8
select has_column('public', 'ranking_entries', 'placed_by', 'ranking_entries has placed_by');

-- 9
select col_not_null('public', 'ranking_entries', 'placed_by', 'placed_by is not null');

-- 10
select col_default_is('public', 'ranking_entries', 'placed_by', 'user', 'placed_by defaults to user, which every earlier row was');

-- 11
select ok(
  to_regprocedure('public.insert_ranking_entry(uuid,public.medium,public.tier,integer,text)') is not null
  and to_regprocedure('public.insert_ranking_entry(uuid,public.medium,public.tier,integer)') is null,
  'insert_ranking_entry takes the mark as a fifth argument, and the four-argument overload is gone'
);

-- 12
select ok(
  to_regprocedure('public.finish_insertion(uuid,public.medium,public.tier,integer,jsonb,text)') is not null
  and to_regprocedure('public.finish_insertion(uuid,public.medium,public.tier,integer,jsonb)') is null,
  'finish_insertion takes the mark as a sixth argument, and the five-argument overload is gone'
);

-- 13
select is(
  (select pg_get_function_arguments('public.finish_insertion(uuid,public.medium,public.tier,integer,jsonb,text)'::regprocedure)),
  'p_media_item_id uuid, p_medium medium, p_tier tier, p_position integer, p_comparisons jsonb, p_placed_by text DEFAULT ''user''::text',
  'finish_insertion''s mark is optional and defaults to user, so every existing caller makes the call it made'
);

-- 14
select matches(
  pg_get_function_result('public.tier_list(public.medium,public.tier)'::regprocedure),
  'played_platforms text\[\], placed_by text\)$',
  'tier_list returns placed_by, last, after the played-on list'
);

-- 15 to 18: the four ranking functions are security invoker with a pinned search_path.
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.insert_ranking_entry(uuid,public.medium,public.tier,integer,text)'::regprocedure),
  false,
  'insert_ranking_entry is security invoker'
);
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.finish_insertion(uuid,public.medium,public.tier,integer,jsonb,text)'::regprocedure),
  false,
  'finish_insertion is security invoker'
);
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.move_ranking_entry(uuid,public.tier,integer)'::regprocedure),
  false,
  'move_ranking_entry is security invoker'
);
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.tier_list(public.medium,public.tier)'::regprocedure),
  false,
  'tier_list is security invoker'
);

-- 19
select ok(
  (select bool_and(p.proconfig @> array['search_path=public, extensions'])
     from pg_proc p
    where p.oid in (
      'public.insert_ranking_entry(uuid,public.medium,public.tier,integer,text)'::regprocedure,
      'public.finish_insertion(uuid,public.medium,public.tier,integer,jsonb,text)'::regprocedure,
      'public.move_ranking_entry(uuid,public.tier,integer)'::regprocedure,
      'public.tier_list(public.medium,public.tier)'::regprocedure
    )),
  'all four pin their search_path: the drops took it and the creates put it back'
);

-- 20
select ok(
  not has_function_privilege('anon', 'public.insert_ranking_entry(uuid,public.medium,public.tier,integer,text)', 'execute')
  and has_function_privilege('authenticated', 'public.insert_ranking_entry(uuid,public.medium,public.tier,integer,text)', 'execute')
  and has_function_privilege('service_role', 'public.insert_ranking_entry(uuid,public.medium,public.tier,integer,text)', 'execute'),
  'insert_ranking_entry: authenticated and service_role, never anon'
);

-- 21
select ok(
  not has_function_privilege('anon', 'public.finish_insertion(uuid,public.medium,public.tier,integer,jsonb,text)', 'execute')
  and has_function_privilege('authenticated', 'public.finish_insertion(uuid,public.medium,public.tier,integer,jsonb,text)', 'execute')
  and has_function_privilege('service_role', 'public.finish_insertion(uuid,public.medium,public.tier,integer,jsonb,text)', 'execute'),
  'finish_insertion: authenticated and service_role, never anon'
);

-- 22
select ok(
  not has_function_privilege('anon', 'public.move_ranking_entry(uuid,public.tier,integer)', 'execute')
  and has_function_privilege('authenticated', 'public.move_ranking_entry(uuid,public.tier,integer)', 'execute')
  and has_function_privilege('service_role', 'public.move_ranking_entry(uuid,public.tier,integer)', 'execute'),
  'move_ranking_entry: authenticated and service_role, never anon'
);

-- 23
select ok(
  not has_function_privilege('anon', 'public.tier_list(public.medium,public.tier)', 'execute')
  and has_function_privilege('authenticated', 'public.tier_list(public.medium,public.tier)', 'execute')
  and has_function_privilege('service_role', 'public.tier_list(public.medium,public.tier)', 'execute'),
  'tier_list: authenticated and service_role, never anon'
);

-- ==============================================================================
-- 3. events: structure
-- ==============================================================================

-- 24
select has_table('public', 'events', 'events exists');

-- 25
select ok(
  (select relrowsecurity from pg_class where oid = 'public.events'::regclass),
  'RLS is on for events from its first migration'
);

-- 26
select policies_are(
  'public', 'events',
  array['users read their own events', 'users log their own events'],
  'events has an owner read policy and an owner insert policy, and no update or delete policy'
);

-- 27
select ok(
  has_table_privilege('authenticated', 'public.events', 'select')
  and not has_table_privilege('authenticated', 'public.events', 'update')
  and not has_table_privilege('authenticated', 'public.events', 'delete'),
  'signed-in users may read events and may neither update nor delete one'
);

-- 28
select ok(
  has_column_privilege('authenticated', 'public.events', 'kind', 'insert')
  and has_column_privilege('authenticated', 'public.events', 'payload', 'insert')
  and not has_column_privilege('authenticated', 'public.events', 'user_id', 'insert')
  and not has_column_privilege('authenticated', 'public.events', 'created_at', 'insert')
  and not has_column_privilege('authenticated', 'public.events', 'id', 'insert'),
  'the insert grant is kind and payload only: the user, the id and the clock come from the defaults'
);

-- 29
select ok(
  not has_table_privilege('anon', 'public.events', 'select')
  and not has_table_privilege('anon', 'public.events', 'insert'),
  'anon has no privilege on events at all'
);

-- ==============================================================================
-- 4 to 6. The three new functions: structure
-- ==============================================================================

-- 30
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.deck_candidates(text[],integer,integer,public.medium)'::regprocedure),
  true,
  'deck_candidates is security definer: the content profile is service role only'
);

-- 31
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.batch_predictions(public.medium,uuid[])'::regprocedure),
  true,
  'batch_predictions is security definer, for the same reason'
);

-- 32
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.played_not_ranked(public.medium)'::regprocedure),
  false,
  'played_not_ranked is security invoker: the owner-only policies decide its rows'
);

-- 33
select ok(
  (select bool_and(p.proconfig @> array['search_path=public, extensions'])
     from pg_proc p
    where p.oid in (
      'public.deck_candidates(text[],integer,integer,public.medium)'::regprocedure,
      'public.batch_predictions(public.medium,uuid[])'::regprocedure,
      'public.played_not_ranked(public.medium)'::regprocedure
    )),
  'all three pin their search_path, which a definer function must'
);

-- 34
select ok(
  not has_function_privilege('anon', 'public.deck_candidates(text[],integer,integer,public.medium)', 'execute')
  and has_function_privilege('authenticated', 'public.deck_candidates(text[],integer,integer,public.medium)', 'execute')
  and has_function_privilege('service_role', 'public.deck_candidates(text[],integer,integer,public.medium)', 'execute'),
  'deck_candidates: authenticated and service_role, never anon'
);

-- 35
select ok(
  not has_function_privilege('anon', 'public.batch_predictions(public.medium,uuid[])', 'execute')
  and has_function_privilege('authenticated', 'public.batch_predictions(public.medium,uuid[])', 'execute')
  and has_function_privilege('service_role', 'public.batch_predictions(public.medium,uuid[])', 'execute'),
  'batch_predictions: authenticated and service_role, never anon'
);

-- 36
select ok(
  not has_function_privilege('anon', 'public.played_not_ranked(public.medium)', 'execute')
  and has_function_privilege('authenticated', 'public.played_not_ranked(public.medium)', 'execute')
  and has_function_privilege('service_role', 'public.played_not_ranked(public.medium)', 'execute'),
  'played_not_ranked: authenticated and service_role, never anon'
);

-- 37
select ok(
  not has_function_privilege('authenticated', 'public.recommendation_content_profile(uuid,public.medium,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.recommendation_scores(uuid,public.medium,uuid[],uuid)', 'execute'),
  'the content model stays closed to signed-in users: the two definer functions are the only way in'
);

-- ==============================================================================
-- Fixtures
-- ==============================================================================
--
-- User A has ranked five games across three tiers, which gives A a content
-- profile with a positive roguelike weight and a negative shooter weight:
--
--   loved     e1 Roguelike 10.0 (on Deck Test PS5, no entry), e2 Roguelike 8.5
--   fine      d3 Puzzle 5.2 (on Deck Test Switch, with a played entry)
--   disliked  e3 Shooter 3.9, e4 Shooter 0.0
--
-- and has a backlog entry for d4. User B has one played entry, p1, and no
-- ranking. User C has nothing.
--
-- The deck's games, by rating count (popularity):
--
--   e1  PS5           9000000000006   ranked by A, no entry
--   d1  PS5           9000000000005   Roguelike
--   d2  PS5, Switch   9000000000004   Shooter
--   d3  Switch        9000000000003   ranked by A, played entry
--   d4  PS5           9000000000002   A's backlog
--   d7  Other         9000000000001
--   d5  Switch        '' (null)       Roguelike and Shooter
--   d6  PS5           no key (null)   Plain
--
-- The ranked games other than d3 are from 1990 and the deck's from 2020, so no
-- decade feature reaches A's profile, and no fixture has a developer.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000036a', 'onboard-a@example.com'),
  ('00000000-0000-0000-0000-00000000036b', 'onboard-b@example.com'),
  ('00000000-0000-0000-0000-00000000036c', 'onboard-c@example.com');

insert into public.media_items (id, medium, title, year, cover_image_id, external_ids, metadata) values
  ('00000000-0000-0000-0000-0000000036e1', 'game', 'Deck Ranked One', 1990, 'coe1', '{"igdb": -936101}', '{"total_rating_count": 9000000000006}'),
  ('00000000-0000-0000-0000-0000000036e2', 'game', 'Deck Ranked Two', 1990, 'coe2', '{"igdb": -936102}', '{}'),
  ('00000000-0000-0000-0000-0000000036e3', 'game', 'Deck Ranked Three', 1990, 'coe3', '{"igdb": -936103}', '{}'),
  ('00000000-0000-0000-0000-0000000036e4', 'game', 'Deck Ranked Four', 1990, 'coe4', '{"igdb": -936104}', '{}'),
  ('00000000-0000-0000-0000-0000000036d1', 'game', 'Deck One', 2020, 'cod1', '{"igdb": -936001, "steam": 936001}', '{"total_rating_count": 9000000000005}'),
  ('00000000-0000-0000-0000-0000000036d2', 'game', 'Deck Two', 2020, 'cod2', '{"igdb": -936002}', '{"total_rating_count": 9000000000004}'),
  ('00000000-0000-0000-0000-0000000036d3', 'game', 'Deck Three', 2020, 'cod3', '{"igdb": -936003}', '{"total_rating_count": 9000000000003}'),
  ('00000000-0000-0000-0000-0000000036d4', 'game', 'Deck Four', 2020, 'cod4', '{"igdb": -936004}', '{"total_rating_count": 9000000000002}'),
  ('00000000-0000-0000-0000-0000000036d5', 'game', 'Deck Five', 2020, null, '{"igdb": -936005}', '{"total_rating_count": ""}'),
  ('00000000-0000-0000-0000-0000000036d6', 'game', 'Deck Six', 2020, 'cod6', '{"igdb": -936006}', '{}'),
  ('00000000-0000-0000-0000-0000000036d7', 'game', 'Deck Seven', 2020, 'cod7', '{"igdb": -936007}', '{"total_rating_count": 9000000000001}'),
  ('00000000-0000-0000-0000-0000000036f1', 'game', 'Drain One', 2019, 'cof1', '{"igdb": -936201}', '{}'),
  ('00000000-0000-0000-0000-0000000036f2', 'game', 'Drain Two', 2019, 'cof2', '{"igdb": -936202}', '{}'),
  ('00000000-0000-0000-0000-0000000036f3', 'game', 'Drain Three', 2019, 'cof3', '{"igdb": -936203}', '{}'),
  ('00000000-0000-0000-0000-0000000036f4', 'game', 'Drain Dropped', 2019, 'cof4', '{"igdb": -936204}', '{}'),
  ('00000000-0000-0000-0000-0000000036b1', 'movie', 'Drain Film', 2019, '/film.jpg', '{"tmdb": -936301}', '{}');

insert into public.game_details (media_item_id, igdb_id, genres, platforms) values
  ('00000000-0000-0000-0000-0000000036e1', -936101, '{"Deck Roguelike Test"}', '{"Deck Test PS5"}'),
  ('00000000-0000-0000-0000-0000000036e2', -936102, '{"Deck Roguelike Test"}', '{"Deck Test Ranked"}'),
  ('00000000-0000-0000-0000-0000000036e3', -936103, '{"Deck Shooter Test"}', '{"Deck Test Ranked"}'),
  ('00000000-0000-0000-0000-0000000036e4', -936104, '{"Deck Shooter Test"}', '{"Deck Test Ranked"}'),
  ('00000000-0000-0000-0000-0000000036d1', -936001, '{"Deck Roguelike Test"}', '{"Deck Test PS5"}'),
  ('00000000-0000-0000-0000-0000000036d2', -936002, '{"Deck Shooter Test"}', '{"Deck Test PS5","Deck Test Switch"}'),
  ('00000000-0000-0000-0000-0000000036d3', -936003, '{"Deck Puzzle Test"}', '{"Deck Test Switch"}'),
  ('00000000-0000-0000-0000-0000000036d4', -936004, '{"Deck Roguelike Test"}', '{"Deck Test PS5"}'),
  ('00000000-0000-0000-0000-0000000036d5', -936005, '{"Deck Roguelike Test","Deck Shooter Test"}', '{"Deck Test Switch"}'),
  ('00000000-0000-0000-0000-0000000036d6', -936006, '{"Deck Plain Test"}', '{"Deck Test PS5"}'),
  ('00000000-0000-0000-0000-0000000036d7', -936007, '{"Deck Roguelike Test"}', '{"Deck Test Other"}'),
  ('00000000-0000-0000-0000-0000000036f1', -936201, '{"Drain Test"}', '{"Deck Test Drain"}'),
  ('00000000-0000-0000-0000-0000000036f2', -936202, '{"Drain Test"}', '{"Deck Test Drain"}'),
  ('00000000-0000-0000-0000-0000000036f3', -936203, '{"Drain Test","Puzzle Drain Test"}', '{"Deck Test Drain","Deck Test Drain Two"}'),
  ('00000000-0000-0000-0000-0000000036f4', -936204, '{"Drain Test"}', '{"Deck Test Drain"}');

insert into public.movie_details (media_item_id, tmdb_id, genres) values
  ('00000000-0000-0000-0000-0000000036b1', -936301, '{"Drain Film Test"}');

-- Sixty more games on one platform, for the clamps and the ranks of a late page.
insert into public.media_items (id, medium, title, year)
select ('00000000-0000-0000-0036-' || lpad(i::text, 12, '0'))::uuid, 'game', 'Deck Bulk ' || i, null
from generate_series(1, 60) as i;

insert into public.game_details (media_item_id, igdb_id, genres, platforms)
select ('00000000-0000-0000-0036-' || lpad(i::text, 12, '0'))::uuid, -937000 - i, '{"Deck Bulk Test"}', '{"Deck Test Bulk"}'
from generate_series(1, 60) as i;

-- Two equal external scores, so the prior cannot tell d1 from d2 and only the
-- profile can.
insert into public.external_scores (media_item_id, source, score) values
  ('00000000-0000-0000-0000-0000000036d1', 'metacritic', 80),
  ('00000000-0000-0000-0000-0000000036d2', 'metacritic', 80);

-- A's entries: d3 played (and ranked below), d4 in the backlog, three played
-- and unranked games finished on different days or not at all, one dropped,
-- one film played. B has one played game.
insert into public.user_entries (user_id, media_item_id, status, finished_at) values
  ('00000000-0000-0000-0000-00000000036a', '00000000-0000-0000-0000-0000000036d3', 'played', '2026-10-01'),
  ('00000000-0000-0000-0000-00000000036a', '00000000-0000-0000-0000-0000000036d4', 'backlog', null),
  ('00000000-0000-0000-0000-00000000036a', '00000000-0000-0000-0000-0000000036f1', 'played', '2026-10-05'),
  ('00000000-0000-0000-0000-00000000036a', '00000000-0000-0000-0000-0000000036f2', 'played', '2026-10-06'),
  ('00000000-0000-0000-0000-00000000036a', '00000000-0000-0000-0000-0000000036f3', 'played', null),
  ('00000000-0000-0000-0000-00000000036a', '00000000-0000-0000-0000-0000000036f4', 'dropped', null),
  ('00000000-0000-0000-0000-00000000036a', '00000000-0000-0000-0000-0000000036b1', 'played', '2026-10-02'),
  ('00000000-0000-0000-0000-00000000036b', '00000000-0000-0000-0000-0000000036f1', 'played', '2026-09-01');

-- ==============================================================================
-- 1. profiles: behaviour
-- ==============================================================================

-- 38
select results_eq(
  $$ select platforms, media from public.profiles where id = '00000000-0000-0000-0000-00000000036c' $$,
  $$ values ('{}'::text[], null::public.medium[]) $$,
  'a new account''s profile has no platforms and no media: a new user, to the questionnaire'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000036a","role":"authenticated"}';

update public.profiles
   set platforms = array['PlayStation 5', 'PlayStation 4'], media = array['game', 'movie']::public.medium[]
 where id = '00000000-0000-0000-0000-00000000036a';

-- 39
select results_eq(
  $$ select platforms, media from public.profiles where id = '00000000-0000-0000-0000-00000000036a' $$,
  $$ values (array['PlayStation 5', 'PlayStation 4'], array['game', 'movie']::public.medium[]) $$,
  'the owner writes their platforms and media through the existing update policy'
);

-- 40
select throws_ok(
  $$ update public.profiles set media = '{}' where id = '00000000-0000-0000-0000-00000000036a' $$,
  '23514',
  null,
  'an empty media answer is refused: the questionnaire has no skip'
);

-- 41
select throws_ok(
  $$ update public.profiles set media = array[null]::public.medium[] where id = '00000000-0000-0000-0000-00000000036a' $$,
  '23514',
  null,
  'a null medium inside the answer is refused'
);

-- 42
select throws_ok(
  $$ update public.profiles set platforms = array['PlayStation 5', null] where id = '00000000-0000-0000-0000-00000000036a' $$,
  '23514',
  null,
  'a null platform is refused'
);

-- 43
select throws_ok(
  $$ update public.profiles set platforms = array[''] where id = '00000000-0000-0000-0000-00000000036a' $$,
  '23514',
  null,
  'a blank platform is refused'
);

-- 44
update public.profiles set media = array['tv']::public.medium[], platforms = array['Xbox']
  where id = '00000000-0000-0000-0000-00000000036b';
select is(
  (select media from public.profiles where id = '00000000-0000-0000-0000-00000000036b'),
  null::public.medium[],
  'user A''s update of user B''s profile touches nothing'
);

-- 45
select is(
  (select platforms from public.profiles where id = '00000000-0000-0000-0000-00000000036a'),
  array['PlayStation 5', 'PlayStation 4'],
  'and user A''s own row is what A wrote'
);

-- ==============================================================================
-- 2. The provisional mark: behaviour, as user A
-- ==============================================================================

-- A's loved tier: e1 by the user, e2 by the prior.

-- 46
select is(
  public.insert_ranking_entry('00000000-0000-0000-0000-0000000036e1', 'game', 'loved', 0),
  0,
  'insert_ranking_entry with four arguments still places, at the position asked'
);

-- 47
select is(
  (select placed_by from public.ranking_entries where media_item_id = '00000000-0000-0000-0000-0000000036e1'),
  'user',
  'and the row is placed_by user, the default'
);

-- 48
select is(
  public.insert_ranking_entry('00000000-0000-0000-0000-0000000036e2', 'game', 'loved', 1, 'prior'),
  1,
  'insert_ranking_entry takes the mark as its fifth argument'
);

-- 49
select is(
  (select placed_by from public.ranking_entries where media_item_id = '00000000-0000-0000-0000-0000000036e2'),
  'prior',
  'and records it'
);

-- 50
select throws_ok(
  $$ select public.insert_ranking_entry('00000000-0000-0000-0000-0000000036e3', 'game', 'disliked', 0, 'guess') $$,
  '22023',
  null,
  'a mark that is neither user nor prior is a bad argument'
);

-- 51
select is(
  (select count(*) from public.ranking_entries where media_item_id = '00000000-0000-0000-0000-0000000036e3'),
  0::bigint,
  'and nothing was placed'
);

-- 52
select is(
  public.insert_ranking_entry('00000000-0000-0000-0000-0000000036e3', 'game', 'disliked', 0, null),
  0,
  'a null mark places like a null position appends: as the default'
);

-- 53
select is(
  (select placed_by from public.ranking_entries where media_item_id = '00000000-0000-0000-0000-0000000036e3'),
  'user',
  'a null mark is user'
);

-- 54
select throws_ok(
  $$ select public.finish_insertion(
       '00000000-0000-0000-0000-0000000036e4', 'game', 'disliked', 1,
       '[{"item_a": "00000000-0000-0000-0000-0000000036e4", "item_b": "00000000-0000-0000-0000-0000000036e3", "outcome": "b", "context": {}}]'::jsonb,
       'maybe') $$,
  '22023',
  null,
  'finish_insertion refuses a bad mark'
);

-- 55
select is(
  (select count(*) from public.comparisons where item_a = '00000000-0000-0000-0000-0000000036e4'),
  0::bigint,
  'before writing a single comparison'
);

-- 56
select is(
  public.finish_insertion(
    '00000000-0000-0000-0000-0000000036e4', 'game', 'disliked', 1,
    '[{"item_a": "00000000-0000-0000-0000-0000000036e4", "item_b": "00000000-0000-0000-0000-0000000036e3", "outcome": "b", "context": {}}]'::jsonb,
    'prior'),
  1,
  'finish_insertion places with the mark it is given'
);

-- 57
select results_eq(
  $$ select r.placed_by, (select count(*) from public.comparisons c where c.item_a = r.media_item_id)
       from public.ranking_entries r where r.media_item_id = '00000000-0000-0000-0000-0000000036e4' $$,
  $$ values ('prior'::text, 1::bigint) $$,
  'the row is prior and its one answer is in the log: a provisional place keeps the answers it had'
);

-- 58
select is(
  public.finish_insertion('00000000-0000-0000-0000-0000000036d3', 'game', 'fine', 0, '[]'::jsonb),
  0,
  'finish_insertion with five arguments, as every caller before today'
);

-- 59
select is(
  (select placed_by from public.ranking_entries where media_item_id = '00000000-0000-0000-0000-0000000036d3'),
  'user',
  'places as user'
);

-- 60
select results_eq(
  $$ select t.media_item_id, t."position", t.placed_by from public.tier_list('game', 'loved') t $$,
  $$ values ('00000000-0000-0000-0000-0000000036e1'::uuid, 0, 'user'::text),
            ('00000000-0000-0000-0000-0000000036e2'::uuid, 1, 'prior'::text) $$,
  'tier_list returns each row''s mark'
);

-- The shifts and the moves, as user C, whose list feeds nothing else here (a
-- savepoint would roll back pgTAP's own bookkeeping, so A's list, which the
-- profile below is built from, is left alone instead). C has d6 by the user
-- and d1 by the prior in Loved, and d5 by the prior in Fine.

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000036c","role":"authenticated"}';

select public.insert_ranking_entry('00000000-0000-0000-0000-0000000036d6', 'game', 'loved', 0);
select public.insert_ranking_entry('00000000-0000-0000-0000-0000000036d1', 'game', 'loved', 1, 'prior');
select public.insert_ranking_entry('00000000-0000-0000-0000-0000000036d5', 'game', 'fine', 0, 'prior');
select public.insert_ranking_entry('00000000-0000-0000-0000-0000000036d2', 'game', 'loved', 0);

-- 61
select results_eq(
  $$ select t.media_item_id, t."position", t.placed_by from public.tier_list('game', 'loved') t $$,
  $$ values ('00000000-0000-0000-0000-0000000036d2'::uuid, 0, 'user'::text),
            ('00000000-0000-0000-0000-0000000036d6'::uuid, 1, 'user'::text),
            ('00000000-0000-0000-0000-0000000036d1'::uuid, 2, 'prior'::text) $$,
  'an insertion above a provisional row shifts it and leaves it provisional'
);

-- 62
select is(
  public.move_ranking_entry('00000000-0000-0000-0000-0000000036d1', 'loved', 0),
  0,
  'move_ranking_entry moves the provisional row to the top'
);

-- 63
select results_eq(
  $$ select t.media_item_id, t."position", t.placed_by from public.tier_list('game', 'loved') t $$,
  $$ values ('00000000-0000-0000-0000-0000000036d1'::uuid, 0, 'user'::text),
            ('00000000-0000-0000-0000-0000000036d2'::uuid, 1, 'user'::text),
            ('00000000-0000-0000-0000-0000000036d6'::uuid, 2, 'user'::text) $$,
  'the moved row is the user''s now, and the rows it shifted are unchanged'
);

-- 64
select is(
  (select placed_by from public.ranking_entries where media_item_id = '00000000-0000-0000-0000-0000000036d5'),
  'prior',
  'a provisional row in another tier is untouched by the move'
);

-- 65
select public.move_ranking_entry('00000000-0000-0000-0000-0000000036d5', 'fine', 0);
select is(
  (select placed_by from public.ranking_entries where media_item_id = '00000000-0000-0000-0000-0000000036d5'),
  'user',
  'a move to the place it already had still clears the mark: the user looked and kept it'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000036a","role":"authenticated"}';

-- 66
select throws_ok(
  $$ update public.ranking_entries set placed_by = 'guess' where media_item_id = '00000000-0000-0000-0000-0000000036e1' $$,
  '23514',
  null,
  'the column refuses a mark that is neither user nor prior, however it is written'
);

-- ==============================================================================
-- 3. events: behaviour
-- ==============================================================================

-- 67
select lives_ok(
  $$ insert into public.events (kind, payload) values ('first_session', '{}'), ('media_interest', '{"medium": "tv"}') $$,
  'user A logs two events naming only the kind and the payload'
);

-- 68
select results_eq(
  $$ select kind, payload, user_id, created_at = now() from public.events order by kind $$,
  $$ values ('first_session'::text, '{}'::jsonb, '00000000-0000-0000-0000-00000000036a'::uuid, true),
            ('media_interest'::text, '{"medium": "tv"}'::jsonb, '00000000-0000-0000-0000-00000000036a'::uuid, true) $$,
  'the rows carry A''s id and the server''s clock from the defaults'
);

-- 69
select throws_ok(
  $$ insert into public.events (user_id, kind) values ('00000000-0000-0000-0000-00000000036b', 'first_session') $$,
  '42501',
  null,
  'naming a user is refused: user_id is not in the insert grant'
);

-- 70
select throws_ok(
  $$ insert into public.events (kind, created_at) values ('app_open', '2020-01-01') $$,
  '42501',
  null,
  'backdating is refused: created_at is not in the insert grant'
);

-- 71
select throws_ok(
  $$ update public.events set payload = '{"medium": "book"}' $$,
  '42501',
  null,
  'an event cannot be updated'
);

-- 72
select throws_ok(
  $$ delete from public.events $$,
  '42501',
  null,
  'or deleted'
);

-- 73
select throws_ok(
  $$ insert into public.events (kind) values ('First Session') $$,
  '23514',
  null,
  'a kind is a snake_case word'
);

-- 74
select throws_ok(
  $$ insert into public.events (kind, payload) values ('app_open', '[1, 2]') $$,
  '23514',
  null,
  'a payload is an object'
);

-- 75
select throws_ok(
  $$ insert into public.events (kind, payload) values ('app_open', jsonb_build_object('note', repeat('x', 5000))) $$,
  '23514',
  null,
  'of at most 4 KB'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000036b","role":"authenticated"}';

insert into public.events (kind, payload) values ('first_session', '{}');

-- 76
select is(
  (select count(*) from public.events),
  1::bigint,
  'user B reads one event, their own, and none of A''s'
);

-- ==============================================================================
-- 4. deck_candidates, as user B (nothing tracked, nothing ranked)
-- ==============================================================================

-- 77
select results_eq(
  $$ select media_item_id, popularity_rank, boost
       from public.deck_candidates(array['Deck Test PS5', 'Deck Test Switch'], 10, 0) $$,
  $$ values ('00000000-0000-0000-0000-0000000036e1'::uuid, 1, 0::numeric),
            ('00000000-0000-0000-0000-0000000036d1'::uuid, 2, 0::numeric),
            ('00000000-0000-0000-0000-0000000036d2'::uuid, 3, 0::numeric),
            ('00000000-0000-0000-0000-0000000036d3'::uuid, 4, 0::numeric),
            ('00000000-0000-0000-0000-0000000036d4'::uuid, 5, 0::numeric),
            ('00000000-0000-0000-0000-0000000036d5'::uuid, 6, 0::numeric),
            ('00000000-0000-0000-0000-0000000036d6'::uuid, 7, 0::numeric) $$,
  'user B, who has nothing, gets every game on either platform by rating count, an empty or missing count last by id, with no boost'
);

-- ==============================================================================
-- 4. deck_candidates, as user A
-- ==============================================================================

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000036a","role":"authenticated"}';

-- 78
select results_eq(
  $$ select media_item_id, popularity_rank
       from public.deck_candidates(array['Deck Test PS5', 'Deck Test Switch'], 10, 0) $$,
  $$ values ('00000000-0000-0000-0000-0000000036d1'::uuid, 1),
            ('00000000-0000-0000-0000-0000000036d2'::uuid, 2),
            ('00000000-0000-0000-0000-0000000036d5'::uuid, 3),
            ('00000000-0000-0000-0000-0000000036d6'::uuid, 4) $$,
  'user A''s deck leaves out the game A ranked without an entry (e1), the one ranked and played (d3), and the one in the backlog (d4), and ranks what is left from 1'
);

-- 79
select results_eq(
  $$ select media_item_id from public.deck_candidates(array['Deck Test Switch'], 10, 0) $$,
  $$ values ('00000000-0000-0000-0000-0000000036d2'::uuid), ('00000000-0000-0000-0000-0000000036d5'::uuid) $$,
  'one platform: only the games on it'
);

-- 80
select results_eq(
  $$ select media_item_id, title, year, cover_image_id, external_ids, genres, platforms
       from public.deck_candidates(array['Deck Test PS5'], 1, 0) $$,
  $$ values ('00000000-0000-0000-0000-0000000036d1'::uuid, 'Deck One'::text, 2020::smallint, 'cod1'::text,
             '{"igdb": -936001, "steam": 936001}'::jsonb, array['Deck Roguelike Test'], array['Deck Test PS5']) $$,
  'a row carries what the deck row draws: title, year, the cover and its Steam fallback, genres and platforms'
);

-- 81
select results_eq(
  $$ select media_item_id, popularity_rank
       from public.deck_candidates(array['Deck Test PS5', 'Deck Test Switch'], 2, 2) $$,
  $$ values ('00000000-0000-0000-0000-0000000036d5'::uuid, 3),
            ('00000000-0000-0000-0000-0000000036d6'::uuid, 4) $$,
  'the second page of two continues the first page''s ranks'
);

-- 82
select results_eq(
  $$ select media_item_id from public.deck_candidates(null, 3, 0) $$,
  $$ values ('00000000-0000-0000-0000-0000000036d1'::uuid),
            ('00000000-0000-0000-0000-0000000036d2'::uuid),
            ('00000000-0000-0000-0000-0000000036d7'::uuid) $$,
  'no platforms is no filter: "Popular everywhere" reaches the game on a platform A never named'
);

-- 83
select results_eq(
  $$ select media_item_id from public.deck_candidates('{}', 3, 0) $$,
  $$ select media_item_id from public.deck_candidates(null, 3, 0) $$,
  'and an empty list is the same as none'
);

-- 84
select is(
  (select count(*) from public.deck_candidates(array['Deck Test Bulk'], 1000, 0)),
  50::bigint,
  'the page is clamped to fifty'
);

-- 85
select is(
  (select count(*) from public.deck_candidates(array['Deck Test Bulk'], 0, 0)),
  1::bigint,
  'and to at least one'
);

-- 86
select is(
  (select count(*) from public.deck_candidates(array['Deck Test Bulk'])),
  10::bigint,
  'ten by default, the deck''s page'
);

-- 87
select results_eq(
  $$ select min(popularity_rank), max(popularity_rank), count(*)
       from public.deck_candidates(array['Deck Test Bulk'], 10, 55) $$,
  $$ values (56, 60, 5::bigint) $$,
  'a late page holds what is left, ranked 56 to 60'
);

-- 88
select is(
  (select count(*) from public.deck_candidates(array['Deck Test Bulk'], 10, 60)),
  0::bigint,
  'and a page past the end is empty, not an error'
);

-- 89
select throws_ok(
  $$ select * from public.deck_candidates(array['Deck Test PS5'], 10, -1) $$,
  '22023',
  null,
  'a negative offset is a bad argument'
);

-- The boost. A's profile has a positive roguelike weight and a negative
-- shooter weight; the deck's games carry neither, one, or both.

-- 90
select ok(
  (select boost from public.deck_candidates(array['Deck Test PS5'], 10, 0)
    where media_item_id = '00000000-0000-0000-0000-0000000036d1') > 0,
  'a roguelike is boosted for A, who loved two'
);

-- 91
select ok(
  (select boost from public.deck_candidates(array['Deck Test PS5'], 10, 0)
    where media_item_id = '00000000-0000-0000-0000-0000000036d2') < 0,
  'a shooter is lowered for A, who disliked two: a negative weight counts against'
);

-- 92
select is(
  (select boost from public.deck_candidates(array['Deck Test PS5'], 10, 0)
    where media_item_id = '00000000-0000-0000-0000-0000000036d6'),
  0::numeric,
  'a game with no feature in the profile has no boost'
);

create temporary table deck_a as
  select media_item_id, boost
  from public.deck_candidates(array['Deck Test PS5', 'Deck Test Switch'], 10, 0);

-- ==============================================================================
-- 5. batch_predictions, as user A
-- ==============================================================================

create temporary table predictions_a as
  select * from public.batch_predictions('game', array[
    '00000000-0000-0000-0000-0000000036d2'::uuid,
    '00000000-0000-0000-0000-0000000036d1'::uuid,
    '00000000-0000-0000-0000-0000000036b1'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    '00000000-0000-0000-0000-0000000036d6'::uuid
  ]);

-- 93
select results_eq(
  $$ select media_item_id from predictions_a $$,
  $$ values ('00000000-0000-0000-0000-0000000036d2'::uuid),
            ('00000000-0000-0000-0000-0000000036d1'::uuid),
            ('00000000-0000-0000-0000-0000000036d6'::uuid) $$,
  'one row per game in the order given; the film and the unknown id are left out, not refused'
);

-- 94
select ok(
  (select predicted_score from predictions_a where media_item_id = '00000000-0000-0000-0000-0000000036d1')
  > (select predicted_score from predictions_a where media_item_id = '00000000-0000-0000-0000-0000000036d2'),
  'with equal priors, A''s guess puts the roguelike above the shooter: the profile is in it'
);

-- 95
select is(
  (select array_agg(distinct confidence) from predictions_a),
  array['medium'],
  'five ranked games is medium confidence'
);

-- 96
select is(
  (select count(*) from public.batch_predictions('game', '{}')),
  0::bigint,
  'an empty batch is an empty answer'
);

-- 97
select is(
  (select count(*) from public.batch_predictions('game', null)),
  0::bigint,
  'and so is a null one'
);

-- 98
select throws_ok(
  $$ select * from public.batch_predictions('game', array(select gen_random_uuid() from generate_series(1, 501))) $$,
  '22023',
  null,
  'more than 500 items is a bad argument'
);

-- 99
select throws_ok(
  $$ select * from public.batch_predictions(null, array['00000000-0000-0000-0000-0000000036d1'::uuid]) $$,
  '22023',
  null,
  'and so is no medium'
);

-- 100
select throws_ok(
  $$ select * from public.recommendation_scores('00000000-0000-0000-0000-00000000036b', 'game', array['00000000-0000-0000-0000-0000000036d1'::uuid], null) $$,
  '42501',
  null,
  'user A still cannot score anyone through the internal function'
);

-- ==============================================================================
-- 6. played_not_ranked, as user A
-- ==============================================================================

-- 101
select results_eq(
  $$ select media_item_id, finished_at from public.played_not_ranked('game') $$,
  $$ values ('00000000-0000-0000-0000-0000000036f2'::uuid, '2026-10-06'::date),
            ('00000000-0000-0000-0000-0000000036f1'::uuid, '2026-10-05'::date),
            ('00000000-0000-0000-0000-0000000036f3'::uuid, null::date) $$,
  'A''s played and unranked games, newest finished first and the undated last; not the ranked one, the backlog one, the dropped one, or the film'
);

-- 102
select results_eq(
  $$ select title, year, cover_image_id, external_ids, genres, platforms
       from public.played_not_ranked('game') where media_item_id = '00000000-0000-0000-0000-0000000036f3' $$,
  $$ values ('Drain Three'::text, 2019::smallint, 'cof3'::text, '{"igdb": -936203}'::jsonb,
             array['Drain Test', 'Puzzle Drain Test'], array['Deck Test Drain', 'Deck Test Drain Two']) $$,
  'a row carries what a session card and a tier pass draw'
);

-- 103
select results_eq(
  $$ select media_item_id, genres from public.played_not_ranked('movie') $$,
  $$ values ('00000000-0000-0000-0000-0000000036b1'::uuid, array['Drain Film Test']) $$,
  'per medium: the film is in the film drain, with its genres from movie_details'
);

-- 104
select throws_ok(
  $$ select * from public.played_not_ranked(null) $$,
  '22023',
  null,
  'no medium is a bad argument'
);

-- ==============================================================================
-- 5 and 6 again, as user B
-- ==============================================================================

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000036b","role":"authenticated"}';

-- 105
select results_eq(
  $$ select media_item_id from public.played_not_ranked('game') $$,
  $$ values ('00000000-0000-0000-0000-0000000036f1'::uuid) $$,
  'user B''s drain is B''s one played game, and nothing of A''s'
);

-- 106
select results_eq(
  $$ select predicted_score, confidence from public.batch_predictions('game', array['00000000-0000-0000-0000-0000000036d1'::uuid]) $$,
  $$ values (8.00::numeric, 'needs_more_data'::text) $$,
  'user B, with nothing ranked, gets the prior alone (metacritic 80 is 8.0) and needs_more_data: B''s numbers, not A''s'
);

-- 107
select public.finish_insertion('00000000-0000-0000-0000-0000000036f1', 'game', 'liked', 0, '[]'::jsonb, 'prior');
select is(
  (select count(*) from public.played_not_ranked('game')),
  0::bigint,
  'a game leaves the drain the moment it is ranked, provisional or not'
);

-- ==============================================================================
-- 7. No user, and signed out
-- ==============================================================================

set local request.jwt.claims to '{"role":"authenticated"}';

-- 108
select throws_ok(
  $$ select * from public.deck_candidates(array['Deck Test PS5'], 10, 0) $$,
  '28000',
  null,
  'deck_candidates needs a user'
);

-- 109
select throws_ok(
  $$ select * from public.batch_predictions('game', array['00000000-0000-0000-0000-0000000036d1'::uuid]) $$,
  '28000',
  null,
  'batch_predictions needs a user'
);

-- 110
select throws_ok(
  $$ select * from public.played_not_ranked('game') $$,
  '28000',
  null,
  'played_not_ranked needs a user'
);

reset role;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

-- 111
select throws_ok(
  $$ select * from public.deck_candidates(array['Deck Test PS5'], 10, 0) $$,
  '42501',
  null,
  'anon cannot execute deck_candidates'
);

-- 112
select throws_ok(
  $$ select * from public.batch_predictions('game', array['00000000-0000-0000-0000-0000000036d1'::uuid]) $$,
  '42501',
  null,
  'anon cannot execute batch_predictions'
);

-- 113
select throws_ok(
  $$ select * from public.played_not_ranked('game') $$,
  '42501',
  null,
  'anon cannot execute played_not_ranked'
);

-- 114
select throws_ok(
  $$ insert into public.events (kind) values ('first_session') $$,
  '42501',
  null,
  'anon cannot log an event'
);

reset role;

-- ==============================================================================
-- Checked as the database owner, against the internal functions called live
-- ==============================================================================

-- 115
select results_eq(
  $$ select d.media_item_id, d.boost from deck_a d order by d.media_item_id $$,
  $$ select c.id, round(coalesce(sum(p.weight), 0), 4)
       from unnest(array[
         '00000000-0000-0000-0000-0000000036d1'::uuid,
         '00000000-0000-0000-0000-0000000036d2'::uuid,
         '00000000-0000-0000-0000-0000000036d5'::uuid,
         '00000000-0000-0000-0000-0000000036d6'::uuid
       ]) as c(id)
       left join public.recommendation_item_features('game', array[c.id]) f on true
       left join public.recommendation_content_profile('00000000-0000-0000-0000-00000000036a', 'game') p
         on p.feature = f.feature
      group by c.id
      order by c.id $$,
  'every boost A saw is the sum of A''s profile weights over the candidate''s features, computed from the internal functions directly'
);

-- 116
select results_eq(
  $$ select p.media_item_id, p.predicted_score, p.confidence from predictions_a p order by p.media_item_id $$,
  $$ select s.media_item_id, s.predicted_score, s.confidence
       from public.recommendation_scores(
         '00000000-0000-0000-0000-00000000036a', 'game',
         array['00000000-0000-0000-0000-0000000036d1'::uuid, '00000000-0000-0000-0000-0000000036d2'::uuid,
               '00000000-0000-0000-0000-0000000036d6'::uuid],
         null) s
      order by s.media_item_id $$,
  'A''s predictions are exactly recommendation_scores for A, and the scorer was given A''s id by the function, not by A'
);

-- 117
select is(
  (select media from public.profiles where id = '00000000-0000-0000-0000-00000000036b'),
  null::public.medium[],
  'seen as the owner, user B''s profile is untouched by user A'
);

-- 118
delete from auth.users where id = '00000000-0000-0000-0000-00000000036a';
select is(
  (select count(*) from public.events where user_id = '00000000-0000-0000-0000-00000000036a'),
  0::bigint,
  'deleting the account takes its events with it, which delete_my_account relies on'
);

select * from finish();
rollback;
