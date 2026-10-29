/**
 * Ventes d'un FOURNISSEUR (distributeur / grossiste) sur /services — 2026-11-03. AUCUN paiement en ligne.
 *
 * Deux circuits de commande coexistent sur la même page produit et restent séparés :
 *   - fiche d'un FABRICANT  -> offre d'Audit, demande relayée à VigiCore Audit (market.ts / MarketRequest) ;
 *   - fiche d'un FOURNISSEUR -> offre « locale » (ref `local:<listingId>`), commande enregistrée ici (SupplierOrder) et
 *     traitée par le fournisseur lui-même depuis son tableau de bord (confirmer, expédier, livrer, refuser).
 *
 * Qui peut acheter chez un fournisseur : l'administrateur (ou un pharmacien) d'un établissement dont la catégorie
 * d'acheteur est VÉRIFIÉE par le staff VigiCore. Les catégories autorisées se règlent par SUPPLIER_ORDER_BUYER_TYPES
 * (défaut : toutes). Un particulier / un compte sans établissement vérifié ne commande pas : il envoie une demande d'intérêt.
 * Un fournisseur n'expose ses produits en commande que lorsque SA propre catégorie « distributeur » est vérifiée.
 *
 * Module PUR (aucun Prisma / Express) : testable seul.
 */
import { randomBytes } from 'node:crypto';
import { BUYER_CATEGORIES, isBuyerCategory, orderEligibility, orderBuyerTypes, withRoleCategory, type MarketEstablishment } from './market';

export const LOCAL_REF_PREFIX = 'local:';
export const localRef = (listingId: string) => `${LOCAL_REF_PREFIX}${listingId}`;
export const isLocalRef = (v: unknown): v is string => typeof v === 'string' && v.startsWith(LOCAL_REF_PREFIX) && v.length > LOCAL_REF_PREFIX.length;
export const listingIdOfRef = (ref: string) => ref.slice(LOCAL_REF_PREFIX.length);

// ── Statuts ────────────────────────────────────────────────────────

export const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REJECTED'] as const;
export const INTEREST_STATUSES = ['NEW', 'CONTACTED', 'CLOSED'] as const;
export type SupplierOrderKind = 'ORDER' | 'INTEREST';

/** Transitions permises au VENDEUR. Une commande livrée, annulée ou refusée est définitive. */
const SELLER_FLOW: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'REJECTED'],
  CONFIRMED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  NEW: ['CONTACTED', 'CLOSED'],
  CONTACTED: ['CLOSED'],
};
export function sellerMayMove(kind: string, from: string, to: string): boolean {
  if (kind !== 'ORDER' && kind !== 'INTEREST') return false;
  const known: readonly string[] = kind === 'ORDER' ? ORDER_STATUSES : INTEREST_STATUSES;
  if (!known.includes(from) || !known.includes(to)) return false;
  return (SELLER_FLOW[from] ?? []).includes(to);
}
/** L'acheteur peut retirer sa commande tant que le vendeur ne l'a pas confirmée. */
export const buyerMayCancel = (kind: string, status: string) => kind === 'ORDER' && status === 'PENDING';

export const STATUS_LABEL: Record<string, string> = {
  PENDING: 'En attente de confirmation', CONFIRMED: 'Confirmée', SHIPPED: 'Expédiée', DELIVERED: 'Livrée', CANCELLED: 'Annulée', REJECTED: 'Refusée par le fournisseur',
  NEW: 'Envoyée', CONTACTED: 'Le fournisseur vous a contacté', CLOSED: 'Clôturée',
};

// ── Qui peut acheter ───────────────────────────────────────────────

/** Catégories d'acheteurs qui peuvent commander chez un fournisseur (SUPPLIER_ORDER_BUYER_TYPES ; défaut = toutes). */
export function supplierBuyerTypes(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.SUPPLIER_ORDER_BUYER_TYPES;
  if (!raw || !raw.trim()) return [...BUYER_CATEGORIES];
  return Array.from(new Set(raw.split(',').map((x) => x.trim().toUpperCase()).filter(isBuyerCategory)));
}

type Eligibility = { ok: true } | { ok: false; reason: string };

