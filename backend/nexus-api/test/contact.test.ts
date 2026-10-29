import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { SMTPServer } from 'smtp-server';
import type { AddressInfo } from 'net';
vi.hoisted(() => { process.env.JWT_SECRET = 'test-secret'; process.env.RL_CONTACT_MAX = '8'; });
vi.mock('../src/lib/prisma', () => ({ prisma: {} }));
import { createApp } from '../src/app';
import { resetMailTransportForTests } from '../src/lib/email';

const inbox: string[] = []; let smtp: SMTPServer; let server: any; let base: string;
beforeAll(async () => {
  smtp = new SMTPServer({ authOptional: true, disabledCommands: ['STARTTLS'], onData(st, _s, cb) { let r = ''; st.on('data', (c) => (r += c)); st.on('end', () => { inbox.push(r); cb(); }); } });
  await new Promise<void>((r) => smtp.listen(0, '127.0.0.1', r));
  Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String((smtp.server.address() as AddressInfo).port), MAIL_FROM: 'no-reply@nexus.test', CONTACT_TO: 'inbox@nexus.test' });
  resetMailTransportForTests();
  server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/contact`;
});
afterAll(async () => { server.close(); await new Promise((r) => smtp.close(r as any)); });
beforeEach(() => { inbox.length = 0; });
const post = (b: any) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const ok = { name: 'Amel', email: 'Amel@Clinic.test', message: 'Bonjour, démo svp', organization: 'Clinique X' };

describe('contact form backend', () => {
  it('delivers a real e-mail (Reply-To = visitor) and stores nothing', async () => {
    expect((await post(ok)).status).toBe(200);
    expect(inbox).toHaveLength(1); expect(inbox[0]).toMatch(/Reply-To: amel@clinic.test/i); expect(inbox[0]).toContain('Clinique X');
  });
  it('validates input', async () => {
    expect((await post({ ...ok, email: 'nope' })).status).toBe(400);
    expect((await post({ ...ok, message: 'hi' })).status).toBe(400);
    expect((await post({ ...ok, name: '' })).status).toBe(400);
  });
  it('honeypot: silent success, nothing sent', async () => {
    expect((await post({ ...ok, website: 'http://spam' })).status).toBe(200); expect(inbox).toHaveLength(0);
  });
  it('header injection attempt in name cannot add headers', async () => {
    await post({ ...ok, name: 'Bob\r\nBcc: victim@x.test' });
    const [head, body] = inbox[0].split(/\r?\n\r?\n/, 2);
    expect(head).not.toMatch(/^Bcc:/im); expect(body).not.toMatch(/^Bcc:/im); // neither a header nor a forged line in the body
  });
  it('503 when SMTP/CONTACT_TO is not configured, 502 when delivery fails', async () => {
    const to = process.env.CONTACT_TO; delete process.env.CONTACT_TO;
    expect((await post(ok)).status).toBe(503); process.env.CONTACT_TO = to;
    const port = process.env.SMTP_PORT; process.env.SMTP_PORT = '1'; resetMailTransportForTests();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await post(ok)).status).toBe(502); expect(spy.mock.calls.flat().join(' ')).not.toContain('amel@clinic.test'); spy.mockRestore();
    process.env.SMTP_PORT = port; resetMailTransportForTests();
  });
  it('rate limits bursts', async () => {
    const codes: number[] = []; for (let i = 0; i < 12; i++) codes.push((await post(ok)).status);
    expect(codes).toContain(429);
  });
});
