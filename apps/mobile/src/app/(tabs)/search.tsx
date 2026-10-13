import { useT } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { SearchScreen } from '@/screens/search/search-screen';

export default function Search() {
  const t = useT();
  useDocumentTitle(t('browse.search.title'));
  return <SearchScreen />;
}
