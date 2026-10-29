/**
 * HTTP-level tests of /api/records (patients suivis + journal d'audit). Prisma is an in-memory fake:
 * these prove ROUTE LOGIC and scoping, not real-database behaviour.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'net';

const db = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret';
  return { users: [] as any[], pats: [] as any[], aud: [] as any[], ests: [] as any[], conns: [] as any[], mails: [] as any[], mailOn: true, seq: 0 };
});

vi.mock('../src/lib/prisma', () => {
  const match = (r: any, w: any = {}): boolean =>
    Object.entries(w).every(([k, v]: [string, any]) => {
      if (k === 'OR') return v.some((x: any) => match(r, x));
      if (v && typeof v === 'object' && 'in' in v) return v.in.includes(r[k]);
      if (k === 'deactivatedAt') return (r[k] ?? null) === v;
      return r[k] === v;
    });
  const tbl = (rows: any[], p: string) => ({
    findMany: async ({ where }: any = {}) => rows.filter((r) => match(r, where)),
    count: async ({ where }: any = {}) => rows.filter((r) => match(r, where)).length,
    findFirst: async ({ where }: any = {}) => rows.find((r) => match(r, where)) ?? null,
    delete: async ({ where }: any) => { const i = rows.findIndex((r) => r.id === where.id); const [x] = rows.splice(i, 1); return x; },
    update: async ({ where, data }: any) => { const r = rows.find((x) => x.id === where.id); Object.assign(r, data, { updatedAt: new Date() }); return r; },
    create: async ({ data }: any) => { const row = { id: `${p}_${++db.seq}`, createdAt: new Date(), updatedAt: new Date(), ...data }; rows.push(row); return row; },
  });
  const user = {
    findUnique: async ({ where }: any) => { const u = db.users.find((x) => x.id === where.id); return u ? { ...u, affiliations: u.affiliations ?? [] } : null; },
    findFirst: async ({ where }: any) => db.users.find((x) => match(x, where)) ?? null,
  };
  const establishment = { findFirst: async ({ where }: any) => db.ests.find((e) => match(e, where)) ?? null };
  return { prisma: { user, establishment, dashboardPatient: tbl(db.pats, 'pat'), auditEntry: tbl(db.aud, 'aud'), chatConnection: tbl(db.conns, 'cc') } };
});
vi.mock('../src/lib/email', () => ({
  mailConfigured: () => db.mailOn,
  sendMail: async (m: any) => { db.mails.push(m); },
}));

import { createApp } from '../src/app';
import { signSessionToken } from '../src/lib/jwt';

let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base: string;
beforeAll(() => { server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(() => { server.close(); });

const aff = (establishmentId: string) => ({ establishmentId, status: 'ACTIVE', isActiveContext: true, memberRole: 'MEMBER' });
async function call(method: string, path: string, as?: string, body?: unknown) {
  const res = await fetch(`${base}/api/records${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(as ? { Cookie: `vg_session=${signSessionToken({ userId: as })}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

beforeEach(() => {
  db.pats.length = 0; db.conns.length = 0; db.mails.length = 0; db.mailOn = true; db.aud.length = 0; db.users.length = 0; db.ests.length = 0; db.seq = 0;
  db.ests.push({ id: 'central', isSystemReserved: true }, { id: 'chu', isSystemReserved: false });
  const u = (id: string, role: string, a: any[] = []) => db.users.push({ id, email: `${id}@x.dz`, displayName: `Name ${id}`, role, deactivatedAt: null, affiliations: a });
  u('doc1', 'DOCTOR', [aff('chu')]); u('doc2', 'DOCTOR', [aff('chu')]); u('qual', 'VIGILANCE_REVIEWER', [aff('chu')]); u('pat', 'PATIENT'); db.users.push({ id: 'pat2', email: 'sara@x.dz', displayName: 'Sara', role: 'PATIENT', deactivatedAt: null, affiliations: [] }); u('solo', 'DOCTOR');
});

describe('records', () => {
  it('requires auth', async () => {
    expect((await call('GET', '/patients')).status).toBe(401);
    expect((await call('POST', '/audit')).status).toBe(401);
  });
  it('only doctors create patients; input is validated; server owns id/org/owner', async () => {
    expect((await call('POST', '/patients', 'pat', { name: 'X', age: 40, email: 'a@b.dz' })).status).toBe(403);
    expect((await call('POST', '/patients', 'doc1', { name: '', age: 40, email: 'a@b.dz' })).status).toBe(400);
    expect((await call('POST', '/patients', 'doc1', { name: 'X', age: 400, email: 'a@b.dz' })).status).toBe(400);
    const r = await call('POST', '/patients', 'doc1', { name: 'Amine Kaci', age: 40, sex: 'M', condition: 'HTA', email: 'amine@x.dz', allergies: ['Pénicilline'], organizationId: 'evil', ownerUserId: 'doc2', id: 'forced' });
    expect(r.status).toBe(201);
    expect(r.json.patient).toMatchObject({ name: 'Amine Kaci', initials: 'AK', organizationId: 'chu', ownerUserId: 'doc1' });
    expect(r.json.patient.id).not.toBe('forced');
  });
  it('a doctor sees only their own patients; the establishment (quality, admin) never sees them', async () => {
    await call('POST', '/patients', 'doc1', { name: 'A B', age: 30, email: 'ab@x.dz' });
    await call('POST', '/patients', 'doc2', { name: 'C D', age: 31, email: 'cd@x.dz' });
    expect((await call('GET', '/patients', 'doc1')).json.patients).toHaveLength(1);
    expect((await call('GET', '/patients', 'solo')).json.patients).toHaveLength(0);
    expect((await call('GET', '/patients', 'qual')).json.patients).toHaveLength(0);
  });
  it('adding a patient requires a valid e-mail; links an existing patient account and notifies by e-mail', async () => {
    expect((await call('POST', '/patients', 'doc1', { name: 'No Mail', age: 30 })).status).toBe(400);
    expect((await call('POST', '/patients', 'doc1', { name: 'Bad', age: 30, email: 'nope' })).status).toBe(400);
    const r = await call('POST', '/patients', 'doc1', { name: 'Sara B', age: 30, email: 'Sara@X.dz' });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ linked: true, emailStatus: 'sent' });
    expect(r.json.patient).toMatchObject({ email: 'sara@x.dz', patientUserId: 'pat2', chatStatus: 'sent' });
    expect(db.conns).toHaveLength(1);
    expect(db.conns[0]).toMatchObject({ requesterId: 'doc1', addresseeId: 'pat2' });
    expect(db.conns[0].status).not.toBe('ACCEPTED'); // DB default is PENDING: the patient must accept
    expect(db.mails).toHaveLength(1);
    expect(db.mails[0].to).toBe('sara@x.dz');
    expect(db.mails[0].text).not.toMatch(/hypert|allerg/i); // aucune donnée de santé dans l'e-mail
    const un = await call('POST', '/patients', 'doc1', { name: 'Inconnu', age: 50, email: 'nobody@x.dz' });
    expect(un.json).toMatchObject({ linked: false, emailStatus: 'sent' });
    expect(un.json.patient.patientUserId).toBeNull();
    expect(db.conns).toHaveLength(1);
  });
  it('the patient is still added when mail is not configured, and says so', async () => {
    db.mailOn = false;
    const r = await call('POST', '/patients', 'doc1', { name: 'Sara B', age: 30, email: 'sara@x.dz' });
    expect(r.status).toBe(201);
    expect(r.json.emailStatus).toBe('not_configured');
  });
  it('reviewers never see the patient e-mail or linked account', async () => {
    await call('POST', '/patients', 'doc1', { name: 'Sara B', age: 30, email: 'sara@x.dz' });
    expect((await call('GET', '/patients', 'qual')).json.patients).toEqual([]);
    expect((await call('GET', '/patients', 'doc1')).json.patients[0].email).toBe('sara@x.dz');
  });
  it('« supprimer » ARCHIVE : le dossier reste en base (jamais effacé), seul le médecin propriétaire peut agir', async () => {
    const id = (await call('POST', '/patients', 'doc1', { name: 'Sara B', age: 30, email: 'sara@x.dz' })).json.patient.id;
    expect((await call('DELETE', `/patients/${id}`, 'pat')).status).toBe(403);
    expect((await call('DELETE', `/patients/${id}`, 'doc2')).status).toBe(404);
    expect((await call('DELETE', `/patients/${id}`, 'qual')).status).toBe(403);
    expect(db.pats).toHaveLength(1);
    const del = await call('DELETE', `/patients/${id}`, 'doc1', { reason: 'Fin de suivi' });
    expect(del.status).toBe(200);
    expect(db.pats).toHaveLength(1); // toujours en base
    expect(db.pats[0]).toMatchObject({ archivedByUserId: 'doc1', archiveReason: 'Fin de suivi' });
    expect(db.pats[0].archivedAt).toBeInstanceOf(Date);
    expect(db.pats[0].archiveHash).toMatch(/^[0-9a-f]{64}$/);
    expect(db.aud.some((a) => a.refId === id && a.refType === 'patient')).toBe(true);
    expect((await call('DELETE', `/patients/${id}`, 'doc1')).json.alreadyArchived).toBe(true); // idempotent
  });
  it('liste active sans les archivés ; archives visibles du seul propriétaire (pas des relecteurs)', async () => {
    const id = (await call('POST', '/patients', 'doc1', { name: 'Sara B', age: 30, email: 'sara@x.dz' })).json.patient.id;
    await call('POST', '/patients', 'doc1', { name: 'Amine K', age: 40, email: 'amine@x.dz' });
    await call('DELETE', `/patients/${id}`, 'doc1');
    expect((await call('GET', '/patients', 'doc1')).json.patients.map((p: any) => p.name)).toEqual(['Amine K']);
    expect((await call('GET', '/patients', 'qual')).json.patients).toHaveLength(0);
    const arch = (await call('GET', '/patients?view=archived', 'doc1')).json.patients;
    expect(arch).toHaveLength(1);
    expect(arch[0]).toMatchObject({ name: 'Sara B', archived: true, archiveReason: null });
    expect((await call('GET', '/patients?view=archived', 'qual')).json.patients).toHaveLength(0);
    expect((await call('GET', '/patients?view=archived', 'doc2')).json.patients).toHaveLength(0);
  });
  it('dossier archivé = lecture seule : contact refusé ; restauration possible ; propriétaire uniquement', async () => {
    const id = (await call('POST', '/patients', 'doc1', { name: 'Sara B', age: 30, email: 'sara@x.dz' })).json.patient.id;
    expect((await call('POST', `/patients/${id}/restore`, 'doc1')).status).toBe(409); // pas archivé
    await call('DELETE', `/patients/${id}`, 'doc1');
    const mailsBefore = db.mails.length;
    expect((await call('POST', `/patients/${id}/contact`, 'doc1', { message: 'Bonjour' })).status).toBe(409);
    expect(db.mails).toHaveLength(mailsBefore);
    expect((await call('POST', `/patients/${id}/restore`, 'doc2')).status).toBe(404);
    expect((await call('POST', `/patients/${id}/restore`, 'doc1')).status).toBe(200);
    expect(db.pats[0].archivedAt).toBeNull();
    expect((await call('GET', '/patients', 'doc1')).json.patients).toHaveLength(1);
  });
  it('retirer de l’affichage : seulement un dossier archivé ; il reste en base et peut être réaffiché', async () => {
    const id = (await call('POST', '/patients', 'doc1', { name: 'Sara B', age: 30, email: 'sara@x.dz' })).json.patient.id;
    expect((await call('POST', `/patients/${id}/hide`, 'doc1')).status).toBe(409); // actif : refusé
    await call('DELETE', `/patients/${id}`, 'doc1');
    expect((await call('POST', `/patients/${id}/hide`, 'doc2')).status).toBe(404);
    expect((await call('POST', `/patients/${id}/hide`, 'doc1')).status).toBe(200);
    expect(db.pats).toHaveLength(1); // jamais supprimé
    expect((await call('GET', '/patients?view=archived', 'doc1')).json.patients).toHaveLength(0);
    expect((await call('GET', '/patients?view=archived&hidden=1', 'doc1')).json.patients).toHaveLength(1);
    expect((await call('POST', `/patients/${id}/unhide`, 'doc1')).status).toBe(200);
    expect((await call('GET', '/patients?view=archived', 'doc1')).json.patients).toHaveLength(1);
  });
  it('contact by e-mail: owner only, message required, 503 when mail is not configured', async () => {
    const id = (await call('POST', '/patients', 'doc1', { name: 'Sara B', age: 30, email: 'sara@x.dz' })).json.patient.id;
    db.mails.length = 0;
    expect((await call('POST', `/patients/${id}/contact`, 'doc2', { message: 'Bonjour' })).status).toBe(404);
    expect((await call('POST', `/patients/${id}/contact`, 'doc1', { message: '  ' })).status).toBe(400);
    const ok = await call('POST', `/patients/${id}/contact`, 'doc1', { message: 'Bonjour, merci de passer au cabinet.' });
    expect(ok.status).toBe(200);
    expect(db.mails[0]).toMatchObject({ to: 'sara@x.dz', replyTo: 'doc1@x.dz' });
    expect(db.mails[0].text).toContain('merci de passer au cabinet');
    db.mailOn = false;
    expect((await call('POST', `/patients/${id}/contact`, 'doc1', { message: 'Re' })).status).toBe(503);
  });
  it('audit: actor and establishment come from the session, entries are scoped', async () => {
    expect((await call('POST', '/audit', 'doc1', { refType: 'nope', refId: 'x', action: 'y' })).status).toBe(400);
    expect((await call('POST', '/audit', 'pat', { refType: 'declaration', refId: 'x', action: 'y' })).status).toBe(403);
    const r = await call('POST', '/audit', 'doc1', { refType: 'declaration', refId: 'd1', action: 'Déclaration créée', actor: 'Faux', organizationId: 'evil' });
    expect(r.status).toBe(201);
    expect(r.json.entry).toMatchObject({ actor: 'Name doc1', organizationId: 'chu' });
    await call('POST', '/audit', 'doc2', { refType: 'alert', refId: 'a1', action: 'Alerte acquittée' });
    expect((await call('GET', '/audit', 'doc1')).json.entries).toHaveLength(1);
    expect((await call('GET', '/audit', 'qual')).json.entries).toHaveLength(2);
    expect((await call('GET', '/audit', 'solo')).json.entries).toHaveLength(0);
  });
});
