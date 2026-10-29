/** Session lookup failure (DB down) must not hang the request or crash the process. */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'net';

const h = vi.hoisted(() => { process.env.JWT_SECRET = 'test-secret'; return {}; });
vi.mock('../src/lib/auditClient', () => ({ auditConfigured: () => true, callAudit: vi.fn() }));
vi.mock('../src/lib/prisma', () => ({ prisma: { user: { findUnique: async () => { throw new Error('DB DOWN'); } } } }));

import { createApp } from '../src/app';
import { signSessionToken } from '../src/lib/jwt';

let server: ReturnType<ReturnType<typeof createApp>['listen']>; let base: string;
beforeAll(() => { server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(() => { server.close(); });

describe('attachUser when the database fails', () => {
  it('answers (5xx or 401) within 2 s instead of hanging', async () => {
    const res = await fetch(`${base}/api/declarations`, {
      headers: { Cookie: `vg_session=${signSessionToken({ userId: 'alice' })}` },
      signal: AbortSignal.timeout(2000),
    }).catch((e) => ({ status: 'HUNG: ' + e.name }) as any);
    expect([401, 500, 503]).toContain(res.status);
  });
});
