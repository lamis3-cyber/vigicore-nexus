import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import GlobalSearch from '../src/dashboards/components/GlobalSearch.jsx';
import { searchEverything, fold } from '../src/dashboards/lib/globalSearch';
import { DR_PATIENTS } from '../src/dashboards/data/doctorVigilance';

const user = { id: 'u1', role: 'doctor', organizationId: null };
beforeEach(() => { cleanup(); localStorage.clear(); });

describe('recherche globale', () => {
  it('ignore accents et casse, trouve les pages du menu', () => {
    expect(fold('Déclarations')).toBe('declarations');
    const r = searchEverything('DECLARAT', { portalKey: 'doctor', user });
    expect(r.some((x) => x.group === 'Pages' && x.target === 'doc-declarations')).toBe(true);
  });
  it('moins de 2 caractères : aucun résultat', () => { expect(searchEverything('d', { portalKey: 'doctor', user })).toEqual([]); });
  it('trouve mes brouillons, pas ceux des autres', () => {
    localStorage.setItem('vigicore.declaration-draft.u1.Médecine', JSON.stringify({ wiz: { productName: 'Pompe Zeta' }, savedAt: new Date().toISOString() }));
    localStorage.setItem('vigicore.declaration-draft.u2.Médecine', JSON.stringify({ wiz: { productName: 'Pompe Autre' }, savedAt: new Date().toISOString() }));
    const r = searchEverything('pompe', { portalKey: 'doctor', user });
    expect(r.map((x) => x.sub)).toEqual(['Pompe Zeta']);
  });
  it('les patients ne sont cherchés que pour un médecin', () => {
    DR_PATIENTS.push({ id: 'pt-t', name: 'Amira Test', condition: 'x', organizationId: null });
    expect(searchEverything('amira', { portalKey: 'doctor', user }).some((x) => x.group === 'Patients')).toBe(true);
    expect(searchEverything('amira', { portalKey: 'pharmacist', user }).some((x) => x.group === 'Patients')).toBe(false);
    DR_PATIENTS.pop();
  });
  it('composant : taper puis Entrée navigue vers le résultat', () => {
    const go = vi.fn();
    render(<GlobalSearch portalKey="doctor" user={user} onNavigate={go} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'alertes' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(go).toHaveBeenCalledWith('doc-alertes');
  });
});
