import { useT } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { RankingScreen } from '@/screens/ranking/ranking-screen';

export default function RankingRoute() {
  const t = useT();
  useDocumentTitle(t('lists.ranking.title'));
  return <RankingScreen />;
}