/** Pré-vérification (le serveur tranche) : cet établissement peut-il commander chez un fournisseur ? */
export function supplierOrderEligibility(est: MarketEstablishment | null, canAct: boolean, env: Record<string, string | undefined> = process.env): Eligibility {
  if (!est || !canAct) return { ok: false, reason: 'NOT_ESTABLISHMENT_ADMIN' };
  if (!est.buyerCategory || !est.buyerCategoryStatus) return { ok: false, reason: 'CATEGORY_NOT_DECLARED' };
  if (est.buyerCategoryStatus === 'REJECTED') return { ok: false, reason: 'CATEGORY_REJECTED' };
  if (!supplierBuyerTypes(env).includes(est.buyerCategory)) return { ok: false, reason: 'CATEGORY_NOT_ALLOWED' };
  if (est.buyerCategoryStatus !== 'VERIFIED') return { ok: false, reason: 'CATEGORY_NOT_VERIFIED' };
  return { ok: true };
}

/**
 * Ce que l'interface affiche (canOrder / orderBlocker) : « peut commander SOMEWHERE » = chez un fabricant OU chez un fournisseur.
 * Chaque offre garde sa propre liste `orderableBy`, qui tranche produit par produit.
 */
export function buyerAccess(est: MarketEstablishment | null, canAct: boolean, env: Record<string, string | undefined> = process.env) {
  const maker = orderEligibility(est, canAct, env as any);
  const supplier = supplierOrderEligibility(est, canAct, env);
  if (maker.ok || supplier.ok) return { canOrder: true as const, orderBlocker: null, manufacturers: maker.ok, suppliers: supplier.ok };
  // Même motif des deux côtés dans presque tous les cas ; sinon on garde celui du circuit fournisseur (le plus ouvert).
  return { canOrder: false as const, orderBlocker: supplier.reason, manufacturers: false, suppliers: false };
}
export { orderBuyerTypes };

// ── Visibilité du catalogue selon ce que l'acheteur peut réellement commander ──
// Le serveur décide, l'interface affiche seulement. Règle « fail-open » : au moindre doute on MONTRE le produit
// (la commande, elle, reste refusée en 403 par POST /market/orders).

export interface BuyerEst { id?: string; buyerCategory?: string | null; canOrder: boolean; canOrderFromManufacturers: boolean; canOrderFromSuppliers: boolean }

/** true = au moins un de mes établissements peut commander cette offre ; false = aucun ne peut ; null = inconnu (on montre). */
export function offerOrderable(offer: any, ests: BuyerEst[]): boolean | null {
  const orderers = ests.filter((e) => e && e.canOrder);
  if (!orderers.length) return null; // ne peut rien commander (consultation / demande d'intérêt) : aucune restriction
  if (!Array.isArray(offer?.orderableBy)) return null; // liste inconnue
  const supplier = offer.source === 'SUPPLIER';
  return orderers.some((e) => (supplier ? e.canOrderFromSuppliers : e.canOrderFromManufacturers) && !!e.buyerCategory && offer.orderableBy.includes(e.buyerCategory));
}

export interface CatalogueListing { id: string; sellerKind?: string | null; establishmentId: string; auditRef: string | null; auditProductRef?: string | null }

/**
 * Ids des fiches à masquer pour cet acheteur.
 *  - Source entière hors de portée (aucun de mes établissements ne peut acheter chez les fabricants / les fournisseurs) : masquée, sans Audit.
 *  - Fiche LIÉE à un produit Audit (`auditProductRef`) : décision PAR PRODUIT, sur l'offre exacte (même ref ET même fabricant).
 *    Offre sans `orderableBy` : on montre. Offre introuvable (retirée d'Audit, fabricant changé) : règle du fabricant ci-dessous,
 *    pour qu'un lien ne rende jamais une fiche PLUS visible qu'une fiche non liée.
 *  - Fiche NON liée : décision par fabricant (inchangée) — masquée seulement si TOUTES ses offres excluent ma catégorie.
 *    Le rapprochement par le titre (pickListingForOffer) n'est jamais utilisé pour masquer.
 *  - Audit en panne, fabricant sans offre, offre sans `orderableBy` : on montre.
 *  - Mes propres fiches ne sont jamais masquées. `offers = null` : Audit indisponible.
 */
