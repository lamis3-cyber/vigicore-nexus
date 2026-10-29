import React, { useCallback, useEffect, useRef, useState } from 'react'
import useSectionReveal from '../../hooks/useSectionReveal.js'
import { useI18n } from '../../i18n/index.jsx'
import { prefersReducedMotion } from '../../lib/motion.js'

// "The cost of fragmentation" — the life of one report as five isometric
// layers. A client report (VigiCore Site) has to cross triage, investigation,
// CAPA and audit (VigiCore Logiciel). Without a link between the steps the
// thread breaks at every layer and each handoff costs days. The sections
// that follow reconnect them.
//
// Everything in the drawing lives in one SVG coordinate system, so the
// thread, the breaks and the cards line up at any size without measuring.

const LAYERS = [
  { id: 'report',        rgb: '0,184,255' },
  { id: 'triage',        rgb: '0,255,178' },
  { id: 'investigation', rgb: '160,100,255' },
  { id: 'capa',          rgb: '255,180,50' },
  { id: 'audit',         rgb: '255,60,90' },
]
const HANDOFF_DAYS = [3, 9, 14, 20] // lost between two steps: illustrative, they add up to 46

// ---- geometry (SVG user units; the drawing is 480 x 540) ----
const W = 360          // width of a layer
const H = 130          // height of its top face
const T = 13           // thickness
const CX = 240
const Y0 = 58
const D = 98           // vertical distance between two layers
const S = 200          // size of the flat plane the icons are drawn on
const topY = (i) => Y0 + D * i
const NODE = LAYERS.map((_, i) => ({ x: CX - 26 + 13 * i, y: topY(i) + 80 }))      // where the case sits on each layer
const MARK = NODE.slice(0, -1).map((a, k) => ({ x: (a.x + NODE[k + 1].x) / 2, y: (a.y + NODE[k + 1].y) / 2 }))
const COLLAPSE = LAYERS.map((_, i) => (topY(2) - topY(i)) * 0.92)                  // layers start squeezed together
const MATRIX = (i) => `matrix(${W / 2 / S} ${H / 2 / S} ${-W / 2 / S} ${H / 2 / S} ${CX} ${topY(i)})` // flat plane -> isometric

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// what each tool looks like, drawn flat (0..200) and laid on the layer
function Icons({ id }) {
  return (
    <g transform="translate(100 104) scale(1.32) translate(-100 -100)"><Glyph id={id} /></g>
  )
}
function Glyph({ id }) {
  switch (id) {
    case 'report':
      return (
        <g className="wl-ink">
          <g transform="translate(24 38)"><rect width="58" height="38" rx="5" /><polyline points="3,5 29,25 55,5" /></g>
          <g transform="translate(116 100)"><rect width="58" height="38" rx="5" /><polyline points="3,5 29,25 55,5" /></g>
          <circle className="wl-dot" cx="122" cy="40" r="3" /><circle className="wl-dot" cx="150" cy="60" r="2.4" />
          <circle className="wl-dot" cx="36" cy="124" r="2.8" /><circle className="wl-dot" cx="64" cy="150" r="2.4" />
        </g>
      )
    case 'triage':
      return (
        <g className="wl-ink">
          <path d="M44,134 L126,56 L150,146" strokeDasharray="4 4" />
          <rect x="30" y="122" width="28" height="28" rx="8" /><rect x="112" y="42" width="28" height="28" rx="8" />
          <rect x="136" y="132" width="28" height="28" rx="8" /><rect x="76" y="86" width="22" height="22" rx="7" />
        </g>
      )
    case 'investigation':
      return (
        <g className="wl-ink">
          <rect x="30" y="58" width="62" height="82" rx="5" />
          <path d="M42,80 H80 M42,94 H80 M42,108 H66" />
          <rect x="102" y="116" width="88" height="20" rx="3" />
          <path d="M116,116 v8 M130,116 v12 M144,116 v8 M158,116 v12 M172,116 v8" />
        </g>
      )
    case 'capa':
      return (
        <g className="wl-ink">
          {[0, 1, 2].map((k) => (
            <g key={k}>
              <rect x="34" y={62 + k * 34} width="18" height="18" rx="4" className={k < 2 ? 'wl-solid' : ''} />
              <path d={`M64,${71 + k * 34} H${k === 1 ? 124 : 140}`} />
            </g>
          ))}
          <g transform="translate(116 122)"><rect width="16" height="16" rx="4" className="wl-solid" /><path d="M26,8 H66" /></g>
        </g>
      )
    default: // audit
      return (
        <g>
          {[0, 1, 2].map((k) => (
            <path key={k} className="wl-folder" d={`M36,${52 + k * 40} h42 l9,10 h66 v30 h-117 z`} />
          ))}
          <circle cx="116" cy="104" r="22" className="wl-burst" filter="url(#wl-blur)" />
          <circle cx="116" cy="104" r="5" className="wl-burst-core" />
        </g>
      )
  }
}

