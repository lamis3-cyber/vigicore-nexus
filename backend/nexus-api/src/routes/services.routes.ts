import { Router } from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { OrderStatus, PlacementOrder, ProductListing } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { isPlatformAdmin, requirePlatformAdmin } from '../middleware/requirePlatformAdmin';
import {
  canCreateListingFor,
  canManageListing,
  canViewListingPublicly,
} from '../auth/servicesAuthz';
import {
  computeQuote,
  CURRENCY,
  DURATIONS,
  getPlacement,
  listingLimitFor,
  placementRank,
  PLACEMENTS,
} from '../services/pricing';
import { generateOrderReference, getPaymentMethods } from '../services/payments';
import { parseSellingTerms } from '../services/supplierOrders';
import {
  activateOrder,
  effectivePlacement,
  effectiveStatus,
  findActiveHolder,
  isListingLive,
  isPaidWindowActive,
  OrderNotFoundError,
  OrderStateError,
  PlacementConflictError,
} from '../services/placements';
import {
  approveListing,
  countPublished,
  isMaterialChange,
  ListingLimitError,
  ListingReviewError,
  publishListing,
  rejectListing,
} from '../services/listingReview';
import { callAudit } from '../lib/auditClient';
import { makeMarketAudit } from '../lib/demoAudit';
import {
  checkProductRef,
  findLinkConflict,
  linkChanged,
  linkConflictBody,
  parseProductRef,
  productsOfManufacturer,
  productNameMatches,
  productMismatchBody,
  toAuditProduct,
} from '../services/listingProductLink';
import { notifyListingForReview, reviewQueueEntry } from '../services/reviewNotify';

export const servicesRouter = Router();

/** Express 4 doesn't catch rejected promises — forward them to the error middleware. */
const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

const LISTING_FIELDS = [
  'title',
  'summary',
  'description',
  'category',
  'imageUrl',
  'imageZoom',
  'imageFocusX',
  'imageFocusY',
  'imageFit',
  'imageAccent',
  'logoUrl',
  'logoShape',
  'logoPlacement',
  'coverSide',
  'certifications',
  'contactEmail',
  'contactPhone',
  'website',
] as const;

const clampPct = (n: unknown, def: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(200, Math.max(0, Math.round(v))) : def;
};

// Only ever a CSS hex colour picked from an <input type="color">
// (#rrggbb) — anything else is dropped rather than trusted from the client.
const isHexColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

const LOGO_SHAPES = ['hexagon', 'circle', 'square'];
const LOGO_PLACEMENTS = ['seam', 'photo'];
const COVER_SIDES = ['left', 'right'];

// Logo = a small raster picture sent as a data URL (or an http(s) link). SVG is refused on purpose.
const isLogoSrc = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 400_000 && /^(data:image\/(png|jpeg|webp);base64,|https?:\/\/)/.test(v);

/** Up to 3 short seal labels, stored as a JSON array in a TEXT column. */
function serializeCerts(v: unknown): string | null {
  let list: unknown = v;
  if (typeof v === 'string') {
    try { list = JSON.parse(v); } catch { list = []; }
  }
  if (!Array.isArray(list)) return null;
  const clean = list
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim().slice(0, 24))
    .filter(Boolean)
    .slice(0, 3);
  return clean.length ? JSON.stringify(clean) : null;
}

function parseCerts(v: string | null | undefined): string[] {
  if (!v) return [];
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? a.filter((x) => typeof x === 'string').slice(0, 3) : [];
  } catch {
    return [];
  }
}

function pickListingInput(body: any) {
  const out: Record<string, unknown> = {};
  for (const field of LISTING_FIELDS) {
    if (body?.[field] !== undefined) out[field] = body[field];
  }
  // Framing only makes sense alongside an image, and bad values would break
  // the CSS background-position/-size on every card, so they're clamped here
  // rather than trusted from the client.
  if (out.imageZoom !== undefined) out.imageZoom = clampPct(out.imageZoom, 100);
  if (out.imageFocusX !== undefined) out.imageFocusX = clampPct(out.imageFocusX, 50);
  if (out.imageFocusY !== undefined) out.imageFocusY = clampPct(out.imageFocusY, 50);
  if (out.imageFit !== undefined && out.imageFit !== 'cover' && out.imageFit !== 'contain') out.imageFit = 'cover';
  if (out.imageAccent !== undefined && out.imageAccent !== 'transparent' && !isHexColor(out.imageAccent)) out.imageAccent = null;
  // Featured-partner look: whitelisted values only, anything else falls back to the default.
  if (out.logoUrl !== undefined) out.logoUrl = isLogoSrc(out.logoUrl) ? out.logoUrl : null;
  if (out.logoShape !== undefined && !LOGO_SHAPES.includes(out.logoShape as string)) out.logoShape = 'hexagon';
  if (out.logoPlacement !== undefined && !LOGO_PLACEMENTS.includes(out.logoPlacement as string)) out.logoPlacement = 'seam';
  if (out.coverSide !== undefined && !COVER_SIDES.includes(out.coverSide as string)) out.coverSide = 'left';
  if (out.certifications !== undefined) out.certifications = serializeCerts(out.certifications);
  return out;
}

function requesterOf(req: Request) {
  return {
    userId: req.user!.id,
    role: req.user!.role as any,
    affiliatedEstablishmentIds: req.user!.affiliatedEstablishmentIds,
    adminEstablishmentIds: req.user!.adminEstablishmentIds,
  };
}

/**
 * Loads a listing the requester may manage. Sends the 404/403 itself and
 * returns null when the handler should stop.
 */