export function hiddenListingIds(listings: CatalogueListing[], ests: BuyerEst[], mine: Set<string>, offers: any[] | null): string[] {
  const orderers = ests.filter((e) => e && e.canOrder);
  if (!orderers.length) return [];
  const mayMaker = orderers.some((e) => e.canOrderFromManufacturers);
  const maySupplier = orderers.some((e) => e.canOrderFromSuppliers);
  const verdict = new Map<string, boolean | null>(); // auditRef -> fabricant commandable ?
  const makerOk = (ref: string): boolean | null => {
    if (!offers) return null;
    if (!verdict.has(ref)) {
      const linked = offers.filter((o) => o?.manufacturer?.ref === ref);
      const r = linked.map((o) => offerOrderable({ ...o, source: 'MANUFACTURER' }, ests));
      verdict.set(ref, linked.length === 0 || r.includes(null) ? null : r.some(Boolean));
    }
    return verdict.get(ref) ?? null;
  };
  const productOk = (makerRef: string, productRef: string): boolean | null => {
    if (!offers) return null;
    const o = offers.find((x) => x?.ref === productRef && x?.manufacturer?.ref === makerRef);
    // Offre introuvable (retirée d'Audit, fabricant changé) : on retombe sur la règle du fabricant, jamais plus ouverte qu'une fiche non liée.
    return o ? offerOrderable({ ...o, source: 'MANUFACTURER' }, ests) : makerOk(makerRef);
  };
  const hidden: string[] = [];
  for (const l of listings) {
    if (mine.has(l.establishmentId)) continue;
    if (l.sellerKind === 'DISTRIBUTOR') { if (!maySupplier) hidden.push(l.id); continue; }
    if (!mayMaker) { hidden.push(l.id); continue; }
    if (!l.auditRef) continue;
    const ok = l.auditProductRef ? productOk(l.auditRef, l.auditProductRef) : makerOk(l.auditRef);
    if (ok === false) hidden.push(l.id);
  }
  return hidden;
}

// ── Conditions de vente d'une fiche (prix, unité, minimum) ─────────

export interface SellingTerms { unitPrice: number | null; priceUnit: string | null; minOrderQty: number; inStock: boolean; stockQty: number | null }
export type SellingTermsResult = { ok: true; terms: Partial<SellingTerms> } | { ok: false; message: string };

/** Valide les champs de vente reçus du client. Absent = inchangé ; chaîne vide / null sur le prix = prix effacé. */
export function parseSellingTerms(body: any): SellingTermsResult {
  const b = body && typeof body === 'object' ? body : {};
  const terms: Partial<SellingTerms> = {};
  if (b.unitPrice !== undefined) {
    if (b.unitPrice === null || b.unitPrice === '') terms.unitPrice = null;
    else {
      const n = Number(b.unitPrice);
      if (!Number.isFinite(n) || n <= 0 || n > 1_000_000_000) return { ok: false, message: 'unitPrice must be a positive number.' };
      terms.unitPrice = Math.round(n * 100) / 100;
    }
  }
  if (b.priceUnit !== undefined) {
    if (b.priceUnit === null || b.priceUnit === '') terms.priceUnit = null;
    else if (typeof b.priceUnit !== 'string' || /[\u0000-\u001f\u007f]/.test(b.priceUnit) || b.priceUnit.trim().length > 30) return { ok: false, message: 'priceUnit is invalid (30 characters maximum).' };
    else terms.priceUnit = b.priceUnit.trim();
  }
  if (b.minOrderQty !== undefined) {
    const n = b.minOrderQty === '' || b.minOrderQty === null ? 1 : Number(b.minOrderQty);
    if (!Number.isInteger(n) || n < 1 || n > 1_000_000) return { ok: false, message: 'minOrderQty must be a whole number of at least 1.' };
    terms.minOrderQty = n;
  }
  if (b.inStock !== undefined) {
    if (typeof b.inStock !== 'boolean') return { ok: false, message: 'inStock must be true or false.' };
    terms.inStock = b.inStock;
  }
  // Quantité réservable : absent = inchangé ; null / chaîne vide = quantité non suivie (retour au simple « en stock » oui/non).
  if (b.stockQty !== undefined) {
    if (b.stockQty === null || b.stockQty === '') terms.stockQty = null;
    else {
      const n = typeof b.stockQty === 'string' ? Number(b.stockQty.trim()) : b.stockQty;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 100_000_000) return { ok: false, message: 'stockQty must be a whole number of at least 0 (or empty to stop tracking).' };
      terms.stockQty = n;
    }
  }
  return { ok: true, terms };
}

