import Icon from '../../components/Icon';
import { useToast } from '../../context/ToastContext';
import { DR_DECLARATIONS, PHARM_RECALLS, isRecallReturnedForUser } from '../../data/doctorVigilance';
import { getCurrentAuthUser } from '../../context/AuthContext';
import { isOrgScopedRecordVisible } from '../../config/organizations';
import { tr } from '../../../i18n/translate.js';

// Converted from #view-cm-rapports, 1:1 with the original's
// renderCmRapports().
export default function CmRapports() {
  const toast = useToast();
  // Blocker fix (audit round 3) — same org-scoping rule as every
  // other declarations-derived view.
  const scoped = DR_DECLARATIONS.filter((d) => isOrgScopedRecordVisible(d, getCurrentAuthUser()));
  const recalls = PHARM_RECALLS.filter((r) => !isRecallReturnedForUser(r, getCurrentAuthUser())).length;

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Rapports")} <span className="page-title-accent">{tr("simples")}</span></h1></div>
      </div>
      <div className="grid-kpi">
        <div className="kpi-card"><div className="kpi-header"><div className="kpi-label">{tr("Déclarations")}</div><div className="kpi-icon u-t10"><Icon name="clipboard-list" /></div></div><div className="kpi-value">{scoped.length}</div><div className="kpi-sub">{tr("total enregistré")}</div></div>
        <div className="kpi-card"><div className="kpi-header"><div className="kpi-label">{tr("Recalls")}</div><div className="kpi-icon u-t4"><Icon name="ban" /></div></div><div className="kpi-value u-c-red">{recalls}</div><div className="kpi-sub">{tr("actifs")}</div></div>
      </div>
      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="file-report" className="u-c-amber" />{tr("Export")}</h2></div>
        <div className="u-t109">
          <button className="btn" onClick={() => toast('info', tr("Export PDF"), tr("Génération du rapport centre médical PDF…"), 'ti ti-file-text')}><Icon name="file-text" />{tr("Rapport PDF")}</button>
          <button className="btn" onClick={() => toast('info', tr("Export Excel"), tr("Génération du rapport centre médical Excel…"), 'ti ti-file-spreadsheet')}><Icon name="file-spreadsheet" />{tr("Rapport Excel")}</button>
        </div>
      </div>
    </div>
  );
}
