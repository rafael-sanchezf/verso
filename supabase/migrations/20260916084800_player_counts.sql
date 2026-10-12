-- Steam concurrent players: the history table, its two read paths, and the
-- 30-minute poll that fills it. ROADMAP.md work queue item 13.
--
-- Valve publishes the current number only:
-- `ISteamUserStats/GetNumberOfCurrentPlayers/v1` takes one appid, needs no key,
-- and returns one integer with no history behind it. SteamDB and Steam Charts
-- have the history and both forbid scraping, so the only legitimate path is the
-- one SteamDB itself uses: poll the games we care about every 15 to 30 minutes
-- and keep the series ourselves (docs/research/game-data-sources.md 4.5). We
-- will have no history before the first run, which the UI has to say rather
-- than imply ("Best-effort integrations, honest UI", ROADMAP.md).
--
-- Polling happens in supabase/functions/steam-player-counts, invoked by pg_cron
-- through pg_net, which is the job split docs/design/tech-stack.md reserves for
-- exactly this ("pg_cron invoking Edge Functions: Steam concurrent-player poll
-- every 15 minutes"). Nothing here calls Steam; nothing in the function decides
-- who may read the rows.
--
-- ---------------------------------------------------------------------------
-- What Rafa has to do once, on the hosted project, for the poll to start
-- ---------------------------------------------------------------------------
--
-- 1. Deploy the function:
--
--      supabase functions deploy steam-player-counts
--
-- 2. Enable the two extensions the schedule needs, if they are not on already
--    (Dashboard, Database, Extensions, or SQL editor):
--
--      create extension if not exists pg_cron;
--      create extension if not exists pg_net;
--
-- 3. Create the two Vault secrets this migration reads, by these exact names
--    (Dashboard, Project Settings, Vault, or the SQL editor):
--
--      steam_player_counts_url
--        https://<project-ref>.supabase.co/functions/v1/steam-player-counts
--
--      steam_player_counts_service_role_key
--        the project's service role key
--
--    In SQL that is:
--
--      select vault.create_secret(
--        'https://<project-ref>.supabase.co/functions/v1/steam-player-counts',
--        'steam_player_counts_url',
--        'Edge Function the player-count poll calls'
--      );
--      select vault.create_secret(
--        '<service role key>',
--        'steam_player_counts_service_role_key',
--        'Bearer token the player-count poll sends'
--      );
--
-- 4. Re-run this migration (or the DO block at the bottom of it) if the
--    extensions were not there when it first applied: the schedule is created
--    only when pg_cron and pg_net exist, so on a local stack and on a project
--    without them this file applies cleanly and schedules nothing.
--
-- The URL and the key are read from the Vault at each tick, by name, so neither
-- appears in this file, in the repository, or in `cron.job`. A tick that finds
-- either secret missing does nothing at all, which is what makes step 3 safe to
-- do after the fact and what keeps the job quiet on a stack that will never
-- have them.

-- 1. The table ----------------------------------------------------------------
-- One row per game per observation. Catalog-shaped data, not user data: it says
-- how many people are playing a game, never which of ours are.
--
-- `observed_at` has no default on purpose. Every row a run writes carries that
-- run's single timestamp, so two games polled eleven seconds apart line up on
-- the same x-axis tick; `default now()` would quietly give each row its own
-- instant and make the series ragged for no reason a reader could see.
--
-- The primary key is (media_item_id, observed_at) rather than a surrogate id:
-- a game has one count per observation by definition, the pair is the identity,
-- and a re-run of the same tick collides instead of silently doubling a point.

create table public.player_counts (
  media_item_id uuid not null references public.media_items (id) on delete cascade,
  observed_at timestamptz not null,
  players integer not null check (players >= 0),
  primary key (media_item_id, observed_at)
);

comment on table public.player_counts is
  'Concurrent Steam players per game over time, polled every 30 minutes by supabase/functions/steam-player-counts. Written only by the service role; readable by every signed-in user.';
comment on column public.player_counts.observed_at is
  'When the poll read the figure. Every row from one run shares one timestamp.';
comment on column public.player_counts.players is
  'Valve''s `player_count` for the app at that moment. Zero is a real answer, so it is allowed; "we did not get one" is a missing row.';

-- The two reads the game page makes: the latest figure, and the last seven
-- days. Both are "this game, newest first", which the primary key's own index
-- can already serve by scanning backwards -- so what this index adds is not the
-- ordering but `players` itself: with the value in the index both reads are
-- index-only, and a week of one game (336 rows at one row per half hour) never
-- touches the heap.
create index player_counts_item_recent
  on public.player_counts (media_item_id, observed_at desc)
  include (players);

-- 2. Row Level Security -------------------------------------------------------
-- Same shape as the catalog tables in the core schema: readable by every
-- signed-in user, written by nobody but the service role, which bypasses RLS
-- the way the IGDB mirror does. There is deliberately no insert, update, or
-- delete policy, so there is no way for a client to invent a player count.
--
-- The grants say the same thing one level up. Supabase's default privileges
-- hand `anon` and `authenticated` full DML on new tables in `public` and leave
-- RLS to refuse it; stating the narrower grant makes "read-only, signed in
-- only" true of the privilege as well as of the policy, and makes it something
-- supabase/tests/player_counts.test.sql can assert directly.

alter table public.player_counts enable row level security;

create policy "player counts are readable by signed-in users" on public.player_counts
  for select to authenticated using (true);

revoke all on public.player_counts from anon, authenticated;
grant select on public.player_counts to authenticated;

-- 3. player_count_history -----------------------------------------------------
-- The sparkline on the game page: one game's series, oldest first, over a
-- window that defaults to the last seven days.
--
-- `security invoker`, like every function in
-- 20260915130000_ranking_functions.sql, so the policy above is still what
-- decides whether the caller sees anything: a signed-out caller cannot execute
-- it, and a signed-in one gets exactly what a plain select would have given
-- them. The argument is a media item, never a user, so there is nothing here to
-- name someone else with.
--
-- Oldest first because it is drawn left to right. `latest_player_counts` below
-- is the other direction and exists separately for that reason.

create or replace function public.player_count_history(
  p_media_item_id uuid,
  p_since timestamptz default now() - interval '7 days'
)
returns table (
  observed_at timestamptz,
  players integer
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select p.observed_at, p.players
  from public.player_counts p
  where p.media_item_id = p_media_item_id
    and p.observed_at >= p_since
  order by p.observed_at asc;
$$;

comment on function public.player_count_history(uuid, timestamptz) is
  'One game''s concurrent-player series, oldest first, from p_since (default seven days ago) to now.';

-- 4. latest_player_counts -----------------------------------------------------
-- "How many are playing right now", per game, as one row each.
--
-- A view rather than a function because that is what the shape is: the game
-- page reads one row of it by id, and a later screen ("what is hot among the
-- games you track") reads many with an order by, which a set-returning function
-- would make awkward for no gain.
--
-- `security_invoker = true` is the whole reason this is safe: without it a view
-- runs as its owner and would hand out rows the caller's own policy would have
-- refused. With it, RLS on player_counts is evaluated as the caller, exactly as
-- for the function above. Postgres 17 here, so it is available (config.toml,
-- db.major_version).
--
-- `distinct on` is the cheap way to say "the newest row per game": it walks the
-- index created above and stops at the first row of each group.

create view public.latest_player_counts
with (security_invoker = true) as
  select distinct on (p.media_item_id)
    p.media_item_id,
    p.observed_at,
    p.players
  from public.player_counts p
  order by p.media_item_id, p.observed_at desc;

comment on view public.latest_player_counts is
  'The most recent concurrent-player reading for each game that has one. Runs as the caller, so player_counts'' RLS still applies.';

-- 5. Grants -------------------------------------------------------------------
-- Signed-in users only, matching the ranking and backlog RPCs. RLS is what
-- actually protects the rows; this keeps both reads off the anonymous surface.

revoke all on public.latest_player_counts from anon, authenticated;
grant select on public.latest_player_counts to authenticated;

revoke all on function public.player_count_history(uuid, timestamptz) from public, anon;
grant execute on function public.player_count_history(uuid, timestamptz) to authenticated, service_role;

-- 6. The 30-minute poll -------------------------------------------------------
-- Every 30 minutes, ask the Edge Function to read Valve's figure for the games
-- our users track and write one row each. Thirty rather than fifteen: the
-- research says either is fine (4.5), the daily Steam Web API allowance is
-- 100,000 calls, and halving the tick rate doubles how many tracked games fit
-- under it before anyone has to think about budgets again.
--
-- The whole thing is guarded, because this migration has to apply on three
-- kinds of stack: the hosted project with both extensions on, a hosted project
-- before Rafa has enabled them, and a local `supabase start`, which has neither
-- and will never have the secrets either. So:
--
--   * no `create extension` here. Enabling pg_cron and pg_net is a project-level
--     act with a project-level cost, and a migration that silently turns them on
--     for a local stack would be making that decision on Rafa's behalf. The
--     schedule is created only when both are already present, and the header
--     above says how to add them.
--   * `execute` rather than a direct call, so the reference to cron.schedule is
--     resolved at run time and a database without the extension does not even
--     have to parse it.
--   * the job body itself re-checks the Vault at every tick and returns without
--     doing anything if either secret is missing. A schedule that exists before
--     its secrets do is therefore harmless, and so is one on a project where
--     they are later removed.
--
-- `cron.schedule` upserts by job name, so re-applying this migration or running
-- the block again after enabling the extensions replaces the job rather than
-- adding a second one.

do $migration$
declare
  v_has_cron boolean := exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'cron' and p.proname = 'schedule'
  );
  v_has_net boolean := exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'net' and p.proname = 'http_post'
  );
  v_command constant text := $cron$
do $job$
declare
  v_url text;
  v_key text;
begin
  -- No Vault on this database: nothing to read, nothing to call.
  if to_regclass('vault.decrypted_secrets') is null then
    return;
  end if;

  select s.decrypted_secret into v_url
  from vault.decrypted_secrets s
  where s.name = 'steam_player_counts_url';

  select s.decrypted_secret into v_key
  from vault.decrypted_secrets s
  where s.name = 'steam_player_counts_service_role_key';

  -- Secrets not created yet, or removed. Do nothing rather than call an
  -- unauthenticated endpoint or log half a URL.
  if v_url is null or v_key is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('invoked_by', 'pg_cron'),
    -- pg_net is fire-and-forget: this is how long it waits for the response,
    -- not how long the function may run. The function's own wall clock is the
    -- Edge Function limit (150 s, docs/design/tech-stack.md).
    timeout_milliseconds := 20000
  );
end;
$job$;
$cron$;
begin
  if not (v_has_cron and v_has_net) then
    raise notice
      'player_counts: pg_cron and/or pg_net are not installed, so the 30-minute Steam poll was not scheduled. See the header of this migration.';
    return;
  end if;

  execute 'select cron.schedule($1, $2, $3)'
    using 'steam-player-counts', '*/30 * * * *', v_command;

  raise notice 'player_counts: scheduled steam-player-counts every 30 minutes.';
end;
$migration$;
