import React from 'react'

// Mirrors the real bento shape (1 big tile + 6 small) so the catalog
// doesn't visibly jump/reflow the instant real cards arrive — a plain
// spinner-and-text block was the previous state here, which meant the
// whole section jumped in height and layout the moment data loaded.
export default function ServicesBentoSkeleton() {
  return (
    <div className="services-bento services-bento-skeleton" aria-hidden="true">
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className={`pcard-skeleton${i === 0 ? ' pcard-skeleton--big' : ''}`}
          style={{ animationDelay: `${Math.min(i, 8) * 0.06}s` }}
        />
      ))}
    </div>
  )
}
