import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useI18n } from '../../i18n/index.jsx'
import { DZ_PATH, NB_PATH, MAP_VIEW, CORE, WILAYAS, MINOR_DOTS } from '../../lib/algeriaMap.js'
import { prefersReducedMotion } from '../../lib/motion.js'

// The five domains, in list order. Only the ACTIVE one is coloured: every
// colour on the card, the paths and the packets comes from --d (its rgb).
// `src` = the wilaya the followed incident comes from (illustrative).
const DOMAINS = [
  { id: 'materio',  ref: 'S/N 7741',  name: 'Matériovigilance',  rgb: '0,184,255',   desc: 'conv.domain1', feed: 'conv.feed1', base: 14, linked: [1, 2], src: 'alger' },
  { id: 'pharmaco', ref: 'Lot A-204', name: 'Pharmacovigilance', rgb: '0,255,178',   desc: 'conv.domain2', feed: 'conv.feed2', base: 31, linked: [0, 3], src: 'oran' },
  { id: 'chemo',    ref: 'Lab 3',     name: 'Chémovigilance',    rgb: '160,100,255', desc: 'conv.domain3', feed: 'conv.feed3', base: 8,  linked: [1, 4], src: 'annaba' },
  { id: 'cosmeto',  ref: 'Lot C-88',  name: 'Cosmétovigilance',  rgb: '255,180,50',  desc: 'conv.domain4', feed: 'conv.feed4', base: 22, linked: [1, 2], src: 'setif' },
  { id: 'reacto',   ref: 'Lot R-17',  name: 'Réactovigilance',   rgb: '255,60,90',   desc: 'conv.domain5', feed: 'conv.feed5', base: 11, linked: [0, 1], src: 'constantine' },
]
const STEP_TIMES = ['0.0 s', '0.4 s', '0.9 s', '1.6 s']
const CYCLE_MS = 5600
const SVG_NS = 'http://www.w3.org/2000/svg'

// ── Map geometry (all in the 600x560 space of algeriaMap.js) ────────────────
// The core sits at the centre of the country. Around it: a ring made of five
// arcs (one per domain) with a gap on the east, where the output leaves.
const R_ARC = 50      // radius of the domain arcs
const R_TICKS = 58    // radius of the slowly turning dial
const R_DISC = 41     // radius of the HTML core disc drawn on top
const OUT_END_X = MAP_VIEW.x + MAP_VIEW.w + 16   // output line reaches the incident card
const ARC_SPAN = 26                               // half-width of a domain arc, degrees
const domainAngle = (i) => 36 + i * 72            // 36, 108, 180, 252, 324 -> gap centred on 0°

const polar = (a, r = R_ARC) => {
  const rad = (a * Math.PI) / 180
  return [CORE.x + r * Math.cos(rad), CORE.y + r * Math.sin(rad)]
}
const arcPath = (a0, a1) => {
  const [x0, y0] = polar(a0)
  const [x1, y1] = polar(a1)
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${R_ARC} ${R_ARC} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

// One curved route per wilaya, ending on the ring. A constant sideways bow on
// every route gives the whole network a gentle swirl towards the core.
const ROUTES = WILAYAS.map((w) => {
  const dx = w.x - CORE.x
  const dy = w.y - CORE.y
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  const ex = CORE.x + ux * (R_ARC + 3)
  const ey = CORE.y + uy * (R_ARC + 3)
  const bow = 0.15 * len
  const cx = (w.x + ex) / 2 - uy * bow
  const cy = (w.y + ey) / 2 + ux * bow
  return `M${w.x} ${w.y}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`
})
const OUT_PATH = `M${CORE.x + R_ARC + 3} ${CORE.y}L${OUT_END_X} ${CORE.y}`
const WILAYA_INDEX = Object.fromEntries(WILAYAS.map((w, i) => [w.id, i]))

// Hub overlay position, in % of the map box (so it scales with the SVG).
const pct = (v, o, s) => `${(((v - o) / s) * 100).toFixed(3)}%`
const HUB_STYLE = {
  left: pct(CORE.x, MAP_VIEW.x, MAP_VIEW.w),
  top: pct(CORE.y, MAP_VIEW.y, MAP_VIEW.h),
  width: `${((R_DISC * 2) / MAP_VIEW.w * 100).toFixed(3)}%`,
  marginLeft: `-${((R_DISC) / MAP_VIEW.w * 100).toFixed(3)}%`,
  marginTop: `-${((R_DISC) / MAP_VIEW.w * 100).toFixed(3)}%`, // % margins are relative to the width
}

// Moves a glowing dot along an SVG path (rAF + getPointAtLength), then removes it.
function travel(pathEl, group, rgb, { ms = 900, r = 4, onDone } = {}) {
  if (!pathEl || !group) { onDone && onDone(); return }
  const len = pathEl.getTotalLength()
  const dot = document.createElementNS(SVG_NS, 'circle')
  dot.setAttribute('r', r)
  dot.setAttribute('fill', `rgb(${rgb})`)
  dot.style.filter = `drop-shadow(0 0 5px rgba(${rgb},.95))`
  group.appendChild(dot)
  const t0 = performance.now()
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2)
  const step = (now) => {
    const p = Math.min(1, (now - t0) / ms)
    const pt = pathEl.getPointAtLength(len * ease(p))
    dot.setAttribute('cx', pt.x)
    dot.setAttribute('cy', pt.y)
    dot.setAttribute('opacity', Math.min(1, p * 8, (1 - p) * 6 + 0.35))
    if (p < 1) requestAnimationFrame(step)
    else { dot.remove(); onDone && onDone() }
  }
  requestAnimationFrame(step)
}

