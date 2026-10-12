'use client';

import { useId, useState, type FormEvent } from 'react';

import { ACCESS_HREF, CONTACT_EMAIL, copy } from '@/content/copy';

import { ButtonLink } from './button';

/**
 * The log-in page's form (finalize round, 2026-10-08): one email field and
 * "Continue with email", as the app's signed-out sheet opens
 * (apps/mobile/src/screens/sign-in/sign-in-screen.tsx), and on Continue a
 * notice that Verso is invite-only, with Request access. Rafa asked for a
 * Log in that lets people try and fail; nobody can sign in here.
 *
 * It never sends anything anywhere, and that is the design, not a stub:
 *
 * - no `action`, no `method`, no fetch, no storage, no analytics: Continue
 *   is handled here, with `preventDefault`, and only changes what is shown;
 * - the input has no `name`, so even a submit without JavaScript could not
 *   put the address in a URL; and without JavaScript the button stays
 *   disabled, as it is rendered, so the form cannot be submitted at all
 *   (implicit submission is blocked while the default button is disabled);
 * - it never asks for a password.
 *
 * The button is disabled until the address has an "@", the app's own rule
 * (`canContinue`), drawn at the app's 40% opacity. The notice is Rafa's
 * wording: the address has no registered account, and access is by email,
 * the address in it a link to the same access email. It sits in a polite
 * live region that is on the page from the start, so a screen reader hears
 * it when it appears.
 */
export function LoginForm() {
  const id = useId();
  const [email, setEmail] = useState('');
  const [tried, setTried] = useState(false);

  const canContinue = email.trim().includes('@');

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canContinue) setTried(true);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 flex flex-col gap-3">
      <label htmlFor={`${id}-email`} className="sr-only">
        {copy.login.email}
      </label>
      <input
        id={`${id}-email`}
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder={copy.login.email}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        aria-describedby={tried ? `${id}-notice` : undefined}
        className="h-[52px] w-full rounded-md border border-transparent bg-bg-surface px-4 text-body text-text-primary placeholder:text-text-secondary"
      />
      <button
        type="submit"
        disabled={!canContinue}
        className="h-12 w-full rounded-md bg-accent px-5 text-headline text-accent-label transition-[background-color,scale,opacity] duration-150 ease-out hover:bg-accent-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        {copy.login.continue}
      </button>
      <div role="status" aria-live="polite">
        {tried ? (
          <div id={`${id}-notice`} className="mt-3 rounded-xl bg-bg-surface p-5">
            <p className="text-headline">{copy.login.noticeTitle}</p>
            <p className="mt-1 text-subheadline text-pretty text-text-secondary">
              <WithAccessLink text={copy.login.noticeBody} />
            </p>
            <div className="mt-4">
              <ButtonLink href={ACCESS_HREF}>{copy.nav.requestAccess}</ButtonLink>
            </div>
          </div>
        ) : null}
      </div>
    </form>
  );
}

/** The notice's line with the contact address as a link to the access email. */
function WithAccessLink({ text }: { text: string }) {
  const [before, after = ''] = text.split(CONTACT_EMAIL);
  return (
    <>
      {before}
      <a
        href={ACCESS_HREF}
        className="rounded-sm text-text-primary underline decoration-border-separator underline-offset-4 hover:decoration-current"
      >
        {CONTACT_EMAIL}
      </a>
      {after}
    </>
  );
}