async function loadManageableListing(req: Request, res: Response, action: string) {
  const listing = await prisma.productListing.findUnique({ where: { id: req.params.id } });
  if (!listing) {
    res.status(404).json({ success: false, message: 'Listing not found.' });
    return null;
  }
  if (!canManageListing(requesterOf(req), listing)) {
    res.status(403).json({ success: false, message: `You cannot ${action} this listing.` });
    return null;
  }
  return listing;
}

// --- lien fiche -> produit Audit ------------------------------------------------

// Même transport que /api/market (MARKET_DEMO_OFFERS=true => Audit simulé), pour que la liste déroulante et la
// vérification voient exactement les offres que voit le catalogue.
const marketAudit = makeMarketAudit(prisma, callAudit);

/** Toutes les offres du catalogue Audit, ou null si Audit ne répond pas correctement. */
async function fetchAuditOffers(reporterRef: string): Promise<any[] | null> {
  try {
    const r = await marketAudit({ method: 'GET', path: '/nexus/v1/catalogue/offers', scope: 'orders:read', reporterRef });
    if (r.kind === 'http' && r.status === 200) return Array.isArray(r.data?.offers) ? r.data.offers : [];
    console.warn('[services.auditProducts]', JSON.stringify({ kind: r.kind, status: (r as any).status }));
  } catch (err) {
    console.warn('[services.auditProducts]', String((err as Error)?.message ?? err));
  }
  return null;
}

async function manufacturerRefOf(establishmentId: string): Promise<string | null> {
  const est: any = await prisma.establishment.findUnique({ where: { id: establishmentId }, select: { auditManufacturerRef: true } });
  return est?.auditManufacturerRef ?? null;
}

/**
 * Vérifie un NOUVEAU lien (le produit appartient au fabricant lié à l'établissement) puis l'absence de doublon actif.
 * Envoie la réponse d'erreur elle-même et renvoie false quand la route doit s'arrêter.
 */
async function verifyNewLink(
  req: Request,
  res: Response,
  l: { establishmentId: string; sellerKind: string | null | undefined; ref: string; excludeListingId?: string; archived?: boolean; title?: string | null }
): Promise<boolean> {
  const manufacturerRef = l.sellerKind === 'DISTRIBUTOR' ? null : await manufacturerRefOf(l.establishmentId);
  const offers = l.sellerKind !== 'DISTRIBUTOR' && manufacturerRef ? await fetchAuditOffers(req.user!.id) : null;
  const check = checkProductRef(l.ref, { sellerKind: l.sellerKind, manufacturerRef, offers });
  if (!check.ok) {
    res.status(check.status).json({ success: false, code: check.code, message: check.message });
    return false;
  }
  // Cohérence fiche ↔ produit (2026-10-29) : un lien vers un produit sans rapport est refusé, sauf confirmation explicite.
  const offer = (offers ?? []).find((o) => o?.ref === l.ref && o?.manufacturer?.ref === manufacturerRef);
  if (offer && l.title && !productNameMatches(l.title, offer) && req.body?.confirmProductMismatch !== true) {
    res.status(409).json(productMismatchBody(l.title, toAuditProduct(offer)));
    return false;
  }
  // Une fiche qui reste archivée ne bloque personne : pas de contrôle de doublon pour elle.
  return l.archived ? true : verifyNoConflict(res, l.establishmentId, l.ref, l.excludeListingId);
}

async function verifyNoConflict(res: Response, establishmentId: string, ref: string, excludeListingId?: string): Promise<boolean> {
  const other = await findLinkConflict(prisma, establishmentId, ref, excludeListingId);
  if (other) {
    res.status(409).json(linkConflictBody(other));
    return false;
  }
  return true;
}

// --- serializers -------------------------------------------------------------

/** What the anonymous public page may see — no author id, no order data. */
function toPublicListing(l: ProductListing & { establishment: { name: string } }, now = new Date()) {
  return {
    id: l.id,
    establishmentId: l.establishmentId,
    orgName: l.establishment.name,
    title: l.title,
    summary: l.summary,
    description: l.description,
    category: l.category,
    imageUrl: l.imageUrl,
    imageZoom: l.imageZoom,
    imageFocusX: l.imageFocusX,
    imageFocusY: l.imageFocusY,
    imageFit: l.imageFit,
    imageAccent: l.imageAccent,
    logoUrl: l.logoUrl,
    logoShape: l.logoShape,
    logoPlacement: l.logoPlacement,
    coverSide: l.coverSide,
    certifications: parseCerts(l.certifications),
    contactEmail: l.contactEmail,
    contactPhone: l.contactPhone,
    website: l.website,
    // MANUFACTURER | DISTRIBUTOR : lets the public page show whose product it is. Never the price (professionals only).
    sellerKind: l.sellerKind,
    // The tier shown RIGHT NOW: an ended paid period reads STANDARD (free catalog), never the old tier.
    placement: effectivePlacement(l, now),
    updatedAt: l.updatedAt,
  };
}

function toOrderDto(order: Omit<PlacementOrder, 'receiptImage'> & { receiptImage?: string | null }) {
  const method = getPaymentMethods().find((m) => m.id === order.paymentMethod);
  return {
    id: order.id,
    reference: order.reference,
    placement: order.placement,
    months: order.months,
    subtotal: order.subtotal,
    discount: order.discount,
    total: order.total,
    currency: CURRENCY,
    paymentMethod: order.paymentMethod,
    status: order.status,
    createdAt: order.createdAt,
    instructions: method?.instructions ?? null,
    receiptSent: !!order.receiptAt,
    adminNote: order.adminNote,
    invoiceNo: order.invoiceNo,
  };
}

/**
 * The owner's view. `status` is the effective dashboard state (DRAFT / PENDING_REVIEW / REJECTED /
 * PUBLISHED / ARCHIVED); `placement`/`placementUntil` stay the raw paid window so the dashboard can
 * say "ended on …, back in the free catalog"; `paidActive` says whether that window is running.
 */
