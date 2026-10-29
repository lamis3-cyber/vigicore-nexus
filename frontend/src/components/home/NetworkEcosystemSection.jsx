import React, { useEffect, useRef, Suspense, lazy } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import CorridorRoleIcon from './corridor-icons.jsx'
import { useI18n } from '../../i18n/index.jsx'
import './NetworkEcosystemSection.css'
import { prefersReducedMotion } from '../../lib/motion.js'

// three.js + @react-three/fiber only load once someone actually
// scrolls near this section.
const CorridorScene = lazy(() => import('../../three/CorridorScene.jsx'))

gsap.registerPlugin(ScrollTrigger)

/* ══════════════════════════════════════════════════════════
   THE SEAM — "Where healthcare meets enterprise."
   ──────────────────────────────────────────────────────────
   Full concept reset. This is not a hub with orbiting nodes,
   not a diagram of circles and connector lines, not a pair of
   icon cards either side of a mascot. The metaphor is
   architectural: a cross-section through a single building.
   A regulatory lintel spans the top. A patient-safety
   foundation anchors the bottom. In between, two glass volumes
   — Healthcare Portal, Enterprise Platform — meet at a single
   vertical seam of light, the one place in the whole structure
   where the two sides are actually joined. Every role is set
   as a line in an engraved manifest, not a badge in a grid;
   each manifest row wipes open toward the seam as it reveals,
   as though the seam itself is what's admitting it into view.
   The seam's glow (rendered in WebGL) breathes brighter through
   the middle of the section as it scrolls through the viewport
   — the one moment of motion this design spends its budget on.
   ════════════════════════════════════════════════════════════ */

const PORTAL_TOP = [
  { key: 'r1', icon: 'patient' },
  { key: 'r2', icon: 'physician' },
  { key: 'r3', icon: 'pharmacist' },
]
const PORTAL_BOTTOM = [
  { key: 'r4', icon: 'hospital' },
  { key: 'r5', icon: 'clinic' },
  { key: 'r6', icon: 'lab' },
]

const ENTERPRISE_TOP = [
  { key: 'r1', icon: 'manufacturer' },
  { key: 'r2', icon: 'vigilance' },
  { key: 'r3', icon: 'quality' },
]
const ENTERPRISE_BOTTOM = [
  { key: 'r4', icon: 'labmanager' },
  { key: 'r5', icon: 'executive' },
]

const PORTAL_LABELS = {
  r1: 'Patient', r2: 'Physician', r3: 'Pharmacist',
  r4: 'Hospital', r5: 'Clinic', r6: 'Analysis Lab',
}
const ENTERPRISE_LABELS = {
  r1: 'Manufacturer', r2: 'Vigilance Team', r3: 'Quality Team',
  r4: 'Lab Manager', r5: 'Executive',
}

