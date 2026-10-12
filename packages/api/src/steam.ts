/**
 * The Steam account link, from the app's side: start it, read it, import it,
 * spend it, undo it. ROADMAP.md V1, "Steam account link".
 *
 * The backend is one migration and two Edge Functions
 * (supabase/migrations/20260916210000_steam_link.sql,
 * supabase/functions/steam-link, supabase/functions/steam-import); this file is
 * the five calls a screen makes and the types it branches on. What a screen has
 * to know before it draws any of it:
 *
 * 1. **Linking leaves the app.** `startSteamLink` does not link anything: it
 *    returns a Valve URL for the app to open in a *system browser* (not a
 *    WebView -- Steam Guard and password managers both need the real browser,
 *    and Apple and Google both want third-party sign-in there). Valve redirects
 *    back to `verso://steam/linked?status=ok` when it is done, and the app
 *    confirms by reading `getSteamLink`. The user's session never travels
 *    through that round trip; see the Edge Function's header for why and how.
 *
 * 2. **A private profile is a normal answer, not an error.** `importSteamLibrary`
 *    returns `{ status: 'private_profile' }` when Steam declines to say what the
 *    account owns, which is what a profile whose Game details are not Public
 *    looks like from outside (docs/research/game-data-sources.md 4.3). That is
 *    the privacy checklist screen's cue, and it is a result rather than a throw
 *    precisely so a screen cannot accidentally treat it as a crash. `not_linked`
 *    and `rate_limited` are the same kind of answer.
 *
 * 3. **Candidates are an offer.** `steamCandidates` is a read: games the user
 *    owns on Steam, that the catalog knows, that they have no entry for. The
 *    import never adds anything to the backlog -- the backlog is the user's own
 *    list, so the app shows these and the user accepts one at a time through
 *    the ordinary entry path.
 *
 * 4. **Imported playtime is labelled.** The import writes
 *    `user_entries.playtime_minutes` with `playtime_source = 'steam'`, never
 *    over a figure the user typed themselves, and never from a zero (which is
 *    Steam's answer both for "never played" and for "total playtime hidden").
 *    Rule 21 still applies: every number carries its source. The same import
 *    adds PC to where a tracked game was played when Steam has hours on it
 *    (decision 19; `apply_steam_played_platforms` in
 *    supabase/migrations/20261007100000_drop_ownership.sql), adding to what
 *    the user recorded and never replacing it.
 *
 * 5. **Unlink keeps the numbers.** `unlinkSteam` drops the link and the stored
 *    library; playtime already imported stays on the entries, still saying
 *    where it came from.
 *
 * Attribution, which is the app's job and not this file's: pages showing Steam
 * data need Valve's logo and a link without `nofollow`, and the privacy policy
 * has to name where the data is stored (research 4.1 and the compliance
 * checklist in 10).
 */

import type { Client } from './client';
import type { Database } from './database.types';
import { NotSignedInError } from './entries';

type PlatformLinkRow = Database['public']['Tables']['platform_links']['Row'];

/** The name `platform_links.platform` carries for Steam. */
const PLATFORM = 'steam';

/** A linked Steam account, as the Settings screen shows it. */
export interface SteamLink {
  /** The 17-digit SteamID64. Public on Steam; not a secret, not a credential. */
  steamId: string;
  /**
   * When an import last started, or null if none ever has. "Started", not
   * "finished": the database stamps it as the slot is claimed, so a failed
   * import still moves it and still costs its ten minutes.
   */
  lastSyncedAt: string | null;
  /**
   * The last import's outcome as the Edge Function left it: 'linked' (never
   * imported), 'importing', 'ok', 'private', or 'error'. Free text in the
   * database, so treat an unknown value as 'unknown' rather than switching
   * exhaustively on it.
   */
  syncStatus: string | null;
}

/** Where to send the user, and how long the attempt stays open. */
export interface SteamLinkStart {
  /** Open this in a system browser. It is Valve's page, not ours. */
  url: string;
  /** ISO timestamp after which the attempt is dead and the flow must restart. */
  expiresAt: string;
  ttlSeconds: number;
}

