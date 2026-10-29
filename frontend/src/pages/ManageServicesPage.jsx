import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DashboardHeader from '../components/layout/DashboardHeader.jsx'
import ProductStudio from '../components/studio/ProductStudio.jsx'
import { imageFrameStyle, isContainFit, fgInset } from '../lib/imageFrame.js'
import { shrinkImage } from '../lib/image.js'
import { getSession } from '../lib/auth.js'
import { listMyServices, createService, updateService, deleteService, promoteService, publishService, getServicePricing, getServiceStats, listMyOrders, uploadReceipt, getAuditProducts, auditLinkPatch } from '../lib/services.js'
import { IcBox, IcLive, IcPause, IcEye, IcCheck, IcPlus, IcEditSm, IcCopy, IcArchive, IcTrash } from './manage/icons.jsx'
import { FALLBACK_PRICING, EMPTY, DEMO, FILTERS, SORTS, DAY, ORDER_LABEL, DEMO_STATS, DEMO_ORDERS } from './manage/data.js'
import { endsAt, rowState } from './manage/format.js'
import { hue, fmt, fmtDate, addMonths } from '../lib/format.js'
import { Spark, HeroArt, PlacementMap } from './manage/parts.jsx'
import './manage/manage-services.css'
import './manage/msp-gallery.css'
import './manage/msp-polish.css'
import './manage/msp-looks.css'
import { tr, localeTag } from '../i18n/translate.js';

