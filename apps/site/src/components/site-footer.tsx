import Link from 'next/link';

import { CONTACT_EMAIL, copy } from '@/content/copy';

import { Container } from './container';
import { Lockup } from './verso-mark';

const linkClass = 'rounded-sm transition-[color,text-decoration-color] duration-150 hover:text-text-primary';

/**
 * The address, Privacy, the catalog credits, the builder and the year (site
 * brief, section 9). Terms left in the finalize round (2026-10-08): the site
 * has nothing to sign up for, and the app's terms come with the beta.
 * IGDB's credit and TMDB's sentence are here from the start because the
 * shots carry their art; since round four the hero and
 * the scenes show Steam's library art and TMDB's posters (served from the
 * site since launch prep, art.ts), so Steam is credited beside IGDB. "Built by" is the one line
 * left of the About section, removed in round two.
 *
 * The footer's wordmark is the nav's lockup at the headline's 17 px (a mark
 * about 18 px tall, over the brand's 16 px floor), at the head of the footer
 * where the word stood, rather than a second "Verso" beside "Built by", which
 * the copyright line already ends on.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border-separator">
      <Container className="py-10 md:py-12">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-6">
            <p className="text-headline">
              <Lockup />
            </p>
            <p className="text-subheadline text-text-secondary">
              {copy.footer.contact}:{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className={`text-text-primary underline decoration-border-separator underline-offset-4 hover:decoration-current ${linkClass}`}
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>
          <nav aria-label="Footer" className="flex gap-6 text-subheadline text-text-secondary">
            <Link href="/privacy/" className={linkClass}>
              {copy.footer.privacy}
            </Link>
          </nav>
        </div>
        <div className="mt-8 border-t border-border-separator pt-6 text-footnote text-text-secondary">
          <p className="text-pretty">
            <a
              href="https://www.igdb.com"
              className={`underline decoration-border-separator underline-offset-4 hover:decoration-current ${linkClass}`}
            >
              {copy.footer.igdb}
            </a>{' '}
            <a
              href="https://store.steampowered.com"
              className={`underline decoration-border-separator underline-offset-4 hover:decoration-current ${linkClass}`}
            >
              {copy.footer.steam}
            </a>{' '}
            {copy.footer.tmdb}
          </p>
          <div className="mt-3 flex flex-wrap justify-between gap-x-6 gap-y-1">
            <p>{copy.footer.builtBy}</p>
            <p>{copy.footer.copyright}</p>
          </div>
        </div>
      </Container>
    </footer>
  );
}
