import Link from 'next/link';

import { ACCESS_HREF, copy, LOGIN_HREF } from '@/content/copy';

import { ButtonLink } from './button';
import { Container } from './container';
import { NavMediumSwitch } from './medium-switch';
import { NavBar } from './nav-bar';
import { Lockup } from './verso-mark';

const linkClass =
  'rounded-sm text-subheadline whitespace-nowrap text-text-secondary transition-[color] hover:text-text-primary';

/**
 * The lockup, Rafa's mark beside the wordmark (decision 31, verso-mark.tsx),
 * at 22 px, which draws the mark about 24 px tall, the size round five's
 * placeholder tile held; the medium switch in the center from 1024 px
 * (round four, home page only); How it works; Log in, to the site's own
 * log-in page until the web app is hosted (finalize round); Request access, the
 * one filled button (site brief, "The structure"; About removed in round
 * two). At phone width the section link folds away and the hero's second
 * button carries it, and the switch moves under the nav, to the top of the
 * hero.
 */
export function SiteNav() {
  return (
    <NavBar>
      {/* From 1280 px the switch sits on the page's center; from 1024 to 1279 the links leave it too little room there, so it centers between the wordmark and the links instead. */}
      <Container className="flex h-16 items-center justify-between gap-4 lg:grid lg:grid-cols-[auto_1fr_auto] lg:gap-6 xl:grid-cols-[1fr_auto_1fr]">
        <Link href="/" className="flex shrink-0 items-center justify-self-start rounded-sm text-[22px] leading-none">
          <Lockup />
        </Link>
        <NavMediumSwitch />
        {/* Pinned to the third column: on Log in and Privacy there is no switch, and the links would slide into the middle one. */}
        <nav aria-label="Main" className="flex items-center gap-5 justify-self-end sm:gap-7 lg:col-start-3 lg:gap-6">
          <Link href="/#how" className={`hidden sm:inline ${linkClass}`}>
            {copy.nav.howItWorks}
          </Link>
          <Link href={LOGIN_HREF} className={linkClass}>
            {copy.nav.logIn}
          </Link>
          <ButtonLink href={ACCESS_HREF} size="compact">
            {copy.nav.requestAccess}
          </ButtonLink>
        </nav>
      </Container>
    </NavBar>
  );
}
