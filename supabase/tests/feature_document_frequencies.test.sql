-- pgTAP tests for supabase/migrations/20261028150000_feature_document_frequencies.sql
-- (VER-220). Run with: supabase test db
--
-- 1. **The table's security**: Row Level Security from its first migration,
--    one select policy for signed-in users, item_prior's grants; the refresh
--    service role only; recommendation_feature_idf still internal after its
--    replace.
-- 2. **Before the first refresh**: with the table empty, the content profile
--    is the foundations' profile, counted live: the same rows, the same
--    numbers, for games, films and series and for a held-out item. Never empty,
--    never a division by zero.
-- 3. **The refresh**: every feature on two or more items of each medium, with
--    the live count and the medium's item count, and nothing on one item.
-- 4. **Both ways, the same numbers**: after the refresh the profile equals the
--    foundations' live profile exactly, and the scores, the harness and the ask
--    equal what they were before it, why included. The profile reads the
--    table: change a stored count and the weight follows.
-- 5. **Between refreshes**: a feature the mirror added since is counted live
--    and weighs what it always would have; a stored one keeps last night's
--    count until the next refresh, which picks up the new one and drops a
--    feature that fell to one item.
-- 6. **One medium at a time**: a medium refreshed beside one that is not.
-- 7. **The table as each role**: signed-in users read every row, anon reads
--    none, neither writes, and only the service role refreshes.
--
-- "Both ways" is the foundations' recommendation_feature_idf and
-- recommendation_content_profile, copied verbatim below into pg_temp as
-- live_feature_idf and live_content_profile: the count this migration
-- replaced, run beside the one it added. The fixture's names start with "Dfq"
-- and its ids are negative, so none of it can collide with a mirrored catalog,
-- and every comparison is against a live count taken in the same state, so the
-- suite holds on a database that also carries the real catalog.

begin;

create extension if not exists pgtap with schema extensions;

select plan(49);

-- The foundations' count, verbatim (20260924120000_recommendation_foundations.sql, 5c and 5d)

create function pg_temp.live_feature_idf(
  p_medium public.medium,
  p_features text[]
)
returns table (
  feature text,
  item_count integer,
  idf numeric
)
language sql
stable
as $$
  with catalog as (
    select count(*)::numeric as n
    from public.media_items m
    where m.medium = p_medium
  ),
  df as (
    select f.feature, count(*)::integer as k
    from public.recommendation_item_features(p_medium, null, coalesce(p_features, '{}')) f
    group by f.feature
  )
  -- idf(f) = ln(N / n_f)
  select df.feature, df.k, ln(c.n / df.k)
  from df
  cross join catalog c;
$$;

create function pg_temp.live_content_profile(
  p_user_id uuid,
  p_medium public.medium,
  p_exclude_item uuid default null
)
returns table (
  feature text,
  weight numeric
)
language sql
stable
as $$
  with list as (
    select s.media_item_id, s.score
    from public.recommendation_user_scores(p_user_id, p_medium, p_exclude_item) s
  ),
  centered as (
    -- s_i - mu
    select l.media_item_id, l.score - avg(l.score) over () as d
    from list l
  ),
  spread as (
    -- sum of |s_i - mu| over the whole list
    select sum(abs(c.d)) as total
    from centered c
  ),
  shared as (
    -- sum of (s_i - mu) over the items carrying f, for features on two or more of them
    select f.feature, sum(c.d) as sum_d
    from public.recommendation_item_features(
      p_medium, (select coalesce(array_agg(l.media_item_id), '{}') from list l)
    ) f
    join centered c on c.media_item_id = f.media_item_id
    group by f.feature
    having count(*) >= 2
  )
  select
    s.feature,
    -- weight(f) = sum_d * idf(f) / sum |s_i - mu|
    s.sum_d * i.idf / sp.total
  from shared s
  join pg_temp.live_feature_idf(
    p_medium, (select coalesce(array_agg(s2.feature), '{}') from shared s2)
  ) i on i.feature = s.feature
  cross join spread sp
  where sp.total > 0;
