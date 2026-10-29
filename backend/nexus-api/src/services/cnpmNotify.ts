import { mailConfigured, sendMail } from '../lib/email';
import type { SubmissionPayload } from './submissions';

/**
 * Notification e-mail « déclaration adressée au CNPM ».
 * - Destinataire : variable d'environnement CNPM_NOTIFY_EMAIL (aucune adresse en dur, .env non modifié).
 * - Contenu : rapport complet (voir CNPM_NOTIFY_INCLUDE_PATIENT), libellés lisibles, pièces jointes dans le MÊME message.
 * - Jamais bloquant : tout échec est avalé (journal sans contenu).
 */
export function cnpmNotifyAddress(env: NodeJS.ProcessEnv = process.env): string | null {
  const a = (env.CNPM_NOTIFY_EMAIL ?? '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a) ? a : null;
}

export interface NotifyContext {
  patient: { name?: string; idNumber?: string; age?: string; sex?: string } | null;
  service?: string; onsetDate?: string; description?: string; problem?: string; productType?: string;
  manufacturer?: string; evolution?: string; stopped?: string; attachments?: string[];
  /** Lignes déjà formatées (construites côté serveur depuis l'enregistrement) insérées dans « Détail de l'incident ». */
  extraLines?: string[];
}

/** Liste blanche + plafonds : ce contexte ne sert QU'À l'e-mail, il n'est ni stocké ni transmis à Audit. */
export function parseNotifyContext(raw: any): NotifyContext | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const t = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
  const p = raw.patient && typeof raw.patient === 'object' ? raw.patient : null;
  const patient = p ? { name: t(p.name, 200), idNumber: t(p.idNumber, 100), age: t(p.age, 20), sex: t(p.sex, 20) } : null;
  return {
    patient: patient && Object.values(patient).some(Boolean) ? patient : null,
    service: t(raw.service, 200), onsetDate: t(raw.onsetDate, 40), description: t(raw.description, 10_000),
    problem: t(raw.problem, 200), productType: t(raw.productType, 200), manufacturer: t(raw.manufacturer, 200),
    evolution: t(raw.evolution, 200), stopped: t(raw.stopped, 100),
    attachments: Array.isArray(raw.attachments) ? raw.attachments.map((x: unknown) => t(x, 200)).filter((x: string | undefined): x is string => !!x).slice(0, 20) : undefined,
  };
}

/** Détail clinique + patient dans l'e-mail : activé par défaut ; CNPM_NOTIFY_INCLUDE_PATIENT=false le retire. */
const includePatient = () => (process.env.CNPM_NOTIFY_INCLUDE_PATIENT ?? 'true').trim().toLowerCase() !== 'false';


/** Pièces jointes : seuls les fichiers réellement joints sont annoncés comme joints ; les autres sont signalés comme non reçus. */
function attachmentLines(declared: string[] | undefined, files: MailFile[]): (string | null)[] {
  const joined = files.map((f) => f.name);
  const missing = (declared ?? []).filter((n) => !joined.includes(n));
  const out: (string | null)[] = [];
  if (joined.length) out.push('', `Pièces jointes à ce message (${joined.length}) : ${joined.join(', ')}.`);
  if (missing.length) out.push('', `Pièces annoncées par le déclarant mais NON reçues par la plateforme : ${missing.join(', ')}.`);
  return out;
}

const ROLE_LABEL: Record<string, string> = {
  DOCTOR: 'Médecin', PHARMACIEN: 'Pharmacien', LABO: 'Laboratoire', HOSPITAL: 'Établissement de santé', PATIENT: 'Patient',
  VIGILANCE_REVIEWER: 'Responsable vigilance', ESTABLISHMENT_ADMIN: 'Fabricant / fournisseur', ORG_ADMIN: "Administrateur d'établissement",
  FOURNISSEUR: 'Fournisseur / distributeur',
};
const CONTEXT_LABEL: Record<string, string> = { utilisation: "Pendant l'utilisation", demarrage: 'À la mise en marche', nettoyage: 'Nettoyage / désinfection', maintenance: 'Pendant la maintenance', transport: 'Transport / stockage' };
const SYMPTOM_LABEL: Record<string, string> = { arret: 'Arrêt complet', alarme: 'Alarme / code erreur', mesure: 'Mesure erronée', chauffe: 'Fuite / surchauffe', bruit: 'Bruit ou vibration anormale', dommage: 'Dommage physique' };
const ACTION_LABEL: Record<string, string> = { hors_service: 'Mis hors service', remplace: 'Remplacé par un autre appareil', maintenance: 'Maintenance contactée', aucune: 'Aucune action' };
const STATE_LABEL: Record<string, string> = { en_service: 'En service', hors_service: 'Hors service', quarantaine: 'Mis en quarantaine' };
const IMPACT_LABEL: Record<string, string> = { none: 'Sans impact (panne technique)', delay: 'Retard de prise en charge', exposed: 'Patient / utilisateur exposé à un risque', injury: 'Blessure' };
const lab = (map: Record<string, string>, v: string | undefined) => (v ? map[v] ?? v : v);
const frDate = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso);

