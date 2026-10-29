import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getSession } from '../../lib/auth.js'
import { listPublishedServices } from '../../lib/services.js'
import {
  CATEGORY_SHORT, getListingEngagement, getMarketMe, likeListing, orderPathFor, rememberOrderIntent, unlikeListing,
} from '../../lib/market.js'
import { DEMO_LISTINGS, DEMO_ICONS } from './demoData.jsx'
import { getAccent, orgOf } from './helpers.jsx'
import {
  BLOCKER, Modal, OrderForm, buyerEstablishment, canOrderOffer, money,
} from './market/MarketDialogs.jsx'
import { tr } from '../../i18n/translate.js'
import './service-detail.css'

const isDemoId = (id) => /^demo-\d+$/.test(id ?? '')
const telHref = (p) => `tel:${String(p).replace(/[^\d+]/g, '')}`

/**
 * Fiche produit /services/:id : VITRINE (présentation, « J'aime », « Contacter ») + COMMANDE sur place, dans une carte.
 *  - Visiteur sans compte : « Contacter » (téléphone / e-mail, sans compte) ou « Commander via la plateforme »
 *    -> fenêtre « Se connecter / Créer un compte » ; la fiche visée est retenue (?next= + mémoire locale, car l'inscription
 *    passe par une validation) ; à la connexion on revient sur CETTE fiche avec ?order=1 et la carte de commande s'ouvre seule.
 *  - Compte autorisé (administrateur ou pharmacien d'un établissement à catégorie vérifiée) : carte de commande
 *    (produit, quantité, lieu de livraison, date, bon de commande, contact) -> demande envoyée au fabricant ; le SUIVI
 *    des statuts reste dans le tableau de bord (page « Commandes »).
 *  - Autre compte connecté (catégorie non vérifiée, praticien, privé…) : MÊME demande de commande (2026-10-29), envoyée
 *    par le canal « intérêt » d'Audit qui en fait une commande « En attente » ; le fabricant la valide ou l'annule.
 *  - Aucun paiement en ligne (loi 18-05) : une commande est une demande, confirmée et facturée par le fabricant.
 *  - Fiche d'exemple (demo-N) : données locales, AUCUN appel réseau, boutons désactivés et mention « Exemple ».
 */
