import { describe, it, expect, vi } from 'vitest';
import {
  mayOrderForEstablishment, orderBuyerTypes, orderEligibility, parseContact, parseOrderLines, sendMarketRequest, syncMarketStatus, toMarketDto,
} from '../src/services/market';
import { MAX_AUTO_ATTEMPTS } from '../src/services/submissions';
import type { AuditTransport } from '../src/lib/auditClient';

const NOW = new Date('2026-10-24T10:00:00Z');
function fakeDb(initial: Partial<any> = {}) {
  const row: any = {
    id: 'm1', kind: 'ORDER', requesterUserId: 'u1', establishmentId: 'e1', idempotencyKey: 'site-order-1', status: 'PENDING', attempts: 0,
    payload: { body: { sourceOrderId: '1', lines: [{ productRef: 'p1', quantity: 2 }] }, display: { lines: [{ product: 'Amox', quantity: 2, unitPrice: 100 }] } },
    summary: 'Amox × 2', history: null, createdAt: NOW, updatedAt: NOW, ...initial,
  };
  return { row, marketRequest: { findUnique: async () => ({ ...row }), update: async ({ data }: any) => Object.assign(row, data) } } as any;
}
const deps = (db: any, audit: AuditTransport) => ({ db, audit, now: () => NOW });
const est = (over: any = {}) => ({ id: 'e1', name: 'CHU', buyerCategory: 'PUBLIC_INSTITUTION', buyerCategoryStatus: 'VERIFIED', ...over });

describe('qui peut commander', () => {
  it('administrateur + catégorie VÉRIFIÉE et autorisée ; sinon raison précise', () => {
    expect(orderEligibility(est(), true)).toEqual({ ok: true });
    expect(orderEligibility(est(), false)).toEqual({ ok: false, reason: 'NOT_ESTABLISHMENT_ADMIN' });
    expect(orderEligibility(est({ buyerCategoryStatus: 'DECLARED' }), true)).toEqual({ ok: false, reason: 'CATEGORY_NOT_VERIFIED' });
    expect(orderEligibility(est({ buyerCategoryStatus: 'REJECTED' }), true)).toEqual({ ok: false, reason: 'CATEGORY_REJECTED' });
    expect(orderEligibility(est({ buyerCategory: null, buyerCategoryStatus: null }), true)).toEqual({ ok: false, reason: 'CATEGORY_NOT_DECLARED' });
    expect(orderEligibility(est({ buyerCategory: 'PRIVATE_OTHER' }), true)).toEqual({ ok: false, reason: 'CATEGORY_NOT_ALLOWED' });
    // Clinique privée en attente de vérification : jamais « vous pourrez commander dès la validation ».
    expect(orderEligibility(est({ buyerCategory: 'PRIVATE_CLINIC', buyerCategoryStatus: 'DECLARED' }), true)).toEqual({ ok: false, reason: 'CATEGORY_NOT_ALLOWED' });
  });
  it("l'administrateur et le pharmacien peuvent agir, pas un médecin", () => {
    expect(mayOrderForEstablishment('PHARMACIEN', false)).toBe(true);
    expect(mayOrderForEstablishment('DOCTOR', true)).toBe(true);
    expect(mayOrderForEstablishment('DOCTOR', false)).toBe(false);
  });
  it('politique configurable (même variable qu\'Audit)', () => {
    expect(orderBuyerTypes({})).toEqual(['DISTRIBUTOR', 'PUBLIC_INSTITUTION', 'EXPORT']);
    expect(orderBuyerTypes({ MARKET_ORDER_BUYER_TYPES: 'DISTRIBUTOR,PRIVATE_PHARMACY' })).toEqual(['DISTRIBUTOR', 'PRIVATE_PHARMACY']);
    expect(orderEligibility(est({ buyerCategory: 'PRIVATE_PHARMACY' }), true, { MARKET_ORDER_BUYER_TYPES: 'PRIVATE_PHARMACY' } as any)).toEqual({ ok: true });
  });
  it('validation des lignes et du contact', () => {
    expect(parseOrderLines([{ productRef: 'p1', quantity: 3 }])).toEqual([{ productRef: 'p1', quantity: 3 }]);
    expect(parseOrderLines([{ productRef: 'p1', quantity: 0 }])).toBeNull();
    expect(parseOrderLines([{ productRef: 'p1', quantity: 1 }, { productRef: 'p1', quantity: 1 }])).toBeNull();
    expect(parseContact({ name: 'Karim', email: 'k@x.dz' })).toEqual({ name: 'Karim', email: 'k@x.dz' });
    expect(parseContact({ name: 'Karim', email: 'pas-un-email' })).toBeNull();
  });
});

