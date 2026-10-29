import { Router } from 'express';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { isPlatformAdmin, requirePlatformAdmin } from '../middleware/requirePlatformAdmin';
import { asyncHandler } from '../lib/asyncHandler';
import { callAudit } from '../lib/auditClient';
import { siteLinkLimiter } from '../lib/security';
import { redeemSiteLinkCode, siteLinkStatus, SiteLinkError } from '../services/siteLink';
import { makeMarketAudit } from '../lib/demoAudit';
import {
  ManufacturerAlreadyLinkedError,
  isListingPublic,
  linkManufacturer,
  offersForManufacturer,
  offersForListing,
  withRoleCategory,
  setListingLike,
  BUYER_CATEGORIES,
  isBuyerCategory,
  orderBuyerTypes,
  orderEligibility,
  mayOrderForEstablishment,
  parseContact,
  parseOrderLines,
  sendMarketRequest,
  syncMarketStatus,
  toMarketDto,
  validClientKey,
  type MarketDeps,
} from '../services/market';
import { approvalIncomplete, describeApprovalChange, parseApprovalInput } from '../services/distributorApproval';
import { lotAlertConfig } from '../services/lotAlerts';
import { notifyBuyerStatus, notifyNewSale, notifySellerCancelled } from '../services/supplierNotify';
import {
  appendHistory,
  buyerAccess,
  hiddenListingIds,
  offerOrderable,
  buyerMayCancel,
  isLocalRef,
  isOrderableListing,
  listingIdOfRef,
  listingToOffer,
  newOrderReference,
  orderSummary,
  orderTotal,
  parseLocalLines,
  listingForOffer,
  sellerMayMove,
  STATUS_LABEL,
  supplierOrderEligibility,
  toBuyerDto,
  toSellerDto,
  InsufficientStockError,
  releaseStock,
  releasesStock,
  reservedLines,
  reserveStock,
} from '../services/supplierOrders';

/**
 * Commandes aux fabricants depuis /services (2026-10-24) — SANS paiement.
 *
 *   GET  /api/market/me                               mes établissements, leur catégorie d'acheteur, ce que je peux faire
 *   PUT  /api/market/establishments/:id/buyer-category  410 : la catégorie est fixée par le type d'établissement (plus de déclaration)
 *   GET  /api/market/offers?q=                        produits publiés par les fabricants (VigiCore Audit)
 *   POST /api/market/orders                           demande de commande (admin ou pharmacien d'un établissement VÉRIFIÉ autorisé)
 *   POST /api/market/interests                        demande d'intérêt (tout utilisateur connecté)
 *   GET  /api/market/requests                         mes demandes + celles des établissements que j'administre
 *   GET  /api/market/admin/buyers?status=             staff VigiCore : fournisseurs à vérifier (agrément)
 *   POST /api/market/admin/buyers/:id/review          staff VigiCore : { decision: VERIFIED | REJECTED, note, approvalNumber?, approvalDate? }
 *        approvalNumber / approvalDate : agrément du distributeur en gros (catégorie DISTRIBUTOR, avec decision VERIFIED),
 *        OPTIONNELS en V1 — obligatoire ? à confirmer (encadrant/MIPH). Absents = valeurs inchangées ; null/'' = effacées.
 *        Toute décision est écrite dans AuditEntry (refType 'establishment') dans la même transaction que la mise à jour.
 *
 * Fiche produit /services/:id (2026-10-27) :
 *   GET    /api/market/listings/:id/engagement   PUBLIC : nombre de « J'aime », le mien, offres du fabricant lié
 *                                                (un anonyme ne reçoit que « commandable oui/non », jamais d'offre ni de prix)
 *   PUT    /api/market/listings/:id/like         connecté : j'aime (idempotent) -> { likes, liked }
 *   DELETE /api/market/listings/:id/like         connecté : je n'aime plus (idempotent)
 *   GET    /api/market/admin/manufacturers       staff : fabricants d'Audit (offres) + établissements à lier
 *   PUT    /api/market/admin/manufacturers/link  staff : { establishmentId, manufacturerRef | null } (409 si déjà lié)
 *
 * Les offres et les demandes vivent chez Audit (le fabricant) ; ce routeur relaie (JWT service 60 s, scopes
 * orders:read / orders:write) et garde une archive locale (MarketRequest, jamais supprimée). Les placements
 * publicitaires payants (/api/services) sont un autre sujet et restent séparés.
 */
export const marketRouter = Router();
const db = prisma as any;
// MARKET_DEMO_OFFERS=true : Audit simulé pour les commandes (voir lib/demoAudit.ts) ; sinon le vrai Audit.
const marketAudit = makeMarketAudit(prisma, callAudit);
const deps: MarketDeps = { db: prisma, audit: marketAudit };

const fail = (res: Response, status: number, message: string, code?: string) =>
  res.status(status).json({ success: false, message, ...(code ? { code } : {}) });

const individualsAllowed = () => process.env.MARKET_ALLOW_INDIVIDUALS !== 'false';

const REASON_MESSAGE: Record<string, string> = {
  NOT_ESTABLISHMENT_ADMIN: "Seuls l'administrateur ou un pharmacien de l'établissement peuvent envoyer une demande de commande.",
  CATEGORY_NOT_DECLARED: "Le type de votre établissement ne permet pas de commander sur la plateforme : contactez le fabricant.",
  CATEGORY_NOT_VERIFIED: "La catégorie d'acheteur de votre établissement est en cours de vérification par VigiCore.",
  CATEGORY_REJECTED: "La catégorie d'acheteur déclarée n'a pas été validée. Corrigez-la pour la soumettre à nouveau.",
  CATEGORY_NOT_ALLOWED: "Votre catégorie ne permet pas d'acheter directement auprès des fabricants : adressez-vous à un distributeur.",
};

// ── Fiche produit : engagement public et « J'aime » (avant le contrôle d'accès au catalogue) ──

async function publicListing(id: string) {
  const l: any = await db.productListing.findUnique({
    where: { id },
    select: {
      id: true, title: true, status: true, reviewStatus: true, sellerKind: true, unitPrice: true, priceUnit: true, minOrderQty: true, inStock: true,
      establishmentId: true, auditProductRef: true,
      establishment: { select: { id: true, name: true, auditManufacturerRef: true, buyerCategory: true, buyerCategoryStatus: true } },
    },
  });
  return isListingPublic(l) ? l : null;
}

