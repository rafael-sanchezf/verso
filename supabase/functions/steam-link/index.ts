/**
 * Sign in through Steam: start the OpenID round trip, and finish it.
 * ROADMAP.md V1, "Steam account link".
 *
 * Two routes on one function, because they are two halves of one conversation
 * and the second has to know the first happened:
 *
 *   POST  { "action": "start" }   with the user's JWT
 *         -> { url, expiresAt }. The app opens `url` in a system browser.
 *
 *   GET   ?state=...&openid.*=...  from Steam's redirect, no JWT
 *         -> 302 to verso://steam/linked?status=ok
 *            or   verso://steam/linked?status=error&reason=<code>
 *
 * Deploy:
 *
 *   supabase secrets set STEAM_LINK_RETURN_URL=https://<ref>.supabase.co/functions/v1/steam-link
 *   supabase functions deploy steam-link --no-verify-jwt
 *
 * STEAM_LINK_RETURN_URL is required, not a convenience. It is the OpenID realm
 * Valve shows the user and the base of every `return_to`, so taking it from the
 * incoming request would hand both to whoever controls the Host header. The
 * only way to fall back to the request is the explicit
 * STEAM_LINK_ALLOW_REQUEST_RETURN_TO=true development flag.
 *
 * **--no-verify-jwt is required and is not a hole.** Steam redirects a browser,
 * and a browser sends no Authorization header, so the platform's default JWT
 * gate would refuse Valve's callback before any of this ran. With the gate off,
 * each route authenticates what it actually has:
 *
 *   * the POST verifies the bearer token with `auth.getUser()` and refuses
 *     anything that is not a live user session. That is the same check the gate
 *     would have done, done here, plus the part the gate never does: the gate
 *     admits the anon key too.
 *   * the GET has no user to authenticate and does not pretend otherwise. It
 *     authenticates the *assertion* with Valve (`check_authentication`,
 *     `is_valid:true` -- see openid.ts) and gets the *user* from a single-use
 *     state row minted by the POST. An attacker with no state and no valid
 *     assertion can do nothing here but collect an error redirect.
 *
 * **The user's JWT never enters a URL.** That is the whole reason the state
 * table exists: `openid.return_to` ends up in the URL bar, in browser history,
 * and in Valve's logs, so what it carries is an opaque handle that is worth
 * nothing after one use and nothing at all after ten minutes. See the header of
 * supabase/migrations/20260916210000_steam_link.sql.
 *
 * The Steam Web API key is not used here. OpenID needs none (research 4.4); the
 * key is the import's business.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import {
  completeLink,
  startLink,
  STATE_TTL_SECONDS,
  type LinkDeps,
  type LinkFailureReason,
} from './link.ts';

/** Where the browser is sent when the round trip is over. */
const DEFAULT_APP_REDIRECT = 'verso://steam/linked';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceRoleKey) {
    return json({ error: 'SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be set' }, 500);
  }

  const service = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // The function's own public URL, with no query string: `return_to` is this
  // plus one attempt's state, and its origin is the OpenID realm Valve shows
  // the user.
  //
  // **Configured, not derived.** This used to come from the request's own
  // origin and path, which means an attacker-supplied Host header decides the
  // realm and the return_to: Valve is asked to redirect to somewhere else, and
  // the user is shown somebody else's name on Valve's own consent page. So the
  // secret is required, and the request is a fallback only behind an explicit
  // development flag -- which is never set on the hosted project, and says what
  // it is where anyone reading the deployment can see it.
  const requestUrl = new URL(request.url);
  const returnToBase = Deno.env.get('STEAM_LINK_RETURN_URL') ??
    (Deno.env.get('STEAM_LINK_ALLOW_REQUEST_RETURN_TO') === 'true'
      ? `${requestUrl.origin}${requestUrl.pathname}`
      : null);
  if (!returnToBase) {
    console.error('steam-link: STEAM_LINK_RETURN_URL is not set');
    if (request.method === 'GET') return redirectToApp('error', 'not_configured');
    return json({ error: 'the Steam link is not configured' }, 503);
  }

  const deps: LinkDeps = {
    returnToBase,
    realm: new URL(returnToBase).origin,
    createState: (userId, stateHash, ttlSeconds) => createState(service, userId, stateHash, ttlSeconds),
    consumeState: (stateHash, responseNonce) => consumeState(service, stateHash, responseNonce),
    linkAccount: (userId, steamId) => linkAccount(service, userId, steamId),
  };

  try {
    if (request.method === 'GET') return await handleCallback(deps, request);
    if (request.method === 'POST') return await handleStart(deps, request, url, anonKey);
    return json({ error: 'method not allowed' }, 405);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`steam-link: ${message}`);
    // A GET is a browser: send it home with an error rather than a JSON body it
    // cannot do anything with.
    if (request.method === 'GET') return redirectToApp('error', 'server_error');
    return json({ error: 'internal error' }, 500);
  }
});

