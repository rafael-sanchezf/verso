-- pgTAP tests for supabase/migrations/20260924120000_recommendation_foundations.sql.
-- Run with: supabase test db
--
-- The seven points of item 7 in docs/design/recommendation-engine.md ("PR A,
-- the foundations"), in the file's order:
--
-- 1. **Percentiles and the band math.** A three-item list reads 0.833, 0.5 and
--    0.167, and every score matches packages/core scoreForPosition, including
--    the cases where exact decimal arithmetic would round the other way.
-- 2. **The prior on worked numbers.** Each fixture prior is worked by hand in
--    the comment above its assertion: the source order, the tmdb scale, the
--    shrinkage with C = 10, and the fallbacks.
-- 3. **RLS on both log tables.** Owner insert and read; no update, no delete;
--    another user sees nothing; the meter counts only the caller's window.
-- 4. **The internal functions refused to `authenticated`** (and `anon`), by
--    privilege and by an actual call naming another user.
-- 5. **The profile** of user A, who loved two roguelikes and disliked two
--    shooters: roguelike positive, shooter negative, a genre on one item left
--    out, and the roguelike weight equal to the formula.
-- 6. **The candidate function** excluding every kind of entry and honoring
--    each filter, the limit clamp and the 500 cap, and answering user B from
--    B's list alone, which is the proof that nobody can score someone else's.
-- 7. **The harness** on user A: the leave-one-out rows and the summary, whose
--    two baseline errors are exact and catalog-independent.
--
-- Users act through `set local role authenticated` plus a forged
-- request.jwt.claims, so every call goes through the grants and Row Level
-- Security as a supabase-js rpc() would; the service role acts through `set
-- local role service_role`. The fixture's genres, platforms and developers end
-- in "Test" and its IGDB and TMDB ids are negative, so none of it can collide
-- with a mirrored catalog, and every candidate call filters to fixture genres.
-- Anything that depends on the size of the catalog (idf, and so the content
-- scores) is either asserted by sign and order or computed from live counts,
-- so the suite holds on a database that also carries the real catalog.

begin;
select plan(84);

-- Fixtures ---------------------------------------------------------------------
-- User A ranks seven games across all four tiers, and one film:
--
--   loved     Hades 10.0, Dead Cells 8.5         (both roguelikes)
--   liked     Celeste 8.4, Hollow Knight 6.5
--   fine      Tetris Effect 5.2
--   disliked  Call of Duty 3.9, Battlefield 0.0  (both shooters)
--
-- mean 42.5 / 7 = 6.0714. A also has Hades II in the backlog, Spelunky played
-- but not ranked, and Destiny dropped: three entries of three kinds that the
-- candidate function has to exclude.
--
-- User B ranks three games, one per tier: Hades 9.3, Celeste 7.5, Halo 5.2.
--
-- Unranked by A: Slay the Spire and Balatro (roguelike card games, on the
-- Switch A's loved games are on), Halo (a shooter), Returnal (both).

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

insert into public.media_items (id, medium, title, year, cover_image_id) values
  ('00000000-0000-0000-0000-000000000101', 'game', 'Hades', 2020, 'co101'),
  ('00000000-0000-0000-0000-000000000102', 'game', 'Dead Cells', 2018, 'co102'),
  ('00000000-0000-0000-0000-000000000103', 'game', 'Celeste', 2018, 'co103'),
  ('00000000-0000-0000-0000-000000000104', 'game', 'Hollow Knight', 2017, 'co104'),
  ('00000000-0000-0000-0000-000000000105', 'game', 'Tetris Effect', 2018, 'co105'),
  ('00000000-0000-0000-0000-000000000106', 'game', 'Call of Duty', 2019, 'co106'),
  ('00000000-0000-0000-0000-000000000107', 'game', 'Battlefield', 2018, 'co107'),
  ('00000000-0000-0000-0000-000000000108', 'game', 'Slay the Spire', 2019, 'co108'),
  ('00000000-0000-0000-0000-000000000109', 'game', 'Halo', 2021, 'co109'),
  ('00000000-0000-0000-0000-000000000110', 'game', 'Returnal', 2021, 'co110'),
  ('00000000-0000-0000-0000-000000000111', 'game', 'Hades II', 2024, 'co111'),
  ('00000000-0000-0000-0000-000000000112', 'game', 'Spelunky', 2013, 'co112'),
  ('00000000-0000-0000-0000-000000000113', 'game', 'Destiny', 2017, 'co113'),
  ('00000000-0000-0000-0000-000000000114', 'game', 'Balatro', 2024, 'co114'),
  ('00000000-0000-0000-0000-000000000120', 'game', 'Deep Cut', 2021, 'co120'),
  ('00000000-0000-0000-0000-000000000201', 'movie', 'Dune', 2021, '/dune.jpg'),
  ('00000000-0000-0000-0000-000000000202', 'movie', 'Arrival', 2016, '/arrival.jpg'),
  ('00000000-0000-0000-0000-000000000203', 'movie', 'Blade Runner 2049', 2017, '/br.jpg'),
  ('00000000-0000-0000-0000-000000000204', 'movie', 'Sicario', 2015, '/sicario.jpg'),
  ('00000000-0000-0000-0000-000000000301', 'tv', 'Severance', 2022, '/severance.jpg');

insert into public.game_details (media_item_id, igdb_id, genres, platforms, developer, time_to_beat_normally_seconds) values
  ('00000000-0000-0000-0000-000000000101', -990101, '{"Roguelike Test","Action Test"}', '{"Test PC","Test Switch"}', 'Supergiant Test', 79200),
  ('00000000-0000-0000-0000-000000000102', -990102, '{"Roguelike Test","Platform Test"}', '{"Test PC","Test Switch"}', 'Motion Twin Test', 72000),
  ('00000000-0000-0000-0000-000000000103', -990103, '{"Platform Test"}', '{"Test PC","Test Switch"}', 'Maddy Test', 28800),
  ('00000000-0000-0000-0000-000000000104', -990104, '{"Platform Test","Metroidvania Test"}', '{"Test PC"}', 'Team Cherry Test', 97200),
  ('00000000-0000-0000-0000-000000000105', -990105, '{"Puzzle Test"}', '{"Test PS"}', 'Resonair Test', null),
  ('00000000-0000-0000-0000-000000000106', -990106, '{"Shooter Test"}', '{"Test PS","Test PC"}', 'Infinity Ward Test', 25200),
  ('00000000-0000-0000-0000-000000000107', -990107, '{"Shooter Test"}', '{"Test PS","Test PC"}', 'DICE Test', 36000),
  ('00000000-0000-0000-0000-000000000108', -990108, '{"Roguelike Test","Card Test"}', '{"Test PC","Test Switch"}', 'Mega Crit Test', 43200),
  ('00000000-0000-0000-0000-000000000109', -990109, '{"Shooter Test"}', '{"Test PC"}', '343 Test', 36000),
  ('00000000-0000-0000-0000-000000000110', -990110, '{"Roguelike Test","Shooter Test"}', '{"Test PS"}', 'Housemarque Test', 90000),
  ('00000000-0000-0000-0000-000000000111', -990111, '{"Roguelike Test","Action Test"}', '{"Test PC"}', 'Supergiant Test', 108000),
  ('00000000-0000-0000-0000-000000000112', -990112, '{"Roguelike Test","Platform Test"}', '{"Test PC"}', 'Mossmouth Test', 18000),
  ('00000000-0000-0000-0000-000000000113', -990113, '{"Shooter Test"}', '{"Test PS"}', 'Bungie Test', 72000),
  ('00000000-0000-0000-0000-000000000114', -990114, '{"Card Test","Roguelike Test"}', '{"Test PC","Test Switch"}', 'LocalThunk Test', null),
  -- The one game that would beat 500 others on content but trails all of them
  -- on prior: the 500 cap is what keeps it out.
  ('00000000-0000-0000-0000-000000000120', -990120, '{"Filler Test"}', '{"Test Switch"}', 'Deep Cut Test', 36000);

-- 500 fillers with a prior of 5.0 (metacritic 50) and no feature A's profile
-- knows, so each scores A's mean on content.
insert into public.media_items (id, medium, title, year)
select ('00000000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid, 'game', 'Filler ' || i, 2005
from generate_series(1, 500) as i;

insert into public.game_details (media_item_id, igdb_id, genres, platforms)
select ('00000000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid, -991000 - i, '{"Filler Test"}', '{}'
from generate_series(1, 500) as i;

insert into public.external_scores (media_item_id, source, score)
select ('00000000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid, 'metacritic', 50
from generate_series(1, 500) as i;

insert into public.movie_details (media_item_id, tmdb_id, genres, directors, runtime_minutes) values
  ('00000000-0000-0000-0000-000000000201', -990201, '{"Science Fiction Test","Adventure Test"}', '{"Villeneuve Test"}', 155),
  ('00000000-0000-0000-0000-000000000202', -990202, '{"Science Fiction Test","Drama Test"}', '{"Villeneuve Test"}', 116),
  ('00000000-0000-0000-0000-000000000203', -990203, '{"Science Fiction Test"}', '{"Villeneuve Test"}', 164),
  ('00000000-0000-0000-0000-000000000204', -990204, '{"Thriller Test"}', '{"Villeneuve Test"}', 121);

insert into public.tv_details (media_item_id, tmdb_id, genres, creators, episode_runtime_minutes) values
  ('00000000-0000-0000-0000-000000000301', -990301, '{"Drama Test","Mystery Test"}', '{"Erickson Test"}', 50);

insert into public.external_scores (media_item_id, source, score) values
  ('00000000-0000-0000-0000-000000000101', 'metacritic', 93),
  ('00000000-0000-0000-0000-000000000101', 'igdb_critics', 91),
  ('00000000-0000-0000-0000-000000000101', 'steam', 98),
  ('00000000-0000-0000-0000-000000000102', 'metacritic', 89),
  ('00000000-0000-0000-0000-000000000103', 'opencritic', 92),
  ('00000000-0000-0000-0000-000000000103', 'igdb_users', 85),
  ('00000000-0000-0000-0000-000000000103', 'opencritic_recommended', 99),
  ('00000000-0000-0000-0000-000000000104', 'metacritic', 87),
  ('00000000-0000-0000-0000-000000000105', 'metacritic', 89),
  ('00000000-0000-0000-0000-000000000106', 'metacritic', 81),
  ('00000000-0000-0000-0000-000000000107', 'metacritic', 83),
  ('00000000-0000-0000-0000-000000000108', 'steam', 97),
  ('00000000-0000-0000-0000-000000000108', 'igdb_users', 88),
  ('00000000-0000-0000-0000-000000000109', 'metacritic', 87),
  ('00000000-0000-0000-0000-000000000110', 'igdb_users', 80),
  ('00000000-0000-0000-0000-000000000114', 'igdb_critics', 90),
  ('00000000-0000-0000-0000-000000000120', 'metacritic', 49),
  ('00000000-0000-0000-0000-000000000201', 'tmdb', 78.4),
  ('00000000-0000-0000-0000-000000000202', 'tmdb', 79),
  ('00000000-0000-0000-0000-000000000203', 'tmdb', 75);

insert into public.watch_providers (provider_id, name) values
  (-990001, 'Test Flix'),
  (-990002, 'Test Max');

insert into public.watch_availability (media_item_id, region, provider_id, offer_type, removed_at) values
  -- Arrival: on Test Flix in the US with a subscription.
  ('00000000-0000-0000-0000-000000000202', 'US', -990001, 'flatrate', null),
  -- Blade Runner: only to rent on Test Flix, and its Test Max offer has ended.
  ('00000000-0000-0000-0000-000000000203', 'US', -990001, 'rent', null),
  ('00000000-0000-0000-0000-000000000203', 'US', -990002, 'flatrate', now() - interval '3 days'),
  -- Sicario: on Test Max, but in Great Britain.
  ('00000000-0000-0000-0000-000000000204', 'GB', -990002, 'flatrate', null);

insert into public.user_entries (user_id, media_item_id, status) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000101', 'played'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000102', 'played'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000103', 'played'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000104', 'played'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000105', 'played'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000106', 'played'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000107', 'played'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000111', 'backlog'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000112', 'played'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000113', 'dropped'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000201', 'played'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000101', 'played'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000103', 'played'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000109', 'played');

insert into public.ranking_entries (user_id, medium, tier, media_item_id, position) values
  ('00000000-0000-0000-0000-00000000000a', 'game', 'loved', '00000000-0000-0000-0000-000000000101', 0),
  ('00000000-0000-0000-0000-00000000000a', 'game', 'loved', '00000000-0000-0000-0000-000000000102', 1),
  ('00000000-0000-0000-0000-00000000000a', 'game', 'liked', '00000000-0000-0000-0000-000000000103', 0),
  ('00000000-0000-0000-0000-00000000000a', 'game', 'liked', '00000000-0000-0000-0000-000000000104', 1),
  ('00000000-0000-0000-0000-00000000000a', 'game', 'fine', '00000000-0000-0000-0000-000000000105', 0),
  ('00000000-0000-0000-0000-00000000000a', 'game', 'disliked', '00000000-0000-0000-0000-000000000106', 0),
  ('00000000-0000-0000-0000-00000000000a', 'game', 'disliked', '00000000-0000-0000-0000-000000000107', 1),
  ('00000000-0000-0000-0000-00000000000a', 'movie', 'loved', '00000000-0000-0000-0000-000000000201', 0),
  ('00000000-0000-0000-0000-00000000000b', 'game', 'loved', '00000000-0000-0000-0000-000000000101', 0),
  ('00000000-0000-0000-0000-00000000000b', 'game', 'liked', '00000000-0000-0000-0000-000000000103', 0),
  ('00000000-0000-0000-0000-00000000000b', 'game', 'fine', '00000000-0000-0000-0000-000000000109', 0);

-- One of A's suggestion requests from two days ago, outside the meter's
-- default window. Written as the owner, the only way a backdated row gets in.
insert into public.suggestion_requests (id, user_id, medium, kind, created_at) values
  ('00000000-0000-0000-0000-0000000000e0', '00000000-0000-0000-0000-00000000000a', 'game', 'personal', now() - interval '2 days');

-- Structure and grants ---------------------------------------------------------

-- 1
select ok(
  (select 'security_invoker=true' = any (coalesce(c.reloptions, '{}'))
     from pg_class c where c.oid = 'public.ranking_percentiles'::regclass),
  'ranking_percentiles runs as the caller, so the owner-only policy on ranking_entries passes through'
);

-- 2
select ok(
  (select 'security_invoker=true' = any (coalesce(c.reloptions, '{}'))
     from pg_class c where c.oid = 'public.user_rank_stats'::regclass),
  'and so does user_rank_stats'
);

-- 3
select ok(
  (select c.relrowsecurity from pg_class c where c.oid = 'public.item_prior'::regclass)
  and (select c.relrowsecurity from pg_class c where c.oid = 'public.prediction_log'::regclass)
  and (select c.relrowsecurity from pg_class c where c.oid = 'public.suggestion_requests'::regclass),
  'Row Level Security is on for item_prior, prediction_log and suggestion_requests from their first migration'
);

-- 4
select ok(
  not has_function_privilege('authenticated', 'public.recommendation_content_profile(uuid,public.medium,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.recommendation_content_profile(uuid,public.medium,uuid)', 'execute'),
  'recommendation_content_profile is refused to authenticated and anon'
);

-- 5
select ok(
  not has_function_privilege('authenticated', 'public.recommendation_scores(uuid,public.medium,uuid[],uuid)', 'execute')
  and not has_function_privilege('anon', 'public.recommendation_scores(uuid,public.medium,uuid[],uuid)', 'execute'),
  'recommendation_scores is refused to authenticated and anon'
);

-- 6
select ok(
  not has_function_privilege('authenticated', 'public.recommendation_loo(uuid,public.medium)', 'execute')
  and not has_function_privilege('anon', 'public.recommendation_loo(uuid,public.medium)', 'execute'),
  'recommendation_loo is refused to authenticated and anon'
);

-- 7
select ok(
  not has_function_privilege('authenticated', 'public.recommendation_loo_summary(uuid,public.medium)', 'execute')
  and not has_function_privilege('anon', 'public.recommendation_loo_summary(uuid,public.medium)', 'execute'),
  'recommendation_loo_summary is refused to authenticated and anon'
);

-- 8
select ok(
  not has_function_privilege('authenticated', 'public.refresh_item_priors(public.medium)', 'execute')
  and not has_function_privilege('anon', 'public.refresh_item_priors(public.medium)', 'execute'),
  'refresh_item_priors is refused to authenticated and anon'
);

-- 9
select ok(
  not has_function_privilege('authenticated', 'public.recommendation_user_scores(uuid,public.medium,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.recommendation_item_features(public.medium,uuid[],text[])', 'execute')
  and not has_function_privilege('authenticated', 'public.recommendation_feature_idf(public.medium,text[])', 'execute')
  and not has_function_privilege('authenticated', 'public.ranking_tier_for_score(numeric)', 'execute')
  and not has_table_privilege('authenticated', 'public.recommendation_feature_rows', 'select')
  and not has_table_privilege('authenticated', 'public.recommendation_external_scores', 'select'),
  'and so are the helpers behind them, functions and views alike'
);

-- 10
select ok(
  has_function_privilege('service_role', 'public.recommendation_content_profile(uuid,public.medium,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.recommendation_scores(uuid,public.medium,uuid[],uuid)', 'execute')
  and has_function_privilege('service_role', 'public.recommendation_loo(uuid,public.medium)', 'execute')
  and has_function_privilege('service_role', 'public.recommendation_loo_summary(uuid,public.medium)', 'execute')
  and has_function_privilege('service_role', 'public.refresh_item_priors(public.medium)', 'execute'),
  'the service role may call all five internal functions'
);

-- 11
select is_definer(
  'public', 'suggestion_candidates',
  array['public.medium', 'text[]', 'text[]', 'integer', 'text[]', 'integer[]', 'text', 'boolean', 'integer'],
  'suggestion_candidates is security definer: the grant decision in the migration header'
);

-- 12
select ok(
  (select p.proconfig from pg_proc p
    where p.oid = 'public.suggestion_candidates(public.medium,text[],text[],integer,text[],integer[],text,boolean,integer)'::regprocedure)
    @> array['search_path=public, extensions'],
  'its search_path is pinned, which a definer function cannot do without'
);

-- 13
select ok(
  has_function_privilege('authenticated', 'public.suggestion_candidates(public.medium,text[],text[],integer,text[],integer[],text,boolean,integer)', 'execute')
  and not has_function_privilege('anon', 'public.suggestion_candidates(public.medium,text[],text[],integer,text[],integer[],text,boolean,integer)', 'execute'),
  'a signed-in user may call suggestion_candidates and a signed-out one may not'
);

-- 14
select ok(
  not has_table_privilege('authenticated', 'public.prediction_log', 'update')
  and not has_table_privilege('authenticated', 'public.prediction_log', 'delete')
  and not has_table_privilege('authenticated', 'public.suggestion_requests', 'update')
  and not has_table_privilege('authenticated', 'public.suggestion_requests', 'delete')
  and not has_table_privilege('anon', 'public.prediction_log', 'select')
  and not has_table_privilege('anon', 'public.suggestion_requests', 'select'),
  'the log tables grant no update or delete to anyone signed in, and nothing to anon'
);

-- 1. Percentiles and the band math ---------------------------------------------

-- 15
select results_eq(
  $$ select round(p.pct, 3) from public.ranking_percentiles p
     where p.user_id = '00000000-0000-0000-0000-00000000000b' and p.medium = 'game'
     order by p.overall_rank $$,
  $$ values (0.833), (0.500), (0.167) $$,
  'a three-item list reads 0.833, 0.5 and 0.167: (n - rank + 0.5) / n'
);

-- 16
-- scoreForPosition(tier, position, tierSize) for A's list: loved of two gives
-- 10 and 8.5, liked of two 8.4 and 6.5, a lone fine 5.2 (the midpoint of 4 and
-- 6.4), disliked of two 3.9 and 0.
select results_eq(
  $$ select p.overall_rank, p.tier, p.tier_size, p.score from public.ranking_percentiles p
     where p.user_id = '00000000-0000-0000-0000-00000000000a' and p.medium = 'game'
     order by p.overall_rank $$,
  $$ values (1, 'loved'::public.tier, 2, 10.0), (2, 'loved', 2, 8.5), (3, 'liked', 2, 8.4),
            (4, 'liked', 2, 6.5), (5, 'fine', 1, 5.2), (6, 'disliked', 2, 3.9), (7, 'disliked', 2, 0.0) $$,
  'A''s scores are scoreForPosition''s: linear in the band, position 0 best, a lone item at the midpoint'
);

-- 17
-- The values the app shows where exact decimal arithmetic would disagree
-- (the migration's comment on ranking_score): Math.round of the double.
select results_eq(
  $$ select public.ranking_score(t.tier, t.pos, t.size)
     from (values ('loved'::public.tier, 1, 7, 1), ('disliked', 1, 7, 2), ('disliked', 5, 7, 3),
                  ('liked', 0, 1, 4), ('disliked', 0, 1, 5), ('loved', 0, 1, 6)) as t(tier, pos, size, k)
     order by t.k $$,
  $$ values (9.8), (3.3), (0.6), (7.5), (2.0), (9.3) $$,
  'ranking_score matches the app to the last decimal: 9.8, 3.3, 0.6 and the midpoints 7.5, 2.0, 9.3'
);

-- 18
select ok(
  public.ranking_score('loved', 2, 2) is null
  and public.ranking_score('loved', -1, 2) is null
  and public.ranking_score('loved', 0, 0) is null,
  'a position outside the tier has no score rather than an error'
);

-- 19
select results_eq(
  $$ select s.n_ranked, round(s.mean_score, 4), s.min_score, s.max_score from public.user_rank_stats s
     where s.user_id = '00000000-0000-0000-0000-00000000000a' and s.medium = 'game' $$,
  $$ values (7, 6.0714, 0.0, 10.0) $$,
  'user_rank_stats: seven ranked, mean 42.5 / 7, from 0 to 10'
);

-- 2. The prior -------------------------------------------------------------------

set local role service_role;

-- 20
select lives_ok(
  $$ select public.refresh_item_priors() $$,
  'the service role can rebuild every prior in one call'
);

reset role;

-- 21
-- Hades: ranked by A (10.0) and B (9.3), so n = 2 and avg = 9.65; metacritic
-- 93 comes first in the source order, so g = 9.3.
-- m = (2 * 9.65 + 10 * 9.3) / (2 + 10) = 112.3 / 12 = 9.3583.
select results_eq(
  $$ select ip.n_rankers, ip.mean_score, ip.external_score, ip.external_source, round(ip.prior_score, 4)
     from public.item_prior ip where ip.media_item_id = '00000000-0000-0000-0000-000000000101' $$,
  $$ values (2, 9.65, 9.3, 'metacritic'::text, 9.3583) $$,
  'Hades: (2 x 9.65 + 10 x 9.3) / 12 = 9.3583, with metacritic ahead of igdb_critics and steam'
);

-- 22
-- Celeste: no metacritic, so opencritic 92 wins over igdb_users 85, and
-- opencritic_recommended (99) is not a score at all. n = 2, avg (8.4 + 7.5) / 2.
-- m = (15.9 + 92) / 12 = 8.9917.
select results_eq(
  $$ select ip.external_source, ip.external_score, round(ip.prior_score, 4)
     from public.item_prior ip where ip.media_item_id = '00000000-0000-0000-0000-000000000103' $$,
  $$ values ('opencritic'::text, 9.2, 8.9917) $$,
  'Celeste: opencritic wins over igdb_users and opencritic_recommended is ignored, (15.9 + 92) / 12 = 8.9917'
);

-- 23
-- Slay the Spire: nobody has ranked it, so the prior is g itself. steam 97
-- comes before igdb_users 88.
select results_eq(
  $$ select ip.n_rankers, ip.external_source, ip.prior_score
     from public.item_prior ip where ip.media_item_id = '00000000-0000-0000-0000-000000000108' $$,
  $$ values (0, 'steam'::text, 9.7) $$,
  'with no rankers the prior is the external score: steam 97 over igdb_users 88 gives 9.7'
);

-- 24
-- Dune: TMDB is stored times ten like every source, so 78.4 is 7.84. A ranked
-- it alone in their films (9.3). m = (9.3 + 10 * 7.84) / 11 = 7.9727.
select results_eq(
  $$ select ip.external_score, round(ip.prior_score, 4)
     from public.item_prior ip where ip.media_item_id = '00000000-0000-0000-0000-000000000201' $$,
  $$ values (7.84, 7.9727) $$,
  'Dune: tmdb 78.4 is divided by ten like the rest, (9.3 + 78.4) / 11 = 7.9727'
);

-- 25
-- Hades II: no external score and no rankers, so g falls back to the mean of
-- every game ranking in the database (the fixture's ten when it is fresh).
select is(
  (select round(ip.prior_score, 4) from public.item_prior ip
    where ip.media_item_id = '00000000-0000-0000-0000-000000000111'),
  (select round(avg(p.score), 4) from public.ranking_percentiles p where p.medium = 'game'),
  'no external score: the prior falls back to the medium''s Verso mean'
);

-- 26
select is(
  (select round(ip.prior_score, 4) from public.item_prior ip
    where ip.media_item_id = '00000000-0000-0000-0000-000000000301'),
  (select round(coalesce(avg(p.score), 6.5), 4) from public.ranking_percentiles p where p.medium = 'tv'),
  'and with no Verso mean either (nobody has ranked a series), to 6.5'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- 27
select is(
  (select count(*) from public.item_prior ip
    where ip.media_item_id in ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201',
                               '00000000-0000-0000-0000-000000000301')),
  3::bigint,
  'a signed-in user reads item_prior, games, films and series alike'
);

-- 28
select throws_ok(
  $$ update public.item_prior set prior_score = 10 where media_item_id = '00000000-0000-0000-0000-000000000101' $$,
  '42501',
  null,
  'but cannot write it'
);

-- 29
select throws_ok(
  $$ select public.refresh_item_priors() $$,
  '42501',
  null,
  'nor call the refresh'
);

-- 3. The log tables and the meter ------------------------------------------------

-- 30
select lives_ok(
  $$ insert into public.suggestion_requests (id, medium, kind, model, input_tokens, output_tokens, candidate_count)
     values ('00000000-0000-0000-0000-0000000000e1', 'game', 'personal', 'claude-haiku-4-5', 2500, 200, 30),
            ('00000000-0000-0000-0000-0000000000e2', 'game', 'personal', null, 0, 0, 2) $$,
  'A logs two suggestion requests without naming a user: user_id defaults to auth.uid()'
);

-- 31
select throws_ok(
  $$ insert into public.suggestion_requests (user_id, medium, kind)
     values ('00000000-0000-0000-0000-00000000000b', 'game', 'personal') $$,
  '42501',
  null,
  'A cannot log a request as B'
);

-- 32
select lives_ok(
  $$ insert into public.prediction_log (id, medium, media_item_id, surface, predicted_score, confidence, model_version, request_id)
     values ('00000000-0000-0000-0000-0000000000d1', 'game', '00000000-0000-0000-0000-000000000108', 'suggest', 8.96,
             'medium', 'content-v1', '00000000-0000-0000-0000-0000000000e1') $$,
  'A logs a prediction against their own request'
);

-- 33
select throws_ok(
  $$ insert into public.prediction_log (user_id, medium, media_item_id, surface, predicted_score, confidence, model_version)
     values ('00000000-0000-0000-0000-00000000000b', 'game', '00000000-0000-0000-0000-000000000108', 'suggest', 8.96,
             'medium', 'content-v1') $$,
  '42501',
  null,
  'A cannot log a prediction as B'
);

-- 34
select throws_ok(
  $$ update public.suggestion_requests set output_tokens = 0 where id = '00000000-0000-0000-0000-0000000000e1' $$,
  '42501',
  null,
  'A cannot update their own request: the log is append-only'
);

-- 35
select throws_ok(
  $$ delete from public.prediction_log where id = '00000000-0000-0000-0000-0000000000d1' $$,
  '42501',
  null,
  'nor delete their own prediction'
);

-- 36
select is(
  (select count(*) from public.suggestion_requests
    where id in ('00000000-0000-0000-0000-0000000000e0', '00000000-0000-0000-0000-0000000000e1',
                 '00000000-0000-0000-0000-0000000000e2')),
  3::bigint,
  'A reads all three of their requests'
);

-- 37
select is(
  public.count_suggestion_requests(),
  2,
  'the meter counts the two made in the last 24 hours'
);

-- 38
select is(
  public.count_suggestion_requests(interval '3 days'),
  3,
  'and all three over three days'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

-- 39
select is(
  (select count(*) from public.suggestion_requests
    where id in ('00000000-0000-0000-0000-0000000000e0', '00000000-0000-0000-0000-0000000000e1',
                 '00000000-0000-0000-0000-0000000000e2'))
  + (select count(*) from public.prediction_log where id = '00000000-0000-0000-0000-0000000000d1'),
  0::bigint,
  'B sees none of A''s requests or predictions'
);

-- 40
select is(
  public.count_suggestion_requests(interval '3 days'),
  0,
  'and B''s own meter reads zero'
);

-- 41
select results_eq(
  $$ select count(*), max(p.n_ranked) from public.ranking_percentiles p
     where p.user_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b') $$,
  $$ values (3::bigint, 3) $$,
  'the percentile view shows B their own three rows and none of A''s'
);

set local request.jwt.claims to '{"role":"authenticated"}';

-- 42
select throws_ok(
  $$ select public.count_suggestion_requests() $$,
  '28000',
  null,
  'an authenticated request with no user behind it is refused, not counted as zero'
);

-- 4. The internal functions, refused by an actual call ---------------------------

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- 43
select throws_ok(
  $$ select * from public.recommendation_scores('00000000-0000-0000-0000-00000000000b', 'game',
       array['00000000-0000-0000-0000-000000000108']::uuid[]) $$,
  '42501',
  null,
  'A cannot score items against B''s list'
);

-- 44
select throws_ok(
  $$ select * from public.recommendation_content_profile('00000000-0000-0000-0000-00000000000b', 'game') $$,
  '42501',
  null,
  'nor read B''s profile'
);

-- 45
select throws_ok(
  $$ select * from public.recommendation_loo_summary('00000000-0000-0000-0000-00000000000a', 'game') $$,
  '42501',
  null,
  'nor run the harness, even on their own list'
);

reset role;

-- 5. The profile -------------------------------------------------------------------

-- 46
select ok(
  (select p.weight from public.recommendation_content_profile('00000000-0000-0000-0000-00000000000a', 'game') p
    where p.feature = 'genre:Roguelike Test') > 0,
  'A loved two roguelikes: genre:Roguelike Test weighs positive'
);

-- 47
select ok(
  (select p.weight from public.recommendation_content_profile('00000000-0000-0000-0000-00000000000a', 'game') p
    where p.feature = 'genre:Shooter Test') < 0,
  'and disliked two shooters: genre:Shooter Test weighs negative'
);

-- 48
-- weight = sum over the roguelikes of (s - mu) * idf / sum over the list of |s - mu|
--        = (10 + 8.5 - 2 * 42.5/7) * idf / (127.6 / 7) = 44.5 / 127.6 * idf,
-- with idf = ln(games in the catalog / games that are roguelikes), counted here
-- so the assertion holds whatever else the catalog carries.
select is(
  (select round(p.weight, 6) from public.recommendation_content_profile('00000000-0000-0000-0000-00000000000a', 'game') p
    where p.feature = 'genre:Roguelike Test'),
  round(
    44.5 / 127.6 * ln(
      (select count(*) from public.media_items m where m.medium = 'game')::numeric
      / (select count(*) from public.game_details g where g.genres @> '{"Roguelike Test"}')
    ),
    6
  ),
  'the roguelike weight is 44.5 / 127.6 x ln(N / n_roguelike), the formula of item 4'
);

-- 49
select is(
  (select count(*) from public.recommendation_content_profile('00000000-0000-0000-0000-00000000000a', 'game') p
    where p.feature in ('genre:Action Test', 'genre:Metroidvania Test', 'genre:Puzzle Test', 'developer:Supergiant Test')),
  0::bigint,
  'a feature on only one of A''s items is not a taste: Action, Metroidvania, Puzzle and Supergiant are left out'
);

-- 50
select is(
  (select count(*) from public.recommendation_content_profile(
     '00000000-0000-0000-0000-00000000000a', 'game', '00000000-0000-0000-0000-000000000102') p
    where p.feature = 'genre:Roguelike Test'),
  0::bigint,
  'holding Dead Cells out leaves Hades the only roguelike, so the feature drops out: the exclusion is real'
);

-- 51
select is(
  (select count(*) from public.recommendation_content_profile('00000000-0000-0000-0000-00000000000a', 'movie')),
  0::bigint,
  'a list of one has no spread and so no profile'
);

-- 52
select results_eq(
  $$ select f.feature from public.recommendation_item_features('tv', array['00000000-0000-0000-0000-000000000301']::uuid[]) f
     order by f.feature $$,
  $$ values ('creator:Erickson Test'::text), ('decade:2020'), ('genre:Drama Test'), ('genre:Mystery Test') $$,
  'a series is described by its genres, its creators and its decade'
);

-- 53
select results_eq(
  $$ select f.feature from public.recommendation_item_features('movie', array['00000000-0000-0000-0000-000000000201']::uuid[]) f
     order by f.feature $$,
  $$ values ('decade:2020'::text), ('director:Villeneuve Test'), ('genre:Adventure Test'), ('genre:Science Fiction Test') $$,
  'a film by its genres, its directors and its decade'
);

-- 54
select results_eq(
  $$ select f.feature from public.recommendation_item_features('game', array['00000000-0000-0000-0000-000000000101']::uuid[]) f
     order by f.feature $$,
  $$ values ('decade:2020'::text), ('developer:Supergiant Test'), ('genre:Action Test'), ('genre:Roguelike Test'),
            ('platform:Test PC'), ('platform:Test Switch') $$,
  'and a game by its genres, developer, platforms and decade'
);

-- The scores ------------------------------------------------------------------------

-- 55
select ok(
  (select s.content_score from public.recommendation_scores('00000000-0000-0000-0000-00000000000a', 'game',
     array['00000000-0000-0000-0000-000000000108']::uuid[]) s) > 6.0714
  and (select s.content_score from public.recommendation_scores('00000000-0000-0000-0000-00000000000a', 'game',
     array['00000000-0000-0000-0000-000000000109']::uuid[]) s) < 6.0714,
  'on content, the roguelike Slay the Spire reads above A''s mean and the shooter Halo below it'
);

-- 56
-- predicted = (prior + w * content) / (1 + w), w = 7 / 17; the returned
-- numbers are rounded to two decimals, so the check allows a cent.
select ok(
  (select abs(s.predicted_score - (s.prior_score + 7.0 / 17 * s.content_score) / (1 + 7.0 / 17)) <= 0.01
     from public.recommendation_scores('00000000-0000-0000-0000-00000000000a', 'game',
       array['00000000-0000-0000-0000-000000000108']::uuid[]) s),
  'the prediction blends prior and content with w = n / (n + 10)'
);

-- 57
select results_eq(
  $$ select s.prior_score, s.why -> 'prior' ->> 'n_rankers'
     from public.recommendation_scores('00000000-0000-0000-0000-00000000000a', 'game',
       array['00000000-0000-0000-0000-000000000101']::uuid[], '00000000-0000-0000-0000-000000000101') s $$,
  $$ values (9.30, '1'::text) $$,
  'holding Hades out takes A''s ranking out of its prior: (9.65 x 2 - 10.0 + 93) / 11 = 9.30, one ranker left'
);

-- 58
select ok(
  (select s.why -> 'features' @> '[{"feature": "genre:Roguelike Test"}]'
      and s.why -> 'features' -> 0 -> 'items' -> 0 ->> 'title' = 'Hades'
     from public.recommendation_scores('00000000-0000-0000-0000-00000000000a', 'game',
       array['00000000-0000-0000-0000-000000000108']::uuid[]) s),
  'why names the roguelike match and cites A''s own best item behind it, Hades'
);

-- 6. The candidate function -----------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- 59
-- Every fixture game genre, so the candidates are the fixture's. Ranked games,
-- Hades II (backlog), Spelunky (played, not ranked) and Destiny (dropped) are
-- all out; what is left comes back by predicted score.
select results_eq(
  $$ select c.title from public.suggestion_candidates('game',
       p_genres => '{"Roguelike Test","Action Test","Platform Test","Metroidvania Test","Puzzle Test","Shooter Test","Card Test"}') c $$,
  $$ values ('Slay the Spire'::text), ('Balatro'), ('Halo'), ('Returnal') $$,
  'A''s candidates exclude every entry, backlog and dropped included, best predicted first'
);

-- 60
select ok(
  (select bool_and(c.confidence = 'medium') and bool_and((c.why ->> 'n_ranked')::integer = 7)
     from public.suggestion_candidates('game',
       p_genres => '{"Roguelike Test","Action Test","Platform Test","Metroidvania Test","Puzzle Test","Shooter Test","Card Test"}') c),
  'scored against A''s seven games: confidence medium (5 to 14 ranked)'
);

-- 61
select ok(
  exists (select 1 from public.suggestion_candidates('game', p_genres => '{"Action Test"}', p_include_backlog => true) c
           where c.media_item_id = '00000000-0000-0000-0000-000000000111')
  and not exists (select 1 from public.suggestion_candidates('game', p_genres => '{"Action Test"}') c
           where c.media_item_id = '00000000-0000-0000-0000-000000000111'),
  'p_include_backlog brings Hades II back, and only then'
);

-- 62
select is(
  (select count(*) from public.suggestion_candidates('game', p_genres => '{"Action Test","Platform Test"}', p_include_backlog => true) c
    where c.media_item_id in ('00000000-0000-0000-0000-000000000112', '00000000-0000-0000-0000-000000000113')),
  0::bigint,
  'but never a played or dropped game'
);

-- 63
select results_eq(
  $$ select c.title from public.suggestion_candidates('game', p_genres => '{"Card Test"}') c order by c.title $$,
  $$ values ('Balatro'::text), ('Slay the Spire') $$,
  'p_genres keeps items sharing a genre'
);

-- 64
select results_eq(
  $$ select c.title from public.suggestion_candidates('game',
       p_genres => '{"Roguelike Test","Shooter Test","Card Test"}', p_exclude_genres => '{"Shooter Test"}') c
     order by c.title $$,
  $$ values ('Balatro'::text), ('Slay the Spire') $$,
  'p_exclude_genres drops any item with an excluded genre, Returnal included for being half shooter'
);

-- 65
-- Slay the Spire is 720 minutes, Halo 600, Returnal 1500, Balatro unknown.
select results_eq(
  $$ select c.title, c.minutes from public.suggestion_candidates('game',
       p_genres => '{"Roguelike Test","Shooter Test","Card Test"}', p_max_minutes => 700) c $$,
  $$ values ('Halo'::text, 600) $$,
  'p_max_minutes keeps what fits and drops what is unknown: a limit it might break is not one it meets'
);

-- 66
select results_eq(
  $$ select c.title from public.suggestion_candidates('game',
       p_genres => '{"Roguelike Test","Shooter Test","Card Test"}', p_platforms => '{"Test Switch"}') c
     order by c.title $$,
  $$ values ('Balatro'::text), ('Slay the Spire') $$,
  'p_platforms keeps games on any of the platforms asked for'
);

-- 67
select throws_ok(
  $$ select * from public.suggestion_candidates('movie', p_platforms => '{"Test Switch"}') $$,
  '22023',
  null,
  'a platform filter on films is refused rather than ignored'
);

-- 68
select throws_ok(
  $$ select * from public.suggestion_candidates('game', p_provider_ids => '{-990001}') $$,
  '22023',
  null,
  'and a streaming filter on games likewise'
);

-- 69
select results_eq(
  $$ select c.title, c.minutes from public.suggestion_candidates('movie',
       p_genres => '{"Science Fiction Test","Thriller Test"}', p_provider_ids => '{-990001}') c $$,
  $$ values ('Arrival'::text, 116) $$,
  'on Test Flix in the US: Arrival streams, Blade Runner is only to rent, and Dune is ranked'
);

-- 70
select is(
  (select count(*) from public.suggestion_candidates('movie',
     p_genres => '{"Science Fiction Test","Thriller Test"}', p_provider_ids => '{-990002}')),
  0::bigint,
  'on Test Max in the US: nothing, because Blade Runner''s offer was removed and Sicario is in Great Britain'
);

-- 71
select results_eq(
  $$ select c.title from public.suggestion_candidates('movie',
       p_genres => '{"Science Fiction Test","Thriller Test"}', p_provider_ids => '{-990002}', p_region => 'GB') c $$,
  $$ values ('Sicario'::text) $$,
  'and in Great Britain, Sicario'
);

-- 72
select ok(
  (select count(*) from public.suggestion_candidates('game', p_genres => '{"Card Test"}', p_limit => 0)) = 1
  and (select count(*) from public.suggestion_candidates('game', p_genres => '{"Card Test"}', p_limit => -3)) = 1
  and (select count(*) from public.suggestion_candidates('game', p_genres => '{"Filler Test"}', p_limit => 1000)) = 50,
  'the limit is clamped to 1 to 50'
);

-- 73
-- Deep Cut is on the Switch, which A's loved games are on, so its content
-- beats the 500 fillers' and it would lead if it were scored. Its prior (4.9)
-- is below all of theirs (5.0), so it is 501st by prior and never scored.
select ok(
  not exists (select 1 from public.suggestion_candidates('game', p_genres => '{"Filler Test"}', p_limit => 50) c
               where c.media_item_id = '00000000-0000-0000-0000-000000000120')
  and (select c.media_item_id from public.suggestion_candidates('game', p_genres => '{"Filler Test"}', p_platforms => '{"Test Switch"}') c
        limit 1) = '00000000-0000-0000-0000-000000000120',
  'only the 500 best by prior are scored: Deep Cut is cut, and comes back when a filter shrinks the pool'
);

-- 74
select ok(
  (select c.predicted_score from public.suggestion_candidates('game', p_genres => '{"Filler Test"}', p_platforms => '{"Test Switch"}') c)
  > (select max(c.predicted_score) from public.suggestion_candidates('game', p_genres => '{"Filler Test"}', p_limit => 50) c),
  'and scored, it does beat every filler, so the cap is what kept it out'
);

-- 75
select results_eq(
  $$ select c.title, c.minutes, c.confidence from public.suggestion_candidates('tv', p_genres => '{"Drama Test"}') c $$,
  $$ values ('Severance'::text, 50, 'needs_more_data'::text) $$,
  'series work end to end: episode runtime as minutes, and no series ranked means needs_more_data'
);

-- User B asks. Nothing in the call names a user; the answer is B's.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

-- 76
select ok(
  exists (select 1 from public.suggestion_candidates('game',
            p_genres => '{"Roguelike Test","Platform Test","Shooter Test","Puzzle Test"}', p_limit => 50) c
          where c.media_item_id = '00000000-0000-0000-0000-000000000102')
  and not exists (select 1 from public.suggestion_candidates('game',
            p_genres => '{"Roguelike Test","Platform Test","Shooter Test","Puzzle Test"}', p_limit => 50) c
          where c.media_item_id in ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000103',
                                    '00000000-0000-0000-0000-000000000109')),
  'B''s candidates exclude B''s games and include A''s: the exclusion is the caller''s'
);

-- 77
select ok(
  (select bool_and(c.confidence = 'needs_more_data') and bool_and((c.why ->> 'n_ranked')::integer = 3)
     from public.suggestion_candidates('game',
       p_genres => '{"Roguelike Test","Platform Test","Shooter Test","Puzzle Test"}', p_limit => 50) c),
  'scored against B''s three games, not A''s seven'
);

-- 78
select ok(
  (select count(*) > 0
          and count(*) filter (where (i ->> 'media_item_id')::uuid not in (
                '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000103',
                '00000000-0000-0000-0000-000000000109')) = 0
     from public.suggestion_candidates('game',
            p_genres => '{"Roguelike Test","Platform Test","Shooter Test","Puzzle Test"}', p_limit => 50) c
     cross join lateral jsonb_array_elements(c.why -> 'features') as f
     cross join lateral jsonb_array_elements(f -> 'items') as i),
  'and every item why cites is one of B''s own: A''s list never reaches B'
);

set local request.jwt.claims to '{"role":"authenticated"}';

-- 79
select throws_ok(
  $$ select * from public.suggestion_candidates('game') $$,
  '28000',
  null,
  'no user behind the request: 28000, not someone''s list'
);

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

-- 80
select throws_ok(
  $$ select * from public.suggestion_candidates('game') $$,
  '42501',
  null,
  'signed out, the function cannot be called at all'
);

-- 81
select is(
  (select count(*) from public.item_prior ip
    where ip.media_item_id in ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201')),
  0::bigint,
  'and item_prior reads empty rather than failing, the way the other catalog tables do signed out'
);

reset role;

-- 7. The harness ------------------------------------------------------------------------

set local role service_role;

-- 82
-- Hades held out: the list left is Dead Cells alone in loved (9.3), 8.4 and
-- 6.5 liked, 5.2, 3.9 and 0.0, mean 33.3 / 6 = 5.55. Its prior without A is
-- B's 9.3 against g = 9.3, so 9.30.
select results_eq(
  $$ select l.true_score, l.true_tier, l.mean_baseline, l.mean_abs_error, l.prior_baseline, l.prior_abs_error
     from public.recommendation_loo('00000000-0000-0000-0000-00000000000a', 'game') l
     where l.media_item_id = '00000000-0000-0000-0000-000000000101' $$,
  $$ values (10.0, 'loved'::public.tier, 5.55, 4.45, 9.30, 0.70) $$,
  'leave-one-out on Hades: true 10.0 loved, mean baseline 5.55, prior baseline 9.30'
);

-- 83
select is(
  (select l.predicted_score from public.recommendation_loo('00000000-0000-0000-0000-00000000000a', 'game') l
    where l.media_item_id = '00000000-0000-0000-0000-000000000105'),
  (select s.predicted_score from public.recommendation_scores('00000000-0000-0000-0000-00000000000a', 'game',
     array['00000000-0000-0000-0000-000000000105']::uuid[], '00000000-0000-0000-0000-000000000105') s),
  'the harness prediction is recommendation_scores with the item excluded: one implementation of the math'
);

-- 84
-- The two baselines are exact and do not depend on the catalog. Holding each
-- of A's games out in turn, the user-mean errors are 4.45, 2.95, 2.55, 0.65,
-- 1.02, 2.87 and 6.77 (mean 3.037), and the prior errors 0.70, 0.40, 0.65,
-- 2.20, 3.70, 4.20 and 8.30 (mean 2.879). The prediction's own error, tier
-- accuracy and Spearman depend on idf and so on the catalog; they are checked
-- against the leave-one-out rows they summarize.
select ok(
  (select s.n = 7
          and s.mae_user_mean = 3.037
          and s.mae_prior = 2.879
          and s.mae_predicted = (select round(avg(l.abs_error), 3)
                                   from public.recommendation_loo('00000000-0000-0000-0000-00000000000a', 'game') l)
          and s.tier_accuracy between 0 and 1
          and s.spearman between -1 and 1
     from public.recommendation_loo_summary('00000000-0000-0000-0000-00000000000a', 'game') s),
  'the summary on A: n 7, user-mean MAE 3.037, prior MAE 2.879, and the rest consistent with the rows'
);

reset role;

select * from finish();
rollback;
