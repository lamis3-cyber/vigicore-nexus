import { describe, it, expect, vi, beforeEach } from 'vitest';
const sent = vi.hoisted(() => ({ calls: [] as any[], fail: false, configured: true }));
vi.mock('../src/lib/email', () => ({
  mailConfigured: () => sent.configured,
  sendMail: async (m: any) => { if (sent.fail) throw new Error('smtp'); sent.calls.push(m); },
}));
import { notifyCnpm, cnpmNotifyAddress, parseNotifyContext, scheduleCnpmNotification, deliverAttachment } from '../src/services/cnpmNotify';

beforeEach(() => { sent.calls.length = 0; sent.fail = false; sent.configured = true; process.env.CNPM_NOTIFY_EMAIL = 'cnpm@example.org'; });
const P = { productRef: 'PRD-1', productLabel: 'Pompe X', description: 'Texte médical sensible', lotNumber: 'L9', declaredSeverity: 'grave' } as any;

describe('notifyCnpm', () => {
  it('sans contexte : rapport complet du serveur (description), jamais le nom du déclarant', async () => {
    expect(await notifyCnpm(P, 'DOCTOR', 's1')).toBe('sent');
    expect(sent.calls[0].to).toBe('cnpm@example.org');
    expect(sent.calls[0].text).toContain('Pompe X');
    expect(sent.calls[0].text).toContain('sensible');
    expect(sent.calls[0].text).not.toContain('Name alice');
  });
  it('sans adresse ou sans SMTP : ignoré, aucun envoi', async () => {
    delete process.env.CNPM_NOTIFY_EMAIL;
    expect(await notifyCnpm(P, 'DOCTOR', 's1')).toBe('skipped');
    process.env.CNPM_NOTIFY_EMAIL = 'cnpm@example.org'; sent.configured = false;
    expect(await notifyCnpm(P, 'DOCTOR', 's1')).toBe('skipped');
    expect(sent.calls).toHaveLength(0);
  });
  it('échec SMTP : ne lève pas', async () => {
    sent.fail = true;
    expect(await notifyCnpm(P, 'DOCTOR', 's1')).toBe('failed');
  });
  it('adresse invalide refusée', () => { expect(cnpmNotifyAddress({ CNPM_NOTIFY_EMAIL: 'pas-un-mail' } as any)).toBeNull(); });
  it('avec contexte : le patient et le détail saisis figurent dans l\'e-mail', async () => {
    const ctx = parseNotifyContext({ patient: { name: 'A. B.', idNumber: 'D-12', age: '39', sex: 'F' }, description: 'Fuite constatée', evolution: 'Rétabli / guéri', service: 'Cardio' });
    await notifyCnpm(P, 'DOCTOR', 's1', ctx);
    const t = sent.calls[0].text;
    for (const x of ['A. B.', 'D-12', '39', 'Texte médical sensible', 'Rétabli / guéri', 'Cardio']) expect(t).toContain(x);
  });
  it('CNPM_NOTIFY_INCLUDE_PATIENT=false retire patient et détail', async () => {
    process.env.CNPM_NOTIFY_INCLUDE_PATIENT = 'false';
    await notifyCnpm(P, 'DOCTOR', 's1', parseNotifyContext({ patient: { name: 'A. B.' }, description: 'secret' }));
    delete process.env.CNPM_NOTIFY_INCLUDE_PATIENT;
    expect(sent.calls[0].text).not.toContain('A. B.'); expect(sent.calls[0].text).not.toContain('secret'); expect(sent.calls[0].text).not.toContain('sensible');
  });
  it('parseNotifyContext : liste blanche, plafonds, rejette les formes invalides', () => {
    expect(parseNotifyContext('x')).toBeNull(); expect(parseNotifyContext([1])).toBeNull();
    const c: any = parseNotifyContext({ description: 'a'.repeat(20_000), evil: 'x', patient: { name: { $ne: 1 } } });
    expect(c.description).toHaveLength(10_000); expect(c.evil).toBeUndefined(); expect(c.patient).toBeNull();
  });
  it('panne : dispositif et circonstances repris dans l\'e-mail', async () => {
    await notifyCnpm({ productRef: 'P', kind: 'DEVICE_MALFUNCTION', description: 'Arrêt brutal', device: { name: 'Autoclave', serialNumber: 'SN1' }, malfunction: { occurredOn: '2026-10-01', context: 'utilisation', deviceState: 'hors_service', impact: 'exposed' } } as any, 'DOCTOR', 's2');
    const t = sent.calls[0].text; for (const x of ['Autoclave', 'SN1', "Pendant l'utilisation", 'Hors service', 'Patient / utilisateur exposé', 'Arrêt brutal', 'Médecin', '01/10/2026']) expect(t).toContain(x);
    for (const raw of ['hors_service', 'exposed', 'DOCTOR']) expect(t).not.toContain(raw);
  });
  it('panne avec contexte : patient, service, évolution repris comme pour un incident', async () => {
    const ctx = parseNotifyContext({ patient: { name: 'C. D.', age: '70', sex: 'M', idNumber: 'N-5' }, service: 'Bloc', evolution: 'Rétabli / guéri', problem: "Panne / dysfonctionnement d'un dispositif", onsetDate: '2026-10-01' });
    await notifyCnpm({ productRef: 'P', kind: 'DEVICE_MALFUNCTION', description: 'Arrêt', device: { name: 'Autoclave', serialNumber: 'SN1' }, malfunction: { occurredOn: '2026-10-01', context: 'utilisation', deviceState: 'hors_service', impact: 'injury' } } as any, 'DOCTOR', 's2b', ctx);
    for (const x of ['C. D.', 'N-5', 'Bloc', 'Rétabli / guéri', 'Blessure']) expect(sent.calls[0].text).toContain(x);
  });
  it('pièces jointes : un SEUL e-mail avec les fichiers joints, noms listés comme joints', async () => {
    const f = { name: 'rapport.pdf', mime: 'application/pdf', data: Buffer.from('%PDF-1.4 x') };
    await notifyCnpm(P, 'DOCTOR', 's3', parseNotifyContext({ attachments: ['rapport.pdf'] }), [f]);
    expect(sent.calls).toHaveLength(1);
    expect(sent.calls[0].attachments[0]).toMatchObject({ filename: 'rapport.pdf', contentType: 'application/pdf' });
    expect(sent.calls[0].text).toContain('Pièces jointes à ce message (1) : rapport.pdf'); expect(sent.calls[0].text).not.toContain('ne sont pas transmis');
  });
  it('pièce annoncée mais non reçue : signalée honnêtement, jamais « jointe »', async () => {
    await notifyCnpm(P, 'DOCTOR', 's4', parseNotifyContext({ attachments: ['absent.pdf'] }), []);
    expect(sent.calls[0].text).toContain('NON reçues'); expect(sent.calls[0].text).not.toContain('à ce message');
  });
  it('message retenu : part en un seul e-mail quand tous les fichiers sont arrivés', async () => {
    const ctx = parseNotifyContext({ attachments: ['a.pdf', 'b.png'] });
    scheduleCnpmNotification(P, 'DOCTOR', 'h1', ctx);
    expect(sent.calls).toHaveLength(0);
    const f = (name: string) => ({ name, mime: 'application/pdf', data: Buffer.from('%PDF-x') });
    expect((await deliverAttachment('h1', 'Pompe X', f('a.pdf'))).status).toBe('queued');
    expect(sent.calls).toHaveLength(0);
    expect((await deliverAttachment('h1', 'Pompe X', f('b.png'))).status).toBe('sent');
    expect(sent.calls).toHaveLength(1);
    expect(sent.calls[0].attachments.map((x: any) => x.filename)).toEqual(['a.pdf', 'b.png']);
  });
  it('message retenu : échec d\'envoi signalé comme échec du lot', async () => {
    scheduleCnpmNotification(P, 'DOCTOR', 'h2', parseNotifyContext({ attachments: ['a.pdf'] }));
    sent.fail = true;
    const r = await deliverAttachment('h2', 'Pompe X', { name: 'a.pdf', mime: 'application/pdf', data: Buffer.from('%PDF-x') });
    expect(r).toEqual({ status: 'failed', batch: true });
  });
  it('message retenu : délai dépassé -> envoyé sans les fichiers', async () => {
    vi.useFakeTimers();
    scheduleCnpmNotification(P, 'DOCTOR', 'h3', parseNotifyContext({ attachments: ['a.pdf'] }));
    await vi.advanceTimersByTimeAsync(61_000);
    vi.useRealTimers();
    expect(sent.calls).toHaveLength(1); expect(sent.calls[0].text).toContain('NON reçues');
  });
});
