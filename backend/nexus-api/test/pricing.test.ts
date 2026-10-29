import { describe, it, expect } from 'vitest';
import { computeQuote, DURATIONS, FREE_LISTING_LIMIT, listingLimitFor, PLACEMENTS, placementRank } from '../src/services/pricing';
import { generateOrderReference, getPaymentMethods } from '../src/services/payments';

describe('computeQuote', () => {
  it('prices the three promoted tiers per month with no discount for 1 month', () => {
    expect(computeQuote('RECOMMENDED', 1)).toMatchObject({ subtotal: 3000, discount: 0, total: 3000 });
    expect(computeQuote('SPONSORED', 1)).toMatchObject({ total: 8000 });
    expect(computeQuote('FEATURED', 1)).toMatchObject({ total: 15000 });
  });

  it('the free catalog tier exists but can never be bought', () => {
    expect(PLACEMENTS.find((p) => p.id === 'STANDARD')).toMatchObject({ monthlyPrice: 0, purchasable: false });
    expect(computeQuote('STANDARD', 1)).toBeNull();
  });

  it('applies 10% for 3 months and 15% for 6 months', () => {
    expect(computeQuote('RECOMMENDED', 3)).toMatchObject({ subtotal: 9000, discount: 900, total: 8100 });
    expect(computeQuote('FEATURED', 6)).toMatchObject({ subtotal: 90000, discount: 13500, total: 76500 });
  });

  it('always yields whole dinars and total = subtotal - discount', () => {
    for (const p of PLACEMENTS.filter((x) => x.purchasable)) {
      for (const d of DURATIONS) {
        const q = computeQuote(p.id, d.months)!;
        expect(Number.isInteger(q.total)).toBe(true);
        expect(q.total).toBe(q.subtotal - q.discount);
      }
    }
  });

  it('rejects unknown or malformed input instead of guessing', () => {
    expect(computeQuote('PLATINUM', 1)).toBeNull();
    expect(computeQuote('RECOMMENDED', 2)).toBeNull();
    expect(computeQuote('RECOMMENDED', '3')).toBeNull();
    expect(computeQuote(undefined, undefined)).toBeNull();
  });

  it('ranks higher tiers above lower ones, and unplaced listings last', () => {
    expect(placementRank('FEATURED')).toBeGreaterThan(placementRank('SPONSORED'));
    expect(placementRank('SPONSORED')).toBeGreaterThan(placementRank('RECOMMENDED'));
    expect(placementRank('RECOMMENDED')).toBeGreaterThan(placementRank('STANDARD'));
    expect(placementRank(null)).toBe(0);
  });
});

describe('free catalog limit', () => {
  it('is 10 published products per organization by default, overridable by env', () => {
    const saved = process.env.FREE_LISTING_LIMIT;
    delete process.env.FREE_LISTING_LIMIT;
    expect(FREE_LISTING_LIMIT).toBe(10);
    expect(listingLimitFor('org')).toBe(10);
    process.env.FREE_LISTING_LIMIT = '12';
    expect(listingLimitFor('org')).toBe(12);
    process.env.FREE_LISTING_LIMIT = 'abc';
    expect(listingLimitFor('org')).toBe(10); // garbage never lifts the cap
    if (saved === undefined) delete process.env.FREE_LISTING_LIMIT; else process.env.FREE_LISTING_LIMIT = saved;
  });
});

describe('payment methods', () => {
  it('offers manual methods only once their receiving account is configured', () => {
    const none = getPaymentMethods({});
    expect(none.every((m) => !m.enabled)).toBe(true);

    const noBeneficiary = getPaymentMethods({ PAYMENT_CCP_ACCOUNT: '0012345678 clé 42' } as any);
    expect(noBeneficiary.every((m) => !m.enabled)).toBe(true); // no invented beneficiary

    const some = getPaymentMethods({ PAYMENT_CCP_ACCOUNT: '0012345678 clé 42', PAYMENT_BENEFICIARY: 'Test Beneficiary' } as any);
    expect(some.find((m) => m.id === 'BARIDIMOB')).toMatchObject({ enabled: true });
    expect(some.find((m) => m.id === 'BANK_TRANSFER')?.enabled).toBe(false);
  });

  it('never reports the card method as available (no gateway integrated)', () => {
    const all = getPaymentMethods({ PAYMENT_CCP_ACCOUNT: 'x', PAYMENT_BANK_RIB: 'y', PAYMENT_BENEFICIARY: 'B' } as any);
    expect(all.find((m) => m.id === 'EDAHABIA_CIB')?.enabled).toBe(false);
  });

  it('generates references that are typeable and carry the month', () => {
    const ref = generateOrderReference(new Date(Date.UTC(2026, 8, 23)));
    expect(ref).toMatch(/^VG-202609-[A-HJ-NP-Z2-9]{6}$/);
  });
});
