/**
 * Encrypted session storage for native.
 *
 * Supabase keeps the session — an access token and, more importantly, a
 * long-lived refresh token — in whatever storage the client is given. The
 * obvious choice, AsyncStorage, writes it to a plain file in the app's
 * container: unreadable by other apps on a healthy device, readable from an
 * unencrypted backup or a jailbroken phone. The keychain is the right place,
 * but `expo-secure-store` will not hold a value this size (its own docs put the
 * ceiling around 2 KB and a Supabase session is comfortably past it).
 *
 * So: a random 256-bit key in the keychain, the session encrypted with it, and
 * the ciphertext in AsyncStorage. This is the pattern Supabase documents for
 * Expo as "LargeSecureStore"
 * (https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native).
 * Two differences from the published snippet, both deliberate:
 *
 * - The key comes from `expo-crypto`'s `getRandomBytes`, which is the platform
 *   CSPRNG, rather than from the `react-native-get-random-values` polyfill. One
 *   fewer dependency for the same bytes.
 * - The cipher is AES-256-CTR, as in the published snippet. signed-out.md says
 *   GCM; `aes-js` implements no authenticated mode, so GCM was not on the table
 *   without a second crypto library. The difference that matters is that CTR
 *   gives no integrity check: someone who can already write to the app's
 *   AsyncStorage file could flip bits in the ciphertext rather than only
 *   destroy it. They cannot forge a session — the plaintext is a JWT the server
 *   signed, and a mangled one is rejected — so the outcome of tampering is a
 *   failed parse and a signed-out user. Noted in the PR.
 *
 * Web is not this file's problem: browsers get Supabase's default storage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/** AES-256. */
const KEY_BYTES = 32;

/**
 * The keychain entry that holds the key for one stored item.
 *
 * Keyed off the item's own name so the key and the ciphertext are removed
 * together, and so a second stored item cannot decrypt the first.
 * `SecureStore` keys allow alphanumerics, `.`, `-` and `_` only, and Supabase's
 * are like `sb-<project-ref>-auth-token`, so the mapping replaces
 * anything else rather than assuming.
 */
function keyIdFor(key: string): string {
  return `verso.session-key.${key.replace(/[^A-Za-z0-9.\-_]/g, '_')}`;
}

async function encrypt(key: string, value: string): Promise<string> {
  const encryptionKey = Crypto.getRandomBytes(KEY_BYTES);
  const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
  const encrypted = cipher.encrypt(aesjs.utils.utf8.toBytes(value));

  // The key goes in first: a key with no ciphertext is a no-op on read, while
  // a ciphertext with no key is unreadable data that looks like a session.
  await SecureStore.setItemAsync(keyIdFor(key), aesjs.utils.hex.fromBytes(encryptionKey));

  return aesjs.utils.hex.fromBytes(encrypted);
}

async function decrypt(key: string, value: string): Promise<string | null> {
  const hexKey = await SecureStore.getItemAsync(keyIdFor(key));
  if (!hexKey) return null;

  const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(hexKey), new aesjs.Counter(1));
  return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(value)));
}

/**
 * A `SupportedStorage` that keeps its values encrypted.
 *
 * Every method swallows its errors and reports "nothing stored" instead. A
 * keychain read can fail for reasons that have nothing to do with this app (a
 * device restored from another phone's backup, a key the OS decided to drop),
 * and the right answer to all of them is that the user signs in again — not an
 * unhandled rejection inside Supabase's refresh timer.
 */
export const largeSecureStore = {
  async getItem(key: string): Promise<string | null> {
    try {
      const encrypted = await AsyncStorage.getItem(key);
      if (!encrypted) return null;
      return await decrypt(key, encrypted);
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(key, await encrypt(key, value));
    } catch (error) {
      // Still swallowed: crashing the sign-in that has just succeeded is worse
      // than a session that does not survive a restart, and there is nothing
      // the user could do about it anyway.
      //
      // But no longer silent. This is the failure that looks exactly like a
      // bug somewhere else — the user signs in, everything works, they kill
      // the app, and they are signed out again with nothing anywhere saying
      // why. A line in the log is the difference between an hour in the
      // session gate and reading "keychain is locked" straight off.
      //
      // `console.error` rather than a thrown value or a toast: it reaches the
      // Metro log in development and the device log in a release build, and
      // the key is named because a session write and some later stored item
      // fail for different reasons.
      console.error(`[secure-storage] could not store "${key}"; the session will not survive a restart`, error);
    }
  },

  async removeItem(key: string): Promise<void> {
    // Both halves, so signing out leaves no key behind for a ciphertext that
    // is gone.
    const results = await Promise.allSettled([
      AsyncStorage.removeItem(key),
      SecureStore.deleteItemAsync(keyIdFor(key)),
    ]);

    // `allSettled` keeps the behaviour: one half failing must not stop the
    // other, and neither must stop a sign-out that has already happened in
    // Supabase. But a swallowed failure here is the mirror of the swallowed
    // write above, and reads even worse from the outside: the user signs out,
    // the app says they are signed out, and the next launch finds a session
    // still sitting in AsyncStorage and signs them back in. Naming which half
    // survived is the whole value of the line — a leftover ciphertext and a
    // leftover keychain key have different consequences.
    const halves = ['the stored session', 'the keychain key'];
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(
          `[secure-storage] could not remove ${halves[index]} for "${key}"; it may outlive the sign-out`,
          result.reason,
        );
      }
    });
  },
};
