import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import RecordPanel from './RecordPanel';
import { listFromPatients } from '../../lib/careApi';
import { titleOf, refOf, dateOf, SEVERITY_LABEL } from './recordPresentation';
import { recordField } from '../lib/myDeclarations';
import { tr } from '../../i18n/translate.js';
import './record-panel.css';

// Médecin : déclarations que ses patients ont choisi de lui partager (consentement donné dans « Mes médecins »).
export default function PatientSharedList() {
  const [state, setState] = useState({ loading: true, ok: false, records: [] });
  const [openId, setOpenId] = useState(null);
  const refresh = useCallback(async () => setState({ loading: false, ...(await listFromPatients()) }), []);
  useEffect(() => { refresh(); }, [refresh]);
  const rows = state.records || [];
  return (
    <section className="card u-p-0 oq" aria-label={tr('Déclarations de mes patients')}>
      <div className="oq-toolbar">
        <div className="u-fs-12 u-c-tertiary">{tr('Déclarations que vos patients ont choisi de vous partager.')}</div>
        <button className="btn" onClick={refresh}><Icon name="rotate-clockwise" />{tr('Actualiser')}</button>
      </div>
      {state.loading && <div className="oq-msg">{tr('Chargement…')}</div>}
      {!state.loading && !state.ok && <div className="oq-msg" role="alert">{state.unauthorized ? tr('Session expirée : reconnectez-vous.') : tr('La liste est momentanément indisponible.')}</div>}
      {state.ok && rows.length === 0 && <div className="oq-empty"><Icon name="clipboard-heart" />{tr('Aucune déclaration partagée par vos patients.')}</div>}
      {state.ok && rows.length > 0 && (
        <div className="u-overflow-x-auto">
          <table className="oq-table">
            <thead><tr><th>{tr('Déclaration')}</th><th>{tr('Patient')}</th><th className="oq-col-date">{tr('Reçue le')}</th><th>{tr('Gravité')}</th><th aria-label={tr('Actions')} /></tr></thead>
            <tbody>
              {rows.map((r) => {
                const sev = recordField(r, 'severity');
                return (
                  <tr key={r.id} onClick={() => setOpenId(r.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(r.id); }}>
                    <td><div className="oq-title" title={titleOf(r)}>{titleOf(r)}</div><div className="oq-ref">{refOf(r)}</div></td>
                    <td>{r.authorName || '—'}</td>
                    <td className="oq-col-date oq-date">{dateOf(r.createdAt)}</td>
                    <td>{sev ? tr(SEVERITY_LABEL[sev] || (sev === 'urgence' ? 'Urgence' : sev)) : '—'}</td>
                    <td><div className="oq-actions"><button className="btn" onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }}><Icon name="eye" />{tr('Ouvrir')}</button></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {openId && <RecordPanel id={openId} onClose={() => setOpenId(null)} />}
    </section>
  );
}
