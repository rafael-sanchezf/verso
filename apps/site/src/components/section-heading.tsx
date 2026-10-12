import type { ReactNode } from 'react';

/** A section's heading: the title-1 step at phone width, the large title from tablet up. */
export function SectionHeading({
  id,
  children,
  className = '',
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      id={id}
      className={`text-title-1 tracking-[-0.021em] text-balance md:text-large-title ${className}`}
    >
      {children}
    </h2>
  );
}
