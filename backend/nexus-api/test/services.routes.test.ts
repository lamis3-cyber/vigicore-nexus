/**
 * End-to-end check of the free-catalog + paid-promotion flow through the real Express app,
 * with Prisma replaced by a small in-memory fake (no database or engine
 * binary needed). Covers the business rules: the catalog is free but capped,
 * nothing is public before staff approval, a promotion needs a live + cleared
 * product and a confirmed payment, prices are computed server-side, the
 * exclusive FEATURED slot can't be double-sold, and an ended promotion falls
 * back to the free catalog.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'net';

// Imports are hoisted above plain statements, so the env must be set in a hoisted block.
const db = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.PAYMENT_CCP_ACCOUNT = '0012345678 cle 42';
  process.env.PAYMENT_BENEFICIARY = 'Test Beneficiary'; // a method is only offered with an explicit beneficiary
  process.env.PLATFORM_ADMIN_EMAILS = 'staff@x.dz';
  process.env.FREE_LISTING_LIMIT = '3'; // small cap so the limit is cheap to test
  return {
    users: [] as any[],
    establishments: [] as any[],
    listings: [] as any[],
    orders: [] as any[],
    seq: 0,
  };
});

// SMTP capturé (étape 5 : e-mail au staff quand une fiche entre dans la file « À valider ») ; jamais d'envoi réel.
const mailbox = vi.hoisted(() => ({ sent: [] as any[], fail: false }));
vi.mock('../src/lib/email', () => ({
  mailConfigured: () => true,
  sendMail: async (m: any) => { if (mailbox.fail) throw new Error('smtp down'); mailbox.sent.push(m); },
  resetMailTransportForTests: () => {},
}));

vi.mock('../src/lib/prisma', () => {
  const id = (p: string) => `${p}${++db.seq}`;
  const match = (row: any, where: any = {}): boolean =>
    Object.entries(where).every(([k, v]: [string, any]) => {
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('in' in v) return v.in.includes(row[k]);
        if ('gt' in v) return row[k] != null && row[k] > v.gt;
        if ('not' in v) return row[k] !== v.not;
        if ('gte' in v) return row[k] >= v.gte;
      }
      return row[k] === v;
    });
  const table = (rows: any[], defaults: (d: any) => any) => ({
    findMany: async ({ where, include }: any = {}) =>
      rows.filter((r) => match(r, where)).map((r) => ({
        ...r,
        ...(include?.establishment ? { establishment: db.establishments.find((e) => e.id === r.establishmentId) } : {}),
        ...(include?.createdBy ? { createdBy: db.users.find((u) => u.id === r.createdByUserId) } : {}),
      })),
    findFirst: async ({ where }: any = {}) => rows.find((r) => match(r, where)) ?? null,
    count: async ({ where }: any = {}) => rows.filter((r) => match(r, where)).length,
    findUnique: async ({ where, include }: any) => {
      const r = rows.find((x) => match(x, where));
      return r ? { ...r, ...(include?.establishment ? { establishment: db.establishments.find((e) => e.id === r.establishmentId) } : {}) } : null;
    },
    create: async ({ data }: any) => { const r = defaults(data); rows.push(r); return r; },
    update: async ({ where, data }: any) => Object.assign(rows.find((x) => match(x, where)), data),
    updateMany: async ({ where, data }: any) => { const hit = rows.filter((r) => match(r, where)); hit.forEach((r) => Object.assign(r, data)); return { count: hit.length }; },
    delete: async ({ where }: any) => { const i = rows.findIndex((x) => match(x, where)); return rows.splice(i, 1)[0]; },
  });
  const listings = table(db.listings, (d) => ({ id: id('l'), status: 'DRAFT', reviewStatus: 'PENDING', reviewNote: null, promoAllowed: false, placement: null, placementUntil: null, createdAt: new Date(), updatedAt: new Date(), ...d }));
  const orders = table(db.orders, (d) => ({ id: id('o'), status: 'PENDING', createdAt: new Date(), paidAt: null, ...d }));
  const prisma: any = {
    productListing: listings,
    placementOrder: orders,
    user: { findUnique: async ({ where }: any) => db.users.find((u) => u.id === where.id) ?? null },
    establishment: { findUnique: async ({ where }: any) => db.establishments.find((e) => e.id === where.id) ?? null },
    $transaction: async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)),
  };
  return { prisma };
});

import { createApp } from '../src/app';
import { signSessionToken } from '../src/lib/jwt';
import { activateOrder } from '../src/services/placements';
import { prisma } from '../src/lib/prisma';

let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base: string;

beforeAll(async () => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/services`;
});
afterAll(() => { server.close(); });

const cookieFor = (userId: string) => `vg_session=${signSessionToken({ userId })}`;
async function call(method: string, path: string, body?: unknown, as?: string) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(as ? { Cookie: cookieFor(as) } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any };
}

const PRODUCT = { title: 'Kit', summary: 'One line', description: 'Long text' };

beforeEach(() => {
  db.users.length = db.establishments.length = db.listings.length = db.orders.length = 0;
  mailbox.sent.length = 0; mailbox.fail = false;
  db.establishments.push({ id: 'estA', name: 'Alpha Labo' }, { id: 'estB', name: 'Beta Labo' });
  const admin = (id: string, est: string) => ({
    id, email: `${id}@x.dz`, displayName: id, role: 'ESTABLISHMENT_ADMIN',
    affiliations: [{ establishmentId: est, isActiveContext: true, status: 'ACTIVE', memberRole: 'ADMIN' }],
  });
  db.users.push(admin('adminA', 'estA'), admin('adminB', 'estB'), { ...admin('staff', 'estA'), email: 'staff@x.dz' });
});

describe('GET /api/auth/session (dashboard header data)', () => {
  it('returns the user with the name of the organization they act for', async () => {
    const res = await fetch(base.replace('/services', '/auth/session'), { headers: { Cookie: cookieFor('adminA') } });
    const { user } = (await res.json()) as any;
    expect(user).toMatchObject({ displayName: 'adminA', email: 'adminA@x.dz', role: 'ESTABLISHMENT_ADMIN', activeEstablishmentName: 'Alpha Labo' });
  });

  it('returns user: null when signed out', async () => {
    const res = await fetch(base.replace('/services', '/auth/session'));
    expect(((await res.json()) as any).user).toBeNull();
  });
});

const PROMO = { months: 1, paymentMethod: 'BARIDIMOB' };

/** Creates a product for `as` and (optionally) publishes it and has staff approve it. */
async function makeProduct(as = 'adminA', { publish = true, approve = true, allowPromotion = true } = {}) {
  const id = (await call('POST', '/', PRODUCT, as)).json.listing.id;
  if (publish) expect((await call('POST', `/${id}/publish`, {}, as)).status).toBe(200);
  if (approve) expect((await call('POST', `/admin/listings/${id}/approve`, { allowPromotion }, 'staff')).status).toBe(200);
  return id;
}

