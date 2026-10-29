/**
 * Organization accounts & membership: the three sign-up kinds, join request +
 * approval, and invitation. Prisma is replaced by a tiny in-memory fake.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'net';

const db = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.RL_AUTH_MAX = '1000'; // the sign-up rate limiter is per IP for the whole file; this suite signs up dozens of accounts
  return { users: [] as any[], est: [] as any[], mem: [] as any[], inv: [] as any[], dep: [] as any[], seq: 0 };
});

vi.mock('../src/lib/prisma', () => {
  const id = (p: string) => `${p}${++db.seq}`;
  const match = (row: any, where: any = {}): boolean =>
    Object.entries(where).every(([k, v]: [string, any]) => {
      if (k === 'OR') return v.some((w: any) => match(row, w));
      if (k === 'userId_establishmentId') return row.userId === v.userId && row.establishmentId === v.establishmentId;
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('in' in v) return v.in.includes(row[k]);
        if ('contains' in v) return String(row[k]).toLowerCase().includes(String(v.contains).toLowerCase());
        return true;
      }
      return row[k] === v;
    });
  const table = (rows: any[], defaults: (d: any) => any) => ({
    findMany: async ({ where }: any = {}) => rows.filter((r) => match(r, where)),
    findFirst: async ({ where }: any = {}) => rows.find((r) => match(r, where)) ?? null,
    findUnique: async ({ where }: any) => rows.find((r) => match(r, where)) ?? null,
    create: async ({ data }: any) => { const r = defaults(data); rows.push(r); return r; },
    update: async ({ where, data }: any) => Object.assign(rows.find((x) => match(x, where)), data),
    delete: async ({ where }: any) => rows.splice(rows.findIndex((x) => match(x, where)), 1)[0],
    count: async ({ where }: any = {}) => rows.filter((r) => match(r, where)).length,
  });
  const user = table(db.users, (d) => ({ id: id('u'), ...d }));
  const baseFind = user.findUnique;
  // attachUser asks for `include: { affiliations: true }`
  user.findUnique = async (args: any) => {
    const u = await baseFind(args);
    return u && args.include?.affiliations ? { ...u, affiliations: db.mem.filter((m) => m.userId === u.id).map((m) => ({ ...m, department: db.dep.find((d) => d.id === m.departmentId) ?? null })) } : u;
  };
  const memberships = table(db.mem, (d) => ({ id: id('m'), isActiveContext: false, status: 'ACTIVE', memberRole: 'MEMBER', initiatedBy: 'USER', createdAt: new Date(), ...d }));
  const baseMemFind = memberships.findMany;
  // the admin overview asks for `include: { user, department }`
  memberships.findMany = async (args: any = {}) => {
    const rows = await baseMemFind(args);
    return args.include
      ? rows.map((r: any) => ({ ...r, user: db.users.find((u) => u.id === r.userId), department: db.dep.find((d) => d.id === r.departmentId) ?? null }))
      : rows;
  };
  const prisma: any = {
    user,
    establishment: table(db.est, (d) => ({ id: id('e'), isSystemReserved: false, ...d })),
    userEstablishment: memberships,
    department: table(db.dep, (d) => ({ id: id('d'), ...d })),
    organizationInvitation: table(db.inv, (d) => ({ id: id('i'), status: 'PENDING', createdAt: new Date(), ...d })),
    $transaction: async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)),
  };
  return { prisma };
});

import { createApp } from '../src/app';
import { signSessionToken } from '../src/lib/jwt';

let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base: string;
beforeAll(() => { server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`; });
afterAll(() => { server.close(); });

const cookie = (userId: string) => `vg_session=${signSessionToken({ userId })}`;
async function call(method: string, path: string, body?: unknown, as?: string) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(as ? { Cookie: cookie(as) } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any };
}
const signup = (extra: object) =>
  call('POST', '/auth/signup', { name: 'N', email: `x${Math.random()}@x.dz`, password: 'longenough1', ...extra });

beforeEach(() => { db.users.length = db.est.length = db.mem.length = db.inv.length = db.dep.length = 0; });

describe('sign-up: three different account kinds', () => {
  it('healthcare org admin needs a healthcare organization type', async () => {
    expect((await signup({ role: 'org_admin', organizationName: 'Clinique X' })).status).toBe(400);
    expect((await signup({ role: 'org_admin', organizationName: 'Clinique X', organizationType: 'pharmacy' })).status).toBe(400);
    const ok = await signup({ role: 'org_admin', organizationName: 'Clinique X', organizationType: 'clinic' });
    expect(ok.status).toBe(201);
    expect(db.est[0]).toMatchObject({ name: 'Clinique X', type: 'CLINIQUE' });
    expect(db.users[0].role).toBe('ORG_ADMIN');
    expect(db.mem[0]).toMatchObject({ status: 'ACTIVE', memberRole: 'ADMIN' });
  });

  it('product provider is always a SUPPLIER, never a hospital by default', async () => {
    const r = await signup({ role: 'establishment_admin', organizationName: 'MedSupply', organizationType: 'hospital' });
    expect(r.status).toBe(201);
    expect(db.est[0].type).toBe('SUPPLIER');
    expect(db.users[0].role).toBe('ESTABLISHMENT_ADMIN');
  });

  it('a professional naming an organization only creates a PENDING request', async () => {
    await signup({ role: 'org_admin', organizationName: 'CHU Test', organizationType: 'hospital' });
    const r = await signup({ role: 'doctor', professionalStatus: 'organization', organizationType: 'hospital', organizationName: 'CHU Test', department: 'Cardiologie', profession: 'doctor' });
    expect(r.json.joinRequested).toBe(true);
    const row = db.mem.find((m) => m.userId === db.users[1].id);
    expect(row).toMatchObject({ status: 'PENDING', memberRole: 'MEMBER' });
    // a PENDING request grants nothing: the session shows no organization
    const s = await call('GET', '/auth/session', undefined, db.users[1].id);
    expect(s.json.user.activeEstablishmentId).toBeNull();
  });
});

describe('sign-up: profession, department and the chosen organization type are honoured by the server', () => {
  const org = (name: string, type: string) => signup({ role: 'org_admin', organizationName: name, organizationType: type });

  it('saves the profession on the account and the department on the join request, and shows both to the admin', async () => {
    await org('CHU Test', 'hospital');
    const r = await signup({ role: 'doctor', professionalStatus: 'organization', organizationType: 'hospital', organizationName: 'CHU Test', department: '  Cardiologie ', profession: 'chef_de_service' });
    expect(r.status).toBe(201);
    expect(db.users[1].profession).toBe('chef_de_service');
    expect(db.mem.find((m) => m.userId === db.users[1].id)).toMatchObject({ status: 'PENDING', requestedDepartment: 'Cardiologie' });
    const ov = await call('GET', `/orgs/${db.est[0].id}/overview`, undefined, db.users[0].id);
    expect(ov.json.requests[0]).toMatchObject({ profession: 'chef_de_service', requestedDepartment: 'Cardiologie' });
  });

  it('an independent professional keeps the profession (no organization, no request)', async () => {
    const r = await signup({ role: 'laboratory_staff', professionalStatus: 'independent', profession: 'biologist' });
    expect(r.status).toBe(201);
    expect(db.users[0].profession).toBe('biologist');
    expect(db.mem).toHaveLength(0);
  });

  it('looks the organization up by name AND chosen type: a pharmacist who picks « Hôpital » never matches a pharmacy', async () => {
    await org('CHU Test', 'hospital');
    // une officine du même nom existe (créée directement : aucun écran public ne crée d'officine)
    db.est.push({ id: 'e-off', name: 'Pharmacie Centrale', type: 'OFFICINE', isSystemReserved: false });
    const wrong = await signup({ role: 'pharmacist', professionalStatus: 'organization', organizationType: 'hospital', organizationName: 'Pharmacie Centrale', profession: 'pharmacist' });
    expect(wrong.status).toBe(201);
    expect(wrong.json.joinRequested).toBe(false);
    expect(wrong.json.joinRequestError).toBe('ORG_NOT_FOUND');
    expect(db.mem.filter((m) => m.establishmentId === 'e-off')).toHaveLength(0);
    const right = await signup({ role: 'pharmacist', professionalStatus: 'organization', organizationType: 'pharmacy', organizationName: 'Pharmacie Centrale', profession: 'pharmacist' });
    expect(right.json.joinRequested).toBe(true);
    const row = db.mem.find((m) => m.establishmentId === 'e-off');
    expect(row).toMatchObject({ status: 'PENDING', requestedDepartment: null }); // officine : pas de service
  });

  it('refuses impossible role / organization-type combinations sent straight to the API', async () => {
    const bad = (extra: object) => signup({ professionalStatus: 'organization', organizationName: 'X', ...extra });
    expect((await bad({ role: 'doctor', organizationType: 'pharmacy', department: 'A' })).status).toBe(400);
    expect((await bad({ role: 'doctor', organizationType: 'laboratory', department: 'A' })).status).toBe(400);
    expect((await bad({ role: 'medical_staff', organizationType: 'pharmacy', department: 'A' })).status).toBe(400);
    expect((await bad({ role: 'pharmacist', organizationType: 'laboratory' })).status).toBe(400);
    expect((await bad({ role: 'laboratory_staff', organizationType: 'pharmacy' })).status).toBe(400);
    expect((await bad({ role: 'doctor' })).status).toBe(400); // type manquant
    expect(db.users).toHaveLength(0); // rien n'est créé quand la validation échoue
  });

  it('enforces the department rule and the profession list server-side', async () => {
    const base = { professionalStatus: 'organization', organizationName: 'X' };
    // médecin en hôpital : service obligatoire
    expect((await signup({ ...base, role: 'doctor', organizationType: 'hospital' })).status).toBe(400);
    // pharmacien en hôpital : pas de service, une valeur envoyée est ignorée
    expect((await signup({ ...base, role: 'pharmacist', organizationType: 'hospital', department: 'Cardiologie', profession: 'pharmacist' })).status).toBe(201);
    // profession qui ne correspond pas au rôle
    expect((await signup({ ...base, role: 'doctor', organizationType: 'hospital', department: 'A', profession: 'biologist' })).status).toBe(400);
    // « chef de service » n'existe pas pour un indépendant
    expect((await signup({ role: 'doctor', professionalStatus: 'independent', profession: 'chef_de_service' })).status).toBe(400);
    // statut inconnu
    expect((await signup({ role: 'doctor', professionalStatus: 'whatever' })).status).toBe(400);
  });

  it('drops a department sent for a laboratory (no services there)', async () => {
    db.est.push({ id: 'e-lab', name: 'Labo Test', type: 'LABORATOIRE', isSystemReserved: false });
    await signup({ role: 'laboratory_staff', professionalStatus: 'organization', organizationType: 'laboratory', organizationName: 'Labo Test', department: 'Biochimie', profession: 'biologist' });
    expect(db.mem[0]).toMatchObject({ status: 'PENDING', requestedDepartment: null });
  });

  it('on approval, the declared service is attached when it exists (doctors only)', async () => {
    await org('CHU Test', 'hospital');
    const admin = db.users[0].id;
    const orgId = db.est[0].id;
    await call('POST', `/orgs/${orgId}/departments`, { name: 'Cardiologie' }, admin);
    await signup({ role: 'doctor', professionalStatus: 'organization', organizationType: 'hospital', organizationName: 'CHU Test', department: 'cardiologie', profession: 'doctor' });
    const m = db.mem.find((x) => x.userId === db.users[1].id);
    expect((await call('POST', `/orgs/${orgId}/requests/${m.id}/approve`, undefined, admin)).status).toBe(200);
    expect(m.departmentId).toBe(db.dep[0].id);
  });

  it('join-requests / invitations enforce the role / type pair too', async () => {
    await org('CHU Test', 'hospital');
    db.est.push({ id: 'e-off', name: 'Pharmacie Centrale', type: 'OFFICINE', isSystemReserved: false });
    await signup({ role: 'doctor' });
    const doc = db.users[1].id;
    expect((await call('POST', `/orgs/e-off/join-requests`, undefined, doc)).status).toBe(403);
    expect((await call('POST', `/orgs/${db.est[0].id}/join-requests`, { profession: 'biologist' }, doc)).status).toBe(400);
    expect((await call('POST', `/orgs/${db.est[0].id}/join-requests`, { profession: 'doctor', department: 'Urgences' }, doc)).status).toBe(201);
    expect(db.mem.find((m) => m.userId === doc)).toMatchObject({ status: 'PENDING', requestedDepartment: 'Urgences' });
    expect(db.users[1].profession).toBe('doctor');
  });
});

describe('join request + invitation', () => {
  async function setup() {
    await signup({ role: 'org_admin', organizationName: 'CHU Test', organizationType: 'hospital' });
    await signup({ role: 'doctor' });
    await signup({ role: 'doctor' });
    return { org: db.est[0].id, admin: db.users[0].id, doc1: db.users[1], doc2: db.users[2] };
  }

  it('admin approves a request; only an admin of THAT org can', async () => {
    const { org, admin, doc1, doc2 } = await setup();
    expect((await call('POST', `/orgs/${org}/join-requests`, undefined, doc1.id)).status).toBe(201);
    const m = db.mem.find((x) => x.userId === doc1.id);
    expect((await call('POST', `/orgs/${org}/requests/${m.id}/approve`, undefined, doc2.id)).status).toBe(403);
    expect(m.status).toBe('PENDING');
    expect((await call('POST', `/orgs/${org}/requests/${m.id}/approve`, undefined, admin)).status).toBe(200);
    expect(m.status).toBe('ACTIVE');
    const s = await call('GET', '/auth/session', undefined, doc1.id);
    expect(s.json.user.activeEstablishmentName).toBe('CHU Test');
  });

  it('only the owner of the invited e-mail can accept an invitation', async () => {
    const { org, admin, doc1, doc2 } = await setup();
    const inv = await call('POST', `/orgs/${org}/invitations`, { email: doc1.email.toUpperCase() }, admin);
    expect(inv.status).toBe(201);
    expect((await call('POST', `/orgs/invitations/${inv.json.id}/accept`, undefined, doc2.id)).status).toBe(404);
    expect((await call('POST', `/orgs/invitations/${inv.json.id}/accept`, undefined, doc1.id)).status).toBe(200);
    expect(db.mem.find((x) => x.userId === doc1.id)).toMatchObject({ status: 'ACTIVE', initiatedBy: 'ORG' });
  });

  it('a patient cannot ask to join an organization', async () => {
    const { org } = await setup();
    await signup({ role: 'patient' });
    expect((await call('POST', `/orgs/${org}/join-requests`, undefined, db.users[3].id)).status).toBe(403);
  });
});

describe('search an organization (live search from the first letter)', () => {
  it('finds by name from ONE letter, and by type word; excludes other kinds', async () => {
    await signup({ role: 'org_admin', organizationName: 'CHU Demo Sétif', organizationType: 'hospital' });
    await signup({ role: 'org_admin', organizationName: 'Clinique Les Oliviers', organizationType: 'clinic' });
    await signup({ role: 'establishment_admin', organizationName: 'Cmed Supply', organizationType: 'hospital' }); // SUPPLIER: jamais proposé
    await signup({ role: 'doctor' });
    const me = db.users[3].id;
    const one = await call('GET', '/orgs/search?q=c', undefined, me);
    expect(one.json.organizations.map((o: any) => o.name).sort()).toEqual(['CHU Demo Sétif', 'Clinique Les Oliviers']);
    expect((await call('GET', '/orgs/search?q=oliv', undefined, me)).json.organizations).toHaveLength(1);
    const byType = await call('GET', '/orgs/search?q=hôpital', undefined, me);
    expect(byType.json.organizations.map((o: any) => o.name)).toEqual(['CHU Demo Sétif']);
    expect((await call('GET', '/orgs/search?q=', undefined, me)).json.organizations).toEqual([]);
  });
});

describe('services (departments): who is tied to one, who serves the whole establishment', () => {
  async function setup() {
    await signup({ role: 'org_admin', organizationName: 'CHU Test', organizationType: 'hospital' });
    await signup({ role: 'doctor' });
    await signup({ role: 'pharmacist' });
    await signup({ role: 'laboratory_staff' });
    const org = db.est[0].id;
    const [admin, doc, pharm, labo] = db.users.map((u) => u.id);
    const join = async (uid: string) => {
      await call('POST', `/orgs/${org}/join-requests`, undefined, uid);
      const m = db.mem.find((x) => x.userId === uid);
      await call('POST', `/orgs/${org}/requests/${m.id}/approve`, undefined, admin);
      return m;
    };
    return { org, admin, doc, pharm, labo, mDoc: await join(doc), mPharm: await join(pharm), mLabo: await join(labo) };
  }
  const mkService = async (org: string, admin: string, name: string) =>
    (await call('POST', `/orgs/${org}/departments`, { name }, admin)).json.department;

  it('only an admin of the organization creates services; names are unique and validated', async () => {
    const { org, admin, doc } = await setup();
    expect((await call('POST', `/orgs/${org}/departments`, { name: 'Cardiologie' }, doc)).status).toBe(403);
    const ok = await call('POST', `/orgs/${org}/departments`, { name: 'Cardiologie' }, admin);
    expect(ok.status).toBe(201);
    expect(db.dep[0]).toMatchObject({ name: 'Cardiologie', establishmentId: org });
    expect((await call('POST', `/orgs/${org}/departments`, { name: '  cardiologie ' }, admin)).status).toBe(409);
    expect((await call('POST', `/orgs/${org}/departments`, { name: 'x' }, admin)).status).toBe(400);
  });

  it('a doctor is attached to a service and the session reports it', async () => {
    const { org, admin, doc, mDoc } = await setup();
    const cardio = await mkService(org, admin, 'Cardiologie');
    const r = await call('PATCH', `/orgs/${org}/members/${mDoc.id}/department`, { departmentId: cardio.id }, admin);
    expect(r.status).toBe(200);
    const s = await call('GET', '/auth/session', undefined, doc);
    expect(s.json.user).toMatchObject({ activeDepartmentId: cardio.id, activeDepartmentName: 'Cardiologie' });
    // detaching
    expect((await call('PATCH', `/orgs/${org}/members/${mDoc.id}/department`, { departmentId: null }, admin)).status).toBe(200);
    expect((await call('GET', '/auth/session', undefined, doc)).json.user.activeDepartmentId).toBeNull();
  });

  it('pharmacy and laboratory staff can NEVER be attached to a service (they serve the whole hospital)', async () => {
    const { org, admin, pharm, labo, mPharm, mLabo } = await setup();
    const cardio = await mkService(org, admin, 'Cardiologie');
    for (const m of [mPharm, mLabo]) {
      const r = await call('PATCH', `/orgs/${org}/members/${m.id}/department`, { departmentId: cardio.id }, admin);
      expect(r.status).toBe(400);
      expect(m.departmentId ?? null).toBeNull();
    }
    // even legacy / seeded data with a service stored on the membership is ignored by the session
    mPharm.departmentId = cardio.id;
    expect((await call('GET', '/auth/session', undefined, pharm)).json.user.activeDepartmentId).toBeNull();
    expect((await call('GET', '/auth/session', undefined, labo)).json.user.activeDepartmentId).toBeNull();
  });

  it('a service of another organization is refused', async () => {
    const { org, admin, mDoc } = await setup();
    db.dep.push({ id: 'dep-foreign', name: 'Urgences', establishmentId: 'someone-else' });
    const r = await call('PATCH', `/orgs/${org}/members/${mDoc.id}/department`, { departmentId: 'dep-foreign' }, admin);
    expect(r.status).toBe(400);
    expect(mDoc.departmentId ?? null).toBeNull();
  });

  it('approving a request can set the service at the same time (doctors only)', async () => {
    const { org, admin } = await setup();
    await signup({ role: 'doctor' });
    await signup({ role: 'pharmacist' });
    const [newDoc, newPharm] = db.users.slice(-2).map((u) => u.id);
    const cardio = await mkService(org, admin, 'Cardiologie');
    for (const uid of [newDoc, newPharm]) await call('POST', `/orgs/${org}/join-requests`, undefined, uid);
    const mD = db.mem.find((x) => x.userId === newDoc);
    const mP = db.mem.find((x) => x.userId === newPharm);
    expect((await call('POST', `/orgs/${org}/requests/${mP.id}/approve`, { departmentId: cardio.id }, admin)).status).toBe(400);
    expect(mP.status).toBe('PENDING');
    expect((await call('POST', `/orgs/${org}/requests/${mP.id}/approve`, {}, admin)).status).toBe(200);
    expect(mP).toMatchObject({ status: 'ACTIVE' });
    expect((await call('POST', `/orgs/${org}/requests/${mD.id}/approve`, { departmentId: cardio.id }, admin)).status).toBe(200);
    expect(mD).toMatchObject({ status: 'ACTIVE', departmentId: cardio.id });
  });
});
