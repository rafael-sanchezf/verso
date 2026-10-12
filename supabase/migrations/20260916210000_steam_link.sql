-- The Steam account link and the library import: the two tables behind it and
-- the five functions the Edge Functions and the app call. ROADMAP.md V1,
-- "Steam account link".
--
-- The shape of the feature, and why it is in these pieces:
--
--   1. **Linking is OpenID 2.0, verified server-side.** Steam is an OpenID 2.0
--      provider and nothing else: no scopes, no tokens, no API key needed for
--      the login itself. The user signs in on Valve's page and Steam redirects
--      back with an assertion whose `claimed_id` is
--      `https://steamcommunity.com/openid/id/<steamid64>`, which is worth
--      exactly nothing until it has been handed back to Steam with
--      `openid.mode=check_authentication` and answered `is_valid:true`
--      (docs/research/game-data-sources.md 4.4). supabase/functions/steam-link
--      does that; `platform_links` already exists in the core schema and is
--      where the verified SteamID64 lands.
--
--   2. **The user's JWT never travels through the OpenID round trip.** Steam
--      redirects the *browser*, so whatever is in `openid.return_to` ends up in
--      a URL bar, in browser history, and in Valve's referrer. A JWT there
--      would be a session anyone who saw the URL could use. Instead the app
--      calls the function with its JWT once, up front, and gets back a Steam
--      URL whose `return_to` carries a single-use `state` -- 256 bits of
--      randomness, stored here as a SHA-256 hash, bound to the user id, valid
--      for ten minutes, and consumed atomically on the way back. That is
--      `steam_link_states` below.
--
--      A signed token (a JWT of our own, an HMAC over the user id) was the
--      other option and is weaker for this job: a signature cannot be revoked,
--      cannot be made single-use without a table anyway, and would still be a
--      bearer credential in a URL. A random opaque handle whose only meaning is
--      a row in a table nobody but the service role can read gives replay
--      protection and expiry for free, and a leaked state is useless the
--      instant it is used once.
--
--   3. **The library is stored, not turned into entries.** `steam_library` is
--      what Steam says the user owns, as Steam says it. It is not the backlog:
--      "owned but untracked" is a *read* over this table
--      (`steam_backlog_candidates`), the app offers those games, and the user
--      accepts. The backlog is the user's own list and an import must never
--      write to it ("Own the user's data, borrow the catalog", ROADMAP.md).
--
--   4. **Playtime precedence, in one place.** `apply_steam_playtime` is the
--      whole of decision 4: the import writes `user_entries.playtime_minutes`
--      and `playtime_source = 'steam'` only for games the user already tracks
--      and only where the existing source is null or already 'steam'. A figure
--      the user typed in themselves (`playtime_source = 'manual'`, the V1
--      "Manual playtime entry" item) is never overwritten. Ownership
--      (`owned_platforms`) is not touched by the import at all: owning a game
--      on Steam and saying "I have this on PC" are different claims, the second
--      one is the user's, and the import has no business making it.
--
--   5. **Unlink is `unlink_steam`.** It drops the `platform_links` row and the
--      user's `steam_library` rows. Imported playtime stays: it is the user's
--      data now, and `playtime_source` still says where it came from.
--
--   6. **One Steam account belongs to one person.** `platform_links`' primary
--      key is (user_id, platform), which says a user has one Steam account and
--      says nothing at all about the other direction -- so without the unique
--      index added in section 2 below, two accounts could each claim the same
--      SteamID64, and whichever imported last would decide what the other one's
--      playtime looked like. The index makes the second claim a 23505 that the
--      Edge Function turns into `already_linked_elsewhere`, writing nothing.
--
-- Rate limiting is here rather than in the Edge Function because a function
-- instance has no memory between invocations and two taps land on two
-- instances. `begin_steam_import` takes the row lock, so the tenth tap in a
-- minute is refused by the database or not at all.
--
-- Both tables below reference `auth.users (id) on delete cascade`, so
-- `delete_my_account` in 20260916200000_delete_my_account.sql takes them with
-- it: that function is one `delete from auth.users` and relies on exactly this,
-- and it needs no change for these two.
--
-- ---------------------------------------------------------------------------
-- What Rafa has to do once, on the hosted project
-- ---------------------------------------------------------------------------
--
--   1. Get a Steam Web API key at https://steamcommunity.com/dev/apikey
--      (needs a non-limited account, a domain -- `localhost` is accepted for
--      development -- and the mobile authenticator; research 4.1). The key is
--      only for the *import*: the OpenID login needs none.
--
--   2. Give it to the Edge Functions and nothing else:
--
--        supabase secrets set STEAM_WEB_API_KEY=...
--
--      It never goes in `.env` for the app, in a migration, or in a commit.
--
--   3. Tell steam-link its own public URL, which is the OpenID realm and the
--      base of every `return_to`:
--
--        supabase secrets set \
--          STEAM_LINK_RETURN_URL=https://<project-ref>.supabase.co/functions/v1/steam-link
--
--      Required, not optional. Deriving it from the incoming request would let
--      a forged Host header choose the realm Valve shows the user and the URL
--      Valve redirects to. The function refuses to start a link without it.
--
--   4. Deploy both functions. `steam-link` has to be deployed with JWT
--      verification off, because Steam's redirect is a plain browser GET with
--      no Authorization header and the platform gate would refuse it before our
--      code ran:
--
--        supabase functions deploy steam-link --no-verify-jwt
--        supabase functions deploy steam-import
--
--      "Off" there means off at the gateway, not off: the POST half of
--      steam-link verifies the caller's JWT itself with `auth.getUser()` and
--      refuses anything else, and the GET half authenticates the *assertion*
--      with Valve and the *user* with a single-use state row. See the header of
--      supabase/functions/steam-link/index.ts.
--
--   5. Register the app's deep link. The function finishes by redirecting the
--      browser to `verso://steam/linked?status=...`, which is the app's scheme
--      (apps/mobile/app.json). Override it with the `STEAM_LINK_APP_REDIRECT`
--      secret if that ever changes.