export interface MailFile { name: string; mime: string; data: Buffer }
/** Total maximal des fichiers dans UN message (au-delà, le fichier part dans un message séparé). */
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
/** Délai d'attente des fichiers avant d'envoyer le message sans eux (le navigateur les envoie juste après la déclaration). */
const HOLD_MS = Number(process.env.CNPM_ATTACH_HOLD_MS ?? 60_000);

interface Held { payload: SubmissionPayload; role: string; ctx: NotifyContext | null; files: MailFile[]; expected: number; bytes: number; timer: ReturnType<typeof setTimeout>; flushed: boolean; onDone?: (r: 'sent' | 'skipped' | 'failed') => void }
const held = new Map<string, Held>();

async function flush(id: string): Promise<'sent' | 'skipped' | 'failed'> {
  const h = held.get(id);
  if (!h) return 'skipped';
  clearTimeout(h.timer);
  held.delete(id);
  const r = await notifyCnpm(h.payload, h.role, id, h.ctx, h.files);
  try { h.onDone?.(r); } catch { /* le rappel ne doit jamais casser l'envoi */ }
  return r;
}

/**
 * Notification avec pièces jointes : si des fichiers sont annoncés, le message est retenu en mémoire (jamais écrit sur disque)
 * jusqu'à réception de tous les fichiers ou jusqu'au délai ; il part alors en UN seul e-mail avec les fichiers joints.
 */
export function scheduleCnpmNotification(payload: SubmissionPayload, role: string, id: string, ctx: NotifyContext | null, onDone?: (r: 'sent' | 'skipped' | 'failed') => void): Promise<'sent' | 'skipped' | 'failed'> | void {
  const expected = ctx?.attachments?.length ?? 0;
  if (!expected || !cnpmNotifyAddress() || !mailConfigured()) {
    return notifyCnpm(payload, role, id, ctx).then((r) => { try { onDone?.(r); } catch { /* ignoré */ } return r; });
  }
  const timer = setTimeout(() => { void flush(id).catch(() => undefined); }, HOLD_MS);
  if (typeof (timer as any).unref === 'function') (timer as any).unref();
  held.set(id, { payload, role, ctx, files: [], expected, bytes: 0, timer, flushed: false, onDone });
}

/** Ajoute un fichier au message retenu. 'queued' = parti avec le message à venir ; sinon résultat de l'envoi ; 'none' = rien de retenu. */
export async function attachToHeld(id: string, f: MailFile): Promise<'queued' | 'sent' | 'skipped' | 'failed' | 'none'> {
  const h = held.get(id);
  if (!h) return 'none';
  if (h.bytes + f.data.length > MAX_TOTAL_BYTES) return 'none';
  h.files.push(f); h.bytes += f.data.length;
  if (h.files.length >= h.expected) return flush(id);
  return 'queued';
}

