import { useEffect } from 'react'
import { prefersReducedMotion } from '../lib/motion.js'

// Animated scene behind /login and /register-organization: cursor glow, star
// field + nebulae, light rays, floating motes and the connector lines between
// the four corner anchors (#mod-*) and the card.
//
// Replaces public/login.js (a minified classic script that was injected with a
// <script> tag and leaked its listeners / rAF loop across route changes).
// Everything is now set up on mount and torn down on unmount.
//
// The page must render these ids: cg, bg-c, rays-c, pt-c, lines-c, system,
// login-card, mod-tl, mod-tr, mod-bl, mod-br. Missing ones are skipped.

const rand = Math.random
const dprCap = () => Math.min(window.devicePixelRatio || 1, 1.5)

// Size a full-screen canvas to the viewport at the capped pixel ratio.
function fitCanvas(canvas, ctx) {
  const dpr = dprCap()
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

// ── Stars + nebulae (#bg-c) ─────────────────────────────────────────────────
function createStarField(canvas) {
  const ctx = canvas.getContext('2d')
  const star = (speed, alpha) => ({
    x: rand() * innerWidth,
    y: rand() * innerHeight,
    r: rand() + 0.2,
    vy: speed * (0.5 * rand() + 0.6),
    a: alpha,
    tw: rand() * Math.PI * 2,
    tws: 0.012 * rand() + 0.003,
    color: rand() < 0.08 ? '0,232,255' : rand() < 0.12 ? '0,255,200' : '160,210,240',
  })
  const layers = [
    Array.from({ length: 28 }, () => star(0.06, 0.45 + 0.3 * rand())),
    Array.from({ length: 18 }, () => star(0.13, 0.35 + 0.25 * rand())),
    Array.from({ length: 8 }, () => star(0.24, 0.45 + 0.25 * rand())),
    Array.from({ length: 26 }, () => ({ ...star(0.03, 0.05 + 0.08 * rand()), r: 0.12 + 0.28 * rand() })),
  ]
  const nebulae = Array.from({ length: 6 }, () => ({
    x: rand() * innerWidth,
    y: rand() * innerHeight,
    r: 100 + 160 * rand(),
    vx: 0.14 * (rand() - 0.5),
    vy: 0.1 * (rand() - 0.5),
    a: 0.018 + 0.028 * rand(),
    color: rand() < 0.4 ? '0,232,255' : rand() < 0.55 ? '0,128,255' : '0,255,200',
  }))

  return {
    resize: () => fitCanvas(canvas, ctx),
    draw() {
      const w = innerWidth
      const h = innerHeight
      const bg = ctx.createLinearGradient(0, 0, 0, h)
      bg.addColorStop(0, '#020a18')
      bg.addColorStop(0.4, '#020b16')
      bg.addColorStop(1, '#010810')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      for (const n of nebulae) {
        n.x += n.vx
        n.y += n.vy
        if (n.x < -n.r) n.x = w + n.r
        if (n.x > w + n.r) n.x = -n.r
        if (n.y < -n.r) n.y = h + n.r
        if (n.y > h + n.r) n.y = -n.r
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r)
        g.addColorStop(0, `rgba(${n.color},${n.a})`)
        g.addColorStop(1, `rgba(${n.color},0)`)
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, 2 * Math.PI)
        ctx.fillStyle = g
        ctx.fill()
      }

      for (const layer of layers) {
        for (const s of layer) {
          s.y += s.vy
          s.tw += s.tws
          if (s.y > h + 4) {
            s.y = -4
            s.x = rand() * w
          }
          const alpha = s.a * (0.65 + 0.35 * Math.sin(s.tw))
          ctx.beginPath()
          ctx.arc(s.x, s.y, s.r, 0, 2 * Math.PI)
          ctx.fillStyle = `rgba(${s.color},${alpha.toFixed(2)})`
          ctx.fill()
        }
      }
    },
  }
}

