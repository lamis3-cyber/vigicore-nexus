/**
 * 2FA TOTP (opt-in). Pattern du dépôt : HTTP réel + FAUX Prisma en mémoire (résultat indicatif, non exécuté sur Prisma réel).
 * Seul `Date` est simulé (temps TOTP/JWT contrôlé). Clé et mots de passe ci-dessous : valeurs de TEST explicites, sans valeur réelle.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { AddressInfo } from 'net';

const TEST_KEY = vi.hoisted(() => Buffer.alloc(32, 7).toString('base64')); // clé de test : 32 × 0x07
const S = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.RL_AUTH_MAX = '5000';
  process.env.RL_API_MAX = '5000';
  return { users: [] as any[], mfa: [] as any[], codes: [] as any[], uses: [] as any[], audit: [] as any[], seq: 0 };
});

vi.mock('../src/lib/prisma', () => {
  const m = (r: any, w: any = {}): boolean => Object.entries(w).every(([k, v]: [string, any]) => {
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v) return v.in.includes(r[k]);
      if ('lt' in v) return r[k] < v.lt;
    }
    return (r[k] ?? null) === (v ?? null);
  });
  const p2002 = () => Object.assign(new Error('unique'), { code: 'P2002' });
  const prisma: any = {
    user: {
      findFirst: async ({ where }: any) => S.users.find((r) => m(r, where)) ?? null,
      findUnique: async ({ where }: any) => { const u = S.users.find((r) => m(r, where)); return u ? { ...u, affiliations: [] } : null; },
      update: async ({ where, data }: any) => Object.assign(S.users.find((r) => m(r, where)), data),
    },
    establishment: { findUnique: async () => null },
    userMfa: {
      findUnique: async ({ where }: any) => { const r = S.mfa.find((x) => x.userId === where.userId); return r ? { ...r } : null; },
      upsert: async ({ where, create, update }: any) => { const r = S.mfa.find((x) => x.userId === where.userId); if (r) return Object.assign(r, update); const n = { enabledAt: null, lastUsedStep: null, failedAttempts: 0, lockedUntil: null, ...create }; S.mfa.push(n); return n; },
      update: async ({ where, data }: any) => Object.assign(S.mfa.find((x) => x.userId === where.userId), data),
      updateMany: async ({ where, data }: any) => { const rows = S.mfa.filter((r) => m(r, where)); rows.forEach((r) => Object.assign(r, data)); return { count: rows.length }; },
      delete: async ({ where }: any) => { const i = S.mfa.findIndex((x) => x.userId === where.userId); S.mfa.splice(i, 1); return {}; },
    },
    userMfaRecoveryCode: {
      findMany: async ({ where }: any) => S.codes.filter((r) => m(r, where)).map((r) => ({ ...r })),
      create: async ({ data }: any) => { const r = { id: `rc${++S.seq}`, usedAt: null, ...data }; S.codes.push(r); return r; },
      deleteMany: async ({ where }: any) => { const keep = S.codes.filter((r) => !m(r, where)); const n = S.codes.length - keep.length; S.codes.splice(0, S.codes.length, ...keep); return { count: n }; },
      updateMany: async ({ where, data }: any) => { const rows = S.codes.filter((r) => m(r, where)); rows.forEach((r) => Object.assign(r, data)); return { count: rows.length }; },
      count: async ({ where }: any) => S.codes.filter((r) => m(r, where)).length,
    },
    mfaChallengeUse: {
      findUnique: async ({ where }: any) => S.uses.find((r) => r.jti === where.jti) ?? null,
      create: async ({ data }: any) => { if (S.uses.some((r) => r.jti === data.jti)) throw p2002(); S.uses.push({ ...data }); return data; },
      deleteMany: async ({ where }: any) => { const keep = S.uses.filter((r) => !m(r, where)); S.uses.splice(0, S.uses.length, ...keep); return { count: 0 }; },
    },
    auditEntry: { create: async ({ data }: any) => { S.audit.push({ id: `au${++S.seq}`, ...data }); return data; } },
    $transaction: async (fn: any) => {
      const snap = { mfa: S.mfa.map((x) => ({ ...x })), codes: S.codes.map((x) => ({ ...x })), audit: [...S.audit] };
      try { return await fn(prisma); } catch (e) { S.mfa.splice(0, S.mfa.length, ...snap.mfa); S.codes.splice(0, S.codes.length, ...snap.codes); S.audit.splice(0, S.audit.length, ...snap.audit); throw e; }
    },
  };
  return { prisma };
});

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { generateSync } from 'otplib';
import { createApp } from '../src/app';
import { encryptSecret, decryptSecret, normalizeRecovery } from '../src/lib/mfaCrypto';

const PW = 'Test-Passw0rd-1';
const T0 = Date.UTC(2026, 10, 2, 10, 0, 0); // aligné sur un pas de 30 s
const setT = (sec: number) => vi.setSystemTime(new Date(T0 + sec * 1000));
const totp = (secret: string, sec: number) => generateSync({ secret, epoch: Math.floor((T0 + sec * 1000) / 1000) });

let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base: string;
let logs: string[] = [];
const spies: any[] = [];
beforeAll(() => { server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(() => { server.close(); });
afterEach(() => { vi.useRealTimers(); spies.forEach((s) => s.mockRestore()); spies.length = 0; });

async function api(method: string, path: string, body?: unknown, cookie?: string) {
  const res = await fetch(`${base}/api/auth${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const setCookie = res.headers.get('set-cookie');
  const text = await res.text();
  return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() as any, setCookie, cookie: setCookie?.match(/vg_session=[^;]+/)?.[0] };
}
const login = (email = 'alice@x.dz', password = PW) => api('POST', '/login', { email, password });
const sessionOf = (cookie: string | undefined) => api('GET', '/session', undefined, cookie);

/** Active le 2FA pour un compte (à l'heure courante simulée). */
async function activate(email = 'alice@x.dz') {
  const l = await login(email);
  const setup = await api('POST', '/2fa/setup', {}, l.cookie);
  const enable = await api('POST', '/2fa/enable', { code: totp(setup.json.manualKey, 0), password: PW }, l.cookie);
  return { cookie: l.cookie!, secret: setup.json.manualKey as string, codes: enable.json.recoveryCodes as string[], setup, enable };
}
const challenge = async (email = 'alice@x.dz') => (await login(email)).json.sessionToken as string;
const verify = (code: string, sessionToken: string) => api('POST', '/mfa/verify', { code, sessionToken });

