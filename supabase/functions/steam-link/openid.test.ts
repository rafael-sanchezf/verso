/**
 * `openid.ts` against fixtures. Run with:
 *
 *   deno test supabase/functions/steam-link
 *
 * No permissions and no network: the fixtures are imported as JSON modules and
 * every test passes its own `fetchImpl`, so nothing here can reach Valve even
 * by accident.
 *
 * The fixture is one genuine-shaped Steam callback. Every test that is about a
 * refusal takes a copy of it and breaks exactly one thing, which is the only
 * way to be sure the check under test is the one doing the refusing: a fixture
 * per failure would drift, and a hand-built params bag would test the test.
 *
 * `openid.sig` is a plausible-looking string and no more. Nothing here verifies
 * a signature -- only Valve can -- so the "tampered claimed_id" test is what it
 * is in production: the local checks pass, Valve is asked, and Valve says no.
 */

import { assert, assertEquals, assertFalse, assertStringIncludes } from 'jsr:@std/assert@1';
import callbackFixture from './fixtures/callback.json' with { type: 'json' };
import checkAuthFixture from './fixtures/check-authentication.json' with { type: 'json' };
import {
  authenticate,
  buildLoginUrl,
  canonicalOpenIdParams,
  checkCallback,
  IDENTIFIER_SELECT,
  parseKeyValueForm,
  STEAM_OPENID_ENDPOINT,
  unrecognisedOpenIdKeys,
  verifyAssertion,
} from './openid.ts';

const RETURN_TO = 'https://ref.supabase.co/functions/v1/steam-link?state=s-t-a-t-e';

/** The fixture as query parameters, with `return_to` and any overrides applied. */
function callbackParams(overrides: Record<string, string | null> = {}): URLSearchParams {
  const params = new URLSearchParams({ ...callbackFixture, 'openid.return_to': RETURN_TO });
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  return params;
}

/** A `fetch` that answers with one body and records what it was sent. */
function stubFetch(body: string, status = 200) {
  const calls: { url: string; body: string }[] = [];
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: typeof input === 'string' ? input : input.toString(),
      body: String(init?.body ?? ''),
    });
    return Promise.resolve(new Response(body, { status }));
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

Deno.test('the login URL asks Steam who this is, and says nothing about the user', () => {
  const url = new URL(buildLoginUrl(RETURN_TO, 'https://ref.supabase.co'));

  assertEquals(`${url.origin}${url.pathname}`, STEAM_OPENID_ENDPOINT);
  assertEquals(url.searchParams.get('openid.mode'), 'checkid_setup');
  assertEquals(url.searchParams.get('openid.identity'), IDENTIFIER_SELECT);
  assertEquals(url.searchParams.get('openid.claimed_id'), IDENTIFIER_SELECT);
  assertEquals(url.searchParams.get('openid.return_to'), RETURN_TO);
  assertEquals(url.searchParams.get('openid.realm'), 'https://ref.supabase.co');
  // Nothing identifying: Steam has no idea who is arriving until they sign in,
  // which is why the state in return_to has to carry that.
  assertFalse(url.toString().includes('user'));
});

Deno.test('a genuine callback yields the 17-digit SteamID64', () => {
  const result = checkCallback(callbackParams(), RETURN_TO);

  assert(result.ok);
  assertEquals(result.assertion.steamId, '76561198000000001');
  assertEquals(result.assertion.responseNonce, '2026-09-16T20:00:00Z7Xq2Lm');
});

Deno.test('the user pressing cancel on Valve\'s page is its own answer', () => {
  const result = checkCallback(callbackParams({ 'openid.mode': 'cancel' }), RETURN_TO);

  assertFalse(result.ok);
  assertEquals(result.ok === false && result.reason, 'cancelled');
});

Deno.test('a mode that is neither is not an assertion', () => {
  const result = checkCallback(callbackParams({ 'openid.mode': 'setup_needed' }), RETURN_TO);

  assertEquals(result.ok === false && result.reason, 'not_an_assertion');
});

