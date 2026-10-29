import { describe, it, expect, vi } from 'vitest';
vi.hoisted(() => { process.env.JWT_SECRET = 'test-secret'; });
vi.mock('../src/lib/prisma', () => ({ prisma: {} })); // pure-function tests: never open a database
import { checkConfig, parseTrustProxy } from '../src/lib/config';
import { missingInvoiceSellerFields } from '../src/routes/services.routes';
import { getPaymentMethods } from '../src/services/payments';

const good = {
  NODE_ENV: 'production', JWT_SECRET: 'a3f9c1d27b8e4f60918273645a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b',
  DATABASE_URL: 'postgresql://u:p@db:5432/nexus', CORS_ORIGIN: 'https://nexus.example.org',
  PLATFORM_ADMIN_EMAILS: 'ops@nexus.example.org', APP_BASE_URL: 'https://nexus.example.org',
} as NodeJS.ProcessEnv;

describe('production config validation', () => {
  it('accepts a coherent production config', () => expect(checkConfig(good).errors).toEqual([]));
  it.each([
    ['missing JWT_SECRET', { JWT_SECRET: '' }],
    ['placeholder JWT_SECRET', { JWT_SECRET: 'change-me-to-a-long-random-string-xxxxxxxxxxxx' }],
    ['short JWT_SECRET', { JWT_SECRET: 'abc123' }],
    ['SQLite in production', { DATABASE_URL: 'file:./dev.db' }],
    ['localhost / http CORS', { CORS_ORIGIN: 'http://localhost:5176' }],
    ['demo admin address', { PLATFORM_ADMIN_EMAILS: 'platform.admin@demo.vigicore.dz' }],
    ['http APP_BASE_URL', { APP_BASE_URL: 'http://nexus.example.org' }],
  ])('refuses to start: %s', (_n, patch) => expect(checkConfig({ ...good, ...patch }).errors.length).toBeGreaterThan(0));
  it('only warns in development', () => {
    const r = checkConfig({ NODE_ENV: 'development', JWT_SECRET: 'change-me', DATABASE_URL: 'file:./dev.db' } as any);
    expect(r.errors).toEqual([]); expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('never echoes secret values', () => {
    const r = checkConfig({ ...good, JWT_SECRET: 'change-me-SECRETVALUE' });
    expect(JSON.stringify(r)).not.toContain('SECRETVALUE');
  });
  it('flags half-configured Audit link and missing invoice identity', () => {
    const r = checkConfig({ ...good, AUDIT_BASE_URL: 'https://audit.example.org' });
    expect(r.errors.concat(r.warnings).join(' ')).toMatch(/AUDIT_BASE_URL and NEXUS_SERVICE_JWT_SECRET/);
    expect(r.warnings.join(' ')).toMatch(/Invoices are BLOCKED/);
  });
  it('accepts http to a private compose service for Audit, refuses http on a public host', () => {
    const secret = { NEXUS_SERVICE_JWT_SECRET: 'b4e8a1f0c3d2e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0' };
    expect(checkConfig({ ...good, ...secret, AUDIT_BASE_URL: 'http://audit-api:5100' }).errors).toEqual([]);
    expect(checkConfig({ ...good, ...secret, AUDIT_BASE_URL: 'http://audit.example.org' }).errors.join(' ')).toMatch(/https in production/);
  });
  it('parses TRUST_PROXY', () => {
    expect(parseTrustProxy(undefined)).toBe(false); expect(parseTrustProxy('1')).toBe(1); expect(parseTrustProxy('loopback')).toBe('loopback');
  });
});

describe('payments & invoices never use invented details', () => {
  it('lists every missing seller field, and none when complete', () => {
    expect(missingInvoiceSellerFields({} as any)).toHaveLength(5);
    expect(missingInvoiceSellerFields({ INVOICE_SELLER_NAME: 'A', INVOICE_SELLER_ADDRESS: 'B', INVOICE_SELLER_NIF: '1', INVOICE_SELLER_RC: '2', INVOICE_SELLER_NIS: '3' } as any)).toEqual([]);
  });
  it('transfer methods stay disabled without account AND beneficiary', () => {
    const m = (env: any) => getPaymentMethods(env).filter((x) => x.id !== 'EDAHABIA_CIB').map((x) => x.enabled);
    expect(m({})).toEqual([false, false]);
    expect(m({ PAYMENT_CCP_ACCOUNT: '123' })).toEqual([false, false]);
    expect(m({ PAYMENT_CCP_ACCOUNT: '123', PAYMENT_BENEFICIARY: 'Owner' })).toEqual([true, false]);
  });
});