function toOwnerListing(l: ProductListing, pendingOrder: PlacementOrder | null, now = new Date()) {
  return {
    ...l,
    certifications: parseCerts(l.certifications),
    status: effectiveStatus(l),
    rawStatus: l.status,
    live: isListingLive(l),
    paidActive: isPaidWindowActive(l, now),
    pendingOrder: pendingOrder ? toOrderDto(pendingOrder) : null,
  };
}

// --- public ------------------------------------------------------------------

/**
 * GET /api/services/pricing — public. The dashboard renders exactly this, so
 * the price a customer sees is the price the server charges.
 */
servicesRouter.get(
  '/pricing',
  wrap(async (_req, res) => {
    const featured = await findActiveHolder(prisma, 'FEATURED');
    return res.json({
      success: true,
      currency: CURRENCY,
      freeListingLimit: listingLimitFor(),
      placements: PLACEMENTS,
      durations: DURATIONS,
      paymentMethods: getPaymentMethods().map(({ instructions: _i, ...m }) => m),
      // When set, the exclusive FEATURED slot is occupied until this date.
      featuredTakenUntil: featured?.placementUntil ?? null,
      featuredHolderId: featured?.id ?? null,
    });
  })
);

/**
 * GET /api/services — public. Listings the organization published AND staff approved (free catalog);
 * a running paid tier lifts a product into its row. Higher tiers first, then most recently updated.
 * Optional ?establishmentId=
 */
servicesRouter.get(
  '/',
  wrap(async (req, res) => {
    const { establishmentId } = req.query;
    const rows = await prisma.productListing.findMany({
      where: {
        status: 'PUBLISHED',
        reviewStatus: 'APPROVED',
        ...(typeof establishmentId === 'string' ? { establishmentId } : {}),
      },
      include: { establishment: { select: { name: true } } },
    });
    const now = new Date();
    rows.sort(
      (a, b) =>
        placementRank(effectivePlacement(b, now)) - placementRank(effectivePlacement(a, now)) ||
        b.updatedAt.getTime() - a.updatedAt.getTime()
    );
    return res.json({ success: true, listings: rows.map((r) => toPublicListing(r, now)) });
  })
);

// --- owner -------------------------------------------------------------------

/**
 * GET /api/services/mine — auth required. Every listing (any status) of the
 * logged-in admin's establishment(s).
 * Registered before /:id so "mine" is never matched as an id.
 */
