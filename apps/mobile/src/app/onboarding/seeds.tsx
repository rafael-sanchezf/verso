/** `/onboarding/seeds`: games you love, the first ranked games. `?medium=movie` is films you love. */

import { useLocalSearchParams } from 'expo-router';

import { useT } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { SeedsScreen } from '@/screens/onboarding/seeds-screen';
import { mediumParam, SEEDS_WORDS } from '@/screens/onboarding/seeds';

export default function OnboardingSeedsRoute() {
  const t = useT();
  const params = useLocalSearchParams<{ medium?: string }>();
  useDocumentTitle(t(SEEDS_WORDS[mediumParam(params.medium)].title));
  return <SeedsScreen />;
}
