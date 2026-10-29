import { useState } from 'react';
import Icon from '../../components/Icon';
import EmptyState from '../../components/EmptyState';
import QrScanner from '../../components/QrScanner';
import { validateScannedLot, lookupLot } from '../../lib/lotVerification';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { QR_VERDICT_META, PHARM_RECALLS, logAudit, isRecallReturnedForUser, recallReturnMetaForUser } from '../../data/doctorVigilance';
import { DEMO_DATA_ENABLED } from '../../data/demoMode';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Full-page lot verification for the Doctor role — per explicit
// request, styled like the original's produitsTracabiliteShellHTML()
// full-page layout (used by Pharmacien/Labo/Hôpital's "Vérifier un
// lot"/"Vérifier un produit" pages) instead of the earlier drawer.
// Reached from the Dashboard's "Vérifier un lot" button, which now
// navigates here instead of opening an overlay.
//
// Notes on fidelity:
//  - QR-scan zone, lot input, demo chips and verdict banner (risk
//    score, pass/fail factors, distribution table) reuse
//    verifyPharmLot()/openPharmLotVerdict()'s exact data (QR_LOT_DB /
//    QR_VERDICT_META), same as the Dashboard drawer did before — only
//    the presentation changed, from an overlay to inline page content.
//  - "Produits rappelés" reuses the original's PHARM_RECALLS /
//    pharmRecallCardHTML(compact) — shown read-only for the doctor
//    (no "Confirmer le retour", since that's an officine-stock action
//    the original itself only gave to Pharmacien/Hôpital roles).
// ═══════════════════════════════════════════════════════════════

