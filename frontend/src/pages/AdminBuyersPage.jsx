import React, { useCallback, useEffect, useState } from 'react'
import StaffShell, { StaffGate } from '../components/staff/StaffShell.jsx'
import { getSession } from '../lib/auth.js'
import { adminListBuyers, adminReviewBuyer, adminListManufacturers, adminLinkManufacturer, CATEGORY_LABEL } from '../lib/market.js'
import './manage/manage-services.css'
import './manage/msp-gallery.css'
import './manage/admin-payments.css'
import { fmtDate } from '../lib/format.js'
import { tr, localeTag } from '../i18n/translate.js'

const TABS = [['DECLARED', 'À vérifier'], ['VERIFIED', 'Vérifiées'], ['REJECTED', 'Refusées'], ['all', 'Toutes']]
const LABEL = { DECLARED: 'À vérifier', VERIFIED: 'Vérifiée', REJECTED: 'Refusée' }
const BADGE = { DECLARED: 'pending', VERIFIED: 'paid', REJECTED: 'cancelled' }
const TYPE = { HOSPITAL: 'Hôpital', CLINIQUE: 'Clinique', CENTRE_MEDICAL: 'Centre médical', OFFICINE: 'Officine', LABORATOIRE: 'Laboratoire', SUPPLIER: 'Fournisseur' }

// Agrément du distributeur en gros : jour AAAA-MM-JJ (le serveur le stocke à 00:00 UTC), affiché JJ/MM/AAAA.
const isoDay = (v) => (v ? String(v).slice(0, 10) : '')
const dayFr = (iso) => (iso ? iso.split('-').reverse().join('/') : '')
const todayIso = () => new Date().toISOString().slice(0, 10)

/**
 * Staff VigiCore : vérifie la catégorie d'acheteur déclarée par un établissement (public / privé / distributeur / export).
 * Seule une catégorie VÉRIFIÉE et autorisée permet d'envoyer une demande de commande à un fabricant.
 * Vérifier sur pièces (agrément de distribution, statut d'établissement public…) avant de valider.
 * Distributeur en gros : le staff peut consigner le n° et la date d'agrément vus sur pièces. OPTIONNEL pour l'instant
 * (obligatoire ? à confirmer : encadrant/MIPH) : un distributeur vérifié sans agrément complet est seulement signalé.
 */