$$;

-- Fixtures ---------------------------------------------------------------------
-- 3,000 games: one or two of eleven genres, one or two of seven platforms, one
-- of 900 developers (three or four games each), 45 release years; the last ten
-- each by a developer of their own. 3,000 films: one or two of nine genres, one
-- of 1,200 directors, 70 years; the last ten each by a director of their own.
-- 60 series: five genres, twenty creators, thirty years.
--
-- G ranks 31 games: for each of ten developers d, the three games d, d + 900
-- and d + 1800, which share their developer and their year, all in one tier
-- (d 1 to 3 Loved, 4 to 6 Liked, 7 and 8 Fine, 9 and 10 Disliked); and game
-- 2995 in Fine, whose developer is on no other game. F ranks 31 films the same
-- way (d, d + 1200, d + 2400; film 2996). T ranks six series: creators 1 and 2
-- three times each, high and low.

create function pg_temp.game(i integer) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-00df-' || lpad(to_hex(i), 12, '0'))::uuid
$$;
create function pg_temp.film(i integer) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-00de-' || lpad(to_hex(i), 12, '0'))::uuid
$$;
create function pg_temp.series(i integer) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-00dc-' || lpad(to_hex(i), 12, '0'))::uuid
$$;
create function pg_temp.tier_of(d integer) returns public.tier language sql immutable as $$
  select (case when d <= 3 then 'loved' when d <= 6 then 'liked' when d <= 8 then 'fine' else 'disliked' end)::public.tier
$$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000df0a1', 'df-g@example.com'),
  ('00000000-0000-0000-0000-0000000df0a2', 'df-f@example.com'),
  ('00000000-0000-0000-0000-0000000df0a3', 'df-t@example.com');

insert into public.media_items (id, medium, title, year, cover_image_id, metadata)
select pg_temp.game(i), 'game', 'Dfq Game ' || i, (1980 + i % 45)::smallint, 'codf' || i,
  jsonb_build_object('total_rating_count', 100 + (i * 7919) % 3000)
from generate_series(1, 3000) i;

insert into public.game_details (media_item_id, igdb_id, genres, platforms, developer, time_to_beat_normally_seconds)
select pg_temp.game(i), -660000 - i,
  array['Dfq Genre ' || i % 11] || case when i % 3 = 0 then array['Dfq Genre ' || (i / 11) % 11] else '{}'::text[] end,
  array['Dfq Platform ' || i % 7] || case when i % 2 = 0 then array['Dfq Platform ' || (i / 7) % 7] else '{}'::text[] end,
  case when i > 2990 then 'Dfq Solo ' || i else 'Dfq Dev ' || i % 900 end,
  3600 * (5 + i % 60)
from generate_series(1, 3000) i;

insert into public.external_scores (media_item_id, source, score)
select pg_temp.game(i), 'igdb_critics', 40 + (i * 37) % 55
from generate_series(1, 3000) i;

insert into public.media_items (id, medium, title, year, release_date, cover_image_id, metadata)
select pg_temp.film(i), 'movie', 'Dfq Film ' || i, (1950 + i % 70)::smallint, make_date(1950 + i % 70, 1, 1),
  '/dfq' || i || '.jpg', jsonb_build_object('vote_count', 100 + i)
from generate_series(1, 3000) i;

insert into public.movie_details (media_item_id, tmdb_id, runtime_minutes, genres, directors)
select pg_temp.film(i), -650000 - i, 80 + i % 100,
  array['Dfq Film Genre ' || i % 9] || case when i % 2 = 0 then array['Dfq Film Genre ' || (i / 9) % 9] else '{}'::text[] end,
  case when i > 2990 then array['Dfq Solo Director ' || i] else array['Dfq Director ' || i % 1200] end
