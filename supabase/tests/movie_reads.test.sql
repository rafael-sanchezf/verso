-- pgTAP tests for supabase/migrations/20261008203000_movie_reads.sql.
-- Run with: supabase test db
--
-- Four things are under test:
--
-- 1. **The three functions' shape**: invoker, pinned search_path, never anon,
--    28000 without a user for the two that read the caller's entries.
-- 2. **movie_release_state**: every placement, the order the rules apply in,
--    the 120-day window, a removed offer, and the region.
-- 3. **movie_watchlist**: the rows, newest added first, each filter, the
--    provider arrays in display order, the TMDB score, and the profile's region
--    moving a film to the Calendar.
-- 4. **movie_calendar**: the kinds, going over the film's own kind, in
--    theaters first and then by day, today included; and both reads answered
--    for B from B's rows and B's services alone.
--
-- Today is 2026-10-08 throughout, passed as p_today the way the app passes
-- the device's date. Users act through `set local role authenticated` plus a
-- forged request.jwt.claims. Ids are in the ...b4 range; TMDB ids are
-- negative and provider ids are above 1,990,000,000, so nothing meets a
-- mirrored catalog.

begin;
select plan(30);

-- ==============================================================================
-- 1. Shape
-- ==============================================================================

-- 1
select ok(
  (select bool_and(not p.prosecdef and p.proconfig @> array['search_path=public, extensions'])
     from pg_proc p
    where p.oid in (
      'public.movie_release_state(uuid,text,date)'::regprocedure,
      'public.movie_watchlist(date,boolean,integer,text[])'::regprocedure,
      'public.movie_calendar(date)'::regprocedure
    )),
  'all three are security invoker with a pinned search_path'
);

-- 2
select ok(
  not has_function_privilege('anon', 'public.movie_release_state(uuid,text,date)', 'execute')
  and not has_function_privilege('anon', 'public.movie_watchlist(date,boolean,integer,text[])', 'execute')
  and not has_function_privilege('anon', 'public.movie_calendar(date)', 'execute'),
  'anon can execute none of them'
);

-- 3
select ok(
  has_function_privilege('authenticated', 'public.movie_release_state(uuid,text,date)', 'execute')
  and has_function_privilege('authenticated', 'public.movie_watchlist(date,boolean,integer,text[])', 'execute')
  and has_function_privilege('authenticated', 'public.movie_calendar(date)', 'execute')
  and has_function_privilege('service_role', 'public.movie_watchlist(date,boolean,integer,text[])', 'execute'),
  'signed-in users and the service role can execute all three'
);

-- 4
select throws_ok(
  $$ select * from public.movie_watchlist('2026-10-08') $$,
  '28000',
  null,
  'movie_watchlist without a user is 28000'
);

-- 5
select throws_ok(
  $$ select * from public.movie_calendar('2026-10-08') $$,
  '28000',
  null,
  'movie_calendar without a user is 28000'
);

-- ==============================================================================
-- Fixtures
-- ==============================================================================
--
-- Providers in US display order: P4 (1), P3 (2), P1 (3), P2 (5); PG is GB only.
--
--   film  theatrical (US)  digital (US)  offers (US)                     expect
--   w1    2021-01-01                     P1 flatrate                     watchlist
--   w2                                   P2 flatrate, P4 ads, P3 rent+buy watchlist
--   w3    2010-05-01                                                     watchlist (old, nowhere)
--   w4    2020-01-01                     P1 flatrate, removed            watchlist (nowhere now)
--   c1    2026-10-22                                                     opening 10-22
--   c2    2026-09-20 (limited)                                           in_theaters 09-20
--   c3    2026-03-01       2026-12-03                                    streaming_soon 12-03
--   c4    (release_date 2026-11-15, no regional date)                    release 11-15
--   c5    2026-09-01                     P1 flatrate                     watchlist (streams wins)
--   c6                     2026-11-01                                    streaming_soon 11-01
--   c7    GB 2026-10-30 only (release_date 2026-01-01)                   US watchlist, GB opening
--   c8    2026-09-01       2026-10-01                                    watchlist (out digitally)
--   c9    2026-05-01                                                     watchlist (window over)
--   c10   2026-10-08                                                     in_theaters 10-08
--   p1    2026-10-22, planned 2026-10-24                                 going 10-24
--   p2    planned 2026-10-01 (past)        P1 flatrate                   watchlist only
--   p3    played, planned 2026-10-30                                     going 10-30
--   p4    planned 2026-10-08 (today), P1 flatrate                        going 10-08, and watchlist

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000b40aa', 'reads-a@example.com'),
  ('00000000-0000-0000-0000-0000000b40bb', 'reads-b@example.com');

