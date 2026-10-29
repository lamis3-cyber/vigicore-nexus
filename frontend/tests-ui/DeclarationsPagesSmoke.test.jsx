/**
 * Fumée : chaque page qui embarque « Mes envois » / « File » / Support / assistants de déclaration doit
 * s'afficher sans exception, que l'API réponde, soit coupée ou renvoie 401 (jamais une page vide).
 */
import { it, vi, expect } from 'vitest';
import { render, cleanup } from '@testing-library/react';
vi.mock('../src/dashboards/context/ToastContext', () => ({ useToast: () => vi.fn() }));
vi.mock('../src/dashboards/context/AuthContext', async (orig) => ({ ...(await orig()), useAuth: () => ({ user: { id: 'u1', role: 'DOCTOR', name: 'Dr X' } }), getCurrentAuthUser: () => ({ id: 'u1', role: 'DOCTOR' }) }));
vi.mock('../src/dashboards/services/chatApi', () => ({ chatApi: {
  threads: async () => ({ threads: [] }), connections: async () => ({ friends: [], incoming: [], outgoing: [] }),
  openThread: async () => ({}), send: async () => ({}), accept: async () => ({}), decline: async () => ({}), removeConnection: async () => ({}),
  messages: async () => ({ messages: [] }), search: async () => ({ users: [] }), request: async () => ({}), markRead: async () => ({}),
} }));
const pages = {
  doctor: import('../src/dashboards/pages/doctor/DoctorDeclarations.jsx'),
  clin: import('../src/dashboards/pages/clinique/ClinDeclarations.jsx'),
  ms: import('../src/dashboards/pages/medicalstaff/MedicalStaffDeclarations.jsx'),
  hosp: import('../src/dashboards/pages/hospital/HospDeclarations.jsx'),
  lab: import('../src/dashboards/pages/labo/LabDeclarations.jsx'),
  cm: import('../src/dashboards/pages/centremedical/CmDeclarations.jsx'),
  ph: import('../src/dashboards/pages/pharmacien/PharmDeclarations.jsx'),
  pat: import('../src/dashboards/pages/patient/PatientDossiers.jsx'),
  msgr: import('../src/dashboards/pages/messenger/Messenger.jsx'),
  patDecl: import('../src/dashboards/pages/patient/PatientDeclarer.jsx'),
  instDecl: import('../src/dashboards/pages/institutional/InstitutionalDeclarer.jsx'),
};
for (const mode of ['ok', 'network', 'empty401']) for (const [k, p] of Object.entries(pages)) {
  it(`${k} / ${mode}`, async () => {
    cleanup();
    globalThis.fetch = mode === 'network' ? vi.fn().mockRejectedValue(new Error('down'))
      : vi.fn().mockResolvedValue({ status: mode === 'ok' ? 200 : 401, ok: mode === 'ok', json: async () => (mode === 'ok' ? { success: true, submissions: [], records: [], declarations: [] } : null) });
    const errs = []; const on = (e) => errs.push(e.message); window.addEventListener('error', on);
    const Page = (await p).default;
    const r = render(<Page onNavigate={() => {}} onOpenDeclareWizard={() => {}} />);
    await new Promise((x) => setTimeout(x, 250));
    window.removeEventListener('error', on);
    expect(errs).toEqual([]);
    expect(r.container.innerHTML.length).toBeGreaterThan(500);
  });
}

it('messagerie : l\'onglet « Support laboratoires » s\'affiche sans exception (API coupée ou vide)', async () => {
  const { default: userEvent } = await import('@testing-library/user-event');
  const { screen } = await import('@testing-library/react');
  for (const down of [true, false]) {
    cleanup();
    globalThis.fetch = down ? vi.fn().mockRejectedValue(new Error('down')) : vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ success: true, threads: [], organizations: [], topics: [] }) });
    const errs = []; const on = (e) => errs.push(e.message); window.addEventListener('error', on);
    const Page = (await pages.msgr).default;
    render(<Page onNavigate={() => {}} />);
    await userEvent.click(await screen.findByRole('tab', { name: /Support laboratoires/ }));
    await new Promise((x) => setTimeout(x, 250));
    window.removeEventListener('error', on);
    expect(errs).toEqual([]);
    expect(document.body.innerHTML).toMatch(/Support/);
  }
});

it('un seul bloc à onglets : « Déclarations » en premier (par défaut), puis Mes envois / File ; un seul tableau visible à la fois', async () => {
  const { default: userEvent } = await import('@testing-library/user-event');
  const { screen } = await import('@testing-library/react');
  cleanup();
  globalThis.fetch = vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ success: true, submissions: [], records: [], declarations: [] }) });
  const Page = (await pages.doctor).default;
  render(<Page onNavigate={() => {}} onOpenDeclareWizard={() => {}} />);
  const tabs = (await screen.findAllByRole('tab')).map((t) => t.textContent).slice(0, 3);
  expect(tabs).toEqual(['Déclarations', 'Mes envois', "File de l'établissement"]);
  expect(screen.getByRole('tab', { name: 'Déclarations' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByText('Toutes')).toBeTruthy();                       // le tableau historique est affiché d'emblée
  expect(screen.queryByText(/démonstration/i)).toBeNull();               // plus d'intitulé « démonstration »
  expect(screen.queryByText('Mes envois à la vigilance')).toBeNull();
  await userEvent.click(screen.getByRole('tab', { name: 'Mes envois' }));
  expect(await screen.findByText('Mes envois à la vigilance')).toBeTruthy();
  expect(screen.queryByText('Toutes')).toBeNull();
  await userEvent.click(screen.getByRole('tab', { name: "File de l'établissement" }));
  expect(await screen.findByRole('region', { name: "File de l'établissement" })).toBeTruthy();
  expect(screen.queryByText('Mes envois à la vigilance')).toBeNull();
  // patient : pas d'onglet « File »
  cleanup();
  const Pat = (await pages.pat).default;
  render(<Pat onNavigate={() => {}} />);
  expect(await screen.findByRole('tab', { name: 'Mes envois' })).toBeTruthy();
  expect(screen.queryByRole('tab', { name: "File de l'établissement" })).toBeNull();
});
