import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import { useAuth } from '../../context/AuthContext';
import { listAllForAudit } from '../../services/declarationService';
import { getOrganization } from '../../config/organizations';
import { DR_STATUS_BADGE, DR_DOMAIN_CHIP, AUDIT_LOG } from '../../data/doctorVigilance';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Auditor (role: 'auditor') landing dashboard — Step 2 of the
// dashboard-architecture fix (Auditor portal only).
//
// Auditor only holds 'declaration:view' / 'audit:view' (permissions.js)
// — strictly read-only, no create/edit/delete/approve action anywhere
// on this page — and is a PLATFORM-level role with no organization of
// its own (AuthContext.jsx: an auditor seat never gets an orgId). This
// dashboard is therefore deliberately NOT a copy of any org-scoped
// dashboard (Doctor/Pharmacist/Lab/Medical Staff/Hospital-Qualité):
// it summarizes declarations ACROSS every organization at once, and
// always shows which organization a given record belongs to instead
// of hiding/merging that context.
//
// Data sources — both genuinely shared, canonical, already-existing
// stores, never a second/duplicate copy invented for Auditor:
//  - listAllForAudit() (declarationService.js): the SAME canonical
//    declaration store every other declaration reader in the app is
//    built from, read here WITHOUT the isOrgScopedRecordVisible()
//    filter every other (org-scoped) role goes through — see that
//    function's own header for why that's correct only for Auditor.
//  - AUDIT_LOG (doctorVigilance.js): the app's existing, already
//    cross-role, append-only audit trail (every role's declaration/
//    alert/recall/CAPA/lot-verification action already logs here) —
//    reused as-is for "activité récente", not re-implemented.
//
// If either source is empty, this renders an explicit empty state —
// never a fabricated number (see requirements: "no fake KPI numbers").
// ═══════════════════════════════════════════════════════════════

const PENDING_STATUSES = ['draft', 'review', 'analysis'];

