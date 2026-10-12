/**
 * The order of the deck page (docs/feature-ideas.md, idea 1, reaction 4 of
 * 2026-10-06, and question 11): popular on your platforms is the pool, what we
 * expect you to have played is the order, and the biggest names still lead.
 *
 * Exports:
 *  - `orderDeck(candidates, options)`: the page order. Each candidate carries a
 *    `popularityRank` (lower is more popular; the order `deck_candidates`
 *    returns) and a `boost`: the sum of the positive content-profile weights
 *    the candidate's features carry minus the negative ones, computed in SQL by
 *    `deck_candidates` because the profile is readable only by the service
 *    role, and 0 when the caller has no profile. The top `pinned` candidates by
 *    popularity (default 3) open page one whatever their boost; everything
 *    after them is ordered by popularity moved by the boost, one unit of boost
 *    worth `positionsPerBoost` places (default 5). Ties keep popularity order,
 *    then the order given. Pass `pinned: 0` when ordering a later page, so only
 *    page one carries the pin.
 *  - `DEFAULT_DECK_OPTIONS`.
 *
 * Pure: no network, no storage, and the candidates come back as the same
 * objects, so a caller can pass its own row type through.
 */

export interface DeckCandidate {
  /** Lower is more popular. Any scale works; only the order and the gaps matter. */
  popularityRank: number;
  /** Sum of matching profile weights, positive raising and negative lowering. 0 without a profile. */
  boost: number;
}

export interface DeckOptions {
  /** How many of the most popular candidates open the page whatever their boost. */
  pinned: number;
  /**
   * How many places one unit of boost moves a candidate. Provisional default;
   * the profile's weights are idf-scaled and a strong taste sums to about 2 or
   * 3, which moves a candidate a page.
   */
  positionsPerBoost: number;
}

export const DEFAULT_DECK_OPTIONS: DeckOptions = {
  pinned: 3,
  positionsPerBoost: 5,
};

export function orderDeck<T extends DeckCandidate>(
  candidates: readonly T[],
  options: Partial<DeckOptions> = {},
): T[] {
  const opts = { ...DEFAULT_DECK_OPTIONS, ...options };
  const pinned = Math.max(0, Math.floor(opts.pinned));
  const finite = (n: number) => (Number.isFinite(n) ? n : 0);

  const byPopularity = candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => a.candidate.popularityRank - b.candidate.popularityRank || a.index - b.index);

  const head = byPopularity.slice(0, pinned);
  const tail = byPopularity
    .slice(pinned)
    .map((entry) => ({
      ...entry,
      key: entry.candidate.popularityRank - opts.positionsPerBoost * finite(entry.candidate.boost),
    }))
    .sort(
      (a, b) =>
        a.key - b.key ||
        a.candidate.popularityRank - b.candidate.popularityRank ||
        a.index - b.index,
    );

  return [...head, ...tail].map((entry) => entry.candidate);
}