export default function DoctorVerification({ onNavigate }) {
  const { user } = useAuth();
  const toast = useToast();

  const [lotInput, setLotInput] = useState('');
  const [lotVerdict, setLotVerdict] = useState(null); // { lot, result } | null

  const [scanOpen, setScanOpen] = useState(false);
  function handleScanned({ lot }) {
    setScanOpen(false);
    setLotInput(lot);
    toast('success', tr("Code scanné"), tr("Lot détecté : {0}", [lot]), 'ti ti-qrcode');
    verifyLot(lot);
  }

  function verifyLot(arg) {
    const raw = (typeof arg === 'string' ? arg : lotInput).trim().toUpperCase();
    if (!raw) {
      toast('warn', tr("Numéro de lot requis"), tr("Scannez le DataMatrix ou saisissez le numéro de lot à vérifier"), 'ti ti-qrcode');
      return;
    }
    const lookup = lookupLot(raw);
    if (!lookup.ok) {
      toast('warn', tr("Code non reconnu"), lookup.problem, 'ti ti-alert-triangle');
      return;
    }
    const result = lookup.result;
    logAudit('lot', raw, `Vérification anti-contrefaçon du lot ${raw} — verdict : ${QR_VERDICT_META[result.verdict].label}`, user?.name, user?.organizationId ?? null);
    setLotVerdict({ lot: raw, result });
  }

  const activeRecalls = PHARM_RECALLS.filter((r) => !isRecallReturnedForUser(r, user));

  return (
    <div className="view is-active">
      <QrScanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={handleScanned} validate={validateScannedLot} />
      <div className="page-header">
        <div><h1 className="page-title">{tr("Vérification de")} <span className="page-title-accent">{tr("lot")}</span></h1></div>
      </div>

      <div className="card">
        <div className="u-t80"><Icon name="qrcode" className="u-c-cyan" />{tr("Scanner ou saisir un lot")}</div>
        <div className="u-t78">{tr("Scannez le DataMatrix de l'emballage ou saisissez le numéro de lot pour vérifier l'authenticité, la traçabilité et l'absence de rappel actif dans la base ANPP.")}</div>
        <div
          className="qr-zone"
          role="button"
          tabIndex={0}
          onClick={() => setScanOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setScanOpen(true); } }}
          aria-label={tr("Scanner le DataMatrix de l'emballage produit")}
        >
          <Icon name="qrcode" />
          <div className="qr-zone-text">{tr("Scanner le DataMatrix / QR code de l'emballage")}</div>
          <div className="qr-zone-sub">{tr("Ou saisissez le numéro de lot manuellement ci-dessous")}</div>
        </div>
        <div className="u-t70">
          <input
            className="form-input u-flex-1"
            id="lotInput"
            placeholder={tr("Numéro de lot")}
            aria-label={tr("Numéro de lot à vérifier")}
            value={lotInput}
            onChange={(e) => setLotInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') verifyLot(); }}
          />
          <button className="btn btn--primary" onClick={() => verifyLot()}><Icon name="search" />{tr("Vérifier")}</button>
        </div>
        {DEMO_DATA_ENABLED && (
        <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
          <span className="u-fs10-tertiary" style={{ alignSelf: 'center' }}>{tr("Exemples de démonstration :")}</span>
          <button className="chip chip--green u-t64" onClick={() => setLotInput('MET-20260502-A')}>{tr("MET-20260502-A · Authentique")}</button>
          <button className="chip chip--amber u-t64" onClick={() => setLotInput('ATO-20260510-X')}>{tr("ATO-20260510-X · Suspect")}</button>
          <button className="chip chip--red u-t64" onClick={() => setLotInput('DXP-20250612-B')}>{tr("DXP-20250612-B · Rappelé")}</button>
        </div>
        )}

        {lotVerdict && (() => {
          const { lot, result } = lotVerdict;
          const meta = QR_VERDICT_META[result.verdict];
          const riskTier = result.risk == null ? 'med' : result.risk >= 60 ? 'high' : result.risk >= 25 ? 'med' : 'low';
          return (
            <div className="drawer-section u-t13">
              <div className={`verdict-banner verdict-banner--${meta.cls}`}>
                <Icon name={meta.icon} />
                <div>
                  <div className="verdict-title">{tr(meta.label)}</div>
                  <div className="verdict-sub">{tr("Lot")} <span className="u-mono">{lot}</span> {tr("· Interrogation base ANPP à l'instant")}</div>
                </div>
              </div>
              <div className="u-col-gap8 u-t30">
                <div className="u-t72"><span className="u-c-tertiary">{tr("Produit")}</span><strong>{result.product}</strong></div>
                <div className="u-t72"><span className="u-c-tertiary">{tr("Fabricant")}</span><strong>{result.manufacturer}</strong></div>
                <div className="u-t72"><span className="u-c-tertiary">{tr("Péremption")}</span><strong>{result.expiry}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                  <span className="u-c-tertiary">{tr("Score de risque")}</span>
                  <span className={`risk-chip risk-chip--${riskTier}`}>{result.risk == null ? 'N/D' : `${result.risk}/100`}</span>
                </div>
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.6, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', marginTop: '12px' }}>
                {tr(result.note)}
              </div>

              {result.factors && (
                <div className="u-t30">
                  <div className="u-fs10-5-tertiary u-t129"><Icon name="list-check" />{tr("Comment ce score a été calculé")}</div>
                  <div className="u-col-gap6">
                    {result.factors.map((f, i) => {
                      const iconName = f.status === 'pass' ? 'circle-check' : f.status === 'fail' ? 'x' : 'alert-triangle';
                      const color = f.status === 'pass' ? 'var(--color-green)' : f.status === 'fail' ? 'var(--color-red)' : 'var(--color-amber)';
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                          <Icon name={iconName} style={{ color, fontSize: '13px', flexShrink: 0 }} />{tr(f.label)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {result.distribution && (
                <div className="u-t30">
                  <div className="u-fs10-5-tertiary u-t129"><Icon name="route" />{tr("Autres sites ayant reçu ce lot (traçabilité aval)")}</div>
                  <div className="u-col-gap6">
                    {result.distribution.map((d, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', padding: '6px 8px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                        <span>{d.site}</span>
                        <span className="u-c-tertiary">{tr("{0} unités · {1}", [d.qty, d.status])}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(result.verdict === 'recalled' || result.verdict === 'suspicious') && (
                <button className="btn btn--danger u-t84" onClick={() => onNavigate('doc-alertes')}>
                  <Icon name="alert-triangle" />{tr("Voir les alertes vigilance")}
                </button>
              )}
            </div>
          );
        })()}
      </div>

      <div className="card u-p-0">
        <div className="u-t48"><div className="section-title"><Icon name="ban" className="u-c-red" />{tr("Produits rappelés — tout l'établissement")}</div></div>
        <div className="u-col-gap10" style={{ padding: '16px' }}>
          {PHARM_RECALLS.length === 0 && (
            <EmptyState bare icon="circle-check" tone="ok" title="Aucun rappel" text="Aucun rappel produit enregistré pour le moment." />
          )}
          {PHARM_RECALLS.length > 0 && activeRecalls.length === 0 && (
            <div className="u-fs-12 u-t36">{tr("Aucun rappel actif à traiter.")}</div>
          )}
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
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
