import { describe, it, expect, vi } from 'vitest';
import { asyncHandler } from '../src/lib/asyncHandler';

describe('asyncHandler', () => {
  it('transmet un rejet async à next() au lieu de le laisser non géré', async () => {
    const boom = new Error('db down');
    const next = vi.fn();
    asyncHandler(async () => { throw boom; })({} as any, {} as any, next);
    await new Promise((r) => setImmediate(r));
    expect(next).toHaveBeenCalledWith(boom);
  });
  it("n'appelle pas next() quand le handler réussit", async () => {
    const next = vi.fn();
    asyncHandler(async (_q, res) => { (res as any).sent = true; })({} as any, {} as any, next);
    await new Promise((r) => setImmediate(r));
    expect(next).not.toHaveBeenCalled();
  });
});
