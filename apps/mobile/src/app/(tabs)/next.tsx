import { useDocumentTitle } from '@/lib/use-document-title';
import { NextScreen } from '@/screens/next/next-screen';

export default function Next() {
  useDocumentTitle('Next');
  return <NextScreen />;
}
