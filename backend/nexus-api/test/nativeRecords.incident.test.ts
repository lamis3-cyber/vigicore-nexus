/**
 * Incident / panne natifs : destinations, états de livraison, isolation par organisation, pièces jointes chiffrées.
 * LIMITE : Prisma, le SMTP et le disque (dossier temporaire) sont réels ou simulés ainsi : Prisma = faux en mémoire,
 * SMTP = faux. Ces tests prouvent la logique de route et le chiffrement, pas un envoi réel ni une vraie base.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'net';
import fs from 'fs';
import os from 'os';
import path from 'path';

const mail = vi.hoisted(() => ({ sent: [] as any[], on: true, fail: false }));
const db = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret';
  return { users: [] as any[], decls: [] as any[], dels: [] as any[], atts: [] as any[], ests: [] as any[], subs: [] as any[], cases: [] as any[], prefs: [] as any[], pats: [] as any[], conns: [] as any[], seq: 0, noMigration: false };
});
const audit = vi.hoisted(() => ({ calls: [] as any[], reply: null as any }));
vi.mock('../src/lib/auditClient', () => ({
  auditConfigured: () => true,
  callAudit: async (req: any) => { audit.calls.push(req); return audit.reply ?? { kind: 'network', error: 'DOWN' }; },
}));
vi.mock('../src/lib/email', () => ({
  mailConfigured: () => mail.on,
  sendMail: async (m: any) => { if (mail.fail) throw new Error('SMTP down'); mail.sent.push(m); },
}));
vi.mock('../src/lib/prisma', () => {
  const match = (r: any, w: any = {}): boolean => Object.entries(w).every(([k, v]: [string, any]) => {
    if (v && typeof v === 'object' && 'in' in v) return v.in.includes(r[k]);
    if (v && typeof v === 'object' && 'notIn' in v) return !v.notIn.includes(r[k]);
    if (v && typeof v === 'object' && 'not' in v) return r[k] !== v.not;
    return r[k] === v;
  });
  const withDel = (r: any) => (r ? { ...r, deliveries: db.dels.filter((d) => d.declarationId === r.id), case: db.cases.find((c) => c.declarationId === r.id) ?? r.case ?? null } : r);
  const declaration = {
    findUnique: async ({ where }: any) => withDel(db.decls.find((r) => where.id ? r.id === where.id : (r.authorUserId === where.authorUserId_clientRequestId?.authorUserId && r.clientRequestId === where.authorUserId_clientRequestId?.clientRequestId))) ?? null,
    findFirst: async ({ where }: any) => withDel(db.decls.find((r) => match(r, where))) ?? null,
    findMany: async ({ where }: any) => db.decls.filter((r) => match(r, where)).map(withDel),
    create: async ({ data }: any) => { const row = { id: `d${++db.seq}`, createdAt: new Date(), updatedAt: new Date(), case: null, ...data }; db.decls.push(row); return row; },
    updateMany: async ({ where, data }: any) => { const rs = db.decls.filter((r) => match(r, where)); rs.forEach((r) => Object.assign(r, data)); return { count: rs.length }; },
  };
  const declarationDelivery = {
    count: async () => { if (db.noMigration) throw new Error('no such table: DeclarationDelivery'); return db.dels.length; },
    create: async ({ data }: any) => { const row = { id: `dl${++db.seq}`, attempts: 0, ...data }; db.dels.push(row); return row; },
    updateMany: async ({ where, data }: any) => { const rs = db.dels.filter((r) => match(r, where)); rs.forEach((r) => { const { attempts, ...rest } = data; Object.assign(r, rest); if (attempts?.increment) r.attempts += attempts.increment; }); return { count: rs.length }; },
  };
  const attachment = {
    create: async ({ data }: any) => { const row = { id: `a${++db.seq}`, uploadedAt: new Date(), ...data }; db.atts.push(row); return row; },
    count: async ({ where }: any) => db.atts.filter((r) => match(r, where)).length,
    findMany: async ({ where }: any) => db.atts.filter((r) => match(r, where)),
    findFirst: async ({ where }: any) => db.atts.find((r) => match(r, where)) ?? null,
  };
  const user = { findUnique: async ({ where }: any) => db.users.find((x) => x.id === where.id) ?? null };
  const establishment = {
    findFirst: async ({ where }: any) => db.ests.find((e) => match(e, where)) ?? null,
    findUnique: async ({ where }: any) => db.ests.find((e) => e.id === where.id) ?? null,
    create: async ({ data }: any) => { const e = { id: `sys${++db.seq}`, ...data }; db.ests.push(e); return e; },
  };
  const kase = {
    findUnique: async ({ where }: any) => db.cases.find((c) => c.declarationId === where.declarationId) ?? null,
    create: async ({ data }: any) => { const c = { id: `c${++db.seq}`, ...data }; db.cases.push(c); return c; },
    update: async ({ where, data }: any) => Object.assign(db.cases.find((c) => c.declarationId === where.declarationId), data),
  };
  const externalSubmission = { findMany: async ({ where }: any) => db.subs.filter((x) => (where.id ? where.id.in.includes(x.id) : where.authorUserId.in.includes(x.authorUserId) && x.createdAt >= where.createdAt.gte)) };
  const anyMatch = (r: any, w: any = {}): boolean => Object.entries(w).every(([k, v]: [string, any]) => {
    if (k === 'OR') return v.some((x: any) => anyMatch(r, x));
    return (r[k] ?? null) === v;
  });
  const tbl = (rows: any[], pfx: string) => ({
    findMany: async ({ where }: any = {}) => rows.filter((r) => anyMatch(r, where)),
    findFirst: async ({ where }: any = {}) => rows.find((r) => anyMatch(r, where)) ?? null,
    update: async ({ where, data }: any) => Object.assign(rows.find((r) => r.id === where.id), data),
    delete: async ({ where }: any) => { const i = rows.findIndex((r) => r.id === where.id); return rows.splice(i, 1)[0]; },
    create: async ({ data }: any) => { const r = { id: `${pfx}${++db.seq}`, status: 'PENDING', createdAt: new Date(), ...data }; rows.push(r); return r; },
  });
  const userPreference = {
    findUnique: async ({ where }: any) => db.prefs.find((x) => x.userId === where.userId) ?? null,
    upsert: async ({ where, create, update }: any) => {
      const cur = db.prefs.find((x) => x.userId === where.userId);
      if (cur) { Object.assign(cur, update); return cur; }
      db.prefs.push({ ...create }); return create;
    },
  };
  return { prisma: { user, declaration, declarationDelivery, attachment, establishment, externalSubmission, case: kase, userPreference, dashboardPatient: tbl(db.pats, 'p'), chatConnection: tbl(db.conns, 'cc'),
    userEstablishment: {
      findFirst: async ({ where }: any) => { const u = db.users.find((x) => x.id === where.userId); return u?.affiliations.find((a: any) => a.establishmentId === where.establishmentId) ?? null; },
      findMany: async ({ where }: any) => db.users
        .flatMap((u) => u.affiliations.filter((a: any) => (where.establishmentId?.in ? where.establishmentId.in.includes(a.establishmentId) : a.establishmentId === where.establishmentId) && a.status === where.status).map((a: any) => ({ ...a, userId: u.id, user: u })))
        .filter((x: any) => (!where.user?.role || (where.user.role.in ? where.user.role.in.includes(x.user.role) : x.user.role === where.user.role)) && !x.user.deactivatedAt),
    },
    permissionGrant: { findMany: async () => [] } } };
});
import { createApp } from '../src/app';
import { signSessionToken } from '../src/lib/jwt';
import { storeEncrypted, readDecrypted, storageRoot } from '../src/services/attachmentStore';
import { linkPatientAccount } from '../src/services/careLinks';

let server: ReturnType<ReturnType<typeof createApp>['listen']>; let base: string;
beforeAll(() => { server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(() => { server.close(); });
const ck = (id: string) => `vg_session=${signSessionToken({ userId: id })}`;
const aff = (id: string) => [{ establishmentId: id, status: 'ACTIVE', isActiveContext: true, memberRole: 'MEMBER', departmentId: null }];
const call = (method: string, p: string, as: string, body?: unknown) =>
  fetch(`${base}/api${p}`, { method, headers: { 'Content-Type': 'application/json', Cookie: ck(as) }, body: body === undefined ? undefined : JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, json: (await r.json().catch(() => null)) as any }));
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('SECRET-CONTENT-42'), Buffer.alloc(40, 1)]);
const upload = (id: string, name: string, as = 'alice', note?: string) =>
  fetch(`${base}/api/records/${id}/attachments`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(name), ...(note ? { 'X-File-Note': encodeURIComponent(note) } : {}), Cookie: ck(as) }, body: PDF as any })
    .then(async (r) => ({ status: r.status, json: (await r.json()) as any }));
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const cnpmMails = () => mail.sent.filter((m) => m.to === 'cnpm@example.org');
const reviewerMails = () => mail.sent.filter((m) => m.to !== 'cnpm@example.org');

const INCIDENT = {
  kind: 'INCIDENT', productType: 'dispositif', productName: 'Pompe perfusion X', productRef: 'cat-1', manufacturerName: 'Fab SA', manufacturerReference: 'REF-9',
  serial: 'SN-77', nature: 'anomalie', onsetDate: '2026-10-01', circumstances: 'Pendant la nuit', description: 'La pompe a délivré un débit erroné.',
  severity: 'moderee', personConcerned: 'oui', consequences: 'Surveillance renforcée', measures: ['arrete', 'soins'],
  person: { label: 'A.B.', age: '54', sex: 'F', service: 'Réanimation', evolution: 'retabli' },
  destinations: ['CNPM', 'ORG'], attachmentNames: [] as string[],
};

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-att-'));
beforeEach(() => {
  for (const a of [db.users, db.decls, db.dels, db.atts, db.ests, db.subs, db.cases, db.prefs, db.pats, db.conns, audit.calls]) a.length = 0;
  audit.reply = null;
  mail.sent.length = 0; mail.on = true; mail.fail = false;
  process.env.CNPM_NOTIFY_EMAIL = 'cnpm@example.org'; process.env.STORAGE_DIR = TMP;
  process.env.ATTACHMENT_ENC_KEY = 'a'.repeat(64);
  db.ests.push({ id: 'E1', name: 'Hôpital Un', isSystemReserved: false }, { id: 'E2', name: 'Clinique Deux', isSystemReserved: false });
  db.users.push(
    { id: 'alice', email: 'a@x.dz', displayName: 'Alice', role: 'DOCTOR', deactivatedAt: null, affiliations: aff('E1') },
    { id: 'bob', email: 'b@x.dz', displayName: 'Bob', role: 'VIGILANCE_REVIEWER', deactivatedAt: null, affiliations: aff('E1') },
    { id: 'carol', email: 'c@x.dz', displayName: 'Carol', role: 'VIGILANCE_REVIEWER', deactivatedAt: null, affiliations: aff('E2') },
    { id: 'dan', email: 'd@x.dz', displayName: 'Dan', role: 'DOCTOR', deactivatedAt: null, affiliations: [] },
  );
});
afterAll(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

describe('INCIDENT : validation', () => {
  it('sans destination : refusé', async () => {
    const { destinations, ...rest } = INCIDENT;
    expect((await call('POST', '/records', 'alice', rest)).status).toBe(400);
  });
  it('destination inconnue : refusé', async () => {
    expect((await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['AUDIT'] })).status).toBe(400);
  });
  it('patient concerné : initiales, âge, sexe et évolution obligatoires (service facultatif)', async () => {
    for (const person of [
      { ...INCIDENT.person, label: '' }, { ...INCIDENT.person, label: 'Mohamed Benali' }, { ...INCIDENT.person, age: '' },
      { ...INCIDENT.person, age: '130' }, { ...INCIDENT.person, sex: '' }, { ...INCIDENT.person, evolution: '' },
    ]) {
      const r = await call('POST', '/records', 'alice', { ...INCIDENT, person, destinations: ['ORG'] });
      expect(r.status).toBe(400);
    }
    expect((await call('POST', '/records', 'alice', { ...INCIDENT, person: undefined, destinations: ['ORG'] })).status).toBe(400);
    const ok = await call('POST', '/records', 'alice', { ...INCIDENT, person: { ...INCIDENT.person, service: undefined }, destinations: ['ORG'] });
    expect(ok.status).toBe(201);
  });

  it('« aucune personne » : les champs personne ne sont PAS conservés', async () => {
    const r = await call('POST', '/records', 'alice', { ...INCIDENT, personConcerned: 'non', destinations: ['ORG'] });
    expect(r.status).toBe(201);
    expect(JSON.stringify(db.decls[0].payload)).not.toContain('person.');
    expect(JSON.stringify(db.decls[0].payload)).not.toContain('A.B.');
  });
  it('un patient ne peut pas créer un incident', async () => {
    db.users.push({ id: 'pat', email: 'p@x.dz', displayName: 'P', role: 'PATIENT', deactivatedAt: null, affiliations: [] });
    expect((await call('POST', '/records', 'pat', INCIDENT)).status).toBe(400);
  });
});

describe('destinations et e-mail CNPM construit depuis l\'enregistrement', () => {
  it('CNPM + ORG : deux lignes, e-mail complet (personne, mesures, série), état SENT', async () => {
    const r = await call('POST', '/records', 'alice', INCIDENT);
    expect(r.status).toBe(201);
    await tick();
    expect(cnpmMails()).toHaveLength(1);
    const t = cnpmMails()[0].text;
    for (const x of ['Pompe perfusion X', 'A.B.', '54', 'Réanimation', 'SN-77', 'Utilisation arrêtée', 'Soins ou prise en charge', 'Pendant la nuit', 'Anomalie observée', 'Rétabli / guéri', 'REF-9']) expect(t).toContain(x);
    expect(db.dels.map((d) => `${d.destination}:${d.status}`).sort()).toEqual(['CNPM:SENT', 'ORG:AVAILABLE']);
    expect(r.json.record.transmitted).toBe(false);
  });
  it('ORG seul : aucun e-mail au CNPM, aucune ligne CNPM', async () => {
    await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['ORG'] });
    await tick();
    expect(cnpmMails()).toHaveLength(0);
    expect(db.dels.map((d) => d.destination)).toEqual(['ORG']);
  });
  it('ORG : les responsables vigilance de l\'établissement (et eux seuls) sont avertis, sans donnée patient', async () => {
    await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['ORG'] });
    await tick();
    const m = reviewerMails();
    expect(m.map((x) => x.to)).toEqual(['b@x.dz']); // bob (E1) ; pas carol (E2), pas les médecins
    expect(m[0].subject).toContain('Pompe perfusion X');
    expect(m[0].text).toContain('Hôpital Un');
    expect(m[0].text).toContain('Alice');
    for (const secret of ['A.B.', 'Réanimation', '54']) expect(m[0].text).not.toContain(secret);
  });
  it('CNPM seul : aucun responsable vigilance n\'est averti', async () => {
    await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['CNPM'] });
    await tick();
    expect(reviewerMails()).toHaveLength(0);
  });
  it('résumé de la file : compte les dossiers à traiter du responsable de l\'établissement uniquement', async () => {
    await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['ORG'] });
    await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['CNPM'] });
    const bob = await call('GET', '/records/queue/summary', 'bob');
    expect(bob.status).toBe(200);
    expect(bob.json).toMatchObject({ pending: 1, latest: { label: 'Pompe perfusion X' } });
    expect((await call('GET', '/records/queue/summary', 'carol')).json.pending).toBe(0); // autre établissement
    expect((await call('GET', '/records/queue/summary', 'alice')).json.pending).toBe(0); // un médecin ne traite pas la file
    // …et ne LIT pas non plus la file de l'établissement (GET /records/queue) : seulement ses propres déclarations.
    const aliceQueue = await call('GET', '/records/queue', 'alice');
    expect(aliceQueue.status).toBe(200);
    expect(aliceQueue.json.records).toEqual([]);
    expect((await call('GET', '/records/queue', 'bob')).json.records).toHaveLength(1); // le responsable vigilance, lui, la voit (1 seule déclaration a choisi « Mon organisation »)
  });
  it('administrateur de l\'établissement : reçoit la déclaration (file, résumé, e-mail), sans les données du patient', async () => {
    db.users.push({ id: 'olga', email: 'o@x.dz', displayName: 'Olga Admin', role: 'ORG_ADMIN', deactivatedAt: null, affiliations: aff('E1') });
    const r = await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['ORG'] });
    await tick();
    expect(reviewerMails().map((x) => x.to).sort()).toEqual(['b@x.dz', 'o@x.dz']);
    expect((await call('GET', '/records/queue/summary', 'olga')).json.pending).toBe(1);
    const q = await call('GET', '/records/queue', 'olga');
    expect(q.json.records.map((x: any) => x.id)).toEqual([r.json.record.id]);
    expect(JSON.stringify(q.json.records[0].fields)).not.toContain('A.B.');
    // Suivi en lecture seule : la prise en charge et la clôture relèvent du responsable vigilance.
    expect(q.json.records[0].permissions).toMatchObject({ review: false, close: false });
    expect((await call('POST', `/records/${r.json.record.id}/review`, 'olga')).status).not.toBe(200);
  });
  it('transmission au fabricant : intention enregistrée et état RÉEL de l\'envoi visible par l\'établissement', async () => {
    const r = await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['ORG'], informManufacturer: true });
    const id = r.json.record.id;
    expect(db.decls[0].payload.find((x: any) => x.key === 'informManufacturer')?.value).toBe(true);
    db.subs.push({ id: 'sub-1', status: 'RECEIVED' });
    db.dels.push({ id: 'sub-1', declarationId: id, destination: 'MANUFACTURER', status: 'PENDING', attempts: 0 });
    const g = await call('GET', `/records/${id}`, 'bob');
    expect(g.json.record.deliveries).toEqual(expect.arrayContaining([expect.objectContaining({ destination: 'MANUFACTURER', status: 'RECEIVED' }), { destination: 'ORG', status: 'AVAILABLE' }]));
    const q = await call('GET', '/records/queue', 'bob');
    expect(q.json.records[0].deliveries).toEqual(expect.arrayContaining([expect.objectContaining({ destination: 'MANUFACTURER', status: 'RECEIVED' })]));
  });
  it('déclaration antérieure au lien : l\'envoi du même auteur sur le même produit (≤ 10 min) est retrouvé et lié', async () => {
    const r = await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['ORG'] });
    const id = r.json.record.id;
    db.subs.push(
      { id: 'sub-other', authorUserId: 'alice', status: 'RECEIVED', payload: { productRef: 'autre' }, createdAt: new Date() },
      { id: 'sub-ok', authorUserId: 'alice', status: 'RECEIVED', payload: { productRef: 'cat-1' }, createdAt: new Date(Date.now() + 2000) },
      { id: 'sub-carol', authorUserId: 'carol', status: 'RECEIVED', payload: { productRef: 'cat-1' }, createdAt: new Date() },
    );
    const g = await call('GET', `/records/${id}`, 'bob');
    expect(g.json.record.deliveries.filter((x: any) => x.destination === 'MANUFACTURER')).toEqual([expect.objectContaining({ destination: 'MANUFACTURER', status: 'RECEIVED' })]);
    expect(db.dels.filter((x) => x.destination === 'MANUFACTURER').map((x) => x.id)).toEqual(['sub-ok']); // lien enregistré
  });
  it('mesures internes : le responsable vigilance les enregistre ; ni l\'admin ni le déclarant ; la déclaration n\'est plus « nouvelle »', async () => {
    db.users.push({ id: 'olga', email: 'o@x.dz', displayName: 'Olga Admin', role: 'ORG_ADMIN', deactivatedAt: null, affiliations: aff('E1') });
    const r = await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['ORG'] });
    const id = r.json.record.id;
    expect((await call('GET', '/records/queue/summary', 'bob')).json.pending).toBe(1);
    expect((await call('POST', `/records/${id}/measures`, 'olga', { measures: ['quarantaine'] })).status).toBe(403);
    expect((await call('POST', `/records/${id}/measures`, 'alice', { measures: ['quarantaine'] })).status).toBe(403);
    expect((await call('POST', `/records/${id}/measures`, 'carol', { measures: ['quarantaine'] })).status).toBe(404); // autre établissement
    expect((await call('POST', `/records/${id}/measures`, 'bob', { measures: ['inconnue'] })).status).toBe(400);
    expect((await call('POST', `/records/${id}/measures`, 'bob', { measures: ['aucune', 'quarantaine'] })).status).toBe(400);
    const ok = await call('POST', `/records/${id}/measures`, 'bob', { measures: ['quarantaine', 'equipes_informees'], note: 'Lot isolé en pharmacie' });
    expect(ok.status).toBe(200);
    expect(ok.json.record.measures).toEqual([{ measures: ['quarantaine', 'equipes_informees'], note: 'Lot isolé en pharmacie', byName: 'Bob', at: expect.any(String) }]);
    expect(ok.json.record.status).toBe('SUBMITTED'); // la déclaration elle-même n'est pas modifiée
    expect((await call('GET', '/records/queue/summary', 'bob')).json.pending).toBe(0);
    const seenByAdmin = await call('GET', `/records/${id}`, 'olga');
    expect(seenByAdmin.json.record.measures).toHaveLength(1);
    expect(seenByAdmin.json.record.permissions.measures).toBe(false);
  });
  it('établissement sans responsable vigilance : l\'administrateur enregistre lui-même les mesures internes', async () => {
    db.users.push({ id: 'olga', email: 'o@x.dz', displayName: 'Olga Admin', role: 'ORG_ADMIN', deactivatedAt: null, affiliations: aff('E1') });
    const r = await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['ORG'] });
    const id = r.json.record.id;
    expect((await call('GET', `/records/${id}`, 'olga')).json.record.permissions.measures).toBe(false); // bob (responsable vigilance) est là
    db.users.find((u) => u.id === 'bob').role = 'DOCTOR'; // plus de responsable vigilance dans E1
    expect((await call('GET', `/records/${id}`, 'olga')).json.record.permissions.measures).toBe(true);
    const ok = await call('POST', `/records/${id}/measures`, 'olga', { measures: ['quarantaine'] });
    expect(ok.status).toBe(200);
    expect(ok.json.record.measures[0]).toMatchObject({ measures: ['quarantaine'], byName: 'Olga Admin' });
    expect(JSON.stringify(ok.json.record.fields)).not.toContain('A.B.'); // toujours sans données du patient
  });
  it('enquête du fabricant : état lu chez Audit (en cours, clôturée) et notifié à l\'établissement', async () => {
    const r = await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['ORG'], informManufacturer: true });
    const id = r.json.record.id;
    db.subs.push({ id: 'sub-9', authorUserId: 'alice', status: 'RECEIVED', auditDeclarationId: 'AUD-9', payload: { productRef: 'cat-1' }, createdAt: new Date() });
    db.dels.push({ id: 'sub-9', declarationId: id, destination: 'MANUFACTURER', status: 'PENDING', attempts: 0, updatedAt: new Date(0) });
    audit.reply = { kind: 'http', status: 200, data: { status: 'UNDER_REVIEW', awaitingReporterInformation: false } };
    let g = await call('GET', `/records/${id}`, 'bob');
    expect(g.json.record.deliveries.find((x: any) => x.destination === 'MANUFACTURER').status).toBe('UNDER_REVIEW');
    expect(audit.calls[0]).toMatchObject({ method: 'GET', path: '/nexus/v1/declarations/AUD-9', scope: 'intake:read', reporterRef: 'alice' });
    audit.reply = { kind: 'http', status: 200, data: { status: 'CLOSED' } };
    g = await call('GET', `/records/${id}`, 'bob');
    expect(g.json.record.deliveries.find((x: any) => x.destination === 'MANUFACTURER').status).toBe('CLOSED');
    const sum = await call('GET', '/records/queue/summary', 'bob');
    expect(sum.json.closed).toMatchObject({ id, label: 'Pompe perfusion X', count: 1 });
  });
  it('signal : autres déclarations du même produit et du même lot dans l\'établissement', async () => {
    const MED = { ...INCIDENT, productType: 'medicament', serial: undefined, lot: 'L-1', productRef: 'cat-1', destinations: ['ORG'] };
    await call('POST', '/records', 'alice', MED);
    await call('POST', '/records', 'alice', { ...MED, clientRequestId: undefined });
    await call('POST', '/records', 'alice', { ...MED, lot: 'L-2' });
    const q = await call('GET', '/records/queue', 'bob');
    const sig = q.json.records.map((x: any) => x.signal);
    expect(sig.filter((x: any) => x.sameLot === 2)).toHaveLength(2);
    expect(sig.every((x: any) => x.sameProduct === 3)).toBe(true);
  });
  it('lu / non lu : la pastille disparaît quand l\'utilisateur voit la liste ou ouvre la déclaration ; une nouvelle arrivée la ramène', async () => {
    const a = await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['ORG'] });
    await tick(5);
    await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['ORG'], productName: 'Autre' });
    expect((await call('GET', '/records/queue/summary', 'bob')).json.unread).toBe(2);
    expect((await call('POST', '/records/queue/seen', 'bob', { id: a.json.record.id })).status).toBe(200);
    expect((await call('GET', '/records/queue/summary', 'bob')).json.unread).toBe(1);
    await call('POST', '/records/queue/seen', 'bob', {});
    const s1 = (await call('GET', '/records/queue/summary', 'bob')).json;
    expect(s1.unread).toBe(0);
    expect(s1.pending).toBe(2); // « nouvelles » (sans mesure) reste un état de travail, distinct du « lu »
    await tick(5);
    await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['ORG'], productName: 'Troisième' });
    expect((await call('GET', '/records/queue/summary', 'bob')).json.unread).toBe(1);
    db.users.push({ id: 'olga', email: 'o@x.dz', displayName: 'Olga', role: 'ORG_ADMIN', deactivatedAt: null, affiliations: aff('E1') });
    expect((await call('GET', '/records/queue/summary', 'olga')).json.unread).toBe(3); // l'état de lecture est propre à chaque utilisateur
  });
  it('la file ne mélange pas les fiches du module « vigilance » des tableaux de bord (payload objet)', async () => {
    db.decls.push({ id: 'legacy1', authorUserId: 'alice', establishmentId: 'E1', departmentId: null, status: 'SUBMITTED', domain: 'MATERIOVIGILANCE',
      createdAt: new Date(), updatedAt: new Date(), case: null, payload: { kind: 'dr', record: { product: 'X', manualPatientName: 'Nom Complet' } } });
    const q = await call('GET', '/records/queue', 'bob');
    expect(q.json.records.map((x: any) => x.id)).not.toContain('legacy1');
    expect((await call('GET', '/records/queue/summary', 'bob')).json.pending).toBe(0);
    expect((await call('GET', '/records/legacy1', 'bob')).status).toBe(404);
  });
  it('CNPM non configuré : état NOT_CONFIGURED (jamais « envoyé »), renvoi possible ensuite', async () => {
    mail.on = false;
    const r = await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['CNPM'] });
    expect(r.json.record.deliveries).toEqual([{ destination: 'CNPM', status: 'NOT_CONFIGURED', lastError: expect.any(String) }]);
    expect((await call('POST', `/records/${r.json.record.id}/resend-cnpm`, 'alice')).status).toBe(503);
    mail.on = true;
    const again = await call('POST', `/records/${r.json.record.id}/resend-cnpm`, 'alice');
    expect(again.status).toBe(200);
    expect(db.dels[0].status).toBe('SENT');
    expect(mail.sent).toHaveLength(1);
  });
  it('échec SMTP : état FAILED ; on ne renvoie pas un e-mail déjà SENT', async () => {
    mail.fail = true;
    const r = await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['CNPM'] });
    await tick();
    expect(db.dels[0].status).toBe('FAILED');
    mail.fail = false;
    expect((await call('POST', `/records/${r.json.record.id}/resend-cnpm`, 'alice')).status).toBe(200);
    expect((await call('POST', `/records/${r.json.record.id}/resend-cnpm`, 'alice')).status).toBe(409);
  });
  it('panne avec exposition : acceptée seulement avec destinations explicites ; refusée à l\'ancienne', async () => {
    const PANNE = { kind: 'INTERNAL_PANNE', description: 'Arrêt', device: { name: 'Respirateur', inventoryNumber: 'INV-12' },
      malfunction: { occurredOn: '2026-10-01', context: 'utilisation', deviceState: 'hors_service', impact: 'injury' } };
    expect((await call('POST', '/records', 'alice', { ...PANNE, destinations: ['ORG'] })).status).toBe(201);
    expect((await call('POST', '/records', 'alice', { ...PANNE, device: { name: 'R', serialNumber: 'S' } })).status).toBe(400);
    expect((await call('POST', '/records', 'alice', { ...PANNE, destinations: undefined })).status).toBe(400);
  });
  it('panne : un identifiant de l\'appareil est obligatoire (« aucun identifiant » refusé)', async () => {
    const PANNE = { kind: 'INTERNAL_PANNE', description: 'Arrêt', device: { name: 'Respirateur' }, noIdentifier: true, destinations: ['ORG'],
      malfunction: { occurredOn: '2026-10-01', context: 'utilisation', deviceState: 'hors_service', impact: 'none' } };
    expect((await call('POST', '/records', 'alice', PANNE)).status).toBe(400);
  });
});

describe('identification et produit hors catalogue', () => {
  const MED = { ...INCIDENT, productType: 'medicament', productName: 'Doliprane 1g', serial: undefined, lot: 'L-2026-01', person: undefined, personConcerned: 'non' };
  it('lot obligatoire hors dispositif ; « lot inconnu » ne suffit plus', async () => {
    expect((await call('POST', '/records', 'alice', { ...MED, lot: undefined, lotUnknown: true })).status).toBe(400);
    expect((await call('POST', '/records', 'alice', MED)).status).toBe(201);
  });
  it('dispositif : n° de série ou UDI obligatoire', async () => {
    expect((await call('POST', '/records', 'alice', { ...INCIDENT, serial: undefined, idUnknown: true })).status).toBe(400);
    expect((await call('POST', '/records', 'alice', { ...INCIDENT, serial: undefined, udi: '(01)0123' })).status).toBe(201);
  });
  it('produit hors catalogue : CNPM uniquement (organisation refusée), enregistré comme « manual »', async () => {
    const off = { ...MED, productRef: undefined };
    expect((await call('POST', '/records', 'alice', { ...off, destinations: ['ORG'] })).status).toBe(400);
    expect((await call('POST', '/records', 'alice', { ...off, destinations: ['CNPM', 'ORG'] })).status).toBe(400);
    const r = await call('POST', '/records', 'alice', { ...off, destinations: ['CNPM'] });
    expect(r.status).toBe(201);
  });
});

describe('isolation par organisation', () => {
  it('ORG choisi : visible pour le responsable de MON établissement, invisible pour un autre établissement', async () => {
    const r = await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['ORG'] });
    const id = r.json.record.id;
    expect((await call('GET', '/records/queue', 'bob')).json.records.map((x: any) => x.id)).toContain(id);
    expect((await call('GET', `/records/${id}`, 'bob')).status).toBe(200);
    expect((await call('GET', '/records/queue', 'carol')).json.records).toHaveLength(0);
    expect((await call('GET', `/records/${id}`, 'carol')).status).toBe(404);
  });
  it('CNPM seul : invisible de la file de l\'organisation, même pour son responsable', async () => {
    const r = await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['CNPM'] });
    const id = r.json.record.id;
    expect((await call('GET', '/records/queue', 'bob')).json.records).toHaveLength(0);
    expect((await call('GET', `/records/${id}`, 'bob')).status).toBe(404);
    expect((await call('POST', `/records/${id}/review`, 'bob')).status).toBe(404);
    expect((await call('GET', `/records/${id}`, 'alice')).status).toBe(200);
  });
  it('ORG demandé sans établissement actif : 409, rien n\'est créé', async () => {
    const r = await call('POST', '/records', 'dan', INCIDENT);
    expect(r.status).toBe(409);
    expect(db.decls).toHaveLength(0);
  });
  it('CNPM seul sans établissement : possible (établissement réservé)', async () => {
    expect((await call('POST', '/records', 'dan', { ...INCIDENT, destinations: ['CNPM'] })).status).toBe(201);
  });
  it('les données de personne sont masquées pour un lecteur autre que l\'auteur', async () => {
    const r = await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['ORG'] });
    const asBob = await call('GET', `/records/${r.json.record.id}`, 'bob');
    expect(JSON.stringify(asBob.json.record.fields)).not.toContain('A.B.');
    const asAlice = await call('GET', `/records/${r.json.record.id}`, 'alice');
    expect(JSON.stringify(asAlice.json.record.fields)).toContain('A.B.');
  });
});

describe('pièces jointes : stockage chiffré réel', () => {
  it('conservée chiffrée sur disque (aucun clair), relisible et téléchargeable par l\'auteur et par l\'organisation', async () => {
    const r = await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['ORG'], attachmentNames: ['rapport.pdf'] });
    const id = r.json.record.id;
    const up = await upload(id, 'rapport.pdf', 'alice', 'Photo de la pompe');
    expect(up.status).toBe(200); expect(up.json.stored).toBe(true); expect(up.json.mail).toBeNull();
    const onDisk = fs.readFileSync(path.join(storageRoot(), db.atts[0].storagePath));
    expect(onDisk.includes(Buffer.from('SECRET-CONTENT-42'))).toBe(false);
    const list = await call('GET', `/records/${id}/attachments`, 'bob');
    expect(list.json.attachments).toEqual([{ id: db.atts[0].id, name: 'rapport.pdf', mime: 'application/pdf', size: PDF.length, note: 'Photo de la pompe' }]);
    const dl = await fetch(`${base}/api/records/${id}/attachments/${db.atts[0].id}`, { headers: { Cookie: ck('bob') } });
    expect(dl.status).toBe(200);
    expect(Buffer.from(await dl.arrayBuffer()).equals(PDF)).toBe(true);
    expect(dl.headers.get('x-content-type-options')).toBe('nosniff');
    // autre organisation : 404 ; non-auteur ne peut pas ajouter
    expect((await call('GET', `/records/${id}/attachments`, 'carol')).status).toBe(404);
    expect((await upload(id, 'x.pdf', 'bob')).status).toBe(404);
  });
  it('CNPM + conservation : le fichier part dans l\'UNIQUE e-mail ET est conservé ; état SENT', async () => {
    const r = await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['CNPM'], attachmentNames: ['rapport.pdf'] });
    await tick();
    expect(mail.sent).toHaveLength(0);
    const up = await upload(r.json.record.id, 'rapport.pdf');
    expect(up.json).toMatchObject({ success: true, stored: true, mail: 'sent' });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].attachments[0].filename).toBe('rapport.pdf');
    await tick();
    expect(db.dels[0].status).toBe('SENT');
  });
  it('conservation désactivée + ORG seul : la pièce est REFUSÉE honnêtement (503), rien n\'est simulé', async () => {
    delete process.env.ATTACHMENT_ENC_KEY;
    const r = await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['ORG'] });
    const up = await upload(r.json.record.id, 'rapport.pdf');
    expect(up.status).toBe(503); expect(up.json.success).toBe(false); expect(up.json.stored).toBe(false);
    expect(db.atts).toHaveLength(0);
  });
  it('conservation désactivée + CNPM : seule la voie e-mail est annoncée', async () => {
    delete process.env.ATTACHMENT_ENC_KEY;
    const r = await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['CNPM'], attachmentNames: ['a.pdf'] });
    const up = await upload(r.json.record.id, 'a.pdf');
    expect(up.json).toMatchObject({ success: true, stored: false, mail: 'sent' });
    expect(db.atts).toHaveLength(0);
  });
  it('renvoi : les pièces conservées sont rejointes à l\'e-mail', async () => {
    const r = await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['CNPM'], attachmentNames: ['a.pdf'] });
    mail.fail = true;
    await upload(r.json.record.id, 'a.pdf');
    await tick();
    expect(db.dels[0].status).toBe('FAILED');
    mail.fail = false; mail.sent.length = 0;
    expect((await call('POST', `/records/${r.json.record.id}/resend-cnpm`, 'alice')).status).toBe(200);
    expect(mail.sent[0].attachments[0].content.equals(PDF)).toBe(true);
  });
  it('format refusé / contenu incohérent', async () => {
    const r = await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['ORG'] });
    expect((await upload(r.json.record.id, 'virus.exe')).status).toBe(400);
  });
});

describe('attachmentStore', () => {
  it('aller-retour, et un fichier altéré est rejeté (GCM)', async () => {
    process.env.ATTACHMENT_ENC_KEY = Buffer.alloc(32, 7).toString('base64');
    const f = await storeEncrypted(Buffer.from('hello'));
    expect((await readDecrypted(f.storagePath)).toString()).toBe('hello');
    const p = path.join(storageRoot(), f.storagePath); const b = fs.readFileSync(p); b[b.length - 1] ^= 1; fs.writeFileSync(p, b);
    await expect(readDecrypted(f.storagePath)).rejects.toThrow();
  });
  it('clé absente ou invalide : écriture refusée, rien sur disque', async () => {
    process.env.ATTACHMENT_ENC_KEY = 'trop-court';
    await expect(storeEncrypted(Buffer.from('x'))).rejects.toThrow('STORAGE_DISABLED');
  });
  it('chemin hors dossier refusé', async () => {
    process.env.ATTACHMENT_ENC_KEY = 'b'.repeat(64);
    await expect(readDecrypted('../../etc/passwd')).rejects.toThrow('BAD_PATH');
  });
});

describe('GET /api/declarations/destinations', () => {
  it('dit la vérité sur chaque destination', async () => {
    const r = await call('GET', '/declarations/destinations', 'alice');
    expect(r.status).toBe(200);
    expect(r.json.destinations).toMatchObject({ cnpm: true, org: { id: 'E1', name: 'Hôpital Un' }, storage: true });
    mail.on = false;
    expect((await call('GET', '/declarations/destinations', 'alice')).json.destinations.cnpm).toBe(false);
    expect((await call('GET', '/declarations/destinations', 'dan')).json.destinations.org).toBeNull();
  });
});

describe('déclaration PATIENT', () => {
  const PAT = { kind: 'PATIENT', productType: 'medicament', productName: 'Doliprane', onsetDate: '2026-10-01', severity: 'legere', symptoms: ['Nausées'], productStopped: 'stopped', dechallenge: 'resolved' };
  beforeEach(() => { db.users.push({ id: 'pat', email: 'p@x.dz', displayName: 'Pat', role: 'PATIENT', deactivatedAt: null, affiliations: [] }); });
  it('arrêt et disparition sont des champs distincts (productStopped / dechallenge)', async () => {
    const r = await call('POST', '/records', 'pat', PAT);
    expect(r.status).toBe(201);
    const keys = db.decls[0].payload.map((x: any) => `${x.key}=${x.value}`);
    expect(keys).toContain('productStopped=stopped'); expect(keys).toContain('dechallenge=resolved');
  });
  it('sa pièce jointe est conservée chiffrée, JAMAIS envoyée par e-mail, invisible des autres', async () => {
    const r = await call('POST', '/records', 'pat', PAT);
    const up = await upload(r.json.record.id, 'photo.pdf', 'pat');
    expect(up.json).toMatchObject({ success: true, stored: true, mail: null });
    await tick();
    expect(mail.sent).toHaveLength(0);
    expect((await call('GET', `/records/${r.json.record.id}/attachments`, 'bob')).status).toBe(404);
    expect((await call('GET', `/records/${r.json.record.id}/attachments`, 'pat')).json.attachments).toHaveLength(1);
  });
  it('sans conservation : refus honnête, toujours pas d\'e-mail', async () => {
    delete process.env.ATTACHMENT_ENC_KEY;
    const r = await call('POST', '/records', 'pat', PAT);
    const up = await upload(r.json.record.id, 'photo.pdf', 'pat');
    expect(up.status).toBe(503);
    expect(mail.sent).toHaveLength(0);
  });
});

describe('lien médecin ↔ patient et partage des déclarations patient', () => {
  const PAT_DECL = { kind: 'PATIENT', productType: 'medicament', productName: 'Doliprane 1g', onsetDate: '2026-10-01', severity: 'legere', symptomDesc: 'Nausées depuis 2 jours (Karim B.)' };
  beforeEach(() => {
    db.users.push(
      { id: 'pat', email: 'karim@x.dz', displayName: 'Karim', role: 'PATIENT', deactivatedAt: null, affiliations: [] },
      { id: 'doc', email: 'doc@x.dz', displayName: 'Dr. Benali', role: 'DOCTOR', deactivatedAt: null, affiliations: aff('E1') },
    );
    // Dossier créé par le médecin AVANT que le patient n'ait un compte : non lié.
    db.pats.push({ id: 'dp1', ownerUserId: 'doc', establishmentId: 'E1', archivedAt: null, createdAt: new Date(), payload: { name: 'Karim B', email: 'Karim@X.dz' } });
  });
  it('inscription du patient : le dossier du médecin est lié et une demande de contact est créée (une seule fois)', async () => {
    expect(await linkPatientAccount('pat', 'karim@x.dz')).toBe(1);
    expect(db.pats[0].payload.patientUserId).toBe('pat');
    expect(db.conns).toEqual([expect.objectContaining({ requesterId: 'doc', addresseeId: 'pat', status: 'PENDING' })]);
    expect(await linkPatientAccount('pat', 'karim@x.dz')).toBe(0);
    expect(db.conns).toHaveLength(1);
  });
  it('« Mes médecins » : accepter, partager une déclaration, le médecin la lit ; arrêter le partage retire l\'accès', async () => {
    await linkPatientAccount('pat', 'karim@x.dz');
    let d = await call('GET', '/care/doctors', 'pat');
    expect(d.json.doctors).toEqual([expect.objectContaining({ doctorId: 'doc', displayName: 'Dr. Benali', establishment: 'Hôpital Un', status: 'PENDING' })]);
    expect((await call('GET', '/care/doctors', 'doc')).status).toBe(403);
    // Pas encore accepté : partage refusé
    expect((await call('POST', '/records', 'pat', { ...PAT_DECL, shareWithDoctorIds: ['doc'] })).status).toBe(400);
    d = await call('POST', '/care/doctors/doc/accept', 'pat');
    expect(d.json.doctors[0].status).toBe('ACCEPTED');
    expect((await call('POST', '/records', 'pat', { ...PAT_DECL, shareWithDoctorIds: ['alice'] })).status).toBe(400); // médecin non accepté
    const r = await call('POST', '/records', 'pat', { ...PAT_DECL, shareWithDoctorIds: ['doc'] });
    expect(r.status).toBe(201);
    const list = await call('GET', '/records/from-patients', 'doc');
    expect(list.json.records).toHaveLength(1);
    expect(list.json.records[0]).toMatchObject({ kind: 'PATIENT', sharedWithMe: true });
    expect(list.json.records[0].fields.find((f: any) => f.key === 'symptomDesc').value).toContain('Nausées'); // consentement : visible du médecin
    expect((await call('GET', `/records/${r.json.record.id}`, 'doc')).status).toBe(200);
    expect((await call('GET', '/records/from-patients', 'alice')).json.records).toHaveLength(0);
    expect((await call('GET', `/records/${r.json.record.id}`, 'alice')).status).toBe(404);
    await call('POST', '/care/doctors/doc/decline', 'pat');
    expect(db.pats[0].payload.patientUserId).toBeUndefined();
    expect((await call('GET', '/records/from-patients', 'doc')).json.records).toHaveLength(0);
    expect((await call('GET', `/records/${r.json.record.id}`, 'doc')).status).toBe(404);
    expect(await linkPatientAccount('pat', 'karim@x.dz')).toBe(0); // un refus n'est pas annulé par une reconnexion
  });
});

describe('FOURNISSEUR (distributeur) : déclare un incident, ne voit que les siens', () => {
  const addSupplier = () => {
    db.ests.push({ id: 'E3', name: 'MedSupply Distribution', type: 'SUPPLIER', isSystemReserved: false });
    db.users.push({ id: 'fred', email: 'f@x.dz', displayName: 'Fred', role: 'FOURNISSEUR', deactivatedAt: null, affiliations: aff('E3') });
  };
  it('peut créer un incident (CNPM + son établissement)', async () => {
    addSupplier();
    const r = await call('POST', '/records', 'fred', INCIDENT);
    expect(r.status).toBe(201);
    expect(db.decls.at(-1)).toMatchObject({ authorUserId: 'fred', establishmentId: 'E3' });
  });
  it('lit sa propre déclaration, mais pas celle d\'un autre établissement', async () => {
    addSupplier();
    const mine = await call('POST', '/records', 'fred', INCIDENT);
    const theirs = await call('POST', '/records', 'alice', INCIDENT);
    expect((await call('GET', `/records/${mine.json.record.id}`, 'fred')).status).toBe(200);
    expect((await call('GET', `/records/${theirs.json.record.id}`, 'fred')).status).toBe(404);
  });
  it('n\'a pas la file de l\'établissement (réservée aux responsables) ni le droit de modifier', async () => {
    addSupplier();
    await call('POST', '/records', 'alice', { ...INCIDENT, destinations: ['ORG'] });
    expect((await call('GET', '/records/queue', 'fred')).json.records).toEqual([]);
  });
});
