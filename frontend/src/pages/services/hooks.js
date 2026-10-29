import React, { useEffect, useState } from 'react'
import { trackListing } from '../../lib/services.js'

export function useAutoIndex(length, intervalMs = 6000) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused || length <= 1) return undefined
    const id = setInterval(() => setIndex((i) => (i + 1) % length), intervalMs)
    return () => clearInterval(id)
  }, [paused, length, intervalMs])

  return {
    index,
    goTo: setIndex,
    onMouseEnter: () => setPaused(true),
    onMouseLeave: () => setPaused(false),
  }
}

/**
 * Public catalog: any external visitor (no login needed) can browse the
 * products/services that establishments have published. Establishment
 * Admins publish listings from /dashboard/services (see
 * ManageServicesPage.jsx) — this page only ever shows PUBLISHED listings,
 * enforced server-side by GET /api/services (see lib/services.js for the
 * documented contract that route needs to implement).
 *
 * Redesigned as a professional B2B/B2C marketplace shell: a trust/stat
 * strip and category rail up top (so visitors instantly grasp the size and
 * shape of the catalog), a continuously auto-scrolling sponsor marquee, an
 * editorial "featured partner" panel that is deliberately NOT styled like
 * the marquee cards (tabs + single large panel vs. a strip of tiles, so
 * the two promotional sections read as distinct, not repeated), then the
 * "pour vous" row and the full catalog grid.
 */

export function useListingTracking(enabled) {
  useEffect(() => {
    if (!enabled) return undefined
    const once = (id) => {
      try { const k = `vg-view:${id}`; if (sessionStorage.getItem(k)) return false; sessionStorage.setItem(k, '1') } catch { /* private mode: count once per load below */ }
      return true
    }
    const seen = new Set()
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      const id = e.target.dataset.listingId
      if (e.isIntersecting && id && !seen.has(id)) { seen.add(id); if (once(id)) trackListing(id, 'view') }
    }), { threshold: 0.5 })
    const scan = () => document.querySelectorAll('[data-listing-id]').forEach((el) => io.observe(el))
    scan()
    const mo = new MutationObserver(scan)
    mo.observe(document.body, { childList: true, subtree: true })
    const onClick = (e) => {
      const a = e.target.closest?.('a[href]')
      const card = a?.closest('[data-listing-id]')
      if (card) trackListing(card.dataset.listingId, /^(mailto|tel):/.test(a.getAttribute('href')) ? 'contact' : 'click')
    }
    document.addEventListener('click', onClick)
    return () => { io.disconnect(); mo.disconnect(); document.removeEventListener('click', onClick) }
  }, [enabled])
}
