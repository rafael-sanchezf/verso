/**
 * Where the user watches, against a real local stack: the region and the
 * services on the profile (`setWatchSettings`, `updateMyProfile`), and the
 * directory the picker draws (`watchProviders`). See test/support.ts for what
 * the suite needs in the environment and why it skips without it.
 *
 * The directory is catalog data the TMDB mirror writes, so the fixture writes
 * it as the service role, with provider ids above nine hundred thousand and a
 * region of this run's own ("Q" and two letters no country uses), so it never
 * meets a mirrored directory or another run.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '../src/client';
import { watchProviders } from '../src/movies';
import { getMyProfile, setWatchSettings, updateMyProfile } from '../src/profiles';
import { live, serviceClient, signUpUser, stopClients } from './support';

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const REGION = `Q${letters[Math.floor(Math.random() * 26)]}`;
const base = 900_000 + Math.floor(Math.random() * 90_000);

describe.skipIf(!live)('where the user watches, against a local stack', () => {
  let alice: Client;
  let bob: Client;

  beforeAll(async () => {
    alice = (await signUpUser('watch-a')).client;
    bob = (await signUpUser('watch-b')).client;

    const { error } = await serviceClient()
      .from('watch_providers')
      .upsert([
        { provider_id: base + 1, name: 'Second Here', logo_image_id: '/second.png', display_priorities: { [REGION]: 2, US: 1 } },
        { provider_id: base + 2, name: 'First Here', logo_image_id: null, display_priorities: { [REGION]: 1 } },
        { provider_id: base + 3, name: 'Elsewhere Only', logo_image_id: '/elsewhere.png', display_priorities: { US: 3 } },
      ]);
    if (error) throw error;
  });

  afterAll(async () => {
    await serviceClient()
      .from('watch_providers')
      .delete()
      .in('provider_id', [base + 1, base + 2, base + 3]);
    await stopClients();
  });

  it('starts every account in US on no services', async () => {
    expect(await getMyProfile(alice)).toMatchObject({ watchRegion: 'US', watchProviderIds: [] });
  });

  it('stores the region in capitals and the services in the order given, once each', async () => {
    const profile = await setWatchSettings(alice, {
      region: ` ${REGION.toLowerCase()} `,
      providerIds: [base + 2, base + 1, base + 2],
    });
    expect(profile).toMatchObject({ watchRegion: REGION, watchProviderIds: [base + 2, base + 1] });
    expect(await getMyProfile(alice)).toEqual(profile);
  });

  it('writes either one alone and leaves the other', async () => {
    const services = await setWatchSettings(alice, { providerIds: [base + 1] });
    expect(services).toMatchObject({ watchRegion: REGION, watchProviderIds: [base + 1] });

    const skipped = await updateMyProfile(alice, { watchProviderIds: [] });
    expect(skipped).toMatchObject({ watchRegion: REGION, watchProviderIds: [] });
  });

  it('refuses a region or a provider id that cannot be one before any round trip', async () => {
    await expect(setWatchSettings(alice, { region: 'USA' })).rejects.toBeInstanceOf(RangeError);
    await expect(setWatchSettings(alice, { providerIds: [0] })).rejects.toBeInstanceOf(RangeError);
    await expect(setWatchSettings(alice, { providerIds: [1.5] })).rejects.toBeInstanceOf(RangeError);
  });

  it("keeps one user's settings from another", async () => {
    await setWatchSettings(bob, { region: 'GB', providerIds: [base + 3] });
    expect(await getMyProfile(alice)).toMatchObject({ watchRegion: REGION, watchProviderIds: [] });
    expect(await getMyProfile(bob)).toMatchObject({ watchRegion: 'GB', watchProviderIds: [base + 3] });
  });

  it("lists the region's services in display order and leaves out the others", async () => {
    const providers = await watchProviders(alice, REGION.toLowerCase());
    expect(providers).toEqual([
      { providerId: base + 2, name: 'First Here', logoImageId: null, priority: 1 },
      { providerId: base + 1, name: 'Second Here', logoImageId: '/second.png', priority: 2 },
    ]);
    await expect(watchProviders(alice, 'U$')).rejects.toBeInstanceOf(RangeError);
  });
});
