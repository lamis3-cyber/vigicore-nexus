/**
 * 2FA TOTP (opt-in) — logique métier. Le secret n'est jamais journalisé ni renvoyé après l'activation ;
 * les erreurs ne contiennent aucun code, secret ni donnée de compte (describeError/safeLog côté appelant).
 * Verrouillage : après MFA_MAX_FAILURES échecs (défaut 5), le compte refuse tout second facteur pendant
 * MFA_LOCK_MINUTES (défaut 15). Le compteur ne s'applique qu'à une personne DÉJÀ authentifiée (mot de passe ou
 * jeton de défi valide) : il ne permet pas d'énumérer des comptes.
 */
import { verifySync } from 'otplib';
import { verifyPassword } from '../lib/password';
import { decryptSecret, hashRecovery, normalizeRecovery, parseMfaKey, safeEqualHex } from '../lib/mfaCrypto';
import { describeError } from '../lib/safeLog';

export const MFA_ISSUER = 'VigiCore';
const TOTP_RE = /^\d{6}$/;

export interface MfaConfig { enabled: boolean; keyOk: boolean; available: boolean; maxFailures: number; lockMs: number }

const intIn = (v: string | undefined, def: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.floor(n) : def;
};

/** `enabled` = MFA_ENABLED === 'true' (défaut : désactivé => comportement strictement identique à avant). */
export function mfaConfig(env: Record<string, string | undefined> = process.env): MfaConfig {
  const enabled = env.MFA_ENABLED === 'true';
  const keyOk = parseMfaKey(env) !== null;
  return { enabled, keyOk, available: enabled && keyOk, maxFailures: intIn(env.MFA_MAX_FAILURES, 5, 3, 20), lockMs: intIn(env.MFA_LOCK_MINUTES, 15, 1, 1440) * 60_000 };
}

/** Fenêtre ±1 pas de 30 s. Renvoie le pas TOTP réellement accepté (pour l'anti-rejeu) ou null. */
export function checkTotp(secret: string, token: string, now: Date): { step: number } | null {
  if (!TOTP_RE.test(token)) return null;
  const r = verifySync({ secret, token, epoch: Math.floor(now.getTime() / 1000), epochTolerance: 30 });
  if (!r.valid) return null;
  // `timeStep` = pas du code réellement accepté (type union côté otplib : lu via un cast, repli sur l'époque / 30 s).
  const v = r as { timeStep?: number; epoch?: number };
  return { step: v.timeStep ?? Math.floor((v.epoch ?? Math.floor(now.getTime() / 1000)) / 30) };
}

export type SecondFactor = { ok: true; method: 'totp' | 'recovery' } | { ok: false; reason: 'invalid' | 'locked' | 'unavailable' };

export interface SecondFactorOpts {
  now?: Date;
  env?: Record<string, string | undefined>;
  allowPending?: boolean;   // vrai pour /2fa/enable (secret pas encore confirmé)
  allowRecovery?: boolean;  // vrai pour /mfa/verify et /2fa/disable
  actor?: { id: string; displayName: string }; // pour l'audit du verrouillage
}

async function registerFailure(db: any, row: any, now: Date, cfg: MfaConfig, opts: SecondFactorOpts) {
  const failed = (row.failedAttempts ?? 0) + 1;
  const lock = failed >= cfg.maxFailures;
  await db.userMfa.update({ where: { userId: row.userId }, data: { failedAttempts: lock ? 0 : failed, lockedUntil: lock ? new Date(now.getTime() + cfg.lockMs) : row.lockedUntil ?? null } });
  if (lock && opts.actor) {
    // Meilleur effort : un échec d'audit ne doit pas empêcher le verrouillage lui-même. Aucun code/secret dans la trace.
    await db.auditEntry.create({ data: { actorUserId: opts.actor.id, actorName: opts.actor.displayName, establishmentId: null, refType: 'user', refId: opts.actor.id, action: 'Authentification à deux facteurs : compte verrouillé temporairement (échecs répétés)' } })
      .catch((err: unknown) => console.error('[mfa] lock audit failed:', describeError(err)));
  }
}

