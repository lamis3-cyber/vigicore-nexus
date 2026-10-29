/** /services — chaque carte a un lien « Voir détails » toujours visible vers /services/:id ; plus de section fabricants. */
import { it, vi, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-router-dom', () => ({ Link: ({ to, children, ...p }) => <a href={to} {...p}>{children}</a> }));
vi.mock('../src/components/layout/Navbar.jsx', () => ({ default: () => null }));
vi.mock('../src/components/layout/PageBackdrop.jsx', () => ({ default: () => null }));
vi.mock('../src/components/layout/Footer.jsx', () => ({ default: () => null }));
vi.mock('../src/hooks/usePageEffects.js', () => ({ default: () => {} }));
import ServicesPage from '../src/pages/ServicesPage.jsx';

beforeAll(() => {
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return [] } };
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  window.scrollTo = () => {};
  // Effets visuels (canvas) de la page : un contexte factice suffit, ils ne sont pas testés ici.
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
  HTMLCanvasElement.prototype.getContext = () => ctx;
  const listing = { id: 'lst-1', title: 'Amoxicilline Numidia', summary: 'Antibiotique', category: 'Pharmaceuticals', orgName: 'Numidia Pharma', placement: 'STANDARD', certifications: [] };
  globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, listings: [listing] }) }));
});

it('carte -> « Voir détails » pointe vers la fiche ; la section « Commander auprès des fabricants » a disparu', async () => {
  render(<ServicesPage />);
  const link = await screen.findByRole('link', { name: /Voir les détails de Amoxicilline Numidia/ });
  expect(link.getAttribute('href')).toBe('/services/lst-1');
  expect(link.textContent).toContain('Voir détails');
  expect(screen.queryByText('Commander auprès des fabricants')).toBeNull();
});
