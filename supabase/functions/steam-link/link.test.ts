/**
 * `link.ts` against fixtures. Run with:
 *
 *   deno test supabase/functions/steam-link
 *
 * The database and Valve are both injected, so this suite is about the one
 * thing that is genuinely ours: the order of operations, and what happens when
 * a state is expired, replayed, or never existed.
 *
 * The three database calls are recorded rather than performed. What they do for
 * real is proved in supabase/tests/steam_link.test.sql -- `consume_steam_link_state`
 * being a single atomic `update ... returning` is a property of SQL and is
 * tested there; here it is a function that returns null, which is what that SQL
 * returns for every one of unknown, expired and already-spent.
 */

import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';
import callbackFixture from './fixtures/callback.json' with { type: 'json' };
import checkAuthFixture from './fixtures/check-authentication.json' with { type: 'json' };
import {
  completeLink,
  returnToFor,
  startLink,
  stateHash,
  STATE_TTL_SECONDS,
  type LinkDeps,
} from './link.ts';

const BASE = 'https://ref.supabase.co/functions/v1/steam-link';
const STATE = 'a-predictable-state';
const STEAM_ID = '76561198000000001';
const USER_ID = '00000000-0000-0000-0000-00000000000a';

interface Recorder {
  created: { userId: string; stateHash: string; ttlSeconds: number }[];
  consumed: { stateHash: string; responseNonce: string }[];
  linked: { userId: string; steamId: string }[];
  verifications: number;
}

interface HarnessOptions {
  /** What `consume_steam_link_state` answers. Null is unknown/expired/spent. */
  consumeReturns?: string | null;
  /** Make the consume call throw, the way a duplicate response_nonce does. */
  consumeThrows?: boolean;
  linkThrows?: boolean;
  /** The unique index on (platform, external_user_id) refused the write. */
  linkTaken?: boolean;
  /** Valve's answer to check_authentication. */
  verification?: string;
}

function harness(options: HarnessOptions = {}): { deps: LinkDeps; log: Recorder } {
  const log: Recorder = { created: [], consumed: [], linked: [], verifications: 0 };

  const deps: LinkDeps = {
    returnToBase: BASE,
    realm: 'https://ref.supabase.co',
    newState: () => STATE,
    createState: (userId, hash, ttlSeconds) => {
      log.created.push({ userId, stateHash: hash, ttlSeconds });
      return Promise.resolve(new Date(Date.now() + ttlSeconds * 1000).toISOString());
    },
    consumeState: (hash, responseNonce) => {
      log.consumed.push({ stateHash: hash, responseNonce });
      if (options.consumeThrows) return Promise.reject(new Error('duplicate key value'));
      return Promise.resolve(
        options.consumeReturns === undefined ? USER_ID : options.consumeReturns,
      );
    },
    linkAccount: (userId, steamId) => {
      log.linked.push({ userId, steamId });
      if (options.linkThrows) return Promise.reject(new Error('write failed'));
      return Promise.resolve(options.linkTaken ? 'already_linked_elsewhere' : 'ok');
    },
    fetchImpl: (() => {
      log.verifications += 1;
      return Promise.resolve(new Response(options.verification ?? checkAuthFixture.valid));
    }) as unknown as typeof fetch,
  };

  return { deps, log };
}

/** A callback URL Steam would send for `state`, with any field overridden. */
function callbackUrl(state: string = STATE, overrides: Record<string, string> = {}): string {
  const url = new URL(BASE);
  for (const [key, value] of Object.entries({
    ...callbackFixture,
    'openid.return_to': returnToFor(BASE, state),
    ...overrides,
  })) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set('state', state);
  return url.toString();
}

Deno.test('starting a link stores the hash of the state, never the state', async () => {
  const { deps, log } = harness();

  const started = await startLink(deps, USER_ID);

  assertEquals(log.created.length, 1);
  assertEquals(log.created[0]!.userId, USER_ID);
  assertEquals(log.created[0]!.stateHash, await stateHash(STATE));
  assertEquals(log.created[0]!.ttlSeconds, STATE_TTL_SECONDS);
  // A dump of the table has to be worth nothing.
  assertFalse(log.created[0]!.stateHash.includes(STATE));
  assert(Date.parse(started.expiresAt) > Date.now());
});