marketRouter.get('/listings/:id/engagement', asyncHandler(async (req, res) => {
  const listing = await publicListing(String(req.params.id));
  if (!listing) return fail(res, 404, 'Fiche introuvable.', 'NOT_FOUND');
  const user = req.user ?? null;
  const [likes, mine] = await Promise.all([
    db.listingLike.count({ where: { listingId: listing.id } }),
    user ? db.listingLike.findUnique({ where: { listingId_userId: { listingId: listing.id, userId: user.id } } }) : null,
  ]);
  const ref: string | null = listing.establishment?.auditManufacturerRef ?? null;
  // Offres : seulement pour un compte connecté autorisé au catalogue. Un anonyme ne reçoit aucun détail fabricant.
  const maySeeOffers = !!user && (user.role !== 'PATIENT' || individualsAllowed() || isPlatformAdmin(user.email));
  let offers: any[] | null = null;
  let hasOffers = false;
  let offersUnavailable = false;
  let manufacturerLinked = !!ref;
  let auditOffers: any[] | null = null; // offres Audit du fabricant, si disponibles (sert à décider si CET acheteur peut commander)

  if (listing.sellerKind === 'DISTRIBUTOR') {
    // Fiche d'un FOURNISSEUR : l'offre est locale (prix, minimum, stock de la fiche). Un anonyme apprend seulement « commandable oui/non ».
    const own = !!user && (user.affiliatedEstablishmentIds ?? []).includes(listing.establishmentId);
    const orderable = isOrderableListing(listing) && !own;
    manufacturerLinked = true;
    hasOffers = orderable;
    if (maySeeOffers) offers = orderable ? [listingToOffer(listing)] : [];
  } else if (ref) {
    const r = await fetchOffers(user?.id ?? 'site:anonymous');
    if (r.ok) {
      auditOffers = r.offers;
      // La fiche d'UN produit ne propose que CE produit — jamais le reste du catalogue du fabricant.
      const linked = offersForListing(offersForManufacturer(r.offers, ref), listing);
      hasOffers = linked.length > 0;
      if (maySeeOffers) offers = linked;
    } else {
      offersUnavailable = true;
    }
  }
  // `availableForYou` : false = ce compte ne peut pas commander ce produit (la page affiche un message clair au lieu d'un bouton qui échoue) ;
  // null = visiteur ou doute (on affiche normalement : fail-open). Le refus de commande reste fait par POST /market/orders.
  let availableForYou: boolean | null = null;
  if (user && maySeeOffers) {
    try {
      const ests = await myEstablishments(req);
      const hidden = hiddenListingIds(
        [{ id: listing.id, sellerKind: listing.sellerKind ?? null, establishmentId: listing.establishmentId, auditRef: ref, auditProductRef: listing.auditProductRef ?? null }],
        ests as any, new Set<string>(user.affiliatedEstablishmentIds ?? []), auditOffers,
      );
      availableForYou = ests.some((e: any) => e.canOrder) ? hidden.length === 0 : null;
    } catch { availableForYou = null; }
  }
  res.json({ success: true, likes, liked: !!mine, manufacturerLinked, sellerKind: listing.sellerKind ?? 'MANUFACTURER', hasOffers, offers: maySeeOffers ? offers ?? [] : null, offersUnavailable, availableForYou });
}));

async function likeHandler(req: Request, res: Response, on: boolean) {
  const listing = await publicListing(String(req.params.id));
  if (!listing) return fail(res, 404, 'Fiche introuvable.', 'NOT_FOUND');
  const state = await setListingLike(db, listing.id, req.user!.id, on);
  res.json({ success: true, ...state });
}
marketRouter.put('/listings/:id/like', requireAuth, asyncHandler((req, res) => likeHandler(req, res, true)));
marketRouter.delete('/listings/:id/like', requireAuth, asyncHandler((req, res) => likeHandler(req, res, false)));

marketRouter.use(requireAuth);
marketRouter.use((req, res, next) => {
  // Le staff VigiCore passe toujours (vérification des catégories) ; un patient seulement si la plateforme l'autorise.
  if (req.user!.role === 'PATIENT' && !individualsAllowed() && !isPlatformAdmin(req.user!.email)) {
    return fail(res, 403, "Le catalogue des fabricants est réservé aux professionnels.", 'FORBIDDEN');
  }
  next();
});

async function myEstablishments(req: Request) {
  const ids: string[] = req.user!.affiliatedEstablishmentIds ?? [];
  if (!ids.length) return [];
  const rows: any[] = await db.establishment.findMany({
    where: { id: { in: ids }, isSystemReserved: false },
    select: { id: true, name: true, type: true, buyerCategory: true, buyerCategoryStatus: true, buyerCategoryNote: true },
  });
  const admin = new Set(req.user!.adminEstablishmentIds ?? []);
  return rows.map((row) => {
    const e = withRoleCategory(row); // catégorie fixée par le type d'établissement (rôle), jamais déclarée à la main
    const isAdmin = admin.has(e.id);
    // canOrder = peut commander quelque part (fabricant OU fournisseur) ; chaque offre précise ensuite sa propre liste orderableBy.
    const access = buyerAccess(e, mayOrderForEstablishment(req.user!.role, isAdmin));
    return { ...e, isAdmin, canOrder: access.canOrder, orderBlocker: access.canOrder ? null : access.orderBlocker, canOrderFromManufacturers: access.manufacturers, canOrderFromSuppliers: access.suppliers };
  });
}

marketRouter.get('/me', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    platformAdmin: isPlatformAdmin(req.user!.email),
    orderBuyerTypes: orderBuyerTypes(),
    establishments: await myEstablishments(req),
  });
}));

// La catégorie d'acheteur n'est plus déclarée : elle découle du type d'établissement (withRoleCategory).
marketRouter.put('/establishments/:id/buyer-category', (_req, res) => {
  fail(res, 410, "La catégorie d'acheteur est fixée par le type de votre établissement : elle ne se déclare plus.", 'CATEGORY_FIXED_BY_ROLE');
});

async function fetchOffers(reporterRef: string, q?: string) {
  const qs = q ? `?q=${encodeURIComponent(q.slice(0, 100))}` : '';
  const r = await marketAudit({ method: 'GET', path: `/nexus/v1/catalogue/offers${qs}`, scope: 'orders:read', reporterRef });
  if (r.kind === 'http' && r.status === 200) return { ok: true as const, offers: (r.data?.offers ?? []) as any[] };
  console.warn('[market.offers]', JSON.stringify({ kind: r.kind, status: (r as any).status, error: (r as any).data?.error ?? (r as any).error }));
  return { ok: false as const };
}