export default function NetworkEcosystemSection() {
  const { t } = useI18n()
  const sectionRef = useRef(null)
  const stageRef = useRef(null)
  const progressRef = useRef(0)
  const reducedMotionRef = useRef(false)
  const [isLight, setIsLight] = React.useState(false)
  // Gates the WebGL canvas itself (not just its fade-in), so the ~220KB
  // gzipped three.js/@react-three chunk is only fetched once the section
  // is actually close to the viewport — never on initial page load.
  const [isNearView, setIsNearView] = React.useState(false)

  // The corridor's WebGL glow was tuned for a dark page. Track the
  // live theme so we can hand CorridorScene a palette that actually
  // reads against a light background instead of washing out white.
  useEffect(() => {
    const root = document.documentElement
    const sync = () => setIsLight(root.getAttribute('data-theme') === 'light')
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    reducedMotionRef.current =
      prefersReducedMotion()

    // Fade the WebGL atmosphere in once the stage is close to view —
    // keeps the canvas from mounting/rendering off-screen for nothing.
    const stage = stageRef.current
    let io
    if (stage) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              stage.classList.add('in-view')
              setIsNearView(true)
              io.disconnect()
            }
          })
        },
        { threshold: 0.1, rootMargin: '200px 0px' }
      )
      io.observe(stage)
    }

    if (reducedMotionRef.current) {
      gsap.set(
        ['.threshold-lintel', '.wing-head', '.threshold-core',
         '.manifest-row', '.threshold-foundation', '.threshold-seam'],
        { opacity: 1, x: 0, y: 0, scale: 1, skewX: 0, clipPath: 'inset(0 0 0 0)' }
      )
      return () => io && io.disconnect()
    }

    // SCROLL FIX: on this site <body> is the element that scrolls (html/body are both
    // height:100% with overflow-x:hidden), so window.scrollY stays 0 forever. GSAP's
    // ScrollTrigger watches the window by default, which meant NONE of the triggers
    // below ever fired: the lintel, both wings, the core and the foundation stayed at
    // opacity 0 and only the title + the beam were visible. Point ScrollTrigger at the
    // element that really scrolls.
    const realScroller =
      document.body.scrollHeight > document.body.clientHeight + 1 ? document.body : window
    ScrollTrigger.defaults({ scroller: realScroller })
    // ScrollTrigger only listens to window 'scroll' (+ wheel). A scroll of <body> never
    // reaches the window, so dragging the scrollbar, keyboard scrolling and the navbar's
    // smooth jumps would not fire anything. Forward body scrolls to it explicitly.
    const forwardScroll = () => ScrollTrigger.update()
    if (realScroller !== window) realScroller.addEventListener('scroll', forwardScroll, { passive: true })
    // other scripts (fitScreen.js) rescale sections after load: re-measure afterwards
    const refreshTimers = [600, 1400, 3000].map((ms) => setTimeout(() => ScrollTrigger.refresh(), ms))

    const ctx = gsap.context(() => {
      // Drives the seam's WebGL glow — a plain ref, not React state,
      // so scrolling never triggers a re-render.
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: 'top bottom',
        end: 'bottom top',
        onUpdate: (self) => { progressRef.current = self.progress },
      })

      // The seam itself grows down from the lintel as the section
      // scrolls into view — the one continuous, scrubbed motion.
      gsap.fromTo(
        '.threshold-seam-line',
        { scaleY: 0 },
        {
          scaleY: 1, ease: 'none',
          scrollTrigger: { trigger: stageRef.current, start: 'top 75%', end: 'bottom 60%', scrub: 0.6 },
        }
      )

      gsap.fromTo(
        '.threshold-lintel',
        { opacity: 0, y: -20 },
        {
          opacity: 1, y: 0, duration: 0.9, ease: 'power3.out',
          scrollTrigger: { trigger: '.threshold-lintel', start: 'top 88%' },
        }
      )
      gsap.fromTo(
        '.threshold-lintel-bar',
        { scaleX: 0 },
        {
          scaleX: 1, duration: 1.1, ease: 'power2.inOut',
          scrollTrigger: { trigger: '.threshold-lintel', start: 'top 85%' },
        }
      )

      // Portal side wipes open from its seam-side edge, rows follow.
      gsap.fromTo(
        '.wing-head--portal',
        { opacity: 0, x: -34, clipPath: 'inset(0 100% 0 0)' },
        {
          opacity: 1, x: 0, clipPath: 'inset(0 0% 0 0)', duration: 0.85, ease: 'power3.out',
          scrollTrigger: { trigger: '.wing-head--portal', start: 'top 78%' },
        }
      )
      gsap.fromTo(
        '.wing-manifest--portal .manifest-row',
        { opacity: 0, x: -22, skewX: -4 },
        {
          opacity: 1, x: 0, skewX: 0, duration: 0.6, ease: 'power2.out', stagger: 0.08,
          scrollTrigger: { trigger: '.wing-head--portal', start: 'top 72%' },
        }
      )

      // Enterprise side mirrors it from the right.
      gsap.fromTo(
        '.wing-head--enterprise',
        { opacity: 0, x: 34, clipPath: 'inset(0 0 0 100%)' },
        {
          opacity: 1, x: 0, clipPath: 'inset(0 0 0 0%)', duration: 0.85, ease: 'power3.out',
          scrollTrigger: { trigger: '.wing-head--enterprise', start: 'top 78%' },
        }
      )
      gsap.fromTo(
        '.wing-manifest--enterprise .manifest-row',
        { opacity: 0, x: 22, skewX: 4 },
        {
          opacity: 1, x: 0, skewX: 0, duration: 0.6, ease: 'power2.out', stagger: 0.08,
          scrollTrigger: { trigger: '.wing-head--enterprise', start: 'top 72%' },
        }
      )

      // The keystone plaque settles into the seam once both wings
      // have started opening.
      gsap.fromTo(
        '.threshold-core',
        { opacity: 0, scale: 0.82 },
        {
          opacity: 1, scale: 1, duration: 0.8, ease: 'back.out(1.7)',
          scrollTrigger: { trigger: '.threshold-core', start: 'top 76%' },
        }
      )
      gsap.fromTo(
        '.threshold-core-mark',
        { rotate: -50, opacity: 0 },
        {
          rotate: 45, opacity: 1, duration: 0.7, ease: 'power2.out',
          scrollTrigger: { trigger: '.threshold-core', start: 'top 76%' },
        }
      )

      // Foundation rises like a floor catching the seam's light.
      gsap.fromTo(
        '.threshold-foundation-inner',
        { opacity: 0, y: 24 },
        {
          opacity: 1, y: 0, duration: 0.9, ease: 'power3.out',
          scrollTrigger: { trigger: '.threshold-foundation', start: 'top 90%' },
        }
      )
      gsap.fromTo(
        '.threshold-foundation-glow',
        { scaleY: 0, opacity: 0 },
        {
          scaleY: 1, opacity: 1, duration: 1.1, ease: 'power2.out',
          scrollTrigger: { trigger: '.threshold-foundation', start: 'top 92%' },
        }
      )
    }, sectionRef)

    return () => {
      io && io.disconnect()
      refreshTimers.forEach(clearTimeout)
      if (realScroller !== window) realScroller.removeEventListener('scroll', forwardScroll)
      ctx.revert()
    }
  }, [])

  return (
    <section className="scroll-section threshold-section" id="network-section" ref={sectionRef}>
      <div className="section-content">
        <div className="section-eyebrow reveal-fade">{t('net.eyebrow')}</div>
        <h2 className="section-title reveal-fade">{t('net.title')}</h2>
        <p className="section-desc reveal-fade">{t('net.desc')}</p>
      </div>

      <div className="threshold-stage" ref={stageRef}>
        <div className="threshold-atmosphere" aria-hidden="true">
          {isNearView && (
            <Suspense fallback={null}>
              <CorridorScene progressRef={progressRef} reducedMotion={reducedMotionRef.current} isLight={isLight} />
            </Suspense>
          )}
        </div>
        {/* CSS-only atmosphere layer, always present regardless of the
            WebGL canvas. The corridor scene's soft additive-blend glow
            was tuned for a dark page and reads as almost nothing against
            a light background — this guarantees the section still feels
            like a lit space (cyan haze / amber haze either side of the
            seam) in light mode too. */}
        <div className="threshold-atmosphere-css" aria-hidden="true"></div>

        {/* Beat 01 — Regulatory lintel, spanning the full width */}
        <div className="threshold-beat threshold-lintel">
          <span className="threshold-lintel-bar" aria-hidden="true"></span>
          <div className="threshold-lintel-content">
            <span className="threshold-index">01 · REGULATORY LAYER</span>
            <span className="threshold-lintel-label">{t('net.authority')}</span>
            <span className="threshold-lintel-sub">{t('net.authority.sub')}</span>
          </div>
        </div>

        <div className="threshold-grid">
          <span className="threshold-seam" aria-hidden="true">
            <span className="threshold-seam-line"></span>
            <span className="threshold-seam-pulse"></span>
          </span>

          {/* Beat 02 — Healthcare Portal head */}
          <div className="threshold-beat wing-head wing-head--portal">
            <span className="wing-index">02</span>
            <h3 className="wing-name">{t('net.portal.title')}</h3>
            <p className="wing-sub">{t('net.portal.sub')}</p>
          </div>
          {/* Beat 04 — Enterprise Platform head */}
          <div className="threshold-beat wing-head wing-head--enterprise">
            <span className="wing-index">04</span>
            <h3 className="wing-name">{t('net.enterprise.title')}</h3>
            <p className="wing-sub">{t('net.enterprise.sub')}</p>
          </div>

          <ul className="threshold-beat wing-manifest wing-manifest--portal wing-manifest--top">
            {PORTAL_TOP.map((role) => (
              <li className="manifest-row" key={role.key}>
                <span className="manifest-icon"><CorridorRoleIcon id={role.icon} /></span>
                <span className="manifest-label">{t(`net.portal.${role.key}`, PORTAL_LABELS[role.key])}</span>
              </li>
            ))}
          </ul>
          <ul className="threshold-beat wing-manifest wing-manifest--enterprise wing-manifest--top">
            {ENTERPRISE_TOP.map((role) => (
              <li className="manifest-row" key={role.key}>
                <span className="manifest-icon"><CorridorRoleIcon id={role.icon} /></span>
                <span className="manifest-label">{t(`net.enterprise.${role.key}`, ENTERPRISE_LABELS[role.key])}</span>
              </li>
            ))}
          </ul>

          {/* Beat 03 — the keystone, in its own row, clear of every role line */}
          <div className="threshold-beat threshold-core">
            <i className="core-corner core-corner--tl" aria-hidden="true"></i>
            <i className="core-corner core-corner--tr" aria-hidden="true"></i>
            <i className="core-corner core-corner--bl" aria-hidden="true"></i>
            <i className="core-corner core-corner--br" aria-hidden="true"></i>
            <i className="core-port core-port--l" aria-hidden="true"></i>
            <i className="core-port core-port--r" aria-hidden="true"></i>
            <div className="core-emblem" aria-hidden="true">
              <i className="core-ring core-ring--a"></i>
              <i className="core-ring core-ring--b"></i>
              <i className="core-sweep"></i>
              <span className="threshold-core-mark"></span>
            </div>
            <div className="threshold-core-title">{t('net.hub.title')}</div>
            <div className="threshold-core-sub">{t('net.hub.sub')}</div>
            <div className="core-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
          </div>

          <ul className="threshold-beat wing-manifest wing-manifest--portal wing-manifest--bottom">
            {PORTAL_BOTTOM.map((role) => (
              <li className="manifest-row" key={role.key}>
                <span className="manifest-icon"><CorridorRoleIcon id={role.icon} /></span>
                <span className="manifest-label">{t(`net.portal.${role.key}`, PORTAL_LABELS[role.key])}</span>
              </li>
            ))}
          </ul>
          <ul className="threshold-beat wing-manifest wing-manifest--enterprise wing-manifest--bottom">
            {ENTERPRISE_BOTTOM.map((role) => (
              <li className="manifest-row" key={role.key}>
                <span className="manifest-icon"><CorridorRoleIcon id={role.icon} /></span>
                <span className="manifest-label">{t(`net.enterprise.${role.key}`, ENTERPRISE_LABELS[role.key])}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Beat 05 — Patient Safety foundation, the whole width */}
        <div className="threshold-beat threshold-foundation">
          <span className="threshold-foundation-glow" aria-hidden="true"></span>
          <div className="threshold-foundation-inner">
            <span className="threshold-foundation-icon"><CorridorRoleIcon id="outcome" /></span>
            <span className="threshold-foundation-label">{t('net.outcome')}</span>
            <span className="threshold-foundation-sub">{t('net.outcome.sub')}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
