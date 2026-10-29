import Icon from '../../components/Icon';
import { DR_ALERTS, DR_DOMAIN_CHIP, PHARM_RECALLS, DR_STATUS_BADGE, isAlertAckedForUser, isRecallReturnedForUser } from '../../data/doctorVigilance';
import { LAB_DECLARATIONS, LAB_SURVEILLANCE } from '../../data/laboVigilance';
import { useAuth } from '../../context/AuthContext';
import { isOrgScopedRecordVisible } from '../../config/organizations';

import { todayLongFr } from '../../lib/today';
import { tr } from '../../../i18n/translate.js';
// ═══════════════════════════════════════════════════════════════
// Converted from #view-lab-dashboard (labo scope), 1:1 with the
// original's renderLabDashboard().
//
// Notes on fidelity:
//  - "Alertes actives" KPI = DR_ALERTS.filter(!ack).length +
//    PHARM_RECALLS.filter(!returned).length — a genuine cross-role
//    combined count (the lab dashboard surfaces both clinical alerts
//    and pharmacy recalls, exactly like the original).
//  - "Signalements récents" panel shows LAB_DECLARATIONS.slice(0,3)
//    (this lab's OWN declarations, not DR_DECLARATIONS).
//  - "Alertes & produits rappelés" panel combines the first 2
//    unacknowledged DR_ALERTS (compact, no Acquitter button) + the
//    first 1 active PHARM_RECALLS (compact, no Confirmer-le-retour
//    button) — same slice(0,2)/slice(0,1) + compact=true as the
//    original's alertCardHTML(a,true)/pharmRecallCardHTML(r,true).
// ═══════════════════════════════════════════════════════════════

