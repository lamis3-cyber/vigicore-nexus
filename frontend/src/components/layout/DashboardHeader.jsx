import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Logo from './Logo.jsx'
import { logout } from '../../lib/auth.js'
import './dashboard-header.css'
import { tr } from '../../i18n/translate.js';

// Header for pages a user reaches AFTER logging in. Same layout language as
// the VigiCore Logiciel dashboard: brand left, search in the middle, and on
// the right the icon actions (theme, log out) plus the user's avatar.
// The public Navbar (Home / About / Services…) is marketing navigation and
// does not belong here, and neither do links that lead out of the account
// (a visitor page has no way back to it).
//
// Props
//   user     from GET /api/auth/session:
//            { displayName, email, role, activeEstablishmentName } | null
//   preview  backend unreachable (local preview mode, no real session)
//   loading  session check in flight — show no account area yet, so a
//            signed-in user never sees a "Log in" button flash by
//   search   { value, onChange, placeholder } — omit to hide the search box.
//            Only pass it when the page has something to search.

const ROLE_LABELS = { ESTABLISHMENT_ADMIN: 'Manufacturer', ORG_ADMIN: 'Organization Admin', FOURNISSEUR: 'Distributor' }

const roleLabel = (role) =>
  ROLE_LABELS[role] ??
  String(role ?? '')
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

const initials = (name) =>
  String(name ?? '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('') || '?'

const Icon = ({ children }) => (
  <svg className="dash-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)
const IconSearch = () => <Icon><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Icon>
const IconLogOut = () => <Icon><path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></Icon>
// Same glyphs as the public navbar's toggle: moon in dark mode, sun in light mode.
const IconMoon = () => <Icon><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></Icon>
const IconSun = () => (
  <Icon>
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </Icon>
)

export default function DashboardHeader({ user, preview = false, loading = false, search, section }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // Read from the same source the pages use to apply the theme. Reading the
  // <html> attribute here would be wrong on first render: the page applies it in
  // an effect that runs AFTER this component has already rendered.
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('vg-theme') === 'light' ? 'light' : 'dark' } catch { return 'dark' }
  })
  const wrapRef = useRef(null)
  const btnRef = useRef(null)
  const searchRef = useRef(null)
  const [scrolled, setScrolled] = useState(false)

  // Stronger shadow once the page scrolls under the bar.
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on(); window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  // Press "/" anywhere to jump to the search box.
  useEffect(() => {
    if (!search) return
    const onKey = (e) => {
      if (e.key !== '/' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? '') || document.querySelector('.ps')) return
      e.preventDefault(); searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [search])

  // Close the account card on outside click / Escape (Escape returns focus to the avatar).
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('vg-theme', next)
    setTheme(next)
  }

  async function signOut() {
    setBusy(true)
    await logout() // cookie is cleared server-side; even if the call fails we leave the dashboard
    window.location.href = '/login'
  }

  const org = user?.activeEstablishmentName

  return (
    <header className={`dash-nav${scrolled ? ' is-scrolled' : ''}`} role="banner">
      <Link to="/dashboard/services" className="dash-nav-brand" aria-label="VigiCore NEXUS dashboard">
        <span className="nav-logo"><Logo idPrefix="dash-nav" /></span>
      </Link>
      {section && <span className="dash-crumb" aria-current="page"><i aria-hidden="true">/</i><b>{section}</b></span>}

      <div className="dash-search-slot">
        {search && (
          <label className="dash-search">
            <IconSearch />
            <input
              ref={searchRef}
              type="search"
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder}
              aria-label={search.placeholder}
            />
            {search.value
              ? <button type="button" className="dash-clear" aria-label={tr("Clear search")} onClick={() => search.onChange('')}>✕</button>
              : <kbd aria-hidden="true">/</kbd>}
          </label>
        )}
      </div>

      <div className="dash-nav-right">
        {!loading && user && org && <span className="dash-org" title={[tr("Active organization"), org].join(" : ")}><i aria-hidden="true" /><span className="dash-org-name">{org}</span></span>}
        <button
          className="theme-toggle"
          aria-label={theme === 'light' ? tr("Switch to dark mode") : tr("Switch to light mode")}
          title={tr("Toggle Dim Mode")}
          onClick={toggleTheme}
        >
          {theme === 'light' ? <IconSun /> : <IconMoon />}
        </button>

        {loading ? null : user ? (
          <>
            <button className="theme-toggle dash-logout" aria-label={tr("Log out")} title={tr("Log out")} onClick={signOut} disabled={busy}>
              <IconLogOut />
            </button>
            <div className="dash-user" ref={wrapRef}>
              <button
                ref={btnRef}
                className="dash-avatar"
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={tr("Account: {0}", [user.displayName])}
                title={[user.displayName, org].filter(Boolean).join(' · ')}
                onClick={() => setOpen((v) => !v)}
              >
                {initials(user.displayName)}
              </button>
              {open && (
                <div className="dash-card" role="dialog" aria-label={tr("Account")}>
                  <div className="dash-card-id">
                    <span className="dash-avatar dash-avatar--lg" aria-hidden="true">{initials(user.displayName)}</span>
                    <span>
                      <strong>{user.displayName}</strong>
                      {user.email && <small>{user.email}</small>}
                    </span>
                  </div>
                  <dl className="dash-card-meta">
                    <div><dt>{tr("Role")}</dt><dd>{roleLabel(user.role)}</dd></div>
                    {org && <div><dt>{tr("Organization")}</dt><dd>{org}</dd></div>}
                  </dl>
                  <button className="dash-card-out" onClick={signOut} disabled={busy}><IconLogOut />{busy ? tr("Signing out…") : tr("Log out")}</button>
                </div>
              )}
            </div>
          </>
        ) : preview ? (
          <span className="dash-chip">{tr("Preview mode")}</span>
        ) : (
          <Link to="/login" className="dash-login">{tr("Log in")}</Link>
        )}
      </div>
    </header>
  )
}
