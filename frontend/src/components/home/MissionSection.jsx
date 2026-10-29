import React, { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n/index.jsx'
import './MissionSection.css'
import { prefersReducedMotion } from '../../lib/motion.js'

// Labels for the dial. The dial is an illustration of the headline, not real data.
const L = {
  en: { delay: 'Delay', patient: 'Patient', hint: 'Illustration · move around the dial to follow the seconds' },
  fr: { delay: 'Retard', patient: 'Patient', hint: 'Illustration · parcourez le cadran pour suivre les secondes' },
  ar: { delay: 'التأخير', patient: 'المريض', hint: 'توضيح · حرّك المؤشر حول القرص لمتابعة الثواني' },
}

// One heartbeat (P, Q, R, S, T waves) as a sum of gaussians; phase in [0, 1).
const beat = (p) => {
  const g = (c, a, w) => a * Math.exp(-Math.pow((p - c) / w, 2))
  return g(0.12, 0.12, 0.03) + g(0.3, -0.14, 0.009) + g(0.33, 1, 0.011) + g(0.36, -0.26, 0.011) + g(0.62, 0.26, 0.045)
}

const R = 498
const TICKS = Array.from({ length: 60 }, (_, i) => {
  const a = (i * 6 * Math.PI) / 180, major = i % 5 === 0, len = major ? 30 : 15
  return { x1: (R * Math.sin(a)).toFixed(1), y1: (-R * Math.cos(a)).toFixed(1), x2: ((R - len) * Math.sin(a)).toFixed(1), y2: (-(R - len) * Math.cos(a)).toFixed(1), major }
})

// Patient monitor: a scrolling ECG whose strength fades and colour turns red as the delay grows (risk 0..1).
function Monitor({ riskRef }) {
  const cv = useRef(null)
  useEffect(() => {
    const el = cv.current
    if (!el) return undefined
    const ctx = el.getContext('2d')
    let W = 0, H = 0, hist = [], phase = 0, last = 0, raf = 0, on = false
    const size = () => {
      const r = el.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1)
      W = Math.max(60, Math.round(r.width)); H = Math.max(30, Math.round(r.height))
      el.width = W * dpr; el.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      hist = new Array(W).fill(0)
    }
    const draw = () => {
      const k = riskRef.current, c = [Math.round(0 + 255 * k), Math.round(240 - 150 * k), Math.round(216 - 140 * k)]
      ctx.clearRect(0, 0, W, H)
      ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.strokeStyle = `rgb(${c})`; ctx.shadowColor = `rgba(${c},.8)`; ctx.shadowBlur = 8
      ctx.beginPath()
      hist.forEach((v, x) => { const y = H / 2 - v * H * 0.42; if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y) })
      ctx.stroke()
      ctx.shadowBlur = 0; ctx.globalCompositeOperation = 'destination-out'
      const fade = ctx.createLinearGradient(0, 0, W, 0)
      fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.22, 'rgba(0,0,0,0)'); fade.addColorStop(0.78, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)')
      ctx.fillStyle = fade; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'
    }
    const frame = (now) => {
      if (!on) return
      const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now
      const k = riskRef.current, amp = 1 - 0.7 * k, period = 1.05 - 0.3 * k, cols = Math.max(1, Math.round(130 * dt))
      for (let i = 0; i < cols; i++) {
        phase = (phase + dt / cols / period) % 1
        hist.push(beat(phase) * amp + (Math.random() - 0.5) * k * 0.07); hist.shift()
      }
      draw(); raf = requestAnimationFrame(frame)
    }
    size()
    if (prefersReducedMotion()) { for (let i = 0; i < W; i++) hist[i] = beat(((i / 130) % 1.05) / 1.05) * 0.8; draw(); return undefined }
    // Run only while visible and the tab is active.
    let vis = false
    const sync = () => { const go = vis && !document.hidden; if (go && !on) { on = true; last = 0; raf = requestAnimationFrame(frame) } else if (!go) { on = false; cancelAnimationFrame(raf) } }
    const io = new IntersectionObserver(([e]) => { vis = e.isIntersecting; sync() }, { threshold: 0.05 })
    io.observe(el)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('resize', size)
    return () => { on = false; cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', sync); window.removeEventListener('resize', size) }
  }, [riskRef])
  return <canvas ref={cv} className="md-ecg" />
}

