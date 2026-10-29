/**
 * services.js — VigiCore NEXUS
 * Client for the public "services page" product/listing catalog.
 *
 * Mirrors lib/auth.js: same base URL, same JSON contract, same
 * { ok, data|error } return shape. Served by server/src/routes/services.routes.ts.
 *
 * Expected backend routes:
 *   GET    /api/services                 → { success, listings: Listing[] }
 *          Public. Returns only PUBLISHED listings. Supports
 *          ?establishmentId= to filter to one organization.
 *   GET    /api/services/:id             → { success, listing: Listing }
 *          Public if the listing is PUBLISHED; otherwise requires the
 *          requester to be an Establishment Admin for its establishment
 *          (see server/src/auth/servicesAuthz.ts).
 *   GET    /api/services/mine            → { success, listings: Listing[] }
 *          Auth required. All listings (any status) for the logged-in
 *          admin's establishment.
 *   GET    /api/services/pricing         → { success, currency, placements, durations,
 *                                             paymentMethods, featuredTakenUntil, featuredHolderId }
 *          Public. The prices the dashboard displays; the server charges
 *          exactly these (see server/src/services/pricing.ts).
 *   POST   /api/services                 → { success, listing: Listing }
 *          Auth required, ESTABLISHMENT_ADMIN only. Body: ListingInput.
 *   PUT    /api/services/:id             → { success, listing: Listing }
 *          Auth required, must pass canManageListing. Body: Partial<ListingInput>.
 *   DELETE /api/services/:id             → { success }
 *          Auth required, must pass canManageListing.
 *
 * Listing shape:
 *   { id, establishmentId, title, summary, description, category,
 *     imageUrl, contactEmail, contactPhone, website, status,
 *     placement, placementUntil, pendingOrder, createdAt, updatedAt }
 *   status (owner view): DRAFT | PENDING_REVIEW | REJECTED | PUBLISHED | ARCHIVED.
 *   The catalog is FREE (max `freeListingLimit` published products per organization) and every
 *   product is reviewed by VigiCore first: publish with POST /services/:id/publish; it is public
 *   once approved (status PUBLISHED). A rejection comes with `reviewNote`.
 *   Paid promotion (Recommended / Sponsored / Featured) sits on top: `placement` + `placementUntil`
 *   are the raw paid window, `paidActive` says whether it is running. When it ends the product
 *   simply stays in the free catalog (there is no EXPIRED status any more).
 *   Public listings (GET /services, /services/:id) additionally carry
 *   orgName and are already ordered by placement tier; their `placement` is the tier shown NOW
 *   ('STANDARD' for the free catalog).
 *
 * ListingInput (POST/PUT body):
 *   { title, summary, description, category?, imageUrl?, contactEmail?,
 *     contactPhone?, website?, status? }  // status defaults to 'DRAFT'
 */

import { apiFetch, API_BASE } from './api.js';

/** Public: all published listings, optionally filtered to one establishment. */
export async function listPublishedServices({ establishmentId } = {}) {
  const qs = establishmentId ? `?establishmentId=${encodeURIComponent(establishmentId)}` : '';
  return apiFetch('GET', `/services${qs}`);
}

/** Auth required: every listing (any status) for the logged-in admin's establishment. */
export async function listMyServices() {
  return apiFetch('GET', '/services/mine');
}

/** Auth required, ESTABLISHMENT_ADMIN only. */
export async function createService(fields) {
  return apiFetch('POST', '/services', fields);
}

/** Auth required, must own the listing's establishment. */
export async function updateService(id, fields) {
  return apiFetch('PUT', `/services/${encodeURIComponent(id)}`, fields);
}

/** Auth required, must own the listing's establishment. */
export async function deleteService(id) {
  return apiFetch('DELETE', `/services/${encodeURIComponent(id)}`);
}

/**
 * Auth required: the VigiCore Audit products of the manufacturer linked to my establishment, for the
 * "Linked product in VigiCore Audit" dropdown. Route: GET /api/services/audit-products
 *   → { applicable, manufacturerLinked, available, products: { ref, name, reference, linkedListing: { id, title, status } | null }[] }
 * applicable=false: distributor (no Audit product). manufacturerLinked=false: VigiCore has not linked the organization yet.
 * available=false: Audit unreachable (the listing can still be saved; the link is kept as it is).
 */
export async function getAuditProducts() {
  return apiFetch('GET', '/services/audit-products')
}

/**
 * The `auditProductRef` part of a create/update body. The server reads "absent" as "unchanged", so:
 * create → sent only when a product is chosen; update → sent only when the choice changed (null = remove the link).
 * Changing it sends the listing back to VigiCore review, so it is never re-sent by accident.
 */
