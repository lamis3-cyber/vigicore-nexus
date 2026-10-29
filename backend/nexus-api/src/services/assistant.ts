import { prisma } from '../lib/prisma';
import type { AuthedUser } from '../middleware/requireAuth';
import { visibilityWhere } from '../routes/vigilance.routes';
import { buildContext, declarationSummaries } from './assistantContext';
import { llmAnswer, llmEnabled } from './assistantLlm';

/**
 * Assistant VigiCore — réponses tirées de la base, pour l'utilisateur de la session UNIQUEMENT.
 * Aucun identifiant n'est lu dans la question : la portée vient de `user` (session).
 * Les intentions sont reconnues par mots-clés (fonctionne sans LLM).
 */

export const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();

const has = (t: string, re: RegExp) => re.test(t);
const n = (x: number, one: string, many: string) => `${x} ${x > 1 ? many : one}`;

const MANAGES_ORG = (u: AuthedUser) => u.adminEstablishmentIds.length > 0;
const REVIEW = new Set(['VIGILANCE_REVIEWER', 'HOSPITAL', 'ORG_ADMIN']);
const DECLARERS = new Set(['PATIENT', 'DOCTOR', 'PHARMACIEN', 'LABO', 'HOSPITAL', 'VIGILANCE_REVIEWER', 'ORG_ADMIN', 'FOURNISSEUR']);

const ROLE_LABEL: Record<string, string> = {
  PATIENT: 'Patient', DOCTOR: 'Médecin', PHARMACIEN: 'Pharmacien', LABO: 'Laboratoire',
  HOSPITAL: 'Personnel médical', VIGILANCE_REVIEWER: 'Responsable vigilance',
  ESTABLISHMENT_ADMIN: 'Fabricant (fiches produits)', ORG_ADMIN: 'Administrateur d’établissement',
  FOURNISSEUR: 'Fournisseur / distributeur',
};

function periodStart(t: string): { since?: Date; label: string } {
  const now = new Date();
  if (has(t, /\b(aujourd ?hui|today)\b/)) return { since: new Date(now.getFullYear(), now.getMonth(), now.getDate()), label: ' aujourd’hui' };
  if (has(t, /\b(semaine|week)\b/)) return { since: new Date(now.getTime() - 7 * 864e5), label: ' sur les 7 derniers jours' };
  if (has(t, /\b(ce mois|mois|month)\b/)) return { since: new Date(now.getFullYear(), now.getMonth(), 1), label: ' ce mois-ci' };
  if (has(t, /\b(cette annee|annee|year)\b/)) return { since: new Date(now.getFullYear(), 0, 1), label: ' cette année' };
  return { label: '' };
}

export type Lang = 'fr' | 'ar' | 'en';
type Handler = (u: AuthedUser, t: string, lg?: Lang) => Promise<string>;
const plural1 = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;
const na = (x: number, one: string, many: string) => (x === 1 ? one : `${x} ${many}`);

const contacts: Handler = async (u, _t, lg = 'fr') => {
  const ar = lg === 'ar', en = lg === 'en';
  const rows = await prisma.chatConnection.findMany({ where: { OR: [{ requesterId: u.id }, { addresseeId: u.id }] } });
  const friends = rows.filter((r: any) => r.status === 'ACCEPTED').length;
  const incoming = rows.filter((r: any) => r.status !== 'ACCEPTED' && r.addresseeId === u.id).length;
  const outgoing = rows.filter((r: any) => r.status !== 'ACCEPTED' && r.requesterId === u.id).length;
  if (ar) {
    let a = friends === 0 ? 'ليس لديك أي جهة اتصال حالياً.' : `لديك ${na(friends, 'جهة اتصال واحدة', 'جهات اتصال')} في رسائلك.`;
    if (incoming) a += ` ${na(incoming, 'طلب واحد مستلم ينتظر', 'طلبات مستلمة تنتظر')} ردّك.`;
    if (outgoing) a += ` ${na(outgoing, 'طلب واحد مرسل قيد', 'طلبات مرسلة قيد')} الانتظار.`;
    if (u.role === 'ESTABLISHMENT_ADMIN') a += ` أما الإعلانات، فقد تلقّت بطاقاتك ${await listingContacts(u)} تواصلاً في المجموع.`;
    return a;
  }
  if (en) {
    let e = friends === 0 ? 'You have no contacts yet.' : `You have ${plural1(friends, 'contact', 'contacts')} in your messenger.`;
    if (incoming) e += ` ${plural1(incoming, 'received request is', 'received requests are')} waiting for your reply.`;
    if (outgoing) e += ` ${plural1(outgoing, 'sent request is', 'sent requests are')} pending.`;
    if (u.role === 'ESTABLISHMENT_ADMIN') e += ` On the listings side, your product sheets have received ${plural1(await listingContacts(u), 'contact', 'contacts')} in total.`;
    return e;
  }
  let out = friends === 0 ? 'Vous n’avez aucun contact pour le moment.' : `Vous avez ${n(friends, 'contact', 'contacts')} dans votre messagerie.`;
  if (incoming) out += ` ${n(incoming, 'demande reçue attend', 'demandes reçues attendent')} votre réponse.`;
  if (outgoing) out += ` ${n(outgoing, 'demande envoyée est', 'demandes envoyées sont')} en attente.`;
  if (u.role === 'ESTABLISHMENT_ADMIN') {
    const total = await listingContacts(u);
    out += ` Côté annonces, vos fiches ont reçu ${n(total, 'prise de contact', 'prises de contact')} au total.`;
  }
  return out;
};

