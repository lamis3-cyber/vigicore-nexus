/**
 * Primitives cryptographiques du 2FA TOTP (aucune dépendance Prisma/Express, testables seules).
 *  - secret TOTP chiffré au repos : AES-256-GCM, clé MFA_ENCRYPTION_KEY (32 octets en base64), AAD = id utilisateur
 *    (un blob copié sur un autre compte ne se déchiffre pas) ; préfixe « v1 » réservé à une future rotation de clé ;
 *  - codes de récupération : HMAC-SHA256 avec une clé dérivée (une fuite de la base seule ne permet aucune attaque hors ligne) ;
 *  - jeton de défi MFA : signé avec une clé DÉRIVÉE de JWT_SECRET (≠ clé des sessions) + audience dédiée + claim purpose.
 *    Il ne peut donc pas être accepté comme session, même placé dans le cookie.
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const b64u = (b: Buffer) => b.toString('base64url');

/** Clé de chiffrement valide (exactement 32 octets une fois décodée) ou null : le 2FA refuse alors de s'activer (fail closed). */
export function parseMfaKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const raw = env.MFA_ENCRYPTION_KEY?.trim();
  if (!raw || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(raw)) return null;
  const key = Buffer.from(raw, 'base64');
  return key.length === 32 ? key : null;
}

export function encryptSecret(plain: string, userId: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(userId, 'utf8'));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `v1.${b64u(iv)}.${b64u(c.getAuthTag())}.${b64u(ct)}`;
}

/** Lève une erreur si le blob est altéré, d'une autre version, ou appartient à un autre utilisateur. */
export function decryptSecret(blob: string, userId: string, key: Buffer): string {
  const [v, iv, tag, ct] = String(blob).split('.');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('MFA_SECRET_FORMAT');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAAD(Buffer.from(userId, 'utf8'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

// ── Codes de récupération ────────────────────────────────────────────────
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // sans I, L, O, U, 0, 1 (lisibles à la main)
const RECOVERY_LEN = 10;

export function generateRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const s = Array.from({ length: RECOVERY_LEN }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

/** Forme canonique (majuscules, sans espaces ni tirets) ; null si ce ne peut pas être un code de récupération. */
export function normalizeRecovery(input: string): string | null {
  const s = String(input).toUpperCase().replace(/[\s-]/g, '');
  return s.length === RECOVERY_LEN && [...s].every((ch) => ALPHABET.includes(ch)) ? s : null;
}

export function hashRecovery(normalized: string, key: Buffer): string {
  const sub = crypto.createHmac('sha256', key).update('vigicore:mfa-recovery:v1').digest();
  return crypto.createHmac('sha256', sub).update(normalized).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex'); const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// ── Jeton de défi MFA (login → /mfa/verify) ──────────────────────────────
export const MFA_CHALLENGE_AUDIENCE = 'vigicore:mfa';
export const MFA_CHALLENGE_TTL_SECONDS = 300; // 5 min

function challengeKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set.');
  return crypto.createHmac('sha256', secret).update('vigicore:mfa-challenge:v1').digest();
}

export function signMfaChallenge(userId: string): string {
  return jwt.sign({ userId, purpose: 'mfa' }, challengeKey(), {
    algorithm: 'HS256', expiresIn: MFA_CHALLENGE_TTL_SECONDS, audience: MFA_CHALLENGE_AUDIENCE, jwtid: crypto.randomUUID(),
  });
}

export interface MfaChallenge { userId: string; jti: string; iat: number; exp: number }

export function verifyMfaChallenge(token: string): MfaChallenge | null {
  try {
    const p: any = jwt.verify(token, challengeKey(), { algorithms: ['HS256'], audience: MFA_CHALLENGE_AUDIENCE });
    if (p?.purpose !== 'mfa' || typeof p.userId !== 'string' || typeof p.jti !== 'string') return null;
    return { userId: p.userId, jti: p.jti, iat: p.iat, exp: p.exp };
  } catch {
    return null;
  }
}
