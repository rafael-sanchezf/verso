import { createSupabaseClient } from '@verso/api';
import { Platform } from 'react-native';

import { largeSecureStore } from './secure-storage';
// Side effect, and it has to happen before the client builds a PKCE challenge:
// without it supabase-js quietly falls back to the `plain` challenge method.
import './web-crypto';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy apps/mobile/.env.example to apps/mobile/.env.',
  );
}

/**
 * One client for the whole app.
 *
 * On native the session is encrypted before it is stored (see
 * `secure-storage.ts`); on web the browser's own storage is used, as Supabase
 * defaults to.
 *
 * `flowType: 'pkce'` is what makes "Continue with Google" safe to do over a
 * custom URL scheme: the provider hands back a one-time code on
 * `verso://auth/callback` and only this client, holding the verifier, can turn
 * it into a session. The implicit flow would put the tokens themselves in that
 * URL.
 */
export const supabase = createSupabaseClient({
  url,
  anonKey,
  storage: Platform.OS === 'web' ? undefined : largeSecureStore,
  detectSessionInUrl: Platform.OS === 'web',
  flowType: 'pkce',
});
