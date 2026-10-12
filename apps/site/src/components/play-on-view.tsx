'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { MEDIUM_EVENT } from './medium-switch';

/**
 * Plays a How it works scene once, when it scrolls into view (the motion
 * note's B2: an `IntersectionObserver` and a timer, the same in every
 * browser, Firefox included, rather than a scene scrubbed to the scroll).
 *
 * It arms a scene that starts below the fold (`data-play="armed"`, which
 * holds the scene's CSS animations on their first frame) and sets
 * `data-play="run"` when 45% of it is visible, then lets go. The scene's
 * animations exist only under `[data-play]` (globals.css, "How it works'
 * scenes"), so the static HTML is the finished scene: without JavaScript,
 * under reduced motion, or when the scene is already on screen at hydration
 * (a reload mid-page), it is simply there and never jumps back.
 *
 * Round four: it holds both media's scenes, and the page's switch shows one.
 * On a switch, a scene on screen plays the newly shown medium at once (the
 * browser starts a shown element's animations afresh), and a scene off
 * screen is armed again, so it plays when the reader reaches it.
 */
export function PlayOnView({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !('IntersectionObserver' in window)) return;
    if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;

    let observer: IntersectionObserver | undefined;
    const arm = () => {
      observer?.disconnect();
      element.dataset.play = 'armed';
      observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) return;
          element.dataset.play = 'run';
          observer?.disconnect();
        },
        { threshold: 0.45 },
      );
      observer.observe(element);
    };

    if (element.getBoundingClientRect().top >= window.innerHeight) arm();

    const onMedium = () => {
      const box = element.getBoundingClientRect();
      if (box.top < window.innerHeight && box.bottom > 0) {
        observer?.disconnect();
        element.dataset.play = 'run';
      } else {
        arm();
      }
    };
    window.addEventListener(MEDIUM_EVENT, onMedium);

    return () => {
      observer?.disconnect();
      window.removeEventListener(MEDIUM_EVENT, onMedium);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
