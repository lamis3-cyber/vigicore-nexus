import React, { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../../lib/motion.js'

/**
 * Counts a number up with an ease-out curve. Shows the final value straight
 * away when the visitor prefers reduced motion.
 *  - default: starts on mount
 *  - `onView`: starts once the number scrolls into view
 */
export default function CountUp({ value, suffix = '', onView = false, duration = onView ? 1100 : 900 }) {
  const ref = useRef(null)
  const isNum = typeof value === 'number'
  const [n, setN] = useState(onView || !isNum ? value : 0)

  useEffect(() => {
    if (!isNum) return undefined
    if (prefersReducedMotion() || (onView && !('IntersectionObserver' in window))) { setN(value); return undefined }
    let raf
    let io
    const run = () => {
      const t0 = performance.now()
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / duration)
        setN(Math.round(value * (1 - (1 - p) ** 3)))
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }
    if (onView) {
      setN(0)
      io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); run() } }, { threshold: 0.4 })
      io.observe(ref.current)
    } else run()
    return () => { io?.disconnect(); cancelAnimationFrame(raf) }
  }, [value, isNum, onView, duration])

  return onView ? <span ref={ref}>{n}{suffix}</span> : <>{n}{suffix}</>
}
