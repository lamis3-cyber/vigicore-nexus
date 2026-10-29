import React, { useCallback, useEffect, useState } from 'react'
import StaffShell, { StaffGate } from '../components/staff/StaffShell.jsx'
import { getSession } from '../lib/auth.js'
import { adminListOrders, adminGetReceipt, adminConfirmOrder, adminRejectOrder } from '../lib/services.js'
import './manage/manage-services.css'
import './manage/msp-gallery.css'
import './manage/admin-payments.css'
import { fmt, fmtDate } from '../lib/format.js'
import { tr, localeTag } from '../i18n/translate.js';

const TABS = [['PENDING', 'Awaiting payment'], ['PAID', 'Paid'], ['CANCELLED', 'Rejected'], ['all', 'All']]
const PLAN = { FEATURED: 'Featured partner', SPONSORED: 'Sponsored strip', RECOMMENDED: 'Recommended row', STANDARD: 'Catalog listing' }
const METHOD = { BARIDIMOB: 'BaridiMob / CCP', BANK_TRANSFER: 'Bank transfer', EDAHABIA_CIB: 'Edahabia / CIB' }
const LABEL = { PAID: 'Paid', PENDING: 'Awaiting payment', CANCELLED: 'Rejected' }


/** VigiCore staff: check the money arrived, then confirm (publishes the listing) or reject with a reason. */
export default function AdminPaymentsPage() {
  const [session, setSession] = useState({ status: 'checking', user: null })
  const [status, setStatus] = useState('PENDING')
  const [orders, setOrders] = useState(null)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState(null)
  const [receipt, setReceipt] = useState(null) // { order, image, loading, error }
  const [tick, setTick] = useState(0) // re-counts the sidebar badges after a decision

  useEffect(() => { document.documentElement.setAttribute('data-theme', localStorage.getItem('vg-theme') ?? 'dark') }, [])
  useEffect(() => {
    document.documentElement.classList.add('no-scrollbar')
    return () => document.documentElement.classList.remove('no-scrollbar')
  }, [])
  useEffect(() => {
    let off = false
    getSession().then((r) => { if (!off) setSession(r.ok ? { status: 'checked', user: r.data.user } : { status: 'unavailable', user: null }) })
    return () => { off = true }
  }, [])
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t) }, [toast])

  const load = useCallback(async (st) => {
    setOrders(null); setError(null)
    const r = await adminListOrders(st)
    if (r.ok) setOrders(r.data.orders ?? []); else setError(tr(r.error))
  }, [])
  useEffect(() => { if (session.user?.isPlatformAdmin) load(status) }, [session.user, status, load])

  async function confirm(o) {
    if (!window.confirm(`Confirm that ${fmt(o.total)} from “${o.organization}” (ref ${o.reference}) has arrived?\n\n“${o.listingTitle}” will be promoted in the ${PLAN[o.placement] ?? o.placement} for ${o.months} month(s).`)) return
    setBusyId(o.id)
    const r = await adminConfirmOrder(o.id)
    setBusyId(null)
    if (!r.ok) return setToast(r.error)
    setToast(`${o.reference} confirmed — “${o.listingTitle}” is now promoted.`); setTick((t) => t + 1); load(status)
  }
  async function reject(o) {
    const note = window.prompt(`Why is ${o.reference} rejected? The organization will see this reason.`, 'Payment not received — please check the reference and amount.')
    if (!note?.trim()) return
    setBusyId(o.id)
    const r = await adminRejectOrder(o.id, note)
    setBusyId(null)
    if (!r.ok) return setToast(r.error)
    setToast(`${o.reference} rejected.`); setTick((t) => t + 1); load(status)
  }
  async function viewReceipt(o) {
    setReceipt({ order: o, loading: true })
    const r = await adminGetReceipt(o.id)
    setReceipt({ order: o, loading: false, image: r.ok ? r.data.image : null, error: r.ok ? null : r.error })
  }

  return (
    <StaffShell user={session.user} loading={session.status === 'checking'} section="Staff · Paiements" refreshKey={tick}>
      <main className="msp ap">
        <StaffGate session={session}>
        <div className="stf-head">
          <div>
            <h1>{tr("Payments")} <span style={{ color: 'var(--cyan)' }}>{tr("review")}</span></h1>
            <p>{tr("Check the transfer, then confirm to start the promotion or reject with a reason.")}</p>
          </div>
        </div>

        <div className="mg-tabs" role="tablist">
          {TABS.map(([k, lb]) => <button key={k} role="tab" aria-selected={status === k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{lb}</button>)}
        </div>

        {error && <div className="msp-empty"><h2>{/staff/i.test(error) ? tr("Not authorized") : tr("Could not load orders")}</h2><p>{tr(error)}</p></div>}
        {!error && orders === null && <p className="ap-loading">{tr("Loading…")}</p>}
        {!error && orders?.length === 0 && <div className="msp-empty"><h2>{tr("Nothing here")}</h2><p>{tr("No orders in this list.")}</p></div>}

        {orders?.length > 0 && (
          <ul className="ap-list">
            {orders.map((o) => (
              <li className="ap-row" key={o.id}>
                <div className="ap-main">
                  <span className="mg-ref">{o.reference}</span>
                  <strong>{o.listingTitle}</strong>
                  <small>{o.organization} · {tr(o.requestedBy.name)} ({o.requestedBy.email})</small>
                </div>
                <div className="ap-plan"><span>{PLAN[o.placement] ?? o.placement}</span><small>{tr("{0} mo · {1}", [o.months, METHOD[o.paymentMethod] ?? o.paymentMethod])}</small></div>
                <div className="ap-amt"><b>{fmt(o.total)}</b><small>{fmtDate(o.createdAt, 'short', localeTag())}</small></div>
                <div className="ap-state">
                  <span className={`msp-badge msp-badge--${o.status.toLowerCase()}`}>{LABEL[o.status] ?? tr(o.status)}</span>
                  {o.status === 'PENDING' && <small className={o.receiptSent ? 'ok' : ''}>{o.receiptSent ? tr("✓ Receipt uploaded") : tr("No receipt yet")}</small>}
                  {o.status === 'CANCELLED' && o.adminNote && <small title={o.adminNote}>“{o.adminNote}”</small>}
                  {o.invoiceNo && <small>{o.invoiceNo}</small>}
                </div>
                <div className="ap-act">
                  {o.receiptSent && <button className="msp-btn msp-btn--ghost msp-btn--sm" onClick={() => viewReceipt(o)}>{tr("View receipt")}</button>}
                  {o.status === 'PENDING' && <>
                    <button className="msp-btn msp-btn--primary msp-btn--sm" disabled={busyId === o.id} onClick={() => confirm(o)}>{tr("Confirm payment")}</button>
                    <button className="msp-btn msp-btn--ghost msp-btn--sm msp-danger" disabled={busyId === o.id} onClick={() => reject(o)}>{tr("Reject")}</button>
                  </>}
                  {o.status === 'PAID' && <a className="msp-btn msp-btn--ghost msp-btn--sm" href={`/dashboard/invoice/${o.id}`} target="_blank" rel="noopener noreferrer">{tr("Invoice")}</a>}
                </div>
              </li>
            ))}
          </ul>
        )}
        </StaffGate>
      </main>

      {receipt && (
        <div className="ap-modal" role="dialog" aria-modal="true" aria-label={tr("Payment receipt")} onClick={() => setReceipt(null)}>
          <div className="ap-modal-box" onClick={(e) => e.stopPropagation()}>
            <header><strong>{receipt.order.reference} · {fmt(receipt.order.total)}</strong><button className="msp-btn msp-btn--ghost msp-btn--sm" onClick={() => setReceipt(null)}>{tr("Close")}</button></header>
            {receipt.loading ? <p>{tr("Loading…")}</p> : receipt.image ? <img src={receipt.image} alt={tr("Uploaded proof of payment")} /> : <p>{tr(receipt.error)}</p>}
          </div>
        </div>
      )}
      {toast && <div className="mg-toast" role="status">{toast}</div>}
    </StaffShell>
  )
}