// ── Light rays (#rays-c) ────────────────────────────────────────────────────
function createRays(canvas) {
  const ctx = canvas.getContext('2d')
  const rays = Array.from({ length: 9 }, (_, i) => ({
    angle: (i / 9) * Math.PI * 2,
    width: 0.02 + 0.025 * rand(),
    length: 0.34 + 0.22 * rand(),
    alpha: 0.022 + 0.022 * rand(),
    phase: rand() * Math.PI * 2,
    speed: 3e-4 + 3e-4 * rand(),
  }))

  return {
    resize: () => fitCanvas(canvas, ctx),
    draw(time) {
      const w = innerWidth
      const h = innerHeight
      ctx.clearRect(0, 0, w, h)
      const cx = 0.5 * w
      const cy = 0.44 * h
      for (const r of rays) {
        r.angle += r.speed
        const pulse = 0.7 + 0.3 * Math.sin(4e-4 * time + r.phase)
        const spread = r.width * pulse
        const len = Math.max(w, h) * r.length * pulse
        const a = r.alpha * pulse
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, len)
        g.addColorStop(0, `rgba(0,232,255,${(2.2 * a).toFixed(3)})`)
        g.addColorStop(0.3, `rgba(0,200,255,${(1.1 * a).toFixed(3)})`)
        g.addColorStop(0.7, `rgba(0,128,255,${(0.5 * a).toFixed(3)})`)
        g.addColorStop(1, 'rgba(0,80,200,0)')
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + Math.cos(r.angle - spread) * len, cy + Math.sin(r.angle - spread) * len)
        ctx.lineTo(cx + Math.cos(r.angle + spread) * len, cy + Math.sin(r.angle + spread) * len)
        ctx.closePath()
        ctx.fillStyle = g
        ctx.fill()
      }
    },
  }
}

// ── Floating motes (#pt-c) ──────────────────────────────────────────────────
const MOTE_COLORS = ['0,232,255', '0,255,200', '40,180,255', '0,200,255', '80,240,220', '160,230,255']

function createMotes(canvas) {
  const ctx = canvas.getContext('2d')
  const spawn = () => ({
    x: rand() * innerWidth,
    y: innerHeight + 10,
    r: 0.4 + 1.4 * rand(),
    vy: -(0.09 + 0.16 * rand()),
    vx: 0.07 * (rand() - 0.5),
    alpha: 0.1 + 0.22 * rand(),
    life: 0,
    maxLife: 260 + 320 * rand(),
    color: MOTE_COLORS[Math.floor(rand() * MOTE_COLORS.length)],
    wobble: rand() * Math.PI * 2,
    wobbleS: 0.006 + 0.01 * rand(),
  })
  const motes = Array.from({ length: 55 }, (_, i) => {
    const m = spawn()
    if (i >= 38) {
      // the last 17 are the faint, slow, tiny ones
      m.r = 0.2 + 0.5 * rand()
      m.alpha = 0.03 + 0.05 * rand()
      m.vy = -(0.04 + 0.08 * rand())
      m.maxLife = 380 + 440 * rand()
    }
    m.y = rand() * innerHeight
    m.life = rand() * m.maxLife
    return m
  })

  return {
    resize: () => fitCanvas(canvas, ctx),
    draw() {
      ctx.clearRect(0, 0, innerWidth, innerHeight)
      for (const m of motes) {
        m.life++
        if (m.life > m.maxLife) {
          Object.assign(m, spawn())
          continue
        }
        m.wobble += m.wobbleS
        m.x += m.vx + 0.06 * Math.sin(m.wobble)
        m.y += m.vy
        const p = m.life / m.maxLife
        const fade = p < 0.12 ? p / 0.12 : p > 0.8 ? (1 - p) / 0.2 : 1
        const alpha = m.alpha * fade
        if (alpha < 0.01) continue

        const halo = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 5 * m.r)
        halo.addColorStop(0, `rgba(${m.color},${(0.55 * alpha).toFixed(3)})`)
        halo.addColorStop(1, `rgba(${m.color},0)`)
        ctx.beginPath()
        ctx.arc(m.x, m.y, 5 * m.r, 0, 2 * Math.PI)
        ctx.fillStyle = halo
        ctx.fill()

        ctx.beginPath()
        ctx.arc(m.x, m.y, m.r, 0, 2 * Math.PI)
        ctx.fillStyle = `rgba(${m.color},${alpha.toFixed(3)})`
        ctx.shadowColor = `rgba(${m.color},${(0.9 * alpha).toFixed(3)})`
        ctx.shadowBlur = 6
        ctx.fill()
        ctx.shadowBlur = 0
      }
    },
  }
}