from generate_series(1, 3000) i;

insert into public.external_scores (media_item_id, source, score)
select pg_temp.film(i), 'tmdb', 40 + (i * 37) % 50
from generate_series(1, 3000) i;

insert into public.media_items (id, medium, title, year, cover_image_id)
select pg_temp.series(i), 'tv', 'Dfq Series ' || i, (1990 + i % 30)::smallint, '/dfqs' || i || '.jpg'
from generate_series(1, 60) i;

insert into public.tv_details (media_item_id, tmdb_id, genres, creators)
select pg_temp.series(i), -640000 - i, array['Dfq Series Genre ' || i % 5], array['Dfq Creator ' || i % 20]
from generate_series(1, 60) i;

create temp table df_lists (user_id uuid, medium public.medium, media_item_id uuid, tier public.tier, k integer);

insert into df_lists
select '00000000-0000-0000-0000-0000000df0a1'::uuid, 'game'::public.medium, pg_temp.game(d + 900 * k), pg_temp.tier_of(d), d * 10 + k
from generate_series(1, 10) d cross join generate_series(0, 2) k
union all
select '00000000-0000-0000-0000-0000000df0a1', 'game', pg_temp.game(2995), 'fine', 75
union all
select '00000000-0000-0000-0000-0000000df0a2', 'movie', pg_temp.film(d + 1200 * k), pg_temp.tier_of(d), d * 10 + k
from generate_series(1, 10) d cross join generate_series(0, 2) k
union all
select '00000000-0000-0000-0000-0000000df0a2', 'movie', pg_temp.film(2996), 'fine', 75
union all
select '00000000-0000-0000-0000-0000000df0a3', 'tv', pg_temp.series(c + 20 * k),
  (case when c = 1 then 'loved' else 'disliked' end)::public.tier, k
from generate_series(1, 2) c cross join generate_series(0, 2) k;

insert into public.user_entries (user_id, media_item_id, status)
select l.user_id, l.media_item_id, 'played' from df_lists l;

insert into public.ranking_entries (user_id, medium, tier, media_item_id, position)
select l.user_id, l.medium, l.tier, l.media_item_id,
  (row_number() over (partition by l.user_id, l.tier order by l.k) - 1)::integer
from df_lists l;

select public.refresh_item_priors();

-- Whatever an earlier refresh left on this database, the suite starts from
-- an empty table; the transaction rolls it back.
truncate public.feature_document_frequencies;

-- ==============================================================================
-- 1. The table's security, and the functions'
-- ==============================================================================

-- 1
select ok(
  (select c.relrowsecurity from pg_class c where c.oid = 'public.feature_document_frequencies'::regclass),
  'Row Level Security is on for feature_document_frequencies from its first migration'
);

-- 2
select policies_are(
  'public', 'feature_document_frequencies',
  array['document frequencies are readable by signed-in users'],
  'exactly one policy: no client can write a count'
);

-- 3
select is(
  (select p.polcmd::text || ':' || array_to_string(array(select r.rolname from pg_roles r where r.oid = any (p.polroles)), ',')
     from pg_policy p where p.polrelid = 'public.feature_document_frequencies'::regclass),
  'r:authenticated',
  'and it is a select policy for signed-in users'
);

-- 4
select table_privs_are(
  'public', 'feature_document_frequencies', 'authenticated', array['SELECT'],
  'signed-in users may read the counts and nothing else, as item_prior'
);

-- 5
select table_privs_are(
  'public', 'feature_document_frequencies', 'anon', array['SELECT'],
  'a signed-out caller may ask, and RLS answers: no policy, so no rows'
);

-- 6
select ok(
  has_table_privilege('service_role', 'public.feature_document_frequencies', 'select')
  and has_table_privilege('service_role', 'public.feature_document_frequencies', 'insert')
  and has_table_privilege('service_role', 'public.feature_document_frequencies', 'delete'),
  'the service role may read, write and delete them, which the refresh does'
);

