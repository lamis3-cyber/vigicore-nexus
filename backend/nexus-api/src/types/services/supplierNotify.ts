/**
 * E-mails du circuit « vente par un fournisseur » (2026-11-03). Tout est BEST-EFFORT : un e-mail qui échoue ou un SMTP
 * non configuré ne fait JAMAIS échouer une commande ni un changement d'état (la commande est déjà écrite ; le tableau
 * de bord affiche de toute façon le compteur « à traiter »).
 *
 *  - nouvelle commande / demande d'intérêt  -> les comptes ACTIFS du fournisseur (administrateur + employés) ;
 *  - commande annulée par le client         -> les mêmes comptes du fournisseur ;
 *  - changement d'état d'une commande       -> le compte de l'ACHETEUR ;
 *  - invitation d'un employé                -> l'adresse invitée.
 *
 * Destinataires = adresses de COMPTES (jamais l'adresse « contact » saisie dans le formulaire : n'importe qui pourrait y
 * mettre l'adresse d'un tiers). Aucun contenu médical ; pas de lien secret (juste l'adresse du tableau de bord).
 */
import { mailConfigured, sendMail } from '../lib/email';
import { describeError } from '../lib/safeLog';
import { STATUS_LABEL } from './supplierOrders';

export interface Mailer { configured: () => boolean; send: (m: { to: string; subject: string; text: string }) => Promise<void> }
const defaultMail: Mailer = { configured: () => mailConfigured(), send: (m) => sendMail(m) };

const MAX_RECIPIENTS = 20;
const dashboardUrl = () => (process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL.replace(/\/+$/, '')}/dashboard/` : null);
const footer = () => {
  const url = dashboardUrl();
  return `${url ? `\nOuvrir mon tableau de bord : ${url}\n` : ''}\n— VigiCore NEXUS`;
};
const da = (n: unknown) => (typeof n === 'number' ? `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DA` : null);

async function safely(label: string, fn: () => Promise<number>): Promise<number> {
  try { return await fn(); } catch (err) { console.warn(`[supplierNotify.${label}]`, describeError(err)); return 0; }
}

/** Adresses des comptes actifs (non désactivés) qui travaillent pour cet établissement. */
async function accountEmails(db: any, establishmentId: string): Promise<string[]> {
  const rows: any[] = await db.userEstablishment.findMany({
    where: { establishmentId, status: 'ACTIVE' },
    include: { user: { select: { email: true, role: true, deactivatedAt: true } } },
  });
  return Array.from(new Set(rows.filter((r) => r.user?.email && !r.user.deactivatedAt && r.user.role === 'FOURNISSEUR').map((r) => String(r.user.email).toLowerCase()))).slice(0, MAX_RECIPIENTS);
}

/** Nouvelle commande (ORDER) ou demande d'intérêt (INTEREST) reçue : prévient l'équipe du fournisseur. Renvoie le nombre d'e-mails envoyés. */
export function notifyNewSale(db: any, order: any, mail: Mailer = defaultMail): Promise<number> {
  return safely('newSale', async () => {
    if (!mail.configured()) return 0;
    const to = await accountEmails(db, order.sellerEstablishmentId);
    const isOrder = order.kind === 'ORDER';
    const buyer = order.buyerEstablishment?.name ?? (order.contact as any)?.name ?? 'un client';
    const total = da(order.totalAmount);
    const subject = isOrder ? `Nouvelle commande ${order.reference} — ${buyer}` : `Nouvelle demande d'intérêt ${order.reference} — ${buyer}`;
    const text = [
      isOrder ? `Vous avez reçu une nouvelle commande de ${buyer}.` : `${buyer} souhaite être contacté au sujet de l'un de vos produits.`,
      '',
      `Référence : ${order.reference}`,
      `Produits : ${order.summary}`,
      ...(isOrder && total ? [`Montant : ${total}`] : []),
      '',
      isOrder ? 'Confirmez ou refusez-la depuis « Commandes clients » : le client suit chaque étape.' : 'Retrouvez ses coordonnées dans « Commandes clients > Demandes d\'intérêt ».',
      footer(),
    ].join('\n');
    let sent = 0;
    for (const addr of to) {
      try { await mail.send({ to: addr, subject, text }); sent++; } catch (err) { console.warn('[supplierNotify.newSale]', describeError(err)); }
    }
    return sent;
  });
}

/** Le fournisseur a fait avancer / refusé / annulé la commande : prévient le compte de l'acheteur. */
export function notifyBuyerStatus(db: any, order: any, mail: Mailer = defaultMail): Promise<number> {
  return safely('buyerStatus', async () => {
    if (!mail.configured() || order.kind !== 'ORDER') return 0;
    const user = await db.user.findUnique({ where: { id: order.buyerUserId }, select: { email: true, deactivatedAt: true } });
    if (!user?.email || user.deactivatedAt) return 0;
    const seller = order.sellerEstablishment?.name ?? 'Le fournisseur';
    const label = STATUS_LABEL[order.status] ?? order.status;
    const text = [
      `Votre commande ${order.reference} chez ${seller} est maintenant : ${label}.`,
      '',
      `Produits : ${order.summary}`,
      ...(order.sellerNote && ['REJECTED', 'CANCELLED'].includes(order.status) ? [`Motif indiqué par le fournisseur : ${order.sellerNote}`] : []),
      footer(),
    ].join('\n');
    await mail.send({ to: String(user.email), subject: `Commande ${order.reference} : ${label}`, text });
    return 1;
  });
}

/**
 * Le CLIENT a annulé sa commande (encore en attente) : prévient l'équipe du fournisseur, sinon elle ne la verrait qu'en ouvrant
 * le tableau de bord. Mêmes destinataires et mêmes règles que `notifyNewSale`. `order.restocked` : la quantité réservée est rendue.
 */
export function notifySellerCancelled(db: any, order: any, mail: Mailer = defaultMail): Promise<number> {
  return safely('sellerCancelled', async () => {
    if (!mail.configured() || order.kind !== 'ORDER') return 0;
    const to = await accountEmails(db, order.sellerEstablishmentId);
    const buyer = order.buyerEstablishment?.name ?? (order.contact as any)?.name ?? 'un client';
    const subject = `Commande ${order.reference} annulée — ${buyer}`;
    const text = [
      `${buyer} a annulé sa commande avant votre confirmation. Il n'y a rien à traiter.`,
      '',
      `Référence : ${order.reference}`,
      `Produits : ${order.summary}`,
      ...(order.restocked ? ['', 'Les quantités réservées par cette commande sont remises en stock.'] : []),
      footer(),
    ].join('\n');
    let sent = 0;
    for (const addr of to) {
      try { await mail.send({ to: addr, subject, text }); sent++; } catch (err) { console.warn('[supplierNotify.sellerCancelled]', describeError(err)); }
    }
    return sent;
  });
}

/** Invitation d'un employé par l'administrateur du fournisseur. */
export function notifyTeamInvitation(email: string, orgName: string, inviterName: string, mail: Mailer = defaultMail): Promise<number> {
  return safely('invitation', async () => {
    if (!mail.configured()) return 0;
    const text = [
      `${inviterName} vous invite à rejoindre l'équipe de « ${orgName} » sur VigiCore NEXUS.`,
      '',
      `Créez un compte « Employé d'un fournisseur » avec cette adresse e-mail (${email}), ou connectez-vous si vous en avez déjà un, puis acceptez l'invitation dans la page « Équipe ».`,
      footer(),
    ].join('\n');
    await mail.send({ to: email, subject: `Invitation à rejoindre ${orgName}`, text });
    return 1;
  });
}
