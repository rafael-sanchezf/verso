import { describe, expect, it } from 'vitest';

import { displayNameFor, joinedLabel, subtitleFor } from '../src/screens/profile/identity';

describe('displayNameFor', () => {
  it('uses the display name when there is one', () => {
    expect(displayNameFor({ displayName: 'Mara Quill' }, 'mara@example.com')).toBe('Mara Quill');
  });

  it('trims a display name with stray whitespace', () => {
    expect(displayNameFor({ displayName: '  Mara  ' }, null)).toBe('Mara');
  });

  it("falls back to the email's local part when there is no display name", () => {
    expect(displayNameFor({ displayName: null }, 'maraquill88@example.com')).toBe('maraquill88');
  });

  it('treats a blank display name the same as none', () => {
    expect(displayNameFor({ displayName: '   ' }, 'mara@example.com')).toBe('mara');
  });

  it('never invents a name when neither fact is there', () => {
    expect(displayNameFor({ displayName: null }, null)).toBe('Player');
  });
});

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
