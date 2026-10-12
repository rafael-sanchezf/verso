import type { ReactNode } from 'react';

/**
 * The site's two buttons, as links (every action here goes somewhere).
 *
 * `primary` is the brand green fill with a white label in light and dark
 * (decision 29; globals.css), the app's primary button
 * (apps/mobile/src/ui/button.tsx), and there is one kind of it on the site:
 * Request access. `secondary` is the quiet surface beside it.
 * Both take the global focus ring.
 *
 * Hover changes the fill and nothing else (Tailwind v4 applies `hover:` only
 * where the pointer can hover, so a tap never leaves it stuck). A press
 * scales the button to 0.97 for 150 ms, the press feedback the app's own
 * buttons give, and not at all under reduced motion.
 */
type Variant = 'primary' | 'secondary';
type Size = 'regular' | 'compact';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-label hover:bg-accent-hover',
  secondary: 'bg-bg-surface text-text-primary hover:bg-bg-placeholder',
};

const SIZES: Record<Size, string> = {
  regular: 'h-12 rounded-md px-5 text-headline',
  compact: 'h-9 rounded-sm px-3.5 text-subheadline font-semibold',
};

export function ButtonLink({
  href,
  children,
  variant = 'primary',
  size = 'regular',
  className = '',
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  /** Layout only (width, placement); the look is the variant's. */
  className?: string;
}) {
  return (
    <a
      href={href}
      className={`inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap transition-[background-color,scale] duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {children}
    </a>
  );
}
