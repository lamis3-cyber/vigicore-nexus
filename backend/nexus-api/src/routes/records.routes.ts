import { Router } from 'express';
import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../lib/asyncHandler';
import { isValidEmail, normalizeEmail } from '../lib/email-address';
import { mailConfigured, sendMail } from '../lib/email';
import { createHash } from 'node:crypto';

/**
 * Données des tableaux de bord qui doivent survivre au rechargement :
 *   GET  /api/records/patients     patients suivis du médecin connecté (lui seul ; jamais l'établissement)
 *   POST /api/records/patients     ajoute un patient à SA liste (médecin) ; e-mail du patient requis, lien avec son compte + e-mail de notification
 *   DELETE /api/records/patients/:id        « supprime » = ARCHIVE le patient (médecin propriétaire) : le dossier reste en base, en lecture seule
 *   POST /api/records/patients/:id/restore  remet un dossier archivé dans la liste active
 *   POST /api/records/patients/:id/hide     retire un dossier ARCHIVÉ de l'affichage (il reste en base)
 *   POST /api/records/patients/:id/unhide   le réaffiche dans les archives
 *   GET  /api/records/patients?view=archived[&hidden=1]   dossiers archivés du médecin (jamais ceux des autres)
 *   POST /api/records/patients/:id/contact  { message } envoie un e-mail au patient (repli quand la messagerie n'est pas encore acceptée)
 *   GET  /api/records/audit        journal d'audit visible pour la session
 *   POST /api/records/audit        ajoute une ligne (acteur / établissement / date écrits par le serveur)
 * Portée : toujours dérivée de la session. Revue (VIGILANCE_REVIEWER, HOSPITAL, ORG_ADMIN) : + établissements ACTIFS.
 */
export const recordsRouter = Router();
recordsRouter.use(requireAuth);

const fail = (res: Response, status: number, message: string) => res.status(status).json({ success: false, message });
const REVIEW = new Set(['VIGILANCE_REVIEWER', 'ORG_ADMIN']); // le personnel médical (HOSPITAL) ne relit pas l'établissement
const PATIENT_WRITERS = new Set(['DOCTOR']);
const AUDIT_WRITERS = new Set(['DOCTOR', 'PHARMACIEN', 'LABO', 'HOSPITAL', 'VIGILANCE_REVIEWER', 'ORG_ADMIN']);
const REF_TYPES = new Set(['declaration', 'alert', 'recall', 'lot', 'lab', 'capa']);
const COLORS = ['#38bdf8', '#34d399', '#f59e0b', '#a78bfa', '#f472b6', '#fb7185'];

type SessionUser = NonNullable<Express.Request['user']>;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function scope(user: SessionUser, ownerField: string) {
  const own = { [ownerField]: user.id };
  if (REVIEW.has(user.role) && user.affiliatedEstablishmentIds.length > 0) {
    return { OR: [own, { establishmentId: { in: user.affiliatedEstablishmentIds } }] };
  }
  return own;
}

async function reservedId(): Promise<string | null> {
  const central = await prisma.establishment.findFirst({ where: { isSystemReserved: true } });
  return central?.id ?? null;
}
/** organizationId exposé au front : null pour l'établissement central réservé (même règle que les déclarations). */
async function orgOf(establishmentId: string | null): Promise<string | null> {
  if (!establishmentId) return null;
  return establishmentId === (await reservedId()) ? null : establishmentId;
}

type ChatState = 'connected' | 'sent' | 'received';
/** État de la connexion de messagerie entre `meId` et chacun des comptes `ids` (absent = aucune connexion). */
async function chatStates(meId: string, ids: string[]): Promise<Map<string, ChatState>> {
  const out = new Map<string, ChatState>();
  if (!ids.length) return out;
  const rows: any[] = await prisma.chatConnection.findMany({
    where: { OR: [{ requesterId: meId, addresseeId: { in: ids } }, { addresseeId: meId, requesterId: { in: ids } }] },
  });
  for (const r of rows) {
    const other = r.requesterId === meId ? r.addresseeId : r.requesterId;
    out.set(other, r.status === 'ACCEPTED' ? 'connected' : r.requesterId === meId ? 'sent' : 'received');
  }
  return out;
}

