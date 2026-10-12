import type { CSSProperties, ReactNode } from 'react';

import { Phone } from './phone';
import { TiltOnPointer } from './tilt-on-pointer';

/**
 * The hero's phone, turned in 3D (site brief, Rafa's reaction to round two:
 * "a 3D phone viewed at an angle"), after the motion note's sketch
 * (docs/private/research/site-notes/ai-native-and-motion.md, B1). CSS 3D, no library
 * and no rendered image: the screen is live DOM, so its text stays sharp,
 * the ask types itself, and the page's medium switch swaps it.
 *
 * Four boxes, each owning one motion, so they never fight over one
 * `transform` (globals.css, "The angled phone"):
 *
 *   stage   perspective, the fade on load, the floor shadow and the glow; flat
 *   settle  the resting angle, eased toward flat as the page scrolls
 *   tilt    the lean toward the pointer (tilt-on-pointer.tsx)
 *   body    the turn-in on load; holds the front face and the thickness
 *
 * The thickness is ten slices of the phone's rounded outline stacked behind
 * the front face, so the turned edge has no gaps at the corners, which one
 * side face would leave. Their shades run light to dark front to back, a
 * metal band catching the light; like the titanium edge, they are the
 * device's literals, not palette colors.
 *
 * Under reduced motion the angle stays (a still angle is not motion) and
 * nothing enters, settles or tilts.
 */

/** The ten slices' shades, front to back. */
const SLICE_SHADES = ['#6e6e73', '#86868b', '#9a9aa0', '#8e8e93', '#7a7a7f', '#66666b', '#545458', '#454549', '#38383b', '#2c2c2e'];

export function AngledPhone({
  width,
  label,
  children,
  className = '',
}: {
  /** The phone's width; the stage, the depth and the slices follow from it. */
  width: string;
  /** What a screen reader hears for the whole phone; omitted when each screen inside carries its own. */
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`ap-stage ${className}`} style={{ width }}>
      <span aria-hidden="true" className="ap-glow" />
      <span aria-hidden="true" className="ap-floor" />
      <div className="ap-settle">
        <TiltOnPointer className="ap-tilt">
          <div className="ap-body">
            {SLICE_SHADES.map((shade, index) => (
              <span
                key={shade + index}
                aria-hidden="true"
                className="ap-slice"
                style={{ '--z': index + 1, backgroundColor: shade } as CSSProperties}
              />
            ))}
            <Phone width="100%" label={label} bare>
              {children}
            </Phone>
            <span aria-hidden="true" className="ap-glare" />
          </div>
        </TiltOnPointer>
      </div>
    </div>
  );
}
