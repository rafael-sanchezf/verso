import { describe, expect, it } from 'vitest';
import {
  STEAM_REVIEW_MANY,
  STEAM_REVIEW_MINIMUM,
  STEAM_REVIEW_OVERWHELMING,
  STEAM_REVIEW_PHRASES,
  steamReviewPhrase,
  steamReviewPhraseLabel,
} from '../src/steam-review-phrase';

describe('steamReviewPhrase: the review-count floor', () => {
  it('says nothing below ten reviews, however positive they are', () => {
    expect(steamReviewPhrase(100, 0)).toBeNull();
    expect(steamReviewPhrase(100, 9)).toBeNull();
    expect(steamReviewPhrase(0, 9)).toBeNull();
  });

  it('starts speaking at exactly ten', () => {
    expect(STEAM_REVIEW_MINIMUM).toBe(10);
    expect(steamReviewPhrase(100, 10)).toBe('Positive');
    expect(steamReviewPhrase(0, 10)).toBe('Negative');
  });
});

describe('steamReviewPhrase: the positive band', () => {
  it('is Overwhelmingly Positive only at 95 with 500 reviews', () => {
    expect(STEAM_REVIEW_OVERWHELMING).toBe(500);
    expect(steamReviewPhrase(95, 500)).toBe('Overwhelmingly Positive');
    expect(steamReviewPhrase(100, 500)).toBe('Overwhelmingly Positive');
  });

  it('falls back to Very Positive one review short of 500', () => {
    expect(steamReviewPhrase(95, 499)).toBe('Very Positive');
    expect(steamReviewPhrase(100, 499)).toBe('Very Positive');
  });

  it('falls back to Very Positive a hundredth of a point below 95', () => {
    expect(steamReviewPhrase(94.99, 500)).toBe('Very Positive');
    expect(steamReviewPhrase(94.99, 100_000)).toBe('Very Positive');
  });

  it('separates Very Positive from Positive at 50 reviews', () => {
    expect(STEAM_REVIEW_MANY).toBe(50);
    expect(steamReviewPhrase(80, 50)).toBe('Very Positive');
    expect(steamReviewPhrase(80, 49)).toBe('Positive');
    expect(steamReviewPhrase(100, 49)).toBe('Positive');
  });

  it('holds Positive across its whole 10 to 49 window', () => {
    expect(steamReviewPhrase(80, 10)).toBe('Positive');
    expect(steamReviewPhrase(99.99, 49)).toBe('Positive');
  });

  it('drops out of the 80s band a hundredth of a point below 80', () => {
    expect(steamReviewPhrase(79.99, 50)).toBe('Mostly Positive');
    expect(steamReviewPhrase(79.99, 10)).toBe('Mostly Positive');
  });
});

describe('steamReviewPhrase: the middle bands, which ignore the count', () => {
  it('is Mostly Positive from 70 to just under 80', () => {
    expect(steamReviewPhrase(70, 10)).toBe('Mostly Positive');
    expect(steamReviewPhrase(79.99, 1_000_000)).toBe('Mostly Positive');
  });

  it('is Mixed from 40 to just under 70', () => {
    expect(steamReviewPhrase(69.99, 10)).toBe('Mixed');
    expect(steamReviewPhrase(40, 10)).toBe('Mixed');
    expect(steamReviewPhrase(40, 1_000_000)).toBe('Mixed');
  });

  it('is Mostly Negative from 20 to just under 40', () => {
    expect(steamReviewPhrase(39.99, 10)).toBe('Mostly Negative');
    expect(steamReviewPhrase(20, 10)).toBe('Mostly Negative');
    expect(steamReviewPhrase(20, 1_000_000)).toBe('Mostly Negative');
  });

  it('gives Mostly Positive, Mixed and Mostly Negative the same phrase at any count', () => {
    for (const count of [10, 49, 50, 499, 500, 50_000]) {
      expect(steamReviewPhrase(75, count)).toBe('Mostly Positive');
      expect(steamReviewPhrase(55, count)).toBe('Mixed');
      expect(steamReviewPhrase(25, count)).toBe('Mostly Negative');
    }
  });
});