export default function LabDashboard({ onNavigate }) {
  // Blocker fix (audit round 3) — same org-scoping rule already used
  // by LabDeclarations.jsx. DR_ALERTS/PHARM_RECALLS/LAB_SURVEILLANCE
  // stay unscoped — deliberately global regulatory data, unaffected.
  //
  // Step 6 fix — this page used getCurrentAuthUser() (a module-level
  // mirror synced via a post-commit useEffect in AuthContext) instead
  // of useAuth(). On the very first paint right after login the
  // mirror still held the previous session's value (null on first
  // login), so the greeting showed no name and the org-scoped KPIs
  // below were computed as if no organization was selected — until an
  // unrelated re-render happened to catch the mirror up. useAuth()
  // reads the same session user reactively, so it is correct
  // immediately. See getCurrentAuthUser()'s own header in
  // AuthContext.jsx: it's scaffolding for non-component modules that
  // can't call hooks (declarationService.js), not for components.
  const { user } = useAuth();
  const scopedDecl = LAB_DECLARATIONS.filter((d) => isOrgScopedRecordVisible(d, user));
  const pendingDecl = scopedDecl.filter((d) => d.status === 'review' || d.status === 'draft').length;
  const activeAlerts = DR_ALERTS.filter((a) => !isAlertAckedForUser(a, user)).length + PHARM_RECALLS.filter((r) => !isRecallReturnedForUser(r, user)).length;
  const surveilled = LAB_SURVEILLANCE.filter((s) => s.niveau === 'critique').length;
  const recalled = PHARM_RECALLS.filter((r) => !isRecallReturnedForUser(r, user)).length;

  const recentDecl = scopedDecl.slice(0, 3);
  const recentAlerts = DR_ALERTS.filter((a) => !isAlertAckedForUser(a, user)).slice(0, 2);
  const recentRecalls = PHARM_RECALLS.filter((r) => !isRecallReturnedForUser(r, user)).slice(0, 1);

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Bonjour,")} <span className="page-title-accent">{user?.name}</span></h1></div>
        <div className="page-actions">
          <button className="btn" onClick={() => onNavigate('lab-recherche')}><Icon name="scan" />{tr("Vérifier un produit")}</button>
          <button className="btn btn--primary" onClick={() => onNavigate('lab-declarer')}><Icon name="clipboard-plus" />{tr("Déclarer un incident")}</button>
        </div>
      </div>

      <div className="ai-insight-card">
        <div className="ai-badge"><Icon name="sparkles" /></div>
        <div className="u-flex-1">
          <div className="ai-insight-title">{tr("Résumé VigiCore AI — Laboratoire · {0}", [todayLongFr()])}</div>
          <div className="ai-insight-text u-t28">
            {surveilled > 0 ? (
              <div className="u-flex-start-gap7"><span className="u-t25">{tr("⚠ URGENT")}</span><span><strong>{tr("{0} produit{1}", [surveilled, surveilled > 1 ? 's' : ''])}</strong> {surveilled > 1 ? tr("sous surveillance critique nécessitent") : tr("sous surveillance critique nécessite")} {tr("une vérification — double contrôle recommandé.")}</span></div>
            ) : (
              <div className="u-flex-start-gap7"><span className="u-ai-quiet">{tr("✓ À jour")}</span><span>{tr("Aucun produit en surveillance critique pour le moment.")}</span></div>
            )}
            {pendingDecl > 0 ? (
              <div className="u-flex-start-gap7"><span className="u-t23">{tr("● Action")}</span><span><strong>{pendingDecl}</strong> {tr("déclaration")}{pendingDecl > 1 ? 's' : ''} {tr("en attente (brouillon ou informations demandées) — à consulter dans « Mes déclarations ».")}</span></div>
            ) : (
              <div className="u-flex-start-gap7"><span className="u-ai-quiet">{tr("● Action")}</span><span>{tr("Aucune déclaration en attente pour le moment.")}</span></div>
            )}
            {recalled > 0 ? (
              <div className="u-flex-start-gap7"><span className="u-t24">{tr("● Suivi")}</span><span><strong>{recalled}</strong> {tr("rappel")}{recalled > 1 ? 's' : ''} {tr("produit actif")}{recalled > 1 ? 's' : ''} {tr("— à traiter dans « Produits sous surveillance ».")}</span></div>
            ) : (
              <div className="u-flex-start-gap7"><span className="u-ai-quiet">{tr("● Suivi")}</span><span>{tr("Aucun rappel produit actif actuellement.")}</span></div>
            )}
          </div>
          <div className="ai-disclaimer">{tr("Synthèse générée à partir des signalements et alertes du laboratoire. Décret exécutif n° 92-276.")} <span className="u-t22">{tr("(Synthèse à règles dans cette version de démonstration.)")}</span></div>
        </div>
        <button className={`btn${surveilled > 0 ? ' btn--danger' : ''} u-t33`} onClick={() => onNavigate('lab-surveillance')}><Icon name="eye" />{tr("Voir la surveillance")}</button>
      </div>

      <div className="grid-kpi">
        <div className="kpi-card">
          <div className="kpi-accent" style={{ background: 'linear-gradient(90deg,var(--color-cyan),var(--color-brand))' }} />
          <div className="kpi-header"><div className="kpi-label">{tr("Signalements récents")}</div><div className="kpi-icon" style={{ background: 'rgba(0,212,232,.12)', color: 'var(--color-cyan)' }}><Icon name="clipboard-list" /></div></div>
          <div className="kpi-value u-c-cyan">{scopedDecl.length}</div>
          <div className="kpi-sub">{tr("déclarations au total")}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-accent" style={{ background: 'linear-gradient(90deg,var(--color-purple),#8b5cf6)' }} />
          <div className="kpi-header"><div className="kpi-label">{tr("Déclarations en attente")}</div><div className="kpi-icon" style={{ background: 'var(--color-purple-dim)', color: 'var(--color-purple)' }}><Icon name="folder" /></div></div>
          <div className="kpi-value">{pendingDecl}</div>
          <div className="kpi-sub">{tr("brouillons + informations demandées")}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-accent u-t12" />
          <div className="kpi-header"><div className="kpi-label">{tr("Produits sous surveillance")}</div><div className="kpi-icon u-t15"><Icon name="eye" /></div></div>
          <div className="kpi-value u-c-amber">{surveilled}</div>
          <div className="kpi-sub">{tr("niveau critique")}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-accent u-t14" />
          <div className="kpi-header"><div className="kpi-label">{tr("Alertes actives")}</div><div className="kpi-icon u-t4"><Icon name="alert-triangle" /></div></div>
          <div className="kpi-value u-c-red">{activeAlerts}</div>
          <div className="kpi-sub">{tr("{0} rappel(s) en cours", [recalled])}</div>
        </div>
      </div>

      <div className="grid-2-1">
        <div className="card">
          <div className="section-header">
            <h2 className="section-title"><Icon name="clipboard-list" className="u-c-cyan" />{tr("Signalements récents")}</h2>
            <button className="btn" onClick={() => onNavigate('lab-declarations')}>{tr("Tout voir")}</button>
          </div>
          <div className="u-col-gap10">
            {recentDecl.length === 0 && <div className="u-fs-12 u-t8">{tr("Aucun signalement enregistré.")}</div>}
            {recentDecl.map((d) => {
              const [statClass, statLabel] = DR_STATUS_BADGE[d.status];
              return (
                <div className="card u-t87" key={d.id}>
                  <div className="u-t73"><span className="u-fs12-500">{d.ref} — {d.product}</span><span className={`badge badge--${statClass}`}>{statLabel}</span></div>
                  <div className="table-sub">{tr("{0} · Lot {1}", [d.manufacturer, d.lot])}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="u-col-gap12">
          <div className="u-label-caps">{tr("Alertes & produits rappelés")}</div>
          <div className="u-col-gap8">
            {(recentAlerts.length === 0 && recentRecalls.length === 0) && (
              <div className="u-fs-12 u-t8">{tr("Aucune alerte active.")}</div>
            )}
            {recentAlerts.map((a) => {
              const bannerType = a.level === 'red' ? 'red' : a.level === 'amber' ? 'amber' : 'cyan';
              const iconName = a.level === 'red' ? 'rotate-clockwise' : a.level === 'amber' ? 'alert-triangle' : 'info-circle';
              return (
                <div className={`alert-banner alert-banner--${bannerType}`} role="alert" key={a.id} data-domain={a.domain}>
                  <Icon name={iconName} />
                  <div className="u-flex-1">
                    <div className="alert-banner-title">{tr(a.title)}</div>
                    <div className="alert-banner-text">{tr(a.text)}<br /><span className="u-fs10-tertiary">{tr("Réf.")} {a.ref} · {a.date} · <span className={`chip chip--${DR_DOMAIN_CHIP[a.domain]} u-t17`}>{tr(a.domain)}</span></span></div>
                  </div>
                </div>
              );
            })}
            {recentRecalls.map((r) => (
              <div className="alert-banner alert-banner--red" role="alert" key={r.id}>
                <Icon name="rotate-clockwise" />
                <div className="u-flex-1">
                  <div className="alert-banner-title">{r.product} — {r.lab}</div>
                  <div className="alert-banner-text">{tr(r.reason)}<br /><span className="u-fs10-tertiary">{tr("Réf.")} {r.ref} {tr("· Lot")} <span className="u-mono">{r.lot}</span> · {r.date}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