/** E-mail, compte lié et état de la messagerie ne sont exposés qu'au médecin propriétaire (jamais aux relecteurs de l'établissement). */
function patientDto(row: any, organizationId: string | null, viewerId: string, states: Map<string, ChatState>) {
  const { email, patientUserId, ...rest } = (row.payload ?? {}) as Record<string, unknown>;
  const mine = row.ownerUserId === viewerId;
  return {
    ...rest, id: row.id, organizationId, ownerUserId: row.ownerUserId, createdAt: row.createdAt,
    archived: Boolean(row.archivedAt),
    ...(row.archivedAt && mine ? { archivedAt: row.archivedAt, archiveReason: row.archiveReason ?? null, hidden: Boolean(row.hiddenAt) } : {}),
    ...(mine ? { email: email ?? null, patientUserId: patientUserId ?? null, chatStatus: typeof patientUserId === 'string' ? states.get(patientUserId) ?? null : null } : {}),
  };
}

recordsRouter.get('/patients', asyncHandler(async (req, res) => {
  const user = req.user!;
  const archivedView = req.query.view === 'archived';
  // Archives : réservées au médecin propriétaire (jamais aux relecteurs de l'établissement).
  // Dossiers patients : visibles du SEUL médecin propriétaire (jamais de l'administration ni des relecteurs de l'établissement).
  const all = await prisma.dashboardPatient.findMany({ where: { ownerUserId: user.id }, orderBy: { createdAt: 'desc' }, take: 1000 });
  const showHidden = req.query.hidden === '1';
  const rows = all.filter((r: any) => (archivedView ? Boolean(r.archivedAt) && (showHidden || !r.hiddenAt) : !r.archivedAt));
  const central = await reservedId();
  const linked = rows.filter((r: any) => r.ownerUserId === user.id).map((r: any) => (r.payload as any)?.patientUserId).filter((x: unknown): x is string => typeof x === 'string');
  const states = await chatStates(user.id, linked);
  res.json({ success: true, patients: rows.map((r: any) => patientDto(r, r.establishmentId && r.establishmentId !== central ? r.establishmentId : null, user.id, states)) });
}));

recordsRouter.post('/patients', asyncHandler(async (req, res) => {
  const user = req.user!;
  if (!PATIENT_WRITERS.has(user.role)) return fail(res, 403, 'Seuls les médecins peuvent gérer une liste de patients.');
  const b = req.body ?? {};
  const name = str(b.name, 120);
  const age = Number(b.age);
  if (!name) return fail(res, 400, 'Nom du patient requis.');
  if (!Number.isInteger(age) || age < 0 || age > 130) return fail(res, 400, 'Âge invalide.');
  const sex = b.sex === 'F' || b.sex === 'M' ? b.sex : str(b.sex, 10) || 'M';
  const condition = str(b.condition, 200) || 'Non renseignée';
  const allergies = (Array.isArray(b.allergies) ? b.allergies : []).map((a: unknown) => str(a, 80)).filter(Boolean).slice(0, 20);
  const email = normalizeEmail(b.email);
  if (!email || !isValidEmail(email)) return fail(res, 400, 'Adresse e-mail du patient requise (format valide).');
  const account: any = await prisma.user.findFirst({ where: { email, role: 'PATIENT', deactivatedAt: null }, select: { id: true } });
  const count = await prisma.dashboardPatient.count({ where: { ownerUserId: user.id } });
  const initials = name.split(' ').filter(Boolean).map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  const payload = {
    initials, color: COLORS[count % COLORS.length], name, age, sex, condition,
    allergies: allergies.length ? allergies : ['Aucune connue'], declCount: 0, lastVisit: '—',
    email, ...(account ? { patientUserId: account.id } : {}),
  };
  const row = await prisma.dashboardPatient.create({ data: { ownerUserId: user.id, establishmentId: user.activeEstablishmentId ?? null, payload } });
  // Compte patient existant : demande de contact en attente (le patient décide de l'accepter dans sa messagerie).
  if (account) {
    const existing = await prisma.chatConnection.findFirst({
      where: { OR: [{ requesterId: user.id, addresseeId: account.id }, { requesterId: account.id, addresseeId: user.id }] },
    });
    if (!existing) await prisma.chatConnection.create({ data: { requesterId: user.id, addresseeId: account.id } });
  }
  // E-mail de notification : sans donnée de santé, jamais bloquant pour l'ajout.
  let emailStatus: 'sent' | 'not_configured' | 'failed' = 'sent';
  if (!mailConfigured()) emailStatus = 'not_configured';
  else {
    try {
      await sendMail({
        to: email,
        replyTo: user.email,
        subject: `${user.displayName} vous a ajouté à son suivi — VigiCore NEXUS`,
        text: `Bonjour ${name},\n\n${user.displayName} vous a ajouté à sa liste de patients suivis sur VigiCore NEXUS.\n\n` +
          (account
            ? 'Connectez-vous à votre espace, puis ouvrez Messages > Contacts pour accepter sa demande et échanger directement avec lui.\n'
            : 'Créez votre compte patient avec cette adresse e-mail pour échanger directement avec lui via la messagerie sécurisée.\n') +
          '\nSi vous ne connaissez pas cette personne, ignorez ce message.\n',
      });
    } catch { emailStatus = 'failed'; }
  }
  const states = await chatStates(user.id, account ? [account.id] : []);
  res.status(201).json({ success: true, linked: Boolean(account), emailStatus, patient: patientDto(row, user.activeEstablishmentId ?? null, user.id, states) });
}));