async function listingContacts(u: AuthedUser): Promise<number> {
  if (!u.affiliatedEstablishmentIds.length) return 0;
  const listings = await prisma.productListing.findMany({ where: { establishmentId: { in: u.affiliatedEstablishmentIds } }, select: { id: true } });
  if (!listings.length) return 0;
  const stats = await prisma.listingStat.findMany({ where: { listingId: { in: listings.map((l: any) => l.id) } } });
  return stats.reduce((a: number, s: any) => a + (s.contacts ?? 0), 0);
}

const messages: Handler = async (u, _t, lg = 'fr') => {
  const ar = lg === 'ar', en = lg === 'en';
  const mine = await prisma.chatParticipant.findMany({ where: { userId: u.id } });
  const counts = await Promise.all(mine.map((p: any) =>
    prisma.chatMessage.count({ where: { threadId: p.threadId, senderId: { not: u.id }, deletedAt: null, createdAt: { gt: p.lastReadAt } } })));
  const unread = counts.reduce((a: number, b: number) => a + b, 0);
  const convs = mine.length;
  const unreadConv = counts.filter((c: number) => c > 0).length;
  if (en) return `You have ${plural1(convs, 'conversation', 'conversations')}` +
    (unread ? `, ${unreadConv} of them with unread messages (${plural1(unread, 'message', 'messages')} in total).` : ' and no unread messages.');
  if (ar) return `لديك ${na(convs, 'محادثة واحدة', 'محادثات')}` +
    (unread ? ` منها ${unreadConv} تحتوي رسائل غير مقروءة (${unread} رسالة في المجموع).` : ' ولا توجد رسائل غير مقروءة.');
  return `Vous avez ${n(convs, 'conversation', 'conversations')}` +
    (unread ? ` dont ${unreadConv} avec des messages non lus (${n(unread, 'message', 'messages')} au total).` : ' et aucun message non lu.');
};

const DB_LABEL: Record<string, string> = { DRAFT: 'brouillon', SUBMITTED: 'transmise', UNDER_REVIEW: 'en analyse', CLOSED: 'clôturée', WITHDRAWN: 'retirée' };
const DOMAINS: [RegExp, string, string][] = [
  [/pharmaco|دوائي|الدواء/, 'PHARMACOVIGILANCE', 'pharmacovigilance'], [/materio|device|اجهزة|الاجهزة/, 'MATERIOVIGILANCE', 'matériovigilance'],
  [/cosmeto|تجميل/, 'COSMETOVIGILANCE', 'cosmétovigilance'], [/chemo|chimio|chemical|كيمياء|كيميائ/, 'CHEMOVIGILANCE', 'chimiovigilance'],
];

