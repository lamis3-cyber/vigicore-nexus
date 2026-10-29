/** La fiche d'UN produit ne propose que CE produit (jamais tout le catalogue du fabricant). */
import { describe, it, expect } from 'vitest';
import { offersForListing } from '../src/services/market';

const offers = [
  { ref: 'p-ins', name: 'Algerpharm — Insuline glargine 100 UI/mL' },
  { ref: 'p-cat', name: 'SURGITEC — Cathéter veineux périphérique 18G, boîte de 50' },
  { ref: 'p-qc', name: 'BatchTrace QC Suite' },
];

describe('offersForListing', () => {
  it('fiche liée : seulement l\'offre de même ref', () => {
    expect(offersForListing(offers, { title: 'peu importe', auditProductRef: 'p-cat' }).map((o) => o.ref)).toEqual(['p-cat']);
  });
  it('fiche liée à une offre retirée : aucune offre (pas de repli sur un autre produit)', () => {
    expect(offersForListing(offers, { title: 'BatchTrace QC Suite', auditProductRef: 'p-old' })).toEqual([]);
  });
  it('fiche non liée : nom identique (accents, casse, espaces ignorés)', () => {
    expect(offersForListing(offers, { title: 'surgitec — catheter veineux  peripherique 18G, boîte de 50' }).map((o) => o.ref)).toEqual(['p-cat']);
  });
  it('fiche non liée sans nom identique : aucune offre, jamais de devinette', () => {
    expect(offersForListing(offers, { title: 'NOUR — Crème solaire SPF 50+' })).toEqual([]);
    expect(offersForListing(offers, { title: 'Cathéter 18G' })).toEqual([]);
  });
  it('deux offres au même nom : ambigu, aucune offre', () => {
    expect(offersForListing([...offers, { ref: 'p-qc2', name: 'BatchTrace QC Suite' }], { title: 'BatchTrace QC Suite' })).toEqual([]);
  });
});
