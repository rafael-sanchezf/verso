-- pgTAP tests for the core schema's Row Level Security.
-- Run with: supabase test db
begin;
select plan(21);

-- 1. RLS is enabled on every table.
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS on profiles');
select ok((select relrowsecurity from pg_class where oid = 'public.media_items'::regclass), 'RLS on media_items');
select ok((select relrowsecurity from pg_class where oid = 'public.game_details'::regclass), 'RLS on game_details');
select ok((select relrowsecurity from pg_class where oid = 'public.external_scores'::regclass), 'RLS on external_scores');
select ok((select relrowsecurity from pg_class where oid = 'public.user_entries'::regclass), 'RLS on user_entries');
select ok((select relrowsecurity from pg_class where oid = 'public.ranking_entries'::regclass), 'RLS on ranking_entries');
select ok((select relrowsecurity from pg_class where oid = 'public.comparisons'::regclass), 'RLS on comparisons');
select ok((select relrowsecurity from pg_class where oid = 'public.platform_links'::regclass), 'RLS on platform_links');
select ok((select relrowsecurity from pg_class where oid = 'public.lists'::regclass), 'RLS on lists');
select ok((select relrowsecurity from pg_class where oid = 'public.list_items'::regclass), 'RLS on list_items');

-- 2. Behavior: two users, two catalog items.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

select is(
  (select count(*) from public.profiles where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')),
  2::bigint,
  'profile rows are created by trigger'
);

insert into public.media_items (id, medium, title, year) values
  ('00000000-0000-0000-0000-0000000000f1', 'game', 'Hades', 2020),
  ('00000000-0000-0000-0000-0000000000f2', 'game', 'Celeste', 2018);

-- Act as user A.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok(
  $$ insert into public.user_entries (user_id, media_item_id, status)
     values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', 'played') $$,
  'user A can insert their own entry'
);

select throws_ok(
  $$ insert into public.user_entries (user_id, media_item_id, status)
     values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000f1', 'played') $$,
  '42501',
  null,
  'user A cannot insert an entry for user B'
);

select is(
  (select count(*) from public.media_items
    where id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2')),
  2::bigint,
  'user A can read the catalog'
);

select throws_ok(
  $$ insert into public.media_items (medium, title) values ('game', 'Sneaky') $$,
  '42501',
  null,
  'user A cannot write the catalog'
);

select lives_ok(
  $$ insert into public.comparisons (user_id, medium, item_a, item_b, outcome)
     values ('00000000-0000-0000-0000-00000000000a', 'game',
             '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2', 'a') $$,
  'user A can append a comparison'
);

delete from public.comparisons where user_id = '00000000-0000-0000-0000-00000000000a';
select is((select count(*) from public.comparisons), 1::bigint, 'comparisons cannot be deleted by their owner');

-- Act as user B.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is((select count(*) from public.user_entries), 0::bigint, 'user B cannot see user A entries');
select is((select count(*) from public.comparisons), 0::bigint, 'user B cannot see user A comparisons');
select is(
  (select count(*) from public.profiles
    where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')),
  2::bigint,
  'user B can see profiles (social layer)'
);

update public.profiles set display_name = 'hacked' where id = '00000000-0000-0000-0000-00000000000a';
select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  null::text,
  'user B cannot update user A profile'
);

select * from finish();
rollback;
