import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n/index.jsx'

/* "From Incident to Resolution" — scroll-driven isometric route.
   Five glowing platforms, one per step, step down the page. The case is a
   luminous cube that hops from platform to platform as you scroll. CAPA is a
   side platform off Investigation, Report is optional, and the ring closes:
   step 5 feeds step 1. The case file fills in on the holo card (bottom left).
   Same scroll mechanic as before: tall track + sticky stage, scroll = progress. */

const ACCENTS = ['#00e8ff', '#00ffcc', '#dc8c3c', '#b450ff', '#00e887']
const ACCENT_RGB = ['0,232,255', '0,255,204', '220,140,60', '180,80,255', '0,232,135']
const LAP_COLORS = ['#ff9a5a', '#d6e86a', '#2bf2b4']
const LAPS = [78, 52, 31]
const NAV_OFFSET = 84 // keep in sync with --wfd-top in workflow-dossier.css

const NODES = [
  { k: 'wf2.s1', d: 'Detected',      sk: 'wf2.t1', sd: 'T + 0s' },
  { k: 'wf2.s2', d: 'Triage',        sk: 'wf2.t2', sd: 'T + 0.3s' },
  { k: 'wf2.s3', d: 'Investigation', sk: 'wf2.t3', sd: 'CAPA only when needed' },
  { k: 'wf2.s4', d: 'Report',        sk: 'wf2.t4', sd: 'Only when required', opt: 'reg' },
  { k: 'wf2.s5', d: 'Resolved',      sk: 'wf2.t5', sd: 'T + 2.8s' },
]
const TT = [0, 0.3, 1.0, 2.0, 2.8]

/* iso geometry (SVG units) */
const VW = 800, VH = 720
const TW = 62, TH_ = 31, TD = 14 // half width, half height, thickness of a platform
const SHIFT = 110 // platforms are pushed right so the case file never touches them
const ST = [[110, 110], [260, 194], [410, 278], [560, 362], [710, 446]].map(([x, y]) => [x + SHIFT, y])
const CAPA = [410 + SHIFT, 150]
const SEG = Math.hypot(150, 84)
const fx = (p) => `${p[0]} ${p[1]}`
const ROUTE = `M${fx(ST[0])} ${ST.slice(1).map((p) => `L${fx(p)}`).join(' ')}`
const SEGS = [0, 1, 2, 3].map((k) => `M${fx(ST[k])} L${fx(ST[k + 1])}`)
const LOOP = `M${768 + SHIFT} 440 C${806 + SHIFT} 290 ${780 + SHIFT * 0.4} 40 540 38 C340 36 ${120 + SHIFT} 30 ${52 + SHIFT} 104`
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))

const top = ([x, y]) => `${x},${y - TH_} ${x + TW},${y} ${x},${y + TH_} ${x - TW},${y}`
const leftSide = ([x, y]) => `${x - TW},${y} ${x},${y + TH_} ${x},${y + TH_ + TD} ${x - TW},${y + TD}`
const rightSide = ([x, y]) => `${x + TW},${y} ${x},${y + TH_} ${x},${y + TH_ + TD} ${x + TW},${y + TD}`

/* iso column for the risk bars */
function Column({ x, y, h, color, i, on }) {
  const w = 26, d = 13
  const t = on ? h : 0
  return (
    <g className="wfd-col3" style={{ '--c': color, '--i': i }}>
      <g style={{ transform: `translateY(${-t}px)`, transition: `transform .9s cubic-bezier(.2,.8,.2,1) ${i * 0.18}s` }}>
        <polygon points={`${x},${y - d} ${x + w},${y} ${x},${y + d} ${x - w},${y}`} className="wfd-col3-top" />
      </g>
      <polygon className="wfd-col3-l" points={`${x - w},${y} ${x},${y + d} ${x},${y + d - t} ${x - w},${y - t}`} style={{ transition: `all .9s cubic-bezier(.2,.8,.2,1) ${i * 0.18}s` }} />
      <polygon className="wfd-col3-r" points={`${x + w},${y} ${x},${y + d} ${x},${y + d - t} ${x + w},${y - t}`} style={{ transition: `all .9s cubic-bezier(.2,.8,.2,1) ${i * 0.18}s` }} />
    </g>
  )
}

