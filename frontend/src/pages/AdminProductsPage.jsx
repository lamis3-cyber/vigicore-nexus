import React, { useCallback, useEffect, useState } from 'react'
import StaffShell, { StaffGate } from '../components/staff/StaffShell.jsx'
import { getSession } from '../lib/auth.js'
import { adminListListings, adminApproveListing, adminRejectListing } from '../lib/services.js'
import { fmtDate } from '../lib/format.js'
import { tr, localeTag } from '../i18n/translate.js'
import './manage/manage-services.css'
import './manage/msp-gallery.css'
import './manage/admin-payments.css'

const TABS = [['PENDING', 'À valider'], ['APPROVED', 'Validés'], ['REJECTED', 'Refusés'], ['all', 'Tous']]
const BADGE = { PENDING: ['pending', 'À valider'], APPROVED: ['paid', 'Validé'], REJECTED: ['cancelled', 'Refusé'] }

/**
 * Produit VigiCore Audit lié à la fiche (étape 2) : le staff voit à quel produit le fabricant l'a rattachée, et si ce
 * produit lui appartient toujours (auditProductCheck : OK | NOT_FOUND | UNKNOWN = Audit injoignable).
 */
function AuditLink({ l }) {
  if (l.sellerKind === 'DISTRIBUTOR') return null
  if (!l.auditProductRef) return <p className="stf-audit">{tr('Produit Audit : non liée (visibilité selon la règle du fabricant).')}</p>
  if (l.auditProductCheck === 'OK' && l.auditProduct) {
    const p = l.auditProduct
    const name = p.reference ? `${p.name} · ${p.reference}` : p.name
    // 2026-10-29 : titre de la fiche sans rapport avec le produit lié (le fabricant a confirmé) — à vérifier avant de valider.
    if (l.auditProductMismatch) {
      return <p className="stf-audit stf-audit--warn" role="status">{tr("Produit Audit lié : {0} — ne correspond pas au titre de la fiche. Les acheteurs commanderaient ce produit : à vérifier avant de valider.", [name])}</p>
    }
    return <p className="stf-audit stf-audit--ok">{tr('Produit Audit lié : {0}', [name])}</p>
  }
  if (l.auditProductCheck === 'NOT_FOUND') {
    return <p className="stf-audit stf-audit--warn" role="status">{tr("Produit Audit lié introuvable (réf. {0}) : retiré d'Audit ou d'un autre fabricant. À vérifier avant de valider.", [l.auditProductRef])}</p>
  }
  return <p className="stf-audit">{tr('Produit Audit lié : réf. {0} (Audit injoignable, non vérifié).', [l.auditProductRef])}</p>
}

