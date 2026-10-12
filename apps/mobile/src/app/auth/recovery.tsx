/**
 * `/auth/recovery` on web: where the password-reset email sends a browser
 * back to. Never navigated to on native (`+native-intent.tsx`). The screen is
 * `screens/sign-in/auth-return-screen.tsx`; the new-password step itself is
 * the sign-in screen's, reached through the `PASSWORD_RECOVERY` gate.
 */

import { useDocumentTitle } from '@/lib/use-document-title';
import { AuthReturnScreen } from '@/screens/sign-in/auth-return-screen';

export default function AuthRecovery() {
  useDocumentTitle('Signing you in');
  return <AuthReturnScreen />;
}
