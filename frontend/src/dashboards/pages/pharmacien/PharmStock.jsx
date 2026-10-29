import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import { useToast } from '../../context/ToastContext';
import { PHARM_RECALLS, QR_VERDICT_META, INCIDENT_THREADS, isRecallReturnedForUser } from '../../data/doctorVigilance';
import { getCurrentAuthUser } from '../../context/AuthContext';
import { isOrgScopedRecordVisible } from '../../config/organizations';
import {
  PHARM_STOCK_META,
  pharmProductAlerts,
  pharmDaysUntil,
  pharmDaysSince,
  pharmStockList,
  pharmScopedProducts,
  pharmScopedBranches,
  consumePendingStockBranchRequest,
} from '../../data/pharmacienVigilance';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Converted from #view-pharm-stock (pharmacien scope), 1:1 with the
// original's renderPharmStock() / filterPharmStockCategory() /
// filterPharmStockBranch() / openProductCard().
//
// Notes on fidelity:
//  - On mount, consumes a pending branch request stashed by
//    PharmDashboard's "Mes officines" cards (goToPharmBranch()).
//  - The 4 category KPI cards toggle the category filter on/off
//    exactly like the original (clicking the active one clears back
//    to "all").
//  - openProductCard()'s drawer is reproduced in full: alerts badges,
//    authenticity verdict banner, mfg→reception→last-sale timeline,
//    matching recall banner (by lot, falling back to the product's
//    own `recalled` flag), related incidents (matched the same way
//    the original did — INCIDENT_THREADS whose title contains the
//    product's first word), and the two footer actions (Notice PDF
//    toast, "Commander ce produit" → pharm-commandes).
// ═══════════════════════════════════════════════════════════════

