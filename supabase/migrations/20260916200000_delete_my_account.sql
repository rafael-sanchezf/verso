-- In-app account deletion.
--
-- App Store guideline 5.1.1(v) requires any app that lets an account be created
-- to let it be deleted from inside the app: not an email to support, not a form
-- on a website, a control in the app that removes the account and the data
-- behind it. Verso creates accounts, so this ships before the first submission
-- (ROADMAP.md, "Next").
--
-- The whole deletion is one statement, `delete from auth.users`, because every
-- table that holds a user's data already points at that row with `on delete
-- cascade`. Confirmed against the core schema (20260909000000) at the time this
-- was written:
--
--   profiles.id              -> auth.users (id) on delete cascade
--   user_entries.user_id     -> auth.users (id) on delete cascade
--   ranking_entries.user_id  -> auth.users (id) on delete cascade
--   comparisons.user_id      -> auth.users (id) on delete cascade
--   platform_links.user_id   -> auth.users (id) on delete cascade
--   lists.user_id            -> auth.users (id) on delete cascade
--   list_items.list_id       -> public.lists (id) on delete cascade (so it goes with the list)
--
-- and no migration since has added a table that references a user. So there is
-- no `alter table ... on delete cascade` in this file: there was nothing
-- missing to add. `supabase/tests/delete_my_account.test.sql` asserts the
-- emptiness of all six tables after a call rather than trusting this list, so a
-- future table that forgets its cascade fails there rather than leaking rows
-- past a deletion.
--
-- Nothing is anonymised or kept: the catalog (`media_items`, `game_details`,
-- `external_scores`, `player_counts`, `game_availability`) belongs to IGDB and
-- Steam, not to the user, and holds nothing about them.
--
-- `security definer` is the point of the function. `auth.users` belongs to the
-- auth admin and no application role may write it, so the caller cannot run
-- this delete themselves -- which is exactly why the function takes no
-- arguments. It works on `auth.uid()` alone, so the only account a caller can
-- ever delete is their own, and `set search_path = public` pins name resolution
-- so a definer function cannot be pointed at someone else's table by a client
-- that sets its own search path.
--
--   28000  no authenticated user (the same code the ranking RPCs use)

create or replace function public.delete_my_account()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'delete_my_account requires an authenticated user';
  end if;

  -- Every user table cascades from here (see the header). Deleting the auth
  -- row also ends the session on the server: the refresh token goes with the
  -- user, so the access token the caller still holds expires and cannot be
  -- renewed.
  delete from auth.users where id = v_uid;
end;
$$;

comment on function public.delete_my_account() is
  'Delete the calling user''s account and, by cascade, every row they own. Required for in-app account deletion (App Store guideline 5.1.1(v)). Takes no arguments: it works on auth.uid(), so a caller can only ever delete themselves.';

-- Signed out there is no account to delete, and `anon` must not be able to
-- reach a definer function that writes auth.users at all. `service_role` is
-- deliberately not granted either: a backend that wants a user gone has the
-- admin API, and this function is the in-app path.
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
