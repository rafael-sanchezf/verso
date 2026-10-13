/**
 * The fourth tab: the medium's own list (movies-brief.md, "Tabs for movies").
 * Next, with Backlog and Upcoming, for games; Watchlist, with Watchlist and
 * Calendar, for films. One route, so the tab bar keeps five fixed tabs and the
 * label follows the medium (`ui/tab-bar.tsx`).
 *
 * The Watchlist's one-shot params (`genre`, `scope`; watchlist-screen.tsx)
 * mean nothing to Next: arriving with them while the medium is games, they are
 * cleared, so a later switch to movies does not apply them by surprise.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useDocumentTitle } from '@/lib/use-document-title';
import { NextScreen } from '@/screens/next/next-screen';
import { WatchlistScreen } from '@/screens/watchlist/watchlist-screen';
import { MEDIUM_WORDS, useActiveMedium } from '@/state/medium';

export default function Next() {
  const { medium } = useActiveMedium();
  const router = useRouter();
  const params = useLocalSearchParams<{ genre?: string | string[]; scope?: string | string[] }>();
  const stale = medium !== 'movie' && (params.genre !== undefined || params.scope !== undefined);
  useEffect(() => {
    if (stale) router.setParams({ genre: undefined, scope: undefined });
  }, [stale, router]);

  useDocumentTitle(MEDIUM_WORDS[medium].listTab);
  return medium === 'movie' ? <WatchlistScreen /> : <NextScreen />;
}