beforeEach(() => {
  for (const k of ['users', 'mfa', 'codes', 'uses', 'audit'] as const) (S as any)[k].length = 0;
  S.seq = 0; logs = [];
  process.env.MFA_ENABLED = 'true'; process.env.MFA_ENCRYPTION_KEY = TEST_KEY; process.env.MFA_MAX_FAILURES = '3'; process.env.MFA_LOCK_MINUTES = '15';
  const hash = bcrypt.hashSync(PW, 4);
  const u = (id: string, email: string, over: any = {}) => S.users.push({ id, email, displayName: `N ${id}`, role: 'DOCTOR', passwordHash: hash, deactivatedAt: null, passwordChangedAt: null, ...over });
  u('u1', 'alice@x.dz'); u('u2', 'bob@x.dz'); u('u3', 'gone@x.dz', { deactivatedAt: new Date('2026-01-01') });
  vi.useFakeTimers({ toFake: ['Date'] }); setT(0);
  for (const k of ['log', 'info', 'warn', 'error'] as const) spies.push(vi.spyOn(console, k).mockImplementation((...a: any[]) => { logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); }));
});

describe('login sans 2FA : strictement inchangé', () => {
  it('cookie httpOnly posé, mfaRequired:false, pas de sessionToken ; /session expose twoFactorEnabled:false (additif)', async () => {
    const r = await login();
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ success: true, mfaRequired: false });
    expect(r.setCookie).toMatch(/vg_session=.+HttpOnly/i);
    const s = await sessionOf(r.cookie);
    expect(s.json.user).toMatchObject({ id: 'u1', email: 'alice@x.dz', role: 'DOCTOR', isPlatformAdmin: false, twoFactorEnabled: false });
  });
  it('erreurs d\'origine : mauvais mot de passe / e-mail inconnu = même 401, compte désactivé = 403', async () => {
    const a = await login('alice@x.dz', 'faux'); const b = await login('nobody@x.dz', 'faux');
    expect(a.status).toBe(401); expect(a.json).toEqual(b.json);
    expect((await login('gone@x.dz')).status).toBe(403);
  });
  it('/mfa/verify avec la fonction désactivée : 501 d\'origine ; /2fa/* : 404 ; login ignore le 2FA (retour arrière)', async () => {
    const { codes: _c } = await activate();
    process.env.MFA_ENABLED = 'false';
    expect(await verify('123456', 'x')).toMatchObject({ status: 501, json: { success: false, message: 'MFA is not available yet.' } });
    const l = await login();
    expect(l.json).toEqual({ success: true, mfaRequired: false });
    expect(l.cookie).toBeTruthy();
    expect((await sessionOf(l.cookie)).json.user.twoFactorEnabled).toBe(false);
    expect(await api('POST', '/2fa/setup', {}, l.cookie)).toMatchObject({ status: 404, json: { code: 'MFA_DISABLED' } });
    expect((await api('GET', '/2fa/status', undefined, l.cookie)).json).toMatchObject({ available: false, enabled: false });
  });
});

