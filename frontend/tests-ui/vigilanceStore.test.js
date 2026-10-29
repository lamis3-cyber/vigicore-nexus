import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enableVigilanceSync, registerVigilanceArrays, track, hydrateVigilance, onVigilanceError } from '../src/dashboards/data/vigilanceStore';

const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
let dr, lab, calls;

beforeEach(() => {
  dr = []; lab = []; calls = [];
  registerVigilanceArrays(dr, lab);
  enableVigilanceSync(true);
});
const stubFetch = (handler) => vi.stubGlobal('fetch', vi.fn(async (url, init) => {
  calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined });
  return handler(url, init);
}));
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('vigilanceStore', () => {
  it('does nothing when sync is disabled (unit/demo mode)', () => {
    enableVigilanceSync(false);
    stubFetch(() => json(200, {}));
    const rec = { id: 'local', status: 'sent' };
    expect(track(rec, 'dr', 'PV')).toBe(rec);
    expect(calls).toHaveLength(0);
  });

  it('POSTs a new record and adopts the server id / ref / organisation', async () => {
    stubFetch(() => json(201, { success: true, declaration: { id: 'srv_1234', ref: '#PV-2026-101', date: '19/10/2026', status: 'sent', capaStatus: 'none', escalated: false, organizationId: 'chu', authoredByUserId: 'u1', authoredByRole: 'doctor', vigilanceKind: 'dr' } }));
    const rec = { id: 'dr-dec-1', ref: '#tmp', status: 'sent', organizationId: 'forged' };
    dr.unshift(track(rec, 'dr', 'PV'));
    await tick(); await tick();
    expect(calls[0]).toMatchObject({ method: 'POST', body: { kind: 'dr', refPrefix: 'PV', status: 'sent' } });
    expect(dr[0].id).toBe('srv_1234');
    expect(dr[0].organizationId).toBe('chu');
  });

  it('removes the record and reports an error when the server refuses the creation', async () => {
    stubFetch(() => json(400, { success: false, message: 'Gravité invalide.' }));
    const errors = []; onVigilanceError((m) => errors.push(m));
    dr.unshift(track({ id: 'x1', ref: '#PV-1', status: 'sent' }, 'dr', 'PV'));
    await tick(); await tick();
    expect(dr).toHaveLength(0);
    expect(errors[0]).toContain('PAS été enregistrée');
  });

  it('sends status changes as PATCH and reverts them if the server says no', async () => {
    const created = { success: true, declaration: { id: 'srv_9999', ref: '#PV-1', date: 'd', status: 'review', capaStatus: 'none', escalated: false, organizationId: null, authoredByUserId: 'u', authoredByRole: 'doctor', vigilanceKind: 'dr' } };
    stubFetch((url, init) => (init.method === 'POST' ? json(201, created) : json(403, { success: false, message: 'Interdit.' })));
    const errors = []; onVigilanceError((m) => errors.push(m));
    dr.unshift(track({ id: 'a', status: 'review' }, 'dr', 'PV'));
    dr[0].status = 'analysis';
    await tick(); await tick(); await tick();
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({ url: expect.stringContaining('/vigilance/declarations/srv_9999'), body: { status: 'analysis' } });
    expect(dr[0].status).toBe('review'); // rétabli
    expect(errors[0]).toContain('Modification refusée');
  });

  it('hydrate replaces the arrays by kind and reports whether anything changed', async () => {
    const rows = [
      { id: 'r1', vigilanceKind: 'dr', status: 'sent', updatedAt: 't1' },
      { id: 'r2', vigilanceKind: 'lab', status: 'draft', updatedAt: 't1' },
    ];
    stubFetch(() => json(200, { success: true, declarations: rows }));
    dr.push({ id: 'stale' });
    expect(await hydrateVigilance()).toBe(true);
    expect(dr.map((d) => d.id)).toEqual(['r1']);
    expect(lab.map((d) => d.id)).toEqual(['r2']);
    expect(await hydrateVigilance()).toBe(false);
  });

  it('keeps local state when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    dr.push({ id: 'keep' });
    expect(await hydrateVigilance()).toBe(false);
    expect(dr).toHaveLength(1);
  });
});
