/**
 * Étape 2 (serveur) du lien explicite fiche -> produit Audit (auditProductRef).
 * Vraie app Express, Prisma remplacé par un faux en mémoire, Audit remplacé par un vi.fn().
 *   - GET /api/services/audit-products : seulement les produits du fabricant lié, avec la fiche qui les utilise déjà
 *   - création / modification : ref de mon fabricant acceptée, ref d'un autre fabricant refusée, Audit en panne => 503
 *   - pas deux fiches actives sur le même produit (une fiche archivée ne bloque pas, mais ne revient pas en doublon)
 *   - changer / retirer le lien renvoie la fiche en revue (PENDING) ; garder le même lien ne demande pas Audit
 *   - la revue VigiCore montre le produit lié et signale un lien qui ne correspond plus
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'net';
import {
  checkProductRef,
  linkChanged,
  parseProductRef,
  productsOfManufacturer,
} from '../src/services/listingProductLink';

const db = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.PLATFORM_ADMIN_EMAILS = 'staff@x.dz';
  process.env.FREE_LISTING_LIMIT = '10';
  delete process.env.MARKET_DEMO_OFFERS; // le vrai transport (ici simulé) : pas le mode démo
  return { users: [] as any[], establishments: [] as any[], listings: [] as any[], orders: [] as any[], seq: 0 };
});

const audit = vi.hoisted(() => ({ callAudit: vi.fn() }));
vi.mock('../src/lib/auditClient', () => ({ callAudit: audit.callAudit, auditConfigured: () => true }));

vi.mock('../src/lib/prisma', () => {
  const id = (p: string) => `${p}${++db.seq}`;
  const match = (row: any, where: any = {}): boolean =>
    Object.entries(where).every(([k, v]: [string, any]) => {
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('in' in v) return v.in.includes(row[k]);
        if ('not' in v) return row[k] !== v.not;
        if ('gte' in v) return row[k] >= v.gte;
        if ('gt' in v) return row[k] != null && row[k] > v.gt;
      }
      return row[k] === v;
    });
  const withRel = (r: any, include: any) => ({
    ...r,
    ...(include?.establishment ? { establishment: db.establishments.find((e) => e.id === r.establishmentId) } : {}),
    ...(include?.createdBy ? { createdBy: db.users.find((u) => u.id === r.createdByUserId) } : {}),
  });
  const table = (rows: any[], defaults: (d: any) => any) => ({
    findMany: async ({ where, include }: any = {}) => rows.filter((r) => match(r, where)).map((r) => withRel(r, include)),
    findFirst: async ({ where }: any = {}) => rows.find((r) => match(r, where)) ?? null,
    count: async ({ where }: any = {}) => rows.filter((r) => match(r, where)).length,
    findUnique: async ({ where, include }: any) => {
      const r = rows.find((x) => match(x, where));
      return r ? withRel(r, include) : null;
    },
    create: async ({ data }: any) => { const r = defaults(data); rows.push(r); return r; },
    update: async ({ where, data }: any) => Object.assign(rows.find((x) => match(x, where)), data, { updatedAt: new Date() }),
    updateMany: async ({ where, data }: any) => { const hit = rows.filter((r) => match(r, where)); hit.forEach((r) => Object.assign(r, data)); return { count: hit.length }; },
    delete: async ({ where }: any) => { const i = rows.findIndex((x) => match(x, where)); return rows.splice(i, 1)[0]; },
  });
  const listings = table(db.listings, (d) => ({
    id: id('l'), status: 'DRAFT', reviewStatus: 'PENDING', reviewNote: null, promoAllowed: false, placement: null, placementUntil: null,
    sellerKind: 'MANUFACTURER', auditProductRef: null, createdAt: new Date(), updatedAt: new Date(), ...d,
  }));
  const prisma: any = {
    productListing: listings,
    placementOrder: table(db.orders, (d) => ({ id: id('o'), status: 'PENDING', ...d })),
    user: { findUnique: async ({ where }: any) => db.users.find((u) => u.id === where.id) ?? null },
    establishment: { findUnique: async ({ where }: any) => db.establishments.find((e) => e.id === where.id) ?? null },
    $transaction: async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)),
  };
  return { prisma };
});

import { createApp } from '../src/app';
import { signSessionToken } from '../src/lib/jwt';

// ── Audit simulé : deux fabricants, org-a (celui d'Alpha) et org-z (un autre) ──
const OFFERS = [
  { ref: 'off-a1', name: 'Seringue 5 ml', reference: 'SER-5', orderableBy: ['PUBLIC_INSTITUTION'], manufacturer: { ref: 'org-a', name: 'Alpha' } },
  { ref: 'off-a2', name: 'Cathéter 18G', reference: 'CAT-18', orderableBy: ['DISTRIBUTOR'], manufacturer: { ref: 'org-a', name: 'Alpha' } },
  { ref: 'off-z1', name: 'Gants nitrile', reference: 'GNT', orderableBy: ['DISTRIBUTOR'], manufacturer: { ref: 'org-z', name: 'Zeta' } },
];
let auditUp = true;
const auditCalls = () => audit.callAudit.mock.calls.length;

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

const PRODUCT = { title: 'Seringue', summary: 'Une ligne', description: 'Texte long' };

beforeEach(() => {
  db.users.length = db.establishments.length = db.listings.length = db.orders.length = 0;
  auditUp = true;
  audit.callAudit.mockReset();
  audit.callAudit.mockImplementation(async (req: any) => {
    if (!auditUp) return { kind: 'network', error: 'down' };
    if (req.method === 'GET' && req.path.startsWith('/nexus/v1/catalogue/offers')) return { kind: 'http', status: 200, data: { offers: OFFERS } };
    return { kind: 'http', status: 404, data: {} };
  });
  db.establishments.push(
    { id: 'estA', name: 'Alpha Labo', auditManufacturerRef: 'org-a' },
    { id: 'estN', name: 'Labo non lié', auditManufacturerRef: null },
    { id: 'estF', name: 'Grossiste', auditManufacturerRef: null },
  );
  const user = (id: string, est: string, role = 'ESTABLISHMENT_ADMIN') => ({
    id, email: `${id}@x.dz`, displayName: id, role,
    affiliations: [{ establishmentId: est, isActiveContext: true, status: 'ACTIVE', memberRole: 'ADMIN' }],
  });
  db.users.push(user('adminA', 'estA'), user('adminN', 'estN'), user('fourn', 'estF', 'FOURNISSEUR'), { ...user('staff', 'estN'), email: 'staff@x.dz' });
});

async function approvedLinked(ref = 'off-a1') {
  const id = (await call('POST', '/', { ...PRODUCT, auditProductRef: ref }, 'adminA')).json.listing.id;
  expect((await call('POST', `/${id}/publish`, {}, 'adminA')).status).toBe(200);
  expect((await call('POST', `/admin/listings/${id}/approve`, {}, 'staff')).status).toBe(200);
  return id;
}

// ── Fonctions pures ──

describe('listingProductLink (pur)', () => {
  it('parseProductRef : absent = inchangé, null/vide = retirer, texte = lien, autre type = erreur', () => {
    expect(parseProductRef({})).toEqual({ ok: true, value: undefined });
    expect(parseProductRef({ auditProductRef: null })).toEqual({ ok: true, value: null });
    expect(parseProductRef({ auditProductRef: '   ' })).toEqual({ ok: true, value: null });
    expect(parseProductRef({ auditProductRef: ' off-a1 ' })).toEqual({ ok: true, value: 'off-a1' });
    expect(parseProductRef({ auditProductRef: 12 }).ok).toBe(false);
    expect(parseProductRef({ auditProductRef: 'x'.repeat(201) }).ok).toBe(false);
  });

  it('productsOfManufacturer : seulement ce fabricant, sans doublon, triés', () => {
    expect(productsOfManufacturer([...OFFERS, OFFERS[0]], 'org-a').map((p) => p.ref)).toEqual(['off-a2', 'off-a1']);
    expect(productsOfManufacturer(OFFERS, null)).toEqual([]);
  });

  it('checkProductRef : fournisseur, fabricant non lié, Audit en panne, produit d’un autre, ok', () => {
    expect(checkProductRef('off-a1', { sellerKind: 'DISTRIBUTOR', manufacturerRef: 'org-a', offers: OFFERS })).toMatchObject({ ok: false, code: 'NOT_A_MANUFACTURER' });
    expect(checkProductRef('off-a1', { sellerKind: 'MANUFACTURER', manufacturerRef: null, offers: OFFERS })).toMatchObject({ ok: false, code: 'MANUFACTURER_NOT_LINKED' });
    expect(checkProductRef('off-a1', { sellerKind: 'MANUFACTURER', manufacturerRef: 'org-a', offers: null })).toMatchObject({ ok: false, status: 503 });
    expect(checkProductRef('off-z1', { sellerKind: 'MANUFACTURER', manufacturerRef: 'org-a', offers: OFFERS })).toMatchObject({ ok: false, code: 'PRODUCT_NOT_YOURS' });
    expect(checkProductRef('off-a1', { sellerKind: 'MANUFACTURER', manufacturerRef: 'org-a', offers: OFFERS })).toEqual({ ok: true });
  });

  it('linkChanged', () => {
    expect(linkChanged('a', undefined)).toBe(false);
    expect(linkChanged(null, null)).toBe(false);
    expect(linkChanged('a', 'a')).toBe(false);
    expect(linkChanged('a', null)).toBe(true);
    expect(linkChanged(null, 'b')).toBe(true);
  });
});

// ── Routes ──

describe('GET /api/services/audit-products', () => {
  it('liste les produits de MON fabricant et la fiche active qui en utilise déjà un', async () => {
    const id = (await call('POST', '/', { ...PRODUCT, auditProductRef: 'off-a1' }, 'adminA')).json.listing.id;
    const r = await call('GET', '/audit-products', undefined, 'adminA');
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ applicable: true, manufacturerLinked: true, available: true });
    expect(r.json.products.map((p: any) => p.ref)).toEqual(['off-a2', 'off-a1']); // jamais off-z1
    expect(r.json.products.find((p: any) => p.ref === 'off-a1').linkedListing).toMatchObject({ id, title: 'Seringue' });
    expect(r.json.products.find((p: any) => p.ref === 'off-a2').linkedListing).toBeNull();
    expect(r.json.products[0]).not.toHaveProperty('unitPrice');
  });

  it('établissement non lié à un fabricant, Audit en panne, fournisseur, établissement d’un autre', async () => {
    expect((await call('GET', '/audit-products', undefined, 'adminN')).json).toMatchObject({ manufacturerLinked: false, products: [] });
    auditUp = false;
    expect((await call('GET', '/audit-products', undefined, 'adminA')).json).toMatchObject({ manufacturerLinked: true, available: false, products: [] });
    expect((await call('GET', '/audit-products', undefined, 'fourn')).json).toMatchObject({ applicable: false, products: [] });
    expect((await call('GET', '/audit-products?establishmentId=estA', undefined, 'adminN')).status).toBe(403);
    expect((await call('GET', '/audit-products')).status).toBe(401);
  });
});

describe('création avec lien', () => {
  it('ref de mon fabricant : acceptée et enregistrée', async () => {
    const r = await call('POST', '/', { ...PRODUCT, title: 'Cathéter 18G stérile', auditProductRef: 'off-a2' }, 'adminA');
    expect(r.status).toBe(201);
    expect(r.json.listing).toMatchObject({ auditProductRef: 'off-a2', status: 'DRAFT' });
  });

  it('produit sans rapport avec la fiche : 409 PRODUCT_MISMATCH, rien créé ; accepté seulement sur confirmation explicite (2026-10-29)', async () => {
    const r = await call('POST', '/', { ...PRODUCT, title: 'Seringue 10 ml', auditProductRef: 'off-a2' }, 'adminA');
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({ code: 'PRODUCT_MISMATCH', product: { ref: 'off-a2', name: 'Cathéter 18G' } });
    expect(db.listings).toHaveLength(0);
    const ok = await call('POST', '/', { ...PRODUCT, title: 'Seringue 10 ml', auditProductRef: 'off-a2', confirmProductMismatch: true }, 'adminA');
    expect(ok.status).toBe(201);
    expect(ok.json.listing).not.toHaveProperty('confirmProductMismatch'); // jamais enregistré
  });

  it('sans lien : rien ne change et Audit n’est pas appelé', async () => {
    const r = await call('POST', '/', PRODUCT, 'adminA');
    expect(r.status).toBe(201);
    expect(r.json.listing.auditProductRef).toBeNull();
    expect(auditCalls()).toBe(0);
  });

  it('ref d’un autre fabricant / inconnue : 422, aucune fiche créée', async () => {
    const r = await call('POST', '/', { ...PRODUCT, auditProductRef: 'off-z1' }, 'adminA');
    expect(r.status).toBe(422);
    expect(r.json.code).toBe('PRODUCT_NOT_YOURS');
    expect((await call('POST', '/', { ...PRODUCT, auditProductRef: 'nope' }, 'adminA')).status).toBe(422);
    expect(db.listings).toHaveLength(0);
  });

  it('établissement non lié : 409 ; Audit en panne : 503 ; fournisseur : 400 ; type invalide : 400', async () => {
    expect((await call('POST', '/', { ...PRODUCT, auditProductRef: 'off-a1' }, 'adminN')).json.code).toBe('MANUFACTURER_NOT_LINKED');
    auditUp = false;
    const down = await call('POST', '/', { ...PRODUCT, auditProductRef: 'off-a1' }, 'adminA');
    expect(down.status).toBe(503);
    expect(down.json.code).toBe('AUDIT_UNAVAILABLE');
    const f = await call('POST', '/', { ...PRODUCT, auditProductRef: 'off-a1' }, 'fourn');
    expect(f.status).toBe(400);
    expect(f.json.code).toBe('NOT_A_MANUFACTURER');
    expect((await call('POST', '/', { ...PRODUCT, auditProductRef: 42 }, 'adminA')).status).toBe(400);
    expect(db.listings).toHaveLength(0);
  });
});

describe('pas deux fiches actives sur le même produit', () => {
  it('doublon refusé ; après archivage de la première, une nouvelle fiche est permise ; l’ancienne ne revient pas en doublon', async () => {
    const first = (await call('POST', '/', { ...PRODUCT, auditProductRef: 'off-a1' }, 'adminA')).json.listing.id;
    const dup = await call('POST', '/', { ...PRODUCT, title: 'Seringue v2', auditProductRef: 'off-a1' }, 'adminA');
    expect(dup.status).toBe(409);
    expect(dup.json).toMatchObject({ code: 'PRODUCT_ALREADY_LINKED', listingId: first });

    expect((await call('PUT', `/${first}`, { status: 'ARCHIVED' }, 'adminA')).status).toBe(200);
    const second = await call('POST', '/', { ...PRODUCT, title: 'Seringue v2', auditProductRef: 'off-a1' }, 'adminA');
    expect(second.status).toBe(201);

    // L'archivée garde son lien mais ne peut revenir ni par publication ni en brouillon tant que l'autre est active.
    expect((await call('POST', `/${first}/publish`, {}, 'adminA')).json.code).toBe('PRODUCT_ALREADY_LINKED');
    expect((await call('PUT', `/${first}`, { status: 'DRAFT' }, 'adminA')).status).toBe(409);
    expect(db.listings.find((l) => l.id === first)).toMatchObject({ status: 'ARCHIVED', auditProductRef: 'off-a1' });

    // Lier une autre fiche au produit déjà pris : refusé aussi par PUT.
    const other = (await call('POST', '/', { ...PRODUCT, title: 'Cathéter' }, 'adminA')).json.listing.id;
    expect((await call('PUT', `/${other}`, { auditProductRef: 'off-a1' }, 'adminA')).status).toBe(409);
    // Une fiche qui reste archivée peut, elle, être liée sans contrôle de doublon.
    expect((await call('PUT', `/${first}`, { auditProductRef: 'off-a1', title: 'Seringue (ancienne)' }, 'adminA')).status).toBe(200);
  });
});

describe('modification du lien', () => {
  it('changer le produit lié renvoie une fiche approuvée en revue (et hors du catalogue public)', async () => {
    const id = await approvedLinked('off-a1');
    expect((await call('GET', '/')).json.listings).toHaveLength(1);
    const r = await call('PUT', `/${id}`, { auditProductRef: 'off-a2', title: 'Cathéter 18G' }, 'adminA');
    expect(r.status).toBe(200);
    expect(r.json.listing).toMatchObject({ auditProductRef: 'off-a2', reviewStatus: 'PENDING', promoAllowed: false });
    expect((await call('GET', '/')).json.listings).toHaveLength(0);
  });

  it('retirer le lien (null) : enregistré et renvoyé en revue', async () => {
    const id = await approvedLinked('off-a1');
    const calls = auditCalls();
    const r = await call('PUT', `/${id}`, { auditProductRef: null }, 'adminA');
    expect(r.json.listing).toMatchObject({ auditProductRef: null, reviewStatus: 'PENDING' });
    expect(auditCalls()).toBe(calls); // retirer ne demande pas Audit
  });

  it('même lien renvoyé avec d’autres champs : pas de revue, et ça marche même Audit en panne', async () => {
    const id = await approvedLinked('off-a1');
    auditUp = false;
    const r = await call('PUT', `/${id}`, { auditProductRef: 'off-a1', contactPhone: '0550 00 00 00' }, 'adminA');
    expect(r.status).toBe(200);
    expect(r.json.listing).toMatchObject({ auditProductRef: 'off-a1', reviewStatus: 'APPROVED', contactPhone: '0550 00 00 00' });
  });

  it('nouveau lien refusé : rien n’est modifié (ni contenu, ni publication)', async () => {
    const id = (await call('POST', '/', PRODUCT, 'adminA')).json.listing.id;
    const r = await call('PUT', `/${id}`, { auditProductRef: 'off-z1', title: 'Autre titre', status: 'PUBLISHED' }, 'adminA');
    expect(r.status).toBe(422);
    expect(db.listings.find((l) => l.id === id)).toMatchObject({ title: 'Seringue', status: 'DRAFT', auditProductRef: null });
    auditUp = false;
    expect((await call('PUT', `/${id}`, { auditProductRef: 'off-a1' }, 'adminA')).status).toBe(503);
    expect(db.listings.find((l) => l.id === id)!.auditProductRef).toBeNull();
  });

  it('un autre établissement ne peut pas toucher au lien', async () => {
    const id = (await call('POST', '/', PRODUCT, 'adminA')).json.listing.id;
    expect((await call('PUT', `/${id}`, { auditProductRef: 'off-a1' }, 'adminN')).status).toBe(403);
  });
});

describe('revue VigiCore', () => {
  it('montre le produit lié, signale un lien qui ne correspond plus, et reste utilisable Audit en panne', async () => {
    const linked = (await call('POST', '/', { ...PRODUCT, auditProductRef: 'off-a1' }, 'adminA')).json.listing.id;
    const plain = (await call('POST', '/', { ...PRODUCT, title: 'Sans lien' }, 'adminA')).json.listing.id;
    const stale = (await call('POST', '/', { ...PRODUCT, title: 'Ancien produit', auditProductRef: 'off-a2', confirmProductMismatch: true }, 'adminA')).json.listing.id;
    for (const id of [linked, plain, stale]) await call('POST', `/${id}/publish`, {}, 'adminA');
    db.listings.find((l) => l.id === stale)!.auditProductRef = 'off-retired'; // produit retiré d'Audit depuis
    // Lien confirmé malgré l'écart de nom (off-a2 est libre à présent) : le staff le voit signalé.
    const odd = (await call('POST', '/', { ...PRODUCT, title: 'Gants', auditProductRef: 'off-a2', confirmProductMismatch: true }, 'adminA')).json.listing.id;
    await call('POST', `/${odd}/publish`, {}, 'adminA');

    const r = await call('GET', '/admin/listings', undefined, 'staff');
    const by = (id: string) => r.json.listings.find((l: any) => l.id === id);
    expect(by(linked)).toMatchObject({ auditProductRef: 'off-a1', auditProduct: { ref: 'off-a1', name: 'Seringue 5 ml', reference: 'SER-5' }, auditProductCheck: 'OK', auditProductMismatch: false });
    expect(by(odd)).toMatchObject({ auditProductCheck: 'OK', auditProductMismatch: true }); // signalé au staff
    expect(by(plain)).toMatchObject({ auditProductRef: null, auditProduct: null, auditProductCheck: null });
    expect(by(stale)).toMatchObject({ auditProduct: null, auditProductCheck: 'NOT_FOUND' });

    auditUp = false;
    const down = await call('GET', '/admin/listings', undefined, 'staff');
    expect(down.status).toBe(200);
    expect(down.json.listings.find((l: any) => l.id === linked).auditProductCheck).toBe('UNKNOWN');
  });

  it('sans aucune fiche liée, la revue n’appelle pas Audit', async () => {
    const id = (await call('POST', '/', PRODUCT, 'adminA')).json.listing.id;
    await call('POST', `/${id}/publish`, {}, 'adminA');
    await call('GET', '/admin/listings', undefined, 'staff');
    expect(auditCalls()).toBe(0);
  });
});
