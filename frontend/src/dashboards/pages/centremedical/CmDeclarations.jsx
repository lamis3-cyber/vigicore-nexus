import { useState } from 'react';
import Icon from '../../components/Icon';
import DeclarationsHub from '../../components/DeclarationsHub';
import EmptyState from '../../components/EmptyState';
import { useToast } from '../../context/ToastContext';
import { DR_PATIENTS, DR_DECLARATIONS, DR_DOMAIN_CHIP, DR_SEVERITY_CLASS, DR_STATUS_BADGE, AUDIT_LOG, logAudit } from '../../data/doctorVigilance';
import { getCurrentAuthUser } from '../../context/AuthContext';
import { isOrgScopedRecordVisible } from '../../config/organizations';
import { tr } from '../../../i18n/translate.js';

// Converted from #view-cm-declarations, 1:1 with the original's
// renderCmDeclarations() — plain table, no per-row action.
//
// F2 fix (Step 4 audit) — the Vigilance Responsible role carries the
// same `declaration:review` permission here as at Hospital
// (permissions.js), but this page never exposed the corresponding
// decide workflow. Mirrors HospDeclarations.jsx's detail
// drawer/decideDeclaration() 1:1 — same status vocabulary
// (review→sent/draft/closed), same canonical DR_DECLARATIONS
// mutation, same logAudit() call, same org-scoped lookup. Does not
// gate the decide buttons by role, same as HospDeclarations.jsx —
// preserving that page's existing (unmodified) behavior rather than
// inventing a new permission check.
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

export default function CmDeclarations({ onOpenDeclareWizard }) {
  const toast = useToast();
  // Blocker 1 fix — org scoping: Centre Médical must only ever see
  // its own organization's declarations (see organizations.js's
  // isOrgScopedRecordVisible). getCurrentAuthUser() rather than the
  // useAuth() hook so this page doesn't gain a React-context
  // dependency it didn't have before.
  const [, forceTick] = useState(0);
  const rerender = () => forceTick((n) => n + 1);
  const [detailId, setDetailId] = useState(null);

  const scoped = DR_DECLARATIONS.filter((d) => isOrgScopedRecordVisible(d, getCurrentAuthUser()));
  const detail = detailId ? scoped.find((d) => d.id === detailId) : null;

  function closeDrawer() {
    setDetailId(null);
  }

  function decideDeclaration(id, newStatus) {
    const d = scoped.find((x) => x.id === id);
    if (!d) return;
    d.status = newStatus;
    logAudit('declaration', d.id, AUDIT_MESSAGES[newStatus](d.ref), getCurrentAuthUser()?.name, getCurrentAuthUser()?.organizationId ?? null);
    closeDrawer();
    rerender();
    const m = DECIDE_MESSAGES[newStatus];
    toast(m.type, tr(m.title), m.text(d.ref), `ti ti-${m.icon}`);
  }

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Déclarations")}</h1></div>
        <div className="page-actions"><button className="btn btn--primary" onClick={onOpenDeclareWizard}><Icon name="clipboard-plus" />{tr("Nouvelle déclaration")}</button></div>
      </div>
      <DeclarationsHub>
        <div className="card u-p-0">
          <div className="u-overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>{tr("RÉF.")}</th><th>{tr("PATIENT")}</th><th>{tr("PRODUIT")}</th><th>{tr("GRAVITÉ")}</th><th>{tr("DATE")}</th><th>{tr("STATUT")}</th><th>{tr("ACTIONS")}</th></tr></thead>
              <tbody>
                {scoped.map((d) => {
                  const p = DR_PATIENTS.find((x) => x.id === d.patientId);
                  const [sevClass, sevLabel] = DR_SEVERITY_CLASS[d.severity];
                  const [statClass, statLabel] = DR_STATUS_BADGE[d.status];
                  return (
                    <tr key={d.id}>
                      <td><span className="u-mono u-fs-11">{d.ref}</span></td>
                      <td><div className="u-fs-12">{p ? tr(p.name) : d.manualPatientName || '—'}</div></td>
                      <td><div className="u-fs-12">{d.product}</div></td>
                      <td><span className={`severity severity--${sevClass}`}>{sevLabel}</span></td>
                      <td><div className="u-fs-12">{d.date}</div></td>
                      <td><span className={`badge badge--${statClass}`}>{statLabel}</span></td>
                      <td><button className="tbl-action-btn tbl-action-btn--primary" onClick={() => setDetailId(d.id)}>{tr("Détail")}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {scoped.length === 0 && <EmptyState bare icon="clipboard-list" title="Aucune déclaration" text="Aucune déclaration enregistrée pour votre établissement pour le moment." />}
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
              <div className="chat-panel chat-panel--wide overlay-modal is-open" role="dialog" aria-modal="true" aria-labelledby="cmDeclDrawerTitle">
                <div className="chat-header">
                  <div className="chat-header-inner">
                    <div className="drawer-icon" style={{ background: 'var(--color-amber)', color: '#fff' }}>
                      <Icon name="clipboard-plus" />
                    </div>
                    <div className="u-flex-1 u-t31">
                      <div id="cmDeclDrawerTitle" className="u-fs13-strong">{detail.ref}</div>
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