// ── Connector lines: card → the four corner anchors (#lines-c) ─────────────
// Anchor id → line colour, and where on the card the line leaves from
// (fractions of the card's width / height from its centre).
const ANCHORS = {
  'mod-tl': { rgb: '50,180,255', sx: -0.28, sy: -0.3 },
  'mod-tr': { rgb: '60,200,160', sx: 0.28, sy: -0.3 },
  'mod-bl': { rgb: '180,80,255', sx: -0.28, sy: 0.3 },
  'mod-br': { rgb: '220,140,60', sx: 0.28, sy: 0.3 },
}

// Point at parameter t on the cubic Bézier through p0..p3.
function bezier(t, p0, p1, p2, p3) {
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  }
}

function createLines(canvas) {
  const ctx = canvas.getContext('2d')
  // 8 travelling dots per line
  const dots = {}
  Object.keys(ANCHORS).forEach((id) => {
    dots[id] = Array.from({ length: 8 }, (_, i) => ({
      t: 0.125 * i + 0.06 * rand(),
      speed: 0.0016 + 0.0014 * rand(),
      size: 1.6 * rand() + 1,
    }))
  })
  let conns = []
  let revealStart = null

  const resize = () => {
    const system = document.getElementById('system')
    if (!system) return
    const box = system.getBoundingClientRect()
    const dpr = dprCap()
    canvas.width = box.width * dpr
    canvas.height = box.height * dpr
    canvas.style.width = box.width + 'px'
    canvas.style.height = box.height + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  const measure = () => {
    const system = document.getElementById('system')
    const card = document.getElementById('login-card')
    if (!system || !card) return []
    const sys = system.getBoundingClientRect()
    const c = card.getBoundingClientRect()
    const cx = c.left - sys.left + 0.5 * c.width
    const cy = c.top - sys.top + 0.5 * c.height
    return Object.entries(ANCHORS)
      .map(([id, cfg]) => {
        const el = document.getElementById(id)
        if (!el) return null
        const r = el.getBoundingClientRect()
        const ex = r.left - sys.left + 0.5 * r.width
        const ey = r.top - sys.top + 0.5 * r.height
        const sx = cx + cfg.sx * c.width
        const sy = cy + cfg.sy * c.height
        const dx = ex - cx
        const dy = ey - cy
        const dist = Math.hypot(dx, dy)
        const ux = dx / dist
        const uy = dy / dist
        return {
          id,
          rgb: cfg.rgb,
          p0: { x: sx, y: sy },
          p1: { x: sx + ux * dist * 0.52, y: sy + uy * dist * 0.52 },
          p2: { x: ex - ux * dist * 0.2, y: ey - uy * dist * 0.2 },
          p3: { x: ex, y: ey },
        }
      })
      .filter(Boolean)
  }

  const init = () => {
    resize()
    conns = measure()
    revealStart = null
  }

  return {
    init,
    remeasure() {
      resize()
      conns = measure()
    },
    draw(time) {
      if (revealStart == null) revealStart = time
      const reveal = Math.min(1, (time - revealStart) / 1800)
      const dpr = dprCap()
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)

      for (const { id, rgb, p0, p1, p2, p3 } of conns) {
        const steps = Math.floor(100 * reveal)
        if (steps < 2) continue
        const path = []
        for (let i = 0; i <= steps; i++) path.push(bezier(i / 100, p0, p1, p2, p3))

        // soft wide glow
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(path[0].x, path[0].y)
        path.forEach((p) => ctx.lineTo(p.x, p.y))
        const glow = ctx.createLinearGradient(p0.x, p0.y, p3.x, p3.y)
        glow.addColorStop(0, `rgba(${rgb},0)`)
        glow.addColorStop(0.25, `rgba(${rgb},0.22)`)
        glow.addColorStop(0.5, `rgba(${rgb},0.38)`)
        glow.addColorStop(0.75, `rgba(${rgb},0.22)`)
        glow.addColorStop(1, `rgba(${rgb},0)`)
        ctx.strokeStyle = glow
        ctx.lineWidth = 6
        ctx.stroke()
        ctx.restore()

        // bright thin core
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(path[0].x, path[0].y)
        path.forEach((p) => ctx.lineTo(p.x, p.y))
        const core = ctx.createLinearGradient(p0.x, p0.y, p3.x, p3.y)
        core.addColorStop(0, `rgba(${rgb},0)`)
        core.addColorStop(0.2, `rgba(${rgb},0.70)`)
        core.addColorStop(0.5, `rgba(${rgb},0.99)`)
        core.addColorStop(0.8, `rgba(${rgb},0.70)`)
        core.addColorStop(1, `rgba(${rgb},0)`)
        ctx.strokeStyle = core
        ctx.lineWidth = 1.4
        ctx.shadowColor = `rgba(${rgb},0.9)`
        ctx.shadowBlur = 4
        ctx.stroke()
        ctx.restore()

        // dots travelling along the line
        for (const dot of dots[id]) {
          dot.t = (dot.t + dot.speed) % 1
          if (dot.t > reveal) continue
          const pos = bezier(dot.t, p0, p1, p2, p3)
          const bell = Math.sin(dot.t * Math.PI)
          const size = dot.size + 2 * bell
          const alpha = 0.5 + 0.45 * bell
          ctx.save()
          ctx.beginPath()
          ctx.arc(pos.x, pos.y, 4.5 * size, 0, 2 * Math.PI)
          ctx.fillStyle = `rgba(${rgb},${Math.min(0.14 * alpha, 0.99).toFixed(2)})`
          ctx.fill()
          ctx.beginPath()
          ctx.arc(pos.x, pos.y, size, 0, 2 * Math.PI)
          ctx.fillStyle = `rgba(${rgb},${Math.min(alpha, 0.99).toFixed(2)})`
          ctx.shadowColor = `rgba(${rgb},1)`
          ctx.shadowBlur = 8
          ctx.fill()
          ctx.restore()
        }
      }
    },
  }
}

