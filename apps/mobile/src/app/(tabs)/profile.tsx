import { useDocumentTitle } from '@/lib/use-document-title';
import { ProfileScreen } from '@/screens/profile/profile-screen';

export default function Profile() {
  useDocumentTitle('Profile');
  return <ProfileScreen />;
}
