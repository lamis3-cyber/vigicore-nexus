import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { shapePoints } from '../../components/shared/productShapes.jsx'
import { prefersReducedMotion } from '../../lib/motion.js'
import { orgOf } from './helpers.jsx'
import { DOMS, DEFAULT_K, domIndex } from './domains.js'
import './services-recommended.css'
import { tr } from '../../i18n/translate.js';

/* "Recommended" section: 3D carousel on the portal rings.
   Each card shows the product's real photo (listing.imageUrl, already trimmed by Product Studio)
   standing on the portal, or - when there is no photo - the particle illustration of its domain. */

const AUTO_MS = 3500
const R = 1500

function Art({ listing, dom, k }) {
  const cv = useRef(null)
  const [photo, setPhoto] = useState(!!listing.imageUrl)
  useEffect(() => {
    setPhoto(!!listing.imageUrl)
    if (!listing.imageUrl) return undefined
    const im = new Image()
    im.onerror = () => setPhoto(false)
    im.src = listing.imageUrl
    return () => { im.onerror = null }
  }, [listing.imageUrl])

  useEffect(() => {
    if (photo) return undefined
    let dead = false
    const c = cv.current, ctx = c.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1)
    const S = 260
    c.width = S * dpr; c.height = S * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    shapePoints(dom ?? 0).then((sh) => {
      if (dead || !sh?.length) return
      ctx.clearRect(0, 0, S, S)
      const lift = (v) => Math.min(255, Math.round((v * 32 + 16) * 1.12 + 26))
      const N = 1800
      for (let i = 0; i < N; i++) {
        const q = sh[i % sh.length]
        ctx.fillStyle = `rgba(${lift(q.ck >> 6)},${lift((q.ck >> 3) & 7)},${lift(q.ck & 7)},.95)`
        const z = 1.2 + (i % 5) * 0.18
        ctx.fillRect(q.x * S, q.y * S, z, z)
      }
    })
    return () => { dead = true }
  }, [photo, dom, k])

  return photo
    ? <div className="rc-photo" style={{ backgroundImage: `url(${JSON.stringify(listing.imageUrl)})` }} role="img" aria-label={tr(listing.title)} />
    : <canvas ref={cv} className="rc-canvas" aria-hidden="true" />
}

export default function RecommendedCarousel({ items, usingDemoData }) {
  const n = items.length
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [w, setW] = useState(1200)
  const box = useRef(null)
  const drag = useRef(null)
  const reduce = prefersReducedMotion()

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    if (paused || reduce || n < 2) return undefined
    const id = setTimeout(() => setActive((a) => (a + 1) % n), AUTO_MS)
    return () => clearTimeout(id)
  }, [active, paused, reduce, n])

  const go = (d) => setActive((a) => (a + d + n) % n)
  const small = w < 760
  const step = small ? 15 : 22
  const cardW = Math.min(420, Math.round(w * (small ? 0.74 : 0.34)))
  const cur = items[active]
  const curDom = domIndex(cur.category)
  const k = curDom == null ? DEFAULT_K : DOMS[curDom].k

  const offsetOf = (i) => {
    let o = i - active
    if (n > 5) { o = ((o % n) + n) % n; if (o > n / 2) o -= n }
    return o
  }

  const onKey = (e) => { if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1) }
  const onDown = (e) => { drag.current = e.clientX }
  const onUp = (e) => {
    if (drag.current == null) return
    const dx = e.clientX - drag.current; drag.current = null
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
  }

  return (
    <section className="services-recommended-section rc" style={{ '--c': k }} aria-roledescription="carousel" aria-label={tr("Recommended products")}>
      <div className="section-content services-recommended-head">
        <div className="section-eyebrow">{tr("For you")}</div>
        <h2 className="section-title services-recommended-title">{tr("Recommended based on trending categories")}</h2>
        <p className="services-section-sub">{tr("Popular right now across the catalog.")}</p>
      </div>

      <div
        className="rc-stage" ref={box} tabIndex={0} onKeyDown={onKey}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
        onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { drag.current = null }}
      >
        <div className="rc-rings" aria-hidden="true"><i /><i /><i /></div>
        {items.map((l, i) => {
          const o = offsetOf(i)
          const vis = Math.abs(o) <= 2
          const a = (o * step * Math.PI) / 180
          const di = domIndex(l.category)
          const ck = di == null ? DEFAULT_K : DOMS[di].k
          return (
            <article
              key={l.id ?? i}
              className={`rc-card${o === 0 ? ' on' : ''}`}
              style={{
                '--c': ck,
                width: cardW,
                marginLeft: -cardW / 2,
                transform: `translateX(${Math.sin(a) * R}px) translateZ(${(Math.cos(a) - 1) * R}px) rotateY(${o * step}deg)`,
                opacity: vis ? 1 : 0,
                pointerEvents: vis ? 'auto' : 'none',
                zIndex: 10 - Math.abs(o),
                filter: o === 0 ? 'none' : 'brightness(.72)',
              }}
              aria-hidden={o !== 0}
              aria-label={tr("{0} of {1}", [i + 1, n])}
              data-listing-id={l.id}
              onClick={() => o !== 0 && setActive(i)}
            >
              <span className="rc-rib">{tr("Trending")}</span>
              {usingDemoData && <span className="rc-ex">{tr("Example")}</span>}
              <div className="rc-art">{Math.abs(o) <= 1 && <Art listing={l} dom={di} k={ck} />}</div>
              <div className="rc-tx">
                {l.category && <div className="rc-k">{tr(l.category)}</div>}
                <h3>{tr(l.title)}</h3>
                {l.description && <p>{tr(l.description)}</p>}
              </div>
              <div className="rc-ft">
                <span>{orgOf(l)}</span>
                {l.id != null && (
                  <Link
                    to={`/services/${encodeURIComponent(l.id)}`}
                    className="rc-details"
                    tabIndex={o === 0 ? 0 : -1}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={tr('Voir les détails de {0}', [tr(l.title)])}
                  >
                    {tr("Voir détails")} <span aria-hidden="true">→</span>
                  </Link>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {n > 1 && (
        <div className="rc-nav">
          <button type="button" onClick={() => go(-1)} aria-label={tr("Previous")}>‹</button>
          <div className="rc-dots" role="tablist">
            {items.map((l, i) => <button key={l.id ?? i} type="button" role="tab" aria-selected={i === active} aria-label={tr("Show {0}", [l.title])} className={i === active ? 'on' : ''} onClick={() => setActive(i)} />)}
          </div>
          <button type="button" onClick={() => go(1)} aria-label={tr("Next")}>›</button>
        </div>
      )}
    </section>
  )
}