/**
 * POST: the app, holding a user session, asks for somewhere to send the user.
 *
 * `getUser(token)` is a round trip to the auth server, so a revoked or expired
 * session is refused here and not ten minutes later. The user id it returns is
 * the only thing bound to the state; nothing the caller sent is trusted.
 */
async function handleStart(
  deps: LinkDeps,
  request: Request,
  url: string,
  anonKey: string,
): Promise<Response> {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) return json({ error: 'not signed in' }, 401);

  const auth = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return json({ error: 'not signed in' }, 401);

  let action = 'start';
  try {
    const body = (await request.json()) as { action?: string } | null;
    if (body?.action) action = body.action;
  } catch {
    // An empty body means `start`, which is the only action there is.
  }
  if (action !== 'start') return json({ error: `unknown action: ${action}` }, 400);

  const started = await startLink(deps, data.user.id);
  return json({ ...started, ttlSeconds: STATE_TTL_SECONDS });
}

/** GET: Steam's redirect. Verify, spend the state, write the link, go home. */
async function handleCallback(deps: LinkDeps, request: Request): Promise<Response> {
  const result = await completeLink(deps, request.url);

  if (!result.ok) {
    // The reason is a closed vocabulary from openid.ts and link.ts, never a
    // message and never anything Valve said: it reaches the app in a URL.
    console.error(`steam-link: callback refused (${result.reason})`);
    return redirectToApp('error', result.reason);
  }

  // The SteamID64 is deliberately not in the redirect. It is the user's own and
  // not a secret, but a deep link is a URL like any other and the app can read
  // it from `platform_links` a moment later with getSteamLink().
  return redirectToApp('ok');
}

async function createState(
  service: SupabaseClient,
  userId: string,
  stateHash: string,
  ttlSeconds: number,
): Promise<string> {
  const { data, error } = await service.rpc('start_steam_link_state', {
    p_user_id: userId,
    p_state_hash: stateHash,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) throw error;
  return data as string;
}

async function consumeState(
  service: SupabaseClient,
  stateHash: string,
  responseNonce: string,
): Promise<string | null> {
  const { data, error } = await service.rpc('consume_steam_link_state', {
    p_state_hash: stateHash,
    p_response_nonce: responseNonce,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/**
 * Write the verified SteamID64 onto `platform_links`.
 *
 * An upsert, because re-linking is ordinary: a user who signs in with a
 * different Steam account replaces the id rather than collecting two. The
 * primary key is (user_id, platform), so that is one statement.
 *
 * `last_synced_at` is left alone: linking is not importing, and a link made
 * right after an import must not look like a fresh sync. `sync_status` is set
 * to 'linked' so the app can tell a brand-new link from one that has imported.
 *
 * A 23505 here is the unique index on (platform, external_user_id) in
 * 20260916210000_steam_link.sql: this SteamID64 already belongs to a different
 * account. That is a fact to report, not an error to log, so it comes back as a
 * value and the caller turns it into `status=error&reason=already_linked_elsewhere`.
 * Nothing is written.
 */
async function linkAccount(
  service: SupabaseClient,
  userId: string,
  steamId: string,
): Promise<'ok' | 'already_linked_elsewhere'> {
  const { error } = await service.from('platform_links').upsert(
    {
      user_id: userId,
      platform: 'steam',
      external_user_id: steamId,
      sync_status: 'linked',
    },
    { onConflict: 'user_id,platform' },
  );
  if (error) {
    if (error.code === '23505') return 'already_linked_elsewhere';
    throw error;
  }
  return 'ok';
}

/**
 * Hand the browser back to the app.
 *
 * 303 rather than 302: the response to a GET is a GET, and 303 says so without
 * depending on how a given browser reads 302. The target is a custom scheme, so
 * the OS hands it to the app; a device with the app missing shows its own
 * "cannot open" page, which is a better failure than a blank JSON body.
 *
 * `reason` is a `LinkFailureReason` and not a string, so the two this file
 * raises on its own -- `not_configured` and `server_error` -- are part of the
 * closed vocabulary the app switches on rather than two values that only ever
 * existed here.
 */
function redirectToApp(status: 'ok' | 'error', reason?: LinkFailureReason): Response {
  const base = Deno.env.get('STEAM_LINK_APP_REDIRECT') ?? DEFAULT_APP_REDIRECT;
  const target = new URL(base);
  target.searchParams.set('status', status);
  if (reason) target.searchParams.set('reason', reason);

  return new Response(null, {
    status: 303,
    headers: { ...CORS_HEADERS, Location: target.toString() },
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
