/**
 * Enough of WebCrypto for PKCE to use SHA-256.
 *
 * supabase-js builds the PKCE code challenge with `crypto.subtle.digest`, and
 * when it cannot find one it falls back to the `plain` challenge method with a
 * console warning. `plain` sends the verifier itself as the challenge, so
 * anyone who can see the authorization request can replay it; S256 sends only
 * its hash, which is the whole point of PKCE. React Native has no `crypto`
 * global, so without this the app silently takes the weaker path — and the only
 * sign it has is a warning in the Metro log.
 *
 * `expo-crypto` is the platform's own crypto library and provides both pieces:
 * `getRandomValues` and a `digest` that already takes and returns the shapes
 * WebCrypto uses. Only what is missing is filled in, so a future runtime that
 * ships a real `crypto.subtle` keeps its own.
 *
 * Imported by `supabase.ts` before the client is created.
 */

import * as Crypto from 'expo-crypto';

type DigestAlgorithm = string | { name: string };

const ALGORITHMS: Record<string, Crypto.CryptoDigestAlgorithm> = {
  'SHA-1': Crypto.CryptoDigestAlgorithm.SHA1,
  'SHA-256': Crypto.CryptoDigestAlgorithm.SHA256,
  'SHA-384': Crypto.CryptoDigestAlgorithm.SHA384,
  'SHA-512': Crypto.CryptoDigestAlgorithm.SHA512,
};

function resolve(algorithm: DigestAlgorithm): Crypto.CryptoDigestAlgorithm {
  const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
  const resolved = ALGORITHMS[name.toUpperCase()];
  if (!resolved) throw new Error(`Unsupported digest algorithm: ${name}`);
  return resolved;
}

/**
 * The global object, with `crypto` typed loosely on purpose.
 *
 * TypeScript's own `Crypto` describes a browser's, whose `getRandomValues` has
 * a signature `expo-crypto`'s does not match exactly. Nothing here reads these
 * back, so `unknown` is both honest and enough.
 */
interface CryptoLike {
  getRandomValues?: unknown;
  subtle?: { digest?: unknown };
}

const target = globalThis as unknown as { crypto?: CryptoLike };

if (!target.crypto) {
  Object.defineProperty(target, 'crypto', { value: {}, configurable: true, writable: true });
}

const cryptoObject = target.crypto!;

if (typeof cryptoObject.getRandomValues !== 'function') {
  cryptoObject.getRandomValues = Crypto.getRandomValues;
}

if (!cryptoObject.subtle || typeof cryptoObject.subtle.digest !== 'function') {
  cryptoObject.subtle = {
    ...cryptoObject.subtle,
    digest: (algorithm: DigestAlgorithm, data: BufferSource) =>
      Crypto.digest(resolve(algorithm), data),
  };
}

export {};
