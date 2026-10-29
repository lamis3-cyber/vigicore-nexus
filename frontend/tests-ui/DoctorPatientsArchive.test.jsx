/**
 * Test de COMPOSANT (jsdom) de l'archivage des patients suivis. Le store est simulé : on prouve ce que
 * l'interface AFFICHE et APPELLE (archiver, consulter en lecture seule, restaurer, retirer de l'affichage).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const store = vi.hoisted(() => ({
  savePatientDetailed: vi.fn(), archivePatient: vi.fn(), emailPatient: vi.fn(),
  listArchivedPatients: vi.fn(), restorePatient: vi.fn(), hidePatient: vi.fn(), unhidePatient: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock('../src/dashboards/data/vigilanceStore', () => store);
vi.mock('../src/dashboards/context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../src/dashboards/context/AuthContext', async (orig) => ({ ...(await orig()), getCurrentAuthUser: () => ({ id: 'doc1', organizationId: null }) }));
vi.mock('../src/dashboards/services/chatApi', () => ({ chatApi: { connections: vi.fn().mockResolvedValue({ friends: [] }) } }));
vi.mock('../src/dashboards/config/organizations', async (orig) => ({ ...(await orig()), isOrgScopedRecordVisible: () => true }));

import DoctorPatients from '../src/dashboards/pages/doctor/DoctorPatients.jsx';
import { DR_PATIENTS } from '../src/dashboards/data/doctorVigilance';

const arch = (o = {}) => ({ id: 'pa1', name: 'Karim Test', initials: 'KT', color: '#38bdf8', age: 42, sex: 'M', condition: 'hypertension', allergies: ['Aucune connue'], declCount: 0, lastVisit: '—', archived: true, archivedAt: '2026-10-22T09:00:00Z', archiveReason: 'Fin de suivi', hidden: false, ...o });

beforeEach(() => {
  cleanup(); toast.mockReset(); Object.values(store).forEach((f) => f.mockReset());
  DR_PATIENTS.length = 0;
  DR_PATIENTS.push({ id: 'p1', name: 'Sara Active', initials: 'SA', color: '#34d399', age: 30, sex: 'F', condition: 'asthme', allergies: ['Aucune connue'], declCount: 0, lastVisit: '—' });
});

describe('archivage', () => {
  it('« Supprimer » archive (avec motif), retire le patient de la liste active et ne parle jamais d\'effacement', async () => {
    store.archivePatient.mockResolvedValue();
    render(<DoctorPatients onNavigate={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Retirer Sara Active/ }));
    expect(screen.getByText(/Le dossier n'est pas effacé/)).toBeTruthy();
    await userEvent.type(screen.getByLabelText(/Motif/), 'Fin de suivi');
    await userEvent.click(screen.getByRole('button', { name: /Archiver le dossier/ }));
    await waitFor(() => expect(store.archivePatient).toHaveBeenCalledWith('p1', 'Fin de suivi'));
    await waitFor(() => expect(screen.queryByText('Sara Active')).toBeNull());
    expect(toast).toHaveBeenCalledWith('success', 'Dossier archivé', expect.stringMatching(/lecture seule/), expect.any(String));
  });
  it('onglet Archivés : liste lue sur le serveur, dossier consulté en LECTURE SEULE (ni Contacter ni Supprimer)', async () => {
    store.listArchivedPatients.mockResolvedValue([arch()]);
    render(<DoctorPatients onNavigate={() => {}} />);
    await userEvent.click(screen.getByRole('tab', { name: /Archivés/ }));
    expect(await screen.findByText('Karim Test')).toBeTruthy();
    expect(screen.getByText('Fin de suivi')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Consulter' }));
    expect(screen.getByText(/Dossier archivé — lecture seule/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Contacter$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Supprimer$/ })).toBeNull();
  });
  it('restaurer : appelle le serveur et remet le patient dans la liste active', async () => {
    store.listArchivedPatients.mockResolvedValue([arch()]);
    store.restorePatient.mockResolvedValue();
    render(<DoctorPatients onNavigate={() => {}} />);
    await userEvent.click(screen.getByRole('tab', { name: /Archivés/ }));
    await screen.findByText('Karim Test');
    await userEvent.click(screen.getByRole('button', { name: 'Restaurer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Restaurer le dossier' }));
    await waitFor(() => expect(store.restorePatient).toHaveBeenCalledWith('pa1'));
    expect(DR_PATIENTS.some((p) => p.id === 'pa1')).toBe(true);
  });
  it('retirer de l\'affichage : action serveur distincte, jamais une suppression', async () => {
    store.listArchivedPatients.mockResolvedValue([arch()]);
    store.hidePatient.mockResolvedValue();
    render(<DoctorPatients onNavigate={() => {}} />);
    await userEvent.click(screen.getByRole('tab', { name: /Archivés/ }));
    await screen.findByText('Karim Test');
    await userEvent.click(screen.getByRole('button', { name: "Retirer de l'affichage" }));
    expect(screen.getByText(/reste archivé et conservé en base/)).toBeTruthy();
    await userEvent.click(screen.getAllByRole('button', { name: "Retirer de l'affichage" }).at(-1));
    await waitFor(() => expect(store.hidePatient).toHaveBeenCalledWith('pa1'));
    expect(store.archivePatient).not.toHaveBeenCalled();
  });
  it('archives indisponibles : message d\'erreur, pas « aucun dossier »', async () => {
    store.listArchivedPatients.mockRejectedValue(new Error('x'));
    render(<DoctorPatients onNavigate={() => {}} />);
    await userEvent.click(screen.getByRole('tab', { name: /Archivés/ }));
    expect(await screen.findByText(/momentanément indisponibles/)).toBeTruthy();
    expect(screen.queryByText(/Aucun dossier archivé/)).toBeNull();
  });
});
