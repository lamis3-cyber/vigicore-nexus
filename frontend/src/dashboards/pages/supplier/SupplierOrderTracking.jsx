import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon';
import { cancelMyRequest, listMyRequests, requestState } from '../../../lib/market';
import { useToast } from '../../context/ToastContext';
import { money } from '../market/MarketOrders';
import { tr } from '../../../i18n/translate.js';
import { ago } from './supplierUi.js';
import { hasWithdrawnLot, isClosed, isOrder, stageOf } from './supplierOrders.js';
import SupplierOrderDetail, { OrderProgress } from './SupplierOrderDetail.jsx';
import './supplier.css';

// ═══════════════════════════════════════════════════════════════
// Fournisseur / distributeur — « Suivi des commandes » : uniquement ce qui est EN COURS (commandes ouvertes chez le
// fabricant) et, à part, les demandes d'intérêt. Les achats terminés sont dans « Historique ». Cliquer une carte ouvre
// le suivi détaillé de cette seule commande. Données réelles (GET /api/market/requests), rafraîchies chaque minute.
// ═══════════════════════════════════════════════════════════════

const TONE = { wait: 'amber', ok: 'cyan', done: 'green', off: 'red' };

export default function SupplierOrderTracking({ onNavigate }) {
  const [requests, setRequests] = useState(undefined); // undefined = chargement ; null = indisponible
  const [tab, setTab] = useState('orders');
  const [openId, setOpenId] = useState(null);
  const toast = useToast();

  const load = useCallback(async () => {
    const r = await listMyRequests();
    setRequests(r.ok ? r.data.requests ?? [] : null);
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const all = requests ?? [];
  const open = useMemo(() => all.filter((r) => isOrder(r) && !isClosed(r)), [all]);
  const interests = useMemo(() => all.filter((r) => !isOrder(r)), [all]);
  const waiting = open.filter((r) => stageOf(r).done <= 1).length;
  const confirmed = open.filter((r) => [2, 3].includes(stageOf(r).done)).length;
  async function cancelOrder(order) {
    const r = await cancelMyRequest(order.id);
    if (!r.ok) toast('error', tr('Annulation impossible'), tr(r.error), 'ti ti-alert-circle');
    else toast('success', tr('Commande annulée'), order.summary, 'ti ti-circle-check');
    await load();
  }
  const list = tab === 'orders' ? open : interests;
  const detail = openId ? all.find((r) => r.id === openId) : null;

  return (
    <div className="view is-active">
      <div className="page-header">
        <div>
          <h1 className="page-title">{tr("Suivi des commandes")}</h1>
          <div className="u-fs-12 u-c-tertiary" style={{ marginTop: 4 }}>{tr("Où en sont vos commandes chez les fabricants et les autres fournisseurs.")}</div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={load}><Icon name="rotate-clockwise" />{tr("Actualiser")}</button>
          <button className="btn" onClick={() => onNavigate?.('sup-historique')}><Icon name="history" />{tr("Historique des achats")}</button>
          <button className="btn btn--primary" onClick={() => onNavigate?.('sup-catalogue')}><Icon name="plus" />{tr("Nouvelle commande")}</button>
        </div>
      </div>

      <div className="sup-stats">
        <div className="sup-stat t-blue" style={{ cursor: 'default' }}><span className="sup-stat-ico"><Icon name="clock" /></span><span><div className="sup-stat-num">{requests ? waiting : '—'}</div><div className="sup-stat-lab">{tr("En attente")}</div><div className="sup-stat-sub">{tr("du vendeur")}</div></span></div>
        <div className="sup-stat t-green" style={{ cursor: 'default' }}><span className="sup-stat-ico"><Icon name="circle-check" /></span><span><div className="sup-stat-num">{requests ? confirmed : '—'}</div><div className="sup-stat-lab">{tr("Confirmées")}</div><div className="sup-stat-sub">{tr("confirmées ou expédiées")}</div></span></div>
      </div>

      <div className="card">
        <div className="sup-card-h">
          <h2><Icon name="truck-delivery" className="u-c-green" />{tab === 'orders' ? tr("Commandes en cours") : tr("Demandes d'intérêt")}</h2>
          <div className="sup-seg" role="tablist">
            <button className={tab === 'orders' ? 'is-active' : ''} role="tab" aria-selected={tab === 'orders'} onClick={() => setTab('orders')}>{tr("Commandes")}{requests ? ` (${open.length})` : ''}</button>
            <button className={tab === 'interests' ? 'is-active' : ''} role="tab" aria-selected={tab === 'interests'} onClick={() => setTab('interests')}>{tr("Demandes d'intérêt")}{requests ? ` (${interests.length})` : ''}</button>
          </div>
        </div>

        {requests === undefined && <p className="u-fs-12 u-t8">{tr("Chargement…")}</p>}
        {requests === null && <p className="u-fs-12 u-t8">{tr("Impossible de charger vos demandes pour le moment.")}</p>}
        {requests && list.length === 0 && (
          <div className="sup-empty">
            <span className="sup-empty-ico"><Icon name={tab === 'orders' ? 'truck-delivery' : 'message'} /></span>
            <div className="sup-empty-t">{tab === 'orders' ? tr("Aucune commande en cours") : tr("Aucune demande d'intérêt")}</div>
            <div className="sup-empty-d">{tab === 'orders' ? tr("Vos commandes ouvertes apparaissent ici avec leur avancement. Les achats terminés sont dans l'historique.") : tr("Vos demandes d'intérêt apparaissent ici avec la réponse du vendeur.")}</div>
            {tab === 'orders' && <button className="btn btn--primary" onClick={() => onNavigate?.('sup-catalogue')}>{tr("Commander un produit")}</button>}
          </div>
        )}
        <div className="sup-orders">
          {list.map((r) => {
            const st = requestState(r);
            const lots = (r.lines ?? []).filter((l) => l.lotNumber);
            return (
              <button key={r.id} type="button" className="sup-order" onClick={() => setOpenId(r.id)}>
                <div className="sup-order-top">
                  <div>
                    <div className="sup-order-t">{r.summary}</div>
                    <div className="sup-order-s">{r.manufacturer ?? '—'} · {tr("envoyée")} {ago(r.createdAt)}</div>
                  </div>
                  <span className={`badge badge--${TONE[st.tone] ?? 'amber'}`}>{tr(st.label)}</span>
                </div>
                {isOrder(r) && <OrderProgress order={r} />}
                <div className="sup-order-foot">
                  {r.totalAmount != null && isOrder(r) && <span><strong>{money(r.totalAmount)}</strong></span>}
                  {lots.length > 0 && <span>{tr("Lots :")} {lots.map((l) => l.lotNumber).join(', ')}</span>}
                  {hasWithdrawnLot(r) && <span className="badge badge--red">{tr("Lot retiré")}</span>}
                  <span className="sup-link">{tr("Voir le suivi")} →</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {detail && <SupplierOrderDetail order={detail} onClose={() => setOpenId(null)} onCancel={cancelOrder} />}
    </div>
  );
}
