import { useState } from 'react';
import Icon from '../../components/Icon';
import DeclarationsHub from '../../components/DeclarationsHub';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { DR_DECLARATIONS, DR_STATUS_BADGE, DR_SEVERITY_CLASS } from '../../data/doctorVigilance';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Converted from #view-declarations (patient scope), 1:1 with the
// original filterDecl(type, btn) function and the static #declBody
// table rows.
//
// Blocker 3 fix (audit round "final cleanup") — this page used to
// read its OWN static, disconnected dataset (5 hardcoded rows,
// #DEC-2026-xxx refs) that had no relationship whatsoever to what
// PatientDeclarer.jsx's wizard actually submits. A patient could
// declare an incident and it would vanish — Dossiers would keep
// showing the same 5 fake rows forever. PatientDeclarer.jsx already
// writes real submissions into DR_DECLARATIONS via addDrDeclaration()
// (the same canonical store every professional declarations page in
// this app reads) — so this page now reads that same store instead
// of inventing a second, competing one.
//
// Ownership rule: a declaration "belongs to" the signed-in patient
// when `authoredByUserId` matches their own session id — exactly the
// field addDrDeclaration() already stamps from the real session for
// every new submission (see doctorVigilance.js). This is deliberately
// NOT `patientId` (DR_PATIENTS' id, e.g. 'pt-1') — there is no
// reliable, already-established link in this codebase between a
// DR_PATIENTS record and a patient's own login account, and guessing
// one (e.g. by matching names) is exactly the kind of invented
// cross-reference the brief asks not to introduce. `authoredByUserId`
// is the real, already-existing ownership field for "who actually
// submitted this", which is what "the patient's own declaration"
// means here. Pre-existing seed declarations (dr-dec-1..7) all have
// `authoredByUserId: null` (same "legacy, never guessed" convention
// used throughout doctorVigilance.js), so they correctly do NOT
// appear in any patient's own Dossiers — only what a patient actually
// submits themselves does, closing the disconnect without touching
// the doctor-side declaration lifecycle at all.
//
// Notes on fidelity kept from the original where the field mapping
// allows it:
//  - Status/severity chip colors and labels reuse DR_STATUS_BADGE /
//    DR_SEVERITY_CLASS — the exact same lookups DoctorDeclarations.jsx,
//    ClinDeclarations.jsx, HospDeclarations.jsx, etc. already use —
//    rather than a second, patient-page-specific copy of the same
//    status vocabulary.
//  - Row actions ("Suivre le dossier" / "Voir dossier" / "Compléter"+
//    "Supprimer" / "Rapport final CNPM") keep their original inert
//    behavior — none of them had a real onclick in the source, so
//    none is wired to invented behavior here either.
//  - The "declarations non transmises" banner is now driven by the
//    REAL draft count instead of always showing the same two
//    hardcoded product names — the original's "always show it" was
//    only ever correct because the whole list was static demo
//    content; keeping it unconditional against a live store would
//    show visibly false information (a banner naming products that
//    were never declared) the moment a real patient has zero drafts.
// ═══════════════════════════════════════════════════════════════

const FILTERS = [
  { id: 'all', label: 'Toutes' },
  { id: 'draft', label: 'Brouillons' },
  { id: 'sent', label: 'Envoyées' },
  { id: 'analysis', label: 'Analyse' },
  { id: 'closed', label: 'Clôturées' },
];

// review isn't one of this page's filter tabs (patient submissions
// never land in 'review' — that status belongs to the professional
// wizards' pre-transmission step) but is mapped defensively in case a
// declaration ever arrives in that status.
const ACTIONS_TYPE_BY_STATUS = { draft: 'draft', closed: 'closed', analysis: 'single-primary', sent: 'single', review: 'single' };

