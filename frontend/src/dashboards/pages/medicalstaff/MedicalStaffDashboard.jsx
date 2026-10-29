import Icon from '../../components/Icon';
import { useAuth } from '../../context/AuthContext';
import { DR_DECLARATIONS, DR_STATUS_BADGE } from '../../data/doctorVigilance';
import { isOrgScopedRecordVisible, getDepartmentsForOrganization } from '../../config/organizations';
import { getJobTitleLabel } from './medicalStaffLabels';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Medical Staff (role: 'medical_staff') landing dashboard — Step 1 of
// the dashboard-architecture fix (Medical Staff portal only).
//
// Medical Staff only holds 'declaration:create' / 'declaration:view'
// (permissions.js) — no review, stock, lab, or admin permissions — so
// this dashboard deliberately shows only declaration-related content,
// never a copy of the Doctor/Pharmacist/Lab dashboards.
//
// Data: DR_DECLARATIONS is the same shared store every other
// declaration-creating role (Doctor, Hospital, Clinique, Centre
// Médical, Pharmacien) already reads/writes — see
// MedicalStaffDeclarer.jsx (addDrDeclaration via InstitutionalDeclarer)
// for the write side. Scoped with the project's canonical
// isOrgScopedRecordVisible() (config/organizations.js) — the same
// helper every other org-scoped page and declarationService.js use —
// so Medical Staff can never see another organization's records.
//
// The CHU Alger demo account (chu.infirmier@demo.dz) has no seeded
// declarations of its own (all legacy seed rows are org-less — see
// doctorVigilance.js's header), so an empty state is expected and
// correct here, not a bug — no numbers are invented to fill the gap.
// ═══════════════════════════════════════════════════════════════

export default function MedicalStaffDashboard({ onNavigate }) {
  const { user } = useAuth();

  const scoped = DR_DECLARATIONS.filter((d) => isOrgScopedRecordVisible(d, user));
  const pending = scoped.filter((d) => d.status === 'review' || d.status === 'draft').length;
  const recent = scoped.slice(0, 5);

  const departmentName = user?.orgId && user?.departmentId
    ? getDepartmentsForOrganization(user.orgId).find((d) => d.id === user.departmentId)?.name
    : null;

  const subtitleParts = [getJobTitleLabel(user?.jobTitle), departmentName, user?.orgName].filter(Boolean);

  return (
    <div className="view is-active">
      <div className="page-header">
        <div>
          <h1 className="page-title">{tr("Bonjour,")} <span className="page-title-accent">{user?.name}</span></h1>
          <div className="u-fs-12 u-c-tertiary" style={{ marginTop: '4px' }}>{subtitleParts.join(' · ')}</div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => onNavigate('ms-declarations')}>
            <Icon name="folder" />{tr("Mes déclarations")}
          </button>
          <button className="btn btn--primary" onClick={() => onNavigate('ms-declarer')}>
            <Icon name="clipboard-plus" />{tr("Déclarer un incident")}
          </button>
        </div>
      </div>

      <div className="grid-kpi">
        <div className="kpi-card">
          <div className="kpi-accent" style={{ background: 'linear-gradient(90deg,var(--color-cyan),var(--color-brand))' }} />
          <div className="kpi-header"><div className="kpi-label">{tr("Déclarations")}</div><div className="kpi-icon" style={{ background: 'rgba(0,212,232,.12)', color: 'var(--color-cyan)' }}><Icon name="clipboard-list" /></div></div>
          <div className="kpi-value u-c-cyan">{scoped.length}</div>
          <div className="kpi-sub">{tr("au total{0}", [user?.orgName ? ` — ${user.orgName}` : ''])}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-accent" style={{ background: 'linear-gradient(90deg,var(--color-purple),#8b5cf6)' }} />
          <div className="kpi-header"><div className="kpi-label">{tr("En attente")}</div><div className="kpi-icon" style={{ background: 'var(--color-purple-dim)', color: 'var(--color-purple)' }}><Icon name="folder" /></div></div>
          <div className="kpi-value">{pending}</div>
          <div className="kpi-sub">{tr("brouillons + informations demandées")}</div>
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <h2 className="section-title"><Icon name="clipboard-list" className="u-c-cyan" />{tr("Déclarations récentes")}</h2>
          <button className="btn" onClick={() => onNavigate('ms-declarations')}>{tr("Tout voir")}</button>
        </div>
        <div className="u-col-gap10">
          {recent.length === 0 && (
            <div className="u-fs-12 u-t8">{tr("Aucune déclaration pour votre organisation/service pour le moment.")}</div>
          )}
          {recent.map((d) => {
            const [statClass, statLabel] = DR_STATUS_BADGE[d.status];
            return (
              <div className="card u-t87" key={d.id}>
                <div className="u-t73"><span className="u-fs12-500">{d.ref} — {d.product}</span><span className={`badge badge--${statClass}`}>{statLabel}</span></div>
                <div className="table-sub">{d.dept || '—'} · {d.date}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
