/**
 * Panne interne notifiée au CNPM (POST /api/records + pièces jointes). LIMITE : Prisma est un faux en mémoire et le
 * SMTP un faux : ces tests prouvent la logique de route, pas l'envoi réel.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'net';

const mail = vi.hoisted(() => ({ sent: [] as any[] }));
const db = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret';
  return { users: [] as any[], decls: [] as any[], seq: 0 };
});
vi.mock('../src/lib/email', () => ({ mailConfigured: () => true, sendMail: async (m: any) => { mail.sent.push(m); } }));
vi.mock('../src/lib/prisma', () => {
  const declaration = {
    findUnique: async ({ where }: any) => db.decls.find((r) => where.id ? r.id === where.id : (r.authorUserId === where.authorUserId_clientRequestId?.authorUserId && r.clientRequestId === where.authorUserId_clientRequestId?.clientRequestId)) ?? null,
    findFirst: async ({ where }: any) => db.decls.find((r) => r.id === where.id && r.authorUserId === where.authorUserId) ?? null,
    create: async ({ data }: any) => { const row = { id: `d${++db.seq}`, createdAt: new Date(), updatedAt: new Date(), case: null, ...data }; db.decls.push(row); return row; },
  };
  const user = { findUnique: async ({ where }: any) => { const u = db.users.find((x) => x.id === where.id); return u ? { ...u, affiliations: [{ establishmentId: 'E1', status: 'ACTIVE', isActiveContext: true, memberRole: 'MEMBER', departmentId: null }] } : null; } };
  return { prisma: { user, declaration, userEstablishment: { findFirst: async () => ({ establishmentId: 'E1', status: 'ACTIVE', departmentId: null }) }, permissionGrant: { findMany: async () => [] }, establishment: { findFirst: async () => null } } };
});
import { createApp } from '../src/app';
import { signSessionToken } from '../src/lib/jwt';

let server: ReturnType<ReturnType<typeof createApp>['listen']>; let base: string;
beforeAll(() => { server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(() => { server.close(); });
const cookie = `vg_session=${signSessionToken({ userId: 'alice' })}`;
const PANNE = {
  kind: 'INTERNAL_PANNE', description: 'Arrêt brutal en cours de cycle',
  device: { name: 'Autoclave', serialNumber: 'SN1' },
  malfunction: { occurredOn: '2026-10-01', context: 'utilisation', deviceState: 'hors_service', impact: 'none' },
};
const post = (body: any) => fetch(`${base}/api/records`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: (await r.json()) as any }));
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(40, 1)]);
const upload = (id: string, name: string) => fetch(`${base}/api/records/${id}/attachments`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(name), Cookie: cookie }, body: PDF as any }).then(async (r) => ({ status: r.status, json: (await r.json()) as any }));

beforeEach(() => {
  db.users.length = 0; db.decls.length = 0; mail.sent.length = 0; process.env.CNPM_NOTIFY_EMAIL = 'cnpm@example.org';
  db.users.push({ id: 'alice', email: 'a@x.dz', displayName: 'Alice', role: 'DOCTOR', deactivatedAt: null });
});

describe('panne interne + CNPM', () => {
  it('CNPM choisi : e-mail avec libellés lisibles, sans appel à Audit', async () => {
    const r = await post({ ...PANNE, notifyCnpm: true, notifyContext: { service: 'Stérilisation', problem: "Panne / dysfonctionnement d'un dispositif" } });
    expect(r.status).toBe(201);
    await new Promise((res) => setTimeout(res, 30));
    expect(mail.sent).toHaveLength(1);
    const t = mail.sent[0].text;
    for (const x of ['Autoclave', 'SN1', "Pendant l'utilisation", 'Hors service', 'Stérilisation', 'Médecin']) expect(t).toContain(x);
  });
  it('CNPM non choisi : aucun e-mail', async () => {
    expect((await post(PANNE)).status).toBe(201);
    await new Promise((res) => setTimeout(res, 30));
    expect(mail.sent).toHaveLength(0);
  });
  it('avec pièce jointe : un seul e-mail, fichier joint', async () => {
    const r = await post({ ...PANNE, notifyCnpm: true, notifyContext: { attachments: ['plaque.pdf'] } });
    await new Promise((res) => setTimeout(res, 30));
    expect(mail.sent).toHaveLength(0);
    expect((await upload(r.json.record.id, 'plaque.pdf')).status).toBe(200);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].attachments[0].filename).toBe('plaque.pdf');
  });
  it('pièce jointe sur la déclaration d\'un autre : 404', async () => {
    db.decls.push({ id: 'dX', authorUserId: 'bob', payload: [] });
    expect((await upload('dX', 'a.pdf')).status).toBe(404);
  });
});
