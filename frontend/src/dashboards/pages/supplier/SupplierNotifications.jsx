import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon';
import { listLotAlerts, markAllLotAlertsRead, markLotAlertRead } from '../../../lib/market';
import { tr } from '../../../i18n/translate.js';
import { ago } from './supplierUi.js';
import './supplier.css';

// ═══════════════════════════════════════════════════════════════
// Fournisseur / distributeur — « Alertes » : uniquement les alertes de lot (un fabricant retire ou rétablit un lot que le
// fournisseur a commandé), GET /api/market/lot-alerts. Le suivi des commandes a sa propre page. Détection par relecture
// périodique côté serveur : PAS instantané, et ce n'est pas un canal officiel de rappel — la consigne affichée est celle
// du serveur, à confirmer (encadrant / MIPH).
// ═══════════════════════════════════════════════════════════════

export default function SupplierNotifications() {
  const [alerts, setAlerts] = useState(undefined); // undefined = chargement ; null = indisponible
  const [filter, setFilter] = useState('unread');

  const load = useCallback(async () => {
    const a = await listLotAlerts();
    setAlerts(a.ok ? a.data.alerts ?? [] : null);
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const shown = useMemo(() => (alerts ?? []).filter((a) => filter === 'all' || !a.read), [alerts, filter]);
  const unread = (alerts ?? []).filter((a) => !a.read).length;

  const openAlert = async (a) => {
    if (a.read) return;
    setAlerts((list) => list.map((x) => (x.id === a.id ? { ...x, read: true } : x)));
    await markLotAlertRead(a.id);
  };
  const readAll = async () => {
    setAlerts((list) => (list ?? []).map((x) => ({ ...x, read: true })));
    await markAllLotAlertsRead();
  };

  return (
    <div className="view is-active">
      <div className="page-header">
        <div>
          <h1 className="page-title">{tr("Alertes de lot")}</h1>
          <div className="u-fs-12 u-c-tertiary" style={{ marginTop: 4 }}>{tr("Les retraits et rétablissements de lots signalés par les fabricants pour vos commandes.")}</div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={load}><Icon name="rotate-clockwise" />{tr("Actualiser")}</button>
          {unread > 0 && <button className="btn btn--primary" onClick={readAll}><Icon name="check" />{tr("Tout marquer comme lu")}</button>}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="sup-card-h">
          <h2><Icon name="alert-triangle" className="u-c-red" />{tr("Alertes de lot")}</h2>
          <div className="sup-seg" role="tablist" aria-label={tr("Filtrer les alertes")}>
            <button className={filter === 'unread' ? 'is-active' : ''} role="tab" aria-selected={filter === 'unread'} onClick={() => setFilter('unread')}>{tr("Non lues")}{unread ? ` (${unread})` : ''}</button>
            <button className={filter === 'all' ? 'is-active' : ''} role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')}>{tr("Toutes")}</button>
          </div>
        </div>

        {alerts === undefined && <p className="u-fs-12 u-t8">{tr("Chargement…")}</p>}
        {alerts === null && <p className="u-fs-12 u-t8">{tr("Impossible de charger les alertes pour le moment.")}</p>}
        {alerts && shown.length === 0 && (
          <div className="sup-empty">
            <span className="sup-empty-ico"><Icon name={filter === 'unread' ? 'circle-check' : 'bell'} /></span>
            <div className="sup-empty-t">{filter === 'unread' ? tr("Aucune alerte non lue.") : tr("Aucune alerte de lot pour le moment.")}</div>
            <div className="sup-empty-d">{tr("Vous serez prévenu ici si un fabricant retire un lot que vous avez commandé.")}</div>
          </div>
        )}
        <div className="sup-alerts">
          {shown.map((a) => {
            const withdrawn = a.event === 'WITHDRAWN';
            return (
              <button key={a.id} type="button" onClick={() => openAlert(a)} className={`sup-alert ${withdrawn ? 't-red' : 't-green'} ${a.read ? 'is-read' : 'is-unread'}`}>
                <span className="sup-alert-ico"><Icon name={withdrawn ? 'alert-triangle' : 'circle-check'} /></span>
                <span className="sup-alert-body">
                  <span className="sup-alert-top">
                    {!a.read && <span className="sup-dot" aria-label={tr("Non lue")} />}
                    <span className="sup-alert-name">{a.productName}</span>
                    <span className="sup-chip">{tr("Lot")} {a.lotNumber}</span>
                    <span className="sup-tag">{withdrawn ? tr("Lot retiré") : tr("Lot rétabli")}</span>
                  </span>
                  <div className="sup-alert-meta">{a.manufacturer ? `${a.manufacturer} · ` : ''}{ago(a.detectedAt)}</div>
                  {a.instruction && <div className="sup-alert-note"><strong>{tr("Consigne :")}</strong> {a.instruction}</div>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}
