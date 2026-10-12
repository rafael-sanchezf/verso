/**
 * Who is signed in, for any component that needs to know.
 *
 * No provider, deliberately. A context provider would be the usual shape, but
 * it has to be mounted in the root layout to be worth anything, and it makes
 * every consumer depend on a particular tree. Expo Router mounts and unmounts
 * layouts as routes change, so a provider high enough to survive that is a
 * layout concern rather than a data one.
 *
 * Instead the subscription lives in this module and components read it through
 * `useSyncExternalStore`. There is exactly one Supabase listener however many
 * components call the hook, it opens on the first of them and closes after the
 * last unmounts, and nothing has to be wired into a layout for it to work. If
 * the app later needs the session before the first render, or needs to swap it
 * out in tests, wrapping this store in a provider is a small change.
 */

import { onAuthStateChange, type AuthStateSubscription, type Session, type User } from '@verso/api';
import { useSyncExternalStore } from 'react';

import { supabase } from './supabase';

/**
 * `loading` is the gap before Supabase has read the stored session, which on a
 * cold start is a real wait on AsyncStorage. It is not the same as signed out,
 * and a screen that treats it as such will flash its signed-out state at
 * someone who is in fact signed in.
 */
export type SessionStatus = 'loading' | 'signed-out' | 'signed-in';

export type SessionState =
  | { status: 'loading'; session: null; user: null }
  | { status: 'signed-out'; session: null; user: null }
  | { status: 'signed-in'; session: Session; user: User };

const LOADING: SessionState = { status: 'loading', session: null, user: null };
const SIGNED_OUT: SessionState = { status: 'signed-out', session: null, user: null };

let state: SessionState = LOADING;
const listeners = new Set<() => void>();
let subscription: AuthStateSubscription | null = null;

function toState(session: Session | null): SessionState {
  return session ? { status: 'signed-in', session, user: session.user } : SIGNED_OUT;
}

function publish(next: SessionState): void {
  // Supabase re-announces the same session on events the app does not care
  // about; only wake the tree when something actually changed. A token refresh
  // does change the access token, and consumers holding the session want it.
  const unchanged =
    next.status === state.status && next.session?.access_token === state.session?.access_token;
  if (unchanged) return;

  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // `onAuthStateChange` fires once on subscribe with whatever session the
  // client has, including null, so `loading` resolves without a separate read.
  subscription ??= onAuthStateChange(supabase, (_event, session) => publish(toState(session)));

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      subscription?.unsubscribe();
      subscription = null;
    }
  };
}

function getSnapshot(): SessionState {
  return state;
}

/** Rendered on a server (web export) there is never a session to have read yet. */
function getServerSnapshot(): SessionState {
  return LOADING;
}

/**
 * The current session, the user on it, and whether Supabase has finished
 * looking. Safe to call from as many components as you like.
 */
export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
