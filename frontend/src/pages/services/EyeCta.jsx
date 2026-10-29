import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ARROW_ICON } from './helpers.jsx'
import './eye-cta.css'
import { tr } from '../../i18n/translate.js';

// Closing call-to-action: "seen" made literal.
//   - an eye drawn like a HUD: lid, light rays, an iris with a tick scale
//   - the pupil IS the "List your organization" button
//   - the iris and the button follow the pointer (the platform is looking at you)
//   - the lid opens when the section scrolls into view, and blinks now and then
// Pure CSS + a few lines of JS; with reduced motion it is simply drawn open and still.

// Same proportions as the approved mock-up (coordinates of its 1440 x 900 canvas).
const CX = 720
const CY = 470
const LID = `M300 ${CY} Q${CX} 190 1140 ${CY} Q${CX} 750 300 ${CY} Z`

function buildRays() {
  const out = []
  for (let i = -70; i <= 70; i += 5) {
    const a = ((-90 + i) * Math.PI) / 180
    const major = i % 10 === 0
    const r1 = 250
    const r2 = r1 + (major ? 40 : 22)
    out.push({
      x1: CX + r1 * 1.9 * Math.cos(a), y1: CY + r1 * Math.sin(a) * 0.95,
      x2: CX + r2 * 1.9 * Math.cos(a), y2: CY + r2 * Math.sin(a) * 0.95, major, k: i,
    })
  }
  return out
}

function buildTicks() {
  const out = []
  for (let i = 0; i < 120; i++) {
    const a = (i * 3 * Math.PI) / 180
    const major = i % 5 === 0
    const r1 = 150, r2 = r1 + (major ? 26 : 12)
    out.push({ x1: CX + r1 * Math.cos(a), y1: CY + r1 * Math.sin(a), x2: CX + r2 * Math.cos(a), y2: CY + r2 * Math.sin(a), major, k: i })
  }
  return out
}

export default function EyeCta() {
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const rays = useMemo(buildRays, [])
  const ticks = useMemo(buildTicks, [])

  // open the lid when the section is in view
  useEffect(() => {
    const el = rootRef.current
    if (!el) return undefined
    if (typeof IntersectionObserver === 'undefined') { setOpen(true); return undefined }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOpen(true); io.disconnect() } }, { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // the eye looks at the pointer (plain DOM writes: no re-render on mouse move)
  useEffect(() => {
    const el = rootRef.current
    if (!el || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const onMove = (e) => {
      const r = el.getBoundingClientRect()
      const x = Math.max(-1, Math.min(1, ((e.clientX - (r.left + r.width / 2)) / (r.width / 2))))
      const y = Math.max(-1, Math.min(1, ((e.clientY - (r.top + r.height / 2)) / (r.height / 2))))
      el.style.setProperty('--ex', x.toFixed(3))
      el.style.setProperty('--ey', y.toFixed(3))
    }
    const onLeave = () => { el.style.setProperty('--ex', '0'); el.style.setProperty('--ey', '0') }
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    return () => { window.removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', onLeave) }
  }, [])

  return (
    <div className={`eyecta${open ? ' is-open' : ''}`} ref={rootRef}>
      <h2 className="section-title eyecta-title">
        {tr("Your products deserve to be")} <span className="eyecta-seen">{tr("seen.")}</span>{' '}
        <br className="eyecta-br" />{tr("Come join us on VigiCore Nexus.")}
      </h2>

      <div className="eyecta-eye">
        <svg className="eyecta-svg" viewBox="190 185 1060 440" aria-hidden="true" focusable="false">
          <defs>
            <path id="eyecta-lid" d={LID} />
            <clipPath id="eyecta-clip"><path d={LID} /></clipPath>
            <radialGradient id="eyecta-iris" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#0a2a44" />
              <stop offset=".55" stopColor="#0c4a66" />
              <stop offset=".82" stopColor="#12f0b8" stopOpacity=".55" />
              <stop offset="1" stopColor="#22e6ff" stopOpacity=".95" />
            </radialGradient>
            <filter id="eyecta-glow" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="7" /></filter>
          </defs>

          <g className="eyecta-rays">
            {rays.map((r) => (
              <line key={r.k} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke="#22e6ff" strokeOpacity={r.major ? 0.55 : 0.25} strokeWidth="2" />
            ))}
          </g>

          <g className="eyecta-lids">
            <use href="#eyecta-lid" fill="#06101c" stroke="#22e6ff" strokeWidth="3" opacity=".8" filter="url(#eyecta-glow)" />
            <use href="#eyecta-lid" fill="#06101c" stroke="#22e6ff" strokeWidth="2.5" />
            <g clipPath="url(#eyecta-clip)">
              <g className="eyecta-iris">
                <circle cx={CX} cy={CY} r="235" fill="url(#eyecta-iris)" />
                <circle cx={CX} cy={CY} r="235" fill="none" stroke="#22e6ff" strokeWidth="3" />
                <circle cx={CX} cy={CY} r="200" fill="none" stroke="#22e6ff" strokeOpacity=".35" strokeWidth="6" strokeDasharray="2 10" />
                <g className="eyecta-ticks">
                  {ticks.map((t) => (
                    <line key={t.k} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="#22e6ff" strokeOpacity={t.major ? 0.8 : 0.4} strokeWidth={t.major ? 2 : 1.2} />
                  ))}
                </g>
                <circle cx={CX} cy={CY} r="140" fill="none" stroke="#22e6ff" strokeOpacity=".5" />
                <ellipse cx={CX - 60} cy={CY - 90} rx="60" ry="20" fill="#fff" opacity=".12" transform={`rotate(-30 ${CX - 60} ${CY - 90})`} />
              </g>
            </g>
          </g>
        </svg>

        <Link to="/register-organization" className="eyecta-pupil">{tr("List your organization {0}", [''])}{ARROW_ICON}</Link>
      </div>

      <p className="section-desc eyecta-desc">
        {tr("publish your own products and services here in a few minutes.")}
      </p>
    </div>
  )
}
