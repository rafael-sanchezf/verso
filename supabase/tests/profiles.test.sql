-- pgTAP tests for supabase/migrations/20260916120000_profiles_from_auth_metadata.sql
-- and for the `profiles` policies and constraints the core schema put there.
-- Run with: supabase test db
--
-- Three things are under test.
--
-- 1. **The seed.** Six users go into `auth.users` with six shapes of provider
--    metadata -- Google's full shape, the plain OIDC shape, none at all, and
--    the empty-string shapes in between -- and the assertions are what the
--    trigger made of each. The negative half matters as much as the positive
--    half: `username` stays null for everyone and no email reaches any column,
--    because `profiles` is readable by every signed-in user.
--
-- 2. **The constraints.** The username pattern and the unique index, exercised
--    through a signed-in user rather than as the owner, because that is who
--    will hit them from the Settings screen.
--
-- 3. **The policies.** One user can read another's profile (the social layer
--    needs it) and cannot write it, cannot insert one, and cannot delete one:
--    the row belongs to the trigger from creation to cascade.
--
-- Everything after the fixtures acts as a user through `set local role
-- authenticated` plus a forged `request.jwt.claims`, the same way
-- rls.test.sql and backlog_ordering.test.sql do, so every write below goes
-- through Row Level Security exactly as a supabase-js call would.

begin;
select plan(45);

-- Structure -------------------------------------------------------------------
-- The migration replaces a function the core schema created and leaves its
-- trigger alone. These four assertions are what "leaves its trigger alone"
-- means, and they are the ones that would catch a future migration that
-- recreated the function without its security properties.

select has_function('public', 'handle_new_user', array[]::text[], 'handle_new_user exists');

select is_definer(
  'public', 'handle_new_user', array[]::text[],
  'handle_new_user is still security definer: it writes public on behalf of the auth admin'
);

select is(
  (select p.proconfig
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user'),
  array['search_path=public'],
  'handle_new_user keeps its fixed search_path, so a definer function cannot be hijacked by one'
);

select has_trigger(
  'auth', 'users', 'on_auth_user_created',
  'the trigger name from the core schema survived the replace'
);

select is(
  (select count(*) from pg_trigger
    where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created'),
  1::bigint,
  'and there is exactly one of it: create or replace did not leave a second trigger behind'
);

-- Fixtures --------------------------------------------------------------------
-- Six sign-ups, six shapes of raw_user_meta_data.
--
--   a  Google's full shape: full_name and name, avatar_url and picture.
--   b  the plain OIDC shape: name and picture only.
--   c  an email sign-up: metadata present but empty.
--   d  no metadata at all.
--   e  every key present and blank.
--   f  the first key of each pair blank, the second one real.

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'ada@example.com', jsonb_build_object(
     'iss', 'https://accounts.google.com',
     'sub', '104729',
     'email', 'ada@example.com',
     'email_verified', true,
     'provider_id', '104729',
     'full_name', 'Ada Lovelace',
     'name', 'Ada L',
     'avatar_url', 'https://lh3.googleusercontent.com/ada-avatar-url',
     'picture', 'https://lh3.googleusercontent.com/ada-picture')),
  ('00000000-0000-0000-0000-00000000000b', 'grace@example.com', jsonb_build_object(
     'email', 'grace@example.com',
     'name', 'Grace Hopper',
     'picture', 'https://lh3.googleusercontent.com/grace-picture')),
  ('00000000-0000-0000-0000-00000000000c', 'plain@example.com', '{}'::jsonb),
  ('00000000-0000-0000-0000-00000000000d', 'none@example.com', null),
  ('00000000-0000-0000-0000-00000000000e', 'blank@example.com', jsonb_build_object(
     'full_name', '', 'name', '', 'avatar_url', '', 'picture', '')),
  ('00000000-0000-0000-0000-00000000000f', 'mixed@example.com', jsonb_build_object(
     'full_name', '', 'name', 'Mixed Case',
     'avatar_url', '', 'picture', 'https://lh3.googleusercontent.com/mixed-picture'));

-- The seed --------------------------------------------------------------------

select is(
  (select count(*) from public.profiles
    where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b',
                 '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d',
                 '00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-00000000000f')),
  6::bigint,
  'the trigger still creates one profile per user, whatever the metadata says'
);

