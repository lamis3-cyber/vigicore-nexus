/** Catégorie d'acheteur fixée par le type d'établissement (rôle) : plus de déclaration manuelle. */
import { describe, it, expect } from 'vitest';
import { withRoleCategory, orderEligibility } from '../src/services/market';
import { buyerAccess, hiddenListingIds } from '../src/services/supplierOrders';

const est = (type: string, extra: Record<string, unknown> = {}) => ({ id: `e-${type}`, name: type, type, buyerCategory: null, buyerCategoryStatus: null, buyerCategoryNote: null, ...extra });

describe('withRoleCategory', () => {
  it('hôpital / clinique / officine / centre / labo : catégorie fixée et vérifiée, sans rien déclarer', () => {
    expect(withRoleCategory(est('HOSPITAL'))).toMatchObject({ buyerCategory: 'PUBLIC_INSTITUTION', buyerCategoryStatus: 'VERIFIED' });
    expect(withRoleCategory(est('CLINIQUE'))).toMatchObject({ buyerCategory: 'PRIVATE_CLINIC', buyerCategoryStatus: 'VERIFIED' });
    expect(withRoleCategory(est('OFFICINE'))).toMatchObject({ buyerCategory: 'PRIVATE_PHARMACY', buyerCategoryStatus: 'VERIFIED' });
    expect(withRoleCategory(est('CENTRE_MEDICAL'))).toMatchObject({ buyerCategory: 'PRIVATE_OTHER' });
    expect(withRoleCategory(est('LABORATOIRE'))).toMatchObject({ buyerCategory: 'PRIVATE_OTHER' });
  });
  it('une ancienne déclaration manuelle ne change rien : le type décide', () => {
    expect(withRoleCategory(est('CLINIQUE', { buyerCategory: 'DISTRIBUTOR', buyerCategoryStatus: 'DECLARED' }))).toMatchObject({ buyerCategory: 'PRIVATE_CLINIC', buyerCategoryStatus: 'VERIFIED' });
  });
  it('fournisseur : catégorie et vérification (agrément) conservées ; fabricant : aucune catégorie', () => {
    expect(withRoleCategory(est('SUPPLIER', { buyerCategory: 'DISTRIBUTOR', buyerCategoryStatus: 'DECLARED' }))).toMatchObject({ buyerCategory: 'DISTRIBUTOR', buyerCategoryStatus: 'DECLARED' });
    expect(withRoleCategory(est('SUPPLIER'))).toMatchObject({ buyerCategory: null });
    expect(withRoleCategory(est('SYSTEM', { buyerCategory: 'EXPORT', buyerCategoryStatus: 'VERIFIED' }))).toMatchObject({ buyerCategory: null });
  });
});

describe('ce que chaque rôle peut acheter (défauts)', () => {
  const env = {} as any;
  it('hôpital public : fabricants ET fournisseurs', () => {
    const a = buyerAccess(withRoleCategory(est('HOSPITAL')) as any, true, env);
    expect(a).toMatchObject({ canOrder: true, manufacturers: true, suppliers: true });
  });
  it('officine : fournisseurs seulement (pas les fabricants)', () => {
    const a = buyerAccess(withRoleCategory(est('OFFICINE')) as any, true, env);
    expect(a).toMatchObject({ canOrder: true, manufacturers: false, suppliers: true });
    expect(orderEligibility(withRoleCategory(est('OFFICINE')) as any, true, env)).toMatchObject({ ok: false, reason: 'CATEGORY_NOT_ALLOWED' });
  });
  it('catalogue d\'une officine : les fiches des fabricants sont masquées, celles des fournisseurs visibles', () => {
    const a = buyerAccess(withRoleCategory(est('OFFICINE')) as any, true, env);
    const me = [{ buyerCategory: 'PRIVATE_PHARMACY', canOrder: a.canOrder, canOrderFromManufacturers: a.manufacturers, canOrderFromSuppliers: a.suppliers }];
    const listings = [{ id: 'fab', sellerKind: null, establishmentId: 'x', auditRef: 'mf' }, { id: 'four', sellerKind: 'DISTRIBUTOR', establishmentId: 'y', auditRef: null }];
    expect(hiddenListingIds(listings, me, new Set(), null)).toEqual(['fab']);
  });
});
