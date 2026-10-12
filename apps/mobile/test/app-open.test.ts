import { describe, expect, it } from 'vitest';

import { appOpenDue, appOpenStamp, localDay } from '../src/lib/app-open';

describe('localDay', () => {
  it('is the device calendar day, zero-padded', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDay(new Date(2026, 9, 7, 0, 1))).toBe('2026-10-07');
  });
});

describe('appOpenDue', () => {
  it('logs the first open of the day', () => {
    expect(appOpenDue(null, 'u1', '2026-10-07')).toBe(true);
    expect(appOpenDue(appOpenStamp('u1', '2026-10-06'), 'u1', '2026-10-07')).toBe(true);
  });

  it('logs nothing more that day', () => {
    expect(appOpenDue(appOpenStamp('u1', '2026-10-07'), 'u1', '2026-10-07')).toBe(false);
  });

  it('logs a second account on the same phone the same day', () => {
    expect(appOpenDue(appOpenStamp('u1', '2026-10-07'), 'u2', '2026-10-07')).toBe(true);
  });
});
