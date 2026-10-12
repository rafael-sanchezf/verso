import { useDocumentTitle } from '@/lib/use-document-title';
import { SignInScreen } from '@/screens/sign-in/sign-in-screen';

export default function SignIn() {
  // No page name: the sign-in screen is the app's front door, so the tab says "Verso".
  useDocumentTitle();
  return <SignInScreen />;
}
