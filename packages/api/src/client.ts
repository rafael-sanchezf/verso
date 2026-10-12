import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';
import type { Database } from './database.types';

export interface CreateClientOptions {
  url: string;
  /** The anon (or publishable) key. Public by design; RLS is the security boundary. */
  anonKey: string;
  /** Session storage. The mobile app passes AsyncStorage; web can omit it. */
  storage?: SupportedStorage;
  /** Set false in React Native, where there is no URL to read a session from. */
  detectSessionInUrl?: boolean;
  /**
   * Which OAuth flow the client runs.
   *
   * `'pkce'` in the app: the phone opens the provider in a system browser and
   * gets a one-time code back on a deep link, which only this client can
   * exchange because only it holds the verifier. The default, `'implicit'`,
   * would put the access and refresh tokens in that URL instead, where any app
   * registered for the scheme could read them. Web keeps the default.
   */
  flowType?: 'implicit' | 'pkce';
}

export type Client = SupabaseClient<Database>;

export function createSupabaseClient(opts: CreateClientOptions): Client {
  return createClient<Database>(opts.url, opts.anonKey, {
    auth: {
      storage: opts.storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: opts.detectSessionInUrl ?? false,
      ...(opts.flowType ? { flowType: opts.flowType } : {}),
    },
  });
}
