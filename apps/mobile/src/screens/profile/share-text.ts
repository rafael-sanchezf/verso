/**
 * The plain-text message "Share my top 10" hands to the native share sheet
 * (docs/design/specs/profile.md, "Behavior": "a plain-text list of the top
 * ten (rank, title, score) ending 'Ranked with Verso'"). The image version is
 * noted there as coming later with the collection wall.
 *
 * Pure: takes the already-ranked top ten rather than reaching into a query
 * result itself, so it is unit tested without a network or a simulator.
 */

export interface ShareRankingItem {
  rank: number;
  title: string;
  score: number;
}

export function topTenShareText(items: readonly ShareRankingItem[]): string {
  const lines = items.map((item) => `${item.rank}. ${item.title} — ${item.score.toFixed(1)}`);
  return [...lines, 'Ranked with Verso'].join('\n');
}
