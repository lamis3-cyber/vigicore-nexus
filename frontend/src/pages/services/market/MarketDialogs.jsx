import React, { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CATEGORY_LABEL, NOTE_MAX, composeOrderNote, newRequestKey, sendInterest, sendOrder,
} from '../../../lib/market.js'
import { tr, localeTag } from '../../../i18n/translate.js'
import './market-dialogs.css'

/**
 * Fenêtres de la fiche produit publique /services/:id (sans paiement en ligne — loi 18-05) :
 * fenêtre accessible, demande de COMMANDE (OrderForm — la seule notion côté acheteur), déclaration de la catégorie d'acheteur.
 * La commande se passe ici, sur la fiche, juste après la connexion ; son SUIVI est dans le tableau de bord (page « Commandes »).
 */
export const money = (n) => (typeof n === 'number' ? `${n.toLocaleString(localeTag(), { maximumFractionDigits: 2 })} DA` : '—')

export const BLOCKER = {
  NOT_ESTABLISHMENT_ADMIN: "Seuls l'administrateur ou le pharmacien de votre établissement peuvent commander.",
  CATEGORY_NOT_DECLARED: "Vos demandes de commande sont validées au cas par cas par le fabricant.",
  CATEGORY_NOT_VERIFIED: 'Catégorie en cours de vérification par VigiCore. En attendant, vos demandes de commande sont validées au cas par cas par le fabricant.',
  CATEGORY_REJECTED: 'Catégorie non validée par VigiCore.',
  CATEGORY_NOT_ALLOWED: "Votre catégorie ne permet pas d'acheter directement auprès des fabricants : adressez-vous à un distributeur.",
}

/** Établissement au nom duquel on agit : le premier que j'administre, sinon le premier dont je suis membre. */
export const buyerEstablishment = (me) => {
  const list = me?.establishments ?? []
  return list.find((e) => e.isAdmin) ?? list[0] ?? null
}
/** Ce compte peut-il envoyer une DEMANDE DE COMMANDE pour cette offre ? (pré-vérification ; le serveur tranche) */
export const canOrderOffer = (est, offer) => !!est?.canOrder && (offer?.orderableBy ?? []).includes(est.buyerCategory)

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