describe('free catalog + staff review', () => {
  it('creates products as drafts; direct publication on create is refused', async () => {
    const created = await call('POST', '/', PRODUCT, 'adminA');
    expect(created.status).toBe(201);
    expect(created.json.listing).toMatchObject({ status: 'DRAFT', reviewStatus: 'PENDING' });
    expect((await call('POST', '/', { ...PRODUCT, status: 'PUBLISHED' }, 'adminA')).status).toBe(400);
    expect((await call('GET', '/')).json.listings).toHaveLength(0);
  });

  it('publishing is free but a product is only public after staff approval', async () => {
    const id = (await call('POST', '/', PRODUCT, 'adminA')).json.listing.id;
    const pub = await call('POST', `/${id}/publish`, {}, 'adminA');
    expect(pub.status).toBe(200);
    expect(pub.json.listing.status).toBe('PENDING_REVIEW'); // owner published, staff did not yet
    expect((await call('GET', '/')).json.listings).toHaveLength(0);
    expect((await call('GET', `/${id}`)).status).toBe(404);

    expect((await call('POST', `/admin/listings/${id}/approve`, {}, 'staff')).status).toBe(200);
    const list = (await call('GET', '/')).json.listings;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ orgName: 'Alpha Labo', placement: 'STANDARD' }); // free catalog tier
    expect(list[0]).not.toHaveProperty('createdByUserId');
    expect((await call('GET', `/${id}`)).status).toBe(200);
  });

  it('only staff can review; the review queue lists what is waiting', async () => {
    const id = await makeProduct('adminA', { approve: false });
    expect((await call('POST', `/admin/listings/${id}/approve`, {}, 'adminA')).status).toBe(403);
    expect((await call('POST', `/admin/listings/${id}/approve`, {})).status).toBe(401);
    const queue = (await call('GET', '/admin/listings', undefined, 'staff')).json.listings;
    expect(queue.map((l: any) => l.id)).toEqual([id]);
    expect(queue[0]).toMatchObject({ organization: 'Alpha Labo', reviewStatus: 'PENDING' });
    expect((await call('GET', '/admin/listings', undefined, 'adminA')).status).toBe(403);
  });

  it('a rejection needs a reason, hides the product and tells the organization why', async () => {
    const id = await makeProduct('adminA', { approve: false });
    expect((await call('POST', `/admin/listings/${id}/reject`, {}, 'staff')).status).toBe(400);
    expect((await call('POST', `/admin/listings/${id}/reject`, { note: 'Photo shows another brand.' }, 'staff')).status).toBe(200);
    expect((await call('GET', '/')).json.listings).toHaveLength(0);
    const mine = (await call('GET', '/mine', undefined, 'adminA')).json.listings[0];
    expect(mine).toMatchObject({ status: 'REJECTED', reviewNote: 'Photo shows another brand.' });
    // fixing the product and resubmitting sends it back to the queue
    await call('PUT', `/${id}`, { title: 'Kit (new photo)' }, 'adminA');
    expect((await call('GET', '/mine', undefined, 'adminA')).json.listings[0]).toMatchObject({ status: 'PENDING_REVIEW', reviewNote: null });
  });

  it('caps published products per organization; extra products stay saved', async () => {
    for (let i = 0; i < 3; i++) await makeProduct('adminA');
    const extra = (await call('POST', '/', PRODUCT, 'adminA')).json.listing.id; // drafts are not capped
    const full = await call('POST', `/${extra}/publish`, {}, 'adminA');
    expect(full.status).toBe(409);
    expect(full.json).toMatchObject({ code: 'LISTING_LIMIT', limit: 3 });
    expect((await call('PUT', `/${extra}`, { status: 'PUBLISHED' }, 'adminA')).status).toBe(409);
    expect(db.listings.find((l) => l.id === extra).status).toBe('DRAFT'); // still saved, not published
    // another organization is unaffected, and archiving one frees a slot
    expect((await call('POST', `/${(await call('POST', '/', PRODUCT, 'adminB')).json.listing.id}/publish`, {}, 'adminB')).status).toBe(200);
    await call('PUT', `/${db.listings[0].id}`, { status: 'ARCHIVED' }, 'adminA');
    expect((await call('POST', `/${extra}/publish`, {}, 'adminA')).status).toBe(200);
  });

  it('a material edit of an approved product sends it back to review, a contact edit does not', async () => {
    const id = await makeProduct();
    await call('PUT', `/${id}`, { contactPhone: '0555 00 00 00' }, 'adminA');
    expect((await call('GET', `/${id}`)).status).toBe(200);
    await call('PUT', `/${id}`, { title: 'Something else entirely' }, 'adminA');
    expect((await call('GET', `/${id}`)).status).toBe(404);
    expect(db.listings[0]).toMatchObject({ reviewStatus: 'PENDING', promoAllowed: false });
  });
});