select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'Ada Lovelace',
  'a Google sign-up takes its display name from full_name, which wins over name'
);

select is(
  (select avatar_url from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'https://lh3.googleusercontent.com/ada-avatar-url',
  'and its avatar from avatar_url, which wins over picture'
);

select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b'),
  'Grace Hopper',
  'a provider that sends only the plain OIDC name falls back to it'
);

select is(
  (select avatar_url from public.profiles where id = '00000000-0000-0000-0000-00000000000b'),
  'https://lh3.googleusercontent.com/grace-picture',
  'and to picture for the avatar'
);

select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000c'),
  null::text,
  'an email sign-up, whose metadata is an empty object, gets a null display name'
);

select is(
  (select avatar_url from public.profiles where id = '00000000-0000-0000-0000-00000000000c'),
  null::text,
  'and a null avatar'
);

select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000d'),
  null::text,
  'no metadata at all is not an error and gives a null display name'
);

select is(
  (select avatar_url from public.profiles where id = '00000000-0000-0000-0000-00000000000d'),
  null::text,
  'and a null avatar'
);

select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000e'),
  null::text,
  'a blank display name is stored as null, not as an empty string that renders as a blank line'
);

select is(
  (select avatar_url from public.profiles where id = '00000000-0000-0000-0000-00000000000e'),
  null::text,
  'and a blank avatar url is stored as null, so the placeholder circle shows'
);

select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000f'),
  'Mixed Case',
  'a blank first key falls through to the second rather than swallowing it'
);

select is(
  (select avatar_url from public.profiles where id = '00000000-0000-0000-0000-00000000000f'),
  'https://lh3.googleusercontent.com/mixed-picture',
  'and the same for the avatar pair'
);

-- What must not be copied ------------------------------------------------------

select is(
  (select count(*) from public.profiles
    where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b',
                 '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d',
                 '00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-00000000000f')
      and username is not null),
  0::bigint,
  'no sign-up gets a username: it is unique, and inventing a handle for someone is not ours to do'
);

select is(
  (select count(*) from public.profiles
    where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b',
                 '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d',
                 '00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-00000000000f')
      and (coalesce(display_name, '') like '%@%'
        or coalesce(username, '') like '%@%'
        or coalesce(avatar_url, '') like '%@%')),
  0::bigint,
  'no email reaches profiles, which every signed-in user can read'
);

select is(
  (select count(*) from public.profiles
    where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b',
                 '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d',
                 '00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-00000000000f')
      and created_at is null),
  0::bigint,
  'every profile is stamped, so the Profile screen has a joined date'
);

-- The username constraints, from where a user meets them ------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select throws_ok(
  $$ update public.profiles set username = 'Ada' where id = auth.uid() $$,
  '23514',
  null,
  'the username check rejects a capital letter'
);

select throws_ok(
  $$ update public.profiles set username = 'ad' where id = auth.uid() $$,
  '23514',
  null,
  'and a username under three characters'
);

select throws_ok(
  $$ update public.profiles set username = repeat('a', 25) where id = auth.uid() $$,
  '23514',
  null,
  'and a username over twenty-four'
);

select throws_ok(
  $$ update public.profiles set username = 'ada-lovelace' where id = auth.uid() $$,
  '23514',
  null,
  'and anything outside lowercase letters, digits, and underscore'
);

select throws_ok(
  $$ update public.profiles set username = 'ada lovelace' where id = auth.uid() $$,
  '23514',
  null,
  'including a space, which is what a phone keyboard offers first'
);

select lives_ok(
  $$ update public.profiles set username = 'ada_lovelace' where id = auth.uid() $$,
  'a username that fits the pattern is accepted'
);

