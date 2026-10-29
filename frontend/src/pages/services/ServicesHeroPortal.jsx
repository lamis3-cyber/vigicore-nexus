import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ART, loadShape } from '../../components/shared/productShapes.jsx'
import { prefersReducedMotion } from '../../lib/motion.js'
import { orgOf, CHECK_ICON } from './helpers.jsx'
import './services-hero-portal.css'
import { tr } from '../../i18n/translate.js';

/* Services hero, right side: "verified portal".
   The product shapes are the SAME five particle products as the home
   Marketplace section (components/shared/productShapes.jsx) — one per
   vigilance domain, same order. The product rises out of a glowing portal,
   and the whole stage re-tints per domain. */

// Same order as ART / the home section: pump, capsule, cream, test kit, gel.
const DOMAINS = [
  { name: 'Medical', k: '50,180,255' },
  { name: 'Pharmaceuticals', k: '60,200,160' },
  { name: 'Cosmetic', k: '220,140,60' },
  { name: 'IVD Products', k: '255,60,90' },
  { name: 'Chemical', k: '180,80,255' },
]
const N = DOMAINS.length
const SMALL = typeof window !== 'undefined' && window.innerWidth < 720
const PTS = SMALL ? 2600 : 5500 // was 4200 / 11000: half the work per frame, same look
const RES = SMALL ? 300 : 420 // sampling resolution (home section uses 240)
const ROTATE_MS = 5000

