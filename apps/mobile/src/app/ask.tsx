/**
 * `/ask` — the question, the trace, the picks (movies-build.md, PR 3), a
 * full-height modal over the tabs, opened by Home's button.
 *
 * Params: `medium` is `movie` or `game` (the default), the medium Home was in.
 */

import { useLocalSearchParams } from 'expo-router';

import { useT } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { AskScreen } from '@/screens/ask/ask-screen';

export default function AskRoute() {
  const t = useT();
  const { medium } = useLocalSearchParams<{ medium?: string }>();
  useDocumentTitle(t('lists.ask.title'));
  return <AskScreen medium={medium === 'movie' ? 'movie' : 'game'} />;
}