servicesRouter.get(
  '/mine',
  requireAuth,
  wrap(async (req, res) => {
    const establishmentIds = req.user!.affiliatedEstablishmentIds;
    if (establishmentIds.length === 0) {
      return res.json({ success: true, listings: [], freeListingLimit: listingLimitFor(), publishedCount: 0 });
    }
    const listings = await prisma.productListing.findMany({
      where: { establishmentId: { in: establishmentIds } },
      orderBy: { updatedAt: 'desc' },
    });
    const pending = await prisma.placementOrder.findMany({
      where: { listingId: { in: listings.map((l) => l.id) }, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    return res.json({
      success: true,
      freeListingLimit: listingLimitFor(),
      publishedCount: listings.filter((l) => l.status === 'PUBLISHED').length,
      listings: listings.map((l) =>
        toOwnerListing(l, pending.find((o) => o.listingId === l.id) ?? null, now)
      ),
    });
  })
);

/**
 * GET /api/services/audit-products — auth required. Les produits d'Audit du fabricant lié à l'établissement
 * (?establishmentId=, par défaut l'établissement actif), pour la liste déroulante « Produit lié dans Audit » de ProductStudio.
 * Chaque produit indique la fiche active qui l'utilise déjà (linkedListing), pour griser le choix.
 *   manufacturerLinked=false : l'établissement n'est pas encore lié à un fabricant d'Audit (le staff doit le lier).
 *   available=false          : Audit injoignable ; la fiche peut être enregistrée sans lien et liée plus tard.
 */
servicesRouter.get(
  '/audit-products',
  requireAuth,
  wrap(async (req, res) => {
    const asked = typeof req.query.establishmentId === 'string' ? req.query.establishmentId : null;
    const establishmentId = asked ?? req.user!.activeEstablishmentId ?? null;
    if (!establishmentId || !req.user!.affiliatedEstablishmentIds.includes(establishmentId)) {
      return res.status(403).json({ success: false, message: 'You are not a member of this organization.' });
    }
    // Un fournisseur ne vend pas de produit Audit : la liste est vide, la page n'affiche pas le champ.
    if (req.user!.role === 'FOURNISSEUR') {
      return res.json({ success: true, applicable: false, manufacturerLinked: false, available: true, products: [] });
    }
    const manufacturerRef = await manufacturerRefOf(establishmentId);
    if (!manufacturerRef) {
      return res.json({ success: true, applicable: true, manufacturerLinked: false, available: true, products: [] });
    }
    const offers = await fetchAuditOffers(req.user!.id);
    if (!offers) {
      return res.json({ success: true, applicable: true, manufacturerLinked: true, available: false, products: [] });
    }
    const products = productsOfManufacturer(offers, manufacturerRef);
    const used: any[] = products.length
      ? await prisma.productListing.findMany({
          where: { establishmentId, auditProductRef: { in: products.map((p) => p.ref) }, status: { not: 'ARCHIVED' } },
          select: { id: true, title: true, status: true, auditProductRef: true },
        })
      : [];
    return res.json({
      success: true,
      applicable: true,
      manufacturerLinked: true,
      available: true,
      products: products.map((p) => {
        const l = used.find((u) => u.auditProductRef === p.ref);
        return { ...p, linkedListing: l ? { id: l.id, title: l.title, status: l.status } : null };
      }),
    });
  })
);

/** Owner: visit counters per listing for the last ?days= (default 30) + a 7-day views series. */
servicesRouter.get(
  '/stats',
  requireAuth,
  wrap(async (req, res) => {
    const ids = req.user!.affiliatedEstablishmentIds;
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
    const since = dayKey(Date.now() - (days - 1) * 86_400_000);
    const last7 = Array.from({ length: 7 }, (_, i) => dayKey(Date.now() - (6 - i) * 86_400_000));
    const rows = ids.length
      ? await prisma.listingStat.findMany({
          where: { day: { gte: since }, listing: { establishmentId: { in: ids } } },
        })
      : [];
    const stats: Record<string, { views: number; clicks: number; contacts: number; series: number[] }> = {};
    for (const r of rows) {
      const s = (stats[r.listingId] ??= { views: 0, clicks: 0, contacts: 0, series: Array(7).fill(0) });
      s.views += r.views;
      s.clicks += r.clicks;
      s.contacts += r.contacts;
      const i = last7.indexOf(r.day);
      if (i >= 0) s.series[i] = r.views;
    }
    return res.json({ success: true, days, stats });
  })
);

/** Owner: every payment order of the organization(s), newest first — kept even after a product is deleted. */
servicesRouter.get(
  '/orders',
  requireAuth,
  wrap(async (req, res) => {
    // Payments of the company: a FOURNISSEUR employee does not see them (administrators only).
    const ids = req.user!.role === 'FOURNISSEUR' ? req.user!.adminEstablishmentIds : req.user!.affiliatedEstablishmentIds;
    const orders = ids.length
      ? await prisma.placementOrder.findMany({
          where: { establishmentId: { in: ids } },
          orderBy: { createdAt: 'desc' },
          take: 200,
          omit: { receiptImage: true },
        })
      : [];
    return res.json({
      success: true,
      orders: orders.map((o) => ({ ...toOrderDto(o), listingId: o.listingId, listingTitle: o.listingTitle, paidAt: o.paidAt })),
    });
  })
);

const EVENT_FIELD = { view: 'views', click: 'clicks', contact: 'contacts' } as const;

/**
 * POST /api/services/:id/event — public, fire-and-forget. Body: { type: 'view'|'click'|'contact' }.
 * Only counts for listings that are public right now; always answers 204 so it can never break the page.
 */
servicesRouter.post(
  '/:id/event',
  wrap(async (req, res) => {
    const field = EVENT_FIELD[req.body?.type as keyof typeof EVENT_FIELD];
    if (!field) return res.status(400).json({ success: false, message: 'Unknown event type.' });
    const listing = await prisma.productListing.findUnique({ where: { id: req.params.id } });
    if (listing && isListingLive(listing)) {
      const day = new Date().toISOString().slice(0, 10);
      await prisma.listingStat.upsert({
        where: { listingId_day: { listingId: listing.id, day } },
        create: { listingId: listing.id, day, [field]: 1 },
        update: { [field]: { increment: 1 } },
      });
    }
    return res.status(204).end();
  })
);

// --- payments review (staff) + receipts + invoices -----------------------------

const RECEIPT_MAX_CHARS = 2_500_000; // ≈ 1.8 MB of image once base64-decoded
const ORDER_STATUSES = ['PENDING', 'PAID', 'CANCELLED'] as const;

/** Seller identity required on an Algerian invoice (to be confirmed by the owner's accountant/legal adviser). */
const INVOICE_SELLER_REQUIRED = ['INVOICE_SELLER_NAME', 'INVOICE_SELLER_ADDRESS', 'INVOICE_SELLER_NIF', 'INVOICE_SELLER_RC', 'INVOICE_SELLER_NIS'] as const;
export function missingInvoiceSellerFields(env: NodeJS.ProcessEnv = process.env): string[] {
  return INVOICE_SELLER_REQUIRED.filter((k) => !env[k]?.trim());
}

/** Sequential legal invoice number, allocated once per PAID order (FAC-2026-00001). */
async function ensureInvoiceNo(order: { id: string; invoiceNo: string | null; paidAt: Date | null }): Promise<string> {
  if (order.invoiceNo) return order.invoiceNo;
  const year = (order.paidAt ?? new Date()).getUTCFullYear();
  for (let i = 0; i < 5; i++) {
    const n = await prisma.placementOrder.count({ where: { invoiceNo: { startsWith: `FAC-${year}-` } } });
    const candidate = `FAC-${year}-${String(n + 1 + i).padStart(5, '0')}`;
    try {
      const r = await prisma.placementOrder.updateMany({ where: { id: order.id, invoiceNo: null }, data: { invoiceNo: candidate } });
      if (r.count === 1) return candidate;
      const fresh = await prisma.placementOrder.findUnique({ where: { id: order.id } });
      if (fresh?.invoiceNo) return fresh.invoiceNo;
    } catch {
      /* unique clash with a concurrent invoice — try the next number */
    }
  }
  throw new Error('Could not allocate an invoice number.');
}

// --- product review (staff) -------------------------------------------------------

const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;

/**
 * Staff: products to review. ?review=PENDING (default) | APPROVED | REJECTED | all.
 * Drafts are never shown: a product is reviewed once the organization has published it.
 */
servicesRouter.get(
  '/admin/listings',
  requireAuth,
  requirePlatformAdmin,
  wrap(async (req, res) => {
    const raw = String(req.query.review ?? 'PENDING').toUpperCase();
    const review = (REVIEW_STATUSES as readonly string[]).includes(raw) ? (raw as (typeof REVIEW_STATUSES)[number]) : null;
    const rows = await prisma.productListing.findMany({
      where: { status: review === 'PENDING' ? 'PUBLISHED' : { not: 'DRAFT' }, ...(review ? { reviewStatus: review } : {}) },
      orderBy: { updatedAt: 'asc' }, // oldest first: the longest-waiting product is reviewed first
      take: 300,
      include: {
        establishment: { select: { name: true, auditManufacturerRef: true } },
        createdBy: { select: { displayName: true, email: true } },
      },
    });
    const now = new Date();
    // Produit Audit lié : nom lisible pour le staff + contrôle qu'il appartient toujours au fabricant de l'établissement.
    // Audit n'est appelé que si au moins une fiche est liée ; en panne => auditProductCheck 'UNKNOWN', la liste reste utilisable.
    const offers = rows.some((l) => l.auditProductRef) ? await fetchAuditOffers(req.user!.id) : null;
    const linkInfo = (l: (typeof rows)[number]) => {
      if (!l.auditProductRef) return { auditProduct: null, auditProductCheck: null };
      if (!offers) return { auditProduct: null, auditProductCheck: 'UNKNOWN' as const };
      const o = offers.find((x) => x?.ref === l.auditProductRef && x?.manufacturer?.ref === l.establishment.auditManufacturerRef);
      // auditProductMismatch : le titre de la fiche ne correspond pas au produit lié (à vérifier avant de valider).
      return o
        ? { auditProduct: toAuditProduct(o), auditProductCheck: 'OK' as const, auditProductMismatch: !productNameMatches(l.title, o) }
        : { auditProduct: null, auditProductCheck: 'NOT_FOUND' as const };
    };
    return res.json({
      success: true,
      listings: rows.map((l) => ({
        id: l.id,
        title: l.title,
        summary: l.summary,
        description: l.description,
        category: l.category,
        imageUrl: l.imageUrl,
        contactEmail: l.contactEmail,
        contactPhone: l.contactPhone,
        website: l.website,
        status: l.status,
        reviewStatus: l.reviewStatus,
        reviewNote: l.reviewNote,
        reviewedAt: l.reviewedAt,
        promoAllowed: l.promoAllowed,
        paidActive: isPaidWindowActive(l, now),
        placement: l.placement,
        placementUntil: l.placementUntil,
        updatedAt: l.updatedAt,
        sellerKind: l.sellerKind,
        auditProductRef: l.auditProductRef,
        ...linkInfo(l),
        organization: l.establishment.name,
        requestedBy: { name: l.createdBy.displayName, email: l.createdBy.email },
      })),
    });
  })
);

/** Staff: the product information is acceptable. Body: { allowPromotion?: boolean } (default false). */
servicesRouter.post(
  '/admin/listings/:id/approve',
  requireAuth,
  requirePlatformAdmin,
  wrap(async (req, res) => {
    try {
      const listing = await approveListing(prisma, req.params.id, req.body?.allowPromotion === true);
      return res.json({ success: true, listing: toOwnerListing(listing, null) });
    } catch (err) {
      if (err instanceof ListingReviewError) return res.status(404).json({ success: false, message: err.message });
      throw err;
    }
  })
);

/** Staff: refuse the product with a reason the organization will see. Body: { note }. */
servicesRouter.post(
  '/admin/listings/:id/reject',
  requireAuth,
  requirePlatformAdmin,
  wrap(async (req, res) => {
    const note = typeof req.body?.note === 'string' ? req.body.note : '';
    if (!note.trim()) {
      return res.status(400).json({ success: false, message: 'Add a short reason so the organization knows what to fix.' });
    }
    try {
      const listing = await rejectListing(prisma, req.params.id, note);
      return res.json({ success: true, listing: toOwnerListing(listing, null) });
    } catch (err) {
      if (err instanceof ListingReviewError) return res.status(404).json({ success: false, message: err.message });
      throw err;
    }
  })
);

/** Staff: orders of every organization. ?status=PENDING (default) | PAID | CANCELLED | all */
servicesRouter.get(
  '/admin/orders',
  requireAuth,
  requirePlatformAdmin,
  wrap(async (req, res) => {
    const raw = String(req.query.status ?? 'PENDING').toUpperCase();
    const where = (ORDER_STATUSES as readonly string[]).includes(raw) ? { status: raw as OrderStatus } : {};
    const orders = await prisma.placementOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 300,
      omit: { receiptImage: true },
      include: {
        establishment: { select: { name: true } },
        createdBy: { select: { displayName: true, email: true } },
      },
    });
    return res.json({
      success: true,
      orders: orders.map((o) => ({
        ...toOrderDto(o),
        listingId: o.listingId,
        listingTitle: o.listingTitle,
        paidAt: o.paidAt,
        receiptAt: o.receiptAt,
        organization: o.establishment.name,
        requestedBy: { name: o.createdBy.displayName, email: o.createdBy.email },
      })),
    });
  })
);

/** Staff: the uploaded proof of payment of one order. */
servicesRouter.get(
  '/admin/orders/:id/receipt',
  requireAuth,
  requirePlatformAdmin,
  wrap(async (req, res) => {
    const order = await prisma.placementOrder.findUnique({ where: { id: req.params.id }, select: { receiptImage: true } });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    if (!order.receiptImage) return res.status(404).json({ success: false, message: 'No receipt was uploaded for this order.' });
    return res.json({ success: true, image: order.receiptImage });
  })
);

/** Staff: money arrived → mark PAID and publish the listing (same code path as `npm run order:confirm`). */
servicesRouter.post(
  '/admin/orders/:id/confirm',
  requireAuth,
  requirePlatformAdmin,
  wrap(async (req, res) => {
    try {
      const { order, alreadyPaid } = await activateOrder(prisma, { id: req.params.id });
      return res.json({ success: true, alreadyPaid, order: toOrderDto(order) });
    } catch (err) {
      if (err instanceof OrderNotFoundError) return res.status(404).json({ success: false, message: err.message });
      if (err instanceof OrderStateError || err instanceof PlacementConflictError) {
        return res.status(409).json({ success: false, message: err.message });
      }
      throw err;
    }
  })
);

/** Staff: payment not found / wrong amount → cancel the order with a reason the organization will see. */
servicesRouter.post(
  '/admin/orders/:id/reject',
  requireAuth,
  requirePlatformAdmin,
  wrap(async (req, res) => {
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : '';
    if (!note) {
      return res.status(400).json({ success: false, message: 'Add a short reason so the organization knows what to fix.' });
    }
    const order = await prisma.placementOrder.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    if (order.status !== 'PENDING') {
      return res.status(409).json({ success: false, message: 'Only orders awaiting payment can be rejected.' });
    }
    const updated = await prisma.placementOrder.update({ where: { id: order.id }, data: { status: 'CANCELLED', adminNote: note } });
    return res.json({ success: true, order: toOrderDto(updated) });
  })
);

/** Owner: attach the proof of transfer (PNG/JPG/WebP data URL) to a pending order. */
servicesRouter.post(
  '/orders/:id/receipt',
  requireAuth,
  wrap(async (req, res) => {
    const order = await prisma.placementOrder.findUnique({ where: { id: req.params.id }, select: { id: true, status: true, establishmentId: true } });
    if (!order || !req.user!.affiliatedEstablishmentIds.includes(order.establishmentId)) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    if (order.status !== 'PENDING') {
      return res.status(409).json({ success: false, message: 'This order is no longer awaiting payment.' });
    }
    const image = req.body?.image;
    if (typeof image !== 'string' || !/^data:image\/(png|jpe?g|webp);base64,/.test(image)) {
      return res.status(400).json({ success: false, message: 'Send the receipt as a PNG, JPG or WebP image.' });
    }
    if (image.length > RECEIPT_MAX_CHARS) {
      return res.status(413).json({ success: false, message: 'The receipt image is too large (max about 1.8 MB).' });
    }
    const receiptAt = new Date();
    await prisma.placementOrder.update({ where: { id: order.id }, data: { receiptImage: image, receiptAt } });
    return res.json({ success: true, receiptAt });
  })
);

/** Owner (or staff): invoice data of a PAID order. The number is allocated on first request. */
servicesRouter.get(
  '/orders/:id/invoice',
  requireAuth,
  wrap(async (req, res) => {
    const order = await prisma.placementOrder.findUnique({
      where: { id: req.params.id },
      omit: { receiptImage: true },
      include: { establishment: { select: { name: true } } },
    });
    const allowed = !!order && (isPlatformAdmin(req.user!.email) || req.user!.affiliatedEstablishmentIds.includes(order.establishmentId));
    if (!order || !allowed) return res.status(404).json({ success: false, message: 'Order not found.' });
    if (order.status !== 'PAID' || !order.paidAt) {
      return res.status(409).json({ success: false, message: 'An invoice is issued once the payment is confirmed.' });
    }
    const env = process.env;
    // A legal invoice never goes out with invented or blank seller identity: check BEFORE allocating the sequential number.
    const missing = missingInvoiceSellerFields(env);
    if (missing.length) {
      return res.status(503).json({
        success: false,
        code: 'INVOICE_SELLER_INCOMPLETE',
        message: 'Invoices are not available until the seller legal details are configured by the operator.',
        missing,
      });
    }
    const invoiceNo = await ensureInvoiceNo(order);
    const rate = Number(env.INVOICE_VAT_RATE ?? 0);
    const vat = rate > 0 ? (() => { const ht = Math.round(order.total / (1 + rate / 100)); return { rate, ht, amount: order.total - ht }; })() : null;
    const method = getPaymentMethods().find((m) => m.id === order.paymentMethod);
    return res.json({
      success: true,
      invoice: {
        invoiceNo,
        issuedAt: order.paidAt,
        currency: CURRENCY,
        seller: {
          name: env.INVOICE_SELLER_NAME!.trim(),
          address: env.INVOICE_SELLER_ADDRESS!.trim(),
          nif: env.INVOICE_SELLER_NIF!.trim(),
          rc: env.INVOICE_SELLER_RC!.trim(),
          nis: env.INVOICE_SELLER_NIS!.trim(),
          contact: env.INVOICE_SELLER_CONTACT || '',
        },
        buyer: { name: order.establishment.name },
        line: {
          description: `Placement « ${getPlacement(order.placement)?.name ?? order.placement} » — ${order.listingTitle}`,
          months: order.months,
        },
        subtotal: order.subtotal,
        discount: order.discount,
        total: order.total,
        vat,
        payment: { method: method?.name ?? order.paymentMethod, reference: order.reference },
      },
    });
  })
);

/** GET /api/services/:id — public while live, otherwise only for its managers. */
servicesRouter.get(
  '/:id',
  wrap(async (req, res) => {
    const listing = await prisma.productListing.findUnique({
      where: { id: req.params.id },
      include: { establishment: { select: { name: true } } },
    });
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found.' });
    }

    if (canViewListingPublicly(listing) && isListingLive(listing)) {
      return res.json({ success: true, listing: toPublicListing(listing) });
    }

    if (req.user && canManageListing(requesterOf(req), listing)) {
      const { establishment: _e, ...own } = listing;
      return res.json({ success: true, listing: toOwnerListing(own, null) });
    }

    return res.status(404).json({ success: false, message: 'Listing not found.' });
  })
);

