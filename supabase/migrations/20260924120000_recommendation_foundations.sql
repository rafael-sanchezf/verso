-- The recommendation engine's foundations: stage 0 (the instruments) and the
-- SQL half of stage 1 (the prior and the content profile).
--
-- This is PR A of the first batch in docs/design/recommendation-engine.md,
-- section "What can be built before there is data, and the first batch
-- (2026-09-24)", items 1 to 7. The reasoning (the four layers, why the score is
-- read off a position, why the model only picks among SQL's candidates) is in
-- that document and is not restated here; every formula below names the symbol
-- in it that it implements. Nothing here needs a crowd: it runs on one user's
-- list and the catalog, which is why it can be built before there is data.
--
-- What it adds, in file order:
--
--   1. ranking_score(tier, position, tier_size): the 0 to 10 band math of
--      packages/core scoreForPosition, once, for everything below.
--   2. ranking_percentiles and user_rank_stats: security invoker views over
--      ranking_entries, so the owner-only policy passes through.
--   3. recommendation_external_scores, item_prior and refresh_item_priors: the
--      community prior (layer 0), catalog-like, refreshed nightly at 03:30 UTC.
--   4. prediction_log, suggestion_requests and count_suggestion_requests: the
--      online half of the harness and the meter, owner insert and select only.
--   5. The content model (layer 1), internal: recommendation_user_scores,
--      recommendation_feature_rows, recommendation_item_features,
--      recommendation_feature_idf, recommendation_content_profile and
--      recommendation_scores.
--   6. suggestion_candidates: the one function a signed-in user calls.
--   7. The leave-one-out harness, internal: recommendation_loo and
--      recommendation_loo_summary, with the loop that runs it for every user.
--   8. The pg_cron schedule for the nightly refresh, guarded the way
--      20260916084800_player_counts.sql guards its poll.
--
-- ## The grant decision: suggestion_candidates is security definer
--
-- The scorer takes a user id, because the harness has to run it for any user
-- as the service role. If `authenticated` could execute it, a signed-in user
-- could pass someone else's id and read that person's taste back out of the
-- scores and out of `why`, which names the user's own items and tiers. So the
-- five internal functions (and the helpers they call) are revoked from `anon`
-- and `authenticated` and granted to `service_role` only.
--
-- That leaves suggestion_candidates two ways to reach them, and this file takes
-- the first:
--
--   * security definer, with a pinned search_path and its own auth.uid() check
--     (28000 when there is no user), passing auth.uid() and never an argument
--     to the scorer. The caller cannot name a user at all, so there is nothing
--     to validate; the function reads item_prior and calls the scorer as the
--     owner, which the caller cannot do.
--   * security invoker, with execute on the scorer granted to `authenticated`
--     and a check inside the scorer that p_user_id is auth.uid(). Rejected
--     because the check would then be the only thing between a user and
--     everyone's lists, repeated in every internal function that takes a user,
--     and one forgotten check in a later layer (the neighbors take two users)
--     would be a hole the grants no longer backstop.
--
-- A definer function bypasses Row Level Security, so every read of a user
-- table inside it is filtered by the auth.uid() it captured, explicitly. The
-- test suite proves a signed-in user cannot call the scorer or the profile, and
-- that suggestion_candidates answers from the caller's list and nobody else's.
--
-- ## External scores are all on 0 to 100
--
-- Every source in external_scores is stored on 0 to 100, TMDB included: the
-- TMDB mirror writes vote_average times ten (packages/catalog/src/tmdb-map.ts,
-- mapTmdbScore, "so every source in external_scores shares the 0-100 scale").
-- So every source is divided by ten here, including tmdb.
--
-- ## What is deliberately left out
--
-- The neighbors (layer 2), Match, the group session tables and the group query,
-- the IGDB multiplayer-modes mirror, the suggest Edge Function (PR B), every
-- screen, and packages/api/src/database.types.ts, which is regenerated from the
-- hosted project after merge (`pnpm db:types`).
--
-- Errors raised here use the SQLSTATEs the earlier files use, following the
-- legend in 20260915130000_ranking_functions.sql:
--   28000  no authenticated user
--   22023  no medium, or a filter that does not apply to the medium asked for

-- ==============================================================================
-- 1. ranking_score: the band math, once
-- ==============================================================================
--
-- The derived 0 to 10 score of a position inside a tier, exactly as
-- scoreForPosition in packages/core/src/ranking.ts computes it with TIER_BANDS
-- from packages/core/src/model.ts: loved 8.5 to 10, liked 6.5 to 8.4, fine 4 to
-- 6.4, disliked 0 to 3.9; linear inside the band with position 0 best; a lone
-- item at the band midpoint; rounded to one decimal.
--
-- "Exactly" is the reason for the double precision. The app computes this in
-- JavaScript doubles and rounds with Math.round, which rounds half up. Exact
-- numeric arithmetic disagrees with it on 564 of the 320,800 (tier, position,
-- size) cases up to 400 items: numeric division truncates a repeating fraction,
-- so the loved tier of seven at position 1 comes out 9.7499... and rounds to
-- 9.7 where the app shows 9.8. The expression below performs the same IEEE
-- operations in the same order as the TypeScript and rounds half up with
-- floor(x + 0.5), and it matched the app on all 320,800 cases when this was
-- written. Only the final one-decimal value is converted to numeric.
--
-- Out-of-range input returns null rather than raising the way the TypeScript
-- throws, because this runs inside views over every list, and one inconsistent
-- row should cost its own score and not the whole read.
--
-- Pure arithmetic, so granted to `authenticated`: the security invoker views
-- below call it as the caller.

create or replace function public.ranking_score(
  p_tier public.tier,
  p_position integer,
  p_tier_size integer
)
returns numeric
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  select case
    when p_tier is null or p_position is null or p_tier_size is null
      or p_tier_size < 1 or p_position < 0 or p_position >= p_tier_size then null
    -- TIER_BANDS midpoint: round1((low + high) / 2)
    when p_tier_size = 1 then
      round(floor(((b.lo + b.hi) / 2) * 10 + 0.5)::numeric / 10, 1)
    -- scoreForPosition: t = position / (tierSize - 1); round1(high - (high - low) * t)
    else
      round(
        floor((b.hi - (b.hi - b.lo) * (p_position::float8 / (p_tier_size - 1)::float8)) * 10 + 0.5)::numeric / 10,
        1
      )
  end
  from (
    select
      case p_tier
        when 'loved' then 8.5::float8
        when 'liked' then 6.5::float8
        when 'fine' then 4::float8
        when 'disliked' then 0::float8
      end as lo,
      case p_tier
        when 'loved' then 10::float8
        when 'liked' then 8.4::float8
        when 'fine' then 6.4::float8
        when 'disliked' then 3.9::float8
      end as hi
  ) b;
$$;

comment on function public.ranking_score(public.tier, integer, integer) is
  'The derived 0 to 10 score of a 0-based position in a tier of a given size: packages/core scoreForPosition with TIER_BANDS, computed in double precision and rounded half up so it matches the app to the last decimal. Null for a position outside the tier.';

revoke all on function public.ranking_score(public.tier, integer, integer) from public, anon;
grant execute on function public.ranking_score(public.tier, integer, integer) to authenticated, service_role;

