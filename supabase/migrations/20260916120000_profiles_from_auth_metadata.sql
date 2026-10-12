-- Seed a new profile from the identity provider's metadata.
--
-- Google login joined email auth on 2026-09-16 (ROADMAP.md, "Next session",
-- item 4 of the earlier list). A Google account already knows the person's name
-- and picture, and asking them to type both again on first launch is the kind of
-- friction the sign-in flow was built to avoid. So the trigger that already
-- creates the row now fills in what the provider handed over.
--
-- Where the values come from. `auth.users.raw_user_meta_data` is whatever the
-- provider put in the OIDC claims, so the spelling differs between them: Google
-- sends both `full_name` and `name`, and both `avatar_url` and `picture`;
-- others send only the plain OIDC `name` and `picture`. Hence one coalesce per
-- column, Supabase's own spelling first. An empty string is treated as absent,
-- because a blank display name renders as a blank line rather than as the
-- fallback the Profile screen has for null (docs/design/specs/profile.md,
-- "Data": name is `displayName`, else the email's local part).
--
-- What is deliberately not copied. Only these two columns are seeded. The email
-- is not among them and must never be: `profiles` is readable by every
-- signed-in user (`profiles are readable by signed-in users` in the core
-- schema), so anything written here is public to the whole app, and an address
-- that leaked into `display_name` could not be unpublished. Everything else the
-- provider sends -- `email_verified`, `iss`, `sub`, `provider_id` -- belongs to
-- `auth.users` and stays there. `username` is left null on purpose: it is the
-- one field with a uniqueness rule, nobody's Google name fits the handle
-- pattern, and inventing one for the user would be rule 9 in reverse. The user
-- picks it in Settings through `updateMyProfile`.
--
-- An email sign-up has no metadata at all, so both columns come out null and
-- the behaviour is exactly what it was before this migration.
--
-- `create or replace` keeps the trigger `on_auth_user_created` from the core
-- schema pointing at this function: the trigger is not dropped and not
-- recreated, so no sign-up can slip through an uncovered moment. Still
-- `security definer` with a fixed `search_path`, for the same reason as before:
-- it is called by the auth admin role, which has no business writing `public`
-- on its own, and a definer function without a pinned search_path is a
-- privilege-escalation hole.
--
-- See supabase/migrations/20260909000000_core_schema.sql for the table, its
-- policies, and the original function.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', '')
    ),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
      nullif(new.raw_user_meta_data ->> 'picture', '')
    )
  );
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates the public.profiles row for a new auth user, seeding display_name and avatar_url from the provider metadata when it is there. Never copies the email.';
