/**
 * Device-malfunction (panne) flow + outbox/idempotency hardening, at HTTP level.
 * LIMIT: Prisma is an in-memory fake and the Audit transport a mock — these prove ROUTE LOGIC,
 * not real-database behaviour (unique constraints are emulated).
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { AddressInfo } from 'net';

const db = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret';
  return { users: [] as any[], subs: [] as any[], seq: 0, auditCalls: [] as any[] };
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
  return { prisma: { user, externalSubmission } };
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
// Browser-facing submission fields (additive since the device-malfunction extension). No internal field.
const _UNUSED_DTO_KEYS = ['auditDeclarationId', 'autoRetryExhausted', 'createdAt', 'declaredSeverity', 'description', 'device', 'failureReason', 'id', 'kind', 'lotNumber', 'malfunction', 'productLabel', 'productRef', 'receivedAt', 'retrying', 'status'];
const ok = (extra: object = {}) => ({ kind: 'http' as const, status: 201, data: { auditDeclarationId: 'AUD-1', routingBasis: 'X', receivedAt: '2026-10-01T10:00:00Z', ...extra } });

beforeEach(() => { db.users.length = 0; db.subs.length = 0; audit.mockReset(); mkUser('alice'); mkUser('bob'); });


const PANNE = {
  kind: 'DEVICE_MALFUNCTION', productRef: 'PRD-1', productLabel: 'Moniteur MX-200',
  description: "Le moniteur s'est éteint en cours d'utilisation",
  device: { name: 'Moniteur', brand: 'Acme', model: 'MX-200', serialNumber: 'SN-778', inventoryNumber: 'INV-5', udi: 'UDI-1', lastMaintenanceDate: '2026-06-01' },
  malfunction: { occurredOn: '2026-10-10', occurredAt: '14:30', context: 'utilisation', symptoms: ['arret', 'alarme'], errorCode: 'E-42', actionTaken: 'hors_service', maintenanceTicket: 'TKT-9', deviceState: 'hors_service', impact: 'none' },
};
const withMal = (m: object, extra: object = {}) => ({ ...PANNE, malfunction: { ...PANNE.malfunction, ...m }, ...extra });

describe('panne — what leaves the Site', () => {
  it('forwards kind + device + malfunction intact, no patient data, no display label, no e-mail', async () => {
    audit.mockResolvedValue(ok());
    const r = await call('POST', '/api/declarations', { body: { ...PANNE, patientName: 'Jean X', organizationId: 'evil' }, as: 'alice' });
    expect(r.status).toBe(201);
    const sent = audit.mock.calls[0][0].body;
    expect(sent.kind).toBe('DEVICE_MALFUNCTION');
    expect(sent.device).toEqual(PANNE.device);
    expect(sent.malfunction).toEqual(PANNE.malfunction);
    expect(sent.declaredSeverity).toBe('legere'); // derived from impact 'none'
    expect(sent.reporter).toEqual({ role: 'DOCTOR', displayName: 'Name alice' });
    const raw = JSON.stringify(sent);
    for (const forbidden of ['Jean X', 'organizationId', 'evil', 'productLabel', 'Moniteur MX-200', '@private.dz']) expect(raw).not.toContain(forbidden);
  });
  it('an incident body is byte-for-byte what it was before the extension (no kind/device keys)', async () => {
    audit.mockResolvedValue(ok());
    await call('POST', '/api/declarations', { body: VALID, as: 'alice' });
    const sent = audit.mock.calls[0][0].body;
    expect(Object.keys(sent).sort()).toEqual(['declaredSeverity', 'description', 'lotNumber', 'productRef', 'reporter']);
  });
  it('browser DTO of a panne carries kind/device/malfunction and still no internal field', async () => {
    audit.mockResolvedValue(ok());
    const r = await call('POST', '/api/declarations', { body: PANNE, as: 'alice' });
    const dto = r.json.submission;
    expect(dto).toMatchObject({ kind: 'DEVICE_MALFUNCTION', productLabel: 'Moniteur MX-200', device: { serialNumber: 'SN-778' }, malfunction: { errorCode: 'E-42', impact: 'none' } });
    for (const leaked of ['attempts', 'lastError', 'authorUserId', 'payload', 'nextAttemptAt']) expect(dto).not.toHaveProperty(leaked);
  });
  it('an escalated impact is never downgraded: injury+legere -> 400, nothing stored, Audit untouched', async () => {
    const r = await call('POST', '/api/declarations', { body: withMal({ impact: 'injury' }, { declaredSeverity: 'legere' }), as: 'alice' });
    expect(r.status).toBe(400); expect(db.subs).toHaveLength(0); expect(audit).not.toHaveBeenCalled();
  });
  it('injury without a severity -> derived grave and forwarded', async () => {
    audit.mockResolvedValue(ok());
    await call('POST', '/api/declarations', { body: withMal({ impact: 'injury' }), as: 'alice' });
    expect(audit.mock.calls[0][0].body.declaredSeverity).toBe('grave');
  });
});

describe('panne — server-side validation (400, nothing stored, Audit never called)', () => {
  const del = (o: any, k: string) => { const c = JSON.parse(JSON.stringify(o)); delete c[k]; return c; };
  const noId = { ...PANNE, device: { name: 'Moniteur', model: 'MX' } };
  it.each([
    ['unknown kind', { ...PANNE, kind: 'RECALL' }],
    ['no device', del(PANNE, 'device')],
    ['no malfunction', del(PANNE, 'malfunction')],
    ['device without any identifier', noId],
    ['unknown impact', withMal({ impact: 'catastrophe' })],
    ['unknown context', withMal({ context: 'espace' })],
    ['unknown deviceState', withMal({ deviceState: 'x' })],
    ['unknown symptom', withMal({ symptoms: ['explosion'] })],
    ['impossible date', withMal({ occurredOn: '2026-02-31' })],
    ['future date', withMal({ occurredOn: '2999-01-01' })],
    ['bad time', withMal({ occurredAt: '25:99' })],
    ['errorCode too long', withMal({ errorCode: 'x'.repeat(101) })],
    ['device name too long', { ...PANNE, device: { ...PANNE.device, name: 'x'.repeat(201) } }],
    ['device given for an incident', { ...VALID, device: PANNE.device }],
    ['malfunction given for an incident', { ...VALID, malfunction: PANNE.malfunction }],
    ['description too long', { ...PANNE, description: 'x'.repeat(10_001) }],
    ['description missing', { ...PANNE, description: '   ' }],
  ])('%s', async (_n, body) => {
    const r = await call('POST', '/api/declarations', { body, as: 'alice' });
    expect(r.status).toBe(400); expect(db.subs).toHaveLength(0); expect(audit).not.toHaveBeenCalled();
  });
  // NON ADOPTÉ volontairement (comportement existant conservé) : voir LISEZMOI de fusion.
  it.skip('oversized body (> 64 kB) -> 413 JSON, not 500, nothing stored', async () => {
    const r = await call('POST', '/api/declarations', { body: { ...PANNE, description: 'é'.repeat(80_000) }, as: 'alice' });
    expect(r.status).toBe(413); expect(r.json.code).toBe('PAYLOAD_TOO_LARGE'); expect(db.subs).toHaveLength(0);
  });
  it('malformed JSON -> 400 JSON, not 500', async () => {
    const res = await fetch(`${base}/api/declarations`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie('alice') }, body: '{"productRef":' });
    expect(res.status).toBe(400); expect((await res.json()).code).toBe('INVALID_JSON');
  });
});

describe('panne — outcomes, idempotency, ownership', () => {
  it('Audit down -> 202 PENDING with an outbox time; retry keeps the SAME Audit key and finishes once', async () => {
    audit.mockResolvedValueOnce({ kind: 'network', error: 'ECONNREFUSED' }).mockResolvedValueOnce(ok());
    const first = await call('POST', '/api/declarations', { body: { ...PANNE, clientRequestId: 'p-req-0001' }, as: 'alice' });
    expect(first.status).toBe(202); expect(first.json.submission).toMatchObject({ status: 'PENDING', kind: 'DEVICE_MALFUNCTION', retrying: true, receivedAt: null, auditDeclarationId: null });
    const id = first.json.submission.id;
    const retry = await call('POST', `/api/declarations/${id}/retry`, { as: 'alice' });
    expect(retry.status).toBe(201);
    expect(audit.mock.calls.map((c) => c[0].idempotencyKey)).toEqual([id, id]);
    expect(audit.mock.calls[1][0].body.kind).toBe('DEVICE_MALFUNCTION');
    const dup = await call('POST', '/api/declarations', { body: { ...PANNE, clientRequestId: 'p-req-0001' }, as: 'alice' });
    expect(dup.json.submission.id).toBe(id); expect(db.subs).toHaveLength(1); expect(audit).toHaveBeenCalledTimes(2);
  });
  // NON ADOPTÉ volontairement (comportement existant conservé) : voir LISEZMOI de fusion.
  it.skip('same clientRequestId with DIFFERENT content -> 409, original row untouched, Audit not called again', async () => {
    audit.mockResolvedValue(ok());
    await call('POST', '/api/declarations', { body: { ...PANNE, clientRequestId: 'p-req-0002' }, as: 'alice' });
    const r = await call('POST', '/api/declarations', { body: { ...withMal({ impact: 'injury' }), clientRequestId: 'p-req-0002' }, as: 'alice' });
    expect(r.status).toBe(409); expect(r.json.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(db.subs).toHaveLength(1); expect(db.subs[0].payload.malfunction.impact).toBe('none'); expect(audit).toHaveBeenCalledTimes(1);
  });
  it('same content replayed with keys in a different order is still a faithful replay (no 409)', async () => {
    audit.mockResolvedValue(ok());
    await call('POST', '/api/declarations', { body: { ...VALID, clientRequestId: 'ord-0001' }, as: 'alice' });
    const reordered = { clientRequestId: 'ord-0001', declaredSeverity: 'grave', lotNumber: 'LOT-9', description: VALID.description, productRef: 'PRD-1' };
    const r = await call('POST', '/api/declarations', { body: reordered, as: 'alice' });
    expect(r.status).toBe(201); expect(db.subs).toHaveLength(1);
  });
  it('NOT_ROUTABLE for a panne -> 422, kept as draft, never reported received', async () => {
    audit.mockResolvedValue({ kind: 'http', status: 422, data: { error: 'NOT_ROUTABLE', reason: 'NO_ORG' } });
    const r = await call('POST', '/api/declarations', { body: PANNE, as: 'alice' });
    expect(r.status).toBe(422); expect(db.subs[0].status).toBe('NOT_ROUTABLE'); expect(db.subs[0].receivedAt).toBeNull();
  });
  it("bob cannot read, list or retry alice's panne", async () => {
    audit.mockResolvedValue({ kind: 'network', error: 'TIMEOUT' });
    const a = await call('POST', '/api/declarations', { body: PANNE, as: 'alice' });
    const id = a.json.submission.id;
    expect((await call('GET', `/api/declarations/${id}`, { as: 'bob' })).status).toBe(404);
    expect((await call('POST', `/api/declarations/${id}/retry`, { as: 'bob' })).status).toBe(404);
    expect((await call('GET', '/api/declarations', { as: 'bob' })).json.submissions).toEqual([]);
    expect(audit).toHaveBeenCalledTimes(1);
  });
});

describe('outbox durability (restart / sweep)', () => {
  it('a new row always has a future sweep time, so a crash between write and send loses nothing', async () => {
    audit.mockImplementation(() => new Promise(() => { /* never answers: simulates a crash mid-send */ }));
    void call('POST', '/api/declarations', { body: PANNE, as: 'alice' }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 80));
    expect(db.subs).toHaveLength(1);
    expect(db.subs[0].status).toBe('PENDING');
    expect(db.subs[0].nextAttemptAt).toBeInstanceOf(Date);
    expect(db.subs[0].nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });
  it('after a "restart", the sweep delivers a due PENDING row with its ORIGINAL idempotency key and original payload', async () => {
    const { prisma } = await import('../src/lib/prisma');
    const { retryDueSubmissions } = await import('../src/services/submissions');
    db.subs.push({ id: 'orphan1', authorUserId: 'alice', clientRequestId: null, payload: { ...PANNE }, status: 'PENDING', attempts: 0,
      auditDeclarationId: null, routingBasis: null, receivedAt: null, failureReason: null, lastError: null, nextAttemptAt: new Date(Date.now() - 1000), createdAt: new Date() });
    audit.mockResolvedValue(ok({ auditDeclarationId: 'AUD-SWEEP' }));
    const n = await retryDueSubmissions({ db: prisma as any, audit: audit as any });
    expect(n).toBe(1);
    expect(audit.mock.calls[0][0].idempotencyKey).toBe('orphan1');
    expect(audit.mock.calls[0][0].body.kind).toBe('DEVICE_MALFUNCTION');
    expect(db.subs[0]).toMatchObject({ status: 'RECEIVED', auditDeclarationId: 'AUD-SWEEP' });
  });
  // NON ADOPTÉ volontairement (comportement existant conservé) : voir LISEZMOI de fusion.
  it.skip('after the bounded automatic attempts the row stays PENDING, is flagged exhausted, and is never reported received', async () => {
    audit.mockResolvedValue({ kind: 'network', error: 'TIMEOUT' });
    const a = await call('POST', '/api/declarations', { body: PANNE, as: 'alice' });
    db.subs[0].attempts = 11; // next failure = 12th = last automatic attempt
    const r = await call('POST', `/api/declarations/${a.json.submission.id}/retry`, { as: 'alice' });
    expect(r.json.submission).toMatchObject({ status: 'PENDING', retrying: false, autoRetryExhausted: true, receivedAt: null });
  });
});