function Layer({ l, i, open, active, dim, onEnter, onLeave }) {
  const y = topY(i)
  const top = `${CX},${y}`
  const right = `${CX + W / 2},${y + H / 2}`
  const bottom = `${CX},${y + H}`
  const left = `${CX - W / 2},${y + H / 2}`
  const inset = 0.9
  const iy = H / 2
  const inner = [
    `${CX},${y + iy * (1 - inset)}`, `${CX + (W / 2) * inset},${y + iy}`,
    `${CX},${y + iy * (1 + inset)}`, `${CX - (W / 2) * inset},${y + iy}`,
  ].join(' ')
  return (
    <g
      className={`wl-layer${active ? ' is-active' : ''}${dim ? ' is-dim' : ''}`}
      style={{ '--c': l.rgb, transform: `translateY(${open ? 0 : COLLAPSE[i]}px)`, transitionDelay: `${(4 - i) * 55}ms` }}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      <polygon className="wl-side" points={`${left} ${bottom} ${CX},${y + H + T} ${CX - W / 2},${y + H / 2 + T}`} />
      <polygon className="wl-side wl-side--r" points={`${bottom} ${right} ${CX + W / 2},${y + H / 2 + T} ${CX},${y + H + T}`} />
      <polygon className="wl-base" points={`${top} ${right} ${bottom} ${left}`} />
      <polygon className="wl-tint" points={`${top} ${right} ${bottom} ${left}`} />
      <polygon className="wl-inner" points={inner} />
      <g transform={MATRIX(i)}><Icons id={l.id} /></g>
      <polygon className="wl-edge" points={`${top} ${right} ${bottom} ${left}`} />
      <polyline className="wl-edge wl-edge--low" points={`${left} ${CX - W / 2},${y + H / 2 + T} ${CX},${y + H + T} ${CX + W / 2},${y + H / 2 + T} ${right}`} />
    </g>
  )
}

