import { describe, it, expect } from 'vitest';
import { approveListing, isMaterialChange, ListingLimitError, publishListing, rejectListing } from '../src/services/listingReview';

describe('isMaterialChange', () => {
  const stored = { title: 'Kit', summary: 'One line', description: 'Long', category: 'Medical', imageUrl: 'a.png', contactPhone: '1' };
  it('flags a change of title, summary, description, category or main image', () => {
    for (const f of ['title', 'summary', 'description', 'category', 'imageUrl']) {
      expect(isMaterialChange(stored, { [f]: 'changed' })).toBe(true);
    }
  });
  it('ignores identical values, whitespace, and non-material fields', () => {
    expect(isMaterialChange(stored, { title: 'Kit', summary: ' One line ' })).toBe(false);
    expect(isMaterialChange(stored, { contactPhone: '2', imageZoom: 150, logoUrl: 'x' })).toBe(false);
    expect(isMaterialChange(stored, {})).toBe(false);
    expect(isMaterialChange({ ...stored, category: null }, { category: '' })).toBe(false);
  });
});

// Tiny in-memory stand-in for the Prisma calls these functions make.
function fakeDb(listings: any[]) {
  const match = (r: any, w: any = {}) => Object.entries(w).every(([k, v]: [string, any]) => (v && typeof v === 'object' && 'not' in v ? r[k] !== v.not : r[k] === v));
  const tx = {
    productListing: {
      findUnique: async ({ where }: any) => listings.find((l) => l.id === where.id) ?? null,
      count: async ({ where }: any) => listings.filter((l) => match(l, where)).length,
      update: async ({ where, data }: any) => Object.assign(listings.find((l) => l.id === where.id), data),
    },
  };
  return { ...tx, $transaction: async (cb: any) => cb(tx) } as any;
}
const L = (id: string, over: any = {}) => ({ id, establishmentId: 'est', status: 'DRAFT', reviewStatus: 'PENDING', ...over });

describe('publishListing', () => {
  it('publishes within the limit and is idempotent for an already published product', async () => {
    const rows = [L('a')];
    const db = fakeDb(rows);
    expect((await publishListing(db, 'a')).status).toBe('PUBLISHED');
    expect((await publishListing(db, 'a')).status).toBe('PUBLISHED');
  });

  it('refuses the 11th published product of an organization, but not for another one', async () => {
    const rows = [...Array.from({ length: 10 }, (_, i) => L(`p${i}`, { status: 'PUBLISHED', reviewStatus: 'APPROVED' })), L('extra'), L('other', { establishmentId: 'est2' })];
    const db = fakeDb(rows);
    await expect(publishListing(db, 'extra')).rejects.toBeInstanceOf(ListingLimitError);
    expect(rows.find((r) => r.id === 'extra')!.status).toBe('DRAFT');
    expect((await publishListing(db, 'other')).status).toBe('PUBLISHED');
  });

  it('counts products waiting for review against the limit', async () => {
    const rows = [...Array.from({ length: 10 }, (_, i) => L(`p${i}`, { status: 'PUBLISHED' })), L('extra')];
    await expect(publishListing(fakeDb(rows), 'extra')).rejects.toBeInstanceOf(ListingLimitError);
  });

  it('keeps an approved product approved when it is restored, and resubmits a rejected one', async () => {
    const rows = [L('ok', { status: 'ARCHIVED', reviewStatus: 'APPROVED' }), L('bad', { reviewStatus: 'REJECTED', reviewNote: 'no' })];
    const db = fakeDb(rows);
    expect(await publishListing(db, 'ok')).toMatchObject({ status: 'PUBLISHED', reviewStatus: 'APPROVED' });
    expect(await publishListing(db, 'bad')).toMatchObject({ status: 'PUBLISHED', reviewStatus: 'PENDING', reviewNote: null });
  });
});

describe('staff review', () => {
  it('approve records the decision and whether promotion is cleared', async () => {
    const rows = [L('a', { status: 'PUBLISHED' })];
    const now = new Date('2026-10-28T10:00:00Z');
    expect(await approveListing(fakeDb(rows), 'a', false, now)).toMatchObject({ reviewStatus: 'APPROVED', promoAllowed: false, reviewedAt: now });
    expect(await approveListing(fakeDb(rows), 'a', true, now)).toMatchObject({ promoAllowed: true });
  });

  it('reject needs a reason and withdraws promotion clearance', async () => {
    const rows = [L('a', { status: 'PUBLISHED', reviewStatus: 'APPROVED', promoAllowed: true })];
    await expect(rejectListing(fakeDb(rows), 'a', '   ')).rejects.toThrow();
    expect(await rejectListing(fakeDb(rows), 'a', 'Wrong category')).toMatchObject({ reviewStatus: 'REJECTED', reviewNote: 'Wrong category', promoAllowed: false });
  });
});
