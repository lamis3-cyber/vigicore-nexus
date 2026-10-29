import { useState } from 'react';
import Icon from '../../components/Icon';
import EmptyState from '../../components/EmptyState';
import QrScanner from '../../components/QrScanner';
import { validateScannedLot, lookupLot } from '../../lib/lotVerification';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { QR_VERDICT_META, PHARM_RECALLS, logAudit, isRecallReturnedForUser, recallReturnMetaForUser, returnRecallForUser } from '../../data/doctorVigilance';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Converted from #view-lab-recherche (labo scope), 1:1 with the
// original's renderLabRecherche() → renderProduitsTracabiliteShell()
// / produitsTracabiliteShellHTML() (the shared institutional
// "scan/verify a lot" shell, also used by Hospital) + verifyPharmLot()
// / openPharmLotVerdict() for the verdict drawer, plus a
// "Produits rappelés — tout l'établissement" list below.
//
// Notes on fidelity:
//  - No demo chips and no static distribution-history card here —
//    those only exist on Pharmacien's own richer Vérification page.
//    The shell's copy is genuinely different too: "Vérification
//    valable pour l'ensemble des services de l'établissement
//    (pharmacie, bloc opératoire, laboratoire)" — reproduced verbatim.
//  - The recalls list below reuses pharmRecallCardHTML(r, compact=false)
//    — same non-compact form as PharmRappels.jsx, "Confirmer le
//    retour" included. This is a genuine original behavior: Labo can
//    confirm a pharmacy recall return from this page too (the source
//    has no role gate on that button), mutating the same shared
//    PHARM_RECALLS array everyone else reads.
// ═══════════════════════════════════════════════════════════════

