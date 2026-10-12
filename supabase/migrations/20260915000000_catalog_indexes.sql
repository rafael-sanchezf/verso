-- Indexes the IGDB catalog mirror depends on. See packages/catalog.

-- The mirror upserts a whole page of games in one statement:
--
--   insert into public.media_items (...) select ... from jsonb_to_recordset($1)
--   on conflict (medium, (external_ids->>'igdb')) do update set ...
--
-- Postgres can only infer that conflict target from a unique index whose
-- definition matches it exactly, so this index is what makes the batch a
-- single round trip instead of 500 selects followed by 500 writes. It also
-- states the invariant the mirror relies on: one catalog row per IGDB game.
--
-- The expression is null for rows with no IGDB id (TMDB movies and TV later),
-- and unique indexes do not collide on nulls, so those rows are unaffected.
create unique index media_items_igdb_uniq
  on public.media_items (medium, ((external_ids->>'igdb')));

-- The nightly delta and any "what is stale" query read this ordering directly.
create index media_items_medium_refreshed_at
  on public.media_items (medium, refreshed_at desc);
