/**
 * Steam's OpenID 2.0 provider, and the checks that make its answer worth
 * anything.
 *
 * Steam is an OpenID 2.0 provider at `https://steamcommunity.com/openid` and
 * that is all it is: no scopes, no tokens, no API key. You redirect the user to
 * Valve's page, they sign in there, and Steam redirects back to your
 * `return_to` with an assertion whose `claimed_id` is
 * `https://steamcommunity.com/openid/id/<steamid64>`
 * (docs/research/game-data-sources.md 4.4).
 *
 * **That redirect is a URL in a browser, so on its own it proves nothing.**
 * Anyone can type one. The assertion becomes evidence only after Valve has been
 * asked to confirm it signed exactly these bytes, which is
 * `openid.mode=check_authentication` and an answer of `is_valid:true`. Every
 * public write-up of "sign in through Steam" that has ever been broken was
 * broken by skipping that step or by trusting a field the signature did not
 * cover, so both are checked here and both are tested:
 *
 *   1. `openid.signed` must list the fields we are about to believe. Steam
 *      signs `op_endpoint`, `claimed_id`, `identity`, `return_to` and
 *      `response_nonce`; a callback that omits any of them from `signed` is
 *      refused before Valve is even asked, because Valve would happily confirm
 *      a signature over the remaining fields while the attacker supplied the
 *      rest.
 *   2. `check_authentication` must answer `is_valid:true`. A tampered
 *      `claimed_id` -- the whole attack -- fails here, because the digest no
 *      longer matches what Valve signed.
 *
 * On top of the protocol, three checks about *us*: the assertion has to come
 * from Steam's endpoint and no other OpenID provider, `identity` has to equal
 * `claimed_id`, and `return_to` has to be the exact URL we sent, which is what
 * binds the assertion to one link attempt (the `state` lives in that URL and
 * the signature covers it).
 *
 * **Every `openid.*` key must appear exactly once, and the bytes we read are
 * the bytes we verify.** A query string may repeat a key, and the two halves of
 * this file used to disagree about which copy counted: `URLSearchParams.get`
 * returns the *first*, while building a body with `set` in a loop leaves the
 * *last*. That gap is a complete account takeover. Send `openid.claimed_id`
 * twice -- the victim's id first, your own genuinely signed id second -- and
 * the checks below read the victim while Valve is handed, and validates, your
 * own assertion; the link is then written as (you, the victim's SteamID64).
 *
 * Both halves of the fix are here and neither is sufficient alone.
 * `canonicalOpenIdParams` refuses a repeated key outright, and it is also what
 * produces the single set of values that `checkCallback` reads *and*
 * `verifyAssertion` sends, so "what we checked" and "what Valve signed for"
 * cannot be different objects even if someone later adds a field.
 *
 * This module is deliberately free of Supabase, of Deno APIs, and of globals
 * other than `fetch`, so openid.test.ts can run the whole of it against
 * fixtures with no network and no stack.
 */

/** Valve's OpenID endpoint. Both the redirect target and the verification POST. */
export const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';

export const OPENID_NS = 'http://specs.openid.net/auth/2.0';

/** "I do not know who this is yet; ask them." The only mode Steam supports. */
export const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';

/**
 * Fields whose values we read, and which therefore must be inside
 * `openid.signed`.
 *
 * `mode` is not in the list on purpose: Steam does not sign it, and requiring
 * it would refuse every genuine assertion. Nothing is decided from `mode`
 * except "is this an assertion or a cancellation", and a forged `cancel` only
 * denies the attacker's own link.
 */
export const REQUIRED_SIGNED_FIELDS = [
  'op_endpoint',
  'claimed_id',
  'identity',
  'return_to',
  'response_nonce',
] as const;

/**
 * Every field OpenID 2.0 allows in a positive assertion, section 10.1.
 *
 * `ns`, `mode`, `op_endpoint`, `return_to`, `response_nonce`, `assoc_handle`,
 * `signed` and `sig` are required; `claimed_id` and `identity` are optional as a
 * pair (an OP that is making no claim about an identifier omits both, which is
 * not a case we can do anything with but is a legal message); `invalidate_handle`
 * is optional and appears when the OP wants us to drop an association we never
 * made. A `cancel` response carries only `ns` and `mode`, which are in here too.
 *
 * Nothing outside this list, plus whatever `openid.signed` itself names, is
 * allowed through -- see `unrecognisedOpenIdKeys`.
 */
export const POSITIVE_ASSERTION_FIELDS = [
  'ns',
  'mode',
  'op_endpoint',
  'claimed_id',
  'identity',
  'return_to',
  'response_nonce',
  'invalidate_handle',
  'assoc_handle',
  'signed',
  'sig',
] as const;

/** `https://steamcommunity.com/openid/id/76561198000000000`, and nothing else. */
const CLAIMED_ID_PATTERN = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

/** How long Valve gets to answer the verification POST. */
export const VERIFY_TIMEOUT_MS = 10_000;