insert into public.watch_providers (provider_id, name, display_priorities) values
  (1990000001, 'Reads P1', '{"US": 3}'),
  (1990000002, 'Reads P2', '{"US": 5}'),
  (1990000003, 'Reads P3', '{"US": 2}'),
  (1990000004, 'Reads P4', '{"US": 1}'),
  (1990000005, 'Reads PG', '{"GB": 1}');

insert into public.media_items (id, medium, title, year, release_date, cover_image_id, external_ids) values
  ('00000000-0000-0000-0000-0000000b4f01', 'movie', 'Reads W1', 2021, '2021-01-01', '/w1.jpg', '{"tmdb": -84001}'),
  ('00000000-0000-0000-0000-0000000b4f02', 'movie', 'Reads W2', 2022, '2022-01-01', '/w2.jpg', '{"tmdb": -84002}'),
  ('00000000-0000-0000-0000-0000000b4f03', 'movie', 'Reads W3', 2010, '2010-05-01', '/w3.jpg', '{"tmdb": -84003}'),
  ('00000000-0000-0000-0000-0000000b4f04', 'movie', 'Reads W4', 2020, '2020-01-01', '/w4.jpg', '{"tmdb": -84004}'),
  ('00000000-0000-0000-0000-0000000b4f11', 'movie', 'Reads C1', 2026, '2026-10-22', '/c1.jpg', '{"tmdb": -84011}'),
  ('00000000-0000-0000-0000-0000000b4f12', 'movie', 'Reads C2', 2026, '2026-09-20', '/c2.jpg', '{"tmdb": -84012}'),
  ('00000000-0000-0000-0000-0000000b4f13', 'movie', 'Reads C3', 2026, '2026-03-01', '/c3.jpg', '{"tmdb": -84013}'),
  ('00000000-0000-0000-0000-0000000b4f14', 'movie', 'Reads C4', 2026, '2026-11-15', '/c4.jpg', '{"tmdb": -84014}'),
  ('00000000-0000-0000-0000-0000000b4f15', 'movie', 'Reads C5', 2026, '2026-09-01', '/c5.jpg', '{"tmdb": -84015}'),
  ('00000000-0000-0000-0000-0000000b4f16', 'movie', 'Reads C6', 2026, '2026-11-01', '/c6.jpg', '{"tmdb": -84016}'),
  ('00000000-0000-0000-0000-0000000b4f17', 'movie', 'Reads C7', 2026, '2026-01-01', '/c7.jpg', '{"tmdb": -84017}'),
  ('00000000-0000-0000-0000-0000000b4f18', 'movie', 'Reads C8', 2026, '2026-09-01', '/c8.jpg', '{"tmdb": -84018}'),
  ('00000000-0000-0000-0000-0000000b4f19', 'movie', 'Reads C9', 2026, '2026-05-01', '/c9.jpg', '{"tmdb": -84019}'),
  ('00000000-0000-0000-0000-0000000b4f1a', 'movie', 'Reads C10', 2026, '2026-10-08', '/c10.jpg', '{"tmdb": -84020}'),
  ('00000000-0000-0000-0000-0000000b4f21', 'movie', 'Reads P1 Film', 2026, '2026-10-22', '/p1.jpg', '{"tmdb": -84021}'),
  ('00000000-0000-0000-0000-0000000b4f22', 'movie', 'Reads P2 Film', 2025, '2025-01-01', '/p2.jpg', '{"tmdb": -84022}'),
  ('00000000-0000-0000-0000-0000000b4f23', 'movie', 'Reads P3 Film', 2025, '2025-01-01', '/p3.jpg', '{"tmdb": -84023}'),
  ('00000000-0000-0000-0000-0000000b4f24', 'movie', 'Reads P4 Film', 2025, '2025-01-01', '/p4.jpg', '{"tmdb": -84024}'),
  ('00000000-0000-0000-0000-0000000b4e01', 'game', 'Reads Game', 2026, '2026-12-01', 'rg1', '{"igdb": -84101}');

