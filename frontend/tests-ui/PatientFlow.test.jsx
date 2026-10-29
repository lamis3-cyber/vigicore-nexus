/** Parcours patient (API SIMULÉE) : pas de faux destinataires, questions conditionnelles, récapitulatif neutre. */
import { it, vi, expect, beforeEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../src/dashboards/context/ToastContext', () => ({ useToast: () => vi.fn() }));
vi.mock('../src/dashboards/context/AuthContext', async (orig) => ({ ...(await orig()), useAuth: () => ({ user: { id: 'p1', role: 'PATIENT', name: 'Pat' } }), getCurrentAuthUser: () => ({ id: 'p1', role: 'PATIENT' }) }));
import PatientDeclarer from '../src/dashboards/pages/patient/PatientDeclarer.jsx';

const calls = [];
beforeEach(() => {
  cleanup(); calls.length = 0;
  globalThis.fetch = vi.fn(async (url, opts = {}) => {
    calls.push({ u: String(url), method: opts.method || 'GET', body: typeof opts.body === 'string' ? JSON.parse(opts.body) : undefined });
    const ok = (json, status = 200) => ({ status, ok: status < 300, json: async () => json });
    if (String(url).endsWith('/declarations/destinations')) return ok({ success: true, destinations: { cnpm: true, org: null, manufacturer: true, storage: false } });
    if (String(url).endsWith('/records') && opts.method === 'POST') return ok({ success: true, record: { id: 'r1' } }, 201);
    return ok({ success: true, submissions: [], records: [], declarations: [] });
  });
});
const next = () => userEvent.click(screen.getByRole('button', { name: /Suivant|Continuer/ }));

it('questions de causalité conditionnelles, récapitulatif sans imputabilité ni faux destinataires, aucune transmission', async () => {
  render(<PatientDeclarer onNavigate={() => {}} />);
  await userEvent.type(await screen.findByLabelText(/Nom du produit/), 'Doliprane');
  await next();
  await userEvent.type(await screen.findByLabelText(/Date d'apparition/), '2026-10-01');
  await userEvent.click(screen.getByRole('button', { name: 'Nausées' }));
  expect(screen.queryByLabelText(/Après l'arrêt, les symptômes ont-ils disparu/)).toBeNull();
  await userEvent.selectOptions(screen.getByLabelText(/Avez-vous arrêté ce médicament/), 'continued');
  expect(screen.queryByLabelText(/Après l'arrêt, les symptômes ont-ils disparu/)).toBeNull();
  await userEvent.selectOptions(screen.getByLabelText(/Avez-vous arrêté ce médicament/), 'stopped');
  expect(await screen.findByLabelText(/Après l'arrêt, les symptômes ont-ils disparu/)).toBeTruthy();
  await next();
  await userEvent.click(await screen.findByRole('radio', { name: /Légère/ }));
  await next(); await next();
  expect(await screen.findByRole('heading', { name: 'Récapitulatif' })).toBeTruthy();
  expect(screen.queryByText(/Imputabilité/)).toBeNull();
  expect(screen.queryByText(/Médecin traitant/)).toBeNull();
  expect(screen.getByText(/Où va cette déclaration/)).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Modifier' }).length).toBeGreaterThanOrEqual(4);
});
