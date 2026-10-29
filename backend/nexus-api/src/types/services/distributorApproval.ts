/**
 * Agrément du distributeur en gros (étape 1) — fonctions PURES (aucun Prisma / Express), testables seules.
 *
 * Cadre de travail (À CONFIRMER auprès de l'encadrant / du MIPH ; ce n'est PAS une règle légale établie ici) :
 * un distributeur en gros est un établissement de type SUPPLIER dont la catégorie d'acheteur DISTRIBUTOR a été
 * VÉRIFIÉE par le staff VigiCore. Le staff peut y consigner le numéro et la date d'agrément vus sur pièces.
 *
 * V1 : ces deux champs sont OPTIONNELS — obligatoire ? à confirmer (encadrant/MIPH). Un DISTRIBUTOR vérifié sans
 * agrément complet n'est donc ni refusé ni bloqué : il est seulement signalé (approvalIncomplete) au staff.
 *
 * Sémantique des champs dans le corps de POST /api/market/admin/buyers/:id/review :
 *   - absent (undefined)  -> la valeur enregistrée n'est PAS modifiée (non-régression : review sans agrément)
 *   - null ou texte vide  -> la valeur enregistrée est effacée
 *   - sinon               -> validée puis enregistrée
 */

export const APPROVAL_NUMBER_MAX = 60;
/** Lettres/chiffres (toutes langues) + espace / . _ - ° ' ’ # ; commence par une lettre ou un chiffre. */
const NUMBER_RE = /^[\p{L}\p{N}][\p{L}\p{N} /._\-°'’#]*$/u;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Garde-fou de plausibilité (pas une règle métier). */
const MIN_YEAR = 1900;
const DAY_MS = 86_400_000;

export type ApprovalInput =
  | { ok: true; number?: string | null; date?: Date | null }
  | { ok: false; message: string };

const bad = (message: string): ApprovalInput => ({ ok: false, message });

export function parseApprovalInput(body: unknown, now: Date = new Date()): ApprovalInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: true };
  const b = body as Record<string, unknown>;
  const out: { number?: string | null; date?: Date | null } = {};

  const rawNumber = b.approvalNumber;
  if (rawNumber !== undefined) {
    if (rawNumber === null || (typeof rawNumber === 'string' && rawNumber.trim() === '')) {
      out.number = null;
    } else if (typeof rawNumber !== 'string') {
      return bad("Numéro d'agrément invalide.");
    } else {
      // Caractères de contrôle (retour à la ligne, tabulation…) refusés tels quels, pas « corrigés » en silence.
      if (/[\u0000-\u001f\u007f]/.test(rawNumber)) return bad("Numéro d'agrément invalide : caractères de contrôle interdits.");
      const n = rawNumber.trim().replace(/ {2,}/g, ' ');
      if (n.length > APPROVAL_NUMBER_MAX) return bad(`Numéro d'agrément trop long (${APPROVAL_NUMBER_MAX} caractères maximum).`);
      if (!NUMBER_RE.test(n)) return bad("Numéro d'agrément invalide : lettres, chiffres, espace et / . _ - ° ' # uniquement.");
      out.number = n;
    }
  }

  const rawDate = b.approvalDate;
  if (rawDate !== undefined) {
    if (rawDate === null || (typeof rawDate === 'string' && rawDate.trim() === '')) {
      out.date = null;
    } else if (typeof rawDate !== 'string') {
      return bad("Date d'agrément invalide.");
    } else {
      const m = DATE_RE.exec(rawDate.trim());
      if (!m) return bad("Date d'agrément invalide : format AAAA-MM-JJ attendu.");
      const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const date = new Date(Date.UTC(y, mo - 1, d));
      // Refuse les dates impossibles (2026-02-31 serait « corrigée » en mars par Date.UTC).
      if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return bad("Date d'agrément invalide.");
      if (y < MIN_YEAR) return bad("Date d'agrément invalide.");
      // Tolérance d'un jour : le jour « aujourd'hui » saisi en heure locale ne doit pas être refusé à cause du fuseau.
      if (date.getTime() > now.getTime() + DAY_MS) return bad("La date d'agrément ne peut pas être dans le futur.");
      out.date = date;
    }
  }
  return { ok: true, ...out };
}

type ApprovalRow = { approvalNumber?: string | null; approvalDate?: Date | string | null };

/** Jour AAAA-MM-JJ (UTC) d'une date d'agrément, ou null. */
export const approvalDay = (d: Date | string | null | undefined): string | null => {
  if (!d) return null;
  const t = d instanceof Date ? d : new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
};

/**
 * Avertissement staff : un DISTRIBUTOR VÉRIFIÉ dont le numéro et/ou la date d'agrément manque.
 * Purement informatif en V1 (jamais bloquant).
 */
export function approvalIncomplete(row: { buyerCategory?: string | null; buyerCategoryStatus?: string | null } & ApprovalRow): boolean {
  return row.buyerCategory === 'DISTRIBUTOR' && row.buyerCategoryStatus === 'VERIFIED' && (!row.approvalNumber || !approvalDay(row.approvalDate));
}

/**
 * Texte du changement d'agrément pour le journal d'audit, ou null si rien n'a changé.
 * Ne reçoit que des valeurs déjà validées par parseApprovalInput (jamais le motif/la note libre).
 */
export function describeApprovalChange(before: ApprovalRow, after: ApprovalRow): string | null {
  const parts: string[] = [];
  if ((before.approvalNumber ?? null) !== (after.approvalNumber ?? null)) {
    parts.push(after.approvalNumber ? `n° « ${after.approvalNumber} »` : 'n° effacé');
  }
  const bd = approvalDay(before.approvalDate);
  const ad = approvalDay(after.approvalDate);
  if (bd !== ad) parts.push(ad ? `date ${ad}` : 'date effacée');
  return parts.length ? `agrément : ${parts.join(', ')}` : null;
}
