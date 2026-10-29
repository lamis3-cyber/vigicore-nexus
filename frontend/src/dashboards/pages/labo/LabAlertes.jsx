import { useState } from 'react';
import Icon from '../../components/Icon';
import EmptyState from '../../components/EmptyState';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { DR_ALERTS, DR_DOMAIN_CHIP, PHARM_RECALLS, logAudit, isAlertAckedForUser, alertAckMetaForUser, ackAlertForUser, isRecallReturnedForUser, returnRecallForUser } from '../../data/doctorVigilance';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Converted from #view-lab-alertes (labo scope), 1:1 with the
// original's renderLabAlerts() — a straight concatenation of
// alertCardHTML(a, compact=false) for every DR_ALERTS entry (no
// domain filter here, unlike Doctor's own Alertes page — the source
// markup has no filter-tabs element for #labAlertsList) followed by
// pharmRecallCardHTML(r, compact=false) for every un-returned
// PHARM_RECALLS entry.
//
// Notes on fidelity:
//  - Both "Acquitter" (for alerts) and "Confirmer le retour" (for
//    recalls) are live here, exactly like the source — Labo can
//    acknowledge clinical alerts and confirm pharmacy recall returns
//    from this single page, mutating the same shared DR_ALERTS /
//    PHARM_RECALLS arrays every other role reads.
// ═══════════════════════════════════════════════════════════════

const LEVEL_META = {
  red: { banner: 'red', icon: 'rotate-clockwise' },
  amber: { banner: 'amber', icon: 'alert-triangle' },
  cyan: { banner: 'cyan', icon: 'info-circle' },
};

export default function LabAlertes() {
  const toast = useToast();
  const { user } = useAuth();
  const [, forceTick] = useState(0);
  const rerender = () => forceTick((n) => n + 1);

  function acknowledgeAlert(id) {
    const a = DR_ALERTS.find((x) => x.id === id);
    if (!a) return;
    ackAlertForUser(a, user);
    logAudit('alert', a.id, `Alerte ${a.ref} (lot ${a.lot}) acquittée`, user?.name, user?.organizationId ?? null);
    rerender();
    toast('success', tr("Alerte acquittée"), a.ref + ' marquée comme traitée', 'ti ti-circle-check');
  }

  function confirmRecallReturn(id) {
    const r = PHARM_RECALLS.find((x) => x.id === id);
    if (!r) return;
    const stamp = returnRecallForUser(r, user);
    r.stockOnHand = 0;
    logAudit('recall', r.id, `Retour du lot ${r.lot} (${r.product}) confirmé par ${stamp.by} — remboursement/échange selon décret n° 92-276, art. 18`, stamp.by, user?.organizationId ?? null);
    rerender();
    toast('success', tr("Retour confirmé"), r.product + ' — lot ' + r.lot + ' retourné.', 'ti ti-circle-check');
  }

  const activeRecalls = PHARM_RECALLS.filter((r) => !isRecallReturnedForUser(r, user));

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Alertes &")} <span className="page-title-accent">{tr("rappels")}</span></h1></div>
      </div>

      <div className="u-col-gap10">
        {(DR_ALERTS.length === 0 && activeRecalls.length === 0) && (
          <EmptyState icon="shield-check" tone="ok" title="Aucune alerte active" text="Aucune alerte de sécurité ni rappel produit ne concerne votre laboratoire pour le moment." />
        )}

        {DR_ALERTS.map((a) => {
          const meta = LEVEL_META[a.level] || LEVEL_META.cyan;
          const acked = isAlertAckedForUser(a, user);
          const ackMeta = alertAckMetaForUser(a, user);
          return (
            <div
              key={a.id}
              className={`alert-banner alert-banner--${meta.banner}${acked ? ' is-acknowledged' : ''}`}
              role="alert"
              data-domain={a.domain}
            >
              <Icon name={meta.icon} />
              <div className="u-flex-1">
                <div className="alert-banner-title">
                  {tr(a.title)}
                  {acked && <span className="u-fs10-tertiary">{tr("· acquittée par {0} le {1}", [ackMeta.by || 'un utilisateur', ackMeta.at || ''])}</span>}
                </div>
                <div className="alert-banner-text">
                  {tr(a.text)}<br />
                  <span className="u-fs10-tertiary">{tr("Réf.")} {a.ref} · {a.date} · <span className={`chip chip--${DR_DOMAIN_CHIP[a.domain]} u-t17`}>{tr(a.domain)}</span></span>
                </div>
              </div>
              {!acked && (
                <button className="btn btn--danger u-t90" onClick={() => acknowledgeAlert(a.id)}>
                  <Icon name="circle-check" />{tr("Acquitter")}
                </button>
              )}
            </div>
          );
        })}

        {activeRecalls.map((r) => (
          <div className="alert-banner alert-banner--red" role="alert" key={r.id}>
            <Icon name="rotate-clockwise" />
            <div className="u-flex-1">
              <div className="alert-banner-title">{r.product} — {r.lab}</div>
              <div className="alert-banner-text">
                {tr(r.reason)}
                <br />
                <span className="u-fs10-tertiary">{tr("Réf.")} {r.ref} {tr("· Lot")} <span className="u-mono">{r.lot}</span> · {r.date} {tr("· Patient(s) concerné(s) :")} {r.patients.join(', ')} {tr("· Stock :")} {r.stockOnHand} {tr("unité(s)")}</span>
              </div>
            </div>
            <button className="btn btn--danger u-t90" onClick={() => confirmRecallReturn(r.id)}><Icon name="circle-check" />{tr("Confirmer le retour")}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
