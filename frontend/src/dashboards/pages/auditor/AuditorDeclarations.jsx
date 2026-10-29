import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import { listAllForAudit } from '../../services/declarationService';
import { getOrganization } from '../../config/organizations';
import { DR_STATUS_BADGE, DR_SEVERITY_CLASS, DR_DOMAIN_CHIP } from '../../data/doctorVigilance';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Auditor (role: 'auditor') declarations list.
//
// Deliberately READ-ONLY: Auditor only holds 'declaration:view' /
// 'audit:view' (permissions.js) — no 'declaration:review', so unlike
// DoctorDeclarations.jsx / HospDeclarations.jsx this page's detail
// drawer never offers "Valider & transmettre" / "Demander complément"
// / "Rejeter", only a single "Fermer" — same read-only convention
// already used by MedicalStaffDeclarations.jsx / LabDeclarations.jsx.
//
// GLOBAL, not org-scoped: reads listAllForAudit()
// (declarationService.js) instead of the org-scoped list()/get() (or
// isOrgScopedRecordVisible()) every other role's declarations page
// uses — Auditor is a platform-level role with no organization of its
// own and must see declarations from every organization. Every row
// and the detail drawer both show which organization the record
// belongs to (or "Sans organisation" for unattributed legacy data),
// so organization identity is never hidden — see requirements §7.
// ═══════════════════════════════════════════════════════════════

const FILTERS = [
  { id: 'all', label: 'Toutes' },
  { id: 'review', label: 'À valider' },
  { id: 'draft', label: 'Brouillons' },
  { id: 'analysis', label: 'Analyse' },
  { id: 'sent', label: 'Transmises' },
  { id: 'closed', label: 'Clôturées' },
];

function orgNameFor(organizationId) {
  if (!organizationId) return 'Sans organisation';
  return getOrganization(organizationId)?.name ?? organizationId;
}

export default function AuditorDeclarations() {
  const [declarations, setDeclarations] = useState(null); // null = loading
  const [filter, setFilter] = useState('all');
  const [detailId, setDetailId] = useState(null);

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
  const all = declarations ?? [];
  const filtered = filter === 'all' ? all : all.filter((d) => d.status === filter);
  const detail = detailId ? all.find((d) => d.id === detailId) : null;

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Déclarations")} <span className="page-title-accent">{tr("— toutes organisations")}</span></h1></div>
      </div>

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

      {loading && (
        <div className="card"><p className="u-fs-12 u-t8">{tr("Chargement des déclarations…")}</p></div>
      )}

      {!loading && (
        <div className="card u-p-0">
          <div className="u-overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr><th>{tr("RÉFÉRENCE")}</th><th>{tr("ORGANISATION")}</th><th>{tr("DOMAINE / PRODUIT")}</th><th>{tr("GRAVITÉ")}</th><th>{tr("STATUT")}</th><th>{tr("ACTIONS")}</th></tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6}><div className="inbox-empty"><Icon name="clipboard-off" />{tr("Aucune déclaration dans ce filtre.")}</div></td></tr>
                )}
                {filtered.map((d) => {
                  const [sevClass, sevLabel] = d.severity ? DR_SEVERITY_CLASS[d.severity] : ['minor', '—'];
                  const [statClass, statLabel] = DR_STATUS_BADGE[d.status] ?? ['cyan', d.status];
                  return (
                    <tr key={d.id} data-status={d.status} data-domain={d.domain}>
                      <td><div className="table-ref">{d.ref}</div></td>
                      <td><div className="u-fs-12">{orgNameFor(d.organizationId)}</div></td>
                      <td>
                        {d.domain && <span className={`chip chip--${DR_DOMAIN_CHIP[d.domain] ?? 'cyan'}`} style={{ marginBottom: '3px' }}>{tr(d.domain)}</span>}
                        <div className="table-sub">{d.product}</div>
                      </td>
                      <td><span className={`severity severity--${sevClass}`}>{sevLabel}</span></td>
                      <td><span className={`badge badge--${statClass}`}>{statLabel}</span></td>
                      <td><button className="tbl-action-btn" onClick={() => setDetailId(d.id)}>{tr("Voir dossier")}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detail && (() => {
        const [sevClass, sevLabel] = detail.severity ? DR_SEVERITY_CLASS[detail.severity] : ['minor', '—'];
        const [statClass, statLabel] = DR_STATUS_BADGE[detail.status] ?? ['cyan', detail.status];

        return (
          <>
            <div className="chat-overlay is-open" onClick={() => setDetailId(null)} />
            <div className="chat-panel chat-panel--wide overlay-modal is-open" role="dialog" aria-modal="true" aria-labelledby="auditorDeclDrawerTitle">
              <div className="chat-header">
                <div className="chat-header-inner">
                  <div className="drawer-icon" style={{ background: 'var(--color-amber)', color: '#fff' }}>
                    <Icon name="clipboard-plus" />
                  </div>
                  <div className="u-flex-1 u-t31">
                    <div id="auditorDeclDrawerTitle" className="u-fs13-strong">{detail.ref}</div>
                    <div className="u-fs10-5-tertiary">{detail.domain || '—'}</div>
                  </div>
                  <button className="chat-close" onClick={() => setDetailId(null)} aria-label={tr("Fermer le panneau de détail")}>
                    <Icon name="x" />
                  </button>
                </div>
              </div>

              <div className="chat-messages" style={{ gap: '16px' }}>
                <div className="drawer-section">
                  <div className="u-t110">
                    {detail.domain && <span className={`chip chip--${DR_DOMAIN_CHIP[detail.domain] ?? 'cyan'}`}>{tr(detail.domain)}</span>}
                    <span className={`severity severity--${sevClass}`}>{sevLabel}</span>
                    <span className={`badge badge--${statClass}`}>{statLabel}</span>
                  </div>
                  <div className="drawer-kv">
                    <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Organisation")}</span><span className="drawer-kv-value">{orgNameFor(detail.organizationId)}</span></div>
                    <div className="drawer-kv-item u-t82"><span className="drawer-kv-label">{tr("Produit / Lot")}</span><span className="drawer-kv-value">{detail.product}{detail.lot ? tr("· Lot {0}", [detail.lot]) : ''}</span></div>
                    <div className="drawer-kv-item u-t82"><span className="drawer-kv-label">{tr("Fabricant")}</span><span className="drawer-kv-value">{detail.manufacturer || '—'}</span></div>
                    <div className="drawer-kv-item u-t82"><span className="drawer-kv-label">{tr("Description")}</span><span className="drawer-kv-value">{detail.description || '—'}</span></div>
                  </div>
                </div>
              </div>

              <div className="drawer-actions">
                <button className="btn btn--full" onClick={() => setDetailId(null)}>
                  <Icon name="check" />{tr("Fermer")}
                </button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
