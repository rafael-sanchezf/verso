import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Container } from '@/components/container';
import { CONTACT_EMAIL, copy } from '@/content/copy';

export const metadata: Metadata = { title: copy.footer.privacy };

const linkClass = 'rounded-sm underline decoration-border-separator underline-offset-4 hover:decoration-current';

/** A sentence with the contact address in it, the address as a mail link. */
function WithAddress({ text }: { text: string }): ReactNode {
  const [first, ...rest] = text.split(CONTACT_EMAIL);
  return (
    <>
      {first}
      {rest.map((part, index) => (
        <span key={index}>
          <a href={`mailto:${CONTACT_EMAIL}`} className={`text-text-primary ${linkClass}`}>
            {CONTACT_EMAIL}
          </a>
          {part}
        </span>
      ))}
    </>
  );
}

/**
 * The privacy notice for this website (finalize round, 2026-10-08), in place
 * of round one's "Coming before launch." stub. It covers the site alone:
 * the app's own policy comes with the beta, from the drafts in docs/legal/.
 * Every line is in copy.ts (`privacy`), each a fact checked that day; the
 * comment there says how. One column at the body's measure, a heading per
 * fact, so a reader can find the one they came for.
 */
export default function PrivacyPage() {
  const notice = copy.privacy;
  return (
    <Container className="py-16 md:py-24">
      <article className="max-w-[640px]">
        <h1 className="text-large-title tracking-[-0.021em]">{copy.footer.privacy}</h1>
        <p className="mt-2 text-subheadline text-text-secondary">
          <time dateTime="2026-10-08">{notice.updated}</time>
        </p>
        <p className="mt-6 text-body text-pretty">{notice.intro}</p>
        {notice.sections.map((section) => (
          <section key={section.heading} className="mt-8">
            <h2 className="text-headline">{section.heading}</h2>
            <p className="mt-2 text-body text-pretty text-text-secondary">
              <WithAddress text={section.body} />
            </p>
          </section>
        ))}
        <p className="mt-12 text-body">
          <Link href="/" className={linkClass}>
            {copy.legal.back}
          </Link>
        </p>
      </article>
    </Container>
  );
}