describe('setup / enable', () => {
  it('setup : QR + URI otpauth ; secret chiffré au repos ; rien n\'est activé', async () => {
    const l = await login();
    expect((await api('POST', '/2fa/setup', {})).status).toBe(401);
    const r = await api('POST', '/2fa/setup', {}, l.cookie);
    expect(r.status).toBe(200);
    expect(r.json.otpauthUrl).toMatch(/^otpauth:\/\/totp\/VigiCore:alice%40x\.dz\?.*secret=/);
    expect(r.json.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    const secret = r.json.manualKey;
    expect(S.mfa[0].secretEnc).toMatch(/^v1\./);
    expect(S.mfa[0].secretEnc).not.toContain(secret);
    expect(JSON.stringify(S.mfa)).not.toContain(secret);
    expect(decryptSecret(S.mfa[0].secretEnc, 'u1', Buffer.from(TEST_KEY, 'base64'))).toBe(secret);
    expect(() => decryptSecret(S.mfa[0].secretEnc, 'u2', Buffer.from(TEST_KEY, 'base64'))).toThrow(); // lié au compte (AAD)
    expect(S.mfa[0].enabledAt).toBeNull();
    expect((await login()).json).toEqual({ success: true, mfaRequired: false }); // pas encore actif
    expect((await api('GET', '/2fa/status', undefined, l.cookie)).json).toMatchObject({ available: true, enabled: false, pending: true });
  });
  it('enable : mauvais code, mauvais mot de passe (même réponse), puis succès avec 10 codes hachés', async () => {
    const l = await login();
    const secret = (await api('POST', '/2fa/setup', {}, l.cookie)).json.manualKey;
    const badCode = await api('POST', '/2fa/enable', { code: '000000', password: PW }, l.cookie);
    const badPw = await api('POST', '/2fa/enable', { code: totp(secret, 0), password: 'faux' }, l.cookie);
    expect(badCode.status).toBe(401); expect(badPw.status).toBe(401);
    expect(badCode.json).toEqual(badPw.json);
    expect(S.mfa[0].enabledAt).toBeNull();
    const ok = await api('POST', '/2fa/enable', { code: totp(secret, 0), password: PW }, l.cookie);
    expect(ok.status).toBe(200);
    expect(ok.json.recoveryCodes).toHaveLength(10);
    expect(new Set(ok.json.recoveryCodes).size).toBe(10);
    ok.json.recoveryCodes.forEach((c: string) => expect(c).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/));
    expect(ok.json.secret).toBeUndefined(); expect(ok.text).not.toContain(secret);
    expect(S.codes).toHaveLength(10);
    for (const c of S.codes) { expect(c.codeHash).toMatch(/^[0-9a-f]{64}$/); expect(ok.json.recoveryCodes).not.toContain(c.codeHash); expect(c.codeHash).not.toContain(normalizeRecovery(ok.json.recoveryCodes[0])!); }
    expect(S.audit.map((a) => a.action)).toEqual(['Authentification à deux facteurs activée']);
    expect(S.audit[0]).toMatchObject({ refType: 'user', refId: 'u1', actorUserId: 'u1' });
    expect((await api('POST', '/2fa/enable', {}, l.cookie)).status).toBe(409);   // plus en attente
    expect((await api('POST', '/2fa/setup', {}, l.cookie)).status).toBe(409);    // déjà actif
    expect((await api('GET', '/2fa/status', undefined, l.cookie)).json).toMatchObject({ enabled: true, pending: false, recoveryCodesRemaining: 10 });
    expect((await sessionOf(l.cookie)).json.user.twoFactorEnabled).toBe(true);
  });
  it('clé de chiffrement absente/invalide : setup refusé (503), jamais de secret en clair', async () => {
    const l = await login();
    for (const bad of ['', 'pas-du-base64!!', Buffer.alloc(16, 1).toString('base64')]) {
      process.env.MFA_ENCRYPTION_KEY = bad;
      expect(await api('POST', '/2fa/setup', {}, l.cookie)).toMatchObject({ status: 503, json: { code: 'MFA_KEY_MISSING' } });
    }
    expect(S.mfa).toHaveLength(0);
  });
});