describe('outbox : jamais de succès non confirmé', () => {
  it('201 => SENT avec la référence du fabricant ; seul `body` part chez Audit', async () => {
    const db = fakeDb();
    const audit = vi.fn<AuditTransport>(async () => ({ kind: 'http', status: 201, data: { orderRef: 'ord-9', status: 'PENDING', manufacturer: 'Labo', totalAmount: 200 } }));
    const r = await sendMarketRequest(deps(db, audit), 'm1');
    expect(r).toMatchObject({ status: 'SENT', auditRef: 'ord-9', auditStatus: 'PENDING', manufacturerName: 'Labo', totalAmount: 200 });
    expect(audit.mock.calls[0][0]).toMatchObject({ method: 'POST', path: '/nexus/v1/orders', scope: 'orders:write', idempotencyKey: 'site-order-1', reporterRef: 'u1' });
    expect(audit.mock.calls[0][0].body).toEqual(db.row.payload.body);
  });
  it('refus du fabricant (403 BUYER_NOT_ALLOWED) => REJECTED avec un message clair', async () => {
    const db = fakeDb();
    const r = await sendMarketRequest(deps(db, async () => ({ kind: 'http', status: 403, data: { error: 'BUYER_NOT_ALLOWED', reason: 'CATEGORY_NOT_ALLOWED' } })), 'm1');
    expect(r.status).toBe('REJECTED');
    expect(toMarketDto(r).refusal).toMatch(/n'accepte pas/);
  });
  it('403 FORBIDDEN_SCOPE (configuration) / réseau => PENDING + renvoi, FAILED après les essais automatiques', async () => {
    const db = fakeDb();
    let r = await sendMarketRequest(deps(db, async () => ({ kind: 'http', status: 403, data: { error: 'FORBIDDEN_SCOPE' } })), 'm1');
    expect(r).toMatchObject({ status: 'PENDING', attempts: 1 });
    expect(r.nextAttemptAt.getTime()).toBeGreaterThan(NOW.getTime());
    db.row.attempts = MAX_AUTO_ATTEMPTS - 1;
    r = await sendMarketRequest(deps(db, async () => ({ kind: 'network', error: 'TIMEOUT' })), 'm1');
    expect(r).toMatchObject({ status: 'FAILED', nextAttemptAt: null });
  });
  it('statut relu chez le fabricant : changement ajouté à l\'historique, lots affichés', async () => {
    const db = fakeDb({ status: 'SENT', auditRef: 'ord-9', auditStatus: 'PENDING', statusSyncedAt: new Date(NOW.getTime() - 120_000), history: [{ at: 'x', status: 'PENDING' }] });
    const audit = vi.fn<AuditTransport>(async () => ({ kind: 'http', status: 200, data: { status: 'CONFIRMED', lines: [{ product: 'Amox', quantity: 2, unitPrice: 100, lotNumber: 'L-77' }] } }));
    const r = await syncMarketStatus(deps(db, audit), { ...db.row });
    expect(audit.mock.calls[0][0]).toMatchObject({ method: 'GET', path: '/nexus/v1/orders/ord-9', scope: 'orders:read', reporterRef: 'u1' });
    const dto = toMarketDto(r);
    expect(dto.status).toBe('CONFIRMED');
    expect(dto.history.map((h: any) => h.status)).toEqual(['PENDING', 'CONFIRMED']);
    expect(dto.lines[0].lotNumber).toBe('L-77');
  });
  it('pas plus d\'une relecture par minute', async () => {
    const db = fakeDb({ status: 'SENT', auditRef: 'ord-9', auditStatus: 'PENDING', statusSyncedAt: new Date(NOW.getTime() - 10_000) });
    const audit = vi.fn<AuditTransport>();
    await syncMarketStatus(deps(db, audit), { ...db.row });
    expect(audit).not.toHaveBeenCalled();
  });
});

// ── Fiche produit (2026-10-27) ──
import { isListingPublic, offersForManufacturer, setListingLike, linkManufacturer, ManufacturerAlreadyLinkedError } from '../src/services/market';

describe('fiche produit : visibilité, offres du fabricant lié, J\'aime, lien fabricant', () => {
  it('fiche publique seulement PUBLIÉE ET APPROUVÉE (catalogue gratuit : le paiement n\'est plus requis)', () => {
    expect(isListingPublic({ status: 'PUBLISHED', reviewStatus: 'APPROVED' })).toBe(true);
    expect(isListingPublic({ status: 'PUBLISHED', reviewStatus: 'PENDING' })).toBe(false);
    expect(isListingPublic({ status: 'PUBLISHED', reviewStatus: 'REJECTED' })).toBe(false);
    expect(isListingPublic({ status: 'DRAFT', reviewStatus: 'APPROVED' })).toBe(false);
    expect(isListingPublic(null)).toBe(false);
  });
  it('offres filtrées sur le seul fabricant lié ; aucun lien = aucune offre', () => {
    const offers = [{ ref: 'p1', manufacturer: { ref: 'org-a' } }, { ref: 'p2', manufacturer: { ref: 'org-b' } }, { ref: 'p3', manufacturer: { ref: 'org-a' } }];
    expect(offersForManufacturer(offers, 'org-a').map((o) => o.ref)).toEqual(['p1', 'p3']);
    expect(offersForManufacturer(offers, null)).toEqual([]);
    expect(offersForManufacturer(offers, 'org-z')).toEqual([]);
  });
  it('J\'aime idempotent (deux fois = un seul), retrait idempotent', async () => {
    const rows: any[] = [];
    const db = {
      listingLike: {
        upsert: async ({ where, create }: any) => {
          const k = where.listingId_userId;
          if (!rows.some((r) => r.listingId === k.listingId && r.userId === k.userId)) rows.push(create);
        },
        deleteMany: async ({ where }: any) => { const before = rows.length; for (let i = rows.length - 1; i >= 0; i--) if (rows[i].listingId === where.listingId && rows[i].userId === where.userId) rows.splice(i, 1); return { count: before - rows.length }; },
        count: async ({ where }: any) => rows.filter((r) => r.listingId === where.listingId).length,
      },
    };
    expect(await setListingLike(db, 'l1', 'u1', true)).toEqual({ likes: 1, liked: true });
    expect(await setListingLike(db, 'l1', 'u1', true)).toEqual({ likes: 1, liked: true });
    expect(await setListingLike(db, 'l1', 'u2', true)).toEqual({ likes: 2, liked: true });
    expect(await setListingLike(db, 'l1', 'u1', false)).toEqual({ likes: 1, liked: false });
    expect(await setListingLike(db, 'l1', 'u1', false)).toEqual({ likes: 1, liked: false });
  });
  it('course entre deux clics : la violation d\'unicité est absorbée', async () => {
    const db = { listingLike: { upsert: async () => { throw Object.assign(new Error('u'), { code: 'P2002' }); }, count: async () => 1 } };
    expect(await setListingLike(db, 'l1', 'u1', true)).toEqual({ likes: 1, liked: true });
  });
  it('lien fabricant : 409 si déjà lié à un autre établissement ; délier possible', async () => {
    const ests: any[] = [{ id: 'e1', name: 'Numidia', auditManufacturerRef: 'org-a' }, { id: 'e2', name: 'Autre labo', auditManufacturerRef: null }];
    const db = {
      establishment: {
        findFirst: async ({ where }: any) => ests.find((e) => e.auditManufacturerRef === where.auditManufacturerRef && e.id !== where.NOT.id) ?? null,
        update: async ({ where, data }: any) => Object.assign(ests.find((e) => e.id === where.id), data),
      },
    };
    await expect(linkManufacturer(db, { establishmentId: 'e2', manufacturerRef: 'org-a', by: 'staff@v.dz' })).rejects.toBeInstanceOf(ManufacturerAlreadyLinkedError);
    expect(await linkManufacturer(db, { establishmentId: 'e1', manufacturerRef: 'org-a', by: 'staff@v.dz', now: NOW })).toMatchObject({ auditManufacturerRef: 'org-a', auditManufacturerLinkedBy: 'staff@v.dz' });
    expect(await linkManufacturer(db, { establishmentId: 'e1', manufacturerRef: null, by: 'staff@v.dz' })).toMatchObject({ auditManufacturerRef: null });
    expect(await linkManufacturer(db, { establishmentId: 'e2', manufacturerRef: 'org-a', by: 'staff@v.dz' })).toMatchObject({ auditManufacturerRef: 'org-a' });
  });
});

describe('une seule notion côté acheteur : la demande de commande (2026-10-29)', async () => {
  const { toMarketDto, buyerStatus } = await import('../src/services/market');
  const base = { id: 'm1', summary: 'Aciclovir × 4', createdAt: new Date(), updatedAt: new Date(), history: [], payload: { display: { lines: [{ product: 'Aciclovir', quantity: 4, unitPrice: 120 }] } } };

  it('une demande passée par le canal « intérêt » est présentée comme une commande', () => {
    const dto = toMarketDto({ ...base, kind: 'INTEREST', status: 'SENT', auditStatus: 'NEW', totalAmount: 480 });
    expect(dto).toMatchObject({ kind: 'ORDER', channel: 'INTEREST', status: 'PENDING', totalAmount: 480 });
  });

  it('statuts : ceux de la commande liée passent tels quels ; anciens statuts d\'intérêt traduits', () => {
    expect(buyerStatus('INTEREST', 'CONFIRMED')).toBe('CONFIRMED');
    expect(buyerStatus('INTEREST', 'CONVERTED')).toBe('CONFIRMED');
    expect(buyerStatus('INTEREST', 'CLOSED')).toBe('CANCELLED');
    expect(buyerStatus('INTEREST', 'CONTACTED')).toBe('PENDING');
    expect(buyerStatus('ORDER', 'DELIVERED')).toBe('DELIVERED');
    expect(buyerStatus('INTEREST', null)).toBeNull();
  });
});
