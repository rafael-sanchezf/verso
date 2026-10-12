/**
 * Deleting the account, which is the one write in this package that cannot be
 * undone.
 *
 * App Store guideline 5.1.1(v) requires an app that creates accounts to let
 * them be deleted from inside the app, so this ships before the first
 * submission. What it deletes is everything: the `auth.users` row, and by
 * cascade the profile, every entry, the whole ranking, the comparison log, the
 * platform links, and the lists
 * (supabase/migrations/20260916200000_delete_my_account.sql).
 *
 * It is one RPC rather than an admin call because there is no admin here. The
 * app talks to Supabase directly with the anon key, `auth.users` belongs to the
 * auth admin, and the service role key is not on the device and must never be
 * -- so the delete lives in a `security definer` function that takes no
 * arguments and works on `auth.uid()`. A caller can only ever delete
 * themselves, whatever they send.
 *
 * Then the sign-out, which is not a nicety. The row behind the session is gone
 * by the time the RPC returns, but the device still holds the access token it
 * used, and it stays syntactically valid until it expires. Without a local
 * sign-out the app would sit in a signed-in state whose every request fails,
 * which reads as "deleting my account broke the app" rather than "my account is
 * gone". `scope: 'local'` because there is no server session left to revoke:
 * the refresh token went with the user, so the default scope would be asking
 * the server to end something it has already destroyed.
 *
 * Like the writers in `entries.ts` this throws rather than returning a result:
 * a failure is a dead network or a bug, and the screen has one line of copy for
 * all of them.
 */

import type { Client } from './client';
import { NotSignedInError } from './entries';

/**
 * Delete the caller's account and everything they own, then forget the session
 * on this device.
 *
 * Throws `NotSignedInError` when there is no session, and the PostgrestError
 * when the RPC fails. A failed sign-out after a successful delete does not
 * throw: the account is already gone, the tokens are already dead, and the
 * session store flipping is what the screen is waiting for. It is not silent
 * either -- the error goes to the log, because "the account deleted but this
 * device still thinks it is signed in" is worth being able to find.
 */
export async function deleteMyAccount(client: Client): Promise<void> {
  const { data, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!data.session) throw new NotSignedInError('deleteMyAccount');

  const { error } = await client.rpc('delete_my_account');
  if (error) throw error;

  const { error: signOutError } = await client.auth.signOut({ scope: 'local' });
  if (signOutError) {
    console.error('[account] the account was deleted but the stored session was not cleared', signOutError);
  }
}