/** Names us to Valve, the way the catalog's clients do. */
export const USER_AGENT = 'verso-steam-link/0.1 (+https://github.com/rafael-sanchezf/verso)';

/**
 * Why a callback was refused.
 *
 * These reach the app as `verso://steam/linked?status=error&reason=<this>`, so
 * they are a small closed vocabulary rather than free text: a screen can say
 * something useful about `cancelled` ("you cancelled on Steam's page") and
 * something honest about the rest ("that did not work, try again"), and none of
 * them says anything an attacker could use to tell one near miss from another.
 *
 * This type is the *protocol's* half of that vocabulary. `link.ts` widens it to
 * `CompleteFailure` for the round trip's own failures and then to
 * `LinkFailureReason`, which is the complete set a deep link can carry -- that
 * last one is what a screen should switch on, because it is the only one that
 * also covers the two reasons index.ts raises before any of this runs.
 */
export type CallbackFailure =
  | 'cancelled'
  | 'duplicate_parameter'
  | 'not_an_assertion'
  | 'wrong_provider'
  | 'unsigned_field'
  | 'bad_claimed_id'
  | 'identity_mismatch'
  | 'return_to_mismatch'
  | 'not_verified'
  | 'verification_failed';

export interface Assertion {
  /** The 17-digit SteamID64 out of `claimed_id`. */
  steamId: string;
  /** Valve's own single-use nonce for this assertion. */
  responseNonce: string;
  /** The `return_to` Steam echoed, which is the one we sent. */
  returnTo: string;
}

export type CallbackResult =
  | {
      ok: true;
      assertion: Assertion;
      /**
       * The exact `openid.*` values the checks below read, one per key. This is
       * what goes back to Valve, so the verified bytes and the read bytes are
       * the same object rather than two readings of a query string.
       */
      canonical: URLSearchParams;
    }
  | { ok: false; reason: CallbackFailure };

/**
 * `openid.*` keys that are neither part of a positive assertion nor named in
 * `openid.signed`. Empty for anything Steam actually sends.
 *
 * Refusing a repeated key was half the job: an `openid.*` key we never *read*
 * is still forwarded verbatim in the `check_authentication` body, so a stray
 * `openid.Claimed_id` -- different case, different key, same look to a human
 * reading a log -- rides along into the verification and into whatever else
 * ever parses this query. Nothing downstream should have to be careful about
 * that, so the set is closed here instead.
 *
 * Fields named in `openid.signed` are allowed because the protocol requires
 * them to be echoed: an OP may sign extension fields, and dropping one would
 * make a genuine assertion fail verification. That is not a way in -- `signed`
 * is itself signed, so naming a smuggled field in it breaks the signature at
 * Valve, and `REQUIRED_SIGNED_FIELDS` still demands the five that matter.
 */
export function unrecognisedOpenIdKeys(params: URLSearchParams): string[] {
  const allowed = new Set<string>(POSITIVE_ASSERTION_FIELDS.map((field) => `openid.${field}`));
  for (const field of (params.get('openid.signed') ?? '').split(',')) {
    const trimmed = field.trim();
    if (trimmed) allowed.add(`openid.${trimmed}`);
  }

  return [...new Set(params.keys())].filter(
    (key) => key.startsWith('openid.') && !allowed.has(key),
  );
}

/**
 * The `openid.*` parameters as a set with exactly one value per key, or null if
 * any key is repeated.
 *
 * Null rather than "pick one", because there is no honest reason for Steam to
 * send a key twice and every dishonest one is an attempt to make two readers
 * disagree. Non-`openid.` keys are dropped: they are ours (`state`), they are
 * never signed, and they have no business in the verification body.
 */
export function canonicalOpenIdParams(params: URLSearchParams): URLSearchParams | null {
  const canonical = new URLSearchParams();
  for (const key of new Set(params.keys())) {
    if (!key.startsWith('openid.')) continue;
    const values = params.getAll(key);
    if (values.length > 1) return null;
    canonical.set(key, values[0]!);
  }
  return canonical;
}

/**
 * The URL to send the user to.
 *
 * `realm` is what Valve shows the user as the site asking for their identity,
 * and OpenID requires `return_to` to sit under it. We pass the function's own
 * origin, so the user sees the project's Supabase host: honest, if not pretty.
 * Nothing about the user is in this URL -- Steam has no idea who is arriving
 * until they sign in, which is exactly why the `state` in `return_to` has to
 * carry that.
 */
export function buildLoginUrl(returnTo: string, realm: string): string {
  const params = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': IDENTIFIER_SELECT,
    'openid.claimed_id': IDENTIFIER_SELECT,
  });
  return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
}

/**
 * Everything that can be decided about a callback without asking Valve.
 *
 * Runs first because it is free and because it narrows what we hand back to
 * Steam: a callback that fails here never becomes an outbound request.
 */