export default function WorkflowSection() {
  const { t } = useI18n()
  const [capa, setCapa] = useState(true)
  const [reg, setReg] = useState(true)
  const [stage, setStage] = useState(0)

  const trackRef = useRef(null)
  const routeRef = useRef(null)
  const fillRef = useRef(null)
  const cubeRef = useRef(null)
  const clockRef = useRef(null)
  const hintRef = useRef(null)
  const progRef = useRef(0)
  const stageRef = useRef(0)
  const skipRef = useRef(false)
  skipRef.current = !reg

  const apply = useCallback(() => {
    const route = routeRef.current
    if (!route) return
    const total = route.getTotalLength()
    const sr = skipRef.current
    const w = [1, 1, sr ? 0.4 : 1, sr ? 0.4 : 1]
    const W = w.reduce((a, b) => a + b, 0)
    const f = progRef.current
    const arr = [0]
    w.forEach((x) => arr.push(arr[arr.length - 1] + x / W))
    let k = 0
    while (k < 3 && f > arr[k + 1]) k++
    const tt = clamp((f - arr[k]) / (arr[k + 1] - arr[k]))
    const len = (k + tt) * SEG
    const p = route.getPointAtLength(len)
    cubeRef.current?.setAttribute('transform', `translate(${p.x} ${p.y})`)
    if (fillRef.current) {
      fillRef.current.style.strokeDasharray = String(total)
      fillRef.current.style.strokeDashoffset = String(total - len)
    }
    const secs = TT[k] + (TT[k + 1] - TT[k]) * tt
    if (clockRef.current) clockRef.current.textContent = `T + ${secs.toFixed(1)}s`
    hintRef.current?.classList.toggle('gone', f > 0.02)
    let s = 0
    arr.forEach((a, i) => { if (f >= a - 1e-6) s = i })
    if (f >= 0.999) s = 4
    if (s !== stageRef.current) { stageRef.current = s; setStage(s) }
  }, [])

  useLayoutEffect(() => { apply() }, [capa, reg, stage, apply])

  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const el = trackRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const range = r.height - (window.innerHeight - NAV_OFFSET)
      const p = range > 0 ? clamp((NAV_OFFSET - r.top) / range) : 0
      progRef.current = clamp((p - 0.04) / 0.9)
      apply()
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [apply])

  const resolved = stage === 4
  const stepName = (i) => t(NODES[i].k, NODES[i].d)

  const rows = [
    { at: 0, k: 'Reported by', v: 'Physician, ward 4B' },
    { at: 0, k: 'Channel', v: 'Portal' },
    { at: 0, k: 'Product', v: 'Infusion pump, lot 2291' },
    { at: 1, k: 'Severity', v: <span className="wfd-pill">Serious</span> },
    { at: 1, k: 'Category', v: 'Device malfunction' },
    { at: 1, k: 'Risk score', v: <span className="wfd-risk"><span className="wfd-meter" style={{ '--w': '78%' }} /><b className="wfd-count" aria-label="78" /></span> },
    { at: 2, k: 'Owner', v: 'Quality + Vigilance' },
    { at: 2, k: 'Root cause', v: 'Seal defect on lot 2291' },
    { at: 2, k: 'CAPA', v: capa ? 'CAPA-118 opened' : 'Not required', skip: !capa },
    { at: 3, k: 'Authority report', v: reg ? 'Submitted, 15-day deadline' : 'Not required', skip: !reg },
    { at: 4, k: 'Outcome', v: 'Lot withdrawn, reporter informed' },
  ]

  const tileClass = (i) => ['wfd-tile', i <= stage ? 'reached' : '', i === stage ? 'current' : '', NODES[i].opt && !reg ? 'skipped' : ''].filter(Boolean).join(' ')
  const capaOn = capa && stage >= 2

  return (
    <section className="wfd" id="workflow-section" aria-labelledby="wfd-title">
      <div className="wfd-track" ref={trackRef}>
        <div className="wfd-stage" style={{ '--wfd-ac': ACCENTS[stage], '--d': ACCENT_RGB[stage] }}>
          {/* ── Left: title + controls + what is happening now ── */}
          <div className="wfd-left">
            <div className="wfd-head">
              <div className="section-eyebrow">Live Scenario</div>
              <h2 className="section-title" id="wfd-title">{t('wf.title')}</h2>
              <p className="section-desc">{t('wf.desc')}</p>
            </div>

            <div className="wfd-toggles" role="group" aria-label={t('wf2.path', 'Path for this case')}>
              <span className="wfd-toggles-label">{t('wf2.path', 'Path for this case')}</span>
              <button type="button" aria-pressed={capa} onClick={() => setCapa((v) => !v)}>{t('wf2.capa', 'CAPA')}</button>
              <button type="button" aria-pressed={reg} onClick={() => setReg((v) => !v)}>{t('wf2.reg', 'Authority report')}</button>
            </div>

            <article className="wfd-now" key={stage} aria-live="polite">
              <span className="wfd-now-step">{t('wf2.step', 'Step')} {stage + 1} / 5</span>
              <h3>{t(`wf.step${stage + 1}.label`)}</h3>
              <p>{t(`wf.step${stage + 1}.action`)}</p>
              <span className="wfd-now-chip"><b />{t(`wf.step${stage + 1}.detail`)}</span>
            </article>
          </div>

          {/* ── Right: the isometric route + holo case file ──── */}
          <div className="wfd-right">
            <div className="wfd-dial-wrap">
              <div className="wfd-dial">
                <svg className="wfd-rail" viewBox={`0 0 ${VW + SHIFT - 20} ${VH}`} preserveAspectRatio="xMidYMin meet" role="img"
                     aria-label={t('wf2.railAria', 'Incident route: detected, triage, investigation, report, resolved, then back to detected')}>
                  <defs>
                    <pattern id="wfd-iso" width="60" height="30" patternUnits="userSpaceOnUse"><path d="M0 15 L30 0 L60 15 L30 30Z" className="wfd-isogrid" /></pattern>
                    <radialGradient id="wfd-fade" cx="50%" cy="45%" r="62%"><stop offset="0.25" stopColor="#fff" /><stop offset="1" stopColor="#000" /></radialGradient>
                    <mask id="wfd-mask"><rect width={VW + SHIFT} height={VH} fill="url(#wfd-fade)" /></mask>
                    <filter id="wfd-blur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7" /></filter>
                  </defs>
                  <rect width={VW + SHIFT} height={VH} fill="url(#wfd-iso)" mask="url(#wfd-mask)" aria-hidden="true" />

                  {/* the ring closes: step 5 feeds step 1 */}
                  <path className={`wfd-loop${resolved ? ' is-on' : ''}`} d={LOOP} />
                  <text className={`wfd-loop-txt${resolved ? ' is-on' : ''}`} x="470" y="26" textAnchor="middle">{t('wf.step5.detail')}</text>
                  {resolved && (
                    <g className="wfd-loop-dot">
                      <circle r="9" className="wfd-loop-halo" />
                      <polygon points="0,-7 7,0 0,7 -7,0" />
                      <animateMotion dur="2.4s" repeatCount="indefinite" path={LOOP} />
                    </g>
                  )}

                  {/* risk columns appear when the case resolves */}
                  {/* ghost pads: the empty corner is never blank, the bars rise from them */}
                  <g className="wfd-pads" aria-hidden="true">
                    {LAPS.map((v, i) => {
                      const x = 470 + i * 70, y = 650
                      return <polygon key={v} points={`${x},${y - 13} ${x + 26},${y} ${x},${y + 13} ${x - 26},${y}`} />
                    })}
                  </g>
                  <text className={`wfd-pads-t${resolved ? ' hide' : ''}`} x="540" y="484" textAnchor="middle" aria-hidden="true">{t('wf2.riskShort', 'Risk, case after case')}</text>
                  <g className={`wfd-risk3${resolved ? ' on' : ''}`}>
                    <text className="wfd-risk3-t" x="540" y="484" textAnchor="middle">{t('wf2.riskShort', 'Risk, case after case')}</text>
                    {LAPS.map((v, i) => (
                      <g key={v}>
                        <Column x={470 + i * 70} y={650} h={v * 1.5} color={LAP_COLORS[i]} i={i} on={resolved} />
                        <text className="wfd-risk3-n" x={470 + i * 70} y={650 - v * 1.5 - 20} textAnchor="middle" style={{ opacity: resolved ? 1 : 0, transitionDelay: `${0.5 + i * 0.18}s` }}>{v}</text>
                        <text className="wfd-risk3-c" x={470 + i * 70} y={650 + 34} textAnchor="middle">{t('wf2.case', 'Case')} {i + 1}</text>
                      </g>
                    ))}
                  </g>

                  {/* CAPA side platform */}
                  <g className={`wfd-capa${capaOn ? ' on' : ''}${capa ? '' : ' off'}`} style={{ '--na': ACCENTS[2] }}>
                    <line className="wfd-capa-link" x1={CAPA[0]} y1={CAPA[1] + TH_ + TD + 2} x2={ST[2][0]} y2={ST[2][1] - TH_ - 4} />
                    <polygon points={leftSide(CAPA)} className="wfd-side wfd-side-l" />
                    <polygon points={rightSide(CAPA)} className="wfd-side wfd-side-r" />
                    <polygon points={top(CAPA)} className="wfd-top-base" />
                    <polygon points={top(CAPA)} className="wfd-top-tint" />
                    <polygon points={top(CAPA)} className="wfd-top-edge" />
                    <text className="wfd-tile-n" x={CAPA[0]} y={CAPA[1] + 6} textAnchor="middle" style={{ fontSize: 17 }}>CAPA</text>
                    <text className="wfd-node-t" x={CAPA[0] + TW + 12} y={CAPA[1] - 2} style={{ fontSize: 19 }}>{t('wf2.capa', 'CAPA')}</text>
                    <text className="wfd-node-s" x={CAPA[0] + TW + 12} y={CAPA[1] + 15}>{capa ? (stage >= 2 ? t('wf2.capaOn', 'CAPA-118 opened') : t('wf2.capaIf', 'If needed')) : t('wf2.notReq', 'Not required')}</text>
                  </g>

                  {/* route: base, skipped hop dashed, live fill */}
                  <path className="wfd-base" d={ROUTE} />
                  {!reg && SEGS.slice(2).map((d, k) => <path key={k} className="wfd-base wfd-skipseg" d={d} />)}
                  <path ref={routeRef} d={ROUTE} fill="none" stroke="none" />
                  <path ref={fillRef} className="wfd-fill" d={ROUTE} />

                  {/* platforms */}
                  {NODES.map((n, i) => {
                    const c = ST[i]
                    const off = n.opt && !reg
                    return (
                      <g key={n.k} className={tileClass(i)} style={{ '--na': ACCENTS[i] }}>
                        <g className="wfd-lift">
                          <ellipse className="wfd-ground" cx={c[0]} cy={c[1] + TH_ + TD + 6} rx={TW * 0.9} ry={TH_ * 0.8} />
                          <polygon points={leftSide(c)} className="wfd-side wfd-side-l" />
                          <polygon points={rightSide(c)} className="wfd-side wfd-side-r" />
                          <polygon points={top(c)} className="wfd-top-base" />
                          <polygon points={top(c)} className="wfd-top-tint" />
                          <polygon points={top(c)} className="wfd-top-edge" />
                          <polygon points={top(c)} className="wfd-top-glow" filter="url(#wfd-blur)" />
                          <text className="wfd-tile-n" x={c[0]} y={c[1] + 9} textAnchor="middle">{i + 1}</text>
                        </g>
                        <text className="wfd-node-t" x={c[0]} y={c[1] + TH_ + TD + 30} textAnchor="middle">{stepName(i)}</text>
                        <text className="wfd-node-s" x={c[0]} y={c[1] + TH_ + TD + 48} textAnchor="middle">
                          {off ? t('wf2.bypassed', 'Bypassed') : t(n.sk, n.sd)}
                        </text>
                      </g>
                    )
                  })}

                  {/* the case: a luminous cube */}
                  <g ref={cubeRef} className="wfd-cube" aria-hidden="true">
                    <ellipse className="wfd-cube-shadow" cx="0" cy="2" rx="26" ry="11" />
                    <g transform="translate(0 -20)"><g className="wfd-cube-bob">
                      <circle className="wfd-cube-halo" cy="-26" r="40" />
                      <polygon points="0,-62 26,-49 0,-36 -26,-49" className="wfd-cube-t" />
                      <polygon points="-26,-49 0,-36 0,-8 -26,-21" className="wfd-cube-l" />
                      <polygon points="26,-49 0,-36 0,-8 26,-21" className="wfd-cube-r" />
                      <polygon points="0,-62 26,-49 26,-21 0,-8 -26,-21 -26,-49" className="wfd-cube-edge" />
                    </g></g>
                  </g>
                </svg>

                {/* holo case file */}
                <article className={`wfd-holo${resolved ? ' is-resolved' : ''}`} aria-live="polite" style={{ '--d': ACCENT_RGB[stage] }}>
                  <header>
                    <b>INC-0412</b>
                    <span className="wfd-holo-clock"><i className="wfd-clock" ref={clockRef}>T + 0.0s</i></span>
                    <div className={`wfd-stamp${resolved ? ' is-resolved' : ''}`} key={String(resolved)}>
                      {resolved ? t('wf2.resolved', 'RESOLVED') : t('wf2.open', 'OPEN')}
                    </div>
                  </header>
                  <div className="wfd-holo-sub">{t('wf2.product', 'Infusion pump')} · Algiers</div>
                  <dl>
                    {rows.map((r) => (
                      <div className={`wfd-row${stage >= r.at ? ' on' : ''}${r.skip ? ' is-skip' : ''}${r.at === stage ? ' cur' : ''}`} key={r.k}>
                        <dt>{r.k}</dt>
                        <dd>{r.v}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              </div>
            </div>
          </div>

          <div className="wfd-hint" ref={hintRef} aria-hidden="true">
            <span className="wfd-hint-mouse" />{t('wf2.hint', 'Scroll to move the incident')}
          </div>
        </div>
      </div>
    </section>
  )
}
