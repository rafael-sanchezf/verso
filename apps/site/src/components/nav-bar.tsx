'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * The sticky bar the nav sits in. It is flat on the canvas at the top of the
 * page; once the page scrolls under it, it gains a hairline and turns
 * slightly translucent over a blur, so the edge appears only when there is
 * something to separate. The fill stays opaque where the browser cannot blur
 * or the reader asks for reduced transparency (globals.css, `.site-nav`).
 */
export function NavBar({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 2);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <header
      data-scrolled={scrolled}
      className="site-nav sticky top-0 z-50 border-b border-transparent bg-bg-canvas transition-[background-color,border-color] duration-300"
    >
      {children}
    </header>
  );
}
