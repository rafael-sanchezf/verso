'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * The fade-up on scroll, for every `[data-reveal]` element on the page: one
 * per section, on the section's inner wrapper, never one per element.
 *
 * An IntersectionObserver and a CSS transition (globals.css) rather than a
 * motion library: the pattern Unisound itself ships, and the one Motion's
 * `whileInView` wraps (DESIGN.md, "Round two"). It
 * hides only what starts below the fold, so nothing on screen at load
 * flickers, and it does nothing when the reader asks for reduced motion or the
 * browser has no observer. Server-rendered HTML is always fully visible.
 *
 * Rendered once in the layout; it re-runs on a client-side navigation because
 * the new page brings new elements.
 */
export function RevealOnScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute('data-reveal', 'shown');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );

    for (const element of document.querySelectorAll<HTMLElement>('[data-reveal]')) {
      if (element.getAttribute('data-reveal') === 'shown') continue;
      // Already on screen, or above it after a reload mid-page: leave it be.
      if (element.getBoundingClientRect().top < window.innerHeight) continue;
      element.setAttribute('data-reveal', 'hidden');
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