-- 7
select function_privs_are(
  'public', 'refresh_feature_document_frequencies', array['public.medium'],
  'authenticated', array[]::text[],
  'signed-in users cannot run the refresh'
);

-- 8
select function_privs_are(
  'public', 'refresh_feature_document_frequencies', array['public.medium'],
  'anon', array[]::text[],
  'nor can anon'
);

-- 9
select ok(
  has_function_privilege('service_role', 'public.refresh_feature_document_frequencies(public.medium)', 'execute'),
  'the service role can'
);

-- 10
select ok(
  not has_function_privilege('authenticated', 'public.recommendation_feature_idf(public.medium,text[])', 'execute')
  and not has_function_privilege('anon', 'public.recommendation_feature_idf(public.medium,text[])', 'execute')
  and has_function_privilege('service_role', 'public.recommendation_feature_idf(public.medium,text[])', 'execute'),
  'recommendation_feature_idf is still internal after its replace: the service role only'
);

-- 11
select ok(
  (select bool_and(not p.prosecdef and p.proconfig @> array['search_path=public, extensions'])
     from pg_proc p
    where p.oid in ('public.refresh_feature_document_frequencies(public.medium)'::regprocedure,
                    'public.recommendation_feature_idf(public.medium,text[])'::regprocedure)),
  'both run as the caller with a pinned search_path'
);

-- ==============================================================================
-- 2. Before the first refresh: the live count
-- ==============================================================================

-- 12
select is(
  (select count(*) from public.feature_document_frequencies),
  0::bigint,
  'nothing is stored yet'
);

-- 13
select results_eq(
  $$ select feature, weight from public.recommendation_content_profile('00000000-0000-0000-0000-0000000df0a1', 'game') order by feature $$,
  $$ select feature, weight from pg_temp.live_content_profile('00000000-0000-0000-0000-0000000df0a1', 'game') order by feature $$,
  'with the table empty, G''s game profile is the foundations'' profile, weight for weight'
);

-- 14
select results_eq(
  $$ select feature, weight from public.recommendation_content_profile('00000000-0000-0000-0000-0000000df0a2', 'movie') order by feature $$,
  $$ select feature, weight from pg_temp.live_content_profile('00000000-0000-0000-0000-0000000df0a2', 'movie') order by feature $$,
  'and so is F''s film profile'
);

-- 15
select results_eq(
  $$ select feature, weight from public.recommendation_content_profile('00000000-0000-0000-0000-0000000df0a3', 'tv') order by feature $$,
  $$ select feature, weight from pg_temp.live_content_profile('00000000-0000-0000-0000-0000000df0a3', 'tv') order by feature $$,
  'and T''s series profile'
);

-- 16
select results_eq(
  $$ select feature, weight from public.recommendation_content_profile(
       '00000000-0000-0000-0000-0000000df0a1', 'game', '00000000-0000-0000-00df-000000000001') order by feature $$,
  $$ select feature, weight from pg_temp.live_content_profile(
       '00000000-0000-0000-0000-0000000df0a1', 'game', '00000000-0000-0000-00df-000000000001') order by feature $$,
  'and G''s with a game held out, the harness''s path'
);

-- 17
select ok(
  (select count(distinct split_part(p.feature, ':', 1)) = 4 and bool_and(p.weight is not null)
     from public.recommendation_content_profile('00000000-0000-0000-0000-0000000df0a1', 'game') p)
  and (select count(distinct split_part(p.feature, ':', 1)) = 3 and bool_and(p.weight is not null)
     from public.recommendation_content_profile('00000000-0000-0000-0000-0000000df0a2', 'movie') p)
  and (select count(distinct split_part(p.feature, ':', 1)) = 3 and bool_and(p.weight is not null)
     from public.recommendation_content_profile('00000000-0000-0000-0000-0000000df0a3', 'tv') p),
  'an empty table scores everything: every kind of feature in all three profiles, every weight a number'
);