insert into public.movie_details (media_item_id, tmdb_id, runtime_minutes, genres, directors) values
  ('00000000-0000-0000-0000-0000000b4f01', -84001, 100, '{"Reads Drama Test"}', '{"Reads Director"}'),
  ('00000000-0000-0000-0000-0000000b4f02', -84002, 150, '{"Reads Thriller Test"}', '{}'),
  ('00000000-0000-0000-0000-0000000b4f03', -84003, null, '{"Reads Drama Test"}', '{}'),
  ('00000000-0000-0000-0000-0000000b4f15', -84015, 90, '{"Reads Comedy Test"}', '{}');

insert into public.external_scores (media_item_id, source, score, score_count) values
  ('00000000-0000-0000-0000-0000000b4f01', 'tmdb', 79.00, 1200);

insert into public.media_release_dates (media_item_id, region, release_type, released_on) values
  ('00000000-0000-0000-0000-0000000b4f01', 'US', 3, '2021-01-01'),
  ('00000000-0000-0000-0000-0000000b4f03', 'US', 3, '2010-05-01'),
  ('00000000-0000-0000-0000-0000000b4f04', 'US', 3, '2020-01-01'),
  ('00000000-0000-0000-0000-0000000b4f11', 'US', 3, '2026-10-22'),
  ('00000000-0000-0000-0000-0000000b4f12', 'US', 2, '2026-09-20'),
  ('00000000-0000-0000-0000-0000000b4f13', 'US', 3, '2026-03-01'),
  ('00000000-0000-0000-0000-0000000b4f13', 'US', 4, '2026-12-03'),
  ('00000000-0000-0000-0000-0000000b4f15', 'US', 3, '2026-09-01'),
  ('00000000-0000-0000-0000-0000000b4f16', 'US', 4, '2026-11-01'),
  ('00000000-0000-0000-0000-0000000b4f17', 'GB', 3, '2026-10-30'),
  ('00000000-0000-0000-0000-0000000b4f18', 'US', 3, '2026-09-01'),
  ('00000000-0000-0000-0000-0000000b4f18', 'US', 4, '2026-10-01'),
  ('00000000-0000-0000-0000-0000000b4f19', 'US', 3, '2026-05-01'),
  ('00000000-0000-0000-0000-0000000b4f1a', 'US', 3, '2026-10-08'),
  ('00000000-0000-0000-0000-0000000b4f21', 'US', 3, '2026-10-22');

insert into public.watch_availability (media_item_id, region, provider_id, offer_type, removed_at) values
  ('00000000-0000-0000-0000-0000000b4f01', 'US', 1990000001, 'flatrate', null),
  ('00000000-0000-0000-0000-0000000b4f02', 'US', 1990000002, 'flatrate', null),
  ('00000000-0000-0000-0000-0000000b4f02', 'US', 1990000004, 'ads', null),
  ('00000000-0000-0000-0000-0000000b4f02', 'US', 1990000003, 'rent', null),
  ('00000000-0000-0000-0000-0000000b4f02', 'US', 1990000003, 'buy', null),
  ('00000000-0000-0000-0000-0000000b4f04', 'US', 1990000001, 'flatrate', '2026-09-01'),
  ('00000000-0000-0000-0000-0000000b4f15', 'US', 1990000001, 'flatrate', null),
  ('00000000-0000-0000-0000-0000000b4f22', 'US', 1990000001, 'flatrate', null),
  ('00000000-0000-0000-0000-0000000b4f24', 'US', 1990000001, 'flatrate', null);

