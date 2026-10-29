import Icon from '../../components/Icon';
import ChartCanvas from '../../components/ChartCanvas';
import { useToast } from '../../context/ToastContext';
import { pharmVerifTrendChartConfig } from '../../charts/chartConfigs';
import { PHARM_RECALLS, DR_DECLARATIONS, QR_VERDICT_META, isRecallReturnedForUser } from '../../data/doctorVigilance';
import { pharmStockList, pharmScopedProducts, pharmScopedBranches, pharmScopedVerifications, requestStockBranch } from '../../data/pharmacienVigilance';
import { useAuth } from '../../context/AuthContext';

import { todayLongFr } from '../../lib/today';
import { tr } from '../../../i18n/translate.js';
// ═══════════════════════════════════════════════════════════════
// Converted from #view-pharm-dashboard (pharmacien scope), 1:1 with
// the original's renderPharmDashboard() (active-recalls panel +
// last-3-verifications panel + KPIs) plus the static "Mes officines"
// branch grid (goToPharmBranch()).
//
// Notes on fidelity:
//  - "Produits sous surveillance" KPI (#kpiPharmSurveillance) is
//    never actually assigned a value anywhere in the original's JS —
//    it's static markup that always reads "0". Reproduced as a
//    hardcoded 0 here rather than "fixed", for the same reason the
//    Doctor pages preserve other as-found original quirks.
//  - "Rappels actifs" / "Vérifications récentes" panels use
//    PHARM_RECALLS.filter(!returned) and org-scoped verifications
//    (compact mode: no "Confirmer le retour" action here — that only
//    appears on the full pharm-rappels page, exactly like the
//    original's pharmRecallCardHTML(r, compact=true)).
//  - "Mes officines" branch cards reuse requestStockBranch() to hand
//    off the selected branch to PharmStock on navigation — see
//    pharmacienVigilance.js for why (this port's routing has no
//    per-navigation params).
// ═══════════════════════════════════════════════════════════════

