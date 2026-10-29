/**
 * HTTP-level tests of /api/declarations (auth, validation, idempotency, retry, ownership,
 * error mapping). LIMIT: Prisma is replaced by an in-memory fake and the Audit transport by a
 * mock — these prove ROUTE LOGIC, not real-database behaviour (unique constraints are emulated).
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { AddressInfo } from 'net';

const mail = vi.hoisted(() => ({ sent: [] as any[], fail: false, configured: true }));
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

vi.mock('../src/lib/email', () => ({ mailConfigured: () => mail.configured, sendMail: async (m: any) => { if (mail.fail) throw new Error('smtp'); mail.sent.push(m); } }));
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

beforeEach(() => { db.users.length = 0; db.subs.length = 0; audit.mockReset(); mkUser('alice'); mkUser('bob'); });


const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(50, 1)]);
async function upload(id: string, name: string, data: Buffer | string, as?: string) {
  const res = await fetch(`${base}/api/declarations/${id}/attachments`, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(name), ...(as ? { Cookie: cookie(as) } : {}) }, body: data as any,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}
beforeEach(() => { db.users.length = 0; db.subs.length = 0; mail.sent.length = 0; mail.fail = false; mail.configured = true; process.env.CNPM_NOTIFY_EMAIL = 'cnpm@example.org';
  mkUser('alice'); mkUser('bob'); db.subs.push({ id: 's1', authorUserId: 'alice', payload: { productRef: 'P1', productLabel: 'Pompe X', description: 'd' }, status: 'RECEIVED', createdAt: new Date() }); });

describe('POST /api/declarations/:id/attachments', () => {
  it('requires auth', async () => { expect((await upload('s1', 'a.pdf', PDF)).status).toBe(401); });
  it('envoie le fichier en pièce jointe au CNPM, contenu intact', async () => {
    const r = await upload('s1', 'rapport.pdf', PDF, 'alice');
    expect(r.status).toBe(200); expect(r.json.status).toBe('sent');
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe('cnpm@example.org');
    expect(mail.sent[0].attachments[0]).toMatchObject({ filename: 'rapport.pdf', contentType: 'application/pdf' });
    expect(Buffer.compare(mail.sent[0].attachments[0].content, PDF)).toBe(0);
  });
  it('déclaration avec pièces annoncées : le message principal attend les fichiers et part UNE fois, fichiers joints', async () => {
    audit.mockResolvedValue(ok());
    const r = await call('POST', '/api/declarations', { as: 'alice', body: { ...VALID, notifyContext: { attachments: ['rapport.pdf'], description: 'x' } } });
    expect(r.status).toBe(201);
    await new Promise((res) => setTimeout(res, 50));
    expect(mail.sent).toHaveLength(0);
    const up = await upload(r.json.submission.id, 'rapport.pdf', PDF, 'alice');
    expect(up.status).toBe(200);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].subject).toContain('[CNPM] Nouvelle');
    expect(mail.sent[0].attachments[0].filename).toBe('rapport.pdf');
    expect(mail.sent[0].text).toContain('Pièces jointes à ce message');
  });
  it("la déclaration d'un autre utilisateur -> 404, rien envoyé", async () => {
    expect((await upload('s1', 'a.pdf', PDF, 'bob')).status).toBe(404); expect(mail.sent).toHaveLength(0);
  });
  it('refuse un format interdit, un faux PDF, un fichier vide, un nom avec chemin nettoyé', async () => {
    expect((await upload('s1', 'virus.exe', PDF, 'alice')).status).toBe(400);
    expect((await upload('s1', 'faux.pdf', 'pas un pdf du tout', 'alice')).status).toBe(400);
    expect((await upload('s1', 'vide.pdf', '', 'alice')).status).toBe(400);
    expect(mail.sent).toHaveLength(0);
    const ok = await upload('s1', '../../etc/rapport.pdf', PDF, 'alice');
    expect(ok.status).toBe(200); expect(mail.sent[0].attachments[0].filename).toBe('rapport.pdf');
  });
  it('trop volumineux -> 413', async () => {
    const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(11 * 1024 * 1024, 1)]);
    expect((await upload('s1', 'gros.pdf', big, 'alice')).status).toBe(413);
  });
  it('e-mail non configuré ou en échec : réponse honnête (jamais « envoyé »)', async () => {
    mail.configured = false;
    const a = await upload('s1', 'a.pdf', PDF, 'alice'); expect(a.status).toBe(503); expect(a.json.success).toBe(false);
    mail.configured = true; mail.fail = true;
    const b = await upload('s1', 'a.pdf', PDF, 'alice'); expect(b.status).toBe(502); expect(b.json.status).toBe('failed');
  });
});
