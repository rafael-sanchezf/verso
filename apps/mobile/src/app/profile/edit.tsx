/**
 * `/profile/edit` — Edit profile, pushed from Profile's Edit pill and from
 * Settings. The screen lives in `src/screens/profile/edit-profile-screen.tsx`.
 */

import { useT } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { EditProfileScreen } from '@/screens/profile/edit-profile-screen';

export default function EditProfileRoute() {
  const t = useT();
  useDocumentTitle(t('profile.edit.title'));
  return <EditProfileScreen />;
}
