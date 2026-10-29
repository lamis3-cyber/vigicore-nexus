/**
 * Données personnelles (/api/personal) et collègues d'organisation (/api/orgs/:id/members).
 * Prisma est un faux en mémoire : ces tests prouvent la LOGIQUE DES ROUTES (portée par utilisateur,
 * rôles, validation des champs, fusion, cascade des prises), pas le comportement d'une vraie base.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'net';

const db = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret';
  return { users: [] as any[], rows: [] as any[], memberships: [] as any[], seq: 0 };
});
vi.mock('../src/lib/prisma', () => {
  const match = (r: any, where: any) =>
    Object.entries(where).every(([k, v]: [string, any]) => (v && typeof v === 'object' && 'in' in v ? v.in.includes(r[k]) : r[k] === v));
  const personalRecord = {
    findFirst: async ({ where }: any) => db.rows.find((r) => match(r, where)) ?? null,
    findMany: async ({ where }: any) => db.rows.filter((r) => match(r, where)),
    count: async ({ where }: any) => db.rows.filter((r) => match(r, where)).length,
    create: async ({ data }: any) => {
      const row = { id: `p${++db.seq}`, createdAt: new Date(), updatedAt: new Date(), ...data };
      db.rows.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const r = db.rows.find((x) => x.id === where.id);
      Object.assign(r, data, { updatedAt: new Date() });
      return r;
    },
    deleteMany: async ({ where }: any) => {
      const n = db.rows.length;
      db.rows = db.rows.filter((r) => !match(r, where));
      return { count: n - db.rows.length };
    },
  };
  const user = {
    findUnique: async ({ where }: any) => {
      const u = db.users.find((x) => x.id === where.id);
      return u ? { ...u, affiliations: db.memberships.filter((m) => m.userId === u.id) } : null;
    },
  };
  const userEstablishment = {
    findMany: async ({ where }: any) =>
      db.memberships
        .filter((m) => m.establishmentId === where.establishmentId && m.status === where.status)
        .map((m) => ({ ...m, user: db.users.find((u) => u.id === m.userId) })),
  };
  return { prisma: { user, personalRecord, userEstablishment } };
});
import { createApp } from '../src/app';
import { signSessionToken } from '../src/lib/jwt';

let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base: string;
beforeAll(() => { server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(() => { server.close(); });

async function call(method: string, path: string, as?: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(as ? { Cookie: `vg_session=${signSessionToken({ userId: as })}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

beforeEach(() => {
  db.rows = []; db.users.length = 0; db.memberships.length = 0; db.seq = 0;
  db.users.push(
    { id: 'pat1', email: 'p1@x.dz', displayName: 'Patient Un', role: 'PATIENT', deactivatedAt: null },
    { id: 'pat2', email: 'p2@x.dz', displayName: 'Patient Deux', role: 'PATIENT', deactivatedAt: null },
    { id: 'doc', email: 'd@x.dz', displayName: 'Dr X', role: 'DOCTOR', deactivatedAt: null },
    { id: 'lab1', email: 'l1@x.dz', displayName: 'Labo Central', role: 'LABO', deactivatedAt: null },
    { id: 'lab2', email: 'l2@x.dz', displayName: 'Technicien', role: 'LABO', deactivatedAt: null },
    { id: 'gone', email: 'g@x.dz', displayName: 'Ancien', role: 'LABO', deactivatedAt: new Date() },
  );
  for (const [userId, status] of [['lab1', 'ACTIVE'], ['lab2', 'ACTIVE'], ['gone', 'ACTIVE'], ['doc', 'PENDING']] as const) {
    db.memberships.push({ id: `m-${userId}`, userId, establishmentId: 'est1', status, memberRole: 'MEMBER', isActiveContext: true, createdAt: new Date() });
  }
});

describe('personal — accès', () => {
  it('sans session : 401', async () => {
    expect((await call('GET', '/api/personal/product')).status).toBe(401);
  });
  it('type inconnu : 404 ; type réservé à un autre rôle : 403', async () => {
    expect((await call('GET', '/api/personal/password', 'pat1')).status).toBe(404);
    expect((await call('GET', '/api/personal/product', 'doc')).status).toBe(403);
    expect((await call('GET', '/api/personal/singleton/lab_profile', 'pat1')).status).toBe(403);
  });
  it('une fiche unique ne passe pas par les routes de liste (et inversement)', async () => {
    expect((await call('GET', '/api/personal/health_profile', 'pat1')).status).toBe(404);
    expect((await call('GET', '/api/personal/singleton/product', 'pat1')).status).toBe(404);
  });
});

describe('personal — listes', () => {
  it('créer, lister, modifier (fusion), supprimer ; champs inconnus ignorés', async () => {
    const c = await call('POST', '/api/personal/product', 'pat1', { data: { name: ' Doliprane ', category: 'medicament', lot: 'A12', userId: 'pat2', admin: true } });
    expect(c.status).toBe(201);
    expect(c.json.item.data).toEqual({ name: 'Doliprane', category: 'medicament', lot: 'A12' });
    const id = c.json.item.id;

    const u = await call('PATCH', `/api/personal/product/${id}`, 'pat1', { data: { lot: 'B34', inUse: false } });
    expect(u.status).toBe(200);
    expect(u.json.item.data).toEqual({ name: 'Doliprane', category: 'medicament', lot: 'B34', inUse: false });

    expect((await call('GET', '/api/personal/product', 'pat1')).json.items).toHaveLength(1);
    expect((await call('DELETE', `/api/personal/product/${id}`, 'pat1')).status).toBe(200);
    expect((await call('GET', '/api/personal/product', 'pat1')).json.items).toHaveLength(0);
  });

  it('isolation : un patient ne lit, ne modifie ni ne supprime JAMAIS les données d\'un autre', async () => {
    const id = (await call('POST', '/api/personal/allergy', 'pat1', { data: { name: 'Pénicilline', severity: 'severe' } })).json.item.id;
    expect((await call('GET', '/api/personal/allergy', 'pat2')).json.items).toHaveLength(0);
    expect((await call('PATCH', `/api/personal/allergy/${id}`, 'pat2', { data: { name: 'X' } })).status).toBe(404);
    expect((await call('DELETE', `/api/personal/allergy/${id}`, 'pat2')).status).toBe(404);
    expect(db.rows[0].data.name).toBe('Pénicilline');
  });

  it('validation : obligatoire, énumération, date, heure, longueur, entier', async () => {
    const bad = async (kind: string, data: unknown) => (await call('POST', `/api/personal/${kind}`, 'pat1', { data })).status;
    expect(await bad('product', { category: 'medicament' })).toBe(400); // nom manquant
    expect(await bad('product', { name: 'A', category: 'arme' })).toBe(400);
    expect(await bad('appointment', { practitioner: 'Dr', reason: 'Suivi', date: '2026-02-30' })).toBe(400);
    expect(await bad('appointment', { practitioner: 'Dr', reason: 'Suivi', date: '2026-11-02', time: '25:00' })).toBe(400);
    expect(await bad('allergy', { name: 'x'.repeat(121), severity: 'legere' })).toBe(400);
    expect(await bad('treatment', { name: 'A', dosesPerDay: 0 })).toBe(400);
    expect(await bad('treatment', { name: 'A', startDate: '2026-05-10', endDate: '2026-05-01' })).toBe(400);
    expect(await bad('product', 'texte')).toBe(400);
    expect(db.rows).toHaveLength(0);
  });

  it('PATCH ne peut pas vider un champ obligatoire', async () => {
    const id = (await call('POST', '/api/personal/condition', 'pat1', { data: { name: 'Asthme' } })).json.item.id;
    expect((await call('PATCH', `/api/personal/condition/${id}`, 'pat1', { data: { name: '' } })).status).toBe(400);
  });

  it('prise : doit référencer un traitement DU MÊME utilisateur ; supprimer le traitement supprime ses prises', async () => {
    const t1 = (await call('POST', '/api/personal/treatment', 'pat1', { data: { name: 'Metformine', dosesPerDay: 2 } })).json.item.id;
    const t2 = (await call('POST', '/api/personal/treatment', 'pat2', { data: { name: 'Autre' } })).json.item.id;
    expect((await call('POST', '/api/personal/intake', 'pat1', { data: { treatmentId: t2, takenAt: '2026-10-20T08:00:00Z' } })).status).toBe(400);
    expect((await call('POST', '/api/personal/intake', 'pat1', { data: { treatmentId: t1, takenAt: '2026-10-20T08:00:00Z' } })).status).toBe(201);
    expect((await call('POST', '/api/personal/intake', 'pat1', { data: { treatmentId: t1, takenAt: 'hier' } })).status).toBe(400);
    expect((await call('DELETE', `/api/personal/treatment/${t1}`, 'pat1')).status).toBe(200);
    expect(db.rows.filter((r) => r.kind === 'intake')).toHaveLength(0);
    expect(db.rows.map((r) => r.userId)).toEqual(['pat2']);
  });

  it('limite par type (contacts d\'urgence : 10)', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await call('POST', '/api/personal/emergency_contact', 'pat1', { data: { name: `C${i}`, phone: '0550' } })).status).toBe(201);
    }
    expect((await call('POST', '/api/personal/emergency_contact', 'pat1', { data: { name: 'C10', phone: '0550' } })).status).toBe(409);
  });
});

describe('personal — fiches uniques', () => {
  it('profil santé : absent -> null ; PUT crée puis remplace (une seule ligne)', async () => {
    expect((await call('GET', '/api/personal/singleton/health_profile', 'pat1')).json.item).toBeNull();
    await call('PUT', '/api/personal/singleton/health_profile', 'pat1', { data: { prenom: 'Amina', sexe: 'F', alertesCNPM: true } });
    const r = await call('PUT', '/api/personal/singleton/health_profile', 'pat1', { data: { prenom: 'Amina', telephone: '0555', alertesCNPM: false } });
    expect(r.status).toBe(200);
    expect(db.rows).toHaveLength(1);
    expect((await call('GET', '/api/personal/singleton/health_profile', 'pat1')).json.item.data).toEqual({ prenom: 'Amina', telephone: '0555', alertesCNPM: false });
    expect((await call('GET', '/api/personal/singleton/health_profile', 'pat2')).json.item).toBeNull();
  });
  it('profil laboratoire : réservé au rôle LABO', async () => {
    expect((await call('PUT', '/api/personal/singleton/lab_profile', 'lab1', { data: { agrement: 'ANPP-123' } })).status).toBe(200);
    expect((await call('PUT', '/api/personal/singleton/lab_profile', 'doc', { data: { agrement: 'x' } })).status).toBe(403);
  });
});

describe('orgs — collègues', () => {
  it('membre ACTIF : voit les membres actifs (sans e-mail, sans comptes désactivés ni demandes en attente)', async () => {
    const r = await call('GET', '/api/orgs/est1/members', 'lab1');
    expect(r.status).toBe(200);
    expect(r.json.members.map((m: any) => m.displayName)).toEqual(['Labo Central', 'Technicien']);
    expect(JSON.stringify(r.json)).not.toContain('@');
  });
  it('non-membre ou demande en attente : 403', async () => {
    expect((await call('GET', '/api/orgs/est1/members', 'pat1')).status).toBe(403);
    expect((await call('GET', '/api/orgs/est1/members', 'doc')).status).toBe(403);
  });
});