export default function useLoginScene() {
  useEffect(() => {
    const reduced = prefersReducedMotion()
    const canvasOf = (id) => document.getElementById(id)

    // Cursor glow
    const glow = canvasOf('cg')
    const onMove = (e) => {
      if (!glow) return
      glow.style.left = e.clientX + 'px'
      glow.style.top = e.clientY + 'px'
    }
    document.addEventListener('mousemove', onMove)

    // Full-screen layers (skipped entirely with prefers-reduced-motion)
    const layers = []
    if (!reduced) {
      const make = (id, factory) => {
        const el = canvasOf(id)
        if (el?.getContext('2d')) layers.push(factory(el))
      }
      make('bg-c', createStarField)
      make('rays-c', createRays)
      make('pt-c', createMotes)
      layers.forEach((l) => l.resize())
    }

    // Connector lines (still drawn with reduced motion — they are static-ish)
    const linesEl = canvasOf('lines-c')
    const lines = linesEl?.getContext('2d') ? createLines(linesEl) : null
    const initTimer = setTimeout(() => lines?.init(), 300)

    let resizeTimer
    const onResize = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        layers.forEach((l) => l.resize())
        lines?.remeasure()
      }, 120)
    }
    window.addEventListener('resize', onResize)

    // Single rAF loop, throttled to ~30 fps (~15 on slow machines)
    let raf = 0
    let last = 0
    const loop = (time) => {
      raf = requestAnimationFrame(loop)
      if (document.hidden || time - last < (window.__vgLite ? 66 : 33)) return
      last = time
      layers.forEach((l) => l.draw(time))
      lines?.draw(time)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(initTimer)
      clearTimeout(resizeTimer)
      document.removeEventListener('mousemove', onMove)
      window.removeEventListener('resize', onResize)
    }
  }, [])
}
