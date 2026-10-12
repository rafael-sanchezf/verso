import { useDocumentTitle } from '@/lib/use-document-title';
import { RankingScreen } from '@/screens/ranking/ranking-screen';

export default function RankingRoute() {
  useDocumentTitle('Ranking');
  return <RankingScreen />;
}
