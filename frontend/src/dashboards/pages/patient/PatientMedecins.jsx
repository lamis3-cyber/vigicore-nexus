import { useCallback, useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import { listMyDoctors, acceptDoctor, declineDoctor } from '../../../lib/careApi';
import { useToast } from '../../context/ToastContext';
import { tr } from '../../../i18n/translate.js';
import './patient-medecins.css';

// « Mes médecins » : les médecins qui suivent le patient (ils l'ont ajouté avec son e-mail). Le patient décide :
// accepter (ils peuvent recevoir les déclarations qu'il choisit de partager et échanger avec lui), refuser, ou arrêter le partage.
const initials = (n) => (n || '').replace(/^Dr\.?\s*/i, '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'DR';

export default function PatientMedecins() {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, ok: false, doctors: [] });
  const [busy, setBusy] = useState(null);
  const [confirmStop, setConfirmStop] = useState(null);
  const load = useCallback(async () => setState({ loading: false, ...(await listMyDoctors()) }), []);
  useEffect(() => { load(); }, [load]);

  async function act(doctorId, fn, okTitle, okMsg) {
    setBusy(doctorId);
    const r = await fn(doctorId);
    setBusy(null); setConfirmStop(null);
    if (r.ok) { setState({ loading: false, ...r }); toast?.('success', tr(okTitle), tr(okMsg), 'ti ti-circle-check'); }
    else toast?.('error', tr('Action impossible'), tr(r.message || 'Réessayez dans un instant.'), 'ti ti-alert-triangle');
  }

  const doctors = state.doctors || [];
  const pending = doctors.filter((d) => d.status === 'PENDING');
  const accepted = doctors.filter((d) => d.status === 'ACCEPTED');

  return (
    <div className="view is-active">
      <div className="page-header">
        <div>
          <h1 className="page-title">{tr('Mes médecins')}</h1>
          <div className="u-fs-12 u-c-tertiary" style={{ marginTop: 4 }}>{tr('Les médecins qui vous suivent. Vous choisissez avec qui vous partagez vos déclarations.')}</div>
        </div>
      </div>

      {state.loading && <div className="card u-fs-12">{tr('Chargement…')}</div>}
      {!state.loading && !state.ok && (
        <div className="card u-fs-12" role="alert">{state.unauthorized ? tr('Session expirée : reconnectez-vous.') : tr('Liste momentanément indisponible.')} <button className="tbl-action-btn" onClick={load}>{tr('Réessayer')}</button></div>
      )}
      {state.ok && doctors.length === 0 && (
        <div className="card pm-empty">
          <Icon name="stethoscope" />
          <div>
            <strong>{tr('Aucun médecin pour le moment')}</strong>
            <span>{tr('Quand un médecin vous ajoute avec votre adresse e-mail, il apparaît ici pour que vous puissiez accepter.')}</span>
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <section>
          <h2 className="pm-section">{tr('En attente de votre accord')}</h2>
          <ul className="pm-list">
            {pending.map((d) => (
              <li key={d.doctorId} className="pm-item is-pending">
                <span className="pm-avatar">{initials(d.displayName)}</span>
                <div className="pm-body">
                  <div className="pm-name">{d.displayName}</div>
                  <div className="pm-meta">{[d.establishment, tr('vous suit depuis le {0}', [new Date(d.since).toLocaleDateString('fr-FR')])].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="pm-actions">
                  <button className="btn" disabled={busy === d.doctorId} onClick={() => act(d.doctorId, declineDoctor, 'Demande refusée', 'Ce médecin n’est plus lié à votre compte.')}>{tr('Refuser')}</button>
                  <button className="btn btn--primary" disabled={busy === d.doctorId} onClick={() => act(d.doctorId, acceptDoctor, 'Médecin accepté', 'Vous pouvez désormais lui partager vos déclarations.')}><Icon name="check" />{tr('Accepter')}</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {accepted.length > 0 && (
        <section>
          <h2 className="pm-section">{tr('Partage actif')}</h2>
          <ul className="pm-list">
            {accepted.map((d) => (
              <li key={d.doctorId} className="pm-item">
                <span className="pm-avatar">{initials(d.displayName)}</span>
                <div className="pm-body">
                  <div className="pm-name">{d.displayName} <span className="pm-badge">{tr('Accepté')}</span></div>
                  <div className="pm-meta">{[d.establishment, tr('Peut recevoir les déclarations que vous choisissez de partager')].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="pm-actions">
                  {confirmStop === d.doctorId ? (
                    <>
                      <button className="btn" onClick={() => setConfirmStop(null)}>{tr('Annuler')}</button>
                      <button className="btn pm-danger" disabled={busy === d.doctorId} onClick={() => act(d.doctorId, declineDoctor, 'Partage arrêté', 'Ce médecin n’a plus accès à vos déclarations partagées.')}>{tr('Confirmer l’arrêt')}</button>
                    </>
                  ) : (
                    <button className="btn" onClick={() => setConfirmStop(d.doctorId)}>{tr('Arrêter le partage')}</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
