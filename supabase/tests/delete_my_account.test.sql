-- pgTAP tests for supabase/migrations/20260916200000_delete_my_account.sql.
-- Run with: supabase test db
--
-- The function is one statement long and everything interesting about it is
-- what that statement drags behind it, so this suite is mostly about the blast
-- radius in both directions.
--
-- 1. **Structure.** It is `security definer` with a pinned `search_path`, which
--    is what lets it write a table no application role may touch and what stops
--    a client redirecting its name resolution. `anon` has no execute privilege
--    and `authenticated` does. These assertions are the ones that would catch a
--    later migration recreating the function without its properties.
--
-- 2. **The cascade, listed table by table.** Two users, each with entries, a
--    ranking, a comparison, a platform link, and a list with an item in it.
--    User A calls the function; every one of A's rows is gone and every one of
--    B's is untouched. The tables are asserted one by one rather than in a
--    single count, because "an account was deleted and one table kept its rows"
--    is the failure worth naming precisely: a future table that references a
--    user without `on delete cascade` fails here rather than quietly outliving
--    its owner.
--
-- 3. **Who may call it.** Signed out is a permission error, not a no-op; an
--    authenticated request with no user behind it raises 28000 rather than
--    deleting something arbitrary.
--
-- Users act through `set local role authenticated` plus a forged
-- request.jwt.claims, the way rls.test.sql and profiles.test.sql do, so the
-- call goes through the grants and Row Level Security exactly as a supabase-js
-- rpc() would.

begin;
select plan(29);

-- Structure -------------------------------------------------------------------

select has_function(
  'public', 'delete_my_account', array[]::text[],
  'delete_my_account exists and takes no arguments: it works on auth.uid() alone'
);

select is_definer(
  'public', 'delete_my_account', array[]::text[],
  'it is security definer: auth.users belongs to the auth admin and no application role may write it'
);

select is(
  (select p.proconfig
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_my_account'),
  array['search_path=public'],
  'and its search_path is pinned, so a definer function cannot be pointed at another schema'
);

select is(
  has_function_privilege('anon', 'public.delete_my_account()', 'execute'),
  false,
  'anon cannot execute it: there is no account to delete signed out'
);

select is(
  has_function_privilege('authenticated', 'public.delete_my_account()', 'execute'),
  true,
  'a signed-in user can'
);

-- Fixtures --------------------------------------------------------------------
-- Two users with the same shape of data, so every assertion below is really
-- "A's row went and B's identical row stayed".

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'gone@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'stays@example.com');

insert into public.media_items (id, medium, title, year) values
  ('00000000-0000-0000-0000-0000000000f1', 'game', 'Hades', 2020),
  ('00000000-0000-0000-0000-0000000000f2', 'game', 'Celeste', 2018);

insert into public.game_details (media_item_id, igdb_id, genres, platforms) values
  ('00000000-0000-0000-0000-0000000000f1', 1, '{roguelike}', '{PC}'),
  ('00000000-0000-0000-0000-0000000000f2', 2, '{platformer}', '{PC}');

insert into public.user_entries (user_id, media_item_id, status) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', 'played'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f2', 'backlog'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000f1', 'played');

insert into public.ranking_entries (user_id, medium, tier, media_item_id, position) values
  ('00000000-0000-0000-0000-00000000000a', 'game', 'loved', '00000000-0000-0000-0000-0000000000f1', 0),
  ('00000000-0000-0000-0000-00000000000b', 'game', 'loved', '00000000-0000-0000-0000-0000000000f1', 0);

insert into public.comparisons (user_id, medium, item_a, item_b, outcome) values
  ('00000000-0000-0000-0000-00000000000a', 'game',
   '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2', 'a'),
  ('00000000-0000-0000-0000-00000000000b', 'game',
   '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2', 'b');

insert into public.platform_links (user_id, platform, external_user_id) values
  ('00000000-0000-0000-0000-00000000000a', 'steam', '76561197960287930'),
  ('00000000-0000-0000-0000-00000000000b', 'steam', '76561197960287931');

insert into public.lists (id, user_id, name) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'Comfort games'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000b', 'Comfort games');

insert into public.list_items (list_id, media_item_id, position) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000f1', 0),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000f1', 0);

-- Both accounts are real before anything is deleted, or every assertion after
-- the call would pass against a fixture that never landed.

