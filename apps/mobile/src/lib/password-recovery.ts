/**
 * Whether the app is in the middle of a password reset.
 *
 * Opening the link in a reset email signs the user in — that is how Supabase
 * makes `updateUser({ password })` possible at all — and announces it as a
 * `PASSWORD_RECOVERY` event. Left alone, the root layout's session gate would
 * see a session, swap to the tabs, and the user would never get the chance to
 * type the new password they asked for.
 *
 * So this flag exists, the gate holds the app on the sign-in screen while it is
 * set, and the screen clears it once the password is saved. "Then continue
 * signed in", as signed-out.md puts it, then happens by itself, because the
 * session has been there the whole time.
 *
 * Same store shape as `use-session.ts`, and for the same reason: no provider to
 * mount, one subscription however many components read it.
 */

import { onAuthStateChange, type AuthStateSubscription } from '@verso/api';
import { useSyncExternalStore } from 'react';

import { supabase } from './supabase';

let pending = false;
const listeners = new Set<() => void>();
let subscription: AuthStateSubscription | null = null;

function publish(next: boolean): void {
  if (next === pending) return;
  pending = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  subscription ??= onAuthStateChange(supabase, (event) => {
    if (event === 'PASSWORD_RECOVERY') publish(true);
    // Signing out mid-reset (or the link expiring into a sign-out) ends the
    // reset too; without this the app would be stuck on a step it cannot
    // complete.
    if (event === 'SIGNED_OUT') publish(false);
  });

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      subscription?.unsubscribe();
      subscription = null;
    }
  };
}

export function usePasswordRecovery(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => pending,
    () => false,
  );
}

/** Called once the new password is saved. */
export function clearPasswordRecovery(): void {
  publish(false);
}
