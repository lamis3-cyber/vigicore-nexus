import { lookupLot } from './lotVerification';

// Safety status of one of the patient's own products, derived from its lot number and the
// ANPP lot base used by the scanner (lotVerification). Never invents a verdict:
//   recall      the lot is recalled                  -> stop using it
//   suspicious  the lot is flagged as suspicious     -> do not use, ask the pharmacist
//   verified    the lot is in the base, no alert
//   unknown     lot given but not in the base        -> authenticity cannot be confirmed
//   nolot       no lot number entered
export function productSafety(product) {
  const lot = String(product?.lot || '').trim();
  if (!lot) return { status: 'nolot', lot: '', info: null };
  const r = lookupLot(lot);
  if (!r.ok) return { status: 'unknown', lot: r.lot, info: null, problem: r.problem };
  if (!r.known) return { status: 'unknown', lot: r.lot, info: null };
  const verdict = r.result?.verdict;
  if (verdict === 'recalled') return { status: 'recall', lot: r.lot, info: r.result };
  if (verdict === 'suspicious') return { status: 'suspicious', lot: r.lot, info: r.result };
  return { status: 'verified', lot: r.lot, info: r.result };
}

export const SAFETY_BADGE = {
  recall: { label: 'Rappel actif', className: 'badge--red' },
  suspicious: { label: 'Lot suspect', className: 'badge--amber' },
  verified: { label: 'Lot vérifié', className: 'badge--green' },
  unknown: { label: 'Lot non référencé', className: 'badge--amber' },
  nolot: { label: 'Lot non renseigné', className: 'badge--blue' },
};

export const CATEGORY_LABEL = { medicament: 'Médicament', dispositif: 'Dispositif médical', autre: 'Autre produit' };
export const CATEGORY_ICON = { medicament: 'pill', dispositif: 'device-heart-monitor', autre: 'package' };

/** Products whose lot calls for action (recall or suspicious), most serious first. */
export function productsNeedingAction(products) {
  return (products || [])
    .map((p) => ({ product: p, safety: productSafety(p) }))
    .filter((x) => x.safety.status === 'recall' || x.safety.status === 'suspicious')
    .sort((a, b) => (a.safety.status === 'recall' ? -1 : 0) - (b.safety.status === 'recall' ? -1 : 0));
}
