/**
 * Visibilité du catalogue selon ce que l'acheteur peut commander (fonctions pures + route /market/catalogue-access).
 * Règle testée : le serveur décide ; au moindre doute (Audit en panne, fabricant sans offre, offre sans orderableBy) on MONTRE.
 */
import { describe, it, expect } from 'vitest';
import { hiddenListingIds, offerOrderable, type BuyerEst, type CatalogueListing } from '../src/services/supplierOrders';

const pharmacy: BuyerEst = { buyerCategory: 'PRIVATE_PHARMACY', canOrder: true, canOrderFromManufacturers: false, canOrderFromSuppliers: true };
const both: BuyerEst = { buyerCategory: 'DISTRIBUTOR', canOrder: true, canOrderFromManufacturers: true, canOrderFromSuppliers: true };
const cannot: BuyerEst = { buyerCategory: null, canOrder: false, canOrderFromManufacturers: false, canOrderFromSuppliers: false };

const L = (id: string, sellerKind: string | null, establishmentId: string, auditRef: string | null = null): CatalogueListing => ({ id, sellerKind, establishmentId, auditRef });
const listings = [L('m1', null, 'estM1', 'mf:1'), L('m2', null, 'estM2', 'mf:2'), L('m3', null, 'estM3', null), L('s1', 'DISTRIBUTOR', 'estS1')];
const offer = (ref: string, orderableBy?: string[]) => ({ manufacturer: { ref }, ...(orderableBy ? { orderableBy } : {}) });

describe('offerOrderable', () => {
  it('true / false selon la catégorie, null si inconnu', () => {
    expect(offerOrderable({ source: 'SUPPLIER', orderableBy: ['PRIVATE_PHARMACY'] }, [pharmacy])).toBe(true);
    expect(offerOrderable({ orderableBy: ['DISTRIBUTOR'] }, [both])).toBe(true);
    expect(offerOrderable({ orderableBy: ['PRIVATE_PHARMACY'] }, [pharmacy])).toBe(false); // la source fabricant lui est fermée
    expect(offerOrderable({ orderableBy: ['DISTRIBUTOR'] }, [{ ...both, buyerCategory: 'PRIVATE_CLINIC' }])).toBe(false);
    expect(offerOrderable({}, [both])).toBeNull();
    expect(offerOrderable({ orderableBy: ['EXPORT'] }, [cannot])).toBeNull();
  });
});

describe('hiddenListingIds', () => {
  const noMine = new Set<string>();
  it('visiteur / compte qui ne peut rien commander : rien de masqué', () => {
    expect(hiddenListingIds(listings, [], noMine, null)).toEqual([]);
    expect(hiddenListingIds(listings, [cannot], noMine, [offer('mf:1', ['EXPORT'])])).toEqual([]);
  });
  it('fournisseurs seuls (pharmacie privée) : tous les fabricants masqués, sans appeler Audit', () => {
    expect(hiddenListingIds(listings, [pharmacy], noMine, null).sort()).toEqual(['m1', 'm2', 'm3']);
  });
  it('les deux sources : par fabricant, seuls ceux dont TOUTES les offres excluent ma catégorie sont masqués', () => {
    const offers = [offer('mf:1', ['EXPORT']), offer('mf:1', ['PRIVATE_CLINIC']), offer('mf:2', ['EXPORT']), offer('mf:2', ['DISTRIBUTOR'])];
    expect(hiddenListingIds(listings, [both], noMine, offers)).toEqual(['m1']);
  });
  it('fail-open : Audit en panne, fabricant sans offre, offre sans orderableBy => on montre', () => {
    expect(hiddenListingIds(listings, [both], noMine, null)).toEqual([]);
    expect(hiddenListingIds(listings, [both], noMine, [])).toEqual([]);
    expect(hiddenListingIds(listings, [both], noMine, [offer('mf:1', ['EXPORT']), offer('mf:1')])).toEqual([]);
  });
  it('mes propres fiches ne sont jamais masquées', () => {
    expect(hiddenListingIds(listings, [pharmacy], new Set(['estM1']), null).sort()).toEqual(['m2', 'm3']);
  });
  describe('fiche liée à un produit Audit (auditProductRef) : décision par produit', () => {
    const LP = (id: string, auditProductRef: string | null) => ({ ...L(id, null, 'estM1', 'mf:1'), auditProductRef });
    const P = (ref: string, maker: string, orderableBy?: string[]) => ({ ref, ...offer(maker, orderableBy) });
    // Fabricant aux offres MÉLANGÉES : pA fermé à ma catégorie, pB ouvert.
    const mixed = [P('pA', 'mf:1', ['EXPORT']), P('pB', 'mf:1', ['DISTRIBUTOR'])];
    const cat = [LP('lA', 'pA'), LP('lB', 'pB'), LP('lFree', null)];
    it('1. fiche liée à une offre fermée : masquée ; liée à une offre ouverte : visible ; non liée : règle du fabricant (visible)', () => {
      expect(hiddenListingIds(cat, [both], noMine, mixed)).toEqual(['lA']);
    });
    it('2. fiche non liée d\'un fabricant entièrement fermé : masquée comme avant ; liée à une offre ouverte du même : visible', () => {
      const closed = [P('pA', 'mf:1', ['EXPORT']), P('pB', 'mf:1', ['PRIVATE_CLINIC'])];
      expect(hiddenListingIds([LP('lFree', null), LP('lA', 'pA')], [both], noMine, closed).sort()).toEqual(['lA', 'lFree']);
      expect(hiddenListingIds([LP('lB', 'pB')], [both], noMine, [...closed.slice(0, 1), P('pB', 'mf:1', ['DISTRIBUTOR'])])).toEqual([]);
    });
    it('3. offre liée introuvable (retirée, ou même ref chez un AUTRE fabricant) : règle du fabricant ; offre sans orderableBy : visible', () => {
      expect(hiddenListingIds([LP('lGone', 'pZ')], [both], noMine, mixed)).toEqual([]); // fabricant en partie ouvert => visible
      const closed = [P('pB', 'mf:1', ['EXPORT'])];
      expect(hiddenListingIds([LP('lGone', 'pZ')], [both], noMine, closed)).toEqual(['lGone']); // fabricant fermé => masquée, comme non liée
      expect(hiddenListingIds([LP('lX', 'pA')], [both], noMine, [P('pA', 'mf:2', ['DISTRIBUTOR']), ...closed])).toEqual(['lX']); // la ref d'un autre fabricant ne compte pas
      expect(hiddenListingIds([LP('lA', 'pA')], [both], noMine, [P('pA', 'mf:1')])).toEqual([]);
    });
    it('4. Audit en panne : rien de masqué ; source fabricant fermée (pharmacie privée) : masquée quand même, lien ou pas', () => {
      expect(hiddenListingIds(cat, [both], noMine, null)).toEqual([]);
      expect(hiddenListingIds(cat, [pharmacy], noMine, null).sort()).toEqual(['lA', 'lB', 'lFree']);
      expect(hiddenListingIds(cat, [both], new Set(['estM1']), mixed)).toEqual([]); // mes propres fiches
    });
  });
});