Deno.test('an assertion from another OpenID provider is refused before Valve is asked', () => {
  const result = checkCallback(
    callbackParams({ 'openid.op_endpoint': 'https://evil.example/openid/login' }),
    RETURN_TO,
  );

  assertEquals(result.ok === false && result.reason, 'wrong_provider');
});

Deno.test('a claimed_id the signature does not cover is refused', () => {
  // The attack this stops: send a claimed_id of your choosing and leave it out
  // of `signed`, so Valve cheerfully confirms a signature over the other fields.
  const result = checkCallback(
    callbackParams({ 'openid.signed': 'signed,op_endpoint,identity,return_to,response_nonce' }),
    RETURN_TO,
  );

  assertEquals(result.ok === false && result.reason, 'unsigned_field');
});

Deno.test('a claimed_id that is not a Steam identity URL is refused', () => {
  for (const claimed of [
    'https://evil.example/openid/id/76561198000000001',
    'https://steamcommunity.com/openid/id/123',
    'https://steamcommunity.com/openid/id/7656119800000000x',
    'https://steamcommunity.com/profiles/76561198000000001',
  ]) {
    const result = checkCallback(
      callbackParams({ 'openid.claimed_id': claimed, 'openid.identity': claimed }),
      RETURN_TO,
    );
    assertEquals(result.ok === false && result.reason, 'bad_claimed_id', claimed);
  }
});

Deno.test('identity and claimed_id disagreeing means something rewrote the assertion', () => {
  const result = checkCallback(
    callbackParams({ 'openid.identity': 'https://steamcommunity.com/openid/id/76561198000000009' }),
    RETURN_TO,
  );

  assertEquals(result.ok === false && result.reason, 'identity_mismatch');
});

Deno.test('an assertion issued for a different return_to does not fit this attempt', () => {
  const result = checkCallback(
    callbackParams({
      'openid.return_to': 'https://ref.supabase.co/functions/v1/steam-link?state=someone-else',
    }),
    RETURN_TO,
  );

  assertEquals(result.ok === false && result.reason, 'return_to_mismatch');
});

Deno.test('verification echoes every openid field back with the mode swapped', async () => {
  const fetcher = stubFetch(checkAuthFixture.valid);

  assert(await verifyAssertion(callbackParams(), { fetchImpl: fetcher.fetchImpl }));

  assertEquals(fetcher.calls.length, 1);
  assertEquals(fetcher.calls[0]!.url, STEAM_OPENID_ENDPOINT);

  const sent = new URLSearchParams(fetcher.calls[0]!.body);
  assertEquals(sent.get('openid.mode'), 'check_authentication');
  assertEquals(sent.get('openid.sig'), callbackFixture['openid.sig']);
  assertEquals(sent.get('openid.claimed_id'), callbackFixture['openid.claimed_id']);
  assertEquals(sent.get('openid.return_to'), RETURN_TO);
  assertEquals(sent.get('openid.signed'), callbackFixture['openid.signed']);
  // The state rides in return_to and nowhere else, and no key is sent: OpenID
  // needs none (research 4.4).
  assertEquals(sent.get('key'), null);
});

Deno.test('a tampered claimed_id passes every local check and dies at Valve', async () => {
  // The signature is over the original id, so the digest no longer matches.
  // Locally this is a perfectly well-formed callback -- which is the point.
  const tampered = callbackParams({
    'openid.claimed_id': 'https://steamcommunity.com/openid/id/76561198000000999',
    'openid.identity': 'https://steamcommunity.com/openid/id/76561198000000999',
  });
  assert(checkCallback(tampered, RETURN_TO).ok);

  const fetcher = stubFetch(checkAuthFixture.invalid);
  const result = await authenticate(tampered, RETURN_TO, { fetchImpl: fetcher.fetchImpl });

  assertEquals(result.ok === false && result.reason, 'not_verified');
  assertEquals(fetcher.calls.length, 1);
});

Deno.test('is_valid:false is a no, whatever else the body says', async () => {
  const fetcher = stubFetch(checkAuthFixture.invalid);

  const result = await authenticate(callbackParams(), RETURN_TO, { fetchImpl: fetcher.fetchImpl });

  assertEquals(result.ok === false && result.reason, 'not_verified');
});

