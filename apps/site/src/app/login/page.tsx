import type { Metadata } from 'next';

import { Container } from '@/components/container';
import { LoginForm } from '@/components/login-form';
import { Lockup } from '@/components/verso-mark';
import { copy } from '@/content/copy';

export const metadata: Metadata = { title: copy.nav.logIn };

/**
 * Log in (finalize round, 2026-10-08): the app's signed-out front door on
 * the site's tokens, between the site's nav and footer. Rafa asked for it
 * directly ("the Log in doesn't need to be functional: let people try to log
 * in and fail because they don't have an account"), a plain screen, so no
 * Figma pass. The lockup heads it at the app's large title, 34 px, as the
 * app's sheet sets it; to a screen reader the heading is "Log in to Verso".
 * Like every page, it is `noindex` (layout.tsx). When the web app is hosted
 * at app.rankverso.com the nav's Log in goes there and this page goes
 * (copy.ts, `LOGIN_HREF`).
 */
export default function LoginPage() {
  return (
    <Container className="py-16 md:py-24">
      <div className="mx-auto w-full max-w-[400px]">
        <h1>
          <span className="sr-only">{copy.login.heading}</span>
          <span aria-hidden="true" className="block text-[34px] leading-none">
            <Lockup />
          </span>
        </h1>
        <p className="mt-4 text-body text-text-secondary">{copy.login.intro}</p>
        <LoginForm />
      </div>
    </Container>
  );
}
