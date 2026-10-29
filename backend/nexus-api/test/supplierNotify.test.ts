import { describe, expect, it, vi, beforeEach } from 'vitest';
import { notifyBuyerStatus, notifyNewSale, notifyTeamInvitation } from '../src/services/supplierNotify';

const sent: any[] = [];
const mail = (configured = true, fail: string | null = null) => ({
  configured: () => configured,
  send: async (m: any) => { if (fail && m.to === fail) throw new Error('smtp down'); sent.push(m); },
});
const db = (members: any[], users: Record<string, any> = {}) => ({
  userEstablishment: { findMany: async () => members },
  user: { findUnique: async ({ where }: any) => users[where.id] ?? null },
});
const mem = (email: string, role = 'FOURNISSEUR', deactivatedAt: Date | null = null) => ({ user: { email, role, deactivatedAt } });
const order = (o: any = {}) => ({ id: 'o1', kind: 'ORDER', reference: 'CMD-2026-ABC234', sellerEstablishmentId: 'atlas', buyerUserId: 'u1', summary: 'Paracétamol × 10', totalAmount: 1200, status: 'PENDING', contact: { name: 'Ali', email: 'victime@x.dz' }, buyerEstablishment: { name: 'Pharmacie Nour' }, sellerEstablishment: { name: 'Grossiste Atlas' }, sellerNote: null, ...o });

beforeEach(() => { sent.length = 0; vi.spyOn(console, 'warn').mockImplementation(() => {}); });

describe('nouvelle commande -> équipe du fournisseur', () => {
  it("prévient l'administrateur ET les employés actifs, sans doublon, avec référence, client et montant", async () => {
    const n = await notifyNewSale(db([mem('admin@atlas.dz'), mem('Staff@atlas.dz'), mem('staff@atlas.dz')]), order(), mail());
    expect(n).toBe(2);
    expect(sent.map((m) => m.to).sort()).toEqual(['admin@atlas.dz', 'staff@atlas.dz']);
    expect(sent[0].subject).toContain('CMD-2026-ABC234');
    expect(sent[0].subject).toContain('Pharmacie Nour');
    expect(sent[0].text).toContain('Paracétamol × 10');
    expect(sent[0].text).toMatch(/1[\s\u202f\u00a0]?200/);
  });
  it("jamais à l'adresse « contact » saisie dans le formulaire (un tiers pourrait y mettre n'importe quelle adresse)", async () => {
    await notifyNewSale(db([mem('admin@atlas.dz')]), order(), mail());
    expect(sent.some((m) => m.to === 'victime@x.dz')).toBe(false);
  });
  it('ignore les comptes désactivés et les autres rôles', async () => {
    const n = await notifyNewSale(db([mem('off@atlas.dz', 'FOURNISSEUR', new Date()), mem('doc@atlas.dz', 'DOCTOR'), mem('ok@atlas.dz')]), order(), mail());
    expect(n).toBe(1);
    expect(sent[0].to).toBe('ok@atlas.dz');
  });
  it("SMTP non configuré : rien n'est envoyé, rien ne casse", async () => {
    expect(await notifyNewSale(db([mem('a@atlas.dz')]), order(), mail(false))).toBe(0);
    expect(sent).toHaveLength(0);
  });
  it("un envoi qui échoue n'empêche pas les autres et ne remonte jamais d'erreur", async () => {
    const n = await notifyNewSale(db([mem('bad@atlas.dz'), mem('good@atlas.dz')]), order(), mail(true, 'bad@atlas.dz'));
    expect(n).toBe(1);
    expect(sent.map((m) => m.to)).toEqual(['good@atlas.dz']);
  });
  it("base de données en erreur : renvoie 0 sans lever d'exception", async () => {
    const broken: any = { userEstablishment: { findMany: async () => { throw new Error('db down'); } } };
    await expect(notifyNewSale(broken, order(), mail())).resolves.toBe(0);
  });
  it("demande d'intérêt : sujet et texte adaptés", async () => {
    await notifyNewSale(db([mem('a@atlas.dz')]), order({ kind: 'INTEREST', totalAmount: null }), mail());
    expect(sent[0].subject).toContain("demande d'intérêt");
    expect(sent[0].text).not.toContain('Montant');
  });
});

describe("changement d'état -> compte de l'acheteur", () => {
  const users = { u1: { email: 'buyer@pharma.dz', deactivatedAt: null }, u2: { email: 'gone@pharma.dz', deactivatedAt: new Date() } };
  it("écrit à l'adresse du COMPTE acheteur avec le nouvel état", async () => {
    expect(await notifyBuyerStatus(db([], users), order({ status: 'SHIPPED' }), mail())).toBe(1);
    expect(sent[0]).toMatchObject({ to: 'buyer@pharma.dz' });
    expect(sent[0].subject).toContain('Expédiée');
  });
  it('un refus transmet le motif', async () => {
    await notifyBuyerStatus(db([], users), order({ status: 'REJECTED', sellerNote: 'Rupture de stock' }), mail());
    expect(sent[0].text).toContain('Rupture de stock');
  });
  it('compte désactivé ou demande d\'intérêt : aucun e-mail', async () => {
    expect(await notifyBuyerStatus(db([], users), order({ buyerUserId: 'u2' }), mail())).toBe(0);
    expect(await notifyBuyerStatus(db([], users), order({ kind: 'INTEREST' }), mail())).toBe(0);
    expect(sent).toHaveLength(0);
  });
});

describe('invitation employé', () => {
  it("explique comment rejoindre, sans lien secret", async () => {
    expect(await notifyTeamInvitation('karim@atlas.dz', 'Grossiste Atlas', 'Sara', mail())).toBe(1);
    expect(sent[0].to).toBe('karim@atlas.dz');
    expect(sent[0].text).toContain('Grossiste Atlas');
    expect(sent[0].text).not.toMatch(/token|password/i);
  });
});
