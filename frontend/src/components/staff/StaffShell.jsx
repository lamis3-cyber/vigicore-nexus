import React, { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import DashboardHeader from '../layout/DashboardHeader.jsx'
import { adminListListings, adminListOrders } from '../../lib/services.js'
import { adminListBuyers } from '../../lib/market.js'
import { tr } from '../../i18n/translate.js'
import './staff.css'

/** What is waiting for a staff decision (badges in the sidebar). Never throws: a failed count shows nothing. */
function useWaiting(enabled, refreshKey) {
  const [n, setN] = useState({ products: null, payments: null, buyers: null })
  useEffect(() => {
    if (!enabled) return
    const set = (k) => (r, pick) => setN((c) => ({ ...c, [k]: r.ok ? pick(r.data).length : null }))
    adminListListings('PENDING').then((r) => set('products')(r, (d) => d.listings ?? []))
    adminListOrders('PENDING').then((r) => set('payments')(r, (d) => d.orders ?? []))
    adminListBuyers('DECLARED').then((r) => set('buyers')(r, (d) => d.buyers ?? []))
  }, [enabled, refreshKey])
  return n
}

const NAV = [
  { to: '/admin', label: 'Vue d’ensemble', end: true },
  { to: '/admin/products', label: 'Validation des produits', badge: 'products' },
  { to: '/admin/payments', label: 'Paiements', badge: 'payments' },
  { to: '/admin/buyers', label: 'Acheteurs & fabricants', badge: 'buyers' },
]

/**
 * Frame of every staff page: the site header + a sidebar. Access itself is enforced by the API
 * (PLATFORM_ADMIN_EMAILS); the shell only hides the pages from people who are not on that list.
 * `refreshKey` lets a page re-count the badges after a decision.
 */
export default function StaffShell({ user, loading, section, refreshKey = 0, children }) {
  const allowed = Boolean(user?.isPlatformAdmin)
  const waiting = useWaiting(allowed, refreshKey)
  return (
    <>
      <DashboardHeader user={user} loading={loading} section={section} />
      <div className="stf">
        <nav className="stf-nav" aria-label={tr('Espace staff')}>
          <span className="stf-nav-h">{tr('Espace staff')}</span>
          {NAV.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `stf-link${isActive ? ' on' : ''}`}>
              <span>{tr(i.label)}</span>
              {i.badge && waiting[i.badge] > 0 && <b className="stf-count">{waiting[i.badge]}</b>}
            </NavLink>
          ))}
          <div className="stf-sep" role="separator" />
          <a className="stf-link" href="/dashboard/?own=1">{tr('Mon tableau de bord')}</a>
          <a className="stf-link" href="/services" target="_blank" rel="noopener noreferrer">{tr('Voir le catalogue public ↗')}</a>
        </nav>
        <div className="stf-main">{children}</div>
      </div>
    </>
  )
}

/** Shown instead of the page when the visitor is not signed in / not staff. */
export function StaffGate({ session, children }) {
  if (session.status === 'checking') return <p style={{ color: 'var(--muted)' }}>{tr('Chargement…')}</p>
  if (!session.user) return <div className="msp-empty"><h2>{tr('Connexion requise')}</h2><p>{tr('Cette page est réservée au staff VigiCore.')}</p><a className="msp-btn msp-btn--primary" href="/login">{tr('Se connecter')}</a></div>
  if (!session.user.isPlatformAdmin) return <div className="msp-empty"><h2>{tr('Accès refusé')}</h2><p>{tr('Cette page est réservée au staff VigiCore.')}</p><a className="msp-btn msp-btn--primary" href="/dashboard/">{tr('Mon tableau de bord')}</a></div>
  return children
}
