/**
 * Commandes aux fabricants depuis /services — logique pure + outbox (2026-10-24). AUCUN paiement.
 *
 *  - DEMANDE DE COMMANDE : seulement un administrateur d'un établissement dont la catégorie d'acheteur est
 *    VÉRIFIÉE par le staff VigiCore et autorisée (distributeur en gros, établissement public, export —
 *    configurable : MARKET_ORDER_BUYER_TYPES). Le fabricant (rôle COMMERCIAL dans VigiCore Audit) confirme
 *    en affectant les lots, ou annule.
 *  - DEMANDE D'INTÉRÊT : tout utilisateur connecté (pharmacie ou clinique privée, praticien, particulier…).
 *    Ce n'est pas une commande : aucun prix figé, aucun stock réservé.
 * Audit reste l'autorité (catégories autorisées par produit, prix, stock) : ce module ne fait que pré-vérifier
 * pour afficher un message clair, puis relaie. Même règle d'or que les déclarations : la ligne est écrite
 * AVANT l'envoi, SENT seulement après confirmation d'Audit, renvois automatiques sinon. Rien n'est supprimé.
 *
 * Types seulement depuis @prisma/client : testable sans `prisma generate`.
 */
import type { PrismaClient } from '@prisma/client';
import type { AuditTransport } from '../lib/auditClient';
import { backoffMs, MAX_AUTO_ATTEMPTS } from './submissions';

export const BUYER_CATEGORIES = ['DISTRIBUTOR', 'PUBLIC_INSTITUTION', 'EXPORT', 'PRIVATE_PHARMACY', 'PRIVATE_CLINIC', 'PRIVATE_OTHER'] as const;
export type BuyerCategory = (typeof BUYER_CATEGORIES)[number] | 'INDIVIDUAL';
export const isBuyerCategory = (v: unknown): v is BuyerCategory => typeof v === 'string' && (BUYER_CATEGORIES as readonly string[]).includes(v);

const DEFAULT_ORDER_TYPES = ['DISTRIBUTOR', 'PUBLIC_INSTITUTION', 'EXPORT'];
/** Catégories qui peuvent COMMANDER (même variable et même défaut que côté Audit). */
export function orderBuyerTypes(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.MARKET_ORDER_BUYER_TYPES;
  if (!raw || !raw.trim()) return [...DEFAULT_ORDER_TYPES];
  return Array.from(new Set(raw.split(',').map((x) => x.trim().toUpperCase()).filter(isBuyerCategory)));
}

/**
 * Catégorie d'acheteur FIXÉE par le type d'établissement (donc par le rôle du compte) — plus de déclaration manuelle.
 *  Hôpital -> établissement public ; clinique -> clinique privée ; officine -> pharmacie privée ;
 *  centre médical / laboratoire -> autre privé. Un établissement validé à son inscription n'a rien à faire vérifier.
 * SUPPLIER : la catégorie stockée est gardée — un fournisseur (rôle FOURNISSEUR) est DISTRIBUTOR dès l'inscription,
 * vérifié par le staff sur son agrément ; un fabricant (aucune catégorie) ne passe pas commande.
 */
export const CATEGORY_BY_ESTABLISHMENT_TYPE: Record<string, BuyerCategory> = {
  HOSPITAL: 'PUBLIC_INSTITUTION',
  CLINIQUE: 'PRIVATE_CLINIC',
  OFFICINE: 'PRIVATE_PHARMACY',
  CENTRE_MEDICAL: 'PRIVATE_OTHER',
  LABORATOIRE: 'PRIVATE_OTHER',
};

export function withRoleCategory<T extends { type?: string | null; buyerCategory?: string | null; buyerCategoryStatus?: string | null; buyerCategoryNote?: string | null }>(e: T): T {
  const fixed = e.type ? CATEGORY_BY_ESTABLISHMENT_TYPE[e.type] : undefined;
  if (fixed) return { ...e, buyerCategory: fixed, buyerCategoryStatus: 'VERIFIED', buyerCategoryNote: null };
  if (e.type === 'SUPPLIER') return e;
  return { ...e, buyerCategory: null, buyerCategoryStatus: null, buyerCategoryNote: null }; // SYSTEM, type inconnu : n'achète pas
}