describe('login avec 2FA', () => {
  it('NE pose PAS le cookie de session ; renvoie mfaRequired + sessionToken', async () => {
    await activate(); setT(60);
    const r = await login();
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ success: true, mfaRequired: true });
    expect(typeof r.json.sessionToken).toBe('string');
    expect(r.setCookie).toBeNull();
  });
  it('le sessionToken n\'est JAMAIS accepté comme session (cookie), ni un jeton forgé portant purpose/aud', async () => {
    await activate(); setT(60);
    const tok = await challenge();
    expect((await sessionOf(`vg_session=${tok}`)).json.user).toBeNull();
    const withPurpose = jwt.sign({ userId: 'u1', purpose: 'mfa' }, 'test-secret', { expiresIn: 300 });
    const withAud = jwt.sign({ userId: 'u1' }, 'test-secret', { expiresIn: 300, audience: 'vigicore:mfa' });
    expect((await sessionOf(`vg_session=${withPurpose}`)).json.user).toBeNull();
    expect((await sessionOf(`vg_session=${withAud}`)).json.user).toBeNull();
    // et l'inverse : un cookie de session valide n'est pas un défi
    const real = (await sessionOf(undefined)); expect(real.json.user).toBeNull();
    const sess = jwt.sign({ userId: 'u1' }, 'test-secret', { expiresIn: 300 });
    expect((await verify('123456', sess)).status).toBe(401);
    expect((await verify('123456', withPurpose)).status).toBe(401); // signé avec la clé de session, pas la clé de défi
  });
  it('compte avec 2FA mais clé absente : 503, ni cookie ni défi (jamais de contournement)', async () => {
    await activate(); setT(60);
    process.env.MFA_ENCRYPTION_KEY = '';
    const r = await login();
    expect(r.status).toBe(503); expect(r.setCookie).toBeNull(); expect(r.json.sessionToken).toBeUndefined();
  });
});

describe('/mfa/verify : TOTP', () => {
  it('code valide => cookie de session + accès ; 2 champs obligatoires', async () => {
    const a = await activate(); setT(60);
    expect((await api('POST', '/mfa/verify', { code: '123456' })).status).toBe(400);
    const v = await verify(totp(a.secret, 60), await challenge());
    expect(v.status).toBe(200); expect(v.json).toEqual({ success: true });
    expect(v.cookie).toBeTruthy();
    expect((await sessionOf(v.cookie)).json.user).toMatchObject({ id: 'u1', twoFactorEnabled: true });
  });
  it('mauvais code : 401 sans cookie ; code expiré (hors fenêtre ±1 pas) refusé ; pas précédent accepté', async () => {
    process.env.MFA_MAX_FAILURES = '10';
    const a = await activate(); setT(120);
    const bad = await verify('000000', await challenge());
    expect(bad.status).toBe(401); expect(bad.setCookie).toBeNull();
    expect((await verify(totp(a.secret, -300), await challenge())).status).toBe(401);  // vieux de 5 min
    expect((await verify(totp(a.secret, 120 - 60), await challenge())).status).toBe(401); // 2 pas avant
    expect((await verify(totp(a.secret, 120 - 30), await challenge())).status).toBe(200); // 1 pas avant (fenêtre ±1)
  });
  it('REJEU : le même code (même pas) refusé sur une 2e connexion ; le pas suivant passe', async () => {
    const a = await activate(); setT(60);
    const code = totp(a.secret, 60);
    expect((await verify(code, await challenge())).status).toBe(200);
    const replay = await verify(code, await challenge());
    expect(replay.status).toBe(401); expect(replay.setCookie).toBeNull();
    setT(90);
    expect((await verify(totp(a.secret, 90), await challenge())).status).toBe(200);
  });
  it('défi expiré (5 min), défi déjà utilisé, défi forgé : refusés', async () => {
    const a = await activate(); setT(60);
    const old = await challenge();
    setT(60 + 301);
    expect(await verify(totp(a.secret, 361), old)).toMatchObject({ status: 401, json: { code: 'CHALLENGE_INVALID' } });
    const tok = await challenge();
    expect((await verify(totp(a.secret, 361), tok)).status).toBe(200);
    setT(361 + 30);
    expect(await verify(totp(a.secret, 391), tok)).toMatchObject({ status: 401, json: { code: 'CHALLENGE_INVALID' } }); // usage unique
    expect((await verify('123456', 'n.importe.quoi')).status).toBe(401);
  });
  it('mot de passe changé après le défi => défi invalide ; compte désactivé après le défi => 403', async () => {
    const a = await activate(); setT(60);
    const tok = await challenge();
    setT(65); S.users[0].passwordChangedAt = new Date(T0 + 65_000);
    expect((await verify(totp(a.secret, 65), tok)).status).toBe(401);
    S.users[0].passwordChangedAt = null;
    const tok2 = await challenge(); S.users[0].deactivatedAt = new Date();
    expect((await verify(totp(a.secret, 65), tok2)).status).toBe(403);
  });
});

