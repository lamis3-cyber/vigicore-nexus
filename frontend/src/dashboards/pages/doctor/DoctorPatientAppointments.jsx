import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import { listPatientAppointments } from '../../../lib/careApi';
import { todayIso } from '../../lib/usePersonal';
import { tr, localeTag } from '../../../i18n/translate.js';

// Rendez-vous que les patients ont choisi de communiquer à ce médecin (consentement du patient toujours actif).
// Lecture seule : aucune confirmation automatique n'existe, le médecin contacte le patient lui-même.
export default function DoctorPatientAppointments() {
  const [state, setState] = useState({ loading: true, items: [] });
  useEffect(() => {
    let alive = true;
    listPatientAppointments().then((r) => { if (alive) setState({ loading: false, items: r.appointments }); });
    return () => { alive = false; };
  }, []);

  const today = todayIso();
  const upcoming = state.items
    .filter((a) => a.date >= today && a.status !== 'done')
    .sort((a, b) => `${a.date}T${a.time || '00:00'}`.localeCompare(`${b.date}T${b.time || '00:00'}`))
    .slice(0, 8);
  if (!state.loading && upcoming.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-header">
        <h2 className="section-title"><Icon name="calendar" className="u-c-purple" />{tr("Rendez-vous de mes patients")}</h2>
      </div>
      {state.loading ? <div className="u-fs-12 u-t102">{tr("Chargement…")}</div> : (
        <div className="u-col-gap8">
          {upcoming.map((a) => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <strong>{a.patientName || tr("Patient")}</strong>
                <div className="u-fs-12 u-t102">{a.reason}{a.notes ? ` · ${a.notes}` : ''}</div>
              </div>
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {new Date(`${a.date}T00:00:00`).toLocaleDateString(localeTag(), { weekday: 'short', day: '2-digit', month: 'short' })}{a.time ? ` · ${a.time}` : ''}
              </div>
            </div>
          ))}
          <div className="u-fs-12 u-t102">{tr("Rendez-vous communiqués par les patients : à confirmer avec eux directement.")}</div>
        </div>
      )}
    </div>
  );
}
