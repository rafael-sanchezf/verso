/**
 * The movie page's "Where to watch" chips (frame `Movie page` 259:78; rule
 * 26): one chip per service, the caller's own first with the check, then the
 * rest by JustWatch's order. A service that streams it reads as its name
 * ("Netflix"); one that only rents it, "Rent · Apple TV"; one that only sells
 * it, "Buy · Apple TV". A film in theaters with nothing streaming shows "In
 * theaters" (movies-brief.md, "Movie page").
 *
 * No React; relative imports only (`test/film.test.ts`).
 */

export interface Offer {
  providerId: number;
  name: string;
  offerType: string;
  /** JustWatch's display priority in the region, lowest first; null when unknown. */
  priority: number | null;
}

export interface WatchChip {
  key: string;
  label: string;
  /** One of the caller's services, drawn with the brand stroke and the check. */
  mine: boolean;
}

const STREAMS = new Set(['flatrate', 'free', 'ads']);

export function whereToWatch(
  offers: readonly Offer[],
  myProviderIds: readonly number[],
  inTheaters: boolean,
): WatchChip[] {
  const byProvider = new Map<number, { offer: Offer; streams: boolean; rents: boolean; buys: boolean }>();
  for (const offer of offers) {
    const seen = byProvider.get(offer.providerId) ?? { offer, streams: false, rents: false, buys: false };
    if (STREAMS.has(offer.offerType)) seen.streams = true;
    if (offer.offerType === 'rent') seen.rents = true;
    if (offer.offerType === 'buy') seen.buys = true;
    byProvider.set(offer.providerId, seen);
  }

  const rank = (streams: boolean, rents: boolean) => (streams ? 0 : rents ? 1 : 2);
  const mine = new Set(myProviderIds);

  const chips = [...byProvider.values()]
    .filter(({ streams, rents, buys }) => streams || rents || buys)
    .map(({ offer, streams, rents }) => ({
      key: String(offer.providerId),
      label: streams ? offer.name : `${rents ? 'Rent' : 'Buy'} · ${offer.name}`,
      mine: streams && mine.has(offer.providerId),
      order: rank(streams, rents),
      priority: offer.priority ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || a.order - b.order || a.priority - b.priority)
    .map(({ key, label, mine: isMine }) => ({ key, label, mine: isMine }));

  const streamsAnywhere = [...byProvider.values()].some(({ streams }) => streams);
  if (inTheaters && !streamsAnywhere) return [{ key: 'theaters', label: 'In theaters', mine: false }, ...chips];
  return chips;
}
