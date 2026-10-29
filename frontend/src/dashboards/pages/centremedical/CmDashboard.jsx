import Icon from '../../components/Icon';
import { DR_DECLARATIONS, DR_STATUS_BADGE, DR_ALERTS, DR_DOMAIN_CHIP, PHARM_RECALLS, isAlertAckedForUser, isRecallReturnedForUser } from '../../data/doctorVigilance';
import { useAuth } from '../../context/AuthContext';
import { isOrgScopedRecordVisible } from '../../config/organizations';
import { tr } from '../../../i18n/translate.js';

// Converted from #view-cm-dashboard, 1:1 with the original's
// renderCmDashboard() (simplified institutional dashboard, same
// shape as Clinique's but amber/orange accent instead of teal/cyan).
export default function CmDashboard({ onNavigate, onOpenDeclareWizard }) {
  // Blocker 1 fix — org scoping (see organizations.js's
  // isOrgScopedRecordVisible). PHARM_RECALLS/DR_ALERTS stay global —
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
  const pending = scoped.filter((d) => d.status === 'review').length;
  const recalls = PHARM_RECALLS.filter((r) => !isRecallReturnedForUser(r, user)).length;
  const recentDecl = scoped.slice(0, 3);
  const activeAlerts = DR_ALERTS.filter((a) => !isAlertAckedForUser(a, user)).slice(0, 3);

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Activité")} <span className="page-title-accent">{tr("quotidienne")}</span></h1></div>
        <div className="page-actions"><button className="btn btn--primary" onClick={onOpenDeclareWizard}><Icon name="clipboard-plus" />{tr("Nouvelle déclaration")}</button></div>
      </div>

      <div className="grid-kpi">
        <div className="kpi-card"><div className="kpi-accent" style={{ background: 'linear-gradient(90deg,var(--color-amber),#fb923c)' }} /><div className="kpi-header"><div className="kpi-label">{tr("Incidents du centre médical")}</div><div className="kpi-icon u-t18"><Icon name="clipboard-list" /></div></div><div className="kpi-value">{scoped.length}</div><div className="kpi-sub">{tr("déclarations enregistrées")}</div></div>
        <div className="kpi-card"><div className="kpi-accent u-t12" /><div className="kpi-header"><div className="kpi-label">{tr("En attente")}</div><div className="kpi-icon u-t18"><Icon name="clock" /></div></div><div className="kpi-value u-c-amber">{pending}</div><div className="kpi-sub">{tr("à valider")}</div></div>
        <div className="kpi-card"><div className="kpi-accent u-t14" /><div className="kpi-header"><div className="kpi-label">{tr("Recalls actifs")}</div><div className="kpi-icon u-t4"><Icon name="ban" /></div></div><div className="kpi-value u-c-red">{recalls}</div><div className="kpi-sub">{tr("produits utilisés concernés")}</div></div>
      </div>

      <div className="grid-2-1">
        <div className="card">
          <div className="section-header">
            <h2 className="section-title"><Icon name="clipboard-list" className="u-c-cyan" />{tr("Incidents du centre médical")}</h2>
            <button className="btn" onClick={() => onNavigate('cm-declarations')}>{tr("Tout voir")}</button>
          </div>
          <div className="u-col-gap10">
            {recentDecl.length === 0 && <div className="u-fs-12 u-t8">{tr("Aucun incident déclaré pour le moment.")}</div>}
            {recentDecl.map((d) => {
              const [statClass, statLabel] = DR_STATUS_BADGE[d.status];
              return (
                <div className="card u-t87" key={d.id}>
                  <div className="u-t73"><span className="u-fs12-500">{d.ref}</span><span className={`badge badge--${statClass}`}>{statLabel}</span></div>
                  <div className="table-sub">{d.product}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="u-col-gap12">
          <div className="u-label-caps">{tr("Alertes & recalls")}</div>
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
                    <div className="alert-banner-text">{tr(a.text)}<br /><span className="u-fs10-tertiary">{tr("Réf.")} {a.ref} · {a.date} · <span className={`chip chip--${DR_DOMAIN_CHIP[a.domain]} u-t17`}>{tr(a.domain)}</span></span></div>
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
