/**
 * pricing.ts — single source of truth for what a placement on the public
 * /services page costs.
 *
 * The frontend (ManageServicesPage.jsx) displays whatever GET
 * /api/services/pricing returns, and POST /api/services/:id/promote
 * recomputes the total from these tables — a client-sent price is never
 * read. Change a price here and both sides follow.
 *
 * All amounts are whole Algerian dinars (DZD). No floats are stored.
 */

export const PLACEMENT_IDS = ['STANDARD', 'RECOMMENDED', 'SPONSORED', 'FEATURED'] as const;
export type PlacementId = (typeof PLACEMENT_IDS)[number];

export interface PlacementDef {
  id: PlacementId;
  name: string;
  /** Where on the public /services page the product shows up. */
  section: string;
  tag: string;
  /** Price per month, DZD. */
  monthlyPrice: number;
  /** Higher = shown first in the catalog grid (paid ranking). */
  rank: number;
  /** Only one listing at a time may hold this placement. */
  exclusive: boolean;
  /** False for the free catalog tier: it can be listed but never bought. */
  purchasable: boolean;
}

/**
 * Business model (decided 2026-10): the catalog is FREE, capped at FREE_LISTING_LIMIT published
 * products per organization, and every product passes staff review before it is public. Only the
 * three promoted tiers are sold. Launch prices are an estimate to test with a few organizations
 * (FEATURED is deliberately on the low side until demand is known).
 */
export const PLACEMENTS: readonly PlacementDef[] = [
  { id: 'STANDARD', name: 'Catalog listing', section: 'All products & services grid', tag: 'Free', monthlyPrice: 0, rank: 1, exclusive: false, purchasable: false },
  { id: 'RECOMMENDED', name: 'Recommended row', section: 'Scrolling row above the catalog', tag: 'Popular', monthlyPrice: 3000, rank: 2, exclusive: false, purchasable: true },
  { id: 'SPONSORED', name: 'Sponsored strip', section: '"What our partners are offering"', tag: 'High visibility', monthlyPrice: 8000, rank: 3, exclusive: false, purchasable: true },
  { id: 'FEATURED', name: 'Featured partner', section: 'Full panel at the top, one partner at a time', tag: 'Premium', monthlyPrice: 15000, rank: 4, exclusive: true, purchasable: true },
];

/** Published products an organization may have in the free catalog (pending review counts too). */
export const FREE_LISTING_LIMIT = 10;

/**
 * Per-organization cap. One function so a paid "catalog pack" (e.g. +10 products per month) or a
 * launch-offer extension can be added later without touching the routes.
 */
export function listingLimitFor(_org?: unknown): number {
  const fromEnv = Number(process.env.FREE_LISTING_LIMIT);
  return Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : FREE_LISTING_LIMIT;
}

export interface DurationDef {
  months: number;
  /** Whole-number percentage taken off the subtotal. */
  discountPercent: number;
}

export const DURATIONS: readonly DurationDef[] = [
  { months: 1, discountPercent: 0 },
  { months: 3, discountPercent: 10 },
  { months: 6, discountPercent: 15 },
];

export const PAYMENT_METHOD_IDS = ['EDAHABIA_CIB', 'BARIDIMOB', 'BANK_TRANSFER'] as const;
export type PaymentMethodId = (typeof PAYMENT_METHOD_IDS)[number];

export const CURRENCY = 'DZD';

export function getPlacement(id: unknown): PlacementDef | undefined {
  return PLACEMENTS.find((p) => p.id === id);
}

export function getDuration(months: unknown): DurationDef | undefined {
  return DURATIONS.find((d) => d.months === months);
}

export function placementRank(id: string | null | undefined): number {
  return getPlacement(id)?.rank ?? 0;
}

export interface Quote {
  placement: PlacementId;
  months: number;
  subtotal: number;
  discount: number;
  total: number;
  currency: typeof CURRENCY;
}

/** Returns null for an unknown or non-purchasable placement, or an unknown duration (never guesses). */
export function computeQuote(placement: unknown, months: unknown): Quote | null {
  const plan = getPlacement(placement);
  const duration = getDuration(months);
  if (!plan || !duration || !plan.purchasable) return null; // the free catalog tier is never sold

  const subtotal = plan.monthlyPrice * duration.months;
  const discount = Math.round((subtotal * duration.discountPercent) / 100);
  return {
    placement: plan.id,
    months: duration.months,
    subtotal,
    discount,
    total: subtotal - discount,
    currency: CURRENCY,
  };
}