-- ==============================================================================
-- 2. ranking_percentiles and user_rank_stats
-- ==============================================================================
--
-- The percentile view the design's stage 0 names: every ranked item with its
-- place in the user's whole list for that medium. Tiers in enum order (loved,
-- liked, fine, disliked), then position, so rank 1 is the user's favourite.
--
-- The score uses the item's dense index inside its tier rather than the stored
-- position. The ranking RPCs keep positions dense, so the two are the same
-- number; if a gap ever appeared, the index keeps the band math honest (a tier
-- of three still spans its band) where the stored position would not.
--
-- `security_invoker = true`, so the owner-only policy on ranking_entries is
-- what decides the rows: a signed-in user sees their own list and nobody
-- else's, and the service role and the nightly job see every list. The same
-- reasoning as latest_player_counts in 20260916084800_player_counts.sql.

create view public.ranking_percentiles
with (security_invoker = true) as
  select
    w.user_id,
    w.medium,
    w.media_item_id,
    w.tier,
    w.position,
    w.tier_size::integer as tier_size,
    w.overall_rank::integer as overall_rank,
    w.n_ranked::integer as n_ranked,
    -- pct = (n_ranked - rank + 0.5) / n_ranked (item 1 of the first batch)
    (w.n_ranked - w.overall_rank + 0.5) / w.n_ranked::numeric as pct,
    public.ranking_score(w.tier, w.tier_index::integer, w.tier_size::integer) as score
  from (
    select
      r.user_id,
      r.medium,
      r.media_item_id,
      r.tier,
      r.position,
      count(*) over (partition by r.user_id, r.medium, r.tier) as tier_size,
      row_number() over (
        partition by r.user_id, r.medium, r.tier
        order by r.position, r.media_item_id
      ) - 1 as tier_index,
      row_number() over (
        partition by r.user_id, r.medium
        order by r.tier, r.position, r.media_item_id
      ) as overall_rank,
      count(*) over (partition by r.user_id, r.medium) as n_ranked
    from public.ranking_entries r
  ) w;

comment on view public.ranking_percentiles is
  'Every ranked item with its tier size, its rank in the user''s whole list for the medium (1 is best), the list size, its percentile and its derived score. Runs as the caller, so ranking_entries'' owner-only policy applies.';
comment on column public.ranking_percentiles.user_id is 'Whose list.';
comment on column public.ranking_percentiles.medium is 'Which list: one per medium, and never compared across media (rule 24).';
comment on column public.ranking_percentiles.media_item_id is 'The ranked item.';
comment on column public.ranking_percentiles.tier is 'The tier it sits in.';
comment on column public.ranking_percentiles.position is 'Its stored position in the tier, 0 best.';
comment on column public.ranking_percentiles.tier_size is 'How many items the user has in that tier of that medium.';
comment on column public.ranking_percentiles.overall_rank is 'Its rank in the whole list, 1 best: tiers in order, then position.';
comment on column public.ranking_percentiles.n_ranked is 'How many items the user has ranked in the medium.';
comment on column public.ranking_percentiles.pct is 'Its percentile, (n_ranked - overall_rank + 0.5) / n_ranked: 0.833, 0.5 and 0.167 for a list of three.';
comment on column public.ranking_percentiles.score is 'Its derived 0 to 10 score, from ranking_score on its dense index inside the tier. The same number the app shows.';

-- One row per user and medium: the summary the content score is mapped onto.
-- The standard deviation is the population one (a user's list is the whole
-- population of their scores, not a sample), so a list of one has 0 rather
-- than null. min_score and max_score are here because the content score is
-- mapped between them (section 5).

create view public.user_rank_stats
with (security_invoker = true) as
  select
    p.user_id,
    p.medium,
    count(*)::integer as n_ranked,
    avg(p.score) as mean_score,
    stddev_pop(p.score) as sd_score,
    min(p.score) as min_score,
    max(p.score) as max_score
  from public.ranking_percentiles p
  group by p.user_id, p.medium;

comment on view public.user_rank_stats is
  'Per user and medium: how many items are ranked and the mean, population standard deviation, minimum and maximum of their scores. Runs as the caller, so a user reads only their own.';
comment on column public.user_rank_stats.user_id is 'Whose list.';
comment on column public.user_rank_stats.medium is 'Which medium.';
comment on column public.user_rank_stats.n_ranked is 'Ranked items in the medium.';
comment on column public.user_rank_stats.mean_score is 'The mean derived score, the user''s baseline (b_ux at first, in the design''s layer 2).';
comment on column public.user_rank_stats.sd_score is 'The population standard deviation of the scores; 0 for a list of one.';
comment on column public.user_rank_stats.min_score is 'The lowest score on the list, the floor a negative content score is mapped toward.';
comment on column public.user_rank_stats.max_score is 'The highest score on the list, the ceiling a positive content score is mapped toward.';

revoke all on public.ranking_percentiles from anon, authenticated;
grant select on public.ranking_percentiles to authenticated;

revoke all on public.user_rank_stats from anon, authenticated;
grant select on public.user_rank_stats to authenticated;

-- ==============================================================================
-- 3. The community prior: item_prior and its nightly refresh
-- ==============================================================================

