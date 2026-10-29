import Icon from '../../components/Icon';
import AccountSecurity from '../../components/AccountSecurity';
import { useAuth } from '../../context/AuthContext';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Auditor (role: 'auditor') profile — reached only via the topbar
// avatar's "Ouvrir le profil" (PROFILE_ID_BY_ROLE.auditor =
// 'auditor-profil'), same convention as every other professional
// role's Profil page (no sidebar rail entry).
//
// Auditor is a platform-level role with no organization/department
// (AuthContext.jsx: an auditor seat never gets orgId/departmentId) —
// this page deliberately never shows an organization/department
// field (unlike MedicalStaffProfil.jsx), since showing one would
// misrepresent the account as belonging to an institution.
// ═══════════════════════════════════════════════════════════════

export default function AuditorProfil() {
  const { user } = useAuth();

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
            <div className="u-t9">{tr("Auditeur — accès plateforme, toutes organisations")}</div>
            <div className="u-t42">
              <span className="chip chip--cyan">{tr("Auditeur")}</span>
              <span className="chip u-t35">{tr("Accès global")}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="id-badge" className="u-c-cyan" />{tr("Identité")}</h2></div>
        <div className="drawer-kv">
          <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Nom")}</span><span className="drawer-kv-value">{user?.name || '—'}</span></div>
          <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Rôle")}</span><span className="drawer-kv-value">{tr("Auditeur (accès plateforme)")}</span></div>
          <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Organisation")}</span><span className="drawer-kv-value">{tr("Aucune — accès transverse à toutes les organisations")}</span></div>
          <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("E-mail")}</span><span className="drawer-kv-value">{user?.email || '—'}</span></div>
        </div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="shield-lock" className="u-c-brand" />{tr("Accès & permissions")}</h2></div>
        <div className="alert-banner alert-banner--cyan">
          <Icon name="lock" />
          <div>
            <div className="alert-banner-title">{tr("Accès lecture seule")}</div>
            <div className="alert-banner-text">
              {tr("Vous pouvez consulter les déclarations de vigilance de toutes les organisations à des fins d'audit. Vous ne pouvez ni créer, ni modifier, ni approuver de déclaration. La modification du rôle ou des permissions n'est pas disponible depuis cette interface.")}
            </div>
          </div>
        </div>
      </div>

      <AccountSecurity />
    </div>
  );
}
