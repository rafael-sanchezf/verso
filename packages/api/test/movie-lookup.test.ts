/**
 * `lookupMovie` against a stubbed client: no stack, no network.
 *
 * At the unit level on purpose, as `suggest.test.ts` is: the live suite runs
 * against a stack started without `edge-runtime` (the `db` job in
 * .github/workflows/ci.yml), so no function can be invoked there, and the
 * function's own behaviour, the TMDB match, the keep rule, the write, the
 * meter, is tested in Deno against fixtures
 * (supabase/functions/tmdb-lookup/lookup.test.ts). What is left here is the
 * app's side of the wire: the body it sends, a found film read as its id,
 * nothing read as nothing, the 429 read as an answer rather than a throw.
 */

import { FunctionsHttpError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Client } from '../src/client';
import { lookupMovie } from '../src/movies';

function stubInvoke(result: { data: unknown; error: unknown }) {
  const invoke = vi.fn(async (_name: string, _options: { body: unknown }) => result);
  const client = { functions: { invoke } } as unknown as Client;
  return { client, invoke };
}

const ID = '11111111-1111-4111-8111-111111111111';

describe('lookupMovie', () => {
  it('sends the trimmed query to tmdb-lookup and reads a found film as its id', async () => {
    const { client, invoke } = stubInvoke({ data: { mediaItemId: ID, tmdbId: 220289 }, error: null });

    await expect(lookupMovie(client, '  coherence ')).resolves.toEqual({ status: 'found', mediaItemId: ID });
    expect(invoke).toHaveBeenCalledWith('tmdb-lookup', { body: { query: 'coherence' } });
  });

  it('reads a null id as nothing found', async () => {
    const { client } = stubInvoke({ data: { mediaItemId: null, tmdbId: null }, error: null });

    await expect(lookupMovie(client, 'zzzz')).resolves.toEqual({ status: 'not_found' });
  });

  it('reads an empty body as nothing found', async () => {
    const { client } = stubInvoke({ data: null, error: null });

    await expect(lookupMovie(client, 'zzzz')).resolves.toEqual({ status: 'not_found' });
  });

  it('reads a 429 as the meter spent, with its figures', async () => {
    const response = new Response(
      JSON.stringify({ error: 'rate_limited', limit: 5, used: 5, retryAfterSeconds: 60 }),
      { status: 429 },
    );
    const { client } = stubInvoke({ data: null, error: new FunctionsHttpError(response) });

    await expect(lookupMovie(client, 'coherence')).resolves.toEqual({ status: 'limited', limit: 5, used: 5 });
  });

  it('still reads a 429 whose body is not JSON', async () => {
    const response = new Response('slow down', { status: 429 });
    const { client } = stubInvoke({ data: null, error: new FunctionsHttpError(response) });

    await expect(lookupMovie(client, 'coherence')).resolves.toEqual({
      status: 'limited',
      limit: null,
      used: null,
    });
  });

  it('throws any other failure, a TMDB outage included', async () => {
    const response = new Response(JSON.stringify({ error: 'tmdb_unavailable' }), { status: 502 });
    const error = new FunctionsHttpError(response);
    const { client } = stubInvoke({ data: null, error });

    await expect(lookupMovie(client, 'coherence')).rejects.toBe(error);
  });
});