export default function AdminBuyersPage() {
  const [session, setSession] = useState({ status: 'checking', user: null })
  const [status, setStatus] = useState('DECLARED')
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [rejecting, setRejecting] = useState(null) // { id, note }
  const [appr, setAppr] = useState({}) // id -> { number, date } saisis (agrément distributeur)
  const [toast, setToast] = useState(null)
  const [view, setView] = useState('buyers') // buyers | manufacturers

  useEffect(() => { document.documentElement.setAttribute('data-theme', localStorage.getItem('vg-theme') ?? 'dark') }, [])
  useEffect(() => {
    let off = false
    getSession().then((r) => { if (!off) setSession(r.ok ? { status: 'checked', user: r.data.user } : { status: 'unavailable', user: null }) })
    return () => { off = true }
  }, [])
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t) }, [toast])

  const load = useCallback(async (st) => {
    setRows(null); setError(null)
    const r = await adminListBuyers(st)
    if (r.ok) setRows(r.data.buyers ?? []); else setError(r.error)
  }, [])
  useEffect(() => { if (session.user?.isPlatformAdmin) load(status) }, [session.user, status, load])

  const apprOf = (b) => appr[b.id] ?? { number: b.approvalNumber ?? '', date: isoDay(b.approvalDate) }
  // Envoyé seulement pour un distributeur vérifié ; champ vide => null (effacé côté serveur, sans effet s'il était déjà vide).
  const apprPayload = (b) => { const a = apprOf(b); return { approvalNumber: a.number.trim() || null, approvalDate: a.date || null } }

  async function review(b, decision, note, approval) {
    setBusyId(b.id)
    const r = await adminReviewBuyer(b.id, decision, note, approval)
    setBusyId(null)
    if (!r.ok) return setToast(tr(r.error))
    setRejecting(null)
    setAppr((p) => { const { [b.id]: _drop, ...rest } = p; return rest })
    if (decision !== 'VERIFIED') setToast(tr('{0} : catégorie refusée.', [b.name]))
    else if (r.data?.buyer?.approvalIncomplete) setToast(tr('{0} : catégorie vérifiée — agrément distributeur non renseigné ou incomplet.', [b.name]))
    else setToast(tr('{0} : catégorie vérifiée.', [b.name]))
    load(status)
  }

  return (
    <StaffShell user={session.user} loading={session.status === 'checking'} section="Staff · Acheteurs">
      <main className="msp ap">
        <StaffGate session={session}>
        <header className="msp-head mh">
          <div className="mh-main">
            <h1>{view === 'buyers' ? <>{tr('Acheteurs')} <span>{tr('vérification')}</span></> : <>{tr('Fabricants')} <span>{tr('liaison')}</span></>}</h1>
            <p>{view === 'buyers'
              ? tr("Vérifiez sur pièces la catégorie déclarée (agrément de distribution, établissement public…) : seule une catégorie vérifiée permet de commander auprès des fabricants.")
              : tr("Liez l'établissement qui publie une fiche produit au fabricant de VigiCore Audit : ses offres apparaissent alors sur la fiche, avec le bouton « Commander ».")}</p>
          </div>
        </header>

        <div className="mg-tabs ab-views" role="tablist" aria-label={tr('Vue')}>
          <button role="tab" aria-selected={view === 'buyers'} className={view === 'buyers' ? 'on' : ''} onClick={() => setView('buyers')}>{tr('Acheteurs')}</button>
          <button role="tab" aria-selected={view === 'manufacturers'} className={view === 'manufacturers' ? 'on' : ''} onClick={() => setView('manufacturers')}>{tr('Fabricants')}</button>
        </div>

        {view === 'manufacturers' ? <ManufacturersView onToast={setToast} /> : <>
        <div className="mg-tabs" role="tablist">
          {TABS.map(([k, lb]) => <button key={k} role="tab" aria-selected={status === k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{tr(lb)}</button>)}
        </div>

        {error && <div className="msp-empty"><h2>{/staff/i.test(error) ? tr('Accès refusé') : tr('Chargement impossible')}</h2><p>{tr(error)}</p></div>}
        {!error && rows === null && <p className="ap-loading">{tr('Chargement…')}</p>}
        {!error && rows?.length === 0 && <div className="msp-empty"><h2>{tr('Rien à afficher')}</h2><p>{tr('Aucune déclaration dans cette liste.')}</p></div>}

        {rows?.length > 0 && (
          <ul className="ap-list">
            {rows.map((b) => (
              <li className="ap-row" key={b.id}>
                <div className="ap-main">
                  <span className="mg-ref">{tr(TYPE[b.type] ?? b.type)}</span>
                  <strong>{b.name}</strong>
                  <small>{b.declaredBy ? `${b.declaredBy.displayName} (${b.declaredBy.email})` : tr('Déclarant inconnu')}</small>
                </div>
                <div className="ap-plan">
                  <span>{tr(CATEGORY_LABEL[b.buyerCategory] ?? b.buyerCategory)}</span>
                  <small>{b.buyerCategoryDeclaredAt ? tr('Déclarée le {0}', [fmtDate(b.buyerCategoryDeclaredAt, 'short', localeTag())]) : ''}</small>
                  {b.buyerCategory === 'DISTRIBUTOR' && (b.approvalNumber || b.approvalDate) && (
                    <small>{tr('Agrément')} {b.approvalNumber ?? '—'}{b.approvalDate ? ` · ${dayFr(isoDay(b.approvalDate))}` : ''}</small>
                  )}
                </div>
                <div className="ap-state">
                  <span className={`msp-badge msp-badge--${BADGE[b.buyerCategoryStatus] ?? 'pending'}`}>{tr(LABEL[b.buyerCategoryStatus] ?? b.buyerCategoryStatus)}</span>
                  {b.approvalIncomplete && <small className="ab-flag">{tr('⚠ Agrément distributeur non renseigné ou incomplet')}</small>}
                  {b.buyerCategoryReviewedBy && <small>{b.buyerCategoryReviewedBy}</small>}
                  {b.buyerCategoryNote && <small title={b.buyerCategoryNote}>“{b.buyerCategoryNote}”</small>}
                </div>
                <div className="ap-act">
                  {rejecting?.id === b.id ? (
                    <>
                      <input className="ab-note" autoFocus value={rejecting.note} maxLength={500} placeholder={tr('Motif (visible par l’établissement)')}
                        onChange={(e) => setRejecting({ id: b.id, note: e.target.value })} />
                      <button className="msp-btn msp-btn--ghost msp-btn--sm msp-danger" disabled={busyId === b.id || !rejecting.note.trim()} onClick={() => review(b, 'REJECTED', rejecting.note.trim())}>{tr('Refuser')}</button>
                      <button className="msp-btn msp-btn--ghost msp-btn--sm" onClick={() => setRejecting(null)}>{tr('Annuler')}</button>
                    </>
                  ) : (
                    <>
                      {b.buyerCategoryStatus !== 'VERIFIED' && <button className="msp-btn msp-btn--primary msp-btn--sm" disabled={busyId === b.id} onClick={() => review(b, 'VERIFIED', undefined, b.buyerCategory === 'DISTRIBUTOR' ? apprPayload(b) : undefined)}>{tr('Vérifier')}</button>}
                      {b.buyerCategoryStatus !== 'REJECTED' && <button className="msp-btn msp-btn--ghost msp-btn--sm msp-danger" disabled={busyId === b.id} onClick={() => setRejecting({ id: b.id, note: '' })}>{tr('Refuser')}</button>}
                    </>
                  )}
                </div>
                {b.buyerCategory === 'DISTRIBUTOR' && b.buyerCategoryStatus !== 'REJECTED' && rejecting?.id !== b.id && (
                  <ApprovalFields
                    value={apprOf(b)}
                    onChange={(v) => setAppr((p) => ({ ...p, [b.id]: v }))}
                    verified={b.buyerCategoryStatus === 'VERIFIED'}
                    busy={busyId === b.id}
                    onSave={() => review(b, 'VERIFIED', undefined, apprPayload(b))}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        </>}
        {toast && <div className="mg-toast" role="status">{toast}</div>}
        </StaffGate>
      </main>
    </StaffShell>
  )
}

/**
 * Agrément du distributeur en gros (n° + date), saisi d'après les pièces vues. Facultatif pour l'instant :
 * obligatoire ? à confirmer (encadrant/MIPH). Un agrément incomplet n'empêche pas de vérifier, il est seulement signalé.
 */
function ApprovalFields({ value, onChange, verified, busy, onSave }) {
  const incomplete = !value.number.trim() || !value.date
  return (
    <div className="ab-appr">
      <label>
        <span>{tr("N° d'agrément")}</span>
        <input className="ab-note" value={value.number} maxLength={60} autoComplete="off"
          onChange={(e) => onChange({ ...value, number: e.target.value })} />
      </label>
      <label>
        <span>{tr("Date d'agrément")}</span>
        <input className="ab-note" type="date" value={value.date} max={todayIso()}
          onChange={(e) => onChange({ ...value, date: e.target.value })} />
      </label>
      {verified && <button className="msp-btn msp-btn--ghost msp-btn--sm" disabled={busy} onClick={onSave}>{tr("Enregistrer l'agrément")}</button>}
      <small className={incomplete ? 'ab-flag' : undefined}>
        {incomplete
          ? tr("Agrément non renseigné ou incomplet : la vérification reste possible (facultatif pour l'instant, à confirmer avec l'encadrant / le MIPH) mais sera signalée.")
          : tr("Facultatif pour l'instant — à confirmer avec l'encadrant / le MIPH.")}
      </small>
    </div>
  )
}

/** Staff : lier / délier un établissement (LABORATOIRE / SUPPLIER) à un fabricant d'Audit (qui publie des offres). */
function ManufacturersView({ onToast }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [pick, setPick] = useState({}) // establishmentId -> manufacturerRef choisi
  const [busyId, setBusyId] = useState(null)
  const load = useCallback(async () => {
    setError(null)
    const r = await adminListManufacturers()
    if (r.ok) setData(r.data); else setError(r.error)
  }, [])
  useEffect(() => { load() }, [load])

  async function link(est, ref) {
    setBusyId(est.id)
    const r = await adminLinkManufacturer(est.id, ref)
    setBusyId(null)
    if (!r.ok) return onToast(tr(r.error))
    onToast(ref ? tr('{0} est lié au fabricant.', [est.name]) : tr('{0} n’est plus lié.', [est.name]))
    setPick((p) => ({ ...p, [est.id]: undefined }))
    load()
  }

  if (error) return <div className="msp-empty"><h2>{/staff/i.test(error) ? tr('Accès refusé') : tr('Chargement impossible')}</h2><p>{tr(error)}</p></div>
  if (!data) return <p className="ap-loading">{tr('Chargement…')}</p>
  const nameOf = (ref) => data.manufacturers.find((m) => m.ref === ref)?.name ?? ref
  const linkedTo = new Map(data.establishments.filter((e) => e.auditManufacturerRef).map((e) => [e.auditManufacturerRef, e.name]))
  return (
    <>
      {data.manufacturersUnavailable && <p className="ab-warn">{tr('VigiCore Audit est injoignable : la liste des fabricants est vide pour le moment.')}</p>}
      {data.establishments.length === 0
        ? <div className="msp-empty"><h2>{tr('Rien à afficher')}</h2><p>{tr('Aucun établissement de type laboratoire ou fournisseur.')}</p></div>
        : (
          <ul className="ap-list">
            {data.establishments.map((e) => {
              const chosen = pick[e.id] ?? ''
              return (
                <li className="ap-row" key={e.id}>
                  <div className="ap-main">
                    <span className="mg-ref">{tr(TYPE[e.type] ?? e.type)}</span>
                    <strong>{e.name}</strong>
                    <small>{e.auditManufacturerRef ? tr('Lié à {0}', [nameOf(e.auditManufacturerRef)]) : tr('Aucun fabricant lié')}</small>
                  </div>
                  <div className="ap-plan">
                    {e.auditManufacturerRef
                      ? <><span>{nameOf(e.auditManufacturerRef)}</span><small>{e.auditManufacturerLinkedAt ? tr('Lié le {0}', [fmtDate(e.auditManufacturerLinkedAt, 'short', localeTag())]) : ''}</small></>
                      : (
                        <label className="ab-pick">
                          <span className="sr-only">{tr('Fabricant')}</span>
                          <select value={chosen} onChange={(ev) => setPick((p) => ({ ...p, [e.id]: ev.target.value }))}>
                            <option value="">{tr('Choisir un fabricant…')}</option>
                            {data.manufacturers.map((m) => (
                              <option key={m.ref} value={m.ref} disabled={linkedTo.has(m.ref)}>
                                {m.name} ({tr('{0} offre(s)', [m.offers])}){linkedTo.has(m.ref) ? ` — ${tr('déjà lié')}` : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                  </div>
                  <div className="ap-state">
                    <span className={`msp-badge msp-badge--${e.auditManufacturerRef ? 'paid' : 'pending'}`}>{e.auditManufacturerRef ? tr('Lié') : tr('Non lié')}</span>
                    {e.auditManufacturerLinkedBy && <small>{e.auditManufacturerLinkedBy}</small>}
                  </div>
                  <div className="ap-act">
                    {e.auditManufacturerRef
                      ? <button className="msp-btn msp-btn--ghost msp-btn--sm msp-danger" disabled={busyId === e.id} onClick={() => link(e, null)}>{tr('Délier')}</button>
                      : <button className="msp-btn msp-btn--primary msp-btn--sm" disabled={busyId === e.id || !chosen} onClick={() => link(e, chosen)}>{tr('Lier')}</button>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
    </>
  )
}
