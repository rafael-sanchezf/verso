/**
 * What an auth failure says on screen.
 *
 * `AuthError.message` is Supabase's own wording: written for developers, not
 * translated, and occasionally alarming ("Invalid login credentials"). So the
 * kinds a user can actually cause get our sentence, and anything else falls
 * through to the message, because a vague "Something went wrong" on an error we
 * did not anticipate is worse than a technical one that can be searched for.
 */

import type { AuthError } from '@verso/api';

import { t } from '@/lib/i18n';

export function authErrorMessage(error: AuthError): string {
  switch (error.kind) {
    case 'invalid-credentials':
      // Deliberately covers both a wrong password and an unknown address:
      // Supabase does not distinguish them, so that an attacker cannot use the
      // form to find out which addresses have accounts.
      return t('signIn.errors.wrongEmailOrPassword');
    case 'email-already-registered':
      return t('signIn.errors.alreadyRegistered');
    case 'network':
      return t('signIn.errors.checkConnection');
    default:
      return error.message;
  }
}

/** Supabase's own floor, and what the hint under the field promises. */
export const MIN_PASSWORD_LENGTH = 8;