/** What one import did, or why it did nothing. Branch on `status`. */
export type SteamImportResult =
  /** No Steam account linked. Offer the link rather than a retry. */
  | { status: 'not_linked' }
  /** One import per ten minutes. `retryAfterSeconds` is what is left of it. */
  | { status: 'rate_limited'; retryAfterSeconds: number }
  /** Steam would not say what the account owns: the privacy checklist. */
  | { status: 'private_profile' }
  | {
      status: 'imported';
      /** Games Steam says the account owns. */
      ownedGames: number;
      /** How many of them matched a catalog row and can be shown. */
      resolved: number;
      /** Rows dropped because the account no longer owns them. */
      removed: number;
      /** Entries whose playtime changed. Zero is an ordinary answer. */
      entriesUpdated: number;
      /**
       * Entries that gained PC on their played-on list, because Steam has hours
       * on a game the user tracks. Zero is an ordinary answer, and the usual
       * one on a second import.
       */
      playedPlatformsUpdated: number;
      /**
       * Every owned game reads as zero minutes, which is what "Always keep my
       * total playtime private" looks like. A hint for the checklist screen, not
       * a fact: a new account with six unplayed games looks the same.
       */
      playtimeHidden: boolean;
      /** The instant the whole library was read at. */
      fetchedAt: string;
    };

/** A game owned on Steam that the user is not tracking here. */
export interface SteamCandidate {
  mediaItemId: string;
  steamAppId: number;
  /** The catalog's title. `name` below is Steam's, which can differ. */
  title: string;
  year: number | null;
  coverImageId: string | null;
  externalIds: Record<string, unknown> | null;
  /** The name Steam uses for the app. */
  name: string | null;
  playtimeForeverMinutes: number;
  lastPlayedAt: string | null;
}

/** One game's Steam playtime, for the line on the game page. */
export interface SteamPlaytime {
  steamAppId: number;
  /** Total minutes. Zero means Steam reported zero, which may mean it is hidden. */
  playtimeForeverMinutes: number;
  /** The last two weeks, or null when the game was not played in them. */
  playtime2weeksMinutes: number | null;
  lastPlayedAt: string | null;
  /** When the import that wrote this row read it from Steam. */
  fetchedAt: string;
}

/**
 * The caller's Steam link, or null when there is none.
 *
 * `platform_links` is owner-only, so this needs no user id: RLS has already
 * filtered the table down to the caller, and `platform` is the only thing left
 * to choose. `maybeSingle` because "not linked" is the ordinary state, not a
 * missing row worth throwing over.
 */
export async function getSteamLink(client: Client): Promise<SteamLink | null> {
  const { data, error } = await client
    .from('platform_links')
    .select('external_user_id, last_synced_at, sync_status')
    .eq('platform', PLATFORM)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as Pick<PlatformLinkRow, 'external_user_id' | 'last_synced_at' | 'sync_status'>;
  return {
    steamId: row.external_user_id,
    lastSyncedAt: row.last_synced_at,
    syncStatus: row.sync_status,
  };
}

/**
 * Begin the OpenID round trip.
 *
 * Invokes the `steam-link` Edge Function, which mints a single-use state bound
 * to the caller, records it, and builds Valve's URL around it. The app opens
 * `url` in a system browser and waits for the `verso://steam/linked` deep link;
 * on `status=ok` it reads `getSteamLink` to see the result, because the deep
 * link deliberately carries no data of its own.
 *
 * The attempt expires (ten minutes at the time of writing). A user who comes
 * back to a dead attempt gets `status=error&reason=state_not_valid` and the app
 * starts a new one; there is nothing to continue.
 *
 * Two `reason` codes on the deep link deserve their own copy rather than a
 * generic "that did not work": `cancelled` (they pressed Cancel on Valve's
 * page, so say nothing dramatic) and `already_linked_elsewhere` (that Steam
 * account is linked to a different Verso account — one Steam account belongs to
 * one person, enforced by a unique index, and the fix is to unlink it there).
 * Everything else is ours to apologise for.
 */
