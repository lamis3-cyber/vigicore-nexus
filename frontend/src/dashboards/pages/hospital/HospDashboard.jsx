import { todayDdMmYyyy } from '../../lib/today';
import Icon from '../../components/Icon';
import { DR_DECLARATIONS, DR_ALERTS, PHARM_RECALLS, HOSP_DEPARTMENTS, HOSP_WORKFLOW_STEPS, hospDeptCount, isAlertAckedForUser, isRecallReturnedForUser } from '../../data/doctorVigilance';
import { useAuth } from '../../context/AuthContext';
import { isOrgScopedRecordVisible } from '../../config/organizations';

import { todayLongFr } from '../../lib/today';
import { tr } from '../../../i18n/translate.js';
// ═══════════════════════════════════════════════════════════════
// Converted from #view-hosp-dashboard (hospital scope), 1:1 with the
// original's renderHospDashboard() / renderHospWorkflow().
//
// Notes on fidelity:
//  - "Aujourd'hui" is hardcoded to '29/06/2026' in the original
//    (renderHospDashboard's `const today = '29/06/2026'`) — reproduced
//    literally rather than using the real current date.
//  - "Département le plus actif" sorts HOSP_DEPARTMENTS by
//    hospDeptCount() descending and takes [0], same as the original.
//  - AI summary panel is a rules-based static composition from the
//    same KPI numbers (critical/recalled/topDept), not a real model —
//    matches the original's own "(Synthèse à règles...)" disclaimer.
// ═══════════════════════════════════════════════════════════════

const TODAY = todayDdMmYyyy(); // date réelle (au chargement de la page)

