import React from 'react'
import useSectionReveal from '../../hooks/useSectionReveal.js'
import { useI18n } from '../../i18n/index.jsx'

export default function CtaSection() {
  const { t } = useI18n()
  const sectionRef = useSectionReveal()
  return (
    <section ref={sectionRef} className="scroll-section cta-section" id="cta">
    <canvas className="cta-canvas" id="cta-canvas"></canvas>
    <div className="cta-portal" aria-hidden="true">
      <div className="cta-portal-ring"></div>
      <div className="cta-portal-ring"></div>
      <div className="cta-portal-ring"></div>
    </div>
    <div className="section-content reveal-stagger">
      <div className="cta-glow-orb"></div>
      <div className="section-eyebrow reveal-fade" style={{'color':'var(--cyan)'}}>Zero Blind Spots</div>
      <h2 className="cta-title reveal-fade" dangerouslySetInnerHTML={{ __html: t('cta.title') }}></h2>
      <p className="section-desc reveal-fade" style={{'maxWidth':'520px','margin':'0 auto 16px'}}>{t('cta.desc')}</p>
      <div className="cta-trust-line reveal-fade">
        <span className="cta-trust-item">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><polyline points="2,7 5,10 12,3" stroke="#00ffb2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <span>{t('cta.trust1')}</span>
        </span>
        <span className="cta-trust-item">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><polyline points="2,7 5,10 12,3" stroke="#00ffb2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <span>{t('cta.trust2')}</span>
        </span>
        <span className="cta-trust-item">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><polyline points="2,7 5,10 12,3" stroke="#00ffb2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <span>{t('cta.trust3')}</span>
        </span>
      </div>
      <div className="cta-buttons reveal-fade">
        <a href="/login" className="btn-primary cta-btn">{t('nav.platformAccess')}</a>
        <a href="#zoom-section" className="btn-secondary cta-btn-sec"><span>{t('cta.how')}</span>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <polyline points="3,7 11,7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            <polyline points="7,3 11,7 7,11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      </div>
    </div>
  </section>
  )
}
