/**
 * Tests de COMPOSANT (jsdom) de « Mes envois à la vigilance ». L'API est simulée : ces tests prouvent
 * ce que l'interface AFFICHE et APPELLE pour chaque état, pas le serveur.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({
  listMySubmissions: vi.fn(), getSubmissionDetail: vi.fn(), retryDeclaration: vi.fn(), getMessages: vi.fn(), sendMessage: vi.fn(),
  listMyRecords: vi.fn(), getRecord: vi.fn(), actOnRecord: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/declarationsApi', () => api);
vi.mock('../src/dashboards/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../src/dashboards/context/ToastContext', () => ({ useToast: () => toast }));

import MySubmissions, { SUBMISSIONS_CHANGED_EVENT } from '../src/dashboards/components/MySubmissions.jsx';

const sub = (o = {}) => ({
  id: 'cmgsub000000000000000001', status: 'RECEIVED', kind: 'INCIDENT', createdAt: '2026-10-10T10:00:00Z', receivedAt: '2026-10-10T10:00:05Z',
  auditDeclarationId: 'AUD1', failureReason: null, description: 'Éruption après application', productRef: 'p1', productLabel: 'Crème Test',
  lotNumber: 'LOT-7', declaredSeverity: 'moderee', device: null, malfunction: null, retrying: false, autoRetryExhausted: false, ...o,
});
beforeEach(() => {
  cleanup(); localStorage.clear();
  Object.values(api).forEach((f) => f.mockReset()); toast.mockReset();
  api.getMessages.mockResolvedValue([]);
  api.listMyRecords.mockResolvedValue({ ok: true, records: [] });
});

describe('liste', () => {
  it("affiche « chargement » puis l'état vide, jamais une fausse liste", async () => {
    api.listMySubmissions.mockResolvedValue({ ok: true, submissions: [] });
    render(<MySubmissions />);
    expect(screen.getByText('Chargement…')).toBeTruthy();
    expect(await screen.findByText(/aucune déclaration/i)).toBeTruthy();
  });
  it("serveur injoignable : message d'indisponibilité, PAS « aucune déclaration » (vide ≠ indisponible)", async () => {
    api.listMySubmissions.mockResolvedValue({ ok: false, unauthorized: false, submissions: [] });
    api.listMyRecords.mockResolvedValue({ ok: false, unauthorized: false, records: [] }); // les DEUX sources en panne
    render(<MySubmissions />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/momentanément indisponibles/i);
    expect(screen.queryByText(/aucune déclaration/i)).toBeNull();
    api.listMySubmissions.mockResolvedValue({ ok: true, submissions: [sub()] });
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Reçue par la vigilance')).toBeTruthy();
  });
  it('session expirée : message dédié', async () => {
    api.listMySubmissions.mockResolvedValue({ ok: false, unauthorized: true, submissions: [] });
    api.listMyRecords.mockResolvedValue({ ok: false, unauthorized: true, records: [] });
    render(<MySubmissions />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/session expirée/i);
  });
  it('PENDING : jamais présentée comme reçue ; bouton Renvoyer ; RECEIVED : pas de renvoi', async () => {
    api.listMySubmissions.mockResolvedValue({ ok: true, submissions: [
      sub({ id: 'cmgsub0000000000000000PE', status: 'PENDING', receivedAt: null, auditDeclarationId: null, retrying: true }),
      sub({ id: 'cmgsub0000000000000000RE' }),
    ] });
    render(<MySubmissions />);
    const pend = (await screen.findByText(/en attente de confirmation/i)).closest('tr');
    expect(pend.textContent).not.toMatch(/Reçue par la vigilance/);
    expect(within(pend).getByRole('button', { name: 'Renvoyer' })).toBeTruthy();
    const rec = screen.getByText('Reçue par la vigilance').closest('tr');
    expect(within(rec).queryByRole('button', { name: 'Renvoyer' })).toBeNull();
  });
  it('NOT_ROUTABLE et REJECTED : libellés « non transmise / refusée », aucun renvoi', async () => {
    api.listMySubmissions.mockResolvedValue({ ok: true, submissions: [
      sub({ id: 'cmgsub0000000000000000NR', status: 'NOT_ROUTABLE', receivedAt: null, auditDeclarationId: null }),
      sub({ id: 'cmgsub0000000000000000RJ', status: 'REJECTED', receivedAt: null, auditDeclarationId: null, failureReason: 'VALIDATION_ERROR' }),
    ] });
    render(<MySubmissions />);
    expect(await screen.findByText(/Non transmise/)).toBeTruthy();
    expect(screen.getByText('Refusée')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Renvoyer' })).toBeNull();
  });
  it('renvoi : appelle le serveur UNE fois, annonce le résultat réel (202 = toujours pas confirmée)', async () => {
    api.listMySubmissions.mockResolvedValue({ ok: true, submissions: [sub({ status: 'PENDING', receivedAt: null, auditDeclarationId: null })] });
    api.retryDeclaration.mockResolvedValue({ httpStatus: 202, json: {} });
    render(<MySubmissions />);
    await userEvent.click(await screen.findByRole('button', { name: 'Renvoyer' }));
    await waitFor(() => expect(api.retryDeclaration).toHaveBeenCalledTimes(1));
    const [type, , text] = toast.mock.calls.at(-1);
    expect(type).toBe('warn'); expect(text).toMatch(/toujours pas confirmée/i); expect(text).not.toMatch(/a confirmé la réception/i);
  });
  it("l'événement « envoi terminé » relit le serveur (la liste reflète l'enregistrement persisté)", async () => {
    api.listMySubmissions.mockResolvedValue({ ok: true, submissions: [] });
    render(<MySubmissions />);
    await screen.findByText(/aucune déclaration/i);
    api.listMySubmissions.mockResolvedValue({ ok: true, submissions: [sub()] });
    window.dispatchEvent(new Event(SUBMISSIONS_CHANGED_EVENT));
    expect(await screen.findByText('Reçue par la vigilance')).toBeTruthy();
  });
});

describe('détail', () => {
  const open = async () => userEvent.click(await screen.findByRole('button', { name: 'Voir le détail' }));
  it('panne : tous les détails du dispositif et de la panne sont visibles (rien de perdu)', async () => {
    const panne = sub({ kind: 'DEVICE_MALFUNCTION', declaredSeverity: 'grave', productLabel: 'Moniteur MX-200',
      device: { name: 'Moniteur', brand: 'Acme', model: 'MX-200', serialNumber: 'SN-778', inventoryNumber: 'INV-5', udi: 'UDI-9', lastMaintenanceDate: '2026-06-01' },
      malfunction: { occurredOn: '2026-10-10', occurredAt: '14:30', context: 'utilisation', symptoms: ['arret', 'alarme'], errorCode: 'E-42', actionTaken: 'hors_service', maintenanceTicket: 'TKT-9', deviceState: 'hors_service', impact: 'injury' } });
    api.listMySubmissions.mockResolvedValue({ ok: true, submissions: [panne] });
    api.getSubmissionDetail.mockResolvedValue({ ok: true, submission: panne, audit: { status: 'RECEIVED', receivedByOrganizationName: 'Acme Labo', awaitingReporterInformation: false }, auditUnavailable: false });
    render(<MySubmissions />);
    await open();
    await screen.findByText('Acme Labo');
    const body = document.body.textContent;
    for (const t of ['Panne de dispositif', 'SN-778', 'INV-5', 'UDI-9', '2026-06-01', 'MX-200', 'Blessure', 'E-42', 'TKT-9', 'Arrêt complet', 'Alarme / code erreur', 'Hors service', 'Acme Labo', 'Grave']) expect(body).toContain(t);
  });
  it('PENDING : explique « pas encore confirmée », annonce le renvoi auto, PAS de messagerie', async () => {
    const p = sub({ status: 'PENDING', receivedAt: null, auditDeclarationId: null, retrying: true });
    api.listMySubmissions.mockResolvedValue({ ok: true, submissions: [p] });
    api.getSubmissionDetail.mockResolvedValue({ ok: true, submission: p, audit: null, auditUnavailable: false });
    render(<MySubmissions />);
    await open();
    expect((await screen.findByRole('status')).textContent).toMatch(/pas encore confirmée par la vigilance/i);
    expect(screen.getByRole('status').textContent).toMatch(/renvoi automatique est planifié/i);
    expect(screen.queryByLabelText('Message à la vigilance')).toBeNull();
    expect(api.getMessages).not.toHaveBeenCalled();
  });
  it('renvoi automatique épuisé : le dit, et propose le renvoi manuel', async () => {
    const p = sub({ status: 'PENDING', receivedAt: null, auditDeclarationId: null, autoRetryExhausted: true });
    api.listMySubmissions.mockResolvedValue({ ok: true, submissions: [p] });
    api.getSubmissionDetail.mockResolvedValue({ ok: true, submission: p, audit: null, auditUnavailable: false });
    render(<MySubmissions />);
    await open();
    expect((await screen.findByRole('status')).textContent).toMatch(/épuisé/i);
    expect(screen.getAllByRole('button', { name: /Renvoyer/ }).length).toBeGreaterThan(0);
  });
  it("détail introuvable (autre utilisateur) : message neutre, aucune donnée", async () => {
    api.listMySubmissions.mockResolvedValue({ ok: true, submissions: [sub()] });
    api.getSubmissionDetail.mockResolvedValue({ ok: false, notFound: true });
    render(<MySubmissions />);
    await open();
    expect((await screen.findByRole('alert')).textContent).toMatch(/introuvable \(ou ne vous appartient pas\)/i);
  });
  it('suivi Audit indisponible : la réception reste affirmée, le suivi détaillé non', async () => {
    api.listMySubmissions.mockResolvedValue({ ok: true, submissions: [sub()] });
    api.getSubmissionDetail.mockResolvedValue({ ok: true, submission: sub(), audit: null, auditUnavailable: true });
    render(<MySubmissions />);
    await open();
    expect((await screen.findByRole('status')).textContent).toMatch(/suivi détaillé est momentanément indisponible/i);
  });
});

describe('messagerie', () => {
  const setup = async () => {
    api.listMySubmissions.mockResolvedValue({ ok: true, submissions: [sub()] });
    api.getSubmissionDetail.mockResolvedValue({ ok: true, submission: sub(), audit: { status: 'UNDER_REVIEW', awaitingReporterInformation: true, receivedByOrganizationName: 'Labo' }, auditUnavailable: false });
    render(<MySubmissions />);
    await userEvent.click(await screen.findByRole('button', { name: 'Voir le détail' }));
    return screen.findByLabelText('Message à la vigilance');
  };
  it('affiche la réponse de la vigilance, marque « nouveau », et signale « attend votre réponse »', async () => {
    api.getMessages.mockResolvedValue([{ id: 'm1', direction: 'FROM_VIGILANCE', content: 'Pouvez-vous préciser le lot ?', sentAt: '2026-10-11T09:00:00Z' }]);
    await setup();
    expect(await screen.findByText('Pouvez-vous préciser le lot ?')).toBeTruthy();
    expect(screen.getByText(/1 nouveau/)).toBeTruthy();
    expect(screen.getAllByText(/attend votre réponse/i).length).toBeGreaterThan(0);
  });
  it("échec d'envoi : message conservé, MÊME clé d'idempotence au nouvel essai, nouvelle clé après succès", async () => {
    const box = await setup();
    api.sendMessage.mockResolvedValueOnce({ ok: false, httpStatus: 502 }).mockResolvedValueOnce({ ok: true, httpStatus: 201 }).mockResolvedValueOnce({ ok: true, httpStatus: 201 });
    await userEvent.type(box, 'Le lot est LOT-7');
    await userEvent.click(screen.getByRole('button', { name: /Envoyer/ }));
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(1));
    expect(box.value).toBe('Le lot est LOT-7');
    expect(toast.mock.calls.at(-1)[2]).toMatch(/indisponible/i);
    await userEvent.click(screen.getByRole('button', { name: /Envoyer/ }));
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(2));
    expect(api.sendMessage.mock.calls[1][2]).toBe(api.sendMessage.mock.calls[0][2]);
    await waitFor(() => expect(box.value).toBe(''));
    await userEvent.type(box, 'Autre message');
    await userEvent.click(screen.getByRole('button', { name: /Envoyer/ }));
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(3));
    expect(api.sendMessage.mock.calls[2][2]).not.toBe(api.sendMessage.mock.calls[0][2]);
  });
  it('message vide : refusé côté interface, aucun appel serveur', async () => {
    await setup();
    expect(screen.getByRole('button', { name: /Envoyer/ }).disabled).toBe(true);
    expect(api.sendMessage).not.toHaveBeenCalled();
  });
});

const rec = (o = {}) => ({
  id: 'cmgrec000000000000000001', kind: 'PATIENT', domain: 'PHARMACOVIGILANCE', status: 'SUBMITTED', createdAt: '2026-10-12T10:00:00Z', updatedAt: '2026-10-12T10:00:00Z',
  own: true, transmitted: false, destination: 'PATIENT_SPACE_ONLY', caseStatus: null,
  fields: [{ key: 'recordKind', value: 'PATIENT' }, { key: 'productName', value: 'Doliprane 1000' }, { key: 'severity', value: 'moderee' }, { key: 'symptoms', value: ['Éruption'] }, { key: 'symptomDesc', value: 'Plaques rouges' }],
  permissions: { withdraw: true, review: false, close: false }, ...o,
});

describe('enregistrements natifs (patient, suivi interne)', () => {
  it("déclaration patient : listée avec « non transmise à une vigilance », sans bouton Renvoyer, jamais « reçue »", async () => {
    api.listMySubmissions.mockResolvedValue({ ok: true, submissions: [] });
    api.listMyRecords.mockResolvedValue({ ok: true, records: [rec()] });
    render(<MySubmissions />);
    const row = (await screen.findByText(/non transmise à une vigilance/i)).closest('tr');
    expect(row.textContent).toMatch(/Déclaration patient/); expect(row.textContent).toMatch(/Doliprane 1000/);
    expect(row.textContent).not.toMatch(/Reçue par la vigilance|CNPM/);
    expect(within(row).queryByRole('button', { name: 'Renvoyer' })).toBeNull();
  });
  it('détail patient : le texte dit explicitement « ni vigilance, ni CNPM, ni médecin » ; retrait via le serveur', async () => {
    api.listMySubmissions.mockResolvedValue({ ok: true, submissions: [] });
    api.listMyRecords.mockResolvedValue({ ok: true, records: [rec()] });
    api.getRecord.mockResolvedValue({ ok: true, record: rec() });
    api.actOnRecord.mockResolvedValue({ ok: true, httpStatus: 200, record: rec({ status: 'WITHDRAWN' }) });
    render(<MySubmissions />);
    await userEvent.click(await screen.findByRole('button', { name: 'Voir le détail' }));
    expect(await screen.findByText(/transmise ni à une vigilance, ni au CNPM, ni à votre médecin/i)).toBeTruthy();
    expect(document.body.textContent).toMatch(/Plaques rouges/);
    await userEvent.click(screen.getByRole('button', { name: 'Retirer cette déclaration' }));
    await waitFor(() => expect(api.actOnRecord).toHaveBeenCalledWith('cmgrec000000000000000001', 'withdraw'));
  });
  it("panne de suivi interne : libellé honnête « aucune vigilance externe notifiée »", async () => {
    const r = rec({ kind: 'INTERNAL_PANNE', fields: [{ key: 'recordKind', value: 'INTERNAL_PANNE' }, { key: 'device.name', value: 'Moniteur' }, { key: 'device.serialNumber', value: 'SN-1' }], permissions: { withdraw: false, review: false, close: false } });
    api.listMySubmissions.mockResolvedValue({ ok: true, submissions: [] });
    api.listMyRecords.mockResolvedValue({ ok: true, records: [r] });
    api.getRecord.mockResolvedValue({ ok: true, record: r });
    render(<MySubmissions />);
    expect(await screen.findByText(/Panne — suivi interne/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Voir le détail' }));
    expect(await screen.findByText(/Aucune vigilance externe n'a été notifiée/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retirer cette déclaration' })).toBeNull();
    expect(document.body.textContent).toMatch(/SN-1/);
  });
  it("une source en panne ne masque pas l'autre : avertissement « liste incomplète », l'autre liste reste visible", async () => {
    api.listMySubmissions.mockResolvedValue({ ok: false, unauthorized: false, submissions: [] });
    api.listMyRecords.mockResolvedValue({ ok: true, records: [rec()] });
    render(<MySubmissions />);
    expect(await screen.findByText(/non transmise à une vigilance/i)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/liste peut être incomplète/i);
  });
  it('les deux sources en panne : « indisponible », pas « aucune déclaration »', async () => {
    api.listMySubmissions.mockResolvedValue({ ok: false, submissions: [] }); api.listMyRecords.mockResolvedValue({ ok: false, records: [] });
    render(<MySubmissions />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/momentanément indisponibles/i);
    expect(screen.queryByText(/aucune déclaration/i)).toBeNull();
  });
});
