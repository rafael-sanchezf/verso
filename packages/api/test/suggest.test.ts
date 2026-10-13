/**
 * `suggest.ts` against a stubbed client: no stack, no network.
 *
 * The function itself is tested in Deno (supabase/functions/suggest); what is
 * left here is the app's side of the wire: the body it sends (the function's
 * parser refuses unknown fields, so a stray key is a 400 on the phone), the
 * 429 read as an answer rather than a throw, and the plain path, which
 * "Not now", the daily limit and "Another three" all show.
 */

import { FunctionsHttpError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Client } from '../src/client';
import {
  plainSuggestions,
  suggest,
  suggestRequestBody,
  templateReason,
} from '../src/suggest';

function stubInvoke(result: { data: unknown; error: unknown }) {
  const invoke = vi.fn(async (_name: string, _options: { body: unknown }) => result);
  const client = { functions: { invoke } } as unknown as Client;
  return { client, invoke };
}

const RESPONSE = {
  requestId: 'req-1',
  model: 'claude-haiku-5-5',
  fallback: false,
  picks: [
    {
      mediaItemId: 'a',
      title: 'Paddington 2',
      year: 2017,
      coverImageId: '/1OJ9vkD5xPt3skC6KguyXAgagRZ.jpg',
      reason: "Funny at any age, and it's from the director of Wonka, which you said you liked.",
      because: ['Wonka'],
      predictedScore: 8.1,
      confidence: 'medium',
    },
  ],
  candidates: [],
};