export interface MarketEstablishment {
  id: string;
  name: string;
  buyerCategory: string | null;
  buyerCategoryStatus: string | null;
}
/**
 * Qui agit pour l'établissement : son administrateur OU un pharmacien affilié (c'est lui qui achète réellement).
 * L'affiliation est déjà garantie par la liste des établissements du compte ; la catégorie reste vérifiée par VigiCore.
 */
export const mayOrderForEstablishment = (role: string | undefined, isAdmin: boolean): boolean => isAdmin || role === 'PHARMACIEN';

/** Peut-il envoyer une DEMANDE DE COMMANDE au nom de cet établissement ? (pré-vérification ; Audit tranche)
 *  `isAdmin` = « a le droit d'agir » (administrateur ou pharmacien, voir mayOrderForEstablishment). */
export function orderEligibility(est: MarketEstablishment | null, isAdmin: boolean, env = process.env): { ok: true } | { ok: false; reason: string } {
  if (!est || !isAdmin) return { ok: false, reason: 'NOT_ESTABLISHMENT_ADMIN' };
  if (!est.buyerCategory || !est.buyerCategoryStatus) return { ok: false, reason: 'CATEGORY_NOT_DECLARED' };
  if (est.buyerCategoryStatus === 'REJECTED') return { ok: false, reason: 'CATEGORY_REJECTED' };
  // Catégorie non autorisée à commander (ex. clinique privée) : on le dit tout de suite, SANS promettre
  // « vous pourrez commander dès la validation » — la validation ne changerait rien.
  if (!orderBuyerTypes(env).includes(est.buyerCategory)) return { ok: false, reason: 'CATEGORY_NOT_ALLOWED' };
  if (est.buyerCategoryStatus !== 'VERIFIED') return { ok: false, reason: 'CATEGORY_NOT_VERIFIED' };
  return { ok: true };
}

export interface MarketDeps {
  db: PrismaClient;
  audit: AuditTransport;
  now?: () => Date;
}

const KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;
export const validClientKey = (v: unknown): v is string => typeof v === 'string' && KEY_RE.test(v);

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : undefined);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface Contact { name: string; email: string; phone?: string }
export function parseContact(c: any): Contact | null {
  const name = str(c?.name, 200);
  const email = str(c?.email, 200);
  const phone = c?.phone === undefined || c?.phone === '' ? undefined : str(c?.phone, 40);
  if (!name || !email || !EMAIL_RE.test(email)) return null;
  if (c?.phone && !phone) return null;
  return { name, email, ...(phone ? { phone } : {}) };
}

export function parseOrderLines(lines: unknown): { productRef: string; quantity: number }[] | null {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 20) return null;
  const out: { productRef: string; quantity: number }[] = [];
  const seen = new Set<string>();
  for (const l of lines as any[]) {
    const productRef = str(l?.productRef, 100);
    const quantity = l?.quantity;
    if (!productRef || seen.has(productRef) || !Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000) return null;
    seen.add(productRef);
    out.push({ productRef, quantity });
  }
  return out;
}

// ── Envoi (outbox) ─────────────────────────────────────────────────

const REFUSAL_LABEL: Record<string, string> = {
  BUYER_NOT_ALLOWED: "Le fabricant n'accepte pas de commande de cette catégorie d'acheteur pour ce produit.",
  PRODUCT_NOT_OFFERED: "Ce produit n'est plus proposé par le fabricant.",
  VALIDATION_ERROR: 'Demande refusée : données invalides.',
  IDEMPOTENCY_CONFLICT: 'Demande déjà reçue avec un contenu différent.',
};
export const refusalLabel = (code: string | null | undefined) => (code && REFUSAL_LABEL[code]) || 'Demande refusée par le fabricant.';