/** Offres LOCALES des fournisseurs vérifiés (prix, minimum et stock de leurs fiches publiées et approuvées), sans les miennes. */
async function localOffers(req: Request, q?: string) {
  const mine = new Set<string>(req.user!.affiliatedEstablishmentIds ?? []);
  const rows: any[] = await db.productListing.findMany({
    where: {
      sellerKind: 'DISTRIBUTOR', status: 'PUBLISHED', reviewStatus: 'APPROVED', unitPrice: { not: null }, inStock: true,
      establishment: { buyerCategory: 'DISTRIBUTOR', buyerCategoryStatus: 'VERIFIED' },
      ...(q ? { title: { contains: q.slice(0, 100) } } : {}),
    },
    select: {
      id: true, title: true, category: true, unitPrice: true, priceUnit: true, minOrderQty: true, inStock: true, stockQty: true, establishmentId: true,
      establishment: { select: { id: true, name: true, buyerCategory: true, buyerCategoryStatus: true } },
    },
    orderBy: { title: 'asc' },
    take: 200,
  });
  return rows.filter((l) => !mine.has(l.establishmentId) && isOrderableListing(l)).map((l) => listingToOffer(l));
}

/**
 * Ajoute `listingId` (fiche publique à ouvrir) aux offres d'Audit, parmi les fiches approuvées du fabricant lié :
 * d'abord la fiche liée explicitement au produit (`auditProductRef`), sinon la fiche non liée la plus proche du nom (listingForOffer).
 */
async function withListingIds(offers: any[]): Promise<any[]> {
  try {
    const refs = Array.from(new Set(offers.map((o) => o?.manufacturer?.ref).filter((r) => typeof r === 'string' && !r.startsWith('supplier:'))));
    if (!refs.length) return offers;
    const ests: any[] = await db.establishment.findMany({ where: { auditManufacturerRef: { in: refs } }, select: { id: true, auditManufacturerRef: true } });
    if (!ests.length) return offers;
    const listings: any[] = await db.productListing.findMany({
      where: { establishmentId: { in: ests.map((e) => e.id) }, status: 'PUBLISHED', reviewStatus: 'APPROVED' },
      select: { id: true, title: true, establishmentId: true, auditProductRef: true },
      orderBy: { updatedAt: 'desc' },
    });
    const estByRef = new Map(ests.map((e) => [e.auditManufacturerRef, e.id]));
    return offers.map((o) => {
      const estId = estByRef.get(o?.manufacturer?.ref);
      if (!estId) return o;
      const hit = listingForOffer(o, listings.filter((l) => l.establishmentId === estId));
      return hit ? { ...o, listingId: hit.listingId } : o;
    });
  } catch {
    return offers; // le lien est un confort : jamais une raison de masquer le catalogue
  }
}

marketRouter.get('/offers', asyncHandler(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const [r, local, ests] = await Promise.all([fetchOffers(req.user!.id, q || undefined), localOffers(req, q || undefined), myEstablishments(req)]);
  // Le catalogue d'Audit en panne ne masque pas les produits des fournisseurs (et inversement).
  if (!r.ok && local.length === 0) return fail(res, 502, 'Le catalogue des fabricants est momentanément indisponible.', 'AUDIT_UNAVAILABLE');
  const all = [...(r.ok ? await withListingIds(r.offers) : []), ...local];
  // `orderable` : true / false / null (inconnu => on affiche). Calculé ici pour que la liste, la recherche et le comptage partent de la même base.
  res.json({ success: true, offers: all.map((o) => ({ ...o, orderable: offerOrderable(o, ests as any) })), manufacturersUnavailable: !r.ok });
}));

/**
 * Fiches du catalogue public que CET acheteur ne peut pas commander (à masquer). Le visiteur non connecté n'appelle pas cette route : il voit tout.
 * Fail-open : Audit indisponible => `partial: true` et seules les exclusions certaines (source entière) sont renvoyées.
 */
marketRouter.get('/catalogue-access', asyncHandler(async (req, res) => {
  const ests = await myEstablishments(req);
  if (!ests.some((e: any) => e.canOrder)) return res.json({ success: true, hiddenListingIds: [], partial: false });
  const rows: any[] = await db.productListing.findMany({
    where: { status: 'PUBLISHED', reviewStatus: 'APPROVED' },
    select: { id: true, sellerKind: true, establishmentId: true, auditProductRef: true, establishment: { select: { auditManufacturerRef: true } } },
  });
  const listings = rows.map((l) => ({
    id: l.id, sellerKind: l.sellerKind ?? null, establishmentId: l.establishmentId,
    auditRef: l.establishment?.auditManufacturerRef ?? null, auditProductRef: l.auditProductRef ?? null,
  }));
  const needAudit = listings.some((l) => l.sellerKind !== 'DISTRIBUTOR' && l.auditRef);
  const offers = needAudit ? await fetchOffers(req.user!.id) : null;
  const hidden = hiddenListingIds(listings, ests as any, new Set<string>(req.user!.affiliatedEstablishmentIds ?? []), offers && offers.ok ? offers.offers : null);
  res.json({ success: true, hiddenListingIds: hidden, partial: needAudit && !(offers && offers.ok) });
}));

async function existingFor(req: Request, clientRequestId: string | undefined) {
  if (!clientRequestId) return null;
  return db.marketRequest.findUnique({ where: { requesterUserId_clientRequestId: { requesterUserId: req.user!.id, clientRequestId } } });
}

/**
 * Crée la commande. `reserve` (commande ferme seulement) retire la quantité du stock des fiches SUIVIES dans la MÊME
 * transaction : tout ou rien. Chaque tentative a sa transaction : un INSERT refusé (référence déjà prise) avorterait
 * la transaction sous PostgreSQL, donc on ne réessaie jamais à l'intérieur d'une transaction.
 */
async function allocateOrderRow(kind: 'ORDER' | 'INTEREST', data: Record<string, unknown>, reserve?: { listingId: string; product: string; quantity: number; unitPrice: number | null; tracked: boolean }[]) {
  for (let i = 0; i < 5; i++) {
    try {
      return await db.$transaction(async (tx: any) => {
        const lines = reserve ? await reserveStock(tx, reserve) : data.lines;
        return tx.supplierOrder.create({ data: { ...data, lines, kind, reference: newOrderReference(kind) }, include: { sellerEstablishment: { select: { name: true } } } });
      });
    } catch (err: any) {
      if (err?.code !== 'P2002' || String(err?.meta?.target ?? '').includes('clientRequestId')) throw err; // seule la référence peut se répéter : on retire un autre code
    }
  }
  throw new Error('Could not allocate an order reference.');
}

