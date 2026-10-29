import { describe, expect, it } from 'vitest';
import {
  buyerAccess, buyerMayCancel, isLocalRef, isOrderableListing, listingToOffer, localRef, newOrderReference, orderTotal,
  hasStockFor, parseLocalLines, parseSellingTerms, pickListingForOffer, listingForOffer, releasesStock, reservedLines, sellerMayMove, supplierBuyerTypes, supplierOrderEligibility, toBuyerDto, toSellerDto,
} from '../src/services/supplierOrders';

const est = (o: Partial<{ buyerCategory: string | null; buyerCategoryStatus: string | null }> = {}) =>
  ({ id: 'e1', name: 'Pharmacie Nour', buyerCategory: 'PRIVATE_PHARMACY', buyerCategoryStatus: 'VERIFIED', ...o }) as any;

describe('qui peut acheter chez un fournisseur', () => {
  it('par défaut toutes les catégories ; SUPPLIER_ORDER_BUYER_TYPES restreint', () => {
    expect(supplierBuyerTypes({})).toContain('PRIVATE_PHARMACY');
    expect(supplierBuyerTypes({ SUPPLIER_ORDER_BUYER_TYPES: 'PRIVATE_PHARMACY, bidon' })).toEqual(['PRIVATE_PHARMACY']);
  });
  it('une pharmacie VÉRIFIÉE peut commander', () => {
    expect(supplierOrderEligibility(est(), true, {})).toEqual({ ok: true });
  });
  it('refuse : pas admin/pharmacien, non déclarée, en cours de vérification, refusée', () => {
    expect(supplierOrderEligibility(est(), false, {})).toEqual({ ok: false, reason: 'NOT_ESTABLISHMENT_ADMIN' });
    expect(supplierOrderEligibility(null, true, {})).toEqual({ ok: false, reason: 'NOT_ESTABLISHMENT_ADMIN' });
    expect(supplierOrderEligibility(est({ buyerCategory: null, buyerCategoryStatus: null }), true, {})).toEqual({ ok: false, reason: 'CATEGORY_NOT_DECLARED' });
    expect(supplierOrderEligibility(est({ buyerCategoryStatus: 'DECLARED' }), true, {})).toEqual({ ok: false, reason: 'CATEGORY_NOT_VERIFIED' });
    expect(supplierOrderEligibility(est({ buyerCategoryStatus: 'REJECTED' }), true, {})).toEqual({ ok: false, reason: 'CATEGORY_REJECTED' });
  });
  it('catégorie hors liste : refusée, même vérifiée', () => {
    expect(supplierOrderEligibility(est(), true, { SUPPLIER_ORDER_BUYER_TYPES: 'DISTRIBUTOR' })).toEqual({ ok: false, reason: 'CATEGORY_NOT_ALLOWED' });
  });
  it('buyerAccess : une pharmacie vérifiée commande chez un fournisseur mais pas chez un fabricant', () => {
    const a = buyerAccess(est(), true, {});
    expect(a).toMatchObject({ canOrder: true, manufacturers: false, suppliers: true, orderBlocker: null });
  });
  it('buyerAccess : un distributeur vérifié commande aux deux', () => {
    expect(buyerAccess(est({ buyerCategory: 'DISTRIBUTOR' }), true, {})).toMatchObject({ canOrder: true, manufacturers: true, suppliers: true });
  });
  it('buyerAccess : en cours de vérification => bloqué avec le motif', () => {
    expect(buyerAccess(est({ buyerCategoryStatus: 'DECLARED' }), true, {})).toMatchObject({ canOrder: false, orderBlocker: 'CATEGORY_NOT_VERIFIED' });
  });
});

