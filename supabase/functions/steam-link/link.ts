/**
 * The two halves of the link flow, with the database and the network behind
 * injected functions so both can be driven from a test.
 *
 * `index.ts` supplies the real implementations: a Supabase service-role client
 * for the three database calls, `fetch` for Valve. Nothing in this file knows
 * that any of that is Supabase, which is why link.test.ts can exercise an
 * expired state, a replayed callback and a tampered claimed_id without a stack.
 *
 * The state is the interesting part.
 *
 *   * `startLink` mints 32 random bytes, hands the *state* to the browser and
 *     stores its SHA-256. The database therefore holds nothing replayable, and
 *     the lookup on the way back is still a primary-key hit on the hash.
 *   * `completeLink` hashes what came back and spends it. Spending is one
 *     `update ... returning` in the database (`consume_steam_link_state`), so a
 *     replayed callback loses the race rather than passing it, and an expired
 *     or unknown state is the same answer as a spent one -- null -- because
 *     telling them apart tells an attacker which guess was close.
 *
 * The user's JWT is nowhere near any of this. It is presented once, to
 * `startLink`, over a POST; what goes into the URL bar is an opaque handle that
 * means nothing without the row it points at and means nothing twice.
 */

import {
  authenticate,
  buildLoginUrl,
  unrecognisedOpenIdKeys,
  type CallbackFailure,
} from './openid.ts';

/** Ten minutes: long enough to sign in and pass Steam Guard, short enough to matter. */
export const STATE_TTL_SECONDS = 600;

export interface LinkDeps {
  /** `start_steam_link_state`. Returns when the attempt expires. */
  createState(userId: string, stateHash: string, ttlSeconds: number): Promise<string>;
  /** `consume_steam_link_state`. The user id, or null for unknown/expired/spent. */
  consumeState(stateHash: string, responseNonce: string): Promise<string | null>;
  /**
   * Upsert `platform_links` for (user, 'steam').
   *
   * Returns `'already_linked_elsewhere'` rather than throwing when the unique
   * index on (platform, external_user_id) refuses the write, because that is
   * not a failure: it is the database saying one Steam account belongs to one
   * person, which is a thing the user can be told.
   */
  linkAccount(userId: string, steamId: string): Promise<'ok' | 'already_linked_elsewhere'>;
  /** The function's own public URL, without a query string. */
  returnToBase: string;
  /** What Valve shows the user as the site asking. `return_to` must sit under it. */
  realm: string;
  /** Swapped for a fixture in tests. */
  fetchImpl?: typeof fetch;
  /** Swapped in tests so a state is predictable. */
  newState?: () => string;
}

export interface StartedLink {
  /** Send the browser here. */
  url: string;
  /** ISO timestamp after which the attempt is dead. */
  expiresAt: string;
}

/**
 * 32 random bytes, base64url.
 *
 * `crypto.getRandomValues` rather than `Math.random`: this is a bearer handle
 * for ten minutes and a guessable one would let anyone finish somebody else's
 * link with their own Steam account. 256 bits is not guessable.
 */
export function newState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