const NOT_PUBLISHABLE_MESSAGE =
  'A new product is saved as a draft. Publish it with POST /api/services/:id/publish; it goes public once VigiCore approves it.';

/** Maps the free-catalog errors to HTTP answers. Returns true when it handled the error. */
function sendPublishError(res: Response, err: unknown): boolean {
  if (err instanceof ListingLimitError) {
    res.status(409).json({ success: false, code: 'LISTING_LIMIT', limit: err.limit, message: err.message });
    return true;
  }
  if (err instanceof ListingReviewError) {
    res.status(404).json({ success: false, message: err.message });
    return true;
  }
  return false;
}

/** POST /api/services — auth required, ESTABLISHMENT_ADMIN only. Always created as DRAFT. */
servicesRouter.post(
  '/',
  requireAuth,
  wrap(async (req, res) => {
    const targetEstablishmentId = req.user!.activeEstablishmentId;

    if (
      !targetEstablishmentId ||
      !canCreateListingFor(requesterOf(req), targetEstablishmentId)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Only an Establishment Admin with an active organization can create listings.',
      });
    }

    const input = pickListingInput(req.body);
    if (!input.title || !input.summary || !input.description) {
      return res
        .status(400)
        .json({ success: false, message: 'title, summary and description are required.' });
    }
    if (req.body?.status === 'PUBLISHED') {
      return res.status(400).json({ success: false, message: NOT_PUBLISHABLE_MESSAGE });
    }

    // A distributor (FOURNISSEUR) also sets its selling terms; a manufacturer showcase has none (orders go through Audit).
    const isDistributor = req.user!.role === 'FOURNISSEUR';
    let terms = {};
    if (isDistributor) {
      const parsed = parseSellingTerms(req.body);
      if (!parsed.ok) return res.status(400).json({ success: false, message: parsed.message });
      terms = parsed.terms;
    }

    // Lien optionnel vers le produit Audit (fabricant seulement), vérifié avant toute écriture.
    const link = parseProductRef(req.body);
    if (!link.ok) return res.status(400).json({ success: false, message: link.message });
    if (link.value) {
      const sellerKind = isDistributor ? 'DISTRIBUTOR' : 'MANUFACTURER';
      if (!(await verifyNewLink(req, res, { establishmentId: targetEstablishmentId, sellerKind, ref: link.value, title: (input as any)?.title ?? null }))) return;
    }

    const listing = await prisma.productListing.create({
      data: {
        ...(input as any),
        ...terms,
        ...(link.value ? { auditProductRef: link.value } : {}),
        // Decided by the server from the account kind — never read from the request body.
        sellerKind: isDistributor ? 'DISTRIBUTOR' : 'MANUFACTURER',
        status: 'DRAFT',
        establishmentId: targetEstablishmentId,
        createdByUserId: req.user!.id,
      },
    });

    return res.status(201).json({ success: true, listing: toOwnerListing(listing, null) });
  })
);