-- A's entries, each added on its own day so the order is fixed. B tracks two.
insert into public.user_entries (user_id, media_item_id, status, added_at, planned_on) values
  ('00000000-0000-0000-0000-0000000b40aa', '00000000-0000-0000-0000-0000000b4f01', 'backlog', '2026-10-01', null),
  ('00000000-0000-0000-0000-0000000b40aa', '00000000-0000-0000-0000-0000000b4f02', 'backlog', '2026-10-02', null),
  ('00000000-0000-0000-0000-0000000b40aa', '00000000-0000-0000-0000-0000000b4f03', 'backlog', '2026-10-03', null),
  ('00000000-0000-0000-0000-0000000b40aa', '00000000-0000-0000-0000-0000000b4f04', 'backlog', '2026-10-04', null),
  ('00000000-0000-0000-0000-0000000b40aa', '00000000-0000-0000-0000-0000000b4f15', 'backlog', '2026-10-05', null),
  ('00000000-0000-0000-0000-0000000b40aa', '00000000-0000-0000-0000-0000000b4f17', 'backlog', '2026-10-06', null),
  ('00000000-0000-0000-0000-0000000b40aa', '00000000-0000-0000-0000-0000000b4f18', 'backlog', '2026-10-07', null),
  ('00000000-0000-0000-0000-0000000b40aa', '00000000-0000-0000-0000-0000000b4f19', 'backlog', '2026-09-30', null),
  ('00000000-0000-0000-0000-0000000b40aa', '00000000-0000-0000-0000-0000000b4f22', 'backlog', '2026-09-29', '2026-10-01'),
  ('00000000-0000-0000-0000-0000000b40aa', '00000000-0000-0000-0000-0000000b4f24', 'backlog', '2026-09-28', '2026-10-08'),
  ('00000000-0000-0000-0000-0000000b40aa', '00000000-0000-0000-0000-0000000b4f11', 'backlog', '2026-09-01', null),
  ('00000000-0000-0000-0000-0000000b40aa', '00000000-0000-0000-0000-0000000b4f12', 'backlog', '2026-09-02', null),
  ('00000000-0000-0000-0000-0000000b40aa', '00000000-0000-0000-0000-0000000b4f13', 'backlog', '2026-09-03', null),
  ('00000000-0000-0000-0000-0000000b40aa', '00000000-0000-0000-0000-0000000b4f14', 'backlog', '2026-09-04', null),
  ('00000000-0000-0000-0000-0000000b40aa', '00000000-0000-0000-0000-0000000b4f16', 'backlog', '2026-09-05', null),
  ('00000000-0000-0000-0000-0000000b40aa', '00000000-0000-0000-0000-0000000b4f1a', 'backlog', '2026-09-06', null),
  ('00000000-0000-0000-0000-0000000b40aa', '00000000-0000-0000-0000-0000000b4f21', 'backlog', '2026-09-07', '2026-10-24'),
  ('00000000-0000-0000-0000-0000000b40aa', '00000000-0000-0000-0000-0000000b4f23', 'played', '2026-09-08', '2026-10-30'),
  ('00000000-0000-0000-0000-0000000b40aa', '00000000-0000-0000-0000-0000000b4e01', 'backlog', '2026-09-09', null),
  ('00000000-0000-0000-0000-0000000b40bb', '00000000-0000-0000-0000-0000000b4f01', 'backlog', '2026-10-01', null),
  ('00000000-0000-0000-0000-0000000b40bb', '00000000-0000-0000-0000-0000000b4f02', 'backlog', '2026-10-02', null);

update public.profiles set watch_provider_ids = array[1990000001] where id = '00000000-0000-0000-0000-0000000b40aa';
update public.profiles set watch_provider_ids = array[1990000002] where id = '00000000-0000-0000-0000-0000000b40bb';

-- ==============================================================================
-- 2. movie_release_state
-- ==============================================================================

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000b40aa","role":"authenticated"}';

