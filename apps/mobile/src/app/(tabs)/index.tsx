import { useT } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { HomeScreen } from '@/screens/home/home-screen';

export default function Home() {
  const t = useT();
  useDocumentTitle(t('browse.home.title'));
  return <HomeScreen />;
}