async function ownedPatient(req: any, res: Response) {
  const user = req.user as SessionUser;
  if (!PATIENT_WRITERS.has(user.role)) { fail(res, 403, 'Seuls les médecins peuvent gérer une liste de patients.'); return null; }
  const row: any = await prisma.dashboardPatient.findFirst({ where: { id: String(req.params.id) } });
  if (!row || row.ownerUserId !== user.id) { fail(res, 404, 'Patient introuvable.'); return null; }
  return row;
}

const stable = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') { const o = v as Record<string, unknown>; return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`; }
  return JSON.stringify(v);
};
/** Empreinte SHA-256 du contenu du dossier à l'instant de l'archivage (preuve qu'il n'a pas été modifié depuis). */
const archiveHashOf = (row: any) => createHash('sha256').update(stable({ id: row.id, ownerUserId: row.ownerUserId, createdAt: new Date(row.createdAt).toISOString(), payload: row.payload })).digest('hex');
async function logPatientAudit(user: SessionUser, row: any, action: string) {
  try {
    await prisma.auditEntry.create({ data: { actorUserId: user.id, actorName: user.displayName, establishmentId: row.establishmentId ?? null, refType: 'patient', refId: row.id, action } });
  } catch { /* le journal ne doit jamais empêcher l'action */ }
}

// « Supprimer » = ARCHIVER : rien n'est effacé ; le dossier devient lecture seule dans le compte du médecin.
recordsRouter.delete('/patients/:id', asyncHandler(async (req, res) => {
  const row = await ownedPatient(req, res);
  if (!row) return;
  if (row.archivedAt) return res.json({ success: true, alreadyArchived: true });
  const reason = str(req.body?.reason, 300) || null;
  const updated = await prisma.dashboardPatient.update({
    where: { id: row.id },
    data: { archivedAt: new Date(), archivedByUserId: req.user!.id, archiveReason: reason, archiveHash: archiveHashOf(row), hiddenAt: null },
  });
  await logPatientAudit(req.user!, row, 'Dossier patient archivé (conservé, lecture seule)');
  res.json({ success: true, archived: true, archiveHash: (updated as any).archiveHash });
}));

recordsRouter.post('/patients/:id/restore', asyncHandler(async (req, res) => {
  const row = await ownedPatient(req, res);
  if (!row) return;
  if (!row.archivedAt) return fail(res, 409, 'Ce dossier n’est pas archivé.');
  await prisma.dashboardPatient.update({ where: { id: row.id }, data: { archivedAt: null, archivedByUserId: null, archiveReason: null, archiveHash: null, hiddenAt: null } });
  await logPatientAudit(req.user!, row, 'Dossier patient restauré dans la liste active');
  res.json({ success: true });
}));

