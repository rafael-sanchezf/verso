/**
 * The playtime field speaks hours and the column stores minutes. A conversion
 * that is out by a factor of sixty looks entirely plausible on a screen, so
 * both directions are pinned here.
 */

import { describe, expect, it } from 'vitest';

import { hoursFieldValue, minutesFromField } from '../src/screens/game/hours';

describe('hoursFieldValue', () => {
  it('reads minutes back as hours, to one decimal', () => {
    expect(hoursFieldValue(840)).toBe('14');
    expect(hoursFieldValue(845)).toBe('14.1');
    expect(hoursFieldValue(30)).toBe('0.5');
  });

  it('is empty rather than zero when there is no figure', () => {
    expect(hoursFieldValue(null)).toBe('');
    expect(hoursFieldValue(undefined)).toBe('');
    expect(hoursFieldValue(0)).toBe('');
    expect(hoursFieldValue(Number.NaN)).toBe('');
  });
});

describe('minutesFromField', () => {
  it('takes hours and stores whole minutes', () => {
    expect(minutesFromField('14')).toBe(840);
    expect(minutesFromField('14.5')).toBe(870);
    expect(minutesFromField(' 0.5 ')).toBe(30);
  });

  it('takes a comma for a decimal point', () => {
    expect(minutesFromField('14,5')).toBe(870);
  });

  it('rounds to a whole minute, which is what the column takes', () => {
    expect(minutesFromField('0.01')).toBe(1);
    expect(Number.isInteger(minutesFromField('1.234'))).toBe(true);
  });

  it('is null for an empty field and for anything that is not a figure', () => {
    expect(minutesFromField('')).toBeNull();
    expect(minutesFromField('   ')).toBeNull();
    expect(minutesFromField('abc')).toBeNull();
    expect(minutesFromField('-3')).toBeNull();
  });
});
