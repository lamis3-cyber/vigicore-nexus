import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import { useAuth } from '../../context/AuthContext';
import { listMyRecords } from '../../../lib/declarationsApi';
import { presentRecordStatus, recordTitle } from '../../lib/myDeclarations.js';import { usePersonalList, todayIso } from '../../lib/usePersonal';
import { productsNeedingAction } from '../../lib/patientProducts';
import { isActiveTreatment } from '../../lib/treatments';
import { tr, localeTag } from '../../../i18n/translate.js';

// Patient dashboard — real data only.
// Declarations: GET /api/declarations. Treatments, appointments and products: the patient's own
// records (/api/personal/*); recalls are derived from the products' lot numbers.
function EmptyState({ children }) {
  return <div className="u-fs-12 u-t102" style={{ padding: '8px 0' }}>{children}</div>;
}


export default function PatientDashboard({ onNavigate }) {
  const { user } = useAuth();
  const [subs, setSubs] = useState(null); // null = loading
  useEffect(() => {
    let off = false;
  
    listMyRecords()
      .then((r) => {
        if (!off) setSubs(r.ok ? r.records : []);
      })
      .catch(() => {
        if (!off) setSubs([]);
      });
  
    return () => {
      off = true;
    };
}, []);

  const treatments = usePersonalList('treatment');
  const appointments = usePersonalList('appointment');
  const products = usePersonalList('product');
  const today = todayIso();
  const activeTreatments = (treatments.items || []).filter((t) => isActiveTreatment(t, today)).length;
  const nextAppt = (appointments.items || [])
    .filter((a) => a.date >= today && a.status !== 'done' && a.status !== 'cancelled')
    .sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`))[0];
  const alerts = productsNeedingAction(products.items || []);

  const total = subs?.length ?? 0;
  const toFix = subs?.filter((s) => s.status === 'DRAFT').length ?? 0;
  return (
    <div className="view is-active">
      <div className="page-header">
        <div>
          <h1 className="page-title">{tr("Bonjour")}{user?.name ? ', ' : ''}<span className="page-title-accent">{user?.name || ''}</span></h1>
        </div>
        <div className="page-actions">
          <button className="btn btn--primary" onClick={() => onNavigate('declarer')}><Icon name="alert-circle" />{tr("Déclarer un effet indésirable")}</button>
        </div>
      </div>

      <div className="grid-kpi">
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-label">{tr("Mes déclarations")}</div>
            <div className="kpi-icon u-t15"><Icon name="clipboard" /></div>
          </div>
          <div className="kpi-value">{subs === null ? '…' : total}</div>
          <div className="kpi-sub">
  {subs === null
    ? tr("Chargement")
    : total
      ? tr("{0} enregistrée(s) dans votre espace", [total])
      : tr("Aucune déclaration")}
</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-label">{tr("À suivre")}</div>
            <div className="kpi-icon u-bg-purple-dim"><Icon name="clock" /></div>
          </div>
          <div className="kpi-value">{subs === null ? '…' : toFix}</div>
          <div className="kpi-sub">{toFix ? tr("En attente ou à renvoyer") : tr("Rien en attente")}</div>
        </div>
        <div className="kpi-card" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => onNavigate('traitements')} onKeyDown={(e) => { if (e.key === 'Enter') onNavigate('traitements'); }}>
          <div className="kpi-header">
            <div className="kpi-label">{tr("Traitements actifs")}</div>
            <div className="kpi-icon u-t10"><Icon name="pill" /></div>
          </div>
          <div className="kpi-value">{treatments.loading ? '…' : activeTreatments}</div>
          <div className="kpi-sub">{activeTreatments ? tr("Suivre mes prises") : tr("Aucun traitement")}</div>
        </div>
        <div className="kpi-card" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => onNavigate('rdv')} onKeyDown={(e) => { if (e.key === 'Enter') onNavigate('rdv'); }}>
          <div className="kpi-header">
            <div className="kpi-label">{tr("Prochain RDV")}</div>
            <div className="kpi-icon u-bg-purple-dim"><Icon name="calendar" /></div>
          </div>
          <div className="kpi-value" style={{ fontSize: '18px' }}>{appointments.loading ? '…' : nextAppt ? new Date(`${nextAppt.date}T00:00:00`).toLocaleDateString(localeTag(), { day: '2-digit', month: 'short' }) : '—'}</div>
          <div className="kpi-sub">{nextAppt ? nextAppt.practitioner : tr("Aucun RDV planifié")}</div>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="alert-banner alert-banner--red" role="alert">
          <Icon name="alert-triangle" />
          <div className="u-flex-1">
            <div className="alert-banner-title">{tr("{0} de vos produits fait l'objet d'une alerte", [alerts.length])}</div>
            <div className="alert-banner-text">{alerts.map((a) => a.product.name).join(', ')}</div>
          </div>
          <button className="btn btn--danger u-btn-sm" onClick={() => onNavigate('alertes')}>{tr("Voir")}</button>
        </div>
      )}

      <div className="card">
        <div className="section-header">
          <h2 className="section-title"><Icon name="history" className="u-c-cyan" />{tr("Activité récente")}</h2>
          {total > 0 && <button className="btn u-btn-sm" onClick={() => onNavigate('declarations')}>{tr("Tout voir")}</button>}
        </div>
        {subs === null ? <EmptyState>{tr("Chargement…")}</EmptyState>
          : total === 0 ? <EmptyState>{tr("Aucune activité récente.")}</EmptyState>
          : subs.slice(0, 5).map((record) => {
    const status = presentRecordStatus(record);

    return (
      <div
        key={record.id}
        className="u-fs-12"
        style={{
          padding: '8px 0',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12
        }}
      >
        <span>
          {new Date(record.createdAt).toLocaleDateString(localeTag())}
          {' — '}
          {recordTitle(record)}
        </span>
        <b>{tr(status.label)}</b>
      </div>
    );
  })}
      </div>
    </div>
  );
}