export default function ServicesHeroPortal({ listings = [], onBrowse }) {
  const [cur, setCur] = useState(0)
  const [auto, setAuto] = useState(true)
  const cv = useRef(null)
  const srcs = useRef([])
  const api = useRef({ go: null })
  const ptr = useRef({ x: -999, y: -999 })
  const col = useRef(DOMAINS[0].k)
  const reduce = prefersReducedMotion()

  // Featured card follows the active domain: first real/demo listing of that category.
  const featured = useMemo(() => {
    const d = DOMAINS[cur]
    return listings.find((l) => l.category?.trim().toLowerCase() === d.name.toLowerCase()) ?? null
  }, [cur, listings])

  useEffect(() => {
    const canvas = cv.current
    const ctx = canvas.getContext('2d')
    let dead = false, vis = false, raf = 0, W = 0, H = 0, shapes = null, groups = [], ci = 0, t0 = 0, ring = 0, tiltX = 0, tiltY = 0
    const P = Array.from({ length: PTS }, () => ({ x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, s: 0.9 + Math.random() * 0.7, t: 1, ph: Math.random() * 6.28, dl: 0, m: 0, u: 1, z: 0, rx: 0, ry: 0, ck: 0 }))

    const assign = (i, instant) => {
      const sh = shapes && shapes[i]
      if (!sh || !sh.length) return
      // Smaller than the home section: the portal, not the product, is the star.
      const size = Math.min(W * 0.46, H * 0.5), ox = W / 2 - size / 2, oy = H * 0.45 - size / 2, now = performance.now()
      P.forEach((p, k) => {
        const q = sh[k % sh.length]
        p.tx = ox + q.x * size + (Math.random() - 0.5) * 0.4; p.ty = oy + q.y * size + (Math.random() - 0.5) * 0.4
        p.u = 0.85 + q.l * 0.45; p.t = q.t; p.ck = q.ck; p.z = (q.l - 0.45) * 30
        if (instant) { p.x = p.tx; p.y = p.ty; p.vx = p.vy = 0; p.dl = 0 } else {
          const a = Math.atan2(p.y - H / 2, p.x - W / 2), sp = 6 + Math.random() * 16
          p.vx += Math.cos(a) * sp - Math.sin(a) * sp * 0.6; p.vy += Math.sin(a) * sp + Math.cos(a) * sp * 0.6
          p.dl = now + 120 + Math.random() * 420
        }
      })
      const gm = new Map()
      P.forEach((p) => { let a = gm.get(p.ck); if (!a) gm.set(p.ck, (a = [])); a.push(p) })
      const lift = (c) => Math.min(255, Math.round((c * 32 + 16) * 1.12 + 26))
      groups = [...gm].map(([ck, pts]) => ({ fill: `rgba(${lift(ck >> 6)},${lift((ck >> 3) & 7)},${lift(ck & 7)},.96)`, pts }))
    }
    const resize = () => {
      const r = canvas.parentNode.getBoundingClientRect(), dpr = Math.min(1.5, window.devicePixelRatio || 1)
      W = r.width; H = r.height; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (shapes) assign(ci, true)
    }
    api.current.go = (i) => { ci = i; col.current = DOMAINS[i].k; t0 = reduce ? -1e9 : performance.now(); ring = t0; if (shapes) assign(i, reduce) }

    const frame = (now) => {
      if (dead || !vis) { raf = 0; return }
      ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, W, H); ctx.globalCompositeOperation = 'lighter'
      const sx = ((now - t0 - 500) / 1000) * W * 1.05 - W * 0.025, c = col.current, mx = ptr.current.x, my = ptr.current.y
      const inside = mx > -100
      const wx = inside ? (mx / W - 0.5) * 2 : reduce ? 0 : Math.sin(now / 2600) * 0.7
      const wy = inside ? (my / H - 0.5) * 2 : reduce ? 0 : Math.cos(now / 3100) * 0.35
      tiltX += (wx - tiltX) * 0.06; tiltY += (wy - tiltY) * 0.06
      for (let k = 0; k < PTS; k++) {
        const p = P[k]
        if (now >= p.dl) { p.vx += (p.tx - p.x) * 0.05 + Math.sin(now / 650 + p.ph) * 0.02; p.vy += (p.ty - p.y) * 0.05 + Math.cos(now / 720 + p.ph) * 0.02; p.vx *= 0.84; p.vy *= 0.84 } else { p.vx *= 0.97; p.vy *= 0.97 }
        const dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy
        if (d2 < 9000) { const dd = Math.sqrt(d2) + 0.01, f = (1 - dd / 95) * 3; p.vx += (dx / dd) * f; p.vy += (dy / dd) * f }
        p.x += p.vx; p.y += p.vy; p.rx = p.x + tiltX * p.z; p.ry = p.y + tiltY * p.z * 0.6
        p.m += ((p.tx < sx ? 1 : 0) - p.m) * 0.18
      }
      const pass = (style, test) => { ctx.fillStyle = style; for (let k = 0; k < PTS; k++) { const p = P[k]; if (test(p)) { const s = p.s * p.u; ctx.fillRect(p.rx - s / 2, p.ry - s / 2, s, s) } } }
      const hot = (p) => Math.abs(p.tx - sx) < 14
      ;['rgba(90,110,128,.5)', 'rgba(125,150,170,.62)', 'rgba(190,208,222,.8)'].forEach((g, t) => pass(g, (p) => p.m < 0.5 && p.t === t))
      for (let g = 0; g < groups.length; g++) {
        ctx.fillStyle = groups[g].fill
        const pts = groups[g].pts
        for (let k = 0; k < pts.length; k++) { const p = pts[k]; if (p.m >= 0.5 && !hot(p)) { const s = p.s * p.u; ctx.fillRect(p.rx - s / 2, p.ry - s / 2, s, s) } }
      }
      pass('rgba(255,255,255,.98)', (p) => p.m >= 0.5 && hot(p))
      if (sx > 0 && sx < W) { const g = ctx.createLinearGradient(sx - 30, 0, sx + 2, 0); g.addColorStop(0, `rgba(${c},0)`); g.addColorStop(1, `rgba(${c},.35)`); ctx.fillStyle = g; ctx.fillRect(sx - 30, H * 0.06, 32, H * 0.66) }
      const rk = (now - ring) / 1000
      if (rk > 0 && rk < 1) { ctx.strokeStyle = `rgba(${c},${0.7 * (1 - rk)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(W / 2, H * 0.76, rk * W * 0.55, rk * W * 0.12, 0, 0, 6.283); ctx.stroke() }
      raf = requestAnimationFrame(frame)
    }

    resize(); window.addEventListener('resize', resize)
    Promise.all(srcs.current.map((el, i) => loadShape(i, el, RES))).then((s) => {
      if (dead) return
      shapes = s; assign(ci, true); api.current.go(ci)
      if (vis && !raf) raf = requestAnimationFrame(frame)
    })
    const io = new IntersectionObserver(([e]) => { vis = e.isIntersecting; if (vis && !raf && shapes && !dead) raf = requestAnimationFrame(frame) }, { rootMargin: '80px 0px' })
    io.observe(canvas)
    return () => { dead = true; io.disconnect(); cancelAnimationFrame(raf); window.removeEventListener('resize', resize); canvas.width = canvas.height = 0 }
  }, [reduce])

  // Morph to the active domain whenever it changes
  useEffect(() => { api.current.go && api.current.go(cur) }, [cur])
  useEffect(() => {
    if (!auto || reduce) return undefined
    const id = setTimeout(() => setCur((c) => (c + 1) % N), ROTATE_MS)
    return () => clearTimeout(id)
  }, [cur, auto, reduce])

  const move = (e) => { const r = cv.current.getBoundingClientRect(); ptr.current.x = e.clientX - r.left; ptr.current.y = e.clientY - r.top }
  const d = DOMAINS[cur]

  return (
    <div
      className="svp"
      style={{ '--c': d.k }}
      onPointerMove={move}
      onPointerLeave={() => { ptr.current.x = ptr.current.y = -999 }}
    >
      <div className="svp-beam" aria-hidden="true" />
      <div className="svp-rings" aria-hidden="true"><i /><i /><i /><i /></div>
      <canvas ref={cv} aria-hidden="true" />
      <div className="svp-glow" aria-hidden="true" />

      <div className="svp-card" key={cur}>
        <span className="svp-card-dom">{d.name.toUpperCase()}</span>
        <h3>{featured?.title ?? tr(d.name)}</h3>
        <p>{featured ? orgOf(featured) ?? tr("Partner organization") : tr("Verified partners")}</p>
        <span className="svp-ver">{tr("{0} VERIFIED", [CHECK_ICON])}</span>
      </div>

      <div className="svp-tabs" role="tablist" aria-label={tr("Product domains")} onMouseEnter={() => setAuto(false)} onMouseLeave={() => setAuto(true)}>
        {DOMAINS.map((x, i) => (
          <button
            key={x.name}
            type="button"
            role="tab"
            aria-selected={cur === i}
            className={`svp-tab${cur === i ? ' on' : ''}`}
            style={{ '--k': `rgb(${x.k})` }}
            onClick={() => setCur(i)}
            onDoubleClick={() => onBrowse && onBrowse(x.name)}
            title={tr("{0} (double-click to browse)", [x.name])}
          >
            <i />{tr(x.name)}
          </button>
        ))}
      </div>

      <div hidden aria-hidden="true">{ART.map((a, i) => <svg key={i} viewBox="0 0 150 150" ref={(el) => { if (el) srcs.current[i] = el }}>{a}</svg>)}</div>
    </div>
  )
}
