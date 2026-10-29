import { useState } from 'react';
import Icon from '../../components/Icon';
import DeclarationsHub from '../../components/DeclarationsHub';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useWizardDraftRows } from '../../lib/wizardDrafts';
import {
  DR_PATIENTS,
  DR_DECLARATIONS,
  DR_DOMAIN_CHIP,
  DR_STATUS_BADGE,
  DR_SEVERITY_CLASS,
  AUDIT_LOG,
  logAudit,
} from '../../data/doctorVigilance';
import { isOrgScopedRecordVisible } from '../../config/organizations';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Converted from #view-doc-declarations (doctor scope), 1:1 with the
// original's renderDrDeclarations() / declarationRowHTML() /
// filterDrDecl() / openDeclarationDetail() / decideDeclaration().
//
// Notes on fidelity:
//  - "Nouvelle déclaration" originally called openDeclareWizard(); the
//    doctor's declare flow is now the full 'doc-declarer' page (see
//    DoctorDashboard.jsx's onOpenDeclareWizard -> onNavigate('doc-declarer')),
//    so this button follows the same already-established convention.
//  - Row actions: status 'review' shows a single "Examiner" button,
//    everything else shows "Voir dossier" — both open the same detail
//    drawer (openDeclarationDetail), matching the original exactly.
//  - The detail drawer's footer actions are status-dependent: 'review'
//    gets the three decide buttons (Valider & transmettre / Demander
//    complément / Rejeter), everything else just gets "Fermer" —
//    ported from the original's `actions` ternary in openDeclarationDetail().
//  - Audit history inside the drawer is filtered to this declaration's
//    entries only (auditHistoryHTML(AUDIT_LOG.filter(...))), and is
//    omitted entirely when there are none, exactly like the original.
//  - decideDeclaration() mutates the shared DR_DECLARATIONS array in
//    place, logs an audit entry, closes the drawer, and toasts —
//    same side-effect order as the source.
// ═══════════════════════════════════════════════════════════════

const FILTERS = [
  { id: 'all', label: 'Toutes' },
  { id: 'review', label: 'À valider' },
  { id: 'draft', label: 'Brouillons' },
  { id: 'sent', label: 'Transmises' },
  { id: 'closed', label: 'Clôturées' },
];

const DECIDE_MESSAGES = {
  sent: { type: 'success', title: 'Déclaration transmise', icon: 'circle-check', text: (ref) => `${ref} validée par la vigilance de l'établissement` },
  draft: { type: 'info', title: 'Complément demandé', icon: 'message-question', text: (ref) => `Le patient a été notifié pour compléter ${ref}` },
  closed: { type: 'warn', title: 'Déclaration clôturée', icon: 'x', text: (ref) => `${ref} a été rejetée / clôturée sans suite` },
};

const AUDIT_MESSAGES = {
  sent: (ref) => `Déclaration ${ref} validée par la vigilance de l'établissement`,
  draft: (ref) => `Complément demandé au patient pour ${ref}`,
  closed: (ref) => `Déclaration ${ref} rejetée / clôturée sans suite`,
};