describe('suggest', () => {
  it('invokes the suggest function with the request and maps the picks', async () => {
    const { client, invoke } = stubInvoke({ data: RESPONSE, error: null });

    const result = await suggest(client, {
      medium: 'movie',
      note: '  something for the whole family ',
      providerIds: [8, 337],
      region: 'US',
      includeBacklog: true,
    });

    expect(invoke).toHaveBeenCalledWith('suggest', {
      body: {
        medium: 'movie',
        note: 'something for the whole family',
        providerIds: [8, 337],
        region: 'US',
        includeBacklog: true,
      },
    });
    expect(result).toEqual({
      status: 'ok',
      picks: [
        {
          mediaItemId: 'a',
          title: 'Paddington 2',
          year: 2017,
          coverImageId: '/1OJ9vkD5xPt3skC6KguyXAgagRZ.jpg',
          reason: "Funny at any age, and it's from the director of Wonka, which you said you liked.",
          because: ['Wonka'],
        },
      ],
      modelVersion: 'claude-haiku-5-5',
      fallback: false,
      requestId: 'req-1',
    });
  });

  it('passes the fallback through', async () => {
    const { client } = stubInvoke({ data: { ...RESPONSE, model: 'sql-top3', fallback: true }, error: null });
    const result = await suggest(client, { medium: 'game' });
    expect(result).toMatchObject({ status: 'ok', fallback: true, modelVersion: 'sql-top3' });
  });

  it('reads the daily limit as an answer, with the numbers the body gives', async () => {
    const response = new Response(
      JSON.stringify({ error: 'daily_limit_reached', message: 'Suggestion limit reached', limit: 20, used: 20 }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    );
    const { client } = stubInvoke({ data: null, error: new FunctionsHttpError(response) });

    await expect(suggest(client, { medium: 'movie' })).resolves.toEqual({ status: 'limit', limit: 20, used: 20 });
  });

  it('still reads a 429 whose body is not JSON', async () => {
    const response = new Response('slow down', { status: 429 });
    const { client } = stubInvoke({ data: null, error: new FunctionsHttpError(response) });

    await expect(suggest(client, { medium: 'game' })).resolves.toEqual({ status: 'limit', limit: null, used: null });
  });

  it('throws any other failure', async () => {
    const response = new Response(JSON.stringify({ error: 'internal error' }), { status: 500 });
    const error = new FunctionsHttpError(response);
    const { client } = stubInvoke({ data: null, error });

    await expect(suggest(client, { medium: 'game' })).rejects.toBe(error);
  });

  it('throws when the body has no picks', async () => {
    const { client } = stubInvoke({ data: { model: 'x' }, error: null });
    await expect(suggest(client, { medium: 'game' })).rejects.toThrow('suggest returned no picks');
  });
});

describe('suggestRequestBody', () => {
  it('sends only the medium when nothing else is set', () => {
    expect(suggestRequestBody({ medium: 'game' })).toEqual({ medium: 'game' });
  });

  it('sends the language when it is not English, so the reasons are written in it', () => {
    expect(suggestRequestBody({ medium: 'movie', language: 'es' })).toEqual({ medium: 'movie', language: 'es' });
    // English is the function's default: sent as nothing, which a function
    // deployed before it took `language` still accepts.
    expect(suggestRequestBody({ medium: 'movie', language: 'en' })).toEqual({ medium: 'movie' });
  });

  it('drops blank notes and empty lists, which the function reads as no filter anyway', () => {
    expect(
      suggestRequestBody({
        medium: 'movie',
        note: '   ',
        genres: [],
        excludeGenres: null,
        providerIds: [],
        platforms: [],
        maxMinutes: null,
      }),
    ).toEqual({ medium: 'movie' });
  });

  it('keeps every field the function takes, by its own name', () => {
    expect(
      suggestRequestBody({
        medium: 'game',
        note: 'co-op',
        maxMinutes: 600,
        genres: ['Puzzle'],
        excludeGenres: ['Horror'],
        platforms: ['PC (Microsoft Windows)'],
        region: 'GB',
        includeBacklog: false,
      }),
    ).toEqual({
      medium: 'game',
      note: 'co-op',
      maxMinutes: 600,
      genres: ['Puzzle'],
      excludeGenres: ['Horror'],
      platforms: ['PC (Microsoft Windows)'],
      region: 'GB',
      includeBacklog: false,
    });
  });
});

describe('templateReason', () => {
  const taste = [
    { title: 'Hades', year: 2020, tier: 'loved' as const, genres: ['Roguelike'], platforms: ['PC'] },
    { title: 'Wonka', year: 2023, tier: 'liked' as const, genres: ['Comedy', 'Family'], platforms: [] },
  ];

  it('names the person\'s own title that shares the strongest feature', () => {
    const why = [
      { feature: 'genre:Family', weight: 0.4 },
      { feature: 'genre:Roguelike', weight: 0.2 },
    ];
    expect(templateReason({ why }, taste, 'movie')).toEqual({
      reason: 'Because you put Wonka in Liked and this shares the Family genre.',
      because: ['Wonka'],
    });
  });

  it('matches a decade on the year', () => {
    expect(templateReason({ why: [{ feature: 'decade:2020', weight: 1 }] }, taste, 'game')).toEqual({
      reason: 'Because you put Hades in Loved and this is also from the 2020s.',
      because: ['Hades'],
    });
  });

  it('names the feature alone when none of the list shares it', () => {
    expect(templateReason({ why: [{ feature: 'director:Paul King', weight: 1 }] }, taste, 'movie')).toEqual({
      reason: 'Fits your taste for director Paul King.',
      because: [],
    });
  });

  it('falls back to the rating with no features', () => {
    expect(templateReason({ why: null }, taste, 'movie')).toEqual({
      reason: 'Among the best-rated movies that fit your filters.',
      because: [],
    });
  });

  it("writes the function's Spanish, word for word, when asked in Spanish", () => {
    const why = [{ feature: 'genre:Family', weight: 0.4 }];
    expect(templateReason({ why }, taste, 'movie', 'es')).toEqual({
      reason: 'Porque pusiste Wonka en “Me gustó” y comparte el género Family.',
      because: ['Wonka'],
    });
    expect(templateReason({ why: [{ feature: 'decade:2020', weight: 1 }] }, taste, 'game', 'es').reason).toBe(
      'Porque pusiste Hades en “Me encantó” y también es de los años 2020.',
    );
    expect(templateReason({ why: [{ feature: 'director:Paul King', weight: 1 }] }, taste, 'movie', 'es').reason).toBe(
      'Encaja con tu gusto por Paul King.',
    );
    expect(templateReason({ why: null }, taste, 'movie', 'es').reason).toBe(
      'Entre las películas mejor valoradas que coinciden con tus filtros.',
    );
  });
});

describe('plainSuggestions', () => {
  it('reads SQL and the two tiers, skips what was shown, and writes the reasons', async () => {
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'suggestion_candidates') {
        return {
          data: ['a', 'b', 'c', 'd', 'e'].map((id) => ({
            media_item_id: id,
            title: id.toUpperCase(),
            year: 2020,
            cover_image_id: null,
            genres: ['Comedy'],
            why: [{ feature: 'genre:Comedy', weight: 1 }],
          })),
          error: null,
        };
      }
      if (name === 'tier_list' && args.p_tier === 'liked') {
        return {
          data: [{ title: 'Wonka', year: 2023, genres: ['Comedy'], platforms: [], position: 0 }],
          error: null,
        };
      }
      return { data: [], error: null };
    });
    const client = { rpc } as unknown as Client;

    const picks = await plainSuggestions(
      client,
      { medium: 'movie', providerIds: [8], region: 'US', includeBacklog: true },
      ['a', 'c'],
    );

    expect(rpc).toHaveBeenCalledWith('suggestion_candidates', {
      p_medium: 'movie',
      p_provider_ids: [8],
      p_region: 'US',
      p_include_backlog: true,
      p_limit: 30,
    });
    expect(picks.map((pick) => pick.mediaItemId)).toEqual(['b', 'd', 'e']);
    expect(picks[0]).toMatchObject({
      reason: 'Because you put Wonka in Liked and this shares the Comedy genre.',
      because: ['Wonka'],
    });
  });
});
