/**
 * The fourth tab: the medium's own list (movies-brief.md, "Tabs for movies").
 * Next, with Backlog and Upcoming, for games; Watchlist, with Watchlist and
 * Calendar, for films. One route, so the tab bar keeps five fixed tabs and the
 * label follows the medium (`ui/tab-bar.tsx`).
 */

import { useDocumentTitle } from '@/lib/use-document-title';
import { NextScreen } from '@/screens/next/next-screen';
import { WatchlistScreen } from '@/screens/watchlist/watchlist-screen';
import { MEDIUM_WORDS, useActiveMedium } from '@/state/medium';

export default function Next() {
  const { medium } = useActiveMedium();
  useDocumentTitle(MEDIUM_WORDS[medium].listTab);
  return medium === 'movie' ? <WatchlistScreen /> : <NextScreen />;
}
