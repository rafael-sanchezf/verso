/**
 * The one deep link the Steam link comes back on: `verso://steam/linked`.
 *
 * The `steam-link` Edge Function ends Valve's round trip with a 303 to
 * `verso://steam/linked?status=ok`, or `?status=error&reason=<code>` where the
 * code is a `LinkFailureReason` (supabase/functions/steam-link/link.ts). The
 * link deliberately carries no data of its own -- no SteamID, no token -- so all
 * this file does with it is read the status and the reason; the screen then
 * asks `getSteamLink` what actually happened.
 *
 * It arrives by up to three roads, and every one of them ends here:
 *
 * 1. `openAuthSessionAsync` hands the URL back (iOS, almost always).
 * 2. The app's own `Linking` listener sees it (Android, where the browser's
 *    promise races the app coming back to the front; iOS when it hands control
 *    to the app through the scheme instead).
 * 3. The router opens `app/steam/linked.tsx` with it, on a cold start, when no
 *    flow is waiting for it (see `+native-intent.tsx`).
 *
 * Pure, and relative imports only, so `test/steam-link-return.test.ts` runs it
 * without React Native. A failure's words are a dictionary key
 * (`profile.steam.link`), translated by the screen that shows them.
 */

import type { TranslationKey } from '../../lib/i18n/dictionary';

/** The path the router sees, and the route file that answers it. */
export const STEAM_LINK_RETURN_PATH = 'steam/linked';

/**
 * Where the Edge Function sends the browser back to, and the `redirectUrl`
 * handed to `openAuthSessionAsync`. On iOS only the scheme matters (it is
 * ASWebAuthenticationSession's `callbackURLScheme`); on Android the polyfill
 * matches incoming URLs by prefix, so it has to be the whole of it.
 */
export const STEAM_LINK_RETURN_URL = `verso://${STEAM_LINK_RETURN_PATH}`;

/** What a return says, before anyone has checked it against the database. */
export type LinkReturn = { status: 'ok' } | { status: 'error'; reason: string };

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * The path part of a URL, without scheme, query, fragment or wrapping slashes.
 * The same rule as `normalize` in `lib/auth-links.ts`, for the same reason: a
 * custom scheme puts the first segment where a URL parser expects a host.
 */
function pathOf(url: string): string {
  const withoutScheme = url.replace(SCHEME, '');
  const withoutQuery = withoutScheme.split('?')[0]!.split('#')[0]!;
  return withoutQuery.replace(/^\/+|\/+$/g, '');
}

/**
 * Is this the Steam link's return?
 *
 * Matched on the end of the path, so the Expo Go form
 * (`exp://127.0.0.1:8081/--/steam/linked`) counts as readily as the app's own.
 */
export function isSteamLinkReturn(url: string): boolean {
  const path = pathOf(url);
  return path === STEAM_LINK_RETURN_PATH || path.endsWith(`/${STEAM_LINK_RETURN_PATH}`);
}

/**
 * Whether the router should stay where it is for this URL.
 *
 * On a warm open a flow is waiting for the return -- the auth session or the
 * hook's `Linking` listener, both of which still fire when the router does not
 * navigate -- and pushing `/steam/linked` on top of the screen that is already
 * handling it would put a second Steam screen on the stack. On a cold start
 * nothing is waiting, so the router opens the route and the route sends the
 * status on to `/settings/steam`.
 */
export function keepsRouterStill(url: string, initial: boolean): boolean {
  return isSteamLinkReturn(url) && !initial;
}

/**
 * Read the query string by hand.
 *
 * Not `new URL(...).searchParams`: React Native's URL implementation has not
 * always had a working `searchParams`, and a custom scheme is exactly the case
 * where parsers disagree. The query here is two short keys the Edge Function
 * writes with `URLSearchParams`, so `+` is a space and the rest is percent
 * encoding.
 */
function queryOf(url: string): Map<string, string> {
  const params = new Map<string, string>();
  const query = url.split('#')[0]!.split('?')[1];
  if (!query) return params;

  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [rawKey, rawValue = ''] = pair.split('=');
    const key = decode(rawKey!);
    // The first value wins: the function never repeats a key, so a second one
    // came from somewhere else.
    if (key && !params.has(key)) params.set(key, decode(rawValue));
  }
  return params;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

/**
 * The status and reason a return URL carries, or null when the URL is not the
 * Steam link's return at all.
 *
 * Anything other than `status=ok` is an error: a return with no status, or one
 * this version does not know, is not something to celebrate. A missing reason
 * becomes `unknown`, which `linkFailureMessage` answers with the generic line.
 */
export function parseLinkReturn(url: string): LinkReturn | null {
  if (!isSteamLinkReturn(url)) return null;
  const query = queryOf(url);
  return linkReturnFrom(query.get('status'), query.get('reason'));
}

/**
 * The same, from the router's params (`/steam/linked?status=…` on a cold
 * start, forwarded to `/settings/steam`). Null when there is no status, which is
 * the ordinary case: someone opened the Steam screen from Settings.
 */
export function linkReturnFromParams(
  status: string | string[] | undefined,
  reason: string | string[] | undefined,
): LinkReturn | null {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const statusValue = first(status);
  if (!statusValue) return null;
  return linkReturnFrom(statusValue, first(reason));
}

function linkReturnFrom(status: string | null | undefined, reason: string | null | undefined): LinkReturn {
  if (status === 'ok') return { status: 'ok' };
  return { status: 'error', reason: reason?.trim() || 'unknown' };
}

/**
 * What to say about a failed link, or null when there is nothing to say.
 *
 * steam.ts names the two that deserve their own words: `cancelled` (they
 * pressed Cancel on Valve's page, so say nothing) and `already_linked_elsewhere`
 * (one Steam account belongs to one Verso account, enforced by a unique index;
 * the fix is to unlink it there). `state_not_valid` is an attempt that expired
 * or was already spent, and the fix is simply to start again. `not_configured`
 * is the hosted project missing its secret, which is Rafa's to fix rather than
 * the user's, said plainly. Everything else -- a tampered or unverifiable
 * assertion, a failed write, our server -- is ours to apologise for, in one
 * line that does not pretend to know more.
 */
export function linkFailureMessage(reason: string): TranslationKey | null {
  switch (reason) {
    case 'cancelled':
      return null;
    case 'already_linked_elsewhere':
      return 'profile.steam.link.linkedElsewhere';
    case 'state_not_valid':
    case 'missing_state':
      return 'profile.steam.link.expired';
    case 'not_configured':
      return 'profile.steam.link.notSetUp';
    default:
      return 'profile.steam.link.notConfirmed';
  }
}