Deno.test('a callback that fails a local check never becomes a request to Valve', async () => {
  const fetcher = stubFetch(checkAuthFixture.valid);

  const result = await authenticate(
    callbackParams({ 'openid.mode': 'cancel' }),
    RETURN_TO,
    { fetchImpl: fetcher.fetchImpl },
  );

  assertEquals(result.ok === false && result.reason, 'cancelled');
  assertEquals(fetcher.calls.length, 0);
});

Deno.test('Valve being unreachable is our failure, not the caller\'s', async () => {
  const fetchImpl = (() => Promise.reject(new Error('connection reset'))) as unknown as typeof fetch;

  const result = await authenticate(callbackParams(), RETURN_TO, { fetchImpl });

  assertEquals(result.ok === false && result.reason, 'verification_failed');
});

Deno.test('a non-2xx from Valve is not a yes', async () => {
  const fetcher = stubFetch('service unavailable', 503);

  assertFalse(await verifyAssertion(callbackParams(), { fetchImpl: fetcher.fetchImpl }));
});

Deno.test('a repeated openid parameter is refused outright', () => {
  for (const key of [
    'openid.claimed_id',
    'openid.identity',
    'openid.return_to',
    'openid.response_nonce',
    'openid.signed',
    'openid.sig',
    'openid.mode',
  ]) {
    const params = callbackParams();
    params.append(key, params.get(key)!);

    const result = checkCallback(params, RETURN_TO);
    assertEquals(result.ok === false && result.reason, 'duplicate_parameter', key);
  }
});

Deno.test('an openid key nobody reads is still refused', () => {
  // The gap this closes: refusing a *repeated* key said nothing about a key we
  // never read. `openid.Claimed_id` is a different key from `openid.claimed_id`
  // and looks the same in a log, and it would have been forwarded verbatim in
  // the check_authentication body.
  const params = callbackParams();
  params.set('openid.Claimed_id', 'https://steamcommunity.com/openid/id/76561198000000111');
  params.set('openid.ext1.mode', 'fetch_response');

  assertEquals(unrecognisedOpenIdKeys(params), ['openid.Claimed_id', 'openid.ext1.mode']);
});

Deno.test('every field of a real assertion is recognised, signed extensions included', () => {
  // Nothing Steam sends is unrecognised, `openid.signed` names only fields that
  // are, and an OP that signs an extension field has it allowed through --
  // dropping one would make a genuine assertion fail verification.
  assertEquals(unrecognisedOpenIdKeys(callbackParams()), []);

  const cancelled = new URLSearchParams({
    'openid.ns': callbackFixture['openid.ns'],
    'openid.mode': 'cancel',
  });
  assertEquals(unrecognisedOpenIdKeys(cancelled), []);

  const withExtension = callbackParams({
    'openid.signed': `${callbackFixture['openid.signed']},sreg.email`,
    'openid.sreg.email': 'someone@example.com',
  });
  assertEquals(unrecognisedOpenIdKeys(withExtension), []);

  // But naming it in `signed` is not a way in: `signed` is itself signed, so a
  // smuggled field named there breaks the signature at Valve.
  const invalidateHandle = callbackParams({ 'openid.invalidate_handle': 'stale' });
  assertEquals(unrecognisedOpenIdKeys(invalidateHandle), []);
});

Deno.test('canonical parameters are one value per key, and drop what is not openid', () => {
  const params = callbackParams();
  params.set('state', 's-t-a-t-e');

  const canonical = canonicalOpenIdParams(params)!;
  assertEquals(canonical.get('state'), null);
  assertEquals(canonical.get('openid.claimed_id'), callbackFixture['openid.claimed_id']);

  params.append('openid.claimed_id', 'https://steamcommunity.com/openid/id/76561198000000999');
  assertEquals(canonicalOpenIdParams(params), null);
});

