import type { ReactNode } from 'react';

/**
 * The content column: 1100 px of content inside a 24 px gutter at desktop and
 * the 16 px gutter at phone width, centered.
 */
export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1148px] px-4 sm:px-6 ${className}`}>{children}</div>;
}