-- The numbers built on the profile, before the refresh. As the owner with G's
-- and F's claims set, the path a signed-in ask takes through the definer.

create temp table df_before_scores as
select 'game'::public.medium as medium, s.*
from public.recommendation_scores('00000000-0000-0000-0000-0000000df0a1', 'game',
  array(select pg_temp.game(i) from generate_series(1, 3000, 7) i)) s
union all
select 'movie', s.*
from public.recommendation_scores('00000000-0000-0000-0000-0000000df0a2', 'movie',
  array(select pg_temp.film(i) from generate_series(1, 3000, 7) i)) s;

create temp table df_before_loo as
select * from public.recommendation_loo('00000000-0000-0000-0000-0000000df0a1', 'game');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000df0a1","role":"authenticated"}';
create temp table df_before_game_ask as
select * from public.suggestion_candidates('game', p_genres => '{"Dfq Genre 1","Dfq Genre 2"}', p_limit => 50) with ordinality;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000df0a2","role":"authenticated"}';
create temp table df_before_film_ask as
select * from public.suggestion_candidates('movie', p_genres => '{"Dfq Film Genre 1"}', p_limit => 50) with ordinality;
reset request.jwt.claims;

-- 18
select ok(
  (select count(*) = 2 * 429 and count(content_score) = 2 * 429 from df_before_scores)
  and (select count(*) = 50 from df_before_game_ask)
  and (select count(*) = 50 from df_before_film_ask),
  'and every score has a content part: 429 games and 429 films scored, two full asks'
);

-- ==============================================================================
-- 3. The refresh
-- ==============================================================================

-- The refresh in a statement of its own: a subquery in the same statement
-- would count the table as it was when the statement began.
create temp table df_refreshed as select public.refresh_feature_document_frequencies() as n;

-- 19
select is(
  (select n from df_refreshed),
  (select count(*)::integer from public.feature_document_frequencies),
  'the refresh returns the rows it wrote'
);

-- 20
-- Counted independently: the feature view grouped directly, not through
-- recommendation_item_features, which is what the refresh uses.
select set_eq(
  $$ select medium, feature, item_count, medium_item_count from public.feature_document_frequencies $$,
  $$ select f.medium, f.feature, f.k, n.n
       from (select r.medium, r.feature, count(distinct r.media_item_id)::integer as k
               from public.recommendation_feature_rows r
              group by r.medium, r.feature
             having count(distinct r.media_item_id) >= 2) f
       join (select m.medium, count(*)::integer as n from public.media_items m group by m.medium) n
         on n.medium = f.medium $$,
  'it stores every feature on two or more items of each medium, with how many carry it and how many the medium has'
);

-- 21
select results_eq(
  $$ select feature, item_count from public.feature_document_frequencies
      where feature in ('developer:Dfq Dev 1', 'director:Dfq Director 1', 'creator:Dfq Creator 1')
      order by feature $$,
  $$ values ('creator:Dfq Creator 1'::text, 3), ('developer:Dfq Dev 1', 4), ('director:Dfq Director 1', 3) $$,
  'worked: developer 1 has four games (1, 901, 1801, 2701), director 1 three films (1, 1201, 2401), creator 1 three series (1, 21, 41)'
);

-- 22
select is(
  (select count(*) from public.feature_document_frequencies
    where feature in ('developer:Dfq Solo 2995', 'director:Dfq Solo Director 2996')),
  0::bigint,
  'a feature on one item of the whole medium is not stored: it can never be on two of anyone''s'
);

-- 23
select ok(
  (select bool_and(computed_at = now()) from public.feature_document_frequencies),
  'every row carries the refresh''s time'
);

-- ==============================================================================
-- 4. Both ways, the same numbers
-- ==============================================================================

