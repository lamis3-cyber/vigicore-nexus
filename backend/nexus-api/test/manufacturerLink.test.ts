/** Lien établissement -> organisation Audit : la commande suit le PROPRIÉTAIRE de la fiche, l'id n'est stocké qu'une fois. */
import { describe, it, expect } from 'vitest';
import { auditManufacturers, findEstablishment, findManufacturer, proposeLinks, normalizeName } from '../src/services/manufacturerLink';

const offers = [
  { ref: 'p1', manufacturer: { ref: 'org-1', name: 'Numidia Pharma' } },
  { ref: 'p2', manufacturer: { ref: 'org-1', name: 'Numidia Pharma' } },
  { ref: 'p3', manufacturer: { ref: 'org-2', name: 'Atlas Labo' } },
  { ref: 'p4', manufacturer: {} },
];
const ms = auditManufacturers(offers);
const E = (id: string, name: string, ref: string | null = null) => ({ id, name, type: 'SUPPLIER', auditManufacturerRef: ref });

describe('manufacturerLink', () => {
  it('déduit les fabricants d\'Audit des offres (comptées, triées, sans ref ignorées)', () => {
    expect(ms).toEqual([{ ref: 'org-2', name: 'Atlas Labo', offers: 1 }, { ref: 'org-1', name: 'Numidia Pharma', offers: 2 }]);
    expect(auditManufacturers([])).toEqual([]);
  });
  it('normalise casse, accents et ponctuation', () => {
    expect(normalizeName('  Numidia-PHARMA ')).toBe('numidia pharma');
    expect(normalizeName('Laboratoire Éclat')).toBe('laboratoire eclat');
  });
  it('trouve un établissement par id ou par nom unique ; ambigu / inconnu refusés', () => {
    const list = [E('a', 'Numidia Pharma'), E('b', 'Doublon'), E('c', 'doublon')];
    expect(findEstablishment(list, 'a')).toMatchObject({ ok: true });
    expect(findEstablishment(list, 'numidia pharma')).toMatchObject({ ok: true, item: { id: 'a' } });
    expect(findEstablishment(list, 'Doublon')).toMatchObject({ ok: false, reason: 'AMBIGUOUS' });
    expect(findEstablishment(list, 'Inconnu')).toMatchObject({ ok: false, reason: 'NOT_FOUND' });
  });
  it('trouve une organisation Audit par id ou par nom ; une organisation sans offre est inconnue', () => {
    expect(findManufacturer(ms, 'org-1')).toMatchObject({ ok: true, item: { name: 'Numidia Pharma' } });
    expect(findManufacturer(ms, 'atlas labo')).toMatchObject({ ok: true, item: { ref: 'org-2' } });
    expect(findManufacturer(ms, 'demo-numidia')).toMatchObject({ ok: false, reason: 'NOT_FOUND' });
  });
  it('--auto : lie seulement les noms identiques, remplace demo-…, n\'écrase jamais un vrai lien, jamais deux fois la même organisation', () => {
    const plan = proposeLinks([E('n', 'Numidia Pharma', 'demo-numidia'), E('x', 'Atlas Labo', 'org-2'), E('y', 'Autre')], ms);
    expect(plan.map((p) => [p.establishment.id, p.manufacturer.ref])).toEqual([['n', 'org-1']]);
    // même nom proposé à deux établissements : le premier seul l'obtient
    const dup = proposeLinks([E('n1', 'Numidia Pharma'), E('n2', 'numidia pharma')], ms);
    expect(dup).toHaveLength(1);
  });
});