-- 3a. recommendation_external_scores -------------------------------------------
-- One external score per item, on 0 to 10: the first present in the order
-- metacritic, opencritic, igdb_critics, steam, igdb_users, tmdb (item 2 of the
-- first batch), divided by ten because every source is stored on 0 to 100 (see
-- the header). opencritic_recommended is not in the list: it is the share of
-- critics who recommend the game, not a score. The quantile map the design
-- describes waits for items that have both a Verso average and an external
-- score; until then the rescale is linear.
--
-- A view, so the nightly refresh reads it for the whole catalog in one pass and
-- the scorer reads it for one item at a time (the filter on media_item_id is
-- pushed into the `distinct on` and served by external_scores' primary key).
-- Internal: the scorer and the refresh read it, clients read external_scores.

create view public.recommendation_external_scores
with (security_invoker = true) as
  select distinct on (s.media_item_id)
    s.media_item_id,
    s.source,
    -- linear rescale to 0 to 10 (layer 0: "rescaled to 0 to 10")
    least(greatest(s.score / 10, 0), 10) as score
  from public.external_scores s
  where s.score is not null
    and s.source in ('metacritic', 'opencritic', 'igdb_critics', 'steam', 'igdb_users', 'tmdb')
  order by
    s.media_item_id,
    array_position(
      array['metacritic', 'opencritic', 'igdb_critics', 'steam', 'igdb_users', 'tmdb']::text[],
      s.source
    );

comment on view public.recommendation_external_scores is
  'The one external score the prior uses per item, on 0 to 10: the first present of metacritic, opencritic, igdb_critics, steam, igdb_users, tmdb, divided by ten. Internal to the recommendation functions.';
comment on column public.recommendation_external_scores.media_item_id is 'The catalog item.';
comment on column public.recommendation_external_scores.source is 'Which source the score came from.';
comment on column public.recommendation_external_scores.score is 'That source''s score divided by ten and clamped to 0 to 10.';

revoke all on public.recommendation_external_scores from anon, authenticated;

-- 3b. item_prior ----------------------------------------------------------------
-- The layer 0 prior per catalog item, the floor every other layer has to beat:
--
--   m_x = (n_x * avg_x + C * g) / (n_x + C)        C = 10
--
-- with n_x the item's Verso rankers, avg_x their mean score, and g the item's
-- external score, else the medium's Verso mean, else 6.5. With no rankers the
-- prior is g; as rankers arrive it moves toward their average and reaches the
-- halfway point at ten of them.
--
-- Catalog-like, shaped and secured the way game_availability is: written by
-- the service role through refresh_item_priors, readable by every signed-in
-- user, and `anon` keeps SELECT with no policy so a signed-out read is empty
-- rather than an error. n_rankers and mean_score are aggregates over many
-- users' lists and name nobody.
--
-- baseline_score (g) is stored as well as the inputs, because the harness has
-- to take one user's own ranking back out of an item's prior (section 5,
-- recommendation_scores), and that needs the g the row was built on.

create table public.item_prior (
  media_item_id uuid primary key references public.media_items (id) on delete cascade,
  medium public.medium not null,
  n_rankers integer not null default 0
    constraint item_prior_n_rankers_check check (n_rankers >= 0),
  mean_score numeric
    constraint item_prior_mean_score_check check (mean_score between 0 and 10),
  external_score numeric
    constraint item_prior_external_score_check check (external_score between 0 and 10),
  external_source text,
  baseline_score numeric not null
    constraint item_prior_baseline_score_check check (baseline_score between 0 and 10),
  prior_score numeric not null
    constraint item_prior_prior_score_check check (prior_score between 0 and 10),
  computed_at timestamptz not null default now()
);

comment on table public.item_prior is
  'The community prior per catalog item (layer 0 of docs/design/recommendation-engine.md): Verso rankers'' mean shrunk toward the external score. Rebuilt nightly by refresh_item_priors as the service role; readable by every signed-in user.';
comment on column public.item_prior.media_item_id is 'The catalog item. Dropping it from the catalog drops its prior.';
comment on column public.item_prior.medium is 'The item''s medium, copied from media_items so a medium''s priors are one index range away.';
comment on column public.item_prior.n_rankers is 'n_x: how many Verso users have ranked the item.';
comment on column public.item_prior.mean_score is 'avg_x: those users'' mean derived score, 0 to 10. Null when nobody has ranked it.';
comment on column public.item_prior.external_score is 'The item''s external score on 0 to 10, from recommendation_external_scores. Null when no source has one.';
comment on column public.item_prior.external_source is 'Which source external_score came from, for the reason line and for debugging a prior.';
comment on column public.item_prior.baseline_score is 'g: what the prior shrinks toward. The external score, else the medium''s Verso mean at refresh time, else 6.5.';
comment on column public.item_prior.prior_score is 'm_x = (n_x * avg_x + C * g) / (n_x + C) with C = 10.';
comment on column public.item_prior.computed_at is 'When the refresh that wrote this row ran. Every row of one refresh carries its transaction''s timestamp.';

create index item_prior_medium_prior on public.item_prior (medium, prior_score desc);

alter table public.item_prior enable row level security;

create policy "priors are readable by signed-in users" on public.item_prior
  for select to authenticated using (true);

revoke all on public.item_prior from anon, authenticated;
grant select on public.item_prior to anon, authenticated;

-- 3c. refresh_item_priors -------------------------------------------------------
-- Rebuilds item_prior for one medium, or for every medium when p_medium is
-- null. One INSERT ... ON CONFLICT per medium over the whole of that medium's
-- catalog, never a loop over rows: the loop below is over the three media.
--
-- Security invoker, granted to the service role only. It reads every user's
-- list through ranking_percentiles, which only works for a role that bypasses
-- Row Level Security: the service role, or the migration owner that pg_cron
-- runs the nightly job as. A signed-in user cannot execute it at all.
--
-- Every row is rewritten each night, unchanged or not, so computed_at always
-- says when the job last ran. Returns the number of rows written.

create or replace function public.refresh_item_priors(p_medium public.medium default null)
returns integer
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
declare
  v_medium public.medium;
  v_rows integer;
  v_total integer := 0;
begin
  foreach v_medium in array
    case when p_medium is null then enum_range(null::public.medium) else array[p_medium] end
  loop
    with verso as (
      -- n_x and avg_x per item
      select p.media_item_id, count(*)::integer as n, avg(p.score) as mean
      from public.ranking_percentiles p
      where p.medium = v_medium
      group by p.media_item_id
    ),
    medium_mean as (
      -- the medium's Verso mean, g's second choice
      select avg(p.score) as mean
      from public.ranking_percentiles p
      where p.medium = v_medium
    ),
    inputs as (
      select
        m.id as media_item_id,
        m.medium,
        coalesce(v.n, 0) as n,
        v.mean,
        e.score as external_score,
        e.source as external_source,
        -- g: the external score, else the medium's Verso mean, else 6.5
        coalesce(e.score, mm.mean, 6.5) as g
      from public.media_items m
      cross join medium_mean mm
      left join verso v on v.media_item_id = m.id
      left join public.recommendation_external_scores e on e.media_item_id = m.id
      where m.medium = v_medium
    )
    insert into public.item_prior as ip (
      media_item_id, medium, n_rankers, mean_score, external_score, external_source,
      baseline_score, prior_score, computed_at
    )
    select
      r.media_item_id,
      r.medium,
      r.n,
      r.mean,
      r.external_score,
      r.external_source,
      r.g,
      -- m_x = (n_x * avg_x + C * g) / (n_x + C), C = 10
      (r.n * coalesce(r.mean, 0) + 10 * r.g) / (r.n + 10),
      now()
    from inputs r
    on conflict (media_item_id) do update set
      medium = excluded.medium,
      n_rankers = excluded.n_rankers,
      mean_score = excluded.mean_score,
      external_score = excluded.external_score,
      external_source = excluded.external_source,
      baseline_score = excluded.baseline_score,
      prior_score = excluded.prior_score,
      computed_at = excluded.computed_at;

    get diagnostics v_rows = row_count;
    v_total := v_total + v_rows;
  end loop;

  return v_total;
end;
$$;

comment on function public.refresh_item_priors(public.medium) is
  'Rebuild item_prior for one medium, or all three when null, in one statement per medium. Service role only; scheduled nightly at 03:30 UTC. Returns the rows written.';

revoke all on function public.refresh_item_priors(public.medium) from public, anon, authenticated;
grant execute on function public.refresh_item_priors(public.medium) to service_role;

-- ==============================================================================
-- 4. The instruments: prediction_log, suggestion_requests, the meter
-- ==============================================================================
--
-- Both tables are user data and get Row Level Security from this, their first
-- migration: the owner may insert and read their own rows, and nobody may
-- update or delete one. There is no update or delete policy, and the grants
-- say the same thing one level up, so an attempt is a permission error rather
-- than a silent no-op. They are append-only logs; the cascade from auth.users
-- is the only way a row leaves, which is what delete_my_account relies on.
--
-- user_id defaults to auth.uid() so the suggest function (PR B) can insert with
-- the caller's JWT without naming the user; the insert policy still refuses a
-- row that names anyone else.

-- 4a. suggestion_requests -------------------------------------------------------

create table public.suggestion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  medium public.medium not null,
  kind text not null
    constraint suggestion_requests_kind_check check (kind in ('personal', 'group')),
  model text,
  input_tokens integer not null default 0
    constraint suggestion_requests_input_tokens_check check (input_tokens >= 0),
  output_tokens integer not null default 0
    constraint suggestion_requests_output_tokens_check check (output_tokens >= 0),
  candidate_count integer not null default 0
    constraint suggestion_requests_candidate_count_check check (candidate_count >= 0),
  request jsonb not null default '{}'::jsonb,
  picks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.suggestion_requests is
  'One row per suggestion request: the meter that caps model calls per user per day, and the record of what was asked and picked. Owner insert and read only; never updated or deleted.';
comment on column public.suggestion_requests.id is 'The request, which prediction_log rows point back at.';
comment on column public.suggestion_requests.user_id is 'Who asked. Defaults to auth.uid(); the insert policy refuses anyone else.';
comment on column public.suggestion_requests.medium is 'The medium the suggestion was for.';
comment on column public.suggestion_requests.kind is 'personal (one user) or group (a session, stage 3).';
comment on column public.suggestion_requests.model is 'The model id the request called, null when no model was called (fewer than three candidates, the template path).';
comment on column public.suggestion_requests.input_tokens is 'Input tokens the model call used, 0 when there was no call.';
comment on column public.suggestion_requests.output_tokens is 'Output tokens the model call used, 0 when there was no call.';
comment on column public.suggestion_requests.candidate_count is 'How many SQL candidates the model was offered.';
comment on column public.suggestion_requests.request is 'The request body as received: filters, region, the optional note.';
comment on column public.suggestion_requests.picks is 'What was returned: the picks by media item id with their reasons, and whether it was the fallback.';
comment on column public.suggestion_requests.created_at is 'When the request was made. The meter counts rows newer than a window from now.';

create index suggestion_requests_user_created
  on public.suggestion_requests (user_id, created_at desc);

-- 4b. prediction_log ------------------------------------------------------------
-- Every prediction a user was shown, with what produced it. The harness's
-- online half: the outcome (was it ranked later, in which tier) is joined from
-- ranking_entries when it is read, never copied here.

create table public.prediction_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  medium public.medium not null,
  media_item_id uuid not null references public.media_items (id) on delete cascade,
  surface text not null
    constraint prediction_log_surface_check check (surface in ('suggest', 'item_page', 'group')),
  predicted_score numeric(4, 2) not null
    constraint prediction_log_predicted_score_check check (predicted_score between 0 and 10),
  confidence text not null
    constraint prediction_log_confidence_check check (confidence in ('high', 'medium', 'needs_more_data')),
  model_version text not null,
  components jsonb not null default '{}'::jsonb,
  request_id uuid references public.suggestion_requests (id) on delete set null,
  shown_at timestamptz not null default now()
);

