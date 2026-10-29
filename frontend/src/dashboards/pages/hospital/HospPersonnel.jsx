import { HOSP_STAFF, HOSP_STAFF_ROLE_TONE } from '../../data/doctorVigilance';
import EmptyState from '../../components/EmptyState';
import { tr } from '../../../i18n/translate.js';

// Converted from #view-hosp-personnel, 1:1 with the original's
// renderHospPersonnel().
export default function HospPersonnel() {
  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Personnel")}</h1></div>
      </div>
      <div className="card u-p-0">
        <div className="u-overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>{tr("NOM")}</th><th>{tr("RÔLE")}</th><th>{tr("SERVICE")}</th><th>{tr("DÉCLARATIONS")}</th><th>{tr("DERNIÈRE ACTIVITÉ")}</th></tr></thead>
            <tbody>
              {HOSP_STAFF.map((s) => (
                <tr key={s.id}>
                  <td><div className="u-fs12-500">{tr(s.name)}</div></td>
                  <td><span className={`badge badge--${HOSP_STAFF_ROLE_TONE[s.role] || 'cyan'}`}>{s.role}</span></td>
                  <td><div className="u-fs-12">{tr(s.dept)}</div></td>
                  <td><div className="u-fs-12">{s.declCount}</div></td>
                  <td><div className="u-fs-12">{s.lastActivity}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {HOSP_STAFF.length === 0 && <EmptyState bare icon="users" title="Aucun personnel" text="Le personnel de l'établissement apparaîtra ici." />}
        </div>
      </div>
    </div>
  );
}
