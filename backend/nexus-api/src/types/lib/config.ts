/**
 * Startup configuration validation. In production the server REFUSES to start with
 * missing/placeholder secrets or unsafe settings; in development it only warns.
 * Values are never printed — only variable names and the reason.
 */
const PLACEHOLDER_RE = /(change[-_ ]?me|replace[-_ ]?me|your[-_ ]|example|placeholder|dev[-_ ]?secret|secret123|password|xxxx|todo|test)/i;

export interface ConfigReport {
  errors: string[];
  warnings: string[];
}

const isHttps = (u: string) => /^https:\/\//i.test(u);
const isLocal = (u: string) => /(localhost|127\.0\.0\.1|\[::1\])/i.test(u);
/** Docker/compose service name (single label, no dot: "audit-api"): reachable only on the private network, never on the internet. */
const isInternalHost = (u: string) => {
  try { const h = new URL(u).hostname; return !!h && !h.includes('.') && !h.includes(':'); } catch { return false; }
};

export function isProduction(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === 'production';
}

export function looksLikePlaceholder(v: string | undefined) {
  return !v || !v.trim() || PLACEHOLDER_RE.test(v);
}

/** Pure function (testable): returns problems, throws nothing. */
export function checkConfig(env: NodeJS.ProcessEnv = process.env): ConfigReport {
  const prod = isProduction(env);
  const errors: string[] = [];
  const warnings: string[] = [];
  const problem = (msg: string, severeInProd = true) => (prod && severeInProd ? errors : warnings).push(msg);

  const jwt = env.JWT_SECRET ?? '';
  if (!jwt) errors.push('JWT_SECRET is missing.');
  else if (looksLikePlaceholder(jwt) || jwt.length < 32) problem('JWT_SECRET is a placeholder or shorter than 32 characters (generate one: openssl rand -hex 32).');

  const db = env.DATABASE_URL ?? '';
  if (!db) errors.push('DATABASE_URL is missing.');
  else if (prod && /^file:/i.test(db)) errors.push('DATABASE_URL points to SQLite (file:). Production requires PostgreSQL — see docs/DEPLOYMENT.md (migration path).');

  const cors = env.CORS_ORIGIN ?? '';
  if (prod) {
    if (!cors) errors.push('CORS_ORIGIN is missing (set the exact public https origin of the site).');
    else if (cors.split(',').some((o) => !isHttps(o.trim()) || isLocal(o))) errors.push('CORS_ORIGIN must be https and not localhost in production.');
  }

  const admins = (env.PLATFORM_ADMIN_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (prod) {
    if (!admins.length) warnings.push('PLATFORM_ADMIN_EMAILS is empty: nobody can confirm payments.');
    if (admins.some((e) => /@demo\.|@example\.|\.invalid$|\.test$/i.test(e))) errors.push('PLATFORM_ADMIN_EMAILS contains a demo/example address.');
  }

  const audit = !!env.AUDIT_BASE_URL;
  const nexus = env.NEXUS_SERVICE_JWT_SECRET ?? '';
  if (audit !== !!nexus) problem('AUDIT_BASE_URL and NEXUS_SERVICE_JWT_SECRET must be set together (external declarations stay disabled otherwise).', false);
  if (nexus && (nexus.length < 32 || looksLikePlaceholder(nexus))) problem('NEXUS_SERVICE_JWT_SECRET is a placeholder or shorter than 32 characters.');
  if (env.MARKET_DEMO_OFFERS === 'true') problem('MARKET_DEMO_OFFERS=true: orders on demo offers are SIMULATED and never reach Audit (the commercial sees nothing). Set it to false outside local tests.');
  if (prod && audit && !isHttps(env.AUDIT_BASE_URL!) && !isLocal(env.AUDIT_BASE_URL!) && !isInternalHost(env.AUDIT_BASE_URL!)) problem('AUDIT_BASE_URL should be https in production.');

  if (prod) {
    if (!env.SMTP_HOST || !env.MAIL_FROM) warnings.push('SMTP_HOST / MAIL_FROM not set: password-reset and contact emails are DISABLED (endpoints answer 503).');
    if (!env.APP_BASE_URL) warnings.push('APP_BASE_URL not set: password-reset links cannot be built (reset disabled).');
    else if (!isHttps(env.APP_BASE_URL)) errors.push('APP_BASE_URL must be https in production.');
    if (!env.ANTHROPIC_API_KEY) warnings.push('ANTHROPIC_API_KEY not set: AI listing assistant disabled.');
    if (!env.BRIA_API_TOKEN) warnings.push('BRIA_API_TOKEN not set: cloud background removal disabled.');
    if (!env.TURN_URLS) warnings.push('TURN_URLS not set: calls may fail behind strict NAT.');
    if (!env.TRUST_PROXY) warnings.push('TRUST_PROXY not set: client IPs (rate limiting) are the proxy IP if you run behind a reverse proxy.');
  }

  const anyPay = env.PAYMENT_CCP_ACCOUNT || env.PAYMENT_BANK_RIB;
  if (anyPay && !env.PAYMENT_BENEFICIARY?.trim()) problem('PAYMENT_BENEFICIARY must be set when a payment account is configured.');
  const sellerMissing = ['INVOICE_SELLER_NAME', 'INVOICE_SELLER_ADDRESS', 'INVOICE_SELLER_NIF', 'INVOICE_SELLER_RC', 'INVOICE_SELLER_NIS'].filter((k) => !env[k]?.trim());
  if (prod && sellerMissing.length) warnings.push(`Invoices are BLOCKED until set: ${sellerMissing.join(', ')}.`);

  return { errors, warnings };
}

export function validateConfigOrExit(env: NodeJS.ProcessEnv = process.env) {
  const { errors, warnings } = checkConfig(env);
  for (const w of warnings) console.warn(`[config] WARNING: ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`[config] ERROR: ${e}`);
    console.error('[config] Refusing to start with an invalid configuration.');
    process.exit(1);
  }
}

/** TRUST_PROXY: number of proxy hops ("1"), "loopback", or a CIDR list. Unset = do not trust. */
export function parseTrustProxy(v: string | undefined): number | string | false {
  if (!v) return false;
  return /^\d+$/.test(v.trim()) ? Number(v.trim()) : v.trim();
}