/**
 * PUT /api/services/:id — auth required, must pass canManageListing.
 * Content edits apply immediately; a material change (title, summary, description, category, main
 * image) sends the product back to staff review. status may become DRAFT/ARCHIVED (hide it) or
 * PUBLISHED (show it in the free catalog: subject to the per-organization limit and to staff review).
 */
servicesRouter.put(
  '/:id',
  requireAuth,
  wrap(async (req, res) => {
    const existing = await loadManageableListing(req, res, 'edit');
    if (!existing) return;

    const input = pickListingInput(req.body);
    const requested = req.body?.status;

    // Lien Audit : tout est vérifié AVANT la publication et l'écriture, pour qu'un refus ne change rien.
    const link = parseProductRef(req.body);
    if (!link.ok) return res.status(400).json({ success: false, message: link.message });
    const relinked = linkChanged(existing.auditProductRef, link.value);
    if (relinked && link.value) {
      const ok = await verifyNewLink(req, res, {
        establishmentId: existing.establishmentId, sellerKind: existing.sellerKind, ref: link.value, excludeListingId: existing.id,
        title: (input as any)?.title ?? existing.title,
        archived: requested === 'ARCHIVED' || (existing.status === 'ARCHIVED' && requested !== 'PUBLISHED' && requested !== 'DRAFT'),
      });
      if (!ok) return;
    } else {
      // Même lien mais la fiche sort des archives : une autre fiche active a peut-être pris ce produit entre-temps.
      const finalRef = link.value !== undefined ? link.value : existing.auditProductRef;
      const leavesArchive = existing.status === 'ARCHIVED' && (requested === 'PUBLISHED' || requested === 'DRAFT');
      if (finalRef && leavesArchive && !(await verifyNoConflict(res, existing.establishmentId, finalRef, existing.id))) return;
    }

    try {
      // Publish first: if the catalog is full nothing else is changed.
      if (requested === 'PUBLISHED' && existing.status !== 'PUBLISHED') await publishListing(prisma, existing.id);
    } catch (err) {
      if (sendPublishError(res, err)) return;
      throw err;
    }

    // Selling terms (price, unit, minimum, stock) belong to distributors only and never trigger a new staff review.
    let terms = {};
    if (existing.sellerKind === 'DISTRIBUTOR') {
      const parsed = parseSellingTerms(req.body);
      if (!parsed.ok) return res.status(400).json({ success: false, message: parsed.message });
      terms = parsed.terms;
    }

    // Changer (ou retirer) le produit Audit lié compte comme un changement important : VigiCore revoit la fiche.
    const review = isMaterialChange(existing as any, input) || relinked
      ? { reviewStatus: 'PENDING' as const, reviewNote: null, promoAllowed: false }
      : {};
    const status = requested === 'DRAFT' || requested === 'ARCHIVED' ? requested : undefined;

    const listing = await prisma.productListing.update({
      where: { id: existing.id },
      data: {
        ...(input as any),
        ...terms,
        ...review,
        ...(relinked ? { auditProductRef: link.value ?? null } : {}),
        ...(status ? { status } : {}),
      },
    });

    // Entrée dans la file « À valider » (publication, correction après refus, contenu validé modifié) : e-mail au staff, sans attendre.
    void notifyListingForReview(prisma, listing, reviewQueueEntry(existing, listing));
    return res.json({ success: true, listing: toOwnerListing(listing, null) });
  })
);

