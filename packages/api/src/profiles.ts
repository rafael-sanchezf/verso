/**
 * The caller's own `profiles` row: read it, and edit the fields they own: the
 * three of the Edit profile form, the two the onboarding writes (where they
 * play, and which media they track), and where they watch (the region and the
 * streaming services, the movies' settings row).
 *
 * Not to be confused with `profile.ts` next door, which is the Profile *tab*'s
 * two reads (the stats row and recent activity). This file is the identity at
 * the top of that screen and the Edit profile form behind it
 * (docs/design/specs/profile.md, "Data" and "Behavior").
 *
 * **This is the one module here that names a user id.** Everywhere else in this
 * package the absence of a user id is the point: Row Level Security filters
 * `user_entries` and `ranking_entries` down to the caller, so a query that
 * mentioned a user would be adding a filter the database has already applied.
 * `profiles` is the exception. Its select policy is `using (true)` for
 * `authenticated`, because the social layer needs every profile readable, so an
 * unfiltered read here would return the whole app's users and `.single()` would
 * fail the moment a second person signed up. The id comes from the stored
 * session, the same way `entries.ts` reads it for the insert half of an upsert,
 * and for the same reason it is safe: it is a filter value, not an
 * authorization decision. The update policy (`auth.uid() = id`, both `using`
 * and `with check`) is what actually stops one user writing another's row, and
 * `supabase/tests/profiles.test.sql` proves it.
 *
 * **Passwords are not here and never will be.** Supabase Auth keeps a bcrypt
 * hash in `auth.users` and no view or API returns it. Changing an email or a
 * password goes through `client.auth`, not through this table.
 *
 * **Two failures are typed; everything else throws as it is.** Like the writers
 * in `entries.ts` this module throws rather than returning a result, because a
 * dead network or a missing row is a bug and there is no copy for a screen to
 * write about it. The two exceptions are the username rules, which are exactly
 * as normal as a wrong password on a sign-in form: the handle someone typed is
 * taken, or it is not a legal handle. Those come back as a `UsernameError`
 * carrying a `kind` the compiler can switch on and a message a screen may
 * render, which is what profile.md asks for ("a taken or invalid username shows
 * the typed error's message"). That message exception is deliberate and local:
 * `AuthError.message` next door is Supabase's own wording and must not be shown.
 *
 * **Platforms and media are as visible as a username.** The select policy that
 * makes every profile readable covers the two onboarding columns too, so another
 * signed-in user can read where someone plays and which media they track. That
 * is the kind of fact a public profile shows; if it stops being one, the two
 * columns move to an owner-only table and this module reads them from there.
 *
 * Schema: supabase/migrations/20260909000000_core_schema.sql (the table, its
 * policies, and the username constraints), 20260916120000_profiles_from_auth_metadata.sql
 * (the seed from the provider's metadata), and 20261007120000_onboarding_backend.sql
 * (`platforms` and `media`), and 20261008202000_watch_settings.sql
 * (`watch_region` and `watch_provider_ids`, as visible as `platforms`).
 */

import type { Medium } from '@verso/core';
import type { Client } from './client';
import type { Database } from './database.types';
import { NotSignedInError } from './entries';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

/**
 * One user's public identity.
 *
 * Every field but `id` and `createdAt` is nullable and usually null at first:
 * an email sign-up seeds nothing, and a Google sign-up seeds a name and a
 * picture but never a username. The Profile screen's fallbacks (the email's
 * local part for the name, the joined date alone without a handle, a
 * placeholder circle for the avatar) exist because of that, so a screen must
 * handle null rather than assume the trigger filled anything in.
 */
export interface Profile {
  /** The `auth.users` id. The same value `session.user.id` carries. */
  id: string;
  /** The @handle, or null until the user picks one. Lowercase letters, digits, and underscores, 3 to 24. */
  username: string | null;
  /** Seeded from the provider's `full_name` or `name` where there was one. */
  displayName: string | null;
  /** Seeded from the provider's `avatar_url` or `picture`. A URL we do not host. */
  avatarUrl: string | null;
  /** When the account was made, as an ISO timestamp. The "joined {Mon YYYY}" line. */
  createdAt: string;
  /**
   * Where they play or have played, as IGDB platform names spelled like
   * `game_details.platforms`: `expandPlatforms(picks)` from @verso/core, folds
   * applied. Empty when the platforms step was skipped or never shown; the deck
   * then reads every platform ("Popular everywhere"). Decision 20.
   */
  platforms: string[];
  /**
   * The media they chose to track in the questionnaire (decision 25), or null
   * when it has not been answered: a null here is what makes a signed-in user
   * a new user, whom the root layout sends to the onboarding's first screen
   * (docs/design/specs/onboarding.md). Never empty once answered. Every
   * account that had entries or rankings before the questionnaire existed was
   * given the media of those rows.
   */
  media: Medium[] | null;
  /**
   * The market they watch in, ISO 3166-1 alpha-2 in capitals: which region's
   * streaming availability and release dates the movie reads use. `US` until
   * the app writes the device's region, and the one region the TMDB mirror
   * stores today.
   */
  watchRegion: string;
  /**
   * The streaming services they have, as `watch_providers.provider_id` (see
   * `watchProviders` in movies.ts for the directory). Empty when the services
   * step was skipped or never shown: the finder then says where each pick
   * streams and offers "Pick your services".
   */
  watchProviderIds: number[];
}

