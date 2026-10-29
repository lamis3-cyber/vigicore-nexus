/**
 * listingReview.ts — the free catalog: publication limit + staff review.
 *
 * Rules (business decisions of 2026-10):
 *   1. The catalog is free but capped: an organization may have at most listingLimitFor() products
 *      with status PUBLISHED (a product waiting for review counts — it holds its slot).
 *   2. Products above the cap are NOT deleted: they stay saved as DRAFT/ARCHIVED and the organization
 *      chooses which ones to publish.
 *   3. Every product is reviewed by VigiCore staff before it is public, free or paid. Approval checks
 *      the product information; it is not a regulatory approval of the product itself.
 *   4. Staff separately decide whether a product may be PROMOTED (promoAllowed) — needed for
 *      prescription / regulated health products.
 *   5. A material edit (title, summary, description, category, main image) sends an approved product
 *      back to review so nobody can get approved and then swap the content. The paid period keeps
 *      running meanwhile.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { listingLimitFor } from './pricing';

type Db = PrismaClient | Prisma.TransactionClient;

export class ListingLimitError extends Error {
  constructor(public readonly limit: number) {
    super(`Your free catalog is full (${limit} published products). Unpublish or archive one to publish another.`);
  }
}
export class ListingReviewError extends Error {}

/** Fields whose change needs a new review. Contact details / framing / logo styling do not. */
export const MATERIAL_FIELDS = ['title', 'summary', 'description', 'category', 'imageUrl'] as const;

const norm = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

/** True when `input` changes at least one material field compared with the stored listing. */
export function isMaterialChange(existing: Record<string, unknown>, input: Record<string, unknown>): boolean {
  return MATERIAL_FIELDS.some((f) => input[f] !== undefined && norm(input[f]) !== norm(existing[f]));
}

export async function countPublished(db: Db, establishmentId: string, excludeListingId?: string): Promise<number> {
  return db.productListing.count({
    where: {
      establishmentId,
      status: 'PUBLISHED',
      ...(excludeListingId ? { id: { not: excludeListingId } } : {}),
    },
  });
}

/**
 * The organization publishes a product (or restores an archived one). It becomes public only once
 * approved: a PENDING product shows as "awaiting validation"; a REJECTED one is sent back to PENDING
 * (the organization fixed it and resubmits). An already APPROVED product goes live immediately.
 */
export async function publishListing(prisma: PrismaClient, listingId: string) {
  return prisma.$transaction(async (tx) => {
    const listing = await tx.productListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new ListingReviewError('Listing not found.');
    if (listing.status === 'PUBLISHED') return listing; // idempotent: no slot is consumed twice

    const limit = listingLimitFor(listing.establishmentId);
    const used = await countPublished(tx, listing.establishmentId, listing.id);
    if (used >= limit) throw new ListingLimitError(limit);

    return tx.productListing.update({
      where: { id: listing.id },
      data: {
        status: 'PUBLISHED',
        ...(listing.reviewStatus === 'REJECTED' ? { reviewStatus: 'PENDING', reviewNote: null } : {}),
      },
    });
  });
}

/** Staff: accept the product information. `allowPromotion` clears it for paid tiers too. */
export async function approveListing(db: Db, listingId: string, allowPromotion: boolean, now: Date = new Date()) {
  const listing = await db.productListing.findUnique({ where: { id: listingId } });
  if (!listing) throw new ListingReviewError('Listing not found.');
  return db.productListing.update({
    where: { id: listing.id },
    data: { reviewStatus: 'APPROVED', reviewNote: null, reviewedAt: now, promoAllowed: allowPromotion },
  });
}

/** Staff: refuse it, with a reason the organization will read. A running paid window is withdrawn too. */
export async function rejectListing(db: Db, listingId: string, note: string, now: Date = new Date()) {
  const clean = note.trim().slice(0, 300);
  if (!clean) throw new ListingReviewError('Add a short reason so the organization knows what to fix.');
  const listing = await db.productListing.findUnique({ where: { id: listingId } });
  if (!listing) throw new ListingReviewError('Listing not found.');
  return db.productListing.update({
    where: { id: listing.id },
    data: { reviewStatus: 'REJECTED', reviewNote: clean, reviewedAt: now, promoAllowed: false },
  });
}