Deno.test('a duplicated claimed_id cannot make Valve vouch for a victim', async () => {
  // The takeover this closes, in full.
  //
  // `URLSearchParams.get` returns the FIRST value of a repeated key; building a
  // body with `set` in a loop leaves the LAST. So an attacker who has completed
  // one honest link keeps their own genuinely signed callback, replays it at
  // their own live state, and sends claimed_id and identity twice: the victim's
  // SteamID64 first, their own second. The reader sees the victim. Valve is
  // handed the attacker's real assertion, and says yes. platform_links is then
  // written as (attacker, victim's SteamID64) -- and the next import hands the
  // attacker the victim's library and playtime.
  const victim = 'https://steamcommunity.com/openid/id/76561198000000111';
  const attacker = callbackFixture['openid.claimed_id'];

  const smuggled = new URLSearchParams();
  smuggled.set('openid.ns', callbackFixture['openid.ns']);
  smuggled.set('openid.mode', 'id_res');
  smuggled.set('openid.op_endpoint', callbackFixture['openid.op_endpoint']);
  smuggled.append('openid.claimed_id', victim);
  smuggled.append('openid.claimed_id', attacker);
  smuggled.append('openid.identity', victim);
  smuggled.append('openid.identity', attacker);
  smuggled.set('openid.return_to', RETURN_TO);
  smuggled.set('openid.response_nonce', callbackFixture['openid.response_nonce']);
  smuggled.set('openid.assoc_handle', callbackFixture['openid.assoc_handle']);
  smuggled.set('openid.signed', callbackFixture['openid.signed']);
  smuggled.set('openid.sig', callbackFixture['openid.sig']);

  // A Valve that behaves like the real one: it says yes only to the exact
  // assertion it signed -- the attacker's, with their own id, once.
  const seen: string[] = [];
  const strictValve = ((_input: string | URL | Request, init?: RequestInit) => {
    const body = new URLSearchParams(String(init?.body ?? ''));
    seen.push(body.toString());
    const genuine = body.getAll('openid.claimed_id').length === 1 &&
      body.get('openid.claimed_id') === attacker &&
      body.get('openid.identity') === attacker;
    return Promise.resolve(new Response(genuine ? checkAuthFixture.valid : checkAuthFixture.invalid));
  }) as unknown as typeof fetch;

  const result = await authenticate(smuggled, RETURN_TO, { fetchImpl: strictValve });

  assertEquals(result.ok === false && result.reason, 'duplicate_parameter');
  // Refused before Valve was asked, so there is not even a signed "yes" lying
  // around for a later step to misread.
  assertEquals(seen, []);
});

Deno.test('the bytes that are checked are the bytes Valve is asked about', async () => {
  // The structural half of the fix: whatever `checkCallback` read is what
  // `authenticate` sends, so a future field cannot be read from one reading of
  // the query and verified from another.
  const params = callbackParams();
  const fetcher = stubFetch(checkAuthFixture.valid);

  const checked = checkCallback(params, RETURN_TO);
  assert(checked.ok);
  await authenticate(params, RETURN_TO, { fetchImpl: fetcher.fetchImpl });

  const sent = new URLSearchParams(fetcher.calls[0]!.body);
  sent.set('openid.mode', checked.canonical.get('openid.mode')!);
  assertEquals(sent.toString(), checked.canonical.toString());
});

Deno.test('verifyAssertion will not verify a repeated key either', async () => {
  const params = callbackParams();
  params.append('openid.claimed_id', 'https://steamcommunity.com/openid/id/76561198000000111');
  const fetcher = stubFetch(checkAuthFixture.valid);

  assertFalse(await verifyAssertion(params, { fetchImpl: fetcher.fetchImpl }));
  assertEquals(fetcher.calls.length, 0);
});

Deno.test('the key-value form splits on the first colon only', () => {
  const parsed = parseKeyValueForm('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n\ngarbage\n');

  assertEquals(parsed['ns'], 'http://specs.openid.net/auth/2.0');
  assertEquals(parsed['is_valid'], 'true');
  assertEquals(parsed['garbage'], undefined);
  assertStringIncludes(parsed['ns']!, '://');
});