/**
 * POST /api/services/:id/publish — the organization shows the product in the FREE catalog.
 * 409 LISTING_LIMIT when the organization already has the maximum of published products.
 * The product is public only once staff approved it; until then it reads PENDING_REVIEW.
 */
servicesRouter.post(
  '/:id/publish',
  requireAuth,
  wrap(async (req, res) => {
    const existing = await loadManageableListing(req, res, 'publish');
    if (!existing) return;
    // Une fiche archivée qui revient ne doit pas doubler une autre fiche active liée au même produit Audit.
    if (existing.status === 'ARCHIVED' && existing.auditProductRef) {
      if (!(await verifyNoConflict(res, existing.establishmentId, existing.auditProductRef, existing.id))) return;
    }
    try {
      const listing = await publishListing(prisma, existing.id);
      void notifyListingForReview(prisma, listing, reviewQueueEntry(existing, listing));
      const used = await countPublished(prisma, existing.establishmentId);
      return res.json({ success: true, listing: toOwnerListing(listing, null), publishedCount: used, freeListingLimit: listingLimitFor() });
    } catch (err) {
      if (sendPublishError(res, err)) return;
      throw err;
    }
  })
);

/**
 * DELETE /api/services/:id — auth required, must pass canManageListing.
 * Open orders are cancelled; paid orders are kept (listingId → null) as
 * payment records.
 */
