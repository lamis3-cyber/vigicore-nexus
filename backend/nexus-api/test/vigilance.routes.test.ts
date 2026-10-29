/**
 * HTTP-level tests of /api/vigilance (scope from session, server-owned fields, status rules).
 * LIMIT: Prisma is replaced by an in-memory fake — these prove ROUTE LOGIC, not real-DB behaviour.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'net';

const db = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret';
  return { users: [] as any[], decls: [] as any[], ests: [] as any[], seq: 0 };
});

vi.mock('../src/lib/prisma', () => {
  const withEst = (r: any) => ({ ...r, establishment: db.ests.find((e) => e.id === r.establishmentId) });
  const match = (r: any, w: any = {}): boolean =>
    Object.entries(w).every(([k, v]: [string, any]) => {
      if (k === 'OR') return v.some((x: any) => match(r, x));
      if (v && typeof v === 'object' && 'in' in v) return v.in.includes(r[k]);
      if (v && typeof v === 'object' && 'gte' in v) return r[k] >= v.gte;
      return r[k] === v;
    });
  const declaration = {
    findMany: async ({ where }: any) => db.decls.filter((r) => match(r, where)).map(withEst),
    findFirst: async ({ where }: any) => { const r = db.decls.find((x) => match(x, where)); return r ? withEst(r) : null; },
    count: async ({ where }: any) => db.decls.filter((r) => match(r, where)).length,
    create: async ({ data }: any) => {
      const row = { id: `decl_${++db.seq}_abcdef`, createdAt: new Date(), updatedAt: new Date(), ...data };
      db.decls.push(row); return withEst(row);
    },
    update: async ({ where, data }: any) => { const r = db.decls.find((x) => x.id === where.id)!; Object.assign(r, data, { updatedAt: new Date() }); return withEst(r); },
  };
  const user = {
    findUnique: async ({ where }: any) => {
      const u = db.users.find((x) => x.id === where.id);
      return u ? { ...u, affiliations: u.affiliations ?? [] } : null;
    },
  };
  const establishment = { findFirst: async ({ where }: any) => db.ests.find((e) => match(e, where)) ?? null };
  return { prisma: { user, declaration, establishment } };
});

import { createApp } from '../src/app';
import { signSessionToken } from '../src/lib/jwt';

let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base: string;
beforeAll(() => { server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(() => { server.close(); });

const aff = (establishmentId: string, memberRole = 'MEMBER') => ({ establishmentId, status: 'ACTIVE', isActiveContext: true, memberRole });
const mkUser = (id: string, role: string, affiliations: any[] = []) =>
  db.users.push({ id, email: `${id}@x.dz`, displayName: id, role, deactivatedAt: null, affiliations });
async function call(method: string, path: string, as?: string, body?: unknown) {
  const res = await fetch(`${base}/api/vigilance${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(as ? { Cookie: `vg_session=${signSessionToken({ userId: as })}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}
const DR = { kind: 'dr', status: 'sent', refPrefix: 'PV', record: { domain: 'Pharmacovigilance', product: 'X · Lot 1', effect: 'Nausées', severity: 'moderee', dept: 'Cardiologie', kind: 'incident' } };

beforeEach(() => {
  db.users.length = 0; db.decls.length = 0; db.ests.length = 0; db.seq = 0;
  db.ests.push({ id: 'central', isSystemReserved: true }, { id: 'chu', isSystemReserved: false }, { id: 'clin', isSystemReserved: false });
  mkUser('doc1', 'DOCTOR', [aff('chu')]);
  mkUser('doc2', 'DOCTOR', [aff('chu')]);
  mkUser('qual', 'VIGILANCE_REVIEWER', [aff('chu')]);
  mkUser('qualOther', 'VIGILANCE_REVIEWER', [aff('clin')]);
  mkUser('nurse', 'HOSPITAL', [aff('chu')]);
  mkUser('solo', 'DOCTOR');
  mkUser('pat', 'PATIENT');
});

describe('auth & roles', () => {
  it('anonymous -> 401 on every route', async () => {
    for (const [m, p] of [['GET', '/declarations'], ['POST', '/declarations'], ['GET', '/declarations/abcdef'], ['PATCH', '/declarations/abcdef']]) {
      expect((await call(m, p)).status).toBe(401);
    }
  });
  it('a patient can declare, and only ever sees their own declarations', async () => {
    const r = await call('POST', '/declarations', 'pat', DR);
    expect(r.status).toBe(201);
    expect(r.json.declaration.authoredByRole).toBe('patient');
    expect(r.json.declaration.organizationId).toBeNull();
    await call('POST', '/declarations', 'doc1', DR);
    expect((await call('GET', '/declarations', 'pat')).json.declarations).toHaveLength(1);
    expect((await call('GET', '/declarations', 'qual')).json.declarations).toHaveLength(1);
  });
  it('a user with no write role is refused', async () => {
    mkUser('ghostrole', 'ESTABLISHMENT_ADMIN');
    expect((await call('POST', '/declarations', 'ghostrole', DR)).status).toBe(403);
    expect(db.decls).toHaveLength(0);
  });
});

describe('create', () => {
  it('stamps organisation, author and role from the session and ignores client-supplied ones', async () => {
    const r = await call('POST', '/declarations', 'doc1', { ...DR, record: { ...DR.record, organizationId: 'clin', authoredByUserId: 'evil', authoredByRole: 'administrator', id: 'forced', ref: '#X', capaStatus: 'validated' } });
    expect(r.status).toBe(201);
    const d = r.json.declaration;
    expect(d.organizationId).toBe('chu');
    expect(d.authoredByUserId).toBe('doc1');
    expect(d.authoredByRole).toBe('doctor');
    expect(d.id).not.toBe('forced');
    expect(d.kind).toBe('incident'); // le champ métier « kind » n'est pas écrasé par le type de store
    expect(d.ref).toMatch(/^#PV-\d{4}-\d{3}$/);
    expect(d.capaStatus).toBe('none');
    expect(d.vigilanceKind).toBe('dr');
    expect(db.decls[0].establishmentId).toBe('chu');
    expect(db.decls[0].status).toBe('SUBMITTED');
  });
  it('a user without establishment goes to the central queue and is exposed with organizationId null', async () => {
    const r = await call('POST', '/declarations', 'solo', DR);
    expect(r.status).toBe(201);
    expect(r.json.declaration.organizationId).toBeNull();
    expect(db.decls[0].establishmentId).toBe('central');
  });
  it('rejects bad kind, status, severity, domain and oversized records', async () => {
    expect((await call('POST', '/declarations', 'doc1', { ...DR, kind: 'x' })).status).toBe(400);
    expect((await call('POST', '/declarations', 'doc1', { ...DR, status: 'closed' })).status).toBe(400);
    expect((await call('POST', '/declarations', 'doc1', { ...DR, record: { ...DR.record, severity: 'critique' } })).status).toBe(400);
    expect((await call('POST', '/declarations', 'doc1', { ...DR, record: { ...DR.record, domain: 'Autre' } })).status).toBe(400);
    expect((await call('POST', '/declarations', 'doc1', { ...DR, record: { ...DR.record, effect: 'x'.repeat(70_000) } })).status).toBe(413);
    expect(db.decls).toHaveLength(0);
  });
  it('lab records map the product type to a domain', async () => {
    const r = await call('POST', '/declarations', 'doc1', { kind: 'lab', status: 'sent', record: { productType: 'dispositif', product: 'P', severity: 'legere' } });
    expect(r.status).toBe(201);
    expect(db.decls[0].domain).toBe('MATERIOVIGILANCE');
  });
});

describe('visibility', () => {
  beforeEach(async () => {
    await call('POST', '/declarations', 'doc1', DR);
    await call('POST', '/declarations', 'doc2', DR);
  });
  it('a clinician sees only their own declarations, not colleagues’', async () => {
    const r = await call('GET', '/declarations', 'doc1');
    expect(r.json.declarations).toHaveLength(1);
    expect(r.json.declarations[0].authoredByUserId).toBe('doc1');
  });
  it('the quality officer sees their establishment, not another one', async () => {
    expect((await call('GET', '/declarations', 'qual')).json.declarations).toHaveLength(2);
    expect((await call('GET', '/declarations', 'qualOther')).json.declarations).toHaveLength(0);
  });
  it('medical staff (nurses) are NOT reviewers: they see only their own declarations, never the whole hospital', async () => {
    expect((await call('GET', '/declarations', 'nurse')).json.declarations).toHaveLength(0);
    const own = await call('POST', '/declarations', 'nurse', DR);
    expect(own.status).toBe(201);
    expect((await call('GET', '/declarations', 'nurse')).json.declarations).toHaveLength(1);
    const other = db.decls.find((d: any) => d.authorUserId === 'doc1');
    expect((await call('GET', `/declarations/${other.id}`, 'nurse')).status).toBe(404);
    expect((await call('PATCH', `/declarations/${other.id}`, 'nurse', { status: 'closed' })).status).toBe(404);
  });
  it('an out-of-scope id is a 404, never a 403', async () => {
    const id = db.decls[0].id;
    expect((await call('GET', `/declarations/${id}`, 'qualOther')).status).toBe(404);
    expect((await call('GET', `/declarations/${id}`, 'doc2')).status).toBe(404);
    expect((await call('GET', `/declarations/${id}`, 'qual')).status).toBe(200);
    expect((await call('PATCH', `/declarations/${id}`, 'qualOther', { status: 'closed' })).status).toBe(404);
  });
});

describe('updates', () => {
  let id: string;
  beforeEach(async () => { id = (await call('POST', '/declarations', 'doc1', DR)).json.declaration.id; });
  it('the author can close their own declaration but cannot start the analysis or touch CAPA', async () => {
    expect((await call('PATCH', `/declarations/${id}`, 'doc1', { status: 'analysis' })).status).toBe(403);
    expect((await call('PATCH', `/declarations/${id}`, 'doc1', { capaStatus: 'validated' })).status).toBe(403);
    const r = await call('PATCH', `/declarations/${id}`, 'doc1', { status: 'closed' });
    expect(r.status).toBe(200);
    expect(db.decls[0].status).toBe('CLOSED');
  });
  it('the quality officer can analyse and set CAPA; invalid values are refused', async () => {
    expect((await call('PATCH', `/declarations/${id}`, 'qual', { status: 'analysis', capaStatus: 'proposed' })).json.declaration.status).toBe('analysis');
    expect(db.decls[0].status).toBe('UNDER_REVIEW');
    expect((await call('PATCH', `/declarations/${id}`, 'qual', { status: 'nope' })).status).toBe(400);
    expect((await call('PATCH', `/declarations/${id}`, 'qual', { capaStatus: 'nope' })).status).toBe(400);
  });
  it('a closed declaration cannot be reopened', async () => {
    await call('PATCH', `/declarations/${id}`, 'qual', { status: 'closed' });
    expect((await call('PATCH', `/declarations/${id}`, 'qual', { status: 'sent' })).status).toBe(409);
  });
});
