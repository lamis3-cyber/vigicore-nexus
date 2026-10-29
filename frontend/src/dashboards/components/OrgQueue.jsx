import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
import { listEstablishmentQueue, markQueueSeen } from '../../lib/declarationsApi';
import { SUBMISSIONS_CHANGED_EVENT } from './MySubmissions';
import RecordPanel from './RecordPanel';
import { titleOf, refOf, followUpOf, investigationOf, KIND_SHORT, dateOf } from './recordPresentation';
import { tr } from '../../i18n/translate.js';
import './record-panel.css';

// Déclarations reçues par L'ÉTABLISSEMENT (données réelles du serveur, autorisées par allow()). L'établissement n'enquête pas :
// il suit chaque déclaration (mesures internes) et l'enquête du fabricant. Les champs identifiant le patient ne sont jamais renvoyés.

const FILTERS = [
  { id: 'new', label: 'Nouvelles', test: (r) => followUpOf(r).id === 'new' },
  { id: 'done', label: 'Mesures prises', test: (r) => followUpOf(r).id === 'done' },
  { id: 'all', label: 'Toutes', test: () => true },
];

export default function OrgQueue() {
  const [state, setState] = useState({ loading: true, ok: false, records: [] });
  const [filter, setFilter] = useState('new');
  const [openId, setOpenId] = useState(null);

  const refresh = useCallback(async () => { setState({ loading: false, ...(await listEstablishmentQueue()) }); }, []);
  useEffect(() => { refresh(); }, [refresh]);
  // Voir la liste = les déclarations affichées sont lues (la pastille du menu disparaît).
  useEffect(() => { markQueueSeen(); }, []);
  useEffect(() => {
    window.addEventListener(SUBMISSIONS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(SUBMISSIONS_CHANGED_EVENT, refresh);
  }, [refresh]);

  const records = state.records || [];
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, records.filter(f.test).length])), [records]);
  const rows = useMemo(() => records.filter((FILTERS.find((f) => f.id === filter) || FILTERS[2]).test), [records, filter]);

  return (
    <section className="card u-p-0 oq" aria-label={tr("File de l'établissement")}>
      <div className="oq-toolbar">
        <div className="filter-tabs" role="tablist" aria-label={tr('Filtrer les déclarations')}>
          {FILTERS.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} className={`filter-tab${filter === f.id ? ' is-active' : ''}`} onClick={() => setFilter(f.id)}>
              {tr(f.label)}{state.ok && <span className="oq-count">{counts[f.id]}</span>}
            </button>
          ))}
        </div>
        <button className="btn" onClick={refresh}><Icon name="rotate-clockwise" />{tr('Actualiser')}</button>
      </div>

      {state.loading && <div className="oq-msg">{tr('Chargement…')}</div>}
      {!state.loading && !state.ok && (
        <div className="oq-msg" role="alert">
          {state.unauthorized ? tr('Session expirée : reconnectez-vous.') : tr('La liste est momentanément indisponible.')}{' '}
          <button className="tbl-action-btn" onClick={refresh}>{tr('Réessayer')}</button>
        </div>
      )}
      {state.ok && rows.length === 0 && (
        <div className="oq-empty"><Icon name="clipboard-check" />{filter === 'new' ? tr('Aucune nouvelle déclaration.') : tr('Aucune déclaration.')}</div>
      )}
      {state.ok && rows.length > 0 && (
        <div className="u-overflow-x-auto">
          <table className="oq-table">
            <thead>
              <tr>
                <th>{tr('Déclaration')}</th><th>{tr('Déclarant')}</th><th className="oq-col-date">{tr('Reçue le')}</th>
                <th>{tr('Suivi établissement')}</th><th className="oq-col-type">{tr('Enquête fabricant')}</th><th aria-label={tr('Actions')} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const fu = followUpOf(r); const inv = investigationOf(r); const sig = r.signal;
                return (
                  <tr key={r.id} onClick={() => setOpenId(r.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(r.id); }}>
                    <td>
                      <div className="oq-title" title={titleOf(r)}>{titleOf(r)}</div>
                      <div className="oq-ref">{refOf(r)} · {tr(KIND_SHORT[r.kind] || r.kind)}
                        {sig && sig.sameLot > 1 && <span className="oq-signal" title={tr('Déclarations sur le même lot (90 jours)')}>{tr('{0} sur ce lot', [sig.sameLot])}</span>}
                        {sig && !(sig.sameLot > 1) && sig.sameProduct > 1 && <span className="oq-signal" title={tr('Déclarations sur le même produit (90 jours)')}>{tr('{0} sur ce produit', [sig.sameProduct])}</span>}
                      </div>
                    </td>
                    <td><div>{r.authorName || '—'}</div>{r.departmentName && <div className="oq-sub">{r.departmentName}</div>}</td>
                    <td className="oq-col-date oq-date">{dateOf(r.createdAt)}</td>
                    <td><span className={`rp-badge is-${fu.tone}`}>{tr(fu.label)}</span></td>
                    <td className="oq-col-type"><span className={`oq-inv is-${inv.tone}`}>{tr(inv.label)}</span></td>
                    <td><div className="oq-actions"><button className="btn" onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }}><Icon name="eye" />{tr('Ouvrir')}</button></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {openId && <RecordPanel id={openId} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </section>
  );
}
