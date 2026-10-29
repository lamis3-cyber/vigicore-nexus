import { describe, it, expect, beforeEach } from 'vitest';
import { readWizardDraftRows } from '../src/dashboards/lib/wizardDrafts';

describe('lignes de brouillons', () => {
  beforeEach(() => localStorage.clear());
  it('liste mes brouillons non vides, jamais ceux d\'un autre utilisateur ni les vides', () => {
    localStorage.setItem('vigicore.declaration-draft.u1.Médecine', JSON.stringify({ wiz: { productName: 'Pompe X', type: 'dispositif', severity: 'grave' }, savedAt: new Date().toISOString() }));
    localStorage.setItem('vigicore.declaration-draft.u2.Médecine', JSON.stringify({ wiz: { productName: 'Autre' }, savedAt: new Date().toISOString() }));
    const rows = readWizardDraftRows('u1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'draft', isWizardDraft: true, product: 'Pompe X', domain: 'Matériovigilance', severity: 'grave' });
  });
  it('un brouillon à peine commencé est listé aussi', () => {
    localStorage.setItem('vigicore.declaration-draft.u1.Médecine', JSON.stringify({ wiz: { stepIdx: 1, kind: 'incident' }, savedAt: new Date().toISOString() }));
    expect(readWizardDraftRows('u1')).toHaveLength(1);
  });
});

import { vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
vi.mock('../src/dashboards/context/ToastContext', () => ({ useToast: () => vi.fn() }));
vi.mock('../src/dashboards/context/AuthContext', async (orig) => ({ ...(await orig()), useAuth: () => ({ user: { id: 'u1', role: 'DOCTOR', name: 'Dr X' } }), getCurrentAuthUser: () => ({ id: 'u1', role: 'DOCTOR' }) }));

describe('page Déclarations : onglet Brouillons', () => {
  it('affiche le brouillon enregistré avec « Reprendre » qui rouvre l\'assistant', async () => {
    cleanup(); localStorage.clear();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('down'));
    localStorage.setItem('vigicore.declaration-draft.u1.Médecine', JSON.stringify({ wiz: { productName: 'Pompe X', type: 'dispositif' }, savedAt: new Date().toISOString() }));
    const { default: Page } = await import('../src/dashboards/pages/doctor/DoctorDeclarations.jsx');
    const go = vi.fn();
    render(<Page onNavigate={go} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Brouillons' }));
    expect(screen.getByText(/Pompe X/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reprendre' }));
    expect(go).toHaveBeenCalledWith('doc-declarer');
  });
});