select is(
  (select username from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'ada_lovelace',
  'and it is what lands in the row'
);

select lives_ok(
  $$ update public.profiles set username = null where id = auth.uid() $$,
  'a null username is allowed: the check only constrains a value that is there'
);

select lives_ok(
  $$ update public.profiles set username = 'ada_lovelace' where id = auth.uid() $$,
  'and it can be taken again after being cleared'
);

-- A signed-in user owns their three fields --------------------------------------

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select throws_ok(
  $$ update public.profiles set username = 'ada_lovelace' where id = auth.uid() $$,
  '23505',
  null,
  'the unique constraint refuses a username someone else already holds'
);

select is(
  (select username from public.profiles where id = '00000000-0000-0000-0000-00000000000b'),
  null::text,
  'and the refused write left the row alone'
);

select lives_ok(
  $$ update public.profiles
        set display_name = 'Grace B. Hopper',
            username = 'amazing_grace',
            avatar_url = 'https://example.com/grace.png'
      where id = auth.uid() $$,
  'a signed-in user can update their own display name, username, and avatar'
);

select results_eq(
  $$ select display_name, username, avatar_url from public.profiles where id = auth.uid() $$,
  $$ values ('Grace B. Hopper'::text, 'amazing_grace'::text, 'https://example.com/grace.png'::text) $$,
  'and all three land'
);

select throws_ok(
  $$ update public.profiles set id = '00000000-0000-0000-0000-00000000000a' where id = auth.uid() $$,
  '42501',
  null,
  'but not their id: the with check clause refuses a row that would belong to someone else'
);

-- One user cannot write another user's profile ----------------------------------

select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'Ada Lovelace',
  'user B can read user A profile: the social layer needs every profile readable'
);

update public.profiles
   set display_name = 'hacked', username = 'stolen', avatar_url = 'https://example.com/evil.png'
 where id = '00000000-0000-0000-0000-00000000000a';

select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'Ada Lovelace',
  'user B cannot update user A display name'
);

select is(
  (select username from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'ada_lovelace',
  'nor their username'
);

select is(
  (select avatar_url from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'https://lh3.googleusercontent.com/ada-avatar-url',
  'nor their avatar'
);

select throws_ok(
  $$ insert into public.profiles (id) values ('00000000-0000-0000-0000-0000000000cc') $$,
  '42501',
  null,
  'and nobody inserts a profile: there is no insert policy, the trigger owns creation'
);

delete from public.profiles where id = auth.uid();

select is(
  (select count(*) from public.profiles
    where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b',
                 '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d',
                 '00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-00000000000f')),
  6::bigint,
  'nor deletes one, their own included: a profile lives as long as the auth user does'
);

-- Signed out --------------------------------------------------------------------

set local role anon;

select is(
  (select count(*) from public.profiles),
  0::bigint,
  'signed out, no profile is readable: every policy on the table is to authenticated'
);

-- And back outside RLS: the writes that landed are real, the ones that did not are not.

reset role;
reset request.jwt.claims;

select results_eq(
  $$ select id, display_name, username, avatar_url
       from public.profiles
      where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')
      order by id $$,
  $$ values
     ('00000000-0000-0000-0000-00000000000a'::uuid, 'Ada Lovelace'::text, 'ada_lovelace'::text,
      'https://lh3.googleusercontent.com/ada-avatar-url'::text),
     ('00000000-0000-0000-0000-00000000000b'::uuid, 'Grace B. Hopper'::text, 'amazing_grace'::text,
      'https://example.com/grace.png'::text) $$,
  'read without RLS, both rows are exactly what their owners left them as'
);

select is(
  (select count(*) from public.profiles
    where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b',
                 '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d',
                 '00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-00000000000f')),
  6::bigint,
  'and every profile is still there'
);

-- The cascade from the core schema still holds: the profile goes when the user does.

delete from auth.users where id = '00000000-0000-0000-0000-00000000000f';

select is(
  (select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000f'),
  0::bigint,
  'deleting the auth user takes the profile with it'
);

select * from finish();
rollback;