/** Charge les fiches d'une commande locale et vérifie qu'elles sont publiques, commandables et d'UN seul fournisseur qui n'est pas l'acheteur. */
async function loadLocalListings(req: Request, refs: string[]) {
  const rows: any[] = await db.productListing.findMany({
    where: { id: { in: refs.map(listingIdOfRef) } },
    select: {
      id: true, title: true, status: true, reviewStatus: true, sellerKind: true, unitPrice: true, priceUnit: true, minOrderQty: true, inStock: true, stockQty: true, establishmentId: true,
      establishment: { select: { id: true, name: true, buyerCategory: true, buyerCategoryStatus: true } },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const listings = refs.map((r) => byId.get(listingIdOfRef(r)));
  if (listings.some((l) => !l || l.sellerKind !== 'DISTRIBUTOR' || !isListingPublic(l))) return { error: { status: 422, message: "Un produit n'est plus proposé par le fournisseur.", code: 'PRODUCT_NOT_OFFERED' } };
  if (new Set(listings.map((l) => l.establishmentId)).size !== 1) return { error: { status: 400, message: 'Une commande concerne un seul fournisseur.', code: 'VALIDATION_ERROR' } };
  if ((req.user!.affiliatedEstablishmentIds ?? []).includes(listings[0].establishmentId)) return { error: { status: 403, message: 'Vous ne pouvez pas commander chez votre propre établissement.', code: 'OWN_LISTING' } };
  return { listings };
}

async function placeSupplierOrder(req: Request, res: Response, b: any, est: any, clientRequestId: string | undefined) {
  if (clientRequestId) {
    const replay = await db.supplierOrder.findUnique({ where: { buyerUserId_clientRequestId: { buyerUserId: req.user!.id, clientRequestId } }, include: { sellerEstablishment: { select: { name: true } } } });
    if (replay) return res.status(200).json({ success: true, request: toBuyerDto(replay) });
  }
  const elig = supplierOrderEligibility(est, mayOrderForEstablishment(req.user!.role, !!est?.isAdmin));
  if (!elig.ok) return fail(res, 403, REASON_MESSAGE[elig.reason], elig.reason);
  const lines = parseLocalLines(b.lines);
  if (!lines) return fail(res, 400, 'Ajoutez au moins un produit avec une quantité entière (tous chez le même fournisseur).', 'VALIDATION_ERROR');
  const contact = parseContact(b.contact);
  if (!contact) return fail(res, 400, 'Nom et e-mail du contact obligatoires.', 'VALIDATION_ERROR');
  const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 2000) : undefined;

  const loaded: any = await loadLocalListings(req, lines.map((l) => l.productRef));
  if (loaded.error) return fail(res, loaded.error.status, loaded.error.message, loaded.error.code);
  const listings: any[] = loaded.listings;
  const seller = listings[0].establishment;
  if (seller.buyerCategory !== 'DISTRIBUTOR' || seller.buyerCategoryStatus !== 'VERIFIED') return fail(res, 422, "Ce fournisseur n'accepte pas encore de commande en ligne.", 'PRODUCT_NOT_OFFERED');
  for (const [i, l] of listings.entries()) {
    if (!isOrderableListing({ ...l, establishment: seller })) return fail(res, 422, `« ${l.title} » n'est pas disponible à la commande (prix ou stock).`, 'PRODUCT_NOT_OFFERED');
    if (lines[i].quantity < (l.minOrderQty ?? 1)) return fail(res, 400, `Quantité minimale pour « ${l.title} » : ${l.minOrderQty}.`, 'MIN_QUANTITY');
  }

  // Instantané : un changement de prix ultérieur ne réécrit jamais cette commande.
  const snapshot = listings.map((l, i) => ({ listingId: l.id, product: l.title, quantity: lines[i].quantity, unitPrice: l.unitPrice }));
  const now = new Date().toISOString();
  let row: any;
  try {
    row = await allocateOrderRow('ORDER', {
    sellerEstablishmentId: seller.id,
    buyerEstablishmentId: est.id,
    buyerUserId: req.user!.id,
    clientRequestId: clientRequestId ?? null,
    status: 'PENDING',
    summary: orderSummary(snapshot),
    lines: snapshot,
    totalAmount: orderTotal(snapshot),
    contact,
    note: note ?? null,
    history: [{ at: now, status: 'PENDING' }],
    }, listings.map((l, i) => ({ ...snapshot[i], tracked: l.stockQty != null })));
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      return res.status(409).json({
        success: false, code: 'INSUFFICIENT_STOCK', message: `Stock insuffisant pour « ${err.product} »${err.available != null ? ` (disponible : ${err.available})` : ''}.`,
        product: err.product, available: err.available,
      });
    }
    throw err;
  }
  void notifyNewSale(db, { ...row, buyerEstablishment: { name: est.name } });
  return res.status(201).json({ success: true, request: toBuyerDto(row) });
}

async function placeSupplierInterest(req: Request, res: Response, b: any, est: any, clientRequestId: string | undefined, contact: any, quantity: number | undefined, message: string | undefined) {
  if (clientRequestId) {
    const replay = await db.supplierOrder.findUnique({ where: { buyerUserId_clientRequestId: { buyerUserId: req.user!.id, clientRequestId } }, include: { sellerEstablishment: { select: { name: true } } } });
    if (replay) return res.status(200).json({ success: true, request: toBuyerDto(replay) });
  }
  const loaded: any = await loadLocalListings(req, [b.productRef.trim()]);
  if (loaded.error) return fail(res, loaded.error.status, loaded.error.message, loaded.error.code);
  const l = loaded.listings[0];
  const line = { listingId: l.id, product: l.title, quantity: quantity ?? null, unitPrice: null };
  const row = await allocateOrderRow('INTEREST', {
    sellerEstablishmentId: l.establishmentId,
    buyerEstablishmentId: est?.id ?? null,
    buyerUserId: req.user!.id,
    clientRequestId: clientRequestId ?? null,
    status: 'NEW',
    summary: `${l.title}${quantity ? ` × ${quantity}` : ''}`.slice(0, 500),
    lines: [line],
    totalAmount: null,
    contact,
    note: message ?? null,
    history: [{ at: new Date().toISOString(), status: 'NEW' }],
  });
  void notifyNewSale(db, { ...row, buyerEstablishment: est ? { name: est.name } : null });
  return res.status(201).json({ success: true, request: toBuyerDto(row) });
}

marketRouter.post('/orders', asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const clientRequestId = b.clientRequestId === undefined ? undefined : validClientKey(b.clientRequestId) ? b.clientRequestId : null;
  if (clientRequestId === null) return fail(res, 400, 'clientRequestId invalide.', 'VALIDATION_ERROR');
  const replay = await existingFor(req, clientRequestId);
  if (replay) return res.status(200).json({ success: true, request: toMarketDto(replay) });

  const establishmentId = typeof b.establishmentId === 'string' ? b.establishmentId : '';
  const est = (await myEstablishments(req)).find((e) => e.id === establishmentId) ?? null;
  // Produit d'un FOURNISSEUR (réf `local:…`) : commande locale, traitée par le fournisseur — jamais relayée à Audit.
  if (Array.isArray(b.lines) && b.lines.some((l: any) => isLocalRef(l?.productRef))) return placeSupplierOrder(req, res, b, est, clientRequestId);
  const elig = orderEligibility(est, mayOrderForEstablishment(req.user!.role, !!est?.isAdmin));
  if (!elig.ok) return fail(res, 403, REASON_MESSAGE[elig.reason], elig.reason);
  const lines = parseOrderLines(b.lines);
  if (!lines) return fail(res, 400, 'Ajoutez au moins un produit avec une quantité entière.', 'VALIDATION_ERROR');
  const contact = parseContact(b.contact);
  if (!contact) return fail(res, 400, 'Nom et e-mail du contact obligatoires.', 'VALIDATION_ERROR');
  const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 2000) : undefined;

  const offers = await fetchOffers(req.user!.id);
  if (!offers.ok) return fail(res, 502, 'Le catalogue des fabricants est momentanément indisponible.', 'AUDIT_UNAVAILABLE');
  const byRef = new Map(offers.offers.map((o) => [o.ref, o]));
  const chosen = lines.map((l) => byRef.get(l.productRef));
  if (chosen.some((o) => !o)) return fail(res, 422, "Un produit n'est plus proposé par le fabricant.", 'PRODUCT_NOT_OFFERED');
  if (new Set(chosen.map((o) => o.manufacturer?.ref)).size !== 1) return fail(res, 400, 'Une demande de commande concerne un seul fabricant.', 'VALIDATION_ERROR');
  if (chosen.some((o) => !(o.orderableBy ?? []).includes(est!.buyerCategory))) {
    return fail(res, 403, "Le fabricant n'accepte pas de commande de votre catégorie pour ce produit : envoyez une demande d'intérêt.", 'CATEGORY_NOT_ALLOWED');
  }

  const display = lines.map((l, i) => ({ product: chosen[i].name, quantity: l.quantity, unitPrice: chosen[i].unitPrice }));
  const total = Math.round(display.reduce((s, l) => s + l.quantity * (l.unitPrice ?? 0), 0) * 100) / 100;
  const id = randomUUID();
  const row = await db.marketRequest.create({
    data: {
      kind: 'ORDER',
      requesterUserId: req.user!.id,
      establishmentId: est!.id,
      clientRequestId: clientRequestId ?? null,
      idempotencyKey: `site-order-${id}`,
      summary: display.map((l) => `${l.product} × ${l.quantity}`).join(', ').slice(0, 500),
      manufacturerName: chosen[0].manufacturer?.name ?? null,
      totalAmount: total,
      payload: {
        body: {
          sourceOrderId: id,
          buyer: { ref: est!.id, name: est!.name, category: est!.buyerCategory, verified: true },
          contact,
          ...(note ? { note } : {}),
          lines,
        },
        display: { lines: display },
      },
    },
  });
  const sent = await sendMarketRequest(deps, row.id);
  res.status(201).json({ success: true, request: toMarketDto(sent ?? row) });
}));

