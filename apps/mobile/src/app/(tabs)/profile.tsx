import { useT } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { ProfileScreen } from '@/screens/profile/profile-screen';

export default function Profile() {
  const t = useT();
  useDocumentTitle(t('profile.page.title'));
  return <ProfileScreen />;
}
