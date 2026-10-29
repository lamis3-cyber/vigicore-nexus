import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { CATEGORY_SHORT, getMarketMe, listOffers } from '../../../lib/market';
import { BuyerBanner, RequestDrawer, buyerEstablishment, canOrderOffer, money } from '../market/MarketOrders';
import { tr } from '../../../i18n/translate.js';
import './supplier.css';

// ═══════════════════════════════════════════════════════════════
// Fournisseur / distributeur — « Commander » : le catalogue des fabricants, rien d'autre.
// Le suivi des commandes et l'historique des achats ont leurs propres pages. Même API et même fenêtre de commande que
// partout (aucun paiement en ligne : une commande est une DEMANDE que le fabricant confirme). Le serveur décide qui peut
// commander (catégorie vérifiée par VigiCore) : l'interface ne fait que pré-vérifier.
// `entry` = { offer } quand on arrive depuis une fiche produit du site : la fenêtre s'ouvre sur ce produit.
// ═══════════════════════════════════════════════════════════════

export default function SupplierCatalogue({ onNavigate, entry, onEntryConsumed }) {
  const toast = useToast();
  const { user } = useAuth();
  const [me, setMe] = useState(undefined); // undefined = chargement ; null = échec
  const [offers, setOffers] = useState(undefined); // undefined = chargement ; null = catalogue indisponible
  const [query, setQuery] = useState('');
  const [drawer, setDrawer] = useState(null);
  const sent = useRef(false);
  const consumed = useRef(false);

  useEffect(() => {
    let off = false;
    Promise.all([getMarketMe(), listOffers()]).then(([m, o]) => {
      if (off) return;
      setMe(m.ok ? m.data : null);
      setOffers(o.ok ? o.data.offers ?? [] : null);
    });
    return () => { off = true; };
  }, []);

  const est = useMemo(() => buyerEstablishment(me), [me]);

  // Arrivée depuis une fiche produit : on ouvre directement la commande de ce produit (une seule fois).
  useEffect(() => {
    if (consumed.current || !entry?.offer || me === undefined || offers === undefined) return;
    consumed.current = true;
    const offer = (offers ?? []).find((o) => o.ref === entry.offer);
    if (!offer) toast('info', tr('Produit introuvable'), tr("Ce produit n'est plus proposé : choisissez-en un dans la liste."), 'ti ti-alert-circle');
    else if (est?.orderBlocker === 'CATEGORY_NOT_ALLOWED') toast('info', tr('Achat non disponible'), tr("Votre catégorie ne permet pas d'acheter directement auprès des fabricants : adressez-vous à un distributeur."), 'ti ti-alert-circle');
    else setDrawer({ kind: canOrderOffer(est, offer) ? 'order' : 'interest', offer });
    onEntryConsumed?.();
  }, [entry, me, offers, est, toast, onEntryConsumed]);

  const q = query.trim().toLowerCase();
  const shown = (offers ?? []).filter((o) => !q || `${o.name} ${o.reference} ${o.manufacturer?.name ?? ''}`.toLowerCase().includes(q));

  const closeDrawer = () => {
    setDrawer(null);
    // Une demande vient d'être envoyée : on ouvre son suivi (la fenêtre propose « Voir le suivi »).
    if (sent.current) { sent.current = false; onNavigate?.('sup-suivi'); }
  };

  return (
    <div className="view is-active">
      <div className="page-header">
        <div>
          <h1 className="page-title">{tr("Commander un produit")}</h1>
          <div className="u-fs-12 u-c-tertiary" style={{ marginTop: 4 }}>{tr("Choisissez un produit publié par un fabricant ou un autre fournisseur et envoyez-lui une demande de commande.")}</div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => onNavigate?.('sup-suivi')}><Icon name="truck-delivery" />{tr("Suivi des commandes")}</button>
        </div>
      </div>

      <BuyerBanner me={me} est={est} />

      <div className="sup-toolbar" style={{ marginTop: 14 }}>
        <label className="sup-search"><Icon name="search" />
          <input type="text" placeholder={tr('Rechercher un produit, une réf, un fabricant…')} aria-label={tr('Rechercher dans le catalogue')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {offers && <span className="u-fs-12 u-c-tertiary">{shown.length} {tr("produit(s)")}</span>}
      </div>

      {offers === undefined && <p className="u-fs-12 u-t8">{tr('Chargement…')}</p>}
      {offers === null && (
        <div className="card"><div className="sup-empty"><span className="sup-empty-ico"><Icon name="alert-triangle" /></span>
          <div className="sup-empty-t">{tr('Le catalogue des fabricants est momentanément indisponible.')}</div></div></div>
      )}
      {offers && shown.length === 0 && (
        <div className="card"><div className="sup-empty"><span className="sup-empty-ico"><Icon name="search" /></span>
          <div className="sup-empty-t">{tr('Aucun produit ne correspond')}</div></div></div>
      )}
      {offers && shown.length > 0 && (
        <div className="sup-prod-grid">
          {shown.map((o) => {
            const can = canOrderOffer(est, o);
            const blocked = est?.orderBlocker === 'CATEGORY_NOT_ALLOWED';
            return (
              <div key={o.ref} className="sup-prod">
                <div className="sup-prod-top">
                  <span className="sup-prod-ico"><Icon name="package" /></span>
                  <div>
                    <div className="sup-prod-name">{o.name}</div>
                    <div className="sup-prod-mfr">{o.manufacturer?.name ?? '—'} · <em style={{ fontStyle: 'normal', opacity: 0.8 }}>{o.source === 'SUPPLIER' ? tr('Distributeur') : tr('Fabricant')}</em></div>
                  </div>
                </div>
                <div className="sup-prod-chips">
                  <span className="sup-chip">{o.reference}</span>
                  {(o.orderableBy ?? []).length > 0 && <span className="u-fs10-5-tertiary" style={{ alignSelf: 'center' }}>{tr('Commandable par :')}</span>}
                  {(o.orderableBy ?? []).map((c) => <span key={c} className="sup-chip" style={{ fontFamily: 'inherit' }}>{tr(CATEGORY_SHORT[c] ?? c)}</span>)}
                </div>
                <div className="sup-prod-foot">
                  <div className="sup-price">{money(o.unitPrice)} <small>/ {o.priceUnit || tr('unité')}{o.minOrderQty > 1 ? ` · ${tr('min.')} ${o.minOrderQty}` : ''}</small></div>
                  {o.listingId && <a className="btn" href={`/services/${encodeURIComponent(o.listingId)}`} target="_blank" rel="noopener noreferrer"><Icon name="external-link" />{tr('Voir la fiche')}</a>}
                  {blocked
                    ? <button className="btn" disabled>{tr('Non disponible pour votre catégorie')}</button>
                    : <button className="btn btn--primary" onClick={() => setDrawer({ kind: can ? 'order' : 'interest', offer: o })}>{tr('Commander')}</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {drawer && (
        <RequestDrawer
          kind={drawer.kind} offer={drawer.offer} est={est} user={user}
          onClose={closeDrawer}
          onSent={() => { sent.current = true; }}
          onToast={(...a) => toast(...a)}
        />
      )}
    </div>
  );
}