marketRouter.post('/interests', asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const clientRequestId = b.clientRequestId === undefined ? undefined : validClientKey(b.clientRequestId) ? b.clientRequestId : null;
  if (clientRequestId === null) return fail(res, 400, 'clientRequestId invalide.', 'VALIDATION_ERROR');
  const replay = await existingFor(req, clientRequestId);
  if (replay) return res.status(200).json({ success: true, request: toMarketDto(replay) });

  const productRef = typeof b.productRef === 'string' ? b.productRef.trim() : '';
  if (!productRef || productRef.length > 100) return fail(res, 400, 'Produit requis.', 'VALIDATION_ERROR');
  const contact = parseContact(b.contact);
  if (!contact) return fail(res, 400, 'Nom et e-mail du contact obligatoires.', 'VALIDATION_ERROR');
  const quantity = b.quantity === undefined || b.quantity === null || b.quantity === '' ? undefined : Number(b.quantity);
  if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000)) return fail(res, 400, 'Quantité invalide.', 'VALIDATION_ERROR');
  const message = typeof b.message === 'string' && b.message.trim() ? b.message.trim().slice(0, 2000) : undefined;

  const est = b.establishmentId ? (await myEstablishments(req)).find((e) => e.id === b.establishmentId) ?? null : null;
  if (b.establishmentId && !est) return fail(res, 403, "Vous n'êtes pas membre de cet établissement.", 'FORBIDDEN');
  // Une catégorie qui n'a pas le droit d'acheter aux fabricants ne les contacte pas non plus.
  if (est?.orderBlocker === 'CATEGORY_NOT_ALLOWED') return fail(res, 403, REASON_MESSAGE.CATEGORY_NOT_ALLOWED, 'CATEGORY_NOT_ALLOWED');
  const buyer = est
    ? { ref: est.id, name: est.name, category: est.buyerCategory ?? 'PRIVATE_OTHER', verified: est.buyerCategoryStatus === 'VERIFIED' }
    : { ref: `user:${req.user!.id}`, name: req.user!.displayName, category: req.user!.role === 'PATIENT' ? 'INDIVIDUAL' : 'PRIVATE_OTHER', verified: false };

  if (isLocalRef(productRef)) return placeSupplierInterest(req, res, { productRef }, est, clientRequestId, contact, quantity, message);

  const offers = await fetchOffers(req.user!.id);
  if (!offers.ok) return fail(res, 502, 'Le catalogue des fabricants est momentanément indisponible.', 'AUDIT_UNAVAILABLE');
  const offer = offers.offers.find((o) => o.ref === productRef);
  if (!offer) return fail(res, 422, "Ce produit n'est plus proposé par le fabricant.", 'PRODUCT_NOT_OFFERED');

  const id = randomUUID();
  const row = await db.marketRequest.create({
    data: {
      kind: 'INTEREST',
      requesterUserId: req.user!.id,
      establishmentId: est?.id ?? null,
      clientRequestId: clientRequestId ?? null,
      idempotencyKey: `site-interest-${id}`,
      summary: `${offer.name}${quantity ? ` × ${quantity}` : ''}`.slice(0, 500),
      manufacturerName: offer.manufacturer?.name ?? null,
      // Affichée comme une demande de commande (2026-10-29) : montant indicatif au prix de l'offre.
      totalAmount: quantity && typeof offer.unitPrice === 'number' ? Math.round(quantity * offer.unitPrice * 100) / 100 : null,
      payload: {
        body: { productRef, buyer, contact, ...(quantity ? { quantity } : {}), ...(message ? { message } : {}) },
        display: { lines: [{ product: offer.name, quantity: quantity ?? null, unitPrice: typeof offer.unitPrice === 'number' ? offer.unitPrice : null }] },
      },
    },
  });
  const sent = await sendMarketRequest(deps, row.id);
  res.status(201).json({ success: true, request: toMarketDto(sent ?? row) });
}));

