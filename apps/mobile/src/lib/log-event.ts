/**
 * Log a product event from the app, stamped with the platform it came from.
 *
 * Every call site in the app goes through here rather than `logEvent` itself,
 * so each row carries `platform` (`Platform.OS`: "ios", "android" or "web")
 * in its payload and the funnel report can split the web cohort from the
 * native one (docs/design/web-brief.md, question 10, default taken: a payload
 * key rather than a column, since the payload is already there and the kinds
 * are app-side). `@verso/api` stays free of react-native: it takes whatever
 * payload it is given.
 *
 * The platform is set last, so a caller cannot misreport it. Same contract as
 * `logEvent`: it throws on failure, and callers drop the error (events.ts).
 */

import { logEvent, type EventKind, type EventPayload } from '@verso/api';
import { Platform } from 'react-native';

import { supabase } from './supabase';

export function logAppEvent(kind: EventKind, payload: EventPayload = {}): Promise<void> {
  return logEvent(supabase, kind, { ...payload, platform: Platform.OS });
}
