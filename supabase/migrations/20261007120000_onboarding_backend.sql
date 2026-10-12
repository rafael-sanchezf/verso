-- The onboarding backend: what the bulk-entry screens read and write.
-- ROADMAP.md work queue item 36 (the data half) and the funnel events of wave
-- A; docs/private/design/bulk-entry-build.md, PR 3. The screens that call this are
-- specified in docs/design/specs/onboarding.md and batch-session.md; the
-- engine that drives them is packages/core (batch.ts, platforms.ts, deck.ts,
-- PR #72).
--
-- What it adds, in file order:
--
--   1. profiles.platforms and profiles.media: where the user plays (decision
--      20, as IGDB names from expandPlatforms in packages/core) and which media
--      they track (decision 25, the questionnaire). media is null until the
--      questionnaire is answered, which is how the app tells a new user; every
--      existing profile with entries or rankings is backfilled from them, so a
--      returning user is not sent through it.
--   2. ranking_entries.placed_by, 'user' or 'prior': the provisional mark of
--      the batch session (docs/design/ranking-algorithm.md, "The batch
--      session"). insert_ranking_entry and finish_insertion take it as an
--      optional last argument, default 'user'; move_ranking_entry resets the
--      moved row to 'user'; tier_list returns it.
--   3. events: the funnel (first_session, ten_ranked, first_pick, app_open and
--      the day-7 return read from it) and media_interest ("Notify me when
--      available"). Owner insert and read only, never updated or deleted.
--   4. deck_candidates: the deck page's pool, popular games on the caller's
--      platforms that they have neither tracked nor ranked, with the
--      popularity rank and the content-profile boost orderDeck reads.
--   5. batch_predictions: the engine's guess for each game of a batch, from
--      recommendation_scores for the caller alone.
--   6. played_not_ranked: the drain, the caller's played entries with no
--      ranking row.
--
-- ## Why two of these are security definer
--
-- deck_candidates and batch_predictions read the content model, which
-- 20260924120000_recommendation_foundations.sql closes to every role but the
-- service role, because each of its functions takes a user id (see that file's
-- header on grants). Both are therefore security definer, the way
-- suggestion_candidates is: a pinned search_path, their own auth.uid() check
-- (28000 when there is no user), and auth.uid() passed to the internal
-- functions, never an argument. The caller cannot name a user. Row Level
-- Security does not apply inside them, so every read of a user table is
-- filtered by the captured id by hand. Everything else here is security
-- invoker on auth.uid(), so the owner-only policies decide the rows.
--
-- ## Signatures that change
--
-- insert_ranking_entry and finish_insertion gain a parameter. `create or
-- replace` with a new parameter list makes an overload rather than replacing
-- the function, and PostgREST cannot choose between two candidates that both
-- accept the same named arguments, so both are dropped and created, and their
-- grants are written again. tier_list gains a column, which `create or
-- replace` cannot do to a `returns table`, so it is dropped and created as
-- 20261007100000_drop_ownership.sql did. The drops take the grants and the
-- pinned search_path with them; both are restated below and asserted in
-- supabase/tests/onboarding_backend.test.sql (item 17's lesson). Every caller
-- that omits the new argument makes the call it always made.
--
-- Errors raised here use the SQLSTATEs the earlier files use, following the
-- legend in 20260915130000_ranking_functions.sql:
--   28000  no authenticated user
--   22023  a bad argument: no medium, an unknown placed_by, a negative offset,
--          too many items, or (from the ranking functions, as before) an
--          unknown media item or one of another medium
--   23505  the item is already ranked
--   P0002  the item is not ranked (move)

-- ==============================================================================
-- 1. profiles.platforms and profiles.media
-- ==============================================================================
--
-- On profiles because both are facts about the person rather than about one
-- game, and the profile row exists for every account from its first second
-- (handle_new_user). The owner already updates their own row through the
-- existing policy, so no new policy is needed; the profiles suite proves that
-- policy.
--
-- profiles is readable by every signed-in user (the social layer reads
-- usernames), so these two columns are as visible as a username. Where a person
-- plays and which media they track are the kind of fact a public profile
-- shows; if that changes, the columns move to an owner-only table.
--
-- platforms are IGDB names, spelled as game_details.platforms spells them,
-- because deck_candidates filters with `&&` against that column. The picker's
-- families and the backward-compatibility folds live in packages/core
-- (expandPlatforms); the database stores the result and does not reinterpret
-- it. Empty means "not answered, or skipped", and the deck then reads the
-- whole catalog ("Popular everywhere").
--
-- media is null until the questionnaire is answered: the app's gate sends a
-- user with no media to the first onboarding screen. An answer is never empty,
-- because the questionnaire has no skip and needs a live medium to continue.

alter table public.profiles
  add column platforms text[] not null default '{}'
    constraint profiles_platforms_check check (
      array_position(platforms, null) is null
      and '' <> all (platforms)
      and cardinality(platforms) <= 100
    ),
  add column media public.medium[]
    constraint profiles_media_check check (
      media is null
      or (cardinality(media) >= 1 and array_position(media, null) is null)
    );

comment on column public.profiles.platforms is
  'Where the user plays or has played, as IGDB platform names spelled like game_details.platforms, with the backward-compatibility folds of packages/core expandPlatforms already applied. Empty means not answered or skipped. deck_candidates filters on it.';
comment on column public.profiles.media is
  'The media the user chose to track in the onboarding questionnaire (decision 25). Null until answered, which is how the app tells a new user; never empty once answered.';

-- The backfill. A profile that already has entries or rankings belongs to
-- someone who has been using the app, and the questionnaire would ask them a
-- question their list already answers (and its seed step would try to rank
-- games they have ranked). They get the media their rows are in, in the
-- enum's order. A profile with nothing stays null and sees the questionnaire.

update public.profiles p
set media = array(
  select distinct x.medium
  from (
    select e.medium from public.user_entries e where e.user_id = p.id
    union
    select r.medium from public.ranking_entries r where r.user_id = p.id
  ) x
  order by x.medium
)
where p.media is null
  and (
    exists (select 1 from public.user_entries e where e.user_id = p.id)
    or exists (select 1 from public.ranking_entries r where r.user_id = p.id)
  );

-- ==============================================================================
-- 2. The provisional mark: ranking_entries.placed_by
-- ==============================================================================
--
-- 'user' when the user's answers (or a drag, or the single-game log flow) put
-- the game where it is; 'prior' when the batch session's "Place the rest for
-- me" left it at the engine's guess. Every row placed before today was placed
-- by the user, which is the default. No comparison is ever invented for a
-- 'prior' row: the log holds only answers, and the mark is how a later reader
-- knows the difference (the review's ≈, and the pivot preference that retires
-- the marks through ordinary use).

alter table public.ranking_entries
  add column placed_by text not null default 'user'
    constraint ranking_entries_placed_by_check check (placed_by in ('user', 'prior'));

comment on column public.ranking_entries.placed_by is
  'Who decided this place: user (answers, a drag, the log flow) or prior (the batch session placed it at the engine''s guess when the user stopped). Written by insert_ranking_entry and finish_insertion; move_ranking_entry resets the moved row to user. The position shifts a neighbour causes never change it.';

-- 2a. insert_ranking_entry ------------------------------------------------------
-- The body of 20260916140000_ranking_placed_at.sql plus the mark. A null
-- p_placed_by is 'user', the way a null position appends.

drop function if exists public.finish_insertion(uuid, public.medium, public.tier, integer, jsonb);
drop function if exists public.insert_ranking_entry(uuid, public.medium, public.tier, integer);

create function public.insert_ranking_entry(
  p_media_item_id uuid,
  p_medium public.medium,
  p_tier public.tier,
  p_position integer,
  p_placed_by text default 'user'
)
returns integer
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_placed_by text := coalesce(p_placed_by, 'user');
  v_catalog_medium public.medium;
  v_count integer;
  v_position integer;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'insert_ranking_entry requires an authenticated user';
  end if;

  if v_placed_by not in ('user', 'prior') then
    raise exception using
      errcode = '22023',
      message = format('p_placed_by must be user or prior, not %s', v_placed_by);
  end if;

  select m.medium into v_catalog_medium
  from public.media_items m
  where m.id = p_media_item_id;

  if v_catalog_medium is null then
    raise exception using
      errcode = '22023',
      message = format('no media item %s in the catalog', p_media_item_id);
  end if;

  if v_catalog_medium <> p_medium then
    raise exception using
      errcode = '22023',
      message = format('media item %s is a %s, not a %s', p_media_item_id, v_catalog_medium, p_medium);
  end if;

  if exists (
    select 1 from public.ranking_entries r
    where r.user_id = v_uid and r.media_item_id = p_media_item_id
  ) then
    raise exception using
      errcode = '23505',
      message = format('media item %s is already ranked; use move_ranking_entry to change its place', p_media_item_id);
  end if;

  select count(*) into v_count
  from public.ranking_entries r
  where r.user_id = v_uid and r.medium = p_medium and r.tier = p_tier;

  v_position := least(greatest(coalesce(p_position, v_count), 0), v_count);

  -- The shift. These rows are being moved out of the way, not placed, so
  -- neither placed_at nor placed_by is in the set list.
  update public.ranking_entries r
  set position = r.position + 1,
      updated_at = now()
  where r.user_id = v_uid
    and r.medium = p_medium
    and r.tier = p_tier
    and r.position >= v_position;

  insert into public.ranking_entries (user_id, medium, tier, media_item_id, position, placed_at, placed_by)
  values (v_uid, p_medium, p_tier, p_media_item_id, v_position, now(), v_placed_by);

  return v_position;
end;
$$;

comment on function public.insert_ranking_entry(uuid, public.medium, public.tier, integer, text) is
  'Insert a ranked item at a position in the caller''s tier, shifting later items down, stamping placed_at and recording placed_by (user or prior, default user) on the new row only. Returns the position used.';

-- 2b. finish_insertion ----------------------------------------------------------
-- The body of 20260915130000_ranking_functions.sql plus the mark, which it
-- checks before writing the log so a bad mark refuses the call before any row
-- is written, and then passes to insert_ranking_entry. A batch session writes
-- one call per game: the game's own answers and, when the user stopped before
-- its place was fixed, 'prior'.

create function public.finish_insertion(
  p_media_item_id uuid,
  p_medium public.medium,
  p_tier public.tier,
  p_position integer,
  p_comparisons jsonb,
  p_placed_by text default 'user'
)
returns integer
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_comparisons jsonb := coalesce(p_comparisons, '[]'::jsonb);
  v_placed_by text := coalesce(p_placed_by, 'user');
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'finish_insertion requires an authenticated user';
  end if;

  if jsonb_typeof(v_comparisons) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'p_comparisons must be a JSON array of comparison objects';
  end if;

  if v_placed_by not in ('user', 'prior') then
    raise exception using
      errcode = '22023',
      message = format('p_placed_by must be user or prior, not %s', v_placed_by);
  end if;

  insert into public.comparisons (user_id, medium, item_a, item_b, outcome, context)
  select
    v_uid,
    p_medium,
    (c ->> 'item_a')::uuid,
    (c ->> 'item_b')::uuid,
    (c ->> 'outcome')::public.comparison_outcome,
    coalesce(c -> 'context', '{}'::jsonb)
  from jsonb_array_elements(v_comparisons) as c;

  return public.insert_ranking_entry(p_media_item_id, p_medium, p_tier, p_position, v_placed_by);
end;
$$;

comment on function public.finish_insertion(uuid, public.medium, public.tier, integer, jsonb, text) is
  'Log the comparisons from one insertion and place the item with its placed_by (user or prior, default user), as a single transaction. The caller owns every row written.';

revoke all on function public.insert_ranking_entry(uuid, public.medium, public.tier, integer, text) from public, anon;
revoke all on function public.finish_insertion(uuid, public.medium, public.tier, integer, jsonb, text) from public, anon;
grant execute on function public.insert_ranking_entry(uuid, public.medium, public.tier, integer, text) to authenticated, service_role;
grant execute on function public.finish_insertion(uuid, public.medium, public.tier, integer, jsonb, text) to authenticated, service_role;

-- 2c. move_ranking_entry --------------------------------------------------------
-- The body of 20260915130000_ranking_functions.sql, with the moved row's mark
-- reset: a drag in the review, a nudge on the confirm step, or a change of
-- tier is the user deciding the place, so the row loses its ≈. The rows the
-- move shifts keep theirs, and placed_at is still untouched (a move is not a
-- placement; 20260916140000_ranking_placed_at.sql). The signature is the same,
-- so `create or replace` keeps the grants; they are restated anyway.

create or replace function public.move_ranking_entry(
  p_media_item_id uuid,
  p_tier public.tier,
  p_position integer
)
returns integer
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_medium public.medium;
  v_old_tier public.tier;
  v_old_position integer;
  v_count integer;
  v_position integer;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'move_ranking_entry requires an authenticated user';
  end if;

  select r.medium, r.tier, r.position
  into v_medium, v_old_tier, v_old_position
  from public.ranking_entries r
  where r.user_id = v_uid and r.media_item_id = p_media_item_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = format('media item %s is not ranked', p_media_item_id);
  end if;

  -- Close the gap the item leaves. It keeps its own position for now, which
  -- briefly duplicates a position; the deferred unique constraint allows that.
  update public.ranking_entries r
  set position = r.position - 1,
      updated_at = now()
  where r.user_id = v_uid
    and r.medium = v_medium
    and r.tier = v_old_tier
    and r.position > v_old_position
    and r.media_item_id <> p_media_item_id;

  select count(*) into v_count
  from public.ranking_entries r
  where r.user_id = v_uid
    and r.medium = v_medium
    and r.tier = p_tier
    and r.media_item_id <> p_media_item_id;

  v_position := least(greatest(coalesce(p_position, v_count), 0), v_count);

  -- Open the gap at the target.
  update public.ranking_entries r
  set position = r.position + 1,
      updated_at = now()
  where r.user_id = v_uid
    and r.medium = v_medium
    and r.tier = p_tier
    and r.position >= v_position
    and r.media_item_id <> p_media_item_id;

  update public.ranking_entries r
  set tier = p_tier,
      position = v_position,
      placed_by = 'user',
      updated_at = now()
  where r.user_id = v_uid and r.media_item_id = p_media_item_id;

  return v_position;
end;
$$;

comment on function public.move_ranking_entry(uuid, public.tier, integer) is
  'Move one of the caller''s ranked items to another tier or position, closing the old gap and opening a new one, and mark it placed_by user. Returns the position used.';

revoke all on function public.move_ranking_entry(uuid, public.tier, integer) from public, anon;
grant execute on function public.move_ranking_entry(uuid, public.tier, integer) to authenticated, service_role;

-- 2d. tier_list -----------------------------------------------------------------
-- The body of 20261007100000_drop_ownership.sql plus placed_by, last, so every
-- caller that reads the columns by name or by position is unaffected. The
-- batch session's review reads it for the ≈ on a provisional row, and a later
-- insertion's pivot choice reads it to prefer a provisional neighbour.

drop function if exists public.tier_list(public.medium, public.tier);

create function public.tier_list(
  p_medium public.medium,
  p_tier public.tier
)
returns table (
  media_item_id uuid,
  "position" integer,
  title text,
  year smallint,
  cover_image_id text,
  external_ids jsonb,
  genres text[],
  platforms text[],
  played_platforms text[],
  placed_by text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    r.media_item_id,
    r.position,
    m.title,
    m.year,
    m.cover_image_id,
    m.external_ids,
    coalesce(g.genres, '{}'::text[]),
    coalesce(g.platforms, '{}'::text[]),
    coalesce(e.played_platforms, '{}'::text[]),
    r.placed_by
  from public.ranking_entries r
  join public.media_items m on m.id = r.media_item_id
  left join public.game_details g on g.media_item_id = m.id
  left join public.user_entries e
    on e.user_id = r.user_id
   and e.media_item_id = r.media_item_id
  where r.user_id = auth.uid()
    and r.medium = p_medium
    and r.tier = p_tier
  order by r.position;
$$;

comment on function public.tier_list(public.medium, public.tier) is
  'The caller''s ranked items in one tier, best first, joined with catalog details. external_ids carries the Steam app id a cover falls back to; played_platforms is the caller''s own list from the entry, empty when nothing is recorded or the entry is gone; placed_by is user or prior, the provisional mark.';

revoke all on function public.tier_list(public.medium, public.tier) from public, anon;
grant execute on function public.tier_list(public.medium, public.tier) to authenticated, service_role;

-- ==============================================================================
-- 3. events: the funnel and the interest taps
-- ==============================================================================
--
-- One row per thing that happened, written by the app as the user: the funnel
-- of wave A (first_session at the questionnaire's Continue, ten_ranked when the
-- ranked count first reaches ten, first_pick with the finder, app_open once a
-- day, from which the day-7 return is read) and media_interest per held medium
-- ("Notify me when available", decision 27).
--
-- Minimal on purpose: a kind and a small JSON object. The kinds are not an
-- enumerated list in the database, so the next funnel step is an app change
-- and not a migration; the check keeps them to snake_case words so a typo is
-- at least a recognisable one, and @verso/api's EventKind is the list the app
-- may send. The payload is an object of at most 4 KB: an event names things,
-- it does not carry them.
--
-- Shaped and secured like suggestion_requests and prediction_log: RLS from
-- this first migration, the owner may insert and read their own rows, and
-- there is no update or delete policy and no update or delete grant, so an
-- attempt is a permission error rather than a silent no-op. The insert grant
-- is on kind and payload only: id, user_id and created_at come from their
-- defaults, so a client can neither backdate an event nor name another user,
-- and the policy's check refuses the latter a second time. The cascade from
-- auth.users is the only way a row leaves, which delete_my_account relies on.
-- No third party ever reads this table (decision 21, "never sold").

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null
    constraint events_kind_check check (kind ~ '^[a-z][a-z0-9_]{0,62}$'),
  payload jsonb not null default '{}'::jsonb
    constraint events_payload_check check (
      jsonb_typeof(payload) = 'object'
      and octet_length(payload::text) <= 4096
    ),
  created_at timestamptz not null default now()
);

comment on table public.events is
  'Product events the app logs as the user: the onboarding funnel (first_session, ten_ranked, first_pick, app_open) and media_interest. Owner insert and read only; never updated or deleted; never read by a third party.';
comment on column public.events.id is 'The event.';
comment on column public.events.user_id is 'Whose event. Defaults to auth.uid() and is not in the insert grant; the insert policy refuses anyone else.';
comment on column public.events.kind is 'What happened, a snake_case word: first_session, ten_ranked, first_pick, app_open, media_interest.';
comment on column public.events.payload is 'A small JSON object of facts about it, for example {"medium": "tv"} for media_interest. At most 4 KB.';
comment on column public.events.created_at is 'When it was logged. Not in the insert grant, so it is always the server''s clock.';

create index events_user_kind_created on public.events (user_id, kind, created_at desc);

alter table public.events enable row level security;

create policy "users read their own events" on public.events
  for select to authenticated using (auth.uid() = user_id);
create policy "users log their own events" on public.events
  for insert to authenticated with check (auth.uid() = user_id);

revoke all on public.events from anon, authenticated;
grant select on public.events to authenticated;
grant insert (kind, payload) on public.events to authenticated;

-- ==============================================================================
-- 4. deck_candidates: the deck page's pool
-- ==============================================================================
--
-- One page of the deck (specs/onboarding.md, "The deck page"): games on any of
-- p_platforms that the caller has no entry for (of any status) and has not
-- ranked, by popularity, p_limit at a time from p_offset. A null or empty
-- p_platforms is no filter, the "Popular everywhere" deck of a user who
-- skipped the platforms step.
--
-- Popularity is today's popular_games signal, IGDB's rating count, compared
-- as numeric with the id as a tie-break so a page never reshuffles between
-- calls (the reasoning is in 20260916160000_popular_games.sql); publishers'
-- sales figures replace it later (decision 20). The partial index that serves
-- popular_games serves this ordering too, so the planner walks it in order and
-- stops once a page is filled. popularity_rank is the row's 1-based place in
-- that order across pages (p_offset + 1 is the first row of a page), so a
-- page's ranks continue the previous page's.
--
-- boost is the sum of the weights of the caller's content profile
-- (recommendation_content_profile, layer 1 of the engine) over the features
-- the candidate carries: a positive weight raises it and a negative one lowers
-- it, so a disliked genre counts against. 0 when there is no profile, which is
-- every user with fewer than two ranked games (a profile needs a feature on
-- two of them), and the profile is not computed at all for them. The client
-- orders the page with orderDeck({ popularityRank, boost }) from
-- packages/core, which keeps the three most popular at the top of page one;
-- nothing here reorders by the boost.
--
-- Security definer for the reason in the header: the profile is service role
-- only. Clamps the limit to 1..50 (default 10) like popular_games; a negative
-- offset is 22023, because it can only be a bug.

create function public.deck_candidates(
  p_platforms text[] default null,
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  media_item_id uuid,
  title text,
  year smallint,
  cover_image_id text,
  external_ids jsonb,
  genres text[],
  platforms text[],
  popularity_rank integer,
  boost numeric
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_offset integer := coalesce(p_offset, 0);
  v_platforms text[] := case when cardinality(p_platforms) > 0 then p_platforms end;
  v_features text[] := '{}';
  v_weights numeric[] := '{}';
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'deck_candidates requires an authenticated user';
  end if;

  if v_offset < 0 then
    raise exception using
      errcode = '22023',
      message = format('p_offset must be 0 or more, not %s', v_offset);
  end if;

  -- The caller's profile, only when it can exist: a feature counts once it is
  -- on two of the user's ranked games, so fewer than two means no profile and
  -- no reason to pay for the document frequencies.
  if (
    select count(*) >= 2
    from public.ranking_entries r
    where r.user_id = v_uid and r.medium = 'game'
  ) then
    select coalesce(array_agg(p.feature), '{}'), coalesce(array_agg(p.weight), '{}')
    into v_features, v_weights
    from public.recommendation_content_profile(v_uid, 'game') p;
  end if;

  return query
  with page as (
    -- Row Level Security does not apply in a definer function: the caller's
    -- entries and rankings are filtered by v_uid by hand.
    select
      m.id,
      m.title,
      m.year,
      m.cover_image_id,
      m.external_ids,
      coalesce(g.genres, '{}'::text[]) as genres,
      coalesce(g.platforms, '{}'::text[]) as platforms,
      nullif(m.metadata ->> 'total_rating_count', '')::numeric as rating_count
    from public.media_items m
    left join public.game_details g on g.media_item_id = m.id
    where m.medium = 'game'
      and (v_platforms is null or coalesce(g.platforms, '{}'::text[]) && v_platforms)
      and not exists (
        select 1 from public.user_entries e
        where e.user_id = v_uid and e.media_item_id = m.id
      )
      and not exists (
        select 1 from public.ranking_entries r
        where r.user_id = v_uid and r.media_item_id = m.id
      )
    order by nullif(m.metadata ->> 'total_rating_count', '')::numeric desc nulls last, m.id
    limit v_limit
    offset v_offset
  ),
  boosts as (
    -- sum of the profile's weights over the candidate's features
    select f.media_item_id, sum(w.weight) as boost
    from public.recommendation_item_features(
      'game', (select coalesce(array_agg(p.id), '{}') from page p)
    ) f
    join unnest(v_features, v_weights) as w(feature, weight) on w.feature = f.feature
    group by f.media_item_id
  ),
  ranked as (
    select
      p.*,
      (v_offset + row_number() over (order by p.rating_count desc nulls last, p.id))::integer as popularity_rank
    from page p
  )
  select
    r.id,
    r.title,
    r.year,
    r.cover_image_id,
    r.external_ids,
    r.genres,
    r.platforms,
    r.popularity_rank,
    round(coalesce(b.boost, 0), 4)
  from ranked r
  left join boosts b on b.media_item_id = r.id
  order by r.popularity_rank;
end;
$$;

comment on function public.deck_candidates(text[], integer, integer) is
  'One page of the deck: games on any of p_platforms (none means every platform) the caller has neither tracked nor ranked, most popular first, p_limit (1 to 50, default 10) from p_offset, each with its 1-based popularity_rank and the caller''s content-profile boost (0 without a profile). Security definer bound to auth.uid().';

revoke all on function public.deck_candidates(text[], integer, integer) from public, anon;
grant execute on function public.deck_candidates(text[], integer, integer) to authenticated, service_role;

-- ==============================================================================
-- 5. batch_predictions: the engine's guess for a batch
-- ==============================================================================
--
-- The batch session starts each insertion from a predicted slot ("Estimate
-- first, then ask", docs/design/ranking-algorithm.md): this is the guess, for
-- the caller and the items given, from recommendation_scores (the community
-- prior blended with the caller's content profile, weighted by how much they
-- have ranked). predicted_score is on the caller's 0 to 10 scale and is never
-- null (the prior falls back to the external score, then 6.5); confidence is
-- needs_more_data below five ranked items, medium below fifteen, high from
-- fifteen.
--
-- The profile is the caller's ranked list as stored. The tiers the user just
-- tapped on the deck page are not in it until the session's writes land, so a
-- new user's guesses are the prior and the batch engine reads them inside the
-- tier the user chose.
--
-- Items of another medium and ids the catalog does not have are left out
-- rather than refused, so the caller treats a missing row as "no guess", which
-- the batch engine already handles. Rows come back in the order the ids were
-- given. More than 500 ids is 22023, the size of the candidate pool the
-- suggestion function scores at once.
--
-- Security definer for the reason in the header.

create function public.batch_predictions(
  p_medium public.medium,
  p_items uuid[]
)
returns table (
  media_item_id uuid,
  predicted_score numeric,
  confidence text
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'batch_predictions requires an authenticated user';
  end if;

  if p_medium is null then
    raise exception using
      errcode = '22023',
      message = 'batch_predictions needs a medium';
  end if;

  if cardinality(p_items) > 500 then
    raise exception using
      errcode = '22023',
      message = format('batch_predictions takes at most 500 items, not %s', cardinality(p_items));
  end if;

  if p_items is null or cardinality(p_items) = 0 then
    return;
  end if;

  return query
  select s.media_item_id, s.predicted_score, s.confidence
  from public.recommendation_scores(v_uid, p_medium, p_items, null) s
  order by array_position(p_items, s.media_item_id);
end;
$$;

comment on function public.batch_predictions(public.medium, uuid[]) is
  'The engine''s guess for each item of a batch, for the caller alone: predicted_score on the caller''s 0 to 10 scale and its confidence, from recommendation_scores. Unknown ids and items of another medium are left out; at most 500 ids. Security definer bound to auth.uid().';

revoke all on function public.batch_predictions(public.medium, uuid[]) from public, anon;
grant execute on function public.batch_predictions(public.medium, uuid[]) to authenticated, service_role;

-- ==============================================================================
-- 6. played_not_ranked: the drain
-- ==============================================================================
--
-- The caller's entries in one medium whose status is played and that have no
-- ranking row: the list both doors drain (decision 20) and the count on
-- Ranking's banner ("{n} played games to rank"). Newest first: the day it was
-- finished, most recent first, then when it was added, so a game marked played
-- today leads and a game with no finished date sits after every dated one.
--
-- Security invoker on auth.uid(): the owner-only policies on user_entries and
-- ranking_entries decide the rows, and the filter is written out as well, as
-- the ranking functions do.

create function public.played_not_ranked(p_medium public.medium)
returns table (
  media_item_id uuid,
  title text,
  year smallint,
  cover_image_id text,
  external_ids jsonb,
  genres text[],
  platforms text[],
  finished_at date,
  added_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'played_not_ranked requires an authenticated user';
  end if;

  if p_medium is null then
    raise exception using
      errcode = '22023',
      message = 'played_not_ranked needs a medium';
  end if;

  return query
  select
    e.media_item_id,
    m.title,
    m.year,
    m.cover_image_id,
    m.external_ids,
    coalesce(g.genres, md.genres, td.genres, '{}'::text[]),
    coalesce(g.platforms, '{}'::text[]),
    e.finished_at,
    e.added_at
  from public.user_entries e
  join public.media_items m on m.id = e.media_item_id
  left join public.game_details g on g.media_item_id = m.id
  left join public.movie_details md on md.media_item_id = m.id
  left join public.tv_details td on td.media_item_id = m.id
  where e.user_id = v_uid
    and e.medium = p_medium
    and e.status = 'played'
    and not exists (
      select 1 from public.ranking_entries r
      where r.user_id = v_uid and r.media_item_id = e.media_item_id
    )
  order by e.finished_at desc nulls last, e.added_at desc, e.media_item_id;
end;
$$;

comment on function public.played_not_ranked(public.medium) is
  'The caller''s played entries in one medium with no ranking row, newest first (finished date, then added), with the catalog columns a row draws. Security invoker on auth.uid().';

revoke all on function public.played_not_ranked(public.medium) from public, anon;
grant execute on function public.played_not_ranked(public.medium) to authenticated, service_role;
