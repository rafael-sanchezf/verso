import { describe, expect, it } from 'vitest';

import { isAuthLink } from '../src/lib/auth-links';

describe('isAuthLink', () => {
  it('recognises the two URLs the app is opened with', () => {
    expect(isAuthLink('verso://auth/callback')).toBe(true);
    expect(isAuthLink('verso://auth/recovery')).toBe(true);
  });

  it('recognises them with the payload still attached', () => {
    // Google's PKCE code arrives as a query parameter...
    expect(isAuthLink('verso://auth/callback?code=abc123')).toBe(true);
    // ...and a recovery link as a fragment.
    expect(isAuthLink('verso://auth/recovery#access_token=abc&refresh_token=def')).toBe(true);
    expect(isAuthLink('verso://auth/callback?error=access_denied')).toBe(true);
  });

  it('recognises the shapes other launchers produce', () => {
    expect(isAuthLink('/auth/callback')).toBe(true);
    expect(isAuthLink('auth/callback')).toBe(true);
    expect(isAuthLink('verso://auth/callback/')).toBe(true);
    // Expo Go puts the path after `/--/`.
    expect(isAuthLink('exp://127.0.0.1:8081/--/auth/recovery')).toBe(true);
  });

  it('lets every real route through', () => {
    expect(isAuthLink('verso://preview')).toBe(false);
    expect(isAuthLink('verso://game/8f14e45f-ceea-467a-9e0b-1c7e3b2a5d90')).toBe(false);
    expect(isAuthLink('verso://log/8f14e45f-ceea-467a-9e0b-1c7e3b2a5d90')).toBe(false);
    expect(isAuthLink('verso://add/8f14e45f-ceea-467a-9e0b-1c7e3b2a5d90')).toBe(false);
    expect(isAuthLink('verso://next?segment=upcoming')).toBe(false);
    expect(isAuthLink('verso://')).toBe(false);
  });

  it('does not match a route that merely mentions auth', () => {
    expect(isAuthLink('verso://auth')).toBe(false);
    expect(isAuthLink('verso://auth/callbacks')).toBe(false);
    expect(isAuthLink('verso://sign-in')).toBe(false);
  });
});