-- 1. steam_library --------------------------------------------------------------
-- One row per game per user, as Steam reports it: the app id, the name Steam
-- uses, total and two-week playtime in minutes, and when it was last played.
--
-- `media_item_id` is nullable and that is the normal case for a chunk of any
-- library. It is resolved through `media_items.external_ids->>'steam'`, which
-- the IGDB mirror fills, so an unresolved row means one of: the catalog has not
-- mirrored that game, IGDB has no Steam id for it, or it is a tool, a demo, or
-- a soundtrack rather than a game. Those rows are kept anyway -- deleting them
-- would make every import re-fetch and re-fail on them, and a later catalog
-- sync can resolve them in place.
--
-- `on delete set null` rather than cascade: a catalog row going away (a merge,
-- a re-mirror) must not silently delete the user's record that they own the
-- game. The ownership fact is ours to keep; the catalog link is the borrowed
-- part.
--
-- The primary key is (user_id, steam_app_id) rather than a surrogate id: a user
-- owns an app once, so the pair is the identity, and a re-import upserts its
-- own rows instead of doubling the library.
--
-- Playtime is stored in minutes because that is Valve's unit
-- (`playtime_forever`, `playtime_2weeks`; research 4.2) and because
-- `user_entries.playtime_minutes` is minutes too, so nothing has to convert
-- anywhere.

create table public.steam_library (
  user_id uuid not null references auth.users (id) on delete cascade,
  steam_app_id integer not null check (steam_app_id > 0),
  media_item_id uuid references public.media_items (id) on delete set null,
  name text,
  playtime_forever_minutes integer not null default 0
    check (playtime_forever_minutes >= 0),
  playtime_2weeks_minutes integer
    check (playtime_2weeks_minutes is null or playtime_2weeks_minutes >= 0),
  last_played_at timestamptz,
  fetched_at timestamptz not null default now(),
  primary key (user_id, steam_app_id)
);

