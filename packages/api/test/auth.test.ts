/**
 * Auth against a real local Supabase stack.
 *
 * The live suite is skipped unless SUPABASE_URL and SUPABASE_ANON_KEY are both
 * set, so `pnpm test` stays green on a machine with no stack running:
 *
 *   supabase start
 *   export SUPABASE_URL=http://127.0.0.1:54321
 *   export SUPABASE_ANON_KEY="$(supabase status -o json | jq -r .ANON_KEY)"
 *   pnpm --filter @verso/api test
 *
 * It assumes the committed supabase/config.toml, where `enable_confirmations`
 * is false, so a sign-up returns a session immediately and a duplicate sign-up
 * is refused outright rather than obfuscated.
 *
 * The mapping tests below it need no stack and always run.
 */

import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthWeakPasswordError,
  type AuthChangeEvent,
  type SupportedStorage,
} from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  getSession,
  onAuthStateChange,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  toAuthError,
  type AuthResult,
  type EmailCredentials,
  type SignUpSuccess,
} from '../src/auth';
import { createSupabaseClient, type Client } from '../src/client';

describe('toAuthError', () => {
  it('maps a wrong password to invalid-credentials and keeps the original', () => {
    const cause = new AuthApiError('Invalid login credentials', 400, 'invalid_credentials');
    const error = toAuthError(cause);

    expect(error.kind).toBe('invalid-credentials');
    expect(error.message).toBe('Invalid login credentials');
    expect(error.code).toBe('invalid_credentials');
    expect(error.status).toBe(400);
    expect(error.cause).toBe(cause);
  });

  it('maps both spellings of a taken email to email-already-registered', () => {
    expect(toAuthError(new AuthApiError('User already registered', 422, 'user_already_exists')).kind).toBe(
      'email-already-registered',
    );
    expect(toAuthError(new AuthApiError('Email address taken', 422, 'email_exists')).kind).toBe(
      'email-already-registered',
    );
  });

  it('carries the reasons through on a weak password', () => {
    const error = toAuthError(new AuthWeakPasswordError('Password is too short', 422, ['length']));

    expect(error.kind).toBe('weak-password');
    if (error.kind !== 'weak-password') throw new Error('unreachable');
    expect(error.reasons).toEqual(['length']);
  });

  it('maps a failed fetch to network', () => {
    expect(toAuthError(new AuthRetryableFetchError('Failed to fetch', 0)).kind).toBe('network');
    expect(toAuthError(new TypeError('Network request failed')).kind).toBe('network');
  });

  it('falls back to unknown for anything it does not recognise', () => {
    // A rate limit has no member of its own yet; it must not be mistaken for
    // one of the others.
    expect(toAuthError(new AuthApiError('Too many requests', 429, 'over_request_rate_limit')).kind).toBe(
      'unknown',
    );
    expect(toAuthError(new Error('something else')).kind).toBe('unknown');
    expect(toAuthError('a string').kind).toBe('unknown');
  });
});

describe('signUpWithEmail and emailRedirectTo', () => {
  /**
   * A client that records the argument instead of calling gotrue. The option
   * cannot be observed against the live stack: `enable_confirmations` is false
   * locally, so no confirmation email is ever built and the redirect is never
   * used. What matters is that it reaches supabase-js, which is exactly what
   * this asserts.
   */
  function recordingClient(): { client: Client; calls: unknown[] } {
    const calls: unknown[] = [];
    const client = {
      auth: {
        signUp: async (credentials: unknown) => {
          calls.push(credentials);
          return { data: { user: { id: 'u1', identities: [{}] }, session: null }, error: null };
        },
      },
    } as unknown as Client;
    return { client, calls };
  }

  it('passes the redirect through to the client as options.emailRedirectTo', async () => {
    const { client, calls } = recordingClient();

    await signUpWithEmail(
      client,
      { email: 'someone@example.com', password: 'verso-test-password-123' },
      { emailRedirectTo: 'verso://auth/callback' },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      email: 'someone@example.com',
      password: 'verso-test-password-123',
      options: { emailRedirectTo: 'verso://auth/callback' },
    });
  });

  it('sends no options at all when the caller gives no redirect', async () => {
    const { client, calls } = recordingClient();

    await signUpWithEmail(client, { email: 'someone@example.com', password: 'verso-test-password-123' });

    // Not `options: undefined`: a project whose Site URL is correct should keep
    // using it rather than being handed an empty override.
    expect(calls[0]).toEqual({
      email: 'someone@example.com',
      password: 'verso-test-password-123',
    });
  });
});

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const live = Boolean(url && anonKey);