// Retirer un dossier archivé de l'AFFICHAGE : il reste en base (archivé), jamais supprimé.
recordsRouter.post('/patients/:id/hide', asyncHandler(async (req, res) => {
  const row = await ownedPatient(req, res);
  if (!row) return;
  if (!row.archivedAt) return fail(res, 409, 'Archivez d’abord ce dossier : un dossier actif ne peut pas être masqué.');
  if (!row.hiddenAt) {
    await prisma.dashboardPatient.update({ where: { id: row.id }, data: { hiddenAt: new Date() } });
    await logPatientAudit(req.user!, row, 'Dossier patient archivé retiré de l’affichage (conservé en base)');
  }
  res.json({ success: true });
}));
recordsRouter.post('/patients/:id/unhide', asyncHandler(async (req, res) => {
  const row = await ownedPatient(req, res);
  if (!row) return;
  if (row.hiddenAt) await prisma.dashboardPatient.update({ where: { id: row.id }, data: { hiddenAt: null } });
  res.json({ success: true });
}));

recordsRouter.post('/patients/:id/contact', asyncHandler(async (req, res) => {
  const row = await ownedPatient(req, res);
  if (!row) return;
  const user = req.user!;
  if (row.archivedAt) return fail(res, 409, 'Dossier archivé : lecture seule. Restaurez-le pour contacter ce patient.');
  const message = str(req.body?.message, 2000);
  if (!message) return fail(res, 400, 'Écrivez un message.');
  const to = normalizeEmail((row.payload as any)?.email);
  if (!to || !isValidEmail(to)) return fail(res, 400, 'Ce patient n’a pas d’adresse e-mail enregistrée.');
  if (!mailConfigured()) return fail(res, 503, 'L’envoi d’e-mails n’est pas configuré sur ce serveur (SMTP_HOST et MAIL_FROM).');
  try {
    await sendMail({
      to, replyTo: user.email,
      subject: `Message de ${user.displayName} — VigiCore NEXUS`,
      text: `${message}\n\n— ${user.displayName}\nMessage envoyé via VigiCore NEXUS. Vous pouvez répondre directement à cet e-mail.\n`,
    });
  } catch { return fail(res, 502, 'L’e-mail n’a pas pu être envoyé. Réessayez plus tard.'); }
  res.json({ success: true });
}));

function auditDto(row: any, organizationId: string | null) {
  return {
    id: row.id, ts: new Date(row.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).replace(',', ' ·'),
    actor: row.actorName, action: row.action, refType: row.refType, refId: row.refId, organizationId, createdAt: row.createdAt,
  };
}

recordsRouter.get('/audit', asyncHandler(async (req, res) => {
  const rows = await prisma.auditEntry.findMany({ where: scope(req.user!, 'actorUserId'), orderBy: { createdAt: 'desc' }, take: 500 });
  const central = await reservedId();
  res.json({ success: true, entries: rows.map((r: any) => auditDto(r, r.establishmentId && r.establishmentId !== central ? r.establishmentId : null)) });
}));

recordsRouter.post('/audit', asyncHandler(async (req, res) => {
  const user = req.user!;
  if (!AUDIT_WRITERS.has(user.role)) return fail(res, 403, 'Journal d’audit non disponible pour ce compte.');
  const refType = str(req.body?.refType, 20);
  const refId = str(req.body?.refId, 120);
  const action = str(req.body?.action, 500);
  if (!REF_TYPES.has(refType) || !refId || !action) return fail(res, 400, 'Entrée de journal invalide.');
  const row = await prisma.auditEntry.create({
    data: { actorUserId: user.id, actorName: user.displayName, establishmentId: user.activeEstablishmentId ?? null, refType, refId, action },
  });
  res.status(201).json({ success: true, entry: auditDto(row, await orgOf(user.activeEstablishmentId ?? null)) });
}));
