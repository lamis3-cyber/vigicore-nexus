import React from 'react'
import { Link } from 'react-router-dom'
import Logo from './Logo.jsx'
import { useI18n } from '../../i18n/index.jsx'
import { tr } from '../../i18n/translate.js';

export default function Footer() {
  const { t } = useI18n()
  return (
    <footer className="site-footer" id="contact">
    <div className="footer-inner">

      
      <div className="footer-brand">
        <Logo idPrefix="footer" />
        <canvas id="ecg-canvas-footer" style={{'display':'none'}}></canvas>
        <p className="footer-tagline">{t('footer.tagline')}</p>
      </div>

      
      <div className="footer-cols">
        <div className="footer-col">
          <h4>{t('footer.platform')}</h4>
          <a href="#features">{tr("Matériovigilance")}</a>
          <a href="#features">{tr("Pharmacovigilance")}</a>
          <a href="#features">{tr("Chémovigilance")}</a>
          <a href="#features">{tr("Cosmétovigilance")}</a>
          <a href="#features">{tr("Réactovigilance")}</a>
        </div>
        <div className="footer-col">
          <h4>{t('footer.company')}</h4>
          <Link to="/about">{t('footer.about')}</Link>
          <a href="#features">{t('nav.solution')}</a>
          <Link to="/login">{t('nav.platformAccess')}</Link>
          <a href="#">{t('footer.docs')}</a>
          <Link to="/privacy">{t('footer.privacy')}</Link>
          <Link to="/terms">{tr("Conditions d’utilisation")}</Link>
          <Link to="/legal">{tr("Mentions légales")}</Link>
        </div>
        <div className="footer-col">
          <h4>{t('footer.contact')}</h4>
          <a href="mailto:contact@vigicore.health">{tr("contact@vigicore.health")}</a>
          <a href="#">{t('footer.support')}</a>
          <a href="#">{t('footer.security')}</a>
          <a href="#">{t('footer.careers')}</a>
        </div>
        <div className="footer-col footer-col--newsletter">
          <h4>{t('footer.stayUpdated')}</h4>
          <p className="footer-newsletter-desc">{t('footer.newsletterDesc')}</p>
          <div className="footer-newsletter">
            <input type="email" placeholder={t('footer.emailPlaceholder')} className="footer-newsletter-input"/>
            <button className="footer-newsletter-btn" aria-label={tr("Subscribe")}>
              <svg viewBox="0 0 16 16" fill="none">
                <polyline points="3,8 13,8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <polyline points="9,4 13,8 9,12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          
          <div className="footer-social">
            <a href="#" className="footer-social-link" aria-label={tr("LinkedIn")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2.5" y="9" width="4" height="12"/>
                <circle cx="4.5" cy="4.5" r="2"/>
                <path d="M10.5 21v-8M10.5 13a3.5 3.5 0 0 1 7 0v8M10.5 9v.01"/>
              </svg>
            </a>
            <a href="#" className="footer-social-link" aria-label={tr("Twitter / X")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4 4l16 16M4 20L20 4"/>
              </svg>
            </a>
            <a href="#" className="footer-social-link" aria-label={tr("Instagram")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="5"/>
                <circle cx="12" cy="12" r="4.2"/>
                <circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none"/>
              </svg>
            </a>
            <a href="#" className="footer-social-link" aria-label={tr("Email")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <polyline points="2,6 12,13 22,6"/>
              </svg>
            </a>
          </div>
        </div>
      </div>

    </div>

    <div className="footer-bottom">
      <span>{t('footer.rights')}</span>
      <a href="#" className="footer-bottom-legal">{t('footer.privacyShort')}</a>
      <div className="footer-bottom-badges">
        <span className="footer-bottom-badge">{tr("ANPP")}</span>
        <span className="footer-bottom-badge">{tr("ISO 13485")}</span>
        <span className="footer-bottom-badge">{tr("CNPM")}</span>
      </div>
      <span>{t('footer.powered')}</span>
    </div>
  </footer>
  )
}
