-- Core schema for gaming-beli. Media-agnostic: games, movies, and TV share
-- media_items, user_entries, ranking_entries, comparisons, and lists. Game
-- specifics live in game_details. See ROADMAP.md "Media-agnostic data model
-- sketch" and docs/design/ranking-algorithm.md.

create extension if not exists pg_trgm with schema extensions;

-- Enumerations --------------------------------------------------------------

create type public.medium as enum ('game', 'movie', 'tv');
create type public.entry_status as enum ('backlog', 'playing', 'played', 'dropped');
create type public.tier as enum ('loved', 'liked', 'fine', 'disliked');
create type public.comparison_outcome as enum ('a', 'b', 'too_close', 'cant_compare');

-- Profiles ------------------------------------------------------------------
-- One row per auth user. Created by trigger so the app never has to.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Catalog -------------------------------------------------------------------
-- Mirrored from IGDB (games) and TMDB (movies, tv). Written only by the
-- service role; readable by every signed-in user.

create table public.media_items (
  id uuid primary key default gen_random_uuid(),
  medium public.medium not null,
  title text not null,
  year smallint,
  cover_image_id text,
  external_ids jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  refreshed_at timestamptz not null default now()
);

create index media_items_title_trgm on public.media_items using gin (title extensions.gin_trgm_ops);
create index media_items_medium_year on public.media_items (medium, year);

create table public.game_details (
  media_item_id uuid primary key references public.media_items (id) on delete cascade,
  igdb_id integer not null unique,
  platforms text[] not null default '{}',
  genres text[] not null default '{}',
  time_to_beat_seconds integer,
  developer text,
  summary text
);

create index game_details_genres on public.game_details using gin (genres);

create table public.external_scores (
  media_item_id uuid not null references public.media_items (id) on delete cascade,
  source text not null,
  score numeric(5, 2),
  score_count integer,
  fetched_at timestamptz not null default now(),
  primary key (media_item_id, source)
);

-- Per-user data -------------------------------------------------------------

create table public.user_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  media_item_id uuid not null references public.media_items (id) on delete cascade,
  status public.entry_status not null default 'backlog',
  added_at timestamptz not null default now(),
  finished_at date,
  notes text,
  playtime_minutes integer check (playtime_minutes is null or playtime_minutes >= 0),
  playtime_source text,
  unique (user_id, media_item_id)
);

create index user_entries_user_status on public.user_entries (user_id, status);

-- The ordered ranked list, one row per ranked item. Position 0 is best within
-- the tier. The 0-10 score is derived at read time from tier and position and
-- is never stored.
create table public.ranking_entries (
  user_id uuid not null references auth.users (id) on delete cascade,
  medium public.medium not null,
  tier public.tier not null,
  media_item_id uuid not null references public.media_items (id) on delete cascade,
  position integer not null check (position >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, media_item_id),
  unique (user_id, medium, tier, position) deferrable initially deferred
);

-- Append-only log of every head-to-head answer. The durable asset: any
-- ranking algorithm can be recomputed from this.
create table public.comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  medium public.medium not null,
  item_a uuid not null references public.media_items (id) on delete cascade,
  item_b uuid not null references public.media_items (id) on delete cascade,
  outcome public.comparison_outcome not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (item_a <> item_b)
);

create index comparisons_user_created on public.comparisons (user_id, created_at);

create table public.platform_links (
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,
  external_user_id text not null,
  token_ref text,
  last_synced_at timestamptz,
  sync_status text,
  primary key (user_id, platform)
);

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.list_items (
  list_id uuid not null references public.lists (id) on delete cascade,
  media_item_id uuid not null references public.media_items (id) on delete cascade,
  position integer not null check (position >= 0),
  primary key (list_id, media_item_id)
);

-- Row Level Security ----------------------------------------------------------
-- Every table has RLS on. Catalog tables are read-only for signed-in users and
-- written by the service role (which bypasses RLS). User tables are owner-only.

alter table public.profiles enable row level security;
alter table public.media_items enable row level security;
alter table public.game_details enable row level security;
alter table public.external_scores enable row level security;
alter table public.user_entries enable row level security;
alter table public.ranking_entries enable row level security;
alter table public.comparisons enable row level security;
alter table public.platform_links enable row level security;
alter table public.lists enable row level security;
alter table public.list_items enable row level security;

-- Profiles: everyone signed in can read (needed for the social layer later); only the owner writes.
create policy "profiles are readable by signed-in users" on public.profiles
  for select to authenticated using (true);
create policy "users update their own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Catalog: read-only.
create policy "catalog is readable by signed-in users" on public.media_items
  for select to authenticated using (true);
create policy "game details are readable by signed-in users" on public.game_details
  for select to authenticated using (true);
create policy "scores are readable by signed-in users" on public.external_scores
  for select to authenticated using (true);

-- User entries: owner-only, all operations.
create policy "users manage their own entries" on public.user_entries
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Rankings: owner-only, all operations.
create policy "users manage their own rankings" on public.ranking_entries
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Comparisons: owner can insert and read. No update or delete policy, so the
-- log is append-only from the app's point of view.
create policy "users read their own comparisons" on public.comparisons
  for select to authenticated using (auth.uid() = user_id);
create policy "users append their own comparisons" on public.comparisons
  for insert to authenticated with check (auth.uid() = user_id);

-- Platform links: owner-only.
create policy "users manage their own platform links" on public.platform_links
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Lists: owner-only for now. Sharing arrives with the social layer.
create policy "users manage their own lists" on public.lists
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage items in their own lists" on public.list_items
  for all to authenticated
  using (exists (select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid()))
  with check (exists (select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid()));
