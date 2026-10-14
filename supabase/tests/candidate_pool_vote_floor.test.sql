-- The ask's bounded pool and the film vote floor
-- (20261014120000_candidate_pool_vote_floor.sql; VER-199, VER-202).
--
-- 1. **The replay**: "a funny movie under two hours" over three little-voted
--    comedies with extreme averages and three ordinary ones returns only the
--    ordinary three, though the little-voted ones lead on prior.
-- 2. **The person's own list stays**: a little-voted film on V's watchlist
--    comes back with p_include_backlog, and leads Home's watchlist row.
-- 3. **movie_home_rows**: the genre row and the popular row hold no film under
--    the floor.
-- 4. **The cap**: on a synthetic catalog of 6,000 films, 60% of them under the
--    floor, only the 400 most voted are scored, and a film past the 400 comes
--    back when a filter shrinks the pool. The time of a call is in a diag.

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- Fixtures ---------------------------------------------------------------------
-- V ranks five films: four comedies (two Loved, two Liked) and a drama
-- (Disliked), so "Vf Comedy" is a genre V ranks high. V has one little-voted
-- comedy on the watchlist. W has nothing.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c0f0a', 'pool-v@example.com'),
  ('00000000-0000-0000-0000-0000000c0f0b', 'pool-w@example.com');

insert into public.media_items (id, medium, title, year, release_date, cover_image_id, metadata) values
  -- V's ranked films
  ('00000000-0000-0000-0000-0000000c0f01', 'movie', 'Vf Ranked One', 2001, '2001-01-01', '/r1.jpg', '{"vote_count": 900}'),
  ('00000000-0000-0000-0000-0000000c0f02', 'movie', 'Vf Ranked Two', 2002, '2002-01-01', '/r2.jpg', '{"vote_count": 900}'),
  ('00000000-0000-0000-0000-0000000c0f03', 'movie', 'Vf Ranked Three', 2003, '2003-01-01', '/r3.jpg', '{"vote_count": 900}'),
  ('00000000-0000-0000-0000-0000000c0f04', 'movie', 'Vf Ranked Four', 2004, '2004-01-01', '/r4.jpg', '{"vote_count": 900}'),
  ('00000000-0000-0000-0000-0000000c0f05', 'movie', 'Vf Ranked Five', 2005, '2005-01-01', '/r5.jpg', '{"vote_count": 900}'),
  -- the ask's example: a handful of votes each, 49 the closest to the floor
  ('00000000-0000-0000-0000-0000000c0f11', 'movie', 'Ovenbird''s Nest', 2011, '2011-01-01', '/l1.jpg', '{"vote_count": 3}'),
  ('00000000-0000-0000-0000-0000000c0f12', 'movie', 'Free Sex', 2012, '2012-01-01', '/l2.jpg', '{"vote_count": 12}'),
  ('00000000-0000-0000-0000-0000000c0f13', 'movie', 'The Key', 2013, '2013-01-01', '/l3.jpg', '{"vote_count": 49}'),
  -- three ordinary comedies, 50 the floor itself
  ('00000000-0000-0000-0000-0000000c0f21', 'movie', 'Vf Normal One', 2014, '2014-01-01', '/n1.jpg', '{"vote_count": 50}'),
  ('00000000-0000-0000-0000-0000000c0f22', 'movie', 'Vf Normal Two', 2015, '2015-01-01', '/n2.jpg', '{"vote_count": 800}'),
  ('00000000-0000-0000-0000-0000000c0f23', 'movie', 'Vf Normal Three', 2016, '2016-01-01', '/n3.jpg', '{"vote_count": 5000}'),
  -- an ordinary comedy too long for the ask
  ('00000000-0000-0000-0000-0000000c0f24', 'movie', 'Vf Normal Long', 2017, '2017-01-01', '/n4.jpg', '{"vote_count": 6000}'),
  -- V's watchlist film, four votes
  ('00000000-0000-0000-0000-0000000c0f31', 'movie', 'Vf Backlog Oddity', 2001, '2001-01-01', '/b1.jpg', '{"vote_count": 4}');

