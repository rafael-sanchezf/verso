import { describe, expect, it } from 'vitest';

import { joinedLabel, subtitleFor } from '../src/screens/profile/identity';

describe('joinedLabel', () => {
  it('reads the month and year off an ISO timestamp', () => {
    expect(joinedLabel('2026-09-16T12:00:00.000Z')).toBe('Sep 2026');
  });

  it('is null for a string that is not a date', () => {
    expect(joinedLabel('not-a-date')).toBeNull();
  });
});

describe('subtitleFor', () => {
  it('joins the handle and the joined date when a username is set', () => {
    expect(subtitleFor({ username: 'mara', createdAt: '2026-01-05T00:00:00.000Z' })).toBe(
      '@mara · joined Jan 2026',
    );
  });

  it('is the joined date alone without a username, never an invented handle', () => {
    expect(subtitleFor({ username: null, createdAt: '2026-01-05T00:00:00.000Z' })).toBe(
      'joined Jan 2026',
    );
  });
});