describe('paid promotion on top of the free catalog', () => {
  it('quotes the new launch prices and never sells the free tier', async () => {
    const pricing = (await call('GET', '/pricing')).json;
    expect(pricing.freeListingLimit).toBe(3);
    expect(Object.fromEntries(pricing.placements.map((p: any) => [p.id, p.monthlyPrice]))).toEqual({ STANDARD: 0, RECOMMENDED: 3000, SPONSORED: 8000, FEATURED: 15000 });
    const id = await makeProduct();
    expect((await call('POST', `/${id}/promote`, { placement: 'STANDARD', ...PROMO }, 'adminA')).status).toBe(400);
  });

  it('refuses a promotion for a product that is not public yet or not cleared for promotion', async () => {
    const pending = await makeProduct('adminA', { approve: false });
    const r1 = await call('POST', `/${pending}/promote`, { placement: 'RECOMMENDED', ...PROMO }, 'adminA');
    expect(r1.status).toBe(409);
    expect(r1.json.code).toBe('NOT_LIVE');

    const rx = await makeProduct('adminA', { allowPromotion: false }); // e.g. a prescription medicine
    const r2 = await call('POST', `/${rx}/promote`, { placement: 'FEATURED', ...PROMO }, 'adminA');
    expect(r2.status).toBe(403);
    expect(r2.json.code).toBe('PROMO_NOT_ALLOWED');
    expect((await call('GET', '/')).json.listings.find((l: any) => l.id === rx).placement).toBe('STANDARD'); // still in the free catalog
  });

  it('lifts a product into its row only after the order is confirmed; price comes from the server', async () => {
    const id = await makeProduct();
    const promoted = await call('POST', `/${id}/promote`, { placement: 'RECOMMENDED', months: 3, paymentMethod: 'BARIDIMOB', total: 1 }, 'adminA');
    expect(promoted.status).toBe(201);
    expect(promoted.json.order).toMatchObject({ total: 8100, status: 'PENDING', instructions: { account: '0012345678 cle 42' } }); // 3×3000 −10 %, client total ignored
    expect(promoted.json.order.reference).toMatch(/^VG-\d{6}-/);

    // Paying has not happened yet: the product is public but still in the free catalog.
    expect((await call('GET', '/')).json.listings[0].placement).toBe('STANDARD');
    expect((await call('GET', '/mine', undefined, 'adminA')).json.listings[0].pendingOrder.reference).toBe(promoted.json.order.reference);

    await activateOrder(prisma as any, { reference: promoted.json.order.reference });
    expect((await call('GET', '/')).json.listings[0]).toMatchObject({ placement: 'RECOMMENDED' });
    expect((await call('GET', '/mine', undefined, 'adminA')).json.listings[0]).toMatchObject({ status: 'PUBLISHED', paidActive: true, pendingOrder: null });
  });

  it('when the paid period ends the product returns to the free catalog (not hidden, not deleted)', async () => {
    const id = await makeProduct();
    const { json } = await call('POST', `/${id}/promote`, { placement: 'SPONSORED', ...PROMO }, 'adminA');
    await activateOrder(prisma as any, { reference: json.order.reference });
    db.listings[0].placementUntil = new Date(Date.now() - 1000);

    const list = (await call('GET', '/')).json.listings;
    expect(list).toHaveLength(1);
    expect(list[0].placement).toBe('STANDARD');
    expect((await call('GET', `/${id}`)).status).toBe(200);
    const mine = (await call('GET', '/mine', undefined, 'adminA')).json.listings[0];
    expect(mine).toMatchObject({ status: 'PUBLISHED', paidActive: false, placement: 'SPONSORED' }); // raw window kept so the dashboard can offer "Renew"
  });

  it('an expired paid window does not block the product from being unpublished and republished', async () => {
    const id = await makeProduct();
    const { json } = await call('POST', `/${id}/promote`, { placement: 'RECOMMENDED', ...PROMO }, 'adminA');
    await activateOrder(prisma as any, { reference: json.order.reference });
    db.listings[0].placementUntil = new Date(Date.now() - 1000);
    await call('PUT', `/${id}`, { status: 'DRAFT' }, 'adminA');
    expect((await call('GET', '/')).json.listings).toHaveLength(0);
    expect((await call('POST', `/${id}/publish`, {}, 'adminA')).status).toBe(200);
    expect((await call('GET', '/')).json.listings[0].placement).toBe('STANDARD'); // stays approved, no second review
  });

  it('rejects unavailable methods, unknown plans, and other organizations', async () => {
    const id = await makeProduct();
    expect((await call('POST', `/${id}/promote`, { placement: 'RECOMMENDED', months: 1, paymentMethod: 'EDAHABIA_CIB' }, 'adminA')).status).toBe(400);
    expect((await call('POST', `/${id}/promote`, { placement: 'RECOMMENDED', months: 1, paymentMethod: 'BANK_TRANSFER' }, 'adminA')).status).toBe(400); // no RIB configured
    expect((await call('POST', `/${id}/promote`, { placement: 'GOLD', ...PROMO }, 'adminA')).status).toBe(400);
    expect((await call('POST', `/${id}/promote`, { placement: 'RECOMMENDED', ...PROMO }, 'adminB')).status).toBe(403);
    expect((await call('POST', `/${id}/promote`, { placement: 'RECOMMENDED', ...PROMO })).status).toBe(401);
  });

  it('replaces an earlier unpaid order instead of stacking them', async () => {
    const id = await makeProduct();
    const first = await call('POST', `/${id}/promote`, { placement: 'RECOMMENDED', ...PROMO }, 'adminA');
    await call('POST', `/${id}/promote`, { placement: 'SPONSORED', ...PROMO }, 'adminA');
    expect(db.orders.find((o) => o.reference === first.json.order.reference).status).toBe('CANCELLED');
    expect(db.orders.filter((o) => o.status === 'PENDING')).toHaveLength(1);
  });

  it('sells the FEATURED slot to one partner at a time', async () => {
    const a = await makeProduct('adminA');
    const b = await makeProduct('adminB');
    const ordA = await call('POST', `/${a}/promote`, { placement: 'FEATURED', ...PROMO }, 'adminA');
    await activateOrder(prisma as any, { reference: ordA.json.order.reference });

    const pricing = (await call('GET', '/pricing')).json;
    expect(pricing.featuredHolderId).toBe(a);
    expect(pricing.paymentMethods.find((m: any) => m.id === 'BARIDIMOB').enabled).toBe(true);
    expect(pricing.paymentMethods[1]).not.toHaveProperty('instructions');

    expect((await call('POST', `/${b}/promote`, { placement: 'FEATURED', ...PROMO }, 'adminB')).status).toBe(409);
    expect((await call('POST', `/${a}/promote`, { placement: 'FEATURED', ...PROMO }, 'adminA')).status).toBe(201); // holder may renew
  });

  it('deleting a product cancels its unpaid order', async () => {
    const id = await makeProduct();
    await call('POST', `/${id}/promote`, { placement: 'RECOMMENDED', ...PROMO }, 'adminA');
    expect((await call('DELETE', `/${id}`, undefined, 'adminA')).status).toBe(200);
    expect(db.listings).toHaveLength(0);
    expect(db.orders[0].status).toBe('CANCELLED');
  });
});

