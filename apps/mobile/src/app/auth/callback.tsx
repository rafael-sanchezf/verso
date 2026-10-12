/**
 * `/auth/callback` on web: where Google and the sign-up confirmation email send
 * a browser back to. Never navigated to on native (`+native-intent.tsx`).
 * The screen is `screens/sign-in/auth-return-screen.tsx`.
 */

import { useDocumentTitle } from '@/lib/use-document-title';
import { AuthReturnScreen } from '@/screens/sign-in/auth-return-screen';

export default function AuthCallback() {
  useDocumentTitle('Signing you in');
  return <AuthReturnScreen />;
}
