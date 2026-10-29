import { describe, it, expect, vi } from 'vitest';
import { makeMarketAudit, isDemoOrderBody } from '../src/lib/demoAudit';

const realOk = () => vi.fn(async (_r: any) => ({ kind: 'http' as const, status: 201, data: { orderRef: 'REAL-1', status: 'PENDING' } }));
const db = { productListing: { findMany: async () => [] } };

describe('mode démo : ne jamais avaler une vraie commande', () => {
  it('commande sur un vrai produit Audit -> transmise à Audit', async () => {
    const real = realOk();
    const t = makeMarketAudit(db, real as any, true);
    const r: any = await t({ method: 'POST', path: '/nexus/v1/orders', scope: 'orders:write', reporterRef: 'u', body: { lines: [{ productRef: 'a1b2-real', quantity: 1 }] } });
    expect(real).toHaveBeenCalledTimes(1);
    expect(r.data.orderRef).toBe('REAL-1');
  });
  it('commande sur une offre de démo -> simulée (DEMO-ORD-…)', async () => {
    const real = realOk();
    const t = makeMarketAudit(db, real as any, true);
    const r: any = await t({ method: 'POST', path: '/nexus/v1/orders', scope: 'orders:write', reporterRef: 'u', body: { lines: [{ productRef: 'demo-offer-x', quantity: 1 }] } });
    expect(real).not.toHaveBeenCalled();
    expect(r.data.orderRef).toMatch(/^DEMO-ORD-/);
  });
  it('intérêt réel -> transmis ; suivi d\'une réf réelle -> relu chez Audit', async () => {
    const real = realOk();
    const t = makeMarketAudit(db, real as any, true);
    await t({ method: 'POST', path: '/nexus/v1/interests', scope: 'orders:write', reporterRef: 'u', body: { productRef: 'real-1' } });
    await t({ method: 'GET', path: '/nexus/v1/orders/abc', scope: 'orders:read', reporterRef: 'u' });
    expect(real).toHaveBeenCalledTimes(2);
  });
  it('isDemoOrderBody', () => {
    expect(isDemoOrderBody({ lines: [{ productRef: 'demo-offer-1' }, { productRef: 'x' }] })).toBe(false);
    expect(isDemoOrderBody({ productRef: 'demo-offer-1' })).toBe(true);
  });
});
