import { useDocumentTitle } from '@/lib/use-document-title';
import { SettingsScreen } from '@/screens/profile/settings-screen';

export default function Settings() {
  useDocumentTitle('Settings');
  return <SettingsScreen />;
}
