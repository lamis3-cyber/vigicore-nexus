/**
 * listingProductLink.ts — lien EXPLICITE fiche (ProductListing) -> produit d'Audit (offer.ref), étape 2 (serveur).
 *
 * Règles (2026-10-28) :
 *   1. Seule une fiche de FABRICANT (sellerKind MANUFACTURER) peut être liée ; un fournisseur n'a pas de produit Audit.
 *   2. Le produit doit appartenir au fabricant lié à l'établissement de la fiche (offer.manufacturer.ref ===
 *      establishment.auditManufacturerRef). Vérifié ICI, jamais cru du client.
 *   3. Audit injoignable au moment d'un NOUVEAU lien : refus (503), rien n'est enregistré. Garder le même lien, ou le
 *      retirer (null), ne demande pas Audit : une fiche reste modifiable quand Audit est en panne.
 *   4. Deux fiches ACTIVES (non archivées) d'un même établissement ne peuvent pas pointer vers le même produit.
 *      Une fiche archivée garde son lien : le fabricant peut refaire une fiche pour le même produit.
 *   5. Changer le lien (y compris le retirer) renvoie la fiche en revue VigiCore (géré par la route, comme un changement
 *      de contenu important).
 */

export type ProductRefInput = { ok: true; value: string | null | undefined } | { ok: false; message: string };

export const PRODUCT_REF_MAX = 200;

/** Lecture du champ `auditProductRef` du corps. absent = inchangé ; null / '' = retirer le lien ; texte = nouveau lien. */
export function parseProductRef(body: any): ProductRefInput {
  if (!body || !Object.prototype.hasOwnProperty.call(body, 'auditProductRef')) return { ok: true, value: undefined };
  const v = body.auditProductRef;
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v !== 'string') return { ok: false, message: 'auditProductRef must be a string or null.' };
  const s = v.trim();
  if (!s) return { ok: true, value: null };
  if (s.length > PRODUCT_REF_MAX) return { ok: false, message: 'auditProductRef is too long.' };
  return { ok: true, value: s };
}

/** Résumé d'un produit d'Audit montré au fabricant (liste déroulante) et au staff (revue). Jamais le prix. */
export interface AuditProduct { ref: string; name: string; reference: string | null }

export const toAuditProduct = (o: any): AuditProduct => ({
  ref: String(o.ref),
  name: typeof o.name === 'string' ? o.name : String(o.ref),
  reference: typeof o.reference === 'string' ? o.reference : null,
});