Deno.test('the URL the app opens carries the state and no session of any kind', async () => {
  const { deps } = harness();

  const started = await startLink(deps, USER_ID);
  const url = new URL(started.url);
  const returnTo = new URL(url.searchParams.get('openid.return_to')!);

  assertEquals(returnTo.searchParams.get('state'), STATE);
  // The whole reason the state table exists: this URL reaches the URL bar,
  // browser history and Valve's logs.
  assertFalse(started.url.includes(USER_ID));
  assertFalse(started.url.toLowerCase().includes('bearer'));
  assertFalse(started.url.toLowerCase().includes('jwt'));
});

Deno.test('the state hash is a SHA-256 in hex', async () => {
  // Known vector, so a change of algorithm cannot pass quietly. The database
  // has `check (state_hash ~ '^[0-9a-f]{64}$')` on the same claim.
  assertEquals(
    await stateHash('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

Deno.test('a verified callback spends the state and writes the link', async () => {
  const { deps, log } = harness();

  const result = await completeLink(deps, callbackUrl());

  assert(result.ok);
  assertEquals(result.steamId, STEAM_ID);
  assertEquals(result.userId, USER_ID);

  assertEquals(log.verifications, 1);
  assertEquals(log.consumed.length, 1);
  assertEquals(log.consumed[0]!.stateHash, await stateHash(STATE));
  // Valve's own nonce goes in with it, so the unique index refuses this exact
  // assertion if it ever turns up again on another state.
  assertEquals(log.consumed[0]!.responseNonce, callbackFixture['openid.response_nonce']);
  assertEquals(log.linked, [{ userId: USER_ID, steamId: STEAM_ID }]);
});

Deno.test('the user is the one the state was bound to, and only that', async () => {
  const { deps, log } = harness({ consumeReturns: '00000000-0000-0000-0000-00000000000b' });

  const result = await completeLink(deps, callbackUrl());

  assert(result.ok);
  // Nothing in the callback names a user, and the state says who this is.
  assertEquals(result.userId, '00000000-0000-0000-0000-00000000000b');
  assertEquals(log.linked[0]!.userId, '00000000-0000-0000-0000-00000000000b');
});

Deno.test('a callback carrying anything we did not ask for is refused', async () => {
  const { deps, log } = harness();

  // The signature covers return_to, which pins host, path and state. It says
  // nothing about the rest of the query the browser actually arrived with, so
  // the whole request is pinned here instead.
  const result = await completeLink(deps, `${callbackUrl()}&user_id=${USER_ID}`);

  assertEquals(result.ok === false && result.reason, 'unexpected_parameter');
  assertEquals(log.verifications, 0);
  assertEquals(log.consumed.length, 0);
});

Deno.test('an openid key the flow never reads is refused before Valve is asked', async () => {
  const { deps, log } = harness();

  // Not a repeat, not a non-openid key: a key that simply is not part of a
  // positive assertion and is not named in `openid.signed`. It used to ride
  // into the check_authentication body unread.
  const url = new URL(callbackUrl());
  url.searchParams.set('openid.Claimed_id', 'https://steamcommunity.com/openid/id/76561198000000111');

  const result = await completeLink(deps, url.toString());

  assertEquals(result.ok === false && result.reason, 'unexpected_parameter');
  assertEquals(log.verifications, 0);
  assertEquals(log.consumed.length, 0);
  assertEquals(log.linked.length, 0);
});

Deno.test('a repeated state is refused as a repeated openid field would be', async () => {
  const { deps, log } = harness();

  const result = await completeLink(deps, `${callbackUrl()}&state=another-state`);

  assertEquals(result.ok === false && result.reason, 'duplicate_parameter');
  assertEquals(log.consumed.length, 0);
});

Deno.test('a callback that arrived somewhere other than our own URL is refused', async () => {
  const { deps, log } = harness();

  const elsewhere = callbackUrl().replace(
    'https://ref.supabase.co/functions/v1/steam-link',
    'https://attacker.example/functions/v1/steam-link',
  );
  const result = await completeLink(deps, elsewhere);

  assertEquals(result.ok === false && result.reason, 'return_to_mismatch');
  assertEquals(log.verifications, 0);
});

Deno.test('a SteamID64 already linked to someone else is refused, and nothing is written', async () => {
  const { deps, log } = harness({ linkTaken: true });

  const result = await completeLink(deps, callbackUrl());

  assertEquals(result.ok === false && result.reason, 'already_linked_elsewhere');
  // The state is spent even so: the assertion was genuine and single-use, and
  // there must be no way to retry it.
  assertEquals(log.consumed.length, 1);
});

Deno.test('a duplicated claimed_id is refused before the state is spent', async () => {
  // The same takeover as in openid.test.ts, driven through the whole flow:
  // what matters here is that nothing is consumed and nothing is written.
  const { deps, log } = harness();

  const url = new URL(callbackUrl());
  url.searchParams.append(
    'openid.claimed_id',
    'https://steamcommunity.com/openid/id/76561198000000111',
  );

  const result = await completeLink(deps, url.toString());

  assertEquals(result.ok === false && result.reason, 'duplicate_parameter');
  assertEquals(log.verifications, 0);
  assertEquals(log.consumed.length, 0);
  assertEquals(log.linked.length, 0);
});

Deno.test('a callback with no state is refused without touching anything', async () => {
  const { deps, log } = harness();

  const url = new URL(callbackUrl());
  url.searchParams.delete('state');

  const result = await completeLink(deps, url.toString());

  assertEquals(result.ok === false && result.reason, 'missing_state');
  assertEquals(log.verifications, 0);
  assertEquals(log.consumed.length, 0);
});

Deno.test('an expired or already-spent state is one answer, and it is not a link', async () => {
  const { deps, log } = harness({ consumeReturns: null });

  const result = await completeLink(deps, callbackUrl());

  assertEquals(result.ok === false && result.reason, 'state_not_valid');
  assertEquals(log.linked.length, 0);
});

Deno.test('replaying a whole callback fails the second time', async () => {
  // First call succeeds; the second finds the state spent, which is what the
  // database returns null for.
  let first = true;
  const { deps, log } = harness();
  const consume = deps.consumeState;
  deps.consumeState = async (hash, nonce) => {
    const answer = await consume(hash, nonce);
    if (!first) return null;
    first = false;
    return answer;
  };

  assert((await completeLink(deps, callbackUrl())).ok);
  const second = await completeLink(deps, callbackUrl());

  assertEquals(second.ok === false && second.reason, 'state_not_valid');
  assertEquals(log.linked.length, 1);
});

Deno.test('an assertion already accepted elsewhere is refused by the nonce index', async () => {
  const { deps, log } = harness({ consumeThrows: true });

  const result = await completeLink(deps, callbackUrl());

  assertEquals(result.ok === false && result.reason, 'state_not_valid');
  assertEquals(log.linked.length, 0);
});

Deno.test('a tampered claimed_id never reaches the state, so it cannot burn one', async () => {
  const { deps, log } = harness({ verification: checkAuthFixture.invalid });

  const result = await completeLink(
    deps,
    callbackUrl(STATE, {
      'openid.claimed_id': 'https://steamcommunity.com/openid/id/76561198000000999',
      'openid.identity': 'https://steamcommunity.com/openid/id/76561198000000999',
    }),
  );

  assertEquals(result.ok === false && result.reason, 'not_verified');
  // Authenticate first, spend second: otherwise anyone who guessed a state
  // could destroy someone else's attempt with a junk callback.
  assertEquals(log.consumed.length, 0);
  assertEquals(log.linked.length, 0);
});

Deno.test('an assertion moved onto a different state does not fit it', async () => {
  const { deps, log } = harness();

  // The assertion says return_to carried `another-state`; the query says this
  // is `a-predictable-state`. The signature covers return_to, so this is the
  // shape an attacker would have to produce, and it is refused locally.
  const url = new URL(callbackUrl(STATE, {}));
  url.searchParams.set('openid.return_to', returnToFor(BASE, 'another-state'));

  const result = await completeLink(deps, url.toString());

  assertEquals(result.ok === false && result.reason, 'return_to_mismatch');
  assertEquals(log.verifications, 0);
  assertEquals(log.consumed.length, 0);
});

Deno.test('a failed write is reported rather than swallowed', async () => {
  const { deps, log } = harness({ linkThrows: true });

  const result = await completeLink(deps, callbackUrl());

  assertEquals(result.ok === false && result.reason, 'write_failed');
  assertEquals(log.consumed.length, 1);
});

Deno.test('returnToFor puts the state in the query and leaves the path alone', () => {
  assertEquals(returnToFor(BASE, 'xyz'), `${BASE}?state=xyz`);
  assertEquals(returnToFor(`${BASE}?state=old`, 'new'), `${BASE}?state=new`);
});