insert into public.movie_details (media_item_id, tmdb_id, runtime_minutes, genres, directors) values
  ('00000000-0000-0000-0000-0000000c0f01', -870001, 100, '{"Vf Comedy"}', '{"Vf Director A"}'),
  ('00000000-0000-0000-0000-0000000c0f02', -870002, 100, '{"Vf Comedy"}', '{"Vf Director A"}'),
  ('00000000-0000-0000-0000-0000000c0f03', -870003, 100, '{"Vf Comedy"}', '{"Vf Director B"}'),
  ('00000000-0000-0000-0000-0000000c0f04', -870004, 100, '{"Vf Comedy"}', '{"Vf Director B"}'),
  ('00000000-0000-0000-0000-0000000c0f05', -870005, 100, '{"Vf Drama"}', '{"Vf Director C"}'),
  ('00000000-0000-0000-0000-0000000c0f11', -870011, 95, '{"Vf Comedy"}', '{"Vf Director L1"}'),
  ('00000000-0000-0000-0000-0000000c0f12', -870012, 88, '{"Vf Comedy"}', '{"Vf Director L2"}'),
  ('00000000-0000-0000-0000-0000000c0f13', -870013, 110, '{"Vf Comedy"}', '{"Vf Director L3"}'),
  ('00000000-0000-0000-0000-0000000c0f21', -870021, 101, '{"Vf Comedy"}', '{"Vf Director N1"}'),
  ('00000000-0000-0000-0000-0000000c0f22', -870022, 97, '{"Vf Comedy"}', '{"Vf Director N2"}'),
  ('00000000-0000-0000-0000-0000000c0f23', -870023, 119, '{"Vf Comedy"}', '{"Vf Director N3"}'),
  ('00000000-0000-0000-0000-0000000c0f24', -870024, 140, '{"Vf Comedy"}', '{"Vf Director N4"}'),
  ('00000000-0000-0000-0000-0000000c0f31', -870031, 90, '{"Vf Comedy"}', '{"Vf Director O"}');

-- The little-voted films carry the extreme averages a handful of votes gives;
-- the ordinary ones ordinary scores.
insert into public.external_scores (media_item_id, source, score, score_count) values
  ('00000000-0000-0000-0000-0000000c0f11', 'tmdb', 100, 3),
  ('00000000-0000-0000-0000-0000000c0f12', 'tmdb', 95, 12),
  ('00000000-0000-0000-0000-0000000c0f13', 'tmdb', 92, 49),
  ('00000000-0000-0000-0000-0000000c0f21', 'tmdb', 71, 50),
  ('00000000-0000-0000-0000-0000000c0f22', 'tmdb', 74, 800),
  ('00000000-0000-0000-0000-0000000c0f23', 'tmdb', 78, 5000),
  ('00000000-0000-0000-0000-0000000c0f24', 'tmdb', 80, 6000),
  ('00000000-0000-0000-0000-0000000c0f31', 'tmdb', 90, 4);

insert into public.user_entries (user_id, media_item_id, status) values
  ('00000000-0000-0000-0000-0000000c0f0a', '00000000-0000-0000-0000-0000000c0f01', 'played'),
  ('00000000-0000-0000-0000-0000000c0f0a', '00000000-0000-0000-0000-0000000c0f02', 'played'),
  ('00000000-0000-0000-0000-0000000c0f0a', '00000000-0000-0000-0000-0000000c0f03', 'played'),
  ('00000000-0000-0000-0000-0000000c0f0a', '00000000-0000-0000-0000-0000000c0f04', 'played'),
  ('00000000-0000-0000-0000-0000000c0f0a', '00000000-0000-0000-0000-0000000c0f05', 'played'),
  ('00000000-0000-0000-0000-0000000c0f0a', '00000000-0000-0000-0000-0000000c0f31', 'backlog');

insert into public.ranking_entries (user_id, medium, tier, media_item_id, position) values
  ('00000000-0000-0000-0000-0000000c0f0a', 'movie', 'loved', '00000000-0000-0000-0000-0000000c0f01', 0),
  ('00000000-0000-0000-0000-0000000c0f0a', 'movie', 'loved', '00000000-0000-0000-0000-0000000c0f02', 1),
  ('00000000-0000-0000-0000-0000000c0f0a', 'movie', 'liked', '00000000-0000-0000-0000-0000000c0f03', 0),
  ('00000000-0000-0000-0000-0000000c0f0a', 'movie', 'liked', '00000000-0000-0000-0000-0000000c0f04', 1),
  ('00000000-0000-0000-0000-0000000c0f0a', 'movie', 'disliked', '00000000-0000-0000-0000-0000000c0f05', 0);

select public.refresh_item_priors('movie');

-- ==============================================================================
-- 1. The replay
-- ==============================================================================

