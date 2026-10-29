/** Staff : agrément du distributeur en gros dans /admin/buyers (API simulée : prouve ce que l'interface affiche et envoie). */
import React from 'react';
import { it, vi, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-router-dom', () => ({ Link: ({ to, children, ...p }) => <a href={to} {...p}>{children}</a>, NavLink: ({ to, children, ...p }) => <a href={to} {...p}>{children}</a> }));
vi.mock('../src/components/staff/StaffShell.jsx', () => ({ default: ({ children }) => <div>{children}</div>, StaffGate: ({ children }) => <>{children}</> }));
vi.mock('../src/lib/auth.js', () => ({ getSession: async () => ({ ok: true, data: { user: { isPlatformAdmin: true } } }) }));
const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/api.js', () => ({ apiFetch, API_BASE: '/api' }));

import AdminBuyersPage from '../src/pages/AdminBuyersPage.jsx';

const row = (id, over = {}) => ({
  id, name: `Etab ${id}`, type: 'SUPPLIER', buyerCategory: 'DISTRIBUTOR', buyerCategoryStatus: 'DECLARED', buyerCategoryNote: null,
  buyerCategoryDeclaredAt: '2026-10-20T08:00:00.000Z', buyerCategoryReviewedAt: null, buyerCategoryReviewedBy: null,
  approvalNumber: null, approvalDate: null, approvalIncomplete: false, declaredBy: { displayName: 'Admin', email: 'a@x.dz' }, ...over,
});
let buyers;
beforeEach(() => {
  cleanup(); apiFetch.mockReset(); buyers = [];
  apiFetch.mockImplementation(async (method, path, body) => {
    if (method === 'GET' && path.startsWith('/market/admin/buyers')) return { ok: true, data: { success: true, buyers } };
    if (method === 'POST' && /\/review$/.test(path)) return { ok: true, data: { success: true, buyer: { approvalIncomplete: !body.approvalNumber } } };
    return { ok: true, data: {} };
  });
});
const reviewCalls = () => apiFetch.mock.calls.filter((c) => c[0] === 'POST');
const rowOf = async (name) => (await screen.findByText(name)).closest('li');

it('distributeur : saisit n° + date, « Vérifier » envoie l\'agrément avec la décision', async () => {
  buyers = [row('dist')];
  render(<AdminBuyersPage />);
  const li = await rowOf('Etab dist');
  await userEvent.type(within(li).getByLabelText("N° d'agrément"), 'AG-7/2020');
  await userEvent.type(within(li).getByLabelText("Date d'agrément"), '2020-02-03');
  await userEvent.click(within(li).getByRole('button', { name: 'Vérifier' }));
  expect(reviewCalls()).toHaveLength(1);
  const [, path, body] = reviewCalls()[0];
  expect(path).toBe('/market/admin/buyers/dist/review');
  expect(body).toMatchObject({ decision: 'VERIFIED', approvalNumber: 'AG-7/2020', approvalDate: '2020-02-03' });
});

it('distributeur sans agrément saisi : la vérification reste possible (envoie null), un avertissement est affiché avant', async () => {
  buyers = [row('dist')];
  render(<AdminBuyersPage />);
  const li = await rowOf('Etab dist');
  expect(within(li).getByText(/Agrément non renseigné ou incomplet : la vérification reste possible/)).toBeTruthy();
  await userEvent.click(within(li).getByRole('button', { name: 'Vérifier' }));
  expect(reviewCalls()[0][2]).toMatchObject({ decision: 'VERIFIED', approvalNumber: null, approvalDate: null });
  expect(await screen.findByText(/agrément distributeur non renseigné ou incomplet/)).toBeTruthy(); // toast
});

it('distributeur VÉRIFIÉ sans agrément : avertissement visible dans la ligne ; avec agrément complet : aucun', async () => {
  buyers = [
    row('d1', { buyerCategoryStatus: 'VERIFIED', approvalIncomplete: true }),
    row('d2', { buyerCategoryStatus: 'VERIFIED', approvalNumber: 'AG-1', approvalDate: '2019-05-14T00:00:00.000Z', approvalIncomplete: false }),
  ];
  render(<AdminBuyersPage />);
  const l1 = await rowOf('Etab d1'); const l2 = await rowOf('Etab d2');
  expect(within(l1).getByText('⚠ Agrément distributeur non renseigné ou incomplet')).toBeTruthy();
  expect(within(l2).queryByText('⚠ Agrément distributeur non renseigné ou incomplet')).toBeNull();
  expect(within(l2).getByText(/Agrément AG-1 · 14\/05\/2019/)).toBeTruthy();
  expect(within(l2).getByLabelText("N° d'agrément").value).toBe('AG-1');
  expect(within(l2).getByLabelText("Date d'agrément").value).toBe('2019-05-14');
});

it('« Enregistrer l\'agrément » sur un distributeur déjà vérifié : nouvelle review VERIFIED avec les valeurs', async () => {
  buyers = [row('d1', { buyerCategoryStatus: 'VERIFIED', approvalIncomplete: true })];
  render(<AdminBuyersPage />);
  const li = await rowOf('Etab d1');
  await userEvent.type(within(li).getByLabelText("N° d'agrément"), 'AG-9');
  await userEvent.click(within(li).getByRole('button', { name: "Enregistrer l'agrément" }));
  expect(reviewCalls()[0][2]).toMatchObject({ decision: 'VERIFIED', approvalNumber: 'AG-9', approvalDate: null });
});

it('non-régression : autre catégorie => pas de champs d\'agrément, review identique à avant (sans clés d\'agrément) ; refus inchangé', async () => {
  buyers = [row('chu', { type: 'HOSPITAL', buyerCategory: 'PUBLIC_INSTITUTION' })];
  render(<AdminBuyersPage />);
  const li = await rowOf('Etab chu');
  expect(within(li).queryByLabelText("N° d'agrément")).toBeNull();
  await userEvent.click(within(li).getByRole('button', { name: 'Vérifier' }));
  const body = reviewCalls()[0][2];
  expect(body).toMatchObject({ decision: 'VERIFIED' });
  expect(body).not.toHaveProperty('approvalNumber');
  expect(body).not.toHaveProperty('approvalDate');
});
