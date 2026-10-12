import { useDocumentTitle } from '@/lib/use-document-title';
import { SearchScreen } from '@/screens/search/search-screen';

export default function Search() {
  useDocumentTitle('Search');
  return <SearchScreen />;
}