comment on table public.steam_library is
  'What Steam says a user owns, as Steam says it. Written by supabase/functions/steam-import as the service role; owner-only to everyone else. Not the backlog: steam_backlog_candidates is the read that offers rows of this to the user, who accepts or does not.';
comment on column public.steam_library.media_item_id is
  'The catalog row this app id resolves to through media_items.external_ids->>''steam'', or null when the catalog has no match. Null is ordinary, not an error: tools, demos, soundtracks and un-mirrored games all land there, and a later catalog sync can fill it in.';
comment on column public.steam_library.name is
  'The name Steam returned (include_appinfo=1). Kept so an unresolved row is still something a screen could name, and so a mismatch with the catalog title is visible.';
comment on column public.steam_library.playtime_forever_minutes is
  'Valve''s playtime_forever, in minutes. Zero means either never played or "Always keep my total playtime private" (research 4.3) -- the two are indistinguishable from the API, which is why apply_steam_playtime writes nothing for a zero.';
comment on column public.steam_library.playtime_2weeks_minutes is
  'Valve''s playtime_2weeks, in minutes, or null when the game was not played in the last two weeks (Valve omits the field rather than sending 0).';
comment on column public.steam_library.last_played_at is
  'Valve''s rtime_last_played as a timestamp, or null when it is absent or zero (which Steam uses for "never").';
comment on column public.steam_library.fetched_at is
  'When the import that wrote this row read it from Steam. Every row of one import shares one instant, so "your library as of" is a single answer.';

-- The candidates read: this user's rows that resolved to a catalog game, least
-- played first. Partial, because the unresolved rows are never in that answer
-- and there can be a lot of them.
create index steam_library_user_resolved
  on public.steam_library (user_id, playtime_forever_minutes)
  where media_item_id is not null;

-- apply_steam_playtime joins on (user_id, media_item_id), and so does the
-- single-game read behind the playtime line on the game page.
create index steam_library_user_media_item
  on public.steam_library (user_id, media_item_id)
  where media_item_id is not null;

-- 2. One Steam account, one person ----------------------------------------------
-- `platform_links` came out of the core schema with (user_id, platform) as its
-- primary key. That constrains one direction only -- a user has at most one
-- Steam account -- and leaves the other wide open: nothing stopped two of our
-- users from claiming the same SteamID64, and nothing would have told either of
-- them. It is not a theoretical tidiness point. The import writes playtime onto
-- `user_entries` from whatever `platform_links` says, so a second account
-- claiming somebody's SteamID64 gets their hours, their library, and their
-- owned-but-untracked list.
--
-- Unique on (platform, external_user_id) rather than on external_user_id alone,
-- because a PSN id and a Steam id are different namespaces and could collide by
-- coincidence; the pair is the identity. Steam is the only platform in V1, but
-- PlayStation is sketched in the roadmap and would land in this same table.
--
-- The Edge Function turns the resulting 23505 into
-- `already_linked_elsewhere`, redirects the browser with that reason, and
-- writes nothing.

create unique index platform_links_platform_external_uniq
  on public.platform_links (platform, external_user_id);

comment on index public.platform_links_platform_external_uniq is
  'One external account belongs to one of our users. Without it two accounts could claim the same SteamID64 and the import would hand the second one the first one''s playtime and library.';

