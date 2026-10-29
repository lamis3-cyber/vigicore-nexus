/**
 * Équipe d'un FOURNISSEUR (2026-11-03) : inscription « employé », invitation par l'administrateur de la société,
 * acceptation, et limites (jamais d'autre société, jamais de mélange avec les établissements de santé).
 * Prisma = faux en mémoire (même modèle que orgs.routes.test.ts).
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'net';

const db = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.RL_AUTH_MAX = '1000';
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
  user.findUnique = async (args: any) => {
    const u = await baseFind(args);
    return u && args.include?.affiliations ? { ...u, affiliations: db.mem.filter((m) => m.userId === u.id).map((m) => ({ ...m, department: null })) } : u;
  };
  const memberships = table(db.mem, (d) => ({ id: id('m'), isActiveContext: false, status: 'ACTIVE', memberRole: 'MEMBER', initiatedBy: 'USER', createdAt: new Date(), ...d }));
  const baseMemFind = memberships.findMany;
  memberships.findMany = async (args: any = {}) => {
    const rows = await baseMemFind(args);
    return args.include ? rows.map((r: any) => ({ ...r, user: db.users.find((u) => u.id === r.userId), department: null, establishment: db.est.find((e) => e.id === r.establishmentId) })) : rows;
  };
  const invitations = table(db.inv, (d) => ({ id: id('i'), status: 'PENDING', createdAt: new Date(), ...d }));
  const baseInvFind = invitations.findMany;
  invitations.findMany = async (args: any = {}) => (await baseInvFind(args)).map((r: any) => (args.include ? { ...r, establishment: db.est.find((e) => e.id === r.establishmentId) } : r));
  const prisma: any = {
    user,
    establishment: table(db.est, (d) => ({ id: id('e'), isSystemReserved: false, ...d })),
    userEstablishment: memberships,
    department: table(db.dep, (d) => ({ id: id('d'), ...d })),
    organizationInvitation: invitations,
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

async function call(method: string, path: string, body?: unknown, as?: string) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(as ? { Cookie: `vg_session=${signSessionToken({ userId: as })}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}
const mem = (userId: string, establishmentId: string, memberRole = 'MEMBER') => db.mem.push({ id: `m_${userId}_${establishmentId}`, userId, establishmentId, status: 'ACTIVE', memberRole, isActiveContext: true, createdAt: new Date() });
const staffSignup = (email: string, extra: object = {}) =>
  call('POST', '/auth/signup', { name: 'Karim Employé', email, password: 'longenough1', role: 'fournisseur_staff', ...extra });

beforeEach(() => {
  db.users.length = db.est.length = db.mem.length = db.inv.length = db.dep.length = 0;
  const u = (id: string, email: string, role: string) => db.users.push({ id, email, displayName: `Name ${id}`, role, deactivatedAt: null, passwordChangedAt: null });
  const e = (id: string, type: string) => db.est.push({ id, name: `Etab ${id}`, type, isSystemReserved: false });
  e('atlas', 'SUPPLIER'); e('sahel', 'SUPPLIER'); e('chu', 'HOSPITAL');
  u('atlasAdmin', 'admin@atlas.dz', 'FOURNISSEUR'); mem('atlasAdmin', 'atlas', 'ADMIN');
  u('sahelAdmin', 'admin@sahel.dz', 'FOURNISSEUR'); mem('sahelAdmin', 'sahel', 'ADMIN');
  u('chuAdmin', 'admin@chu.dz', 'ORG_ADMIN'); mem('chuAdmin', 'chu', 'ADMIN');
  u('doc', 'doc@x.dz', 'DOCTOR');
});

describe("inscription « employé d'un fournisseur »", () => {
  it('crée un compte FOURNISSEUR SANS société ni affiliation (rien n\'est accordé avant l\'invitation)', async () => {
    const r = await staffSignup('karim@atlas.dz');
    expect(r.status).toBe(201);
    const user = db.users.find((x) => x.email === 'karim@atlas.dz');
    expect(user.role).toBe('FOURNISSEUR');
    expect(db.est.filter((x) => x.name !== undefined && !['atlas', 'sahel', 'chu'].includes(x.id))).toHaveLength(0);
    expect(db.mem.filter((m) => m.userId === user.id)).toHaveLength(0);
  });
  it("ne demande aucune fiche société (RC / NIF), contrairement à l'inscription fournisseur", async () => {
    expect((await staffSignup('a@x.dz')).status).toBe(201);
    const company = await call('POST', '/auth/signup', { name: 'N', email: 'b@x.dz', password: 'longenough1', role: 'fournisseur' });
    expect(company.status).toBe(400);
  });
  it("un nom d'entreprise tapé n'ouvre aucun droit (une correspondance de nom ne prouve rien)", async () => {
    await staffSignup('karim2@atlas.dz', { organizationName: 'Etab atlas', organizationType: 'hospital', professionalStatus: 'organization' });
    const user = db.users.find((x) => x.email === 'karim2@atlas.dz');
    expect(db.mem.filter((m) => m.userId === user.id)).toHaveLength(0);
  });
});

describe('invitation par l\'administrateur de la société', () => {
  it('invite, l\'employé accepte, et devient MEMBER (jamais ADMIN) de CETTE société', async () => {
    await staffSignup('karim@atlas.dz');
    const staffId = db.users.find((x) => x.email === 'karim@atlas.dz').id;
    const inv = await call('POST', '/orgs/atlas/invitations', { email: 'Karim@Atlas.dz' }, 'atlasAdmin');
    expect(inv.status).toBe(201);
    const mine = await call('GET', '/orgs/mine', undefined, staffId);
    expect(mine.json.invitations).toHaveLength(1);
    expect(mine.json.invitations[0].organization.name).toBe('Etab atlas');
    const ok = await call('POST', `/orgs/invitations/${inv.json.id}/accept`, undefined, staffId);
    expect(ok.status).toBe(200);
    expect(db.mem.find((m) => m.userId === staffId && m.establishmentId === 'atlas')).toMatchObject({ status: 'ACTIVE', memberRole: 'MEMBER' });
  });
  it('seul l\'administrateur de CETTE société invite : un employé, un autre fournisseur, un médecin => 403', async () => {
    await staffSignup('karim@atlas.dz');
    const staffId = db.users.find((x) => x.email === 'karim@atlas.dz').id;
    mem(staffId, 'atlas', 'MEMBER');
    expect((await call('POST', '/orgs/atlas/invitations', { email: 'x@y.dz' }, staffId)).status).toBe(403);
    expect((await call('POST', '/orgs/atlas/invitations', { email: 'x@y.dz' }, 'sahelAdmin')).status).toBe(403);
    expect((await call('POST', '/orgs/atlas/invitations', { email: 'x@y.dz' }, 'doc')).status).toBe(403);
    expect(db.inv).toHaveLength(0);
  });
  it("l'invité doit avoir le bon type de compte : un médecin n'accepte pas une société fournisseur", async () => {
    const inv = await call('POST', '/orgs/atlas/invitations', { email: 'doc@x.dz' }, 'atlasAdmin');
    expect(inv.status).toBe(201);
    const r = await call('POST', `/orgs/invitations/${inv.json.id}/accept`, undefined, 'doc');
    expect(r.status).toBe(403);
    expect(db.mem.find((m) => m.userId === 'doc')).toBeUndefined();
  });
  it("un employé de fournisseur n'accepte pas l'invitation d'un hôpital", async () => {
    await staffSignup('karim@atlas.dz');
    const staffId = db.users.find((x) => x.email === 'karim@atlas.dz').id;
    const inv = await call('POST', '/orgs/chu/invitations', { email: 'karim@atlas.dz' }, 'chuAdmin');
    expect(inv.status).toBe(201);
    expect((await call('POST', `/orgs/invitations/${inv.json.id}/accept`, undefined, staffId)).status).toBe(403);
  });
  it("le dirigeant d'une société n'accepte pas d'être l'employé d'une autre", async () => {
    const inv = await call('POST', '/orgs/atlas/invitations', { email: 'admin@sahel.dz' }, 'atlasAdmin');
    expect((await call('POST', `/orgs/invitations/${inv.json.id}/accept`, undefined, 'sahelAdmin')).status).toBe(403);
  });
  it("l'invitation d'une autre adresse e-mail n'est pas acceptable (404)", async () => {
    await staffSignup('karim@atlas.dz');
    await staffSignup('intrus@x.dz');
    const intrus = db.users.find((x) => x.email === 'intrus@x.dz').id;
    const inv = await call('POST', '/orgs/atlas/invitations', { email: 'karim@atlas.dz' }, 'atlasAdmin');
    expect((await call('POST', `/orgs/invitations/${inv.json.id}/accept`, undefined, intrus)).status).toBe(404);
  });
  it("l'administrateur voit l'équipe, retire un employé, mais jamais un administrateur", async () => {
    await staffSignup('karim@atlas.dz');
    const staffId = db.users.find((x) => x.email === 'karim@atlas.dz').id;
    mem(staffId, 'atlas', 'MEMBER');
    const ov = await call('GET', '/orgs/atlas/overview', undefined, 'atlasAdmin');
    expect(ov.status).toBe(200);
    expect(ov.json.members.map((m: any) => m.memberRole).sort()).toEqual(['ADMIN', 'MEMBER']);
    const staffRow = ov.json.members.find((m: any) => m.userId === staffId);
    expect((await call('DELETE', `/orgs/atlas/members/${staffRow.membershipId}`, undefined, 'atlasAdmin')).status).toBe(200);
    const adminRow = ov.json.members.find((m: any) => m.userId === 'atlasAdmin');
    expect((await call('DELETE', `/orgs/atlas/members/${adminRow.membershipId}`, undefined, 'atlasAdmin')).status).toBe(409);
  });
  it("équipe limitée : au-delà de 25 personnes (membres + invitations) => 409", async () => {
    for (let i = 0; i < 24; i++) db.inv.push({ id: `iv${i}`, establishmentId: 'atlas', email: `p${i}@x.dz`, status: 'PENDING', createdAt: new Date() });
    expect((await call('POST', '/orgs/atlas/invitations', { email: 'ok@x.dz' }, 'atlasAdmin')).status).toBe(409);
  });
});