export default function PharmStock({ onNavigate }) {
  const toast = useToast();
  const user = getCurrentAuthUser();

  const [branchFilter, setBranchFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [drawerProductId, setDrawerProductId] = useState(null);

  useEffect(() => {
    const pending = consumePendingStockBranchRequest();
    if (pending) setBranchFilter(pending);
  }, []);

  function closeDrawer() {
    setDrawerProductId(null);
  }

  const orgProducts = pharmScopedProducts(user);
  const orgBranches = pharmScopedBranches(user);

  const flagged = pharmStockList(orgProducts, branchFilter);
  const counts = { low: 0, expiry: 0, recalled: 0, dead: 0 };
  flagged.forEach((p) => pharmProductAlerts(p).forEach((a) => counts[a]++));

  const summaryParts = [];
  if (counts.recalled) summaryParts.push(<span key="recalled"><strong>{counts.recalled}</strong> {tr("produit(s) rappelé(s) encore en rayon — priorité de retrait immédiate.")} </span>);
  if (counts.expiry) summaryParts.push(<span key="expiry"><strong>{counts.expiry}</strong> {tr("produit(s) expirent sous 60 jours.")} </span>);
  if (counts.low) summaryParts.push(<span key="low"><strong>{counts.low}</strong> {tr("produit(s) sous le seuil de réapprovisionnement.")} </span>);
  if (counts.dead) summaryParts.push(<span key="dead"><strong>{counts.dead}</strong> {tr("produit(s) sans vente depuis plus de 60 jours — immobilisation de trésorerie.")} </span>);

  const list = categoryFilter === 'all' ? flagged : flagged.filter((p) => pharmProductAlerts(p).includes(categoryFilter));

  const drawerProduct = drawerProductId ? orgProducts.find((p) => p.id === drawerProductId) : null;

  function branchTabLabel(b) {
    return b === 'all' ? 'Toutes officines' : b;
  }

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Stock")} <span className="page-title-accent">{tr("intelligent")}</span></h1></div>
        <div className="page-actions"><button className="btn btn--primary" onClick={() => onNavigate('pharm-commandes')}><Icon name="truck-delivery" />{tr("Commander")}</button></div>
      </div>

      <div className="ai-insight-card">
        <div className="ai-badge"><Icon name="sparkles" /></div>
        <div className="u-flex-1">
          <div className="ai-insight-title">{tr("Analyse Smart Stock — VigiCore AI")}</div>
          <div className="ai-insight-text u-t17">
            {summaryParts.length ? summaryParts : tr("Aucune alerte de stock détectée pour cette sélection — situation normale.")}
          </div>
          <div className="ai-disclaimer">{tr("Détection à règles à partir des seuils de réapprovisionnement, dates de péremption, rappels ANPP et historique des ventes de l'officine.")} <span className="u-t22">{tr("(Démonstration.)")}</span></div>
        </div>
      </div>

      <div className="grid-kpi">
        {Object.keys(PHARM_STOCK_META).map((key) => {
          const m = PHARM_STOCK_META[key];
          const isActive = categoryFilter === key;
          return (
            <div
              className="kpi-card u-pointer"
              role="button"
              tabIndex={0}
              key={key}
              style={isActive ? { outline: `2px solid ${m.color}`, outlineOffset: '-1px' } : undefined}
              onClick={() => setCategoryFilter((c) => (c === key ? 'all' : key))}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setCategoryFilter((c) => (c === key ? 'all' : key)); }}
            >
              <div className="kpi-accent" style={{ background: m.color }} />
              <div className="kpi-header"><div className="kpi-label">{tr(m.label)}</div><div className="kpi-icon" style={{ background: `var(--color-${m.tone}-dim)`, color: m.color }}><Icon name={m.icon} /></div></div>
              <div className="kpi-value" style={{ color: m.color }}>{counts[key]}</div>
              <div className="kpi-sub">{tr("produit(s) — {0}", [branchFilter === 'all' ? 'toutes officines' : branchFilter])}</div>
            </div>
          );
        })}
      </div>

      <div className="card u-p-0">
        <div style={{ padding: '16px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div className="section-title"><Icon name="filter" className="u-c-cyan" />{tr("Produits signalés")}</div>
          <div className="filter-tabs" role="tablist" aria-label={tr("Filtrer par agence")}>
            {['all', ...orgBranches].map((b) => (
              <button
                key={b}
                className={`filter-tab${branchFilter === b ? ' is-active' : ''}`}
                role="tab"
                aria-selected={branchFilter === b}
                onClick={() => setBranchFilter(b)}
              >
                {branchTabLabel(b)}
              </button>
            ))}
          </div>
        </div>
        <div className="u-overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>{tr("PRODUIT")}</th><th>{tr("OFFICINE")}</th><th>{tr("LOT")}</th><th>{tr("STOCK")}</th><th>{tr("PÉREMPTION")}</th><th>{tr("DERNIÈRE VENTE")}</th><th>{tr("ALERTES")}</th><th>{tr("ACTIONS")}</th></tr></thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={8}><div className="inbox-empty"><Icon name="circle-check" />{tr("Aucune alerte pour ce filtre — stock sous contrôle")}</div></td></tr>
              )}
              {list.map((p) => {
                const alerts = pharmProductAlerts(p);
                const du = pharmDaysUntil(p.expDate);
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="u-fs12-500 u-pointer" role="button" tabIndex={0} onClick={() => setDrawerProductId(p.id)} onKeyDown={(e) => { if (e.key === 'Enter') setDrawerProductId(p.id); }}>{tr(p.name)}</div>
                      <div className="table-sub">{p.manufacturer}</div>
                    </td>
                    <td><div className="u-fs-12">{p.branch}</div></td>
                    <td><span className="u-mono u-fs-11">{p.lot}</span></td>
                    <td><div className="u-fs-12">{p.qty} <span className="u-fs10-tertiary">{tr("/ seuil {0}", [p.reorderThreshold])}</span></div></td>
                    <td><div className="u-fs-12">{p.expDate ? <>{p.expDate}{du !== null && du <= 60 && <span className="u-fs10-tertiary"> ({du} j)</span>}</> : '—'}</div></td>
                    <td><div className="u-fs-12">{p.lastSaleDate}</div></td>
                    <td>{alerts.map((a) => <span className={`badge badge--${PHARM_STOCK_META[a].tone}`} style={{ margin: '1px' }} key={a}>{PHARM_STOCK_META[a].short}</span>)}</td>
                    <td><button className="tbl-action-btn tbl-action-btn--primary" onClick={() => setDrawerProductId(p.id)}>{tr("Fiche produit")}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {drawerProduct && (() => {
        const p = drawerProduct;
        const meta = QR_VERDICT_META[p.verdict] || QR_VERDICT_META.authentic;
        const alerts = pharmProductAlerts(p);
        const matchingRecall = PHARM_RECALLS.find((r) => r.lot === p.lot);
        // Blocker fix (audit round 3) — restrict to this organization's
        // own incident threads before the fuzzy title match, same rule
        // used everywhere else INCIDENT_THREADS is read (DoctorMessagerie.jsx).
        const orgIncidentThreads = INCIDENT_THREADS.filter((t) => isOrgScopedRecordVisible(t, getCurrentAuthUser()));
        const relatedIncidents = orgIncidentThreads.filter((t) => t.title.toLowerCase().includes(p.name.toLowerCase().split(' ')[0].toLowerCase()));
        const iconBg = alerts.includes('recalled') ? 'var(--color-red)' : alerts.length ? 'var(--color-amber)' : 'var(--color-brand)';

        return (
          <>
            <div className="chat-overlay is-open" onClick={closeDrawer} />
            <div className="chat-panel chat-panel--wide overlay-modal is-open" role="dialog" aria-modal="true" aria-labelledby="pharmProductDrawerTitle">
              <div className="chat-header">
                <div className="chat-header-inner">
                  <div className="drawer-icon" style={{ background: iconBg, color: '#fff' }}><Icon name="pill" /></div>
                  <div className="u-flex-1 u-t31">
                    <div id="pharmProductDrawerTitle" className="u-fs13-strong">{tr(p.name)}</div>
                    <div className="u-fs10-5-tertiary">{tr("Fiche produit · {0}", [p.branch])}</div>
                  </div>
                  <button className="chat-close" onClick={closeDrawer} aria-label={tr("Fermer le panneau de détail")}><Icon name="x" /></button>
                </div>
              </div>

              <div className="chat-messages" style={{ gap: '16px' }}>
                <div className="drawer-section">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '56px', height: '56px', borderRadius: 'var(--radius-md)', background: 'var(--surface-3)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', color: 'var(--color-brand)', flexShrink: 0 }}><Icon name="pill" /></div>
                    <div className="u-flex-1 u-t31"><div className="u-fs13-strong">{tr(p.name)}</div><div className="u-fs10-5-tertiary">{p.form}</div></div>
                  </div>
                  {alerts.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                      {alerts.map((a) => (
                        <span className={`badge badge--${PHARM_STOCK_META[a].tone}`} key={a}><Icon name={PHARM_STOCK_META[a].icon} className="u-fs-10" />&nbsp;{tr(PHARM_STOCK_META[a].label)}</span>
                      ))}
                    </div>
                  )}
                  <div className="drawer-kv u-t84">
                    <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Fabricant")}</span><span className="drawer-kv-value">{p.manufacturer}</span></div>
                    <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Lot")}</span><span className="drawer-kv-value u-mono">{p.lot}</span></div>
                    <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Date de fabrication")}</span><span className="drawer-kv-value">{p.mfgDate}</span></div>
                    <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Date d'expiration")}</span><span className="drawer-kv-value">{p.expDate || tr("Non applicable")}</span></div>
                    <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Officine")}</span><span className="drawer-kv-value">{p.branch}</span></div>
                    <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Stock actuel")}</span><span className="drawer-kv-value">{tr("{0} unité(s)", [p.qty])}</span></div>
                  </div>
                </div>

                <div className="drawer-section">
                  <div className="drawer-section-title">{tr("Authenticité")}</div>
                  <div className={`verdict-banner verdict-banner--${meta.cls}`}>
                    <Icon name={meta.icon} />
                    <div><div className="verdict-title">{tr(meta.label)}</div><div className="verdict-sub">{tr("Score de risque : {0}/100 · Base ANPP", [p.risk])}</div></div>
                  </div>
                </div>

                <div className="drawer-section">
                  <div className="drawer-section-title">{tr("Historique")}</div>
                  <div className="timeline">
                    <div className="tl-item"><div className="tl-dot tl-dot--green" /><div className="tl-time">{p.mfgDate}</div><div className="tl-body"><div className="tl-event"><strong>{tr("Fabrication")}</strong> — {p.manufacturer}</div></div></div>
                    <div className="tl-item"><div className="tl-dot tl-dot--green" /><div className="tl-time">{p.mfgDate}</div><div className="tl-body"><div className="tl-event">{tr("Réception —")} <strong>{user?.orgName || tr("Votre officine")}, {p.branch}</strong></div><div className="tl-sub">{tr("Lot {0} · {1} unité(s) en stock actuellement", [p.lot, p.qty])}</div></div></div>
                    <div className="tl-item"><div className={`tl-dot${pharmDaysSince(p.lastSaleDate) < 60 ? ' tl-dot--active' : ''}`} /><div className="tl-time">{p.lastSaleDate}</div><div className="tl-body"><div className="tl-event">{tr("Dernière dispensation")}</div></div></div>
                  </div>
                </div>

                <div className="drawer-section">
                  <div className="drawer-section-title">{tr("Rappel")}</div>
                  {matchingRecall ? (
                    <div className={`alert-banner alert-banner--${isRecallReturnedForUser(matchingRecall, getCurrentAuthUser()) ? 'green' : 'red'}`}>
                      <Icon name={isRecallReturnedForUser(matchingRecall, getCurrentAuthUser()) ? 'circle-check' : 'alert-triangle'} />
                      <div>
                        <div className="alert-banner-title">{isRecallReturnedForUser(matchingRecall, getCurrentAuthUser()) ? tr("Rappel — retour déjà confirmé") : tr("Rappel actif ANPP")}</div>
                        <div className="alert-banner-text">{tr(matchingRecall.reason)}<br /><span className="u-fs10-tertiary">{tr("Réf. {0} · {1}", [matchingRecall.ref, matchingRecall.date])}</span></div>
                      </div>
                    </div>
                  ) : p.recalled ? (
                    <div className="alert-banner alert-banner--red">
                      <Icon name="alert-triangle" />
                      <div><div className="alert-banner-title">{tr("Produit rappelé")}</div><div className="alert-banner-text">{tr("Ce lot fait l'objet d'un rappel. Isolez le produit et organisez le retour.")}</div></div>
                    </div>
                  ) : (
                    <div className="u-fs-12 u-c-tertiary">{tr("Aucun rappel actif sur ce lot.")}</div>
                  )}
                </div>

                <div className="drawer-section">
                  <div className="drawer-section-title">{tr("Incidents liés")}</div>
                  {p.incidents > 0 || relatedIncidents.length ? (
                    relatedIncidents.length ? relatedIncidents.map((t) => (
                      <div className="card" style={{ padding: '10px 12px', marginBottom: '6px' }} key={t.id}>
                        <div className="u-fs12-500">{t.ref} — {tr(t.title)}</div>
                        <div className="table-sub">{tr(t.domain)} · {t.time}</div>
                      </div>
                    )) : <div className="u-fs-12 u-t101">{tr("{0} incident(s) rapporté(s) pour ce produit.", [p.incidents])}</div>
                  ) : (
                    <div className="u-fs-12 u-c-tertiary">{tr("Aucun incident rapporté pour ce produit.")}</div>
                  )}
                </div>
              </div>

              <div className="drawer-actions">
                <button className="btn" onClick={() => toast('info', tr("Notice patient"), tr("Ouverture de la notice officielle du produit…"), 'ti ti-file-text')}><Icon name="file-text" />{tr("Notice PDF")}</button>
                <button className="btn btn--primary" onClick={() => { closeDrawer(); onNavigate('pharm-commandes'); }}><Icon name="truck-delivery" />{tr("Commander ce produit")}</button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
