/**
 * Alertes de retrait de lot (étape 3). Pattern du dépôt : HTTP réel (routes) + FAUX Prisma en mémoire.
 * Résultat indicatif, non exécuté sur Prisma réel : prouve la logique (service, routes, isolation), pas la base.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'net';

const S = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret';
  return { users: [] as any[], members: [] as any[], reqs: [] as any[], alerts: [] as any[], recs: [] as any[], watches: [] as any[], seq: 0 };
});

vi.mock('../src/lib/prisma', () => {
  const m = (r: any, w: any = {}): boolean => Object.entries(w).every(([k, v]: [string, any]) => {
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v) return v.in.includes(r[k]);
      if ('not' in v) return (r[k] ?? null) !== v.not;
    }
    return (r[k] ?? null) === (v ?? null);
  });
  const find = (t: any[], w: any) => t.filter((r) => m(r, w));
  const p2002 = () => Object.assign(new Error('unique'), { code: 'P2002' });
  const prisma: any = {
    user: {
      findUnique: async ({ where }: any) => { const u = S.users.find((x) => x.id === where.id); return u ? { ...u, affiliations: [] } : null; },
      findFirst: async ({ where }: any) => find(S.users, where)[0] ?? null,
      findMany: async ({ where }: any) => find(S.users, where),
    },
    userEstablishment: { findMany: async ({ where }: any) => find(S.members, where) },
    marketRequest: {
      findMany: async ({ where, take }: any) => find(S.reqs, where).slice(0, take ?? 1e9),
      update: async ({ where, data }: any) => Object.assign(S.reqs.find((r) => r.id === where.id), data),
    },
    marketLotWatch: {
      findMany: async ({ where }: any) => find(S.watches, where),
      upsert: async ({ where, create, update }: any) => { const w = S.watches.find((x) => x.marketRequestId === where.marketRequestId); if (w) return Object.assign(w, update); S.watches.push({ ...create }); return create; },
    },
    marketLotAlert: {
      findFirst: async ({ where }: any) => find(S.alerts, where)[0] ?? null,
      findMany: async ({ where }: any) => find(S.alerts, where),
      create: async ({ data }: any) => {
        if (S.alerts.some((a) => ['marketRequestId', 'productRef', 'lotNumber', 'event'].every((k) => a[k] === data[k]))) throw p2002();
        const row = { id: `al${++S.seq}`, detectedAt: new Date(), ...data }; S.alerts.push(row); return row;
      },
    },
    marketLotAlertRecipient: {
      create: async ({ data }: any) => {
        if (S.recs.some((r) => r.alertId === data.alertId && r.userId === data.userId)) throw p2002();
        const row = { id: `rc${++S.seq}`, readAt: null, emailStatus: 'SKIPPED', emailAttempts: 0, emailNextAttemptAt: null, emailSentAt: null, emailLastError: null, createdAt: new Date(), ...data }; S.recs.push(row); return row;
      },
      findMany: async ({ where, take }: any) => find(S.recs, where).slice(0, take ?? 1e9),
      findFirst: async ({ where }: any) => find(S.recs, where)[0] ?? null,
      count: async ({ where }: any) => find(S.recs, where).length,
      update: async ({ where, data }: any) => Object.assign(S.recs.find((r) => r.id === where.id), data),
      updateMany: async ({ where, data }: any) => { const rows = find(S.recs, where); rows.forEach((r) => Object.assign(r, data)); return { count: rows.length }; },
    },
    $transaction: async (fn: any) => {
      const snap = { alerts: [...S.alerts], recs: S.recs.map((r) => ({ ...r })) };
      try { return await fn(prisma); } catch (e) { S.alerts.splice(0, S.alerts.length, ...snap.alerts); S.recs.splice(0, S.recs.length, ...snap.recs); throw e; }
    },
  };
  return { prisma };
});

import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { signSessionToken } from '../src/lib/jwt';
import { runLotAlertPass, lotAlertConfig, hasLiveLotOrUnknown, DEFAULT_LOT_INSTRUCTION } from '../src/services/lotAlerts';
import { toMarketDto } from '../src/services/market';

const SECRET = 'SECRET-REASON-RECALL-XYZ';
const T0 = new Date('2026-10-27T10:00:00Z');
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
const ENV = { LOT_ALERTS_INTERVAL_MIN: '15' };

let orders: Record<string, { reporter: string; status?: string; lines: any[] }> = {};
let down = false;
const audit: any = vi.fn(async (req: any) => {
  if (down) return { kind: 'network', error: 'ECONNREFUSED' };
  const ref = decodeURIComponent(req.path.split('/').pop()!);
  const o = orders[ref];
  if (!o || o.reporter !== req.reporterRef) return { kind: 'http', status: 404, data: { error: 'not found' } };
  return { kind: 'http', status: 200, data: { orderRef: ref, status: o.status ?? 'CONFIRMED', manufacturer: 'Labo Test', lines: o.lines } };
});
const ln = (over: any = {}) => ({ product: 'Amoxicilline 1 g', reference: 'AMX-1', quantity: 10, unitPrice: 120.5, lotNumber: 'L-1', expiryDate: '2027-03-31', lotStatus: 'ACTIVE', reason: SECRET, ...over });
const mkReq = (id: string, over: any = {}) => ({ id, kind: 'ORDER', status: 'SENT', auditStatus: 'CONFIRMED', auditRef: `ord-${id}`, requesterUserId: 'alice', establishmentId: 'est1', manufacturerName: 'Labo Test', payload: {}, createdAt: new Date('2026-10-20T08:00:00Z'), ...over });
const addReq = (id: string, over: any = {}, lines: any[] = [ln({ lotStatus: 'WITHDRAWN' })], reporter = 'alice', status?: string) => {
  S.reqs.push(mkReq(id, over)); orders[`ord-${id}`] = { reporter, lines, status };
};
const mailOk = () => ({ configured: () => true, send: vi.fn(async () => undefined) });
const pass = (mail: any, minutes = 0, extra: any = {}) => runLotAlertPass({ db: prisma, audit, mail, now: () => at(minutes), env: { ...ENV, ...extra } });

beforeEach(() => {
  for (const k of ['users', 'members', 'reqs', 'alerts', 'recs', 'watches'] as const) (S as any)[k].length = 0;
  S.seq = 0; orders = {}; down = false; audit.mockClear();
  const u = (id: string, over: any = {}) => S.users.push({ id, email: `${id}@x.dz`, displayName: `N ${id}`, role: 'DOCTOR', deactivatedAt: null, passwordChangedAt: null, ...over });
  u('alice'); u('bob'); u('carol'); u('dave'); u('erin', { deactivatedAt: new Date('2026-01-01') });
  const mem = (userId: string, establishmentId: string, memberRole: string, status = 'ACTIVE') => S.members.push({ userId, establishmentId, memberRole, status });
  mem('bob', 'est1', 'ADMIN'); mem('carol', 'est1', 'MEMBER'); mem('dave', 'est2', 'ADMIN'); mem('erin', 'est1', 'ADMIN'); mem('zed', 'est1', 'ADMIN', 'PENDING'); mem('alice', 'est1', 'MEMBER');
});

describe('config', () => {
  it('défauts : 15 min, 20 par passe, consigne par défaut ; surcharges bornées', () => {
    expect(lotAlertConfig({})).toMatchObject({ enabled: true, recheckMs: 15 * 60_000, batch: 20, instruction: DEFAULT_LOT_INSTRUCTION });
    expect(lotAlertConfig({ LOT_ALERTS_INTERVAL_MIN: '30', LOT_ALERTS_BATCH: '500', LOT_ALERT_INSTRUCTION: 'Isolez\nle lot', LOT_ALERTS_ENABLED: 'false' }))
      .toMatchObject({ enabled: false, recheckMs: 30 * 60_000, batch: 100, instruction: 'Isolez le lot' });
    expect(lotAlertConfig({ LOT_ALERTS_INTERVAL_MIN: '0' }).recheckMs).toBe(15 * 60_000);
  });
});

describe('détection', () => {
  it('nominal : 1 alerte WITHDRAWN ; destinataires = demandeur + admins ACTIFS (ni membre simple, ni désactivé, ni PENDING, ni autre établissement) ; e-mails sans motif', async () => {
    addReq('r1');
    const mail = mailOk();
    const r = await pass(mail);
    expect(r).toMatchObject({ checked: 1, created: 1, emailed: 2, auditDown: false });
    expect(S.alerts).toHaveLength(1);
    expect(S.alerts[0]).toMatchObject({ event: 'WITHDRAWN', productRef: 'AMX-1', productName: 'Amoxicilline 1 g', lotNumber: 'L-1', manufacturerName: 'Labo Test', requesterUserId: 'alice' });
    expect(S.recs.map((x) => x.userId).sort()).toEqual(['alice', 'bob']);
    expect(mail.send.mock.calls.map((c: any) => c[0].to).sort()).toEqual(['alice@x.dz', 'bob@x.dz']);
    const body = JSON.stringify(mail.send.mock.calls) + JSON.stringify(S.alerts) + JSON.stringify(S.recs);
    expect(body).not.toContain(SECRET);
    expect(mail.send.mock.calls[0][0].text).toContain(DEFAULT_LOT_INSTRUCTION);
    // isolation côté Logiciel : la relecture se fait avec reporterRef = requesterUserId et le scope orders:read
    expect(audit.mock.calls[0][0]).toMatchObject({ method: 'GET', path: '/nexus/v1/orders/ord-r1', scope: 'orders:read', reporterRef: 'alice' });
    // confirmedLines gardé à jour avec lotStatus, sans champ inattendu
    expect(S.reqs[0].payload.confirmedLines[0]).toMatchObject({ lotNumber: 'L-1', lotStatus: 'WITHDRAWN' });
    expect(JSON.stringify(S.reqs[0].payload)).not.toContain(SECRET);
  });

  it('idempotence : 2 passes (après le délai) = 1 alerte, 1 e-mail par destinataire ; deux lots du même produit = 2 alertes', async () => {
    addReq('r1', {}, [ln({ lotStatus: 'WITHDRAWN' }), ln({ lotNumber: 'L-2', lotStatus: 'WITHDRAWN' })]);
    const mail = mailOk();
    await pass(mail, 0);
    await pass(mail, 20);
    expect(audit).toHaveBeenCalledTimes(2); // relu 2 fois (20 min > 15), mais...
    expect(S.alerts).toHaveLength(2);       // ...toujours 1 alerte par lot
    expect(S.recs).toHaveLength(4);
    expect(mail.send).toHaveBeenCalledTimes(4);
  });

  it('délai minimum de relecture par commande + limite par passe', async () => {
    addReq('r1'); addReq('r2'); addReq('r3');
    const mail = mailOk();
    await pass(mail, 0, { LOT_ALERTS_BATCH: '2' });
    expect(audit).toHaveBeenCalledTimes(2);
    await pass(mail, 1, { LOT_ALERTS_BATCH: '2' }); // 1 min plus tard : seule la commande jamais relue l'est
    expect(audit).toHaveBeenCalledTimes(3);
    await pass(mail, 5);
    expect(audit).toHaveBeenCalledTimes(3);         // < 15 min : rien
    await pass(mail, 16);
    expect(audit).toHaveBeenCalledTimes(6);
  });

  it('DELIVERED incluse ; CANCELLED, PENDING, non envoyée, intérêt, lots tous expirés : exclues (jamais relues)', async () => {
    addReq('del', { auditStatus: 'DELIVERED' });
    addReq('can', { auditStatus: 'CANCELLED' });
    addReq('pen', { auditStatus: 'PENDING' });
    addReq('rej', { status: 'REJECTED' });
    addReq('int', { kind: 'INTEREST' });
    addReq('exp', { payload: { confirmedLines: [{ lotNumber: 'L-1', expiryDate: '2026-01-01' }] } });
    await pass(mailOk());
    expect(audit.mock.calls.map((c: any) => c[0].path)).toEqual(['/nexus/v1/orders/ord-del']);
    expect(S.alerts.map((a) => a.marketRequestId)).toEqual(['del']);
  });

  it('hasLiveLotOrUnknown : jamais relue ou sans lot connu = à relire ; un lot non expiré suffit', () => {
    expect(hasLiveLotOrUnknown({ payload: {} }, '2026-10-27')).toBe(true);
    expect(hasLiveLotOrUnknown({ payload: { confirmedLines: [{ product: 'x' }] } }, '2026-10-27')).toBe(true);
    expect(hasLiveLotOrUnknown({ payload: { confirmedLines: [{ lotNumber: 'a', expiryDate: '2026-01-01' }, { lotNumber: 'b', expiryDate: '2027-01-01' }] } }, '2026-10-27')).toBe(true);
    expect(hasLiveLotOrUnknown({ payload: { confirmedLines: [{ lotNumber: 'a', expiryDate: '2026-10-26' }] } }, '2026-10-27')).toBe(false);
  });

  it('annulée chez le fabricant entre-temps : aucune alerte', async () => {
    addReq('r1', {}, [ln({ lotStatus: 'WITHDRAWN' })], 'alice', 'CANCELLED');
    await pass(mailOk());
    expect(S.alerts).toHaveLength(0);
  });

  it('commande d\'un autre demandeur côté Logiciel (404) : aucune alerte, la passe continue', async () => {
    addReq('r1', {}, [ln({ lotStatus: 'WITHDRAWN' })], 'someone-else');
    addReq('r2');
    await pass(mailOk());
    expect(S.alerts.map((a) => a.marketRequestId)).toEqual(['r2']);
  });
});

describe('levée du retrait', () => {
  it('REINSTATED en in-app SEULEMENT (aucun e-mail), une seule fois', async () => {
    addReq('r1');
    const mail = mailOk();
    await pass(mail, 0);
    expect(mail.send).toHaveBeenCalledTimes(2);
    orders['ord-r1'].lines = [ln({ lotStatus: 'ACTIVE' })];
    await pass(mail, 20);
    await pass(mail, 40);
    expect(S.alerts.map((a) => a.event).sort()).toEqual(['REINSTATED', 'WITHDRAWN']);
    expect(mail.send).toHaveBeenCalledTimes(2);
    expect(S.recs.filter((r) => r.alertId === S.alerts.find((a) => a.event === 'REINSTATED')!.id).every((r) => r.emailStatus === 'SKIPPED')).toBe(true);
  });
  it('lot ACTIVE jamais retiré : aucune alerte', async () => {
    addReq('r1', {}, [ln({ lotStatus: 'ACTIVE' })]);
    await pass(mailOk());
    expect(S.alerts).toHaveLength(0);
  });
});

describe('e-mail', () => {
  it('échec : l\'alerte reste, état PENDING + prochaine tentative ; retenté puis envoyé ; jamais de contenu dans l\'erreur', async () => {
    addReq('r1');
    const mail = { configured: () => true, send: vi.fn(async () => { throw Object.assign(new Error(`smtp down ${SECRET}`), { code: 'ECONNECTION' }); }) };
    await pass(mail, 0);
    expect(S.alerts).toHaveLength(1);
    expect(S.recs.every((r) => r.emailStatus === 'PENDING' && r.emailAttempts === 1 && r.emailNextAttemptAt && r.emailLastError === 'ECONNECTION')).toBe(true);
    expect(JSON.stringify(S.recs)).not.toContain(SECRET);
    await pass(mail, 1);                       // trop tôt (backoff 5 min) : pas de nouvelle tentative
    expect(mail.send).toHaveBeenCalledTimes(2);
    mail.send.mockImplementation(async () => undefined);
    await pass(mail, 6);
    expect(S.recs.every((r) => r.emailStatus === 'SENT' && r.emailSentAt)).toBe(true);
    expect(S.alerts).toHaveLength(1);
  });
  it('échecs répétés : FAILED après 5 tentatives, alerte intacte', async () => {
    addReq('r1');
    const mail = { configured: () => true, send: vi.fn(async () => { throw new Error('x'); }) };
    for (let i = 0; i < 6; i++) await pass(mail, i * 70);
    expect(S.recs.every((r) => r.emailStatus === 'FAILED' && r.emailAttempts === 5)).toBe(true);
    expect(S.alerts).toHaveLength(1);
  });
  it('e-mail non configuré : alerte in-app créée, destinataires SKIPPED, aucun envoi', async () => {
    addReq('r1');
    const mail = { configured: () => false, send: vi.fn() };
    await pass(mail);
    expect(S.alerts).toHaveLength(1);
    expect(S.recs.every((r) => r.emailStatus === 'SKIPPED')).toBe(true);
    expect(mail.send).not.toHaveBeenCalled();
  });
  it('LOT_ALERTS_ENABLED=false : rien (ni relecture ni alerte)', async () => {
    addReq('r1');
    await pass(mailOk(), 0, { LOT_ALERTS_ENABLED: 'false' });
    expect(audit).not.toHaveBeenCalled();
  });
});

describe('pannes : le balayage n\'est jamais interrompu', () => {
  it('Logiciel injoignable : pas d\'exception, pas d\'alerte, une seule tentative par passe ; les e-mails en attente partent quand même', async () => {
    addReq('r1'); addReq('r2');
    const bad = { configured: () => true, send: vi.fn(async () => { throw new Error('x'); }) };
    await pass(bad, 0);                     // crée l'alerte de r1/r2, e-mails KO => PENDING
    down = true; audit.mockClear();
    const ok = mailOk();
    await pass(ok, 6);
    expect(audit).toHaveBeenCalledTimes(0); // r1 et r2 relues il y a 6 min (< 15) : pas de relecture
    expect(ok.send).toHaveBeenCalled();     // l'envoi en attente est indépendant de la panne
    S.reqs.push(mkReq('r3')); orders['ord-r3'] = { reporter: 'alice', lines: [ln({ lotStatus: 'WITHDRAWN' })] };
    S.reqs.push(mkReq('r4')); orders['ord-r4'] = { reporter: 'alice', lines: [ln({ lotStatus: 'WITHDRAWN' })] };
    audit.mockClear();
    const r2 = await pass(ok, 7);
    expect(r2.auditDown).toBe(true);
    expect(audit).toHaveBeenCalledTimes(1); // s'arrête à la première erreur réseau (pas de martelage)
  });
  it('transport qui lève / base qui lève : runLotAlertPass résout toujours', async () => {
    addReq('r1');
    const boom: any = vi.fn(async () => { throw new Error('boom'); });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(runLotAlertPass({ db: prisma, audit: boom, mail: mailOk(), now: () => T0, env: ENV })).resolves.toBeTruthy();
    await expect(runLotAlertPass({ db: { marketRequest: { findMany: async () => { throw new Error('db'); } } }, audit, mail: mailOk(), now: () => T0, env: ENV })).resolves.toBeTruthy();
    err.mockRestore();
  });
});

describe('toMarketDto : lotStatus additif', () => {
  it('expose lotStatus ; un ancien confirmedLines sans lotStatus => null, sans erreur', () => {
    const base = { id: 'x', kind: 'ORDER', summary: 's', status: 'SENT', auditStatus: 'CONFIRMED', createdAt: T0, updatedAt: T0 };
    const dto: any = toMarketDto({ ...base, payload: { confirmedLines: [{ product: 'A', quantity: 1, lotNumber: 'L', lotStatus: 'WITHDRAWN' }, { product: 'B', quantity: 2, lotNumber: 'M' }] } });
    expect(dto.lines.map((l: any) => l.lotStatus)).toEqual(['WITHDRAWN', null]);
    expect(Object.keys(dto.lines[1])).toEqual(['product', 'quantity', 'unitPrice', 'lotNumber', 'expiryDate', 'lotStatus']);
    expect((toMarketDto({ ...base, payload: { display: { lines: [{ productLabel: 'P', quantity: 3 }] } } }) as any).lines[0].lotStatus).toBeNull();
  });
});

describe('routes /api/market/lot-alerts (HTTP réel)', () => {
  let server: ReturnType<ReturnType<typeof createApp>['listen']>;
  let base: string;
  beforeAll(() => { server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
  afterAll(() => { server.close(); });
  const call = async (method: string, path: string, as?: string) => {
    const res = await fetch(`${base}/api/market${path}`, { method, headers: as ? { Cookie: `vg_session=${signSessionToken({ userId: as })}` } : {} });
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  };
  const seed = async () => { addReq('r1'); await pass({ configured: () => false, send: vi.fn() }); return S.alerts[0].id as string; };

  it('401 sans session ; le destinataire voit son alerte (statut seulement, consigne, pas de motif)', async () => {
    const id = await seed();
    expect((await call('GET', '/lot-alerts')).status).toBe(401);
    const r = await call('GET', '/lot-alerts', 'alice');
    expect(r.status).toBe(200);
    expect(r.json.unread).toBe(1);
    expect(r.json.alerts).toEqual([expect.objectContaining({ id, event: 'WITHDRAWN', productName: 'Amoxicilline 1 g', lotNumber: 'L-1', manufacturer: 'Labo Test', instruction: DEFAULT_LOT_INSTRUCTION, read: false })]);
    expect(JSON.stringify(r.json)).not.toContain(SECRET);
    expect(JSON.stringify(r.json)).not.toContain('reason');
  });
  it('cross-tenant : un autre utilisateur (autre établissement, ou membre non destinataire) ne voit rien et ne peut pas marquer lu', async () => {
    const id = await seed();
    for (const who of ['dave', 'carol']) {
      const g = await call('GET', '/lot-alerts', who);
      expect(g.json).toMatchObject({ unread: 0, alerts: [] });
      expect((await call('POST', `/lot-alerts/${id}/read`, who)).status).toBe(404);
    }
    expect((await call('POST', '/lot-alerts/read-all', 'dave')).json.updated).toBe(0);
    expect(S.recs.every((r) => r.readAt === null)).toBe(true); // intact
  });
  it('marquer lu : par destinataire (admin bob garde la sienne non lue) ; read-all ; alerte inconnue 404', async () => {
    const id = await seed();
    expect((await call('POST', `/lot-alerts/${id}/read`, 'alice')).status).toBe(200);
    expect((await call('GET', '/lot-alerts', 'alice')).json).toMatchObject({ unread: 0, alerts: [expect.objectContaining({ read: true })] });
    expect((await call('GET', '/lot-alerts', 'bob')).json.unread).toBe(1);
    expect((await call('POST', '/lot-alerts/read-all', 'bob')).json.updated).toBe(1);
    expect((await call('POST', '/lot-alerts/nope/read', 'alice')).status).toBe(404);
  });
});
