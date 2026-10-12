import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';

import { RevealOnScroll } from '@/components/reveal-on-scroll';
import { SiteFooter } from '@/components/site-footer';
import { SiteNav } from '@/components/site-nav';
import { copy, SITE_URL } from '@/content/copy';

import './globals.css';

/**
 * Inter, as the app loads it, self-hosted: `next/font` downloads the files at
 * build time and serves them from the site, so no reader's browser ever asks
 * Google for a font (onboarding guidelines, principle 12: nothing leaves).
 * The variable font covers every weight; the site sets only the brand's
 * three, Regular 400, Semi Bold 600 and Bold 700 (brand-identity.md, "Color
 * and type on the board"; the finalize round's audit took the last 500 out).
 *
 * `axes: ['opsz']` adds Inter 4's optical-size axis (14 to 32), so with the
 * browser's default `font-optical-sizing: auto` every size from 32 px up is
 * set in the Display cut, drawn for headlines, and body text stays in the
 * text cut. It is the one type refinement Google's build of Inter keeps:
 * the character variants (cv11's single-storey a, ss01's open digits) are
 * stripped from it (DESIGN.md, "Round two").
 */
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter', axes: ['opsz'] });

/**
 * The head's icons and share image are cut by `pnpm --filter @verso/site
 * logo` (scripts/brand-assets.mjs) into `public/` from Rafa's mark on the
 * green (`src/brand/mark-white.svg`, decision 31): the icons are the app
 * icon, the share image his board's billboard. The SVG favicon is for
 * browsers that take one, the .ico (16, 32, 48) for the rest; the touch icon
 * is square, since iOS rounds it.
 *
 * `metadataBase` is the domain (decision 30), which makes the share image's
 * address absolute, as link previews need. The canonical link and `og:url`
 * are `./`, which Next resolves against each page's own path, so the home
 * page says `https://rankverso.com/` and Privacy its own address.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: copy.meta.title, template: `%s · ${copy.meta.title}` },
  description: copy.meta.description,
  alternates: { canonical: './' },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180' },
  },
  openGraph: {
    type: 'website',
    url: './',
    siteName: copy.meta.title,
    title: copy.meta.title,
    description: copy.meta.description,
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: copy.meta.shareImageAlt }],
  },
  twitter: { card: 'summary_large_image' },
  // A prototype: noindex until the site goes public with the brand and
  // Rafa's copy (site brief, "What it waits on").
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
};

/**
 * The medium the page shows, read from the address before the first paint
 * (round four): `?medium=games` opens the games side, anything else movies
 * (movies the default since the finalize round, 2026-10-08).
 * It only sets `<html data-medium>`, which the CSS reads (globals.css, "The
 * medium the page shows"), so a shared link never flashes the other side.
 * Inline and first-party: the site still loads no script from another host.
 */
const MEDIUM_SCRIPT = `try{document.documentElement.dataset.medium=new URLSearchParams(location.search).get('medium')==='games'?'games':'movies'}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MEDIUM_SCRIPT }} />
      </head>
      <body className="font-sans text-body">
        <a
          href="#main"
          className="sr-only z-[60] rounded-sm bg-bg-canvas px-3 py-2 text-subheadline focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          {copy.nav.skipToContent}
        </a>
        <SiteNav />
        <main id="main">{children}</main>
        <SiteFooter />
        <RevealOnScroll />
      </body>
    </html>
  );
}