export default function PatientDossiers({ onNavigate }) {
  const { user } = useAuth();
  const toast = useToast();
  // Drafts are removed from the shared in-memory store; this counter just forces a re-render.
  const [, bump] = useState(0);
  // filterDecl(type, btn) — same idea, as React state instead of DOM classList/style toggling.
  const [filter, setFilter] = useState('all');

  const myDeclarations = DR_DECLARATIONS.filter((d) => user?.id && d.authoredByUserId === user.id);
  const draftDeclarations = myDeclarations.filter((d) => d.status === 'draft');

  function countFor(id) {
    if (id === 'all') return myDeclarations.length;
    return myDeclarations.filter((d) => d.status === id).length;
  }

  const openDossier = (d) => toast('info', tr("Dossier"), `${d.ref} — ${DR_STATUS_BADGE[d.status]?.[1] ?? d.status}`, 'ti ti-file-text');
  const deleteDraft = (d) => {
    if (!window.confirm(tr("Supprimer ce brouillon ? Cette action est définitive."))) return;
    const i = DR_DECLARATIONS.findIndex((x) => x.id === d.id);
    if (i >= 0) DR_DECLARATIONS.splice(i, 1);
    bump((n) => n + 1);
    toast('success', tr("Brouillon supprimé"), d.ref, 'ti ti-trash');
  };
  const finalReport = (d) => toast('warn', tr("Rapport final CNPM"), tr("Le rapport de {0} n’est pas encore disponible.", [d.ref]), 'ti ti-file-off');

  const visibleRows = myDeclarations.filter((d) => filter === 'all' || d.status === filter);

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Mes")} <span className="page-title-accent">{tr("déclarations")}</span></h1></div>
        <div className="page-actions">
          <button className="btn btn--primary" onClick={() => onNavigate('declarer')}>
            <Icon name="plus" />{tr("Nouvelle déclaration")}
          </button>
        </div>
      </div>
      <DeclarationsHub queue={false}>
        <div className="filter-tabs" style={{ marginBottom: '8px' }} role="tablist" aria-label={tr("Filtrer les déclarations par statut")}>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`filter-tab${filter === f.id ? ' is-active' : ''}`}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {tr(f.label)} ({countFor(f.id)})
            </button>
          ))}
        </div>

        {draftDeclarations.length > 0 && (
          <div className="alert-banner alert-banner--amber" role="alert">
            <Icon name="alert-circle" />
            <div>
              <div className="alert-banner-title">{tr("{0} déclaration{1} non transmise{2} au CNPM", [draftDeclarations.length, draftDeclarations.length > 1 ? 's' : '', draftDeclarations.length > 1 ? 's' : ''])}</div>
              <div className="alert-banner-text">{tr("Vos brouillons ({0}) ne sont pas encore reçus par le Centre National de Pharmacovigilance. Selon la réglementation algérienne, les effets indésirables graves doivent être signalés dans les 15 jours. Complétez et envoyez ces déclarations dès que possible.", [draftDeclarations.map((d) => d.product).join(', ')])}</div>
            </div>
            <button className="btn btn--danger u-t90" onClick={() => setFilter('draft')}>
              <Icon name="edit" />{tr("Compléter les brouillons")}
            </button>
          </div>
        )}

        <div className="card u-p-0">
          <div className="u-overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{tr("RÉFÉRENCE CNPM")}</th>
                  <th>{tr("PRODUIT / LOT")}</th>
                  <th>{tr("EFFETS INDÉSIRABLES")}</th>
                  <th>{tr("DATE")}</th>
                  <th>{tr("GRAVITÉ")}</th>
                  <th>{tr("STATUT")}</th>
                  <th>{tr("ACTIONS")}</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 && (
                  <tr><td colSpan={7}><div className="inbox-empty"><Icon name="clipboard-off" />{tr("Aucune déclaration dans ce filtre.")}</div></td></tr>
                )}
                {visibleRows.map((d) => {
                  const [sevClass, sevLabel] = DR_SEVERITY_CLASS[d.severity];
                  const [statClass, statLabel] = DR_STATUS_BADGE[d.status];
                  const actionsType = ACTIONS_TYPE_BY_STATUS[d.status] || 'single';
                  const isDraft = d.status === 'draft';
                  return (
                    <tr key={d.id} className={isDraft ? 'u-t98' : undefined} data-status={d.status}>
                      <td>
                        <div className={`table-ref${isDraft ? ' u-c-amber' : ''}`}>{d.ref}</div>
                        <div className={`table-sub${isDraft ? ' u-c-amber' : ''}`}>{tr(d.dept)} · {d.date}</div>
                      </td>
                      <td>
                        <div className="u-fs12-500">{d.product}</div>
                      </td>
                      <td><div className="u-fs-12">{d.effect}</div></td>
                      <td><div className="u-fs-12">{d.date}</div></td>
                      <td><span className={`severity severity--${sevClass}`}>{sevLabel}</span></td>
                      <td><span className={`badge badge--${statClass}`}>{statLabel}</span></td>
                      <td>
                        {actionsType === 'single' && (
                          <button className="tbl-action-btn" onClick={() => openDossier(d)}>{tr("Suivre le dossier")}</button>
                        )}
                        {actionsType === 'single-primary' && (
                          <button className="tbl-action-btn tbl-action-btn--primary" onClick={() => openDossier(d)}>{tr("Voir dossier")}</button>
                        )}
                        {actionsType === 'draft' && (
                          <div className="u-t69">
                            <button className="tbl-action-btn tbl-action-btn--primary" onClick={() => onNavigate('declarer')}>{tr("Compléter")}</button>
                            <button className="tbl-action-btn" onClick={() => deleteDraft(d)}>{tr("Supprimer")}</button>
                          </div>
                        )}
                        {actionsType === 'closed' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <button className="tbl-action-btn tbl-action-btn--primary" onClick={() => finalReport(d)}>{tr("Rapport final CNPM")}</button>
                          </div>
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
