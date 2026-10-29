/**
 * Langue par défaut = français : les libellés (sources en anglais) sont vérifiés traduits.
 * Étape 4 (interface) du lien fiche -> produit VigiCore Audit :
 *  - le champ du studio (liste déroulante, produits déjà pris grisés, états « non lié / Audit en panne »),
 *  - ce que la page Produits ENVOIE (le lien seulement s'il change ; jamais copié par « Dupliquer »), et sa pastille,
 *  - ce que la revue VigiCore affiche.
 * API simulée : prouve ce que l'interface affiche et envoie ; le serveur revérifie tout (test/listingProductLink.test.ts).
 */
import React from 'react';
import { it, describe, vi, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-router-dom', () => ({ Link: ({ to, children, ...p }) => <a href={to} {...p}>{children}</a>, NavLink: ({ to, children, ...p }) => <a href={to} {...p}>{children}</a> }));
vi.mock('../src/components/staff/StaffShell.jsx', () => ({ default: ({ children }) => <div>{children}</div>, StaffGate: ({ children }) => <>{children}</> }));
vi.mock('../src/components/layout/DashboardHeader.jsx', () => ({ default: () => <header /> }));
vi.mock('../src/lib/aiCutoutClassic.js', () => ({ removeBackgroundAI: vi.fn(), cutoutStore: {}, warmUpCutout: vi.fn() }));
const session = vi.hoisted(() => ({ user: { id: 'u1', role: 'ESTABLISHMENT_ADMIN', displayName: 'Admin', isPlatformAdmin: true } }));
vi.mock('../src/lib/auth.js', () => ({ getSession: async () => ({ ok: true, data: { user: session.user } }) }));
const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/api.js', () => ({ apiFetch, API_BASE: '/api' }));

import AuditProductField from '../src/components/studio/AuditProductField.jsx';
import { auditLinkPatch } from '../src/lib/services.js';
import AdminProductsPage from '../src/pages/AdminProductsPage.jsx';
import ManageServicesPage from '../src/pages/ManageServicesPage.jsx';

const products = [
  { ref: 'pA', name: 'Seringue 5 mL', reference: 'SR-5', linkedListing: { id: 'l1', title: 'Seringue', status: 'PUBLISHED' } },
  { ref: 'pB', name: 'Cathéter 18G', reference: null, linkedListing: { id: 'other', title: 'Ancienne fiche', status: 'DRAFT' } },
  { ref: 'pC', name: 'Gants nitrile', reference: null, linkedListing: null },
];
const ready = { applicable: true, manufacturerLinked: true, available: true, products };

beforeEach(() => { cleanup(); apiFetch.mockReset(); session.user = { id: 'u1', role: 'ESTABLISHMENT_ADMIN', displayName: 'Admin', isPlatformAdmin: true }; });

describe('auditLinkPatch (ce qui part au serveur)', () => {
  it('création : seulement si un produit est choisi ; modification : seulement si le choix change (null = retirer)', () => {
    expect(auditLinkPatch('pA', undefined, false)).toEqual({ auditProductRef: 'pA' });
    expect(auditLinkPatch(null, undefined, false)).toEqual({});
    expect(auditLinkPatch('', undefined, false)).toEqual({});
    expect(auditLinkPatch('pA', 'pA', true)).toEqual({});
    expect(auditLinkPatch(null, null, true)).toEqual({});
    expect(auditLinkPatch(undefined, undefined, true)).toEqual({});
    expect(auditLinkPatch('pB', 'pA', true)).toEqual({ auditProductRef: 'pB' });
    expect(auditLinkPatch(null, 'pA', true)).toEqual({ auditProductRef: null });
  });
});

describe('AuditProductField (studio)', () => {
  const field = (props = {}) => render(<AuditProductField info={ready} value={null} initialValue={null} listingId="l1" onChange={() => {}} {...props} />);

  it('liste les produits ; celui d\'une AUTRE fiche est grisé, celui de CETTE fiche reste choisissable', () => {
    field();
    const select = screen.getByRole('combobox', { name: 'Produit' });
    const opts = within(select).getAllByRole('option');
    expect(opts.map((o) => o.textContent)).toEqual(['— Non liée —', 'Seringue 5 mL · SR-5', 'Cathéter 18G — déjà lié à « Ancienne fiche »', 'Gants nitrile']);
    expect(opts[1].disabled).toBe(false); // lié à l1 = cette fiche
    expect(opts[2].disabled).toBe(true);
    expect(opts[3].disabled).toBe(false);
  });

  it('choisir puis retirer : onChange reçoit la ref, puis null', async () => {
    const onChange = vi.fn();
    const { rerender } = field({ onChange });
    await userEvent.selectOptions(screen.getByRole('combobox'), 'pC');
    expect(onChange).toHaveBeenLastCalledWith('pC');
    rerender(<AuditProductField info={ready} value="pC" initialValue={null} listingId="l1" onChange={onChange} />);
    await userEvent.selectOptions(screen.getByRole('combobox'), '');
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('lien vers un produit retiré d\'Audit : reste sélectionné et signalé', () => {
    field({ value: 'pGone', initialValue: 'pGone' });
    expect(screen.getByRole('combobox').value).toBe('pGone');
    expect(screen.getByRole('option', { name: 'Produit introuvable dans Audit (pGone)' })).toBeTruthy();
    expect(screen.getByText(/n'est plus dans l'offre en ligne/)).toBeTruthy(); // libellé du 2026-10-29 (offre en ligne du Logiciel)
  });

  it('fiche publiée ou en revue : avertit que changer le lien la renvoie en validation (seulement si le lien change)', () => {
    const { rerender } = field({ value: 'pA', initialValue: 'pA', inReviewFlow: true });
    expect(screen.queryByText(/renvoie la fiche en validation/)).toBeNull();
    rerender(<AuditProductField info={ready} value="pC" initialValue="pA" listingId="l1" inReviewFlow onChange={() => {}} />);
    expect(screen.getByText(/renvoie la fiche en validation/)).toBeTruthy();
    rerender(<AuditProductField info={ready} value="pC" initialValue="pA" listingId="l1" inReviewFlow={false} onChange={() => {}} />);
    expect(screen.queryByText(/renvoie la fiche en validation/)).toBeNull(); // brouillon : rien à revalider
  });

  it('organisation non liée, Audit en panne, erreur : pas de liste, message clair, lien actuel conservé', () => {
    const { rerender } = field({ info: { ...ready, manufacturerLinked: false, products: [] } });
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText(/pas encore liée à un fabricant dans VigiCore Audit/)).toBeTruthy();
    rerender(<AuditProductField info={{ ...ready, available: false, products: [] }} value="pA" listingId="l1" onChange={() => {}} />);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText(/indisponible pour le moment/)).toBeTruthy();
    expect(screen.getByText('Lien actuel conservé : pA')).toBeTruthy();
    rerender(<AuditProductField info={{ error: 'down' }} value={null} listingId="l1" onChange={() => {}} />);
    expect(screen.getByText(/Impossible de charger vos produits Audit/)).toBeTruthy();
  });

  it('fournisseur (applicable=false) : rien n\'est affiché', () => {
    const { container } = field({ info: { applicable: false, products: [] } });
    expect(container.innerHTML).toBe('');
  });
});

describe('page Produits (fabricant)', () => {
  const listing = (id, over = {}) => ({ id, title: `Fiche ${id}`, summary: 'Résumé', description: 'Description', category: 'Medical', status: 'DRAFT', rawStatus: 'DRAFT', auditProductRef: null, ...over });
  let mine, audit;
  const setup = () => {
    apiFetch.mockImplementation(async (method, path, body) => {
      if (method === 'GET' && path === '/services/mine') return { ok: true, data: { success: true, listings: mine } };
      if (method === 'GET' && path === '/services/audit-products') return { ok: true, data: { success: true, ...audit } };
      if (method === 'GET') return { ok: true, data: { success: true } };
      if (method === 'PUT') { const l = mine.find((x) => path.endsWith(x.id)); Object.assign(l, body); return { ok: true, data: { success: true, listing: l } }; }
      if (method === 'POST' && path === '/services') { const l = listing(`n${mine.length}`, body); mine.unshift(l); return { ok: true, data: { success: true, listing: l } }; }
      return { ok: true, data: { success: true } };
    });
  };
  const writes = () => apiFetch.mock.calls.filter((c) => c[0] === 'PUT' || (c[0] === 'POST' && c[1] === '/services'));
  beforeEach(() => { mine = [listing('l1', { auditProductRef: 'pA' }), listing('l2')]; audit = { ...ready }; setup(); });

  it('pastilles : « Audit : nom » pour la fiche liée, « Non liée » pour l\'autre', async () => {
    render(<ManageServicesPage />);
    expect(await screen.findByText('Audit : Seringue 5 mL')).toBeTruthy();
    expect(screen.getByText('Non liée à Audit')).toBeTruthy();
  });

  it('organisation pas encore liée à un fabricant : aucune pastille (rien à faire côté fabricant)', async () => {
    audit = { applicable: true, manufacturerLinked: false, available: true, products: [] };
    render(<ManageServicesPage />);
    await screen.findAllByText('Fiche l1');
    expect(screen.queryByText('Non liée à Audit')).toBeNull();
  });

  it('studio : choisir le produit puis enregistrer envoie auditProductRef ; un autre enregistrement sans changer le lien ne le renvoie pas', async () => {
    render(<ManageServicesPage />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Ouvrir Fiche l2 dans le studio' }))[0]);
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Produit' }), 'pC');
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer le brouillon/ }));
    await vi.waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0][1]).toBe('/services/l2');
    expect(writes()[0][2]).toMatchObject({ auditProductRef: 'pC' });
    // modifier le texte seulement : le lien (inchangé) ne repart pas
    await userEvent.type(screen.getByLabelText('Catégorie'), ' X');
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer le brouillon/ }));
    await vi.waitFor(() => expect(writes()).toHaveLength(2));
    expect('auditProductRef' in writes()[1][2]).toBe(false);
  });

  it('« Dupliquer » une fiche liée : la copie part SANS lien (le serveur refuserait deux fiches sur le même produit)', async () => {
    render(<ManageServicesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Dupliquer Fiche l1' }));
    await vi.waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0][1]).toBe('/services');
    expect('auditProductRef' in writes()[0][2]).toBe(false);
  });

  it('fournisseur : ni appel à audit-products, ni pastille, ni champ', async () => {
    session.user = { id: 'u2', role: 'FOURNISSEUR', displayName: 'Dist' };
    render(<ManageServicesPage />);
    await screen.findAllByText('Fiche l1');
    expect(apiFetch.mock.calls.some((c) => c[1] === '/services/audit-products')).toBe(false);
    expect(screen.queryByText(/Audit/)).toBeNull();
  });
});