export default function WhySection() {
  const { t } = useI18n()
  const sectionRef = useSectionReveal()
  const stageRef = useRef(null)
  const packetRef = useRef(null)
  const runId = useRef(0)
  const started = useRef(false)

  const [open, setOpen] = useState(() => prefersReducedMotion())
  const [breaks, setBreaks] = useState(() => (prefersReducedMotion() ? LAYERS.length - 1 : 0))
  const [active, setActive] = useState(null)

  // One pass of the story: the report leaves a layer, travels a little and
  // dies in the gap. The next layer never receives it, and the days pile up.
  const run = useCallback(async () => {
    const id = ++runId.current
    const ok = () => runId.current === id
    setBreaks(0)
    await sleep(250)
    const pk = packetRef.current
    if (!pk) return
    const tr = (p) => `translate(${p.x}px, ${p.y}px)`
    for (let k = 0; k < LAYERS.length - 1; k++) {
      if (!ok()) return
      const fly = pk.animate(
        [{ transform: tr(NODE[k]), opacity: 1 }, { transform: tr(MARK[k]), opacity: 1 }],
        { duration: 640, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' },
      )
      await fly.finished.catch(() => {})
      if (!ok()) return
      const die = pk.animate(
        [{ transform: tr(MARK[k]), opacity: 1 }, { transform: tr(MARK[k]), opacity: 0.2 },
         { transform: tr(MARK[k]), opacity: 0.9 }, { transform: tr(MARK[k]), opacity: 0 }],
        { duration: 320, fill: 'forwards' },
      )
      await die.finished.catch(() => {})
      if (!ok()) return
      setBreaks(k + 1)
      await sleep(300)
    }
  }, [])

  // The layers part when the drawing is on screen, then the story plays once.
  useEffect(() => {
    const el = stageRef.current
    if (!el || prefersReducedMotion()) return undefined
    const timers = []
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || started.current) return
      started.current = true
      io.disconnect()
      setOpen(true)
      timers.push(setTimeout(run, 1400))
    }, { threshold: 0.4 })
    io.observe(el)
    return () => { io.disconnect(); timers.forEach(clearTimeout); runId.current++ }
  }, [run])

  const unit = t('wl.d')
  const done = breaks >= LAYERS.length - 1
  const near = (k) => active !== null && (active === k || active === k + 1)
  const enter = (i) => (e) => { if (!e.pointerType || e.pointerType !== 'touch') setActive(i) }

  return (
    <section ref={sectionRef} className="wim-section wl-section" id="zoom-section" aria-label="Why a fragmented vigilance process matters">

    <div className="wim-scanline wim-scanline--top" aria-hidden="true"></div>

    <div className="wim-inner">

      {/* static wrapper: the reveal hook adds its class to this node, so React must never rewrite its className */}
      <div className="wl-reveal reveal-fade">
      <div className="wl-grid">

        <div className="wl-copy">
          <span className="wl-eyebrow">{t('wim.eyebrow')}</span>
          <h2 className="wl-title" dangerouslySetInnerHTML={{ __html: t('wl.title') }}></h2>
          <p className="wl-desc">{t('wl.desc')}</p>

          <div className="wl-audit">
            <span className="wl-audit-mark" aria-hidden="true">?</span>
            <div className="wl-audit-body">
              <span className="wl-audit-kicker">{t('wl.audit.kicker')}</span>
              <strong className="wl-audit-title">{t('wl.audit.title')}</strong>
              <p className="wl-audit-desc">{t('wl.audit.desc')}</p>
            </div>
            <div className="wl-steps" aria-hidden="true">
              {LAYERS.map((l, i) => <span key={l.id} style={{ '--c': l.rgb }}>{t(`wl.tag${i + 1}`)}</span>)}
            </div>
          </div>
        </div>

        <div className={`wl-stage${open ? ' is-open' : ''}`} ref={stageRef}>

          <div className="wl-art">
            <svg className="wl-svg" viewBox="0 0 480 620" role="img" aria-label={t('wl.aria')}>
              <defs>
                <filter id="wl-blur" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5" /></filter>
              </defs>

              {/* layers, bottom one first so every upper layer covers the one below */}
              {[...LAYERS].map((l, i) => i).reverse().map((i) => (
                <Layer
                  key={LAYERS[i].id}
                  l={LAYERS[i]}
                  i={i}
                  open={open}
                  active={active === i}
                  dim={active !== null && active !== i}
                  onEnter={enter(i)}
                  onLeave={() => setActive(null)}
                />
              ))}

              {/* dotted lines from each layer to its card */}
              <g className="wl-conns" aria-hidden="true">
                {LAYERS.map((l, i) => {
                  const y = topY(i) + H / 2
                  return (
                    <g key={l.id} className={`wl-conn${active === i ? ' is-active' : ''}`} style={{ '--c': l.rgb }}>
                      <line x1={CX + W / 2 + 12} y1={y} x2="478" y2={y} />
                      <circle cx={CX + W / 2 + 7} cy={y} r="3.2" />
                    </g>
                  )
                })}
              </g>

              {/* the case, the broken thread and what each handoff costs */}
              <g className="wl-over" aria-hidden="true">
                {NODE.map((n, i) => (
                  <g key={`n-${i}`} className={`wl-node${i === 0 ? ' is-first' : ''}`} style={{ '--c': LAYERS[i].rgb }} transform={`translate(${n.x} ${n.y})`}>
                    <ellipse className="wl-ring" rx="16" ry="7" />
                    <ellipse className="wl-core" rx="6" ry="2.7" />
                  </g>
                ))}
                {MARK.map((m, k) => {
                  const a = NODE[k]
                  const b = NODE[k + 1]
                  const on = breaks > k
                  const label = t('wl.handoff')
                  // the number is isolated so it reads the same way in Arabic
                  const days = `\u2066+${HANDOFF_DAYS[k]}\u2069 ${unit}`
                  const dw = 12 + (days.length - 2) * 7.2
                  const w = dw + 14 + label.length * 7 + 6
                  return (
                    <g key={`g-${k}`} className={`wl-gap${on ? ' is-on' : ''}${near(k) ? ' is-near' : ''}`}>
                      <line className="wl-trail" x1={a.x} y1={a.y + 3} x2={m.x} y2={m.y - 7} />
                      <line className="wl-ghost" x1={m.x} y1={m.y + 7} x2={b.x} y2={b.y - 4} />
                      <path className="wl-x" d={`M${m.x - 6},${m.y - 6} l12,12 M${m.x + 6},${m.y - 6} l-12,12`} />
                      <g className="wl-chip" transform={`translate(${m.x + 14} ${m.y - 10})`}>
                        <rect width={w} height="20" rx="10" />
                        <text className="wl-chip-d" x="9" y="14.5">{days}</text>
                        <text className="wl-chip-l" x={dw + 6} y="13.5">{label}</text>
                      </g>
                    </g>
                  )
                })}
                {done && (
                  <g className="wl-lost" transform={`translate(${NODE[4].x + 40} ${NODE[4].y - 4})`}>
                    <circle r="14" /><text y="6" textAnchor="middle">?</text>
                  </g>
                )}
                <g ref={packetRef} className="wl-packet" style={{ opacity: 0 }}>
                  <circle r="11" className="wl-packet-halo" />
                  <circle r="5" className="wl-packet-core" />
                </g>
              </g>
            </svg>

            <ol className="wl-cards">
              {LAYERS.map((l, i) => (
                <li
                  key={l.id}
                  className={`wl-card${active === i ? ' is-active' : ''}${active !== null && active !== i ? ' is-dim' : ''}`}
                  style={{ '--c': l.rgb, '--y': `${(((topY(i) + H / 2) / 620) * 100).toFixed(3)}%` }}
                  tabIndex={0}
                  onPointerEnter={enter(i)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                >
                  <span className="wl-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                  <span className="wl-card-text">
                    <strong className="wl-card-name">{t(`wl.l${i + 1}.name`)}</strong>
                    <span className="wl-card-desc">{t(`wl.l${i + 1}.desc`)}</span>
                  </span>
                  <em className="wl-pill">{t('wl.pill')}</em>
                </li>
              ))}
            </ol>
          </div>

          <div className="wl-under">
            <div className="wl-tl" aria-hidden="true">
              <div className="wl-tl-head"><span>{t('wl.tl.start')}</span><b>{t('wl.tl.title')}</b><span>{t('wl.tl.end')}</span></div>
              <div className="wl-tl-bar">
                {HANDOFF_DAYS.map((d, k) => (
                  <i key={k} className={breaks > k ? 'is-on' : ''} style={{ flex: d, '--c': LAYERS[k + 1].rgb }} />
                ))}
              </div>
            </div>
            <div className="wl-caption">
              <span>{t('wl.caption')}</span>
              <button type="button" className="wl-replay" onClick={run}>
                <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.8-4.07M13.5 2.5v3h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                {t('wl.replay')}
              </button>
            </div>
          </div>
        </div>

      </div>
      </div>

      <p className="wim-disclaimer reveal-fade">{t('wl.source')}</p>
      <div className="wim-anchor reveal-fade">
        <div className="wim-anchor-line"></div>
        <p className="wim-anchor-text">{t('wl.anchor')}</p>
        <div className="wim-anchor-line"></div>
      </div>

      <div className="ticker-tape" aria-hidden="true">
        <div className="ticker-tape-track">
          {[1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8].map((n, i) => (
            <React.Fragment key={i}>
              <span>{t(`ticker.t${n}`)}</span><span className="ticker-sep">·</span>
            </React.Fragment>
          ))}
        </div>
      </div>

    </div>

    <div className="wim-scanline wim-scanline--bottom" aria-hidden="true"></div>

  </section>
  )
}