// Pharmacist portal audit fix (Step 3B §3/§4): "Pharmacie El Badr" was
// hardcoded into the toast, the "Mes officines" heading text, and each
// branch card's label — regardless of which pharmacist was logged in.
// Since PHARM_PRODUCTS/PHARM_BRANCHES are entirely organizationId:null
// (the standalone officine's own stock — see pharmacienVigilance.js),
// an organization-employed pharmacist (Nadia Bouzid at CHU Alger, Riad
// Kaced at Clinique El Fedjr) always has ZERO scoped branches, so the
// old text rendered the nonsensical "Officine El Badr — 0 agence(s)"
// for an officine they don't belong to. `officineName` below now
// reflects the session's own organization (or the standalone account's
// own established "Pharmacie El Badr" identity), and the empty case
// gets an explicit, honest message instead of a wrong pharmacy name.
export default function PharmDashboard({ onNavigate }) {
  const toast = useToast();
  // Step 6 fix — getCurrentAuthUser() is a module-level mirror of the
  // session user, synced via a useEffect in AuthContext that only
  // fires AFTER the commit that follows login (or logout→login).
  // Reading it directly during render meant that on the very first
  // paint of this dashboard right after login, `user` was still the
  // *previous* session's value (null on first login), so the "Bonjour,"
  // greeting rendered with no name and org-scoped data was computed
  // against no organization — until some unrelated re-render happened
  // to refresh it. useAuth() reads the same session user reactively
  // from React state instead, so it is correct on the very first
  // render. See AuthContext.jsx's getCurrentAuthUser() header — that
  // accessor exists for non-component modules (declarationService.js)
  // that can't call hooks; components should use useAuth().
  const { user } = useAuth();
  const officineName = user?.orgName || 'Votre officine';

  const activeRecalls = PHARM_RECALLS.filter((r) => !isRecallReturnedForUser(r, user));
  const orgProducts = pharmScopedProducts(user);
  const orgBranches = pharmScopedBranches(user);
  const orgVerifications = pharmScopedVerifications(user);
  const myDecl = DR_DECLARATIONS.filter((d) => user?.id && d.authoredByUserId === user.id);

  function goToBranch(branch) {
    requestStockBranch(branch);
    onNavigate('pharm-stock');
    toast('info', tr("Officine sélectionnée"), officineName + ' — ' + branch + ' : affichage des alertes de stock filtrées.', 'ti ti-building-store');
  }

  return (
    <div className="view is-active">
      <div className="page-header">
        <div>
          <h1 className="page-title">{tr("Bonjour,")} <span className="page-title-accent">{user?.name}</span></h1>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => onNavigate('pharm-verification')}><Icon name="qrcode" />{tr("Vérifier un lot")}</button>
          <button className="btn btn--primary" onClick={() => onNavigate('pharm-declarer')}><Icon name="clipboard-plus" />{tr("Déclarer un incident")}</button>
        </div>
      </div>

      <div className="ai-insight-card">
        <div className="ai-badge"><Icon name="sparkles" /></div>
        <div className="u-flex-1">
          <div className="ai-insight-title">{tr("Résumé VigiCore AI — Officine · {0}", [todayLongFr()])}</div>
          <div className="ai-insight-text u-t28">
            {activeRecalls.length > 0 ? (
              <div className="u-flex-start-gap7"><span className="u-t25">{tr("⚠ URGENT")}</span><span>{tr("Rappel")} <strong>{activeRecalls[0].ref}</strong> — {activeRecalls[0].product} {tr("(lot")} {activeRecalls[0].lot}{tr(") : ce produit ne doit plus être délivré. Retour et remboursement à organiser.")}</span></div>
            ) : (
              <div className="u-flex-start-gap7"><span className="u-ai-quiet">{tr("✓ À jour")}</span><span>{tr("Aucun rappel produit actif pour le moment.")}</span></div>
            )}
            {orgVerifications.length > 0 ? (
              <div className="u-flex-start-gap7"><span className="u-t23">{tr("● Action")}</span><span><strong>{orgVerifications.length}</strong> {tr("vérification")}{orgVerifications.length > 1 ? 's' : ''} {tr("de lot effectuée")}{orgVerifications.length > 1 ? 's' : ''} {tr("récemment — à consulter dans Vérification.")}</span></div>
            ) : (
              <div className="u-flex-start-gap7"><span className="u-ai-quiet">{tr("● Action")}</span><span>{tr("Aucune vérification de lot récente.")}</span></div>
            )}
            <div className="u-flex-start-gap7"><span className="u-t24">{tr("● Suivi")}</span><span>{tr("{0} : {1} agence{2} suivie{3} — consultez Stock intelligent pour l'état des seuils de réapprovisionnement.", [officineName, orgBranches.length, orgBranches.length > 1 ? 's' : '', orgBranches.length > 1 ? 's' : ''])}</span></div>
          </div>
          <div className="ai-disclaimer">{tr("Synthèse générée à partir des dossiers VigiCore de l'officine. Décret exécutif n° 92-276.")} <span className="u-t22">{tr("(Synthèse à règles dans cette version de démonstration.)")}</span></div>
        </div>
        <button className={`btn${activeRecalls.length > 0 ? ' btn--danger' : ''} u-t33`} onClick={() => onNavigate('pharm-rappels')}><Icon name="alert-triangle" />{tr("Voir les rappels")}</button>
      </div>

      <div className="grid-kpi">
        <div className="kpi-card">
          <div className="kpi-accent u-t14" />
          <div className="kpi-header"><div className="kpi-label">{tr("Rappels actifs")}</div><div className="kpi-icon u-t4"><Icon name="alert-triangle" /></div></div>
          <div className="kpi-value u-c-red">{activeRecalls.length}</div>
          <div className="kpi-sub">{tr("retours à confirmer")}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-accent u-t53" />
          <div className="kpi-header"><div className="kpi-label">{tr("Vérifications récentes")}</div><div className="kpi-icon u-t55"><Icon name="qrcode" /></div></div>
          <div className="kpi-value u-c-cyan">{orgVerifications.length}</div>
          <div className="kpi-sub">{tr("lots contrôlés cette semaine")}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-accent u-t52" />
          <div className="kpi-header"><div className="kpi-label">{tr("Mes déclarations")}</div><div className="kpi-icon u-t10"><Icon name="clipboard-list" /></div></div>
          <div className="kpi-value">{myDecl.length}</div>
          <div className="kpi-sub">{myDecl.length === 0 ? tr("Aucune déclaration pour le moment") : tr("{0} transmise(s) · {1} brouillon(s)", [myDecl.filter((d) => d.status === 'sent').length, myDecl.filter((d) => d.status === 'draft').length])}</div>
        </div>
      </div>

      <div className="grid-2-1">
        <div className="card">
          <div className="section-header">
            <h2 className="section-title"><Icon name="alert-triangle" className="u-c-red" />{tr("Rappels actifs")}</h2>
            <button className="btn" onClick={() => onNavigate('pharm-rappels')}>{tr("Tout voir")}</button>
          </div>
          <div className="u-col-gap10">
            {activeRecalls.length === 0 && (
              <div className="u-fs-12 u-t36">{tr("Aucun rappel actif à traiter.")}</div>
            )}
            {activeRecalls.map((r) => (
              <div className="alert-banner alert-banner--red" role="alert" key={r.id}>
                <Icon name="rotate-clockwise" />
                <div className="u-flex-1">
                  <div className="alert-banner-title">{r.product} — {r.lab}</div>
                  <div className="alert-banner-text">
                    {tr(r.reason)}
                    <br />
                    <span className="u-fs10-tertiary">{tr("Réf.")} {r.ref} {tr("· Lot")} <span className="u-mono">{r.lot}</span> · {r.date} {tr("· Patient(s) concerné(s) :")} {r.patients.join(', ')} {tr("· Stock officine :")} {r.stockOnHand} {tr("unité(s)")}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="u-col-gap12">
          <div className="u-label-caps">{tr("Dernières vérifications")}</div>
          <div className="u-col-gap8">
            {orgVerifications.length === 0 && <div className="u-fs-12 u-t8">{tr("Aucune vérification récente.")}</div>}
            {orgVerifications.slice(0, 3).map((v) => {
              const meta = QR_VERDICT_META[v.verdict];
              const color = v.verdict === 'authentic' ? 'var(--color-green)' : v.verdict === 'suspicious' ? 'var(--color-amber)' : 'var(--color-red)';
              return (
                <div className="card u-t132" key={v.lot + v.time}>
                  <Icon name={meta.icon} style={{ color, fontSize: '16px', flexShrink: 0 }} />
                  <div className="u-flex-1 u-t31">
                    <div className="u-fs12-500">{v.product}</div>
                    <div className="table-sub u-mono">{v.lot} · {v.time}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <h2 className="section-title"><Icon name="chart-line" className="u-c-cyan" />{tr("Vérifications de lots — 14 derniers jours")}</h2>
        </div>
        {orgVerifications.length === 0 ? (
          <div className="u-fs-12 u-t102">{tr("Aucune vérification de lot pour le moment.")}</div>
        ) : (
          <div className="chart-wrapper" style={{ height: '160px' }}>
            <ChartCanvas
              configFactory={pharmVerifTrendChartConfig}
              height={160}
              ariaLabel="Graphique en ligne montrant le nombre de vérifications de lots par jour sur les 14 derniers jours"
            />
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-header">
          <h2 className="section-title"><Icon name="building-store" className="u-c-brand" />{tr("Mes officines")}</h2>
          <button className="btn" onClick={() => onNavigate('pharm-stock')}>{tr("Stock intelligent")}</button>
        </div>
        <div className="u-fs-12 u-t102">
          {orgBranches.length > 0 ? tr("{0} — {1} agence{2}. Sélectionnez une agence pour filtrer ses alertes de stock.", [officineName, orgBranches.length, orgBranches.length > 1 ? 's' : '']) : tr("Aucune agence/officine configurée pour {0} pour le moment.", [officineName])}
        </div>
        <div className="grid-kpi">
          {orgBranches.map((b) => {
            const n = pharmStockList(orgProducts, b).length;
            return (
              <div
                className="kpi-card u-pointer"
                role="button"
                tabIndex={0}
                key={b}
                onClick={() => goToBranch(b)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') goToBranch(b); }}
              >
                <div className="kpi-accent u-t52" />
                <div className="kpi-header"><div className="kpi-label">{officineName} — {b}</div><div className="kpi-icon u-t10"><Icon name="building-store" /></div></div>
                <div className="kpi-value" style={{ color: n ? 'var(--color-amber)' : 'var(--color-green)' }}>{n}</div>
                <div className="kpi-sub">{n ? tr("alerte(s) de stock active(s)") : tr("aucune alerte — stock sous contrôle")}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