export async function notifyCnpm(payload: SubmissionPayload, reporterRole: string, submissionId: string, ctx: NotifyContext | null = null, files: MailFile[] = []): Promise<'sent' | 'skipped' | 'failed'> {
  const to = cnpmNotifyAddress();
  if (!to || !mailConfigured()) return 'skipped';
  const malfunction = payload.kind === 'DEVICE_MALFUNCTION';
  const full = includePatient();
  const SEV: Record<string, string> = { legere: 'Légère', moderee: 'Modérée', grave: 'Grave' };
  const d = payload.device; const m = payload.malfunction;
  const lines = [
    'Bonjour,',
    '',
    `Une ${malfunction ? 'panne / défaillance de dispositif' : 'déclaration d’incident'} adressée au CNPM a été enregistrée sur VigiCore NEXUS.`,
    '',
    `Référence interne : ${submissionId}`,
    `Date de déclaration : ${new Date().toLocaleString('fr-FR', { timeZone: process.env.CNPM_NOTIFY_TZ || 'Africa/Algiers', dateStyle: 'short', timeStyle: 'short' })}`,
    ctx?.onsetDate ? `Date de survenue : ${frDate(ctx.onsetDate)}` : (m ? `Date de survenue : ${frDate(m.occurredOn)}` : null),
    `Produit : ${payload.productLabel ?? payload.productRef}`,
    payload.lotNumber ? `Lot : ${payload.lotNumber}` : null,
    payload.manufacturerReference ? `Référence fabricant : ${payload.manufacturerReference}` : null,
    payload.declaredSeverity ? `Gravité déclarée : ${SEV[payload.declaredSeverity] ?? payload.declaredSeverity}` : null,
    `Déclarant : ${ROLE_LABEL[reporterRole] ?? reporterRole}`,
    ...(full ? [
      // Le CNPM est l'autorité destinataire : le rapport complet est repris, qu'il vienne du serveur (payload) ou du contexte saisi.
      ...(d ? ['', '— Dispositif —', `Dénomination : ${d.name}`, d.brand ? `Marque : ${d.brand}` : null, d.model ? `Modèle : ${d.model}` : null,
        d.serialNumber ? `N° de série : ${d.serialNumber}` : null, d.inventoryNumber ? `N° d’inventaire : ${d.inventoryNumber}` : null,
        d.udi ? `UDI : ${d.udi}` : null, d.lastMaintenanceDate ? `Dernière maintenance : ${frDate(d.lastMaintenanceDate)}` : null] : []),
      ...(m ? ['', '— Panne —', `Date : ${frDate(m.occurredOn)}${m.occurredAt ? ` à ${m.occurredAt}` : ''}`, `Circonstances : ${lab(CONTEXT_LABEL, m.context)}`,
        m.symptoms?.length ? `Symptômes : ${m.symptoms.map((x: string) => lab(SYMPTOM_LABEL, x)).join(', ')}` : null, m.errorCode ? `Code d’erreur : ${m.errorCode}` : null,
        m.actionTaken ? `Action immédiate : ${lab(ACTION_LABEL, m.actionTaken)}` : null, m.maintenanceTicket ? `Ticket de maintenance : ${m.maintenanceTicket}` : null,
        `État de l’appareil : ${lab(STATE_LABEL, m.deviceState)}`, `Impact : ${lab(IMPACT_LABEL, m.impact)}`] : []),
      ...(ctx ? [
        '',
        '— Patient concerné —',
        ctx.patient ? `Nom / initiales : ${ctx.patient.name ?? '—'}` : 'Aucun patient concerné',
        ctx.patient?.idNumber ? `N° dossier / identifiant : ${ctx.patient.idNumber}` : null,
        ctx.patient?.age ? `Âge : ${ctx.patient.age}` : null,
        ctx.patient?.sex ? `Sexe : ${ctx.patient.sex}` : null,
        ctx.service ? `Service : ${ctx.service}` : null,
        '',
        '— Détail de l’incident —',
        ctx.problem ? `Nature du problème : ${ctx.problem}` : null,
        ctx.productType ? `Type de produit : ${ctx.productType}` : null,
        ctx.manufacturer ? `Fabricant : ${ctx.manufacturer}` : null,
        ctx.evolution ? `Évolution : ${ctx.evolution}` : null,
        ctx.stopped ? `Produit arrêté / retiré : ${ctx.stopped}` : null,
        ...(ctx.extraLines ?? []),
      ] : []),
      '',
      '— Rapport transmis à la vigilance —',
      payload.description,
      ...attachmentLines(ctx?.attachments, files),
      '',
      'Message contenant des données de santé : ne le transférez pas et supprimez-le après traitement.',
    ] : ['', 'Le détail n’est pas repris dans ce message (configuration de confidentialité) : consultez-le dans la plateforme.']),
  ].filter((l) => l !== null).join('\n');
  try {
    await sendMail({ to, subject: `[CNPM] Nouvelle ${malfunction ? 'panne' : 'déclaration'} — ${payload.productLabel ?? payload.productRef}`, text: lines, attachments: files.length ? files.map((f) => ({ filename: f.name, content: f.data, contentType: f.mime })) : undefined });
    return 'sent';
  } catch {
    console.warn('[cnpmNotify] envoi impossible (contenu non journalisé)');
    return 'failed';
  }
}


