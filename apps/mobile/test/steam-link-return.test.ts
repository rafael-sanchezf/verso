import { describe, expect, it } from 'vitest';

import {
  isSteamLinkReturn,
  keepsRouterStill,
  linkFailureMessage,
  linkReturnFromParams,
  parseLinkReturn,
  STEAM_LINK_RETURN_URL,
} from '../src/screens/steam/link-return';

describe('isSteamLinkReturn', () => {
  it('recognises the app scheme with and without a query', () => {
    expect(isSteamLinkReturn('verso://steam/linked')).toBe(true);
    expect(isSteamLinkReturn('verso://steam/linked?status=ok')).toBe(true);
    expect(isSteamLinkReturn('verso://steam/linked/?status=error&reason=cancelled')).toBe(true);
  });

  it('recognises the Expo Go form and a bare path', () => {
    expect(isSteamLinkReturn('exp://127.0.0.1:8081/--/steam/linked?status=ok')).toBe(true);
    expect(isSteamLinkReturn('/steam/linked')).toBe(true);
    expect(isSteamLinkReturn('steam/linked')).toBe(true);
  });

  it('leaves every other link alone', () => {
    expect(isSteamLinkReturn('verso://auth/callback?code=abc')).toBe(false);
    expect(isSteamLinkReturn('verso://game/123')).toBe(false);
    expect(isSteamLinkReturn('verso://settings/steam')).toBe(false);
    expect(isSteamLinkReturn('verso://steam/linkedx')).toBe(false);
    // The words in the query are not the path.
    expect(isSteamLinkReturn('verso://game/1?next=steam/linked')).toBe(false);
  });

  it('is what the Edge Function redirects to', () => {
    expect(STEAM_LINK_RETURN_URL).toBe('verso://steam/linked');
    expect(isSteamLinkReturn(STEAM_LINK_RETURN_URL)).toBe(true);
  });
});

describe('keepsRouterStill', () => {
  it('keeps a warm return off the router, since a flow is waiting for it', () => {
    expect(keepsRouterStill('verso://steam/linked?status=ok', false)).toBe(true);
  });

  it('lets a cold start through to the route', () => {
    expect(keepsRouterStill('verso://steam/linked?status=ok', true)).toBe(false);
  });

  it('never touches other links', () => {
    expect(keepsRouterStill('verso://game/123', false)).toBe(false);
    expect(keepsRouterStill('verso://game/123', true)).toBe(false);
  });
});

describe('parseLinkReturn', () => {
  it('reads an ok', () => {
    expect(parseLinkReturn('verso://steam/linked?status=ok')).toEqual({ status: 'ok' });
  });

  it('reads an error and its reason', () => {
    expect(parseLinkReturn('verso://steam/linked?status=error&reason=already_linked_elsewhere')).toEqual({
      status: 'error',
      reason: 'already_linked_elsewhere',
    });
  });

  it('decodes the query the way URLSearchParams wrote it', () => {
    expect(parseLinkReturn('verso://steam/linked?reason=state%5Fnot%5Fvalid&status=error')).toEqual({
      status: 'error',
      reason: 'state_not_valid',
    });
  });

  it('treats a missing or unknown status as an error with an unknown reason', () => {
    expect(parseLinkReturn('verso://steam/linked')).toEqual({ status: 'error', reason: 'unknown' });
    expect(parseLinkReturn('verso://steam/linked?status=maybe')).toEqual({ status: 'error', reason: 'unknown' });
    expect(parseLinkReturn('verso://steam/linked?status=error')).toEqual({ status: 'error', reason: 'unknown' });
  });

  it('keeps the first value of a repeated key', () => {
    expect(parseLinkReturn('verso://steam/linked?status=error&status=ok&reason=cancelled')).toEqual({
      status: 'error',
      reason: 'cancelled',
    });
  });

  it('ignores a fragment and survives a malformed escape', () => {
    expect(parseLinkReturn('verso://steam/linked?status=ok#ignored')).toEqual({ status: 'ok' });
    expect(parseLinkReturn('verso://steam/linked?status=error&reason=%E0%A4%A')).toEqual({
      status: 'error',
      reason: '%E0%A4%A',
    });
  });

  it('returns null for a link that is not the return', () => {
    expect(parseLinkReturn('verso://auth/callback?code=abc')).toBeNull();
  });
});

describe('linkReturnFromParams', () => {
  it('is null when the route was opened without a status, the ordinary case', () => {
    expect(linkReturnFromParams(undefined, undefined)).toBeNull();
    expect(linkReturnFromParams('', undefined)).toBeNull();
  });

  it('reads the forwarded status and reason, first value of a list', () => {
    expect(linkReturnFromParams('ok', undefined)).toEqual({ status: 'ok' });
    expect(linkReturnFromParams(['error', 'ok'], ['cancelled'])).toEqual({ status: 'error', reason: 'cancelled' });
  });
});

describe('linkFailureMessage', () => {
  it('says nothing about a cancel', () => {
    expect(linkFailureMessage('cancelled')).toBeNull();
  });

  it('gives the two reasons steam.ts names their own words', () => {
    expect(linkFailureMessage('already_linked_elsewhere')).toMatch(/another Verso account/);
    expect(linkFailureMessage('state_not_valid')).toMatch(/expired/);
  });

  it('says plainly when the server is not set up', () => {
    expect(linkFailureMessage('not_configured')).toMatch(/isn't set up/);
  });

  it('apologises in one generic line for everything else', () => {
    const generic = "Steam didn't confirm the link. Please try again.";
    for (const reason of ['not_verified', 'return_to_mismatch', 'write_failed', 'server_error', 'unknown']) {
      expect(linkFailureMessage(reason)).toBe(generic);
    }
  });
});
