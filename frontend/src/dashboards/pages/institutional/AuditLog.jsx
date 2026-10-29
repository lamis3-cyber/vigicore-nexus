import Icon from '../../components/Icon';
import EmptyState from '../../components/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { AUDIT_LOG } from '../../data/doctorVigilance';
import { isOrgScopedRecordVisible } from '../../config/organizations';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// F5 — shared institutional "Journal d'audit" page.
//
// One component reused by Hôpital, Clinique and Centre Médical
// (routed from a single shared 'audit-log' id in App.jsx) instead of
// three near-duplicate pages — same "one component, gated by portal
// key" pattern already used for ProduitsTracabilite.jsx in this same
// folder.
//
// Source of truth: the canonical, already-existing AUDIT_LOG /
// logAudit() (doctorVigilance.js) — no new audit store. Scoping uses
// the canonical isOrgScopedRecordVisible() helper (organizations.js),
// the same rule HospRapports.jsx/ClinRapports.jsx/CmRapports.jsx
// already apply to declarations/recalls — an org-scoped user sees
// only entries stamped with their own organizationId; a standalone
// user (no organizationId) sees only unattributed (organizationId:
// null) entries. This is a frontend-only convenience, not a security
// boundary — same caveat as isOrgScopedRecordVisible()'s own header.
//
// Visual language: the same action/actor/ts row already used by
// AuditorDashboard.jsx's "Activité récente" block — AuditorDashboard
// itself is left untouched; this page does not reuse its code, only
// its look, and unlike AuditorDashboard it deliberately filters to
// one organization instead of showing every organization at once.
// ═══════════════════════════════════════════════════════════════
export default function AuditLog() {
  const { user } = useAuth();
  const entries = AUDIT_LOG.filter((entry) => isOrgScopedRecordVisible(entry, user));

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Journal d'audit")}</h1></div>
      </div>
      <div className="card">
        <div className="section-header">
          <h2 className="section-title"><Icon name="history" className="u-c-cyan" />{tr("Activité de l'établissement")}</h2>
        </div>
        <div className="u-col-gap10">
          {entries.length === 0 && (
            <EmptyState bare icon="history" title="Aucune activité" text="Aucune activité enregistrée pour cet établissement." />
          )}
          {entries.map((entry) => (
            <div className="u-t73" key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
              <span className="u-fs-12">{tr(entry.action)} — <span className="u-c-tertiary">{entry.actor}</span></span>
              <span className="u-fs-12 u-c-tertiary">{entry.ts}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
