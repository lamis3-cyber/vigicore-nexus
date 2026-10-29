/** Lien médecin ↔ patient (« Mes médecins », déclarations partagées) et tableau de bord administrateur (API simulée). */
import { it, vi, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../src/dashboards/context/ToastContext', () => ({ useToast: () => vi.fn() }));
vi.mock('../src/dashboards/context/AuthContext', async (orig) => ({
  ...(await orig()),
  useAuth: () => ({ user: { id: 'adm', role: 'administrator', name: 'Admin CHU', orgId: 'E1' } }),
  getCurrentAuthUser: () => ({ id: 'adm', role: 'administrator', orgId: 'E1' }),
}));
vi.mock('../src/dashboards/config/organizations', async (orig) => ({
  ...(await orig()), getOrganization: () => ({ id: 'E1', name: 'CHU Demo Sétif', type: 'hospital', departments: [], availableRoles: [] }),
}));
import PatientMedecins from '../src/dashboards/pages/patient/PatientMedecins.jsx';
import PatientSharedList from '../src/dashboards/components/PatientSharedList.jsx';
import AdminDashboard from '../src/dashboards/pages/admin/AdminDashboard.jsx';
import OrgPersonnel from '../src/dashboards/pages/admin/OrgPersonnel.jsx';

let routes; let calls;
const ok = (json, status = 200) => ({ status, ok: status < 300, json: async () => ({ success: true, ...json }) });
beforeEach(() => {
  cleanup(); calls = [];
  routes = {};
  globalThis.fetch = vi.fn(async (url, opts = {}) => {
    const u = String(url).replace(/^.*\/api/, ''); const method = opts.method || 'GET';
    calls.push(`${method} ${u}`);
    const h = routes[`${method} ${u}`] || routes[u];
    return h ? ok(typeof h === 'function' ? h() : h) : ok({});
  });
});

it('patient : accepter un médecin, puis arrêter le partage (avec confirmation)', async () => {
  let status = 'PENDING';
  const doctors = () => ({ doctors: [{ doctorId: 'doc', displayName: 'Dr. Yacine Benali', establishment: 'CHU Demo Sétif', status, since: '2026-10-01T00:00:00Z' }] });
  routes['GET /care/doctors'] = doctors;
  routes['POST /care/doctors/doc/accept'] = () => { status = 'ACCEPTED'; return doctors(); };
  routes['POST /care/doctors/doc/decline'] = () => ({ doctors: [] });
  render(<PatientMedecins />);
  expect(await screen.findByText('En attente de votre accord')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: /Accepter/ }));
  expect(await screen.findByText('Partage actif')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Arrêter le partage' }));
  expect(calls).not.toContain('POST /care/doctors/doc/decline'); // une confirmation est demandée
  await userEvent.click(screen.getByRole('button', { name: 'Confirmer l’arrêt' }));
  expect(calls).toContain('POST /care/doctors/doc/decline');
  expect(await screen.findByText('Aucun médecin pour le moment')).toBeTruthy();
});

it('médecin : liste des déclarations partagées par ses patients, ouverture du détail', async () => {
  const rec = { id: 'r1', kind: 'PATIENT', status: 'SUBMITTED', createdAt: new Date().toISOString(), authorName: 'Karim', sharedWithMe: true,
    fields: [{ key: 'productName', value: 'Doliprane 1g' }, { key: 'severity', value: 'legere' }, { key: 'symptomDesc', value: 'Nausées' }], deliveries: [], measures: [], permissions: {} };
  routes['GET /records/from-patients'] = { records: [rec] };
  routes['GET /records/r1'] = { record: rec };
  render(<PatientSharedList />);
  expect(await screen.findByText('Doliprane 1g')).toBeTruthy();
  expect(screen.getByText('Karim')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: /Ouvrir/ }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog.textContent).toContain('Nausées');
  expect(dialog.textContent).toContain('Déclaration partagée par votre patient');
  expect(dialog.textContent).not.toContain('Mesures internes');
});

it('administrateur : chiffres réels de l\'équipe et des déclarations', async () => {
  routes['GET /orgs/E1/overview'] = {
    organization: { id: 'E1', name: 'CHU Demo Sétif', type: 'HOSPITAL' },
    members: [
      { membershipId: 'm1', userId: 'u1', displayName: 'Dr. Yacine Benali', email: 'y@x.dz', role: 'DOCTOR', memberRole: 'MEMBER', departmentId: 'd1', departmentName: 'Cardiologie', since: '2026-01-01' },
      { membershipId: 'm2', userId: 'u2', displayName: 'Admin CHU', email: 'a@x.dz', role: 'ORG_ADMIN', memberRole: 'ADMIN', departmentId: null, departmentName: null, since: '2026-01-01' },
    ],
    requests: [{ membershipId: 'm3', displayName: 'Leila', role: 'HOSPITAL' }],
    invitations: [], departments: [{ id: 'd1', name: 'Cardiologie', members: 1 }, { id: 'd2', name: 'Urgences', members: 0 }],
  };
  routes['GET /records/queue'] = { records: [
    { id: 'r1', kind: 'INCIDENT', status: 'SUBMITTED', createdAt: new Date().toISOString(), authorName: 'Dr. Yacine Benali', fields: [{ key: 'productName', value: 'Prednisolone 1 %' }], measures: [], deliveries: [{ destination: 'MANUFACTURER', status: 'UNDER_REVIEW' }] },
  ] };
  render(<AdminDashboard onNavigate={() => {}} />);
  expect(await screen.findByText('Prednisolone 1 %')).toBeTruthy();
  expect(screen.queryByText('Aucun responsable vigilance')).toBeNull();
  const kpi = (label) => screen.getAllByText(label).map((x) => x.closest('.kpi-card')).find(Boolean);
  expect(within(kpi('Membres actifs')).getByText('2')).toBeTruthy();
  expect(within(kpi('Membres actifs')).getByText(/1 demande\(s\) en attente/)).toBeTruthy();
  expect(within(kpi('Services')).getByText('2')).toBeTruthy();
  expect(within(kpi('Nouvelles déclarations')).getByText('1')).toBeTruthy();
  expect(within(kpi('Enquêtes fabricants')).getByText('1')).toBeTruthy();
  expect(screen.getByText('Prednisolone 1 %')).toBeTruthy();
});

it('Personnel : membres réels filtrables par service', async () => {
  routes['GET /orgs/E1/overview'] = {
    members: [
      { membershipId: 'm1', displayName: 'Dr. Yacine Benali', email: 'y@x.dz', role: 'DOCTOR', memberRole: 'MEMBER', departmentId: 'd1', departmentName: 'Cardiologie', since: '2026-01-01' },
      { membershipId: 'm2', displayName: 'Dr. Sara Haddad', email: 's@x.dz', role: 'DOCTOR', memberRole: 'MEMBER', departmentId: 'd2', departmentName: 'Urgences', since: '2026-01-01' },
    ],
    requests: [], invitations: [], departments: [{ id: 'd1', name: 'Cardiologie', members: 1 }, { id: 'd2', name: 'Urgences', members: 1 }],
  };
  render(<OrgPersonnel onNavigate={() => {}} />);
  expect(await screen.findByText('Dr. Sara Haddad')).toBeTruthy();
  await userEvent.selectOptions(screen.getByLabelText('Service'), 'd1');
  expect(screen.queryByText('Dr. Sara Haddad')).toBeNull();
  expect(screen.getByText('Dr. Yacine Benali')).toBeTruthy();
});
