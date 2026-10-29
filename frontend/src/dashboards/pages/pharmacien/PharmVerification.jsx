import { useState } from 'react';
import Icon from '../../components/Icon';
import QrScanner from '../../components/QrScanner';
import { validateScannedLot, lookupLot } from '../../lib/lotVerification';
import { useToast } from '../../context/ToastContext';
import { QR_VERDICT_META, logAudit } from '../../data/doctorVigilance';
import { pharmScopedVerifications } from '../../data/pharmacienVigilance';
import { getCurrentAuthUser } from '../../context/AuthContext';
import { DEMO_DATA_ENABLED } from '../../data/demoMode';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Converted from #view-pharm-verification (pharmacien scope), 1:1
// with the original's verifyPharmLot() / openPharmLotVerdict() and
// the static "Historique de distribution" timeline for Metformine
// 850mg (never dynamic in the original — always shows the same
// MET-20260502-A example regardless of what was searched).
//
// Notes on fidelity:
//  - Unlike DoctorVerification.jsx (converted to an inline result
//    panel per an earlier explicit request), Pharmacien's original
//    verifyPharmLot() opens a genuine drawer/overlay
//    (openPharmLotVerdict → openDrawer(...)) — preserved as such here.
//  - The 3 demo chips set the lot input AND verify immediately, same
//    as the original's inline onclick handlers.
//  - The qr-zone click is a no-op toast only (no autofill) — that's
//    what the original does for this role (unlike some other roles'
//    QR zones which simulate a scan result).
// ═══════════════════════════════════════════════════════════════

const DEMO_CHIPS = [
  { lot: 'MET-20260502-A', label: 'MET-20260502-A · Authentique', chipClass: 'chip--green' },
  { lot: 'ATO-20260510-X', label: 'ATO-20260510-X · Suspect', chipClass: 'chip--amber' },
  { lot: 'DXP-20250612-B', label: 'DXP-20250612-B · Rappelé', chipClass: 'chip--red' },
];

