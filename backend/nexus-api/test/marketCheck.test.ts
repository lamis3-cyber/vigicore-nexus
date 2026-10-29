/** `npm run market:check` : chaque maillon manquant de la chaîne des commandes est signalé avec sa correction. */
import { describe, it, expect } from 'vitest';
import { checkMarketChain, type CheckListing } from '../src/services/marketCheck';

const numidia = { id: 'num', name: 'Numidia Pharma', auditManufacturerRef: 'org-123', buyerCategory: null, buyerCategoryStatus: null };
const atlas = { id: 'atl', name: 'Atlas', auditManufacturerRef: null, buyerCategory: 'DISTRIBUTOR', buyerCategoryStatus: 'VERIFIED' };
const L = (id: string, title: string, establishment: any, over: Partial<CheckListing> = {}): CheckListing => ({
  id, title, sellerKind: null, auditProductRef: null, unitPrice: null, minOrderQty: 1, inStock: true, stockQty: null, establishment, ...over,
});
const offers = [{ ref: 'p-cat', name: 'Cathéter 18G', manufacturer: { ref: 'org-123', name: 'Numidia Pharma' } }];
const base = { demoMode: false, auditConfigured: true, audit: { ok: true as const, offers }, mailConfigured: true };
const lvl = (items: any[], level: string) => items.filter((i) => i.level === level);

describe('checkMarketChain', () => {
  it('tout est prêt : aucune erreur ni avertissement', () => {
    const r = checkMarketChain({ ...base, listings: [L('a', 'Cathéter 18G', numidia), L('s', 'Gel', atlas, { sellerKind: 'DISTRIBUTOR', unitPrice: 100 })] });
    expect(lvl(r, 'error')).toEqual([]);
    expect(lvl(r, 'warn')).toEqual([]);
  });
  it('mode démo : erreur bloquante (les commandes ne partent jamais vers l\'Audit)', () => {
    const r = checkMarketChain({ ...base, demoMode: true, listings: [] });
    expect(lvl(r, 'error')[0]).toMatchObject({ where: '.env (nexus-api)', fix: expect.stringContaining('MARKET_DEMO_OFFERS=false') });
  });
  it('Audit non configuré ou injoignable', () => {
    expect(lvl(checkMarketChain({ ...base, auditConfigured: false, audit: null, listings: [] }), 'error')).toHaveLength(1);
    expect(lvl(checkMarketChain({ ...base, audit: { ok: false, error: 'NETWORK_ERROR' }, listings: [] }), 'error')[0].message).toContain('NETWORK_ERROR');
  });
  it('fabricant non lié, ou lié à une référence inconnue de l\'Audit (ex. demo-numidia)', () => {
    expect(lvl(checkMarketChain({ ...base, listings: [L('a', 'X', { ...numidia, auditManufacturerRef: null })] }), 'error')[0].message).toContain('non lié');
    const r = checkMarketChain({ ...base, listings: [L('a', 'X', { ...numidia, auditManufacturerRef: 'demo-numidia' })] });
    expect(lvl(r, 'error')[0].message).toContain('démonstration');
  });
  it('référence de démo : le correctif nomme les organisations réelles d\'Audit et la commande à lancer', () => {
    const r = checkMarketChain({ ...base, listings: [L('a', 'X', { ...numidia, auditManufacturerRef: 'demo-numidia' })] });
    expect(lvl(r, 'error')[0].fix).toContain('market:link');
    const none = checkMarketChain({ ...base, audit: { ok: true, offers: [] }, listings: [L('a', 'X', { ...numidia, auditManufacturerRef: 'demo-numidia' })] });
    expect(lvl(none, 'error')[0].fix).toContain('Offre en ligne');
  });
  it('fiche sans produit Audit correspondant : avertissement avec les produits publiés à lier', () => {
    const r = checkMarketChain({ ...base, listings: [L('a', 'Crème solaire', numidia), L('b', 'Autre', numidia, { auditProductRef: 'p-old' })] });
    const w = lvl(r, 'warn');
    expect(w).toHaveLength(2);
    expect(w[0].fix).toContain('« Cathéter 18G »');
    expect(w[1].message).toContain("n'est plus proposé");
  });
  it('fournisseur : non vérifié, sans prix ou hors stock ; SMTP absent signalé', () => {
    const r = checkMarketChain({ ...base, mailConfigured: false, listings: [
      L('s1', 'A', { ...atlas, buyerCategoryStatus: 'DECLARED' }, { sellerKind: 'DISTRIBUTOR', unitPrice: 100 }),
      L('s2', 'B', atlas, { sellerKind: 'DISTRIBUTOR' }),
      L('s3', 'C', atlas, { sellerKind: 'DISTRIBUTOR', unitPrice: 100, inStock: false }),
    ] });
    const w = lvl(r, 'warn').map((i) => i.message).join(' | ');
    expect(w).toContain('pas encore vérifié');
    expect(w).toContain('aucun prix');
    expect(w).toContain('hors stock');
    expect(w).toContain('SMTP');
  });
});