describe('statuts', () => {
  it('chaîne vendeur : PENDING → CONFIRMED → SHIPPED → DELIVERED', () => {
    expect(sellerMayMove('ORDER', 'PENDING', 'CONFIRMED')).toBe(true);
    expect(sellerMayMove('ORDER', 'CONFIRMED', 'SHIPPED')).toBe(true);
    expect(sellerMayMove('ORDER', 'SHIPPED', 'DELIVERED')).toBe(true);
  });
  it('refus possible seulement avant confirmation ; annulation après', () => {
    expect(sellerMayMove('ORDER', 'PENDING', 'REJECTED')).toBe(true);
    expect(sellerMayMove('ORDER', 'CONFIRMED', 'REJECTED')).toBe(false);
    expect(sellerMayMove('ORDER', 'CONFIRMED', 'CANCELLED')).toBe(true);
  });
  it('pas de saut ni de retour, états finaux figés, statuts inconnus refusés', () => {
    expect(sellerMayMove('ORDER', 'PENDING', 'DELIVERED')).toBe(false);
    expect(sellerMayMove('ORDER', 'SHIPPED', 'CONFIRMED')).toBe(false);
    for (const end of ['DELIVERED', 'CANCELLED', 'REJECTED']) expect(sellerMayMove('ORDER', end, 'PENDING')).toBe(false);
    expect(sellerMayMove('ORDER', 'PENDING', 'NEW')).toBe(false);
    expect(sellerMayMove('ORDER', 'PENDING', 'HACK')).toBe(false);
    expect(sellerMayMove('WHATEVER', 'PENDING', 'CONFIRMED')).toBe(false);
  });
  it("demande d'intérêt : NEW → CONTACTED → CLOSED", () => {
    expect(sellerMayMove('INTEREST', 'NEW', 'CONTACTED')).toBe(true);
    expect(sellerMayMove('INTEREST', 'CONTACTED', 'CLOSED')).toBe(true);
    expect(sellerMayMove('INTEREST', 'NEW', 'CONFIRMED')).toBe(false);
  });
  it("l'acheteur n'annule qu'une commande encore en attente", () => {
    expect(buyerMayCancel('ORDER', 'PENDING')).toBe(true);
    expect(buyerMayCancel('ORDER', 'CONFIRMED')).toBe(false);
    expect(buyerMayCancel('INTEREST', 'NEW')).toBe(false);
  });
});