describe('revue VigiCore', () => {
  const row = (id, over = {}) => ({
    id, title: `Fiche ${id}`, summary: 's', description: 'd', status: 'PUBLISHED', reviewStatus: 'PENDING', updatedAt: '2026-10-28T08:00:00.000Z',
    organization: 'Etab', requestedBy: { name: 'A', email: 'a@x.dz' }, sellerKind: 'MANUFACTURER', auditProductRef: null, auditProduct: null, auditProductCheck: null, ...over,
  });
  it('montre le produit lié, signale un lien introuvable, distingue « non liée » et Audit injoignable ; rien pour un fournisseur', async () => {
    const rows = [
      row('ok', { auditProductRef: 'pA', auditProduct: { ref: 'pA', name: 'Seringue 5 mL', reference: 'SR-5' }, auditProductCheck: 'OK' }),
      row('gone', { auditProductRef: 'pZ', auditProductCheck: 'NOT_FOUND' }),
      row('down', { auditProductRef: 'pB', auditProductCheck: 'UNKNOWN' }),
      row('free'),
      row('dist', { sellerKind: 'DISTRIBUTOR' }),
    ];
    apiFetch.mockImplementation(async () => ({ ok: true, data: { success: true, listings: rows } }));
    render(<AdminProductsPage />);
    const card = async (t) => (await screen.findByText(t, { exact: false })).closest('li');
    expect(within(await card('Fiche ok')).getByText('Produit Audit lié : Seringue 5 mL · SR-5')).toBeTruthy();
    expect(within(await card('Fiche gone')).getByRole('status').textContent).toMatch(/introuvable \(réf\. pZ\)/);
    expect(within(await card('Fiche down')).getByText(/réf\. pB \(Audit injoignable/)).toBeTruthy();
    expect(within(await card('Fiche free')).getByText(/non liée/)).toBeTruthy();
    expect(within(await card('Fiche dist')).queryByText(/Produit Audit/)).toBeNull();
  });
});
