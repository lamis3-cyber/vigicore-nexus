/**
 * Brouillons des assistants (/api/drafts). Prisma est un faux en mémoire : ces tests prouvent la LOGIQUE DES
 * ROUTES (portée par utilisateur, validation, remplacement), pas le comportement d'une vraie base.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'net';

const db = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret';
  return { users: [] as any[], drafts: [] as any[], seq: 0 };
});
vi.mock('../src/lib/prisma', () => {
  const same = (r: any, w: any) => r.userId === w.userId && r.draftKey === w.draftKey;
  const declarationDraft = {
    findUnique: async ({ where }: any) => db.drafts.find((r) => same(r, where.userId_draftKey)) ?? null,
    findMany: async ({ where }: any) => db.drafts.filter((r) => r.userId === where.userId),
    upsert: async ({ where, create, update }: any) => {
      const r = db.drafts.find((x) => same(x, where.userId_draftKey));
      if (r) { Object.assign(r, update, { updatedAt: new Date() }); return r; }
      const row = { id: `d${++db.seq}`, createdAt: new Date(), updatedAt: new Date(), ...create }; db.drafts.push(row); return row;
    },
    deleteMany: async ({ where }: any) => { const n = db.drafts.length; for (let i = db.drafts.length - 1; i >= 0; i--) if (same(db.drafts[i], where)) db.drafts.splice(i, 1); return { count: n - db.drafts.length }; },
  };
  const user = { findUnique: async ({ where }: any) => { const u = db.users.find((x) => x.id === where.id); return u ? { ...u, affiliations: [] } : null; } };
  return { prisma: { user, declarationDraft } };
});
import { createApp } from '../src/app';
import { signSessionToken } from '../src/lib/jwt';

let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base: string;
beforeAll(() => { server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(() => { server.close(); });
async function call(method: string, key: string, as?: string, body?: unknown) {
  const res = await fetch(`${base}/api/drafts/${encodeURIComponent(key)}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(as ? { Cookie: `vg_session=${signSessionToken({ userId: as })}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}
beforeEach(() => {
  db.drafts.length = 0; db.users.length = 0; db.seq = 0;
  for (const id of ['u1', 'u2']) db.users.push({ id, email: `${id}@x.dz`, displayName: id, role: 'DOCTOR', deactivatedAt: null });
});
const KEY = 'vigicore.declaration-draft.u1.Médecine';

describe('drafts', () => {
  it('requires auth', async () => { expect((await call('GET', KEY)).status).toBe(401); });
  it('absent -> null ; PUT crée puis REMPLACE (une seule ligne) ; GET relit', async () => {
    expect((await call('GET', KEY, 'u1')).json.draft).toBeNull();
    expect((await call('PUT', KEY, 'u1', { data: { wiz: { stepIdx: 1, productName: 'A' } } })).status).toBe(200);
    expect((await call('PUT', KEY, 'u1', { data: { wiz: { stepIdx: 2, productName: 'AB' } } })).status).toBe(200);
    expect(db.drafts).toHaveLength(1);
    const g = (await call('GET', KEY, 'u1')).json.draft;
    expect(g.data.wiz).toEqual({ stepIdx: 2, productName: 'AB' });
    expect(g.updatedAt).toBeTruthy();
  });
  it('un utilisateur ne lit, ne remplace ni ne supprime JAMAIS le brouillon d\'un autre (même clé)', async () => {
    await call('PUT', KEY, 'u1', { data: { wiz: { secret: 'patient X' } } });
    expect((await call('GET', KEY, 'u2')).json.draft).toBeNull();
    await call('PUT', KEY, 'u2', { data: { wiz: { other: 1 } } });
    expect(db.drafts).toHaveLength(2);
    await call('DELETE', KEY, 'u2');
    expect(db.drafts.map((d) => d.userId)).toEqual(['u1']);
    expect((await call('GET', KEY, 'u1')).json.draft.data.wiz.secret).toBe('patient X');
  });
  it('DELETE supprime ; validation : clé, contenu objet, taille', async () => {
    await call('PUT', KEY, 'u1', { data: { wiz: {} } });
    expect((await call('DELETE', KEY, 'u1')).status).toBe(200);
    expect(db.drafts).toHaveLength(0);
    expect((await call('PUT', 'bad/..key', 'u1', { data: {} })).status).toBe(400);
    expect((await call('PUT', KEY, 'u1', { data: 'texte' })).status).toBe(400);
    expect((await call('PUT', KEY, 'u1', { data: [1] })).status).toBe(400);
    expect((await call('PUT', KEY, 'u1', { data: { big: 'x'.repeat(210_000) } })).status).toBe(413);
    expect(db.drafts).toHaveLength(0);
  });
  it('GET / liste seulement MES brouillons', async () => {
    await call('PUT', KEY, 'u1', { data: { wiz: { productName: 'A' } } });
    await call('PUT', 'vigicore.declaration-draft.u2.Médecine', 'u2', { data: { wiz: { productName: 'B' } } });
    const res = await fetch(`${base}/api/drafts`, { headers: { Cookie: `vg_session=${signSessionToken({ userId: 'u1' })}` } });
    const j: any = await res.json();
    expect(j.drafts).toHaveLength(1); expect(j.drafts[0].key).toBe(KEY);
  });
});
