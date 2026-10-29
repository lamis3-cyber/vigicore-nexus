import { QR_LOT_DB } from '../data/doctorVigilance';

// ═══════════════════════════════════════════════════════════════
// Single source of truth for "what does this scanned/typed code mean?"
//   1. Not a lot code at all (URL, phone number, text…) → rejected,
//      never sent to verification.
//   2. Lot found in the ANPP base → its real verdict.
//   3. Lot looks valid but is NOT in the base → "unknown": the app
//      must never claim such a product is authentic.
// ═══════════════════════════════════════════════════════════════

const NON_LOT_PREFIX = /^([a-z][a-z0-9+.-]*:\/\/|www\.|t\.me\/|wa\.me\/|mailto:|tel:|sms:|smsto:|wifi:|geo:|bitcoin:|begin:vcard)/i;
const LOT_SHAPE = /^[A-Za-z0-9][A-Za-z0-9\-_/.]{2,39}$/;

const preview = (s) => (s.length > 38 ? `${s.slice(0, 38)}…` : s);

export function lotFormatProblem(value) {
  const v = String(value ?? '').trim();
  if (!v) return 'Numéro de lot vide.';
  if (NON_LOT_PREFIX.test(v)) {
    return `Ce code n'est pas un code produit (lien ou contact : « ${preview(v)} »). Scannez le DataMatrix / QR de l'emballage.`;
  }
  if (!LOT_SHAPE.test(v)) {
    return `« ${preview(v)} » ne ressemble pas à un numéro de lot (lettres, chiffres et tirets, 3 à 40 caractères, sans espace).`;
  }
  return null;
}

// used by <QrScanner validate={...}> : keeps the camera open on a bad code
export function validateScannedLot(parsed) {
  return lotFormatProblem(parsed?.lot);
}

export const UNKNOWN_LOT_RESULT = {
  verdict: 'unknown',
  product: 'Lot non référencé dans la base ANPP',
  manufacturer: '—',
  expiry: '—',
  risk: null,
  note: "Ce lot est introuvable dans la base ANPP : son authenticité ne peut PAS être confirmée. Ne le considérez pas comme authentique. Revérifiez le numéro sur l'emballage ; en cas de doute, ne dispensez / n'utilisez pas le produit et déclarez une suspicion.",
  factors: [
    { label: 'Lot absent de la base ANPP', status: 'warn' },
    { label: 'Aucun rappel connu (information non suffisante pour conclure)', status: 'warn' },
  ],
};

export function lookupLot(raw) {
  const trimmed = String(raw ?? '').trim();
  const lot = trimmed.toUpperCase();
  const problem = lotFormatProblem(trimmed);
  if (problem) return { ok: false, lot, problem };
  const hit = QR_LOT_DB[lot];
  if (hit) return { ok: true, lot, known: true, result: hit };
  return { ok: true, lot, known: false, result: UNKNOWN_LOT_RESULT };
}
