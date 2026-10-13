import { beforeEach, describe, expect, it, vi } from 'vitest';

// logAppEvent is the one place the app's events get their platform, so the
// three seams it touches are mocked: Platform.OS, the client, and logEvent.
const rn = vi.hoisted(() => ({ Platform: { OS: 'ios' as string } }));
vi.mock('react-native', () => rn);

const api = vi.hoisted(() => ({ logEvent: vi.fn(async () => undefined) }));
vi.mock('@verso/api', () => api);

vi.mock('../src/lib/supabase', () => ({ supabase: { client: 'the app client' } }));

import { logAppEvent } from '../src/lib/log-event';

beforeEach(() => {
  rn.Platform.OS = 'ios';
  api.logEvent.mockClear();
});

describe('logAppEvent', () => {
  it('logs through the app client with the platform in the payload', async () => {
    await logAppEvent('first_session');
    expect(api.logEvent).toHaveBeenCalledWith({ client: 'the app client' }, 'first_session', { platform: 'ios' });
  });

  it('keeps the caller\'s payload and adds the platform beside it', async () => {
    rn.Platform.OS = 'web';
    await logAppEvent('media_interest', { medium: 'tv' });
    expect(api.logEvent).toHaveBeenCalledWith(expect.anything(), 'media_interest', { medium: 'tv', platform: 'web' });
  });

  it('never lets a caller misreport the platform', async () => {
    rn.Platform.OS = 'android';
    await logAppEvent('app_open', { platform: 'web' });
    expect(api.logEvent).toHaveBeenCalledWith(expect.anything(), 'app_open', { platform: 'android' });
  });
});
