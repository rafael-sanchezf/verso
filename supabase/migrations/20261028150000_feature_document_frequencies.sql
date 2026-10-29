-- The content profile's document frequencies, counted nightly instead of on
-- every call (VER-220, 2026-10-28).
--
-- After #120 (20261014120000_candidate_pool_vote_floor.sql) bounded the ask's
-- candidate pool, the one read of a whole medium left in a call is the content
-- profile's idf: recommendation_feature_idf counted, for every feature of the
-- caller's profile, the items of the medium carrying it, and the items of the
-- medium, by scanning the medium's details tables on every call. Warm, that
-- was most of an ask on #120's bench (about 150 ms for films and 350 to 430 ms
-- for games, on 40,000 films and 70,000 games); cold, it is a read of the
-- medium from disk, the likeliest cause left of the timeout #120's 15-second
-- statement_timeout guards against. The counts change only when a mirror run
-- changes the catalog (weekly, decision 40), so they are counted once a night
-- instead, beside item_prior, and the profile reads them back by primary key.
--
-- What it adds, in file order:
--
--   1. feature_document_frequencies: per medium and feature, how many catalog
--      items carry it, and the medium's item count it divides. Catalog-like,
--      secured the way item_prior is.
--   2. refresh_feature_document_frequencies(medium): rebuilds it, service role
--      only.
--   3. recommendation_feature_idf: same signature, same columns, same numbers;
--      it reads the table, and counts live only what the table lacks.
--   4. The pg_cron schedule, at 03:40 UTC, ten minutes after
--      refresh-item-priors, guarded the way the foundations' section 8 is.
--
-- recommendation_content_profile itself is unchanged: it reaches the counts
-- only through recommendation_feature_idf, and so does everything above it
-- (recommendation_scores, suggestion_candidates, deck_candidates,
-- movie_home_rows, batch_predictions, insertion_predictions).
--
-- ## The numbers do not change
--
-- A stored count is the live count as of the refresh: the same
-- recommendation_item_features over the whole medium, the same count of the
-- medium's media_items for N, and the same ln(N::numeric / n_f) on the same
-- integer operands, so the idf is the same numeric digit for digit, and so is
-- every profile weight and score built on it. What moves is when it is
-- counted: a mirror run that adds or changes items is seen by the profile
-- after the next refresh, the lag item_prior already has.
--
-- ## Before the first refresh, and a feature the table does not have
--
-- A feature asked about that the table has no row for is counted live, exactly
-- as before, with the live N. Before the first refresh that is every feature,
-- so an empty table gives the profile it always gave, never an empty one and
-- never a division by zero. After it, it is a feature a mirror run gave a
-- second item since last night: rare, and right rather than missing.
--
-- ## Only features on two or more items are stored
--
-- A feature enters a profile only when it is on two or more of the user's own
-- items (recommendation_content_profile), and those are items of the medium,
-- so a feature carried by one item of the whole medium is never asked about.
-- The refresh leaves those out (most directors, many developers), which keeps
-- the table to the features a profile can use.
--
-- ## A job of its own
--
-- A second job rather than a second statement in refresh-item-priors, so a
-- failure in one leaves the other's night intact. Neither reads the other's
-- table, so the order does not matter; 03:40 is after the priors and before
-- the mirrors (09:00 to 14:00 UTC, .github/workflows).

-- ==============================================================================
-- 1. feature_document_frequencies
-- ==============================================================================
--
-- One row per medium and feature on two or more catalog items of the medium:
--
--   item_count         n_f, the items of the medium carrying the feature
--   medium_item_count  N, the items of the medium, the same on every row of
--                      one refresh of one medium
--
-- so idf(f) = ln(N / n_f) is read off one row. Catalog-like, shaped and
-- secured the way item_prior is: written by the service role through the
-- refresh, readable by every signed-in user, and `anon` keeps SELECT with no
-- policy so a signed-out read is empty rather than an error. The counts are
-- aggregates over the catalog and name nobody.

create table public.feature_document_frequencies (
  medium public.medium not null,
  feature text not null,
  item_count integer not null
    constraint feature_document_frequencies_item_count_check check (item_count >= 2),
  medium_item_count integer not null,
  computed_at timestamptz not null default now(),
  primary key (medium, feature),
  constraint feature_document_frequencies_medium_item_count_check check (medium_item_count >= item_count)
);

comment on table public.feature_document_frequencies is
  'The content profile''s document frequencies (layer 1 of docs/design/recommendation-engine.md): per medium, every feature on two or more catalog items, with how many carry it and how many items the medium has. Rebuilt nightly by refresh_feature_document_frequencies as the service role; readable by every signed-in user.';
comment on column public.feature_document_frequencies.medium is 'The medium the counts are over.';
comment on column public.feature_document_frequencies.feature is 'The feature as kind:value, as recommendation_feature_rows writes it.';
comment on column public.feature_document_frequencies.item_count is 'n_f: how many catalog items of the medium carry the feature, two or more.';
comment on column public.feature_document_frequencies.medium_item_count is 'N: how many catalog items the medium had at the refresh. idf = ln(N / n_f).';
comment on column public.feature_document_frequencies.computed_at is 'When the refresh that wrote this row ran.';

alter table public.feature_document_frequencies enable row level security;

create policy "document frequencies are readable by signed-in users" on public.feature_document_frequencies
  for select to authenticated using (true);

revoke all on public.feature_document_frequencies from anon, authenticated;
grant select on public.feature_document_frequencies to anon, authenticated;