-- 3. steam_link_states ----------------------------------------------------------
-- The OpenID round trip's single-use handle. One row per "start the link flow",
-- alive for ten minutes, consumed exactly once.
--
-- **The state itself is not in here.** What is stored is its SHA-256 hash: the
-- Edge Function generates 32 random bytes, puts them in the URL, and stores the
-- digest. A dump of this table therefore contains nothing anyone could replay,
-- and the lookup on the way back is still a primary-key hit.
--
-- `response_nonce` is Valve's own `openid.response_nonce` from the assertion,
-- recorded as the state is consumed. The state being single-use already makes a
-- replayed callback fail, and the signature covers `return_to` (which carries
-- the state), so a captured assertion cannot be pasted onto a fresh state
-- either. The unique index is the third lock on the same door, and it is the
-- one that does not depend on us having reasoned correctly about the first two.
--
-- No policies at all, deliberately. RLS is on and the table has no policy, so
-- `anon` and `authenticated` can read exactly nothing through PostgREST even if
-- a future default grant hands them privileges; the service role bypasses RLS
-- the way it does for the IGDB mirror, and it is the only thing that ever
-- touches this table.

create table public.steam_link_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  response_nonce text
);

comment on table public.steam_link_states is
  'Single-use, short-lived handles for the Steam OpenID round trip, so the user''s JWT never travels in a URL. Service role only: RLS is on and there is no policy.';
comment on column public.steam_link_states.state_hash is
  'SHA-256 of the state that went out in openid.return_to, hex. The state itself is never stored, so this table holds nothing replayable.';
comment on column public.steam_link_states.consumed_at is
  'When the callback used this state. Non-null means used: consume_steam_link_state will not return a user for it again.';
comment on column public.steam_link_states.response_nonce is
  'Valve''s openid.response_nonce from the assertion that consumed this state. Unique across rows, so the same assertion cannot be accepted twice even against a different state.';

-- Sweeping expired rows, and the uniqueness of Valve's nonce.
create index steam_link_states_expires_at on public.steam_link_states (expires_at);

create unique index steam_link_states_response_nonce_uniq
  on public.steam_link_states (response_nonce)
  where response_nonce is not null;

-- 4. Row Level Security ---------------------------------------------------------
-- steam_library is owner-only in exactly the shape user_entries is: one `for
-- all` policy on auth.uid(), both `using` and `with check`. The rows are the
-- user's own data about their own account, they are read by the app on every
-- screen that shows Steam playtime, and the user is entitled to delete them
-- (which is what unlink does).
--
-- The write path in practice is the service role, because only the Edge
-- Function has the Steam answer. Leaving the owner able to write anyway costs
-- nothing: the worst a user can do is invent a row about a game they own,
-- affecting only their own reads, which is already true of user_entries and of
-- every manual playtime figure.
--
-- The grants say the same thing one level up. Supabase's default privileges
-- hand `anon` and `authenticated` full DML on new tables in `public` and leave
-- RLS to refuse it; stating the narrower grant makes "signed in, owner only"
-- true of the privilege as well as of the policy, and makes it something
-- supabase/tests/steam_link.test.sql can assert directly.

alter table public.steam_library enable row level security;
alter table public.steam_link_states enable row level security;

create policy "users manage their own steam library" on public.steam_library
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.steam_library from anon, authenticated;
grant select, insert, update, delete on public.steam_library to authenticated;

revoke all on public.steam_link_states from anon, authenticated;

-- 5. start_steam_link_state -----------------------------------------------------
-- Open a link attempt: record the hash, bind it to the user, set the clock.
--
-- Service role only, because it names a user id. The Edge Function has already
-- verified that user's JWT before it calls this; nothing here can check that,
-- which is exactly why nobody else may call it.
--
-- The sweep is opportunistic rather than a cron job: this table only grows when
-- someone starts a link, the rows are tiny, and deleting everything a day past
-- its expiry at the moment a new one is created keeps it permanently small
-- without another scheduled thing to deploy and watch. A day rather than
-- immediately so that a consumed or expired state can still be told apart from
-- one that never existed while anyone is still looking at the failure.

create or replace function public.start_steam_link_state(
  p_user_id uuid,
  p_state_hash text,
  p_ttl_seconds integer default 600
)
returns timestamptz
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
declare
  v_expires_at timestamptz := now() + make_interval(secs => greatest(60, least(p_ttl_seconds, 3600)));