export default function ServiceDetail({ id }) {
  const navigate = useNavigate()
  const demo = isDemoId(id)
  const [state, setState] = useState(() => (demo ? demoState(id) : { status: 'loading', listing: null }))
  const [session, setSession] = useState({ status: demo ? 'done' : 'checking', user: null })
  const [eng, setEng] = useState(null) // { likes, liked, manufacturerLinked, hasOffers, offers, offersUnavailable }
  const [me, setMe] = useState(null)
  const [meDone, setMeDone] = useState(false) // true quand /market/me a répondu (réussi ou non)
  const wantOrder = useRef(!demo && new URLSearchParams(window.location.search).get('order') === '1') // retour de connexion
  const [modal, setModal] = useState(null) // { kind: 'interest'|'login', offer?, reason? }
  const [toast, setToast] = useState(null)
  const [likeBusy, setLikeBusy] = useState(false)
  const offersRef = useRef(null)

  useEffect(() => {
    if (demo) {
      setState(demoState(id))
      // Si la fiche d'exemple existe en vraie fiche (seed-services-demo), on bascule dessus : elle se commande vraiment.
      let gone = false
      listPublishedServices().then((r) => {
        if (gone || !r.ok) return
        const real = (r.data.listings ?? []).find((x) => x.id === `demo-svc-lst-${id}`)
        if (real) navigate(`/services/${encodeURIComponent(real.id)}${window.location.search}`, { replace: true })
      })
      return () => { gone = true }
    }
    let off = false
    setState({ status: 'loading', listing: null })
    Promise.all([listPublishedServices(), getSession()]).then(([l, s]) => {
      if (off) return
      const listing = l.ok ? (l.data.listings ?? []).find((x) => x.id === id) ?? null : null
      setState(l.ok ? { status: listing ? 'ready' : 'notfound', listing } : { status: 'error', listing: null, error: l.error })
      setSession({ status: 'done', user: s.ok ? s.data.user : null })
    })
    return () => { off = true }
  }, [id, demo])

  const user = session.user
  const ready = state.status === 'ready' && !demo
  useEffect(() => {
    if (!ready) return undefined
    let off = false
    getListingEngagement(id).then((r) => { if (!off) setEng(r.ok ? r.data : { likes: 0, liked: false, offers: null, error: r.error }) })
    if (user) getMarketMe().then((r) => { if (!off) { setMe(r.ok ? r.data : null); setMeDone(true) } })
    return () => { off = true }
  }, [ready, id, user])
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t) }, [toast])

  const est = useMemo(() => buyerEstablishment(me), [me])
  const offers = eng?.offers ?? []
  const orderable = offers.filter((o) => canOrderOffer(est, o))

  // Retour de connexion (?order=1) : dès que le compte, l'établissement et les offres sont chargés, la carte s'ouvre une seule fois.
  useEffect(() => {
    if (!wantOrder.current || !ready || !user || !meDone || eng === null) return
    wantOrder.current = false
    try {
      const u = new URL(window.location.href)
      u.searchParams.delete('order')
      window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash)
    } catch { /* sans effet sur la commande */ }
    if (eng.offersUnavailable || offers.length === 0) {
      setToast(tr("Ce produit ne se commande pas en ligne pour l'instant : utilisez « Contacter »."))
      return
    }
    onOrder()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, meDone, eng])
  const listing = state.listing

  // Un compte connecté attend le verdict du serveur (availableForYou) avant d'afficher la fiche, pour ne pas la montrer une seconde puis la retirer.
  if (state.status === 'loading' || (ready && user && eng === null)) return <div className="sdp-wrap"><p className="sdp-state" role="status">{tr('Chargement de la fiche…')}</p></div>
  if (state.status === 'notfound' || state.status === 'error') {
    return (
      <div className="sdp-wrap">
        <div className="sdp-state">
          <h1>{state.status === 'notfound' ? tr('Fiche introuvable') : tr('Fiche momentanément indisponible')}</h1>
          <p>{state.status === 'notfound' ? tr("Ce produit n'est plus publié ou l'adresse est incorrecte.") : tr(state.error || 'Réessayez dans un instant.')}</p>
          <Link className="mfc-btn mfc-btn--primary" to="/services">{tr('Tous les produits')}</Link>
        </div>
      </div>
    )
  }

  // Le serveur dit que ce compte ne peut pas commander ce produit : message clair, pas une fiche avec un bouton qui échoue.
  if (!demo && user && eng?.availableForYou === false) {
    return (
      <div className="sdp-wrap">
        <div className="sdp-state">
          <h1>{tr("Produit non disponible pour votre catégorie")}</h1>
          <p>{tr("Ce produit n'est pas proposé à la commande pour la catégorie de votre établissement. Les produits que vous pouvez commander sont dans le catalogue.")}</p>
          <Link className="mfc-btn mfc-btn--primary" to="/services">{tr('Voir les produits disponibles')}</Link>
        </div>
      </div>
    )
  }

  const accent = getAccent(listing.category)
  const contactHref = listing.contactEmail ? `mailto:${listing.contactEmail}` : listing.contactPhone ? telHref(listing.contactPhone) : listing.website || null
  const certs = Array.isArray(listing.certifications) ? listing.certifications.filter(Boolean) : []

  // « Commander via la plateforme » : exemple (désactivé) ; anonyme (si la fiche a des offres : connexion) ; connecté (si offres).
  const showOrder = demo || (!user ? !!eng?.hasOffers : offers.length > 0)
  // Fiche d'exemple : mêmes portes que les vraies fiches. Visiteur → carte « Se connecter / Créer un compte » (retour sur cette fiche) ;
  // déjà connecté → simple info (rien n'est commandé ni enregistré). Seul appel réseau : la session, au clic.
  async function demoGate(reason) {
    const r = await getSession()
    if (r.ok && r.data?.user) return setModal({ kind: 'login', reason: 'demo' })
    setModal({ kind: 'login', reason })
  }
  function onOrder() {
    if (demo) return demoGate('order')
    if (!user) { rememberOrderIntent(orderPathFor(id)); return setModal({ kind: 'login', reason: 'order' }) }
    if (offers.length === 0) return setToast(tr("Ce produit ne se commande pas en ligne pour l'instant : utilisez « Contacter »."))
    // Le serveur ne renvoie que l'offre de CE produit (offersForListing) : le bouton ouvre directement sa carte.
    // Même « Demande de commande » pour tous les comptes connectés (le canal dépend de l'habilitation, pas le formulaire).
    openOffer(offers[0])
  }
  function openOffer(offer) {
    if (est?.orderBlocker === 'CATEGORY_NOT_ALLOWED') return setToast(tr(BLOCKER.CATEGORY_NOT_ALLOWED))
    setModal({ kind: 'order', mode: canOrderOffer(est, offer) ? 'order' : 'interest', offer })
  }
  async function onLike() {
    if (demo) return demoGate('like')
    if (likeBusy) return
    if (!user) return setModal({ kind: 'login', reason: 'like' })
    const prev = eng ?? { likes: 0, liked: false }
    const next = !prev.liked
    setEng({ ...prev, liked: next, likes: Math.max(0, prev.likes + (next ? 1 : -1)) }) // optimiste
    setLikeBusy(true)
    const r = await (next ? likeListing(id) : unlikeListing(id))
    setLikeBusy(false)
    if (r.ok) setEng((e) => ({ ...e, likes: r.data.likes, liked: r.data.liked }))
    else { setEng(prev); setToast(tr("Votre « J'aime » n'a pas pu être enregistré.")) }
  }

  const likes = demo ? null : eng?.likes ?? 0
  const liked = !!eng?.liked

  return (
    <div className="sdp-wrap" style={{ '--sdp-accent': accent }}>
      <nav className="sdp-crumbs" aria-label={tr("Fil d'Ariane")}>
        <Link to="/services">{tr('← Tous les produits')}</Link>
      </nav>

      <section className="sdp-hero">
        <div className="sdp-media">
          {listing.imageUrl
            ? <img src={listing.imageUrl} alt={tr(listing.title)} />
            : <div className="sdp-icon" aria-hidden="true">{(listing.icon && DEMO_ICONS[listing.icon]) || <GenericIcon />}</div>}
          {demo && <span className="sdp-demo">{tr('Exemple')}</span>}
        </div>
        <div className="sdp-info">
          {listing.category && <span className="sdp-tag">{tr(listing.category)}</span>}
          <h1 className="sdp-title">{tr(listing.title)}</h1>
          {orgOf(listing) && <p className="sdp-org">{tr('Proposé par')} <strong>{orgOf(listing)}</strong></p>}
          {listing.description && listing.summary && listing.description !== listing.summary && <p className="sdp-summary">{tr(listing.summary)}</p>}

          <div className="sdp-actions">
            {showOrder && (
              <button type="button" className="mfc-btn mfc-btn--primary sdp-order" onClick={onOrder}>
                {user && !demo ? tr('Commander') : tr('Commander via la plateforme')}
              </button>
            )}
            <button type="button" className={`mfc-btn mfc-btn--ghost sdp-like${liked ? ' is-on' : ''}`} aria-pressed={liked}
              onClick={onLike} aria-label={liked ? tr("Je n'aime plus") : tr("J'aime")}>
              <Heart filled={liked} /> <span>{tr("J'aime")}</span>{likes !== null && <b className="sdp-like-count">{likes}</b>}
            </button>
            {contactHref && (
              <a className="mfc-btn mfc-btn--ghost" href={contactHref} {...(contactHref.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{tr('Contacter')}</a>
            )}
          </div>
          {/* Pas de bouton « Commander » : on dit pourquoi, au lieu de le faire disparaître sans explication (2026-10-29). */}
          {!demo && !showOrder && eng !== null && (
            <p className="sdp-muted sdp-order-note" role="status" style={{ marginTop: 10 }}>
              {eng?.offersUnavailable
                ? tr('Commande en ligne momentanément indisponible : réessayez dans un instant.')
                : tr("Pas encore disponible à la commande en ligne.") + (contactHref ? ` ${tr('Utilisez « Contacter » pour joindre le fabricant.')}` : '')}
            </p>
          )}
          {(listing.description || listing.summary) && (
            <div className="sdp-about">
              <h2>{tr('Description')}</h2>
              <p className="sdp-desc">{tr(listing.description || listing.summary)}</p>
            </div>
          )}
        </div>
      </section>

      <div className="sdp-grid">
        <div className="sdp-main">
          {certs.length > 0 && (
            <section className="sdp-card">
              <h2>{tr('Certifications')}</h2>
              <ul className="sdp-certs">{certs.map((c) => <li key={c}>{c}</li>)}</ul>
            </section>
          )}
          {(listing.website || listing.contactEmail || listing.contactPhone) && (
            <section className="sdp-card">
              <h2>{tr('Liens')}</h2>
              <ul className="sdp-links">
                {listing.website && <li><span>{tr('Site web')}</span><a href={listing.website} target="_blank" rel="noopener noreferrer">{listing.website.replace(/^https?:\/\//, '')}</a></li>}
                {listing.contactEmail && <li><span>{tr('E-mail')}</span><a href={`mailto:${listing.contactEmail}`}>{listing.contactEmail}</a></li>}
                {listing.contactPhone && <li><span>{tr('Téléphone')}</span><a href={telHref(listing.contactPhone)}>{listing.contactPhone}</a></li>}
              </ul>
            </section>
          )}
        </div>

        {!demo && (
          <aside className="sdp-card sdp-offers" id="sdp-offers" ref={offersRef} tabIndex={-1} aria-labelledby="sdp-offers-title">
            <h2 id="sdp-offers-title">{tr('Commander auprès du fabricant')}</h2>
            <OffersBody user={user} eng={eng} offers={offers} est={est}
              onLogin={() => setModal({ kind: 'login', reason: 'order' })} onOpen={openOffer} />
          </aside>
        )}
      </div>

      {modal && (
        <Modal onClose={() => setModal(null)} title={tr(modal.kind === 'login' ? (modal.reason === 'demo' ? "Fiche d'exemple" : modal.reason === 'order' ? 'Connectez-vous pour commander' : 'Connexion requise') : MODAL_TITLE[modal.kind])}>
          {modal.kind === 'login' && <LoginPrompt reason={modal.reason} demo={demo} next={demo ? '/services' : modal.reason === 'order' ? orderPathFor(id) : `/services/${id}`} contactHref={contactHref} listing={listing} />}
          {/* Une seule « Demande de commande » pour tous les comptes ; `mode` ne choisit que le canal (le serveur tranche). */}
          {modal.kind === 'order' && modal.offer && (
            <OrderForm offers={modal.mode === 'order' ? orderable : [modal.offer]} initialOffer={modal.offer} est={est} user={user} mode={modal.mode} onClose={() => setModal(null)} />
          )}
        </Modal>
      )}
      {toast && <div className="mfc-toast" role="status">{toast}</div>}
    </div>
  )
}

const MODAL_TITLE = {
  login: 'Commander via la plateforme', order: 'Demande de commande',
}

function OffersBody({ user, eng, offers, est, onLogin, onOpen }) {
  if (!eng) return <p className="sdp-muted">{tr('Chargement…')}</p>
  if (eng.offersUnavailable) return <p className="sdp-muted">{tr('Les offres du fabricant sont momentanément indisponibles. Utilisez « Contacter » ou réessayez plus tard.')}</p>
  if (!user) {
    return eng.hasOffers
      ? <><p className="sdp-muted">{eng.sellerKind === 'DISTRIBUTOR' ? tr('Ce distributeur accepte des commandes en ligne. Connectez-vous avec un compte professionnel vérifié pour voir son prix de gros et commander.') : tr('Ce fabricant accepte des demandes en ligne. Connectez-vous avec un compte professionnel pour voir ses offres et ses prix.')}</p>
          <button type="button" className="mfc-btn mfc-btn--primary" onClick={onLogin}>{tr('Commander via la plateforme')}</button></>
      : <p className="sdp-muted">{tr("Ce produit ne se commande pas en ligne pour l'instant : utilisez « Contacter ».")}</p>
  }
  if (!eng.manufacturerLinked || offers.length === 0) {
    return <p className="sdp-muted">{tr("Ce produit ne se commande pas en ligne pour l'instant : utilisez « Contacter ».")}</p>
  }
  return (
    <>
      <ul className="sdp-offer-list">
        {offers.map((o) => {
          return (
            <li key={o.ref} className="sdp-offer">
              <div className="sdp-offer-main">
                <strong>{o.name}</strong>
                <span>{o.reference} · {(o.orderableBy ?? []).length ? `${tr('Commande :')} ${(o.orderableBy ?? []).map((c) => tr(CATEGORY_SHORT[c] ?? c)).join(', ')}` : tr('Contact uniquement')}</span>
              </div>
              <div className="sdp-offer-side">
                <b>{money(o.unitPrice)}</b><small>{o.source === 'SUPPLIER' ? `${tr('/')} ${o.priceUnit || tr('unité')}${o.minOrderQty > 1 ? ` · ${tr('min.')} ${o.minOrderQty}` : ''}` : tr('/ unité, indicatif')}</small>
                {est?.orderBlocker === 'CATEGORY_NOT_ALLOWED'
                  ? <button type="button" className="mfc-btn mfc-btn--ghost" disabled>{tr('Non disponible pour votre catégorie')}</button>
                  : (
                    <button type="button" className="mfc-btn mfc-btn--primary" onClick={() => onOpen(o)}>
                      {tr('Commander')}
                    </button>
                  )}
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function LoginPrompt({ reason, next, contactHref, listing, demo }) {
  const q = encodeURIComponent(next)
  if (reason === 'demo') {
    return (
      <div className="mfc-gate">
        {listing && (
          <div className="mfc-gate-product">
            {listing.imageUrl ? <img src={listing.imageUrl} alt="" /> : <span className="mfc-gate-thumb" aria-hidden="true" />}
            <div><strong>{tr(listing.title)}</strong>{orgOf(listing) && <span>{orgOf(listing)}</span>}</div>
          </div>
        )}
        <p className="mfc-gate-lead">{tr("Cette fiche est un exemple : elle ne peut pas être commandée. Les produits réels des fabricants se commandent depuis leur propre fiche.")}</p>
        <div className="mfc-gate-actions">
          <Link className="mfc-btn mfc-btn--primary" to="/services">{tr('Voir les produits')}</Link>
        </div>
      </div>
    )
  }
  if (reason === 'like') {
    return (
      <div className="mfc-form">
        <p className="sdp-muted">{tr("Connectez-vous pour aimer ce produit.")}</p>
        <div className="mfc-actions"><Link className="mfc-btn mfc-btn--primary" to={`/login?next=${q}`}>{tr('Se connecter')}</Link></div>
      </div>
    )
  }
  const STEPS = ['Connexion', 'Commande', 'Suivi']
  return (
    <div className="mfc-gate">
      {listing && (
        <div className="mfc-gate-product">
          {listing.imageUrl ? <img src={listing.imageUrl} alt="" /> : <span className="mfc-gate-thumb" aria-hidden="true" />}
          <div><strong>{tr(listing.title)}</strong>{orgOf(listing) && <span>{orgOf(listing)}</span>}</div>
        </div>
      )}
      <ol className="mfc-gate-steps" aria-label={tr('Étapes')}>
        {STEPS.map((t, i) => (
          <li key={t} className={i === 0 ? 'is-now' : ''}><b aria-hidden="true">{i + 1}</b><span>{tr(t)}</span></li>
        ))}
      </ol>
      <p className="mfc-gate-lead">{demo ? tr('Cette fiche est un exemple. Après connexion, vous accéderez aux produits réels des fabricants, que vous pourrez commander depuis leur fiche.') : tr('Vous reviendrez sur cette fiche : le formulaire de commande (quantité, livraison) s’ouvrira automatiquement.')}</p>
      <div className="mfc-gate-actions">
        <Link className="mfc-btn mfc-btn--primary" to={`/login?next=${q}`}>{tr('Se connecter')}</Link>
        <Link className="mfc-btn mfc-btn--ghost" to={`/login?next=${q}#signup`}>{tr('Créer un compte')}</Link>
      </div>
      <p className="mfc-fine">
        {contactHref && <><a href={contactHref} {...(contactHref.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{tr('Contacter le fournisseur sans compte')}</a></>}
      </p>
    </div>
  )
}

function demoState(id) {
  const listing = DEMO_LISTINGS.find((l) => l.id === id) ?? null
  return { status: listing ? 'ready' : 'notfound', listing }
}

const Heart = ({ filled }) => (
  <svg className="sdp-heart" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
    <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8 3.4 4.5 6.9 4.5c2 0 3.4 1.1 5.1 3 1.7-1.9 3.1-3 5.1-3 3.5 0 5.4 3.5 4.2 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" />
  </svg>
)
const GenericIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
)