describe('verrouillage anti-force-brute', () => {
  it('après 3 échecs : 429 même avec le bon code ; levé après 15 min ; autre compte non affecté ; audité sans code', async () => {
    const a = await activate(); setT(60);
    for (let i = 0; i < 3; i++) expect((await verify('000000', await challenge())).status).toBe(401);
    const locked = await verify(totp(a.secret, 60), await challenge());
    expect(locked).toMatchObject({ status: 429, json: { code: 'MFA_LOCKED' } }); expect(locked.setCookie).toBeNull();
    expect(S.audit.some((x) => x.action.includes('verrouillé'))).toBe(true);
    expect(JSON.stringify(S.audit)).not.toMatch(/000000/);
    expect((await login('bob@x.dz')).json.mfaRequired).toBe(false);
    setT(60 + 16 * 60);
    expect((await verify(totp(a.secret, 60 + 16 * 60), await challenge())).status).toBe(200);
  });
  it('un succès remet le compteur à zéro', async () => {
    const a = await activate(); setT(60);
    await verify('000000', await challenge()); await verify('000000', await challenge());
    expect((await verify(totp(a.secret, 60), await challenge())).status).toBe(200);
    setT(90);
    await verify('000000', await challenge()); await verify('000000', await challenge());
    expect((await verify(totp(a.secret, 90), await challenge())).status).toBe(200); // pas de verrouillage : compteur remis à 0
  });
});

describe('codes de récupération', () => {
  it('usage unique, tolère minuscules/espaces/tiret ; compteur décrémenté ; connexion auditée sans le code', async () => {
    const a = await activate(); setT(60);
    const code = a.codes[0];
    const v = await verify(code.toLowerCase().replace('-', ' '), await challenge());
    expect(v.status).toBe(200); expect(v.cookie).toBeTruthy();
    const again = await verify(code, await challenge());
    expect(again.status).toBe(401); expect(again.setCookie).toBeNull();
    expect((await api('GET', '/2fa/status', undefined, v.cookie)).json.recoveryCodesRemaining).toBe(9);
    expect(JSON.stringify(S.audit)).not.toContain(code);
    expect(S.audit.some((x) => x.action.includes('code de récupération'))).toBe(true);
  });
  it('un code inconnu ou mal formé est refusé', async () => {
    await activate(); setT(60);
    expect((await verify('AAAAA-BBBBB', await challenge())).status).toBe(401);
    expect((await verify('1234', await challenge())).status).toBe(401);
  });
});

