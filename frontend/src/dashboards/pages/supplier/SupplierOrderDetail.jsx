import { useState } from 'react';
import Icon from '../../components/Icon';
import { requestState } from '../../../lib/market';
import { money } from '../market/MarketOrders';
import { tr, localeTag } from '../../../i18n/translate.js';
import { stagesFor, HISTORY_LABEL, hasWithdrawnLot, stageOf } from './supplierOrders.js';
import './supplier.css';

const TONE = { wait: 'amber', ok: 'cyan', done: 'green', off: 'red' };
const dt = (iso) => new Date(iso).toLocaleString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Barre de progression Envoyée → Confirmée → (Expédiée →) Livrée (état réel de la commande). */
export function OrderProgress({ order }) {
  const { done, outcome } = stageOf(order);
  const stopped = outcome === 'cancelled' || outcome === 'refused';
  return (
    <ol className={`sup-prog${stopped ? ' is-stopped' : ''}`} aria-label={tr("Avancement de la commande")}>
      {stagesFor(order).map((s, i) => {
        const state = i < done ? 'is-done' : i === done && outcome === 'open' ? 'is-now' : '';
        return (
          <li key={s.id} className={`sup-prog-step ${state}`}>
            <span className="sup-prog-dot">{i < done ? <Icon name="check" /> : i + 1}</span>
            <span className="sup-prog-lab">{tr(s.label)}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Suivi détaillé d'UNE commande : avancement, chronologie, lignes (lots) et alertes de lot éventuelles. */
export default function SupplierOrderDetail({ order, onClose, onCancel }) {
  const st = requestState(order);
  const { outcome } = stageOf(order);
  const isOrderKind = order.kind === 'ORDER';
  const history = Array.isArray(order.history) ? [...order.history].filter((h) => h?.at).sort((a, b) => new Date(a.at) - new Date(b.at)) : [];
  const lines = order.lines ?? [];
  const fromSupplier = order.source === 'SUPPLIER';
  const [cancelling, setCancelling] = useState(false);
  const cancel = async () => {
    if (cancelling || !onCancel) return;
    setCancelling(true);
    await onCancel(order);
    setCancelling(false);
  };

  return (
    <>
      <div className="chat-overlay is-open" onClick={onClose} />
      <div className="chat-panel chat-panel--wide overlay-modal is-open" role="dialog" aria-modal="true" aria-labelledby="supOrderTitle">
        <div className="chat-header">
          <div className="chat-header-inner">
            <div className="drawer-icon" style={{ background: 'var(--color-brand)', color: '#fff' }}><Icon name={isOrderKind ? 'truck-delivery' : 'message'} /></div>
            <div className="u-flex-1 u-t31">
              <div id="supOrderTitle" className="u-fs13-strong">{isOrderKind ? tr("Suivi de la commande") : tr("Suivi de la demande")}</div>
              <div className="u-fs10-5-tertiary">{order.manufacturer ?? '—'}{order.reference ? ` · ${order.reference}` : ''}</div>
            </div>
            <button className="chat-close" onClick={onClose} aria-label={tr('Fermer')}><Icon name="x" /></button>
          </div>
        </div>

        <div className="chat-messages" style={{ gap: 18 }}>
          <div className="drawer-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div className="u-fs13-strong" style={{ overflowWrap: 'anywhere' }}>{order.summary}</div>
              <span className={`badge badge--${TONE[st.tone] ?? 'amber'}`}>{tr(st.label)}</span>
            </div>
            {isOrderKind && <OrderProgress order={order} />}
            {fromSupplier && order.refusal && <div className="sup-alert-note" style={{ background: 'var(--color-red-dim)' }}>{order.refusal}</div>}
            {outcome === 'refused' && order.refusal && <div className="sup-alert-note" style={{ background: 'var(--color-red-dim)' }}>{tr(order.refusal)}</div>}
            {hasWithdrawnLot(order) && (
              <div className="sup-alert-note" style={{ background: 'var(--color-red-dim)' }}>
                <strong>{tr("Lot retiré :")}</strong> {tr("un lot de cette commande a été retiré par le fabricant. Consultez vos notifications.")}
              </div>
            )}
          </div>

          <div className="drawer-section">
            <div className="drawer-section-title">{tr("Informations")}</div>
            <div className="drawer-kv">
              <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Envoyée le")}</span><span className="drawer-kv-value">{dt(order.createdAt)}</span></div>
              <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Dernière mise à jour")}</span><span className="drawer-kv-value">{dt(order.updatedAt)}</span></div>
              <div className="drawer-kv-item"><span className="drawer-kv-label">{fromSupplier ? tr("Fournisseur") : tr("Fabricant")}</span><span className="drawer-kv-value">{order.manufacturer ?? '—'}</span></div>
              {isOrderKind && <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Montant indicatif")}</span><span className="drawer-kv-value">{money(order.totalAmount)}</span></div>}
            </div>
          </div>

          {lines.length > 0 && (
            <div className="drawer-section">
              <div className="drawer-section-title">{tr("Produits et lots")}</div>
              <div className="u-overflow-x-auto">
                <table className="data-table">
                  <thead><tr><th>{tr("PRODUIT")}</th><th>{tr("QTÉ")}</th><th>{tr("LOT")}</th><th>{tr("EXPIRATION")}</th></tr></thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i}>
                        <td><div className="u-fs12-500">{l.product ?? '—'}</div>{l.unitPrice != null && <div className="u-fs10-5-tertiary">{money(l.unitPrice)} / {tr("unité")}</div>}</td>
                        <td>{l.quantity ?? '—'}</td>
                        <td>
                          {l.lotNumber ? <span className="sup-chip">{l.lotNumber}</span> : <span className="u-fs10-5-tertiary">{tr("À attribuer")}</span>}
                          {l.lotStatus === 'WITHDRAWN' && <div><span className="badge badge--red" style={{ marginTop: 4 }}>{tr("Lot retiré")}</span></div>}
                        </td>
                        <td className="u-fs-12">{l.expiryDate ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="drawer-section">
            <div className="drawer-section-title">{tr("Chronologie")}</div>
            {history.length === 0
              ? <div className="u-fs-12 u-c-tertiary">{tr("Aucun événement enregistré pour le moment.")}</div>
              : (
                <ol className="sup-timeline">
                  {history.map((h, i) => (
                    <li key={`${h.at}-${i}`}><b>{tr(HISTORY_LABEL[h.status] ?? h.status)}</b><span>{dt(h.at)}</span></li>
                  ))}
                </ol>
              )}
          </div>
          <div className="drawer-actions">
            {order.cancellable && onCancel && (
              <button className="btn btn--full" onClick={cancel} disabled={cancelling}><Icon name="x" />{tr("Annuler ma commande")}</button>
            )}
            <button className="btn btn--full" onClick={onClose}>{tr('Fermer')}</button>
          </div>
        </div>
      </div>
    </>
  );
}
