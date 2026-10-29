/**
 * Parcours Incident de l'assistant « Déclarer » (API SIMULÉE : ces tests prouvent ce que l'interface affiche et appelle,
 * pas le comportement du serveur).
 */
import { it, vi, expect, beforeEach } from 'vitest';
import { render, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../src/dashboards/context/ToastContext', () => ({ useToast: () => vi.fn() }));
vi.mock('../src/dashboards/context/AuthContext', async (orig) => ({ ...(await orig()), useAuth: () => ({ user: { id: 'u1', role: 'DOCTOR', name: 'Dr X' } }), getCurrentAuthUser: () => ({ id: 'u1', role: 'DOCTOR' }) }));
import InstitutionalDeclarer from '../src/dashboards/pages/institutional/InstitutionalDeclarer.jsx';

const calls = [];
let destinations;
let catalogue; // { status, products } renvoyé par GET /catalogue/products
const REC = { id: 'r1', kind: 'INCIDENT', deliveries: [{ destination: 'CNPM', status: 'SENT' }] };
beforeEach(() => {
  cleanup(); calls.length = 0;
  destinations = { cnpm: true, org: { id: 'E1', name: 'Hôpital Un' }, manufacturer: true, storage: true };
  catalogue = { status: 200, products: [] };
  globalThis.fetch = vi.fn(async (url, opts = {}) => {
    const u = String(url); const method = opts.method || 'GET';
    calls.push({ u, method, body: opts.body && typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body });
    const ok = (json, status = 200) => ({ status, ok: status < 300, json: async () => json });
    if (u.endsWith('/declarations/destinations')) return ok({ success: true, destinations });
    if (u.includes('/catalogue/products')) return catalogue.status === 200 ? ok({ success: true, products: catalogue.products }) : ok({ success: false }, catalogue.status);
    if (u.endsWith('/records') && method === 'POST') return ok({ success: true, record: REC }, 201);
    if (u.endsWith('/records/r1')) return ok({ success: true, record: REC });
    if (u.includes('/attachments')) return ok({ success: true, stored: true, mail: 'queued' });
    return ok({ success: true, submissions: [], records: [], declarations: [] });
  });
});

const nextBtn = () => screen.getByRole('button', { name: /^(Suivant|Continuer)/ });

// Choix « Incident », étape 1 : « Patient concerné » (+ « Suivant ») ou « Sans patient » (passage direct).
async function startIncident(person = false) {
  await userEvent.click(await screen.findByText(/Incident \/ effet indésirable/));
  if (person) {
    await userEvent.click(await screen.findByRole('radio', { name: /^Patient concerné/ }));
    await userEvent.type(await screen.findByLabelText(/Nom du patient/), 'A.B.');
    await userEvent.type(screen.getByLabelText(/Âge/), '54');
    await userEvent.selectOptions(screen.getByLabelText(/Sexe/), 'F');
    await userEvent.selectOptions(screen.getByLabelText(/Évolution/), 'retabli');
    await userEvent.click(nextBtn());
  } else {
    await userEvent.click(await screen.findByRole('radio', { name: /^Sans patient/ }));
  }
  await screen.findByRole('heading', { name: 'Produit et identification' });
}

// Produit absent du catalogue -> fenêtre -> « Continuer et déclarer au CNPM ».
async function productOffCatalogue(person = false) {
  render(<InstitutionalDeclarer dept="doctor" targetNavId="decl" onNavigate={() => {}} />);
  await startIncident(person);
  await userEvent.click(await screen.findByRole('radio', { name: 'Dispositif médical' }));
  await userEvent.type(screen.getByLabelText(/^Produit/), 'Pompe X');
  await screen.findByText(/Aucun produit du catalogue VigiCore ne correspond/);
  await userEvent.click(screen.getByLabelText(/N° de série/)); // passer à l'identification ouvre la fenêtre
  await screen.findByRole('alertdialog');
  await userEvent.click(screen.getByRole('button', { name: /Continuer et déclarer au CNPM/ }));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(screen.getByText(/Cette déclaration sera adressée au CNPM uniquement/)).toBeTruthy();
  await userEvent.type(screen.getByLabelText(/N° de série/), 'SN-1');
}

async function toGravite(person) {
  await productOffCatalogue(person);
  await userEvent.click(nextBtn());
  await userEvent.click(await screen.findByRole('radio', { name: 'Anomalie observée' }));
  await userEvent.type(screen.getByLabelText(/Date de survenue/), '2026-10-01');
  await userEvent.type(screen.getByLabelText(/Description détaillée/), 'Débit erroné');
  // « Signes avant l'incident » : réponse obligatoire
  await userEvent.click(screen.getByRole('radio', { name: 'Non' }));
  await userEvent.click(screen.getByRole('button', { name: /Suivant|Continuer/ }));
  await userEvent.click(await screen.findByRole('radio', { name: /Modérée/ }));
}

it('aucune personne concernée : aucun champ patient demandé, et rien de personnel n\'est envoyé', async () => {
  await toGravite(false);
  await userEvent.click(nextBtn());
  expect(screen.queryByText(/Initiales ou identifiant pseudonymisé/)).toBeNull();
  expect(await screen.findByRole('heading', { name: 'Pièces justificatives' })).toBeTruthy();
});

it('étape 1 : deux choix seulement ; « Patient concerné » ouvre ses champs, « Sans patient » passe au produit', async () => {
  render(<InstitutionalDeclarer dept="doctor" targetNavId="decl" onNavigate={() => {}} />);
  await userEvent.click(await screen.findByText(/Incident \/ effet indésirable/));
  expect(await screen.findByRole('heading', { name: 'Patient & contexte' })).toBeTruthy();
  expect(screen.getAllByRole('radio')).toHaveLength(2);
  expect(screen.queryByRole('note')).toBeNull();
  expect(screen.queryByText(/Je ne sais pas/)).toBeNull();
  expect(screen.queryByLabelText(/Nom du patient/)).toBeNull();
  await userEvent.click(screen.getByRole('radio', { name: /^Patient concerné/ }));
  expect(await screen.findByLabelText(/Nom du patient/)).toBeTruthy();
  expect(screen.getByLabelText(/Âge/)).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Patient & contexte' })).toBeTruthy(); // pas de passage automatique
  await userEvent.click(screen.getByRole('radio', { name: /^Sans patient/ }));
  expect(await screen.findByRole('heading', { name: 'Produit et identification' })).toBeTruthy();
});

it('« Patient concerné » : bloqué tant que les informations obligatoires manquent', async () => {
  render(<InstitutionalDeclarer dept="doctor" targetNavId="decl" onNavigate={() => {}} />);
  await userEvent.click(await screen.findByText(/Incident \/ effet indésirable/));
  await userEvent.click(await screen.findByRole('radio', { name: /^Patient concerné/ }));
  await userEvent.click(nextBtn());
  expect(screen.getByRole('heading', { name: 'Patient & contexte' })).toBeTruthy();
  await userEvent.type(screen.getByLabelText(/Nom du patient/), 'A.B.');
  await userEvent.type(screen.getByLabelText(/Âge/), '54');
  await userEvent.selectOptions(screen.getByLabelText(/Sexe/), 'M');
  await userEvent.click(nextBtn());
  expect(screen.getByRole('heading', { name: 'Patient & contexte' })).toBeTruthy(); // évolution manquante
  await userEvent.selectOptions(screen.getByLabelText(/Évolution/), 'inconnue');
  await userEvent.click(nextBtn());
  expect(await screen.findByRole('heading', { name: 'Produit et identification' })).toBeTruthy();
});

it('« Suivant » sans choix : bloqué à l\'étape 1', async () => {
  render(<InstitutionalDeclarer dept="doctor" targetNavId="decl" onNavigate={() => {}} />);
  await userEvent.click(await screen.findByText(/Incident \/ effet indésirable/));
  await userEvent.click(await screen.findByRole('button', { name: /^Suivant/ }));
  expect(screen.getByRole('heading', { name: 'Patient & contexte' })).toBeTruthy();
});

it('destination en dernier : CNPM seul → un enregistrement INCIDENT, AUCUN appel à Audit, état réel affiché', async () => {
  await toGravite(false);
  const next = () => userEvent.click(screen.getByRole('button', { name: /Suivant|Continuer/ }));
  await next(); // preuves
  await next(); // récap
  expect(await screen.findByRole('heading', { name: 'Récapitulatif' })).toBeTruthy();
  await next(); // destination
  expect(await screen.findByRole('heading', { name: 'Destinataires de la déclaration' })).toBeTruthy();
  // Choix multiple : trois destinataires affichés ; hors catalogue, seul le CNPM est activable (et présélectionné).
  const boxes = await screen.findAllByRole('checkbox');
  expect(boxes).toHaveLength(3);
  const cnpm = screen.getByRole('checkbox', { name: /CNPM/ });
  expect(cnpm.getAttribute('aria-checked')).toBe('true');
  expect(screen.getByRole('checkbox', { name: /Hôpital Un/ }).disabled).toBe(true);
  expect(screen.getByRole('checkbox', { name: /Fabricant du produit/ }).disabled).toBe(true);
  expect(screen.getByRole('status').textContent).toMatch(/Envoi à : CNPM/);
  await userEvent.click(cnpm); // décocher : plus aucun destinataire
  expect(screen.getByText(/Aucun destinataire sélectionné/)).toBeTruthy();
  await userEvent.click(cnpm);
  await userEvent.click(screen.getByRole('button', { name: /Envoyer la déclaration/ }));
  expect(await screen.findByRole('heading', { name: 'Déclaration enregistrée' }, { timeout: 4000 })).toBeTruthy();
  const post = calls.find((c) => c.method === 'POST' && c.u.endsWith('/records'));
  expect(post.body).toMatchObject({ kind: 'INCIDENT', destinations: ['CNPM'], personConcerned: 'non', manual: true, productType: 'dispositif', serial: 'SN-1' });
  expect(post.body.productRef).toBeUndefined();
  expect(post.body.idUnknown).toBeUndefined();
  expect(post.body.person).toBeUndefined();
  expect(calls.some((c) => c.u.endsWith('/declarations') && c.method === 'POST')).toBe(false);
  expect(screen.getByText(/réception par le CNPM non confirmée/)).toBeTruthy();
}, 15000);

it('aucune destination disponible : envoi bloqué avec explication', async () => {
  destinations = { cnpm: false, org: null, manufacturer: false, storage: false };
  await toGravite(false);
  const next = () => userEvent.click(screen.getByRole('button', { name: /Suivant|Continuer/ }));
  await next(); await next(); await next();
  expect(await screen.findByText(/Le CNPM ne peut pas recevoir de déclaration pour le moment/)).toBeTruthy(); // hors catalogue : CNPM seul
  expect(screen.getByRole('button', { name: /Envoyer la déclaration|Envoi/ }).disabled).toBe(true);
}, 15000);

it('produit hors catalogue : la fenêtre propose CNPM / corriger / quitter ; « Quitter » ferme la déclaration', async () => {
  const onNavigate = vi.fn();
  render(<InstitutionalDeclarer dept="doctor" targetNavId="decl" onNavigate={onNavigate} />);
  await startIncident();
  await userEvent.click(await screen.findByRole('radio', { name: 'Médicament' }));
  await userEvent.type(screen.getByLabelText(/^Produit/), 'Inconnu 500');
  await screen.findByText(/Aucun produit du catalogue VigiCore ne correspond/);
  await userEvent.click(screen.getByLabelText(/Numéro de lot/)); // la fenêtre s'ouvre en passant au lot
  const dlg = await screen.findByRole('alertdialog');
  expect(within(dlg).getByText(/n'utilise pas le logiciel VigiCore Audit/)).toBeTruthy();
  expect(within(dlg).getByRole('button', { name: /Corriger le nom du produit/ })).toBeTruthy();
  await userEvent.click(within(dlg).getByRole('button', { name: /Quitter la déclaration/ }));
  expect(onNavigate).toHaveBeenCalledWith('decl');
});

it('catalogue injoignable : aucune fenêtre « hors catalogue », passage bloqué', async () => {
  catalogue = { status: 503, products: [] };
  render(<InstitutionalDeclarer dept="doctor" targetNavId="decl" onNavigate={() => {}} />);
  await startIncident();
  await userEvent.click(await screen.findByRole('radio', { name: 'Médicament' }));
  await userEvent.type(screen.getByLabelText(/^Produit/), 'Doliprane');
  await screen.findByText(/Catalogue injoignable/);
  await userEvent.type(screen.getByLabelText(/Numéro de lot/), 'L1');
  await userEvent.click(nextBtn());
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(screen.getByRole('heading', { name: 'Produit et identification' })).toBeTruthy();
});

it('identification obligatoire : plus d\'option « Je ne le connais pas »', async () => {
  catalogue = { status: 200, products: [{ productRef: 'p1', name: 'Doliprane 1g', organizationName: 'Sanofi DZ', intakeAvailable: true }] };
  render(<InstitutionalDeclarer dept="doctor" targetNavId="decl" onNavigate={() => {}} />);
  await startIncident();
  await userEvent.click(await screen.findByRole('radio', { name: 'Médicament' }));
  await userEvent.type(screen.getByLabelText(/^Produit/), 'Doli');
  await userEvent.click(await screen.findByRole('button', { name: /Doliprane 1g/ }));
  expect(screen.queryByText(/Je ne le connais pas/)).toBeNull();
  await userEvent.click(nextBtn());
  expect(screen.getByRole('heading', { name: 'Produit et identification' })).toBeTruthy(); // lot manquant : bloqué
  await userEvent.type(screen.getByLabelText(/Numéro de lot/), 'L-2026');
  await userEvent.click(nextBtn());
  expect(await screen.findByRole('heading', { name: 'Description des faits' })).toBeTruthy();
});

it('« Non » : « Effet indésirable » n\'est pas proposé dans les faits', async () => {
  catalogue = { status: 200, products: [{ productRef: 'p1', name: 'Doliprane 1g', organizationName: 'Sanofi DZ', intakeAvailable: true }] };
  render(<InstitutionalDeclarer dept="doctor" targetNavId="decl" onNavigate={() => {}} />);
  await startIncident(false);
  await userEvent.click(await screen.findByRole('radio', { name: 'Médicament' }));
  await userEvent.type(screen.getByLabelText(/^Produit/), 'Doli');
  await userEvent.click(await screen.findByRole('button', { name: /Doliprane 1g/ }));
  await userEvent.type(screen.getByLabelText(/Numéro de lot/), 'L-1');
  await userEvent.click(nextBtn());
  expect(await screen.findByRole('heading', { name: 'Description des faits' })).toBeTruthy();
  expect(screen.queryByRole('radio', { name: 'Effet indésirable' })).toBeNull();
  expect(screen.getByRole('radio', { name: 'Défaut qualité' })).toBeTruthy();
  expect(screen.queryByText('Concernant le patient')).toBeNull();
});

it('« Oui » + médicament : les questions propres au médicament apparaissent dans « Faits »', async () => {
  catalogue = { status: 200, products: [{ productRef: 'p1', name: 'Doliprane 1g', organizationName: 'Sanofi DZ', intakeAvailable: true }] };
  render(<InstitutionalDeclarer dept="doctor" targetNavId="decl" onNavigate={() => {}} />);
  await startIncident(true);
  await userEvent.click(await screen.findByRole('radio', { name: 'Médicament' }));
  await userEvent.type(screen.getByLabelText(/^Produit/), 'Doli');
  await userEvent.click(await screen.findByRole('button', { name: /Doliprane 1g/ }));
  await userEvent.type(screen.getByLabelText(/Numéro de lot/), 'L-1');
  await userEvent.click(nextBtn());
  expect(await screen.findByText('Concernant le patient')).toBeTruthy();
  expect(screen.getByLabelText(/les symptômes ont-ils disparu/)).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Effet indésirable' })).toBeTruthy();
});


it('« Signes avant l\'incident » : obligatoire, placé avant la description, sans « Je ne sais pas » ni texte d\'aide', async () => {
  await productOffCatalogue(false);
  await userEvent.click(nextBtn());
  await userEvent.click(await screen.findByRole('radio', { name: 'Anomalie observée' }));
  await userEvent.type(screen.getByLabelText(/Date de survenue/), '2026-10-01');
  await userEvent.type(screen.getByLabelText(/Description détaillée/), 'Débit erroné');
  const question = screen.getByText(/Avez-vous remarqué des signes avant l'incident/);
  expect(question.compareDocumentPosition(screen.getByLabelText(/Description détaillée/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByText(/Je ne sais pas/)).toBeNull();
  expect(screen.queryByText(/Facultatif, mais utile/)).toBeNull();
  expect(screen.queryByText(/pas celui de la déclaration/)).toBeNull();
  // bloqué sans réponse
  await userEvent.click(screen.getByRole('button', { name: /Suivant|Continuer/ }));
  expect(screen.getByRole('heading', { name: 'Description des faits' })).toBeTruthy();
  expect(screen.queryByRole('radio', { name: /Modérée/ })).toBeNull();
  // « Oui » ouvre les signes du type ; sans signe ni délai, toujours bloqué
  await userEvent.click(screen.getByRole('radio', { name: 'Oui' }));
  expect(await screen.findByText('Quels signes ?')).toBeTruthy();
  // liste déroulante à choix multiples (et non toutes les pastilles à l'écran)
  expect(screen.queryByRole('checkbox', { name: 'Bruit anormal' })).toBeNull();
  expect(screen.queryByRole('option')).toBeNull(); // fermée tant qu'on ne l'ouvre pas
  // liste à choix multiples avec recherche (combobox) : fermée, elle résume le choix dans son texte d'aide
  const signs = screen.getByRole('combobox', { name: /Signes avant l'incident/ });
  expect(signs.getAttribute('placeholder')).toBe('Sélectionner les signes');
  await userEvent.click(signs);
  expect(signs.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getAllByRole('option').length).toBeGreaterThan(8);
  await userEvent.type(signs, 'bruit'); // on tape directement dans le champ pour filtrer
  expect(screen.getAllByRole('option')).toHaveLength(1);
  await userEvent.click(screen.getByRole('option', { name: 'Bruit anormal' }));
  expect(screen.getByRole('option', { name: 'Bruit anormal' }).getAttribute('aria-selected')).toBe('true');
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('option')).toBeNull(); // Échap referme la liste ; le choix est conservé
  expect(signs.getAttribute('placeholder')).toBe('1 signe sélectionné');
  // retirer / remettre depuis la pastille
  await userEvent.click(screen.getByRole('button', { name: 'Retirer Bruit anormal' }));
  expect(signs.getAttribute('placeholder')).toBe('Sélectionner les signes');
  await userEvent.click(signs);
  await userEvent.click(screen.getByRole('option', { name: 'Bruit anormal' }));
  await userEvent.keyboard('{Escape}');
  expect(screen.getByRole('button', { name: 'Retirer Bruit anormal' })).toBeTruthy();
  await userEvent.click(screen.getByRole('radio', { name: '1 à 7 jours' }));
  await userEvent.click(screen.getByRole('button', { name: /Suivant|Continuer/ }));
  expect(await screen.findByRole('radio', { name: /Modérée/ })).toBeTruthy();
});