// A thin ring that expands and fades where a signal is born.
function ripple(group, x, y, rgb, { r0 = 3, r1 = 17, ms = 1100 } = {}) {
  if (!group) return
  const c = document.createElementNS(SVG_NS, 'circle')
  c.setAttribute('cx', x)
  c.setAttribute('cy', y)
  c.setAttribute('fill', 'none')
  c.setAttribute('stroke', `rgb(${rgb})`)
  c.setAttribute('stroke-width', '1.3')
  group.appendChild(c)
  const t0 = performance.now()
  const step = (now) => {
    const p = Math.min(1, (now - t0) / ms)
    c.setAttribute('r', r0 + (r1 - r0) * (1 - Math.pow(1 - p, 2)))
    c.setAttribute('opacity', 0.85 * (1 - p))
    if (p < 1) requestAnimationFrame(step)
    else c.remove()
  }
  requestAnimationFrame(step)
}

export default function SolutionSection() {
  const { t, lang } = useI18n()
  const sectionRef = useRef(null)
  const metricsRef = useRef(null)

  // Self-contained reveal: don't depend on the global script.js observer
  // to find this section's .reveal-fade elements (title, eyebrow, desc,
  // pills). Same reliability fix applied to MissionSection.
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const targets = el.querySelectorAll('.reveal-fade')
    if (!targets.length) return

    if (prefersReducedMotion()) {
      targets.forEach((t) => t.classList.add('in-view'))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          targets.forEach((t, i) => {
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

  useEffect(() => {
    const el = metricsRef.current
    if (!el) return
    const nums = el.querySelectorAll('[data-count-to]')
    let done = false
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !done) {
          done = true
          nums.forEach((num) => {
            const target = parseFloat(num.getAttribute('data-count-to'))
            const prefix = num.getAttribute('data-count-prefix') || ''
            const suffix = num.getAttribute('data-count-suffix') || ''
            const duration = 1100
            const start = performance.now()
            const step = (now) => {
              const p = Math.min((now - start) / duration, 1)
              const eased = 1 - Math.pow(1 - p, 3)
              const val = Math.round(target * eased)
              num.textContent = prefix + val + suffix
              if (p < 1) requestAnimationFrame(step)
              else num.textContent = prefix + target + suffix
            }
            requestAnimationFrame(step)
          })
          obs.disconnect()
        }
      })
    }, { threshold: 0.4 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])


  // ── Live map. Signals are born in wilayas and run to the AI core at the
  // centre of the country; the core then sends the followed incident to the
  // record on the right. Purely illustrative. Everything lives in one SVG with
  // a fixed viewBox, so nothing has to be measured and it scales cleanly.
  const pipeRef = useRef(null)
  const hubRef = useRef(null)
  const pathRefs = useRef([])
  const outRef = useRef(null)
  const pktRef = useRef(null)
  const fxRef = useRef(null)
  const timers = useRef([])
  const [active, setActive] = useState(0)
  const [pinned, setPinned] = useState(false)
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(4)
  const [counts, setCounts] = useState(() => DOMAINS.map((d) => d.base))
  const reduced = prefersReducedMotion()

  const later = useCallback((fn, ms) => { timers.current.push(setTimeout(fn, ms)) }, [])
  const clearTimers = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = [] }, [])

  useEffect(() => {
    const el = pipeRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // small ambient packets keep arriving from every part of the country, in
  // the colour of whichever domain they belong to
  const ambient = useCallback((wi, di) => {
    const w = WILAYAS[wi]
    const rgb = DOMAINS[di].rgb
    ripple(fxRef.current, w.x, w.y, rgb, { r1: 10, ms: 900 })
    travel(pathRefs.current[wi], pktRef.current, rgb, { ms: 1300 + Math.random() * 500, r: 2.4 })
  }, [])

  // the followed incident: wilaya -> core -> incident record
  const runIncident = useCallback((i) => {
    clearTimers()
    setStep(0)
    const wi = WILAYA_INDEX[DOMAINS[i].src]
    const w = WILAYAS[wi]
    if (!pathRefs.current[wi] || !outRef.current) { setStep(4); return }
    ripple(fxRef.current, w.x, w.y, DOMAINS[i].rgb, { r0: 4, r1: 26, ms: 1300 })
    travel(pathRefs.current[wi], pktRef.current, DOMAINS[i].rgb, {
      ms: 1250, r: 5,
      onDone: () => {
        setStep(1)
        setCounts((c) => c.map((v, k) => (k === i ? v + 1 : v)))
        const hub = hubRef.current
        if (hub) hub.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 650, easing: 'ease-out' })
        later(() => setStep(2), 450)
        later(() => setStep(3), 900)
        later(() => {
          setStep(4)
          travel(outRef.current, pktRef.current, DOMAINS[i].rgb, { ms: 800, r: 5 })
        }, 1400)
      },
    })
  }, [clearTimers, later])

  useEffect(() => {
    if (reduced || !visible) { setStep(4); return }
    runIncident(active)
    return clearTimers
  }, [active, visible, reduced, runIncident, clearTimers])

  useEffect(() => {
    if (reduced || !visible || pinned) return
    const id = setInterval(() => setActive((a) => (a + 1) % DOMAINS.length), CYCLE_MS)
    return () => clearInterval(id)
  }, [reduced, visible, pinned])

  useEffect(() => {
    if (reduced || !visible) return
    const id = setInterval(() => {
      let wi = Math.floor(Math.random() * WILAYAS.length)
      if (wi === WILAYA_INDEX[DOMAINS[active].src]) wi = (wi + 1) % WILAYAS.length
      ambient(wi, Math.floor(Math.random() * DOMAINS.length))
    }, 1300)
    return () => clearInterval(id)
  }, [reduced, visible, active, ambient])

  const pick = (i) => { setActive(i); setPinned(true) }
  const dom = DOMAINS[active]
  const srcIdx = WILAYA_INDEX[dom.src]
  const srcName = WILAYAS[srcIdx].name[lang] || WILAYAS[srcIdx].name.en

  return (
    <section ref={sectionRef} className="scroll-section solution-section" id="features">
    <canvas className="solution-canvas" id="solution-canvas"></canvas>
    <div className="section-content">

      <div className="section-eyebrow reveal-fade" style={{'color':'var(--teal)'}}>System Restored</div>
      <h2 className="section-title reveal-fade" dangerouslySetInnerHTML={{ __html: t('features.title') }}></h2>
      <p className="section-desc reveal-fade">{t('features.desc')}</p>

      <div className="nx-pipeline reveal-fade" id="conv-pipeline" ref={pipeRef} style={{ '--d': dom.rgb }}
           aria-label="Five vigilance domains converging into the VigiCore Nexus AI core, which produces one traceable incident record">

        <div className="nx-lanes" role="tablist" aria-label="Vigilance domains">
          {DOMAINS.map((d, i) => (
            <button
              type="button"
              role="tab"
              aria-selected={i === active}
              key={d.id}
              className={`nx-lane${i === active ? ' is-active' : ''}`}
              style={{ '--r': d.rgb }}
              onMouseEnter={() => pick(i)}
              onFocus={() => pick(i)}
              onClick={() => pick(i)}
              onMouseLeave={() => setPinned(false)}
              onBlur={() => setPinned(false)}
            >
              <span className="nx-lane-node" aria-hidden="true"></span>
              <span className="nx-lane-text">
                <span className="nx-lane-name">{d.name}</span>
                <span className="nx-lane-desc">{t(d.desc)}</span>
              </span>
              <span className="nx-lane-count">
                <b>{counts[i]}</b>
                <small>{t('conv.signals')}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="nx-map" id="conv-core" style={{ aspectRatio: `${MAP_VIEW.w} / ${MAP_VIEW.h}` }}>
          <svg
            className="nx-map-svg"
            viewBox={`${MAP_VIEW.x} ${MAP_VIEW.y} ${MAP_VIEW.w} ${MAP_VIEW.h}`}
            role="img"
            aria-label={t('conv.map.aria')}
          >
            <defs>
              <pattern id="nx-dots" width="7" height="7" patternUnits="userSpaceOnUse">
                <circle cx="1.8" cy="1.8" r="0.95" className="nx-dotpat" />
              </pattern>
              <clipPath id="nx-view"><rect x={MAP_VIEW.x} y={MAP_VIEW.y} width={MAP_VIEW.w} height={MAP_VIEW.h} /></clipPath>
            </defs>

            <g>
              {/* neighbouring countries: context only, clipped to the crop */}
              <g clipPath="url(#nx-view)"><path d={NB_PATH} className="nx-nb" /></g>

              {/* radar rings around the core */}
              {[96, 158, 224].map((r) => (
                <circle key={r} cx={CORE.x} cy={CORE.y} r={r} className="nx-radar" />
              ))}

              {/* Algeria */}
              <path d={DZ_PATH} className="nx-dz" />
              <path d={DZ_PATH} fill="url(#nx-dots)" className="nx-dz-tex" />
              <path d={DZ_PATH} className="nx-dz-line" />
              <path d={DZ_PATH} className="nx-dz-scan" pathLength="1000" />

              {/* secondary wilayas */}
              {MINOR_DOTS.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.5" className="nx-minor" />)}
            </g>

            {/* routes: wilaya -> core */}
            {WILAYAS.map((w, i) => (
              <path
                key={w.id}
                ref={(el) => { pathRefs.current[i] = el }}
                d={ROUTES[i]}
                className={`nx-route${i === srcIdx ? ' is-active' : ''}`}
              />
            ))}

            {/* the core's ring: one arc per domain + the output port on the east */}
            <circle cx={CORE.x} cy={CORE.y} r={R_TICKS} className="nx-hub-ticks" style={{ transformOrigin: `${CORE.x}px ${CORE.y}px` }} />
            {DOMAINS.map((d, i) => (
              <path
                key={d.id}
                d={arcPath(domainAngle(i) - ARC_SPAN, domainAngle(i) + ARC_SPAN)}
                className={`nx-arc${i === active ? ' is-active' : ''}`}
                style={{ '--r': d.rgb }}
              />
            ))}
            <path ref={outRef} d={OUT_PATH} className="nx-route nx-route--out is-active" />
            <circle cx={OUT_END_X} cy={CORE.y} r="3.5" className="nx-out-end" />

            {/* wilaya dots + labels */}
            {WILAYAS.map((w, i) => (
              <g key={w.id} className={`nx-node${i === srcIdx ? ' is-src' : ''}`}>
                {i === srcIdx && <circle cx={w.x} cy={w.y} r="4" className="nx-node-pulse" />}
                <circle cx={w.x} cy={w.y} r={i === srcIdx ? 4 : 2.8} className="nx-node-dot" />
                <text x={w.x + w.lx} y={w.y + w.ly} textAnchor={w.anchor} className="nx-lbl">{w.name[lang] || w.name.en}</text>
              </g>
            ))}

            <g ref={fxRef}></g>
            <g ref={pktRef}></g>
          </svg>

          <div className="nx-maptag" aria-hidden="true"><i></i>{t('conv.map.tag')}</div>

          <div className="nx-hub" ref={hubRef} style={HUB_STYLE} aria-label="VigiCore Nexus AI processing core">
            <div className="nx-disc">
              <span className="nx-sweep" aria-hidden="true"></span>
              <svg className="nx-disc-mark" viewBox="0 0 24 28" aria-hidden="true">
                <path d="M12 1.5 21.5 5v8.2c0 6.1-4.2 10.6-9.5 13.3C6.7 23.8 2.5 19.3 2.5 13.2V5L12 1.5Z" />
                <path d="M6.5 14h3l1.6-3.6 2.6 7 1.7-3.4h2.1" />
              </svg>
              <span className="nx-disc-name">VigiCore</span>
              <span className="nx-disc-label">{t('conv.aiCore')}</span>
              <div className="conv-core-ecg" aria-hidden="true">
                <canvas id="ecg-canvas-core" className="conv-ecg-canvas"></canvas>
              </div>
            </div>
          </div>

          <span className="nx-feed" key={active} aria-live="polite"><b></b><em>{srcName}</em>{t(dom.feed)}</span>
        </div>

        <div className="nx-dossier">
          <div className="nx-dossier-head">
            <span className="nx-dossier-title">{t('conv.story.title')}</span>
            <span className="nx-dossier-tag" key={dom.id}>{dom.name}</span>
          </div>
          <div className="nx-dossier-id" aria-hidden="true">INC-0412 <i></i> {dom.ref} <i></i> {srcName}</div>
          <ol className="nx-steps">
            {[
              { k: 's1', time: STEP_TIMES[0], detail: t(dom.feed) },
              { k: 's2', time: STEP_TIMES[1], detail: `${t('conv.story.d2')} ${dom.linked.map((n) => DOMAINS[n].name).join(' · ')}` },
              { k: 's3', time: STEP_TIMES[2], detail: t('conv.story.d3') },
              { k: 's4', time: STEP_TIMES[3], detail: t('conv.story.d4') },
            ].map((s, n) => (
              <li key={s.k} className={`nx-step${step > n ? ' is-done' : ''}${step === n + 1 ? ' is-now' : ''}`}>
                <span className="nx-step-dot" aria-hidden="true"></span>
                <span className="nx-step-body">
                  <span className="nx-step-row"><b>{t('conv.story.' + s.k)}</b><em>T+{s.time}</em></span>
                  <span className="nx-step-detail">{s.detail}</span>
                </span>
              </li>
            ))}
          </ol>
          <span className={`nx-stamp${step >= 4 ? ' is-on' : ''}`} key={'st' + dom.id} aria-hidden="true">{t('conv.story.s4')}</span>
          <div className="nx-compare" aria-hidden="true">
            <div className="nx-compare-row">
              <span className="nx-compare-label">{t('conv.story.before')}</span>
              <span className="nx-compare-track"><i className="is-bad"></i></span>
              <strong>46 days*</strong>
            </div>
            <div className="nx-compare-row">
              <span className="nx-compare-label">{t('conv.story.after')}</span>
              <span className="nx-compare-track"><i className="is-good"></i></span>
              <strong>&lt; 2 s*</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="conv-metrics reveal-fade" ref={metricsRef}>
        <div className="df-corner df-corner--tl"></div>
        <div className="df-corner df-corner--tr"></div>
        <div className="df-corner df-corner--bl"></div>
        <div className="df-corner df-corner--br"></div>
        <div className="conv-metric">
          <span className="conv-metric-icon">
            <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/></svg>
          </span>
          <span className="conv-metric-num"><span style={{'color':'var(--cyan)'}} data-count-to="5" data-count-suffix="">0</span></span>
          <span className="conv-metric-label">{t('conv.metric1')}</span>
        </div>
        <div className="conv-metric">
          <span className="conv-metric-icon">
            <svg viewBox="0 0 24 24" fill="none"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none"/></svg>
          </span>
          <span className="conv-metric-num"><span style={{'color':'var(--cyan)'}} data-count-to="2" data-count-suffix="s" data-count-prefix="<">0</span></span>
          <span className="conv-metric-label">{t('conv.metric2')}</span>
        </div>
        <div className="conv-metric">
          <span className="conv-metric-icon">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4"/><path d="M8 12.5l2.5 2.5L16 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <span className="conv-metric-num"><span style={{'color':'var(--cyan)'}} data-count-to="100" data-count-suffix="%">0</span></span>
          <span className="conv-metric-label">{t('conv.metric3')}</span>
        </div>
        <div className="conv-metric">
          <span className="conv-metric-icon">
            <svg viewBox="0 0 24 24" fill="none"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" stroke="currentColor" strokeWidth="1.4"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.4"/><path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          </span>
          <span className="conv-metric-num"><span style={{'color':'var(--cyan)'}} data-count-to="0" data-count-suffix="">0</span></span>
          <span className="conv-metric-label">{t('conv.metric4')}</span>
        </div>
      </div>

      

      <div className="conv-closing reveal-fade">
        <a href="/login" className="conv-cta conv-cta--center">
          <span>{t('nav.platformAccess')}</span>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </a>
        <p className="conv-disclaimer">{t('conv.disclaimer')}</p>
      </div>

    </div>
  </section>
  )
}