-- ==============================================================================
-- 2. refresh_feature_document_frequencies
-- ==============================================================================
--
-- Rebuilds one medium's rows, or every medium's when p_medium is null: the
-- medium's rows are deleted and written again in one transaction, so a reader
-- sees last night's counts until it commits and tonight's after, never a
-- medium half done. A delete rather than an upsert because a feature can
-- leave (a mirror run that changes an item can take a feature to one item).
-- Counted by recommendation_item_features over the whole medium, the one
-- definition of a feature, so the stored count is the live one.
--
-- Security invoker, granted to the service role only, like
-- refresh_item_priors; pg_cron runs it as the migration owner. Returns the
-- number of rows written.

create or replace function public.refresh_feature_document_frequencies(p_medium public.medium default null)
returns integer
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
declare
  v_medium public.medium;
  v_items integer;
  v_rows integer;
  v_total integer := 0;
begin
  foreach v_medium in array
    case when p_medium is null then enum_range(null::public.medium) else array[p_medium] end
  loop
    delete from public.feature_document_frequencies d
    where d.medium = v_medium;

    -- N
    select count(*)::integer into v_items
    from public.media_items m
    where m.medium = v_medium;

    insert into public.feature_document_frequencies (medium, feature, item_count, medium_item_count, computed_at)
    select v_medium, f.feature, count(*)::integer, v_items, now()
    from public.recommendation_item_features(v_medium, null, null) f
    group by f.feature
    -- a feature on one item can never be on two of a user's
    having count(*) >= 2;

    get diagnostics v_rows = row_count;
    v_total := v_total + v_rows;
  end loop;

  return v_total;
end;
$$;

comment on function public.refresh_feature_document_frequencies(public.medium) is
  'Rebuild feature_document_frequencies for one medium, or all three when null. Service role only; scheduled nightly at 03:40 UTC. Returns the rows written.';

revoke all on function public.refresh_feature_document_frequencies(public.medium) from public, anon, authenticated;
grant execute on function public.refresh_feature_document_frequencies(public.medium) to service_role;

-- ==============================================================================
-- 3. recommendation_feature_idf, from the table
-- ==============================================================================
--
-- Same signature and columns as 20260924120000_recommendation_foundations.sql,
-- section 5c, which no later migration redefined:
--
--   idf(f) = ln(items in the medium / items with the feature)
--
-- for the features asked about. The stored ones come from the table by
-- primary key. The rest (every feature before the first refresh) are counted
-- live by the foundations' query, unchanged, narrowed to them; when there is
-- no rest, nothing reads the medium at all. It is plpgsql so the live part is
-- skipped by an `if` rather than left to the planner, since
-- recommendation_item_features handed an empty list can still scan the
-- medium.
--
-- Its grants (service role only) carry over from the foundations through the
-- replace and are restated below.

create or replace function public.recommendation_feature_idf(
  p_medium public.medium,
  p_features text[]
)
returns table (
  feature text,
  item_count integer,
  idf numeric
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_features text[] := coalesce(p_features, '{}');
  v_missing text[];
begin
  -- idf(f) = ln(N / n_f), both from the last refresh
  return query
  select d.feature, d.item_count, ln(d.medium_item_count::numeric / d.item_count)
  from public.feature_document_frequencies d
  where d.medium = p_medium
    and d.feature = any (v_features);

  -- the features the last refresh did not store
  select coalesce(array_agg(distinct a.f), '{}')
  into v_missing
  from unnest(v_features) as a (f)
  where not exists (
    select 1
    from public.feature_document_frequencies d
    where d.medium = p_medium
      and d.feature = a.f
  );

  if cardinality(v_missing) = 0 then
    return;
  end if;

  -- counted live, as the foundations count them
  return query
  with catalog as (
    select count(*)::numeric as n
    from public.media_items m
    where m.medium = p_medium
  ),
  df as (
    select f.feature, count(*)::integer as k
    from public.recommendation_item_features(p_medium, null, v_missing) f
    group by f.feature
  )
  -- idf(f) = ln(N / n_f)
  select df.feature, df.k, ln(c.n / df.k)
  from df
  cross join catalog c;
end;
$$;

comment on function public.recommendation_feature_idf(public.medium, text[]) is
  'Internal. For each feature asked about: how many catalog items of the medium carry it, and idf = ln(items in the medium / items with the feature). Read from feature_document_frequencies (last night''s refresh); a feature it has no row for is counted live.';

revoke all on function public.recommendation_feature_idf(public.medium, text[]) from public, anon, authenticated;
grant execute on function public.recommendation_feature_idf(public.medium, text[]) to service_role;

-- ==============================================================================
-- 4. The nightly refresh, at 03:40 UTC
-- ==============================================================================
--
-- Guarded exactly as 20260924120000_recommendation_foundations.sql section 8
-- guards refresh-item-priors, for the same three kinds of database (the hosted
-- project with pg_cron, one without it, a local stack and CI): no `create
-- extension`, `execute` so a database without pg_cron never resolves
-- cron.schedule, and one SQL statement as the job, so there is no URL or key
-- to keep. `cron.schedule` upserts by job name, so re-running this block
-- after enabling pg_cron replaces the job rather than adding a second.

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
      'feature_document_frequencies: pg_cron is not installed, so the nightly refresh_feature_document_frequencies was not scheduled. Enable pg_cron and re-run this block.';
    return;
  end if;

  execute 'select cron.schedule($1, $2, $3)'
    using 'refresh-feature-document-frequencies', '40 3 * * *', 'select public.refresh_feature_document_frequencies();';

  raise notice 'feature_document_frequencies: scheduled refresh-feature-document-frequencies daily at 03:40 UTC.';
end;
$migration$;
