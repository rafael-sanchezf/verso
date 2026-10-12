import { afterEach, describe, expect, it, vi } from 'vitest';

// `redirects.ts` reads `Platform.OS` on every call, so one mutable mock covers
// both platforms.
const platform = vi.hoisted(() => ({ OS: 'ios' as string }));
vi.mock('react-native', () => ({ Platform: platform }));

import { isAuthLink } from '../src/lib/auth-links';
import { oauthRedirect, recoveryRedirect } from '../src/screens/sign-in/redirects';

afterEach(() => {
  platform.OS = 'ios';
  vi.unstubAllGlobals();
});

describe('auth redirects on native', () => {
  it('are the two deep links the dashboard and config.toml list', () => {
    expect(oauthRedirect()).toBe('verso://auth/callback');
    expect(recoveryRedirect()).toBe('verso://auth/recovery');
  });

  it('are the same on Android', () => {
    platform.OS = 'android';
    expect(oauthRedirect()).toBe('verso://auth/callback');
    expect(recoveryRedirect()).toBe('verso://auth/recovery');
  });

  it('never read the window, which the phone does not have in this shape', () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost:8081' } });
    expect(oauthRedirect()).toBe('verso://auth/callback');
  });
});

describe('auth redirects on web', () => {
  it("hang the two paths off the page's own origin", () => {
    platform.OS = 'web';
    vi.stubGlobal('window', { location: { origin: 'http://localhost:8081' } });
    expect(oauthRedirect()).toBe('http://localhost:8081/auth/callback');
    expect(recoveryRedirect()).toBe('http://localhost:8081/auth/recovery');
  });

  it('follow the origin wherever the build is served', () => {
    platform.OS = 'web';
    vi.stubGlobal('window', { location: { origin: 'https://verso-web.vercel.app' } });
    expect(oauthRedirect()).toBe('https://verso-web.vercel.app/auth/callback');
    expect(recoveryRedirect()).toBe('https://verso-web.vercel.app/auth/recovery');
  });
});

describe('the redirects and the native intent agree', () => {
  it('keeps every redirect off the native router', () => {
    expect(isAuthLink(oauthRedirect())).toBe(true);
    expect(isAuthLink(recoveryRedirect())).toBe(true);

    platform.OS = 'web';
    vi.stubGlobal('window', { location: { origin: 'http://localhost:8090' } });
    // Not used on web (the native intent is native-only), but the same test
    // would recognise them, so the two lists cannot drift apart.
    expect(isAuthLink(`${oauthRedirect()}?code=abc`)).toBe(true);
    expect(isAuthLink(`${recoveryRedirect()}#access_token=abc`)).toBe(true);
  });
});
