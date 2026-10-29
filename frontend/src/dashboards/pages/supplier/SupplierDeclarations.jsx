import { useState } from 'react';
import Icon from '../../components/Icon';
import DeclarationsHub from '../../components/DeclarationsHub';
import { useAuth } from '../../context/AuthContext';
import { useWizardDraftRows } from '../../lib/wizardDrafts';
import {
  DR_PATIENTS,
  DR_DECLARATIONS,
  DR_DOMAIN_CHIP,
  DR_STATUS_BADGE,
  DR_SEVERITY_CLASS,
} from '../../data/doctorVigilance';
import { isOrgScopedRecordVisible } from '../../config/organizations';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Fournisseur / distributeur (role: 'supplier') — liste de SES déclarations d'incident.
//
// Copie de la liste « Personnel médical » : lecture seule (le fournisseur déclare, il ne traite pas : le serveur ne lui
// donne ni EDIT, ni REVIEW — voir backend/auth/rolePermissions.ts) et jamais les déclarations d'une autre société
// (filtre canonique isOrgScopedRecordVisible + règle « auteur » côté serveur).
// ═══════════════════════════════════════════════════════════════

const FILTERS = [
  { id: 'all', label: 'Toutes' },
  { id: 'review', label: 'En attente' },
  { id: 'draft', label: 'Brouillons' },
  { id: 'sent', label: 'Transmises' },
  { id: 'closed', label: 'Clôturées' },
];

export default function SupplierDeclarations({ onNavigate }) {
  const { user } = useAuth();
  const wizardDrafts = useWizardDraftRows(user);
  const [filter, setFilter] = useState('all');
  const [detailId, setDetailId] = useState(null);

  const scoped = DR_DECLARATIONS.filter((d) => isOrgScopedRecordVisible(d, user));
  // Les brouillons de l'assistant (propres à l'utilisateur) s'affichent avec les lignes ; « Reprendre » rouvre l'assistant.
  const withDrafts = [...wizardDrafts, ...scoped];
  const filtered = filter === 'all' ? withDrafts : withDrafts.filter((d) => d.status === filter);
  const detail = detailId ? scoped.find((d) => d.id === detailId) : null;

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Mes")} <span className="page-title-accent">{tr("déclarations")}</span></h1></div>
        <div className="page-actions">
          <button className="btn btn--primary" onClick={() => onNavigate('sup-declarer')}>
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
                <tr><th>{tr("RÉFÉRENCE")}</th><th>{tr("SERVICE")}</th><th>{tr("DOMAINE / PRODUIT")}</th><th>{tr("GRAVITÉ")}</th><th>{tr("DATE")}</th><th>{tr("STATUT")}</th><th>{tr("ACTIONS")}</th></tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={7}><div className="inbox-empty"><Icon name="clipboard-off" />{tr("Aucune déclaration dans ce filtre.")}</div></td></tr>
                )}
                {filtered.map((d) => {
                  const [sevClass, sevLabel] = DR_SEVERITY_CLASS[d.severity];
                  const [statClass, statLabel] = DR_STATUS_BADGE[d.status];
                  return (
                    <tr key={d.id} data-status={d.status} data-domain={d.domain}>
                      <td><div className="table-ref">{d.ref}</div><div className="table-sub">{tr(d.domain)}</div></td>
                      <td><div className="u-fs-12">{d.dept || '—'}</div></td>
                      <td><span className={`chip chip--${DR_DOMAIN_CHIP[d.domain]}`} style={{ marginBottom: '3px' }}>{tr(d.domain)}</span><div className="table-sub">{d.product}</div></td>
                      <td><span className={`severity severity--${sevClass}`}>{sevLabel}</span></td>
                      <td><div className="u-fs-12">{d.date}</div></td>
                      <td><span className={`badge badge--${statClass}`}>{statLabel}</span></td>
                      <td><button className="tbl-action-btn" onClick={() => (d.isWizardDraft ? onNavigate('sup-declarer') : setDetailId(d.id))}>{d.isWizardDraft ? tr("Reprendre") : tr("Voir dossier")}</button></td>
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

          return (
            <>
              <div className="chat-overlay is-open" onClick={() => setDetailId(null)} />
              <div className="chat-panel chat-panel--wide overlay-modal is-open" role="dialog" aria-modal="true" aria-labelledby="msDeclDrawerTitle">
                <div className="chat-header">
                  <div className="chat-header-inner">
                    <div className="drawer-icon" style={{ background: 'var(--color-amber)', color: '#fff' }}>
                      <Icon name="clipboard-plus" />
                    </div>
                    <div className="u-flex-1 u-t31">
                      <div id="msDeclDrawerTitle" className="u-fs13-strong">{detail.ref}</div>
                      <div className="u-fs10-5-tertiary">{tr(detail.domain)}</div>
                    </div>
                    <button className="chat-close" onClick={() => setDetailId(null)} aria-label={tr("Fermer le panneau de détail")}>
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
                      <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Service")}</span><span className="drawer-kv-value">{detail.dept || '—'}</span></div>
                      <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Date")}</span><span className="drawer-kv-value">{detail.date}</span></div>
                      <div className="drawer-kv-item u-t82"><span className="drawer-kv-label">{tr("Produit / Lot")}</span><span className="drawer-kv-value">{detail.product}</span></div>
                      <div className="drawer-kv-item u-t82"><span className="drawer-kv-label">{tr("Effet / incident rapporté")}</span><span className="drawer-kv-value">{detail.effect}</span></div>
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
      </DeclarationsHub>
    </div>
  );
}
