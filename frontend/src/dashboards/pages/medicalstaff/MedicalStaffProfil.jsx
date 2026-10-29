import Icon from '../../components/Icon';
import AccountSecurity from '../../components/AccountSecurity';
import { useAuth } from '../../context/AuthContext';
import { getDepartmentsForOrganization } from '../../config/organizations';
import { getJobTitleLabel } from './medicalStaffLabels';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Medical Staff (role: 'medical_staff') profile — reached only via
// the topbar avatar's "Ouvrir le profil" (PROFILE_ID_BY_ROLE.medical_staff
// = 'medical-staff-profil'), same convention as every other
// professional role's Profil page (no sidebar rail entry).
//
// Everything here is read directly from the authenticated session
// (useAuth()) — name/jobTitle/orgName/departmentId are never
// hardcoded, so this same page works unchanged for any Medical Staff
// account (a different name, a different job title, a different
// organization/department) — not just the CHU Alger nurse demo seat.
// No fabricated medical/personnel data is added (unlike
// PatientProfil.jsx's demo allergies/contacts — Medical Staff has no
// such data source yet, so none is invented here).
// ═══════════════════════════════════════════════════════════════

export default function MedicalStaffProfil() {
  const { user } = useAuth();

  const departmentName = user?.orgId && user?.departmentId
    ? getDepartmentsForOrganization(user.orgId).find((d) => d.id === user.departmentId)?.name
    : null;

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Mon")} <span className="page-title-accent">{tr("Profil")}</span></h1></div>
      </div>

      <div className="card">
        <div className="u-t5">
          <div className="u-t136">{user?.initials}</div>
          <div className="u-flex-1">
            <div className="u-t6">{user?.name}</div>
            <div className="u-t9">
              {getJobTitleLabel(user?.jobTitle)}
              {user?.orgName ? ` · ${user.orgName}` : ''}
              {departmentName ? ` · ${departmentName}` : ''}
            </div>
            <div className="u-t42">
              <span className="chip chip--cyan">{getJobTitleLabel(user?.jobTitle)}</span>
              {user?.orgName && <span className="chip chip--green"><Icon name="building-hospital" className="u-t16" />{user.orgName}</span>}
              {departmentName && <span className="chip u-t35">{tr("Service : {0}", [departmentName])}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="id-badge" className="u-c-cyan" />{tr("Identité")}</h2></div>
        <div className="drawer-kv">
          <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Nom")}</span><span className="drawer-kv-value">{user?.name || '—'}</span></div>
          <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Fonction")}</span><span className="drawer-kv-value">{getJobTitleLabel(user?.jobTitle)}</span></div>
          <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Organisation")}</span><span className="drawer-kv-value">{user?.orgName || '—'}</span></div>
          <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Service / Département")}</span><span className="drawer-kv-value">{departmentName || '—'}</span></div>
          <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("E-mail")}</span><span className="drawer-kv-value">{user?.email || '—'}</span></div>
        </div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="shield-lock" className="u-c-brand" />{tr("Accès & permissions")}</h2></div>
        <div className="alert-banner alert-banner--cyan">
          <Icon name="lock" />
          <div>
            <div className="alert-banner-title">{tr("Accès Personnel médical")}</div>
            <div className="alert-banner-text">{tr("Vous pouvez créer et consulter les déclarations de vigilance de {0}. La modification du rôle ou des permissions n'est pas disponible depuis cette interface.", [user?.orgName || 'votre organisation'])}</div>
          </div>
        </div>
      </div>

      <AccountSecurity />
    </div>
  );
}