const TERMINAL = new Set(['DELIVERED', 'CANCELLED', 'CLOSED', 'CONVERTED']);

marketRouter.get('/requests', asyncHandler(async (req, res) => {
  const adminIds: string[] = req.user!.adminEstablishmentIds ?? [];
  const rows: any[] = await db.marketRequest.findMany({
    where: { OR: [{ requesterUserId: req.user!.id }, ...(adminIds.length ? [{ establishmentId: { in: adminIds } }] : [])] },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  // Statut chez le fabricant : relu pour les demandes encore ouvertes (au plus 10, au plus une fois par minute chacune).
  const out: any[] = [];
  let synced = 0;
  for (const r of rows) {
    if (synced < 10 && r.status === 'SENT' && !TERMINAL.has(r.auditStatus)) {
      synced++;
      try { out.push(await syncMarketStatus(deps, r)); continue; } catch { /* statut local conservé */ }
    }
    out.push(r);
  }
  // Commandes / intérêts adressés à un fournisseur : même format, donc les mêmes écrans de suivi.
  const supplierRows: any[] = await db.supplierOrder.findMany({
    where: { OR: [{ buyerUserId: req.user!.id }, ...(adminIds.length ? [{ buyerEstablishmentId: { in: adminIds } }] : [])] },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { sellerEstablishment: { select: { name: true } } },
  });
  const merged = [...out.map(toMarketDto), ...supplierRows.map(toBuyerDto)]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 80);
  res.json({ success: true, requests: merged });
}));

// ── Commandes REÇUES par un fournisseur (ses clients) + annulation côté acheteur ──────────────

const SALES_FILTERS = new Set(['ORDER', 'INTEREST']);
/** Sociétés pour lesquelles l'utilisateur traite les ventes : compte FOURNISSEUR, administrateur OU employé (affiliation ACTIVE). */
const sellerEstablishmentIds = (req: Request): string[] => (req.user!.role === 'FOURNISSEUR' ? req.user!.affiliatedEstablishmentIds ?? [] : []);
const SELLER_INCLUDE = { buyerEstablishment: { select: { name: true, type: true, buyerCategory: true, buyerCategoryStatus: true } } };

marketRouter.get('/sales', asyncHandler(async (req, res) => {
  const ids = sellerEstablishmentIds(req);
  if (!ids.length) return fail(res, 403, 'Réservé aux comptes fournisseur.', 'FORBIDDEN');
  const kind = typeof req.query.kind === 'string' && SALES_FILTERS.has(req.query.kind) ? req.query.kind : undefined;
  const rows: any[] = await db.supplierOrder.findMany({
    where: { sellerEstablishmentId: { in: ids }, ...(kind ? { kind } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: SELLER_INCLUDE,
  });
  const orders = rows.filter((r) => r.kind === 'ORDER');
  const count = (st: string) => orders.filter((r) => r.status === st).length;
  res.json({
    success: true,
    sales: rows.map(toSellerDto),
    counts: { pending: count('PENDING'), confirmed: count('CONFIRMED'), shipped: count('SHIPPED'), delivered: count('DELIVERED'), newInterests: rows.filter((r) => r.kind === 'INTEREST' && r.status === 'NEW').length },
    statusLabels: STATUS_LABEL,
  });
}));

marketRouter.post('/sales/:id/status', asyncHandler(async (req, res) => {
  const ids = sellerEstablishmentIds(req);
  const row: any = ids.length ? await db.supplierOrder.findFirst({ where: { id: String(req.params.id), sellerEstablishmentId: { in: ids } } }) : null;
  if (!row) return fail(res, 404, 'Commande introuvable.', 'NOT_FOUND'); // celle d'un autre fournisseur répond comme une commande inexistante
  const next = typeof req.body?.status === 'string' ? req.body.status : '';
  if (!sellerMayMove(row.kind, row.status, next)) return fail(res, 409, `Passage impossible : « ${STATUS_LABEL[row.status] ?? row.status} » → « ${STATUS_LABEL[next] ?? next} ».`, 'INVALID_TRANSITION');
  const note = typeof req.body?.note === 'string' && req.body.note.trim() ? req.body.note.trim().slice(0, 500) : null;
  if ((next === 'REJECTED' || next === 'CANCELLED') && !note) return fail(res, 400, 'Indiquez un motif pour le client.', 'VALIDATION_ERROR');
  const now = new Date();
  // Atomique : si l'état a changé entre-temps (autre onglet, annulation du client), rien n'est écrit.
  // Même transaction : le changement d'état ET le retour du stock réussissent ensemble ou pas du tout (et une seule fois :
  // le garde `status: row.status` empêche qu'une 2e requête concurrente rende deux fois la quantité).
  const done = await db.$transaction(async (tx: any) => {
    const r = await tx.supplierOrder.updateMany({
      where: { id: row.id, status: row.status },
      data: { status: next, ...(note ? { sellerNote: note } : {}), history: appendHistory(row.history, { at: now.toISOString(), status: next, note }) },
    });
    if (r.count === 1 && releasesStock(next)) await releaseStock(tx, row.lines);
    return r;
  });
  if (done.count !== 1) return fail(res, 409, 'Cette commande vient de changer : rechargez la liste.', 'CONFLICT');
  const fresh: any = await db.supplierOrder.findUnique({ where: { id: row.id }, include: { ...SELLER_INCLUDE, sellerEstablishment: { select: { name: true } } } });
  void notifyBuyerStatus(db, fresh);
  console.info('[market.sale]', JSON.stringify({ orderId: row.id, kind: row.kind, from: row.status, to: next, by: req.user!.id }));
  res.json({ success: true, sale: toSellerDto(fresh) });
}));

marketRouter.post('/requests/:id/cancel', asyncHandler(async (req, res) => {
  const adminIds: string[] = req.user!.adminEstablishmentIds ?? [];
  const row: any = await db.supplierOrder.findFirst({
    where: { id: String(req.params.id), OR: [{ buyerUserId: req.user!.id }, ...(adminIds.length ? [{ buyerEstablishmentId: { in: adminIds } }] : [])] },
  });
  if (!row) return fail(res, 404, 'Commande introuvable.', 'NOT_FOUND');
  if (!buyerMayCancel(row.kind, row.status)) return fail(res, 409, "Cette commande ne peut plus être annulée : le fournisseur l'a déjà traitée.", 'INVALID_TRANSITION');
  const done = await db.$transaction(async (tx: any) => {
    const r = await tx.supplierOrder.updateMany({
      where: { id: row.id, status: 'PENDING' },
      data: { status: 'CANCELLED', history: appendHistory(row.history, { at: new Date().toISOString(), status: 'CANCELLED', note: 'Annulée par le client' }) },
    });
    if (r.count === 1) await releaseStock(tx, row.lines);
    return r;
  });
  if (done.count !== 1) return fail(res, 409, "Cette commande ne peut plus être annulée : le fournisseur l'a déjà traitée.", 'INVALID_TRANSITION');
  const fresh: any = await db.supplierOrder.findUnique({ where: { id: row.id }, include: { sellerEstablishment: { select: { name: true } }, buyerEstablishment: { select: { name: true } } } });
  void notifySellerCancelled(db, { ...fresh, restocked: reservedLines(row.lines).length > 0 });
  res.json({ success: true, request: toBuyerDto(fresh) });
}));

// ── Alertes de retrait de lot (étape 3) : seulement celles dont l'utilisateur est DESTINATAIRE ──
// Cadre à confirmer (encadrant/MIPH). Détection par relecture périodique : PAS instantané. Seul le statut du lot est exposé.

marketRouter.get('/lot-alerts', asyncHandler(async (req, res) => {
  const me = req.user!.id;
  const recs: any[] = await db.marketLotAlertRecipient.findMany({ where: { userId: me }, orderBy: { createdAt: 'desc' }, take: 50 });
  const unread: number = await db.marketLotAlertRecipient.count({ where: { userId: me, readAt: null } });
  const alerts: any[] = recs.length ? await db.marketLotAlert.findMany({ where: { id: { in: recs.map((r) => r.alertId) } } }) : [];
  const byId = new Map(alerts.map((a) => [a.id, a]));
  const instruction = lotAlertConfig().instruction;
  res.json({
    success: true,
    unread,
    alerts: recs.flatMap((r) => {
      const a = byId.get(r.alertId);
      if (!a) return [];
      return [{
        id: a.id, event: a.event, productName: a.productName, lotNumber: a.lotNumber, manufacturer: a.manufacturerName ?? null,
        instruction: a.event === 'WITHDRAWN' ? instruction : null,
        detectedAt: new Date(a.detectedAt).toISOString(), read: !!r.readAt,
      }];
    }),
  });
}));

marketRouter.post('/lot-alerts/read-all', asyncHandler(async (req, res) => {
  const r = await db.marketLotAlertRecipient.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ success: true, updated: r.count });
}));

marketRouter.post('/lot-alerts/:id/read', asyncHandler(async (req, res) => {
  // Recherche par (alerte, utilisateur courant) : l'alerte d'un autre utilisateur ou établissement répond 404, comme une alerte inexistante.
  const rec: any = await db.marketLotAlertRecipient.findFirst({ where: { alertId: String(req.params.id), userId: req.user!.id } });
  if (!rec) return fail(res, 404, 'Alerte introuvable.', 'NOT_FOUND');
  if (!rec.readAt) await db.marketLotAlertRecipient.update({ where: { id: rec.id }, data: { readAt: new Date() } });
  res.json({ success: true });
}));

// ── Staff VigiCore : vérification des catégories d'acheteurs ──────

marketRouter.get('/admin/buyers', requirePlatformAdmin, asyncHandler(async (req, res) => {
  const status = typeof req.query.status === 'string' && ['DECLARED', 'VERIFIED', 'REJECTED'].includes(req.query.status) ? req.query.status : undefined;
  const rows: any[] = await db.establishment.findMany({
    where: { buyerCategoryStatus: status ?? { not: null }, isSystemReserved: false, type: 'SUPPLIER' }, // seuls les fournisseurs ont une catégorie à vérifier (agrément)
    orderBy: { buyerCategoryDeclaredAt: 'desc' },
    take: 200,
    select: {
      id: true, name: true, type: true, buyerCategory: true, buyerCategoryStatus: true, buyerCategoryNote: true,
      buyerCategoryDeclaredAt: true, buyerCategoryDeclaredBy: true, buyerCategoryReviewedAt: true, buyerCategoryReviewedBy: true,
      approvalNumber: true, approvalDate: true,
    },
  });
  const userIds = Array.from(new Set(rows.map((r) => r.buyerCategoryDeclaredBy).filter(Boolean)));
  const users: any[] = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true, email: true } }) : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  res.json({
    success: true,
    categories: BUYER_CATEGORIES,
    buyers: rows.map((r) => ({ ...r, declaredBy: byId.get(r.buyerCategoryDeclaredBy) ?? null, buyerCategoryDeclaredBy: undefined, approvalIncomplete: approvalIncomplete(r) })),
  });
}));