-- 24
select results_eq(
  $$ select feature, weight from public.recommendation_content_profile('00000000-0000-0000-0000-0000000df0a1', 'game') order by feature $$,
  $$ select feature, weight from pg_temp.live_content_profile('00000000-0000-0000-0000-0000000df0a1', 'game') order by feature $$,
  'read from the table, G''s game profile is the live one, weight for weight'
);

-- 25
select results_eq(
  $$ select feature, weight from public.recommendation_content_profile('00000000-0000-0000-0000-0000000df0a2', 'movie') order by feature $$,
  $$ select feature, weight from pg_temp.live_content_profile('00000000-0000-0000-0000-0000000df0a2', 'movie') order by feature $$,
  'and F''s film profile'
);

-- 26
select results_eq(
  $$ select feature, weight from public.recommendation_content_profile('00000000-0000-0000-0000-0000000df0a3', 'tv') order by feature $$,
  $$ select feature, weight from pg_temp.live_content_profile('00000000-0000-0000-0000-0000000df0a3', 'tv') order by feature $$,
  'and T''s series profile'
);

-- 27
select results_eq(
  $$ select feature, weight from public.recommendation_content_profile(
       '00000000-0000-0000-0000-0000000df0a1', 'game', '00000000-0000-0000-00df-000000000001') order by feature $$,
  $$ select feature, weight from pg_temp.live_content_profile(
       '00000000-0000-0000-0000-0000000df0a1', 'game', '00000000-0000-0000-00df-000000000001') order by feature $$,
  'and G''s with a game held out'
);

-- 28
select results_eq(
  $$ select medium, media_item_id, prior_score, content_score, predicted_score, confidence, why
       from df_before_scores order by medium, media_item_id $$,
  $$ select 'game'::public.medium, s.media_item_id, s.prior_score, s.content_score, s.predicted_score, s.confidence, s.why
       from public.recommendation_scores('00000000-0000-0000-0000-0000000df0a1', 'game',
         array(select pg_temp.game(i) from generate_series(1, 3000, 7) i)) s
     union all
     select 'movie', s.media_item_id, s.prior_score, s.content_score, s.predicted_score, s.confidence, s.why
       from public.recommendation_scores('00000000-0000-0000-0000-0000000df0a2', 'movie',
         array(select pg_temp.film(i) from generate_series(1, 3000, 7) i)) s
     order by 1, 2 $$,
  'every score is what it was before the refresh, the why included: 858 items'
);

