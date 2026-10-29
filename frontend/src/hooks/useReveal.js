import { useEffect } from 'react'
import { prefersReducedMotion } from '../lib/motion.js'

// Page-level scroll reveal. Replaces the global IntersectionObserver of
// public/script.js: `.scroll-section` blocks and loose `.reveal-fade` /
// `.reveal-item` elements get `.in-view` when 12 % visible, and a section
// staggers its own `.reveal-item` (110 ms) / `.reveal-fade` (90 ms) children.
//
// Unlike the old script it is mounted with the page (so it works on every
// visit, not only the first) and it also picks up nodes that appear later
// (lists that render after a fetch) through a MutationObserver.
//
// Call once per page: usePageEffects() does it for Home / About / Services.
const SELECTOR = '.scroll-section, .reveal-fade, .reveal-item'

export default function useReveal() {
  useEffect(() => {
    const reduced = prefersReducedMotion()
    const timers = new Set()
    const later = (fn, ms) => {
      const id = setTimeout(() => { timers.delete(id); fn() }, ms)
      timers.add(id)
    }

    const show = (el) => el.classList.add('in-view')

    if (reduced) {
      document.querySelectorAll(SELECTOR).forEach(show)
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const el = entry.target
          show(el)
          el.querySelectorAll('.reveal-item').forEach((c, i) => later(() => show(c), 110 * i))
          el.querySelectorAll('.reveal-fade').forEach((c, i) => later(() => show(c), 90 * i))
          io.unobserve(el)
        })
      },
      { threshold: 0.12 },
    )

    const seen = new WeakSet()
    const scan = (root) => {
      const list = root.matches?.(SELECTOR) ? [root] : []
      root.querySelectorAll?.(SELECTOR).forEach((el) => list.push(el))
      list.forEach((el) => {
        if (seen.has(el) || el.classList.contains('in-view')) return
        seen.add(el)
        io.observe(el)
      })
    }

    scan(document)

    // Late nodes: batch per animation frame.
    let queued = []
    let frame = 0
    const mo = new MutationObserver((records) => {
      records.forEach((r) => r.addedNodes.forEach((n) => n.nodeType === 1 && queued.push(n)))
      if (frame || !queued.length) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const batch = queued
        queued = []
        batch.forEach((n) => n.isConnected && scan(n))
      })
    })
    mo.observe(document.body, { childList: true, subtree: true })

    return () => {
      io.disconnect()
      mo.disconnect()
      if (frame) cancelAnimationFrame(frame)
      timers.forEach(clearTimeout)
    }
  }, [])
}
