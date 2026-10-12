/**
 * Email auth. V0 is email only; Sign in with Apple arrives with Google login,
 * not before.
 *
 * These return a result instead of throwing, which is a deliberate break from
 * the ranking wrappers next door. An RPC that reports "this item is already
 * ranked" means the app has a bug, so throwing is right there. A wrong password
 * or an email that is already taken is the normal, expected outcome of a form,
 * and every one of them needs its own line of copy on screen. A returned
 * discriminated union makes the compiler check that a screen covered every
 * case; a thrown value is `unknown` inside a catch block and checks nothing.
 *
 * Every function here is total: it never throws, not even if the storage
 * adapter or the network blows up underneath it. Anything unrecognised comes
 * back as `kind: 'unknown'` with the original error kept in `cause`.
 */

import {
  isAuthApiError,
  isAuthError,
  isAuthRetryableFetchError,
  isAuthWeakPasswordError,
  type AuthChangeEvent,
  type Session,
  type User,
} from '@supabase/supabase-js';
import type { Client } from './client';

/**
 * Re-exported so the app can type a session without importing supabase-js
 * itself. @verso/api stays the one door to Supabase.
 */
export type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';

/** What went wrong, in the terms a screen cares about. */
export type AuthErrorKind =
  | 'invalid-credentials'
  | 'email-already-registered'
  | 'weak-password'
  | 'network'
  | 'unknown';

interface AuthErrorBase {
  kind: AuthErrorKind;
  /**
   * Supabase's own message. For logs and debugging; do not put it on screen,
   * because it is written for developers and is not translated.
   */
  message: string;
  /** Supabase's error code where the failure came from the API, e.g. `invalid_credentials`. */
  code?: string;
  /** HTTP status where there was one. */
  status?: number;
  /** The original thrown or returned error, so nothing is lost on the way here. */
  cause: unknown;
}

/**
 * The failures a sign-in or sign-up screen has to say something about.
 *
 * Deliberately small. Everything else, including a rate limit
 * (`over_request_rate_limit`, which local config caps at 30 sign-ins per five
 * minutes), currently lands in `unknown`; give it its own member when a screen
 * needs separate copy for it.
 */
export type AuthError =
  | (AuthErrorBase & { kind: 'invalid-credentials' })
  | (AuthErrorBase & { kind: 'email-already-registered' })
  | (AuthErrorBase & {
      kind: 'weak-password';
      /** Supabase's reasons, e.g. `['length']`. Empty if it did not say. */
      reasons: string[];
    })
  | (AuthErrorBase & { kind: 'network' })
  | (AuthErrorBase & { kind: 'unknown' });

export type AuthResult<T> = { ok: true; data: T } | { ok: false; error: AuthError };

export interface EmailCredentials {
  email: string;
  password: string;
}

export interface SignUpOptions {
  /**
   * Where the confirmation email's link sends the user.
   *
   * Without it Supabase falls back to the project's Site URL, which on a
   * project that has never had a website is still `http://localhost:3000` — so
   * the link dead-ends on whatever computer the person opens their mail on.
   * The app passes its own deep link instead, which reopens Verso on the
   * device that asked for the account.
   *
   * The URL must be on the project's redirect allow-list (Authentication, URL
   * Configuration) or Supabase silently uses the Site URL anyway.
   */
  emailRedirectTo?: string;
}

export interface SignUpSuccess {
  user: User;
  /**
   * Null when the project makes users confirm their email first. Locally
   * `enable_confirmations` is false so a session comes back straight away;
   * the hosted project may not agree, so a screen must handle null by telling
   * the user to go and check their inbox.
   */
  session: Session | null;
}

export interface SignInSuccess {
  user: User;
  session: Session;
}

/**
 * Turn anything Supabase auth hands back into an `AuthError`.
 *
 * Exported because the app will eventually call auth methods this module does
 * not wrap (password reset, email change) and should map their failures the
 * same way.
 */