const AR_STATUS: Record<string, string> = { DRAFT: 'مسودة', SUBMITTED: 'مُرسَلة', UNDER_REVIEW: 'قيد التحليل', CLOSED: 'مغلقة', WITHDRAWN: 'مسحوبة' };
const AR_DOM: Record<string, string> = { PHARMACOVIGILANCE: 'اليقظة الدوائية', MATERIOVIGILANCE: 'اليقظة المتعلقة بالأجهزة الطبية', COSMETOVIGILANCE: 'اليقظة التجميلية', CHEMOVIGILANCE: 'اليقظة الكيميائية' };
const EN_STATUS: Record<string, string> = { DRAFT: 'draft', SUBMITTED: 'submitted', UNDER_REVIEW: 'under review', CLOSED: 'closed', WITHDRAWN: 'withdrawn' };
const EN_DOM: Record<string, string> = { PHARMACOVIGILANCE: 'pharmacovigilance', MATERIOVIGILANCE: 'medical device vigilance', COSMETOVIGILANCE: 'cosmetovigilance', CHEMOVIGILANCE: 'chemovigilance' };
const declarations: Handler = async (u, t, lg = 'fr') => {
  const ar = lg === 'ar', en = lg === 'en';
  if (!DECLARERS.has(u.role) && en) return 'Your account type does not file vigilance reports.';
  if (!DECLARERS.has(u.role)) return ar ? 'نوع حسابك لا يودع تصريحات يقظة.' : 'Votre type de compte ne dépose pas de déclarations de vigilance.';
  const { since, label } = periodStart(t);
  const where: any = { ...visibilityWhere(u) };
  if (since) where.createdAt = { gte: since };
  const dom = DOMAINS.find(([re]) => re.test(t));
  if (dom) where.domain = dom[1];
  const rows: any[] = await prisma.declaration.findMany({ where, select: { status: true, domain: true, authorUserId: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 2000 });
  const scope = REVIEW.has(u.role) && u.affiliatedEstablishmentIds.length ? 'visibles pour vous (les vôtres et celles de votre établissement)' : 'que vous avez déposées';
  if (en) {
    const scopeEn = REVIEW.has(u.role) && u.affiliatedEstablishmentIds.length ? 'visible to you (yours and your facility\'s)' : 'you filed';
    const whatEn = dom ? ` in ${EN_DOM[dom[1]]}` : '';
    const labelEn = label === ' aujourd’hui' ? ' today' : label === ' sur les 7 derniers jours' ? ' over the last 7 days' : label === ' ce mois-ci' ? ' this month' : label === ' cette année' ? ' this year' : '';
    if (!rows.length) return `No reports${whatEn}${labelEn} among those ${scopeEn}.`;
    const byEn: Record<string, number> = {};
    rows.forEach((r) => { byEn[r.status] = (byEn[r.status] ?? 0) + 1; });
    const askedEn = has(t, /draft|brouillon/) ? 'DRAFT' : has(t, /closed|clotur|ferme|termine/) ? 'CLOSED' : has(t, /review|analys|in progress|en cours|instruction/) ? 'UNDER_REVIEW' : has(t, /submitted|sent|transmi|envoy|soumis/) ? 'SUBMITTED' : null;
    if (askedEn) return `You have ${byEn[askedEn] ?? 0} ${EN_STATUS[askedEn]} report${(byEn[askedEn] ?? 0) === 1 ? '' : 's'}${whatEn}${labelEn} (out of ${rows.length} in total ${scopeEn}).`;
    const detailEn = Object.entries(byEn).map(([k, v]) => `${v} ${EN_STATUS[k] ?? k.toLowerCase()}`).join(', ');
    const mineEn = rows.filter((r) => r.authorUserId === u.id).length;
    return `There ${rows.length === 1 ? 'is 1 report' : `are ${rows.length} reports`}${whatEn}${labelEn} ${scopeEn}: ${detailEn}.` + (mineEn !== rows.length ? ` ${mineEn} written by you.` : '');
  }
  if (ar) {
    const scopeAr = REVIEW.has(u.role) && u.affiliatedEstablishmentIds.length ? 'المتاحة لك (تصريحاتك وتصريحات مؤسستك)' : 'التي أودعتها';
    const whatAr = dom ? ` في ${AR_DOM[dom[1]]}` : '';
    const labelAr = label === ' aujourd’hui' ? ' اليوم' : label === ' sur les 7 derniers jours' ? ' خلال آخر 7 أيام' : label === ' ce mois-ci' ? ' هذا الشهر' : label === ' cette année' ? ' هذه السنة' : '';
    if (!rows.length) return `لا توجد تصريحات${whatAr}${labelAr} ضمن تلك ${scopeAr}.`;
    const byAr: Record<string, number> = {};
    rows.forEach((r) => { byAr[r.status] = (byAr[r.status] ?? 0) + 1; });
    const askedAr = has(t, /brouillon|مسودة|مسودات/) ? 'DRAFT' : has(t, /clotur|ferme|termine|مغلق|منتهي/) ? 'CLOSED' : has(t, /analyse|en cours|instruction|قيد التحليل|جار/) ? 'UNDER_REVIEW' : has(t, /transmi|envoy|soumis|مرسل|مرسلة/) ? 'SUBMITTED' : null;
    if (askedAr) return `لديك ${byAr[askedAr] ?? 0} تصريحاً بحالة «${AR_STATUS[askedAr]}»${whatAr}${labelAr} (من أصل ${rows.length} في المجموع ${scopeAr}).`;
    const detailAr = Object.entries(byAr).map(([k, v]) => `${v} ${AR_STATUS[k] ?? k.toLowerCase()}`).join('، ');
    const mineAr = rows.filter((r) => r.authorUserId === u.id).length;
    return `يوجد ${rows.length} تصريحاً${whatAr}${labelAr} ${scopeAr}: ${detailAr}.` + (mineAr !== rows.length ? ` منها ${mineAr} من تحريرك.` : '');
  }
  const what = dom ? ` en ${dom[2]}` : '';
  if (!rows.length) return `Aucune déclaration${what}${label} parmi celles ${scope}.`;
  const by: Record<string, number> = {};
  rows.forEach((r) => { by[r.status] = (by[r.status] ?? 0) + 1; });
  const asked = has(t, /brouillon/) ? 'DRAFT' : has(t, /clotur|ferme|termine/) ? 'CLOSED' : has(t, /analyse|en cours|instruction/) ? 'UNDER_REVIEW' : has(t, /transmi|envoy|soumis/) ? 'SUBMITTED' : null;
  if (asked) {
    const c = by[asked] ?? 0;
    const plural: Record<string, string> = { DRAFT: 'brouillons', SUBMITTED: 'transmises', UNDER_REVIEW: 'en analyse', CLOSED: 'clôturées' };
    const word = asked === 'DRAFT' ? (c > 1 ? 'brouillons' : 'brouillon') : (c > 1 ? plural[asked] : DB_LABEL[asked]);
    return `Vous avez ${c} ${asked === 'DRAFT' ? '' : c > 1 ? 'déclarations ' : 'déclaration '}${word}${what}${label} (sur ${rows.length} au total ${scope}).`.replace('  ', ' ');
  }
  const detail = Object.entries(by).map(([k, v]) => `${v} ${DB_LABEL[k] ?? k.toLowerCase()}`).join(', ');
  const mineCount = rows.filter((r) => r.authorUserId === u.id).length;
  return `Il y a ${n(rows.length, 'déclaration', 'déclarations')}${what}${label} ${scope} : ${detail}.` +
    (mineCount !== rows.length ? ` Dont ${mineCount} rédigée${mineCount > 1 ? 's' : ''} par vous.` : '');
};

const cases: Handler = async (u, _t, lg = 'fr') => {
  const ar = lg === 'ar', en = lg === 'en';
  if (!REVIEW.has(u.role)) return en ? 'Case tracking is reserved for vigilance officers and facility administrators.' : ar ? 'متابعة الملفات مخصصة لمسؤولي اليقظة ومديري المؤسسات.' : 'Le suivi des dossiers est réservé aux responsables vigilance et aux administrateurs d’établissement.';
  const where: any = { OR: [{ assignedReviewerId: u.id }, ...(u.affiliatedEstablishmentIds.length ? [{ establishmentId: { in: u.affiliatedEstablishmentIds } }] : [])] };
  const rows: any[] = await prisma.case.findMany({ where, select: { status: true, assignedReviewerId: true } });
  if (!rows.length) return en ? 'No analysis case is visible to you at the moment.' : ar ? 'لا يوجد أي ملف تحليل ظاهر لك حالياً.' : 'Aucun dossier d’analyse ne vous est visible pour le moment.';
  const L: Record<string, string> = { OPENED: 'ouvert', INVESTIGATING: 'en investigation', RESOLVED: 'résolu', CLOSED: 'clos' };
  const by: Record<string, number> = {};
  rows.forEach((r) => { by[r.status] = (by[r.status] ?? 0) + 1; });
  const mine = rows.filter((r) => r.assignedReviewerId === u.id).length;
  if (en) {
    const LE: Record<string, string> = { OPENED: 'open', INVESTIGATING: 'under investigation', RESOLVED: 'resolved', CLOSED: 'closed' };
    return `${plural1(rows.length, 'case visible', 'cases visible')}: ${Object.entries(by).map(([k, v]) => `${v} ${LE[k] ?? k}`).join(', ')}. ${mine} ${mine === 1 ? 'is' : 'are'} assigned to you.`;
  }
  if (ar) {
    const LA: Record<string, string> = { OPENED: 'مفتوح', INVESTIGATING: 'قيد التحقيق', RESOLVED: 'تمت تسويته', CLOSED: 'مغلق' };
    return `${rows.length} ملفاً ظاهراً: ${Object.entries(by).map(([k, v]) => `${v} ${LA[k] ?? k}`).join('، ')}. ${mine} منها مسندة إليك.`;
  }
  return `${n(rows.length, 'dossier visible', 'dossiers visibles')} : ${Object.entries(by).map(([k, v]) => `${v} ${L[k] ?? k}`).join(', ')}. ${mine} vous ${mine > 1 ? 'sont assignés' : 'est assigné'}.`;
};

const submissions: Handler = async (u, _t, lg = 'fr') => {
  const ar = lg === 'ar', en = lg === 'en';
  const rows: any[] = await prisma.externalSubmission.findMany({ where: { authorUserId: u.id }, select: { status: true } });
  if (!rows.length && en) return 'You have not yet sent any report to the audit platform (reports with a catalog product).';
  if (!rows.length && ar) return 'لم ترسل بعد أي تصريح إلى منصة التدقيق (تصريحات مرتبطة بمنتج من الفهرس).';
  if (!rows.length) return 'Vous n’avez encore transmis aucune déclaration à la plateforme d’audit (déclarations avec produit du catalogue).';
  const by: Record<string, number> = {};
  rows.forEach((r) => { by[r.status] = (by[r.status] ?? 0) + 1; });
  if (en) return `Transmissions to audit: ${rows.length} in total — ${Object.entries(by).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ')}.`;
  if (ar) return `الإرسالات إلى التدقيق: ${rows.length} في المجموع — ${Object.entries(by).map(([k, v]) => `${v} ${k.toLowerCase()}`).join('، ')}.`;
  return `Transmissions vers l’audit : ${rows.length} au total — ${Object.entries(by).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ')}.`;
};

const listings: Handler = async (u, _t, lg = 'fr') => {
  const ar = lg === 'ar', en = lg === 'en';
  if (u.role !== 'ESTABLISHMENT_ADMIN') return en ? 'Listings and orders concern product supplier accounts.' : ar ? 'الإعلانات والطلبات خاصة بحسابات مورّدي المنتجات.' : 'Les annonces et commandes concernent les comptes fournisseurs de produits.';
  if (!u.affiliatedEstablishmentIds.length) return en ? 'No organization is linked to your account.' : ar ? 'لا توجد مؤسسة مرتبطة بحسابك.' : 'Aucune organisation n’est rattachée à votre compte.';
  const rows: any[] = await prisma.productListing.findMany({ where: { establishmentId: { in: u.affiliatedEstablishmentIds } }, select: { id: true, status: true } });
  const by = (s: string) => rows.filter((r) => r.status === s).length;
  const orders: any[] = await prisma.placementOrder.findMany({ where: { establishmentId: { in: u.affiliatedEstablishmentIds } }, select: { status: true } });
  const ob = (s: string) => orders.filter((o) => o.status === s).length;
  if (en) return `You have ${plural1(rows.length, 'listing', 'listings')}: ${by('PUBLISHED')} published, ${by('DRAFT')} draft, ${by('ARCHIVED')} archived. Orders: ${ob('PAID')} paid, ${ob('PENDING')} awaiting payment.`;
  if (ar) return `لديك ${rows.length} إعلاناً: ${by('PUBLISHED')} منشور، ${by('DRAFT')} مسودة، ${by('ARCHIVED')} مؤرشف. الطلبات: ${ob('PAID')} مدفوع، ${ob('PENDING')} في انتظار الدفع.`;
  return `Vous avez ${n(rows.length, 'annonce', 'annonces')} : ${by('PUBLISHED')} publiée(s), ${by('DRAFT')} brouillon(s), ${by('ARCHIVED')} archivée(s). Commandes : ${ob('PAID')} payée(s), ${ob('PENDING')} en attente de paiement.`;
};

const stats: Handler = async (u, _t, lg = 'fr') => {
  const ar = lg === 'ar', en = lg === 'en';
  if (u.role !== 'ESTABLISHMENT_ADMIN') return en ? 'Visit statistics concern supplier accounts\' listings.' : ar ? 'إحصاءات الزيارات خاصة بإعلانات حسابات المورّدين.' : 'Les statistiques de visites concernent les annonces des comptes fournisseurs.';
  if (!u.affiliatedEstablishmentIds.length) return en ? 'No organization is linked to your account.' : ar ? 'لا توجد مؤسسة مرتبطة بحسابك.' : 'Aucune organisation n’est rattachée à votre compte.';
  const l: any[] = await prisma.productListing.findMany({ where: { establishmentId: { in: u.affiliatedEstablishmentIds } }, select: { id: true } });
  const s: any[] = l.length ? await prisma.listingStat.findMany({ where: { listingId: { in: l.map((x) => x.id) } } }) : [];
  const sum = (k: string) => s.reduce((a, r) => a + (r[k] ?? 0), 0);
  if (en) return `On your listings: ${plural1(sum('views'), 'view', 'views')}, ${plural1(sum('clicks'), 'click', 'clicks')} and ${plural1(sum('contacts'), 'contact', 'contacts')} in total.`;
  if (ar) return `على إعلاناتك: ${sum('views')} مشاهدة و${sum('clicks')} نقرة و${sum('contacts')} تواصلاً في المجموع.`;
  return `Sur vos annonces : ${n(sum('views'), 'vue', 'vues')}, ${n(sum('clicks'), 'clic', 'clics')} et ${n(sum('contacts'), 'prise de contact', 'prises de contact')} au total.`;
};

const org: Handler = async (u, _t, lg = 'fr') => {
  const ar = lg === 'ar', en = lg === 'en';
  if (!MANAGES_ORG(u)) {
    const aff: any[] = await prisma.userEstablishment.findMany({ where: { userId: u.id }, include: { establishment: { select: { name: true } } } });
    const active = aff.filter((a) => a.status === 'ACTIVE').map((a) => a.establishment?.name).filter(Boolean);
    const pending = aff.filter((a) => a.status === 'PENDING').length;
    const inv: any[] = await prisma.organizationInvitation.findMany({ where: { email: u.email.toLowerCase(), status: 'PENDING' } });
    if (en) return `${active.length ? `You are a member of: ${active.join(', ')}.` : 'You are not a member of any facility.'}` +
      (pending ? ` ${plural1(pending, 'join request', 'join requests')} pending.` : '') + (inv.length ? ` ${plural1(inv.length, 'invitation', 'invitations')} waiting for you to accept.` : '');
    if (ar) return `${active.length ? `أنت عضو في: ${active.join('، ')}.` : 'لست عضواً في أي مؤسسة.'}` +
      (pending ? ` ${pending} طلب انضمام قيد الانتظار.` : '') + (inv.length ? ` ${inv.length} دعوة بانتظار قبولك.` : '');
    return `${active.length ? `Vous êtes membre de : ${active.join(', ')}.` : 'Vous n’êtes membre d’aucun établissement.'}` +
      (pending ? ` ${n(pending, 'demande d’adhésion en attente', 'demandes d’adhésion en attente')}.` : '') +
      (inv.length ? ` ${n(inv.length, 'invitation à accepter', 'invitations à accepter')}.` : '');
  }
  const ids = u.adminEstablishmentIds;
  const members: any[] = await prisma.userEstablishment.findMany({ where: { establishmentId: { in: ids } }, select: { status: true } });
  const invs: any[] = await prisma.organizationInvitation.findMany({ where: { establishmentId: { in: ids }, status: 'PENDING' } });
  const act = members.filter((m) => m.status === 'ACTIVE').length;
  const pen = members.filter((m) => m.status === 'PENDING').length;
  if (en) return `Your facility has ${plural1(act, 'active member', 'active members')}, ${plural1(pen, 'join request', 'join requests')} pending and ${plural1(invs.length, 'sent invitation', 'sent invitations')} pending.`;
  if (ar) return `تضم مؤسستك ${act} عضواً نشطاً و${pen} طلب انضمام قيد الانتظار و${invs.length} دعوة مرسلة قيد الانتظار.`;
  return `Votre établissement compte ${n(act, 'membre actif', 'membres actifs')}, ${n(pen, 'demande d’adhésion en attente', 'demandes d’adhésion en attente')} et ${n(invs.length, 'invitation envoyée en attente', 'invitations envoyées en attente')}.`;
};

const AR_ROLE: Record<string, string> = { PATIENT: 'مريض', DOCTOR: 'طبيب', PHARMACIEN: 'صيدلي', LABO: 'مخبر', HOSPITAL: 'طاقم طبي', VIGILANCE_REVIEWER: 'مسؤول اليقظة', ESTABLISHMENT_ADMIN: 'مورّد منتجات', ORG_ADMIN: 'مدير مؤسسة', FOURNISSEUR: 'موزّع / مورّد بالجملة' };
const EN_ROLE: Record<string, string> = { PATIENT: 'Patient', DOCTOR: 'Physician', PHARMACIEN: 'Pharmacist', LABO: 'Laboratory', HOSPITAL: 'Medical staff', VIGILANCE_REVIEWER: 'Vigilance officer', ESTABLISHMENT_ADMIN: 'Product supplier', ORG_ADMIN: 'Facility administrator', FOURNISSEUR: 'Distributor / wholesale supplier' };
const whoami: Handler = async (u, _t, lg = 'fr') => {
  const ar = lg === 'ar', en = lg === 'en';
  const aff: any[] = await prisma.userEstablishment.findMany({ where: { userId: u.id, status: 'ACTIVE' }, include: { establishment: { select: { name: true } } } });
  const names = aff.map((a) => a.establishment?.name).filter(Boolean);
  if (en) return `You are signed in as ${u.displayName} (${EN_ROLE[u.role] ?? u.role})` + (names.length ? `, affiliated with: ${names.join(', ')}.` : ', with no facility attached.');
  if (ar) return `أنت متصل باسم ${u.displayName} (${AR_ROLE[u.role] ?? u.role})` + (names.length ? `، ومرتبط بـ: ${names.join('، ')}.` : '، دون مؤسسة مرتبطة.');
  return `Vous êtes connecté en tant que ${u.displayName} (${ROLE_LABEL[u.role] ?? u.role})` + (names.length ? `, rattaché à : ${names.join(', ')}.` : ', sans établissement rattaché.');
};

const recipientsHandler: Handler = async (u, _t, lg = 'fr') => {
  if (!DECLARERS.has(u.role)) return lg === 'en' ? 'Your account type does not file vigilance reports.' : lg === 'ar' ? 'نوع حسابك لا يودع تصريحات يقظة.' : 'Votre type de compte ne dépose pas de déclarations de vigilance.';
  const { total, rows } = await declarationSummaries(u, 200);
  if (!total) return lg === 'en' ? 'You have no reports yet, so none has been sent to anyone.' : lg === 'ar' ? 'لا توجد تصريحات بعد، لذلك لم يُرسل شيء إلى أي جهة.' : 'Vous n’avez encore aucune déclaration : rien n’a donc été envoyé.';
  const by = new Map<string, number>();
  rows.forEach((r) => (r.recipients.length ? r.recipients : ['—']).forEach((x) => by.set(x, (by.get(x) ?? 0) + 1)));
  const list = [...by.entries()].map(([k, v]) => `${k === '—' ? (lg === 'en' ? 'not specified' : lg === 'ar' ? 'غير محدد' : 'non précisé') : k} (${v})`).join(', ');
  if (lg === 'en') return `Your ${plural1(total, 'report', 'reports')} (visible to you) went to: ${list}.`;
  if (lg === 'ar') return `تصريحاتك (${total}) أُرسلت إلى: ${list}.`;
  return `Vos ${n(total, 'déclaration visible', 'déclarations visibles')} ont pour destinataires : ${list}.`;
};

const OTHERS_RE = /\b(autre|autres|other|others|another)\s+(organisation|organisations|organization|organizations|etablissement|etablissements|association|associations|hopital|hopitaux|hospital|hospitals|clinique|cliniques|clinic|pharmacie|pharmacies|pharmacy|laboratoire|laboratoires|laboratory|centre|centres|medecin|medecins|docteur|docteurs|doctor|doctors|utilisateur|utilisateurs|user|users|patient|patients|compte|comptes|account|accounts)\b/;
const DATA_WORDS = /donnee|info|patient|declar|report|message|stock|commande|order|statisti|combien|how many|liste|list|dossier|compte|account|record|data|nombre/;
export const asksOtherOrgs = (t: string) => OTHERS_RE.test(t) && DATA_WORDS.test(t);
const refusal = (lg: Lang) =>
  lg === 'en' ? 'I only have access to the information of your own account and your own facility. I cannot share private information about other organizations or users. I can, however, answer general questions about vigilance or about how to use the platform.'
  : lg === 'ar' ? 'لا أملك إلا معلومات حسابك الخاص ومؤسستك. لا يمكنني تقديم معلومات خاصة عن مؤسسات أو مستخدمين آخرين، لكن يمكنني الإجابة عن أسئلة عامة حول اليقظة أو طريقة استعمال المنصة.'
  : 'Je n’ai accès qu’aux informations de votre propre compte et de votre établissement. Je ne peux pas donner d’informations privées sur d’autres organisations ou d’autres utilisateurs. En revanche, je peux répondre à des questions générales sur la vigilance ou sur l’utilisation de la plateforme.';

export function helpText(u: AuthedUser, lg: Lang | boolean = 'fr'): string {
  const ar = lg === 'ar' || lg === true;
  if (lg === 'en') {
    const x = ['“How many contacts do I have?”', '“Do I have unread messages?”'];
    if (DECLARERS.has(u.role)) x.push('“How many reports did I file this month?”', '“How many drafts?”');
    if (REVIEW.has(u.role)) x.push('“How many cases are in progress?”');
    if (u.role === 'ESTABLISHMENT_ADMIN') x.push('“How many views on my listings?”', '“Where are my orders?”');
    if (MANAGES_ORG(u)) x.push('“How many join requests are pending?”');
    return `I answer from your account data. You can ask, for example: ${x.join(' ')}`;
  }
  if (ar) {
    const e = ['«كم عدد جهات الاتصال لدي؟»', '«هل لدي رسائل غير مقروءة؟»'];
    if (DECLARERS.has(u.role)) e.push('«كم عدد التصريحات التي أودعتها هذا الشهر؟»', '«كم عدد المسودات؟»');
    if (REVIEW.has(u.role)) e.push('«كم عدد الملفات الجارية؟»');
    if (u.role === 'ESTABLISHMENT_ADMIN') e.push('«كم مشاهدة لإعلاناتي؟»', '«أين وصلت طلباتي؟»');
    if (MANAGES_ORG(u)) e.push('«كم طلب انضمام قيد الانتظار؟»');
    return `أجيب انطلاقاً من بيانات حسابك. يمكنك أن تسأل مثلاً: ${e.join(' ')}`;
  }
  const ex = ['« Combien de contacts ai-je ? »', '« Ai-je des messages non lus ? »'];
  if (DECLARERS.has(u.role)) ex.push('« Combien de déclarations ai-je faites ce mois ? »', '« Combien de brouillons ? »');
  if (REVIEW.has(u.role)) ex.push('« Combien de dossiers sont en cours ? »');
  if (u.role === 'ESTABLISHMENT_ADMIN') ex.push('« Combien de vues sur mes annonces ? »', '« Où en sont mes commandes ? »');
  if (MANAGES_ORG(u)) ex.push('« Combien de demandes d’adhésion en attente ? »');
  return `Je réponds à partir des données de votre compte. Vous pouvez demander par exemple : ${ex.join(' ')}`;
}

interface Intent { id: string; re: RegExp; run: Handler }
const INTENTS: Intent[] = [
  { id: 'recipients', re: /destinataire|recipient|\ba qui\b|to whom|sent to|who did i send|لمن|المستلم|المرسل إليه/, run: recipientsHandler },
  { id: 'declarations', re: /declar|signalement|vigilance|brouillon|\breports?\b|\bdrafts?\b|تصريح|تصريحات|مسودة|مسودات|يقظة/, run: declarations },
  { id: 'cases', re: /\b(dossier|dossiers|enquete|investigation|case|cases)\b|ملف|ملفات|تحقيق/, run: cases },
  { id: 'submissions', re: /\b(audit|cnpm|transmission|transmissions|transmitted)\b|تدقيق|إرسال|ارسال/, run: submissions },
  { id: 'stats', re: /\b(vue|vues|visite|visites|clic|clics|statistique|statistiques|views?|visits?|clicks?|statistics|stats)\b|مشاهدة|مشاهدات|زيارة|زيارات|نقرة|نقرات|إحصاء|احصاء/, run: stats },
  { id: 'listings', re: /annonce|fiche produit|\bproduits?\b|commande|paiement|facture|publie|listing|\bproducts?\b|\borders?\b|payment|invoice|إعلان|اعلان|طلبية|طلبات|دفع|فاتورة|منتج/, run: listings },
  { id: 'org', re: /\b(membre|membres|equipe|collaborateur|collaborateurs|adhesion|invitation|invitations|etablissement|organisation|members?|team|join|facility|organi[sz]ation)\b|عضو|أعضاء|اعضاء|انضمام|دعوة|دعوات|مؤسسة/, run: org },
  { id: 'contacts', re: /contact|collegue|connexion|\bamis?\b|relation|colleagues?|connections?|friends?|جهة اتصال|جهات اتصال|اتصال|زميل|زملاء/, run: contacts },
  { id: 'messages', re: /message|non lu|conversation|discussion|messagerie|unread|\bchats?\b|رسالة|رسائل|محادثة|محادثات|غير مقروء/, run: messages },
  { id: 'whoami', re: /(qui suis|mon role|mon compte|mon profil|connecte en tant|who am i|my role|my account|my profile|signed in as|logged in)|من أنا|حسابي|دوري|ملفي الشخصي/, run: whoami },
];

export type AssistantReply = { text: string; intents: string[]; understood: boolean };

export type HistoryTurn = { role: string; text: string };

export async function answerQuestion(user: AuthedUser, question: string, lang: Lang = 'fr', history: HistoryTurn[] = []): Promise<AssistantReply> {
  const t = norm(question);
  const lg: Lang = /[\u0600-\u06FF]/.test(question) ? 'ar' : lang;
  const ar = lg === 'ar';
  // Confidentialité : jamais de donnée privée d'une autre organisation, même si la question est bien formulée.
  if (asksOtherOrgs(t)) return { text: refusal(lg), intents: ['privacy'], understood: true };
  if (has(t, /^(bonjour|salut|bonsoir|hello|hi|hey|good (morning|evening)|coucou|salam)\b/) || has(t, /^(مرحبا|السلام عليكم|اهلا|أهلا|سلام)/)) {
    if (t.split(' ').length <= 3)
      return { text: lg === 'en' ? `Hello ${user.displayName.split(' ')[0]}! ${helpText(user, 'en')}` : ar ? `مرحباً ${user.displayName.split(' ')[0]}! ${helpText(user, true)}` : `Bonjour ${user.displayName.split(' ')[0]} ! ${helpText(user)}`, intents: ['greeting'], understood: true };
  }
  if (has(t, /\b(aide|help|que peux|que sais|quoi demander|comment ca marche|what can you|how does this work)\b/) || has(t, /مساعدة|ساعدني|ماذا يمكنك|ماذا تستطيع/))
    return { text: helpText(user, lg), intents: ['help'], understood: true };

  // Réponse libre (toute formulation, suite de discussion) quand un modèle est configuré ; sinon / en cas d'échec : règles.
  if (llmEnabled()) {
    const text = await llmAnswer({ question, context: await buildContext(user), history, lang: lg });
    if (text) return { text, intents: ['llm'], understood: true };
  }
  let matched = INTENTS.filter((i) => i.re.test(t)).slice(0, 3);
  let tt = t;
  if (!matched.length) {
    // Suite de la discussion : « et en tout ? », « à qui ? » → on rattache la question au message précédent.
    const prev = [...history].reverse().find((h) => h.role === 'user');
    if (prev) { tt = `${norm(prev.text)} ${t}`; matched = INTENTS.filter((i) => i.re.test(tt)).slice(0, 3); }
  }
  if (!matched.length)
    return { text: lg === 'en' ? `I did not understand this question. ${helpText(user, 'en')}` : ar ? `لم أفهم هذا السؤال. ${helpText(user, true)}` : `Je n’ai pas compris cette question. ${helpText(user)}`, intents: [], understood: false };
  const parts = await Promise.all(matched.map((i) => i.run(user, tt, lg)));
  return { text: parts.join('\n'), intents: matched.map((i) => i.id), understood: true };
}
