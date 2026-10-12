/**
 * What a thrown Edge Function call says to the person holding the phone.
 *
 * `startSteamLink` and `importSteamLibrary` return every outcome the app can do
 * something about as a value; a throw means something is actually broken
 * (steam.ts). supabase-js throws a `FunctionsHttpError` whose `context` is the
 * Response, so the status is there to read, and the two functions use it with
 * one meaning each: 503 is "not configured" (a secret missing on the hosted
 * project), 502 is "Steam is not answering". Anything else, and a network
 * failure with no response at all, gets the plain line.
 *
 * The body is never shown: it is written for a log, and a screen that prints
 * a server's words is a screen that one day prints something it should not.
 *
 * Pure, relative imports only.
 */

/** The HTTP status of a failed function call, or null when there was no response. */
export function functionErrorStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('context' in error)) return null;
  const context = (error as { context: unknown }).context;
  if (typeof context !== 'object' || context === null || !('status' in context)) return null;
  const status = (context as { status: unknown }).status;
  return typeof status === 'number' && Number.isInteger(status) ? status : null;
}

/** `startSteamLink` threw: the button could not even open Valve's page. */
export function startFailureMessage(error: unknown): string {
  if (functionErrorStatus(error) === 503) return "Linking Steam isn't set up on our server yet.";
  return "Couldn't open Steam's sign-in page. Check your connection and try again.";
}

/** `importSteamLibrary` threw. */
export function importFailureMessage(error: unknown): string {
  const status = functionErrorStatus(error);
  if (status === 503) return "Importing from Steam isn't set up on our server yet.";
  if (status === 502) return "Steam isn't answering. Try again in a few minutes.";
  return "Couldn't import from Steam. Check your connection and try again.";
}
