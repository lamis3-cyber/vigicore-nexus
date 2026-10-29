/** Activation d'organisation par code : le Site ne devine ni ne saisit jamais l'id Audit, il le reçoit d'Audit. */
import { describe, it, expect } from 'vitest';
import { normalizeLinkCode, redeemSiteLinkCode, siteLinkStatus, SiteLinkError } from '../src/services/siteLink';

const makeDb = (ests: any[]) => ({
  establishment: {
    findFirst: async ({ where }: any) => {
      if (where.auditManufacturerRef) return ests.find((e) => e.auditManufacturerRef === where.auditManufacturerRef && e.id !== where.NOT?.id) ?? null;
      return ests.find((e) => e.id === where.id) ?? null;
    },
    update: async ({ where, data }: any) => Object.assign(ests.find((e) => e.id === where.id), data),
  },
});
const ok = (ref = 'org-9', name = 'Numidia Pharma') => async () => ({ kind: 'http' as const, status: 200, data: { manufacturer: { ref, name } } });
const http = (status: number, data: any = {}) => async () => ({ kind: 'http' as const, status, data });
const run = (ests: any[], audit: any, code: unknown = 'num-7kq2-x9') =>
  redeemSiteLinkCode({ db: makeDb(ests), audit }, { establishmentId: 'e1', code, userId: 'u1', by: 'admin@numidia.dz' });
const fresh = (over: any = {}) => [{ id: 'e1', name: 'Numidia Pharma', auditManufacturerRef: null, ...over }];
const fails = async (p: Promise<any>, code: string, status: number) => {
  const err: any = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(SiteLinkError);
  expect(err).toMatchObject({ code, status });
};

describe('normalizeLinkCode', () => {
  it('majuscules, sans espaces ; refuse le vide, le trop court et les caractères étrangers', () => {
    expect(normalizeLinkCode(' num-7kq2 x9 ')).toBe('NUM-7KQ2X9');
    for (const bad of [undefined, null, 42, '', 'ab', 'a'.repeat(33), 'NUM_7KQ2!', '-ABCDEF']) expect(normalizeLinkCode(bad)).toBeNull();
  });
});

describe('redeemSiteLinkCode', () => {
  it("lie l'établissement à l'organisation renvoyée par Audit, et envoie à Audit le code normalisé + l'établissement", async () => {
    const ests = fresh();
    const seen: any[] = [];
    const r = await run(ests, async (req: any) => { seen.push(req); return ok()(); });
    expect(r.manufacturer).toEqual({ ref: 'org-9', name: 'Numidia Pharma' });
    expect(ests[0]).toMatchObject({ auditManufacturerRef: 'org-9', auditManufacturerLinkedBy: 'admin@numidia.dz' });
    expect(seen[0]).toMatchObject({ method: 'POST', path: '/nexus/v1/site-link/redeem', scope: 'link:write', reporterRef: 'u1', body: { code: 'NUM-7KQ2-X9', siteEstablishmentId: 'e1', siteEstablishmentName: 'Numidia Pharma' } });
  });
  it('remplace une référence de démo, jamais un vrai lien (changement = staff)', async () => {
    const demo = fresh({ auditManufacturerRef: 'demo-numidia' });
    await run(demo, ok());
    expect(demo[0].auditManufacturerRef).toBe('org-9');
    const real = fresh({ auditManufacturerRef: 'org-1' });
    await fails(run(real, ok()), 'ALREADY_LINKED', 409);
    expect(real[0].auditManufacturerRef).toBe('org-1');
  });
  it("n'appelle pas Audit si le code est mal formé ou l'établissement inconnu", async () => {
    let calls = 0;
    const audit = async (...a: any[]) => { calls++; return ok()(); };
    await fails(run(fresh(), audit, 'x'), 'INVALID_CODE_FORMAT', 400);
    await fails(run([], audit), 'ESTABLISHMENT_NOT_FOUND', 404);
    expect(calls).toBe(0);
  });
  it('traduit les refus d\'Audit en messages clairs, sans rien lier', async () => {
    for (const [status, code, http_] of [[404, 'CODE_UNKNOWN', 422], [410, 'CODE_EXPIRED', 422], [409, 'CODE_USED', 422], [403, 'AUDIT_REFUSED', 502], [500, 'AUDIT_BAD_RESPONSE', 502]] as const) {
      const ests = fresh();
      await fails(run(ests, http(status)), code, http_);
      expect(ests[0].auditManufacturerRef).toBeNull();
    }
  });
  it('réseau coupé : AUDIT_UNAVAILABLE, rien de lié', async () => {
    const ests = fresh();
    await fails(run(ests, async () => ({ kind: 'network', error: 'TIMEOUT' })), 'AUDIT_UNAVAILABLE', 502);
    expect(ests[0].auditManufacturerRef).toBeNull();
  });
  it("réponse d'Audit incohérente (pas de ref, ref trop longue) : refusée", async () => {
    await fails(run(fresh(), http(200, { manufacturer: {} })), 'AUDIT_BAD_RESPONSE', 502);
    await fails(run(fresh(), http(200, { manufacturer: { ref: 'x'.repeat(101) } })), 'AUDIT_BAD_RESPONSE', 502);
    await fails(run(fresh(), http(200, {})), 'AUDIT_BAD_RESPONSE', 502);
  });
  it('organisation déjà liée à un autre établissement : refusée', async () => {
    const ests = [...fresh(), { id: 'e2', name: 'Autre', auditManufacturerRef: 'org-9' }];
    await fails(run(ests, ok()), 'MANUFACTURER_ALREADY_LINKED', 409);
    expect(ests[0].auditManufacturerRef).toBeNull();
  });
});

describe('siteLinkStatus', () => {
  it("n'expose jamais l'id ; distingue lien réel, démo et absent", () => {
    const d = new Date('2026-10-29');
    expect(siteLinkStatus({ auditManufacturerRef: 'org-1', auditManufacturerLinkedAt: d })).toEqual({ linked: true, demo: false, linkedAt: d });
    expect(siteLinkStatus({ auditManufacturerRef: 'demo-x', auditManufacturerLinkedAt: null })).toMatchObject({ linked: false, demo: true });
    expect(siteLinkStatus({ auditManufacturerRef: null, auditManufacturerLinkedAt: null })).toMatchObject({ linked: false, demo: false });
  });
});