export function checkCallback(params: URLSearchParams, expectedReturnTo: string): CallbackResult {
  // First, before anything is read: one value per key, or nothing doing.
  // Everything below reads `canonical`, never `params`, so there is no second
  // reading for an attacker to aim at.
  const canonical = canonicalOpenIdParams(params);
  if (!canonical) return { ok: false, reason: 'duplicate_parameter' };

  const mode = canonical.get('openid.mode');
  if (mode === 'cancel') return { ok: false, reason: 'cancelled' };
  if (mode !== 'id_res') return { ok: false, reason: 'not_an_assertion' };

  if (canonical.get('openid.op_endpoint') !== STEAM_OPENID_ENDPOINT) {
    return { ok: false, reason: 'wrong_provider' };
  }

  // The signature covers these or we do not read them.
  const signed = (canonical.get('openid.signed') ?? '').split(',').map((field) => field.trim());
  for (const field of REQUIRED_SIGNED_FIELDS) {
    if (!signed.includes(field)) return { ok: false, reason: 'unsigned_field' };
  }

  const claimedId = canonical.get('openid.claimed_id') ?? '';
  const match = CLAIMED_ID_PATTERN.exec(claimedId);
  if (!match) return { ok: false, reason: 'bad_claimed_id' };

  // Steam sends the same URL in both, and a difference means something is
  // rewriting the assertion between Valve and us.
  if (canonical.get('openid.identity') !== claimedId) {
    return { ok: false, reason: 'identity_mismatch' };
  }

  const returnTo = canonical.get('openid.return_to') ?? '';
  // Byte-for-byte, because this is what binds the assertion to one link
  // attempt: the state is a query parameter of this URL and the signature
  // covers the whole of it.
  if (returnTo !== expectedReturnTo) {
    return { ok: false, reason: 'return_to_mismatch' };
  }

  const responseNonce = canonical.get('openid.response_nonce') ?? '';
  if (!responseNonce) return { ok: false, reason: 'unsigned_field' };

  return { ok: true, assertion: { steamId: match[1]!, responseNonce, returnTo }, canonical };
}

export interface VerifyOptions {
  /** Swapped for a fixture in tests. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Hand the assertion back to Valve and ask whether it signed it.
 *
 * Every `openid.*` parameter is echoed unchanged with `mode` swapped for
 * `check_authentication`; that is the protocol, and changing anything else --
 * dropping a field, re-encoding one -- makes a genuine assertion fail.
 *
 * The parameters are canonicalised here too, not only in `checkCallback`. In
 * the normal path they have already been through `canonicalOpenIdParams` and
 * this is a no-op; the point is that this function is exported and cannot be
 * made to verify a different set of bytes from the ones a caller checked. A
 * repeated key is refused rather than resolved: see the file header.
 *
 * The answer is OpenID's key-value form, not JSON: `ns:...\nis_valid:true\n`.
 * Anything other than exactly `true` is a no, and so is a non-2xx or a
 * connection that dies. There is no retry: an assertion is alive for seconds,
 * the user is watching a browser, and a second attempt to verify the same
 * bytes would answer the same way.
 */
export async function verifyAssertion(
  params: URLSearchParams,
  options: VerifyOptions = {},
): Promise<boolean> {
  const fetchImpl = options.fetchImpl ?? fetch;

  const body = canonicalOpenIdParams(params);
  if (!body) return false;
  body.set('openid.mode', 'check_authentication');

  const response = await fetchImpl(STEAM_OPENID_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/plain',
      'User-Agent': USER_AGENT,
    },
    body: body.toString(),
    signal: AbortSignal.timeout(options.timeoutMs ?? VERIFY_TIMEOUT_MS),
  });

  if (!response.ok) return false;
  return parseKeyValueForm(await response.text())['is_valid'] === 'true';
}

/**
 * OpenID's key-value form: one `key:value` per line, the value running to the
 * end of the line (so a value may contain colons, and the split is on the first
 * one only).
 */
export function parseKeyValueForm(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const at = line.indexOf(':');
    if (at <= 0) continue;
    out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return out;
}

/**
 * The whole callback check: the local rules, then Valve's word for it.
 *
 * In that order, always. The local checks cost nothing and refuse the shapes
 * that are obviously wrong; the verification costs a round trip and is the only
 * thing that can refuse a shape that is right and a signature that is forged.
 */
export async function authenticate(
  params: URLSearchParams,
  expectedReturnTo: string,
  options: VerifyOptions = {},
): Promise<CallbackResult> {
  const checked = checkCallback(params, expectedReturnTo);
  if (!checked.ok) return checked;

  let valid: boolean;
  try {
    // `checked.canonical`, not `params`: the bytes that were checked are the
    // bytes Valve is asked about. This is the line that closes the
    // duplicate-parameter takeover described in the file header.
    valid = await verifyAssertion(checked.canonical, options);
  } catch {
    // A timeout or a dead connection. Distinct from `not_verified` because it
    // is our problem, not the caller's, and the app can honestly say "try
    // again" rather than "that did not work".
    return { ok: false, reason: 'verification_failed' };
  }

  return valid ? checked : { ok: false, reason: 'not_verified' };
}