export default function ManageServicesPage() {
  const [session, setSession] = useState({ status: 'checking', user: null })
  const [listings, setListings] = useState([])
  const [pricing, setPricing] = useState(FALLBACK_PRICING)
  const listingsLimit = FALLBACK_PRICING.freeListingLimit
  const [drawer, setDrawer] = useState(null) // { mode: 'edit'|'promote', id? }
  const [form, setForm] = useState(EMPTY)
  const [step, setStep] = useState(1)
  const [placement, setPlacement] = useState('RECOMMENDED')
  const [months, setMonths] = useState(1)
  const [payment, setPayment] = useState('BARIDIMOB')
  const [order, setOrder] = useState(null) // the order shown on the confirmation screen
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [done, setDone] = useState(false)
  const [copied, setCopied] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('new')
  const [tab, setTab] = useState('products')
  const [stats, setStats] = useState({})
  const [orders, setOrders] = useState([])
  const [toast, setToast] = useState(null)
  // Produits d'Audit du fabricant (liste déroulante du studio + pastille « non liée ») ; null = en chargement.
  const [audit, setAudit] = useState(null)
  // Two dashboard looks to compare: ?look=vibrant | ?look=showcase (remembered). Remove once you pick one.
  const [look, setLook] = useState(() => {
    const v = new URLSearchParams(window.location.search).get('look') ?? localStorage.getItem('vg-look')
    return ['showcase', 'compact'].includes(v) ? v : 'vibrant'
  })
  useEffect(() => { try { localStorage.setItem('vg-look', look) } catch { /* private mode */ } }, [look])

  useEffect(() => { document.documentElement.setAttribute('data-theme', localStorage.getItem('vg-theme') ?? 'dark') }, [])
  useEffect(() => {
    let off = false
    getSession().then((r) => { if (!off) setSession(r.ok ? { status: 'checked', user: r.data.user } : { status: 'unavailable', user: null }) })
    return () => { off = true }
  }, [])
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !document.querySelector('.ps') && closeDrawer()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const demo = session.status === 'unavailable'
  const isDistributor = session.status === 'checked' && session.user?.role === 'FOURNISSEUR'
  const isAdmin = session.status === 'checked' && (session.user?.role === 'ESTABLISHMENT_ADMIN' || isDistributor)
  const active = demo || isAdmin

  useEffect(() => {
    if (demo) { setListings(DEMO); setStats(DEMO_STATS); setOrders(DEMO_ORDERS); return }
    if (!isAdmin) return
    listMyServices().then((r) => r.ok && setListings(r.data.listings ?? []))
    getServiceStats().then((r) => r.ok && setStats(r.data.stats ?? {}))
    listMyOrders().then((r) => r.ok && setOrders(r.data.orders ?? []))
    if (!isDistributor) loadAudit()
    // A malformed/empty response must never blank the price list — keep the built-in one.
    getServicePricing().then((r) => r.ok && r.data.placements?.length && setPricing(r.data))
  }, [demo, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  // Hide the page scrollbar on this screen only (scrolling still works).
  useEffect(() => {
    const el = document.documentElement
    el.classList.add('no-scrollbar')
    return () => el.classList.remove('no-scrollbar')
  }, [])
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 3800); return () => clearTimeout(t) }, [toast])

  const target = listings.find((l) => l.id === drawer?.id)
  const planOf = (id) => pricing.placements.find((p) => p.id === id)
  const plan = planOf(placement) ?? pricing.placements[0]
  const dur = pricing.durations.find((d) => d.months === months) ?? pricing.durations[0]
  const subtotal = plan.monthlyPrice * months
  const discount = Math.round((subtotal * dur.discountPercent) / 100)
  const total = subtotal - discount
  const kept = listings.filter((l) => l.status !== 'ARCHIVED')
  const live = kept.filter((l) => l.status === 'PUBLISHED').length
  const totalViews = Object.values(stats).reduce((n, x) => n + x.views, 0)
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const drafts = kept.length - live
  const viewsSeries = Object.values(stats).reduce((acc, x) => (x.series ?? []).map((v, i) => (acc[i] ?? 0) + v), [])
  const firstDraft = kept.find((l) => l.status === 'DRAFT' || l.status === 'REJECTED')
  const firstLive = kept.find((l) => l.status === 'PUBLISHED')
  const limit = pricing.freeListingLimit ?? listingsLimit
  // A slot is used by every product the organization published (waiting for review included).
  const used = listings.filter((l) => (l.rawStatus ? l.rawStatus === 'PUBLISHED' : l.status === 'PUBLISHED' || l.status === 'PENDING_REVIEW')).length
  const steps = [
    { t: 'Design', d: 'Build your card in the studio', done: kept.length > 0, act: ['Create product', () => openEdit(null)] },
    { t: 'Publish for free', d: `Up to ${limit} products, checked by VigiCore`, done: kept.some((l) => l.status === 'PUBLISHED' || l.status === 'PENDING_REVIEW'), act: firstDraft && ['Publish for free', () => publishFree(firstDraft.id)] },
    { t: 'Get promoted', d: 'Optional — recommended, sponsored or featured', done: kept.some((l) => l.paidActive), act: firstLive && ['Promote a product', () => openPromote(firstLive)] },
  ]
  const stepsDone = steps.filter((x) => x.done).length
  const cur = steps.findIndex((x) => !x.done)
  const q = query.trim().toLowerCase()
  const shown = q ? listings.filter((l) => [l.title, l.category, l.summary].some((v) => v?.toLowerCase().includes(q))) : listings
  const counts = listings.reduce((c, l) => { const k = rowState(l).key; c[k] = (c[k] ?? 0) + 1; return c }, { all: kept.length })
  const byFilter = filter === 'all' ? shown.filter((l) => l.status !== 'ARCHIVED') : shown.filter((l) => rowState(l).key === filter)
  const visible = sort === 'az' ? [...byFilter].sort((x, y) => x.title.localeCompare(y.title)) : sort === 'expiring' ? [...byFilter].sort((x, y) => endsAt(x) - endsAt(y)) : byFilter
  const listingAlerts = listings.flatMap((l) => {
    if (l.pendingOrder) return [{ id: `${l.id}p`, tone: 'info', text: <>{tr("Order")} <strong>{l.pendingOrder.reference}</strong> {tr("for “")}{tr(l.title)}{tr("” is waiting for your payment.")}</>, action: 'Payment details', run: () => openPaymentDetails(l) }]
    // Staff refused the product: say why, right here, until it is fixed and resubmitted.
    if (l.status === 'REJECTED') return [{ id: `${l.id}j`, tone: 'warn', text: <>{tr("“{0}” was not approved:", [l.title])} {l.reviewNote || tr("please review the content.")}</>, action: 'Edit & resubmit', run: () => openEdit(l) }]
    const paidPlan = l.placement && l.placement !== 'STANDARD' ? l.placement : null
    if (l.status === 'PUBLISHED' && paidPlan && l.placementUntil) {
      const d = Math.ceil((new Date(l.placementUntil) - Date.now()) / DAY)
      // 7-day heads-up while the promotion is still running.
      if (l.paidActive && d <= 7) return [{ id: `${l.id}e`, tone: 'warn', text: <>{tr("“{0}” promotion ends {1}. Afterwards it stays in the free catalog.", [l.title, d <= 0 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`])}</>, action: 'Renew', run: () => openPromote(l) }]
      // Ended recently: nothing is lost — the product is simply back in the free catalog.
      if (!l.paidActive && Date.now() - new Date(l.placementUntil) < 14 * DAY) return [{ id: `${l.id}x`, tone: 'info', text: <>{tr("“{0}” promotion ended on {1}. It is back in the free catalog.", [l.title, fmtDate(l.placementUntil)])}</>, action: 'Renew', run: () => openPromote(l) }]
    }
    return []
  })
  // A rejected payment must not go unnoticed: surface the staff reason for two weeks.
  const rejectedAlerts = orders
    .filter((o) => o.status === 'CANCELLED' && o.adminNote && Date.now() - new Date(o.createdAt) < 14 * DAY)
    .slice(0, 2)
    .map((o) => ({ id: `${o.id}r`, tone: 'warn', text: <>{tr("Payment")} <strong>{o.reference}</strong> {tr("for “")}{o.listingTitle}{tr("” was rejected:")} {o.adminNote}</>, action: 'View payments', run: () => setTab('payments') }))
  const alerts = [...rejectedAlerts, ...listingAlerts]
  const paidTotal = orders.filter((o) => o.status === 'PAID').reduce((n, o) => n + o.total, 0)
  const dueTotal = orders.filter((o) => o.status === 'PENDING').reduce((n, o) => n + o.total, 0)
  const method = pricing.paymentMethods.find((m) => m.id === payment)

  // The FEATURED slot is exclusive: unavailable while ANOTHER product holds it.
  const featuredBlocked = (listingId) =>
    Boolean(pricing.featuredTakenUntil) && pricing.featuredHolderId !== listingId

  function closeDrawer() { setDrawer(null); setMsg(null); setDone(false); setStep(1); setOrder(null); setCopied(false) }
  function openEdit(l) { setForm(l ? { ...EMPTY, ...l } : EMPTY); setDrawer({ mode: 'edit', id: l?.id }) }
  function openPromote(l) {
    // Paying never skips the review: only a product that is already public can be promoted.
    if (l.status !== 'PUBLISHED') return setToast(l.status === 'PENDING_REVIEW' ? 'Promotions unlock once VigiCore has approved this product.' : 'Publish the product for free first — promotions unlock once VigiCore approves it.')
    if (l.promoAllowed === false) return setToast('This product has not been cleared for paid promotion. Contact VigiCore if you think it should be.')
    const preferred = l.placement && l.placement !== 'STANDARD' ? l.placement : 'RECOMMENDED'
    setPlacement(preferred === 'FEATURED' && featuredBlocked(l.id) ? 'SPONSORED' : preferred)
    setMonths(1)
    setPayment((pricing.paymentMethods.find((m) => m.enabled) ?? pricing.paymentMethods[0]).id)
    setStep(1); setDone(false); setOrder(null); setMsg(null)
    setDrawer({ mode: 'promote', id: l.id })
  }
  // Re-open the payment instructions of an order that is still unpaid.
  // Clicking a spot on the map: promote your first product there (or create one if you have none).
  function pickZone(id) {
    if (!kept.length) return openEdit(null)
    if (id === 'STANDARD') return openEdit(firstDraft ?? kept[0]) // the free catalog: nothing to buy, go design / publish
    const target0 = firstLive ?? kept[0]
    if (target0.status !== 'PUBLISHED') return openPromote(target0) // explains why promotion is not available yet
    openPromote(target0)
    setPlacement(id === 'FEATURED' && featuredBlocked(target0.id) ? 'SPONSORED' : id)
  }
  function openPaymentDetails(l) {
    setOrder(l.pendingOrder); setDone(true); setDrawer({ mode: 'promote', id: l.id })
  }
  
  // Studio callbacks. status is never sent: a product goes live by paying for a
  // placement, and the server rejects an attempt to set it any other way.
  async function persist(data, id) {
    const { title, summary, description, category, imageUrl, imageZoom, imageFocusX, imageFocusY, imageFit, imageAccent, logoUrl, logoShape, logoPlacement, coverSide, certifications, contactEmail, contactPhone, website } = data
    const payload = { title, summary, description, category, imageUrl, imageZoom, imageFocusX, imageFocusY, imageFit, imageAccent, logoUrl, logoShape, logoPlacement, coverSide, certifications, contactEmail, contactPhone, website }
    // Manufacturer only: the Audit product link, sent only when it changes (changing it sends the listing back to review).
    if (!isDistributor) Object.assign(payload, auditLinkPatch(data.auditProductRef, listings.find((l) => l.id === id)?.auditProductRef, Boolean(id)))
    // Lien vers un produit dont le nom ne correspond pas à la fiche : envoyé seulement si le fabricant l'a confirmé (sinon le serveur refuse).
    if ('auditProductRef' in payload && data.confirmProductMismatch) payload.confirmProductMismatch = true
    // Distributor only: selling terms. Empty price = not orderable yet (the server validates every value).
    if (isDistributor) Object.assign(payload, { unitPrice: data.unitPrice === '' || data.unitPrice == null ? null : Number(data.unitPrice), priceUnit: data.priceUnit ?? '', minOrderQty: data.minOrderQty === '' || data.minOrderQty == null ? 1 : Number(data.minOrderQty), inStock: data.inStock !== false, stockQty: data.stockQty === '' || data.stockQty == null ? null : Number(data.stockQty) })
    if (demo) {
      const nid = id ?? `d${Date.now()}`
      setListings((p) => (id ? p.map((l) => (l.id === id ? { ...l, ...payload } : l)) : [{ ...payload, id: nid, status: 'DRAFT' }, ...p]))
      return { id: nid }
    }
    const r = id ? await updateService(id, payload) : await createService(payload)
    if (!r.ok) return { error: r.error }
    const fresh = await listMyServices(); if (fresh.ok) setListings(fresh.data.listings ?? [])
    if ('auditProductRef' in payload) loadAudit() // « déjà lié à… » à jour dans la liste déroulante
    return { id: id ?? r.data.listing?.id }
  }
  // Free publication: shows the product in the free catalog (max per organization). It becomes
  // public once VigiCore approves it; the server enforces the limit and answers with a clear message.
  async function publishFree(id) {
    if (demo) {
      setListings((p) => p.map((l) => (l.id === id ? { ...l, status: 'PENDING_REVIEW' } : l)))
      setToast('Sent for validation — it goes public once VigiCore approves it.'); return true
    }
    const r = await publishService(id)
    if (!r.ok) { setToast(r.error); return false }
    await reload()
    setToast(r.data.listing?.status === 'PUBLISHED' ? 'Published — it is live in the free catalog.' : 'Sent for validation — it goes public once VigiCore approves it.')
    return true
  }
  function publishFromStudio(id, zone) {
    setPlacement(zone === 'FEATURED' && featuredBlocked(id) ? 'SPONSORED' : zone)
    setMonths(1)
    setPayment((pricing.paymentMethods.find((m) => m.enabled) ?? pricing.paymentMethods[0]).id)
    setStep(1); setDone(false); setOrder(null); setMsg(null)
    setDrawer({ mode: 'promote', id })
  }

  async function reload() { const r = await listMyServices(); if (r.ok) setListings(r.data.listings ?? []) }
  async function loadAudit() {
    const r = await getAuditProducts()
    setAudit(r.ok ? { ...r.data, products: Array.isArray(r.data.products) ? r.data.products : [] } : { error: r.error })
  }
  // Fiche de fabricant liée au produit Audit ? (pastille sur la carte ; rien tant que l'organisation n'est pas liée à un fabricant)
  const auditName = (ref) => audit?.products?.find((p) => p.ref === ref)?.name ?? ref

  async function duplicate(l) {
    // stockQty n'est PAS copié : le même stock compté deux fois ferait vendre plus que ce qui existe.
    // auditProductRef non plus : deux fiches actives ne peuvent pas être liées au même produit Audit (le serveur refuse).
    const copy = { ...EMPTY, ...l, title: `${l.title} (copy)`.slice(0, 80), stockQty: '', auditProductRef: null }
    const r = await persist(copy)
    if (r.error) return setToast(r.error)
    setForm(copy); setDrawer({ mode: 'edit', id: r.id })
    setToast('Copy created as a draft — you are editing it now.')
  }

  // Archive hides a product without losing it and frees one of your free-catalog slots; a running
  // promotion is kept. Restoring publishes it again (if you still have a free slot).
  async function setArchived(l, on) {
    if (on && l.status === 'PUBLISHED' && !window.confirm(`Archive “${l.title}”? It will disappear from the Services page. Any running promotion is kept and you can restore it any time.`)) return
    const status = on ? 'ARCHIVED' : 'PUBLISHED'
    if (demo) setListings((p) => p.map((x) => (x.id === l.id ? { ...x, status: on ? 'ARCHIVED' : 'PENDING_REVIEW' } : x)))
    else { const r = await updateService(l.id, { status }); if (!r.ok) return setToast(r.error); await reload() }
    setToast(on ? `“${l.title}” archived.` : `“${l.title}” restored — it is live again once approved.`)
  }
  async function sendReceipt(o, file) {
    if (!file) return
    try {
      const r = await uploadReceipt(o.id, await shrinkImage(file, 1400, 0.8))
      if (!r.ok) return setToast(r.error)
      const fresh = await listMyOrders(); if (fresh.ok) setOrders(fresh.data.orders ?? [])
      setToast('Receipt sent — we will confirm your payment shortly.')
    } catch { setToast('That image could not be read.') }
  }
  function openOrder(o) { setOrder(o); setDone(true); setDrawer({ mode: 'promote', id: o.listingId }) }

  async function remove(l) {
    const consequence = l.status === 'PUBLISHED' ? ' It will disappear from the Services page.' : ''
    if (!window.confirm(`Delete "${l.title}"?${consequence} This cannot be undone.`)) return
    if (demo || (await deleteService(l.id)).ok) setListings((p) => p.filter((x) => x.id !== l.id))
  }

  async function pay() {
    setBusy(true); setMsg(null)
    if (demo) {
      await new Promise((r) => setTimeout(r, 700))
      setListings((p) => p.map((l) => (l.id === drawer.id ? { ...l, status: 'PUBLISHED', placement, placementUntil: addMonths(new Date(), months), paidActive: true } : l)))
      setOrders((p) => [{ id: `o${Date.now()}`, reference: 'VG-DEMO', listingId: drawer.id, listingTitle: target?.title, placement, months, total, paymentMethod: payment, status: 'PAID', createdAt: new Date().toISOString() }, ...p])
      setBusy(false); return setDone(true)
    }
    const r = await promoteService(drawer.id, { placement, months, paymentMethod: payment })
    setBusy(false)
    if (!r.ok) return setMsg(tr(r.error))
    setListings((p) => p.map((l) => (l.id === drawer.id ? r.data.listing : l)))
    setOrder(r.data.order)
    listMyOrders().then((o) => o.ok && setOrders(o.data.orders ?? []))
    setDone(true)
  }

  async function copyReference() {
    try { await navigator.clipboard.writeText(order.reference); setCopied(true) } catch { /* clipboard blocked: the reference is on screen */ }
  }

  const orderPlan = order ? planOf(order.placement) : null
  const orderMethod = order ? pricing.paymentMethods.find((m) => m.id === order.paymentMethod) : null

  return (
    <>
      <DashboardHeader
        user={session.user}
        preview={demo}
        section="Products"
        loading={session.status === 'checking'}
        // Search only earns its place once the catalog is big enough to scroll through.
        search={active && tab === 'products' && listings.length > 5 ? { value: query, onChange: setQuery, placeholder: 'Search your products…' } : undefined}
      />
      <main className={`msp msp--${look}`}>
        <header className="msp-head mh">
          <div className="mh-row">
            <div className="mh-main">
              {session.user && (
                <div className="msp-eyebrow">
                  <span className="msp-greet">{hello}, <strong>{session.user.displayName}</strong></span>
                  {session.user.activeEstablishmentName && <span className="msp-org">{session.user.activeEstablishmentName}</span>}
                </div>
              )}
              <h1>{tr("Products")} <span>{tr("& visibility")}</span></h1>
              <p>{tr("Design your listings and choose where each one appears on the Services page.")}</p>
            </div>
            <div className="mh-actions">
              {isDistributor && <a className="msp-btn msp-btn--ghost" href="/dashboard/">{tr("← Back to dashboard")}</a>}
              <a className="msp-btn msp-btn--ghost" href="/services" target="_blank" rel="noopener noreferrer">{tr("View public page ↗")}</a>
              {active && <button className="msp-btn msp-btn--primary" onClick={() => openEdit(null)}><IcPlus />{tr("New product")}</button>}
            </div>
          </div>
          {look === 'vibrant' && active && tab === 'products' && (
            <HeroArt listing={kept.find((l) => l.status === 'PUBLISHED') ?? kept[0]} series={viewsSeries} live={live} views={totalViews} />
          )}
          {look === 'showcase' && active && tab === 'products' && (
            <PlacementMap pricing={pricing} listings={kept} featuredTaken={Boolean(pricing.featuredTakenUntil) && !kept.some((l) => l.id === pricing.featuredHolderId)} onPick={pickZone} />
          )}
          {active && tab === 'products' && (
            <div className="mh-stats" role="group" aria-label={tr("Overview")}>
              <div className="mh-stat"><i aria-hidden="true"><IcBox /></i><div><span>{tr("Products")}</span><strong>{kept.length}</strong><small>{tr("in your catalog")}</small></div></div>
              <div className="mh-stat is-live"><i aria-hidden="true"><IcLive /></i><div><span>{tr("Live on catalog")}</span><strong>{live}</strong><small>{tr("{0} of {1} free slots used", [used, limit])}</small></div></div>
              <div className="mh-stat is-idle"><i aria-hidden="true"><IcPause /></i><div><span>{tr("Not live")}</span><strong>{drafts}</strong><small>{tr("drafts & in review")}</small></div></div>
              <div className="mh-stat is-views"><i aria-hidden="true"><IcEye /></i><div><span>{tr("Views · 30 days")}</span><strong>{totalViews.toLocaleString(localeTag())}</strong><small>{tr("across all products")}</small></div>{viewsSeries.length > 1 && <Spark data={viewsSeries} />}</div>
            </div>
          )}
        </header>

        {session.status === 'checking' && <div className="msp-empty"><p>{tr("Checking your session…")}</p></div>}
        {session.status === 'checked' && !isAdmin && (
          <div className="msp-empty"><p>{session.user ? 'Only product providers and distributors can manage products.' : <>{tr("Please")} <Link to="/login">{tr("log in")}</Link> {tr("as an Establishment Admin.")}</>}</p></div>
        )}
        {demo && <div className="msp-banner">{tr("Preview mode — backend not connected. Data is local and payments are simulated.")}</div>}

        {active && (
          <>
            <div className="mg-tabrow">
            <div className="mg-tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'products'} className={tab === 'products' ? 'on' : ''} onClick={() => setTab('products')}>{tr("Products")}</button>
              <button role="tab" aria-selected={tab === 'payments'} className={tab === 'payments' ? 'on' : ''} onClick={() => setTab('payments')}>{tr("Payments")}{dueTotal > 0 && <b aria-label={tr("Awaiting payment")} />}</button>
            </div>
            <div className="msp-lookswitch" role="group" aria-label={tr("Preview look")}>
        <span>{tr("Look")}</span>
        {[['vibrant', 'Vibrant'], ['showcase', 'Showcase'], ['compact', 'Compact']].map(([k, lb]) => (
          <button key={k} type="button" className={look === k ? 'on' : ''} aria-pressed={look === k} onClick={() => setLook(k)}>{lb}</button>
        ))}
      </div>
          </div>

            {tab === 'products' && (
              <>
                {alerts.length > 0 && (
                  <ul className="mg-alerts" aria-label={tr("Needs your attention")}>
                    {alerts.slice(0, 3).map((a) => (
                      <li key={a.id} className={`mg-alert mg-alert--${a.tone}`}>
                        <i aria-hidden="true">{a.tone === 'warn' ? '!' : '€'}</i><span>{tr(a.text)}</span>
                        <button className="msp-btn msp-btn--ghost msp-btn--sm" onClick={a.run}>{tr(a.action)}</button>
                      </li>
                    ))}
                  </ul>
                )}
                {live === 0 && (
                  <section className="lc" aria-label={tr("Launch checklist")}>
                    <header className="lc-head">
                      <div><strong>{tr("Launch checklist")}</strong><span>{cur >= 0 ? tr("Next: {0}", [steps[cur].d]) : tr("All set")}</span></div>
                      <div className="lc-prog" aria-label={tr("{0} of 3 steps done", [stepsDone])}><b>{stepsDone}/3</b><i style={{ '--p': `${(stepsDone / 3) * 100}%` }} /></div>
                    </header>
                    <ol className="lc-steps">
                      {steps.map((x, n) => (
                        <li key={x.t} className={`lc-step${x.done ? ' is-done' : n === cur ? ' is-current' : ''}`} aria-current={n === cur ? 'step' : undefined}>
                          <b>{x.done ? <IcCheck /> : n + 1}</b>
                          <span><strong>{x.t}</strong>{x.d}</span>
                        </li>
                      ))}
                    </ol>
                    {cur >= 0 && steps[cur].act && <button className="msp-btn msp-btn--primary lc-cta" onClick={steps[cur].act[1]}>{steps[cur].act[0]} →</button>}
                  </section>
                )}

                <section className="mg-panel">
                  {listings.length === 0 ? (
                    <div className="msp-empty">
                      <div className="msp-empty-ico" aria-hidden="true">▣</div>
                      <h2>{tr("Add your first product")}</h2>
                      <p>{tr("Create a listing, pick a section of the Services page, and go live in minutes.")}</p>
                      <button className="msp-btn msp-btn--primary" onClick={() => openEdit(null)}>{tr("+ Add product")}</button>
                    </div>
                  ) : shown.length === 0 ? (
                    <div className="msp-empty"><p>{tr("No product matches “{0}”.", [query.trim()])}</p></div>
                  ) : (
                    <>
                      <div className="mg-bar">
                        <div className="mg-filters" role="tablist">
                          {FILTERS.filter(([k]) => k === 'all' || counts[k]).map(([k, lb]) => (
                            <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{lb}<small>{counts[k] ?? 0}</small></button>
                          ))}
                        </div>
                        <label className="mg-sort">{tr("Sort")}<select value={sort} onChange={(e) => setSort(e.target.value)}>{SORTS.map(([k, lb]) => <option key={k} value={k}>{lb}</option>)}</select></label>
                      </div>
                      <ul className="mg-grid">
                        <li><button className="mg-new" onClick={() => openEdit(null)}><b>+</b><strong>{tr("New product")}</strong><small>{tr("Design a listing in the studio")}</small></button></li>
                        {visible.map((l) => {
                          const st = rowState(l)
                          const paid = Boolean(l.paidActive)
                          const ended = Boolean(l.placement && l.placement !== 'STANDARD' && !paid && l.placementUntil)
                          const archived = l.status === 'ARCHIVED'
                          const isLive = l.status === 'PUBLISHED'
                          const inReview = l.status === 'PENDING_REVIEW'
                          const sx = stats[l.id]
                          return (
                            <li className={`mg-card${archived ? ' is-archived' : ''}`} key={l.id}>
                              <button className={`mg-cover${l.imageUrl && isContainFit(l) ? ' if-smart' : ''}`} data-accent={!l.imageAccent || l.imageAccent === 'transparent' ? 'transparent' : undefined} onClick={() => openEdit(l)} aria-label={tr("Open {0} in the studio", [l.title])}
                                style={l.imageUrl && !isContainFit(l) ? imageFrameStyle(l) : l.imageUrl && l.imageAccent && l.imageAccent !== 'transparent' ? { '--pcard-accent': l.imageAccent } : l.imageUrl ? { backgroundImage: 'none', backgroundColor: 'transparent' } : { '--h': hue(l.title) }}>
                                {l.imageUrl && isContainFit(l) && (<>
                                  {l.imageAccent && l.imageAccent !== 'transparent' && <span className="if-smart-bg" aria-hidden="true" />}
                                  {l.imageAccent && l.imageAccent !== 'transparent' && <span className="if-smart-frame" aria-hidden="true" />}
                                  <span className="if-smart-fg" style={{ ...imageFrameStyle(l), ...fgInset(l) }} aria-hidden="true" />
                                </>)}
                                {!l.imageUrl && <b>{l.title?.[0]?.toUpperCase()}</b>}
                                <span className={`msp-badge msp-badge--${st.key} mg-status`}>{tr(st.label)}</span>
                                <span className="mg-open"><IcEditSm />{tr("Open studio")}</span>
                              </button>
                              <div className="mg-body">
                                <span className={`msp-badge msp-badge--${st.key} mg-status2`}>{tr(st.label)}</span>
                                <span className="mg-chip">{l.category || tr("Uncategorized")}</span>
                                {!isDistributor && !demo && !archived && audit?.manufacturerLinked && (l.auditProductRef
                                  ? <span className="mg-link" title={tr("Linked product in VigiCore Audit")}>{tr("Audit: {0}", [auditName(l.auditProductRef)])}</span>
                                  : <span className="mg-link mg-link--none" title={tr("Link it to its Audit product in the studio so buyers see it only if they can order it.")}>{tr("Not linked to Audit")}</span>)}
                                <h3>{tr(l.title)}</h3>
                                <p>{l.summary || tr("No summary yet — add one in the studio.")}</p>
                                {l.status === 'REJECTED' && l.reviewNote && <p className="mg-note">{tr("Not approved: {0}", [l.reviewNote])}</p>}
                                {isLive && (sx
                                  ? <div className="mg-stats" title={tr("Last 30 days")}><span><b>{sx.views}</b> {tr("views")}</span><span><b>{sx.clicks}</b> {tr("clicks")}</span><span><b>{sx.contacts}</b> {tr("contacts")}</span><Spark data={sx.series} /></div>
                                  : <div className="mg-stats mg-stats--empty">{tr("No visits yet")}</div>)}
                                <div className="mg-place"><i className={isLive ? 'on' : ''} />
                                  <span>{paid ? planOf(l.placement)?.name : isLive ? tr("Free catalog") : inReview ? tr("Awaiting validation") : tr("Not published")}{l.placementUntil && (paid || (ended && isLive)) && <small>{paid ? tr("Until") : tr("Ended")} {fmtDate(l.placementUntil)}</small>}</span>
                                </div>
                              </div>
                              <div className="mg-foot">
                                {archived ? (
                                  <button className="msp-btn msp-btn--primary msp-btn--sm" onClick={() => setArchived(l, false)}>{tr("Restore")}</button>
                                ) : (
                                  <>
                                    {isLive
                                      ? <button className="msp-btn msp-btn--primary msp-btn--sm" onClick={() => openPromote(l)} disabled={l.promoAllowed === false} title={l.promoAllowed === false ? tr("Not cleared for paid promotion") : undefined}>{paid ? tr("Change plan") : ended ? tr("Renew") : tr("Promote")}</button>
                                      : inReview
                                        ? <button className="msp-btn msp-btn--ghost msp-btn--sm" disabled>{tr("Awaiting validation")}</button>
                                        : <button className="msp-btn msp-btn--primary msp-btn--sm" onClick={() => (l.status === 'REJECTED' ? openEdit(l) : publishFree(l.id))}>{l.status === 'REJECTED' ? tr("Edit & resubmit") : tr("Publish for free")}</button>}
                                    {l.pendingOrder && <button className="msp-btn msp-btn--ghost msp-btn--sm" onClick={() => openPaymentDetails(l)}>{tr("Payment details")}</button>}
                                    <button className="msp-btn msp-btn--ghost msp-btn--sm" onClick={() => openEdit(l)}>{tr("Design")}</button>
                                    <button className="msp-btn msp-btn--ghost msp-btn--sm mg-ico mg-first" onClick={() => duplicate(l)} aria-label={tr("Duplicate {0}", [l.title])} title={tr("Duplicate")}><IcCopy /></button>
                                    <button className="msp-btn msp-btn--ghost msp-btn--sm mg-ico" onClick={() => setArchived(l, true)} aria-label={tr("Archive {0}", [l.title])} title={tr("Archive")}><IcArchive /></button>
                                  </>
                                )}
                                <button className={`msp-btn msp-btn--ghost msp-btn--sm msp-danger mg-ico${archived ? ' mg-first' : ''}`} onClick={() => remove(l)} aria-label={tr("Delete {0}", [l.title])} title={tr("Delete")}><IcTrash /></button>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </>
                  )}
                </section>
              </>
            )}

            {tab === 'payments' && (
              <>
                <div className="msp-kpis">
                  <div className="is-live"><i aria-hidden="true">✓</i><span>{tr("Total paid")}</span><strong>{fmt(paidTotal)}</strong></div>
                  <div><i aria-hidden="true">◷</i><span>{tr("Awaiting payment")}</span><strong>{fmt(dueTotal)}</strong></div>
                  <div><i aria-hidden="true">▤</i><span>{tr("Orders")}</span><strong>{orders.length}</strong></div>
                </div>
                <section className="mg-panel">
                  {orders.length === 0 ? (
                    <div className="msp-empty"><div className="msp-empty-ico" aria-hidden="true">€</div><h2>{tr("No payments yet")}</h2><p>{tr("Your orders and their payment status will appear here once you promote a product.")}</p></div>
                  ) : (
                    <ul className="mg-orders">
                      <li className="mg-or mg-or-h"><span>{tr("Reference")}</span><span>{tr("Product")}</span><span>{tr("Plan")}</span><span>{tr("Amount")}</span><span>{tr("Date")}</span><span>{tr("Status")}</span></li>
                      {orders.map((o) => (
                        <li className="mg-or" key={o.id}>
                          <span className="mg-ref">{o.reference}</span>
                          <span className="mg-or-t">{o.listingTitle}</span>
                          <span>{planOf(o.placement)?.name ?? o.placement}<small>{tr("{0} mo · {1}", [o.months, pricing.paymentMethods.find((m) => m.id === o.paymentMethod)?.name ?? o.paymentMethod])}</small></span>
                          <span className="mg-amt">{fmt(o.total)}</span>
                          <span>{fmtDate(o.createdAt)}</span>
                          <span className="mg-or-s">
                            <b className={`msp-badge msp-badge--${o.status.toLowerCase()}`}>{ORDER_LABEL[o.status] ?? tr(o.status)}</b>
                            {o.status === 'PENDING' && !demo && (<>
                              {o.listingId && <button className="msp-btn msp-btn--ghost msp-btn--sm" onClick={() => openOrder(o)}>{tr("How to pay")}</button>}
                              <label className={`msp-btn msp-btn--sm ${o.receiptSent ? 'msp-btn--ghost' : 'msp-btn--primary'} mg-file`}>
                                {o.receiptSent ? tr("✓ Receipt sent · replace") : tr("Upload receipt")}
                                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { sendReceipt(o, e.target.files[0]); e.target.value = '' }} />
                              </label>
                            </>)}
                            {o.status === 'PAID' && !demo && <a className="msp-btn msp-btn--ghost msp-btn--sm mg-file" href={`/dashboard/invoice/${o.id}`} target="_blank" rel="noopener noreferrer">{tr("Invoice")}</a>}
                            {o.status === 'CANCELLED' && o.adminNote && <small className="mg-note">{tr("Rejected: {0}", [o.adminNote])}</small>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </main>

      {drawer?.mode === 'promote' && <div className="msp-overlay" onClick={closeDrawer} />}
      
      {toast && <div className="mg-toast" role="status">{toast}</div>}
      {drawer?.mode === 'edit' && (
        <ProductStudio
          key={drawer.id ?? 'new'}
          initial={form} listing={target} pricing={pricing} orgName={session.user?.activeEstablishmentName ?? 'Your company'}
          featuredBlocked={featuredBlocked} selling={isDistributor} onClose={closeDrawer} onSave={persist} onPublish={publishFromStudio} onPublishFree={publishFree}
          audit={isDistributor || demo ? undefined : audit}
        />
      )}
      {drawer?.mode === 'promote' && (
        <aside className="msp-drawer" role="dialog" aria-modal="true">
          <div className="msp-drawer-head">
            <h2>{tr("Promote “{0}”", [target?.title])}</h2>
            <button className="msp-x" onClick={closeDrawer} aria-label={tr("Close")}>✕</button>
          </div>

          {drawer.mode === 'promote' && !done && (
            <div className="msp-body">
              <ol className="msp-steps"><li className={step >= 1 ? 'on' : ''}>{tr("Placement")}</li><li className={step >= 2 ? 'on' : ''}>{tr("Payment")}</li></ol>
              {step === 1 && (
                <>
                  <div className="msp-list" role="radiogroup">
                    {pricing.placements.filter((p) => p.monthlyPrice > 0).map((p) => {
                      const blocked = p.id === 'FEATURED' && featuredBlocked(drawer.id)
                      return (
                        <button key={p.id} role="radio" aria-checked={p.id === placement} disabled={blocked} data-plan={p.id} className={`msp-opt${p.id === placement ? ' on' : ''}`} onClick={() => setPlacement(p.id)}>
                          <i className={`msp-pos msp-pos--${p.id}`} aria-hidden="true"><b /><b /><b /><b /></i>
                          <span>
                            <strong>{tr(p.name)}</strong><em className={p.id === 'RECOMMENDED' ? 'msp-hot' : ''}>{tr(p.tag)}</em><small>{p.section}</small>
                            {blocked && <small className="msp-taken">{tr("Taken by another partner until {0}", [fmtDate(pricing.featuredTakenUntil)])}</small>}
                          </span>
                          <b>{fmt(p.monthlyPrice)}<small>{tr("/mo")}</small></b>
                        </button>
                      )
                    })}
                  </div>
                  <div className="msp-seg" role="group" aria-label={tr("Duration")}>
                    {pricing.durations.map((d) => {
                      const save = Math.round((plan.monthlyPrice * d.months * d.discountPercent) / 100)
                      return (
                        <button key={d.months} className={d.months === months ? 'on' : ''} onClick={() => setMonths(d.months)}>
                          <strong>{d.months} {tr("mo")}</strong>
                          <small>{d.discountPercent > 0 ? <>−{d.discountPercent}% · {tr("save")} {fmt(save)}</> : tr("No commitment")}</small>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
              {step === 2 && (
                <div className="msp-list">
                  {pricing.paymentMethods.map((p) => (
                    <label key={p.id} className={`msp-opt${p.id === payment ? ' on' : ''}${p.enabled ? '' : ' is-disabled'}`}>
                      <input type="radio" name="pay" disabled={!p.enabled} checked={p.id === payment} onChange={() => setPayment(p.id)} />
                      <span><strong>{tr(p.name)}</strong><small>{tr(p.hint)}</small></span>
                    </label>
                  ))}
                </div>
              )}
              {msg && <p className="msp-msg msp-msg--err">{tr(msg)}</p>}
              <div className="msp-sum">
                <div><span>{tr("{0} × {1} mo", [plan.name, months])}</span><span>{fmt(subtotal)}</span></div>
                {discount > 0 && <div><span>{tr("Duration discount")}</span><span>− {fmt(discount)}</span></div>}
                <div className="msp-total"><span>{tr("Total")}</span><span>{fmt(total)}</span></div>
              </div>
              <div className="msp-foot">
                <span className="msp-foot-note">{step === 1 ? tr("Invoice provided once payment is confirmed") : tr("Your promotion starts once we confirm the payment")}</span>
                {step === 2 && <button className="msp-btn msp-btn--ghost" onClick={() => setStep(1)}>{tr("Back")}</button>}
                {step === 1 ? <button className="msp-btn msp-btn--primary" onClick={() => setStep(2)}>{tr("Continue")}</button>
                  : <button className="msp-btn msp-btn--primary" disabled={busy || !method?.enabled} onClick={pay}>{busy ? tr("Processing…") : demo ? tr("Pay {0}", [fmt(total)]) : tr("Place order · {0}", [fmt(total)])}</button>}
              </div>
            </div>
          )}

          {drawer.mode === 'promote' && done && (demo || !order) && (
            <div className="msp-empty">
              <div className="msp-empty-ico ok" aria-hidden="true">✓</div>
              <h2>{tr("Preview complete")}</h2>
              <p>{tr("“{0}” is now promoted in {1}. No real payment was made.", [target?.title, plan.name])}</p>
              <button className="msp-btn msp-btn--primary" onClick={closeDrawer}>{tr("Done")}</button>
            </div>
          )}

          {drawer.mode === 'promote' && done && !demo && order && (
            <div className="msp-body">
              <div className="msp-empty-ico ok" aria-hidden="true" style={{ alignSelf: 'center' }}>✓</div>
              <h2 style={{ textAlign: 'center', margin: 0 }}>{tr("Order placed — awaiting payment")}</h2>
              <p className="msp-note">{tr("Send {0} via {1}, quoting the reference below. “{2}” is promoted in {3} for {4} month{5} once we confirm the payment. Meanwhile it stays in the free catalog.", [fmt(order.total), orderMethod?.name ?? order.paymentMethod, target?.title, orderPlan?.name ?? order.placement, order.months, order.months > 1 ? 's' : ''])}</p>
              <div className="msp-pay-box">
                <div><span>{tr("Order reference")}</span><strong className="msp-ref">{order.reference}</strong><button className="msp-btn msp-btn--ghost msp-btn--sm" onClick={copyReference}>{copied ? tr("Copied") : tr("Copy")}</button></div>
                <div><span>{tr("Amount")}</span><strong>{fmt(order.total)}</strong></div>
                {order.instructions && <div><span>{tr("Beneficiary")}</span><strong>{order.instructions.beneficiary}</strong></div>}
                {order.instructions && <div><span>{order.paymentMethod === 'BANK_TRANSFER' ? tr("RIB") : tr("CCP account")}</span><strong>{order.instructions.account}</strong></div>}
              </div>
              <p className="msp-note">{tr("You can find these details again from “Payment details” in your product list.")}</p>
              <div className="msp-foot"><button className="msp-btn msp-btn--primary" onClick={closeDrawer}>{tr("Done")}</button></div>
            </div>
          )}
        </aside>
      )}
    </>
  )
}