-- 6
select results_eq(
  $$ select s.media_item_id, s.placement, s.placement_on
       from unnest(array[
         '00000000-0000-0000-0000-0000000b4f01', '00000000-0000-0000-0000-0000000b4f03',
         '00000000-0000-0000-0000-0000000b4f04', '00000000-0000-0000-0000-0000000b4f11',
         '00000000-0000-0000-0000-0000000b4f12', '00000000-0000-0000-0000-0000000b4f13',
         '00000000-0000-0000-0000-0000000b4f14', '00000000-0000-0000-0000-0000000b4f15',
         '00000000-0000-0000-0000-0000000b4f16', '00000000-0000-0000-0000-0000000b4f17',
         '00000000-0000-0000-0000-0000000b4f18', '00000000-0000-0000-0000-0000000b4f19',
         '00000000-0000-0000-0000-0000000b4f1a'
       ]::uuid[]) with ordinality as i(id, n)
       cross join lateral public.movie_release_state(i.id, 'US', '2026-10-08') s
      order by i.n $$,
  $$ values
       ('00000000-0000-0000-0000-0000000b4f01'::uuid, 'watchlist', null::date),
       ('00000000-0000-0000-0000-0000000b4f03'::uuid, 'watchlist', null::date),
       ('00000000-0000-0000-0000-0000000b4f04'::uuid, 'watchlist', null::date),
       ('00000000-0000-0000-0000-0000000b4f11'::uuid, 'opening', '2026-10-22'::date),
       ('00000000-0000-0000-0000-0000000b4f12'::uuid, 'in_theaters', '2026-09-20'::date),
       ('00000000-0000-0000-0000-0000000b4f13'::uuid, 'streaming_soon', '2026-12-03'::date),
       ('00000000-0000-0000-0000-0000000b4f14'::uuid, 'release', '2026-11-15'::date),
       ('00000000-0000-0000-0000-0000000b4f15'::uuid, 'watchlist', null::date),
       ('00000000-0000-0000-0000-0000000b4f16'::uuid, 'streaming_soon', '2026-11-01'::date),
       ('00000000-0000-0000-0000-0000000b4f17'::uuid, 'watchlist', null::date),
       ('00000000-0000-0000-0000-0000000b4f18'::uuid, 'watchlist', null::date),
       ('00000000-0000-0000-0000-0000000b4f19'::uuid, 'watchlist', null::date),
       ('00000000-0000-0000-0000-0000000b4f1a'::uuid, 'in_theaters', '2026-10-08'::date) $$,
  'every placement in US on 2026-10-08: streaming wins, then opening, straight-to-streaming, release, the 120-day run, a digital date ahead, and the rest'
);

-- 7
select results_eq(
  $$ select theatrical_on, digital_on, streams_now from public.movie_release_state('00000000-0000-0000-0000-0000000b4f13', 'US', '2026-10-08') $$,
  $$ values ('2026-03-01'::date, '2026-12-03'::date, false) $$,
  'the dates and the streaming flag come back beside the placement'
);

-- 8
select is(
  (select streams_now from public.movie_release_state('00000000-0000-0000-0000-0000000b4f04', 'US', '2026-10-08')),
  false,
  'an offer that was removed is not streaming now'
);

-- 9
select results_eq(
  $$ select placement, placement_on from public.movie_release_state('00000000-0000-0000-0000-0000000b4f17', 'GB', '2026-10-08') $$,
  $$ values ('opening'::text, '2026-10-30'::date) $$,
  'the region decides: a film with a GB date only is opening in GB'
);

-- 10
select is(
  (select placement from public.movie_release_state('00000000-0000-0000-0000-0000000b4f12', 'US', '2027-01-18')),
  'watchlist',
  'a theatrical run with no digital date ends after 120 days'
);

-- 11
select is(
  (select count(*) from public.movie_release_state('00000000-0000-0000-0000-0000000b4e01', 'US', '2026-10-08')),
  0::bigint,
  'a game has no release state'
);

-- ==============================================================================
-- 3. movie_watchlist
-- ==============================================================================