/** Vérifie un second facteur (TOTP, ou code de récupération si autorisé). Ne lève pas pour un code faux. */
export async function verifySecondFactor(db: any, userId: string, rawCode: unknown, opts: SecondFactorOpts = {}): Promise<SecondFactor> {
  const now = opts.now ?? new Date();
  const cfg = mfaConfig(opts.env);
  const key = parseMfaKey(opts.env);
  const row: any = await db.userMfa.findUnique({ where: { userId } });
  if (!row || (!row.enabledAt && !opts.allowPending)) return { ok: false, reason: 'invalid' };
  if (row.lockedUntil && new Date(row.lockedUntil).getTime() > now.getTime()) return { ok: false, reason: 'locked' };
  if (!key) return { ok: false, reason: 'unavailable' };
  const code = typeof rawCode === 'string' ? rawCode.trim() : '';
  const bad = async (): Promise<SecondFactor> => { await registerFailure(db, row, now, cfg, opts); return { ok: false, reason: 'invalid' }; };

  if (TOTP_RE.test(code.replace(/\s/g, ''))) {
    let secret: string;
    try { secret = decryptSecret(row.secretEnc, userId, key); } catch { return { ok: false, reason: 'unavailable' }; }
    const hit = checkTotp(secret, code.replace(/\s/g, ''), now);
    if (!hit) return bad();
    // Anti-rejeu : un pas déjà accepté (ou plus ancien) est refusé ; la mise à jour est conditionnelle au dernier pas lu.
    if (row.lastUsedStep != null && hit.step <= row.lastUsedStep) return bad();
    const upd = await db.userMfa.updateMany({ where: { userId, lastUsedStep: row.lastUsedStep ?? null }, data: { lastUsedStep: hit.step, failedAttempts: 0, lockedUntil: null } });
    if (!upd.count) return bad();
    return { ok: true, method: 'totp' };
  }

  if (opts.allowRecovery && row.enabledAt) {
    const norm = normalizeRecovery(code);
    if (!norm) return bad();
    const hash = hashRecovery(norm, key);
    const rows: any[] = await db.userMfaRecoveryCode.findMany({ where: { userId, usedAt: null } });
    let hit: any = null;
    for (const r of rows) if (safeEqualHex(r.codeHash, hash) && !hit) hit = r; // pas de sortie anticipée : temps constant
    if (!hit) return bad();
    const used = await db.userMfaRecoveryCode.updateMany({ where: { id: hit.id, usedAt: null }, data: { usedAt: now } });
    if (!used.count) return bad();
    await db.userMfa.update({ where: { userId }, data: { failedAttempts: 0, lockedUntil: null } });
    return { ok: true, method: 'recovery' };
  }
  return bad();
}

export type Gate = { ok: true; method: 'totp' | 'recovery' } | { ok: false; status: 401 | 429 | 503; code: string; message: string };

/**
 * Mot de passe ET second facteur doivent être justes : la réponse ne dit jamais lequel des deux était faux.
 */
export async function checkPasswordAndCode(db: any, user: { id: string; displayName: string; passwordHash: string }, password: unknown, code: unknown, opts: SecondFactorOpts = {}): Promise<Gate> {
  const now = opts.now ?? new Date();
  const cfg = mfaConfig(opts.env);
  const actorOpts = { ...opts, actor: { id: user.id, displayName: user.displayName } };
  const row: any = await db.userMfa.findUnique({ where: { userId: user.id } });
  if (row?.lockedUntil && new Date(row.lockedUntil).getTime() > now.getTime()) return { ok: false, status: 429, code: 'MFA_LOCKED', message: 'Too many attempts. Try again later.' };
  const pwOk = typeof password === 'string' && password.length > 0 && (await verifyPassword(password, user.passwordHash));
  const generic: Gate = { ok: false, status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid password or code.' };
  if (!pwOk) {
    // Mot de passe faux : échec compté, MAIS le code n'est pas consommé (un TOTP juste n'est pas « brûlé » par une faute de frappe).
    // La réponse est identique à celle d'un code faux : elle ne dit jamais lequel des deux était incorrect.
    if (row) await registerFailure(db, row, now, cfg, actorOpts);
    return generic;
  }
  const sf = await verifySecondFactor(db, user.id, code, actorOpts);
  if (sf.ok) return { ok: true, method: sf.method };
  if (sf.reason === 'locked') return { ok: false, status: 429, code: 'MFA_LOCKED', message: 'Too many attempts. Try again later.' };
  if (sf.reason === 'unavailable') return { ok: false, status: 503, code: 'MFA_UNAVAILABLE', message: 'Two-factor authentication is temporarily unavailable.' };
  return generic;
}
