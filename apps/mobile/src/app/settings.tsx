import { useT } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { SettingsScreen } from '@/screens/profile/settings-screen';

export default function Settings() {
  const t = useT();
  useDocumentTitle(t('settings.title'));
  return <SettingsScreen />;
}
