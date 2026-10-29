import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import StaffShell, { StaffGate } from '../components/staff/StaffShell.jsx'
import { getSession } from '../lib/auth.js'
import { adminListListings, adminListOrders } from '../lib/services.js'
import { adminListBuyers } from '../lib/market.js'
import { fmt } from '../lib/format.js'
import { tr } from '../i18n/translate.js'
import './manage/manage-services.css'
import './manage/msp-gallery.css'
import './manage/admin-payments.css'

const ago = (d) => {
  const h = Math.max(0, Math.floor((Date.now() - new Date(d)) / 3_600_000))
  return h < 1 ? tr("à l'instant") : h < 48 ? tr('il y a {0} h', [h]) : tr('il y a {0} j', [Math.floor(h / 24)])
}

/** Staff console home: what is waiting, oldest first, with a shortcut to each queue. */
export default function AdminHomePage() {
  const [session, setSession] = useState({ status: 'checking', user: null })
  const [data, setData] = useState({ products: null, payments: null, buyers: null })

  useEffect(() => { document.documentElement.setAttribute('data-theme', localStorage.getItem('vg-theme') ?? 'dark') }, [])
  useEffect(() => {
    let off = false
    getSession().then((r) => { if (!off) setSession(r.ok ? { status: 'checked', user: r.data.user } : { status: 'unavailable', user: null }) })
    return () => { off = true }
  }, [])
  useEffect(() => {
    if (!session.user?.isPlatformAdmin) return
    const put = (k, rows) => setData((d) => ({ ...d, [k]: rows }))
    adminListListings('PENDING').then((r) => put('products', r.ok ? r.data.listings ?? [] : []))
    adminListOrders('PENDING').then((r) => put('payments', r.ok ? r.data.orders ?? [] : []))
    adminListBuyers('DECLARED').then((r) => put('buyers', r.ok ? r.data.buyers ?? [] : []))
  }, [session.user])

  const count = (k) => (data[k] === null ? '…' : data[k].length)
  const tone = (k) => (data[k] === null ? '' : data[k].length ? 'warn' : 'ok')
  const kpis = [
    { to: '/admin/products', k: 'products', label: 'Produits à valider', hint: 'Fiches publiées, en attente de décision' },
    { to: '/admin/payments', k: 'payments', label: 'Paiements à confirmer', hint: 'Virements à vérifier avant promotion' },
    { to: '/admin/buyers', k: 'buyers', label: 'Acheteurs à vérifier', hint: "Catégories d'acheteurs déclarées" },
  ]

  return (
    <StaffShell user={session.user} loading={session.status === 'checking'} section="Staff">
      <main className="msp">
        <StaffGate session={session}>
          <div className="stf-head">
            <div>
              <h1>{tr('Vue')} <span style={{ color: 'var(--cyan)' }}>{tr("d'ensemble")}</span></h1>
              <p>{tr('Bonjour {0}. Voici ce qui attend une décision, les plus anciens en premier.', [session.user?.displayName ?? ''])}</p>
            </div>
          </div>

          <div className="stf-kpis">
            {kpis.map((c) => (
              <Link key={c.k} to={c.to} className="stf-kpi">
                <span>{tr(c.label)}</span>
                <strong className={tone(c.k)}>{count(c.k)}</strong>
                <small>{tr(c.hint)}</small>
              </Link>
            ))}
          </div>

          <div className="stf-panels">
            <section className="stf-panel">
              <header><h2>{tr('Produits en attente')}</h2><Link className="msp-btn msp-btn--ghost msp-btn--sm" to="/admin/products">{tr('Tout voir')}</Link></header>
              {data.products === null ? <p className="stf-empty">{tr('Chargement…')}</p>
                : data.products.length === 0 ? <p className="stf-empty">{tr('Rien à valider. ✓')}</p>
                : <ul className="stf-rows">{data.products.slice(0, 5).map((l) => (
                    <li key={l.id}><div><b>{l.title}</b><small>{l.organization} · {ago(l.updatedAt)}</small></div><Link className="msp-btn msp-btn--primary msp-btn--sm" to="/admin/products">{tr('Examiner')}</Link></li>
                  ))}</ul>}
            </section>
            <section className="stf-panel">
              <header><h2>{tr('Paiements en attente')}</h2><Link className="msp-btn msp-btn--ghost msp-btn--sm" to="/admin/payments">{tr('Tout voir')}</Link></header>
              {data.payments === null ? <p className="stf-empty">{tr('Chargement…')}</p>
                : data.payments.length === 0 ? <p className="stf-empty">{tr('Aucun paiement en attente. ✓')}</p>
                : <ul className="stf-rows">{data.payments.slice(0, 5).map((o) => (
                    <li key={o.id}><div><b>{o.listingTitle}</b><small>{o.organization} · {o.reference} · {o.receiptSent ? tr('reçu envoyé') : tr('pas de reçu')}</small></div><b>{fmt(o.total)}</b></li>
                  ))}</ul>}
            </section>
          </div>

          <p className="stf-note">{tr("Valider une fiche contrôle les informations affichées (nom, description, photo, catégorie). Ce n'est pas une autorisation réglementaire du produit : pour un médicament ou un dispositif médical, vérifiez les pièces (AMM, enregistrement, certificats) avant d'autoriser la promotion payante.")}</p>
        </StaffGate>
      </main>
    </StaffShell>
  )
}
