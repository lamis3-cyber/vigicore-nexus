/**
 * HTTP-level tests of /api/support (auth, PATIENT exclusion, validation, relay to Audit, error mapping).
 * LIMIT: Prisma is an in-memory fake and the Audit transport a mock — these prove ROUTE LOGIC only.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'net';

const db = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret';
  return { users: [] as any[] };
});

vi.mock('../src/lib/auditClient', () => ({ auditConfigured: () => true, callAudit: vi.fn() }));
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: async ({ where }: any) => { const u = db.users.find((x) => x.id === where.id); return u ? { ...u, affiliations: [] } : null; } },
  },
}));

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
async function call(method: string, path: string, opts: { body?: unknown; as?: string; headers?: Record<string, string> } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(opts.as ? { Cookie: `vg_session=${signSessionToken({ userId: opts.as })}` } : {}), ...opts.headers },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}
const http = (status: number, data: any) => ({ kind: 'http' as const, status, data });
const OPEN = { organizationRef: 'org-1', topic: 'URGENT_FAILURE', message: 'Panne sur le dispositif' };

beforeEach(() => { db.users.length = 0; audit.mockReset(); mkUser('alice'); mkUser('pat', { role: 'PATIENT' }); });

describe('access', () => {
  it('anonymous callers -> 401 on every route, Audit never called', async () => {
    for (const [m, p] of [['GET', '/api/support/organizations?q=ab'], ['GET', '/api/support/threads'], ['POST', '/api/support/threads'],
      ['GET', '/api/support/threads/x/messages'], ['POST', '/api/support/threads/x/messages']]) {
      expect((await call(m, p, { body: m === 'POST' ? {} : undefined })).status, `${m} ${p}`).toBe(401);
    }
    expect(audit).not.toHaveBeenCalled();
  });
  it('a PATIENT account is refused (403) before anything reaches Audit', async () => {
    expect((await call('GET', '/api/support/organizations?q=ab', { as: 'pat' })).status).toBe(403);
    expect((await call('POST', '/api/support/threads', { as: 'pat', body: OPEN })).status).toBe(403);
    expect(audit).not.toHaveBeenCalled();
  });
});

describe('organizations search', () => {
  it('q shorter than 2 -> 400 without calling Audit', async () => {
    expect((await call('GET', '/api/support/organizations?q=a', { as: 'alice' })).status).toBe(400);
    expect(audit).not.toHaveBeenCalled();
  });
  it('relays with scope support:use and the SIGNED user id as reporterRef', async () => {
    audit.mockResolvedValue(http(200, { organizations: [{ organizationRef: 'org-1', name: 'Labo Test', type: 'OTHER' }] }));
    const r = await call('GET', '/api/support/organizations?q=Labo%20Test', { as: 'alice' });
    expect(r.status).toBe(200);
    expect(r.json.organizations).toHaveLength(1);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', scope: 'support:use', reporterRef: 'alice', path: '/nexus/v1/support/organizations?q=Labo%20Test' }));
  });
});

describe('open a thread', () => {
  it.each([
    ['no organizationRef', { ...OPEN, organizationRef: undefined }],
    ['unknown topic (e.g. an order)', { ...OPEN, topic: 'COMMANDE' }],
    ['empty message', { ...OPEN, message: '   ' }],
    ['message over 4000 chars', { ...OPEN, message: 'x'.repeat(4001) }],
  ])('%s -> 400, Audit not called', async (_n, body) => {
    expect((await call('POST', '/api/support/threads', { as: 'alice', body })).status).toBe(400);
    expect(audit).not.toHaveBeenCalled();
  });
  it('a malformed Idempotency-Key -> 400', async () => {
    expect((await call('POST', '/api/support/threads', { as: 'alice', body: OPEN, headers: { 'Idempotency-Key': 'short' } })).status).toBe(400);
  });
  it('forwards ONLY the 3 whitelisted fields; a body-supplied identity is ignored', async () => {
    audit.mockResolvedValue(http(201, { threadId: 'thr-1', message: { id: 'm1', direction: 'FROM_CLIENT', content: 'x', sentAt: 't', replayed: false } }));
    const r = await call('POST', '/api/support/threads', {
      as: 'alice', headers: { 'Idempotency-Key': 'key-abcdefgh' },
      body: { ...OPEN, reporterRef: 'bob', organizationId: 'evil', role: 'SUPPORT' },
    });
    expect(r.status).toBe(201);
    expect(r.json.threadId).toBe('thr-1');
    const sent = audit.mock.calls[0][0];
    expect(sent.reporterRef).toBe('alice');
    expect(sent.idempotencyKey).toBe('key-abcdefgh');
    // `client` est dérivé de la SESSION (nom, rôle réel), jamais du corps : le `role: 'SUPPORT'` envoyé est donc sans effet.
    expect(sent.body).toEqual({ organizationRef: 'org-1', topic: 'URGENT_FAILURE', message: 'Panne sur le dispositif', client: { name: 'Name alice', organization: undefined, role: 'DOCTOR' } });
    expect(JSON.stringify(sent.body)).not.toMatch(/evil|SUPPORT|bob/);
  });
  it('Audit 422 -> 422 SUPPORT_UNAVAILABLE with no internal detail', async () => {
    audit.mockResolvedValue(http(422, { error: 'SUPPORT_UNAVAILABLE', detail: 'secret' }));
    const r = await call('POST', '/api/support/threads', { as: 'alice', body: OPEN });
    expect(r.status).toBe(422);
    expect(r.json.code).toBe('SUPPORT_UNAVAILABLE');
    expect(JSON.stringify(r.json)).not.toContain('secret');
  });
  it('network failure -> 502 AUDIT_UNAVAILABLE, never a success', async () => {
    audit.mockResolvedValue({ kind: 'network', error: 'TIMEOUT' });
    const r = await call('POST', '/api/support/threads', { as: 'alice', body: OPEN });
    expect(r.status).toBe(502);
    expect(r.json.success).toBe(false);
  });
});

describe('messages', () => {
  it('thread owned by someone else: Audit 404 is passed through as 404', async () => {
    audit.mockResolvedValue(http(404, { error: 'NOT_FOUND' }));
    expect((await call('GET', '/api/support/threads/thr-9/messages', { as: 'alice' })).status).toBe(404);
  });
  it('thread id is URL-encoded and since is forwarded', async () => {
    audit.mockResolvedValue(http(200, { messages: [] }));
    await call('GET', '/api/support/threads/a%2Fb/messages?since=2026-10-21T10:00:00Z', { as: 'alice' });
    expect(audit.mock.calls[0][0].path).toBe('/nexus/v1/support/threads/a%2Fb/messages?since=2026-10-21T10%3A00%3A00Z');
  });
  it('POST validates content then relays with the key', async () => {
    expect((await call('POST', '/api/support/threads/thr-1/messages', { as: 'alice', body: { content: '' } })).status).toBe(400);
    audit.mockResolvedValue(http(201, { id: 'm2', direction: 'FROM_CLIENT', content: 'bonjour', sentAt: 't', replayed: false }));
    const r = await call('POST', '/api/support/threads/thr-1/messages', { as: 'alice', headers: { 'Idempotency-Key': 'key-abcdefgh' }, body: { content: ' bonjour ' } });
    expect(r.status).toBe(201);
    expect(audit.mock.calls[0][0]).toMatchObject({ scope: 'support:use', idempotencyKey: 'key-abcdefgh', body: { content: 'bonjour' } });
  });
});
