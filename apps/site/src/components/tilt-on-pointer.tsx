'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Tilts its children a few degrees toward the pointer: at most 6 degrees
 * around the vertical axis and 4 around the horizontal, eased over 800 ms by
 * a CSS transition (globals.css, `.ap-tilt`), so it follows the pointer
 * softly rather than tracking it. It is the middle of the angled phone's
 * three layers (angled-phone.tsx), so the tilt adds to the phone's resting
 * angle and never fights the entrance or the scroll settle for one
 * `transform`.
 *
 * It sets three CSS variables: `--tilt-x` and `--tilt-y`, the two angles, and
 * `--tilt-u`, the pointer's side from -1 (left) to 1 (right), which moves the
 * glare across the glass.
 *
 * Only where there is a mouse or trackpad and motion is allowed; on touch,
 * or under reduced motion, it never listens and nothing moves. One
 * `requestAnimationFrame` per pointer move, and the work is three variables.
 */
const MAX_TURN_DEG = 6;
const MAX_LIFT_DEG = 4;

const clamp = (value: number) => Math.max(-1, Math.min(1, value));

export function TiltOnPointer({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const allowed = window.matchMedia(
      '(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)',
    );
    if (!allowed.matches) return;

    let frame = 0;
    const set = (x: number, y: number) => {
      element.style.setProperty('--tilt-y', `${(x * MAX_TURN_DEG).toFixed(2)}deg`);
      element.style.setProperty('--tilt-x', `${(-y * MAX_LIFT_DEG).toFixed(2)}deg`);
      element.style.setProperty('--tilt-u', x.toFixed(3));
    };
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = element.getBoundingClientRect();
        const x = clamp((event.clientX - (box.left + box.width / 2)) / (window.innerWidth / 2));
        const y = clamp((event.clientY - (box.top + box.height / 2)) / (window.innerHeight / 2));
        set(x, y);
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      set(0, 0);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
