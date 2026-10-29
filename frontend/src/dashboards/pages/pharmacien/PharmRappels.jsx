import { useState } from 'react';
import Icon from '../../components/Icon';
import EmptyState from '../../components/EmptyState';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { PHARM_RECALLS, logAudit, isRecallReturnedForUser, recallReturnMetaForUser, returnRecallForUser } from '../../data/doctorVigilance';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Converted from #view-pharm-rappels (pharmacien scope), 1:1 with the
// original's renderPharmRecalls() / pharmRecallCardHTML(r, compact=false)
// / confirmRecallReturn().
//
// Notes on fidelity:
//  - PHARM_RECALLS is the same shared mutable array used by
//    PharmDashboard's compact "Rappels actifs" panel and the
//    pharm-rappels sidebar/topbar badge — confirming a return here
//    mutates it in place, same as the original's single global array.
//  - confirmRecallReturn() originally stamped `returnedBy` from
//    ROLE_CONFIG.pharmacien.name (a hardcoded demo constant). This
//    port uses the logged-in user's name from AuthContext instead —
//    same substitution already used throughout the Doctor pages for
//    every audit-trail "actor" field.
// ═══════════════════════════════════════════════════════════════

export default function PharmRappels() {
  const toast = useToast();
  const { user } = useAuth();
  const [, forceTick] = useState(0);

  function confirmRecallReturn(id) {
    const r = PHARM_RECALLS.find((x) => x.id === id);
    if (!r) return;
    const stamp = returnRecallForUser(r, user);
    r.stockOnHand = 0;
    logAudit('recall', r.id, `Retour du lot ${r.lot} (${r.product}) confirmé par ${stamp.by} — remboursement/échange selon décret n° 92-276, art. 18`, stamp.by, user?.organizationId ?? null);
    forceTick((n) => n + 1);
    toast('success', tr("Retour confirmé"), r.product + ' — lot ' + r.lot + ' retourné. Remboursement/échange géré selon le décret n° 92-276.', 'ti ti-circle-check');
  }

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Rappels de")} <span className="page-title-accent">{tr("lots")}</span></h1></div>
      </div>

      <div className="alert-banner alert-banner--cyan" role="note">
        <Icon name="info-circle" />
        <div className="u-flex-1">
          <div className="alert-banner-title">{tr("Cadre réglementaire")}</div>
          <div className="alert-banner-text">{tr("Tout produit rappelé doit être immédiatement retiré de la vente. Le retour et le remboursement/échange sont encadrés par le décret exécutif n° 92-276, article 18.")}</div>
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <h2 className="section-title"><Icon name="rotate-clockwise" className="u-c-red" />{tr("Rappels —")} {user?.orgName || tr("Votre officine")}</h2>
        </div>
        <div className="u-col-gap10">
          {PHARM_RECALLS.length === 0 && <EmptyState bare icon="circle-check" tone="ok" title="Aucun rappel" text="Aucun rappel produit enregistré pour le moment." />}
          {PHARM_RECALLS.map((r) => {
            const returned = isRecallReturnedForUser(r, user);
            const returnMeta = recallReturnMetaForUser(r, user);
            return (
            <div className={`alert-banner alert-banner--${returned ? 'green' : 'red'}`} role="alert" key={r.id}>
              <Icon name={returned ? 'circle-check' : 'rotate-clockwise'} />
              <div className="u-flex-1">
                <div className="alert-banner-title">
                  {r.product} — {r.lab}
                  {returned && <span className="u-fs10-tertiary">{tr("· retourné par {0} le {1}", [returnMeta.by, returnMeta.at])}</span>}
                </div>
                <div className="alert-banner-text">
                  {tr(r.reason)}
                  <br />
                  <span className="u-fs10-tertiary">{tr("Réf.")} {r.ref} {tr("· Lot")} <span className="u-mono">{r.lot}</span> · {r.date} {tr("· Patient(s) concerné(s) :")} {r.patients.join(', ')} {tr("· Stock officine :")} {r.stockOnHand} {tr("unité(s)")}</span>
                </div>
              </div>
              {!returned && (
                <button className="btn btn--danger u-t90" onClick={() => confirmRecallReturn(r.id)}><Icon name="circle-check" />{tr("Confirmer le retour")}</button>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
