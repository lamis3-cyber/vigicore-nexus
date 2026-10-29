/**
 * reviewNotify.ts — étape 5 (facultative) : prévenir l'équipe VigiCore qu'une fiche attend sa validation.
 *
 * Règles (2026-10-28) :
 *   1. Un e-mail part quand une fiche ENTRE dans la file « À valider » (status PUBLISHED + reviewStatus PENDING, la même
 *      condition que l'onglet « À valider » de /admin/products) et n'y était pas avant. Une fiche déjà dans la file que
 *      l'organisation retouche ne renvoie rien : pas un e-mail par enregistrement.
 *   2. Trois cas, pour que le staff sache quoi regarder : nouvelle publication, fiche corrigée après un refus, fiche déjà
 *      validée dont le contenu ou le produit Audit lié a changé.
 *   3. Destinataires = PLATFORM_ADMIN_EMAILS (les comptes staff qui voient /admin/products). Personne d'autre.
 *   4. BEST-EFFORT : SMTP non configuré, en panne, ou LISTING_REVIEW_NOTIFY=false => rien n'est envoyé, et la publication
 *      n'échoue JAMAIS à cause de l'e-mail (la fiche est déjà écrite ; le compteur de la barre staff la montre de toute façon).
 *   5. Contenu minimal : nom de l'organisation, titre, catégorie, type de vendeur, produit Audit lié (référence). Ni
 *      description, ni contact, ni prix.
 */
import { mailConfigured, sendMail } from '../lib/email';
import { describeError } from '../lib/safeLog';
import type { Mailer } from './supplierNotify';

const defaultMail: Mailer = { configured: () => mailConfigured(), send: (m) => sendMail(m) };
const MAX_RECIPIENTS = 20;

export type ReviewReason = 'SUBMITTED' | 'RESUBMITTED' | 'CHANGED';
type ListingState = { status?: string | null; reviewStatus?: string | null } | null | undefined;

const inQueue = (l: ListingState) => l?.status === 'PUBLISHED' && l?.reviewStatus === 'PENDING';

/** La fiche vient-elle d'entrer dans la file « À valider » ? null = non (rien à envoyer). */
export function reviewQueueEntry(before: ListingState, after: ListingState): ReviewReason | null {
  if (!inQueue(after) || inQueue(before)) return null;
  if (before?.reviewStatus === 'REJECTED') return 'RESUBMITTED';
  if (before?.reviewStatus === 'APPROVED') return 'CHANGED';
  return 'SUBMITTED';
}

/** Adresses du staff VigiCore (PLATFORM_ADMIN_EMAILS), en minuscules, sans doublon, plafonnées. */
export function staffEmails(env: NodeJS.ProcessEnv = process.env): string[] {
  const all = (env.PLATFORM_ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
  return Array.from(new Set(all)).slice(0, MAX_RECIPIENTS);
}

const oneLine = (v: unknown, max: number) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);

const SUBJECT: Record<ReviewReason, string> = {
  SUBMITTED: 'Produit à valider',
  RESUBMITTED: 'Produit corrigé à revalider',
  CHANGED: 'Produit modifié à revalider',
};
const INTRO: Record<ReviewReason, string> = {
  SUBMITTED: 'Une organisation a publié un produit dans le catalogue. Il reste invisible au public tant que VigiCore ne l\'a pas validé.',
  RESUBMITTED: 'Une organisation a corrigé un produit que VigiCore avait refusé et le soumet à nouveau.',
  CHANGED: 'Le contenu d\'un produit déjà validé (texte, photo ou produit Audit lié) a changé : il doit être revalidé. Son éventuelle promotion payante continue en attendant.',
};

/**
 * Envoie l'e-mail « à valider » au staff si `reason` n'est pas null. Renvoie le nombre d'e-mails envoyés (0 si rien).
 * À appeler SANS attendre (`void notifyListingForReview(...)`) après l'écriture de la fiche.
 */
export async function notifyListingForReview(
  db: any,
  listing: { id: string; title?: string | null; category?: string | null; sellerKind?: string | null; establishmentId: string; auditProductRef?: string | null },
  reason: ReviewReason | null,
  mail: Mailer = defaultMail,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  try {
    if (!reason || env.LISTING_REVIEW_NOTIFY === 'false' || !mail.configured()) return 0;
    const to = staffEmails(env);
    if (!to.length) return 0;
    let org = 'Une organisation';
    try {
      const est = await db.establishment.findUnique({ where: { id: listing.establishmentId }, select: { name: true } });
      if (est?.name) org = oneLine(est.name, 80);
    } catch { /* le nom est un confort : l'e-mail part quand même */ }
    const title = oneLine(listing.title, 80) || '(sans titre)';
    const distributor = listing.sellerKind === 'DISTRIBUTOR';
    const base = env.APP_BASE_URL ? env.APP_BASE_URL.replace(/\/+$/, '') : null;
    const text = [
      INTRO[reason],
      '',
      `Organisation : ${org}`,
      `Produit : ${title}`,
      ...(listing.category ? [`Catégorie : ${oneLine(listing.category, 60)}`] : []),
      `Vendeur : ${distributor ? 'fournisseur (vente en gros)' : 'fabricant'}`,
      ...(distributor ? [] : [`Produit VigiCore Audit lié : ${listing.auditProductRef ? oneLine(listing.auditProductRef, 200) : 'aucun (non liée)'}`]),
      '',
      base ? `À valider ici : ${base}/admin/products` : 'À valider dans l\'espace staff : Validation des produits.',
      '',
      '— VigiCore NEXUS',
    ].join('\n');
    const subject = `${SUBJECT[reason]} — ${title} (${org})`;
    let sent = 0;
    for (const addr of to) {
      try { await mail.send({ to: addr, subject, text }); sent++; } catch (err) { console.warn('[reviewNotify]', describeError(err)); }
    }
    return sent;
  } catch (err) {
    console.warn('[reviewNotify]', describeError(err));
    return 0;
  }
}