export default function DoctorDeclarations({ onNavigate }) {
  const toast = useToast();
  const { user } = useAuth();
  const wizardDrafts = useWizardDraftRows(user);

  // DR_DECLARATIONS is a shared mutable array (like DoctorPatients.jsx's
  // DR_PATIENTS) — forceTick triggers a re-render after in-place edits.
  const [, forceTick] = useState(0);
  const rerender = () => forceTick((n) => n + 1);

  const [filter, setFilter] = useState('all');
  const [detailId, setDetailId] = useState(null); // id of declaration shown in drawer, or null

  // Blocker 1 fix — org scoping: a doctor at CHU Alger, at Clinique El
  // Fedjr, and a standalone doctor must NOT see each other's
  // declarations, even though they all share role='doctor' and this
  // exact same page component (see organizations.js's
  // isOrgScopedRecordVisible for the rule and why it's shared with
  // every other org-scoped page + declarationService.js).
  const scoped = DR_DECLARATIONS.filter((d) => isOrgScopedRecordVisible(d, user));
  // Les brouillons de l'assistant (propres à l'utilisateur) s'affichent avec les lignes ; « Reprendre » rouvre l'assistant.
  const withDrafts = [...wizardDrafts, ...scoped];
  const filtered = filter === 'all' ? withDrafts : withDrafts.filter((d) => d.status === filter);
  const detail = detailId ? scoped.find((d) => d.id === detailId) : null;

  function closeDrawer() {
    setDetailId(null);
  }

  function decideDeclaration(id, newStatus) {
    // Aligned with the scoped subset pattern above (id is always
    // detail.id, itself sourced from `scoped`) so this lookup can
    // never resolve to another organization's record.
    const d = scoped.find((x) => x.id === id);
    if (!d) return;
    d.status = newStatus;
    logAudit('declaration', d.id, AUDIT_MESSAGES[newStatus](d.ref), user?.name, user?.organizationId ?? null);
    closeDrawer();
    rerender();
    const m = DECIDE_MESSAGES[newStatus];
    toast(m.type, tr(m.title), m.text(d.ref), `ti ti-${m.icon}`);
  }

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Déclarations de")} <span className="page-title-accent">{tr("vigilance")}</span></h1></div>
        <div className="page-actions">
          <button className="btn btn--primary" onClick={() => onNavigate('doc-declarer')}>
            <Icon name="plus" />{tr("Nouvelle déclaration")}
          </button>
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
              <thead>
                <tr>
                  <th>{tr("RÉFÉRENCE")}</th><th>{tr("PATIENT")}</th><th>{tr("DOMAINE / PRODUIT")}</th><th>{tr("GRAVITÉ")}</th><th>{tr("STATUT")}</th><th>{tr("ACTIONS")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6}><div className="inbox-empty"><Icon name="clipboard-off" />{tr("Aucune déclaration dans ce filtre.")}</div></td></tr>
                )}
                {filtered.map((d) => {
                  const patient = DR_PATIENTS.find((p) => p.id === d.patientId);
                  const displayName = patient ? patient.name : (d.manualPatientName || '—');
                  const displayInitials = patient
                    ? patient.initials
                    : d.manualPatientName
                      ? d.manualPatientName.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase()
                      : '?';
                  const displayColor = patient ? patient.color : 'linear-gradient(135deg,#5a5a66,#7a7a86)';
                  const [sevClass, sevLabel] = DR_SEVERITY_CLASS[d.severity];
                  const [statClass, statLabel] = DR_STATUS_BADGE[d.status];
                  return (
                    <tr key={d.id} data-status={d.status} data-domain={d.domain}>
                      <td><div className="table-ref">{d.ref}</div><div className="table-sub">{tr(d.domain)}</div></td>
                      <td>
                        <div className="patient-row-name">
                          <div className="patient-mini-avatar" style={{ background: displayColor, width: '24px', height: '24px', fontSize: '9px' }}>{displayInitials}</div>
                          <div className="u-fs-12">{displayName}</div>
                        </div>
                      </td>
                      <td><span className={`chip chip--${DR_DOMAIN_CHIP[d.domain]}`} style={{ marginBottom: '3px' }}>{tr(d.domain)}</span><div className="table-sub">{d.product}</div></td>
                      <td><span className={`severity severity--${sevClass}`}>{sevLabel}</span></td>
                      <td><span className={`badge badge--${statClass}`}>{statLabel}</span></td>
                      <td>
                        {d.status === 'review' ? (
                          <div className="u-t69">
                            <button className="tbl-action-btn tbl-action-btn--primary" onClick={() => (d.isWizardDraft ? onNavigate('doc-declarer') : setDetailId(d.id))}>{d.isWizardDraft ? tr("Reprendre") : tr("Examiner")}</button>
                          </div>
                        ) : (
                          <button className="tbl-action-btn" onClick={() => (d.isWizardDraft ? onNavigate('doc-declarer') : setDetailId(d.id))}>{d.isWizardDraft ? tr("Reprendre") : tr("Voir dossier")}</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {detail && (() => {
          const patient = DR_PATIENTS.find((p) => p.id === detail.patientId);
          const patientName = patient
            ? patient.name
            : (detail.manualPatientName || '—') + (detail.manualPatientIdNum ? ` · N° ${detail.manualPatientIdNum}` : '');
          const [sevClass, sevLabel] = DR_SEVERITY_CLASS[detail.severity];
          const [statClass, statLabel] = DR_STATUS_BADGE[detail.status];
          const auditEntries = AUDIT_LOG.filter((a) => a.refType === 'declaration' && a.refId === detail.id);

          return (
            <>
              <div className="chat-overlay is-open" onClick={closeDrawer} />
              <div className="chat-panel chat-panel--wide overlay-modal is-open" role="dialog" aria-modal="true" aria-labelledby="drDeclDrawerTitle">
                <div className="chat-header">
                  <div className="chat-header-inner">
                    <div className="drawer-icon" style={{ background: 'var(--color-amber)', color: '#fff' }}>
                      <Icon name="clipboard-plus" />
                    </div>
                    <div className="u-flex-1 u-t31">
                      <div id="drDeclDrawerTitle" className="u-fs13-strong">{detail.ref}</div>
                      <div className="u-fs10-5-tertiary">{tr(detail.domain)}</div>
                    </div>
                    <button className="chat-close" onClick={closeDrawer} aria-label={tr("Fermer le panneau de détail")}>
                      <Icon name="x" />
                    </button>
                  </div>
                </div>

                <div className="chat-messages" style={{ gap: '16px' }}>
                  <div className="drawer-section">
                    <div className="u-t110">
                      <span className={`chip chip--${DR_DOMAIN_CHIP[detail.domain]}`}>{tr(detail.domain)}</span>
                      <span className={`severity severity--${sevClass}`}>{sevLabel}</span>
                      <span className={`badge badge--${statClass}`}>{statLabel}</span>
                    </div>
                    <div className="drawer-kv">
                      <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Patient")}</span><span className="drawer-kv-value">{patientName}</span></div>
                      <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Date")}</span><span className="drawer-kv-value">{detail.date}</span></div>
                      <div className="drawer-kv-item u-t82"><span className="drawer-kv-label">{tr("Produit / Lot")}</span><span className="drawer-kv-value">{detail.product}</span></div>
                      <div className="drawer-kv-item u-t82"><span className="drawer-kv-label">{tr("Effet / incident rapporté")}</span><span className="drawer-kv-value">{detail.effect}</span></div>
                    </div>
                  </div>

                  <div className="drawer-section">
                    <div className="drawer-section-title">{tr("Actions de suivi")}</div>
                    <div className="u-fs-12" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {tr("Vérification du lien de causalité en cours (échelle de Naranjo). Documentation jointe : compte-rendu de consultation, photo (si applicable). Toute décision est tracée et horodatée.")}
                    </div>
                  </div>

                  {auditEntries.length > 0 && (
                    <div className="drawer-section">
                      <div className="drawer-section-title">{tr("Historique & audit")}</div>
                      <div className="timeline">
                        {auditEntries.map((a) => (
                          <div className="tl-item" key={a.id}>
                            <div className="tl-dot tl-dot--green" />
                            <div className="tl-time">{a.ts}</div>
                            <div className="tl-body">
                              <div className="tl-event">{tr(a.action)}</div>
                              <div className="tl-sub">{a.actor}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="drawer-actions">
                  {detail.status === 'review' ? (
                    <>
                      <button className="btn btn--success" onClick={() => decideDeclaration(detail.id, 'sent')}>
                        <Icon name="send" />{tr("Valider & transmettre")}
                      </button>
                      <button className="btn" onClick={() => decideDeclaration(detail.id, 'draft')}>
                        <Icon name="message-question" />{tr("Demander complément")}
                      </button>
                      <button className="btn btn--danger" onClick={() => decideDeclaration(detail.id, 'closed')}>
                        <Icon name="x" />{tr("Rejeter / clôturer")}
                      </button>
                    </>
                  ) : (
                    <button className="btn btn--full" onClick={closeDrawer}>
                      <Icon name="check" />{tr("Fermer")}
                    </button>
                  )}
                </div>
              </div>
            </>
          );
        })()}
      </DeclarationsHub>
    </div>
  );
}
