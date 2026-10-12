-- pgTAP tests for the catalog mirror's indexes.
-- Run with: supabase test db
begin;
select plan(6);

-- 1. The unique index the upsert's conflict target is inferred from exists,
--    is unique, and is defined over exactly (medium, external_ids->>'igdb').
select ok(
  to_regclass('public.media_items_igdb_uniq') is not null,
  'media_items_igdb_uniq exists'
);

select ok(
  (select indisunique from pg_index where indexrelid = 'public.media_items_igdb_uniq'::regclass),
  'media_items_igdb_uniq is unique'
);

select matches(
  pg_get_indexdef('public.media_items_igdb_uniq'::regclass),
  'btree \(medium, .*external_ids ->> .igdb.::text',
  'media_items_igdb_uniq covers (medium, external_ids->>''igdb'')'
);

select ok(
  to_regclass('public.media_items_medium_refreshed_at') is not null,
  'media_items_medium_refreshed_at exists'
);

-- 2. Behavior: one catalog row per IGDB game.
insert into public.media_items (medium, title, external_ids)
  values ('game', 'Hades', '{"igdb": 113112}'::jsonb);

select throws_ok(
  $$ insert into public.media_items (medium, title, external_ids)
     values ('game', 'Hades (duplicate)', '{"igdb": 113112}'::jsonb) $$,
  '23505',
  null,
  'a second game row with the same IGDB id is rejected'
);

-- 3. The upsert the mirror actually runs is idempotent: the same IGDB id sent
--    twice updates in place rather than inserting again. Written as plain
--    statements because pgTAP cannot nest a data-modifying CTE in a subquery.
insert into public.media_items (medium, title, year, external_ids, metadata)
  values ('game', 'Hades (refreshed)', 2020, '{"igdb": 113112}'::jsonb, '{"game_type": 0}'::jsonb)
on conflict (medium, (external_ids->>'igdb')) do update
  set title = excluded.title,
      year = excluded.year,
      metadata = excluded.metadata;

select is(
  (select count(*) from public.media_items where external_ids->>'igdb' = '113112'),
  1::bigint,
  'the upsert conflict target resolves and leaves one row'
);

select * from finish();
rollback;
