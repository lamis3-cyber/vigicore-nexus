import Icon from '../../components/Icon';
import { useToast } from '../../context/ToastContext';
import { DR_DECLARATIONS, DR_DOMAIN_CHIP, PHARM_RECALLS, isRecallReturnedForUser } from '../../data/doctorVigilance';
import { getCurrentAuthUser } from '../../context/AuthContext';
import { isOrgScopedRecordVisible } from '../../config/organizations';
import { tr } from '../../../i18n/translate.js';

// Converted from #view-hosp-rapports, 1:1 with the original's
// renderHospRapports().
export default function HospRapports() {
  const toast = useToast();
  // Blocker fix (audit round 3) — every KPI/count/chart on this page
  // must be computed from CHU Alger's own declarations only, same
  // rule as every other declarations-derived view in the app.
  const scoped = DR_DECLARATIONS.filter((d) => isOrgScopedRecordVisible(d, getCurrentAuthUser()));
  const activeRecalls = PHARM_RECALLS.filter((r) => !isRecallReturnedForUser(r, getCurrentAuthUser())).length;
  const transmitted = scoped.filter((d) => d.status === 'sent' || d.status === 'closed').length;

  const byDomain = {};
  scoped.forEach((d) => { byDomain[d.domain] = (byDomain[d.domain] || 0) + 1; });

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Rapports")}</h1></div>
      </div>
      <div className="grid-kpi">
        <div className="kpi-card"><div className="kpi-header"><div className="kpi-label">{tr("Déclarations totales")}</div><div className="kpi-icon u-t10"><Icon name="clipboard-list" /></div></div><div className="kpi-value">{scoped.length}</div><div className="kpi-sub">{tr("tous services · toutes périodes")}</div></div>
        <div className="kpi-card"><div className="kpi-header"><div className="kpi-label">{tr("Transmises à l'ANPP")}</div><div className="kpi-icon u-t96"><Icon name="send" /></div></div><div className="kpi-value u-c-green">{transmitted}</div><div className="kpi-sub">{tr("dossiers clôturés ou envoyés")}</div></div>
        <div className="kpi-card"><div className="kpi-header"><div className="kpi-label">{tr("Recalls actifs")}</div><div className="kpi-icon u-t4"><Icon name="ban" /></div></div><div className="kpi-value u-c-red">{activeRecalls}</div><div className="kpi-sub">{tr("à retourner")}</div></div>
      </div>
      <div className="grid-2-1">
        <div className="card">
          <div className="section-header"><h2 className="section-title"><Icon name="file-report" className="u-c-amber" />{tr("Rapports disponibles")}</h2></div>
          <div className="u-col-gap10">
            <div className="card u-t89">
              <Icon name="calendar-stats" style={{ fontSize: '20px', color: 'var(--color-cyan)' }} />
              <div className="u-flex-1"><div className="u-fs12-500">{tr("Rapport mensuel — Juin 2026")}</div><div className="table-sub">{tr("Toutes vigilances · Tous services")}</div></div>
              <button className="btn" onClick={() => toast('info', tr("Export PDF"), tr("Génération du rapport mensuel PDF…"), 'ti ti-file-text')}><Icon name="file-text" />{tr("PDF")}</button>
              <button className="btn" onClick={() => toast('info', tr("Export Excel"), tr("Génération du rapport mensuel Excel…"), 'ti ti-file-spreadsheet')}><Icon name="file-spreadsheet" />{tr("Excel")}</button>
            </div>
            <div className="card u-t89">
              <Icon name="building-bank" style={{ fontSize: '20px', color: 'var(--color-purple)' }} />
              <div className="u-flex-1"><div className="u-fs12-500">{tr("Rapport réglementaire CNPM")}</div><div className="table-sub">{tr("Déclarations transmises · 2e trimestre 2026")}</div></div>
              <button className="btn" onClick={() => toast('info', tr("Export PDF"), tr("Génération du rapport ANPP PDF…"), 'ti ti-file-text')}><Icon name="file-text" />{tr("PDF")}</button>
            </div>
            <div className="card u-t89">
              <Icon name="chart-histogram" style={{ fontSize: '20px', color: 'var(--color-green)' }} />
              <div className="u-flex-1"><div className="u-fs12-500">{tr("Statistiques par service")}</div><div className="table-sub">{tr("Répartition des incidents · Année en cours")}</div></div>
              <button className="btn" onClick={() => toast('info', tr("Export Excel"), tr("Génération des statistiques Excel…"), 'ti ti-file-spreadsheet')}><Icon name="file-spreadsheet" />{tr("Excel")}</button>
            </div>
          </div>
        </div>
        <div className="u-col-gap12">
          <div className="u-label-caps">{tr("Répartition par domaine")}</div>
          <div className="u-col-gap8">
            {Object.keys(byDomain).length === 0 && (
              <div className="inbox-empty"><Icon name="chart-histogram" />{tr("Aucune donnée pour le moment.")}</div>
            )}
            {Object.keys(byDomain).map((dom) => (
              <div className="card u-t132" key={dom}>
                <span className={`chip chip--${DR_DOMAIN_CHIP[dom] || 'cyan'}`}>{dom}</span>
                <span className="u-flex-1" />
                <span className="u-fs12-500">{byDomain[dom]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