export default function AuditorDashboard({ onNavigate }) {
  const { user } = useAuth();
  const [declarations, setDeclarations] = useState(null); // null = loading

  useEffect(() => {
    let cancelled = false;
    listAllForAudit().then((records) => {
      if (!cancelled) setDeclarations(records);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = declarations === null;
  const records = declarations ?? [];

  const critical = records.filter((d) => d.severity === 'grave').length;
  const pending = records.filter((d) => PENDING_STATUSES.includes(d.status)).length;

  // Organization distribution — a record with organizationId: null is
  // genuinely unattributed legacy/standalone data (see
  // organizations.js's isOrgScopedRecordVisible header), shown under
  // its own explicit bucket rather than hidden or guessed into one.
  const byOrg = new Map();
  for (const d of records) {
    const key = d.organizationId ?? '__none__';
    byOrg.set(key, (byOrg.get(key) ?? 0) + 1);
  }
  const orgRows = [...byOrg.entries()]
    .map(([key, count]) => ({
      key,
      name: key === '__none__' ? 'Sans organisation' : (getOrganization(key)?.name ?? key),
      count,
    }))
    .sort((a, b) => b.count - a.count);
  const orgCount = orgRows.filter((r) => r.key !== '__none__').length;

  const recent = [...records]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 5);

  const recentActivity = AUDIT_LOG.slice(0, 6);

  return (
    <div className="view is-active">
      <div className="page-header">
        <div>
          <h1 className="page-title">{tr("Bonjour,")} <span className="page-title-accent">{user?.name}</span></h1>
          <div className="u-fs-12 u-c-tertiary" style={{ marginTop: '4px' }}>{tr("Audit & supervision — vue globale VigiCore, toutes organisations")}</div>
        </div>
        <div className="page-actions">
          <button className="btn btn--primary" onClick={() => onNavigate('auditor-declarations')}>
            <Icon name="folder" />{tr("Voir les déclarations")}
          </button>
        </div>
      </div>

      {loading && (
        <div className="card"><p className="u-fs-12 u-t8">{tr("Chargement des données d'audit…")}</p></div>
      )}

      {!loading && (
        <>
          <div className="grid-kpi">
            <div className="kpi-card">
              <div className="kpi-accent" style={{ background: 'linear-gradient(90deg,var(--color-cyan),var(--color-brand))' }} />
              <div className="kpi-header"><div className="kpi-label">{tr("Déclarations")}</div><div className="kpi-icon" style={{ background: 'rgba(0,212,232,.12)', color: 'var(--color-cyan)' }}><Icon name="clipboard-list" /></div></div>
              <div className="kpi-value u-c-cyan">{records.length}</div>
              <div className="kpi-sub">{tr("toutes organisations confondues")}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-accent" style={{ background: 'linear-gradient(90deg,var(--color-red),#f43f5e)' }} />
              <div className="kpi-header"><div className="kpi-label">{tr("Critiques")}</div><div className="kpi-icon" style={{ background: 'var(--color-red-dim)', color: 'var(--color-red)' }}><Icon name="alert-triangle" /></div></div>
              <div className="kpi-value u-c-red">{critical}</div>
              <div className="kpi-sub">{tr("gravité grave")}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-accent" style={{ background: 'linear-gradient(90deg,var(--color-purple),#8b5cf6)' }} />
              <div className="kpi-header"><div className="kpi-label">{tr("En cours")}</div><div className="kpi-icon" style={{ background: 'var(--color-purple-dim)', color: 'var(--color-purple)' }}><Icon name="folder" /></div></div>
              <div className="kpi-value">{pending}</div>
              <div className="kpi-sub">{tr("brouillon, à valider ou en analyse")}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-accent" style={{ background: 'linear-gradient(90deg,var(--color-green),#0a7a6e)' }} />
              <div className="kpi-header"><div className="kpi-label">{tr("Organisations")}</div><div className="kpi-icon" style={{ background: 'rgba(10,122,110,.12)', color: 'var(--color-green)' }}><Icon name="building-hospital" /></div></div>
              <div className="kpi-value">{orgCount}</div>
              <div className="kpi-sub">{tr("représentées dans les déclarations")}</div>
            </div>
          </div>

          <div className="card">
            <div className="section-header">
              <h2 className="section-title"><Icon name="building-hospital" className="u-c-green" />{tr("Répartition par organisation")}</h2>
            </div>
            <div className="u-col-gap10">
              {orgRows.length === 0 && (
                <div className="u-fs-12 u-t8">{tr("Aucune donnée disponible.")}</div>
              )}
              {orgRows.map((row) => (
                <div className="u-t73" key={row.key} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="u-fs12-500">{tr(row.name)}</span>
                  <span className="badge badge--cyan">{row.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="section-header">
              <h2 className="section-title"><Icon name="clipboard-list" className="u-c-cyan" />{tr("Déclarations récentes")}</h2>
              <button className="btn" onClick={() => onNavigate('auditor-declarations')}>{tr("Tout voir")}</button>
            </div>
            <div className="u-col-gap10">
              {recent.length === 0 && (
                <div className="u-fs-12 u-t8">{tr("Aucune déclaration disponible pour le moment.")}</div>
              )}
              {recent.map((d) => {
                const [statClass, statLabel] = DR_STATUS_BADGE[d.status] ?? ['cyan', d.status];
                const orgName = d.organizationId ? (getOrganization(d.organizationId)?.name ?? d.organizationId) : 'Sans organisation';
                return (
                  <div className="card u-t87" key={d.id}>
                    <div className="u-t73">
                      <span className="u-fs12-500">{d.ref} — {d.product}</span>
                      <span className={`badge badge--${statClass}`}>{statLabel}</span>
                    </div>
                    <div className="table-sub">
                      {d.domain && <span className={`chip chip--${DR_DOMAIN_CHIP[d.domain] ?? 'cyan'}`} style={{ marginRight: '6px' }}>{tr(d.domain)}</span>}
                      {orgName}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="section-header">
              <h2 className="section-title"><Icon name="history" className="u-c-purple" />{tr("Activité récente (journal d'audit)")}</h2>
            </div>
            <div className="u-col-gap10">
              {recentActivity.length === 0 && (
                <div className="u-fs-12 u-t8">{tr("Aucune activité enregistrée.")}</div>
              )}
              {recentActivity.map((entry) => (
                <div className="u-t73" key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                  <span className="u-fs-12">{tr(entry.action)} — <span className="u-c-tertiary">{entry.actor}</span></span>
                  <span className="u-fs-12 u-c-tertiary">{entry.ts}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
