-- pgTAP tests for supabase/migrations/20261008202000_watch_settings.sql.
-- Run with: supabase test db
--
-- Two things are under test:
--
-- 1. **The columns**: profiles.watch_region and profiles.watch_provider_ids,
--    their types, defaults and checks.
-- 2. **Two users**: the owner writes their own through the existing update
--    policy; another user cannot, and reads them as they read platforms.
--
-- Users act through `set local role authenticated` plus a forged
-- request.jwt.claims. Ids are in the ...b3 range.

begin;
select plan(19);

-- ==============================================================================
-- 1. Structure
-- ==============================================================================

-- 1
select has_column('public', 'profiles', 'watch_region', 'profiles has watch_region');

-- 2
select col_type_is('public', 'profiles', 'watch_region', 'text', 'watch_region is text');

-- 3
select col_not_null('public', 'profiles', 'watch_region', 'watch_region is not null');

-- 4
select col_default_is('public', 'profiles', 'watch_region', 'US', 'watch_region defaults to US, the one region the mirror stores');

-- 5
select has_column('public', 'profiles', 'watch_provider_ids', 'profiles has watch_provider_ids');

-- 6
select col_type_is('public', 'profiles', 'watch_provider_ids', 'integer[]', 'watch_provider_ids is integer[]: watch_providers.provider_id');

-- 7
select col_not_null('public', 'profiles', 'watch_provider_ids', 'watch_provider_ids is not null');

-- 8
select col_default_is('public', 'profiles', 'watch_provider_ids', '{}', 'watch_provider_ids defaults to empty: not answered');

-- ==============================================================================
-- Fixtures
-- ==============================================================================

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000b30aa', 'watch-a@example.com'),
  ('00000000-0000-0000-0000-0000000b30bb', 'watch-b@example.com');

-- 9
select results_eq(
  $$ select watch_region, watch_provider_ids from public.profiles where id = '00000000-0000-0000-0000-0000000b30aa' $$,
  $$ values ('US'::text, '{}'::integer[]) $$,
  'a new account watches in US on no services yet'
);

-- ==============================================================================
-- 2. The owner, then another user
-- ==============================================================================

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000b30aa","role":"authenticated"}';

update public.profiles
   set watch_region = 'GB', watch_provider_ids = array[8, 337, 1899]
 where id = '00000000-0000-0000-0000-0000000b30aa';

-- 10
select results_eq(
  $$ select watch_region, watch_provider_ids from public.profiles where id = '00000000-0000-0000-0000-0000000b30aa' $$,
  $$ values ('GB'::text, array[8, 337, 1899]) $$,
  'the owner writes their region and services through the existing update policy'
);

-- 11
select throws_ok(
  $$ update public.profiles set watch_region = 'gb' where id = '00000000-0000-0000-0000-0000000b30aa' $$,
  '23514',
  null,
  'a region in lowercase is refused: the mirror writes capitals'
);

-- 12
select throws_ok(
  $$ update public.profiles set watch_region = 'GBR' where id = '00000000-0000-0000-0000-0000000b30aa' $$,
  '23514',
  null,
  'a three-letter code is refused: alpha-2 only'
);

-- 13
select throws_ok(
  $$ update public.profiles set watch_region = null where id = '00000000-0000-0000-0000-0000000b30aa' $$,
  '23502',
  null,
  'a null region is refused'
);

-- 14
select throws_ok(
  $$ update public.profiles set watch_provider_ids = array[8, null] where id = '00000000-0000-0000-0000-0000000b30aa' $$,
  '23514',
  null,
  'a null provider id is refused'
);

-- 15
select throws_ok(
  $$ update public.profiles set watch_provider_ids = array[0] where id = '00000000-0000-0000-0000-0000000b30aa' $$,
  '23514',
  null,
  'a provider id of 0 or less is refused'
);

-- 16
select throws_ok(
  $$ update public.profiles set watch_provider_ids = array(select generate_series(1, 101)) where id = '00000000-0000-0000-0000-0000000b30aa' $$,
  '23514',
  null,
  'more than 100 services is refused'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000b30bb","role":"authenticated"}';

update public.profiles
   set watch_region = 'FR', watch_provider_ids = array[1]
 where id = '00000000-0000-0000-0000-0000000b30aa';

-- 17
select results_eq(
  $$ select watch_region, watch_provider_ids from public.profiles where id = '00000000-0000-0000-0000-0000000b30aa' $$,
  $$ values ('GB'::text, array[8, 337, 1899]) $$,
  'another user cannot write A''s region or services, and reads them as they read A''s platforms'
);

update public.profiles
   set watch_provider_ids = array[9]
 where id = '00000000-0000-0000-0000-0000000b30bb';

-- 18
select is(
  (select watch_provider_ids from public.profiles where id = '00000000-0000-0000-0000-0000000b30bb'),
  array[9],
  'B writes B''s own'
);

reset role;

-- 19
select is(
  (select watch_region from public.profiles where id = '00000000-0000-0000-0000-0000000b30bb'),
  'US',
  'and B''s region stays at its default when only the services were written'
);

select * from finish();
rollback;