export default function MissionSection() {
  const { t, lang } = useI18n()
  const Z = L[lang] || L.en
  const sectionRef = useRef(null), dialRef = useRef(null), riskRef = useRef(0)
  const wedgeRef = useRef(null), handRef = useRef(null), angRef = useRef(0)
  const scrub = useRef(false), syncRef = useRef(() => {})
  const [sec, setSec] = useState(() => (prefersReducedMotion() ? 24 : 0))
  const [flash, setFlash] = useState(false)
  riskRef.current = sec / 60

  // The title/pulse/description use .reveal-fade, which stays invisible until an "in-view" class is added.
  // Observing locally guarantees this section reveals itself regardless of the global script.
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return undefined
    const targets = el.querySelectorAll('.reveal-fade')
    if (!targets.length) return undefined
    if (prefersReducedMotion()) { targets.forEach((x) => x.classList.add('in-view')); return undefined }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        targets.forEach((x, i) => { setTimeout(() => x.classList.add('in-view'), 90 * i) })
        observer.disconnect()
      })
    }, { threshold: 0.12 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // One tick per real second while the section is visible; pauses off-screen, in a hidden tab, or while scrubbing.
  useEffect(() => {
    if (prefersReducedMotion()) return undefined
    let id = null, vis = false, timer = null
    const tick = () => setSec((s) => {
      const n = (s + 1) % 60
      if (n === 0) { setFlash(true); clearTimeout(timer); timer = setTimeout(() => setFlash(false), 1300) }
      return n
    })
    const sync = () => {
      const go = vis && !document.hidden && !scrub.current
      if (go && !id) id = setInterval(tick, 1000)
      else if (!go && id) { clearInterval(id); id = null }
    }
    syncRef.current = sync
    const io = new IntersectionObserver(([e]) => { vis = e.isIntersecting; sync() }, { threshold: 0.25 })
    io.observe(sectionRef.current)
    document.addEventListener('visibilitychange', sync)
    return () => { clearInterval(id); clearTimeout(timer); io.disconnect(); document.removeEventListener('visibilitychange', sync) }
  }, [])

  // Wedge and hand are SVG attributes updated from JS: a mechanical "tick" with a small overshoot,
  // and a quick sweep back when the minute wraps. No CSS masks, so the dial stays cheap to repaint.
  useEffect(() => {
    const paint = (a) => {
      const c = Math.min(359.9, Math.max(0, a)), r = (c * Math.PI) / 180
      if (wedgeRef.current) {
        wedgeRef.current.setAttribute('d', c < 0.5 ? '' : `M0 0 L0 ${-R} A${R} ${R} 0 ${c > 180 ? 1 : 0} 1 ${(R * Math.sin(r)).toFixed(2)} ${(-R * Math.cos(r)).toFixed(2)}Z`)
        wedgeRef.current.setAttribute('opacity', (0.4 + 0.6 * (c / 360)).toFixed(2))
      }
      if (handRef.current) handRef.current.setAttribute('transform', `rotate(${a.toFixed(2)})`)
    }
    const target = sec * 6, from = angRef.current
    if (prefersReducedMotion()) { angRef.current = target; paint(target); return undefined }
    const wrap = target < from - 180, dur = wrap ? 650 : 300, t0 = performance.now()
    const back = (x) => 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2)
    let raf = 0
    const step = (n) => {
      const x = Math.min(1, (n - t0) / dur), a = from + (target - from) * (wrap ? 1 - Math.pow(1 - x, 3) : back(x))
      angRef.current = a; paint(a)
      if (x < 1) raf = requestAnimationFrame(step); else { angRef.current = target; paint(target) }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [sec])

  // Moving the mouse inside the dial scrubs the clock to that angle; it resumes when the mouse leaves or rests.
  const idle = useRef(null)
  const release = () => { clearTimeout(idle.current); if (scrub.current) { scrub.current = false; syncRef.current() } }
  const onMove = (e) => {
    if (e.pointerType !== 'mouse' || prefersReducedMotion() || !dialRef.current) return
    const r = dialRef.current.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), dist = Math.hypot(dx, dy)
    if (dist > r.width * 0.53) { release(); return }
    if (dist < r.width * 0.12) return
    const ang = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360
    if (!scrub.current) { scrub.current = true; syncRef.current() }
    clearTimeout(idle.current); idle.current = setTimeout(release, 1400)
    setSec(Math.round(ang / 6) % 60)
  }
  const onLeave = release
  useEffect(() => () => clearTimeout(idle.current), [])

  return (
    <section ref={sectionRef} className="mission-section" id="mission" aria-label="Why VigiCore Nexus exists" onPointerMove={onMove} onPointerLeave={onLeave}>
      <div className="mission-atmosphere" aria-hidden="true"></div>
      <div className="mission-grid" aria-hidden="true"></div>
      <div className="mission-axis" aria-hidden="true"></div>

      <div className="md-dial" ref={dialRef} data-flash={flash ? '1' : undefined} aria-hidden="true">
        <svg viewBox="-520 -520 1040 1040" focusable="false">
          <defs>
            <radialGradient id="md-wg" cx="0" cy="0" r={R} gradientUnits="userSpaceOnUse"><stop offset=".34" stopColor="#ff5a46" stopOpacity="0" /><stop offset="1" stopColor="#ff5a46" stopOpacity=".62" /></radialGradient>
            <linearGradient id="md-hg" x1="0" y1={-R} x2="0" y2={-R + 130} gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#ff6b5a" /><stop offset="1" stopColor="#ff6b5a" stopOpacity="0" /></linearGradient>
          </defs>
          <circle className="md-rc" r={R} fill="none" strokeWidth="2" />
          <circle className="md-rc2" r={R * 0.91} fill="none" strokeWidth="1.5" strokeDasharray="4 8" />
          <path ref={wedgeRef} fill="url(#md-wg)" />
          {TICKS.map((k, i) => (<line key={i} x1={k.x1} y1={k.y1} x2={k.x2} y2={k.y2} className={k.major ? 'md-tm' : 'md-tn'} strokeWidth={k.major ? 4 : 2} />))}
          <g ref={handRef}>
            <line x1="0" y1={-R} x2="0" y2={-R + 130} stroke="url(#md-hg)" strokeWidth="3" />
            <circle cy={-R} r="22" fill="#ff5a46" opacity=".28" /><circle cy={-R} r="9" fill="#fff" />
          </g>
        </svg>
      </div>
      <div className="md-hud" data-flash={flash ? '1' : undefined} style={{ '--risk': sec / 60 }} aria-hidden="true">
        <div className="md-count"><small>{Z.delay}</small><b>+00:{String(sec).padStart(2, '0')}</b></div>
        <div className="md-mon"><small>{Z.patient}</small><Monitor riskRef={riskRef} /></div>
      </div>

      <div className="mission-content reveal-stagger">
        <div className="section-eyebrow reveal-fade eyebrow-cyan">{t('mission.eyebrow')}</div>
        <h2 className="mission-title reveal-fade">{t('mission.title')}</h2>
        <p className="mission-desc reveal-fade">{t('mission.desc')}</p>
      </div>
      <p className="md-hint">{Z.hint}</p>
    </section>
  )
}