/** Les produits d'Audit d'UN fabricant (offres dont manufacturer.ref correspond), sans doublon, triés par nom. */
export function productsOfManufacturer(offers: any[], manufacturerRef: string | null | undefined): AuditProduct[] {
  if (!manufacturerRef) return [];
  const seen = new Set<string>();
  const out: AuditProduct[] = [];
  for (const o of offers ?? []) {
    if (o?.manufacturer?.ref !== manufacturerRef || typeof o?.ref !== 'string' || !o.ref) continue;
    if (seen.has(o.ref)) continue;
    seen.add(o.ref);
    out.push(toAuditProduct(o));
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export type LinkCheck =
  | { ok: true }
  | { ok: false; status: number; code: 'NOT_A_MANUFACTURER' | 'MANUFACTURER_NOT_LINKED' | 'AUDIT_UNAVAILABLE' | 'PRODUCT_NOT_YOURS'; message: string };

/**
 * Le produit `ref` peut-il être lié à une fiche de cet établissement ?
 * `offers = null` : Audit indisponible. Ne contrôle pas les doublons (voir findLinkConflict).
 */
export function checkProductRef(
  ref: string,
  ctx: { sellerKind: string | null | undefined; manufacturerRef: string | null | undefined; offers: any[] | null }
): LinkCheck {
  if (ctx.sellerKind === 'DISTRIBUTOR') {
    return { ok: false, status: 400, code: 'NOT_A_MANUFACTURER', message: "Only a manufacturer's listing can be linked to an Audit product." };
  }
  if (!ctx.manufacturerRef) {
    return {
      ok: false, status: 409, code: 'MANUFACTURER_NOT_LINKED',
      message: 'Your organization is not linked to a manufacturer in VigiCore Audit yet. Ask VigiCore to link it first.',
    };
  }
  if (!ctx.offers) {
    return { ok: false, status: 503, code: 'AUDIT_UNAVAILABLE', message: 'VigiCore Audit is unavailable, the product cannot be checked. Try again later.' };
  }
  const found = ctx.offers.some((o) => o?.ref === ref && o?.manufacturer?.ref === ctx.manufacturerRef);
  if (!found) {
    return { ok: false, status: 422, code: 'PRODUCT_NOT_YOURS', message: 'This product is not one of your products in VigiCore Audit.' };
  }
  return { ok: true };
}

/** Une AUTRE fiche active (non archivée) du même établissement déjà liée à `ref`, ou null. */
export async function findLinkConflict(
  db: any,
  establishmentId: string,
  ref: string,
  excludeListingId?: string
): Promise<{ id: string; title: string } | null> {
  const rows: any[] = await db.productListing.findMany({
    where: { establishmentId, auditProductRef: ref, status: { not: 'ARCHIVED' } },
    select: { id: true, title: true },
  });
  return rows.find((r) => r.id !== excludeListingId) ?? null;
}

export const linkConflictBody = (other: { id: string; title: string }) => ({
  success: false,
  code: 'PRODUCT_ALREADY_LINKED',
  message: `This Audit product is already linked to your listing « ${other.title} ». Archive that listing or link it to another product first.`,
  listingId: other.id,
});

/** Le lien change-t-il ? `next = undefined` : champ absent du corps, donc inchangé. */
export const linkChanged = (current: string | null | undefined, next: string | null | undefined) =>
  next !== undefined && (next ?? null) !== (current ?? null);

// ── Cohérence fiche ↔ produit lié (2026-10-29) ─────────────────────────────────────────────────
//
// Un lien vers le MAUVAIS produit fait commander autre chose que ce que l'acheteur voit (ex. une fiche « Cathéter
// 18G » liée à « Aciclovir 400 mg »). Contrôle volontairement simple et explicable : la fiche et le produit doivent
// partager au moins un MOT significatif (≥ 4 lettres, hors mots vides et unités), ou la fiche citer la référence du
// produit. Sinon : refus du lien, sauf confirmation explicite du fabricant ; le staff voit l'écart à la revue.

const STOP_WORDS = new Set([
  'avec', 'pour', 'sans', 'dans', 'boite', 'boites', 'flacon', 'flacons', 'unite', 'unites', 'produit', 'tres', 'haute',
  'with', 'from', 'pack', 'box', 'boxes', 'unit', 'units', 'the', 'and',
]);

/** Mots significatifs d'un libellé : minuscules, sans accents, ≥ 4 lettres, sans chiffres, hors mots vides. */
export function significantWords(text: string | null | undefined): Set<string> {
  const norm = String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return new Set(norm.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !/\d/.test(w) && !STOP_WORDS.has(w)));
}

/** La fiche (titre) correspond-elle au produit ? true si un mot significatif est commun ou si la référence est citée. */
export function productNameMatches(listingTitle: string | null | undefined, product: { name?: string | null; reference?: string | null }): boolean {
  const title = String(listingTitle ?? '');
  if (!title.trim()) return true; // rien à comparer : pas d'alerte
  const ref = String(product.reference ?? '').trim().toLowerCase();
  if (ref.length >= 3 && title.toLowerCase().includes(ref)) return true;
  const a = significantWords(title);
  for (const w of significantWords(product.name)) if (a.has(w)) return true;
  return false;
}

export const productMismatchBody = (title: string, product: { name: string; reference: string | null }) => ({
  success: false,
  code: 'PRODUCT_MISMATCH',
  message: `The listing « ${title} » does not seem to match the Audit product « ${product.reference ? `${product.name} · ${product.reference}` : product.name} ». Buyers would order that product. Choose the right product, or confirm the link explicitly.`,
  product,
});
