import React, { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import PageBackdrop from '../components/layout/PageBackdrop.jsx'
import Footer from '../components/layout/Footer.jsx'
import ShieldMark from '../components/layout/ShieldMark.jsx'
import useSectionReveal from '../hooks/useSectionReveal.js'
import usePageEffects from '../hooks/usePageEffects.js'
import { prefersReducedMotion } from '../lib/motion.js'
import { tr } from '../i18n/translate.js';
import { useI18n } from '../i18n/index.jsx'

// Depth (in px, at the shield's natural render size) used to fake real
// edge thickness on the About-page shield via stacked outline layers —
// see about-shield-extrude below.
const SHIELD_DEPTH = 12
const SHIELD_EDGE_LAYER_COUNT = 16
const SHIELD_EDGE_LAYERS = Array.from({ length: SHIELD_EDGE_LAYER_COUNT }, (_, i) =>
  -SHIELD_DEPTH / 2 + (SHIELD_DEPTH * i) / (SHIELD_EDGE_LAYER_COUNT - 1)
)

export default function AboutPage() {
  const { t } = useI18n()
  const heroRef = useRef(null)
  const stageRef = useRef(null)
  const reducedMotionRef = useRef(false)

  // Each of these sections manages its own reveal locally (see
  // useSectionReveal.js) instead of depending on the global
  // public/script.js observer, which only scans the DOM once, the moment
  // it first loads. On an SPA route change (e.g. Home -> About) that
  // script is already loaded and never re-scans, so these sections'
  // .reveal-fade elements would otherwise stay stuck at opacity:0 forever.
  const missionRef = useSectionReveal()
  const valuesRef = useSectionReveal()
  const ecosystemRef = useSectionReveal()
  const ctaRef = useSectionReveal()

  usePageEffects()

  // Self-contained reveal for the hero text, independent of the global
  // public/script.js observer (see MissionSection.jsx / SolutionSection.jsx
  // for why: that global script assumes homepage-only elements exist and
  // this page shouldn't depend on it to become visible). Also fades the
  // WebGL stage in once it's actually in view.
  useEffect(() => {
    reducedMotionRef.current =
      prefersReducedMotion()

    const hero = heroRef.current
    const stage = stageRef.current
    const targets = hero ? hero.querySelectorAll('.reveal-fade') : []

    if (reducedMotionRef.current) {
      targets.forEach((t) => t.classList.add('in-view'))
      stage && stage.classList.add('in-view')
      return
    }

    let textObs, stageObs
    if (targets.length) {
      textObs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return
            targets.forEach((t, i) => setTimeout(() => t.classList.add('in-view'), 90 * i))
            textObs.disconnect()
          })
        },
        { threshold: 0.12 }
      )
      textObs.observe(hero)
    }
    if (stage) {
      stageObs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              stage.classList.add('in-view')
              stageObs.disconnect()
            }
          })
        },
        { threshold: 0.1, rootMargin: '200px 0px' }
      )
      stageObs.observe(stage)
    }
    return () => {
      textObs && textObs.disconnect()
      stageObs && stageObs.disconnect()
    }
  }, [])

  return (
    <>
      <PageBackdrop />

      <Navbar />
      <main className="about-page">
        <section className="scroll-section about-hero" ref={heroRef}>
          <div className="about-hero-grid">
            <div className="about-hero-text">
              <div className="section-eyebrow reveal-fade">{tr("Why VigiCore Exists")}</div>
              <h1 className="section-title about-hero-title reveal-fade">
                {tr("Healthcare doesn't fail because people don't care.")}
              </h1>
              <p className="section-desc reveal-fade about-hero-desc">
                {tr("It fails because critical information arrives too late, stays disconnected across systems, or never reaches the person who needs to act on it. VigiCore Nexus was built to change that.")}
              </p>
            </div>

            <div className="about-hero-visual" ref={stageRef} aria-hidden="true">
              <div className="about-shield-stage">
                <div className="about-shield-spin">
                  {/* Stacked outline-only copies along the Z axis fake real
                      edge thickness, so the shield reads as a solid 3D
                      object (not a flat card) once it starts turning. */}
                  <div className="about-shield-extrude">
                    {SHIELD_EDGE_LAYERS.map((z, i) => (
                      <div key={i} className="about-shield-edge-layer" style={{ transform: `translateZ(${z}px)` }}>
                        <svg viewBox="0 0 210 245" xmlns="http://www.w3.org/2000/svg">
                          <path d="M105,8 L196,43 L196,119 Q196,183 105,233 Q14,183 14,119 L14,43 Z" fill="none" stroke="#00cfe8" strokeWidth="1.8" />
                        </svg>
                      </div>
                    ))}
                  </div>

                  <div className="about-shield-face about-shield-face--front" style={{ transform: `translateZ(${SHIELD_DEPTH / 2}px)` }}>
                    <ShieldMark idPrefix="about-hero-front" className="nav-logo-mark about-shield-svg" showCenterText={false} />
                    <div className="about-shield-inner-text">
                      <span className="about-shield-name">{tr("VigiCore")}</span>
                      <span className="about-shield-sub">NEXUS</span>
                    </div>
                  </div>

                  <div className="about-shield-face about-shield-face--back" style={{ transform: `translateZ(${-SHIELD_DEPTH / 2}px) rotateY(180deg)` }}>
                    <ShieldMark idPrefix="about-hero-back" className="nav-logo-mark about-shield-svg" showCenterText={false} />
                    <div className="about-shield-inner-text">
                      <span className="about-shield-name">{tr("VigiCore")}</span>
                      <span className="about-shield-sub">NEXUS</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="scroll-section about-mission" ref={missionRef}>
          <div className="section-content">
            <div className="about-mission-grid">
              <div className="about-mission-text reveal-fade">
                <h2 className="wim-title">{tr("One connected vigilance layer")}</h2>
                <p>
                  {tr("Modern healthcare generates thousands of safety signals every day — a medical device fault, a drug reaction, a chemical exposure, a cosmetic adverse event. Yet these signals often stay trapped inside separate systems that never talk to each other, delaying investigation and leaving regulators like the ANPP and CNPM to reconstruct the picture after the fact.")}
                </p>
                <p>
                  {tr("VigiCore Nexus connects every actor — patients, physicians, pharmacists, hospitals, laboratories and manufacturers — through one intelligent, AI-assisted core that turns isolated reports into coordinated action, in real time.")}
                </p>
              </div>
              <div className="about-mission-stats">
                <div className="about-stat reveal-fade" style={{ transitionDelay: '0.05s' }}>
                  <span className="about-stat-num">5</span>
                  <span className="about-stat-label">{tr("Vigilance domains, unified")}</span>
                </div>
                <div className="about-stat reveal-fade" style={{ transitionDelay: '0.15s' }}>
                  <span className="about-stat-num">&lt;2s</span>
                  <span className="about-stat-label">{tr("Real-time processing")}</span>
                </div>
                <div className="about-stat reveal-fade" style={{ transitionDelay: '0.25s' }}>
                  <span className="about-stat-num">100%</span>
                  <span className="about-stat-label">{tr("Incident traceability")}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="scroll-section about-values" ref={valuesRef}>
          <div className="about-values-atmosphere" aria-hidden="true"></div>
          <div className="section-content">
            <h2 className="section-title reveal-fade">{tr("What drives VigiCore")}</h2>
            <div className="about-values-grid">
              <div className="about-value-card reveal-fade" style={{ transitionDelay: '0.05s', '--v-color': '0,232,255' }}>
                <span className="about-value-index">01</span>
                <div className="about-value-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3z" />
                  </svg>
                </div>
                <h3>{tr("Patient safety first")}</h3>
                <p>{tr("Every decision starts with the same question: does this make care safer, faster?")}</p>
                <span className="about-value-edge" aria-hidden="true"></span>
              </div>
              <div className="about-value-card reveal-fade" style={{ transitionDelay: '0.15s', '--v-color': '0,255,200' }}>
                <span className="about-value-index">02</span>
                <div className="about-value-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 3" />
                  </svg>
                </div>
                <h3>{tr("Speed that matters")}</h3>
                <p>{tr("Seconds separate a caught pattern from a missed one. We design for real time.")}</p>
                <span className="about-value-edge" aria-hidden="true"></span>
              </div>
              <div className="about-value-card reveal-fade" style={{ transitionDelay: '0.25s', '--v-color': '180,80,255' }}>
                <span className="about-value-index">03</span>
                <div className="about-value-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="4" width="16" height="16" rx="3" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                </div>
                <h3>{tr("Compliance by design")}</h3>
                <p>{tr("Aligned with ANPP, CNPM and ISO 13485 from day one, not bolted on after.")}</p>
                <span className="about-value-edge" aria-hidden="true"></span>
              </div>
              <div className="about-value-card reveal-fade" style={{ transitionDelay: '0.35s', '--v-color': '220,140,60' }}>
                <span className="about-value-index">04</span>
                <div className="about-value-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12h4l2-6 4 12 2-6h4" />
                  </svg>
                </div>
                <h3>{tr("Transparency")}</h3>
                <p>{tr("Every stakeholder sees the same shared record — zero blind spots, by design.")}</p>
                <span className="about-value-edge" aria-hidden="true"></span>
              </div>
            </div>
          </div>
        </section>

        <section className="scroll-section about-ecosystem" ref={ecosystemRef}>
          <div className="about-ecosystem-atmosphere" aria-hidden="true"></div>
          <div className="section-content reveal-fade" style={{ textAlign: 'center', maxWidth: '760px' }}>
            <h2 className="section-title">{tr("One platform. Every stakeholder.")}</h2>
            <p className="section-desc" style={{ margin: '0 auto 24px' }}>
              {tr("VigiCore Nexus doesn't replace the organizations already working on patient safety — it connects them. Healthcare and Enterprise keep their own responsibilities; every incident shares the same intelligent coordination layer, under one regulatory view.")}
            </p>
            <Link to="/#network-section" className="nav-cta-demo about-cta-btn">{tr("Explore the Connected Ecosystem ↓")}</Link>
          </div>
        </section>

        <section className="scroll-section about-cta" ref={ctaRef}>
          <div className="about-cta-atmosphere" aria-hidden="true"></div>
          <div className="section-content reveal-fade">
            <h2 className="section-title">{tr("Ready to get started?")}</h2>
            <p className="section-desc">{tr("Log in to your account to access your vigilance workflow.")}</p>
            <Link to="/login" className="nav-cta-demo about-cta-btn">{t('nav.platformAccess')}</Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
