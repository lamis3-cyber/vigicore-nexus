import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'net';
vi.hoisted(() => { process.env.JWT_SECRET = 'test-secret'; });
vi.mock('../src/lib/prisma', async () => { const { makeAuthDb } = await import('./_authFake'); return { prisma: makeAuthDb().prisma }; });
import { createApp } from '../src/app';
import { closeAllCallStreams } from '../src/routes/call.routes';

let server: any; let base: string; let cookie = '';
beforeAll(async () => {
  server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const r = await fetch(base + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Sse', email: 'sse@nexus.test', role: 'patient', password: 'longenough1' }) });
  cookie = (r.headers.getSetCookie()[0] || '').split(';')[0];
});
afterAll(() => server.close());

describe('SSE /api/call/stream', () => {
  it('requires a session', async () => expect((await fetch(base + '/api/call/stream')).status).toBe(401));

  it('streams with proxy-safe headers, then ends cleanly (event: bye) on graceful shutdown', async () => {
    const ctl = new AbortController();
    const r = await fetch(base + '/api/call/stream', { headers: { Cookie: cookie }, signal: ctl.signal });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/event-stream');
    expect(r.headers.get('x-accel-buffering')).toBe('no');          // nginx: do not buffer
    expect(r.headers.get('cache-control')).toMatch(/no-cache/);
    const reader = r.body!.getReader(); const dec = new TextDecoder();
    const first = dec.decode((await reader.read()).value);
    expect(first).toMatch(/retry:|hello/);                         // reconnect hint + hello frame
    closeAllCallStreams();
    let rest = ''; for (;;) { const { done, value } = await reader.read(); if (done) break; rest += dec.decode(value); }
    expect(rest).toContain('event: bye');                           // client (EventSource) auto-reconnects to the new instance
  });
});

describe('graceful shutdown', () => {
  it.each(['SIGTERM', 'SIGINT'] as const)('%s: drains and exits 0', async (sig) => {
    const env = { ...process.env, JWT_SECRET: 'test-secret', PORT: '0', NODE_ENV: 'development', DATABASE_URL: 'file:/tmp/none.db', AUDIT_BASE_URL: '', NEXUS_SERVICE_JWT_SECRET: '' };
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], { env, cwd: process.cwd() });
    let out = ''; child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', (d) => (out += d));
    for (let i = 0; i < 100 && !/listening/.test(out); i++) await new Promise((r) => setTimeout(r, 100));
    expect(out).toMatch(/listening/);
    const t0 = Date.now(); child.kill(sig);
    const code: number = await new Promise((res) => child.on('exit', (c) => res(c ?? -1)));
    expect(code).toBe(0); expect(out).toContain('[shutdown] done'); expect(Date.now() - t0).toBeLessThan(5000);
  }, 20000);
});