export function auditLinkPatch(next, prev, isEdit) {
  const n = typeof next === 'string' && next.trim() ? next.trim() : null
  if (!isEdit) return n ? { auditProductRef: n } : {}
  return n !== (prev ?? null) ? { auditProductRef: n } : {}
}

/** Public: the placement prices, durations and payment methods the server actually offers. */
export async function getServicePricing() {
  return apiFetch('GET', '/services/pricing');
}

/**
 * Auth required, must own the listing. Buys a placement on the /services page.
 * Body: { placement: 'RECOMMENDED'|'SPONSORED'|'FEATURED',   // the free catalog ('STANDARD') cannot be bought
 *         months: 1|3|6, paymentMethod: 'EDAHABIA_CIB'|'BARIDIMOB'|'BANK_TRANSFER' }
 * Route: POST /api/services/:id/promote
 *   → { success, listing, order }   201
 * order = { id, reference, placement, months, subtotal, discount, total,
 *           currency, paymentMethod, status: 'PENDING',
 *           instructions: { beneficiary, account } | null }
 * The order is PENDING: the promotion starts when VigiCore confirms the payment.
 * The server recomputes the price (never trusts a client total).
 * 409 NOT_LIVE (product not published + approved yet), 403 PROMO_NOT_ALLOWED (not cleared by staff).
 */
export async function promoteService(id, fields) {
  return apiFetch('POST', `/services/${encodeURIComponent(id)}/promote`, fields);
}

/**
 * Auth required: show the product in the FREE catalog. Route: POST /api/services/:id/publish
 *   → { success, listing, publishedCount, freeListingLimit }
 * The product is public once VigiCore approves it (status PENDING_REVIEW until then).
 * 409 { code: 'LISTING_LIMIT' } when the organization already has the maximum published.
 */
export async function publishService(id) {
  return apiFetch('POST', `/services/${encodeURIComponent(id)}/publish`, {});
}

/** Auth required: visit counters per listing for the last `days` (default 30), with a 7-day views series. Route: GET /api/services/stats → { stats: { [listingId]: { views, clicks, contacts, series } } } */
export async function getServiceStats(days = 30) {
  return apiFetch('GET', `/services/stats?days=${days}`);
}

/** Auth required: every payment order of the organization, newest first. Route: GET /api/services/orders → { orders: (Order & { listingId, listingTitle, paidAt })[] } */
export async function listMyOrders() {
  return apiFetch('GET', '/services/orders');
}

/** Public, fire-and-forget visit counter. type: 'view' | 'click' | 'contact'. Never throws, never blocks. */
export function trackListing(id, type) {
  try {
    fetch(`${API_BASE}/services/${encodeURIComponent(id)}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* analytics must never break the page */ }
}

/** Owner: attach a proof-of-transfer image (data URL) to a pending order. Route: POST /api/services/orders/:id/receipt */
export async function uploadReceipt(orderId, image) {
  return apiFetch('POST', `/services/orders/${encodeURIComponent(orderId)}/receipt`, { image });
}

/** Owner/staff: invoice data of a PAID order. Route: GET /api/services/orders/:id/invoice → { invoice } */
export async function getInvoice(orderId) {
  return apiFetch('GET', `/services/orders/${encodeURIComponent(orderId)}/invoice`);
}

/** Staff only (PLATFORM_ADMIN_EMAILS). status: PENDING | PAID | CANCELLED | all */
export async function adminListOrders(status = 'PENDING') {
  return apiFetch('GET', `/services/admin/orders?status=${encodeURIComponent(status)}`);
}
export async function adminGetReceipt(orderId) {
  return apiFetch('GET', `/services/admin/orders/${encodeURIComponent(orderId)}/receipt`);
}
export async function adminConfirmOrder(orderId) {
  return apiFetch('POST', `/services/admin/orders/${encodeURIComponent(orderId)}/confirm`, {});
}
export async function adminRejectOrder(orderId, note) {
  return apiFetch('POST', `/services/admin/orders/${encodeURIComponent(orderId)}/reject`, { note });
}

/** Staff only: products to review. review: PENDING | APPROVED | REJECTED | all. Route: GET /api/services/admin/listings */
export async function adminListListings(review = 'PENDING') {
  return apiFetch('GET', `/services/admin/listings?review=${encodeURIComponent(review)}`);
}
/** Staff only: accept the product information; allowPromotion also clears it for paid tiers. */
export async function adminApproveListing(id, allowPromotion = false) {
  return apiFetch('POST', `/services/admin/listings/${encodeURIComponent(id)}/approve`, { allowPromotion });
}
/** Staff only: refuse a product; `note` is shown to the organization. */
export async function adminRejectListing(id, note) {
  return apiFetch('POST', `/services/admin/listings/${encodeURIComponent(id)}/reject`, { note });
}