servicesRouter.delete(
  '/:id',
  requireAuth,
  wrap(async (req, res) => {
    const existing = await loadManageableListing(req, res, 'delete');
    if (!existing) return;

    await prisma.$transaction([
      prisma.placementOrder.updateMany({
        where: { listingId: existing.id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      }),
      prisma.productListing.delete({ where: { id: existing.id } }),
    ]);
    return res.json({ success: true });
  })
);

/**
 * POST /api/services/:id/promote — auth required, must pass canManageListing.
 * Body: { placement, months, paymentMethod }
 *
 * Creates a PENDING order. The total is computed HERE from pricing.ts; any
 * price sent by the client is ignored. The promotion starts when the payment
 * is confirmed (activateOrder), which is what makes the placement paid
 * rather than merely requested. The product itself is already public (free
 * catalog) — payment only lifts it into a promoted row for a period.
 * A new order replaces any earlier unpaid order for the same listing.
 */
servicesRouter.post(
  '/:id/promote',
  requireAuth,
  wrap(async (req, res) => {
    const listing = await loadManageableListing(req, res, 'promote');
    if (!listing) return;

    const { placement, months, paymentMethod } = req.body ?? {};
    const quote = computeQuote(placement, months);
    if (!quote) {
      return res.status(400).json({ success: false, message: 'Unknown placement or duration (the free catalog cannot be bought).' });
    }
    // Paying never skips the review: only a product that is already public can be promoted,
    // and only if staff cleared it for paid promotion (health products are checked case by case).
    if (!isListingLive(listing)) {
      return res.status(409).json({
        success: false,
        code: 'NOT_LIVE',
        message: 'Publish the product and wait for VigiCore approval before promoting it.',
      });
    }
    if (!listing.promoAllowed) {
      return res.status(403).json({
        success: false,
        code: 'PROMO_NOT_ALLOWED',
        message: 'This product has not been cleared for paid promotion. Contact VigiCore if you think it should be.',
      });
    }

    const method = getPaymentMethods().find((m) => m.id === paymentMethod);
    if (!method) {
      return res.status(400).json({ success: false, message: 'Unknown payment method.' });
    }
    if (!method.enabled) {
      return res
        .status(400)
        .json({ success: false, message: `${method.name} is not available yet. Choose another method.` });
    }

    const plan = getPlacement(quote.placement)!;
    if (plan.exclusive) {
      const holder = await findActiveHolder(prisma, plan.id, listing.id);
      if (holder) {
        return res.status(409).json({
          success: false,
          message: `The ${plan.name} slot is taken until ${holder.placementUntil?.toISOString().slice(0, 10)}. Pick another placement or come back after that date.`,
        });
      }
    }

    let order: PlacementOrder | null = null;
    for (let attempt = 0; attempt < 3 && !order; attempt++) {
      try {
        order = await prisma.$transaction(async (tx) => {
          await tx.placementOrder.updateMany({
            where: { listingId: listing.id, status: 'PENDING' },
            data: { status: 'CANCELLED' },
          });
          return tx.placementOrder.create({
            data: {
              reference: generateOrderReference(),
              listingId: listing.id,
              listingTitle: listing.title,
              establishmentId: listing.establishmentId,
              createdByUserId: req.user!.id,
              placement: quote.placement,
              months: quote.months,
              subtotal: quote.subtotal,
              discount: quote.discount,
              total: quote.total,
              paymentMethod: method.id,
            },
          });
        });
      } catch (err: any) {
        if (err?.code !== 'P2002') throw err; // only a reference collision is worth retrying
      }
    }
    if (!order) {
      return res.status(500).json({ success: false, message: 'Could not create the order. Please retry.' });
    }

    return res.status(201).json({
      success: true,
      listing: toOwnerListing(listing, order),
      order: toOrderDto(order),
    });
  })
);