-- 1
select ok(
  (select min(ip.prior_score) from public.item_prior ip
    where ip.media_item_id in ('00000000-0000-0000-0000-0000000c0f11', '00000000-0000-0000-0000-0000000c0f12',
                               '00000000-0000-0000-0000-0000000c0f13'))
  > (select max(ip.prior_score) from public.item_prior ip
      where ip.media_item_id in ('00000000-0000-0000-0000-0000000c0f21', '00000000-0000-0000-0000-0000000c0f22',
                                 '00000000-0000-0000-0000-0000000c0f23')),
  'the little-voted comedies lead the ordinary ones on prior, which is how they topped the ask'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000c0f0a","role":"authenticated"}';

-- 2
select results_eq(
  $$ select c.title from public.suggestion_candidates('movie', p_genres => '{"Vf Comedy"}', p_max_minutes => 120) c
     order by c.title $$,
  $$ values ('Vf Normal One'::text), ('Vf Normal Three'), ('Vf Normal Two') $$,
  'a funny movie under two hours: the three ordinary comedies, none of the three with a handful of votes'
);

-- 3
select ok(
  exists (select 1 from public.suggestion_candidates('movie', p_genres => '{"Vf Comedy"}') c
           where c.media_item_id = '00000000-0000-0000-0000-0000000c0f24')
  and not exists (select 1 from public.suggestion_candidates('movie', p_genres => '{"Vf Comedy"}') c
           where c.media_item_id in ('00000000-0000-0000-0000-0000000c0f11', '00000000-0000-0000-0000-0000000c0f12',
                                     '00000000-0000-0000-0000-0000000c0f13')),
  'without the length the long comedy comes back, and the little-voted ones still do not: 49 votes is under the floor, 50 is not'
);

-- ==============================================================================
-- 2. The person's own list stays
-- ==============================================================================

-- 4
select ok(
  exists (select 1 from public.suggestion_candidates('movie', p_genres => '{"Vf Comedy"}', p_include_backlog => true) c
           where c.media_item_id = '00000000-0000-0000-0000-0000000c0f31')
  and not exists (select 1 from public.suggestion_candidates('movie', p_genres => '{"Vf Comedy"}') c
           where c.media_item_id = '00000000-0000-0000-0000-0000000c0f31'),
  'V''s four-vote watchlist film comes back with p_include_backlog, and only then: the floor never drops the person''s own'
);

-- 5
select is(
  (select count(*)::integer from public.suggestion_candidates('movie', p_genres => '{"Vf Comedy"}', p_include_backlog => true) c
    where c.media_item_id in ('00000000-0000-0000-0000-0000000c0f11', '00000000-0000-0000-0000-0000000c0f12',
                              '00000000-0000-0000-0000-0000000c0f13')),
  0,
  'and p_include_backlog lets in V''s own, not every little-voted film'
);

-- 6
select ok(
  (select candidates @> '[{"media_item_id": "00000000-0000-0000-0000-0000000c0f31"}]'
     from public.movie_home_rows('US', '2026-10-13') where kind = 'watchlist'),
  'Home''s watchlist row keeps V''s four-vote film'
);

-- ==============================================================================
-- 3. movie_home_rows
-- ==============================================================================

-- 7
select results_eq(
  $$ select kind, variable_part from public.movie_home_rows('US', '2026-10-13') where kind = 'genre' $$,
  $$ values ('genre'::text, 'Vf Comedy'::text) $$,
  'V ranks comedies high, so Home has a Vf Comedy row'
);

-- 8
select is(
  (select array_agg(c ->> 'title' order by c ->> 'title')
     from public.movie_home_rows('US', '2026-10-13') r
     cross join jsonb_array_elements(r.candidates) c
    where r.kind = 'genre'),
  array['Vf Normal Long', 'Vf Normal One', 'Vf Normal Three', 'Vf Normal Two'],
  'and it offers the ordinary comedies only'
);

-- 9
select is(
  (select count(*)::integer
     from public.movie_home_rows('US', '2026-10-13') r
     cross join jsonb_array_elements(r.candidates) c
     join public.media_items m on m.id = (c ->> 'media_item_id')::uuid
    where r.kind <> 'watchlist'
      and nullif(m.metadata ->> 'vote_count', '')::numeric < 50),
  0,
  'no row but the watchlist offers a film under 50 votes'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000c0f0b","role":"authenticated"}';

-- 10
select ok(
  (select kind = 'popular'
          and jsonb_array_length(candidates) > 0
          and not candidates @> '[{"media_item_id": "00000000-0000-0000-0000-0000000c0f11"}]'
          and not candidates @> '[{"media_item_id": "00000000-0000-0000-0000-0000000c0f12"}]'
          and not candidates @> '[{"media_item_id": "00000000-0000-0000-0000-0000000c0f13"}]'
          and not candidates @> '[{"media_item_id": "00000000-0000-0000-0000-0000000c0f31"}]'
     from public.movie_home_rows('US', '2026-10-13')),
  'W''s popular row leaves out every film under the floor'
);

reset role;

-- ==============================================================================
-- 4. The cap, on 6,000 films
-- ==============================================================================
--
-- "Vf Filler" films: 60% with under 50 votes (the long tail TMDB's catalog
-- has), the rest with 100 or more. Deep Film shares V's Loved director, so its
-- content beats every filler's, but its 60 votes put it last of those over the
-- floor: 2,401st, past the 400 the pool keeps. Its 7.5 outside is above every
-- voted filler's (5.0 to 7.4), so scored it would lead. Statistics taken, as
-- the nightly job leaves the hosted project.

create function pg_temp.film(i integer) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-00cf-' || lpad(to_hex(i), 12, '0'))::uuid
$$;

insert into public.media_items (id, medium, title, year, release_date, cover_image_id, metadata)
select pg_temp.film(i), 'movie', 'Vf Filler ' || i, (1950 + i % 76)::smallint, make_date(1950 + i % 76, 1, 1),
  '/f' || i || '.jpg',
  jsonb_build_object('vote_count', case when i % 5 < 3 then i % 50 else 100 + i end)
from generate_series(1, 6000) i;

insert into public.movie_details (media_item_id, tmdb_id, runtime_minutes, genres, directors)
select pg_temp.film(i), -880000 - i, 80 + i % 100, '{"Vf Filler"}', array['Vf Filler Director ' || i % 500]
from generate_series(1, 6000) i;

insert into public.external_scores (media_item_id, source, score, score_count)
select pg_temp.film(i), 'tmdb', case when i % 5 < 3 then 90 + i % 10 else 50 + i % 25 end,
  case when i % 5 < 3 then i % 50 else 100 + i end
from generate_series(1, 6000) i;

insert into public.media_items (id, medium, title, year, release_date, cover_image_id, metadata) values
  ('00000000-0000-0000-0000-0000000c0f41', 'movie', 'Vf Deep Film', 2001, '2001-01-01', '/d1.jpg', '{"vote_count": 60}');
insert into public.movie_details (media_item_id, tmdb_id, runtime_minutes, genres, directors) values
  ('00000000-0000-0000-0000-0000000c0f41', -870041, 100, '{"Vf Filler"}', '{"Vf Director A"}');
insert into public.external_scores (media_item_id, source, score, score_count) values
  ('00000000-0000-0000-0000-0000000c0f41', 'tmdb', 75, 60);

-- The one place Deep Film streams.
insert into public.watch_providers (provider_id, name) values (-870001, 'Vf Flix');
insert into public.watch_availability (media_item_id, region, provider_id, offer_type) values
  ('00000000-0000-0000-0000-0000000c0f41', 'US', -870001, 'flatrate');

select public.refresh_item_priors('movie');
analyze public.media_items;
analyze public.movie_details;
analyze public.external_scores;
analyze public.item_prior;
analyze public.user_entries;
analyze public.ranking_entries;
set local jit = off;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000c0f0a","role":"authenticated"}';

-- 11
select ok(
  not exists (select 1 from public.suggestion_candidates('movie', p_genres => '{"Vf Filler"}', p_limit => 50) c
               where c.media_item_id = '00000000-0000-0000-0000-0000000c0f41')
  and (select c.media_item_id from public.suggestion_candidates('movie', p_genres => '{"Vf Filler"}', p_provider_ids => '{-870001}') c
        limit 1) = '00000000-0000-0000-0000-0000000c0f41',
  'only the 400 most voted are scored: Deep Film is cut, and comes back when a filter shrinks the pool'
);

-- 12
select ok(
  (select c.predicted_score from public.suggestion_candidates('movie', p_genres => '{"Vf Filler"}', p_provider_ids => '{-870001}') c)
  > (select max(c.predicted_score) from public.suggestion_candidates('movie', p_genres => '{"Vf Filler"}', p_limit => 50) c),
  'and scored, it does beat every filler, so the cap is what kept it out'
);

-- 13
select is(
  (select count(*)::integer
     from public.suggestion_candidates('movie', p_genres => '{"Vf Filler"}', p_limit => 50) c
     join public.media_items m on m.id = c.media_item_id
    where nullif(m.metadata ->> 'vote_count', '')::numeric < 50),
  0,
  'and no filler under the floor is a candidate, though 3,600 of them score 9 or more outside'
);

create function pg_temp.best_of_three_ms() returns numeric language plpgsql as $$
declare
  v_start timestamptz;
  v_best numeric;
  v_ms numeric;
begin
  for i in 1..3 loop
    v_start := clock_timestamp();
    perform * from public.suggestion_candidates('movie', p_genres => '{"Vf Filler"}', p_max_minutes => 120);
    v_ms := extract(epoch from clock_timestamp() - v_start) * 1000;
    v_best := least(coalesce(v_best, v_ms), v_ms);
  end loop;
  return round(v_best, 1);
end;
$$;

select diag('suggestion_candidates on 6,000 films, best of three: ' || pg_temp.best_of_three_ms() || ' ms');

-- 14
select throws_ok(
  $$ select * from public.suggestion_candidates('movie', p_platforms => '{"Test Switch"}') $$,
  '22023',
  null,
  'the filters it refuses are refused as before'
);

reset role;

select * from finish();
rollback;