// ── Offres locales (même forme que les offres d'Audit : l'interface ne distingue pas) ──

export interface LocalOfferListing {
  id: string;
  title: string;
  category?: string | null;
  unitPrice: number | null;
  priceUnit?: string | null;
  minOrderQty?: number | null;
  inStock?: boolean | null;
  stockQty?: number | null;
  establishment: { id: string; name: string; buyerCategory?: string | null; buyerCategoryStatus?: string | null };
}

/** Quantité non suivie (null/undefined) = toujours satisfaisable ; sinon il faut au moins `qty` en stock. */
export const hasStockFor = (stockQty: number | null | undefined, qty: number) => stockQty == null || stockQty >= qty;

/** Une fiche devient une offre commandable seulement avec un prix, en stock, chez un fournisseur dont la catégorie est vérifiée. */
export function isOrderableListing(l: LocalOfferListing): boolean {
  return l.unitPrice != null && l.unitPrice > 0 && l.inStock !== false && hasStockFor(l.stockQty, l.minOrderQty ?? 1)
    && l.establishment.buyerCategory === 'DISTRIBUTOR' && l.establishment.buyerCategoryStatus === 'VERIFIED';
}

export function listingToOffer(l: LocalOfferListing, env: Record<string, string | undefined> = process.env) {
  return {
    ref: localRef(l.id),
    source: 'SUPPLIER' as const,
    listingId: l.id,
    name: l.title,
    reference: `FRN-${l.id.slice(-6).toUpperCase()}`,
    unitPrice: l.unitPrice,
    priceUnit: l.priceUnit ?? null,
    minOrderQty: l.minOrderQty ?? 1,
    orderableBy: supplierBuyerTypes(env),
    manufacturer: { ref: `supplier:${l.establishment.id}`, name: l.establishment.name },
  };
}

// ── Lignes de commande ─────────────────────────────────────────────

/** `reserved` : la quantité a été retirée du stock de la fiche à la commande ; elle seule est rendue au refus / à l'annulation. */
export interface OrderLine { listingId: string; product: string; quantity: number; unitPrice: number | null; reserved?: boolean }

export function parseLocalLines(lines: unknown): { productRef: string; quantity: number }[] | null {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 20) return null;
  const out: { productRef: string; quantity: number }[] = [];
  const seen = new Set<string>();
  for (const l of lines as any[]) {
    const ref = typeof l?.productRef === 'string' ? l.productRef.trim() : '';
    if (!isLocalRef(ref) || seen.has(ref) || !Number.isInteger(l?.quantity) || l.quantity < 1 || l.quantity > 1_000_000) return null;
    seen.add(ref);
    out.push({ productRef: ref, quantity: l.quantity });
  }
  return out;
}

export const orderTotal = (lines: Pick<OrderLine, 'quantity' | 'unitPrice'>[]) =>
  Math.round(lines.reduce((s, l) => s + l.quantity * (l.unitPrice ?? 0), 0) * 100) / 100;

export function orderSummary(lines: Pick<OrderLine, 'product' | 'quantity'>[]): string {
  return lines.map((l) => `${l.product} × ${l.quantity}`).join(', ').slice(0, 500);
}

/** Référence lisible et non devinable : CMD-2026-7K3QZ9 (jamais le cuid interne). */
export function newOrderReference(kind: SupplierOrderKind, now = new Date()): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  const code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `${kind === 'ORDER' ? 'CMD' : 'INT'}-${now.getUTCFullYear()}-${code}`;
}