export default function PharmVerification({ onNavigate }) {
  const toast = useToast();
  const user = getCurrentAuthUser();
  const [lotInput, setLotInput] = useState('');
  const [verdict, setVerdict] = useState(null); // { lot, result }
  const [scanOpen, setScanOpen] = useState(false);

  function handleScanned({ lot }) {
    setScanOpen(false);
    setLotInput(lot);
    toast('success', tr("Code scanné"), tr("Lot détecté : {0}", [lot]), 'ti ti-qrcode');
    verifyLot(lot);
  }

  function verifyLot(raw) {
    const val = (raw ?? lotInput).trim().toUpperCase();
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

  function verifyDemo(lot) {
    setLotInput(lot);
    verifyLot(lot);
  }

  function closeDrawer() {
    setVerdict(null);
  }

  const riskTier = verdict ? (verdict.result.risk == null ? 'med' : verdict.result.risk >= 60 ? 'high' : verdict.result.risk >= 25 ? 'med' : 'low') : null;
  const meta = verdict ? QR_VERDICT_META[verdict.result.verdict] : null;
  const orgVerifications = pharmScopedVerifications(getCurrentAuthUser());

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Vérification &")} <span className="page-title-accent">{tr("traçabilité")}</span></h1></div>
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
          {DEMO_CHIPS.map((c) => (
            <button className={`chip ${c.chipClass} u-t64`} key={c.lot} onClick={() => verifyDemo(c.lot)}>{tr(c.label)}</button>
          ))}
        </div>
        )}
      </div>

      {DEMO_DATA_ENABLED && (
      <div className="card">
        <div className="section-header">
          <h2 className="section-title"><Icon name="route" className="u-c-purple" />{tr("Historique de distribution — Metformine 850mg, lot MET-20260502-A")}</h2>
        </div>
        <div className="timeline">
          <div className="tl-item">
            <div className="tl-dot tl-dot--green" />
            <div className="tl-time">02/05/2026</div>
            <div className="tl-body"><div className="tl-event"><strong>{tr("Fabrication")}</strong> {tr("— Merck DZ, site de production Alger")}</div><div className="tl-sub">{tr("Contrôle qualité validé · Certificat de lot émis")}</div></div>
          </div>
          <div className="tl-item">
            <div className="tl-dot tl-dot--green" />
            <div className="tl-time">14/05/2026</div>
            <div className="tl-body"><div className="tl-event">{tr("Réception —")} <strong>{tr("Dépôt central pharmaceutique d'Alger")}</strong></div><div className="tl-sub">{tr("Contrôle d'entrée conforme · Stockage 15–25°C")}</div></div>
          </div>
          <div className="tl-item">
            <div className="tl-dot tl-dot--green" />
            <div className="tl-time">02/06/2026</div>
            <div className="tl-body"><div className="tl-event">{tr("Livraison —")} <strong>{tr("{0}, Kouba", [user?.orgName || 'Pharmacie El Badr'])}</strong></div><div className="tl-sub">{tr("Bon de livraison BL-2026-4471 · Quantité : 120 boîtes")}</div></div>
          </div>
          <div className="tl-item">
            <div className="tl-dot tl-dot--active" />
            <div className="tl-time">{tr("Aujourd'hui")}</div>
            <div className="tl-body"><div className="tl-event">{tr("Vérification ANPP —")} <strong>{tr("authentique, aucun rappel actif")}</strong></div><div className="tl-sub">{tr("Score de risque : 4/100")}</div></div>
          </div>
        </div>
      </div>
      )}

      <div className="card u-p-0">
        <div className="u-t48"><div className="section-title"><Icon name="history" className="u-c-cyan" />{tr("Vérifications récentes")}</div></div>
        <div className="u-overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>{tr("HEURE")}</th><th>{tr("PRODUIT / LOT")}</th><th>{tr("RÉSULTAT")}</th><th>{tr("SCORE")}</th></tr></thead>
            <tbody>
              {orgVerifications.length === 0 && (
                <tr><td colSpan={4} className="u-fs-12" style={{ textAlign: 'center', padding: '18px' }}>{tr("Aucune vérification récente.")}</td></tr>
              )}
              {orgVerifications.map((v) => {
                const m = QR_VERDICT_META[v.verdict];
                const badgeClass = v.verdict === 'authentic' ? 'green' : v.verdict === 'suspicious' ? 'amber' : 'red';
                const tier = v.risk >= 60 ? 'high' : v.risk >= 25 ? 'med' : 'low';
                const label = m.label.replace(' — RETRAIT', '').replace('Suspicion — à investiguer', 'Suspect').replace('Produit authentique', 'Authentique').replace('Produit rappelé', 'Rappelé');
                return (
                  <tr key={v.lot + v.time}>
                    <td><div className="u-fs-12">{v.time}</div></td>
                    <td><div className="u-fs12-500">{v.product}</div><div className="table-sub u-mono">{v.lot}</div></td>
                    <td><span className={`badge badge--${badgeClass}`}>{tr(label)}</span></td>
                    <td><span className={`risk-chip risk-chip--${tier}`}>{v.risk}/100</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <QrScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDetected={handleScanned}
        validate={validateScannedLot}
      />

      {verdict && (
        <>
          <div className="chat-overlay is-open" onClick={closeDrawer} />
          <div className="chat-panel overlay-modal is-open" role="dialog" aria-modal="true" aria-labelledby="pharmVerifDrawerTitle">
            <div className="chat-header">
              <div className="chat-header-inner">
                <div className="drawer-icon" style={{ background: verdict.result.verdict === 'authentic' ? 'var(--color-green)' : verdict.result.verdict === 'suspicious' ? 'var(--color-amber)' : verdict.result.verdict === 'unknown' ? 'var(--text-tertiary)' : 'var(--color-red)', color: '#fff' }}>
                  <Icon name={meta.icon} />
                </div>
                <div className="u-flex-1 u-t31">
                  <div id="pharmVerifDrawerTitle" className="u-fs13-strong">{tr("Vérification de lot")}</div>
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
                <button className="btn btn--danger btn--full" onClick={() => { closeDrawer(); onNavigate('pharm-rappels'); }}><Icon name="alert-triangle" />{tr("Voir les rappels & retours")}</button>
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
