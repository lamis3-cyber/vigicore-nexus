/**
 * placements.ts — the lifecycle of a PAID promotion on the /services page.
 *
 * Visibility and payment are two separate things:
 *   - being public (free catalog)  = status PUBLISHED + reviewStatus APPROVED   (see isListingLive)
 *   - being promoted (paid tier)   = placement + placementUntil in the future   (see isPaidWindowActive)
 * When a paid window ends nothing is deleted or flipped: effectivePlacement() just returns STANDARD
 * again and the product stays in the free catalog.
 *
 * Activating a PAID PlacementOrder is the one place that sets the paid window. Both the manual
 * confirmation script (src/scripts/confirmOrder.ts) and any future payment gateway webhook must go
 * through activateOrder() so the rules below (idempotency, exclusive slot, renewal maths, review
 * guards) can't drift apart.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { getPlacement, PlacementId } from './pricing';

type Db = PrismaClient | Prisma.TransactionClient;

export class OrderNotFoundError extends Error {}
export class OrderStateError extends Error {}
export class PlacementConflictError extends Error {
  constructor(message: string, public readonly takenUntil: Date | null) {
    super(message);
  }
}

// --- pure helpers (unit-tested, no database) --------------------------------

/** Calendar-month addition that clamps to the last day (Jan 31 + 1 mo = Feb 28/29). */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export interface PlacementState {
  status: string;
  reviewStatus?: string | null;
  placement: string | null;
  placementUntil: Date | null;
}

/** A paid tier (not the free catalog) whose purchased period has not ended. */
export function isPaidWindowActive(l: Pick<PlacementState, 'placement' | 'placementUntil'>, now: Date = new Date()): boolean {
  return (
    l.placement !== null &&
    l.placement !== 'STANDARD' &&
    l.placementUntil !== null &&
    l.placementUntil.getTime() > now.getTime()
  );
}

/** Where the product is shown right now: its paid tier while that runs, otherwise the free catalog. */
export function effectivePlacement(l: Pick<PlacementState, 'placement' | 'placementUntil'>, now: Date = new Date()): PlacementId {
  return isPaidWindowActive(l, now) ? ((l.placement as PlacementId) ?? 'STANDARD') : 'STANDARD';
}

/** Public right now: the organization published it AND staff approved it. Payment is not required. */
export function isListingLive(l: Pick<PlacementState, 'status' | 'reviewStatus'>): boolean {
  return l.status === 'PUBLISHED' && l.reviewStatus === 'APPROVED';
}

/**
 * What the dashboard should show. Separates "waiting for / refused by staff" from the owner's own
 * choice, so a product the owner published never silently looks live when it is not.
 */
export function effectiveStatus(l: PlacementState): string {
  if (l.status === 'PUBLISHED') {
    if (l.reviewStatus === 'REJECTED') return 'REJECTED';
    if (l.reviewStatus !== 'APPROVED') return 'PENDING_REVIEW';
  }
  return l.status;
}

/**
 * New placement window after a payment. Renewing the SAME tier while it is
 * still running extends from the current end date (no lost days); anything
 * else — first purchase, expired, or switching tier — starts now. There is
 * no proration when switching tier: the new tier's period replaces the old.
 */
export function computePlacementWindow(
  now: Date,
  current: { placement: string | null; placementUntil: Date | null },
  purchased: PlacementId,
  months: number
): { placement: PlacementId; placementUntil: Date } {
  const stillRunning =
    current.placement === purchased &&
    current.placementUntil !== null &&
    current.placementUntil.getTime() > now.getTime();
  const start = stillRunning ? (current.placementUntil as Date) : now;
  return { placement: purchased, placementUntil: addMonths(start, months) };
}

// --- database operations ----------------------------------------------------

/** Another listing currently holding an exclusive placement, if any. */
export async function findActiveHolder(
  db: Db,
  placement: PlacementId,
  excludeListingId?: string,
  now: Date = new Date()
) {
  return db.productListing.findFirst({
    where: {
      status: 'PUBLISHED',
      placement,
      placementUntil: { gt: now },
      ...(excludeListingId ? { id: { not: excludeListingId } } : {}),
    },
    select: { id: true, placementUntil: true },
  });
}

/**
 * Marks an order PAID and starts the paid window on its (already live) listing. Idempotent: a repeated
 * call (double click, webhook retry) returns the already-paid order and
 * changes nothing. Throws OrderNotFoundError / OrderStateError /
 * PlacementConflictError; on any throw nothing is written.
 */
export async function activateOrder(
  prisma: PrismaClient,
  by: { id: string } | { reference: string },
  now: Date = new Date()
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.placementOrder.findUnique({ where: by });
    if (!order) throw new OrderNotFoundError('Order not found.');
    if (order.status === 'PAID') return { order, alreadyPaid: true };
    if (order.status === 'CANCELLED') throw new OrderStateError('Order was cancelled.');
    if (!order.listingId) throw new OrderStateError('The listing for this order no longer exists.');

    const listing = await tx.productListing.findUnique({ where: { id: order.listingId } });
    if (!listing) throw new OrderStateError('The listing for this order no longer exists.');

    const plan = getPlacement(order.placement);
    if (!plan) throw new OrderStateError(`Unknown placement "${order.placement}".`);
    if (!plan.purchasable) throw new OrderStateError(`The ${plan.name} is free and cannot be bought.`);

    // Money alone never makes a product public: it must already be live in the free catalog
    // (published by the organization + approved by staff), and staff must have cleared it for promotion.
    if (!isListingLive(listing)) {
      throw new OrderStateError('The product must be published and approved by VigiCore before a promotion can start.');
    }
    if (!listing.promoAllowed) {
      throw new OrderStateError('This product has not been cleared for paid promotion.');
    }

    if (plan.exclusive) {
      const holder = await findActiveHolder(tx, plan.id, listing.id, now);
      if (holder) {
        throw new PlacementConflictError(
          `The ${plan.name} slot is taken by another partner until ${holder.placementUntil?.toISOString()}.`,
          holder.placementUntil
        );
      }
    }

    const window = computePlacementWindow(now, listing, plan.id, order.months);
    await tx.productListing.update({
      where: { id: listing.id },
      data: { placement: window.placement, placementUntil: window.placementUntil },
    });
    const paid = await tx.placementOrder.update({
      where: { id: order.id },
      data: { status: 'PAID', paidAt: now },
    });
    return { order: paid, alreadyPaid: false };
  });
}
