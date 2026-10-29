import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { isProduction } from './config';

/**
 * Security headers for the API (JSON). The SPA's own headers (CSP, COOP/COEP needed for
 * the WASM/ONNX threads used by the AI image tools) are set by the reverse proxy that
 * serves the static site — see deploy/Caddyfile / deploy/nginx.conf.
 * CORP is `same-site` so a cross-origin-isolated page (COEP: require-corp) on the same
 * site can still read credentialed API responses; CORS already gates other origins.
 */
export function securityHeaders(): RequestHandler {
  const prod = isProduction();
  return helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    hsts: prod ? { maxAge: 15552000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'no-referrer' },
  });
}

const json429 = { success: false, message: 'Too many requests. Please try again later.' };
const base = { standardHeaders: 'draft-7' as const, legacyHeaders: false, message: json429 };

/** login / signup / mfa: brute-force and enumeration brake. */
export const authLimiter = rateLimit({ ...base, windowMs: 15 * 60_000, limit: Number(process.env.RL_AUTH_MAX ?? 20) });
/** password reset (request + confirm): stricter. */
export const resetLimiter = rateLimit({ ...base, windowMs: 60 * 60_000, limit: Number(process.env.RL_RESET_MAX ?? 5) });
/** public contact form. */
export const contactLimiter = rateLimit({ ...base, windowMs: 60 * 60_000, limit: Number(process.env.RL_CONTACT_MAX ?? 5) });
/** activation d'organisation par code (Audit -> Site) : frein anti-devinette, par utilisateur. */
export const siteLinkLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60_000,
  limit: Number(process.env.RL_SITE_LINK_MAX ?? 10),
  keyGenerator: (req: any) => String(req.user?.id ?? req.ip),
  validate: { keyGeneratorIpFallback: false },
});
/** generous global brake on /api. */
export const apiLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: Number(process.env.RL_API_MAX ?? 600),
  skip: (req) => req.path.startsWith('/call/stream'), // long-lived SSE is not a burst
});

/**
 * Production only: refuse plain-HTTP API traffic (health probes excepted). `req.secure` is only reliable when
 * TRUST_PROXY matches the real proxy chain — that is why config.ts warns when it is unset in production.
 */
export const enforceHttps: RequestHandler = (req, res, next) => {
  if (!isProduction() || process.env.ENFORCE_HTTPS === 'false' || req.secure || req.path.startsWith('/health')) return next();
  if (req.method === 'GET' || req.method === 'HEAD') return res.redirect(308, `https://${req.hostname}${req.originalUrl}`);
  return res.status(400).json({ success: false, message: 'HTTPS is required.' });
};

/**
 * One JSON line per request: method, path WITHOUT query string (tokens/ids/search terms can sit there), status,
 * duration. No body, no headers, no cookies, no user identity: nothing that can carry health data or credentials.
 */
export const requestLog: RequestHandler = (req, res, next) => {
  if (!(isProduction() || process.env.LOG_REQUESTS === '1') || req.path.startsWith('/health')) return next();
  const t0 = process.hrtime.bigint();
  res.on('finish', () => {
    console.log(JSON.stringify({ t: new Date().toISOString(), m: req.method, p: req.path, s: res.statusCode, ms: Number((process.hrtime.bigint() - t0) / 1_000_000n) }));
  });
  next();
};
