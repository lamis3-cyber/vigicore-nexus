import { it, vi, expect } from 'vitest';
import { submitDeclaration } from '../src/lib/declarationsApi';

it('notifyCnpm:false est bien transmis au serveur (sinon un 2e e-mail CNPM partirait)', async () => {
  let body;
  globalThis.fetch = vi.fn(async (_u, o) => { body = JSON.parse(o.body); return { status: 201, json: async () => ({ success: true, submission: { id: 's' } }) }; });
  const r = await submitDeclaration({ productRef: 'p', description: 'd', declaredSeverity: 'legere', notifyCnpm: false, clientRequestId: 'c' });
  expect(r.outcome).toBe('RECEIVED');
  expect(body.notifyCnpm).toBe(false);
});
