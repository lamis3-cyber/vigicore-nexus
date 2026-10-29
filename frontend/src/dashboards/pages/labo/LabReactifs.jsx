import { useState } from 'react';
import Icon from '../../components/Icon';
import { LAB_REAGENTS } from '../../data/laboVigilance';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Converted from #view-lab-reactifs (labo scope), 1:1 with the
// original's renderLabReactifs() / filterLabReactifs().
//
// Notes on fidelity:
//  - The alert-banner at the top is a deliberate scope disclaimer
//    from the source ("Registre de vigilance, pas de gestion de
//    stock" — this page tracks quality-notice/recall/surveillance
//    status only; quantities, expiry and ordering stay in the lab's
//    own LIMS). Reproduced verbatim, not paraphrased.
//  - Row action: "Déclarer" (→ lab-declarer) when vigilanceStatus is
//    'active', "Vérifier" (→ lab-recherche) when 'clear' — exact
//    ternary from the original, no drawer either way.
// ═══════════════════════════════════════════════════════════════

const FILTERS = [
  { id: 'all', label: 'Tous les réactifs' },
  { id: 'active', label: 'Sous vigilance active' },
  { id: 'clear', label: 'Sans anomalie' },
];

export default function LabReactifs({ onNavigate }) {
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all' ? LAB_REAGENTS : LAB_REAGENTS.filter((r) => r.vigilanceStatus === filter);

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Réactifs de")} <span className="page-title-accent">{tr("laboratoire")}</span></h1></div>
      </div>

      <div className="alert-banner alert-banner--cyan">
        <Icon name="bulb" />
        <div>
          <div className="alert-banner-title">{tr("Registre de vigilance, pas de gestion de stock")}</div>
          <div className="alert-banner-text">{tr("Cette page suit le statut vigilance des réactifs et kits utilisés au laboratoire (notifications qualité, rappels, surveillance renforcée) — la gestion des stocks et commandes reste dans votre LIMS habituel.")}</div>
        </div>
      </div>

      <div className="filter-tabs" role="tablist" aria-label={tr("Filtrer les réactifs par statut")}>
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
            <thead><tr><th>{tr("RÉACTIF / KIT")}</th><th>{tr("FOURNISSEUR")}</th><th>{tr("LOT(S) EN USAGE")}</th><th>{tr("STATUT VIGILANCE")}</th><th>{tr("DERNIÈRE VÉRIFICATION")}</th><th>{tr("ACTIONS")}</th></tr></thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6}><div className="inbox-empty"><Icon name="flask" />{tr("Aucun réactif dans ce filtre.")}</div></td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td><div className="u-fs12-500">{r.product}</div><div className="table-sub">{tr(r.note)}</div></td>
                  <td><div className="u-fs-12">{r.fournisseur}</div></td>
                  <td><div className="u-fs-12 u-mono">{r.lots.join(', ')}</div></td>
                  <td>{r.vigilanceStatus === 'active' ? <span className="badge badge--amber">{tr("Sous vigilance active")}</span> : <span className="badge badge--green">{tr("Sans anomalie")}</span>}</td>
                  <td><div className="u-fs-12">{r.lastCheck}</div></td>
                  <td>
                    {r.vigilanceStatus === 'active' ? (
                      <button className="tbl-action-btn tbl-action-btn--primary" onClick={() => onNavigate('lab-declarer')}>{tr("Déclarer")}</button>
                    ) : (
                      <button className="tbl-action-btn" onClick={() => onNavigate('lab-recherche')}>{tr("Vérifier")}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