function appendHistory(history: unknown, entry: { at: string; status: string }) {
  const list = Array.isArray(history) ? history.slice(-49) : [];
  return [...list, entry];
}

/** Envoie UNE demande et enregistre le résultat. Sûr à rappeler : Audit est idempotent sur `idempotencyKey`. */
export async function sendMarketRequest(deps: MarketDeps, id: string) {
  const now = (deps.now ?? (() => new Date()))();
  const r: any = await (deps.db as any).marketRequest.findUnique({ where: { id } });
  if (!r) return null;
  if (r.status !== 'PENDING') return r;

  const isOrder = r.kind === 'ORDER';
  const result = await deps.audit({
    method: 'POST',
    path: isOrder ? '/nexus/v1/orders' : '/nexus/v1/interests',
    scope: 'orders:write',
    reporterRef: r.requesterUserId,
    idempotencyKey: r.idempotencyKey,
    body: (r.payload ?? {}).body, // ce qui part chez Audit (schéma strict) ; `display` reste local
  });
  const attempts = r.attempts + 1;
  const ref = result.kind === 'http' ? (isOrder ? result.data?.orderRef : result.data?.interestRef) : null;

  if (result.kind === 'http' && (result.status === 200 || result.status === 201) && ref) {
    const auditStatus = String(result.data.status ?? (isOrder ? 'PENDING' : 'NEW'));
    return (deps.db as any).marketRequest.update({
      where: { id: r.id },
      data: {
        status: 'SENT',
        attempts,
        auditRef: String(ref),
        auditStatus,
        manufacturerName: result.data.manufacturer ? String(result.data.manufacturer).slice(0, 200) : r.manufacturerName,
        ...(isOrder && typeof result.data.totalAmount === 'number' ? { totalAmount: result.data.totalAmount } : {}),
        history: appendHistory(r.history, { at: now.toISOString(), status: auditStatus }),
        sentAt: now,
        statusSyncedAt: now,
        failureReason: null,
        lastError: null,
        nextAttemptAt: null,
      },
    });
  }
  if (result.kind === 'http' && [400, 403, 409, 422].includes(result.status) && result.data?.error && result.data.error !== 'FORBIDDEN_SCOPE') {
    return (deps.db as any).marketRequest.update({
      where: { id: r.id },
      data: { status: 'REJECTED', attempts, failureReason: String(result.data.error), lastError: result.data?.reason ? String(result.data.reason).slice(0, 200) : null, nextAttemptAt: null },
    });
  }
  // Tout le reste : envoi NON confirmé -> on garde et on réessaiera (FAILED quand les renvois automatiques sont épuisés).
  const exhausted = attempts >= MAX_AUTO_ATTEMPTS;
  return (deps.db as any).marketRequest.update({
    where: { id: r.id },
    data: {
      status: exhausted ? 'FAILED' : 'PENDING',
      attempts,
      lastError: result.kind === 'network' ? result.error.slice(0, 200) : `HTTP_${result.status}`,
      failureReason: exhausted ? 'AUDIT_UNAVAILABLE' : null,
      nextAttemptAt: exhausted ? null : new Date(now.getTime() + backoffMs(attempts)),
    },
  });
}

