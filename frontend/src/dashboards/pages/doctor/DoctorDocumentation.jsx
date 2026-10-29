import { useState } from 'react';
import Icon from '../../components/Icon';
import EmptyState from '../../components/EmptyState';
import { useToast } from '../../context/ToastContext';
import { DR_DOCS } from '../../data/doctorVigilance';
import { DECLARATION_DOMAINS } from '../../domain/declaration';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Converted from #view-doc-documentation (doctor scope), 1:1 with the
// original's renderDrDocs() / filterDrDocs().
//
// Notes on fidelity:
//  - Icon substitutions (subsetted icon font, no exact glyph
//    available): ti-math-function → ti-list-check, ti-device-analytics
//    → ti-stethoscope, ti-flask-2 → ti-flask, ti-microscope →
//    ti-test-pipe (see doctorVigilance.js DR_DOCS), ti-file (toast
//    icon) → ti-file-text.
//  - "Consulter" toasts the same way the original did (no real document
//    viewer in this demo shell); "Télécharger" has no handler in the
//    source either — kept as a decorative icon-only button, same as
//    the original's markup.
//  - Domain filter bar: "Tous" + whichever of the 5 canonical domains
//    (DECLARATION_DOMAINS) actually have at least one entry in DR_DOCS,
//    in canonical order. Derived from the data rather than hardcoded so
//    the bar can never list a domain with nothing to show: today
//    that's still Pharmacovigilance/Matériovigilance/Cosmétovigilance/
//    Réactovigilance — no Chemovigilance document exists in the
//    library yet, so no 'Chemovigilance' tab renders (an empty tab
//    would be confusing UX). Adding a Chemovigilance doc to DR_DOCS
//    later makes its tab appear automatically, no change needed here.
// ═══════════════════════════════════════════════════════════════

const DOMAIN_FILTERS = [
  { id: 'all', label: 'Tous' },
  ...DECLARATION_DOMAINS.filter((d) => DR_DOCS.some((doc) => doc.domain === d)).map((d) => ({ id: d, label: d })),
];

export default function DoctorDocumentation() {
  const toast = useToast();
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all' ? DR_DOCS : DR_DOCS.filter((d) => d.domain === filter);

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Documentation")} <span className="page-title-accent">{tr("scientifique")}</span></h1></div>
      </div>

      <div className="card">
        <div className="domain-filter-bar u-t83" role="tablist" aria-label={tr("Filtrer la documentation par domaine")}>
          {DOMAIN_FILTERS.map((f) => (
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
        <div className="u-col-gap8">
          {filtered.length === 0 && (
            <EmptyState icon="books" title="Aucun document" text="Aucun document dans ce domaine pour le moment." />
          )}
          {filtered.map((d) => (
            <div className="doc-item" key={d.id}>
              <div className="doc-icon" style={{ background: `var(--color-${d.color}-dim)`, color: `var(--color-${d.color})` }}><Icon name={d.icon} /></div>
              <div className="u-flex-1"><div className="doc-title">{tr(d.title)}</div><div className="doc-meta">{d.meta}</div></div>
              <div className="u-row-gap6">
                <button className="btn btn--primary u-btn-sm" onClick={() => toast('info', tr("Document"), 'Ouverture — ' + d.title, 'ti ti-file-text')}>
                  <Icon name="eye" />{tr("Consulter")}
                </button>
                <button className="btn u-btn-sm" aria-label={tr("Télécharger {0}", [d.title])} onClick={() => toast('warn', tr("Téléchargement"), tr("Le fichier de « {0} » n’est pas encore disponible dans cette version.", [d.title]), 'ti ti-file-off')}><Icon name="download" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
