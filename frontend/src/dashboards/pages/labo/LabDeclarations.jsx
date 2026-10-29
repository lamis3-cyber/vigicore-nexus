import { useState } from 'react';
import Icon from '../../components/Icon';
import DeclarationsHub from '../../components/DeclarationsHub';
import { useToast } from '../../context/ToastContext';
import { DR_STATUS_BADGE, LAB_PRODUCT_TYPE_LABEL, LAB_PROBLEM_TYPE_LABEL, LAB_SEVERITY_LABEL } from '../../data/doctorVigilance';
import { LAB_DECLARATIONS } from '../../data/laboVigilance';
import { getCurrentAuthUser } from '../../context/AuthContext';
import { isOrgScopedRecordVisible } from '../../config/organizations';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Converted from #view-lab-declarations (labo scope), 1:1 with the
// original's renderLabDeclarations() / labDeclarationRowHTML() /
// filterLabDecl().
//
// Notes on fidelity — this page is genuinely SIMPLER than Pharmacien's
// equivalent, and that's faithful to the source, not a shortcut taken
// here: the original's labDeclarationRowHTML() action button
// ("Examiner" when status==='review', "Voir dossier" otherwise) only
// ever calls `toast('info','Dossier', ...)` — there is no detail
// drawer defined anywhere for Labo declarations (unlike
// DR_DECLARATIONS' openDeclarationDetail()/decideDeclaration() used
// by Doctor/Pharmacien). Reproduced as such: both buttons just toast.
// ═══════════════════════════════════════════════════════════════

const FILTERS = [
  { id: 'all', label: 'Toutes' },
  { id: 'draft', label: 'Brouillons' },
  { id: 'sent', label: 'Envoyées' },
  { id: 'analysis', label: 'En cours' },
  { id: 'review', label: 'Infos demandées' },
  { id: 'closed', label: 'Clôturées' },
];

export default function LabDeclarations({ onNavigate }) {
  const toast = useToast();
  const [filter, setFilter] = useState('all');

  // Blocker 1 fix — org scoping. getCurrentAuthUser() (not the
  // useAuth() hook) so this page doesn't gain a React-context
  // dependency it didn't have before — same reasoning as
  // DoctorPatients.jsx (see that file's comment).
  const scoped = LAB_DECLARATIONS.filter((d) => isOrgScopedRecordVisible(d, getCurrentAuthUser()));
  const filtered = filter === 'all' ? scoped : scoped.filter((d) => d.status === filter);

  function openDossier(ref) {
    toast('info', tr("Dossier"), tr("Ouverture de {0} — démonstration.", [ref]), 'ti ti-folder');
  }

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Mes")} <span className="page-title-accent">{tr("déclarations")}</span></h1></div>
        <div className="page-actions">
          <button className="btn btn--primary" onClick={() => onNavigate('lab-declarer')}><Icon name="plus" />{tr("Nouvelle déclaration")}</button>
        </div>
      </div>
      <DeclarationsHub>
        <div className="filter-tabs" role="tablist" aria-label={tr("Filtrer les déclarations par statut")}>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`filter-tab${filter === f.id ? ' is-active' : ''}`}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {tr(f.label)}
            </button>
          ))}
        </div>

        <div className="card u-p-0">
          <div className="u-overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>{tr("RÉFÉRENCE")}</th><th>{tr("PRODUIT")}</th><th>{tr("FABRICANT")}</th><th>{tr("PROBLÈME")}</th><th>{tr("GRAVITÉ")}</th><th>{tr("STATUT")}</th><th>{tr("ACTIONS")}</th></tr></thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={7}><div className="inbox-empty"><Icon name="clipboard-off" />{tr("Aucune déclaration dans ce filtre.")}</div></td></tr>
                )}
                {filtered.map((d) => {
                  const [sevClass, sevLabel] = LAB_SEVERITY_LABEL[d.severity] || ['amber', '—'];
                  const [statClass, statLabel] = DR_STATUS_BADGE[d.status];
                  return (
                    <tr key={d.id} data-status={d.status}>
                      <td><div className="table-ref">{d.ref}</div><div className="table-sub">{d.date}</div></td>
                      <td><div className="u-fs12-500">{d.product}</div><div className="table-sub">{d.lot} · {LAB_PRODUCT_TYPE_LABEL[d.productType] || d.productType}</div></td>
                      <td><div className="u-fs-12">{d.manufacturer}</div></td>
                      <td><span className="chip" style={{ fontSize: '9.5px' }}>{LAB_PROBLEM_TYPE_LABEL[d.problemType] || d.problemType}</span></td>
                      <td><span className={`severity severity--${sevClass}`}>{sevLabel}</span></td>
                      <td><span className={`badge badge--${statClass}`}>{statLabel}</span></td>
                      <td>
                        {d.status === 'review' ? (
                          <button className="tbl-action-btn tbl-action-btn--primary" onClick={() => openDossier(d.ref)}>{tr("Examiner")}</button>
                        ) : (
                          <button className="tbl-action-btn" onClick={() => openDossier(d.ref)}>{tr("Voir dossier")}</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </DeclarationsHub>
    </div>
  );
}
