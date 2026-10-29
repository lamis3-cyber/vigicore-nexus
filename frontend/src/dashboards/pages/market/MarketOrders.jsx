import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import {
  CATEGORY_LABEL, CATEGORY_SHORT, cancelMyRequest, composeOrderNote, getMarketMe, listMyRequests, listOffers, newRequestKey,
  NOTE_MAX, requestState, sendInterest, sendOrder,
} from '../../../lib/market';
import { tr, localeTag } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// « Commandes » du tableau de bord = LE seul endroit où l'on passe et suit une commande
// aux fabricants (le site public n'est qu'une vitrine : fiche produit + contact).
// Même API que l'ancienne fenêtre du site (/api/market/*), sans paiement en ligne (loi 18-05) :
// une commande est une DEMANDE, confirmée par le fabricant, qui attribue les lots (traçabilité)
// puis contacte l'acheteur pour la livraison et la facturation, hors ligne.
// Le serveur tranche toujours (qui peut commander, catégorie vérifiée) : l'interface ne fait que pré-vérifier.
// Utilisée par PharmCommandes (pharmacien) et la page « Commandes » de l'administrateur d'établissement.
// `entry` = { offer } quand on arrive depuis une fiche produit : la fenêtre de commande s'ouvre sur ce produit.
// ═══════════════════════════════════════════════════════════════

const TONE_BADGE = { wait: 'amber', ok: 'cyan', done: 'green', off: 'red' };
export const money = (n) => (typeof n === 'number' ? `${n.toLocaleString(localeTag(), { maximumFractionDigits: 2 })} DA` : '—');
const todayIso = () => new Date().toISOString().slice(0, 10);
export const BLOCKER = {
  NOT_ESTABLISHMENT_ADMIN: "Seuls l'administrateur ou le pharmacien de l'établissement peuvent commander.",
  CATEGORY_NOT_DECLARED: "Le type de votre établissement ne permet pas de commander sur la plateforme : contactez le fabricant.",
  CATEGORY_NOT_VERIFIED: 'Catégorie en cours de vérification par VigiCore.',
  CATEGORY_REJECTED: 'Catégorie non validée par VigiCore : son administrateur doit la corriger.',
  CATEGORY_NOT_ALLOWED: "Votre catégorie ne permet pas d'acheter directement : adressez-vous à un distributeur.",
};

/** Établissement au nom duquel on achète : le premier que j'administre, sinon le premier dont je suis membre. */
export const buyerEstablishment = (me) => {
  const list = me?.establishments ?? [];
  return list.find((e) => e.isAdmin) ?? list[0] ?? null;
};
export const canOrderOffer = (est, offer) => !!est?.canOrder && (offer?.orderableBy ?? []).includes(est.buyerCategory);

