/**
 * FOURNISSEUR (distributor / wholesale supplier) — phase 1: sign-up, session, permissions.
 * Prisma is replaced by a tiny in-memory fake (same one as orgs.routes.test.ts).
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

import { parseSupplierProfile } from '../src/lib/supplierRules';
import { rolePermits } from '../src/auth/rolePermissions';
import { allow } from '../src/auth/allow';
import { mapFrontendRole } from '../src/lib/roleMapping';
import { canManageListing, canCreateListingFor } from '../src/auth/servicesAuthz';

const company = {
  role: 'fournisseur',
  organizationName: 'MedSupply Distribution',
  rcNumber: '16/00-1234567 B 20',
  nifNumber: '001616123456789',
  phone: '+213 555 12 34 56',
  address: '12 rue des Frères Bouchama, Sétif',
};

describe('sign-up: fournisseur (distributor)', () => {
  it('maps the frontend role', () => {
    expect(mapFrontendRole('fournisseur')).toBe('FOURNISSEUR');
  });

  it('creates a SUPPLIER establishment, DISTRIBUTOR category DECLARED (never verified), user is its ACTIVE admin', async () => {
    const r = await signup({ ...company, declaredApprovalNumber: 'AGR-2024/117' });
    expect(r.status).toBe(201);
    expect(db.users[0].role).toBe('FOURNISSEUR');
    expect(db.est[0]).toMatchObject({
      name: 'MedSupply Distribution',
      type: 'SUPPLIER',
      rcNumber: '16/00-1234567 B 20',
      nifNumber: '001616123456789',
      phone: '+213 555 12 34 56',
      declaredApprovalNumber: 'AGR-2024/117',
      buyerCategory: 'DISTRIBUTOR',
      buyerCategoryStatus: 'DECLARED',
    });
    expect(db.est[0].buyerCategoryDeclaredBy).toBe(db.users[0].id);
    expect(db.mem[0]).toMatchObject({ status: 'ACTIVE', memberRole: 'ADMIN', isActiveContext: true });
  });

  it('the approval number is optional', async () => {
    const r = await signup(company);
    expect(r.status).toBe(201);
    expect(db.est[0].declaredApprovalNumber).toBeNull();
  });

  it('ignores any buyerCategory / status / type sent by the client', async () => {
    const r = await signup({ ...company, buyerCategory: 'PUBLIC_INSTITUTION', buyerCategoryStatus: 'VERIFIED', organizationType: 'hospital' });
    expect(r.status).toBe(201);
    expect(db.est[0]).toMatchObject({ type: 'SUPPLIER', buyerCategory: 'DISTRIBUTOR', buyerCategoryStatus: 'DECLARED' });
  });

  it.each(['organizationName', 'rcNumber', 'nifNumber', 'phone', 'address'])('refuses a missing %s and creates nothing', async (field) => {
    const body: any = { ...company };
    delete body[field];
    const r = await signup(body);
    expect(r.status).toBe(400);
    expect(db.users).toHaveLength(0);
    expect(db.est).toHaveLength(0);
  });

  it('refuses an organization name already taken', async () => {
    await signup(company);
    const again = await signup(company);
    expect(again.status).toBe(409);
    expect(db.est).toHaveLength(1);
  });

  it('session: reports the verification status so the UI can show « en attente de vérification »', async () => {
    await signup(company);
    const s = await call('GET', '/auth/session', undefined, db.users[0].id);
    expect(s.json.user.role).toBe('FOURNISSEUR');
    expect(s.json.user.activeEstablishmentType).toBe('SUPPLIER');
    expect(s.json.user.organizationVerification).toEqual({ category: 'DISTRIBUTOR', status: 'DECLARED', note: null });
    // once staff verifies it, the session follows
    db.est[0].buyerCategoryStatus = 'VERIFIED';
    const s2 = await call('GET', '/auth/session', undefined, db.users[0].id);
    expect(s2.json.user.organizationVerification.status).toBe('VERIFIED');
  });

  it('session: other accounts without a buyer category get organizationVerification null', async () => {
    await signup({ role: 'org_admin', organizationName: 'Clinique X', organizationType: 'clinic' });
    const s = await call('GET', '/auth/session', undefined, db.users[0].id);
    expect(s.json.user.organizationVerification).toBeNull();
  });

  it('the manufacturer sign-up is unchanged', async () => {
    const r = await signup({ role: 'establishment_admin', organizationName: 'Fabricant Y' });
    expect(r.status).toBe(201);
    expect(db.users[0].role).toBe('ESTABLISHMENT_ADMIN');
    expect(db.est[0].buyerCategory).toBeUndefined();
  });
});

describe('supplierRules.parseSupplierProfile', () => {
  const ok = { organizationName: 'A Co', rcNumber: '16/00-123456', nifNumber: '001616123456789', phone: '0555123456', address: '12 rue X, Sétif' };
  it('accepts a complete sheet and normalises spaces', () => {
    const r = parseSupplierProfile({ ...ok, organizationName: '  A   Co ' });
    expect(r.ok && r.profile.organizationName).toBe('A Co');
  });
  it('rejects control characters, bad phone, too-short ids and overlong agrément', () => {
    expect(parseSupplierProfile({ ...ok, address: 'rue\nX, Sétif' }).ok).toBe(false);
    expect(parseSupplierProfile({ ...ok, phone: 'abc' }).ok).toBe(false);
    expect(parseSupplierProfile({ ...ok, rcNumber: '12' }).ok).toBe(false);
    expect(parseSupplierProfile({ ...ok, nifNumber: '123' }).ok).toBe(false);
    expect(parseSupplierProfile({ ...ok, declaredApprovalNumber: 'x'.repeat(61) }).ok).toBe(false);
    expect(parseSupplierProfile({ ...ok, rcNumber: 12345678 }).ok).toBe(false);
    expect(parseSupplierProfile(null).ok).toBe(false);
  });
});

describe('FOURNISSEUR permissions', () => {
  it('may declare (CREATE) and view, but never edit / withdraw / review / escalate / close', () => {
    expect(rolePermits('FOURNISSEUR', 'CREATE')).toBe(true);
    expect(rolePermits('FOURNISSEUR', 'VIEW')).toBe(true);
    for (const a of ['EDIT', 'WITHDRAW', 'REVIEW', 'ESCALATE', 'CLOSE'] as const) expect(rolePermits('FOURNISSEUR', a)).toBe(false);
  });

  const requester: any = {
    userId: 'f1', role: 'FOURNISSEUR', activeEstablishmentId: 'est-f', affiliatedEstablishmentIds: ['est-f'], adminEstablishmentIds: ['est-f'],
    departmentId: null, hasEstablishmentWideScope: false, permissionGrants: [],
  };
  const rec = (over: object) => ({ id: 'r1', domain: 'MATERIOVIGILANCE', authorUserId: 'someone', establishmentId: 'est-other', ...over }) as any;

  it('sees its own declaration, not another establishment\'s', () => {
    expect(allow(requester, 'VIEW', rec({ authorUserId: 'f1', establishmentId: 'est-f' }))).toBe(true);
    expect(allow(requester, 'VIEW', rec({}))).toBe(false);
  });

  it('manages the product catalogue of ITS OWN establishment only (sells to verified buyers, 2026-11-03)', () => {
    expect(canManageListing(requester, { establishmentId: 'est-f' })).toBe(true);
    expect(canCreateListingFor(requester, 'est-f')).toBe(true);
    expect(canManageListing(requester, { establishmentId: 'someone-else' })).toBe(false);
    expect(canCreateListingFor(requester, 'someone-else')).toBe(false);
  });

  it('an EMPLOYEE (MEMBER, not admin) of the company never manages the catalogue', () => {
    const staff = { ...requester, userId: 'f2', adminEstablishmentIds: [] };
    expect(canManageListing(staff, { establishmentId: 'est-f' })).toBe(false);
    expect(canCreateListingFor(staff, 'est-f')).toBe(false);
  });
});
