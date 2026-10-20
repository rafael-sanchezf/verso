import type { WatchProvider } from '@verso/api';
import { describe, expect, it } from 'vitest';

import { translate } from '../src/lib/i18n/dictionary';
import {
  deviceRegion,
  isNamedService,
  regionChoices,
  regionName,
  serviceLabel,
  serviceTiles,
  servicesToStore,
  toggleService,
} from '../src/screens/onboarding/services';

function provider(providerId: number, name: string, priority: number): WatchProvider {
  return { providerId, name, logoImageId: `/logo-${providerId}.png`, priority };
}

/** A US directory as JustWatch orders it: some named services behind some that are not. */
const US: WatchProvider[] = [
  provider(2, 'Apple TV', 1),
  provider(8, 'Netflix', 2),
  provider(9, 'Amazon Prime Video', 3),
  provider(10, 'Amazon Video', 4),
  provider(337, 'Disney Plus', 5),
  provider(1899, 'Max', 6),
  provider(15, 'Hulu', 7),
  provider(3, 'Google Play Movies', 8),
  provider(531, 'Paramount Plus', 9),
  provider(386, 'Peacock Premium', 10),
  provider(350, 'Apple TV+', 11),
  provider(258, 'Criterion Channel', 12),
  provider(1796, 'Netflix basic with Ads', 13),
  provider(73, 'Tubi TV', 14),
];

describe('the named services', () => {
  it("match TMDB's names for the brief's nine", () => {
    for (const name of ['Netflix', 'Max', 'HBO Max', 'Hulu', 'Disney Plus', 'Amazon Prime Video', 'Apple TV+', 'Apple TV Plus', 'Paramount Plus', 'Peacock Premium', 'Criterion Channel']) {
      expect(isNamedService(name)).toBe(true);
    }
    for (const name of ['Netflix basic with Ads', 'Amazon Video', 'Tubi TV', 'Google Play Movies', 'Apple TV']) {
      expect(isNamedService(name)).toBe(false);
    }
  });

  it("print the frame's short names, and TMDB's for the rest", () => {
    expect(serviceLabel('Amazon Prime Video')).toBe('Prime Video');
    expect(serviceLabel('Max')).toBe('HBO Max');
    expect(serviceLabel('Apple TV+')).toBe('Apple TV');
    expect(serviceLabel('Peacock Premium')).toBe('Peacock');
    expect(serviceLabel('Criterion Channel')).toBe('Criterion');
    expect(serviceLabel('Disney Plus')).toBe('Disney+');
    expect(serviceLabel(' Tubi TV ')).toBe('Tubi TV');
  });
});

describe('the tiles', () => {
  it('put the named services first by priority, fill to nine, and end on More', () => {
    const { tiles, more } = serviceTiles(US, false);
    expect(more).toBe(true);
    expect(tiles).toHaveLength(9);
    expect(tiles.map((p) => p.name)).toEqual([
      'Netflix',
      'Amazon Prime Video',
      'Disney Plus',
      'Max',
      'Hulu',
      'Paramount Plus',
      'Peacock Premium',
      'Apple TV+',
      'Criterion Channel',
    ]);
  });

  it('show the whole regional list once More is tapped, named first', () => {
    const { tiles, more } = serviceTiles(US, true);
    expect(more).toBe(false);
    // The store "Apple TV" gives its name to Apple TV+, so it draws no tile of its own.
    expect(tiles).toHaveLength(US.length - 1);
    expect(tiles.slice(9).map((p) => p.name)).toEqual(['Amazon Video', 'Google Play Movies', 'Netflix basic with Ads', 'Tubi TV']);
  });

  it('draw one tile per name', () => {
    const labels = serviceTiles(US, true).tiles.map((p) => serviceLabel(p.name));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('show a short directory whole, with no More', () => {
    const short = US.slice(1, 11);
    expect(serviceTiles(short, false)).toEqual({ tiles: serviceTiles(short, true).tiles, more: false });
    expect(serviceTiles([], false)).toEqual({ tiles: [], more: false });
  });
});

describe('the picks', () => {
  it('toggle, and store only what the region lists, in the grid order', () => {
    let picked = toggleService(new Set(), 15);
    picked = toggleService(picked, 8);
    picked = toggleService(picked, 999);
    expect(servicesToStore(picked, US)).toEqual([8, 15]);
    expect(servicesToStore(toggleService(picked, 8), US)).toEqual([15]);
  });
});

describe('the region', () => {
  it("reads the device's region, US when there is none", () => {
    expect(deviceRegion('mx')).toBe('MX');
    expect(deviceRegion(null)).toBe('US');
    expect(deviceRegion('419')).toBe('US');
  });

  it('names the regions it lists in both languages and shows any other as its code', () => {
    expect(translate('en', regionName('US')!)).toBe('United States');
    expect(translate('es', regionName('MX')!)).toBe('México');
    expect(regionName('NZ')).toBeNull();
  });

  it("offers the device's unnamed region first", () => {
    expect(regionChoices('NZ')[0]).toBe('NZ');
    expect(regionChoices('US')[0]).toBe('US');
    expect(regionChoices('US')).not.toContain('NZ');
  });
});