marketRouter.post('/admin/buyers/:id/review', requirePlatformAdmin, asyncHandler(async (req, res) => {
  const decision = req.body?.decision;
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : '';
  if (decision !== 'VERIFIED' && decision !== 'REJECTED') return fail(res, 400, 'Décision invalide.', 'VALIDATION_ERROR');
  if (decision === 'REJECTED' && !note) return fail(res, 400, "Indiquez le motif du refus : l'établissement le verra.", 'VALIDATION_ERROR');
  // Agrément du distributeur (optionnel en V1 — obligatoire ? à confirmer : encadrant/MIPH).
  const approval = parseApprovalInput(req.body);
  if (!approval.ok) return fail(res, 400, approval.message, 'VALIDATION_ERROR');
  const touchesApproval = approval.number !== undefined || approval.date !== undefined;
  if (touchesApproval && decision !== 'VERIFIED') return fail(res, 400, "L'agrément ne se renseigne qu'avec une vérification (VERIFIED).", 'VALIDATION_ERROR');
  const est: any = await db.establishment.findFirst({ where: { id: String(req.params.id), isSystemReserved: false, type: 'SUPPLIER' } });
  if (!est || !est.buyerCategory) return fail(res, 404, 'Déclaration introuvable.', 'NOT_FOUND');
  if (touchesApproval && est.buyerCategory !== 'DISTRIBUTOR') return fail(res, 400, "L'agrément ne concerne que la catégorie « Distributeur en gros ».", 'VALIDATION_ERROR');

  const data: Record<string, unknown> = { buyerCategoryStatus: decision, buyerCategoryNote: note || null, buyerCategoryReviewedAt: new Date(), buyerCategoryReviewedBy: req.user!.email };
  if (approval.number !== undefined) data.approvalNumber = approval.number;
  if (approval.date !== undefined) data.approvalDate = approval.date;
  const after = { approvalNumber: approval.number !== undefined ? approval.number : est.approvalNumber, approvalDate: approval.date !== undefined ? approval.date : est.approvalDate };
  const approvalText = describeApprovalChange(est, after);
  // Journal d'audit : ni motif libre, ni e-mail — l'établissement visé (refId) et la décision uniquement.
  const action = `Catégorie d'acheteur ${est.buyerCategory} : ${est.buyerCategoryStatus ?? '—'} → ${decision}${approvalText ? ` ; ${approvalText}` : ''}`;

  // Mise à jour + AuditEntry dans UNE transaction : pas d'écriture du staff sans trace (si le journal échoue, rien n'est modifié).
  const updated = await db.$transaction(async (tx: any) => {
    const row = await tx.establishment.update({
      where: { id: est.id },
      data,
      select: { id: true, buyerCategory: true, buyerCategoryStatus: true, buyerCategoryNote: true, buyerCategoryReviewedAt: true, approvalNumber: true, approvalDate: true },
    });
    await tx.auditEntry.create({
      data: { actorUserId: req.user!.id, actorName: req.user!.displayName, establishmentId: null, refType: 'establishment', refId: est.id, action },
    });
    return row;
  });
  console.info('[market.buyerReview]', JSON.stringify({ establishmentId: est.id, category: est.buyerCategory, from: est.buyerCategoryStatus, to: decision, by: req.user!.id, approvalChanged: !!approvalText }));
  res.json({ success: true, buyer: { ...updated, approvalIncomplete: approvalIncomplete(updated) } });
}));