export function toAuthError(cause: unknown): AuthError {
  const base = {
    message: cause instanceof Error ? cause.message : String(cause),
    code: isAuthError(cause) ? cause.code : undefined,
    status: isAuthError(cause) ? cause.status : undefined,
    cause,
  };

  // Checked before the code lookup: a failed fetch has no code to look up.
  if (isAuthRetryableFetchError(cause)) return { ...base, kind: 'network' };

  if (isAuthWeakPasswordError(cause)) {
    return { ...base, kind: 'weak-password', reasons: cause.reasons ?? [] };
  }

  if (isAuthApiError(cause)) {
    switch (cause.code) {
      case 'invalid_credentials':
        return { ...base, kind: 'invalid-credentials' };
      // `user_already_exists` is what a local stack returns, `email_exists` is
      // what the hosted one returns from some paths. Both mean the same thing.
      case 'user_already_exists':
      case 'email_exists':
        return { ...base, kind: 'email-already-registered' };
      case 'weak_password':
        return { ...base, kind: 'weak-password', reasons: [] };
    }
  }

  // A TypeError from fetch that never reached auth-js's retry wrapper, e.g. a
  // device with no connection at all.
  if (cause instanceof TypeError) return { ...base, kind: 'network' };

  return { ...base, kind: 'unknown' };
}

/**
 * Create an account.
 *
 * Note the anti-enumeration case: when a project requires email confirmation,
 * signing up with an address that already exists does not fail. Supabase
 * returns a decoy user with no identities rather than admit the address is
 * taken. That is unwrapped here into `email-already-registered`, so callers
 * see one behaviour whatever the project settings are.
 */
export async function signUpWithEmail(
  client: Client,
  credentials: EmailCredentials,
  options: SignUpOptions = {},
): Promise<AuthResult<SignUpSuccess>> {
  try {
    const { data, error } = await client.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      // Omitted entirely when the caller gave none, so a project whose Site URL
      // is correct keeps using it rather than being handed `undefined`.
      ...(options.emailRedirectTo ? { options: { emailRedirectTo: options.emailRedirectTo } } : {}),
    });
    if (error) return { ok: false, error: toAuthError(error) };
    if (!data.user) {
      return { ok: false, error: toAuthError(new Error('sign-up returned no user')) };
    }
    if (data.user.identities?.length === 0) {
      return {
        ok: false,
        error: {
          kind: 'email-already-registered',
          message: 'sign-up returned a user with no identities, which means the email is taken',
          cause: data.user,
        },
      };
    }
    return { ok: true, data: { user: data.user, session: data.session } };
  } catch (cause) {
    return { ok: false, error: toAuthError(cause) };
  }
}

/**
 * Sign in. A wrong password and an unknown email both come back as
 * `invalid-credentials`; Supabase does not distinguish them on purpose, so a
 * screen must not either.
 */
export async function signInWithEmail(
  client: Client,
  credentials: EmailCredentials,
): Promise<AuthResult<SignInSuccess>> {
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });
    if (error) return { ok: false, error: toAuthError(error) };
    if (!data.session || !data.user) {
      return { ok: false, error: toAuthError(new Error('sign-in returned no session')) };
    }
    return { ok: true, data: { user: data.user, session: data.session } };
  } catch (cause) {
    return { ok: false, error: toAuthError(cause) };
  }
}

/**
 * Sign out and clear the stored session. Defaults to Supabase's `local` scope,
 * which ends this device's session and leaves other devices signed in.
 */
export async function signOut(client: Client): Promise<AuthResult<void>> {
  try {
    const { error } = await client.auth.signOut();
    if (error) return { ok: false, error: toAuthError(error) };
    return { ok: true, data: undefined };
  } catch (cause) {
    return { ok: false, error: toAuthError(cause) };
  }
}

/**
 * The stored session, or null when signed out. Reads the storage adapter and
 * refreshes the access token if it has expired, so it is not free; the session
 * hook calls it once at startup and then listens for changes.
 */
export async function getSession(client: Client): Promise<AuthResult<Session | null>> {
  try {
    const { data, error } = await client.auth.getSession();
    if (error) return { ok: false, error: toAuthError(error) };
    return { ok: true, data: data.session };
  } catch (cause) {
    return { ok: false, error: toAuthError(cause) };
  }
}

export type AuthStateHandler = (event: AuthChangeEvent, session: Session | null) => void;

export interface AuthStateSubscription {
  unsubscribe(): void;
}

/**
 * Listen for sign-in, sign-out, and token refresh. Supabase fires the handler
 * once on subscribe with whatever session it has, so a caller does not need to
 * read the session separately first.
 *
 * Do not call another Supabase function from inside the handler and await it.
 * The client holds its auth lock while the handler runs, so an awaited call
 * back into it deadlocks. Set state in the handler and do the work elsewhere.
 */
export function onAuthStateChange(client: Client, handler: AuthStateHandler): AuthStateSubscription {
  const { data } = client.auth.onAuthStateChange(handler);
  return { unsubscribe: () => data.subscription.unsubscribe() };
}
