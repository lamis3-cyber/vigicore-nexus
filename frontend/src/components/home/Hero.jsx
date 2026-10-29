import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ReactoIcon, MaterioIcon, PharmacoIcon, ChemoIcon, CosmetoIcon } from './vigilanceIcons.jsx'
import { useI18n } from '../../i18n/index.jsx'
import { prefersReducedMotion } from '../../lib/motion.js'

const MODULE_RGB = {
  top: '255,60,90',
  tl: '50,180,255',
  tr: '60,200,160',
  bl: '180,80,255',
  br: '220,140,60',
}

// Visual left-to-right order of the tabs, used for numbering and keyboard
// navigation.
const TAB_ORDER = ['top', 'tl', 'tr', 'bl', 'br']

// Pentagon positions (in % of the square .vigi-orbit box), clockwise from the
// top. Shared by the tabs (CSS vars) and the connector lines (SVG) so they
// can never drift apart.
const ORBIT_POS = {
  top: { x: 50, y: 9 },
  tl:  { x: 87, y: 35 },   // lower than before: a clear gap under the top card (it was ~5%) so the cards never crowd each other
  tr:  { x: 75, y: 87 },   // wider gap between the two bottom cards
  bl:  { x: 25, y: 87 },
  br:  { x: 13, y: 35 },
}

// Connector lines start at the card's edge (not its centre), so the glass
// cards never show a dashed line through their text.
const CARD_HW = 21.5
const CARD_HH = 7
const edgePt = (id) => {
  const { x, y } = ORBIT_POS[id]
  const dx = 50 - x
  const dy = 50 - y
  const t = Math.min(CARD_HW / (Math.abs(dx) || 1e-6), CARD_HH / (Math.abs(dy) || 1e-6))
  return { x: x + dx * t, y: y + dy * t }
}

// Direction of each card as seen from the shield (degrees, 0 = right,
// clockwise). The radar sweep rotates to this angle for the active module.
const MODULE_ANGLE = Object.fromEntries(
  TAB_ORDER.map((id) => [id, (Math.atan2(ORBIT_POS[id].y - 50, ORBIT_POS[id].x - 50) * 180) / Math.PI]),
)

// How far the radar beam reaches for each module, as a % of the sweep disc's
// radius: it stops at the card's edge instead of running under the card.
const SWEEP_LEN = Object.fromEntries(
  TAB_ORDER.map((id) => {
    const e = edgePt(id)
    return [id, Math.round((Math.hypot(e.x - 50, e.y - 50) / 42) * 100)]
  }),
)

// Illustrative live-signal counts (same figures as the "centralizes everything" section).
const MODULE_SIGNALS = { top: 11, tl: 16, tr: 31, bl: 8, br: 22 }

const AUTO_ROTATE_MS = 3600

// One-line domain hint shown under each module name on its card.
const MODULE_SUB = {
  top: 'Reagents & IVD',
  tl:  'Medical devices',
  tr:  'Medicines',
  bl:  'Chemicals',
  br:  'Cosmetics',
}

// Intro sequence: the shield appears alone, then the modules join it one by
// one (Matériovigilance first, Réactovigilance — the newest — last).
const REVEAL_ORDER = ['tl', 'tr', 'bl', 'br', 'top']
// Whole intro lasts ~2s (was ~7s): the visitor never stares at a half-empty orbit.
const REVEAL_FIRST_MS = 450
const REVEAL_STEP_MS = 420


