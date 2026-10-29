/**
 * HTTP-level tests of POST /api/market/admin/buyers/:id/review and GET /api/market/admin/buyers
 * (agrément du distributeur, étape 1). Prisma is an in-memory fake: these prove ROUTE LOGIC (droits, validation,
 * transaction + AuditEntry, non-régression), not real-database behaviour.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'net';

const db = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.PLATFORM_ADMIN_EMAILS = 'staff@vigicore.dz';
  return { users: [] as any[], ests: [] as any[], aud: [] as any[], seq: 0, auditFails: false };
});

vi.mock('../src/lib/prisma', () => {
  const match = (r: any, w: any = {}): boolean =>
    Object.entries(w).every(([k, v]: [string, any]) => {
      if (v && typeof v === 'object' && 'in' in v) return v.in.includes(r[k]);
      if (v && typeof v === 'object' && 'not' in v) return r[k] !== v.not;
      return r[k] === v;
    });
  const establishment = {
    findFirst: async ({ where }: any) => db.ests.find((e) => match(e, where)) ?? null,
    findMany: async ({ where }: any = {}) => db.ests.filter((e) => match(e, where)),
    update: async ({ where, data, select }: any) => {
      const r = db.ests.find((e) => e.id === where.id);
      Object.assign(r, data);
      if (!select) return { ...r };
      return Object.fromEntries(Object.keys(select).map((k) => [k, r[k] ?? null]));
    },
  };
  const user = {
    findUnique: async ({ where }: any) => { const u = db.users.find((x) => x.id === where.id); return u ? { ...u, affiliations: [] } : null; },
    findMany: async ({ where }: any) => db.users.filter((u) => match(u, where)),
  };
  const auditEntry = {
    create: async ({ data }: any) => {
      if (db.auditFails) throw new Error('audit down');
      const row = { id: `aud_${++db.seq}`, createdAt: new Date(), ...data };
      db.aud.push(row);
      return row;
    },
  };
  const prisma: any = {
    user, establishment, auditEntry,
    // Transaction interactive : instantané des tables, restauré si la fonction échoue (comme un ROLLBACK).
    $transaction: async (fn: any) => {
      const snap = { ests: db.ests.map((e) => ({ ...e })), aud: [...db.aud] };
      try { return await fn(prisma); } catch (err) { db.ests.splice(0, db.ests.length, ...snap.ests); db.aud.splice(0, db.aud.length, ...snap.aud); throw err; }
    },
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
const review = (id: string, body: unknown, as: string | null = 'staff') => call('POST', `/admin/buyers/${id}/review`, as ?? undefined, body);
const est = (id: string) => db.ests.find((e) => e.id === id);

beforeEach(() => {
  db.users.length = 0; db.ests.length = 0; db.aud.length = 0; db.seq = 0; db.auditFails = false;
  const u = (id: string, email: string, role: string) => db.users.push({ id, email, displayName: `Name ${id}`, role, deactivatedAt: null, passwordChangedAt: null });
  u('staff', 'staff@vigicore.dz', 'VIGILANCE_REVIEWER'); u('doc', 'doc@x.dz', 'DOCTOR');
  const e = (id: string, over: any) => db.ests.push({ id, name: `Etab ${id}`, type: 'SUPPLIER', isSystemReserved: false, buyerCategory: 'DISTRIBUTOR', buyerCategoryStatus: 'DECLARED', buyerCategoryNote: null,
    buyerCategoryDeclaredAt: new Date('2026-10-20T08:00:00Z'), buyerCategoryDeclaredBy: 'doc', buyerCategoryReviewedAt: null, buyerCategoryReviewedBy: null, approvalNumber: null, approvalDate: null, ...over });
  e('dist', {}); e('chu', { type: 'HOSPITAL', buyerCategory: 'PUBLIC_INSTITUTION' });
});

describe('review : droits', () => {
  it('sans session => 401 ; non-staff => 403 ; rien n\'est écrit', async () => {
    expect((await review('dist', { decision: 'VERIFIED' }, null)).status).toBe(401);
    const r = await review('dist', { decision: 'VERIFIED', approvalNumber: 'AG-1', approvalDate: '2020-01-01' }, 'doc');
    expect(r.status).toBe(403);
    expect(est('dist')).toMatchObject({ buyerCategoryStatus: 'DECLARED', approvalNumber: null, approvalDate: null });
    expect(db.aud).toHaveLength(0);
  });
  it('GET /admin/buyers : non-staff => 403', async () => {
    expect((await call('GET', '/admin/buyers', 'doc')).status).toBe(403);
  });
});

describe('review : nominal avec agrément', () => {
  it('VERIFIED + numéro + date : enregistrés, renvoyés, et UN AuditEntry sans donnée sensible', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const r = await review('dist', { decision: 'VERIFIED', note: 'pièces vues le 26/10', approvalNumber: ' AG-123/2019 ', approvalDate: '2019-05-14' });
    expect(r.status).toBe(200);
    expect(r.json.buyer).toMatchObject({ id: 'dist', buyerCategory: 'DISTRIBUTOR', buyerCategoryStatus: 'VERIFIED', approvalNumber: 'AG-123/2019', approvalIncomplete: false });
    expect(r.json.buyer.approvalDate).toBe('2019-05-14T00:00:00.000Z');
    expect(est('dist')).toMatchObject({ buyerCategoryStatus: 'VERIFIED', approvalNumber: 'AG-123/2019', buyerCategoryReviewedBy: 'staff@vigicore.dz' });
    expect(db.aud).toHaveLength(1);
    expect(db.aud[0]).toMatchObject({ actorUserId: 'staff', actorName: 'Name staff', refType: 'establishment', refId: 'dist', establishmentId: null });
    expect(db.aud[0].action).toBe("Catégorie d'acheteur DISTRIBUTOR : DECLARED → VERIFIED ; agrément : n° « AG-123/2019 », date 2019-05-14");
    // ni le motif libre ni l'e-mail du staff dans le journal ; pas de valeur d'agrément dans la console.
    expect(db.aud[0].action).not.toContain('pièces vues');
    expect(db.aud[0].action).not.toContain('@');
    const logged = info.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toContain('market.buyerReview');
    expect(logged).not.toContain('AG-123');
    expect(logged).not.toContain('@');
    info.mockRestore();
  });
  it('re-review d\'un distributeur déjà vérifié pour compléter l\'agrément + effacement avec null', async () => {
    expect((await review('dist', { decision: 'VERIFIED' })).status).toBe(200);
    expect((await call('GET', '/admin/buyers?status=VERIFIED', 'staff')).json.buyers[0].approvalIncomplete).toBe(true);
    const r = await review('dist', { decision: 'VERIFIED', approvalNumber: 'AG-9', approvalDate: '2021-03-01' });
    expect(r.json.buyer.approvalIncomplete).toBe(false);
    const c = await review('dist', { decision: 'VERIFIED', approvalNumber: null });
    expect(c.status).toBe(200);
    expect(est('dist')).toMatchObject({ approvalNumber: null });
    expect(est('dist').approvalDate).toBeInstanceOf(Date); // la date, non mentionnée, n'est pas touchée
    expect(c.json.buyer.approvalIncomplete).toBe(true);
    expect(db.aud.map((a) => a.action)).toEqual([
      "Catégorie d'acheteur DISTRIBUTOR : DECLARED → VERIFIED",
      "Catégorie d'acheteur DISTRIBUTOR : VERIFIED → VERIFIED ; agrément : n° « AG-9 », date 2021-03-01",
      "Catégorie d'acheteur DISTRIBUTOR : VERIFIED → VERIFIED ; agrément : n° effacé",
    ]);
  });
});

describe('review : champs invalides refusés (400, rien n\'est écrit)', () => {
  it.each([
    ['numéro trop long', 'dist', { decision: 'VERIFIED', approvalNumber: 'A'.repeat(61) }],
    ['numéro avec balise', 'dist', { decision: 'VERIFIED', approvalNumber: '<b>1</b>' }],
    ['numéro non texte', 'dist', { decision: 'VERIFIED', approvalNumber: 42 }],
    ['date au mauvais format', 'dist', { decision: 'VERIFIED', approvalDate: '14/05/2019' }],
    ['date impossible', 'dist', { decision: 'VERIFIED', approvalDate: '2026-02-31' }],
    ['date dans le futur', 'dist', { decision: 'VERIFIED', approvalDate: '2999-01-01' }],
    ['agrément avec un refus', 'dist', { decision: 'REJECTED', note: 'pièces illisibles', approvalNumber: 'AG-1' }],
  ])('%s', async (_n, id, body) => {
    const before = JSON.stringify(est(id));
    const r = await review(id, body);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(est(id))).toBe(before);
    expect(db.aud).toHaveLength(0);
  });
});

describe('review : non-régression sans agrément', () => {
  it('VERIFIED sans champs d\'agrément : même comportement qu\'avant (+ trace d\'audit), agrément existant conservé', async () => {
    est('dist').approvalNumber = 'AG-OLD';
    const r = await review('dist', { decision: 'VERIFIED' });
    expect(r.status).toBe(200);
    expect(r.json.buyer).toMatchObject({ id: 'dist', buyerCategory: 'DISTRIBUTOR', buyerCategoryStatus: 'VERIFIED', buyerCategoryNote: null, approvalNumber: 'AG-OLD' });
    expect(est('dist').approvalNumber).toBe('AG-OLD');
    expect(db.aud).toHaveLength(1);
    expect(db.aud[0].action).toBe("Catégorie d'acheteur DISTRIBUTOR : DECLARED → VERIFIED");
  });
  it('hôpital : catégorie fixée par le type d\'établissement, le staff ne la vérifie plus (404, rien n\'est écrit)', async () => {
    const before = JSON.stringify(est('chu'));
    expect((await review('chu', { decision: 'VERIFIED' })).status).toBe(404);
    expect((await review('chu', { decision: 'VERIFIED', approvalNumber: 'AG-1' })).status).toBe(404);
    expect((await review('chu', { decision: 'REJECTED', note: 'justificatif manquant' })).status).toBe(404);
    expect(JSON.stringify(est('chu'))).toBe(before);
    expect(db.aud).toHaveLength(0);
  });
  it('anciennes validations intactes : décision invalide, refus sans motif, établissement introuvable', async () => {
    expect((await review('dist', { decision: 'MAYBE' })).status).toBe(400);
    expect((await review('dist', { decision: 'REJECTED' })).status).toBe(400);
    expect((await review('nope', { decision: 'VERIFIED' })).status).toBe(404);
    expect(db.aud).toHaveLength(0);
  });
});

describe('review : écriture du staff = trace obligatoire', () => {
  it('si le journal échoue, la mise à jour est annulée (500, établissement inchangé)', async () => {
    db.auditFails = true;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await review('dist', { decision: 'VERIFIED', approvalNumber: 'AG-1' });
    expect(r.status).toBe(500);
    expect(est('dist')).toMatchObject({ buyerCategoryStatus: 'DECLARED', approvalNumber: null });
    expect(db.aud).toHaveLength(0);
    err.mockRestore();
  });
});

describe('GET /admin/buyers', () => {
  it('renvoie approvalNumber / approvalDate et l\'avertissement approvalIncomplete ; champs existants conservés', async () => {
    await review('dist', { decision: 'VERIFIED' });
    const r = await call('GET', '/admin/buyers', 'staff');
    expect(r.status).toBe(200);
    const d = r.json.buyers.find((b: any) => b.id === 'dist');
    expect(d).toMatchObject({ buyerCategory: 'DISTRIBUTOR', buyerCategoryStatus: 'VERIFIED', approvalNumber: null, approvalDate: null, approvalIncomplete: true, declaredBy: { id: 'doc' } });
    expect(r.json.categories).toContain('DISTRIBUTOR');
    expect(r.json.buyers.find((b: any) => b.id === 'chu')).toBeUndefined(); // seuls les fournisseurs sont à vérifier
  });
});
