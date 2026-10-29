import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';

vi.mock('../src/dashboards/context/ToastContext', () => ({ useToast: () => vi.fn() }));
vi.mock('../src/dashboards/context/AuthContext', async (orig) => ({
  ...(await orig()),
  useAuth: () => ({ user: { id: 'p1', role: 'patient', name: 'Amina Benali', email: 'a@x.dz', orgId: null } }),
}));
// Lot base: one recalled lot, one verified lot.
vi.mock('../src/dashboards/data/doctorVigilance', async (orig) => ({
  ...(await orig()),
  QR_LOT_DB: {
    'RAP-001': { verdict: 'recalled', product: 'X', manufacturer: 'Saidal', expiry: '01/2027', note: 'Rappel ANPP test' },
    'OK-002': { verdict: 'authentic', product: 'Y', manufacturer: 'Biopharm', expiry: '05/2028', note: 'Lot conforme' },
  },
}));

import { adherence, isActiveTreatment } from '../src/dashboards/lib/treatments';
import { productSafety, productsNeedingAction } from '../src/dashboards/lib/patientProducts';
import PatientProduits from '../src/dashboards/pages/patient/PatientProduits.jsx';
import PatientAlertes from '../src/dashboards/pages/patient/PatientAlertes.jsx';
import PatientRdv from '../src/dashboards/pages/patient/PatientRdv.jsx';

// ---- fake /api/personal server (in memory) ----
let store;
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
beforeEach(() => {
  store = { product: [], appointment: [] };
  let seq = 0;
  global.fetch = vi.fn(async (url, init = {}) => {
    const m = String(url).match(/\/api\/personal\/(\w+)(?:\/(\w+))?$/);
    if (!m) return json(404, { success: false });
    const [, kind, id] = m;
    const method = init.method || 'GET';
    const list = store[kind] || (store[kind] = []);
    if (method === 'GET') return json(200, { success: true, items: list });
    if (method === 'POST') {
      const item = { id: `i${++seq}`, data: JSON.parse(init.body).data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      list.unshift(item);
      return json(201, { success: true, item });
    }
    if (method === 'DELETE') { store[kind] = list.filter((x) => x.id !== id); return json(200, { success: true }); }
    if (method === 'PATCH') {
      const it = list.find((x) => x.id === id); Object.assign(it.data, JSON.parse(init.body).data);
      return json(200, { success: true, item: it });
    }
    return json(400, { success: false });
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('helpers', () => {
  it('productSafety : rappel, vérifié, non référencé, sans lot', () => {
    expect(productSafety({ lot: 'rap-001' }).status).toBe('recall');
    expect(productSafety({ lot: 'OK-002' }).status).toBe('verified');
    expect(productSafety({ lot: 'ZZZ-999' }).status).toBe('unknown');
    expect(productSafety({}).status).toBe('nolot');
    expect(productsNeedingAction([{ name: 'A', lot: 'OK-002' }, { name: 'B', lot: 'RAP-001' }]).map((x) => x.product.name)).toEqual(['B']);
  });

  it('adherence : null sans posologie ; pourcentage borné à 100', () => {
    const now = new Date('2026-10-20T20:00:00');
    expect(adherence([{ id: 't', name: 'A' }], [], now)).toBeNull();
    const t = { id: 't', name: 'A', dosesPerDay: 2, startDate: '2026-01-01' };
    const intakes = Array.from({ length: 7 }, (_, i) => ({ treatmentId: 't', takenAt: new Date(now.getTime() - i * 86400000).toISOString() }));
    const r = adherence([t], intakes, now);
    expect(r).toBe(50); // 7 doses prises sur 14 prévues
    expect(adherence([t], [...intakes, ...intakes, ...intakes], now)).toBe(100);
    expect(isActiveTreatment({ endDate: '2000-01-01' })).toBe(false);
  });
});

describe('PatientProduits', () => {
  it('ajoute un produit via l\'API et affiche le rappel de son lot', async () => {
    render(<PatientProduits onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Aucun produit enregistré/)).toBeTruthy());
    fireEvent.click(screen.getByText('Ajouter un produit'));
    fireEvent.change(screen.getByLabelText('Nom du produit'), { target: { value: 'Dexaméthasone' } });
    fireEvent.change(screen.getByLabelText('Lot / N° série'), { target: { value: 'rap-001' } });
    fireEvent.click(screen.getByText('Enregistrer'));
    await waitFor(() => expect(screen.getByText('Dexaméthasone')).toBeTruthy());
    expect(store.product[0].data).toMatchObject({ name: 'Dexaméthasone', lot: 'RAP-001', category: 'medicament', inUse: true });
    expect(screen.getAllByText('Rappel actif').length).toBeGreaterThan(0);
    expect(screen.getByText('Rappel ANPP test')).toBeTruthy();
  });
});

describe('PatientAlertes', () => {
  it('liste les produits rappelés du patient, pas les autres', async () => {
    store.product = [
      { id: 'a', data: { name: 'Produit rappelé', category: 'medicament', lot: 'RAP-001' } },
      { id: 'b', data: { name: 'Produit sain', category: 'medicament', lot: 'OK-002' } },
    ];
    render(<PatientAlertes onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Rappel ANPP — Produit rappelé/)).toBeTruthy());
    expect(screen.queryByText(/Produit sain/)).toBeNull();
  });
});

describe('PatientRdv', () => {
  it('sépare à venir / passés et marque un RDV comme effectué', async () => {
    store.appointment = [
      { id: 'f', data: { practitioner: 'Dr Futur', reason: 'Consultation de suivi', date: '2099-01-10', status: 'planned' } },
      { id: 'p', data: { practitioner: 'Dr Passé', reason: 'Bilan biologique', date: '2000-01-10', status: 'planned' } },
    ];
    render(<PatientRdv />);
    await waitFor(() => expect(screen.getAllByText('Dr Futur').length).toBeGreaterThan(0));
    expect(screen.queryByText('Dr Passé')).toBeNull();
    fireEvent.click(screen.getByLabelText('Marquer comme effectué'));
    await waitFor(() => expect(store.appointment[0].data.status).toBe('done'));
    fireEvent.click(screen.getByText(/Passés/));
    await waitFor(() => expect(screen.getByText('Dr Passé')).toBeTruthy());
    expect(screen.getAllByText('Dr Futur').length).toBeGreaterThan(0); // passé dans l'onglet « Passés »
  });
});