comment on table public.prediction_log is
  'Every predicted score a user was shown, with the version and components that produced it. Owner insert and read only; never updated or deleted. The outcome is joined from ranking_entries at read time.';
comment on column public.prediction_log.id is 'The logged prediction.';
comment on column public.prediction_log.user_id is 'Who was shown it. Defaults to auth.uid(); the insert policy refuses anyone else.';
comment on column public.prediction_log.medium is 'The medium of the item.';
comment on column public.prediction_log.media_item_id is 'The item the prediction was for.';
comment on column public.prediction_log.surface is 'Where it was shown: suggest (the three picks), item_page, or group.';
comment on column public.prediction_log.predicted_score is 'The 0 to 10 score shown, on the user''s own scale.';
comment on column public.prediction_log.confidence is 'The label shown with it: high, medium or needs_more_data.';
comment on column public.prediction_log.model_version is 'Which scorer produced it, for example content-v1, so a later model''s accuracy is never mixed with this one''s.';
comment on column public.prediction_log.components is 'The parts of the score (prior, content, cosine, weights) as the scorer returned them.';
comment on column public.prediction_log.request_id is 'The suggestion request this came from, null for surfaces that have none.';
comment on column public.prediction_log.shown_at is 'When it was shown.';

create index prediction_log_user_item on public.prediction_log (user_id, media_item_id);
create index prediction_log_request on public.prediction_log (request_id) where request_id is not null;

-- 4c. Row Level Security --------------------------------------------------------

alter table public.suggestion_requests enable row level security;
alter table public.prediction_log enable row level security;

create policy "users read their own suggestion requests" on public.suggestion_requests
  for select to authenticated using (auth.uid() = user_id);
create policy "users log their own suggestion requests" on public.suggestion_requests
  for insert to authenticated with check (auth.uid() = user_id);

create policy "users read their own predictions" on public.prediction_log
  for select to authenticated using (auth.uid() = user_id);
create policy "users log their own predictions" on public.prediction_log
  for insert to authenticated with check (auth.uid() = user_id);

revoke all on public.suggestion_requests from anon, authenticated;
grant select, insert on public.suggestion_requests to authenticated;

revoke all on public.prediction_log from anon, authenticated;
grant select, insert on public.prediction_log to authenticated;

-- 4d. count_suggestion_requests -------------------------------------------------
-- The meter: how many suggestion requests the caller has made in the last
-- p_since (24 hours by default). Security invoker on auth.uid(), with the
-- filter written out as well as enforced by the policy, like the ranking RPCs.
-- A user cannot lower their own count: the rows cannot be updated or deleted.

create or replace function public.count_suggestion_requests(
  p_since interval default interval '24 hours'
)
returns integer
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'count_suggestion_requests requires an authenticated user';
  end if;

  select count(*)::integer into v_count
  from public.suggestion_requests s
  where s.user_id = v_uid
    and s.created_at >= now() - coalesce(p_since, interval '24 hours');

  return v_count;
end;
$$;

comment on function public.count_suggestion_requests(interval) is
  'How many suggestion requests the caller made in the last p_since (default 24 hours): the meter the suggest function checks before calling a model.';

revoke all on function public.count_suggestion_requests(interval) from public, anon;
grant execute on function public.count_suggestion_requests(interval) to authenticated, service_role;

-- ==============================================================================
-- 5. The content model (layer 1), internal
-- ==============================================================================
--
-- Every function in this section takes a user id and is revoked from `anon`
-- and `authenticated` (see the header). They are security invoker: called by
-- the service role or from inside suggestion_candidates (which runs as the
-- owner), they read every table they need; called by anyone else they cannot
-- be called at all.
--
-- p_exclude_item is how the harness reuses them. With it set, the item is
-- taken out of the user's list before anything is computed from it, as if the
-- user had never ranked it: the other items are rescored in their tiers, the
-- mean and the profile are rebuilt, and the item's prior loses the user's own
-- ranking. There is one implementation of the math, and leave-one-out is an
-- argument to it.

-- 5a. recommendation_user_scores ------------------------------------------------
-- One user's list in one medium, rescored by ranking_score with the excluded
-- item (if any) removed first. With no exclusion it is exactly that user's
-- rows of ranking_percentiles.

