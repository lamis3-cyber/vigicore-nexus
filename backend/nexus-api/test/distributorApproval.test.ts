import { describe, it, expect } from 'vitest';
import { approvalDay, approvalIncomplete, describeApprovalChange, parseApprovalInput } from '../src/services/distributorApproval';

const NOW = new Date('2026-10-26T10:00:00Z');
const ok = (body: unknown) => parseApprovalInput(body, NOW);

describe('parseApprovalInput', () => {
  it('rien dans le corps => rien à modifier (review sans agrément inchangé)', () => {
    expect(ok({ decision: 'VERIFIED' })).toEqual({ ok: true });
    expect(ok(undefined)).toEqual({ ok: true });
    expect(ok('texte')).toEqual({ ok: true });
  });
  it('numéro et date valides : espaces nettoyés, date = 00:00 UTC', () => {
    const r: any = ok({ approvalNumber: '  N° 123/DG  2019 ', approvalDate: '2019-05-14' });
    expect(r.ok).toBe(true);
    expect(r.number).toBe('N° 123/DG 2019');
    expect(r.date.toISOString()).toBe('2019-05-14T00:00:00.000Z');
  });
  it('null ou texte vide => effacer', () => {
    expect(ok({ approvalNumber: null, approvalDate: '' })).toEqual({ ok: true, number: null, date: null });
    expect(ok({ approvalNumber: '   ' })).toEqual({ ok: true, number: null });
  });
  it('accepte lettres arabes/accentuées dans le numéro', () => {
    expect((ok({ approvalNumber: 'رقم 45/2020' }) as any).number).toBe('رقم 45/2020');
    expect((ok({ approvalNumber: 'AG-é/07' }) as any).ok).toBe(true);
  });
  it.each([
    ['numéro non texte', { approvalNumber: 123 }],
    ['numéro trop long (61)', { approvalNumber: 'A'.repeat(61) }],
    ['balise HTML', { approvalNumber: '<script>x</script>' }],
    ['commence par un séparateur', { approvalNumber: '/12' }],
    ['retour à la ligne', { approvalNumber: 'AG\n12' }],
    ['date non texte', { approvalDate: 20190514 }],
    ['date au mauvais format', { approvalDate: '14/05/2019' }],
    ['date ISO complète', { approvalDate: '2019-05-14T00:00:00Z' }],
    ['date impossible', { approvalDate: '2026-02-31' }],
    ['mois 13', { approvalDate: '2026-13-01' }],
    ['année < 1900', { approvalDate: '1899-12-31' }],
    ['date dans le futur', { approvalDate: '2027-01-01' }],
  ])('refuse : %s', (_n, body) => {
    expect(ok(body).ok).toBe(false);
  });
  it('60 caractères pile : accepté ; aujourd\'hui accepté', () => {
    expect(ok({ approvalNumber: 'A'.repeat(60) }).ok).toBe(true);
    expect(ok({ approvalDate: '2026-10-26' }).ok).toBe(true);
  });
});

describe('approvalIncomplete (avertissement staff, jamais bloquant)', () => {
  const v = { buyerCategory: 'DISTRIBUTOR', buyerCategoryStatus: 'VERIFIED' };
  it('DISTRIBUTOR vérifié sans numéro et/ou sans date => à signaler', () => {
    expect(approvalIncomplete({ ...v })).toBe(true);
    expect(approvalIncomplete({ ...v, approvalNumber: 'AG-1' })).toBe(true);
    expect(approvalIncomplete({ ...v, approvalDate: new Date('2020-01-01T00:00:00Z') })).toBe(true);
  });
  it('complet => pas d\'alerte', () => {
    expect(approvalIncomplete({ ...v, approvalNumber: 'AG-1', approvalDate: new Date('2020-01-01T00:00:00Z') })).toBe(false);
  });
  it('pas d\'alerte hors DISTRIBUTOR ou hors VERIFIED', () => {
    expect(approvalIncomplete({ buyerCategory: 'PUBLIC_INSTITUTION', buyerCategoryStatus: 'VERIFIED' })).toBe(false);
    expect(approvalIncomplete({ buyerCategory: 'DISTRIBUTOR', buyerCategoryStatus: 'DECLARED' })).toBe(false);
    expect(approvalIncomplete({ buyerCategory: 'DISTRIBUTOR', buyerCategoryStatus: 'REJECTED' })).toBe(false);
  });
});

describe('describeApprovalChange / approvalDay', () => {
  it('rien de changé => null', () => {
    expect(describeApprovalChange({}, {})).toBeNull();
    expect(describeApprovalChange({ approvalNumber: 'A', approvalDate: new Date('2020-01-01T00:00:00Z') }, { approvalNumber: 'A', approvalDate: new Date('2020-01-01T00:00:00Z') })).toBeNull();
  });
  it('pose, modification, effacement', () => {
    expect(describeApprovalChange({}, { approvalNumber: 'AG-1', approvalDate: new Date('2020-01-01T00:00:00Z') })).toBe('agrément : n° « AG-1 », date 2020-01-01');
    expect(describeApprovalChange({ approvalNumber: 'AG-1' }, { approvalNumber: null })).toBe('agrément : n° effacé');
    expect(describeApprovalChange({ approvalDate: new Date('2020-01-01T00:00:00Z') }, { approvalDate: null })).toBe('agrément : date effacée');
  });
  it('approvalDay : Date ou ISO ; invalide => null', () => {
    expect(approvalDay(new Date('2020-01-01T00:00:00Z'))).toBe('2020-01-01');
    expect(approvalDay('2020-01-01T00:00:00.000Z')).toBe('2020-01-01');
    expect(approvalDay('n’importe quoi')).toBeNull();
    expect(approvalDay(null)).toBeNull();
  });
});