describe('steamReviewPhrase: the negative band', () => {
  it('splits Negative, Very Negative and Overwhelmingly Negative on the count', () => {
    expect(steamReviewPhrase(19.99, 49)).toBe('Negative');
    expect(steamReviewPhrase(19.99, 50)).toBe('Very Negative');
    expect(steamReviewPhrase(19.99, 499)).toBe('Very Negative');
    expect(steamReviewPhrase(19.99, 500)).toBe('Overwhelmingly Negative');
  });

  it('bottoms out at zero percent', () => {
    expect(steamReviewPhrase(0, 10)).toBe('Negative');
    expect(steamReviewPhrase(0, 50)).toBe('Very Negative');
    expect(steamReviewPhrase(0, 500)).toBe('Overwhelmingly Negative');
  });

  it('crosses into Mostly Negative at exactly 20', () => {
    expect(steamReviewPhrase(20, 500)).toBe('Mostly Negative');
  });
});

describe('steamReviewPhrase: inputs that are not real figures', () => {
  it('refuses a percentage outside 0 to 100', () => {
    expect(steamReviewPhrase(-0.01, 1000)).toBeNull();
    expect(steamReviewPhrase(100.01, 1000)).toBeNull();
  });

  it('refuses NaN and infinity', () => {
    expect(steamReviewPhrase(Number.NaN, 1000)).toBeNull();
    expect(steamReviewPhrase(Number.POSITIVE_INFINITY, 1000)).toBeNull();
    expect(steamReviewPhrase(90, Number.NaN)).toBeNull();
    expect(steamReviewPhrase(90, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('refuses a fractional review count', () => {
    expect(steamReviewPhrase(90, 10.5)).toBeNull();
  });

  it('refuses a negative review count', () => {
    expect(steamReviewPhrase(90, -1)).toBeNull();
  });
});

describe('steamReviewPhrase: the phrase list', () => {
  it('can produce every phrase it publishes, and nothing else', () => {
    const produced = new Set(
      [
        steamReviewPhrase(97, 1000),
        steamReviewPhrase(85, 1000),
        steamReviewPhrase(85, 20),
        steamReviewPhrase(75, 1000),
        steamReviewPhrase(50, 1000),
        steamReviewPhrase(30, 1000),
        steamReviewPhrase(10, 20),
        steamReviewPhrase(10, 100),
        steamReviewPhrase(10, 1000),
      ].filter((phrase): phrase is NonNullable<typeof phrase> => phrase !== null),
    );

    expect([...produced]).toEqual([...STEAM_REVIEW_PHRASES]);
  });
});

describe('steamReviewPhraseLabel', () => {
  it('is the phrase itself in English, and by default', () => {
    for (const phrase of STEAM_REVIEW_PHRASES) {
      expect(steamReviewPhraseLabel(phrase)).toBe(phrase);
      expect(steamReviewPhraseLabel(phrase, 'en')).toBe(phrase);
    }
  });

  it("is Steam's own Latin American Spanish, in Steam's sentence case", () => {
    expect(STEAM_REVIEW_PHRASES.map((phrase) => steamReviewPhraseLabel(phrase, 'es'))).toEqual([
      'Extremadamente positivas',
      'Muy positivas',
      'Positivas',
      'Mayormente positivas',
      'Variadas',
      'Mayormente negativas',
      'Negativas',
      'Muy negativas',
      'Extremadamente negativas',
    ]);
  });

  it('labels what steamReviewPhrase computes', () => {
    const phrase = steamReviewPhrase(85, 120);
    expect(phrase).toBe('Very Positive');
    expect(steamReviewPhraseLabel(phrase!, 'es')).toBe('Muy positivas');
  });
});