/**
 * The fields the owner may change. An absent key is left alone; an explicit
 * `null` clears the column, which is how a username or an avatar is removed.
 * `platforms` and `media` cannot be cleared: an empty platform list is the
 * skipped answer, and media, once answered, stays answered.
 */
export interface ProfilePatch {
  displayName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  /** Replaces the list. Duplicates are dropped, first one kept. */
  platforms?: readonly string[];
  /** Replaces the list; at least one. Duplicates are dropped, first one kept. */
  media?: readonly Medium[];
  /** ISO 3166-1 alpha-2. Trimmed and capitalized; anything else is a `RangeError` without a round trip. */
  watchRegion?: string;
  /** Replaces the list; empty is the skipped answer. Duplicates are dropped, first one kept. */
  watchProviderIds?: readonly number[];
}

/** Which username rule was broken. */
export type UsernameErrorKind =
  /** Somebody else already holds it. The unique constraint on `profiles.username`. */
  | 'username-taken'
  /** It does not match `^[a-z0-9_]{3,24}$`. The check constraint on `profiles.username`. */
  | 'username-invalid';

/**
 * A username the database refused.
 *
 * `message` is written for a person and may go on screen as it is; that is the
 * whole reason this is typed rather than a bare PostgrestError. `cause` keeps
 * the original error for the logs.
 */
export class UsernameError extends Error {
  readonly kind: UsernameErrorKind;
  /** The value that was refused, as the caller sent it. */
  readonly username: string;
  readonly cause: unknown;

  constructor(kind: UsernameErrorKind, username: string, cause: unknown) {
    super(
      kind === 'username-taken'
        ? 'That username is taken'
        : 'A username is 3 to 24 characters: lowercase letters, numbers, and underscores',
    );
    this.name = 'UsernameError';
    this.kind = kind;
    this.username = username;
    this.cause = cause;
  }
}

/** Turn a `profiles` row into the shape the screens use. */
export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    platforms: row.platforms,
    media: row.media,
    watchRegion: row.watch_region,
    watchProviderIds: row.watch_provider_ids,
  };
}

/**
 * The signed-in user's id, for the filter on a world-readable table.
 *
 * Reads the stored session rather than `auth.getUser()`, which is a network
 * round trip. `entries.ts` has the same helper for the same reason; it is
 * private there and private here, because neither file wants a user id in its
 * public surface.
 */
async function currentUserId(client: Client, action: string): Promise<string> {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  const id = data.session?.user.id;
  if (!id) throw new NotSignedInError(action);
  return id;
}

/**
 * The caller's own profile.
 *
 * Throws `NotSignedInError` when there is no session, rather than returning
 * null: signed out there is no profile to be missing, and the Profile tab is
 * behind the `useSession` gate anyway. The row itself is created by trigger for
 * every account, so a missing one is a broken database and the PostgrestError
 * goes up as it is.
 */
export async function getMyProfile(client: Client): Promise<Profile> {
  const id = await currentUserId(client, 'getMyProfile');
  const { data, error } = await client.from('profiles').select('*').eq('id', id).single();
  if (error) throw error;
  return toProfile(data);
}

/**
 * Change the caller's display name, username, avatar, platforms or media, and
 * return the row as it now stands.
 *
 * Blank is stored as null, the way `setNotes` does it, so "hide what is empty"
 * stays one null check on the screen rather than a null check and a length
 * check. Whitespace is trimmed, because a phone keyboard adds a trailing space
 * to almost everything; the case is not touched, so a username typed with a
 * capital comes back as `username-invalid` rather than being silently
 * lowercased into something the user did not choose.
 *
 * A patch with nothing in it reads the profile instead of writing it: a
 * Settings form the user opened and closed should not be an error, and
 * PostgREST refuses an empty update body outright.
 */