describe('conditions de vente', () => {
  it('valide et arrondit le prix', () => {
    expect(parseSellingTerms({ unitPrice: '12.345', priceUnit: ' boîte ', minOrderQty: 10, inStock: true })).toEqual({ ok: true, terms: { unitPrice: 12.35, priceUnit: 'boîte', minOrderQty: 10, inStock: true } });
  });
  it('prix vide = effacé ; absent = inchangé', () => {
    expect(parseSellingTerms({ unitPrice: '' })).toEqual({ ok: true, terms: { unitPrice: null } });
    expect(parseSellingTerms({ title: 'x' })).toEqual({ ok: true, terms: {} });
  });
  it('refuse prix négatif/nul/NaN, minimum invalide, stock non booléen, unité à caractères de contrôle', () => {
    for (const bad of [{ unitPrice: -1 }, { unitPrice: 0 }, { unitPrice: 'abc' }, { minOrderQty: 0 }, { minOrderQty: 1.5 }, { inStock: 'yes' }, { priceUnit: 'a\u0000b' }, { priceUnit: 'x'.repeat(31) }]) {
      expect(parseSellingTerms(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('offres locales', () => {
  const listing = (o: any = {}) => ({ id: 'cl9abcdef123456', title: 'Paracétamol 500', unitPrice: 120, priceUnit: 'boîte', minOrderQty: 5, inStock: true, establishment: { id: 'f1', name: 'Grossiste Atlas', buyerCategory: 'DISTRIBUTOR', buyerCategoryStatus: 'VERIFIED' }, ...o });
  it('commandable : prix + en stock + fournisseur vérifié', () => {
    expect(isOrderableListing(listing())).toBe(true);
    expect(isOrderableListing(listing({ unitPrice: null }))).toBe(false);
    expect(isOrderableListing(listing({ inStock: false }))).toBe(false);
    expect(isOrderableListing(listing({ establishment: { id: 'f1', name: 'x', buyerCategory: 'DISTRIBUTOR', buyerCategoryStatus: 'DECLARED' } }))).toBe(false);
  });
  it("même forme qu'une offre d'Audit (l'interface ne distingue pas)", () => {
    const o = listingToOffer(listing(), {});
    expect(o).toMatchObject({ ref: 'local:cl9abcdef123456', name: 'Paracétamol 500', unitPrice: 120, minOrderQty: 5, manufacturer: { name: 'Grossiste Atlas' } });
    expect(o.orderableBy).toContain('PRIVATE_PHARMACY');
  });
  it('références locales', () => {
    expect(isLocalRef(localRef('abc'))).toBe(true);
    expect(isLocalRef('local:')).toBe(false);
    expect(isLocalRef('demo-offer-1')).toBe(false);
  });
  it('lignes : refuse doublon, quantité invalide, réf non locale, liste vide', () => {
    expect(parseLocalLines([{ productRef: 'local:a', quantity: 2 }])).toEqual([{ productRef: 'local:a', quantity: 2 }]);
    expect(parseLocalLines([{ productRef: 'local:a', quantity: 2 }, { productRef: 'local:a', quantity: 1 }])).toBeNull();
    expect(parseLocalLines([{ productRef: 'local:a', quantity: 0 }])).toBeNull();
    expect(parseLocalLines([{ productRef: 'local:a', quantity: 1.5 }])).toBeNull();
    expect(parseLocalLines([{ productRef: 'audit-1', quantity: 1 }])).toBeNull();
    expect(parseLocalLines([])).toBeNull();
  });
  it('total arrondi', () => {
    expect(orderTotal([{ quantity: 3, unitPrice: 10.1 }, { quantity: 2, unitPrice: null }])).toBe(30.3);
  });
  it('référence lisible, non devinable', () => {
    const a = newOrderReference('ORDER', new Date('2026-11-03T10:00:00Z'));
    expect(a).toMatch(/^CMD-2026-[A-Z2-9]{6}$/);
    expect(newOrderReference('INTEREST')).toMatch(/^INT-\d{4}-/);
    expect(newOrderReference('ORDER')).not.toBe(newOrderReference('ORDER'));
  });
});

describe('DTO', () => {
  const row = (o: any = {}) => ({
    id: 'o1', reference: 'CMD-2026-ABC234', kind: 'ORDER', status: 'SHIPPED', summary: 'Paracétamol × 10', totalAmount: 1200, buyerEstablishmentId: 'e1',
    lines: [{ listingId: 'l1', product: 'Paracétamol', quantity: 10, unitPrice: 120 }], contact: { name: 'Ali', email: 'a@x.dz', phone: '0550' }, note: 'Livrer le matin',
    sellerNote: null, history: [{ at: '2026-11-03T10:00:00.000Z', status: 'PENDING' }], createdAt: new Date('2026-11-03T10:00:00Z'), updatedAt: new Date('2026-11-04T10:00:00Z'),
    sellerEstablishment: { name: 'Grossiste Atlas' }, buyerEstablishment: { name: 'Pharmacie Nour', type: 'OFFICINE', buyerCategory: null, buyerCategoryStatus: null }, ...o,
  });
  it("acheteur : même format que les demandes aux fabricants (écrans de suivi inchangés)", () => {
    const d = toBuyerDto(row());
    expect(d).toMatchObject({ kind: 'ORDER', delivery: 'SENT', status: 'SHIPPED', manufacturer: 'Grossiste Atlas', currency: 'DZD', cancellable: false });
    expect(d.lines[0]).toMatchObject({ product: 'Paracétamol', quantity: 10, unitPrice: 120 });
  });
  it("acheteur : un refus s'affiche comme annulée avec le motif", () => {
    const d = toBuyerDto(row({ status: 'REJECTED', sellerNote: 'Rupture' }));
    expect(d.status).toBe('CANCELLED');
    expect(d.refusal).toContain('Rupture');
  });
  it("acheteur : peut annuler tant que PENDING", () => {
    expect(toBuyerDto(row({ status: 'PENDING' })).cancellable).toBe(true);
  });
  it('vendeur : voit le client, son contact et les prochaines étapes', () => {
    const d = toSellerDto(row({ status: 'PENDING' }));
    expect(d.buyer).toMatchObject({ name: 'Pharmacie Nour', category: 'PRIVATE_PHARMACY', verified: true, contactEmail: 'a@x.dz', contactPhone: '0550' });
    expect(d.nextStatuses).toEqual(['CONFIRMED', 'REJECTED']);
    expect(d.note).toBe('Livrer le matin');
  });
  it('vendeur : plus aucune action sur une commande livrée', () => {
    expect(toSellerDto(row({ status: 'DELIVERED' })).nextStatuses).toEqual([]);
  });
});

describe('lien offre -> fiche publique', () => {
  const ls = [{ id: 'a', title: 'Gel hydroalcoolique 500 mL' }, { id: 'b', title: 'Éthanol 96 %, qualité analytique' }, { id: 'c', title: 'Masques chirurgicaux' }];
  it('choisit la fiche la plus proche du nom du produit (accents et casse ignorés)', () => {
    expect(pickListingForOffer('CHEMOLAB — Éthanol 96 %, qualité analytique, 1 L', ls)).toBe('b');
    expect(pickListingForOffer('CHEMOLAB — Gel hydroalcoolique pour les mains, 500 mL', ls)).toBe('a');
    expect(pickListingForOffer('ETHANOL analytique', ls)).toBe('b');
  });
  it('aucun mot commun => première fiche (vitrine) ; aucune fiche => null', () => {
    expect(pickListingForOffer('Produit inconnu XYZ', ls)).toBe('a');
    expect(pickListingForOffer('Gel', [])).toBeNull();
  });
});

describe('quantité en stock (stockQty)', () => {
  it('valide : entier >= 0 ; vide / null = non suivie ; absent = inchangé', () => {
    expect(parseSellingTerms({ stockQty: 0 })).toEqual({ ok: true, terms: { stockQty: 0 } });
    expect(parseSellingTerms({ stockQty: '25' })).toEqual({ ok: true, terms: { stockQty: 25 } });
    expect(parseSellingTerms({ stockQty: '' })).toEqual({ ok: true, terms: { stockQty: null } });
    expect(parseSellingTerms({ stockQty: null })).toEqual({ ok: true, terms: { stockQty: null } });
    expect(parseSellingTerms({})).toEqual({ ok: true, terms: {} });
  });
  it.each([-1, 1.5, 'abc', NaN, Infinity, 1e9, {}, [], true])('refuse %s', (v) => {
    expect(parseSellingTerms({ stockQty: v }).ok).toBe(false);
  });
  it('hasStockFor : non suivi = toujours ; suivi = au moins la quantité', () => {
    expect(hasStockFor(null, 999)).toBe(true);
    expect(hasStockFor(undefined, 999)).toBe(true);
    expect(hasStockFor(5, 5)).toBe(true);
    expect(hasStockFor(4, 5)).toBe(false);
    expect(hasStockFor(0, 1)).toBe(false);
  });
  it('une fiche est commandable seulement si le stock couvre le minimum de commande', () => {
    const l = (stockQty: number | null) => ({ id: 'x', title: 't', unitPrice: 10, minOrderQty: 5, inStock: true, stockQty, establishment: { id: 'e', name: 'E', buyerCategory: 'DISTRIBUTOR', buyerCategoryStatus: 'VERIFIED' } });
    expect(isOrderableListing(l(null))).toBe(true);
    expect(isOrderableListing(l(5))).toBe(true);
    expect(isOrderableListing(l(4))).toBe(false);
    expect(isOrderableListing(l(0))).toBe(false);
  });
  it('seules les lignes marquées reserved sont à rendre ; refus / annulation rendent, confirmer / expédier / livrer non', () => {
    expect(reservedLines([{ listingId: 'a', quantity: 3, reserved: true }, { listingId: 'b', quantity: 2 }, { listingId: 'c', quantity: 0, reserved: true }, { quantity: 1, reserved: true }])).toEqual([{ listingId: 'a', quantity: 3 }]);
    expect(reservedLines(null)).toEqual([]);
    expect(['REJECTED', 'CANCELLED'].every(releasesStock)).toBe(true);
    expect(['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED'].some(releasesStock)).toBe(false);
  });
});

describe('listingForOffer (lien explicite d\'abord, titre en secours)', () => {
  const ls = [
    { id: 'a', title: 'Gel hydroalcoolique 500 mL', auditProductRef: null },
    { id: 'b', title: 'Éthanol 96 % 1 L', auditProductRef: 'p-eth' },
    { id: 'c', title: 'Éthanol 70 % 1 L', auditProductRef: null },
  ];
  it('la fiche liée gagne, même si le titre d\'une autre ressemble plus', () => {
    expect(listingForOffer({ ref: 'p-eth', name: 'Éthanol 70 % 1 L' }, ls)).toEqual({ listingId: 'b', link: 'EXPLICIT' });
  });
  it('sans lien : secours par le titre, parmi les fiches NON liées seulement', () => {
    expect(listingForOffer({ ref: 'p-other', name: 'Éthanol 96 % 1 L' }, ls)).toEqual({ listingId: 'c', link: 'GUESS' });
    expect(listingForOffer({ name: 'Gel' }, ls)).toEqual({ listingId: 'a', link: 'GUESS' });
  });
  it('toutes les fiches liées à d\'autres produits, ou aucune fiche : null (pas de bouton vers une mauvaise fiche)', () => {
    expect(listingForOffer({ ref: 'p-x', name: 'Éthanol' }, [ls[1]])).toBeNull();
    expect(listingForOffer({ ref: 'p-x', name: 'Éthanol' }, [])).toBeNull();
  });
});
