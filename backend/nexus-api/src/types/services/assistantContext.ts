import { prisma } from '../lib/prisma';
import type { AuthedUser } from '../middleware/requireAuth';
import { visibilityWhere } from '../routes/vigilance.routes';

/**
 * Instantané des données de l'utilisateur de la session, en texte, pour le modèle de langage.
 * PORTÉE : uniquement ce compte et — pour les rôles de revue — les établissements auxquels il est ACTIVEMENT rattaché
 * (même règle que visibilityWhere). Jamais d'identité de patient, de texte libre de déclaration ni de coordonnées.
 */
const RECIPIENT_LABEL: Record<string, string> = {
  cnpm: 'CNPM', medecin: 'médecin traitant', qualite: 'responsable qualité de l’établissement', fabricant: 'fabricant', manufacturer: 'fabricant',
};
export const recipientLabel = (id: string) => RECIPIENT_LABEL[id] ?? id;

const ST: Record<string, string> = { draft: 'brouillon', submitted: 'transmise', review: 'en analyse', closed: 'clôturée' };
const short = (v: unknown, max = 80) => (typeof v === 'string' ? v.slice(0, max) : '');

export type DeclSummary = { ref: string; domain: string; status: string; severity: string; product: string; recipients: string[]; date: string; mine: boolean };

export async function declarationSummaries(u: AuthedUser, limit = 40): Promise<{ total: number; rows: DeclSummary[] }> {
  const rows: any[] = await prisma.declaration.findMany({
    where: visibilityWhere(u as any), orderBy: { createdAt: 'desc' }, take: 500,
    select: { authorUserId: true, status: true, domain: true, createdAt: true, payload: true },
  });
  const out = rows.slice(0, limit).map((r) => {
    const p: any = r.payload ?? {};
    const rec: any = p.record ?? {};
    return {
      ref: short(p.ref, 40), domain: short(rec.domain ?? r.domain, 40), status: ST[String(p.status)] ?? String(r.status).toLowerCase(),
      severity: short(rec.severity, 20), product: short(rec.product), date: new Date(r.createdAt).toISOString().slice(0, 10),
      recipients: (Array.isArray(rec.recipients) ? rec.recipients : []).map((x: unknown) => recipientLabel(String(x))).slice(0, 5),
      mine: r.authorUserId === u.id,
    };
  });
  return { total: rows.length, rows: out };
}

export async function buildContext(u: AuthedUser): Promise<string> {
  const L: string[] = [];
  const aff: any[] = await prisma.userEstablishment.findMany({ where: { userId: u.id, status: 'ACTIVE' }, include: { establishment: { select: { name: true } } } });
  L.push(`Compte : ${u.displayName} — rôle ${u.role}` + (aff.length ? ` — rattaché à : ${aff.map((a) => a.establishment?.name).filter(Boolean).join(', ')}` : ' — sans établissement rattaché'));

  const conns: any[] = await prisma.chatConnection.findMany({ where: { OR: [{ requesterId: u.id }, { addresseeId: u.id }] } });
  const acc = conns.filter((c) => c.status === 'ACCEPTED').length;
  L.push(`Messagerie : ${acc} contact(s) accepté(s), ${conns.filter((c) => c.status !== 'ACCEPTED' && c.addresseeId === u.id).length} demande(s) reçue(s) en attente, ${conns.filter((c) => c.status !== 'ACCEPTED' && c.requesterId === u.id).length} demande(s) envoyée(s) en attente.`);
  const mine: any[] = await prisma.chatParticipant.findMany({ where: { userId: u.id } });
  const counts: number[] = await Promise.all(mine.map((p: any) =>
    prisma.chatMessage.count({ where: { threadId: p.threadId, senderId: { not: u.id }, deletedAt: null, createdAt: { gt: p.lastReadAt } } })));
  L.push(`Conversations : ${mine.length}, messages non lus : ${counts.reduce((a, b) => a + b, 0)}.`);

  const decl = await declarationSummaries(u);
  if (decl.total) {
    const by: Record<string, number> = {};
    decl.rows.forEach((d) => { by[d.status] = (by[d.status] ?? 0) + 1; });
    L.push(`Déclarations visibles pour ce compte : ${decl.total} (${decl.rows.length} plus récentes détaillées ci-dessous ; répartition de celles-ci : ${Object.entries(by).map(([k, v]) => `${v} ${k}`).join(', ')}).`);
    decl.rows.forEach((d) => L.push(`- ${d.ref} | ${d.domain} | ${d.status} | gravité ${d.severity || 'n/d'} | ${d.product || 'produit n/d'} | destinataires : ${d.recipients.join(', ') || 'n/d'} | ${d.date} | ${d.mine ? 'déposée par vous' : 'déposée par un collègue de votre établissement'}`));
  } else L.push('Déclarations visibles pour ce compte : 0.');

  if (u.adminEstablishmentIds.length || u.role === 'VIGILANCE_REVIEWER' || u.role === 'HOSPITAL' || u.role === 'ORG_ADMIN') {
    const cases: any[] = await prisma.case.findMany({
      where: { OR: [{ assignedReviewerId: u.id }, ...(u.affiliatedEstablishmentIds.length ? [{ establishmentId: { in: u.affiliatedEstablishmentIds } }] : [])] },
      select: { status: true, assignedReviewerId: true },
    });
    L.push(`Dossiers d'analyse visibles : ${cases.length}, dont ${cases.filter((c) => c.assignedReviewerId === u.id).length} qui vous sont assignés.`);
  }
  if (u.adminEstablishmentIds.length) {
    const members: any[] = await prisma.userEstablishment.findMany({ where: { establishmentId: { in: u.adminEstablishmentIds } }, select: { status: true } });
    const invs: any[] = await prisma.organizationInvitation.findMany({ where: { establishmentId: { in: u.adminEstablishmentIds }, status: 'PENDING' } });
    L.push(`Votre établissement : ${members.filter((m) => m.status === 'ACTIVE').length} membre(s) actif(s), ${members.filter((m) => m.status === 'PENDING').length} demande(s) d'adhésion en attente, ${invs.length} invitation(s) envoyée(s) en attente.`);
  }
  if (u.role === 'ESTABLISHMENT_ADMIN' && u.affiliatedEstablishmentIds.length) {
    const ls: any[] = await prisma.productListing.findMany({ where: { establishmentId: { in: u.affiliatedEstablishmentIds } }, select: { id: true, status: true } });
    const st: any[] = ls.length ? await prisma.listingStat.findMany({ where: { listingId: { in: ls.map((l) => l.id) } } }) : [];
    const sum = (k: string) => st.reduce((a, r) => a + (r[k] ?? 0), 0);
    L.push(`Annonces : ${ls.length} (publiées ${ls.filter((l) => l.status === 'PUBLISHED').length}, brouillons ${ls.filter((l) => l.status === 'DRAFT').length}) ; vues ${sum('views')}, clics ${sum('clicks')}, prises de contact ${sum('contacts')}.`);
  }
  return L.join('\n');
}