/** SHA-256 of a string, lowercase hex. What the database stores. */
export async function stateHash(state: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** The `return_to` for one attempt: the function's URL plus that attempt's state. */
export function returnToFor(base: string, state: string): string {
  const url = new URL(base);
  url.searchParams.set('state', state);
  return url.toString();
}

/**
 * Open a link attempt for an already-authenticated user.
 *
 * The caller has verified the JWT; this function takes a user id and trusts it,
 * which is why `start_steam_link_state` is service-role only in the database.
 */
export async function startLink(deps: LinkDeps, userId: string): Promise<StartedLink> {
  const state = (deps.newState ?? newState)();
  const returnTo = returnToFor(deps.returnToBase, state);
  const expiresAt = await deps.createState(userId, await stateHash(state), STATE_TTL_SECONDS);

  return { url: buildLoginUrl(returnTo, deps.realm), expiresAt };
}

export type CompleteFailure =
  | CallbackFailure
  | 'missing_state'
  | 'unexpected_parameter'
  | 'state_not_valid'
  | 'already_linked_elsewhere'
  | 'write_failed';

export type CompleteResult =
  | { ok: true; steamId: string; userId: string }
  | { ok: false; reason: CompleteFailure };

/**
 * Every `reason` a `verso://steam/linked?status=error` deep link can carry.
 *
 * `CompleteFailure` plus the two that index.ts raises before the flow starts:
 * `not_configured` (STEAM_LINK_RETURN_URL is missing, so there is no realm to
 * link against) and `server_error` (something threw). Those two used to be sent
 * as plain strings, which meant a screen switching exhaustively over the union
 * would compile while silently missing them. This is the type to switch on.
 */
export type LinkFailureReason = CompleteFailure | 'not_configured' | 'server_error';

/**
 * The query keys this endpoint expects: our `state`, and the OpenID set.
 *
 * Anything else is refused. The signature covers `return_to`, which pins the
 * host, the path and the state -- but not the rest of the query the browser
 * actually arrived with, so without this check a callback could carry extra
 * parameters that a future version of this function, or a proxy in front of it,
 * might read. Refusing the whole callback is cheap and leaves nothing to reason
 * about.
 */
function unexpectedKeys(params: URLSearchParams): string[] {
  return [
    ...[...new Set(params.keys())].filter(
      (key) => key !== 'state' && !key.startsWith('openid.'),
    ),
    // And the `openid.*` keys that are not part of a positive assertion and are
    // not named in `openid.signed`. Without this an unread key like
    // `openid.Claimed_id` is refused by nothing and still forwarded to Valve in
    // the check_authentication body.
    ...unrecognisedOpenIdKeys(params),
  ];
}

/**
 * Finish a link attempt from Steam's redirect.
 *
 * Order matters and is the opposite of the obvious one: the assertion is
 * authenticated *before* the state is spent. Spending first would let anyone
 * who could guess a state burn somebody else's attempt with a junk callback;
 * authenticating first means only a caller holding a genuine Valve assertion
 * for this exact `return_to` can consume anything.
 *
 * `openid.return_to` is rebuilt from the state in the query rather than read
 * out of the callback, so the comparison inside `authenticate` is between what
 * we would have sent for this state and what Steam says it was given. A
 * callback that moved the assertion onto a different state fails there.
 */
export async function completeLink(deps: LinkDeps, callbackUrl: string): Promise<CompleteResult> {
  const incoming = new URL(callbackUrl);
  const params = incoming.searchParams;

  // The URL the browser arrived at has to be the URL we asked Valve to send it
  // to: same origin, same path, our one parameter plus the OpenID set. The
  // signature covers `return_to` and therefore the host, the path and the
  // state; this covers the rest of the request, which it does not.
  const base = new URL(deps.returnToBase);
  if (incoming.origin !== base.origin || incoming.pathname !== base.pathname) {
    return { ok: false, reason: 'return_to_mismatch' };
  }

  const state = params.get('state');
  if (!state) return { ok: false, reason: 'missing_state' };
  if (params.getAll('state').length > 1) return { ok: false, reason: 'duplicate_parameter' };
  if (unexpectedKeys(params).length > 0) return { ok: false, reason: 'unexpected_parameter' };

  const authenticated = await authenticate(params, returnToFor(deps.returnToBase, state), {
    fetchImpl: deps.fetchImpl,
  });
  if (!authenticated.ok) return { ok: false, reason: authenticated.reason };

  const { steamId, responseNonce } = authenticated.assertion;

  let userId: string | null;
  try {
    userId = await deps.consumeState(await stateHash(state), responseNonce);
  } catch {
    // A duplicate response_nonce raises 23505 in the database: this exact
    // assertion has been accepted before, on some other state. Fail closed.
    return { ok: false, reason: 'state_not_valid' };
  }
  if (!userId) return { ok: false, reason: 'state_not_valid' };

  let written: 'ok' | 'already_linked_elsewhere';
  try {
    written = await deps.linkAccount(userId, steamId);
  } catch {
    return { ok: false, reason: 'write_failed' };
  }
  // One Steam account, one person. The unique index on
  // (platform, external_user_id) refused the write and nothing was stored; the
  // state is spent either way, which is correct -- the assertion was genuine
  // and single-use, and retrying it must not be possible.
  if (written !== 'ok') return { ok: false, reason: written };

  return { ok: true, steamId, userId };
}
