import Icon from '../../components/Icon';
import ChartCanvas from '../../components/ChartCanvas';
import { docDeclTrendChartConfig } from '../../charts/chartConfigs';
import {
  DR_DECLARATIONS,
  DR_PATIENTS,
  DR_ALERTS,
  DR_DOMAIN_CHIP,
  DR_STATUS_BADGE,
  DR_SEVERITY_CLASS,
  isAlertAckedForUser,
} from '../../data/doctorVigilance';
import { useAuth } from '../../context/AuthContext';
import { isOrgScopedRecordVisible } from '../../config/organizations';

import { todayLongFr } from '../../lib/today';
import { tr } from '../../../i18n/translate.js';
// Converted from #view-doc-dashboard (doctor scope), 1:1 with the
// original's renderDrDashboard() (top declarations + active-alerts
// panel).
//
// Notes on fidelity:
//  - declarationRowHTML(d, compact=true) / alertCardHTML(a, compact=true)
//    are reproduced inline here (compact mode: no ref/domain column,
//    no "Acquitter" button) — same slice(0,4)/slice(0,3) limits as the
//    original's renderDrDashboard().
//  - Row/card actions ("Examiner"/"Voir dossier", "Acquitter") open the
//    full record in their respective pages (doc-declarations /
//    doc-alertes) rather than re-opening the detail drawer a second
//    time here — those pages already own that drawer logic 1:1 from
//    the original; this avoids duplicating ~150 lines of drawer JSX
//    for what was, in the source, the exact same openDrawer() call.
//  - "Vérifier un lot" now navigates to the full-page DoctorVerification
//    (doc-verification), styled like the original's Pharmacien/Labo/
//    Hôpital "Vérifier un lot" pages, per explicit request — see that
//    file for the QR_LOT_DB/QR_VERDICT_META verdict logic, which used
//    to live in a drawer here.

