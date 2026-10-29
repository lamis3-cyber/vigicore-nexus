/**
 * Étape 5 : e-mail au staff VigiCore quand une fiche ENTRE dans la file « À valider ».
 * Fonctions pures + envoi avec un faux SMTP (les routes sont couvertes dans services.routes.test.ts).
 */
import { describe, it, expect, vi } from 'vitest';
import { notifyListingForReview, reviewQueueEntry, staffEmails } from '../src/services/reviewNotify';

const S = (status: string, reviewStatus: string) => ({ status, reviewStatus });

describe('reviewQueueEntry', () => {
  it('nouvelle publication, correction après refus, contenu validé modifié', () => {
    expect(reviewQueueEntry(S('DRAFT', 'PENDING'), S('PUBLISHED', 'PENDING'))).toBe('SUBMITTED');
    expect(reviewQueueEntry(S('ARCHIVED', 'PENDING'), S('PUBLISHED', 'PENDING'))).toBe('SUBMITTED');
    expect(reviewQueueEntry(S('PUBLISHED', 'REJECTED'), S('PUBLISHED', 'PENDING'))).toBe('RESUBMITTED');
    expect(reviewQueueEntry(S('DRAFT', 'REJECTED'), S('PUBLISHED', 'PENDING'))).toBe('RESUBMITTED');
    expect(reviewQueueEntry(S('PUBLISHED', 'APPROVED'), S('PUBLISHED', 'PENDING'))).toBe('CHANGED');
  });
  it('rien quand la fiche était déjà dans la file, n\'y entre pas, ou repart en ligne directement', () => {
    expect(reviewQueueEntry(S('PUBLISHED', 'PENDING'), S('PUBLISHED', 'PENDING'))).toBeNull(); // retouche d'une fiche déjà à valider
    expect(reviewQueueEntry(S('PUBLISHED', 'APPROVED'), S('PUBLISHED', 'APPROVED'))).toBeNull(); // contact modifié : pas de revue
    expect(reviewQueueEntry(S('ARCHIVED', 'APPROVED'), S('PUBLISHED', 'APPROVED'))).toBeNull(); // restaurée, déjà validée
    expect(reviewQueueEntry(S('PUBLISHED', 'APPROVED'), S('DRAFT', 'PENDING'))).toBeNull(); // brouillon : pas dans la file
    expect(reviewQueueEntry(null, null)).toBeNull();
  });
});

describe('staffEmails', () => {
  it('PLATFORM_ADMIN_EMAILS : minuscules, sans doublon, adresses invalides ignorées', () => {
    expect(staffEmails({ PLATFORM_ADMIN_EMAILS: ' Staff@X.dz, staff@x.dz ,, pas-une-adresse, b@y.dz' } as any)).toEqual(['staff@x.dz', 'b@y.dz']);
    expect(staffEmails({} as any)).toEqual([]);
  });
});

describe('notifyListingForReview', () => {
  const env = { PLATFORM_ADMIN_EMAILS: 'staff@x.dz,chef@x.dz', APP_BASE_URL: 'https://vigicore.dz/' } as any;
  const db = { establishment: { findUnique: vi.fn(async () => ({ name: 'Labo Numidia' })) } };
  const listing = { id: 'l1', title: 'Seringue 5 mL', category: 'Dispositifs', sellerKind: 'MANUFACTURER', establishmentId: 'e1', auditProductRef: 'pA' };
  const mailer = (over: any = {}) => { const sent: any[] = []; return { sent, m: { configured: () => true, send: async (x: any) => { if (over.fail) throw new Error('smtp down'); sent.push(x); }, ...over.m } }; };

  it('un e-mail par membre du staff, avec organisation, produit, produit Audit lié et lien vers la validation', async () => {
    const { sent, m } = mailer();
    expect(await notifyListingForReview(db, listing, 'SUBMITTED', m, env)).toBe(2);
    expect(sent.map((x) => x.to)).toEqual(['staff@x.dz', 'chef@x.dz']);
    expect(sent[0].subject).toBe('Produit à valider — Seringue 5 mL (Labo Numidia)');
    expect(sent[0].text).toContain('Organisation : Labo Numidia');
    expect(sent[0].text).toContain('Produit VigiCore Audit lié : pA');
    expect(sent[0].text).toContain('https://vigicore.dz/admin/products');
  });
  it('le sujet dit pourquoi : corrigé après refus / modifié après validation ; fournisseur : pas de ligne Audit', async () => {
    const { sent, m } = mailer();
    await notifyListingForReview(db, listing, 'RESUBMITTED', m, { PLATFORM_ADMIN_EMAILS: 'staff@x.dz' } as any);
    await notifyListingForReview(db, { ...listing, sellerKind: 'DISTRIBUTOR', auditProductRef: null }, 'CHANGED', m, { PLATFORM_ADMIN_EMAILS: 'staff@x.dz' } as any);
    expect(sent[0].subject).toMatch(/^Produit corrigé à revalider/);
    expect(sent[1].subject).toMatch(/^Produit modifié à revalider/);
    expect(sent[1].text).not.toMatch(/Produit VigiCore Audit lié/);
    expect(sent[1].text).toContain('fournisseur');
  });
  it('un titre avec retour à la ligne ne casse pas le sujet ; aucun contenu sensible (description, contact) n\'est envoyé', async () => {
    const { sent, m } = mailer();
    await notifyListingForReview(db, { ...listing, title: 'Kit\r\nBcc: x@evil.dz', description: 'SECRET', contactEmail: 'c@x.dz' } as any, 'SUBMITTED', m, env);
    expect(sent[0].subject).not.toMatch(/[\r\n]/);
    expect(sent[0].text).not.toMatch(/SECRET|c@x\.dz/);
  });
  it('rien n\'est envoyé : raison nulle, désactivé, SMTP non configuré, aucun staff', async () => {
    const { sent, m } = mailer();
    expect(await notifyListingForReview(db, listing, null, m, env)).toBe(0);
    expect(await notifyListingForReview(db, listing, 'SUBMITTED', m, { ...env, LISTING_REVIEW_NOTIFY: 'false' })).toBe(0);
    expect(await notifyListingForReview(db, listing, 'SUBMITTED', { ...m, configured: () => false }, env)).toBe(0);
    expect(await notifyListingForReview(db, listing, 'SUBMITTED', m, {} as any)).toBe(0);
    expect(sent).toHaveLength(0);
  });
  it('best-effort : SMTP en panne ou base indisponible ne lève jamais d\'erreur', async () => {
    const { m } = mailer({ fail: true });
    await expect(notifyListingForReview(db, listing, 'SUBMITTED', m, env)).resolves.toBe(0);
    const { sent, m: ok } = mailer();
    const broken = { establishment: { findUnique: async () => { throw new Error('db down'); } } };
    expect(await notifyListingForReview(broken, listing, 'SUBMITTED', ok, env)).toBe(2); // nom de l'organisation absent, e-mail envoyé quand même
    expect(sent[0].subject).toContain('(Une organisation)');
  });
  it('une adresse en échec n\'empêche pas les autres membres du staff d\'être prévenus', async () => {
    const sent: string[] = [];
    const m = { configured: () => true, send: async (x: any) => { if (x.to === 'staff@x.dz') throw new Error('mailbox full'); sent.push(x.to); } };
    expect(await notifyListingForReview(db, listing, 'SUBMITTED', m, env)).toBe(1);
    expect(sent).toEqual(['chef@x.dz']);
  });
});