-- 29
select results_eq(
  $$ select * from df_before_loo order by media_item_id $$,
  $$ select * from public.recommendation_loo('00000000-0000-0000-0000-0000000df0a1', 'game') order by media_item_id $$,
  'and so is the harness, which rebuilds the profile once per held-out game'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000df0a1","role":"authenticated"}';

-- 30
select results_eq(
  $$ select * from df_before_game_ask order by ordinality $$,
  $$ select * from public.suggestion_candidates('game', p_genres => '{"Dfq Genre 1","Dfq Genre 2"}', p_limit => 50)
       with ordinality order by ordinality $$,
  'and G''s ask returns the same fifty games in the same order with the same numbers'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000df0a2","role":"authenticated"}';

-- 31
select results_eq(
  $$ select * from df_before_film_ask order by ordinality $$,
  $$ select * from public.suggestion_candidates('movie', p_genres => '{"Dfq Film Genre 1"}', p_limit => 50)
       with ordinality order by ordinality $$,
  'and F''s ask the same fifty films'
);

reset request.jwt.claims;

-- 32
-- With n_f set to N, idf = ln(1) = 0, so the weight is 0: the number the
-- profile uses is the stored one.
update public.feature_document_frequencies
set item_count = medium_item_count
where medium = 'game' and feature = 'developer:Dfq Dev 1';

select is(
  (select p.weight from public.recommendation_content_profile('00000000-0000-0000-0000-0000000df0a1', 'game') p
    where p.feature = 'developer:Dfq Dev 1'),
  0::numeric,
  'the profile reads the table: a stored count changed by hand moves the weight'
);

select public.refresh_feature_document_frequencies('game');

-- ==============================================================================
-- 5. Between refreshes
-- ==============================================================================
--
-- A mirror run brings two games by a new developer, in genre 1, and G ranks
-- both Loved. Tonight's refresh has not run.

insert into public.media_items (id, medium, title, year, cover_image_id) values
  (pg_temp.game(3001), 'game', 'Dfq Game 3001', 2024, 'codf3001'),
  (pg_temp.game(3002), 'game', 'Dfq Game 3002', 2025, 'codf3002');
insert into public.game_details (media_item_id, igdb_id, genres, platforms, developer) values
  (pg_temp.game(3001), -663001, '{"Dfq Genre 1"}', '{"Dfq Platform 1"}', 'Dfq Dev New'),
  (pg_temp.game(3002), -663002, '{"Dfq Genre 1"}', '{"Dfq Platform 1"}', 'Dfq Dev New');
insert into public.user_entries (user_id, media_item_id, status) values
  ('00000000-0000-0000-0000-0000000df0a1', pg_temp.game(3001), 'played'),
  ('00000000-0000-0000-0000-0000000df0a1', pg_temp.game(3002), 'played');
insert into public.ranking_entries (user_id, medium, tier, media_item_id, position) values
  ('00000000-0000-0000-0000-0000000df0a1', 'game', 'loved', pg_temp.game(3001), 9),
  ('00000000-0000-0000-0000-0000000df0a1', 'game', 'loved', pg_temp.game(3002), 10);

-- 33
select is(
  (select p.weight from public.recommendation_content_profile('00000000-0000-0000-0000-0000000df0a1', 'game') p
    where p.feature = 'developer:Dfq Dev New'),
  (select p.weight from pg_temp.live_content_profile('00000000-0000-0000-0000-0000000df0a1', 'game') p
    where p.feature = 'developer:Dfq Dev New'),
  'a feature the table does not have yet is counted live: the new developer weighs what it always would have'
);

-- 34
select ok(
  (select p.weight > 0 from public.recommendation_content_profile('00000000-0000-0000-0000-0000000df0a1', 'game') p
    where p.feature = 'developer:Dfq Dev New'),
  'and it is in the profile, positive, rather than missing'
);

-- 35
select results_eq(
  $$ select feature, item_count, idf from public.recommendation_feature_idf('game', '{"genre:Dfq Genre 1"}') $$,
  $$ select feature, item_count, ln(medium_item_count::numeric / item_count)
       from public.feature_document_frequencies where medium = 'game' and feature = 'genre:Dfq Genre 1' $$,
  'a stored feature keeps last night''s count until the next refresh'
);

-- 36
select isnt(
  (select item_count from public.recommendation_feature_idf('game', '{"genre:Dfq Genre 1"}')),
  (select item_count from pg_temp.live_feature_idf('game', '{"genre:Dfq Genre 1"}')),
  'though the live count has moved on by the two new games'
);

-- 37
select is(
  (select count(*) from public.feature_document_frequencies
    where medium = 'game' and feature = 'developer:Dfq Dev New'),
  0::bigint,
  'the new developer has no row until the next refresh'
);

select public.refresh_feature_document_frequencies('game');

-- 38
select is(
  (select item_count || ' of ' || medium_item_count from public.feature_document_frequencies
    where medium = 'game' and feature = 'developer:Dfq Dev New'),
  '2 of ' || (select count(*) from public.media_items where medium = 'game'),
  'with its two games, of a medium two larger'
);

-- 39
select results_eq(
  $$ select feature, weight from public.recommendation_content_profile('00000000-0000-0000-0000-0000000df0a1', 'game') order by feature $$,
  $$ select feature, weight from pg_temp.live_content_profile('00000000-0000-0000-0000-0000000df0a1', 'game') order by feature $$,
  'after it, G''s profile is the live one again'
);

-- 40
update public.game_details set developer = 'Dfq Dev Moved' where media_item_id = pg_temp.game(3002);
select public.refresh_feature_document_frequencies('game');

select is(
  (select count(*) from public.feature_document_frequencies
    where medium = 'game' and feature in ('developer:Dfq Dev New', 'developer:Dfq Dev Moved')),
  0::bigint,
  'a feature that falls to one item leaves the table at the next refresh'
);

-- ==============================================================================
-- 6. One medium at a time
-- ==============================================================================

truncate public.feature_document_frequencies;
create temp table df_games_only as select public.refresh_feature_document_frequencies('game') as n;

-- 41
select ok(
  (select n from df_games_only) = (select count(*)::integer from public.feature_document_frequencies)
  and not exists (select 1 from public.feature_document_frequencies where medium <> 'game'),
  'a refresh of games writes games only'
);

-- 42
select results_eq(
  $$ select feature, weight from public.recommendation_content_profile('00000000-0000-0000-0000-0000000df0a2', 'movie') order by feature $$,
  $$ select feature, weight from pg_temp.live_content_profile('00000000-0000-0000-0000-0000000df0a2', 'movie') order by feature $$,
  'and films, with no rows of their own, are counted live beside it'
);

select public.refresh_feature_document_frequencies();

-- ==============================================================================
-- 7. The table as each role
-- ==============================================================================

create temp table df_stored as select count(*)::bigint as n from public.feature_document_frequencies;
grant select on df_stored to authenticated, anon, service_role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000df0a1","role":"authenticated"}';

-- 43
select ok(
  (select count(*) from public.feature_document_frequencies) = (select n from df_stored)
  and (select n from df_stored) > 0,
  'a signed-in user reads every stored count'
);

-- 44
select throws_ok(
  $$ insert into public.feature_document_frequencies (medium, feature, item_count, medium_item_count)
     values ('game', 'genre:Dfq Invented', 2, 3) $$,
  '42501',
  null,
  'but cannot write one'
);

-- 45
select throws_ok(
  $$ delete from public.feature_document_frequencies where medium = 'game' $$,
  '42501',
  null,
  'nor delete one'
);

-- 46
select throws_ok(
  $$ select public.refresh_feature_document_frequencies() $$,
  '42501',
  null,
  'nor run the refresh'
);

reset role;
set local role anon;
reset request.jwt.claims;

-- 47
select is(
  (select count(*) from public.feature_document_frequencies),
  0::bigint,
  'a signed-out read is empty, not an error'
);

reset role;
delete from public.feature_document_frequencies where medium = 'movie';
set local role service_role;

-- 48
select lives_ok(
  $$ select public.refresh_feature_document_frequencies('movie') $$,
  'the service role runs the refresh'
);

-- 49
select ok(
  (select count(*) from public.feature_document_frequencies) = (select n from df_stored),
  'and it writes the films'' rows back, the same count as before'
);

reset role;

-- ==============================================================================
-- Cost, on this fixture
-- ==============================================================================

set local jit = off;

create function pg_temp.profile_ms() returns numeric language plpgsql as $$
declare
  v_start timestamptz;
  v_best numeric;
  v_ms numeric;
begin
  for i in 1..3 loop
    v_start := clock_timestamp();
    perform * from public.recommendation_content_profile('00000000-0000-0000-0000-0000000df0a1', 'game');
    v_ms := extract(epoch from clock_timestamp() - v_start) * 1000;
    v_best := least(coalesce(v_best, v_ms), v_ms);
  end loop;
  return round(v_best, 1);
end;
$$;

select diag('G''s game profile on 3,000 games, best of three: ' || pg_temp.profile_ms() || ' ms read from the table');
truncate public.feature_document_frequencies;
select diag('and ' || pg_temp.profile_ms() || ' ms counted live');

select * from finish();
rollback;
