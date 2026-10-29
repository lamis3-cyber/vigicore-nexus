import { describe, it, expect } from 'vitest';
import { productNameMatches, significantWords } from '../src/services/listingProductLink';

describe('cohérence fiche ↔ produit lié (2026-10-29)', () => {
  it('refuse une fiche sans rapport avec le produit (cathéter lié à Aciclovir)', () => {
    expect(productNameMatches('SURGITEC — Cathéter veineux périphérique 18G, boîte de 50', { name: 'Aciclovir 400 mg — comprimé (Ampoule x5)', reference: 'PHA-1361' })).toBe(false);
  });
  it('accepte le même produit malgré marque, accents, casse et dosage', () => {
    expect(productNameMatches('Algerpharm — Insuline glargine 100 UI/mL, stylo prérempli 3 mL', { name: 'INSULINE GLARGINE 100 UI/ML', reference: null })).toBe(true);
    expect(productNameMatches('Aciclovir 400 mg comprimés', { name: 'Aciclovir 400 mg — comprimé (Ampoule x5)', reference: 'PHA-1361' })).toBe(true);
  });
  it('accepte une fiche qui cite la référence du produit', () => {
    expect(productNameMatches('Antiviral oral — réf. PHA-1361', { name: 'Aciclovir 400 mg', reference: 'PHA-1361' })).toBe(true);
  });
  it('les mots vides, unités et nombres ne suffisent pas à « correspondre »', () => {
    expect(productNameMatches('Crème solaire 200 mL, flacon', { name: 'Sirop 200 mL, flacon', reference: null })).toBe(false);
    expect([...significantWords('Boîte de 50 — 18G, très haute')]).toEqual([]);
  });
  it('titre vide : pas d’alerte', () => {
    expect(productNameMatches('', { name: 'Aciclovir', reference: null })).toBe(true);
  });
});