// ── Pièces jointes : le fichier part par e-mail au CNPM (les noms/octets ne sont ni stockés ni envoyés à Audit) ──
export const ATTACHMENT_EXT: Record<string, { mime: string; magic: number[][] }> = {
  pdf: { mime: 'application/pdf', magic: [[0x25, 0x50, 0x44, 0x46]] },
  png: { mime: 'image/png', magic: [[0x89, 0x50, 0x4e, 0x47]] },
  jpg: { mime: 'image/jpeg', magic: [[0xff, 0xd8, 0xff]] },
  jpeg: { mime: 'image/jpeg', magic: [[0xff, 0xd8, 0xff]] },
};
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Nom sûr (jamais de chemin) + type vérifié sur le CONTENU, pas sur ce que déclare le client. */
export function checkAttachment(rawName: unknown, body: unknown): { ok: true; name: string; mime: string; data: Buffer } | { ok: false; message: string; status: number } {
  const base = String(rawName ?? '').split(/[\\/]/).pop()!.replace(/[^\p{L}\p{N}._ ()-]/gu, '_').trim().slice(0, 120);
  const ext = (base.split('.').pop() ?? '').toLowerCase();
  const spec = ATTACHMENT_EXT[ext];
  if (!base || !spec) return { ok: false, status: 400, message: 'Format refusé : PDF, JPG ou PNG seulement.' };
  if (!Buffer.isBuffer(body) || body.length === 0) return { ok: false, status: 400, message: 'Fichier vide.' };
  if (body.length > ATTACHMENT_MAX_BYTES) return { ok: false, status: 413, message: 'Fichier trop volumineux (10 Mo maximum).' };
  if (!spec.magic.some((m) => m.every((b, i) => body[i] === b))) return { ok: false, status: 400, message: 'Le contenu du fichier ne correspond pas à son format.' };
  return { ok: true, name: base, mime: spec.mime, data: body };
}

export async function sendAttachmentToCnpm(opts: { name: string; mime: string; data: Buffer; submissionId: string; productLabel: string }): Promise<'sent' | 'skipped' | 'failed'> {
  const to = cnpmNotifyAddress();
  if (!to || !mailConfigured()) return 'skipped';
  try {
    await sendMail({
      to,
      subject: `[CNPM] Pièce jointe — ${opts.productLabel} (réf. ${opts.submissionId})`,
      text: `Pièce jointe de la déclaration ${opts.submissionId} (${opts.productLabel}).\nFichier : ${opts.name} (${Math.max(1, Math.round(opts.data.length / 1024))} Ko).\n\nDocument pouvant contenir des données de santé : ne le transférez pas et supprimez-le après traitement.`,
      attachments: [{ filename: opts.name, content: opts.data, contentType: opts.mime }],
    });
    return 'sent';
  } catch {
    console.warn('[cnpmNotify] pièce jointe non envoyée (contenu non journalisé)');
    return 'failed';
  }
}

/**
 * Point d'entrée commun des routes de pièces jointes : joint le fichier au message retenu (un seul e-mail) ou, à défaut
 * (redémarrage, délai dépassé, total trop volumineux), l'envoie dans un message séparé.
 * `batch` = l'échec concerne le message groupé : TOUS les fichiers de la déclaration sont alors non transmis.
 */
export async function deliverAttachment(id: string, productLabel: string, f: MailFile): Promise<{ status: 'queued' | 'sent' | 'skipped' | 'failed'; batch: boolean }> {
  const r = await attachToHeld(id, f);
  if (r !== 'none') return { status: r, batch: r === 'failed' || r === 'skipped' };
  const status = await sendAttachmentToCnpm({ name: f.name, mime: f.mime, data: f.data, submissionId: id, productLabel });
  return { status, batch: false };
}
