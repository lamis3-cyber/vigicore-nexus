/** True when the visitor asked the OS for reduced motion (also safe outside the browser). */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
