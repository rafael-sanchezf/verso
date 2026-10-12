/**
 * The Steam link's round trip as a state machine, with no React in it.
 *
 * `useSteamLink` drives it; `test/steam-link-flow.test.ts` drives it without a
 * phone. The phases, in order:
 *
 *   idle -> starting      the button was tapped; `startSteamLink` is minting
 *                         an attempt and building Valve's URL
 *        -> in-browser    Valve's page is open in the system's auth browser
 *        -> confirming    the browser came back, by whichever road (see
 *                         link-return.ts); `getSteamLink` is being read
 *        -> linked | idle | failed
 *
 * The database decides, never the deep link. The return carries no SteamID on
 * purpose, and on Android the browser's promise can resolve as a plain
 * "dismiss" before the deep link arrives, so every return -- an `ok`, an error,
 * a cancel, a browser that just closed -- is followed by one read of the link,
 * and a link that exists is a link that worked. The return only decides what to
 * say when there is no link: nothing for a cancel or a closed browser, the
 * reason's own line for an error.
 *
 * Pure, relative imports only.
 */

import { linkFailureMessage, type LinkReturn } from './link-return';

export type LinkPhase =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'in-browser' }
  /** `returned` is null when the browser closed without saying why. */
  | { kind: 'confirming'; returned: LinkReturn | null }
  | { kind: 'linked' }
  | { kind: 'failed'; message: string };

export type LinkEvent =
  | { type: 'start' }
  /** `startSteamLink` answered and the browser is opening. */
  | { type: 'opened' }
  /** `startSteamLink` threw, or the browser would not open. */
  | { type: 'start-failed'; message: string }
  /** The browser is gone. `result` is null for a cancel, a dismiss, or a URL that is not ours. */
  | { type: 'returned'; result: LinkReturn | null }
  /** `getSteamLink` answered. */
  | { type: 'confirmed'; linked: boolean }
  /** `getSteamLink` threw. */
  | { type: 'confirm-failed' };

export const IDLE: LinkPhase = { kind: 'idle' };

/** A round trip is under way: the button waits and a second tap does nothing. */
export function isBusy(phase: LinkPhase): boolean {
  return phase.kind === 'starting' || phase.kind === 'in-browser' || phase.kind === 'confirming';
}

/** The line under the button, or null. */
export function failureOf(phase: LinkPhase): string | null {
  return phase.kind === 'failed' ? phase.message : null;
}

export function linkReducer(phase: LinkPhase, event: LinkEvent): LinkPhase {
  switch (event.type) {
    case 'start':
      return isBusy(phase) ? phase : { kind: 'starting' };

    case 'opened':
      return phase.kind === 'starting' ? { kind: 'in-browser' } : phase;

    case 'start-failed':
      return phase.kind === 'starting' || phase.kind === 'in-browser'
        ? { kind: 'failed', message: event.message }
        : phase;

    case 'returned': {
      if (phase.kind === 'confirming') {
        // The same return by a second road (the auth session and the Linking
        // listener both fire on Android). Keep whichever one says more, and
        // read the link once.
        return phase.returned === null && event.result !== null
          ? { kind: 'confirming', returned: event.result }
          : phase;
      }
      // A browser closing when no flow had opened one is nothing to check. A
      // real return with no flow waiting -- the cold start forwarded by
      // `/steam/linked`, a deep link that arrived after the browser's promise
      // had already settled -- is still worth one read.
      if (event.result === null && !isBusy(phase)) return phase;
      return { kind: 'confirming', returned: event.result };
    }

    case 'confirmed':
      return phase.kind === 'confirming' ? settle(phase.returned, event.linked) : phase;

    case 'confirm-failed':
      return phase.kind === 'confirming'
        ? {
            kind: 'failed',
            message: "Couldn't check whether the link worked. Check your connection and try again.",
          }
        : phase;
  }
}

/** Where a confirmed return ends up. The link in the database wins over the URL. */
function settle(returned: LinkReturn | null, linked: boolean): LinkPhase {
  if (linked) return { kind: 'linked' };
  if (returned === null) return IDLE;
  if (returned.status === 'ok') {
    // Valve said yes and the function redirected with ok, but the row is not
    // there: a replica behind, or a write that did not land. Rare; say so.
    return { kind: 'failed', message: "Steam signed you in, but the link didn't save. Please try again." };
  }
  const message = linkFailureMessage(returned.reason);
  return message === null ? IDLE : { kind: 'failed', message };
}

/** The button's label in each phase. */
export function linkButtonLabel(phase: LinkPhase, idleLabel = 'Link Steam'): string {
  switch (phase.kind) {
    case 'starting':
      return 'Opening Steam…';
    case 'in-browser':
      return 'Waiting for Steam…';
    case 'confirming':
      return 'Checking the link…';
    default:
      return idleLabel;
  }
}
