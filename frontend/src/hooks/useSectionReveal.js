import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../lib/motion.js'

// Reveals a section's `.reveal-fade` / `.reveal-item` children once the
// section scrolls into view — entirely self-contained, independent of the
// global public/script.js IntersectionObserver.
//
// That global observer only scans the DOM once, the moment script.js first
// loads (and is deliberately guarded against loading twice). It never runs
// again. So the first time a section mounts, everything works fine — but
// if React ever unmounts and remounts that section (e.g. navigating
// Home -> About -> Home, which tears down and rebuilds the whole page),
// the freshly-created `.reveal-fade` / `.reveal-item` elements are never
// handed to any observer. They stay stuck at their pre-reveal `opacity:0`
// forever, so the section looks blank even though scrolling to it worked
// fine. Observing locally on every mount guarantees the section reveals
// itself no matter how many times it's mounted.
//
// Usage: const sectionRef = useSectionReveal(); <section ref={sectionRef}>
export default function useSectionReveal() {
  const sectionRef = useRef(null)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return

    const fadeTargets = el.querySelectorAll('.reveal-fade')
    const itemTargets = el.querySelectorAll('.reveal-item')
    if (!fadeTargets.length && !itemTargets.length) return

    if (prefersReducedMotion()) {
      fadeTargets.forEach((t) => t.classList.add('in-view'))
      itemTargets.forEach((t) => t.classList.add('in-view'))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          itemTargets.forEach((t, i) => {
            setTimeout(() => t.classList.add('in-view'), 110 * i)
          })
          fadeTargets.forEach((t, i) => {
            setTimeout(() => t.classList.add('in-view'), 90 * i)
          })
          observer.disconnect()
        })
      },
      { threshold: 0.12 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return sectionRef
}
