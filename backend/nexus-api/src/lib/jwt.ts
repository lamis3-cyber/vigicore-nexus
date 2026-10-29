import jwt from 'jsonwebtoken';
import type { CookieOptions } from 'express';

/**
 * Session strategy: a signed JWT carried in an httpOnly cookie.
 *
 * This is what src/lib/auth.js (frontend) already expects — every request
 * is sent with `credentials: 'include'` and the contract calls this "the
 * session cookie" throughout. A JWT is used only as the *encoding* of that
 * cookie's payload (so the server stays stateless — no session table needed
 * for Phase 1); the frontend never reads or stores the token itself.
 */

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    'JWT_SECRET is not set. Copy .env.example to .env and set a real secret before starting the server.'
  );
}

const COOKIE_NAME = 'vg_session';
const TOKEN_TTL = '7d';

export interface SessionPayload {
  userId: string;
  /** seconds since epoch, added by jsonwebtoken */
  iat?: number;
}

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: TOKEN_TTL });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET as string) as SessionPayload & { purpose?: unknown; aud?: unknown };
    // Défense en profondeur : un jeton à usage dédié (ex. défi MFA, purpose/aud) n'est JAMAIS accepté comme session.
    if (payload.purpose !== undefined || payload.aud !== undefined) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

export function sessionCookieOptions(): CookieOptions {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    // Cross-origin in dev (site on :5176, API on its own port); same-site
    // lax is enough once both are served from the same parent domain in
    // production. Flip to 'none' + secure if a cross-subdomain prod split
    // ever needs it.
    sameSite: isProd ? 'lax' : 'lax',
    secure: isProd,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, mirrors TOKEN_TTL
  };
}