begin
  delete from public.steam_link_states where expires_at < now() - interval '1 day';

  insert into public.steam_link_states (state_hash, user_id, expires_at)
  values (p_state_hash, p_user_id, v_expires_at);

  return v_expires_at;
end;
$$;

comment on function public.start_steam_link_state(uuid, text, integer) is
  'Record a Steam OpenID link attempt for a user and return when it expires. The TTL is clamped to 1-60 minutes. Service role only: it names a user id, so the caller is trusted to have verified that user.';

revoke all on function public.start_steam_link_state(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.start_steam_link_state(uuid, text, integer) to service_role;

-- 6. consume_steam_link_state ---------------------------------------------------
-- Spend a state, once. Returns the user it was bound to, or null for a state
-- that is unknown, expired, or already used -- three cases the callback must
-- treat identically, because telling them apart tells an attacker which of
-- their guesses was close.
--
-- The whole check is the `where` clause of a single `update ... returning`, so
-- two callbacks racing on one state cannot both win: the second finds
-- `consumed_at` already set by the first and updates nothing. Doing the read
-- and the write as separate statements would leave exactly that gap.
--
-- `p_response_nonce` is written in the same statement, so the unique index on
-- it is what refuses an assertion that has already been accepted somewhere
-- else. A collision raises 23505 and the callback fails closed.

create or replace function public.consume_steam_link_state(
  p_state_hash text,
  p_response_nonce text default null
)
returns uuid
language sql
volatile
security invoker
set search_path = public, extensions
as $$
  update public.steam_link_states
  set consumed_at = now(),
      response_nonce = p_response_nonce
  where state_hash = p_state_hash
    and consumed_at is null
    and expires_at > now()
  returning user_id;
$$;

comment on function public.consume_steam_link_state(text, text) is
  'Spend a Steam OpenID state and return the user it was bound to, or null if it is unknown, expired, or already spent. Atomic: the check and the write are one statement, so a replayed callback loses the race rather than passing it.';

revoke all on function public.consume_steam_link_state(text, text) from public, anon, authenticated;
grant execute on function public.consume_steam_link_state(text, text) to service_role;

-- 7. begin_steam_import ---------------------------------------------------------
-- The gate in front of every import: is this user linked, and have they asked
-- in the last ten minutes?
--
-- One row per user in `platform_links`, locked with `for update`, so two
-- simultaneous imports serialise and the second sees the first's stamp. That is
-- the reason this is a database function and not a check in the Edge Function:
-- two taps reach two function instances that share no memory, and only the row
-- lock is common to both.
--
-- `last_synced_at` is stamped at the *start* of an import, not the end. A run
-- that dies half way therefore still costs the user their ten minutes, which is
-- the right way round: an import failing is usually Steam being unhappy or the
-- profile being private, and retrying every second makes both worse.
--
-- Three outcomes, distinguishable by the caller:
--   allowed = true                     go ahead, here is the SteamID64
--   allowed = false, steam_id is null  not linked; the app should offer the link
--   allowed = false, steam_id present  too soon; retry_after_seconds says when

create or replace function public.begin_steam_import(
  p_user_id uuid,
  p_min_interval interval default interval '10 minutes'
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  steam_id text
)
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
declare
  v_steam_id text;
  v_last_synced_at timestamptz;
  v_wait integer;
begin
  select l.external_user_id, l.last_synced_at
    into v_steam_id, v_last_synced_at
  from public.platform_links l
  where l.user_id = p_user_id
    and l.platform = 'steam'
  for update;

  if v_steam_id is null then
    return query select false, 0, null::text;
    return;
  end if;

  if v_last_synced_at is not null and v_last_synced_at > now() - p_min_interval then
    v_wait := ceil(extract(epoch from (v_last_synced_at + p_min_interval - now())))::integer;
    return query select false, greatest(v_wait, 1), v_steam_id;
    return;
  end if;

  update public.platform_links l
  set last_synced_at = now(),
      sync_status = 'importing'
  where l.user_id = p_user_id
    and l.platform = 'steam';

  return query select true, 0, v_steam_id;
end;
$$;

comment on function public.begin_steam_import(uuid, interval) is
  'Claim an import slot for a user: takes the platform_links row lock, refuses a second import inside p_min_interval (default ten minutes), and stamps last_synced_at when it allows one. Service role only.';

revoke all on function public.begin_steam_import(uuid, interval) from public, anon, authenticated;
grant execute on function public.begin_steam_import(uuid, interval) to service_role;

-- 8. apply_steam_playtime -------------------------------------------------------
-- Decision 4, and nothing else. All of the precedence rule is the `where`
-- clause, which is why it is here rather than in TypeScript: it is a property
-- of the data, it is four conditions, and supabase/tests/steam_link.test.sql
-- can prove each of them without a stack, a network, or a Steam account.
--
--   e.media_item_id = s.media_item_id    only games the user already tracks.
--                                        This is an UPDATE. It never inserts,
--                                        so an import cannot add anything to
--                                        anyone's list.
--   s.playtime_forever_minutes > 0       a zero says nothing. It is either
--                                        "never played" or "total playtime
--                                        hidden" (research 4.3) and the API
--                                        does not distinguish them, so writing
--                                        it would turn a real figure into a
--                                        zero the moment a user ticked a
--                                        privacy box.
--   playtime_source is null or 'steam'   a figure the user typed is theirs.
--                                        'manual' is never overwritten, and
--                                        neither is a source we have not
--                                        invented yet.
--   ... is distinct from ...             do not rewrite a row to the value it
--                                        already has, so an import that changed
--                                        nothing reports zero rather than "all
--                                        of them".
--
-- What it does not touch: `owned_platforms` (owning on Steam and saying "I have
-- this on PC" are different claims and the second is the user's), `status`,
-- `backlog_position`, and every date. The two BEFORE triggers on user_entries
-- both no-op for an update that leaves `status` alone, which the test suite
-- asserts rather than assumes.

create or replace function public.apply_steam_playtime(p_user_id uuid)
returns integer
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
declare
  v_updated integer;
begin
  update public.user_entries e
  set playtime_minutes = s.playtime_forever_minutes,
      playtime_source = 'steam'
  from public.steam_library s
  where s.user_id = p_user_id
    and e.user_id = p_user_id
    and s.media_item_id is not null
    and e.media_item_id = s.media_item_id
    and s.playtime_forever_minutes > 0
    and (e.playtime_source is null or e.playtime_source = 'steam')
    and (e.playtime_minutes is distinct from s.playtime_forever_minutes
         or e.playtime_source is distinct from 'steam');

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

comment on function public.apply_steam_playtime(uuid) is
  'Copy Steam playtime onto the entries a user already tracks, never over a manual figure and never from a zero. Returns how many entries changed. Updates only: an import never creates an entry, and never touches owned_platforms, status, or any date.';

revoke all on function public.apply_steam_playtime(uuid) from public, anon, authenticated;
grant execute on function public.apply_steam_playtime(uuid) to service_role;

-- 9. unlink_steam ---------------------------------------------------------------
-- Decision 5. `security invoker` on auth.uid() with no user id parameter, like
-- every function in 20260915130000_ranking_functions.sql: Row Level Security is
-- still the boundary and a caller cannot name someone else's rows.
--
-- Imported playtime stays on `user_entries`. It is the user's data now, it is
-- the same number whether or not the accounts are still linked, and
-- `playtime_source` still says 'steam' so the UI can keep saying where it came
-- from (rule 21, every number carries its source). Deleting it would be the
-- app throwing away the user's history to make a bookkeeping point.
--
-- Pending link attempts are dropped by `forget_steam_link_attempts` below,
-- which the app calls alongside this one, so an unlink while a browser tab is
-- still open on Valve's page cannot quietly re-link a moment later.

create or replace function public.unlink_steam()
returns void
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'unlink_steam requires an authenticated user';
  end if;

  delete from public.steam_library where user_id = v_uid;
  delete from public.platform_links where user_id = v_uid and platform = 'steam';
end;
$$;

comment on function public.unlink_steam() is
  'Forget the caller''s Steam account: the platform_links row and every steam_library row. Imported playtime on user_entries stays, still labelled ''steam''.';

revoke all on function public.unlink_steam() from public, anon;
grant execute on function public.unlink_steam() to authenticated, service_role;

-- The pending-state cleanup cannot live in unlink_steam's body the way the two
-- deletes above do, because steam_link_states has no policy and `authenticated`
-- has no privilege on it -- which is the point of that table. A definer
-- function scoped to auth.uid() is the narrow exception: it can delete the
-- caller's own pending attempts and nothing else, it takes no arguments, and it
-- returns nothing.
create or replace function public.forget_steam_link_attempts()
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'forget_steam_link_attempts requires an authenticated user';
  end if;

  delete from public.steam_link_states where user_id = v_uid;
end;
$$;

comment on function public.forget_steam_link_attempts() is
  'Drop the caller''s pending Steam OpenID link attempts. security definer because steam_link_states is service-role only by design; it takes no arguments and is scoped to auth.uid(), so it can reach nobody else''s rows.';

revoke all on function public.forget_steam_link_attempts() from public, anon;
grant execute on function public.forget_steam_link_attempts() to authenticated, service_role;

-- 10. steam_backlog_candidates ---------------------------------------------------
-- "Games you own on Steam that you are not tracking here." A read, not a write:
-- decision 3. The app shows these, the user picks, and picking one goes through
-- the ordinary entry path -- so a candidate is an offer and the backlog stays
-- the user's own list.
--
-- `security invoker`, no user id parameter, like every other user-facing
-- function in this project. RLS on steam_library and on user_entries is what
-- scopes both halves of the query to the caller; the explicit `auth.uid()` in
-- the `not exists` says the same thing out loud, because a reader should not
-- have to remember a policy to see that the subquery is about this user.
--
-- Least played first, then by name. A library of nine hundred games is mostly
-- noise and the interesting end is the pile of things bought and never started
-- (the roadmap's "owned-but-unplayed"); a stable second key keeps the list from
-- reshuffling between calls, since ties at zero minutes are the common case.
--
-- Only resolved rows: a candidate has to be a game the app can actually show
-- and rank, which means one that exists in the catalog.

create or replace function public.steam_backlog_candidates(p_limit integer default 50)
returns table (
  media_item_id uuid,
  steam_app_id integer,
  title text,
  year integer,
  cover_image_id text,
  external_ids jsonb,
  name text,
  playtime_forever_minutes integer,
  last_played_at timestamptz
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    s.media_item_id,
    s.steam_app_id,
    m.title,
    m.year,
    m.cover_image_id,
    m.external_ids,
    s.name,
    s.playtime_forever_minutes,
    s.last_played_at
  from public.steam_library s
  join public.media_items m on m.id = s.media_item_id
  where s.user_id = auth.uid()
    and s.media_item_id is not null
    and not exists (
      select 1
      from public.user_entries e
      where e.user_id = auth.uid()
        and e.media_item_id = s.media_item_id
    )
  order by s.playtime_forever_minutes asc, m.title asc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

comment on function public.steam_backlog_candidates(integer) is
  'Games the caller owns on Steam, resolved to the catalog, that they have no entry for. Least played first, then by title. A read only: the app offers these and the user accepts, because the backlog is theirs.';

revoke all on function public.steam_backlog_candidates(integer) from public, anon;
grant execute on function public.steam_backlog_candidates(integer) to authenticated, service_role;
