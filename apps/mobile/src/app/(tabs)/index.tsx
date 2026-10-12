import { useDocumentTitle } from '@/lib/use-document-title';
import { HomeScreen } from '@/screens/home/home-screen';

export default function Home() {
  useDocumentTitle('Home');
  return <HomeScreen />;
}
