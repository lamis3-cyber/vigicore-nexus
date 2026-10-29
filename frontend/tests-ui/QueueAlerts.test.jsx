/** Notification du responsable vigilance : compteur de la file + message à chaque nouvelle déclaration (API simulée). */
import { it, vi, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { useQueueAlerts } from '../src/dashboards/lib/useQueueAlerts';

let summary;
beforeEach(() => {
  cleanup();
  summary = { pending: 0, unread: 0, latest: null };
  globalThis.fetch = vi.fn(async () => ({ status: 200, ok: true, json: async () => ({ success: true, ...summary }) }));
});

function Probe({ enabled, toast }) {
  const n = useQueueAlerts(enabled, toast);
  return <span data-testid="n">{n === null ? 'null' : n}</span>;
}

it('désactivé (pas responsable vigilance) : aucun appel, aucun compteur', async () => {
  render(<Probe enabled={false} toast={vi.fn()} />);
  expect(screen.getByTestId('n').textContent).toBe('null');
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

it('à l\'ouverture : compteur + message si des déclarations attendent ; nouvelle arrivée : message dédié', async () => {
  summary = { pending: 2, unread: 2, latest: { id: 'd1', label: 'Pompe X' } };
  const toast = vi.fn();
  render(<Probe enabled toast={toast} />);
  expect(await screen.findByText('2')).toBeTruthy();
  expect(toast).toHaveBeenCalledWith('info', 'Nouvelles déclarations', expect.stringContaining('2'), 'ti ti-bell');
  summary = { pending: 3, unread: 3, latest: { id: 'd2', label: 'Prednisolone 1 %' } };
  await act(async () => { window.dispatchEvent(new Event('vigicore:submissions-changed')); });
  expect(await screen.findByText('3')).toBeTruthy();
  expect(toast).toHaveBeenLastCalledWith('info', 'Nouvelle déclaration reçue', expect.stringContaining('Prednisolone 1 %'), 'ti ti-bell');
});

it('enquête clôturée par le fabricant : message à la nouvelle clôture (pas au premier chargement)', async () => {
  summary = { pending: 0, unread: 0, latest: null, closed: { id: 'd1', label: 'Pompe X', at: '2026-10-23T10:00:00Z', count: 1 } };
  const toast = vi.fn();
  render(<Probe enabled toast={toast} />);
  expect(await screen.findByText('0')).toBeTruthy();
  expect(toast).not.toHaveBeenCalled();
  summary = { pending: 0, unread: 0, latest: null, closed: { id: 'd2', label: 'Prednisolone 1 %', at: '2026-10-23T11:00:00Z', count: 2 } };
  await act(async () => { window.dispatchEvent(new Event('vigicore:submissions-changed')); });
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  expect(toast).toHaveBeenCalledWith('success', 'Enquête clôturée par le fabricant', expect.stringContaining('Prednisolone 1 %'), 'ti ti-circle-check');
});

it('la pastille suit les éléments NON LUS : voir la liste la fait disparaître', async () => {
  summary = { pending: 2, unread: 2, latest: { id: 'd1', label: 'Pompe X' }, closed: null };
  render(<Probe enabled toast={vi.fn()} />);
  expect(await screen.findByText('2')).toBeTruthy();
  summary = { pending: 2, unread: 0, latest: { id: 'd1', label: 'Pompe X' }, closed: null }; // « Nouvelles » restent, mais elles ont été vues
  await act(async () => { window.dispatchEvent(new Event('vigicore:queue-seen')); });
  expect(await screen.findByText('0')).toBeTruthy();
});
