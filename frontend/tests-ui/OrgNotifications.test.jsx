/** Établissement : notifications, détail d'une déclaration, mesures internes et suivi de l'enquête du fabricant (API simulée). */
import { it, vi, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrgNotifications from '../src/dashboards/pages/admin/OrgNotifications.jsx';

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const rec = (id, product, extra = {}) => ({
  id, kind: 'INCIDENT', status: 'SUBMITTED', createdAt: ago(60), authorName: 'Dr. Yacine Benali', departmentName: 'Cardiologie',
  fields: [{ key: 'productName', value: product }, { key: 'severity', value: 'grave' }, { key: 'manufacturerName', value: 'numidia-pharma' }],
  measures: [], permissions: {}, ...extra,
});
let records; let posted;
beforeEach(() => {
  cleanup(); posted = [];
  records = [
    rec('d2', 'Prednisolone 1 %', {
      deliveries: [{ destination: 'ORG', status: 'AVAILABLE' }, { destination: 'CNPM', status: 'SENT' }, { destination: 'MANUFACTURER', status: 'UNDER_REVIEW', updatedAt: ago(30) }],
      signal: { sameProduct: 3, sameLot: 2, lot: 'PHA-1040' },
    }),
    rec('d1', 'Pompe X', {
      createdAt: ago(600), measures: [{ measures: ['hors_service'], note: null, byName: 'Resp. Vigilance', at: ago(500) }],
      deliveries: [{ destination: 'ORG', status: 'AVAILABLE' }, { destination: 'MANUFACTURER', status: 'CLOSED', updatedAt: ago(10) }],
    }),
  ];
  globalThis.fetch = vi.fn(async (url, opts = {}) => {
    const u = String(url);
    const m = u.match(/\/records\/(d\d+)(\/measures)?$/);
    if (m && m[2]) {
      const body = JSON.parse(opts.body);
      posted.push(body);
      const r = records.find((x) => x.id === m[1]);
      r.measures = [...r.measures, { ...body, note: body.note ?? null, byName: 'Resp. Vigilance', at: new Date().toISOString() }];
      return { status: 200, ok: true, json: async () => ({ success: true, record: r }) };
    }
    const json = m ? { success: true, record: records.find((r) => r.id === m[1]) } : { success: true, records };
    return { status: 200, ok: true, json: async () => json };
  });
});

it('« Nouvelles » : déclarations sans mesure interne ; « Toutes » : aussi les enquêtes clôturées par le fabricant', async () => {
  render(<OrgNotifications onNavigate={vi.fn()} />);
  expect(await screen.findByText('Prednisolone 1 %')).toBeTruthy();
  expect(screen.getByText(/Par Dr\. Yacine Benali · Cardiologie · Gravité : Grave/)).toBeTruthy();
  expect(screen.queryByText('Pompe X')).toBeNull();
  await userEvent.click(screen.getByRole('tab', { name: 'Toutes' }));
  expect(screen.getAllByText('Pompe X')).toHaveLength(2); // reçue + enquête clôturée
  expect(screen.getByText(/Enquête clôturée par le fabricant/)).toBeTruthy();
});

it('administrateur : détail en consultation seule, avec le signal, les mesures et l\'état de l\'enquête', async () => {
  render(<OrgNotifications onNavigate={vi.fn()} />);
  await userEvent.click((await screen.findAllByRole('button', { name: 'Ouvrir' }))[0]);
  const dialog = await screen.findByRole('dialog');
  expect(dialog.textContent).toContain('Prednisolone 1 %');
  expect(dialog.textContent).toContain('2 déclarations sur ce lot');
  expect(dialog.textContent).toContain('Transmission et enquête');
  expect(dialog.textContent).toContain('Enquête en cours chez le fabricant');
  expect(dialog.textContent).toContain('Notification envoyée (réception non confirmée)');
  expect(dialog.textContent).toContain('Consultation seule');
  expect(dialog.textContent).toContain('Elles sont saisies par le responsable vigilance');
  expect(screen.queryByRole('button', { name: /Enregistrer les mesures/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /Prendre en charge|Clôturer/ })).toBeNull();
  await userEvent.click(screen.getAllByRole('button', { name: 'Fermer' })[0]);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('responsable vigilance : enregistre des mesures internes ; « Aucune mesure » est exclusive', async () => {
  records[0].permissions = { measures: true };
  render(<OrgNotifications />);
  await userEvent.click((await screen.findAllByRole('button', { name: 'Ouvrir' }))[0]);
  await screen.findByRole('dialog');
  const save = screen.getByRole('button', { name: /Enregistrer les mesures/ });
  expect(save.disabled).toBe(true);
  await userEvent.click(screen.getByRole('checkbox', { name: /Lot isolé/ }));
  await userEvent.click(screen.getByRole('checkbox', { name: /Aucune mesure/ }));
  expect(screen.getByRole('checkbox', { name: /Lot isolé/ }).getAttribute('aria-checked')).toBe('false');
  await userEvent.click(screen.getByRole('checkbox', { name: /Lot isolé/ }));
  await userEvent.click(screen.getByRole('checkbox', { name: /Équipes informées/ }));
  await userEvent.type(screen.getByLabelText('Précision'), 'Lot isolé en pharmacie');
  await userEvent.click(save);
  expect(posted).toEqual([{ measures: ['quarantaine', 'equipes_informees'], note: 'Lot isolé en pharmacie' }]);
  expect(await screen.findByText('Lot isolé en pharmacie')).toBeTruthy();
});

it('rien de nouveau : message clair', async () => {
  records = [];
  render(<OrgNotifications />);
  expect(await screen.findByText('Aucune nouvelle déclaration.')).toBeTruthy();
});
