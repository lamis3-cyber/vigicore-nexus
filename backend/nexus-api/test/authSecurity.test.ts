import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { vi } from 'vitest';
import type { AddressInfo } from 'net';

const h = vi.hoisted(() => { process.env.JWT_SECRET = 'test-secret'; process.env.RL_AUTH_MAX = '6'; return {}; });
vi.mock('../src/lib/prisma', async () => { const { makeAuthDb } = await import('./_authFake'); const f = makeAuthDb(); (globalThis as any).__db = f; return { prisma: f.prisma }; });
import { createApp } from '../src/app';

let server: any; let base: string;
beforeAll(() => { server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(() => server.close());
const post = (path: string, body: any) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('security headers', () => {
  it('sets helmet headers and hides x-powered-by', async () => {
    const r = await fetch(base + '/health');
    expect(r.headers.get('x-powered-by')).toBeNull();
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(r.headers.get('cross-origin-resource-policy')).toBe('same-site');
  });
  it('turns malformed JSON into 400 and an oversized body into 413 (not 500)', async () => {
    const bad = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
    expect(bad.status).toBe(400);
    const big = await post('/api/auth/login', { email: 'a@b.co', password: 'x'.repeat(4 * 1024 * 1024) });
    expect(big.status).toBe(413);
  });
});

describe('email normalization and database-level uniqueness', () => {
  it('stores trimmed lowercase, rejects invalid, treats case variants as the same account', async () => {
    const ok = await post('/api/auth/signup', { name: 'A', email: '  Dr.House@Example.ORG ', role: 'patient', password: 'longenough1' });
    expect(ok.status).toBe(201);
    expect((globalThis as any).__db.state.users[0].email).toBe('dr.house@example.org');
    expect((await post('/api/auth/signup', { name: 'B', email: 'DR.HOUSE@example.org', role: 'patient', password: 'longenough1' })).status).toBe(409);
    expect((await post('/api/auth/signup', { name: 'C', email: 'not-an-email', role: 'patient', password: 'longenough1' })).status).toBe(400);
    const login = await post('/api/auth/login', { email: 'DR.House@EXAMPLE.org ', password: 'longenough1' });
    expect(login.status).toBe(200);
  });
  it('a concurrent duplicate hitting the unique index (P2002) is a 409, not a 500', async () => {
    const { prisma } = (globalThis as any).__db;
    const real = prisma.user.findFirst; prisma.user.findFirst = async () => null; // both requests passed the pre-check
    const r = await post('/api/auth/signup', { name: 'D', email: 'dr.house@example.org', role: 'patient', password: 'longenough1' });
    prisma.user.findFirst = real;
    expect(r.status).toBe(409);
  });
});

describe('rate limiting on credential endpoints', () => {
  it('answers 429 after RL_AUTH_MAX attempts', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await post('/api/auth/login', { email: 'x@y.co', password: 'wrongwrong' })).status);
    expect(codes).toContain(429);
    expect(codes[0]).toBe(401);
  });
});