-- 12
select results_eq(
  $$ select media_item_id from public.movie_watchlist('2026-10-08') $$,
  $$ values
       ('00000000-0000-0000-0000-0000000b4f18'::uuid),
       ('00000000-0000-0000-0000-0000000b4f17'::uuid),
       ('00000000-0000-0000-0000-0000000b4f15'::uuid),
       ('00000000-0000-0000-0000-0000000b4f04'::uuid),
       ('00000000-0000-0000-0000-0000000b4f03'::uuid),
       ('00000000-0000-0000-0000-0000000b4f02'::uuid),
       ('00000000-0000-0000-0000-0000000b4f01'::uuid),
       ('00000000-0000-0000-0000-0000000b4f19'::uuid),
       ('00000000-0000-0000-0000-0000000b4f22'::uuid),
       ('00000000-0000-0000-0000-0000000b4f24'::uuid) $$,
  'A''s Watchlist: the want-to-watch films that sit in it, newest added first; no calendar film, no played film, no game, nothing of B''s'
);

-- 13
select results_eq(
  $$ select streams_on, on_my_services, rent_or_buy from public.movie_watchlist('2026-10-08') where media_item_id = '00000000-0000-0000-0000-0000000b4f02' $$,
  $$ values (array[1990000004, 1990000002], '{}'::integer[], array[1990000003]) $$,
  'where a film streams comes back in display order, rent and buy once each, and none of it on A''s services'
);

-- 14
select results_eq(
  $$ select title, year, runtime_minutes, genres, directors, tmdb_score, tmdb_vote_count, streams_on, on_my_services
       from public.movie_watchlist('2026-10-08') where media_item_id = '00000000-0000-0000-0000-0000000b4f01' $$,
  $$ values ('Reads W1'::text, 2021::smallint, 100, array['Reads Drama Test'], array['Reads Director'], 79.00::numeric, 1200, array[1990000001], array[1990000001]) $$,
  'a row carries the film''s facts, its TMDB score, and the services of A''s it is on'
);

-- 15
select is(
  (select streams_on from public.movie_watchlist('2026-10-08') where media_item_id = '00000000-0000-0000-0000-0000000b4f04'),
  '{}'::integer[],
  'a film whose offer was removed streams nowhere: "Not streaming"'
);

-- 16
select results_eq(
  $$ select media_item_id from public.movie_watchlist('2026-10-08', p_on_my_services => true) $$,
  $$ values
       ('00000000-0000-0000-0000-0000000b4f15'::uuid),
       ('00000000-0000-0000-0000-0000000b4f01'::uuid),
       ('00000000-0000-0000-0000-0000000b4f22'::uuid),
       ('00000000-0000-0000-0000-0000000b4f24'::uuid) $$,
  '"On my services": only the films on one of A''s services now'
);

-- 17
select results_eq(
  $$ select media_item_id from public.movie_watchlist('2026-10-08', p_max_minutes => 120) $$,
  $$ values ('00000000-0000-0000-0000-0000000b4f15'::uuid), ('00000000-0000-0000-0000-0000000b4f01'::uuid) $$,
  'under two hours: the films at or under it, and none whose runtime is unknown'
);

-- 18
select results_eq(
  $$ select media_item_id from public.movie_watchlist('2026-10-08', p_genres => array['Reads Thriller Test', 'Reads Comedy Test']) $$,
  $$ values ('00000000-0000-0000-0000-0000000b4f15'::uuid), ('00000000-0000-0000-0000-0000000b4f02'::uuid) $$,
  'genres: the films sharing at least one'
);

-- 19
select is(
  (select count(*) from public.movie_watchlist('2026-10-08', p_genres => '{}')),
  10::bigint,
  'an empty genre list is no filter'
);

-- 20
select results_eq(
  $$ select media_item_id from public.movie_watchlist('2026-10-08', p_on_my_services => true, p_max_minutes => 95) $$,
  $$ values ('00000000-0000-0000-0000-0000000b4f15'::uuid) $$,
  'the filters combine: the finder asking for something under 95 minutes on my services'
);

update public.profiles set watch_region = 'GB' where id = '00000000-0000-0000-0000-0000000b40aa';

-- 21
select ok(
  not exists (select 1 from public.movie_watchlist('2026-10-08') where media_item_id = '00000000-0000-0000-0000-0000000b4f17')
  and exists (select 1 from public.movie_calendar('2026-10-08') where media_item_id = '00000000-0000-0000-0000-0000000b4f17' and kind = 'opening' and on_date = '2026-10-30'),
  'the profile''s region decides: in GB the film opening there leaves the Watchlist for the Calendar'
);