export async function updateMyProfile(client: Client, patch: ProfilePatch): Promise<Profile> {
  const id = await currentUserId(client, 'updateMyProfile');

  const update: ProfileUpdate = {};
  if ('displayName' in patch) update.display_name = clean(patch.displayName);
  if ('username' in patch) update.username = clean(patch.username);
  if ('avatarUrl' in patch) update.avatar_url = clean(patch.avatarUrl);
  if (patch.platforms !== undefined) update.platforms = distinct(patch.platforms);
  if (patch.media !== undefined) {
    if (patch.media.length === 0) {
      throw new RangeError('media needs at least one medium: the questionnaire has no skip');
    }
    update.media = distinct(patch.media);
  }
  if (patch.watchRegion !== undefined) update.watch_region = regionCode(patch.watchRegion);
  if (patch.watchProviderIds !== undefined) {
    for (const providerId of patch.watchProviderIds) {
      if (!Number.isInteger(providerId) || providerId <= 0) {
        throw new RangeError(`a provider id is a positive whole number, got ${providerId}`);
      }
    }
    update.watch_provider_ids = distinct(patch.watchProviderIds);
  }

  if (Object.keys(update).length === 0) return getMyProfile(client);

  const { data, error } = await client
    .from('profiles')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw toProfileError(error, update.username);
  return toProfile(data);
}

/** Trim, and treat blank as absent. */
function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * A region as the database stores it: two capital letters. Exported for the
 * movie reads, which put it in a JSON path and must never pass anything else.
 */
export function regionCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    throw new RangeError(`a region is an ISO 3166-1 alpha-2 code like US, got ${JSON.stringify(value)}`);
  }
  return code;
}

/** The values in their first-seen order, each once. */
function distinct<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/**
 * The platforms step's Continue: where the caller plays, as IGDB names. Pass
 * `expandPlatforms(picks)` from @verso/core, which applies the
 * backward-compatibility folds; this stores the list as given, duplicates
 * dropped, and the database refuses a null or a blank name. An empty list is
 * the skipped answer. Returns the profile as it now stands.
 *
 * Afterwards call `invalidateProfile` (onboarding-keys.ts): the deck pages read
 * these platforms.
 */
export async function setProfilePlatforms(client: Client, platforms: readonly string[]): Promise<Profile> {
  return updateMyProfile(client, { platforms });
}

/**
 * The questionnaire's Continue: the media the caller chose to track
 * (decision 25), at least one, duplicates dropped. Throws `RangeError` for an
 * empty list without a round trip; the database refuses one too. Returns the
 * profile as it now stands, whose non-null `media` ends the new-user state.
 */
export async function setProfileMedia(client: Client, media: readonly Medium[]): Promise<Profile> {
  return updateMyProfile(client, { media });
}

/**
 * The services step's Continue, and Settings' "Where you watch": the region
 * and the streaming services, either or both. Pass the region the device
 * reports (confirmed in one line on the screen) and the provider ids the
 * picker shows from `watchProviders`. An empty `providerIds` is the skipped
 * answer. Returns the profile as it now stands.
 */
export async function setWatchSettings(
  client: Client,
  settings: { region?: string; providerIds?: readonly number[] },
): Promise<Profile> {
  return updateMyProfile(client, {
    ...(settings.region === undefined ? {} : { watchRegion: settings.region }),
    ...(settings.providerIds === undefined ? {} : { watchProviderIds: settings.providerIds }),
  });
}

/**
 * Map the two Postgres errors a username write can raise, and rethrow the rest.
 *
 * A 23505 is read as being about the username because on this table there is
 * nothing else it can be about: `username` carries the only unique constraint
 * an update can violate (the primary key is not in any patch). A 23514 needs
 * one more look, because since 20261007120000_onboarding_backend.sql
 * `platforms` and `media` carry check constraints too, and since
 * 20261008202000_watch_settings.sql `watch_region` and `watch_provider_ids`
 * do: a check failure that names any of theirs is not the username's, whatever
 * else the patch carried. The guard is `attempted`: if the write did not carry a username, a
 * 23505 or a 23514 is not a username error, and guessing at it would put the
 * wrong sentence on the user's screen. So it goes up untouched.
 */
function toProfileError(error: unknown, attempted: string | null | undefined): unknown {
  if (typeof attempted !== 'string') return error;
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  if (code === '23505') return new UsernameError('username-taken', attempted, error);
  if (code === '23514') {
    if (typeof message === 'string' && /profiles_(platforms|media|watch_region|watch_provider_ids)_check/.test(message)) {
      return error;
    }
    return new UsernameError('username-invalid', attempted, error);
  }
  return error;
}