export function Modal({ title, onClose, children }) {
  const ref = useRef(null)
  const titleId = useId()
  // onClose change à chaque rendu du parent : on le lit dans une ref pour que l'effet (focus initial,
  // piège à focus, retour du focus) ne tourne qu'à l'ouverture — sinon le focus sauterait pendant la saisie.
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const opener = document.activeElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.classList.add('mfc-modal-open') // la barre de navigation passe sous la fenêtre
    const first = ref.current?.querySelector('.mfc-modal-body ' + FOCUSABLE) ?? ref.current?.querySelector(FOCUSABLE)
    first?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current() }
      if (e.key === 'Tab' && ref.current) {
        // Le focus reste dans la fenêtre.
        const items = [...ref.current.querySelectorAll(FOCUSABLE)]
        if (!items.length) return
        const [a, z] = [items[0], items[items.length - 1]]
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus() }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; document.documentElement.classList.remove('mfc-modal-open'); if (opener && typeof opener.focus === 'function') opener.focus() }
  }, [])
  return createPortal(
    <div className="mfc-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="mfc-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="mfc-modal-head">
          <h3 id={titleId}>{title}</h3>
          <button type="button" className="mfc-x" aria-label={tr('Fermer')} onClick={onClose}>×</button>
        </div>
        <div className="mfc-modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

function useContact(user) {
  const [contact, setContact] = useState({ name: user?.displayName ?? '', email: user?.email ?? '', phone: '' })
  const set = (k) => (e) => setContact((c) => ({ ...c, [k]: e.target.value }))
  return [contact, set]
}
const contactOk = (c) => c.name.trim() && /\S+@\S+\.\S+/.test(c.email)
const contactBody = (c) => ({ name: c.name.trim(), email: c.email.trim(), ...(c.phone.trim() ? { phone: c.phone.trim() } : {}) })

function ContactFields({ contact, set }) {
  return (
    <fieldset className="mfc-fieldset">
      <legend>{tr('Contact')}</legend>
      <div className="mfc-row2">
        <label className="mfc-field"><span>{tr('Nom')} *</span><input value={contact.name} onChange={set('name')} maxLength={200} required autoComplete="name" /></label>
        <label className="mfc-field"><span>{tr('E-mail')} *</span><input type="email" value={contact.email} onChange={set('email')} maxLength={200} required autoComplete="email" /></label>
        <label className="mfc-field"><span>{tr('Téléphone')}</span><input type="tel" value={contact.phone} onChange={set('phone')} maxLength={40} autoComplete="tel" /></label>
      </div>
    </fieldset>
  )
}

export function OfferSummary({ offer }) {
  return (
    <div className="mfc-summary">
      <div className="mfc-summary-info">
        <strong>{offer.name}</strong>
        <span>{offer.manufacturer?.name}{offer.reference ? <em>{offer.reference}</em> : null}</span>
      </div>
      <b className="mfc-summary-price">{money(offer.unitPrice)}<small>{tr('/ unité')}</small></b>
    </div>
  )
}

const todayIso = () => new Date().toISOString().slice(0, 10)

/**
 * Carte de COMMANDE affichée sur la fiche produit, juste après la connexion (mêmes étapes pour tous les comptes) :
 * Une seule DEMANDE DE COMMANDE pour tous les comptes (2026-10-29). `mode` ne choisit que le canal vers Audit :
 * « order » (établissement à catégorie vérifiée) ou « interest » (autres comptes : Audit en fait une commande « En
 * attente » que le fabricant valide). Le serveur tranche dans les deux cas.
 * : produit, quantité, lieu de livraison,
 * date souhaitée, bon de commande, contact, puis écran de confirmation. Aucun paiement en ligne (loi 18-05) :
 * c'est une demande, confirmée par le fabricant. Le serveur tranche (catégorie vérifiée, produit proposé).
 * `offers` : offres commandables par ce compte ; `initialOffer` : offre présélectionnée (sinon la première).
 */
export function OrderForm({ offers, initialOffer, est, user, onSent, onClose, mode = 'order' }) {
  const isOrder = true // affichage : toujours une demande de commande (2026-10-29)
  // Canal seulement : 'order' = acheteur habilité ; sinon canal « intérêt » d'Audit, qui crée aussi une commande « En attente ».
  const viaOrder = mode === 'order' && !!est
  const [ref, setRef] = useState(initialOffer?.ref ?? offers[0]?.ref ?? '')
  const offer = offers.find((o) => o.ref === ref) ?? offers[0]
  const [qty, setQty] = useState(String(Math.max(1, Number(initialOffer?.minOrderQty ?? offers[0]?.minOrderQty) || 1)))
  const [deliveryPlace, setDeliveryPlace] = useState('')
  const [desiredDate, setDesiredDate] = useState('')
  const [purchaseOrderRef, setPurchaseOrderRef] = useState('')
  const [note, setNote] = useState('')
  const [contact, set] = useContact(user)
  const [key] = useState(newRequestKey)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(null)

  const n = Number(qty)
  const minQty = Math.max(1, Number(offer?.minOrderQty) || 1) // vente en gros : minimum fixé par le fournisseur
  const qtyOk = qty !== '' && Number.isInteger(n) && n >= minQty && n <= 1_000_000
  const dateOk = !desiredDate || desiredDate >= todayIso()
  const valid = !!offer && qtyOk && dateOk && deliveryPlace.trim() && contactOk(contact)
  const head = composeOrderNote({ deliveryPlace, desiredDate, purchaseOrderRef })
  const noteRoom = Math.max(0, NOTE_MAX - head.length - 2)

  async function submit(e) {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true); setError(null)
    const full = composeOrderNote({ deliveryPlace, desiredDate, purchaseOrderRef, note })
    const r = viaOrder
      ? await sendOrder({ establishmentId: est.id, clientRequestId: key, lines: [{ productRef: offer.ref, quantity: n }], contact: contactBody(contact), note: full })
      : await sendInterest({
        productRef: offer.ref, clientRequestId: key, ...(est ? { establishmentId: est.id } : {}), quantity: n,
        contact: contactBody(contact), ...(full ? { message: full } : {}),
      })
    setBusy(false)
    if (!r.ok) return setError(tr(r.error))
    const req = r.data.request
    if (req.delivery === 'REJECTED') return setError(tr(req.refusal || 'Demande refusée par le fabricant.'))
    setSent(req)
    onSent?.(req)
  }

  if (sent) {
    const maker = sent.manufacturer ?? offer.manufacturer?.name
    return (
      <div className="mfc-done" role="status">
        <div className="mfc-done-mark" aria-hidden="true">✓</div>
        <h4>{sent.delivery === 'SENT' && !sent.demo ? tr('Demande envoyée à {0}', [maker]) : tr('Demande enregistrée')}</h4>
        {sent.demo && <p role="alert"><strong>{tr('Mode démonstration : cette demande n’a PAS été transmise au fabricant.')}</strong></p>}
        {sent.delivery !== 'SENT' && <p>{tr('Le fabricant est momentanément injoignable : votre demande lui sera transmise automatiquement.')}</p>}
        <dl className="mfc-recap">
          <div><dt>{tr('Produit')}</dt><dd>{offer.name}</dd></div>
          <div><dt>{tr('Quantité')}</dt><dd>{n}</dd></div>
          {isOrder && <div><dt>{tr('Montant indicatif')}</dt><dd>{money(n * offer.unitPrice)}</dd></div>}
          <div><dt>{tr('Livraison')}</dt><dd>{deliveryPlace.trim()}</dd></div>
        </dl>
        <ol className="mfc-steps">
          {isOrder ? (
            <>
              <li>{tr('Le fabricant examine et confirme votre demande.')}</li>
              <li>{tr('Il attribue les lots livrés (traçabilité en cas de retrait).')}</li>
              <li>{tr('Il vous contacte pour la livraison et la facturation, hors ligne.')}</li>
            </>
          ) : (
            <>
              <li>{tr('Le fabricant examine votre demande.')}</li>
              <li>{tr('Il vous recontacte par e-mail ou par téléphone.')}</li>
            </>
          )}
        </ol>
        <div className="mfc-actions">
          <button type="button" className={`mfc-btn ${isOrder ? 'mfc-btn--ghost' : 'mfc-btn--primary'}`} onClick={onClose}>{tr('Fermer')}</button>
          {isOrder && <a className="mfc-btn mfc-btn--primary" href="/dashboard/?page=commandes">{tr('Suivre ma commande')}</a>}
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mfc-form" noValidate>
      <fieldset className="mfc-fieldset">
        <legend>{tr('Produit')}</legend>
        {offers.length > 1
          ? (
            <label className="mfc-field"><span>{tr('Produit')} *</span>
              <select value={ref} onChange={(e) => setRef(e.target.value)}>
                {offers.map((o) => <option key={o.ref} value={o.ref}>{o.name} — {o.reference}</option>)}
              </select>
            </label>
          )
          : null}
        <OfferSummary offer={offer} />
        {viaOrder && <p className="mfc-fine mfc-fine--top">{tr('Acheteur')} : <strong>{est.name}</strong> · {tr(CATEGORY_LABEL[est.buyerCategory] ?? est.buyerCategory)} · {tr('vérifiée')}</p>}
        <div className="mfc-row2">
          <label className="mfc-field"><span>{tr('Quantité (unités)')} *</span>
            <input type="number" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} aria-invalid={!qtyOk} /></label>
          <div className="mfc-field mfc-total"><span>{tr('Montant indicatif')}</span><b>{qtyOk ? money(n * offer.unitPrice) : '—'}</b></div>
        </div>
      </fieldset>
      <fieldset className="mfc-fieldset">
        <legend>{tr('Livraison')}</legend>
        <label className="mfc-field"><span>{tr('Lieu de livraison')} *</span>
          <input value={deliveryPlace} maxLength={300} onChange={(e) => setDeliveryPlace(e.target.value)} placeholder={tr('Ex. pharmacie centrale, bâtiment B, Sétif')} /></label>
        <div className="mfc-row2">
          <label className="mfc-field"><span>{tr('Date souhaitée')}</span>
            <input type="date" min={todayIso()} value={desiredDate} onChange={(e) => setDesiredDate(e.target.value)} aria-invalid={!dateOk} /></label>
          <label className="mfc-field"><span>{tr('Référence de bon de commande')}</span>
            <input value={purchaseOrderRef} maxLength={100} onChange={(e) => setPurchaseOrderRef(e.target.value)} /></label>
        </div>
        {!dateOk && <p className="mfc-error" role="alert">{tr('La date souhaitée ne peut pas être passée.')}</p>}
      </fieldset>
      <ContactFields contact={contact} set={set} />
      <label className="mfc-field"><span>{tr('Note au fabricant')}</span>
        <textarea rows={3} maxLength={noteRoom} value={note} onChange={(e) => setNote(e.target.value.slice(0, noteRoom))}
          placeholder={tr('Conditionnement, contraintes de réception…')} /></label>
      {error && <p className="mfc-error" role="alert">{error}</p>}
      <div className="mfc-actions"><button type="submit" className="mfc-btn mfc-btn--primary" disabled={!valid || busy}>{busy ? tr('Envoi…') : tr('Envoyer la demande')}</button></div>
    </form>
  )
}