// ── Activation de MON organisation par code d'Audit (administrateur de l'établissement) ──
// Le code est présenté au VRAI Audit (jamais au mode démo) : il prouve la propriété de l'organisation Audit.

const mayLinkEstablishment = (req: Request, id: string) =>
  isPlatformAdmin(req.user!.email) || (req.user!.adminEstablishmentIds ?? []).includes(id);

marketRouter.get('/establishments/:id/audit-link', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!mayLinkEstablishment(req, id)) return fail(res, 403, "Réservé à l'administrateur de l'établissement.", 'FORBIDDEN');
  const est: any = await db.establishment.findFirst({ where: { id, isSystemReserved: false }, select: { auditManufacturerRef: true, auditManufacturerLinkedAt: true } });
  if (!est) return fail(res, 404, 'Établissement introuvable.', 'NOT_FOUND');
  res.json({ success: true, ...siteLinkStatus(est) });
}));

marketRouter.post('/establishments/:id/audit-link', siteLinkLimiter, asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!mayLinkEstablishment(req, id)) return fail(res, 403, "Réservé à l'administrateur de l'établissement.", 'FORBIDDEN');
  try {
    const out = await redeemSiteLinkCode({ db, audit: callAudit }, { establishmentId: id, code: req.body?.code, userId: req.user!.id, by: req.user!.email });
    console.info('[market.siteLink]', JSON.stringify({ establishmentId: id, by: req.user!.id }));
    res.json({ success: true, linked: true, manufacturerName: out.manufacturer.name });
  } catch (err) {
    if (err instanceof SiteLinkError) return fail(res, err.status, err.message, err.code);
    throw err;
  }
}));

// ── Staff VigiCore : lien établissement (fiche produit) -> fabricant d'Audit ──

marketRouter.get('/admin/manufacturers', requirePlatformAdmin, asyncHandler(async (req, res) => {
  const [r, establishments] = await Promise.all([
    fetchOffers(req.user!.id),
    db.establishment.findMany({
      where: { isSystemReserved: false, OR: [{ type: { in: ['LABORATOIRE', 'SUPPLIER'] } }, { auditManufacturerRef: { not: null } }] },
      select: { id: true, name: true, type: true, auditManufacturerRef: true, auditManufacturerLinkedAt: true, auditManufacturerLinkedBy: true },
      orderBy: { name: 'asc' },
      take: 500,
    }),
  ]);
  const byRef = new Map<string, { ref: string; name: string; offers: number }>();
  for (const o of r.ok ? r.offers : []) {
    const ref = o?.manufacturer?.ref;
    if (!ref) continue;
    const m = byRef.get(ref) ?? { ref, name: o.manufacturer.name ?? ref, offers: 0 };
    m.offers++;
    byRef.set(ref, m);
  }
  res.json({
    success: true,
    manufacturersUnavailable: !r.ok,
    manufacturers: [...byRef.values()].sort((a, b) => a.name.localeCompare(b.name)),
    establishments,
  });
}));

marketRouter.put('/admin/manufacturers/link', requirePlatformAdmin, asyncHandler(async (req, res) => {
  const establishmentId = typeof req.body?.establishmentId === 'string' ? req.body.establishmentId : '';
  const raw = req.body?.manufacturerRef;
  const manufacturerRef = raw === null || raw === '' ? null : typeof raw === 'string' && raw.trim().length <= 100 ? raw.trim() : undefined;
  if (!establishmentId || manufacturerRef === undefined) return fail(res, 400, 'Établissement et fabricant requis.', 'VALIDATION_ERROR');
  const est: any = await db.establishment.findFirst({ where: { id: establishmentId, isSystemReserved: false }, select: { id: true } });
  if (!est) return fail(res, 404, 'Établissement introuvable.', 'NOT_FOUND');
  if (manufacturerRef) {
    // On ne lie qu'un fabricant connu d'Audit (il publie au moins une offre) : évite une faute de frappe silencieuse.
    const r = await fetchOffers(req.user!.id);
    if (!r.ok) return fail(res, 502, "VigiCore Audit est momentanément injoignable.", 'AUDIT_UNAVAILABLE');
    if (!r.offers.some((o) => o?.manufacturer?.ref === manufacturerRef)) return fail(res, 422, "Ce fabricant ne publie aucune offre dans VigiCore Audit.", 'UNKNOWN_MANUFACTURER');
  }
  try {
    const updated = await linkManufacturer(db, { establishmentId, manufacturerRef, by: req.user!.email });
    console.info('[market.manufacturerLink]', JSON.stringify({ establishmentId, manufacturerRef, by: req.user!.id }));
    res.json({ success: true, establishment: updated });
  } catch (err) {
    if (err instanceof ManufacturerAlreadyLinkedError) {
      return fail(res, 409, err.establishmentName ? `Ce fabricant est déjà lié à « ${err.establishmentName} ».` : 'Ce fabricant est déjà lié à un autre établissement.', 'MANUFACTURER_ALREADY_LINKED');
    }
    throw err;
  }
}));