-- 22
select is(
  (select count(*) from public.movie_watchlist('2026-10-08', p_on_my_services => true)),
  0::bigint,
  'and in GB no film is on A''s services, because the offers are US offers'
);

update public.profiles set watch_region = 'US' where id = '00000000-0000-0000-0000-0000000b40aa';

-- ==============================================================================
-- 4. movie_calendar
-- ==============================================================================

-- 23
select results_eq(
  $$ select media_item_id, kind, on_date from public.movie_calendar('2026-10-08') $$,
  $$ values
       ('00000000-0000-0000-0000-0000000b4f12'::uuid, 'in_theaters', '2026-09-20'::date),
       ('00000000-0000-0000-0000-0000000b4f1a'::uuid, 'in_theaters', '2026-10-08'::date),
       ('00000000-0000-0000-0000-0000000b4f24'::uuid, 'going', '2026-10-08'::date),
       ('00000000-0000-0000-0000-0000000b4f11'::uuid, 'opening', '2026-10-22'::date),
       ('00000000-0000-0000-0000-0000000b4f21'::uuid, 'going', '2026-10-24'::date),
       ('00000000-0000-0000-0000-0000000b4f23'::uuid, 'going', '2026-10-30'::date),
       ('00000000-0000-0000-0000-0000000b4f16'::uuid, 'streaming_soon', '2026-11-01'::date),
       ('00000000-0000-0000-0000-0000000b4f14'::uuid, 'release', '2026-11-15'::date),
       ('00000000-0000-0000-0000-0000000b4f13'::uuid, 'streaming_soon', '2026-12-03'::date) $$,
  'A''s Calendar: in theaters now first, then every row by its day, soonest first'
);

-- 24
select results_eq(
  $$ select planned_on, theatrical_on, status::text from public.movie_calendar('2026-10-08') where media_item_id = '00000000-0000-0000-0000-0000000b4f21' $$,
  $$ values ('2026-10-24'::date, '2026-10-22'::date, 'backlog'::text) $$,
  'a going row keeps the film''s opening day beside the planned one'
);

-- 25
select ok(
  not exists (select 1 from public.movie_calendar('2026-10-08') where media_item_id = '00000000-0000-0000-0000-0000000b4f22'),
  'a planned day that has passed drops off the Calendar'
);

-- 26
select ok(
  exists (select 1 from public.movie_watchlist('2026-10-08') where media_item_id = '00000000-0000-0000-0000-0000000b4f24')
  and exists (select 1 from public.movie_calendar('2026-10-08') where media_item_id = '00000000-0000-0000-0000-0000000b4f24'),
  'a streamable film with a plan today is in both: on the Watchlist, and going on the Calendar'
);

-- 27
select results_eq(
  $$ select kind, on_date from public.movie_calendar('2026-10-25') where media_item_id = '00000000-0000-0000-0000-0000000b4f21' $$,
  $$ values ('in_theaters'::text, '2026-10-22'::date) $$,
  'the day after the plan the film is back to its own kind'
);

-- ==============================================================================
-- Two users
-- ==============================================================================

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000b40bb","role":"authenticated"}';

-- 28
select results_eq(
  $$ select media_item_id, on_my_services from public.movie_watchlist('2026-10-08') $$,
  $$ values
       ('00000000-0000-0000-0000-0000000b4f02'::uuid, array[1990000002]),
       ('00000000-0000-0000-0000-0000000b4f01'::uuid, '{}'::integer[]) $$,
  'B''s Watchlist is B''s two films, and "on my services" is read against B''s services'
);

-- 29
select results_eq(
  $$ select media_item_id from public.movie_watchlist('2026-10-08', p_on_my_services => true) $$,
  $$ values ('00000000-0000-0000-0000-0000000b4f02'::uuid) $$,
  'B''s "On my services" is the film on B''s service'
);

-- 30
select is(
  (select count(*) from public.movie_calendar('2026-10-08')),
  0::bigint,
  'B''s Calendar is empty: none of A''s plans or openings'
);

select * from finish();
rollback;