export function appendHistory(history: unknown, entry: { at: string; status: string; note?: string | null }) {
  const list = Array.isArray(history) ? history.slice(-49) : [];
  return [...list, entry.note ? entry : { at: entry.at, status: entry.status }];
}

// ── DTO ────────────────────────────────────────────────────────────

const iso = (d: any) => new Date(d).toISOString();
const linesOf = (r: any): OrderLine[] => (Array.isArray(r.lines) ? r.lines : []);

/**
 * Vue de l'ACHETEUR, au même format que toMarketDto (market.ts) : les écrans existants (Commandes, Suivi, Historique)
 * affichent donc ces commandes sans changement. `delivery: 'SENT'` = elle est arrivée chez le vendeur (il n'y a pas d'envoi différé).
 */
export function toBuyerDto(r: any) {
  return {
    id: r.id,
    kind: r.kind,
    source: 'SUPPLIER' as const,
    reference: r.reference,
    establishmentId: r.buyerEstablishmentId ?? null,
    summary: r.summary,
    manufacturer: r.sellerEstablishment?.name ?? r.sellerName ?? null,
    totalAmount: r.totalAmount ?? null,
    currency: 'DZD',
    delivery: 'SENT',
    status: r.status === 'REJECTED' ? 'CANCELLED' : r.status,
    refusal: r.status === 'REJECTED' ? (r.sellerNote ? `Refusée par le fournisseur : ${r.sellerNote}` : 'Refusée par le fournisseur.') : null,
    sellerNote: r.sellerNote ?? null,
    cancellable: buyerMayCancel(r.kind, r.status),
    lines: linesOf(r).map((l) => ({ product: l.product, quantity: l.quantity, unitPrice: l.unitPrice ?? null, lotNumber: null, expiryDate: null, lotStatus: null })),
    history: Array.isArray(r.history) ? r.history : [],
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}

/** Vue du VENDEUR : qui commande (établissement + contact), quoi, et ce qu'il peut faire ensuite. */
export function toSellerDto(r: any) {
  const contact = (r.contact ?? {}) as any;
  const buyerEst: any = r.buyerEstablishment ? withRoleCategory(r.buyerEstablishment) : null; // catégorie fixée par le type d'établissement
  return {
    id: r.id,
    kind: r.kind,
    reference: r.reference,
    status: r.status,
    statusLabel: STATUS_LABEL[r.status] ?? r.status,
    summary: r.summary,
    totalAmount: r.totalAmount ?? null,
    currency: 'DZD',
    buyer: {
      establishmentId: r.buyerEstablishmentId ?? null,
      name: r.buyerEstablishment?.name ?? null,
      category: buyerEst?.buyerCategory ?? null,
      verified: buyerEst?.buyerCategoryStatus === 'VERIFIED',
      contactName: contact.name ?? null,
      contactEmail: contact.email ?? null,
      contactPhone: contact.phone ?? null,
    },
    note: r.note ?? null,
    sellerNote: r.sellerNote ?? null,
    nextStatuses: SELLER_FLOW[r.status] ?? [],
    lines: linesOf(r).map((l) => ({ product: l.product, quantity: l.quantity, unitPrice: l.unitPrice ?? null })),
    history: Array.isArray(r.history) ? r.history : [],
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}

// ── Lien offre -> fiche publique (bouton « Voir la fiche » du tableau de bord) ──

const norm = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const tokens = (v: string) => new Set(norm(v).split(/[^a-z0-9]+/).filter((t) => t.length >= 3));

/**
 * Une offre d'Audit n'a pas d'identifiant de fiche : on retrouve la fiche PUBLIQUE du même fabricant dont le titre
 * ressemble le plus au nom de l'offre (mots en commun). Aucun mot commun => la première fiche du fabricant (sa vitrine) ;
 * aucune fiche => null (le bouton n'est alors pas affiché). Jamais d'invention : l'id renvoyé existe toujours.
 */
export function pickListingForOffer(offerName: string, listings: { id: string; title: string }[]): string | null {
  if (!listings.length) return null;
  const want = tokens(offerName);
  let best: { id: string; score: number } | null = null;
  for (const l of listings) {
    const score = [...tokens(l.title)].filter((t) => want.has(t)).length;
    if (score > 0 && (!best || score > best.score)) best = { id: l.id, score };
  }
  return best?.id ?? listings[0].id;
}

/**
 * Fiche à ouvrir pour une offre d'Audit, parmi les fiches publiques DU MÊME fabricant.
 *  1. Lien explicite : la fiche dont `auditProductRef` = ref de l'offre (sûr).
 *  2. Sinon, secours par le titre (pickListingForOffer), mais seulement parmi les fiches NON liées : une fiche liée à un
 *     autre produit n'est jamais proposée pour cette offre. Aucune fiche non liée => null (pas de bouton).
 */
export function listingForOffer(
  offer: { ref?: unknown; name?: unknown },
  listings: { id: string; title: string; auditProductRef?: string | null }[],
): { listingId: string; link: 'EXPLICIT' | 'GUESS' } | null {
  const ref = typeof offer?.ref === 'string' ? offer.ref : null;
  const exact = ref ? listings.find((l) => l.auditProductRef === ref) : undefined;
  if (exact) return { listingId: exact.id, link: 'EXPLICIT' };
  const id = pickListingForOffer(String(offer?.name ?? ''), listings.filter((l) => !l.auditProductRef));
  return id ? { listingId: id, link: 'GUESS' } : null;
}

// ── Réservation du stock ───────────────────────────────────────────
// Le décrément est fait en SQL (UPDATE … WHERE stockQty >= qty) : deux acheteurs simultanés ne peuvent pas dépasser le stock.

/** Les lignes dont la quantité est à rendre (réservées et pas encore rendues). */
export const reservedLines = (lines: unknown): { listingId: string; quantity: number }[] =>
  (Array.isArray(lines) ? lines : []).filter((l: any) => l?.reserved === true && typeof l.listingId === 'string' && Number.isInteger(l.quantity) && l.quantity > 0)
    .map((l: any) => ({ listingId: l.listingId as string, quantity: l.quantity as number }));

/** Une commande qui passe à cet état rend le stock (refus, annulation client, annulation fournisseur). */
export const releasesStock = (status: string) => status === 'REJECTED' || status === 'CANCELLED';

export class InsufficientStockError extends Error {
  constructor(public listingId: string, public product: string, public available: number | null) { super('INSUFFICIENT_STOCK'); }
}

/**
 * Retire `quantity` du stock de chaque fiche SUIVIE, dans la transaction `tx` de la création de la commande.
 * Lève InsufficientStockError (=> la transaction est annulée, rien n'est écrit) si une fiche n'a plus assez.
 * Renvoie les lignes avec `reserved: true` là où la quantité est suivie.
 */
export async function reserveStock(tx: any, lines: { listingId: string; product: string; quantity: number; unitPrice: number | null; tracked: boolean }[]): Promise<OrderLine[]> {
  const out: OrderLine[] = [];
  for (const l of lines) {
    const { tracked, ...line } = l;
    if (!tracked) { out.push(line); continue; }
    const done = await tx.productListing.updateMany({ where: { id: l.listingId, stockQty: { gte: l.quantity } }, data: { stockQty: { decrement: l.quantity } } });
    if (done.count !== 1) {
      const cur = await tx.productListing.findUnique({ where: { id: l.listingId }, select: { stockQty: true } });
      throw new InsufficientStockError(l.listingId, l.product, cur?.stockQty ?? null);
    }
    out.push({ ...line, reserved: true });
  }
  return out;
}

/** Rend le stock réservé d'une commande. À appeler DANS la même transaction que le changement d'état (qui n'a réussi qu'une fois). */
export async function releaseStock(tx: any, lines: unknown): Promise<void> {
  for (const l of reservedLines(lines)) {
    // `not: null` : si le fournisseur a cessé de suivre la quantité entre-temps, on ne la réinvente pas.
    await tx.productListing.updateMany({ where: { id: l.listingId, stockQty: { not: null } }, data: { stockQty: { increment: l.quantity } } });
  }
}