const MODULE_DATA = {
  top: {
    label: 'R\u00e9actovigilance',
    moduleNum: '01',
    category: 'IVD products',
    desc: 'In vitro diagnostic reagent and lab equipment surveillance \u2014 flags defective reagents and result drift before they reach patients.',
    tags: ['Reagent Defects', 'DMDIV Compliance'],
  },
  tl: {
    label: 'Mat\u00e9riovigilance',
    moduleNum: '02',
    category: 'Medical',
    desc: 'Medical device incident tracking with full serial-to-patient traceability.',
    tags: ['Device Tracking', 'ANPP Homologation'],
  },
  tr: {
    label: 'Pharmacovigilance',
    moduleNum: '03',
    category: 'Pharmaceuticals',
    desc: 'AI-powered adverse drug reaction monitoring across the supply chain.',
    tags: ['ADR Reporting', 'Signal Detection'],
  },
  bl: {
    label: 'Ch\u00e9movigilance',
    moduleNum: '04',
    category: 'Chemical',
    desc: 'Chemical & hazardous substance surveillance protecting staff and patients.',
    tags: ['Exposure Tracking', 'Ministry of Commerce Compliance'],
  },
  br: {
    label: 'Cosm\u00e9tovigilance',
    moduleNum: '05',
    category: 'Cosmetic',
    desc: 'Post-market cosmetic surveillance \u2014 adverse events and compliance flagging.',
    tags: ['Adverse Events', 'Ministry of Commerce Authorization'],
  },
}

// Accessible name of each tab (kept separate from MODULE_DATA.desc: it is a
// shorter sentence read out by screen readers).
const TAB_ARIA = {
  top: 'Réactovigilance — In vitro diagnostic reagent and lab equipment surveillance',
  tl:  'Matériovigilance — Medical device incident tracking',
  tr:  'Pharmacovigilance — AI-powered adverse drug reaction monitoring',
  bl:  'Chémovigilance — Chemical and hazardous substance surveillance',
  br:  'Cosmétovigilance — Post-market cosmetic surveillance',
}

const TAB_ICON = {
  top: ReactoIcon,
  tl:  MaterioIcon,
  tr:  PharmacoIcon,
  bl:  ChemoIcon,
  br:  CosmetoIcon,
}

// One orbit tab. The five tabs used to be five copy-pasted <button> blocks
// with their SVG inlined; now they are rendered from the data above.
function VigilanceTab({ id, active, shown, buttonRef, onClick, onKeyDown }) {
  const Icon = TAB_ICON[id]
  return (
    <button
      type="button"
      ref={buttonRef}
      className={`vigi-tab${active ? ' active' : ''}${shown ? '' : ' is-hidden'}`}
      id={`tab-${id}`}
      role="tab"
      aria-selected={active}
      aria-label={TAB_ARIA[id]}
      style={{ '--tab-rgb': MODULE_RGB[id], '--ox': ORBIT_POS[id].x + '%', '--oy': ORBIT_POS[id].y + '%' }}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <span className="vigi-tab-icon">
        <Icon />
      </span>
      <span className="vigi-tab-text">
        <span className="vigi-tab-label">{MODULE_DATA[id].label}</span>
        <span className="vigi-tab-sub">{MODULE_SUB[id]}</span>
      </span>
      <span className="vigi-tab-num" aria-hidden="true"><i />{MODULE_SIGNALS[id]}</span>
    </button>
  )
}

