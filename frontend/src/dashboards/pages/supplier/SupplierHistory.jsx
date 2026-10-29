import { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon';
import { listMyRequests } from '../../../lib/market';
import { money } from '../market/MarketOrders';
import { tr, localeTag } from '../../../i18n/translate.js';
import { downloadCsv, hasWithdrawnLot, isClosed, isOrder, OUTCOME_LABEL, stageOf } from './supplierOrders.js';
import SupplierOrderDetail from './SupplierOrderDetail.jsx';
import './supplier.css';

// ═══════════════════════════════════════════════════════════════
// Fournisseur / distributeur — « Historique des achats » : uniquement les commandes TERMINÉES (livrées, annulées,
// refusées). Totaux calculés sur les commandes réellement livrées ; montant indicatif (pas de facture ici : la livraison et la
// facturation se font hors ligne avec le fabricant). Export CSV pour la comptabilité. Données réelles (GET /api/market/requests).
// ═══════════════════════════════════════════════════════════════

const OUTCOME_BADGE = { delivered: 'green', cancelled: 'red', refused: 'red' };
const day = (iso) => new Date(iso).toLocaleDateString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric' });

export default function SupplierHistory({ onNavigate }) {
  const [requests, setRequests] = useState(undefined); // undefined = chargement ; null = indisponible
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let off = false;
    listMyRequests().then((r) => { if (!off) setRequests(r.ok ? r.data.requests ?? [] : null); });
    return () => { off = true; };
  }, []);

  const closed = useMemo(() => (requests ?? []).filter((r) => isOrder(r) && isClosed(r)), [requests]);
  const delivered = closed.filter((r) => stageOf(r).outcome === 'delivered');
  const total = delivered.reduce((s, r) => s + (typeof r.totalAmount === 'number' ? r.totalAmount : 0), 0);
  const manufacturers = new Set(delivered.map((r) => r.manufacturer).filter(Boolean)).size;
  const stopped = closed.length - delivered.length;

  const q = query.trim().toLowerCase();
  const rows = closed
    .filter((r) => filter === 'all' || stageOf(r).outcome === filter)
    .filter((r) => !q || `${r.summary} ${r.manufacturer ?? ''}`.toLowerCase().includes(q));
  const detail = openId ? (requests ?? []).find((r) => r.id === openId) : null;

  const exportCsv = () => downloadCsv(`historique-achats-${new Date().toISOString().slice(0, 10)}.csv`, [
    [tr('Date'), tr('Commande'), tr('Fabricant'), tr('Montant indicatif (DA)'), tr('Statut')],
    ...rows.map((r) => [new Date(r.createdAt).toISOString().slice(0, 10), r.summary, r.manufacturer ?? '', r.totalAmount ?? '', tr(OUTCOME_LABEL[stageOf(r).outcome])]),
  ]);

  const tab = (id, label) => <button className={filter === id ? 'is-active' : ''} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}>{label}</button>;

  return (
    <div className="view is-active">
      <div className="page-header">
        <div>
          <h1 className="page-title">{tr("Historique des achats")}</h1>
          <div className="u-fs-12 u-c-tertiary" style={{ marginTop: 4 }}>{tr("Vos commandes terminées : livrées, annulées ou refusées.")}</div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => onNavigate?.('sup-suivi')}><Icon name="truck-delivery" />{tr("Suivi des commandes")}</button>
          <button className="btn btn--primary" onClick={exportCsv} disabled={rows.length === 0}><Icon name="download" />{tr("Exporter en CSV")}</button>
        </div>
      </div>

      <div className="sup-stats">
        <div className="sup-stat t-green" style={{ cursor: 'default' }}><span className="sup-stat-ico"><Icon name="package" /></span><span><div className="sup-stat-num">{requests ? delivered.length : '—'}</div><div className="sup-stat-lab">{tr("Achats livrés")}</div><div className="sup-stat-sub">{tr("commandes reçues")}</div></span></div>
        <div className="sup-stat t-blue" style={{ cursor: 'default' }}><span className="sup-stat-ico"><Icon name="chart-bar" /></span><span><div className="sup-stat-num">{requests ? money(total) : '—'}</div><div className="sup-stat-lab">{tr("Montant livré")}</div><div className="sup-stat-sub">{tr("indicatif, hors facturation")}</div></span></div>
        <div className="sup-stat t-blue" style={{ cursor: 'default' }}><span className="sup-stat-ico"><Icon name="building-factory-2" /></span><span><div className="sup-stat-num">{requests ? manufacturers : '—'}</div><div className="sup-stat-lab">{tr("Fabricants")}</div><div className="sup-stat-sub">{tr("livraisons reçues")}</div></span></div>
        <div className="sup-stat t-red" style={{ cursor: 'default' }}><span className="sup-stat-ico"><Icon name="x" /></span><span><div className="sup-stat-num">{requests ? stopped : '—'}</div><div className="sup-stat-lab">{tr("Annulées ou refusées")}</div><div className="sup-stat-sub">{tr("non abouties")}</div></span></div>
      </div>

      <div className="card">
        <div className="sup-toolbar">
          <div className="sup-seg" role="tablist" aria-label={tr("Filtrer par statut")}>
            {tab('all', tr("Toutes"))}{tab('delivered', tr("Livrées"))}{tab('cancelled', tr("Annulées"))}{tab('refused', tr("Refusées"))}
          </div>
          <label className="sup-search"><Icon name="search" />
            <input type="text" placeholder={tr("Rechercher un produit ou un fabricant…")} aria-label={tr("Rechercher dans l'historique")} value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>

        {requests === undefined && <p className="u-fs-12 u-t8">{tr("Chargement…")}</p>}
        {requests === null && <p className="u-fs-12 u-t8">{tr("Impossible de charger vos demandes pour le moment.")}</p>}
        {requests && rows.length === 0 && (
          <div className="sup-empty">
            <span className="sup-empty-ico"><Icon name="history" /></span>
            <div className="sup-empty-t">{closed.length === 0 ? tr("Aucun achat terminé pour le moment") : tr("Aucun résultat pour ce filtre")}</div>
            <div className="sup-empty-d">{closed.length === 0 ? tr("Dès qu'une commande est livrée, annulée ou refusée, elle apparaît ici.") : tr("Changez de filtre ou de recherche.")}</div>
          </div>
        )}
        {rows.length > 0 && (
          <div className="u-overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>{tr("DATE")}</th><th>{tr("COMMANDE")}</th><th>{tr("FABRICANT")}</th><th>{tr("MONTANT")}</th><th>{tr("STATUT")}</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const o = stageOf(r).outcome;
                  return (
                    <tr key={r.id}>
                      <td className="u-fs-12">{day(r.createdAt)}</td>
                      <td><div className="u-fs12-500">{r.summary}</div>{hasWithdrawnLot(r) && <span className="badge badge--red" style={{ marginTop: 3 }}>{tr("Lot retiré")}</span>}</td>
                      <td className="u-fs-12">{r.manufacturer ?? '—'}</td>
                      <td className="u-fs-12">{money(r.totalAmount)}</td>
                      <td><span className={`badge badge--${OUTCOME_BADGE[o] ?? 'amber'}`}>{tr(OUTCOME_LABEL[o])}</span></td>
                      <td><button className="tbl-action-btn" onClick={() => setOpenId(r.id)}>{tr("Voir le suivi")}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && <SupplierOrderDetail order={detail} onClose={() => setOpenId(null)} />}
    </div>
  );
}
