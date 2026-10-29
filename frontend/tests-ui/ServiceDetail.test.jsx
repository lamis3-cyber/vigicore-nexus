/** /services/:id — fiche produit : commande (fenêtre + confirmation), intérêt, anonyme, exemple sans réseau, J'aime. */
import { it, vi, expect, beforeEach, describe } from 'vitest';
import { render, screen, cleanup, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-router-dom', () => ({ Link: ({ to, children, ...p }) => <a href={to} {...p}>{children}</a>, useNavigate: () => () => {} }));
import ServiceDetail from '../src/pages/services/ServiceDetail.jsx';
import { composeOrderNote, NOTE_MAX } from '../src/lib/market.js';

const LISTING = {
  id: 'lst-1', establishmentId: 'est-labo', orgName: 'Numidia Pharma', title: 'Amoxicilline Numidia', summary: 'Antibiotique à large spectre.',
  description: 'Gélules 1 g, boîte de 12.\nConservation < 25 °C.', category: 'Pharmaceuticals', certifications: ['BPF', 'ISO 9001'],
  contactEmail: 'contact@numidia.dz', contactPhone: '+213 36 00 00 00', website: 'https://numidia.dz', imageUrl: null,
};
const OFFER = { ref: 'p1', name: 'Amoxicilline 1 g', reference: 'AMX-1', manufacturer: { ref: 'org-labo', name: 'Numidia Pharma' }, unitPrice: 150, currency: 'DZD', orderableBy: ['DISTRIBUTOR', 'PUBLIC_INSTITUTION'] };
const OFFER2 = { ...OFFER, ref: 'p2', name: 'Seringue 5 ml', reference: 'SER-5', unitPrice: 12, orderableBy: ['DISTRIBUTOR'] };

let user; let me; let eng; let posted; let likeFails;
const ok = (body, status = 200) => ({ ok: true, status, json: async () => ({ success: true, ...body }) });
beforeEach(() => {
  cleanup(); posted = []; likeFails = false;
  user = { id: 'u1', displayName: 'Admin CHU', email: 'admin@chu.dz', role: 'ORG_ADMIN' };
  me = { establishments: [{ id: 'e1', name: 'CHU Mustapha', buyerCategory: 'PUBLIC_INSTITUTION', buyerCategoryStatus: 'VERIFIED', isAdmin: true, canOrder: true, orderBlocker: null }] };
  eng = { likes: 4, liked: false, manufacturerLinked: true, hasOffers: true, offers: [OFFER], offersUnavailable: false };
  globalThis.fetch = vi.fn(async (url, opts = {}) => {
    const u = String(url); const method = opts.method ?? 'GET';
    if (u.endsWith('/auth/session')) return ok({ user });
    if (u.endsWith('/services')) return ok({ listings: [LISTING] });
    if (u.endsWith('/engagement')) return ok(user ? eng : { ...eng, liked: false, offers: null });
    if (u.endsWith('/market/me')) return ok(me);
    if (u.endsWith('/market/requests')) return ok({ requests: [{ id: 'r1', kind: 'ORDER', summary: 'Amoxicilline 1 g × 20', manufacturer: 'Numidia Pharma', totalAmount: 3000, delivery: 'SENT', status: 'PENDING', lines: [], createdAt: '2026-10-27T10:00:00Z' }] });
    if (u.endsWith('/like')) {
      posted.push({ url: u, method });
      if (likeFails) return { ok: false, status: 500, json: async () => ({ success: false, message: 'boom' }) };
      return ok({ likes: method === 'PUT' ? 5 : 4, liked: method === 'PUT' });
    }
    if (u.endsWith('/market/orders') || u.endsWith('/market/interests')) {
      const body = JSON.parse(opts.body); posted.push({ url: u, body });
      return ok({ request: { delivery: 'SENT', manufacturer: 'Numidia Pharma', kind: u.endsWith('orders') ? 'ORDER' : 'INTEREST' } }, 201);
    }
    return { ok: false, status: 404, json: async () => ({ success: false, message: 'not found' }) };
  });
});

describe('composeOrderNote', () => {
  it('livraison en tête, puis la note ; 2000 caractères au plus, la note libre est tronquée', () => {
    expect(composeOrderNote({ deliveryPlace: 'Pharmacie centrale', desiredDate: '2026-11-15', purchaseOrderRef: 'BC-77', note: 'Fragile' }))
      .toBe('Lieu de livraison : Pharmacie centrale\nDate souhaitée : 2026-11-15\nBon de commande : BC-77\n\nFragile');
    expect(composeOrderNote({ deliveryPlace: 'Sétif' })).toBe('Lieu de livraison : Sétif');
    const long = composeOrderNote({ deliveryPlace: 'Sétif', note: 'x'.repeat(5000) });
    expect(long.length).toBe(NOTE_MAX);
    expect(long.startsWith('Lieu de livraison : Sétif\n\n')).toBe(true);
  });
});

it('fiche réelle : détails complets, une seule offre -> « Commander » ouvre la fenêtre ; livraison obligatoire ; confirmation puis « Suivre ma commande »', async () => {
  render(<ServiceDetail id="lst-1" />);
  expect(await screen.findByRole('heading', { level: 1, name: 'Amoxicilline Numidia' })).toBeTruthy();
  expect(screen.getByText('BPF')).toBeTruthy();
  expect(screen.getByText(/Conservation/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Contacter' }).getAttribute('href')).toBe('mailto:contact@numidia.dz');
  await screen.findByText('Amoxicilline 1 g');
  const orderButtons = screen.getAllByRole('button', { name: 'Commander' }); // en-tête de la fiche + ligne de l'offre
  expect(orderButtons).toHaveLength(2);
  await userEvent.click(orderButtons[0]);
  const dialog = await screen.findByRole('dialog');
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(dialog.textContent).toContain('CHU Mustapha');
  const qty = within(dialog).getByLabelText(/Quantité \(unités\)/);
  await userEvent.clear(qty); await userEvent.type(qty, '20');
  const send = within(dialog).getByRole('button', { name: 'Envoyer la demande' });
  expect(send.disabled).toBe(true); // lieu de livraison obligatoire
  await userEvent.type(within(dialog).getByLabelText(/Lieu de livraison/), 'Pharmacie centrale');
  await userEvent.type(within(dialog).getByLabelText('Référence de bon de commande'), 'BC-77');
  await userEvent.type(within(dialog).getByLabelText('Note au fabricant'), 'Fragile');
  expect(send.disabled).toBe(false);
  await userEvent.click(send);
  expect(posted[0].url).toMatch(/\/market\/orders$/);
  expect(posted[0].body).toMatchObject({ establishmentId: 'e1', lines: [{ productRef: 'p1', quantity: 20 }], note: 'Lieu de livraison : Pharmacie centrale\nBon de commande : BC-77\n\nFragile' });
  expect(await within(dialog).findByText('Demande envoyée à Numidia Pharma')).toBeTruthy();
  expect(dialog.textContent).toContain('Il attribue les lots');
  // suivi : lien vers « Commandes » du tableau de bord
  expect(within(dialog).getByRole('link', { name: 'Suivre ma commande' }).getAttribute('href')).toBe('/dashboard/?page=commandes');
});

it('catégorie non autorisée chez les fabricants (pharmacie privée) : chaque offre « Non disponible pour votre catégorie », rien n\'est envoyé', async () => {
  me.establishments[0] = { id: 'e2', name: 'Pharmacie El Amel', buyerCategory: 'PRIVATE_PHARMACY', buyerCategoryStatus: 'VERIFIED', isAdmin: true, canOrder: false, orderBlocker: 'CATEGORY_NOT_ALLOWED' };
  eng.offers = [OFFER, OFFER2];
  render(<ServiceDetail id="lst-1" />);
  await screen.findByText('Seringue 5 ml');
  const blocked = screen.getAllByRole('button', { name: 'Non disponible pour votre catégorie' });
  expect(blocked).toHaveLength(2);
  expect(blocked.every((b) => b.disabled)).toBe(true);
  // Aucune offre commandable dans le bloc des offres ; le bouton d'en-tête reste, mais n'envoie rien (message explicatif).
  expect(within(document.getElementById('sdp-offers')).queryByRole('button', { name: 'Commander' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Commander' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(posted).toHaveLength(0);
});

it('offre fermée à MA catégorie (les autres restent commandables) : même « Commander », la demande part par le canal « intérêt »', async () => {
  // Depuis le 2026-10-29 : une seule « Demande de commande » pour tous les comptes ; seul le canal change (le serveur tranche).
  eng.offers = [OFFER, OFFER2]; // OFFER2 : DISTRIBUTOR seulement ; mon établissement est PUBLIC_INSTITUTION
  render(<ServiceDetail id="lst-1" />);
  const row = (await screen.findByText('Seringue 5 ml')).closest('li');
  await userEvent.click(within(row).getByRole('button', { name: 'Commander' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByLabelText(/E-mail/).value).toBe('admin@chu.dz'); // contact prérempli depuis le compte
  await userEvent.type(within(dialog).getByLabelText(/Lieu de livraison/), 'Pharmacie centrale');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Envoyer la demande' }));
  expect(posted[0]).toMatchObject({ url: expect.stringMatching(/\/market\/interests$/), body: { productRef: 'p2', establishmentId: 'e1', contact: { name: 'Admin CHU', email: 'admin@chu.dz' } } });
});

it('anonyme : fiche visible, aucune offre ni prix ; « Commander via la plateforme » et « J\'aime » proposent la connexion', async () => {
  user = null;
  render(<ServiceDetail id="lst-1" />);
  await screen.findByRole('heading', { level: 1, name: 'Amoxicilline Numidia' });
  await screen.findByText(/Connectez-vous avec un compte professionnel/);
  expect(screen.queryByText('Amoxicilline 1 g')).toBeNull();
  expect(screen.queryByText(/150/)).toBeNull();
  await userEvent.click(screen.getAllByRole('button', { name: 'Commander via la plateforme' })[0]);
  expect((await screen.findByRole('dialog')).textContent).toContain('le formulaire de commande (quantité, livraison) s’ouvrira automatiquement');
  expect(screen.getByRole('link', { name: 'Se connecter' }).getAttribute('href')).toBe('/login?next=%2Fservices%2Flst-1%3Forder%3D1'); // retour sur la fiche, formulaire ouvert
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await userEvent.click(screen.getByRole('button', { name: "J'aime" }));
  expect((await screen.findByRole('dialog')).textContent).toContain('pour aimer ce produit');
  expect(posted).toHaveLength(0);
});

it('aucun fabricant lié : pas de « Commander », message clair, « Contacter » reste', async () => {
  eng = { likes: 0, liked: false, manufacturerLinked: false, hasOffers: false, offers: [], offersUnavailable: false };
  render(<ServiceDetail id="lst-1" />);
  await screen.findByText(/ne se commande pas en ligne/);
  expect(screen.queryByRole('button', { name: 'Commander' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Contacter' })).toBeTruthy();
});

it('fiche d\'exemple demo-N : mention « Exemple », les boutons ouvrent la carte de connexion, aucun envoi', async () => {
  render(<ServiceDetail id="demo-1" />);
  expect(screen.getByRole('heading', { level: 1, name: 'SafeTrack Device Registry' })).toBeTruthy();
  expect(screen.getAllByText('Exemple').length).toBeGreaterThan(0);
  await userEvent.click(screen.getByRole('button', { name: 'Commander via la plateforme' }));
  expect(await screen.findByText(/Connectez-vous pour commander|Fiche d'exemple/)).toBeTruthy();
  // Seuls appels permis : lectures (catalogue public pour basculer vers la vraie fiche, session au clic). Aucun envoi.
  for (const [url, opts = {}] of globalThis.fetch.mock.calls) {
    expect(/\/services$|\/auth\/session$/.test(String(url))).toBe(true);
    expect(opts.method ?? 'GET').toBe('GET');
  }
});

it('J\'aime : mise à jour optimiste, aria-pressed, retour arrière si le serveur échoue', async () => {
  render(<ServiceDetail id="lst-1" />);
  const like = await screen.findByRole('button', { name: "J'aime" });
  await waitFor(() => expect(like.textContent).toContain('4'));
  await userEvent.click(like);
  expect(like.getAttribute('aria-pressed')).toBe('true');
  await waitFor(() => expect(like.textContent).toContain('5'));
  expect(posted[0]).toMatchObject({ method: 'PUT' });
  likeFails = true;
  await userEvent.click(screen.getByRole('button', { name: "Je n'aime plus" }));
  await screen.findByText(/n'a pas pu être enregistré/);
  const back = screen.getByRole('button', { name: "Je n'aime plus" });
  expect(back.getAttribute('aria-pressed')).toBe('true');
  expect(back.textContent).toContain('5');
});
