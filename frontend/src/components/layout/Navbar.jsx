import React, { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Logo from './Logo.jsx'
import ThemeIcons from './ThemeIcons.jsx'
import { getSession } from '../../lib/auth.js'
import { useI18n } from '../../i18n/index.jsx'
import { LangDropdown, LangMobileButtons } from './LangSwitcher.jsx'
import useTheme, { useThemeHint } from '../../hooks/useTheme.js'
import useNavDrawer from '../../hooks/useNavDrawer.js'
import useScrollSpy from '../../hooks/useScrollSpy.js'
import { tr } from '../../i18n/translate.js';

export default function Navbar() {
  const { t } = useI18n()
  // A signed-in Establishment Admin who lands on a public page (e.g. via
  // "View public page") must have a way back to their account: the "Log in"
  // button becomes "My dashboard". Hidden until the session check finishes,
  // so a signed-in user never sees "Log in" flash by.
  const [acct, setAcct] = useState({ checked: false, admin: false, home: '/dashboard/services' })

  // "scrolled" drives the navbar look: transparent at the very top (so the hero
  // glow runs under it, no hard edge), solid once the page has moved. The app
  // scrolls inside <body>, so window.scrollY stays 0; listen in the capture phase to catch both cases.
  const [scrolled, setScrolled] = useState(false)
  // Auto-hide: slides away while scrolling down, comes back on any scroll up
  // (and always at the very top). Never hides while the mobile drawer is open.
  const [hidden, setHidden] = useState(false)
  // On the home page and /services the navbar is also hidden at the top of the page (desktop only, see
  // CSS): it appears when the mouse reaches the top edge or a link is focused.
  const { pathname } = useLocation()
  const [atTop, setAtTop] = useState(true)
  const lastY = React.useRef(0)
  useEffect(() => {
    const read = () => {
      const se = document.scrollingElement
      return Math.max(window.scrollY || 0, document.body.scrollTop || 0, se ? se.scrollTop : 0)
    }
    const on = () => {
      const y = read()
      setScrolled(y > 24)
      setAtTop(y < 80)
      const dy = y - lastY.current
      if (y < 80 || dy < -6) setHidden(false)
      else if (dy > 6) setHidden(true)
      if (Math.abs(dy) > 6) lastY.current = y
    }
    on()
    document.addEventListener('scroll', on, { passive: true, capture: true })
    return () => document.removeEventListener('scroll', on, { capture: true })
  }, [])
  useEffect(() => {
    let off = false
    getSession().then((r) => { if (!off) {
      const role = r.ok ? r.data.user?.role : null
      // Manufacturer -> its services page; healthcare org admin and distributor (FOURNISSEUR) -> the role dashboards.
      setAcct({ checked: true, admin: role === 'ESTABLISHMENT_ADMIN' || role === 'ORG_ADMIN' || role === 'FOURNISSEUR', home: role === 'ORG_ADMIN' || role === 'FOURNISSEUR' ? '/dashboard/' : '/dashboard/services' })
    } })
    return () => { off = true }
  }, [])

  // Theme, hamburger drawer and active-link highlighting live in hooks
  // (src/hooks/): they used to be wired by public/script.js to whichever
  // <Navbar> existed when it first loaded, so later mounts were dead.
  const { toggle: toggleTheme } = useTheme()
  const { hint: themeHint, dismiss: dismissThemeHint } = useThemeHint()
  const drawer = useNavDrawer()
  // tell the CSS whether the navbar is currently hidden (the Services category rail follows it)
  // On /services (desktop) the navbar is also tucked away at the top of the page, like the
  // home hero, so the rail must follow it there too.
  const hiddenAtTop = pathname === '/services' && atTop && typeof window !== 'undefined'
    && window.matchMedia('(min-width: 901px)').matches
  useEffect(() => {
    document.documentElement.classList.toggle('nav-is-hidden', (hidden || hiddenAtTop) && !drawer.open)
    return () => document.documentElement.classList.remove('nav-is-hidden')
  }, [hidden, hiddenAtTop, drawer.open])
  useScrollSpy()

  return (
    <>
      <div className={`nav-peek`} aria-hidden="true"><span className="nav-peek-hint"></span></div>
      <nav className={`navbar${(pathname === '/' || pathname === '/services') && atTop ? ' nav-over-hero' : ''}${scrolled ? ' scrolled' : ''}${hidden && !drawer.open ? ' nav-hidden' : ''}`} role="navigation" aria-label={tr("Main navigation")}>
    
    <div className="nav-logo" role="img" aria-label={tr("VigiCore NEXUS logo")}>
      <Logo idPrefix="main-nav" />
    </div>

    
    <ul className="nav-links">
      <li><Link to="/#hero">{t('nav.home')}</Link></li>
      <li><Link to="/about">{t('nav.about')}</Link></li>
      <li><Link to="/services">{t('nav.services')}</Link></li>
      <li><Link to="/#zoom-section">{t('nav.problemSolution')}</Link></li>
      <li><Link to="/#platform-section">{t('nav.platform')}</Link></li>
      <li><Link to="/#contact-form">{t('nav.contact')}</Link></li>
    </ul>

    
    <div className="nav-right">
      {acct.admin
        ? <a href={acct.home} className="nav-cta">{tr("My dashboard")}</a>
        : <Link to="/login" className="nav-cta" style={acct.checked ? undefined : { visibility: 'hidden' }}>{t('nav.login')}</Link>}
      
      <button className={`theme-toggle${themeHint ? ' first-visit-hint' : ''}`} id="theme-toggle" aria-label={tr("Toggle dim mode")} title={tr("Toggle Dim Mode")} onClick={() => { dismissThemeHint(); toggleTheme() }}>
      <ThemeIcons />
    </button>

      
      <LangDropdown />
    </div>

    
    <button className="nav-hamburger" id="nav-hamburger" ref={drawer.buttonRef} aria-label={drawer.open ? tr("Close navigation menu") : tr("Open navigation menu")} aria-expanded={drawer.open} aria-controls="nav-mobile-drawer" onClick={drawer.toggle}>
      <span></span><span></span><span></span>
    </button>
  </nav>
      <nav className={`nav-mobile-drawer${drawer.open ? ' open' : ''}`} id="nav-mobile-drawer" ref={drawer.drawerRef} aria-label={tr("Mobile navigation")}>
    <Link to="/#hero" className="mobile-nav-link">{t('nav.home')}</Link>
    <Link to="/about" className="mobile-nav-link">{t('nav.about')}</Link>
    <Link to="/services" className="mobile-nav-link">{t('nav.services')}</Link>
    <Link to="/#zoom-section" className="mobile-nav-link">{t('nav.problemSolution')}</Link>
    <Link to="/#platform-section" className="mobile-nav-link">{t('nav.platform')}</Link>
    <Link to="/#contact-form" className="mobile-nav-link">{t('nav.contact')}</Link>
    {acct.admin
      ? <a href={acct.home} className="mobile-nav-link" style={{'color':'var(--cyan)'}}>{tr("My dashboard")}</a>
      : <Link to="/login" className="mobile-nav-link" style={{'color':'var(--cyan)'}}>{t('nav.login')}</Link>}
    <div className="mobile-theme-row">
      <span className="mobile-theme-label">{t('ui.language')}</span>
      <LangMobileButtons />
    </div>
    <div className="mobile-theme-row">
      <span className="mobile-theme-label">{t('ui.dimMode')}</span>
      <button className="theme-toggle theme-toggle--mobile" id="theme-toggle-mobile" aria-label={tr("Toggle dim mode")} onClick={toggleTheme}>
        <ThemeIcons />
      </button>
    </div>
  </nav>
    </>
  )
}