/** Reprise automatique des PENDING arrivés à échéance (balayage du serveur). */
export async function retryDueMarketRequests(deps: MarketDeps, limit = 20): Promise<number> {
  const now = (deps.now ?? (() => new Date()))();
  const due: any[] = await (deps.db as any).marketRequest.findMany({
    where: { status: 'PENDING', nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
  });
  for (const r of due) await sendMarketRequest(deps, r.id);
  return due.length;
}

export const SYNC_MIN_INTERVAL_MS = 60_000;

/** Relit chez Audit le statut d'une demande ENVOYÉE (confirmée, livrée, contactée…) ; ajoute le changement à l'historique. */
export async function syncMarketStatus(deps: MarketDeps, r: any) {
  const now = (deps.now ?? (() => new Date()))();
  if (r.status !== 'SENT' || !r.auditRef) return r;
  if (r.statusSyncedAt && now.getTime() - new Date(r.statusSyncedAt).getTime() < SYNC_MIN_INTERVAL_MS) return r;
  const isOrder = r.kind === 'ORDER';
  const res = await deps.audit({
    method: 'GET',
    path: `/nexus/v1/${isOrder ? 'orders' : 'interests'}/${encodeURIComponent(r.auditRef)}`,
    scope: 'orders:read',
    reporterRef: r.requesterUserId,
  });
  if (res.kind !== 'http' || res.status !== 200 || !res.data?.status) return r;
  const next = String(res.data.status);
  const data: Record<string, unknown> = { statusSyncedAt: now };
  if (next !== r.auditStatus) {
    data.auditStatus = next;
    data.history = appendHistory(r.history, { at: now.toISOString(), status: next });
  }
  // Lignes confirmées (lots) : commande, ou demande passée par le canal « intérêt » qu'Audit a transformée en commande.
  if (Array.isArray(res.data.lines)) data.payload = { ...(r.payload ?? {}), confirmedLines: res.data.lines.slice(0, 20) };
  if (!isOrder && typeof res.data.totalAmount === 'number') data.totalAmount = res.data.totalAmount;
  return (deps.db as any).marketRequest.update({ where: { id: r.id }, data });
}

/**
 * Côté acheteur il n'existe QU'UNE notion : la demande de commande (2026-10-29). Une demande envoyée par le canal
 * « intérêt » (acheteur non habilité) devient chez Audit une commande « En attente » : on l'affiche comme telle.
 * Anciens statuts d'intérêt (avant que Audit ne renvoie le statut de la commande) traduits en statuts de commande.
 */
const INTEREST_AS_ORDER: Record<string, string> = { NEW: 'PENDING', CONTACTED: 'PENDING', CONVERTED: 'CONFIRMED', CLOSED: 'CANCELLED' };
export const buyerStatus = (kind: string, status: string | null | undefined) =>
  status == null ? null : kind === 'INTEREST' ? INTEREST_AS_ORDER[status] ?? status : status;

export function toMarketDto(r: any) {
  const p = (r.payload ?? {}) as any;
  return {
    id: r.id,
    kind: 'ORDER', // une seule notion côté acheteur ; le canal technique reste dans `channel`
    channel: r.kind, // ORDER | INTEREST
    establishmentId: r.establishmentId ?? null,
    summary: r.summary,
    manufacturer: r.manufacturerName ?? null,
    totalAmount: r.totalAmount ?? null,
    currency: 'DZD',
    // État côté Site (envoi) puis côté fabricant (traitement).
    delivery: r.status, // PENDING | SENT | REJECTED | FAILED
    // true = demande SIMULÉE (mode démo, MARKET_DEMO_OFFERS) : jamais transmise à Audit, donc jamais vue par le commercial.
    demo: typeof r.auditRef === 'string' && r.auditRef.startsWith('DEMO-'),
    status: buyerStatus(r.kind, r.auditStatus), // PENDING | CONFIRMED | DELIVERED | CANCELLED
    refusal: r.status === 'REJECTED' ? refusalLabel(r.failureReason) : null,
    lines: (p.confirmedLines ?? p.display?.lines ?? []).map((l: any) => ({
      product: l.product ?? l.productLabel ?? null,
      quantity: l.quantity,
      unitPrice: l.unitPrice ?? null,
      lotNumber: l.lotNumber ?? null,
      expiryDate: l.expiryDate ?? null,
      // Statut du lot côté fabricant (étape 3) : absent des anciens confirmedLines => null, jamais d'erreur.
      lotStatus: l.lotStatus === 'ACTIVE' || l.lotStatus === 'WITHDRAWN' ? l.lotStatus : null,
    })),
    history: Array.isArray(r.history) ? r.history : [],
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
  };
}

// ── Fiche produit : visibilité, offres du fabricant lié, « J'aime », lien fabricant (2026-10-27) ──

/** Une fiche est publique quand l'organisation l'a PUBLIÉE et que le staff l'a APPROUVÉE (catalogue gratuit — même règle que GET /api/services). Le paiement n'est plus requis. */
export function isListingPublic(l: { status?: string | null; reviewStatus?: string | null } | null | undefined): boolean {
  return !!l && l.status === 'PUBLISHED' && l.reviewStatus === 'APPROVED';
}

/** Offres d'Audit du SEUL fabricant lié à l'établissement de la fiche (aucun lien = aucune offre). */
export function offersForManufacturer<T extends { manufacturer?: { ref?: string } | null }>(offers: T[], manufacturerRef: string | null | undefined): T[] {
  if (!manufacturerRef) return [];
  return offers.filter((o) => o?.manufacturer?.ref === manufacturerRef);
}

const normName = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Offres que la fiche d'UN produit peut commander : CE produit seulement, jamais le reste du catalogue du fabricant.
 *  1. Fiche liée (`auditProductRef`) : l'offre de même ref — ou rien si elle n'est plus proposée.
 *  2. Fiche non liée : l'offre au nom STRICTEMENT identique au titre (accents, casse et espaces ignorés), si elle est unique.
 *  Aucun rapprochement approximatif : une commande sur le mauvais produit est pire que pas de commande (reste « Contacter »).
 */
export function offersForListing<T extends { ref?: unknown; name?: unknown }>(offers: T[], listing: { title?: string | null; auditProductRef?: string | null }): T[] {
  if (listing.auditProductRef) return offers.filter((o) => o?.ref === listing.auditProductRef);
  const want = normName(listing.title);
  if (!want) return [];
  const same = offers.filter((o) => normName(o?.name) === want);
  return same.length === 1 ? same : [];
}

/** « J'aime » idempotent : on=true ajoute (sans doublon), on=false retire ; renvoie l'état final. */
export async function setListingLike(db: any, listingId: string, userId: string, on: boolean): Promise<{ likes: number; liked: boolean }> {
  if (on) {
    try {
      await db.listingLike.upsert({
        where: { listingId_userId: { listingId, userId } },
        update: {},
        create: { listingId, userId },
      });
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err; // deux clics simultanés : l'autre requête l'a déjà créé
    }
  } else {
    await db.listingLike.deleteMany({ where: { listingId, userId } });
  }
  const likes = await db.listingLike.count({ where: { listingId } });
  return { likes, liked: on };
}

export class ManufacturerAlreadyLinkedError extends Error {
  constructor(public readonly establishmentName: string) { super('MANUFACTURER_ALREADY_LINKED'); }
}

/** Lie (ref) ou délie (null) un établissement à un fabricant d'Audit. 409 si le fabricant est déjà lié ailleurs. */
export async function linkManufacturer(db: any, input: { establishmentId: string; manufacturerRef: string | null; by: string; now?: Date }) {
  const ref = input.manufacturerRef?.trim() || null;
  if (ref) {
    const other = await db.establishment.findFirst({ where: { auditManufacturerRef: ref, NOT: { id: input.establishmentId } }, select: { id: true, name: true } });
    if (other) throw new ManufacturerAlreadyLinkedError(other.name);
  }
  try {
    return await db.establishment.update({
      where: { id: input.establishmentId },
      data: ref
        ? { auditManufacturerRef: ref, auditManufacturerLinkedAt: input.now ?? new Date(), auditManufacturerLinkedBy: input.by }
        : { auditManufacturerRef: null, auditManufacturerLinkedAt: null, auditManufacturerLinkedBy: null },
      select: { id: true, name: true, type: true, auditManufacturerRef: true, auditManufacturerLinkedAt: true },
    });
  } catch (err: any) {
    if (err?.code === 'P2002') throw new ManufacturerAlreadyLinkedError('');
    throw err;
  }
}