/** Staff: review the products organizations published. Approving checks the listing text/photo, not the product's legal status. */
export default function AdminProductsPage() {
  const [session, setSession] = useState({ status: 'checking', user: null })
  const [review, setReview] = useState('PENDING')
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [rejecting, setRejecting] = useState(null) // { id, note }
  const [toast, setToast] = useState(null)
  const [tick, setTick] = useState(0) // re-counts the sidebar badges after a decision

  useEffect(() => { document.documentElement.setAttribute('data-theme', localStorage.getItem('vg-theme') ?? 'dark') }, [])
  useEffect(() => {
    let off = false
    getSession().then((r) => { if (!off) setSession(r.ok ? { status: 'checked', user: r.data.user } : { status: 'unavailable', user: null }) })
    return () => { off = true }
  }, [])
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t) }, [toast])

  const load = useCallback(async (rv) => {
    setRows(null); setError(null)
    const r = await adminListListings(rv)
    if (r.ok) setRows(r.data.listings ?? []); else setError(tr(r.error))
  }, [])
  useEffect(() => { if (session.user?.isPlatformAdmin) load(review) }, [session.user, review, load])

  async function approve(l, allowPromotion) {
    setBusyId(l.id)
    const r = await adminApproveListing(l.id, allowPromotion)
    setBusyId(null)
    if (!r.ok) return setToast(r.error)
    setToast(allowPromotion ? tr('« {0} » validé — promotion payante autorisée.', [l.title]) : tr('« {0} » validé.', [l.title]))
    setTick((t) => t + 1); load(review)
  }
  async function refuse() {
    const { id, note } = rejecting
    if (!note.trim()) return setToast(tr('Indiquez un motif : le fournisseur le verra.'))
    setBusyId(id)
    const r = await adminRejectListing(id, note)
    setBusyId(null)
    if (!r.ok) return setToast(r.error)
    setRejecting(null); setToast(tr('Fiche refusée. Le fournisseur verra le motif.'))
    setTick((t) => t + 1); load(review)
  }

  return (
    <StaffShell user={session.user} loading={session.status === 'checking'} section="Staff · Produits" refreshKey={tick}>
      <main className="msp ap">
        <StaffGate session={session}>
          <div className="stf-head">
            <div>
              <h1>{tr('Validation')} <span style={{ color: 'var(--cyan)' }}>{tr('des produits')}</span></h1>
              <p>{tr("Chaque fiche est contrôlée avant d'être publique. Valider contrôle les informations affichées ; ce n'est pas une autorisation réglementaire du produit.")}</p>
            </div>
          </div>

          <div className="mg-tabs" role="tablist">
            {TABS.map(([k, lb]) => <button key={k} role="tab" aria-selected={review === k} className={review === k ? 'on' : ''} onClick={() => setReview(k)}>{tr(lb)}</button>)}
          </div>

          {error && <div className="msp-empty"><h2>{tr('Chargement impossible')}</h2><p>{error}</p></div>}
          {!error && rows === null && <p className="ap-loading">{tr('Chargement…')}</p>}
          {!error && rows?.length === 0 && <div className="msp-empty"><div className="msp-empty-ico ok" aria-hidden="true">✓</div><h2>{tr('Rien ici')}</h2><p>{tr('Aucune fiche dans cette liste.')}</p></div>}

          {rows?.length > 0 && (
            <ul className="stf-cards">
              {rows.map((l) => {
                const [bk, bl] = BADGE[l.reviewStatus] ?? ['pending', l.reviewStatus]
                const open = rejecting?.id === l.id
                return (
                  <li className="stf-card" key={l.id}>
                    {l.imageUrl ? <img className="stf-card-img" src={l.imageUrl} alt="" /> : <div className="stf-card-img stf-card-ph" aria-hidden="true">{l.title?.[0]?.toUpperCase()}</div>}
                    <div>
                      <h3>{l.title} <span className={`msp-badge msp-badge--${bk}`} style={{ marginLeft: 6 }}>{tr(bl)}</span></h3>
                      <div className="stf-meta">
                        <span><b>{l.organization}</b></span>
                        <span>{l.requestedBy.name} ({l.requestedBy.email})</span>
                        <span>{tr('Mis à jour le {0}', [fmtDate(l.updatedAt, 'short', localeTag())])}</span>
                        {l.category && <span className="stf-chip">{l.category}</span>}
                        {l.reviewStatus === 'APPROVED' && <span className="stf-chip">{l.promoAllowed ? tr('Promotion autorisée') : tr('Catalogue gratuit seulement')}</span>}
                      </div>
                      <AuditLink l={l} />
                      <p className="stf-sum">{l.summary}</p>
                      <p className="stf-desc">{(l.description ?? '').slice(0, 600)}{(l.description ?? '').length > 600 ? '…' : ''}</p>
                      {(l.contactEmail || l.contactPhone || l.website) && <div className="stf-meta" style={{ marginTop: 8 }}>{[l.contactEmail, l.contactPhone, l.website].filter(Boolean).map((c) => <span key={c}>{c}</span>)}</div>}
                      {l.reviewStatus === 'REJECTED' && l.reviewNote && <p className="stf-check">{tr('Motif envoyé : {0}', [l.reviewNote])}</p>}

                      {l.reviewStatus !== 'APPROVED' && <p className="stf-check">{tr("À vérifier : le nom et la photo correspondent au produit · la catégorie est correcte · pas d'allégation thérapeutique non justifiée · contact valide. Pour un médicament ou un dispositif, contrôlez les pièces avant « Valider + autoriser la promotion ».")}</p>}

                      <div className="stf-actions">
                        {l.reviewStatus !== 'APPROVED' && <>
                          <button className="msp-btn msp-btn--primary msp-btn--sm" disabled={busyId === l.id} onClick={() => approve(l, false)}>{tr('Valider')}</button>
                          <button className="msp-btn msp-btn--ghost msp-btn--sm" disabled={busyId === l.id} onClick={() => approve(l, true)}>{tr('Valider + autoriser la promotion')}</button>
                        </>}
                        {l.reviewStatus === 'APPROVED' && !l.promoAllowed && <button className="msp-btn msp-btn--ghost msp-btn--sm" disabled={busyId === l.id} onClick={() => approve(l, true)}>{tr('Autoriser la promotion')}</button>}
                        {l.reviewStatus !== 'REJECTED' && <button className="msp-btn msp-btn--ghost msp-btn--sm msp-danger" disabled={busyId === l.id} onClick={() => setRejecting(open ? null : { id: l.id, note: '' })}>{tr('Refuser')}</button>}
                      </div>

                      {open && (
                        <div className="stf-reject">
                          <textarea autoFocus value={rejecting.note} maxLength={300} placeholder={tr('Motif visible par le fournisseur (ex. : la photo ne correspond pas au produit)')} onChange={(e) => setRejecting({ ...rejecting, note: e.target.value })} />
                          <div className="stf-actions" style={{ marginTop: 0 }}>
                            <button className="msp-btn msp-btn--primary msp-btn--sm" disabled={busyId === l.id} onClick={refuse}>{tr('Envoyer le refus')}</button>
                            <button className="msp-btn msp-btn--ghost msp-btn--sm" onClick={() => setRejecting(null)}>{tr('Annuler')}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </StaffGate>
      </main>
      {toast && <div className="mg-toast" role="status">{toast}</div>}
    </StaffShell>
  )
}