export default function Hero() {
  const { t } = useI18n()
  // No tab selected by default: the visitor sees the "click a tab above"
  // placeholder first, so clicking a tab reads as a deliberate reveal
  // rather than content that was already there.
  const [activeModule, setActiveModule] = useState(null)
  // The orbit previews the modules on its own until the visitor takes
  // control (click / keyboard); hovering the orbit only pauses it.
  const [autoRotate, setAutoRotate] = useState(true)
  const [paused, setPaused] = useState(false)
  // How many modules are visible around the shield (0 = shield alone).
  const [revealed, setRevealed] = useState(() => (prefersReducedMotion() ? TAB_ORDER.length : 0))
  const allRevealed = revealed >= TAB_ORDER.length
  const isShown = (id) => REVEAL_ORDER.indexOf(id) < revealed

  const tabRefs = useRef({})

  // Radar sweep: cumulative angle (never wraps back, so it always turns
  // clockwise) that follows whichever module is active.
  const [sweepDeg, setSweepDeg] = useState(-90)
  // Sweep colour follows the active module (animated in CSS via @property).
  const sweepRgb = (MODULE_RGB[activeModule] || '0,232,255').split(',').map(Number)
  useEffect(() => {
    if (!activeModule) return
    setSweepDeg((prev) => {
      const delta = ((((MODULE_ANGLE[activeModule] - prev) % 360) + 360) % 360)
      return prev + delta
    })
  }, [activeModule])

  // Phase 1 — reveal the modules one at a time.
  useEffect(() => {
    if (allRevealed || paused) return undefined
    const t = setTimeout(() => {
      setActiveModule(REVEAL_ORDER[revealed])
      setRevealed(revealed + 1)
    }, revealed === 0 ? REVEAL_FIRST_MS : REVEAL_STEP_MS)
    return () => clearTimeout(t)
  }, [revealed, allRevealed, paused])

  // Phase 2 — once everything is visible, keep previewing the modules.
  useEffect(() => {
    if (!allRevealed || !autoRotate || paused || prefersReducedMotion()) return undefined
    const t = setInterval(() => {
      setActiveModule((prev) => TAB_ORDER[(TAB_ORDER.indexOf(prev) + 1) % TAB_ORDER.length])
    }, AUTO_ROTATE_MS)
    return () => clearInterval(t)
  }, [allRevealed, autoRotate, paused])

  const handleTabClick = (id) => {
    setAutoRotate(false)
    setRevealed(TAB_ORDER.length)
    setActiveModule((prev) => (prev === id ? null : id))
  }

  // Arrow-key navigation between tabs (WAI-ARIA tabs pattern, automatic
  // activation): Left/Right (and Up/Down) move focus and select; Home/End
  // jump to the first/last tab.
  const handleTabKeyDown = useCallback((e, id) => {
    const idx = TAB_ORDER.indexOf(id)
    let nextIdx = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIdx = (idx + 1) % TAB_ORDER.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIdx = (idx - 1 + TAB_ORDER.length) % TAB_ORDER.length
    } else if (e.key === 'Home') {
      nextIdx = 0
    } else if (e.key === 'End') {
      nextIdx = TAB_ORDER.length - 1
    } else {
      return
    }
    e.preventDefault()
    const nextId = TAB_ORDER[nextIdx]
    setAutoRotate(false)
    setRevealed(TAB_ORDER.length)
    setActiveModule(nextId)
    tabRefs.current[nextId]?.focus()
  }, [])

  return (
    <>
    <section className="hero" id="hero" aria-label="VigiCore NEXUS hero — five vigilance modules">

    <div className="hero-intro">
      <div className="hero-eyebrow">Healthcare Intelligence Platform</div>
      <h1 className="hero-title-xl" dangerouslySetInnerHTML={{ __html: t('hero.title') }}></h1>
      <p className="hero-desc">{t('hero.desc')}</p>
      <div className="hero-cta-row">
        <Link to="/login" className="hero-cta hero-cta--primary">{t('nav.platformAccess')}</Link>
        <Link to="/services" className="hero-cta hero-cta--ghost" >{t('hero.browse')} <span aria-hidden="true">→</span></Link>
      </div>

      <div className="vigi-detail-slot">
        {activeModule ? (
          <div className="vigi-detail-card" key={activeModule} style={{ '--tab-rgb': MODULE_RGB[activeModule] }}>
            <div className="vigi-detail-head">
              <div className="vigi-detail-title">{MODULE_DATA[activeModule].label}</div>
              <span className="vigi-detail-pill"><i />{MODULE_SIGNALS[activeModule]} signals today</span>
            </div>
            <p className="vigi-detail-desc">{MODULE_DATA[activeModule].desc}</p>
            <Link
              className="vigi-detail-link"
              to={`/services?category=${encodeURIComponent(MODULE_DATA[activeModule].category)}`}
            >
              Explore {MODULE_DATA[activeModule].label} <span aria-hidden="true">→</span>
            </Link>
          </div>
        ) : (
          <div className="vigi-detail-placeholder">
            <span className="vigi-detail-placeholder-arrow" aria-hidden="true">→</span>
            Select a vigilance module to explore it
          </div>
        )}
      </div>

    </div>

    <div
      className={`vigi-orbit${allRevealed && autoRotate && !paused ? ' is-cycling' : ''}`}
      style={{ '--cycle-ms': `${AUTO_ROTATE_MS}ms` }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
    <div className="vigi-orbit-ring" aria-hidden="true"></div>
    <div className="vigi-orbit-ring vigi-orbit-ring--inner" aria-hidden="true"></div>
    <div
      className={`vigi-radar${activeModule ? ' is-on' : ''}`}
      aria-hidden="true"
      style={{
        '--sl': SWEEP_LEN[activeModule] ?? 60,
        '--sr': sweepRgb[0],
        '--sg': sweepRgb[1],
        '--sb': sweepRgb[2],
        transform: `rotate(${sweepDeg + 90}deg)`,
      }}
    ></div>
    <svg className="vigi-orbit-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {TAB_ORDER.map((id) => (
        <line
          key={id}
          className={`vigi-orbit-line${activeModule === id ? ' active' : ''}${isShown(id) ? '' : ' is-hidden'}`}
          x1="50" y1="50" x2={edgePt(id).x} y2={edgePt(id).y}
          style={{ '--tab-rgb': MODULE_RGB[id] }}
        />
      ))}
    </svg>

    <div className="vigi-tabbar" role="tablist" aria-label="Vigilance modules">

      {TAB_ORDER.map((id) => (
        <VigilanceTab
          key={id}
          id={id}
          active={activeModule === id}
          shown={isShown(id)}
          buttonRef={(el) => (tabRefs.current[id] = el)}
          onClick={() => handleTabClick(id)}
          onKeyDown={(e) => handleTabKeyDown(e, id)}
        />
      ))}

    </div>

    <div className="vigi-stage" id="system">

      <div
        className={`shield-wrap${activeModule ? ' any-active info-active' : ''}`}
        id="shield-wrap"
        style={activeModule ? { '--shield-rgb': MODULE_RGB[activeModule] } : undefined}
      >
        <svg className="shield-svg" viewBox="0 0 210 245" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="sg1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#001a2e"/>
              <stop offset="100%" stopColor="#000d1a"/>
            </linearGradient>
            <linearGradient id="sg-edge" x1="0" y1="0" x2="1" y2="1">
              {/* Bound to --shield-rgb so the shield's own edge — not just its
                  glow — shifts to match the active vigilance module. */}
              <stop offset="0%" style={{ stopColor: 'rgb(var(--shield-rgb, 0,229,255))', stopOpacity: 0.9, transition: 'stop-color 0.4s ease' }}/>
              <stop offset="50%" style={{ stopColor: 'rgb(var(--shield-rgb, 0,255,200))', stopOpacity: 0.6, transition: 'stop-color 0.4s ease' }}/>
              <stop offset="100%" style={{ stopColor: 'rgb(var(--shield-rgb, 10,122,255))', stopOpacity: 0.8, transition: 'stop-color 0.4s ease' }}/>
            </linearGradient>
            <filter id="shield-glow">
              <feGaussianBlur stdDeviation="3" result="b"/>
              <feComposite in="SourceGraphic" in2="b" operator="over"/>
            </filter>
            <clipPath id="shield-clip">
              <path d="M105,8 L195,42 L195,118 Q195,182 105,232 Q15,182 15,118 L15,42 Z"/>
            </clipPath>
          </defs>
          <path d="M105,4 L200,40 L200,120 Q200,188 105,238 Q10,188 10,120 L10,40 Z" fill="none" stroke="rgba(0,229,255,0.12)" strokeWidth="4"/>
          <path d="M105,8 L196,43 L196,119 Q196,183 105,233 Q14,183 14,119 L14,43 Z" fill="none" stroke="url(#sg-edge)" strokeWidth="1.8" filter="url(#shield-glow)"/>
          <path d="M105,18 L186,50 L186,120 Q186,176 105,222 Q24,176 24,120 L24,50 Z" fill="none" stroke="rgba(0,229,255,0.22)" strokeWidth="1.2"/>
          <path d="M105,30 L174,58 L174,120 Q174,168 105,210 Q36,168 36,120 L36,58 Z" fill="none" stroke="rgba(0,229,255,0.14)" strokeWidth="1"/>
          <path d="M105,8 L195,42 L195,118 Q195,182 105,232 Q15,182 15,118 L15,42 Z" fill="url(#sg1)" opacity="0.95"/>
          <line x1="105" y1="30" x2="105" y2="210" stroke="rgba(0,229,255,0.07)" strokeWidth="1"/>
          <line x1="40" y1="80" x2="170" y2="80" stroke="rgba(0,229,255,0.07)" strokeWidth="1"/>
          <line x1="30" y1="120" x2="180" y2="120" stroke="rgba(0,229,255,0.05)" strokeWidth="1"/>
          <path d="M50,55 L50,70 M50,55 L62,55" stroke="rgba(0,229,255,0.35)" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M160,55 L160,70 M160,55 L148,55" stroke="rgba(0,229,255,0.35)" strokeWidth="1.5" strokeLinecap="round"/>
          <g clipPath="url(#shield-clip)" opacity="0.06">
            <path d="M58,78 L70,72 L82,78 L82,90 L70,96 L58,90 Z" fill="none" stroke="#00e5ff" strokeWidth="0.8"/>
            <path d="M82,78 L94,72 L106,78 L106,90 L94,96 L82,90 Z" fill="none" stroke="#00e5ff" strokeWidth="0.8"/>
            <path d="M106,78 L118,72 L130,78 L130,90 L118,96 L106,90 Z" fill="none" stroke="#00e5ff" strokeWidth="0.8"/>
            <path d="M130,78 L142,72 L154,78 L154,90 L142,96 L130,90 Z" fill="none" stroke="#00e5ff" strokeWidth="0.8"/>
            <path d="M70,96 L82,90 L94,96 L94,108 L82,114 L70,108 Z" fill="none" stroke="#00e5ff" strokeWidth="0.8"/>
            <path d="M94,96 L106,90 L118,96 L118,108 L106,114 L94,108 Z" fill="none" stroke="#00e5ff" strokeWidth="0.8"/>
            <path d="M118,96 L130,90 L142,96 L142,108 L130,114 L118,108 Z" fill="none" stroke="#00e5ff" strokeWidth="0.8"/>
          </g>
        </svg>

        <div className="shield-inner-text">
          <div className="shield-name">VigiCore</div>
          <div className="shield-sub">N E X U S</div>
        </div>

        <canvas id="ecg-canvas"></canvas>

        <div id="shield-ripple-a" className="shield-ripple"></div>
        <div id="shield-ripple-b" className="shield-ripple"></div>
        <div id="shield-flash"></div>
        <div id="shield-ring"></div>
      </div>

    </div>
    </div>

    <a className="scroll-hint hero-scroll-cue" href="#zoom-section" aria-label="Scroll to next section">
      <span>{t('hero.explore')}</span>
      <div className="scroll-arrow">
        <svg width="18" height="24" viewBox="0 0 18 24" fill="none">
          <line x1="9" y1="0" x2="9" y2="15" stroke="rgba(0,200,230,0.55)" strokeWidth="1.5" strokeLinecap="round"/>
          <polyline points="3,11 9,19 15,11" fill="none" stroke="rgba(0,200,230,0.55)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </a>

  </section>

  </>
  )
}