export async function startSteamLink(client: Client): Promise<SteamLinkStart> {
  const { data, error } = await client.functions.invoke<SteamLinkStart>('steam-link', {
    body: { action: 'start' },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('steam-link returned no URL');
  return data;
}

/**
 * Import the linked account's library and playtime.
 *
 * Every outcome the app can do something about is a value, not a throw:
 * `not_linked` (offer the link), `rate_limited` (say when), `private_profile`
 * (the checklist), `imported` (the numbers). A throw from here means something
 * is actually broken -- no key deployed, Steam down, the database unhappy --
 * and the screen should say so in those terms.
 *
 * Call it after linking and whenever the user asks. One per ten minutes is
 * enforced in the database, so a second tap is answered honestly rather than
 * queued.
 */
export async function importSteamLibrary(client: Client): Promise<SteamImportResult> {
  const { data, error } = await client.functions.invoke<SteamImportResult>('steam-import', {
    body: {},
  });
  if (error) throw error;
  if (!data?.status) throw new Error('steam-import returned no status');
  return data;
}

/**
 * Games the caller owns on Steam and is not tracking, least played first.
 *
 * Least played first because the interesting end of a large library is the pile
 * of things bought and never started, which is what the roadmap means by
 * "owned-but-unplayed backlog candidates". Nothing here writes: the app offers
 * these and the user accepts, one at a time, through the ordinary entry path.
 *
 * An empty array is the normal answer for someone who has not imported, and for
 * someone who tracks everything they own. It is never an error.
 */
export async function steamCandidates(
  client: Client,
  limit?: number,
): Promise<SteamCandidate[]> {
  const { data, error } = await client.rpc('steam_backlog_candidates', {
    ...(limit === undefined ? {} : { p_limit: limit }),
  });
  if (error) throw error;

  // `supabase gen types` marks every column of a set-returning function
  // non-nullable, which the database does not guarantee: a catalog row may have
  // no year and no cover, and a Steam app may have no name. Same re-widening as
  // in ranking.ts and catalog.ts.
  return (data ?? []).map((row) => ({
    mediaItemId: row.media_item_id,
    steamAppId: row.steam_app_id,
    title: row.title,
    year: (row.year as number | null) ?? null,
    coverImageId: (row.cover_image_id as string | null) ?? null,
    externalIds: (row.external_ids as Record<string, unknown> | null) ?? null,
    name: (row.name as string | null) ?? null,
    playtimeForeverMinutes: row.playtime_forever_minutes,
    lastPlayedAt: (row.last_played_at as string | null) ?? null,
  }));
}

/**
 * The caller's stored Steam playtime for one game, or null.
 *
 * Null covers three ordinary cases a screen has to tell apart from zero: no
 * Steam account linked, the account does not own this game, and nothing has
 * been imported yet. A zero, by contrast, is Steam saying zero -- which may
 * mean the user hides their total playtime, so a screen that shows "0h" should
 * be as careful about it as the import is.
 *
 * `steam_library` is owner-only, so this filters on the game and nothing else.
 */
export async function steamPlaytimeFor(
  client: Client,
  mediaItemId: string,
): Promise<SteamPlaytime | null> {
  const { data, error } = await client
    .from('steam_library')
    .select('steam_app_id, playtime_forever_minutes, playtime_2weeks_minutes, last_played_at, fetched_at')
    .eq('media_item_id', mediaItemId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    steamAppId: data.steam_app_id,
    playtimeForeverMinutes: data.playtime_forever_minutes,
    playtime2weeksMinutes: data.playtime_2weeks_minutes,
    lastPlayedAt: data.last_played_at,
    fetchedAt: data.fetched_at,
  };
}

/**
 * Forget the caller's Steam account.
 *
 * Two calls rather than one, because they are two different kinds of thing:
 * `unlink_steam` deletes the link and the stored library, both of which the
 * user owns and can delete; `forget_steam_link_attempts` clears any half-
 * finished OpenID attempt from a table the user has no privilege on, which is
 * why that one is `security definer` and takes no arguments. Doing both means
 * an unlink while a browser tab is still open on Valve's page cannot quietly
 * re-link a moment later.
 *
 * Playtime already imported stays on the entries, still labelled 'steam'. It is
 * the user's data now, and the number does not become less true.
 *
 * Throws `NotSignedInError` when there is no session, the way `entries.ts` does:
 * the database raises 28000 and this turns it into the error the app already
 * knows.
 */
export async function unlinkSteam(client: Client): Promise<void> {
  const { error } = await client.rpc('unlink_steam');
  if (error) {
    if (error.code === '28000') throw new NotSignedInError('unlinkSteam');
    throw error;
  }

  const { error: attemptsError } = await client.rpc('forget_steam_link_attempts');
  if (attemptsError) {
    if (attemptsError.code === '28000') throw new NotSignedInError('unlinkSteam');
    throw attemptsError;
  }
}