// mode="requests" : vue de SUIVI seul (médecin, laboratoire) — pas de commande possible pour ces rôles, mais leurs demandes
// d'intérêt envoyées depuis une fiche produit doivent rester visibles avec leur statut.
export default function MarketOrders({ entry, onEntryConsumed, mode = 'orders' }) {
  const toast = useToast();
  const { user } = useAuth();
  const [me, setMe] = useState(undefined); // undefined = chargement ; null = échec
  const [offers, setOffers] = useState(undefined); // undefined = chargement ; null = catalogue indisponible
  const [requests, setRequests] = useState(undefined);
  const [query, setQuery] = useState('');
  const [drawer, setDrawer] = useState(null); // { kind: 'order' | 'interest', offer }
  const consumed = useRef(false);

  const reloadRequests = useCallback(async () => {
    const r = await listMyRequests();
    setRequests(r.ok ? r.data.requests ?? [] : null);
  }, []);

  useEffect(() => {
    let off = false;
    if (mode === 'requests') {
      listMyRequests().then((r) => { if (!off) setRequests(r.ok ? r.data.requests ?? [] : null); });
      return () => { off = true; };
    }
    Promise.all([getMarketMe(), listOffers(), listMyRequests()]).then(([m, o, r]) => {
      if (off) return;
      setMe(m.ok ? m.data : null);
      setOffers(o.ok ? o.data.offers ?? [] : null);
      setRequests(r.ok ? r.data.requests ?? [] : null);
    });
    return () => { off = true; };
  }, [mode]);

  const est = useMemo(() => buyerEstablishment(me), [me]);
  async function cancelOrder(r) {
    const res = await cancelMyRequest(r.id);
    if (!res.ok) toast('error', tr('Annulation impossible'), tr(res.error), 'ti ti-alert-circle');
    else toast('success', tr('Commande annulée'), r.summary, 'ti ti-circle-check');
    reloadRequests();
  }

  // Arrivée depuis une fiche produit : on ouvre directement la commande de ce produit (une seule fois).
  useEffect(() => {
    if (consumed.current || !entry?.offer || me === undefined || offers === undefined) return;
    consumed.current = true;
    const offer = (offers ?? []).find((o) => o.ref === entry.offer);
    if (!offer) {
      toast('info', tr('Produit introuvable'), tr("Ce produit n'est plus proposé : choisissez-en un dans la liste."), 'ti ti-alert-circle');
    } else {
      if (est?.orderBlocker === 'CATEGORY_NOT_ALLOWED') toast('info', tr('Achat non disponible'), tr(BLOCKER.CATEGORY_NOT_ALLOWED), 'ti ti-alert-circle');
      else setDrawer({ kind: canOrderOffer(est, offer) ? 'order' : 'interest', offer });
    }
    onEntryConsumed?.();
  }, [entry, me, offers, est, toast, onEntryConsumed]);

  const orders = (requests ?? []).filter((r) => r.kind === 'ORDER');
  const interests = (requests ?? []).filter((r) => r.kind !== 'ORDER');
  const isDone = (r) => requestState(r).tone === 'done' || r.status === 'CANCELLED' || r.delivery === 'REJECTED';
  const counts = {
    wait: orders.filter((r) => requestState(r).tone === 'wait').length,
    ok: orders.filter((r) => r.delivery === 'SENT' && (r.status === 'CONFIRMED' || r.status === 'SHIPPED')).length,
    done: orders.filter((r) => r.delivery === 'SENT' && r.status === 'DELIVERED').length,
  };
  const q = query.trim().toLowerCase();
  // The server flags offers this company cannot order (orderable === false): they are hidden here; unknown (null) stays visible.
  const shown = (offers ?? []).filter((o) => o.orderable !== false).filter((o) => !q || `${o.name} ${o.reference} ${o.manufacturer?.name ?? ''}`.toLowerCase().includes(q));

  if (mode === 'requests') {
    return (
      <div className="view is-active">
        <div className="page-header">
          <div><h1 className="page-title"><span className="page-title-accent">{tr('Mes demandes')}</span></h1></div>
        </div>
        <RequestsTable
          title={tr('Demandes aux fabricants')} icon="message-circle" iconClass="u-c-blue"
          rows={requests ?? []} loading={requests === undefined} failed={requests === null}
          empty={tr("Aucune demande envoyée pour le moment. Utilisez « Commander » sur la fiche d'un produit.")}
        />
      </div>
    );
  }

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title"><span className="page-title-accent">{tr('Commandes')}</span></h1></div>
      </div>

      <div className="grid-kpi">
        <Kpi label={tr('En attente')} value={counts.wait} sub={tr('du fabricant')} color="u-c-amber" icon="clock" />
        <Kpi label={tr('Confirmées')} value={counts.ok} sub={tr('en attente de livraison')} color="u-c-cyan" icon="circle-check" />
        <Kpi label={tr('Livrées')} value={counts.done} sub={tr('historique des achats')} color="u-c-green" icon="package" />
      </div>

      <BuyerBanner me={me} est={est} />

      <div className="card">
        <div className="section-header">
          <h2 className="section-title"><Icon name="building-factory-2" className="u-c-green" />{tr('Commander un produit')}</h2>
        </div>
        <div className="u-fs-12 u-t102">{tr("Choisissez un produit publié par un fabricant ou un fournisseur et envoyez-lui une demande de commande.")}</div>
        <div className="topbar-search" style={{ margin: '10px 0' }}>
          <Icon name="search" />
          <input type="text" placeholder={tr('Rechercher un produit, une réf, un fabricant…')} aria-label={tr('Rechercher dans le catalogue')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {offers === undefined && <div className="inbox-empty"><Icon name="clock" />{tr('Chargement…')}</div>}
        {offers === null && <div className="inbox-empty"><Icon name="alert-circle" />{tr('Le catalogue des fabricants est momentanément indisponible.')}</div>}
        {offers && shown.length === 0 && <div className="inbox-empty"><Icon name="search" />{tr('Aucun produit ne correspond')}</div>}
        {offers && shown.length > 0 && (
          <div className="u-overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>{tr('PRODUIT')}</th><th>{tr('FABRICANT / FOURNISSEUR')}</th><th>{tr('PRIX')}</th><th>{tr('ACTION')}</th></tr></thead>
              <tbody>
                {shown.map((o) => {
                  const can = canOrderOffer(est, o);
                  const cats = (o.orderableBy ?? []).map((c) => tr(CATEGORY_SHORT[c] ?? c)).join(', ');
                  return (
                    <tr key={o.ref}>
                      <td><div className="u-fs12-500">{o.name}</div><div className="u-fs10-5-tertiary">{o.reference}{cats ? ` · ${tr('Commande :')} ${cats}` : ''}</div></td>
                      <td><div className="u-fs-12">{o.manufacturer?.name ?? '—'}</div></td>
                      <td><div className="u-fs-12">{money(o.unitPrice)} <span className="u-fs10-5-tertiary">{tr('/ unité')}{o.minOrderQty > 1 ? ` · ${tr('min.')} ${o.minOrderQty}` : ''}</span></div></td>
                      <td>
                        {o.listingId && <a className="tbl-action-btn" style={{ marginRight: 6 }} href={`/services/${encodeURIComponent(o.listingId)}`} target="_blank" rel="noopener noreferrer">{tr('Voir la fiche')} ↗</a>}
                        {est?.orderBlocker === 'CATEGORY_NOT_ALLOWED'
                          ? <button className="tbl-action-btn" disabled>{tr('Non disponible pour votre catégorie')}</button>
                          : (
                            <button className="tbl-action-btn tbl-action-btn--primary" onClick={() => setDrawer({ kind: can ? 'order' : 'interest', offer: o })}>
                              {tr('Commander')}
                            </button>
                          )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RequestsTable
        title={tr('Suivi des commandes')} icon="truck-delivery" iconClass="u-c-cyan"
        rows={orders.filter((r) => !isDone(r))} loading={requests === undefined} failed={requests === null}
        empty={tr('Aucune commande en cours')} onCancel={cancelOrder}
      />
      <RequestsTable
        title={tr('Historique des achats')} icon="history" iconClass="u-c-purple"
        rows={orders.filter(isDone)} loading={requests === undefined} failed={false}
        empty={tr('Aucun achat terminé pour le moment')}
      />
      {interests.length > 0 && (
        <RequestsTable title={tr("Demandes d'intérêt")} icon="message-circle" iconClass="u-c-blue" rows={interests} loading={false} failed={false} empty="" />
      )}

      {drawer && (
        <RequestDrawer
          kind={drawer.kind} offer={drawer.offer} est={est} user={user}
          onClose={() => setDrawer(null)}
          onSent={() => { reloadRequests(); }}
          onToast={(...a) => toast(...a)}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, sub, color, icon }) {
  return (
    <div className="kpi-card">
      <div className="kpi-accent" />
      <div className="kpi-header"><div className="kpi-label">{label}</div><div className="kpi-icon"><Icon name={icon} /></div></div>
      <div className={`kpi-value ${color}`}>{value}</div><div className="kpi-sub">{sub}</div>
    </div>
  );
}

export function BuyerBanner({ me, est }) {
  let tone = 'amber';
  let text;
  if (me === undefined) return null;
  if (me === null) { tone = 'red'; text = tr('Impossible de charger votre établissement. Réessayez dans un instant.'); }
  else if (!est) { text = tr("Votre compte n'est rattaché à aucun établissement : vos demandes de commande sont validées par le fabricant."); }
  else if (est.canOrder) { tone = 'green'; text = tr('Catégorie vérifiée : vous pouvez envoyer des demandes de commande.'); }
  else { text = tr(BLOCKER[est.orderBlocker] ?? ''); }
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span className={`badge badge--${tone}`}>{est ? est.name : tr('Établissement')}</span>
      {est?.buyerCategory && <span className="u-fs10-5-tertiary">{tr(CATEGORY_LABEL[est.buyerCategory] ?? est.buyerCategory)}</span>}
      <span className="u-fs-12">{text}{est?.buyerCategoryStatus === 'REJECTED' && est.buyerCategoryNote ? ` « ${est.buyerCategoryNote} »` : ''}</span>
    </div>
  );
}

function RequestsTable({ title, icon, iconClass, rows, loading, failed, empty, onCancel }) {
  return (
    <div className="card u-p-0">
      <div className="u-t48"><div className="section-title"><Icon name={icon} className={iconClass} />{title}</div></div>
      <div className="u-overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>{tr('DEMANDE')}</th><th>{tr('FABRICANT / FOURNISSEUR')}</th><th>{tr('ENVOYÉE LE')}</th><th>{tr('STATUT')}</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={4}><div className="inbox-empty"><Icon name="clock" />{tr('Chargement…')}</div></td></tr>}
            {failed && <tr><td colSpan={4}><div className="inbox-empty"><Icon name="alert-circle" />{tr('Impossible de charger vos demandes pour le moment.')}</div></td></tr>}
            {!loading && !failed && rows.length === 0 && <tr><td colSpan={4}><div className="inbox-empty"><Icon name={icon} />{empty}</div></td></tr>}
            {rows.map((r) => {
              const st = requestState(r);
              const lots = (r.lines ?? []).filter((l) => l.lotNumber);
              return (
                <tr key={r.id}>
                  <td>
                    <div className="u-fs12-500">{r.summary}</div>
                    {r.kind === 'ORDER' && r.totalAmount != null && <div className="u-fs10-5-tertiary">{money(r.totalAmount)}</div>}
                    {lots.length > 0 && <div className="u-fs10-5-tertiary">{tr('Lots :')} {lots.map((l) => `${l.lotNumber}${l.expiryDate ? ` (${tr('exp.')} ${l.expiryDate})` : ''}`).join(', ')}</div>}
                    {r.refusal && <div className="u-fs10-5-tertiary">{tr(r.refusal)}</div>}
                  </td>
                  <td><div className="u-fs-12">{r.manufacturer ?? '—'}</div></td>
                  <td><div className="u-fs-12">{new Date(r.createdAt).toLocaleDateString(localeTag())}</div></td>
                  <td>
                    <span className={`badge badge--${TONE_BADGE[st.tone] ?? 'amber'}`}>{tr(st.label)}</span>
                    {r.cancellable && onCancel && <div><button type="button" className="tbl-action-btn" style={{ marginTop: 6 }} onClick={() => onCancel(r)}>{tr('Annuler')}</button></div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Fenêtre latérale : DEMANDE DE COMMANDE (une seule notion côté acheteur, sans paiement), puis confirmation ──
// `kind` ne change que le canal : 'order' = acheteur habilité (catégorie vérifiée) ; sinon la demande passe par le canal
// « intérêt » d'Audit, qui la transforme aussi en commande « En attente » que le fabricant valide. Même formulaire.
export function RequestDrawer({ kind, offer, est, user, onClose, onSent, onToast }) {
  const isOrder = true; // affichage : toujours une demande de commande
  const viaOrder = kind === 'order';
  const [qty, setQty] = useState(isOrder ? String(Math.max(1, Number(offer.minOrderQty) || 1)) : '');
  const [deliveryPlace, setDeliveryPlace] = useState('');
  const [desiredDate, setDesiredDate] = useState('');
  const [purchaseOrderRef, setPurchaseOrderRef] = useState('');
  const [note, setNote] = useState('');
  const [contact, setContact] = useState({ name: user?.name ?? '', email: user?.email ?? '', phone: '' });
  const [key] = useState(newRequestKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(null);
  const setC = (k) => (e) => setContact((c) => ({ ...c, [k]: e.target.value }));

  const n = qty === '' ? null : Number(qty);
  const minQty = Math.max(1, Number(offer.minOrderQty) || 1);
  const qtyOk = isOrder ? Number.isInteger(n) && n >= minQty && n <= 1_000_000 : n === null || (Number.isInteger(n) && n >= 1);
  const dateOk = !desiredDate || desiredDate >= todayIso();
  const contactOk = contact.name.trim() && /\S+@\S+\.\S+/.test(contact.email);
  const valid = qtyOk && contactOk && (!isOrder || (deliveryPlace.trim() && dateOk));
  const head = composeOrderNote({ deliveryPlace, desiredDate, purchaseOrderRef });
  const noteRoom = Math.max(0, NOTE_MAX - head.length - 2);
  const contactBody = { name: contact.name.trim(), email: contact.email.trim(), ...(contact.phone.trim() ? { phone: contact.phone.trim() } : {}) };

  async function submit(e) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setError(null);
    const fullNote = composeOrderNote({ deliveryPlace, desiredDate, purchaseOrderRef, note });
    const r = viaOrder
      ? await sendOrder({
        establishmentId: est.id, clientRequestId: key, lines: [{ productRef: offer.ref, quantity: n }], contact: contactBody, note: fullNote,
      })
      : await sendInterest({
        productRef: offer.ref, clientRequestId: key, ...(est ? { establishmentId: est.id } : {}), quantity: n,
        contact: contactBody, ...(fullNote ? { message: fullNote } : {}),
      });
    setBusy(false);
    if (!r.ok) return setError(tr(r.error));
    const req = r.data.request;
    if (req.delivery === 'REJECTED') return setError(tr(req.refusal || 'Demande refusée par le fabricant.'));
    setSent(req);
    onSent(req);
  }

  const field = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 };
  return (
    <>
      <div className="chat-overlay is-open" onClick={onClose} />
      <div className="chat-panel chat-panel--wide overlay-modal is-open" role="dialog" aria-modal="true" aria-labelledby="mktDrawerTitle">
        <div className="chat-header">
          <div className="chat-header-inner">
            <div className="drawer-icon" style={{ background: 'var(--color-brand)', color: '#fff' }}><Icon name="truck-delivery" /></div>
            <div className="u-flex-1 u-t31">
              <div id="mktDrawerTitle" className="u-fs13-strong">{isOrder ? tr('Demande de commande') : tr("Demande d'intérêt")}</div>
              <div className="u-fs10-5-tertiary">{offer.name} · {offer.manufacturer?.name}</div>
            </div>
            <button className="chat-close" onClick={onClose} aria-label={tr('Fermer')}><Icon name="x" /></button>
          </div>
        </div>

        {sent ? (
          <div className="chat-messages" style={{ gap: 14 }}>
            <div className="drawer-section" role="status">
              <div className="u-fs13-strong">{sent.delivery === 'SENT' ? tr('Demande envoyée à {0}', [sent.manufacturer ?? offer.manufacturer?.name]) : tr('Demande enregistrée')}</div>
              {sent.delivery !== 'SENT' && <div className="u-fs-12 u-t63">{tr('Le fabricant est momentanément injoignable : votre demande lui sera transmise automatiquement.')}</div>}
            </div>
            {isOrder && (
              <div className="drawer-section">
                <ol className="u-fs-12" style={{ paddingInlineStart: 18, display: 'grid', gap: 6 }}>
                  <li>{tr('Le fabricant examine et confirme votre demande.')}</li>
                  <li>{tr('Il attribue les lots livrés (traçabilité en cas de retrait).')}</li>
                  <li>{tr('Il vous contacte pour la livraison et la facturation, hors ligne.')}</li>
                </ol>
                <div className="u-fs10-5-tertiary" style={{ marginTop: 8 }}>{tr('Suivez son état dans « Suivi des commandes ».')}</div>
              </div>
            )}
            <div className="drawer-actions"><button className="btn btn--primary btn--full" onClick={onClose}>{tr('Voir le suivi')}</button></div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate style={{ display: 'contents' }}>
            <div className="chat-messages" style={{ gap: 4 }}>
              <div className="drawer-section">
                <div className="u-fs12-500">{offer.name}</div>
                <div className="u-fs10-5-tertiary">{offer.reference} · {money(offer.unitPrice)} {tr('/ unité, indicatif')}</div>
                {viaOrder && est && <div className="u-fs10-5-tertiary">{tr('Acheteur')} : <strong>{est.name}</strong> · {tr(CATEGORY_LABEL[est.buyerCategory] ?? est.buyerCategory)} · {tr('vérifiée')}</div>}
              </div>
              <div className="drawer-section">
                <div className="form-row">
                  <div className="form-group" style={field}>
                    <label className="form-label" htmlFor="mkt-qty">{isOrder ? `${tr('Quantité (unités)')} *` : tr('Quantité envisagée (facultatif)')}</label>
                    <input id="mkt-qty" className="form-input" type="number" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} aria-invalid={!qtyOk} />
                  </div>
                  {isOrder && (
                    <div className="form-group" style={field}>
                      <span className="form-label">{tr('Montant indicatif')}</span>
                      <b>{qtyOk ? money(n * offer.unitPrice) : '—'}</b>
                    </div>
                  )}
                </div>
                {isOrder && (
                  <>
                    <div className="form-group" style={field}>
                      <label className="form-label" htmlFor="mkt-place">{tr('Lieu de livraison')} *</label>
                      <input id="mkt-place" className="form-input" value={deliveryPlace} maxLength={300} onChange={(e) => setDeliveryPlace(e.target.value)} placeholder={tr('Ex. pharmacie centrale, bâtiment B, Sétif')} />
                    </div>
                    <div className="form-row">
                      <div className="form-group" style={field}>
                        <label className="form-label" htmlFor="mkt-date">{tr('Date souhaitée')}</label>
                        <input id="mkt-date" className="form-input" type="date" min={todayIso()} value={desiredDate} onChange={(e) => setDesiredDate(e.target.value)} aria-invalid={!dateOk} />
                      </div>
                      <div className="form-group" style={field}>
                        <label className="form-label" htmlFor="mkt-po">{tr('Référence de bon de commande')}</label>
                        <input id="mkt-po" className="form-input" value={purchaseOrderRef} maxLength={100} onChange={(e) => setPurchaseOrderRef(e.target.value)} />
                      </div>
                    </div>
                    {!dateOk && <div className="u-fs10-5-tertiary" role="alert">{tr('La date souhaitée ne peut pas être passée.')}</div>}
                  </>
                )}
              </div>
              <div className="drawer-section">
                <div className="drawer-section-title">{tr('Contact')}</div>
                <div className="form-group" style={field}>
                  <label className="form-label" htmlFor="mkt-name">{tr('Nom')} *</label>
                  <input id="mkt-name" className="form-input" value={contact.name} maxLength={200} onChange={setC('name')} autoComplete="name" />
                </div>
                <div className="form-row">
                  <div className="form-group" style={field}>
                    <label className="form-label" htmlFor="mkt-email">{tr('E-mail')} *</label>
                    <input id="mkt-email" className="form-input" type="email" value={contact.email} maxLength={200} onChange={setC('email')} autoComplete="email" />
                  </div>
                  <div className="form-group" style={field}>
                    <label className="form-label" htmlFor="mkt-phone">{tr('Téléphone')}</label>
                    <input id="mkt-phone" className="form-input" type="tel" value={contact.phone} maxLength={40} onChange={setC('phone')} autoComplete="tel" />
                  </div>
                </div>
                <div className="form-group" style={field}>
                  <label className="form-label" htmlFor="mkt-note">{isOrder ? tr('Note au fabricant') : tr('Message (facultatif)')}</label>
                  <textarea id="mkt-note" className="form-input" rows={3} maxLength={isOrder ? noteRoom : 2000} value={note}
                    onChange={(e) => setNote(isOrder ? e.target.value.slice(0, noteRoom) : e.target.value)}
                    placeholder={isOrder ? tr('Conditionnement, contraintes de réception…') : tr('Votre besoin, vos questions…')} />
                </div>
                {error && <div className="login-error" role="alert" style={{ marginTop: 8 }}><Icon name="alert-circle" /><span>{error}</span></div>}
              </div>
            </div>
            <div className="drawer-actions">
              <button type="submit" className="btn btn--primary btn--full" disabled={!valid || busy}>
                <Icon name="send" />{busy ? tr('Envoi…') : isOrder ? tr('Envoyer la demande') : tr('Envoyer')}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
