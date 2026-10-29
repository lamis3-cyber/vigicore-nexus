/**
 * HTTP-level tests of the distributor (FOURNISSEUR) sales circuit on /api/market (2026-11-03):
 * local offers, direct orders, seller inbox + status flow, buyer tracking + cancel, and the isolation between sellers.
 * Prisma is an in-memory fake: these prove ROUTE LOGIC (droits, validation, transitions, isolation), not real-database behaviour.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'net';

const db = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.PLATFORM_ADMIN_EMAILS = 'staff@vigicore.dz';
  return { users: [] as any[], ests: [] as any[], listings: [] as any[], orders: [] as any[], seq: 0 };
});

// Audit : en panne par défaut ; `auditMock.offers` = catalogue renvoyé par GET /nexus/v1/catalogue/offers (tests de visibilité par produit).
const auditMock = vi.hoisted(() => ({ offers: null as any[] | null }));
vi.mock('../src/lib/auditClient', () => ({
  callAudit: async (req: any) => (auditMock.offers && req?.method === 'GET' && String(req.path).startsWith('/nexus/v1/catalogue/offers')
    ? { kind: 'http', status: 200, data: { offers: auditMock.offers } }
    : { kind: 'network', error: 'down' }),
}));

// SMTP capturé : on vérifie QUI reçoit QUOI, sans jamais envoyer.
const mailbox = vi.hoisted(() => ({ sent: [] as any[], fail: false }));
vi.mock('../src/lib/email', () => ({
  mailConfigured: () => true,
  sendMail: async (m: any) => { if (mailbox.fail) throw new Error('smtp down'); mailbox.sent.push(m); },
  resetMailTransportForTests: () => {},
}));

vi.mock('../src/lib/prisma', () => {
  const match = (r: any, w: any = {}): boolean =>
    Object.entries(w).every(([k, v]: [string, any]) => {
      if (k === 'OR') return (v as any[]).some((x) => match(r, x));
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        const ops = Object.keys(v);
        const known = ['in', 'not', 'gte'];
        if (ops.some((o) => !known.includes(o))) throw new Error(`fake prisma: unsupported operator ${ops.join(',')} on ${k}`);
        const cur = r[k] ?? null;
        if ('in' in v && !v.in.includes(r[k])) return false;
        if ('not' in v && cur === (v.not ?? null)) return false;
        if ('gte' in v && !(cur !== null && cur >= v.gte)) return false;
        return true;
      }
      return r[k] === v;
    });
  const estOf = (id: string | null) => db.ests.find((e) => e.id === id) ?? null;
  const withJoins = (o: any, include: any) => ({
    ...o,
    ...(include?.sellerEstablishment ? { sellerEstablishment: estOf(o.sellerEstablishmentId) } : {}),
    ...(include?.buyerEstablishment ? { buyerEstablishment: estOf(o.buyerEstablishmentId) } : {}),
  });
  const user = {
    findUnique: async ({ where }: any) => db.users.find((x) => x.id === where.id) ?? null,
  };
  const establishment = {
    findMany: async ({ where }: any = {}) => db.ests.filter((e) => match(e, where)),
  };
  const applyNum = (cur: any, op: any) => (op && typeof op === 'object' ? ('decrement' in op ? cur - op.decrement : cur + op.increment) : op);
  const productListing = {
    findUnique: async ({ where, select }: any) => {
      const l = db.listings.find((x) => x.id === where.id);
      return l ? (select?.stockQty ? { stockQty: l.stockQty ?? null } : { ...l, ...(select?.establishment ? { establishment: estOf(l.establishmentId) } : {}) }) : null;
    },
    updateMany: async ({ where, data }: any) => {
      const hits = db.listings.filter((l) => match(l, where));
      for (const h of hits) {
        for (const [k, v] of Object.entries(data)) h[k] = applyNum(h[k] ?? 0, v);
        if (h.stockQty != null && h.stockQty < 0) throw new Error('CHECK constraint failed: stockQty'); // le garde-fou de la base
      }
      return { count: hits.length };
    },
    findMany: async ({ where }: any = {}) => {
      const ids: string[] | undefined = where?.id?.in;
      return db.listings
        .filter((l) => (ids ? ids.includes(l.id) : true))
        .filter((l) => (where?.sellerKind ? l.sellerKind === where.sellerKind : true))
        .filter((l) => (where?.status ? l.status === where.status : true))
        .filter((l) => (where?.reviewStatus ? l.reviewStatus === where.reviewStatus : true))
        .filter((l) => (where?.unitPrice ? l.unitPrice != null : true))
        .filter((l) => (where?.inStock !== undefined ? l.inStock === where.inStock : true))
        .filter((l) => (where?.title?.contains ? l.title.toLowerCase().includes(where.title.contains.toLowerCase()) : true))
        .map((l) => ({ ...l, establishment: estOf(l.establishmentId) }));
    },
  };
  const supplierOrder = {
    create: async ({ data, include }: any) => {
      if (db.orders.some((o) => o.reference === data.reference)) throw Object.assign(new Error('dup'), { code: 'P2002', meta: { target: 'reference' } });
      const row = { id: `so_${++db.seq}`, createdAt: new Date(Date.UTC(2026, 10, 3, 10, db.seq)), updatedAt: new Date(), sellerNote: null, ...data };
      db.orders.push(row);
      return withJoins(row, include);
    },
    findUnique: async ({ where, include }: any) => {
      const r = where.id ? db.orders.find((o) => o.id === where.id)
        : db.orders.find((o) => o.buyerUserId === where.buyerUserId_clientRequestId?.buyerUserId && o.clientRequestId === where.buyerUserId_clientRequestId?.clientRequestId);
      return r ? withJoins(r, include) : null;
    },
    findFirst: async ({ where, include }: any) => { const r = db.orders.find((o) => match(o, where)); return r ? withJoins(r, include) : null; },
    findMany: async ({ where, include }: any = {}) => db.orders.filter((o) => match(o, where)).sort((a, b) => b.createdAt - a.createdAt).map((o) => withJoins(o, include)),
    updateMany: async ({ where, data }: any) => {
      const hits = db.orders.filter((o) => match(o, where));
      hits.forEach((h) => Object.assign(h, data, { updatedAt: new Date() }));
      return { count: hits.length };
    },
  };
  const marketRequest = { findMany: async () => [], findUnique: async () => null };
  const userEstablishment = {
    findMany: async ({ where }: any) => db.users.flatMap((u) => (u.affiliations ?? [])
      .filter((a: any) => a.establishmentId === where.establishmentId && a.status === where.status)
      .map((a: any) => ({ ...a, user: { email: u.email, role: u.role, deactivatedAt: u.deactivatedAt } }))),
  };
  const listingLike = { count: async () => 0, findUnique: async () => null };
  const prisma: any = { user, establishment, productListing, supplierOrder, marketRequest, userEstablishment, listingLike };
  // Vraie transaction : si le callback lève, TOUT ce qu'il a écrit est annulé (sinon on testerait un « tout ou rien » imaginaire).
  prisma.$transaction = async (fn: any) => {
    const snap = { listings: structuredClone(db.listings), orders: structuredClone(db.orders), seq: db.seq };
    try { return await fn(prisma); } catch (err) {
      db.listings.splice(0, db.listings.length, ...snap.listings); db.orders.splice(0, db.orders.length, ...snap.orders); db.seq = snap.seq;
      throw err;
    }
  };
  return { prisma };
});

import { createApp } from '../src/app';
import { signSessionToken } from '../src/lib/jwt';

let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base: string;
beforeAll(() => { server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(() => { server.close(); });

async function call(method: string, path: string, as?: string, body?: unknown) {
  const res = await fetch(`${base}/api/market${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(as ? { Cookie: `vg_session=${signSessionToken({ userId: as })}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

const aff = (establishmentId: string, memberRole = 'ADMIN') => ({ establishmentId, status: 'ACTIVE', memberRole, isActiveContext: true, departmentId: null });
const contact = { name: 'Ali Benali', email: 'ali@pharma.dz', phone: '0550123456' };
let n = 0;
const order = (as: string, body: any) => call('POST', '/orders', as, { clientRequestId: `key-${++n}-abcdefgh`, contact, ...body });

beforeEach(() => {
  for (const k of ['users', 'ests', 'listings', 'orders'] as const) (db[k] as any[]).length = 0;
  db.seq = 0; mailbox.sent.length = 0; mailbox.fail = false; auditMock.offers = null;
  const u = (id: string, role: string, affiliations: any[]) => db.users.push({ id, email: `${id}@x.dz`, displayName: `Name ${id}`, role, deactivatedAt: null, passwordChangedAt: null, affiliations });
  const e = (id: string, type: string, buyerCategory: string | null, status: string | null) => db.ests.push({ id, name: `Etab ${id}`, type, isSystemReserved: false, buyerCategory, buyerCategoryStatus: status });
  e('atlas', 'SUPPLIER', 'DISTRIBUTOR', 'VERIFIED');      // fournisseur vérifié
  e('sahel', 'SUPPLIER', 'DISTRIBUTOR', 'VERIFIED');      // autre fournisseur vérifié
  e('newbie', 'SUPPLIER', 'DISTRIBUTOR', 'DECLARED');     // fournisseur pas encore vérifié
  e('nour', 'OFFICINE', null, null);                      // officine : catégorie fixée par le type (pharmacie privée), rien à déclarer
  e('wait', 'SUPPLIER', 'DISTRIBUTOR', 'DECLARED');      // distributeur acheteur dont l'agrément est en cours de vérification
  u('atlasAdmin', 'FOURNISSEUR', [aff('atlas')]);
  u('sahelAdmin', 'FOURNISSEUR', [aff('sahel')]);
  u('atlasStaff', 'FOURNISSEUR', [aff('atlas', 'MEMBER')]);       // employé (commercial) d'Atlas
  u('freshStaff', 'FOURNISSEUR', []);                              // employé pas encore invité
  u('newbieAdmin', 'FOURNISSEUR', [aff('newbie')]);
  u('nourPharm', 'PHARMACIEN', [aff('nour', 'MEMBER')]);
  u('nourDoc', 'DOCTOR', [aff('nour', 'MEMBER')]);
  u('waitPharm', 'PHARMACIEN', [aff('wait', 'MEMBER')]);
  u('solo', 'DOCTOR', []);
  const l = (id: string, est: string, over: any = {}) => db.listings.push({ id, establishmentId: est, title: `Produit ${id}`, sellerKind: 'DISTRIBUTOR', status: 'PUBLISHED', reviewStatus: 'APPROVED', unitPrice: 100, priceUnit: 'boîte', minOrderQty: 5, inStock: true, ...over });
  l('p1', 'atlas'); l('p2', 'atlas', { unitPrice: 250.5, minOrderQty: 1 }); l('s1', 'sahel');
  l('draft', 'atlas', { status: 'DRAFT' }); l('noprice', 'atlas', { unitPrice: null }); l('oos', 'atlas', { inStock: false });
  l('pending', 'atlas', { reviewStatus: 'PENDING' }); l('nb', 'newbie');
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('offres locales (catalogue du site)', () => {
  it('liste seulement : publié + approuvé + prix + en stock + fournisseur vérifié ; sans mes propres produits', async () => {
    const r = await call('GET', '/offers', 'nourPharm');
    expect(r.status).toBe(200);
    expect(r.json.manufacturersUnavailable).toBe(true); // Audit en panne ne masque pas les fournisseurs
    expect(r.json.offers.map((o: any) => o.ref).sort()).toEqual(['local:p1', 'local:p2', 'local:s1']);
    const own = await call('GET', '/offers', 'atlasAdmin');
    expect(own.json.offers.map((o: any) => o.ref)).toEqual(['local:s1']);
  });
  it('une offre porte le prix, le minimum et le nom du fournisseur', async () => {
    const r = await call('GET', '/offers?q=p2', 'nourPharm');
    expect(r.json.offers).toHaveLength(1);
    expect(r.json.offers[0]).toMatchObject({ unitPrice: 250.5, minOrderQty: 1, manufacturer: { name: 'Etab atlas' } });
  });
  it('sans session => 401', async () => { expect((await call('GET', '/offers')).status).toBe(401); });
  it("/me : une pharmacie vérifiée peut commander (chez un fournisseur)", async () => {
    const r = await call('GET', '/me', 'nourPharm');
    expect(r.json.establishments[0]).toMatchObject({ id: 'nour', canOrder: true, canOrderFromSuppliers: true, canOrderFromManufacturers: false, orderBlocker: null });
    const w = await call('GET', '/me', 'waitPharm');
    expect(w.json.establishments[0]).toMatchObject({ canOrder: false, orderBlocker: 'CATEGORY_NOT_VERIFIED' });
  });
});

describe('commande chez un fournisseur', () => {
  const line = (ref: string, quantity: number) => ({ lines: [{ productRef: ref, quantity }] });

  it('pharmacie vérifiée : commande créée PENDING, montant calculé côté serveur, instantané des prix', async () => {
    const r = await order('nourPharm', { establishmentId: 'nour', ...line('local:p1', 10), note: 'Livraison le matin' });
    expect(r.status).toBe(201);
    expect(r.json.request).toMatchObject({ kind: 'ORDER', delivery: 'SENT', status: 'PENDING', manufacturer: 'Etab atlas', totalAmount: 1000, cancellable: true });
    expect(r.json.request.lines[0]).toMatchObject({ product: 'Produit p1', quantity: 10, unitPrice: 100 });
    expect(db.orders).toHaveLength(1);
    expect(db.orders[0]).toMatchObject({ sellerEstablishmentId: 'atlas', buyerEstablishmentId: 'nour', buyerUserId: 'nourPharm', status: 'PENDING', note: 'Livraison le matin' });
    expect(db.orders[0].reference).toMatch(/^CMD-2026-/);
    // un prix modifié ensuite ne réécrit pas la commande
    db.listings.find((x) => x.id === 'p1').unitPrice = 999;
    expect(db.orders[0].totalAmount).toBe(1000);
  });
  it('le prix envoyé par le client est ignoré (jamais lu)', async () => {
    const r = await order('nourPharm', { establishmentId: 'nour', lines: [{ productRef: 'local:p1', quantity: 5, unitPrice: 1 }], totalAmount: 1 });
    expect(r.status).toBe(201);
    expect(r.json.request.totalAmount).toBe(500);
  });
  it('même clé clientRequestId : renvoie la même commande, sans doublon', async () => {
    const body = { clientRequestId: 'same-key-12345', establishmentId: 'nour', contact, ...line('local:p1', 5) };
    const a = await call('POST', '/orders', 'nourPharm', body);
    const b = await call('POST', '/orders', 'nourPharm', body);
    expect([a.status, b.status]).toEqual([201, 200]);
    expect(b.json.request.id).toBe(a.json.request.id);
    expect(db.orders).toHaveLength(1);
  });
  it('refus : catégorie en cours de vérification, médecin simple membre, compte sans établissement', async () => {
    expect((await order('waitPharm', { establishmentId: 'wait', ...line('local:p1', 5) })).json.code).toBe('CATEGORY_NOT_VERIFIED');
    expect((await order('nourDoc', { establishmentId: 'nour', ...line('local:p1', 5) })).json.code).toBe('NOT_ESTABLISHMENT_ADMIN');
    expect((await order('solo', { establishmentId: 'nour', ...line('local:p1', 5) })).status).toBe(403);
    expect(db.orders).toHaveLength(0);
  });
  it('refus : quantité sous le minimum, produit brouillon / sans prix / hors stock / non approuvé / fournisseur non vérifié', async () => {
    expect((await order('nourPharm', { establishmentId: 'nour', ...line('local:p1', 4) })).json.code).toBe('MIN_QUANTITY');
    for (const id of ['draft', 'noprice', 'oos', 'pending', 'nb', 'inexistant']) {
      const r = await order('nourPharm', { establishmentId: 'nour', ...line(`local:${id}`, 50) });
      expect([r.status, r.json.code], id).toEqual([422, 'PRODUCT_NOT_OFFERED']);
    }
    expect(db.orders).toHaveLength(0);
  });
  it('refus : deux fournisseurs dans une même commande ; quantité non entière ; contact manquant', async () => {
    const two = await order('nourPharm', { establishmentId: 'nour', lines: [{ productRef: 'local:p1', quantity: 5 }, { productRef: 'local:s1', quantity: 5 }] });
    expect([two.status, two.json.code]).toEqual([400, 'VALIDATION_ERROR']);
    expect((await order('nourPharm', { establishmentId: 'nour', ...line('local:p1', 5.5) })).status).toBe(400);
    expect((await order('nourPharm', { establishmentId: 'nour', ...line('local:p1', 5), contact: { name: 'x' } })).status).toBe(400);
  });
  it('un fournisseur ne commande pas chez lui-même, mais commande chez un AUTRE fournisseur', async () => {
    const self = await order('atlasAdmin', { establishmentId: 'atlas', ...line('local:p1', 5) });
    expect([self.status, self.json.code]).toEqual([403, 'OWN_LISTING']);
    const other = await order('atlasAdmin', { establishmentId: 'atlas', ...line('local:s1', 5) });
    expect(other.status).toBe(201);
    expect(db.orders[0]).toMatchObject({ sellerEstablishmentId: 'sahel', buyerEstablishmentId: 'atlas' });
  });
  it("un fournisseur NON vérifié ne peut pas encore acheter (même règle que les autres acheteurs)", async () => {
    const r = await order('newbieAdmin', { establishmentId: 'newbie', ...line('local:s1', 5) });
    expect([r.status, r.json.code]).toEqual([403, 'CATEGORY_NOT_VERIFIED']);
  });
});

describe("demande d'intérêt chez un fournisseur", () => {
  it('tout compte connecté peut en envoyer une, sans établissement vérifié ; le vendeur la reçoit', async () => {
    const r = await call('POST', '/interests', 'solo', { productRef: 'local:p1', clientRequestId: 'interest-key-1', contact, quantity: 20, message: 'Prix pour 20 ?' });
    expect(r.status).toBe(201);
    expect(r.json.request).toMatchObject({ kind: 'INTEREST', status: 'NEW', delivery: 'SENT' });
    const sales = await call('GET', '/sales', 'atlasAdmin');
    expect(sales.json.sales).toHaveLength(1);
    expect(sales.json.counts.newInterests).toBe(1);
  });
  it('produit non publié => 422', async () => {
    expect((await call('POST', '/interests', 'solo', { productRef: 'local:draft', clientRequestId: 'interest-key-2', contact })).status).toBe(422);
  });
});

describe('boîte de réception du fournisseur', () => {
  const place = async () => (await order('nourPharm', { establishmentId: 'nour', lines: [{ productRef: 'local:p1', quantity: 10 }] })).json.request.id as string;
  const move = (as: string, id: string, status: string, note?: string) => call('POST', `/sales/${id}/status`, as, { status, ...(note ? { note } : {}) });

  it('le fournisseur voit les commandes de SES clients avec contact et établissement, pas celles des autres', async () => {
    await place();
    await order('nourPharm', { establishmentId: 'nour', lines: [{ productRef: 'local:s1', quantity: 5 }] });
    const mine = await call('GET', '/sales', 'atlasAdmin');
    expect(mine.json.sales).toHaveLength(1);
    expect(mine.json.sales[0].buyer).toMatchObject({ name: 'Etab nour', category: 'PRIVATE_PHARMACY', verified: true, contactEmail: 'ali@pharma.dz', contactPhone: '0550123456' });
    expect(mine.json.sales[0].nextStatuses).toEqual(['CONFIRMED', 'REJECTED']);
    expect(mine.json.counts).toMatchObject({ pending: 1 });
    expect((await call('GET', '/sales', 'sahelAdmin')).json.sales).toHaveLength(1);
  });
  it('réservé aux comptes fournisseur', async () => {
    expect((await call('GET', '/sales', 'nourPharm')).status).toBe(403);
    expect((await call('GET', '/sales')).status).toBe(401);
  });
  it('flux complet PENDING → CONFIRMED → SHIPPED → DELIVERED, vu par le client à chaque étape', async () => {
    const id = await place();
    for (const st of ['CONFIRMED', 'SHIPPED', 'DELIVERED']) {
      const r = await move('atlasAdmin', id, st);
      expect(r.status, st).toBe(200);
      expect(r.json.sale.status).toBe(st);
      const mine = (await call('GET', '/requests', 'nourPharm')).json.requests.find((x: any) => x.id === id);
      expect(mine.status).toBe(st);
    }
    const hist = (await call('GET', '/requests', 'nourPharm')).json.requests[0].history.map((h: any) => h.status);
    expect(hist).toEqual(['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED']);
  });
  it('transitions interdites : saut, retour, état final => 409', async () => {
    const id = await place();
    expect((await move('atlasAdmin', id, 'DELIVERED')).status).toBe(409);
    await move('atlasAdmin', id, 'CONFIRMED');
    expect((await move('atlasAdmin', id, 'PENDING')).status).toBe(409);
    await move('atlasAdmin', id, 'SHIPPED'); await move('atlasAdmin', id, 'DELIVERED');
    expect((await move('atlasAdmin', id, 'CANCELLED')).status).toBe(409);
    expect((await move('atlasAdmin', id, 'HACK')).status).toBe(409);
  });
  it('refus : motif obligatoire, visible du client', async () => {
    const id = await place();
    expect((await move('atlasAdmin', id, 'REJECTED')).status).toBe(400);
    const r = await move('atlasAdmin', id, 'REJECTED', 'Rupture de stock');
    expect(r.status).toBe(200);
    const mine = (await call('GET', '/requests', 'nourPharm')).json.requests[0];
    expect(mine.status).toBe('CANCELLED');
    expect(mine.refusal).toContain('Rupture de stock');
  });
  it("un AUTRE fournisseur ne peut ni voir ni modifier la commande (404), un client non plus (404)", async () => {
    const id = await place();
    expect((await move('sahelAdmin', id, 'CONFIRMED')).status).toBe(404);
    expect((await move('nourPharm', id, 'CONFIRMED')).status).toBe(404);
    expect(db.orders[0].status).toBe('PENDING');
  });
  it("demande d'intérêt : NEW → CONTACTED → CLOSED", async () => {
    const id = (await call('POST', '/interests', 'solo', { productRef: 'local:p1', clientRequestId: 'interest-key-9', contact })).json.request.id;
    expect((await move('atlasAdmin', id, 'CONTACTED')).status).toBe(200);
    expect((await move('atlasAdmin', id, 'CONFIRMED')).status).toBe(409);
    expect((await move('atlasAdmin', id, 'CLOSED')).status).toBe(200);
  });
});

describe('suivi et annulation côté client', () => {
  it('le client voit ses commandes (même format que les commandes aux fabricants) ; les autres clients ne les voient pas', async () => {
    await order('nourPharm', { establishmentId: 'nour', lines: [{ productRef: 'local:p1', quantity: 10 }] });
    const mine = await call('GET', '/requests', 'nourPharm');
    expect(mine.json.requests).toHaveLength(1);
    expect(mine.json.requests[0]).toMatchObject({ kind: 'ORDER', delivery: 'SENT', status: 'PENDING', manufacturer: 'Etab atlas', currency: 'DZD' });
    expect((await call('GET', '/requests', 'waitPharm')).json.requests).toHaveLength(0);
  });
  it('le client peut annuler tant que le fournisseur n\'a pas confirmé ; ensuite non', async () => {
    const id = (await order('nourPharm', { establishmentId: 'nour', lines: [{ productRef: 'local:p1', quantity: 10 }] })).json.request.id;
    const c = await call('POST', `/requests/${id}/cancel`, 'nourPharm');
    expect(c.status).toBe(200);
    expect(c.json.request.status).toBe('CANCELLED');
    expect(db.orders[0].history.at(-1)).toMatchObject({ status: 'CANCELLED', note: 'Annulée par le client' });

    const id2 = (await order('nourPharm', { establishmentId: 'nour', lines: [{ productRef: 'local:p1', quantity: 10 }] })).json.request.id;
    await call('POST', `/sales/${id2}/status`, 'atlasAdmin', { status: 'CONFIRMED' });
    expect((await call('POST', `/requests/${id2}/cancel`, 'nourPharm')).status).toBe(409);
  });
  it("on n'annule pas la commande d'un autre ; le fournisseur ne peut plus confirmer une commande annulée", async () => {
    const id = (await order('nourPharm', { establishmentId: 'nour', lines: [{ productRef: 'local:p1', quantity: 10 }] })).json.request.id;
    expect((await call('POST', `/requests/${id}/cancel`, 'waitPharm')).status).toBe(404);
    await call('POST', `/requests/${id}/cancel`, 'nourPharm');
    expect((await call('POST', `/sales/${id}/status`, 'atlasAdmin', { status: 'CONFIRMED' })).status).toBe(409);
  });
});

describe('employé du fournisseur (MEMBER)', () => {
  const place = async () => (await order('nourPharm', { establishmentId: 'nour', lines: [{ productRef: 'local:p1', quantity: 10 }] })).json.request.id as string;
  it('voit les commandes de SA société et les fait avancer (comme l\'administrateur)', async () => {
    const id = await place();
    const sales = await call('GET', '/sales', 'atlasStaff');
    expect(sales.status).toBe(200);
    expect(sales.json.sales).toHaveLength(1);
    expect((await call('POST', `/sales/${id}/status`, 'atlasStaff', { status: 'CONFIRMED' })).status).toBe(200);
    expect(db.orders[0].status).toBe('CONFIRMED');
  });
  it("ne peut PAS acheter au nom de la société (réservé à l'administrateur) ", async () => {
    const r = await order('atlasStaff', { establishmentId: 'atlas', lines: [{ productRef: 'local:s1', quantity: 5 }] });
    expect([r.status, r.json.code]).toEqual([403, 'NOT_ESTABLISHMENT_ADMIN']);
    expect(db.orders).toHaveLength(0);
  });
  it("un employé pas encore invité (aucune affiliation) ne voit aucune commande", async () => {
    await place();
    expect((await call('GET', '/sales', 'freshStaff')).status).toBe(403);
  });
  it("un employé d'Atlas ne touche pas aux commandes de Sahel (404)", async () => {
    const id = (await order('nourPharm', { establishmentId: 'nour', lines: [{ productRef: 'local:s1', quantity: 5 }] })).json.request.id;
    expect((await call('POST', `/sales/${id}/status`, 'atlasStaff', { status: 'CONFIRMED' })).status).toBe(404);
  });
});

describe('réservation du stock (stockQty)', () => {
  const stock = (id: string) => db.listings.find((x) => x.id === id).stockQty;
  const buy = (as: string, est: string, ref: string, q: number) => order(as, { establishmentId: est, lines: [{ productRef: ref, quantity: q }] });
  beforeEach(() => { db.listings.find((x) => x.id === 'p1').stockQty = 12; });

  it('commande : la quantité est retirée du stock et marquée « réservée » sur la ligne', async () => {
    const r = await buy('nourPharm', 'nour', 'local:p1', 10);
    expect(r.status).toBe(201);
    expect(stock('p1')).toBe(2);
    expect(db.orders[0].lines[0]).toMatchObject({ listingId: 'p1', quantity: 10, reserved: true });
  });
  it('stock insuffisant : 409 INSUFFICIENT_STOCK avec la quantité disponible, rien n\'est écrit', async () => {
    const r = await buy('nourPharm', 'nour', 'local:p1', 13);
    expect([r.status, r.json.code, r.json.available]).toEqual([409, 'INSUFFICIENT_STOCK', 12]);
    expect(stock('p1')).toBe(12);
    expect(db.orders).toHaveLength(0);
  });
  it('deux clients, même stock : le premier passe, le second est refusé (pas de survente)', async () => {
    db.listings.find((x) => x.id === 'p2').stockQty = 5; // p2 : minimum 1
    const a = await buy('nourPharm', 'nour', 'local:p2', 3);
    const c = await buy('sahelAdmin', 'sahel', 'local:p2', 3);
    expect(a.status).toBe(201);
    expect([c.status, c.json.code, c.json.available]).toEqual([409, 'INSUFFICIENT_STOCK', 2]);
    expect(stock('p2')).toBe(2);
    expect(db.orders).toHaveLength(1);
  });
  it('commande à plusieurs lignes : si la 2e manque de stock, la 1re est ANNULÉE aussi (rollback)', async () => {
    db.listings.find((x) => x.id === 'p2').stockQty = 1;
    const r = await order('nourPharm', { establishmentId: 'nour', lines: [{ productRef: 'local:p1', quantity: 10 }, { productRef: 'local:p2', quantity: 2 }] });
    expect([r.status, r.json.code]).toEqual([409, 'INSUFFICIENT_STOCK']);
    expect(stock('p1')).toBe(12); // la 1re ligne avait été retirée dans la transaction : elle est revenue
    expect(stock('p2')).toBe(1);
    expect(db.orders).toHaveLength(0);
  });
  it('quantité non suivie (stockQty absent) : comportement inchangé, aucun décrément', async () => {
    const r = await buy('nourPharm', 'nour', 'local:s1', 50);
    expect(r.status).toBe(201);
    expect(db.listings.find((x) => x.id === 's1').stockQty).toBeUndefined();
    expect(db.orders[0].lines[0].reserved).toBeUndefined();
  });
  it('stock à 0 ou sous le minimum de commande : le produit disparaît du catalogue et n\'est plus commandable', async () => {
    db.listings.find((x) => x.id === 'p1').stockQty = 4; // minimum = 5
    expect((await call('GET', '/offers', 'nourPharm')).json.offers.map((o: any) => o.ref)).not.toContain('local:p1');
    const r = await buy('nourPharm', 'nour', 'local:p1', 5);
    expect([r.status, r.json.code]).toEqual([422, 'PRODUCT_NOT_OFFERED']);
  });
  it('refus par le fournisseur : le stock est rendu, une seule fois', async () => {
    const id = (await buy('nourPharm', 'nour', 'local:p1', 10)).json.request.id;
    expect(stock('p1')).toBe(2);
    expect((await call('POST', `/sales/${id}/status`, 'atlasAdmin', { status: 'REJECTED', note: 'Erreur de prix' })).status).toBe(200);
    expect(stock('p1')).toBe(12);
    expect((await call('POST', `/sales/${id}/status`, 'atlasAdmin', { status: 'REJECTED', note: 'encore' })).status).toBe(409);
    expect(stock('p1')).toBe(12);
  });
  it('annulation par le client : stock rendu, une seule fois', async () => {
    const id = (await buy('nourPharm', 'nour', 'local:p1', 10)).json.request.id;
    expect((await call('POST', `/requests/${id}/cancel`, 'nourPharm')).status).toBe(200);
    expect(stock('p1')).toBe(12);
    expect((await call('POST', `/requests/${id}/cancel`, 'nourPharm')).status).toBe(409);
    expect(stock('p1')).toBe(12);
  });
  it('annulation par le fournisseur après confirmation : stock rendu ; confirmer / expédier / livrer ne touchent pas au stock', async () => {
    const id = (await buy('nourPharm', 'nour', 'local:p1', 10)).json.request.id;
    await call('POST', `/sales/${id}/status`, 'atlasAdmin', { status: 'CONFIRMED' });
    expect(stock('p1')).toBe(2);
    expect((await call('POST', `/sales/${id}/status`, 'atlasAdmin', { status: 'CANCELLED', note: 'Lot rappelé' })).status).toBe(200);
    expect(stock('p1')).toBe(12);
    const id2 = (await buy('nourPharm', 'nour', 'local:p1', 10)).json.request.id;
    for (const st of ['CONFIRMED', 'SHIPPED', 'DELIVERED']) await call('POST', `/sales/${id2}/status`, 'atlasAdmin', { status: st });
    expect(stock('p1')).toBe(2);
  });
  it('commande ancienne (sans drapeau « reserved ») : l\'annulation ne rend RIEN', async () => {
    db.orders.push({ id: 'old1', reference: 'CMD-2026-OLD111', kind: 'ORDER', sellerEstablishmentId: 'atlas', buyerEstablishmentId: 'nour', buyerUserId: 'nourPharm', status: 'PENDING',
      summary: 'x', lines: [{ listingId: 'p1', product: 'Produit p1', quantity: 10, unitPrice: 100 }], totalAmount: 1000, contact, history: [], createdAt: new Date(), updatedAt: new Date(), sellerNote: null });
    expect((await call('POST', '/requests/old1/cancel', 'nourPharm')).status).toBe(200);
    expect(stock('p1')).toBe(12);
  });
  it('le fournisseur a cessé de suivre la quantité entre-temps : l\'annulation ne la réinvente pas', async () => {
    const id = (await buy('nourPharm', 'nour', 'local:p1', 10)).json.request.id;
    db.listings.find((x) => x.id === 'p1').stockQty = null;
    await call('POST', `/requests/${id}/cancel`, 'nourPharm');
    expect(stock('p1')).toBeNull();
  });
  it('demande d\'intérêt : ne réserve rien', async () => {
    await call('POST', '/interests', 'solo', { productRef: 'local:p1', clientRequestId: 'interest-key-77', contact, quantity: 10 });
    expect(stock('p1')).toBe(12);
  });
});

describe('e-mail au fournisseur quand le client annule', () => {
  const place = async () => (await order('nourPharm', { establishmentId: 'nour', lines: [{ productRef: 'local:p1', quantity: 10 }] })).json.request.id as string;
  const flush = () => new Promise((r) => setTimeout(r, 20)); // l'envoi est « fire and forget » : on laisse la promesse se terminer
  const cancels = () => mailbox.sent.filter((m) => /annulée/i.test(m.subject));

  it('prévient l\'administrateur ET les employés actifs d\'Atlas, pas le client, pas un autre fournisseur', async () => {
    const id = await place();
    mailbox.sent.length = 0;
    expect((await call('POST', `/requests/${id}/cancel`, 'nourPharm')).status).toBe(200);
    await flush();
    expect(cancels().map((m) => m.to).sort()).toEqual(['atlasadmin@x.dz', 'atlasstaff@x.dz']);
    expect(cancels()[0].subject).toContain(db.orders[0].reference);
    expect(cancels()[0].text).toContain('Etab nour');
    expect(mailbox.sent.some((m) => m.to === 'saheladmin@x.dz' || m.to === 'ali@pharma.dz')).toBe(false); // jamais l'adresse « contact » du formulaire
  });
  it('l\'e-mail dit que la quantité réservée est remise en stock, seulement si elle l\'était', async () => {
    db.listings.find((x) => x.id === 'p1').stockQty = 12;
    const a = await place();
    mailbox.sent.length = 0;
    await call('POST', `/requests/${a}/cancel`, 'nourPharm'); await flush();
    expect(cancels()[0].text).toMatch(/remises en stock/);
    const b = (await order('nourPharm', { establishmentId: 'nour', lines: [{ productRef: 'local:s1', quantity: 5 }] })).json.request.id; // fournisseur sans suivi
    mailbox.sent.length = 0;
    await call('POST', `/requests/${b}/cancel`, 'nourPharm'); await flush();
    expect(cancels()[0].text).not.toMatch(/remises en stock/);
  });
  it('SMTP en panne : l\'annulation réussit quand même', async () => {
    const id = await place();
    mailbox.fail = true;
    expect((await call('POST', `/requests/${id}/cancel`, 'nourPharm')).status).toBe(200);
    await flush();
    expect(db.orders[0].status).toBe('CANCELLED');
  });
  it('annulation refusée (déjà confirmée) : aucun e-mail', async () => {
    const id = await place();
    await call('POST', `/sales/${id}/status`, 'atlasAdmin', { status: 'CONFIRMED' });
    mailbox.sent.length = 0;
    expect((await call('POST', `/requests/${id}/cancel`, 'nourPharm')).status).toBe(409);
    await flush();
    expect(mailbox.sent).toHaveLength(0);
  });
});

describe('visibilité du catalogue (serveur)', () => {
  const addMaker = () => {
    db.ests.push({ id: 'mfr', name: 'Etab mfr', type: 'MANUFACTURER', isSystemReserved: false, buyerCategory: null, buyerCategoryStatus: null, auditManufacturerRef: 'mf:1' });
    db.listings.push({ id: 'mk1', establishmentId: 'mfr', title: 'Produit mk1', sellerKind: 'MANUFACTURER', status: 'PUBLISHED', reviewStatus: 'APPROVED', unitPrice: null, inStock: true });
  };
  it('pharmacie privée vérifiée (fournisseurs seuls) : la fiche du fabricant est masquée, pas celles des fournisseurs', async () => {
    addMaker();
    const r = await call('GET', '/catalogue-access', 'nourPharm');
    expect(r.status).toBe(200);
    expect(r.json.hiddenListingIds).toEqual(['mk1']);
  });
  it('un fournisseur ne voit pas disparaître ses propres fiches ni celles des autres fournisseurs', async () => {
    addMaker();
    const r = await call('GET', '/catalogue-access', 'atlasAdmin');
    expect(r.json.hiddenListingIds).not.toContain('p1');
    expect(r.json.hiddenListingIds).not.toContain('s1');
  });
  it('compte qui ne peut rien commander (pharmacie en cours de vérification, médecin sans établissement) : rien de masqué', async () => {
    addMaker();
    for (const who of ['waitPharm', 'solo']) {
      const r = await call('GET', '/catalogue-access', who);
      expect(r.status).toBe(200);
      expect(r.json.hiddenListingIds).toEqual([]);
    }
  });
  it('sans session => 401 (le visiteur n\'appelle pas cette route : il voit tout)', async () => {
    expect((await call('GET', '/catalogue-access')).status).toBe(401);
  });
  describe('lien explicite fiche -> produit Audit (masquage par produit)', () => {
    // Fabricant aux offres MÉLANGÉES : prodA fermé à la catégorie DISTRIBUTOR, prodB ouvert. mk3 n'est pas liée.
    const setup = () => {
      db.ests.push({ id: 'mfr', name: 'Etab mfr', type: 'MANUFACTURER', isSystemReserved: false, buyerCategory: null, buyerCategoryStatus: null, auditManufacturerRef: 'mf:1' });
      const mk = (id: string, title: string, auditProductRef: string | null) =>
        db.listings.push({ id, establishmentId: 'mfr', title, sellerKind: 'MANUFACTURER', status: 'PUBLISHED', reviewStatus: 'APPROVED', unitPrice: null, inStock: true, auditProductRef });
      mk('mk1', 'Seringue 5 mL', 'prodA');
      mk('mk2', 'Cathéter 18G', 'prodB');
      mk('mk3', 'Gants nitrile', null);
      auditMock.offers = [
        { ref: 'prodA', name: 'Seringue 5 mL', manufacturer: { ref: 'mf:1' }, orderableBy: ['EXPORT'] },
        { ref: 'prodB', name: 'Seringue 5 mL stérile', manufacturer: { ref: 'mf:1' }, orderableBy: ['DISTRIBUTOR'] },
      ];
    };
    it('/catalogue-access : seule la fiche liée au produit fermé est masquée ; la fiche non liée suit la règle du fabricant (visible)', async () => {
      setup();
      const r = await call('GET', '/catalogue-access', 'atlasAdmin');
      expect(r.status).toBe(200);
      expect(r.json.hiddenListingIds).toEqual(['mk1']);
      expect(r.json.partial).toBe(false);
    });
    it('produit retiré d\'Audit : la fiche liée suit la règle du fabricant (ici en partie ouvert : visible) ; Audit en panne : rien de masqué, partial', async () => {
      setup();
      auditMock.offers = auditMock.offers!.filter((o) => o.ref !== 'prodA');
      expect((await call('GET', '/catalogue-access', 'atlasAdmin')).json.hiddenListingIds).toEqual([]);
      auditMock.offers = null;
      const down = await call('GET', '/catalogue-access', 'atlasAdmin');
      expect(down.json.hiddenListingIds).toEqual([]);
      expect(down.json.partial).toBe(true);
    });
    it('fiche produit : availableForYou suit l\'offre liée (false pour mk1, true pour mk2)', async () => {
      setup();
      expect((await call('GET', '/listings/mk1/engagement', 'atlasAdmin')).json.availableForYou).toBe(false);
      expect((await call('GET', '/listings/mk2/engagement', 'atlasAdmin')).json.availableForYou).toBe(true);
    });
    it('/offers : chaque offre ouvre SA fiche liée, même quand le titre d\'une autre fiche ressemble davantage', async () => {
      setup();
      const r = await call('GET', '/offers', 'atlasAdmin');
      const byRef = Object.fromEntries(r.json.offers.map((o: any) => [o.ref, o]));
      expect(byRef.prodA.listingId).toBe('mk1');
      expect(byRef.prodB.listingId).toBe('mk2'); // « Seringue 5 mL stérile » ressemble à mk1, mais le lien explicite gagne
      expect(byRef.prodA.orderable).toBe(false);
      expect(byRef.prodB.orderable).toBe(true);
    });
  });

  it('/offers : chaque offre porte `orderable` (true ici : fournisseurs, pharmacie privée)', async () => {
    const r = await call('GET', '/offers', 'nourPharm');
    expect(r.json.offers.every((o: any) => o.orderable === true)).toBe(true);
  });
  it("fiche directe : availableForYou = false pour un fabricant fermé à ma catégorie, true pour un fournisseur, null pour le visiteur", async () => {
    addMaker();
    expect((await call('GET', '/listings/mk1/engagement', 'nourPharm')).json.availableForYou).toBe(false);
    expect((await call('GET', '/listings/p1/engagement', 'nourPharm')).json.availableForYou).toBe(true);
    expect((await call('GET', '/listings/mk1/engagement', 'waitPharm')).json.availableForYou).toBeNull(); // ne peut rien commander : pas de restriction
    expect((await call('GET', '/listings/mk1/engagement')).json.availableForYou).toBeNull();
  });
});
