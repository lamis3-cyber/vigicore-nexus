/**
 * Password reset, end to end over a REAL SMTP conversation: an in-process SMTP server
 * (smtp-server) receives the e-mail that nodemailer actually sends. Prisma is an in-memory fake.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { SMTPServer } from 'smtp-server';
import type { AddressInfo } from 'net';
import jwt from 'jsonwebtoken';

const h = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.RL_RESET_MAX = '100';
  return {};
});
vi.mock('../src/lib/prisma', async () => { const { makeAuthDb } = await import('./_authFake'); const f = makeAuthDb(); (globalThis as any).__db = f; return { prisma: f.prisma }; });
import { createApp } from '../src/app';
import { resetMailTransportForTests } from '../src/lib/email';
import { hashToken } from '../src/services/passwordReset';

const inbox: { to: string; raw: string }[] = [];
let smtp: SMTPServer; let server: any; let base: string;

beforeAll(async () => {
  smtp = new SMTPServer({
    authOptional: true, disabledCommands: ['STARTTLS'],
    onRcptTo(addr, _s, cb) { (inbox as any).__cur = addr.address; cb(); },
    onData(stream, _s, cb) { let raw = ''; stream.on('data', (c) => (raw += c)); stream.on('end', () => { inbox.push({ to: (inbox as any).__cur, raw }); cb(); }); },
  });
  await new Promise<void>((r) => smtp.listen(0, '127.0.0.1', r));
  process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_PORT = String((smtp.server.address() as AddressInfo).port);
  process.env.MAIL_FROM = 'VigiCore <no-reply@nexus.test>'; process.env.APP_BASE_URL = 'https://nexus.test';
  resetMailTransportForTests();
  server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth`;
});
afterAll(async () => { server.close(); await new Promise((r) => smtp.close(r as any)); });
beforeEach(() => { inbox.length = 0; });

const post = (p: string, body: any) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const db = () => (globalThis as any).__db;
const waitMail = async (n = 1) => { for (let i = 0; i < 60 && inbox.length < n; i++) await new Promise((r) => setTimeout(r, 50)); };
// The mail body is quoted-printable: undo soft line breaks and =XX escapes like a mail client would.
const qpDecode = (raw: string) => raw.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_m, x) => String.fromCharCode(parseInt(x, 16)));
const tokenFrom = (raw: string) => decodeURIComponent(/reset-password\?token=([A-Za-z0-9_%-]+)/.exec(qpDecode(raw))![1]);

describe('password reset', () => {
  beforeAll(async () => { await post('/signup', { name: 'Reset Me', email: 'reset@nexus.test', role: 'patient', password: 'oldpassword1' }); });

  it('unknown address: same 200, no e-mail sent', async () => {
    const r = await post('/password-reset', { email: 'nobody@nexus.test' });
    expect(r.status).toBe(200); expect(await r.json()).toEqual({ success: true });
    await new Promise((r) => setTimeout(r, 300)); expect(inbox).toHaveLength(0);
  });

  it('known address: same 200 + a real e-mail with a link; only the token HASH is stored', async () => {
    const r = await post('/password-reset', { email: ' Reset@NEXUS.test ' });
    expect(r.status).toBe(200);
    await waitMail();
    expect(inbox).toHaveLength(1); expect(inbox[0].to).toBe('reset@nexus.test');
    const token = tokenFrom(inbox[0].raw);
    expect(token.length).toBeGreaterThanOrEqual(40);
    const row = db().state.tokens.find((t: any) => t.tokenHash === hashToken(token));
    expect(row).toBeTruthy(); expect(JSON.stringify(db().state.tokens)).not.toContain(token);
    expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000);
  });

  it('full flow: weak password refused, reset works once, old password and OLD SESSIONS die, token cannot be reused', async () => {
    await post('/password-reset', { email: 'reset@nexus.test' }); await waitMail();
    const token = tokenFrom(inbox[0].raw);
    const user = db().state.users.find((u: any) => u.email === 'reset@nexus.test');
    const oldSession = jwt.sign({ userId: user.id, iat: Math.floor(Date.now() / 1000) - 600 }, 'test-secret');

    expect((await post('/password-reset/confirm', { token, newPassword: 'short' })).status).toBe(400);
    expect(db().state.tokens.find((t: any) => t.tokenHash === hashToken(token)).usedAt).toBeNull(); // not consumed by a refused attempt

    expect((await post('/password-reset/confirm', { token, newPassword: 'brandnewpass9' })).status).toBe(200);
    expect((await post('/login', { email: 'reset@nexus.test', password: 'oldpassword1' })).status).toBe(401);
    expect((await post('/login', { email: 'reset@nexus.test', password: 'brandnewpass9' })).status).toBe(200);
    const sess = await fetch(base + '/session', { headers: { Cookie: `vg_session=${oldSession}` } });
    expect((await sess.json()).user ?? null).toBeNull();                      // pre-reset session rejected

    const again = await post('/password-reset/confirm', { token, newPassword: 'anotherpass77' });
    expect(again.status).toBe(400); expect((await again.json()).code).toBe('INVALID_OR_EXPIRED');
  });

  it('expired and garbage tokens are refused; a newer request invalidates the previous link', async () => {
    await post('/password-reset', { email: 'reset@nexus.test' }); await waitMail(1);
    const first = tokenFrom(inbox[0].raw);
    await post('/password-reset', { email: 'reset@nexus.test' }); await waitMail(2);
    const second = tokenFrom(inbox[1].raw);
    expect((await post('/password-reset/confirm', { token: first, newPassword: 'passwordXYZ1' })).status).toBe(400);
    db().state.tokens.find((t: any) => t.tokenHash === hashToken(second)).expiresAt = new Date(Date.now() - 1000);
    expect((await post('/password-reset/confirm', { token: second, newPassword: 'passwordXYZ1' })).status).toBe(400);
    expect((await post('/password-reset/confirm', { token: 'x'.repeat(50), newPassword: 'passwordXYZ1' })).status).toBe(400);
    expect((await post('/password-reset/confirm', { newPassword: 'passwordXYZ1' })).status).toBe(400);
  });

  it('concurrent use of one token: exactly one wins', async () => {
    await post('/password-reset', { email: 'reset@nexus.test' }); await waitMail();
    const token = tokenFrom(inbox[0].raw);
    const rs = await Promise.all([1, 2, 3].map((i) => post('/password-reset/confirm', { token, newPassword: `racepass-${i}-abc` })));
    expect(rs.map((r) => r.status).sort()).toEqual([200, 400, 400]);
  });

  it('SMTP unreachable: honest 503-free generic answer for the user, error logged WITHOUT address or token', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const realPort = process.env.SMTP_PORT; process.env.SMTP_PORT = '1'; resetMailTransportForTests();
    const r = await post('/password-reset', { email: 'reset@nexus.test' });
    expect(r.status).toBe(200);
    await new Promise((r) => setTimeout(r, 800));
    const logged = spy.mock.calls.flat().join(' ');
    expect(logged).toContain('[password-reset]'); expect(logged).not.toContain('reset@nexus.test'); expect(logged).not.toMatch(/token=/);
    spy.mockRestore(); process.env.SMTP_PORT = realPort; resetMailTransportForTests();
  });

  it('mail not configured: 503 EMAIL_NOT_CONFIGURED instead of a false "sent"', async () => {
    const saved = process.env.SMTP_HOST; delete process.env.SMTP_HOST;
    const r = await post('/password-reset', { email: 'reset@nexus.test' });
    expect(r.status).toBe(503); expect((await r.json()).code).toBe('EMAIL_NOT_CONFIGURED');
    process.env.SMTP_HOST = saved;
  });
});
