import { useState } from 'react';
import Icon from '../../components/Icon';
import { LAB_SURVEILLANCE } from '../../data/laboVigilance';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Converted from #view-lab-surveillance (labo scope), 1:1 with the
// original's renderLabSurveillance() / filterLabSurveillance().
//
// Notes on fidelity:
//  - niveau→tone/label maps (critique→red/"Critique",
//    moyen→amber/"Moyen", faible→green/"Faible") ported verbatim.
//  - Signalements badge pluralizes exactly like the source:
//    `${n} signalement${n>1?'s':''}`.
//  - Row action is always "Déclarer" → opens the wizard directly
//    (openDeclareWizard() in the original) — no drawer.
// ═══════════════════════════════════════════════════════════════

const FILTERS = [
  { id: 'all', label: 'Tous' },
  { id: 'critique', label: 'Niveau critique' },
  { id: 'moyen', label: 'Niveau moyen' },
];

const NIVEAU_CLASS = { critique: 'red', moyen: 'amber', faible: 'green' };
const NIVEAU_LABEL = { critique: 'Critique', moyen: 'Moyen', faible: 'Faible' };

export default function LabSurveillance({ onNavigate }) {
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all' ? LAB_SURVEILLANCE : LAB_SURVEILLANCE.filter((s) => s.niveau === filter);

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Produits sous")} <span className="page-title-accent">{tr("surveillance")}</span></h1></div>
      </div>

      <div className="alert-banner alert-banner--cyan">
        <Icon name="bulb" />
        <div>
          <div className="alert-banner-title">{tr("Vue de synthèse par produit")}</div>
          <div className="alert-banner-text">{tr("Cette page regroupe les produits ayant fait l'objet de plusieurs signalements à l'échelle de VigiCore, pour repérer rapidement si un produit que vous manipulez est déjà sous surveillance renforcée.")}</div>
        </div>
      </div>

      <div className="filter-tabs" role="tablist" aria-label={tr("Filtrer les produits sous surveillance")}>
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
            <thead><tr><th>{tr("PRODUIT")}</th><th>{tr("FABRICANT")}</th><th>{tr("SIGNALEMENTS")}</th><th>{tr("NIVEAU")}</th><th>{tr("ACTIONS")}</th></tr></thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5}><div className="inbox-empty"><Icon name="package" />{tr("Aucun produit dans ce filtre.")}</div></td></tr>
              )}
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td><div className="u-fs12-500">{s.product}</div></td>
                  <td><div className="u-fs-12">{s.manufacturer}</div></td>
                  <td><span className={`badge badge--${NIVEAU_CLASS[s.niveau]}`}>{tr("{0} signalement{1}", [s.signalements, s.signalements > 1 ? 's' : ''])}</span></td>
                  <td><span className={`chip chip--${NIVEAU_CLASS[s.niveau]}`}>{NIVEAU_LABEL[s.niveau]}</span></td>
                  <td><button className="tbl-action-btn tbl-action-btn--primary" onClick={() => onNavigate('lab-declarer')}>{tr("Déclarer")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
