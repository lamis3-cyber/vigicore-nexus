/**
 * Fiche société d'un FOURNISSEUR (distributeur / fournisseur en gros) — validation PURE (aucun Prisma / Express),
 * testable seule. Appliquée côté serveur à l'inscription : le formulaire n'est qu'un confort, l'API peut être
 * appelée directement.
 *
 * Tout est DÉCLARATIF : rien ici ne prouve que la société existe. Le staff VigiCore vérifie sur pièces avant de
 * passer la catégorie d'acheteur à VERIFIED (même circuit que AdminBuyersPage).
 *
 * Formats volontairement TOLÉRANTS (à resserrer seulement si l'encadrant / le MIPH impose un format) :
 *  - RC / NIF / agrément : lettres, chiffres, espace et / . _ - ° ' # — le NIF algérien est numérique mais sa longueur
 *    varie selon l'ancienneté de l'immatriculation, on ne la fige donc pas ;
 *  - l'agrément est OPTIONNEL (même règle que distributorApproval.ts : obligatoire ? à confirmer).
 */

export interface SupplierProfile {
  organizationName: string;
  rcNumber: string;
  nifNumber: string;
  phone: string;
  address: string;
  declaredApprovalNumber: string | null;
}

export type SupplierProfileResult = { ok: true; profile: SupplierProfile } | { ok: false; message: string };

const ID_RE = /^[\p{L}\p{N}][\p{L}\p{N} /._\-°'’#]*$/u;
const PHONE_RE = /^\+?[0-9][0-9 ().\-/]{6,24}$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

const bad = (message: string): SupplierProfileResult => ({ ok: false, message });

/** Texte court : refuse les caractères de contrôle (jamais « corrigés » en silence), réduit les espaces multiples. */
function text(v: unknown): string | null {
  if (typeof v !== 'string' || CONTROL_RE.test(v)) return null;
  const s = v.trim().replace(/ {2,}/g, ' ');
  return s || null;
}

export function parseSupplierProfile(body: unknown): SupplierProfileResult {
  const b = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;

  const organizationName = text(b.organizationName);
  if (!organizationName) return bad('organizationName is required.');
  if (organizationName.length > 160) return bad('organizationName is too long (160 characters maximum).');

  const rcNumber = text(b.rcNumber);
  if (!rcNumber) return bad('rcNumber (commercial register number) is required.');
  if (rcNumber.length < 5 || rcNumber.length > 40 || !ID_RE.test(rcNumber)) return bad('rcNumber is invalid.');

  const nifNumber = text(b.nifNumber);
  if (!nifNumber) return bad('nifNumber (tax identification number) is required.');
  if (nifNumber.length < 8 || nifNumber.length > 25 || !ID_RE.test(nifNumber)) return bad('nifNumber is invalid.');

  const phone = text(b.phone);
  if (!phone) return bad('phone is required.');
  if (!PHONE_RE.test(phone)) return bad('phone is invalid.');

  const address = text(b.address);
  if (!address) return bad('address is required.');
  if (address.length < 5 || address.length > 240) return bad('address must be between 5 and 240 characters.');

  // Agrément : absent / vide = non renseigné (V1 : jamais bloquant).
  let declaredApprovalNumber: string | null = null;
  if (b.declaredApprovalNumber !== undefined && b.declaredApprovalNumber !== null && b.declaredApprovalNumber !== '') {
    const a = text(b.declaredApprovalNumber);
    if (!a || a.length > 60 || !ID_RE.test(a)) return bad('declaredApprovalNumber is invalid.');
    declaredApprovalNumber = a;
  }

  return { ok: true, profile: { organizationName, rcNumber, nifNumber, phone, address, declaredApprovalNumber } };
}