export default function HospDashboard({ onNavigate, onOpenDeclareWizard }) {
  // Blocker 1 fix — every KPI on this dashboard must reflect CHU
  // Alger's own declarations only (see organizations.js's
  // isOrgScopedRecordVisible). DR_ALERTS/PHARM_RECALLS stay global —
  // see Blocker 4 decision in the final report.
  //
  // Step 6 fix — was getCurrentAuthUser() (a module-level mirror
  // synced via a post-commit useEffect in AuthContext), which still
  // held the previous session's value on the very first paint right
  // after login — every KPI here computed as if the account had no
  // organization until an unrelated re-render happened to refresh it.
  // useAuth() is reactive, so it's correct immediately. See
  // AuthContext.jsx's getCurrentAuthUser() header: it's scaffolding
  // for non-component modules, not components.
  const { user } = useAuth();
  const scoped = DR_DECLARATIONS.filter((d) => isOrgScopedRecordVisible(d, user));
  const declaredToday = scoped.filter((d) => d.date === TODAY).length;
  const inProgress = scoped.filter((d) => ['draft', 'review', 'analysis'].includes(d.status)).length;
  const critical = scoped.filter((d) => d.severity === 'grave').length;
  const deadlinesClose = scoped.filter((d) => d.severity === 'grave' && !['closed', 'sent'].includes(d.status)).length;
  const recalled = PHARM_RECALLS.filter((r) => !isRecallReturnedForUser(r, user)).length;
  const pendingValidation = scoped.filter((d) => d.status === 'review').length;

  const deptRows = HOSP_DEPARTMENTS.map((d) => ({ ...d, count: hospDeptCount(d.name, scoped) })).sort((a, b) => b.count - a.count);
  const topDept = deptRows[0];
  const maxDept = Math.max(1, ...deptRows.map((r) => r.count));

  const activeAlerts = DR_ALERTS.filter((a) => !isAlertAckedForUser(a, user)).slice(0, 3);

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Tableau de bord")} <span className="page-title-accent">{tr("institutionnel")}</span></h1></div>
        <div className="page-actions">
          <button className="btn" onClick={() => onNavigate('hosp-personnel')}><Icon name="users-group" />{tr("Personnel")}</button>
          <button className="btn" onClick={() => onNavigate('hosp-declarations')}><Icon name="clipboard-list" />{tr("Déclarations")}</button>
          <button className="btn btn--primary" onClick={onOpenDeclareWizard}><Icon name="clipboard-plus" />{tr("Déclarer un incident")}</button>
        </div>
      </div>

      <div className="ai-insight-card">
        <div className="ai-badge"><Icon name="sparkles" /></div>
        <div className="u-flex-1">
          <div className="ai-insight-title">{tr("Résumé Hospital AI Assistant — {0}", [todayLongFr()])}</div>
          <div className="ai-insight-text u-t17">
            <div className="u-t41">
              {critical > 0 && (
                <div className="u-flex-start-gap7"><span className="u-t25">{tr("⚠ URGENT")}</span><span><strong>{critical}</strong> {tr("cas critique(s) actif(s) — délai réglementaire de transmission CNPM à surveiller de près.")}</span></div>
              )}
              {recalled > 0 && (
                <div className="u-flex-start-gap7"><span className="u-t23">{tr("● Action")}</span><span><strong>{recalled}</strong> {tr("produit(s) rappelé(s) encore présents dans l'établissement — retrait à organiser avec la pharmacie hospitalière.")}</span></div>
              )}
              {topDept && topDept.count > 0 ? (
                <div className="u-flex-start-gap7"><span className="u-t24">{tr("● Suivi")}</span><span>{tr("{0} concentre le plus d'incidents cette période — analyse de tendance disponible dans l'assistant IA.", [topDept.name])}</span></div>
              ) : (
                <div className="u-flex-start-gap7"><span className="u-ai-quiet">{tr("✓ À jour")}</span><span>{tr("Aucun incident déclaré dans l'établissement pour le moment.")}</span></div>
              )}
            </div>
          </div>
          <div className="ai-disclaimer">{tr("Synthèse générée à partir des dossiers VigiCore de l'établissement. Décret exécutif n° 92-276.")} <span className="u-t22">{tr("(Synthèse à règles dans cette version de démonstration.)")}</span></div>
        </div>
        <button className={`btn${critical > 0 ? ' btn--danger' : ''} u-t33`} onClick={() => onNavigate('hosp-alertes')}><Icon name="alert-triangle" />{tr("Voir les alertes")}</button>
      </div>

      <div className="grid-kpi">
        <div className="kpi-card"><div className="kpi-accent u-t52" /><div className="kpi-header"><div className="kpi-label">{tr("Incidents déclarés aujourd'hui")}</div><div className="kpi-icon u-t10"><Icon name="clipboard-plus" /></div></div><div className="kpi-value">{declaredToday}</div><div className="kpi-sub">{tr("nouvelles déclarations")}</div></div>
        <div className="kpi-card"><div className="kpi-accent u-t53" /><div className="kpi-header"><div className="kpi-label">{tr("Incidents en cours")}</div><div className="kpi-icon u-t55"><Icon name="loader-2" /></div></div><div className="kpi-value u-c-cyan">{inProgress}</div><div className="kpi-sub">{tr("brouillon, en attente ou en analyse")}</div></div>
        <div className="kpi-card"><div className="kpi-accent u-t14" /><div className="kpi-header"><div className="kpi-label">{tr("Cas critiques")}</div><div className="kpi-icon u-t4"><Icon name="alert-octagon" /></div></div><div className="kpi-value u-c-red">{critical}</div><div className="kpi-sub">{tr("gravité grave")}</div></div>
        <div className="kpi-card"><div className="kpi-accent u-t12" /><div className="kpi-header"><div className="kpi-label">{tr("Délais réglementaires proches")}</div><div className="kpi-icon u-t18"><Icon name="clock-exclamation" /></div></div><div className="kpi-value u-c-amber">{deadlinesClose}</div><div className="kpi-sub">{tr("à transmettre sous 48h — cas graves")}</div></div>
        <div className="kpi-card"><div className="kpi-accent u-t14" /><div className="kpi-header"><div className="kpi-label">{tr("Produits rappelés")}</div><div className="kpi-icon u-t4"><Icon name="ban" /></div></div><div className="kpi-value u-c-red">{recalled}</div><div className="kpi-sub">{tr("recall(s) actif(s) — tout l'établissement")}</div></div>
        <div className="kpi-card"><div className="kpi-accent" style={{ background: 'linear-gradient(90deg,var(--color-blue),#2f8fd1)' }} /><div className="kpi-header"><div className="kpi-label">{tr("Département le plus actif")}</div><div className="kpi-icon" style={{ background: 'rgba(59,130,246,.12)', color: 'var(--color-blue)' }}><Icon name="building-hospital" /></div></div><div className="kpi-value u-t120">{topDept ? tr(topDept.name) : '—'}</div><div className="kpi-sub">{tr("{0} incident(s)", [topDept ? topDept.count : 0])}</div></div>
        <div className="kpi-card"><div className="kpi-accent" style={{ background: 'linear-gradient(90deg,var(--color-purple),#a78bfa)' }} /><div className="kpi-header"><div className="kpi-label">{tr("En attente de validation")}</div><div className="kpi-icon" style={{ background: 'rgba(109,80,196,.12)', color: 'var(--color-purple)' }}><Icon name="list-check" /></div></div><div className="kpi-value u-c-purple">{pendingValidation}</div><div className="kpi-sub">{tr("déclarations à valider")}</div></div>
      </div>

      <div className="card">
        <div className="section-header">
          <h2 className="section-title"><Icon name="route" className="u-c-blue" />{tr("Circuit de vigilance VigiCore")}</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'space-between', padding: '8px 0' }}>
          {HOSP_WORKFLOW_STEPS.map((s, i) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 auto', minWidth: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: '88px' }}>
                <div className="kpi-icon" style={{ background: 'var(--color-brand-dim)', color: 'var(--color-brand)', width: '40px', height: '40px', fontSize: '17px' }}><Icon name={s.icon} /></div>
                <div className="u-fs10-5-tertiary" style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{tr(s.label)}</div>
              </div>
              {i < HOSP_WORKFLOW_STEPS.length - 1 && <Icon name="arrow-right" style={{ color: 'var(--text-tertiary)', fontSize: '16px', flexShrink: 0 }} />}
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2-1">
        <div className="card">
          <div className="section-header">
            <h2 className="section-title"><Icon name="building-hospital" className="u-c-blue" />{tr("Départements les plus actifs")}</h2>
            <button className="btn" onClick={() => onNavigate('hosp-declarations')}>{tr("Tout voir")}</button>
          </div>
          <div className="u-col-gap10">
            {deptRows.map((d) => (
              <div className="u-t26" key={d.id}>
                <div className="kpi-icon" style={{ background: 'var(--surface-3)', color: 'var(--color-blue)', width: '32px', height: '32px', fontSize: '14px', flexShrink: 0 }}><Icon name={d.icon} /></div>
                <div className="u-flex-1 u-t31">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '3px' }}><span className="u-fs12-500">{tr(d.name)}</span><span className="u-fs10-5-tertiary">{tr("{0} incident(s)", [d.count])}</span></div>
                  <div className="lab-status-track"><div className="lab-status-fill" style={{ width: `${Math.round((d.count / maxDept) * 100)}%`, background: 'var(--color-blue)' }} /></div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="u-col-gap12">
          <div className="u-label-caps">{tr("Alertes & recalls récents")}</div>
          <div className="u-col-gap8">
            {activeAlerts.length === 0 && <div className="u-fs-12 u-t36">{tr("Aucune alerte active.")}</div>}
            {activeAlerts.map((a) => {
              const bannerType = a.level === 'red' ? 'red' : a.level === 'amber' ? 'amber' : 'cyan';
              const iconName = a.level === 'red' ? 'rotate-clockwise' : a.level === 'amber' ? 'alert-triangle' : 'info-circle';
              return (
                <div className={`alert-banner alert-banner--${bannerType}`} role="alert" key={a.id} data-domain={a.domain}>
                  <Icon name={iconName} />
                  <div className="u-flex-1">
                    <div className="alert-banner-title">{tr(a.title)}</div>
                    <div className="alert-banner-text">{tr(a.text)}<br /><span className="u-fs10-tertiary">{tr("Réf. {0} · {1}", [a.ref, a.date])}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
