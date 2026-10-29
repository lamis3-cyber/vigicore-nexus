import { describe, it, expect } from 'vitest';
import {
  activateOrder,
  addMonths,
  computePlacementWindow,
  effectivePlacement,
  effectiveStatus,
  isListingLive,
  isPaidWindowActive,
  OrderStateError,
  PlacementConflictError,
} from '../src/services/placements';

const NOW = new Date('2026-09-23T10:00:00.000Z');
const later = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

describe('addMonths', () => {
  it('adds calendar months', () => {
    expect(addMonths(new Date('2026-09-23T10:00:00Z'), 3).toISOString()).toBe('2026-12-23T10:00:00.000Z');
  });
  it('clamps to the last day of a shorter month', () => {
    expect(addMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(addMonths(new Date('2028-01-31T00:00:00Z'), 1).toISOString()).toBe('2028-02-29T00:00:00.000Z');
  });
  it('rolls over the year', () => {
    expect(addMonths(new Date('2026-11-15T00:00:00Z'), 6).toISOString()).toBe('2027-05-15T00:00:00.000Z');
  });
});

describe('visibility (free catalog) vs paid window', () => {
  it('is public once published AND approved — payment is not needed', () => {
    expect(isListingLive({ status: 'PUBLISHED', reviewStatus: 'APPROVED' })).toBe(true);
    expect(isListingLive({ status: 'PUBLISHED', reviewStatus: 'PENDING' })).toBe(false);
    expect(isListingLive({ status: 'PUBLISHED', reviewStatus: 'REJECTED' })).toBe(false);
    expect(isListingLive({ status: 'ARCHIVED', reviewStatus: 'APPROVED' })).toBe(false);
    expect(isListingLive({ status: 'DRAFT', reviewStatus: 'APPROVED' })).toBe(false);
  });

  it('a paid tier is active only while its period runs', () => {
    expect(isPaidWindowActive({ placement: 'RECOMMENDED', placementUntil: later(5) }, NOW)).toBe(true);
    expect(isPaidWindowActive({ placement: 'RECOMMENDED', placementUntil: later(-1) }, NOW)).toBe(false);
    expect(isPaidWindowActive({ placement: null, placementUntil: null }, NOW)).toBe(false);
    expect(isPaidWindowActive({ placement: 'STANDARD', placementUntil: later(5) }, NOW)).toBe(false); // free tier is never "paid"
  });

  it('falls back to the free catalog when the paid period ends', () => {
    expect(effectivePlacement({ placement: 'FEATURED', placementUntil: later(5) }, NOW)).toBe('FEATURED');
    expect(effectivePlacement({ placement: 'FEATURED', placementUntil: later(-1) }, NOW)).toBe('STANDARD');
    expect(effectivePlacement({ placement: null, placementUntil: null }, NOW)).toBe('STANDARD');
  });

  it('dashboard status separates "waiting for / refused by staff" from the owner\'s own choice', () => {
    const base = { placement: null, placementUntil: null };
    expect(effectiveStatus({ ...base, status: 'PUBLISHED', reviewStatus: 'APPROVED' })).toBe('PUBLISHED');
    expect(effectiveStatus({ ...base, status: 'PUBLISHED', reviewStatus: 'PENDING' })).toBe('PENDING_REVIEW');
    expect(effectiveStatus({ ...base, status: 'PUBLISHED', reviewStatus: 'REJECTED' })).toBe('REJECTED');
    expect(effectiveStatus({ ...base, status: 'DRAFT', reviewStatus: 'PENDING' })).toBe('DRAFT');
    expect(effectiveStatus({ ...base, status: 'ARCHIVED', reviewStatus: 'APPROVED' })).toBe('ARCHIVED');
    // an ended paid period no longer turns a live product into "EXPIRED"
    expect(effectiveStatus({ status: 'PUBLISHED', reviewStatus: 'APPROVED', placement: 'SPONSORED', placementUntil: later(-1) })).toBe('PUBLISHED');
  });
});

describe('computePlacementWindow', () => {
  it('starts now for a first purchase', () => {
    const w = computePlacementWindow(NOW, { placement: null, placementUntil: null }, 'RECOMMENDED', 1);
    expect(w.placementUntil.toISOString()).toBe('2026-10-23T10:00:00.000Z');
  });
  it('extends from the current end when renewing the same running tier', () => {
    const w = computePlacementWindow(NOW, { placement: 'RECOMMENDED', placementUntil: later(10) }, 'RECOMMENDED', 1);
    expect(w.placementUntil.getTime()).toBe(addMonths(later(10), 1).getTime());
  });
  it('starts now when switching tier or after expiry', () => {
    const tier = computePlacementWindow(NOW, { placement: 'RECOMMENDED', placementUntil: later(10) }, 'SPONSORED', 1);
    expect(tier.placementUntil.toISOString()).toBe('2026-10-23T10:00:00.000Z');
    const expired = computePlacementWindow(NOW, { placement: 'RECOMMENDED', placementUntil: later(-3) }, 'RECOMMENDED', 1);
    expect(expired.placementUntil.toISOString()).toBe('2026-10-23T10:00:00.000Z');
  });
});

// Minimal in-memory stand-in for the Prisma calls activateOrder makes.
function fakePrisma(seed: { orders: any[]; listings: any[] }) {
  const tx = {
    placementOrder: {
      findUnique: async ({ where }: any) =>
        seed.orders.find((o) => (where.id ? o.id === where.id : o.reference === where.reference)) ?? null,
      update: async ({ where, data }: any) => Object.assign(seed.orders.find((o) => o.id === where.id), data),
    },
    productListing: {
      findUnique: async ({ where }: any) => seed.listings.find((l) => l.id === where.id) ?? null,
      findFirst: async ({ where }: any) =>
        seed.listings.find(
          (l) =>
            l.status === 'PUBLISHED' &&
            l.placement === where.placement &&
            l.placementUntil > where.placementUntil.gt &&
            (!where.id || l.id !== where.id.not)
        ) ?? null,
      update: async ({ where, data }: any) => Object.assign(seed.listings.find((l) => l.id === where.id), data),
    },
  };
  return { $transaction: async (cb: any) => cb(tx) } as any;
}

const order = (over: any = {}) => ({
  id: 'o1', reference: 'VG-1', listingId: 'l1', listingTitle: 'Kit', placement: 'RECOMMENDED',
  months: 3, total: 16200, status: 'PENDING', ...over,
});
const listing = (over: any = {}) => ({
  id: 'l1', status: 'PUBLISHED', reviewStatus: 'APPROVED', promoAllowed: true, placement: null, placementUntil: null, ...over,
});

describe('activateOrder', () => {
  it('marks the order PAID and starts the paid window on the live listing', async () => {
    const seed = { orders: [order()], listings: [listing()] };
    const res = await activateOrder(fakePrisma(seed), { reference: 'VG-1' }, NOW);
    expect(res.alreadyPaid).toBe(false);
    expect(seed.orders[0]).toMatchObject({ status: 'PAID', paidAt: NOW });
    expect(seed.listings[0]).toMatchObject({ status: 'PUBLISHED', placement: 'RECOMMENDED' });
    expect(seed.listings[0].placementUntil.toISOString()).toBe('2026-12-23T10:00:00.000Z');
  });

  it('money alone never publishes: unreviewed, rejected, unpublished or uncleared products are refused', async () => {
    for (const over of [
      { reviewStatus: 'PENDING' },
      { reviewStatus: 'REJECTED' },
      { status: 'DRAFT' },
      { status: 'ARCHIVED' },
      { promoAllowed: false },
    ]) {
      const seed = { orders: [order()], listings: [listing(over)] };
      await expect(activateOrder(fakePrisma(seed), { id: 'o1' }, NOW)).rejects.toBeInstanceOf(OrderStateError);
      expect(seed.orders[0].status).toBe('PENDING');
      expect(seed.listings[0].placementUntil).toBeNull();
    }
  });

  it('refuses an order for the free catalog tier', async () => {
    const seed = { orders: [order({ placement: 'STANDARD' })], listings: [listing()] };
    await expect(activateOrder(fakePrisma(seed), { id: 'o1' }, NOW)).rejects.toBeInstanceOf(OrderStateError);
  });

  it('is idempotent: a second confirmation changes nothing', async () => {
    const seed = { orders: [order()], listings: [listing()] };
    const db = fakePrisma(seed);
    await activateOrder(db, { reference: 'VG-1' }, NOW);
    const until = seed.listings[0].placementUntil;
    const again = await activateOrder(db, { reference: 'VG-1' }, later(1));
    expect(again.alreadyPaid).toBe(true);
    expect(seed.listings[0].placementUntil).toBe(until);
  });

  it('refuses cancelled orders and orders whose listing was deleted', async () => {
    await expect(
      activateOrder(fakePrisma({ orders: [order({ status: 'CANCELLED' })], listings: [listing()] }), { id: 'o1' }, NOW)
    ).rejects.toBeInstanceOf(OrderStateError);
    await expect(
      activateOrder(fakePrisma({ orders: [order({ listingId: null })], listings: [] }), { id: 'o1' }, NOW)
    ).rejects.toBeInstanceOf(OrderStateError);
  });

  it('will not give the exclusive FEATURED slot to a second partner', async () => {
    const seed = {
      orders: [order({ placement: 'FEATURED', months: 1 })],
      listings: [listing(), listing({ id: 'other', placement: 'FEATURED', placementUntil: later(20) })],
    };
    await expect(activateOrder(fakePrisma(seed), { id: 'o1' }, NOW)).rejects.toBeInstanceOf(PlacementConflictError);
    expect(seed.orders[0].status).toBe('PENDING');
    expect(seed.listings[0].placementUntil).toBeNull();
  });

  it('lets the current FEATURED holder renew their own slot', async () => {
    const seed = {
      orders: [order({ placement: 'FEATURED', months: 1 })],
      listings: [listing({ placement: 'FEATURED', placementUntil: later(5) })],
    };
    await activateOrder(fakePrisma(seed), { id: 'o1' }, NOW);
    expect(seed.listings[0].placementUntil.getTime()).toBe(addMonths(later(5), 1).getTime());
  });
});