export default function DoctorDashboard({ onNavigate, onOpenDeclareWizard }) {
  // Blocker 1/2 fix — org scoping (see organizations.js's
  // isOrgScopedRecordVisible). DR_ALERTS stays global — see Blocker 4
  // decision in the final report.
  //
  // Step 6 fix — was getCurrentAuthUser() (a module-level mirror
  // synced via a post-commit useEffect in AuthContext), which still
  // held the previous session's value on the very first paint right
  // after login (null on first login) — blank greeting and org-scoped
  // KPIs computed with no organization until an unrelated re-render
  // happened to refresh it. useAuth() is reactive, so it's correct
  // immediately. See AuthContext.jsx's getCurrentAuthUser() header:
  // it's scaffolding for non-component modules, not components.
  const { user } = useAuth();
  const scopedDecl = DR_DECLARATIONS.filter((d) => isOrgScopedRecordVisible(d, user));
  const scopedPatients = DR_PATIENTS.filter((p) => isOrgScopedRecordVisible(p, user));
  // À traiter d'abord (à valider / en analyse), puis les plus récentes : une déclaration déjà transmise doit rester visible.
  const urgentFirst = (d) => (d.status === 'review' || d.status === 'analysis' ? 0 : 1);
  const topDeclarations = [...scopedDecl].sort((a, b) => urgentFirst(a) - urgentFirst(b)).slice(0, 4);
  const activeAlerts = DR_ALERTS.filter((a) => !isAlertAckedForUser(a, user)).slice(0, 3);
  const pendingCount = scopedDecl.filter((d) => d.status === 'review').length;
  const graveCount = scopedDecl.filter((d) => d.status === 'review' && d.severity === 'grave').length;
  const alertsCount = DR_ALERTS.filter((a) => !isAlertAckedForUser(a, user)).length;

  // Step 12 fix — the 3 insight lines below used to be a fixed block of
  // text (a specific patient/product/lab scenario) shown to every
  // doctor regardless of their actual org-scoped data, so it kept
  // claiming things ("3 déclarations…", a named patient) that didn't
  // match the real KPIs right below it for any org other than the
  // original demo scenario — most visibly wrong once an org's data was
  // genuinely empty. Now derived from the same scoped variables as the
  // KPI cards, with an honest "nothing pending" fallback, same pattern
  // already used by HospDashboard.
  const gravePatientDecl = scopedDecl.find((d) => d.status === 'review' && d.severity === 'grave');
  const gravePatientName = gravePatientDecl
    ? (scopedPatients.find((p) => p.id === gravePatientDecl.patientId)?.name || gravePatientDecl.manualPatientName)
    : null;
  const topAlert = activeAlerts[0];

  return (
    <div className="view is-active">
  <div className="page-header">
    <div>
      <h1 className="page-title">{tr("Bonjour,")} <span className="page-title-accent">{user?.name}</span></h1>
    </div>
    <div className="page-actions">
      <button className="btn" onClick={() => onNavigate("doc-patients")}><Icon name="users"/>{tr("Mes patients")}</button>
      <button className="btn" onClick={() => onNavigate("doc-verification")}><Icon name="scan"/>{tr("Vérifier un lot")}</button>
      <button className="btn" onClick={() => onNavigate("doc-documentation")}><Icon name="books"/>{tr("Documentation")}</button>
      <button className="btn btn--primary" onClick={onOpenDeclareWizard}><Icon name="clipboard-plus"/>{tr("Nouvelle déclaration")}</button>
    </div>
  </div>

  <div className="ai-insight-card">
    <div className="ai-badge"><Icon name="sparkles"/></div>
    <div className="u-flex-1">
      <div className="ai-insight-title">{tr("Résumé VigiCore AI — Praticien · {0}", [todayLongFr()])}</div>
      <div className="ai-insight-text u-t28">
        {pendingCount > 0 ? (
          <div className="u-flex-start-gap7"><span className="u-t25">{tr("⚠ URGENT")}</span><span><strong>{tr("{0} déclaration{1}", [pendingCount, pendingCount > 1 ? 's' : ''])}</strong> {pendingCount > 1 ? tr("nécessitent") : tr("nécessite")} {tr("votre validation avant transmission CNPM")}{graveCount > 0 ? tr(", dont {0} grave{1}", [graveCount, graveCount > 1 ? 's' : '']) : ''}{gravePatientDecl ? ` (${gravePatientDecl.product} — ${gravePatientName || 'patient suivi'})` : ''}.</span></div>
        ) : (
          <div className="u-flex-start-gap7"><span className="u-ai-quiet">{tr("✓ À jour")}</span><span>{tr("Aucune déclaration en attente de validation pour le moment.")}</span></div>
        )}
        {topAlert ? (
          <div className="u-flex-start-gap7"><span className="u-t23">{tr("● Action")}</span><span>{tr("{0} — vérifiez l'historique des patients concernés dans Alertes.", [topAlert.title])}</span></div>
        ) : (
          <div className="u-flex-start-gap7"><span className="u-ai-quiet">{tr("● Action")}</span><span>{tr("Aucune alerte vigilance active concernant vos patients.")}</span></div>
        )}
        <div className="u-flex-start-gap7"><span className="u-t24">{tr("● Suivi")}</span><span>{tr("{0} patient{1} suivi{2} dans votre portefeuille — consultez Mes patients pour le détail des dossiers.", [scopedPatients.length, scopedPatients.length > 1 ? 's' : '', scopedPatients.length > 1 ? 's' : ''])}</span></div>
      </div>
      <div className="ai-disclaimer">{tr("Synthèse générée à partir des dossiers VigiCore de vos patients suivis. Décret exécutif n° 92-276.")} <span className="u-t22">{tr("(Synthèse à règles dans cette version de démonstration.)")}</span></div>
    </div>
    <button className={`btn${pendingCount > 0 ? ' btn--danger' : ''} u-t33`} onClick={() => onNavigate("doc-declarations")}><Icon name="alert-triangle"/>{tr("Voir à valider")}</button>
  </div>

  <div className="grid-kpi">
    <div className="kpi-card">
      <div className="kpi-accent u-t12"></div>
      <div className="kpi-header"><div className="kpi-label">{tr("À valider")}</div><div className="kpi-icon u-t15"><Icon name="clipboard-check"/></div></div>
      <div className="kpi-value u-c-amber" id="kpiDrPending">{pendingCount}</div>
      <div className="kpi-sub">{tr("dont")} <span className="up" style={{color: "var(--color-red)"}}>{tr("{0} grave{1}", [graveCount, graveCount > 1 ? 's' : ''])}</span> {tr("· délai légal 15j")}</div>
    </div>
    <div className="kpi-card">
      <div className="kpi-accent u-t52"></div>
      <div className="kpi-header"><div className="kpi-label">{tr("Patients suivis")}</div><div className="kpi-icon u-t10"><Icon name="users"/></div></div>
      <div className="kpi-value" id="kpiDrPatients">{scopedPatients.length}</div>
      <div className="kpi-sub">{scopedPatients.length === 0 ? tr("Aucun patient dans votre portefeuille") : tr("4 domaines de vigilance actifs")}</div>
    </div>
    <div className="kpi-card">
      <div className="kpi-accent u-t14"></div>
      <div className="kpi-header"><div className="kpi-label">{tr("Alertes actives")}</div><div className="kpi-icon u-t4"><Icon name="alert-triangle"/></div></div>
      <div className="kpi-value u-c-red" id="kpiDrAlerts">{alertsCount}</div>
      <div className="kpi-sub">{tr("rappels, alertes sécurité, dispositifs")}</div>
    </div>
    <div className="kpi-card">
      <div className="kpi-accent u-t54"></div>
      <div className="kpi-header"><div className="kpi-label">{tr("Mes déclarations")}</div><div className="kpi-icon u-bg-green-dim"><Icon name="clipboard-list"/></div></div>
      <div className="kpi-value u-c-cyan" id="kpiDrDeclTotal">{scopedDecl.length}</div>
      <div className="kpi-sub">{scopedDecl.length === 0 ? tr("Aucune déclaration pour le moment") : tr("{0} transmise(s) · {1} brouillon(s)", [scopedDecl.filter((d) => d.status === 'sent').length, scopedDecl.filter((d) => d.status === 'draft').length])}</div>
    </div>
  </div>

  <div className="grid-2-1">
    <div className="card">
      <div className="section-header">
        <h2 className="section-title"><Icon name="clipboard-plus" className="u-c-amber"/>{tr("Déclarations récentes")}</h2>
        <button className="btn" onClick={() => onNavigate("doc-declarations")}>{tr("Tout voir")}</button>
      </div>
      <div className="u-overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>{tr("PATIENT")}</th><th>{tr("DOMAINE / PRODUIT")}</th><th>{tr("GRAVITÉ")}</th><th>{tr("STATUT")}</th><th>{tr("ACTIONS")}</th></tr></thead>
          <tbody>
            {topDeclarations.length === 0 && (
              <tr><td colSpan={5}><div className="inbox-empty"><Icon name="clipboard-check" />{tr("Aucune déclaration pour le moment.")}</div></td></tr>
            )}
            {topDeclarations.map((d) => {
              const patient = DR_PATIENTS.find((p) => p.id === d.patientId);
              const displayName = patient ? patient.name : (d.manualPatientName || '—');
              const displayInitials = patient
                ? patient.initials
                : d.manualPatientName
                  ? d.manualPatientName.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase()
                  : '?';
              const displayColor = patient ? patient.color : 'linear-gradient(135deg,#5a5a66,#7a7a86)';
              const [sevClass, sevLabel] = DR_SEVERITY_CLASS[d.severity];
              const [statClass, statLabel] = DR_STATUS_BADGE[d.status];
              return (
                <tr key={d.id} data-status={d.status} data-domain={d.domain}>
                  <td>
                    <div className="patient-row-name">
                      <div className="patient-mini-avatar" style={{ background: displayColor, width: '24px', height: '24px', fontSize: '9px' }}>{displayInitials}</div>
                      <div className="u-fs-12">{displayName}</div>
                    </div>
                  </td>
                  <td><span className={`chip chip--${DR_DOMAIN_CHIP[d.domain]}`} style={{ marginBottom: '3px' }}>{tr(d.domain)}</span><div className="table-sub">{d.product}</div></td>
                  <td><span className={`severity severity--${sevClass}`}>{sevLabel}</span></td>
                  <td><span className={`badge badge--${statClass}`}>{statLabel}</span></td>
                  <td>
                    {d.status === 'review' ? (
                      <div className="u-t69"><button className="tbl-action-btn tbl-action-btn--primary" onClick={() => onNavigate('doc-declarations')}>{tr("Examiner")}</button></div>
                    ) : (
                      <button className="tbl-action-btn" onClick={() => onNavigate('doc-declarations')}>{tr("Voir dossier")}</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    <div className="u-col-gap12">
      <div className="u-label-caps">{tr("Alertes vigilance actives")}</div>
      <div className="u-col-gap8">
        {activeAlerts.length === 0 && (
          <div className="u-fs-12 u-t8">{tr("Aucune alerte active pour le moment.")}</div>
        )}
        {activeAlerts.map((a) => {
          const bannerTone = a.level === 'red' ? 'red' : a.level === 'amber' ? 'amber' : 'cyan';
          const iconName = a.level === 'red' ? 'rotate-clockwise' : a.level === 'amber' ? 'alert-triangle' : 'info-circle';
          return (
            <div className={`alert-banner alert-banner--${bannerTone}`} role="alert" data-domain={a.domain} key={a.id}>
              <Icon name={iconName} />
              <div className="u-flex-1">
                <div className="alert-banner-title">{tr(a.title)}</div>
                <div className="alert-banner-text">
                  {tr(a.text)}
                  <br />
                  <span className="u-fs10-tertiary">{tr("Réf.")} {a.ref} · {a.date} · <span className={`chip chip--${DR_DOMAIN_CHIP[a.domain]} u-t17`}>{tr(a.domain)}</span></span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>

  <div className="card">
    <div className="section-header">
      <h2 className="section-title"><Icon name="chart-bar" className="u-c-cyan"/>{tr("Déclarations soumises — 6 derniers mois")}</h2>
    </div>
    <div className="chart-wrapper" style={{height: "180px"}}>
      <ChartCanvas
        configFactory={() => docDeclTrendChartConfig(scopedDecl)}
        height={180}
        ariaLabel="Graphique en barres montrant le nombre de déclarations soumises par mois sur les 6 derniers mois"
      />
    </div>
  </div>
    </div>
  );
}