/** Storage the tests can look inside, standing in for AsyncStorage. */
function memoryStorage(): SupportedStorage & { contents(): Record<string, string> } {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
    contents: () => Object.fromEntries(items),
  };
}

/** Polls until `check` passes, because auth state arrives a tick after the call resolves. */
async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for auth state');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe.skipIf(!live)('email auth against a local stack', () => {
  const clients: Client[] = [];
  let account: EmailCredentials;
  let signUp: AuthResult<SignUpSuccess>;

  /** A client of its own per test, so one test's session never leaks into another. */
  function makeClient(storage?: SupportedStorage): Client {
    const client = createSupabaseClient({ url: url!, anonKey: anonKey!, storage });
    clients.push(client);
    return client;
  }

  beforeAll(async () => {
    // Unique, so the suite can be run repeatedly against the same stack.
    const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    account = { email: `verso-auth-${stamp}@example.com`, password: 'verso-test-password-123' };
    signUp = await signUpWithEmail(makeClient(memoryStorage()), account);
  });

  afterAll(async () => {
    // Each client runs a refresh timer that would otherwise hold the process open.
    await Promise.all(clients.map((client) => client.auth.stopAutoRefresh()));
  });

  it('signs up and, with confirmations off, returns a session straight away', () => {
    expect(signUp.ok).toBe(true);
    if (!signUp.ok) throw new Error(signUp.error.message);
    expect(signUp.data.user.email).toBe(account.email);
    expect(signUp.data.session).not.toBeNull();
    expect(signUp.data.session?.access_token).toBeTruthy();
  });

  it('refuses a second sign-up with the same email', async () => {
    const result = await signUpWithEmail(makeClient(memoryStorage()), account);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected the duplicate sign-up to fail');
    expect(result.error.kind).toBe('email-already-registered');
    expect(result.error.message).toBeTruthy();
  });

  it('refuses a password the server thinks is too weak, with its reasons', async () => {
    // config.toml sets minimum_password_length = 6.
    const result = await signUpWithEmail(makeClient(memoryStorage()), {
      email: `verso-weak-${Date.now().toString(36)}@example.com`,
      password: 'abc',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected the weak password to be refused');
    expect(result.error.kind).toBe('weak-password');
    if (result.error.kind !== 'weak-password') throw new Error('unreachable');
    // Proves supabase-js really does build a typed weak-password error out of a
    // live response, rather than the plain API error the fallback assumes.
    expect(result.error.reasons).toContain('length');
  });

  it('signs in with the right password', async () => {
    const result = await signInWithEmail(makeClient(memoryStorage()), account);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.user.email).toBe(account.email);
    expect(result.data.session.access_token).toBeTruthy();
  });

  it('reports a wrong password as invalid-credentials', async () => {
    const result = await signInWithEmail(makeClient(memoryStorage()), {
      email: account.email,
      password: 'not-the-right-password',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected the wrong password to fail');
    expect(result.error.kind).toBe('invalid-credentials');
    expect(result.error.code).toBe('invalid_credentials');
  });

  it('persists the session in the storage adapter and clears it on sign-out', async () => {
    const storage = memoryStorage();

    const signedIn = await signInWithEmail(makeClient(storage), account);
    expect(signedIn.ok).toBe(true);
    expect(Object.keys(storage.contents())).not.toHaveLength(0);

    // A second client over the same storage is the app relaunching: it should
    // find the session without anyone signing in again.
    const relaunched = makeClient(storage);
    const restored = await getSession(relaunched);
    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error(restored.error.message);
    expect(restored.data?.user.email).toBe(account.email);

    const out = await signOut(relaunched);
    expect(out.ok).toBe(true);

    const afterSignOut = await getSession(makeClient(storage));
    expect(afterSignOut.ok).toBe(true);
    if (!afterSignOut.ok) throw new Error(afterSignOut.error.message);
    expect(afterSignOut.data).toBeNull();
  });

  it('tells a subscriber about the sign-in and the sign-out, and stops when unsubscribed', async () => {
    const client = makeClient(memoryStorage());
    const events: AuthChangeEvent[] = [];
    const subscription = onAuthStateChange(client, (event) => {
      events.push(event);
    });

    try {
      await signInWithEmail(client, account);
      await waitFor(() => events.includes('SIGNED_IN'));

      await signOut(client);
      await waitFor(() => events.includes('SIGNED_OUT'));
    } finally {
      subscription.unsubscribe();
    }

    const seenSoFar = events.length;
    await signInWithEmail(client, account);
    expect(events).toHaveLength(seenSoFar);
  });
});
