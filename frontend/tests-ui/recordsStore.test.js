import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enableVigilanceSync, registerVigilanceArrays, trackAudit, savePatient, savePatientDetailed, deletePatient, emailPatient, hydrateRecords, onVigilanceError } from '../src/dashboards/data/vigilanceStore';

const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
let patients, audit, calls;
const stubFetch = (handler) => vi.stubGlobal('fetch', vi.fn(async (url, init) => {
  calls.push({ url, method: init?.method || 'GET', body: init?.body ? JSON.parse(init.body) : undefined });
  return handler(url, init);
}));
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  patients = []; audit = []; calls = [];
  registerVigilanceArrays([], [], { patients, audit });
  enableVigilanceSync(true);
});

describe('records store (patients + audit)', () => {
  it('trackAudit posts only refType/refId/action and adopts the server entry', async () => {
    stubFetch(() => json(201, { success: true, entry: { id: 'srv_a', ts: '21/10/2026 · 09:00', actor: 'Dr X', action: 'A', refType: 'declaration', refId: 'd1', organizationId: 'chu' } }));
    const e = trackAudit({ id: 'aud-1', ts: 'Maintenant', actor: 'forgé', action: 'A', refType: 'declaration', refId: 'd1', organizationId: 'forgé' });
    expect(e.pending).toBe(true);
    await tick(); await tick();
    expect(calls[0].url).toContain('/records/audit');
    expect(calls[0].body).toEqual({ refType: 'declaration', refId: 'd1', action: 'A' });
    expect(e).toMatchObject({ id: 'srv_a', actor: 'Dr X', organizationId: 'chu' });
    expect(e.pending).toBeUndefined();
  });
  it('trackAudit reports a server refusal', async () => {
    stubFetch(() => json(403, { success: false, message: 'non' }));
    const seen = []; const off = onVigilanceError((m) => seen.push(m));
    trackAudit({ id: 'aud-2', refType: 'alert', refId: 'a', action: 'x' });
    await tick(); await tick(); off();
    expect(seen[0]).toContain('non');
  });
  it('savePatient resolves to the server patient and rejects with a readable message', async () => {
    stubFetch(() => json(201, { success: true, patient: { id: 'srv_p', name: 'A B' } }));
    expect((await savePatient({ name: 'A B', age: 3 })).id).toBe('srv_p');
    stubFetch(() => json(400, { success: false, message: 'Âge invalide.' }));
    await expect(savePatient({ name: 'A', age: 999 })).rejects.toThrow('Âge invalide.');
  });
  it('savePatientDetailed exposes the link/e-mail outcome; deletePatient and emailPatient call the right routes', async () => {
    stubFetch(() => json(201, { success: true, linked: true, emailStatus: 'not_configured', patient: { id: 'srv_p' } }));
    expect(await savePatientDetailed({ name: 'A B', age: 3, email: 'a@b.dz' })).toEqual({ patient: { id: 'srv_p' }, linked: true, emailStatus: 'not_configured' });
    expect(calls[0].body.email).toBe('a@b.dz');
    stubFetch(() => json(200, { success: true }));
    await deletePatient('p 1');
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE' });
    expect(calls.at(-1).url).toContain('/records/patients/p%201');
    await emailPatient('p1', 'Bonjour');
    expect(calls.at(-1)).toMatchObject({ method: 'POST', body: { message: 'Bonjour' } });
    expect(calls.at(-1).url).toContain('/records/patients/p1/contact');
    stubFetch(() => json(503, { success: false, message: 'pas configuré' }));
    await expect(emailPatient('p1', 'x')).rejects.toThrow('pas configuré');
    await expect(deletePatient('p1')).rejects.toThrow();
  });
  it('hydrateRecords replaces the caches, keeps unsaved audit lines, and EMPTIES patients when the server fails', async () => {
    stubFetch((url) => url.includes('/patients') ? json(200, { success: true, patients: [{ id: 'p1' }] }) : json(200, { success: true, entries: [{ id: 'e1' }] }));
    audit.push({ id: 'local', pending: true });
    expect(await hydrateRecords()).toBe(true);
    expect(patients.map((p) => p.id)).toEqual(['p1']);
    expect(audit.map((e) => e.id)).toEqual(['local', 'e1']);
    stubFetch(() => json(500, { success: false }));
    await hydrateRecords();
    expect(patients).toEqual([]);
  });
});
