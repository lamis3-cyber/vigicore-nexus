/**
 * HTTP-level tests of /api/account (réglages + profil). Prisma est remplacé par une base en mémoire :
 * ces tests prouvent la LOGIQUE des routes et l'isolation entre comptes, pas le comportement d'une vraie base.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'net';

const db = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret';
  return { users: [] as any[], prefs: [] as any[] };
});

vi.mock('../src/lib/prisma', () => {
  const user = {
    findUnique: async ({ where }: any) => { const u = db.users.find((x) => x.id === where.id); return u ? { ...u, affiliations: [] } : null; },
    update: async ({ where, data }: any) => { const u = db.users.find((x) => x.id === where.id)!; Object.assign(u, data); return u; },
  };
  const userPreference = {
    findUnique: async ({ where }: any) => db.prefs.find((p) => p.userId === where.userId) ?? null,
    upsert: async ({ where, create, update }: any) => {
      const row = db.prefs.find((p) => p.userId === where.userId);
      if (row) { Object.assign(row, update); return row; }
      db.prefs.push({ ...create }); return create;
    },
  };
  return { prisma: { user, userPreference } };
});

import { createApp } from '../src/app';
import { signSessionToken } from '../src/lib/jwt';

let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base: string;
beforeAll(() => { server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(() => { server.close(); });

async function call(method: string, path: string, as?: string, body?: unknown) {
  const res = await fetch(`${base}/api/account${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(as ? { Cookie: `vg_session=${signSessionToken({ userId: as })}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

beforeEach(() => {
  db.users.length = 0; db.prefs.length = 0;
  db.users.push({ id: 'u1', email: 'a@x.dz', displayName: 'Sara', role: 'DOCTOR', deactivatedAt: null }, { id: 'u2', email: 'b@x.dz', displayName: 'Karim', role: 'DOCTOR', deactivatedAt: null });
});

describe('account preferences', () => {
  it('requires a session', async () => {
    expect((await call('GET', '/preferences')).status).toBe(401);
    expect((await call('PATCH', '/profile')).status).toBe(401);
  });
  it('stores, merges, deletes keys and isolates accounts', async () => {
    expect((await call('GET', '/preferences', 'u1')).json.values).toEqual({});
    await call('PUT', '/preferences', 'u1', { values: { lang: 'ar', docParamTel: '0555' } });
    const r = await call('PUT', '/preferences', 'u1', { values: { swAuto11: '1', docParamTel: null } });
    expect(r.json.values).toEqual({ lang: 'ar', swAuto11: '1' });
    expect((await call('GET', '/preferences', 'u2')).json.values).toEqual({});
    expect((await call('DELETE', '/preferences', 'u1')).json.values).toEqual({});
  });
  it('validates keys, values and language', async () => {
    expect((await call('PUT', '/preferences', 'u1', { values: { 'bad key!': 'x' } })).status).toBe(400);
    expect((await call('PUT', '/preferences', 'u1', { values: { a: 'x'.repeat(501) } })).status).toBe(400);
    expect((await call('PUT', '/preferences', 'u1', { values: { a: 5 } })).status).toBe(400);
    expect((await call('PUT', '/preferences', 'u1', { values: { lang: 'tz' } })).status).toBe(400);
    expect((await call('PUT', '/preferences', 'u1', { values: { lang: 'en' } })).status).toBe(200);
    expect((await call('PUT', '/preferences', 'u1', [])).status).toBe(400);
  });
  it('updates only the caller’s display name', async () => {
    expect((await call('PATCH', '/profile', 'u1', { displayName: 'x' })).status).toBe(400);
    const r = await call('PATCH', '/profile', 'u1', { displayName: '  Dr.   Sara  Haddad ', id: 'u2' });
    expect(r.json.displayName).toBe('Dr. Sara Haddad');
    expect(db.users.find((u) => u.id === 'u2')!.displayName).toBe('Karim');
  });
});