describe('e-mail au staff : fiche à valider (étape 5)', () => {
  const flush = () => new Promise((r) => setTimeout(r, 30)); // l'e-mail part sans être attendu par la route
  const review = () => mailbox.sent.filter((m) => /valider/.test(m.subject));

  it('publication : un e-mail au staff (PLATFORM_ADMIN_EMAILS) ; retoucher une fiche déjà à valider n\'en renvoie pas', async () => {
    const id = await makeProduct('adminA', { approve: false });
    await flush();
    expect(review()).toHaveLength(1);
    expect(review()[0]).toMatchObject({ to: 'staff@x.dz', subject: 'Produit à valider — Kit (Alpha Labo)' });
    expect((await call('PUT', `/${id}`, { title: 'Kit v2' }, 'adminA')).status).toBe(200);
    await flush();
    expect(review()).toHaveLength(1);
  });

  it('fiche validée : contenu modifié => « modifié à revalider » ; contact seul modifié => rien', async () => {
    const id = await makeProduct('adminA');
    await flush(); mailbox.sent.length = 0;
    await call('PUT', `/${id}`, { contactEmail: 'ventes@alpha.dz' }, 'adminA');
    await flush();
    expect(review()).toHaveLength(0);
    await call('PUT', `/${id}`, { description: 'Nouveau texte' }, 'adminA');
    await flush();
    expect(review().map((m) => m.subject)).toEqual(['Produit modifié à revalider — Kit (Alpha Labo)']);
  });

  it('fiche refusée puis corrigée : « corrigé à revalider »', async () => {
    const id = await makeProduct('adminA', { approve: false });
    await call('POST', `/admin/listings/${id}/reject`, { note: 'Photo floue.' }, 'staff');
    await flush(); mailbox.sent.length = 0;
    await call('PUT', `/${id}`, { summary: 'Nouvelle photo' }, 'adminA');
    await flush();
    expect(review().map((m) => m.subject)).toEqual(['Produit corrigé à revalider — Kit (Alpha Labo)']);
  });

  it('brouillon ou fiche validée restaurée : rien ; SMTP en panne : la publication réussit quand même', async () => {
    const draft = await makeProduct('adminA', { publish: false, approve: false });
    await call('PUT', `/${draft}`, { title: 'Brouillon' }, 'adminA');
    const live = await makeProduct('adminA');
    await call('PUT', `/${live}`, { status: 'ARCHIVED' }, 'adminA');
    await flush(); mailbox.sent.length = 0;
    await call('PUT', `/${live}`, { status: 'PUBLISHED' }, 'adminA'); // déjà validée : repart en ligne sans revue
    await flush();
    expect(review()).toHaveLength(0);
    mailbox.fail = true;
    const pub = await call('POST', `/${draft}/publish`, {}, 'adminA');
    expect(pub.status).toBe(200);
    expect(pub.json.listing.status).toBe('PENDING_REVIEW');
  });
});