export default function LabRecherche({ onNavigate }) {
  const toast = useToast();
  const { user } = useAuth();
  const [, forceTick] = useState(0);
  const rerender = () => forceTick((n) => n + 1);

  const [lotInput, setLotInput] = useState('');
  const [verdict, setVerdict] = useState(null); // { lot, result }

  const [scanOpen, setScanOpen] = useState(false);
  function handleScanned({ lot }) {
    setScanOpen(false);
    setLotInput(lot);
    toast('success', tr("Code scanné"), tr("Lot détecté : {0}", [lot]), 'ti ti-qrcode');
    verifyLot(lot);
  }

  function verifyLot(arg) {
    const val = (typeof arg === 'string' ? arg : lotInput).trim().toUpperCase();
    if (!val) {
      toast('warn', tr("Numéro de lot requis"), tr("Scannez le DataMatrix ou saisissez le numéro de lot à vérifier"), 'ti ti-qrcode');
      return;
    }
    const lookup = lookupLot(val);
    if (!lookup.ok) {
      toast('warn', tr("Code non reconnu"), lookup.problem, 'ti ti-alert-triangle');
      return;
    }
    const result = lookup.result;
    logAudit('lot', val, `Vérification anti-contrefaçon du lot ${val} — verdict : ${QR_VERDICT_META[result.verdict].label}`, user?.name, user?.organizationId ?? null);
    setVerdict({ lot: val, result });
  }

  function closeDrawer() {
    setVerdict(null);
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

  const riskTier = verdict ? (verdict.result.risk == null ? 'med' : verdict.result.risk >= 60 ? 'high' : verdict.result.risk >= 25 ? 'med' : 'low') : null;
  const meta = verdict ? QR_VERDICT_META[verdict.result.verdict] : null;

  return (
    <div className="view is-active">
      <QrScanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={handleScanned} validate={validateScannedLot} />
      <div className="page-header">
        <div><h1 className="page-title">{tr("Vérifier un")} <span className="page-title-accent">{tr("produit")}</span></h1></div>
      </div>

      <div className="card">
        <div className="u-t80"><Icon name="qrcode" className="u-c-cyan" />{tr("Scanner ou saisir un lot")}</div>
        <div className="u-t78">{tr("Vérification valable pour l'ensemble des services de l'établissement (pharmacie, bloc opératoire, laboratoire).")}</div>
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
            placeholder={tr("Ex : MET-20260502-A")}
            aria-label={tr("Numéro de lot à vérifier")}
            value={lotInput}
            onChange={(e) => setLotInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') verifyLot(); }}
          />
          <button className="btn btn--primary" onClick={() => verifyLot()}><Icon name="search" />{tr("Vérifier")}</button>
        </div>
      </div>

      <div className="card u-p-0">
        <div className="u-t48"><div className="section-title"><Icon name="ban" className="u-c-red" />{tr("Produits rappelés — tout l'établissement")}</div></div>
        <div className="u-col-gap10" style={{ padding: '16px' }}>
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
                  <span className="u-fs10-tertiary">{tr("Réf.")} {r.ref} {tr("· Lot")} <span className="u-mono">{r.lot}</span> · {r.date} {tr("· Patient(s) concerné(s) :")} {r.patients.join(', ')} {tr("· Stock :")} {r.stockOnHand} {tr("unité(s)")}</span>
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

      {verdict && (
        <>
          <div className="chat-overlay is-open" onClick={closeDrawer} />
          <div className="chat-panel overlay-modal is-open" role="dialog" aria-modal="true" aria-labelledby="labVerifDrawerTitle">
            <div className="chat-header">
              <div className="chat-header-inner">
                <div className="drawer-icon" style={{ background: verdict.result.verdict === 'authentic' ? 'var(--color-green)' : verdict.result.verdict === 'suspicious' ? 'var(--color-amber)' : verdict.result.verdict === 'unknown' ? 'var(--text-tertiary)' : 'var(--color-red)', color: '#fff' }}>
                  <Icon name={meta.icon} />
                </div>
                <div className="u-flex-1 u-t31">
                  <div id="labVerifDrawerTitle" className="u-fs13-strong">{tr("Vérification de lot")}</div>
                  <div className="u-fs10-5-tertiary">{verdict.lot}</div>
                </div>
                <button className="chat-close" onClick={closeDrawer} aria-label={tr("Fermer le panneau de détail")}><Icon name="x" /></button>
              </div>
            </div>

            <div className="chat-messages" style={{ gap: '16px' }}>
              <div className="drawer-section">
                <div className={`verdict-banner verdict-banner--${meta.cls}`}>
                  <Icon name={meta.icon} />
                  <div><div className="verdict-title">{tr(meta.label)}</div><div className="verdict-sub">{tr("Lot")} <span className="u-mono">{verdict.lot}</span> {tr("· Interrogation base ANPP à l'instant")}</div></div>
                </div>
                <div className="u-col-gap8 u-t30">
                  <div className="u-t72"><span className="u-c-tertiary">{tr("Produit")}</span><strong>{verdict.result.product}</strong></div>
                  <div className="u-t72"><span className="u-c-tertiary">{tr("Fabricant")}</span><strong>{verdict.result.manufacturer}</strong></div>
                  <div className="u-t72"><span className="u-c-tertiary">{tr("Péremption")}</span><strong>{verdict.result.expiry}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}><span className="u-c-tertiary">{tr("Score de risque")}</span><span className={`risk-chip risk-chip--${riskTier}`}>{verdict.result.risk == null ? 'N/D' : `${verdict.result.risk}/100`}</span></div>
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.6, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', marginTop: '12px' }}>{tr(verdict.result.note)}</div>

                {verdict.result.factors && (
                  <div className="u-t30">
                    <div className="u-fs10-5-tertiary u-t129"><Icon name="list-check" />{tr("Comment ce score a été calculé")}</div>
                    <div className="u-col-gap6">
                      {verdict.result.factors.map((f, i) => {
                        const icon = f.status === 'pass' ? 'circle-check' : f.status === 'fail' ? 'alert-circle' : 'alert-triangle';
                        const color = f.status === 'pass' ? 'var(--color-green)' : f.status === 'fail' ? 'var(--color-red)' : 'var(--color-amber)';
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11px', color: 'var(--text-secondary)' }} key={i}>
                            <Icon name={icon} style={{ color, fontSize: '13px', flexShrink: 0 }} />{tr(f.label)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {verdict.result.distribution && (
                  <div className="u-t30">
                    <div className="u-fs10-5-tertiary u-t129"><Icon name="route" />{tr("Autres sites ayant reçu ce lot (traçabilité aval)")}</div>
                    <div className="u-col-gap6">
                      {verdict.result.distribution.map((d, i) => (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', padding: '6px 8px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }} key={i}>
                          <span>{d.site}</span>
                          <span className="u-c-tertiary">{tr("{0} unités · {1}", [d.qty, d.status])}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="drawer-actions">
              {(verdict.result.verdict === 'recalled' || verdict.result.verdict === 'suspicious') ? (
                <button className="btn btn--danger btn--full" onClick={() => { closeDrawer(); onNavigate('lab-alertes'); }}><Icon name="alert-triangle" />{tr("Voir les rappels & retours")}</button>
              ) : (
                <button className="btn btn--full" onClick={closeDrawer}><Icon name="check" />{tr("Fermer")}</button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