describe('disable / régénération', () => {
  it('disable : mot de passe ET code exigés, réponses identiques ; succès => retour au login sans 2FA, tables vidées, audit', async () => {
    process.env.MFA_MAX_FAILURES = '10';
    const a = await activate(); setT(60);
    const wrongPw = await api('POST', '/2fa/disable', { password: 'faux', code: totp(a.secret, 60) }, a.cookie);
    setT(90);
    const wrongCode = await api('POST', '/2fa/disable', { password: PW, code: '000000' }, a.cookie);
    expect(wrongPw.status).toBe(401); expect(wrongPw.json).toEqual(wrongCode.json);
    expect((await api('POST', '/2fa/disable', { password: PW }, a.cookie)).status).toBe(401);
    expect(S.mfa).toHaveLength(1);
    setT(120);
    const ok = await api('POST', '/2fa/disable', { password: PW, code: totp(a.secret, 120) }, a.cookie);
    expect(ok.status).toBe(200);
    expect(S.mfa).toHaveLength(0); expect(S.codes).toHaveLength(0);
    expect(S.audit.map((x) => x.action)).toContain('Authentification à deux facteurs désactivée');
    expect((await login()).json).toEqual({ success: true, mfaRequired: false });
  });
  it('disable accepte un code de récupération ; 409 si le 2FA n\'est pas activé', async () => {
    const a = await activate();
    expect((await api('POST', '/2fa/disable', { password: PW, code: a.codes[3] }, a.cookie)).status).toBe(200);
    expect((await api('POST', '/2fa/disable', { password: PW, code: '123456' }, a.cookie)).status).toBe(409);
  });
  it('régénération : mot de passe + TOTP (un code de récupération ne suffit pas) ; anciens codes invalidés', async () => {
    const a = await activate(); setT(60);
    expect((await api('POST', '/2fa/recovery-codes/regenerate', { password: PW, code: a.codes[0] }, a.cookie)).status).toBe(401);
    const r = await api('POST', '/2fa/recovery-codes/regenerate', { password: PW, code: totp(a.secret, 60) }, a.cookie);
    expect(r.status).toBe(200); expect(r.json.recoveryCodes).toHaveLength(10);
    expect(r.json.recoveryCodes.some((c: string) => a.codes.includes(c))).toBe(false);
    expect(S.codes).toHaveLength(10);
    expect((await verify(a.codes[1], await challenge())).status).toBe(401);            // ancien : invalide
    expect((await verify(r.json.recoveryCodes[0], await challenge())).status).toBe(200); // nouveau : valide
    expect(S.audit.map((x) => x.action)).toContain('Authentification à deux facteurs : codes de récupération régénérés');
  });
});

describe('secret jamais exposé, isolation entre utilisateurs', () => {
  it('ni les réponses (après enable), ni les logs, ni l\'audit ne contiennent le secret, les codes TOTP ou de récupération', async () => {
    const a = await activate(); setT(60);
    const texts: string[] = [];
    const tok = await login(); texts.push(tok.text);
    const v = await verify(totp(a.secret, 60), tok.json.sessionToken); texts.push(v.text);
    texts.push((await api('GET', '/2fa/status', undefined, v.cookie)).text, (await sessionOf(v.cookie)).text);
    await verify('654321', await challenge());
    const dis = await api('POST', '/2fa/disable', { password: PW, code: a.codes[0] }, v.cookie); texts.push(dis.text);
    const all = texts.join('\n') + '\n' + logs.join('\n') + '\n' + JSON.stringify(S.audit);
    for (const secretish of [a.secret, ...a.codes, '654321', totp(a.secret, 60), PW]) expect(all).not.toContain(secretish);
  });
  it('isolation : bob ne touche pas le 2FA d\'alice ; le défi d\'alice + le code de bob est refusé ; le statut est personnel', async () => {
    const a = await activate(); setT(60);
    const b = await login('bob@x.dz');
    expect((await api('POST', '/2fa/disable', { password: PW, code: totp(a.secret, 60) }, b.cookie)).status).toBe(409);
    expect((await api('GET', '/2fa/status', undefined, b.cookie)).json).toMatchObject({ enabled: false });
    const bs = await api('POST', '/2fa/setup', {}, b.cookie);
    expect(S.mfa.map((r) => r.userId).sort()).toEqual(['u1', 'u2']);
    expect((await verify(totp(bs.json.manualKey, 60), await challenge('alice@x.dz'))).status).toBe(401);
    expect(S.mfa.find((r) => r.userId === 'u1').enabledAt).toBeTruthy();
  });
});
