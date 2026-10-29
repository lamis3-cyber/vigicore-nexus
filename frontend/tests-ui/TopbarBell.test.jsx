/** Cloche de la barre du haut : la pastille rouge n'apparaît que s'il reste quelque chose de non lu. */
import { it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import TopbarRaw from '../src/dashboards/components/Topbar.jsx';
import { I18nProvider } from '../src/i18n/index.jsx';
const Topbar = (p) => <I18nProvider remount={false}><TopbarRaw {...p} /></I18nProvider>;

beforeEach(() => { cleanup(); try { localStorage.clear(); } catch { /* */ } globalThis.fetch = vi.fn(async () => ({ status: 200, ok: true, json: async () => ({ success: true }) })); });
const bell = () => screen.getByRole('button', { name: /Notifications|Alertes/ });
const props = { userName: 'X', userInitials: 'X', user: { id: 'u1' }, onOpenAlerts: () => {}, onNavigate: () => {} };

it('administrateur : pastille selon le nombre de non-lus', () => {
  const { rerender } = render(<Topbar {...props} portalKey="hospital-admin" queueUnread={2} activeId="admin-dashboard" />);
  expect(bell().className).toContain('icon-btn--alert');
  rerender(<Topbar {...props} portalKey="hospital-admin" queueUnread={0} activeId="org-notifications" />);
  expect(bell().className).not.toContain('icon-btn--alert');
});

it('autres rôles : la pastille disparaît après la première visite de la page d\'alertes', () => {
  const { rerender } = render(<Topbar {...props} portalKey="doctor" activeId="doc-dashboard" />);
  expect(bell().className).toContain('icon-btn--alert');
  rerender(<Topbar {...props} portalKey="doctor" activeId="doc-alertes" />);
  expect(bell().className).not.toContain('icon-btn--alert');
  cleanup();
  render(<Topbar {...props} portalKey="doctor" activeId="doc-dashboard" />);
  expect(bell().className).not.toContain('icon-btn--alert'); // mémorisé
});