select is(
  (select count(*) from public.user_entries where user_id = '00000000-0000-0000-0000-00000000000a'),
  2::bigint,
  'user A starts with two entries'
);

select is(
  (select count(*) from public.profiles
    where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')),
  2::bigint,
  'and both users have the profile the signup trigger made'
);

-- Signed out --------------------------------------------------------------------
-- Before the deletion, because it must be a permission error rather than a call
-- that quietly finds no user.

set local role anon;

select throws_ok(
  'select public.delete_my_account()',
  '42501',
  null,
  'signed out, the call is refused by the grant rather than by the function body'
);

-- Signed in with no user behind the token ---------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"role":"authenticated"}';

select throws_ok(
  'select public.delete_my_account()',
  '28000',
  'delete_my_account requires an authenticated user',
  'a request with no sub claim raises 28000 rather than deleting something arbitrary'
);

-- User A deletes their account ---------------------------------------------------

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok(
  'select public.delete_my_account()',
  'a signed-in user can delete their own account'
);

-- Read the result without RLS: the rows have to be gone from the database, not
-- merely invisible to a policy.

reset role;
reset request.jwt.claims;

select is(
  (select count(*) from auth.users where id = '00000000-0000-0000-0000-00000000000a'),
  0::bigint,
  'the auth user is gone, which is what ends the session on the server'
);

select is(
  (select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  0::bigint,
  'the profile went with it'
);

select is(
  (select count(*) from public.user_entries where user_id = '00000000-0000-0000-0000-00000000000a'),
  0::bigint,
  'both entries went with it'
);

select is(
  (select count(*) from public.ranking_entries where user_id = '00000000-0000-0000-0000-00000000000a'),
  0::bigint,
  'the ranking went with it'
);

select is(
  (select count(*) from public.comparisons where user_id = '00000000-0000-0000-0000-00000000000a'),
  0::bigint,
  'the comparison log went with it: it is the durable asset, and it is theirs'
);

select is(
  (select count(*) from public.platform_links where user_id = '00000000-0000-0000-0000-00000000000a'),
  0::bigint,
  'the platform link went with it'
);

select is(
  (select count(*) from public.lists where user_id = '00000000-0000-0000-0000-00000000000a'),
  0::bigint,
  'the list went with it'
);

select is(
  (select count(*) from public.list_items where list_id = '00000000-0000-0000-0000-0000000000c1'),
  0::bigint,
  'and the items in that list, which cascade through the list rather than from the user'
);

-- User B is untouched --------------------------------------------------------------

select is(
  (select count(*) from auth.users where id = '00000000-0000-0000-0000-00000000000b'),
  1::bigint,
  'user B still exists'
);

select is(
  (select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000b'),
  1::bigint,
  'with their profile'
);

select is(
  (select count(*) from public.user_entries where user_id = '00000000-0000-0000-0000-00000000000b'),
  1::bigint,
  'their entry'
);

select is(
  (select count(*) from public.ranking_entries where user_id = '00000000-0000-0000-0000-00000000000b'),
  1::bigint,
  'their ranking'
);

select is(
  (select count(*) from public.comparisons where user_id = '00000000-0000-0000-0000-00000000000b'),
  1::bigint,
  'their comparison'
);

select is(
  (select count(*) from public.platform_links where user_id = '00000000-0000-0000-0000-00000000000b'),
  1::bigint,
  'their platform link'
);

select is(
  (select count(*) from public.lists where user_id = '00000000-0000-0000-0000-00000000000b'),
  1::bigint,
  'their list'
);

select is(
  (select count(*) from public.list_items where list_id = '00000000-0000-0000-0000-0000000000c2'),
  1::bigint,
  'and the item in it'
);

-- The catalog is not the user's to delete ------------------------------------------

select is(
  (select count(*) from public.media_items
    where id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2')),
  2::bigint,
  'the catalog rows both users pointed at are still there: they belong to IGDB, not to an account'
);

-- One call, one caller ---------------------------------------------------------------
-- There is no argument to pass, which is the guarantee. This is the other half
-- of it: B calling the same function after A is gone deletes B, not a user the
-- function remembered.

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select lives_ok(
  'select public.delete_my_account()',
  'user B can delete their own account too'
);

reset role;
reset request.jwt.claims;

select is(
  (select count(*) from public.user_entries
    where user_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')),
  0::bigint,
  'and neither fixture user has an entry left: each call deleted its own caller'
);

select * from finish();
rollback;
