/**
 * HTTP-level tests of /api/declarations (auth, validation, idempotency, retry, ownership,
 * error mapping). LIMIT: Prisma is replaced by an in-memory fake and the Audit transport by a
 * mock — these prove ROUTE LOGIC, not real-database behaviour (unique constraints are emulated).
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { AddressInfo } from 'net';

const db = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret';
  return { users: [] as any[], subs: [] as any[], seq: 0, auditCalls: [] as any[], recs: [] as any[], dels: [] as any[] };
});

vi.mock('../src/lib/auditClient', () => ({
  auditConfigured: () => true,
  callAudit: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => {
  const nid = (p: string) => `${p}${++db.seq}`;
  const matchSub = (r: any, w: any = {}) =>
    Object.entries(w).every(([k, v]: [string, any]) => {
      if (k === 'authorUserId_clientRequestId') return r.authorUserId === v.authorUserId && r.clientRequestId === v.clientRequestId;
      if (v && typeof v === 'object' && !(v instanceof Date)) return true; // nextAttemptAt etc. not used here
      return r[k] === v;
    });
  const externalSubmission = {
    findUnique: async ({ where }: any) => db.subs.find((r) => matchSub(r, where)) ?? null,
    findFirst: async ({ where }: any) => db.subs.find((r) => matchSub(r, where)) ?? null,
    findMany: async ({ where }: any = {}) => db.subs.filter((r) => matchSub(r, where)),
    create: async ({ data }: any) => {
      if (data.clientRequestId && db.subs.some((r) => r.authorUserId === data.authorUserId && r.clientRequestId === data.clientRequestId)) {
        throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      }
      const row = { id: nid('s'), status: 'PENDING', attempts: 0, auditDeclarationId: null, routingBasis: null,
        receivedAt: null, failureReason: null, lastError: null, nextAttemptAt: null, createdAt: new Date(), ...data };
      db.subs.push(row);
      return row;
    },
    update: async ({ where, data }: any) => Object.assign(db.subs.find((r) => r.id === where.id), data),
  };
  const user = {
    findUnique: async ({ where }: any) => {
      const u = db.users.find((x) => x.id === where.id);
      return u ? { ...u, affiliations: [] } : null;
    },
  };
  const declaration = { findFirst: async ({ where }: any) => db.recs.find((r) => r.id === where.id && r.authorUserId === where.authorUserId) ?? null };
  const declarationDelivery = { create: async ({ data }: any) => { db.dels.push(data); return data; } };
  return { prisma: { user, externalSubmission, declaration, declarationDelivery } };
});

import { createApp } from '../src/app';
import { signSessionToken } from '../src/lib/jwt';
import { callAudit } from '../src/lib/auditClient';

const audit = callAudit as unknown as ReturnType<typeof vi.fn>;
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base: string;
beforeAll(() => { server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(() => { server.close(); });

const mkUser = (id: string, extra: object = {}) =>
  db.users.push({ id, email: `${id}@private.dz`, displayName: `Name ${id}`, role: 'DOCTOR', deactivatedAt: null, ...extra });
const cookie = (id: string) => `vg_session=${signSessionToken({ userId: id })}`;
async function call(method: string, path: string, opts: { body?: unknown; as?: string; cookie?: string; headers?: Record<string, string> } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(opts.as ? { Cookie: cookie(opts.as) } : {}), ...(opts.cookie ? { Cookie: opts.cookie } : {}), ...opts.headers },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}
const VALID = { productRef: 'PRD-1', description: 'Fuite constatée sur la poche', lotNumber: 'LOT-9', declaredSeverity: 'grave' };
const ok = (extra: object = {}) => ({ kind: 'http' as const, status: 201, data: { auditDeclarationId: 'AUD-1', routingBasis: 'X', receivedAt: '2026-10-01T10:00:00Z', ...extra } });

beforeEach(() => { db.users.length = 0; db.subs.length = 0; db.recs.length = 0; db.dels.length = 0; audit.mockReset(); mkUser('alice'); mkUser('bob'); });

describe('lien avec l\'enregistrement Nexus (transmission au fabricant visible par l\'établissement)', () => {
  it('nexusRecordId de l\'auteur : ligne MANUFACTURER liée à l\'envoi ; l\'identifiant ne part jamais vers Audit', async () => {
    audit.mockResolvedValue(ok());
    db.recs.push({ id: 'rec-alice-1', authorUserId: 'alice', payload: [] });
    const r = await call('POST', '/api/declarations', { body: { ...VALID, nexusRecordId: 'rec-alice-1' }, as: 'alice' });
    expect(r.status).toBe(201);
    expect(db.dels).toEqual([{ id: db.subs[0].id, declarationId: 'rec-alice-1', destination: 'MANUFACTURER', status: 'PENDING' }]);
    expect(JSON.stringify(audit.mock.calls[0][0])).not.toContain('rec-alice-1');
  });
  it('enregistrement d\'un autre auteur ou fiche non native : aucun lien', async () => {
    audit.mockResolvedValue(ok());
    db.recs.push({ id: 'rec-bob-1', authorUserId: 'bob', payload: [] }, { id: 'rec-alice-old', authorUserId: 'alice', payload: { kind: 'dr' } });
    await call('POST', '/api/declarations', { body: { ...VALID, nexusRecordId: 'rec-bob-1', clientRequestId: 'req-000001' }, as: 'alice' });
    await call('POST', '/api/declarations', { body: { ...VALID, nexusRecordId: 'rec-alice-old', clientRequestId: 'req-000002' }, as: 'alice' });
    expect(db.dels).toHaveLength(0);
  });
});

describe('authentication', () => {
  it('no cookie -> 401, nothing stored, Audit never called', async () => {
    const r = await call('POST', '/api/declarations', { body: VALID });
    expect(r.status).toBe(401);
    expect(db.subs).toHaveLength(0); expect(audit).not.toHaveBeenCalled();
  });
  it.each([
    ['garbage token', 'vg_session=not-a-jwt'],
    ['token signed with another secret', `vg_session=${jwt.sign({ userId: 'alice' }, 'attacker-secret')}`],
    ['expired token', `vg_session=${jwt.sign({ userId: 'alice' }, 'test-secret', { expiresIn: -60 })}`],
    ['alg=none token', `vg_session=${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{"userId":"alice"}').toString('base64url')}.`],
  ])('%s -> 401', async (_n, c) => {
    const r = await call('POST', '/api/declarations', { body: VALID, cookie: c });
    expect(r.status).toBe(401); expect(db.subs).toHaveLength(0); expect(audit).not.toHaveBeenCalled();
  });
  it('valid token of an unknown or deactivated user -> 401', async () => {
    mkUser('carol', { deactivatedAt: new Date() });
    expect((await call('POST', '/api/declarations', { body: VALID, as: 'carol' })).status).toBe(401);
    expect((await call('POST', '/api/declarations', { body: VALID, as: 'ghost' })).status).toBe(401);
    expect(audit).not.toHaveBeenCalled();
  });
  it('every declaration/catalogue route rejects anonymous callers', async () => {
    for (const [m, p] of [['GET', '/api/declarations'], ['GET', '/api/declarations/x'], ['POST', '/api/declarations/x/retry'],
      ['GET', '/api/declarations/x/messages'], ['POST', '/api/declarations/x/messages'], ['GET', '/api/catalogue/products?q=ab']]) {
      expect((await call(m, p, { body: m === 'POST' ? {} : undefined })).status, `${m} ${p}`).toBe(401);
    }
  });
});

describe('validation', () => {
  it.each([
    ['missing productRef', { description: 'x' }],
    ['missing description', { productRef: 'P' }],
    ['blank description', { productRef: 'P', description: '   ' }],
    ['description > 10 000 chars', { productRef: 'P', description: 'a'.repeat(10_001) }],
    ['bad severity', { ...VALID, declaredSeverity: 'catastrophique' }],
    ['non-string productRef', { productRef: { $ne: null }, description: 'x' }],
    ['empty clientRequestId', { ...VALID, clientRequestId: '   ' }],
  ])('%s -> 400 and nothing stored or sent', async (_n, body) => {
    const r = await call('POST', '/api/declarations', { body, as: 'alice' });
    expect(r.status).toBe(400); expect(r.json.code).toBe('VALIDATION_ERROR');
    expect(db.subs).toHaveLength(0); expect(audit).not.toHaveBeenCalled();
  });
  it('client-supplied internal fields are ignored (mass assignment)', async () => {
    audit.mockResolvedValue({ kind: 'network', error: 'NETWORK_ERROR' });
    const r = await call('POST', '/api/declarations', { as: 'alice',
      body: { ...VALID, status: 'RECEIVED', authorUserId: 'bob', auditDeclarationId: 'FORGED', organizationId: 'org-X', attempts: 99 } });
    expect(r.status).toBe(202);
    const row = db.subs[0];
    expect(row).toMatchObject({ authorUserId: 'alice', status: 'PENDING', auditDeclarationId: null, attempts: 1 });
    expect(Object.keys(row.payload).sort()).toEqual(['declaredSeverity', 'description', 'lotNumber', 'productRef']);
    expect(JSON.stringify(audit.mock.calls[0][0])).not.toContain('org-X');
  });
});

describe('Audit outcome mapping (never announce a success Audit did not confirm)', () => {
  it('201 -> RECEIVED; only role + displayName leave the Site (no e-mail)', async () => {
    audit.mockResolvedValue(ok());
    const r = await call('POST', '/api/declarations', { body: VALID, as: 'alice' });
    expect(r.status).toBe(201); expect(r.json.submission).toMatchObject({ status: 'RECEIVED', auditDeclarationId: 'AUD-1' });
    const sent = audit.mock.calls[0][0];
    expect(sent.body.reporter).toEqual({ role: 'DOCTOR', displayName: 'Name alice' });
    expect(JSON.stringify(sent)).not.toContain('@private.dz');
    expect(sent.reporterRef).toBe('alice'); expect(sent.scope).toBe('intake:write');
  });
  it.each([
    ['network error', { kind: 'network', error: 'TIMEOUT' }],
    ['HTTP 401 (config)', { kind: 'http', status: 401, data: {} }],
    ['HTTP 403', { kind: 'http', status: 403, data: {} }],
    ['HTTP 503', { kind: 'http', status: 503, data: {} }],
    ['HTTP 500', { kind: 'http', status: 500, data: {} }],
    ['201 WITHOUT auditDeclarationId', { kind: 'http', status: 201, data: {} }],
  ])('%s -> 202 PENDING, kept for retry, NOT reported as received', async (_n, result) => {
    audit.mockResolvedValue(result);
    const r = await call('POST', '/api/declarations', { body: VALID, as: 'alice' });
    expect(r.status).toBe(202); expect(r.json.submission.status).toBe('PENDING');
    expect(db.subs[0].nextAttemptAt).toBeInstanceOf(Date);
  });
  it('422 NOT_ROUTABLE -> 422 and draft kept', async () => {
    audit.mockResolvedValue({ kind: 'http', status: 422, data: { error: 'NOT_ROUTABLE', reason: 'NO_ORG' } });
    const r = await call('POST', '/api/declarations', { body: VALID, as: 'alice' });
    expect(r.status).toBe(422); expect(r.json.code).toBe('NOT_ROUTABLE'); expect(db.subs[0].status).toBe('NOT_ROUTABLE');
  });
  it('400 from Audit -> REJECTED (final) and retry is refused with 409', async () => {
    audit.mockResolvedValue({ kind: 'http', status: 400, data: { error: 'BAD_PRODUCT' } });
    const r = await call('POST', '/api/declarations', { body: VALID, as: 'alice' });
    expect(r.status).toBe(400);
    expect(r.json.message).toContain('BAD_PRODUCT'); // la raison est donnée à l'utilisateur
    const retry = await call('POST', `/api/declarations/${db.subs[0].id}/retry`, { as: 'alice' });
    expect(retry.status).toBe(409); expect(audit).toHaveBeenCalledTimes(1);
  });
  it('unexpected DB failure -> 500 JSON (no hang, no internals)', async () => {
    const spy = vi.spyOn((await import('../src/lib/prisma')).prisma.externalSubmission as any, 'create').mockRejectedValueOnce(new Error('SECRET-DB-DETAIL'));
    const r = await call('POST', '/api/declarations', { body: VALID, as: 'alice' });
    spy.mockRestore();
    expect(r.status).toBe(500); expect(JSON.stringify(r.json)).not.toContain('SECRET-DB-DETAIL');
  });
});

describe('idempotency and retries', () => {
  it('same clientRequestId twice -> ONE row, ONE Audit call, same id', async () => {
    audit.mockResolvedValue(ok());
    const a = await call('POST', '/api/declarations', { body: { ...VALID, clientRequestId: 'req-0001' }, as: 'alice' });
    const b = await call('POST', '/api/declarations', { body: { ...VALID, clientRequestId: 'req-0001' }, as: 'alice' });
    expect(a.json.submission.id).toBe(b.json.submission.id);
    expect(db.subs).toHaveLength(1); expect(audit).toHaveBeenCalledTimes(1);
  });
  it('two SIMULTANEOUS identical requests -> one row, one Audit call', async () => {
    audit.mockImplementation(async () => { await new Promise((r) => setTimeout(r, 30)); return ok(); });
    const body = { ...VALID, clientRequestId: 'race-0001' };
    const [a, b] = await Promise.all([call('POST', '/api/declarations', { body, as: 'alice' }), call('POST', '/api/declarations', { body, as: 'alice' })]);
    expect([a.status, b.status].every((s) => s === 201 || s === 202)).toBe(true);
    expect(db.subs).toHaveLength(1); expect(audit).toHaveBeenCalledTimes(1);
  });
  it('lost race (pre-check misses, unique constraint fires) -> returns the winner, no 500, no second Audit call', async () => {
    const { prisma } = await import('../src/lib/prisma');
    db.subs.push({ id: 'winner1', authorUserId: 'alice', clientRequestId: 'race-det-1', payload: { productRef: 'PRD-1', description: 'x' },
      status: 'RECEIVED', attempts: 1, auditDeclarationId: 'AUD-W', routingBasis: null, receivedAt: new Date(), failureReason: null, lastError: null, nextAttemptAt: null, createdAt: new Date() });
    const spy = vi.spyOn(prisma.externalSubmission as any, 'findUnique').mockResolvedValueOnce(null); // pre-check misses
    const r = await call('POST', '/api/declarations', { body: { ...VALID, clientRequestId: 'race-det-1' }, as: 'alice' });
    spy.mockRestore();
    expect(r.status).toBe(201); expect(r.json.submission.id).toBe('winner1');
    expect(db.subs).toHaveLength(1); expect(audit).not.toHaveBeenCalled();
  });
  it('the same clientRequestId from two different users never collides', async () => {
    audit.mockResolvedValue(ok());
    await call('POST', '/api/declarations', { body: { ...VALID, clientRequestId: 'same-key-1' }, as: 'alice' });
    await call('POST', '/api/declarations', { body: { ...VALID, clientRequestId: 'same-key-1' }, as: 'bob' });
    expect(db.subs.map((s) => s.authorUserId).sort()).toEqual(['alice', 'bob']);
  });
  it('retry re-uses the SAME Audit idempotency key (= submission id) and then succeeds', async () => {
    audit.mockResolvedValueOnce({ kind: 'network', error: 'TIMEOUT' }).mockResolvedValueOnce(ok());
    const first = await call('POST', '/api/declarations', { body: VALID, as: 'alice' });
    expect(first.status).toBe(202);
    const id = first.json.submission.id;
    const retry = await call('POST', `/api/declarations/${id}/retry`, { as: 'alice' });
    expect(retry.status).toBe(201); expect(retry.json.submission.status).toBe('RECEIVED');
    expect(audit.mock.calls[0][0].idempotencyKey).toBe(id); expect(audit.mock.calls[1][0].idempotencyKey).toBe(id);
    expect(db.subs[0].attempts).toBe(2);
    const again = await call('POST', `/api/declarations/${id}/retry`, { as: 'alice' });
    expect(again.status).toBe(409); expect(audit).toHaveBeenCalledTimes(2);
  });
});

describe('ownership (a user only ever sees their own declarations)', () => {
  beforeEach(async () => { audit.mockResolvedValue(ok()); await call('POST', '/api/declarations', { body: VALID, as: 'alice' }); audit.mockClear(); });
  it("bob cannot read, retry or relay messages on alice's declaration -> 404, Audit untouched", async () => {
    const id = db.subs[0].id;
    for (const [m, p, b] of [['GET', `/api/declarations/${id}`], ['POST', `/api/declarations/${id}/retry`],
      ['GET', `/api/declarations/${id}/messages`], ['POST', `/api/declarations/${id}/messages`, { content: 'hello' }]] as any[]) {
      const r = await call(m, p, { body: b, as: 'bob', headers: { 'Idempotency-Key': 'key-12345678' } });
      expect(r.status, `${m} ${p}`).toBe(404);
    }
    expect(audit).not.toHaveBeenCalled();
  });
  it("bob's list is empty and alice's has exactly her row", async () => {
    expect((await call('GET', '/api/declarations', { as: 'bob' })).json.submissions).toHaveLength(0);
    expect((await call('GET', '/api/declarations', { as: 'alice' })).json.submissions).toHaveLength(1);
  });
  it('the browser DTO exposes no internal fields', async () => {
    const dto = (await call('GET', '/api/declarations', { as: 'alice' })).json.submissions[0];
    expect(Object.keys(dto).sort()).toEqual(['auditDeclarationId', 'autoRetryExhausted', 'createdAt', 'declaredSeverity', 'description', 'device', 'failureReason', 'id', 'kind', 'lotNumber', 'malfunction', 'productLabel', 'productRef', 'receivedAt', 'retrying', 'status']);
  });
});

describe('message relay', () => {
  let id: string;
  beforeEach(async () => { audit.mockResolvedValue(ok()); id = (await call('POST', '/api/declarations', { body: VALID, as: 'alice' })).json.submission.id; audit.mockReset(); });
  const post = (content: unknown, key: string | null = 'idem-12345678') =>
    call('POST', `/api/declarations/${id}/messages`, { body: { content }, as: 'alice', headers: key ? { 'Idempotency-Key': key } : {} });
  it('requires a well-formed Idempotency-Key and 1..4000 chars', async () => {
    expect((await post('hi', null)).status).toBe(400); // header absent
    expect((await post('hi', 'short')).status).toBe(400);
    expect((await post('hi', 'bad key with spaces')).status).toBe(400);
    expect((await post('')).status).toBe(400);
    expect((await post('x'.repeat(4001))).status).toBe(400);
    expect((await post({ $gt: '' })).status).toBe(400);
    expect(audit).not.toHaveBeenCalled();
  });
  it('relays with scope intake:write, forwarding the key; Audit outage -> 502 without internals', async () => {
    audit.mockResolvedValueOnce({ kind: 'http', status: 201, data: { id: 'm1' } });
    expect((await post('bonjour')).status).toBe(201);
    expect(audit.mock.calls[0][0]).toMatchObject({ scope: 'intake:write', idempotencyKey: 'idem-12345678', reporterRef: 'alice' });
    audit.mockResolvedValueOnce({ kind: 'network', error: 'ECONNREFUSED 10.0.0.5:5100' });
    const r = await post('encore');
    expect(r.status).toBe(502); expect(JSON.stringify(r.json)).not.toContain('10.0.0.5');
  });
  it('a declaration not yet received by Audit cannot receive messages (409)', async () => {
    db.subs[0].status = 'PENDING';
    expect((await post('hi')).status).toBe(409); expect(audit).not.toHaveBeenCalled();
  });
});
