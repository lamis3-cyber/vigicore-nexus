import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon';
import { listEstablishmentQueue, markQueueSeen } from '../../../lib/declarationsApi';
import RecordPanel from '../../components/RecordPanel';
import { titleOf, followUpOf, investigationOf, SEVERITY_LABEL, agoOf } from '../../components/recordPresentation';
import { recordField } from '../../lib/myDeclarations';
import { tr } from '../../../i18n/translate.js';
import './org-notifications.css';

// Notifications de l'établissement, construites à partir des déclarations réelles (GET /records/queue) :
//  - « Nouvelle déclaration reçue » (tant qu'aucune mesure interne n'est enregistrée, elle est « nouvelle ») ;
//  - « Enquête clôturée par le fabricant » / « Le fabricant attend une information » (état lu chez VigiCore Audit).
function eventsOf(records) {
  const out = [];
  for (const r of records) {
    const fu = followUpOf(r);
    out.push({ key: `${r.id}:in`, record: r, at: r.createdAt, kind: 'received', isNew: fu.id === 'new', tone: fu.tone, icon: fu.icon, badge: fu.label,
      title: fu.id === 'new' ? 'Nouvelle déclaration reçue' : 'Déclaration reçue' });
    const inv = investigationOf(r);
    if (inv.status === 'CLOSED' && inv.at) {
      out.push({ key: `${r.id}:closed`, record: r, at: inv.at, kind: 'closed', isNew: false, tone: 'green', icon: 'circle-check', badge: 'Enquête clôturée',
        title: 'Enquête clôturée par le fabricant' });
    }
    if (inv.status === 'WAITING_INFO' && inv.at) {
      out.push({ key: `${r.id}:info`, record: r, at: inv.at, kind: 'info', isNew: false, tone: 'amber', icon: 'message-question', badge: 'Information demandée',
        title: 'Le fabricant attend une information du déclarant' });
    }
  }
  return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export default function OrgNotifications({ onNavigate }) {
  const [state, setState] = useState({ loading: true, ok: false, records: [] });
  const [filter, setFilter] = useState('new');
  const [openId, setOpenId] = useState(null);
  const refresh = useCallback(async () => { setState({ loading: false, ...(await listEstablishmentQueue()) }); }, []);
  // Ouvrir la page = l'utilisateur a vu ses notifications : les pastilles disparaissent (état propre à chaque utilisateur).
  useEffect(() => { markQueueSeen(); }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    window.addEventListener('vigicore:submissions-changed', refresh);
    return () => { clearInterval(t); window.removeEventListener('vigicore:submissions-changed', refresh); };
  }, [refresh]);

  const events = useMemo(() => eventsOf(state.records || []), [state.records]);
  const fresh = events.filter((e) => e.isNew);
  const list = filter === 'new' ? fresh : events;

  return (
    <div className="view is-active">
      <div className="page-header">
        <div>
          <h1 className="page-title">{tr("Notifications")}</h1>
          <div className="u-fs-12 u-c-tertiary" style={{ marginTop: 4 }}>{tr("Déclarations de vos équipes et suivi des enquêtes des fabricants.")}</div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={refresh}><Icon name="rotate-clockwise" />{tr("Actualiser")}</button>
          <button className="btn btn--primary" onClick={() => onNavigate?.('org-declarations')}><Icon name="clipboard-list" />{tr("Toutes les déclarations")}</button>
        </div>
      </div>

      <div className="filter-tabs" role="tablist" style={{ marginBottom: 12 }}>
        <button role="tab" aria-selected={filter === 'new'} className={`filter-tab${filter === 'new' ? ' is-active' : ''}`} onClick={() => setFilter('new')}>
          {tr("Nouvelles")} {fresh.length > 0 && <span className="onf-count">{fresh.length}</span>}
        </button>
        <button role="tab" aria-selected={filter === 'all'} className={`filter-tab${filter === 'all' ? ' is-active' : ''}`} onClick={() => setFilter('all')}>{tr("Toutes")}</button>
      </div>

      {state.loading && <div className="card u-fs-12">{tr("Chargement…")}</div>}
      {!state.loading && !state.ok && (
        <div className="card u-fs-12" role="alert">
          {state.unauthorized ? tr("Session expirée : reconnectez-vous.") : tr("Notifications momentanément indisponibles.")}{' '}
          <button className="tbl-action-btn" onClick={refresh}>{tr("Réessayer")}</button>
        </div>
      )}
      {state.ok && list.length === 0 && (
        <div className="card onf-empty">
          <Icon name="bell" />
          <div>{filter === 'new' ? tr("Aucune nouvelle déclaration.") : tr("Aucune notification pour le moment.")}</div>
        </div>
      )}
      {state.ok && list.length > 0 && (
        <ul className="onf-list">
          {list.map((e) => {
            const r = e.record;
            const sev = recordField(r, 'severity');
            const meta = e.kind === 'received'
              ? [r.authorName && tr("Par {0}", [r.authorName]), r.departmentName, sev && tr("Gravité : {0}", [tr(SEVERITY_LABEL[sev] || sev)]), tr(agoOf(e.at))]
              : [recordField(r, 'manufacturerName'), r.authorName && tr("Déclarée par {0}", [r.authorName]), tr(agoOf(e.at))];
            return (
              <li key={e.key} className={`onf-item is-${e.tone}${e.isNew ? ' is-new' : ''}`}>
                <span className="onf-icon"><Icon name={e.icon} /></span>
                <div className="onf-body">
                  <div className="onf-title">{tr(e.title)} — <strong>{titleOf(r)}</strong></div>
                  <div className="onf-meta">{meta.filter(Boolean).join(' · ')}</div>
                </div>
                <span className="onf-badge">{tr(e.badge)}</span>
                <button className="btn onf-open" onClick={() => setOpenId(r.id)}>{tr("Ouvrir")}</button>
              </li>
            );
          })}
        </ul>
      )}
      {openId && <RecordPanel id={openId} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </div>
  );
}
