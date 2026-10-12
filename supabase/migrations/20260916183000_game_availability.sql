-- Where to play: subscription availability per game, written by a nightly job
-- and read by the game page. ROADMAP.md V1 "Where to play".
--
-- Three sources feed this table, none of them an API anybody promises us
-- (docs/research/game-data-sources.md 9.1, 9.4, 9.5):
--
--   * Xbox Game Pass -- `catalog.gamepass.com/sigls/v2` for the collection's
--     product ids and `displaycatalog.mp.microsoft.com` for their titles. No
--     key, 150+ markets, and entirely undocumented: the community tools that
--     use it all carry the same "unofficial, not guaranteed" disclaimer.
--   * GeForce NOW -- NVIDIA's own supported-game JSON. Public and stable for
--     years, but still not a documented API.
--   * IsThereAnyDeal -- `/games/subs/v1`, the only official one of the three.
--     PC-centric, needs a key, and its terms allow commercial use on the
--     condition that the app is public and links back to isthereanydeal.com.
--
-- PS Plus and Nintendo Switch Online are deliberately absent: neither has a
-- data source that is not scraping (9.2, 9.3), so the app will say nothing
-- about them rather than say something it made up.
--
-- What the job writes and what the app reads are the same rows. Nothing here
-- is per-user: "Hades is on Game Pass" is a fact about Hades, so this table is
-- shaped and secured exactly like the other catalog tables -- readable by every
-- signed-in user, writable by nobody but the service role.

-- 1. The table ----------------------------------------------------------------
-- One row per (game, service, region). The row is the *relationship*, not an
-- observation of it: `first_seen_at` and `last_seen_at` bracket how long we
-- have watched it, and `removed_at` is how it ends.
--
-- History is kept. A game that leaves Game Pass keeps its row with
-- `removed_at` set, because "left the service in March" is worth more than a
-- missing row, and because a game that comes back should not lose the fact
-- that it was there before. Nothing in this schema ever deletes a row; the
-- only delete is the cascade from the catalog.
--
-- `removed_at is null` therefore means "on the service right now", and it is
-- the only condition the read side ever applies.

create table public.game_availability (
  media_item_id uuid not null references public.media_items (id) on delete cascade,
  service text not null,
  region text not null default 'US',
  source_ref text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (media_item_id, service, region)
);

comment on table public.game_availability is
  'Which subscription services a game is on, filled nightly by the `availability` command in packages/catalog. Written only by the service role; readable by every signed-in user. Rows are never deleted: a game that leaves a service keeps its row with removed_at set.';

comment on column public.game_availability.service is
  'The service, as an id the app maps to a display name. V1 writes game_pass_console, game_pass_pc, ea_play and geforce_now, plus itad:<slug> for anything IsThereAnyDeal reports (itad:game-pass, itad:ubisoft, ...).';

comment on column public.game_availability.region is
  'Two-letter market this row was observed in. Game Pass is queried per market and GeForce NOW and IsThereAnyDeal both take a locale or country, so availability is a per-region fact; V1 asks every source for US only and therefore stores nothing else. The column exists now so adding a second market later is a job change and not a migration.';

comment on column public.game_availability.source_ref is
  'The source''s own id for the game: the Microsoft Store product id, the GeForce NOW entry id, or the IsThereAnyDeal game id. Kept so a row can be traced back to what produced it, and so a later run can tell "the same game" from "a second product with the same title".';

comment on column public.game_availability.first_seen_at is
  'The first run that saw this game on this service in this region. Never rewritten, not even when a removed game comes back, so it stays the honest answer to "since when".';

comment on column public.game_availability.last_seen_at is
  'The most recent run that saw it. Every row one run writes carries that run''s single timestamp, which is what makes the reconciliation below exact.';

comment on column public.game_availability.removed_at is
  'When a run first failed to find the game on the service. Null means it is there now, and that is the only condition the read side applies. A game that returns has this cleared and keeps its original first_seen_at.';

-- 2. Indexes ------------------------------------------------------------------
-- The question the app asks: "what is this game on right now", one game at a
-- time on the game page and a handful at a time on a list row.
--
-- The primary key already leads with media_item_id, so what this index adds is
-- the two things the key cannot: the partial predicate, which keeps every row
-- of every game that ever left a service out of the scan entirely, and the
-- payload, which makes the read index-only. A game page's availability strip
-- then never touches the heap.

create index game_availability_current
  on public.game_availability (media_item_id)
  include (service, region, first_seen_at)
  where removed_at is null;

-- The job's own question, which is the mirror image: "everything currently on
-- this service", asked once per service per run to close out what it no longer
-- sees. Without it that update is a sequential scan of the whole table every
-- night.

create index game_availability_service_current
  on public.game_availability (service, region)
  where removed_at is null;

-- 3. Row Level Security -------------------------------------------------------
-- The same shape as `external_scores` in the core schema: readable by every
-- signed-in user, written by nobody but the service role, which bypasses RLS
-- the way the IGDB mirror does. There is deliberately no insert, update or
-- delete policy, so there is no way for a client to invent an availability row
-- or to bring a removed one back.
--
-- The grants are narrower than Supabase's defaults but wider than
-- `player_counts`', and the difference is deliberate. Supabase hands `anon` and
-- `authenticated` full DML on a new table in `public`; taking the write
-- privileges away makes "read-only" true of the privilege as well as of the
-- policy, and makes it something the pgTAP suite can assert directly.
--
-- `anon` keeps the SELECT privilege, though, and gets no policy. The two are
-- not the same refusal: revoking the privilege makes a signed-out read an
-- error, while an absent policy makes it an empty set. The catalog tables in
-- the core schema behave the second way, and so should this -- a game page
-- opened before sign-in should find nothing to draw, not a permission failure
-- it has to special-case. The rows are just as closed either way.

alter table public.game_availability enable row level security;

create policy "availability is readable by signed-in users" on public.game_availability
  for select to authenticated using (true);

revoke all on public.game_availability from anon, authenticated;
grant select on public.game_availability to anon, authenticated;