create or replace function public.recommendation_user_scores(
  p_user_id uuid,
  p_medium public.medium,
  p_exclude_item uuid default null
)
returns table (
  media_item_id uuid,
  tier public.tier,
  score numeric
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    w.media_item_id,
    w.tier,
    public.ranking_score(w.tier, w.tier_index::integer, w.tier_size::integer)
  from (
    select
      r.media_item_id,
      r.tier,
      row_number() over (partition by r.tier order by r.position, r.media_item_id) - 1 as tier_index,
      count(*) over (partition by r.tier) as tier_size
    from public.ranking_entries r
    where r.user_id = p_user_id
      and r.medium = p_medium
      and (p_exclude_item is null or r.media_item_id <> p_exclude_item)
  ) w;
$$;

comment on function public.recommendation_user_scores(uuid, public.medium, uuid) is
  'Internal. One user''s ranked items in one medium with their derived scores, rescored as if p_exclude_item had never been ranked.';

-- 5b. recommendation_feature_rows and recommendation_item_features -----------
-- The catalog features the content profile is built from, one row per item and
-- feature, as prefixed strings so every medium shares one vocabulary shape:
--
--   games   genre:, developer:, platform:, decade:
--   films   genre:, director: (movie_details.directors), decade:
--   series  genre:, creator: (tv_details.creators), decade:
--
-- tv_details has a creators column (the series analog of a film's directors),
-- so series get creator: features; it has no platform or developer, so series
-- use genres, creators and decade. Cast, tags and the platform family the
-- design lists wait for the columns and the vocabulary job (stage 4).
--
-- The view is the one definition of what a feature is. One branch per kind of
-- feature, joined by UNION ALL, each a plain scan of one table with its medium
-- as a constant, so a filter on the medium prunes whole branches and a filter
-- on media_item_id reaches each table's primary key. The first version joined
-- the four tables and unnested everything in one lateral per row: counting four
-- features over a 70,000-game synthetic catalog took 550 ms, against 26 ms for
-- this shape. Each details table only holds rows of its own medium (the mirrors
-- write game_details for games, movie_details for films, tv_details for
-- series), so the details branches need no join to media_items.

create view public.recommendation_feature_rows
with (security_invoker = true) as
  select g.media_item_id, 'game'::public.medium as medium, 'genre:' || x as feature
  from public.game_details g
  cross join unnest(g.genres) as x
  where x <> ''
  union all
  select g.media_item_id, 'game'::public.medium, 'developer:' || g.developer
  from public.game_details g
  where g.developer <> ''
  union all
  select g.media_item_id, 'game'::public.medium, 'platform:' || x
  from public.game_details g
  cross join unnest(g.platforms) as x
  where x <> ''
  union all
  select md.media_item_id, 'movie'::public.medium, 'genre:' || x
  from public.movie_details md
  cross join unnest(md.genres) as x
  where x <> ''
  union all
  select md.media_item_id, 'movie'::public.medium, 'director:' || x
  from public.movie_details md
  cross join unnest(md.directors) as x
  where x <> ''
  union all
  select td.media_item_id, 'tv'::public.medium, 'genre:' || x
  from public.tv_details td
  cross join unnest(td.genres) as x
  where x <> ''
  union all
  select td.media_item_id, 'tv'::public.medium, 'creator:' || x
  from public.tv_details td
  cross join unnest(td.creators) as x
  where x <> ''
  union all
  select m.id, m.medium, 'decade:' || ((m.year / 10) * 10)::text
  from public.media_items m
  where m.year is not null;

comment on view public.recommendation_feature_rows is
  'Internal. Every content feature of every catalog item, one row each: genre, developer, platform and decade for games; genre, director and decade for films; genre, creator and decade for series. A value repeated inside one array gives a repeated row; recommendation_item_features removes them.';
comment on column public.recommendation_feature_rows.media_item_id is 'The catalog item.';
comment on column public.recommendation_feature_rows.medium is 'The item''s medium: constant per branch for the details tables, from media_items for the decade.';
comment on column public.recommendation_feature_rows.feature is 'The feature as kind:value, for example genre:Roguelike, director:Denis Villeneuve or decade:2010.';

revoke all on public.recommendation_feature_rows from anon, authenticated;

-- Two ways in, and a code path for each so each query gets the plan it needs.
-- With p_items, the features of those items (the user's list, the candidates):
-- primary-key lookups, under a millisecond for a list of seven and about 15 ms
-- for 500 candidates on the synthetic catalog. With p_items null, the whole
-- medium narrowed to p_features, which is how document frequencies are
-- counted: a scan of the medium's tables with a hashed membership test, about
-- 0.2 s on the synthetic catalog, which is what the profile costs. Without the
-- narrowing it would be every feature of every item. Distinct either way.

create or replace function public.recommendation_item_features(
  p_medium public.medium,
  p_items uuid[] default null,
  p_features text[] default null
)
returns table (
  media_item_id uuid,
  feature text
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  if p_items is not null then
    return query
    select distinct r.media_item_id, r.feature
    from public.recommendation_feature_rows r
    where r.medium = p_medium
      and r.media_item_id = any (p_items)
      and (p_features is null or r.feature = any (p_features));
  else
    return query
    select distinct r.media_item_id, r.feature
    from public.recommendation_feature_rows r
    where r.medium = p_medium
      and (p_features is null or r.feature in (select unnest(p_features)));
  end if;
end;
$$;

comment on function public.recommendation_item_features(public.medium, uuid[], text[]) is
  'Internal. The distinct content features of catalog items of one medium, from recommendation_feature_rows: of p_items, or of the whole medium narrowed to p_features when p_items is null.';

-- 5c. recommendation_feature_idf ------------------------------------------------
-- idf(f) = ln(items in the medium / items with the feature) (item 4 of the
-- first batch), for the features asked about only. Counted live over the
-- catalog, so it is always in step with the mirror; a feature on every item of
-- the medium weighs 0 and a rare one weighs most.

create or replace function public.recommendation_feature_idf(
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
security invoker
set search_path = public, extensions
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

comment on function public.recommendation_feature_idf(public.medium, text[]) is
  'Internal. For each feature asked about: how many catalog items of the medium carry it, and idf = ln(items in the medium / items with the feature).';

-- 5d. recommendation_content_profile --------------------------------------------
-- The user's taste as feature weights (layer 1, item 4 of the first batch):
--
--   weight(f) = sum over the user's items i carrying f of (s_i - mu) * idf(f)
--               / sum over all the user's items of |s_i - mu|
--
-- with s_i the item's derived score and mu the user's mean. A feature counts
-- only when it is on two or more of the user's items, so one loved game does
-- not make its developer a taste. Positive weights are what the user ranks
-- above their average, negative below. A list whose scores are all equal (a
-- list of one) has no spread and returns no profile.

create or replace function public.recommendation_content_profile(
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
security invoker
set search_path = public, extensions
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
  join public.recommendation_feature_idf(
    p_medium, (select coalesce(array_agg(s2.feature), '{}') from shared s2)
  ) i on i.feature = s.feature
  cross join spread sp
  where sp.total > 0;
$$;

comment on function public.recommendation_content_profile(uuid, public.medium, uuid) is
  'Internal. A user''s content profile in one medium: per feature on two or more of their items, the idf-weighted sum of their score deviations over the sum of absolute deviations. p_exclude_item removes one item first, for leave-one-out.';

-- 5e. recommendation_scores -----------------------------------------------------
-- Scores a set of catalog items for one user (item 4 of the first batch):
--
--   prior_score      m_x from item_prior when the row exists, else the
--                    external score inline, else 6.5. For the held-out item
--                    in leave-one-out, the user's own ranking is taken back
--                    out: (n_x * avg_x - s_u + C * g) / (n_x - 1 + C).
--   content_score    cos = (profile . features) / (|profile| * |features|),
--                    the item's features as a 0/1 vector (idf already sits in
--                    the profile), mapped onto the user's scale:
--                    mu + cos * (max - mu) when cos >= 0,
--                    mu + cos * (mu - min) when cos < 0.
--                    Null when the user has no profile.
--   predicted_score  (prior + w * content) / (1 + w), w = n / (n + 10), with
--                    n the user's ranked count; the prior alone when content
--                    is null.
--   confidence       needs_more_data below 5 ranked items, medium below 15,
--                    high from 15 (no neighbor error exists yet to use).
--   why              the three profile features that pushed the item hardest
--                    in the direction of its content score, each with its
--                    weight and up to two of the user's own items that carry
--                    it; the prior and where it came from; n and the cosine.
--
-- The three numbers are rounded to two decimals, which is what the harness
-- scores and what the app would show.
--
-- The leave-one-out prior uses the item's stored n_x, avg_x and g and the
-- user's current score for it, so it is exact when the list has not changed
-- since the last refresh_item_priors; run the refresh before the harness.

create or replace function public.recommendation_scores(
  p_user_id uuid,
  p_medium public.medium,
  p_items uuid[],
  p_exclude_item uuid default null
)
returns table (
  media_item_id uuid,
  prior_score numeric,
  content_score numeric,
  predicted_score numeric,
  confidence text,
  why jsonb
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with list as (
    select s.media_item_id, s.tier, s.score
    from public.recommendation_user_scores(p_user_id, p_medium, p_exclude_item) s
  ),
  stats as (
    -- n, mu, max and min of the (leave-one-out) list
    select count(*)::integer as n, avg(l.score) as mu, max(l.score) as hi, min(l.score) as lo
    from list l
  ),
  profile as (
    select p.feature, p.weight
    from public.recommendation_content_profile(p_user_id, p_medium, p_exclude_item) p
  ),
  profile_norm as (
    -- |profile|
    select sqrt(sum(p.weight * p.weight)) as len, count(*) as k
    from profile p
  ),
  own as (
    -- s_u: the user's own score for the held-out item, from the full list
    select s.score
    from public.recommendation_user_scores(p_user_id, p_medium, null) s
    where s.media_item_id = p_exclude_item
  ),
  items as (
    select m.id
    from public.media_items m
    where m.id = any (p_items)
      and m.medium = p_medium
  ),
  feats as (
    select f.media_item_id, f.feature
    from public.recommendation_item_features(p_medium, coalesce(p_items, '{}')) f
  ),
  dots as (
    -- profile . features, and |features| as sqrt(feature count)
    select i.id, count(f.feature) as k, coalesce(sum(p.weight), 0) as dot
    from items i
    left join feats f on f.media_item_id = i.id
    left join profile p on p.feature = f.feature
    group by i.id
  ),
  cosines as (
    select
      d.id,
      d.dot,
      case
        when pn.k = 0 or pn.len = 0 then null
        when d.k = 0 then 0::numeric
        -- cos = (profile . features) / (|profile| * |features|)
        else d.dot / (pn.len * sqrt(d.k::numeric))
      end as cos
    from dots d
    cross join profile_norm pn
  ),
  priors as (
    select
      i.id,
      case
        when ip.media_item_id is not null
          and i.id = p_exclude_item
          and ip.n_rankers >= 1
          and (select o.score from own o) is not null then
          -- m_x without the held-out user: (n_x * avg_x - s_u + C * g) / (n_x - 1 + C), C = 10
          least(10, greatest(0,
            (ip.n_rankers * ip.mean_score - (select o.score from own o) + 10 * ip.baseline_score)
            / (ip.n_rankers - 1 + 10)
          ))
        when ip.media_item_id is not null then ip.prior_score
        -- no item_prior row yet: the external score inline, else 6.5
        else coalesce(
          (select e.score from public.recommendation_external_scores e where e.media_item_id = i.id),
          6.5
        )
      end as prior,
      case
        when ip.media_item_id is not null then 'item_prior'
        when exists (select 1 from public.recommendation_external_scores e where e.media_item_id = i.id)
          then 'external'
        else 'default'
      end as prior_from,
      case
        when ip.media_item_id is not null and i.id = p_exclude_item and ip.n_rankers >= 1
          and (select o.score from own o) is not null then ip.n_rankers - 1
        else coalesce(ip.n_rankers, 0)
      end as n_rankers,
      coalesce(
        ip.external_source,
        (select e.source from public.recommendation_external_scores e where e.media_item_id = i.id)
      ) as external_source
    from items i
    left join public.item_prior ip on ip.media_item_id = i.id
  ),
  content as (
    select
      c.id,
      c.cos,
      case
        when c.cos is null then null
        -- mu + cos * (max - mu) when cos >= 0
        when c.cos >= 0 then st.mu + c.cos * (st.hi - st.mu)
        -- mu + cos * (mu - min) when cos < 0
        else st.mu + c.cos * (st.mu - st.lo)
      end as score
    from cosines c
    cross join stats st
  ),
  list_feats as (
    select f.media_item_id, f.feature
    from public.recommendation_item_features(
      p_medium, (select coalesce(array_agg(l.media_item_id), '{}') from list l)
    ) f
  ),
  carriers as (
    -- the user's own items behind each profile feature, best first for a
    -- positive weight and worst first for a negative one
    select
      p.feature,
      jsonb_agg(
        jsonb_build_object('media_item_id', x.media_item_id, 'title', x.title, 'tier', x.tier, 'score', x.score)
        order by x.rn
      ) as items
    from profile p
    join lateral (
      select
        l.media_item_id,
        m.title,
        l.tier,
        l.score,
        row_number() over (
          order by case when p.weight >= 0 then -l.score else l.score end, l.media_item_id
        ) as rn
      from list_feats lf
      join list l on l.media_item_id = lf.media_item_id
      join public.media_items m on m.id = l.media_item_id
      where lf.feature = p.feature
    ) x on x.rn <= 2
    group by p.feature
  ),
  contributions as (
    select
      f.media_item_id,
      p.feature,
      p.weight,
      row_number() over (
        partition by f.media_item_id
        order by case when c.dot >= 0 then -p.weight else p.weight end, p.feature
      ) as rn
    from feats f
    join profile p on p.feature = f.feature
    join cosines c on c.id = f.media_item_id
  ),
  reasons as (
    select
      ct.media_item_id,
      jsonb_agg(
        jsonb_build_object(
          'feature', ct.feature,
          'weight', round(ct.weight, 3),
          'items', coalesce(ca.items, '[]'::jsonb)
        )
        order by ct.rn
      ) as features
    from contributions ct
    left join carriers ca on ca.feature = ct.feature
    where ct.rn <= 3
    group by ct.media_item_id
  )
  select
    i.id,
    round(pr.prior, 2),
    round(ct.score, 2),
    -- predicted = (prior + w * content) / (1 + w), w = n / (n + 10)
    round(
      case
        when ct.score is null then pr.prior
        else (pr.prior + (st.n::numeric / (st.n + 10)) * ct.score) / (1 + st.n::numeric / (st.n + 10))
      end,
      2
    ),
    -- the confidence label: needs_more_data below 5, medium below 15, high from 15
    case
      when st.n < 5 then 'needs_more_data'
      when st.n < 15 then 'medium'
      else 'high'
    end,
    jsonb_build_object(
      'features', coalesce(rs.features, '[]'::jsonb),
      'prior', jsonb_build_object(
        'score', round(pr.prior, 2),
        'from', pr.prior_from,
        'n_rankers', pr.n_rankers,
        'external_source', pr.external_source
      ),
      'n_ranked', st.n,
      'cosine', round(ct.cos, 3)
    )
  from items i
  join priors pr on pr.id = i.id
  join content ct on ct.id = i.id
  cross join stats st
  left join reasons rs on rs.media_item_id = i.id;
$$;

comment on function public.recommendation_scores(uuid, public.medium, uuid[], uuid) is
  'Internal. For one user and a set of items of one medium: the prior, the content score read onto the user''s scale, the blended prediction, the confidence label and a why object. p_exclude_item scores as if the user had never ranked that item, which is how the harness reuses it.';

-- 5f. Grants --------------------------------------------------------------------
-- Every function that takes a user id is closed to `anon` and `authenticated`.
-- recommendation_item_features and recommendation_feature_idf take none and
-- read only the catalog, but they exist for the scorer and are closed too, so
-- the internal surface is one rule rather than a list of exceptions.

revoke all on function public.recommendation_user_scores(uuid, public.medium, uuid) from public, anon, authenticated;
revoke all on function public.recommendation_item_features(public.medium, uuid[], text[]) from public, anon, authenticated;
revoke all on function public.recommendation_feature_idf(public.medium, text[]) from public, anon, authenticated;
revoke all on function public.recommendation_content_profile(uuid, public.medium, uuid) from public, anon, authenticated;
revoke all on function public.recommendation_scores(uuid, public.medium, uuid[], uuid) from public, anon, authenticated;

grant execute on function public.recommendation_user_scores(uuid, public.medium, uuid) to service_role;
grant execute on function public.recommendation_item_features(public.medium, uuid[], text[]) to service_role;
grant execute on function public.recommendation_feature_idf(public.medium, text[]) to service_role;
grant execute on function public.recommendation_content_profile(uuid, public.medium, uuid) to service_role;
grant execute on function public.recommendation_scores(uuid, public.medium, uuid[], uuid) to service_role;

-- ==============================================================================
-- 6. suggestion_candidates
-- ==============================================================================
--
-- The retrieval half of the personal suggestion (item 5 of the first batch):
-- the caller's best candidates in one medium, each scored, for the suggest
-- function to hand to the model. Security definer for the reason in the
-- header; it takes no user argument and works on auth.uid() alone.
--
-- Every filter is a WHERE clause, never a soft lean (the design's "Hard filters
-- first, in SQL"):
--
--   * unseen: no entry of any status for the caller, backlog excepted when
--     p_include_backlog, and not ranked (a ranked item is seen whatever its
--     entry says);
--   * p_genres: shares at least one genre; p_exclude_genres: shares none;
--   * p_max_minutes: runtime for a film, the listed episode runtime for a
--     series, and for a game IGDB's "normally" time to beat
--     (time_to_beat_normally_seconds, the one figure the game page shows) in
--     whole minutes; an item whose length is unknown fails the filter, because
--     a limit it might break is not a limit it meets;
--   * p_platforms (games only): available on at least one of them;
--   * p_provider_ids (films and series only): an offer that is flatrate, free
--     or ads, in p_region, not removed, on one of the providers.
--
-- An empty array is no filter, the same as null. A platform filter on a film or
-- a provider filter on a game raises 22023 rather than silently emptying the
-- result or silently being ignored: the caller asked for something this medium
-- cannot answer.
--
-- The 500 filtered items with the best prior (item_prior, else the external
-- score inline, else 6.5) are scored by recommendation_scores, and the best
-- p_limit (clamped to 1 to 50) come back by predicted_score, then prior_score.

create or replace function public.suggestion_candidates(
  p_medium public.medium,
  p_genres text[] default null,
  p_exclude_genres text[] default null,
  p_max_minutes integer default null,
  p_platforms text[] default null,
  p_provider_ids integer[] default null,
  p_region text default 'US',
  p_include_backlog boolean default false,
  p_limit integer default 30
)
returns table (
  media_item_id uuid,
  title text,
  year smallint,
  cover_image_id text,
  genres text[],
  minutes integer,
  prior_score numeric,
  content_score numeric,
  predicted_score numeric,
  confidence text,
  why jsonb
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 50);
  v_region text := coalesce(nullif(btrim(p_region), ''), 'US');
  v_include_backlog boolean := coalesce(p_include_backlog, false);
  v_genres text[] := case when cardinality(p_genres) > 0 then p_genres end;
  v_exclude_genres text[] := case when cardinality(p_exclude_genres) > 0 then p_exclude_genres end;
  v_platforms text[] := case when cardinality(p_platforms) > 0 then p_platforms end;
  v_providers integer[] := case when cardinality(p_provider_ids) > 0 then p_provider_ids end;
  v_pool uuid[];
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'suggestion_candidates requires an authenticated user';
  end if;

  if p_medium is null then
    raise exception using
      errcode = '22023',
      message = 'suggestion_candidates needs a medium';
  end if;

  if v_platforms is not null and p_medium <> 'game' then
    raise exception using
      errcode = '22023',
      message = format('a platform filter applies to games, not to %s', p_medium);
  end if;

  if v_providers is not null and p_medium = 'game' then
    raise exception using
      errcode = '22023',
      message = 'a streaming provider filter applies to films and series, not to games';
  end if;

  -- The pool: the 500 filtered candidates with the best prior. Row Level
  -- Security does not apply inside a definer function, so the caller's entries
  -- and rankings are filtered by v_uid by hand.
  select array_agg(c.id) into v_pool
  from (
    select m.id
    from public.media_items m
    left join public.game_details g on g.media_item_id = m.id
    left join public.movie_details md on md.media_item_id = m.id
    left join public.tv_details td on td.media_item_id = m.id
    left join public.item_prior ip on ip.media_item_id = m.id
    where m.medium = p_medium
      and not exists (
        select 1
        from public.user_entries e
        where e.user_id = v_uid
          and e.media_item_id = m.id
          and not (v_include_backlog and e.status = 'backlog')
      )
      and not exists (
        select 1
        from public.ranking_entries r
        where r.user_id = v_uid
          and r.media_item_id = m.id
      )
      and (v_genres is null
           or coalesce(g.genres, md.genres, td.genres, '{}'::text[]) && v_genres)
      and (v_exclude_genres is null
           or not (coalesce(g.genres, md.genres, td.genres, '{}'::text[]) && v_exclude_genres))
      and (p_max_minutes is null
           or (case m.medium
                 when 'game' then round(g.time_to_beat_normally_seconds / 60.0)::integer
                 when 'movie' then md.runtime_minutes
                 when 'tv' then td.episode_runtime_minutes
               end) <= p_max_minutes)
      and (v_platforms is null
           or coalesce(g.platforms, '{}'::text[]) && v_platforms)
      and (v_providers is null
           or exists (
             select 1
             from public.watch_availability w
             where w.media_item_id = m.id
               and w.region = v_region
               and w.offer_type in ('flatrate', 'free', 'ads')
               and w.removed_at is null
               and w.provider_id = any (v_providers)
           ))
    order by
      coalesce(
        ip.prior_score,
        (select e.score from public.recommendation_external_scores e where e.media_item_id = m.id),
        6.5
      ) desc,
      m.id
    limit 500
  ) c;

  if v_pool is null then
    return;
  end if;

  return query
  select
    m.id,
    m.title,
    m.year,
    m.cover_image_id,
    coalesce(g.genres, md.genres, td.genres, '{}'::text[]),
    case m.medium
      when 'game' then round(g.time_to_beat_normally_seconds / 60.0)::integer
      when 'movie' then md.runtime_minutes
      when 'tv' then td.episode_runtime_minutes
    end,
    s.prior_score,
    s.content_score,
    s.predicted_score,
    s.confidence,
    s.why
  from public.recommendation_scores(v_uid, p_medium, v_pool, null) s
  join public.media_items m on m.id = s.media_item_id
  left join public.game_details g on g.media_item_id = m.id
  left join public.movie_details md on md.media_item_id = m.id
  left join public.tv_details td on td.media_item_id = m.id
  order by s.predicted_score desc, s.prior_score desc, m.id
  limit v_limit;
end;
$$;

comment on function public.suggestion_candidates(public.medium, text[], text[], integer, text[], integer[], text, boolean, integer) is
  'The caller''s suggestion candidates in one medium: unseen items passing every filter, the 500 best by prior scored against the caller''s own list, best p_limit (1 to 50) by predicted score. Security definer bound to auth.uid(); the caller cannot name another user.';

revoke all on function public.suggestion_candidates(public.medium, text[], text[], integer, text[], integer[], text, boolean, integer) from public, anon;
grant execute on function public.suggestion_candidates(public.medium, text[], text[], integer, text[], integer[], text, boolean, integer) to authenticated, service_role;

-- ==============================================================================
-- 7. The leave-one-out harness, internal
-- ==============================================================================

-- 7a. ranking_tier_for_score ----------------------------------------------------
-- The tier a 0 to 10 score reads as. The bands leave gaps (8.4 to 8.5, 6.4 to
-- 6.5, 3.9 to 4) that a list score never falls in but a prediction can, so the
-- cut points are the middle of each gap. Every score a list produces has one
-- decimal and lands in its own band, so the map is exact on true scores.

create or replace function public.ranking_tier_for_score(p_score numeric)
returns public.tier
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  select case
    when p_score is null then null
    when p_score >= 8.45 then 'loved'
    when p_score >= 6.45 then 'liked'
    when p_score >= 3.95 then 'fine'
    else 'disliked'
  end::public.tier;
$$;

comment on function public.ranking_tier_for_score(numeric) is
  'Internal. The tier a 0 to 10 score reads as, cutting in the middle of the gaps between the bands.';

-- 7b. recommendation_loo --------------------------------------------------------
-- For each of the user's ranked items in the medium: its true score and tier
-- (from the full list), and what recommendation_scores predicts for it with
-- the item held out, beside the two baselines the prediction has to beat:
--
--   the user's mean     mu of the list without the item
--   the item's prior    m_x without the user's own ranking of it
--
-- Absolute errors throughout; the summary averages them. content_score and its
-- error are reported beside the blend, since the blend is what the user sees
-- and the content score alone is what layer 1 adds.

create or replace function public.recommendation_loo(
  p_user_id uuid,
  p_medium public.medium
)
returns table (
  media_item_id uuid,
  true_score numeric,
  true_tier public.tier,
  predicted_score numeric,
  predicted_tier public.tier,
  abs_error numeric,
  content_score numeric,
  content_abs_error numeric,
  mean_baseline numeric,
  mean_abs_error numeric,
  prior_baseline numeric,
  prior_abs_error numeric,
  confidence text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    t.media_item_id,
    t.score,
    t.tier,
    s.predicted_score,
    public.ranking_tier_for_score(s.predicted_score),
    abs(s.predicted_score - t.score),
    s.content_score,
    abs(s.content_score - t.score),
    round(mb.mean, 2),
    abs(round(mb.mean, 2) - t.score),
    s.prior_score,
    abs(s.prior_score - t.score),
    s.confidence
  from public.recommendation_user_scores(p_user_id, p_medium, null) t
  cross join lateral public.recommendation_scores(
    p_user_id, p_medium, array[t.media_item_id], t.media_item_id
  ) s
  cross join lateral (
    -- mu without the item
    select avg(o.score) as mean
    from public.recommendation_user_scores(p_user_id, p_medium, t.media_item_id) o
  ) mb
  order by t.score desc, t.media_item_id;
$$;

comment on function public.recommendation_loo(uuid, public.medium) is
  'Internal, service role only. Leave-one-out over one user''s list in one medium: each item''s true score and tier, the prediction with the item held out, and the user-mean and item-prior baselines, with absolute errors.';

-- 7c. recommendation_loo_summary ------------------------------------------------
-- One row per call: n, the mean absolute errors of the prediction, of the
-- content score alone, and of the two baselines; tier accuracy (the share of
-- items whose predicted tier is their true tier); and Spearman's rho between
-- predicted and true scores. Spearman is Pearson's corr() over ranks, with tied
-- values given the mean of the ranks they span (rank() plus half the extra
-- ties), which is the textbook treatment of ties. Null when there are fewer
-- than two items or every prediction is the same.
--
-- To run the harness for every user of a medium, as the service role (the SQL
-- editor, or psql with the service role), refresh the priors first so the
-- leave-one-out prior is exact, then:
--
--   select public.refresh_item_priors('game');
--
--   select u.user_id, s.*
--   from (
--     select distinct r.user_id
--     from public.ranking_entries r
--     where r.medium = 'game'
--   ) u
--   cross join lateral public.recommendation_loo_summary(u.user_id, 'game') s
--   order by s.n desc;
--
-- and for one number across users, weight each user's errors by their n:
--
--   select sum(s.n) as n,
--          round(sum(s.n * s.mae_predicted) / sum(s.n), 3) as mae_predicted,
--          round(sum(s.n * s.mae_user_mean) / sum(s.n), 3) as mae_user_mean,
--          round(sum(s.n * s.mae_prior) / sum(s.n), 3) as mae_prior
--   from (select distinct r.user_id from public.ranking_entries r where r.medium = 'game') u
--   cross join lateral public.recommendation_loo_summary(u.user_id, 'game') s
--   where s.n >= 5;

create or replace function public.recommendation_loo_summary(
  p_user_id uuid,
  p_medium public.medium
)
returns table (
  n integer,
  mae_predicted numeric,
  mae_content numeric,
  mae_user_mean numeric,
  mae_prior numeric,
  tier_accuracy numeric,
  spearman numeric
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with loo as (
    select l.*
    from public.recommendation_loo(p_user_id, p_medium) l
  ),
  ranked as (
    select
      l.*,
      -- average ranks: rank() + (ties - 1) / 2
      rank() over (order by l.predicted_score)
        + (count(*) over (partition by l.predicted_score) - 1) / 2.0 as r_predicted,
      rank() over (order by l.true_score)
        + (count(*) over (partition by l.true_score) - 1) / 2.0 as r_true
    from loo l
  )
  select
    count(*)::integer,
    round(avg(r.abs_error), 3),
    round(avg(r.content_abs_error), 3),
    round(avg(r.mean_abs_error), 3),
    round(avg(r.prior_abs_error), 3),
    round(avg(case when r.predicted_tier = r.true_tier then 1.0 else 0.0 end), 3),
    -- Spearman's rho = corr(rank of predicted, rank of true)
    round(corr(r.r_predicted::float8, r.r_true::float8)::numeric, 3)
  from ranked r;
$$;

comment on function public.recommendation_loo_summary(uuid, public.medium) is
  'Internal, service role only. The leave-one-out summary for one user and medium: n, mean absolute errors of the prediction, the content score, the user-mean baseline and the prior baseline, tier accuracy, and Spearman''s rho between predicted and true scores.';

revoke all on function public.ranking_tier_for_score(numeric) from public, anon, authenticated;
revoke all on function public.recommendation_loo(uuid, public.medium) from public, anon, authenticated;
revoke all on function public.recommendation_loo_summary(uuid, public.medium) from public, anon, authenticated;

grant execute on function public.ranking_tier_for_score(numeric) to service_role;
grant execute on function public.recommendation_loo(uuid, public.medium) to service_role;
grant execute on function public.recommendation_loo_summary(uuid, public.medium) to service_role;

-- ==============================================================================
-- 8. The nightly refresh, at 03:30 UTC
-- ==============================================================================
--
-- Guarded the way the player-count poll is, because this file has to apply on
-- the hosted project with pg_cron on, on one where Rafa has not enabled it, and
-- on a local stack and in CI, which have neither:
--
--   * no `create extension`: enabling pg_cron is a project-level decision, and
--     20260916084800_player_counts.sql's header says how.
--   * `execute`, so a database without the extension never has to resolve
--     cron.schedule at all.
--   * no pg_net and no Vault: the job is one SQL statement inside the database,
--     so there is no URL or key to keep anywhere.
--
-- `cron.schedule` upserts by job name, so re-running this block after enabling
-- pg_cron replaces the job rather than adding a second one. The job runs as the
-- role that scheduled it (the migration owner), which reads every list, which
-- is what the refresh needs. The catalog and score mirrors run between 09:00
-- and 14:00 UTC (.github/workflows), so at 03:30 the prior sees all of the
-- previous day's external scores.

do $migration$
declare
  v_has_cron boolean := exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'cron' and p.proname = 'schedule'
  );
begin
  if not v_has_cron then
    raise notice
      'recommendation_foundations: pg_cron is not installed, so the nightly refresh_item_priors was not scheduled. Enable pg_cron and re-run this block.';
    return;
  end if;

  execute 'select cron.schedule($1, $2, $3)'
    using 'refresh-item-priors', '30 3 * * *', 'select public.refresh_item_priors();';

  raise notice 'recommendation_foundations: scheduled refresh-item-priors daily at 03:30 UTC.';
end;
$migration$;
