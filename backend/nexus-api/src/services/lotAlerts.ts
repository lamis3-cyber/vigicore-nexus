/**
 * Alertes de retrait de lot (étape 3) — le Site RELIT le Logiciel (P1), aucune nouvelle porte d'entrée.
 *
 * Cadre de travail (À CONFIRMER auprès de l'encadrant / du MIPH ; ce n'est PAS une règle légale établie ici) :
 * quand un lot d'une commande Site passe à WITHDRAWN côté Logiciel, le demandeur et les admins ACTIFS de son
 * établissement sont alertés (in-app + e-mail si configuré).
 *
 * ⚠ PAS INSTANTANÉ : détection par relecture périodique (LOT_ALERTS_INTERVAL_MIN, 15 min par défaut) ; elle ne
 * remplace aucun canal officiel de rappel de lot.
 *
 * Données : seul le STATUT du lot est lu (lines[].lotStatus). Jamais de motif, de déclaration ni d'enquête, et rien
 * de ce contenu n'est écrit dans les logs (describeError uniquement).
 * Idempotence : clé unique (marketRequestId, productRef, lotNumber, event) -> 2 passes = 1 alerte.
 * Limite connue : un lot retiré, levé puis RETIRÉ À NOUVEAU ne produit pas de 3e alerte (une par événement et par lot).
 */
import type { AuditTransport } from '../lib/auditClient';
import { mailConfigured, sendMail } from '../lib/email';
import { describeError } from '../lib/safeLog';

export const LOT_EVENTS = ['WITHDRAWN', 'REINSTATED'] as const;
export type LotEvent = (typeof LOT_EVENTS)[number];
const ALERTABLE_STATUSES = ['CONFIRMED', 'DELIVERED'];
const MAX_CANDIDATES = 500;
const EMAIL_BATCH = 50;

/** Consigne affichée/envoyée. À confirmer (encadrant/MIPH) avant tout usage réel ; configurable : LOT_ALERT_INSTRUCTION. */
export const DEFAULT_LOT_INSTRUCTION = 'Ne distribuez plus ce lot et contactez le fabricant.';

export interface LotAlertConfig { enabled: boolean; recheckMs: number; batch: number; instruction: string; maxEmailAttempts: number }

export function lotAlertConfig(env: Record<string, string | undefined> = process.env): LotAlertConfig {
  const minutes = Number(env.LOT_ALERTS_INTERVAL_MIN);
  const batch = Number(env.LOT_ALERTS_BATCH);
  return {
    enabled: env.LOT_ALERTS_ENABLED !== 'false',
    recheckMs: (Number.isFinite(minutes) && minutes >= 1 ? minutes : 15) * 60_000,
    batch: Number.isFinite(batch) && batch >= 1 ? Math.min(Math.floor(batch), 100) : 20,
    instruction: (env.LOT_ALERT_INSTRUCTION ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, 300) || DEFAULT_LOT_INSTRUCTION,
    maxEmailAttempts: 5,
  };
}

export interface LotAlertDeps {
  db: any;
  audit: AuditTransport;
  now?: () => Date;
  env?: Record<string, string | undefined>;
  mail?: { configured: () => boolean; send: (m: { to: string; subject: string; text: string }) => Promise<unknown> };
}

export interface LotAlertPassResult { checked: number; created: number; reinstated: number; emailed: number; emailFailed: number; auditDown: boolean }

const day = (d: Date) => d.toISOString().slice(0, 10);
const clean = (s: unknown, max = 120) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);

/** Commande à relire ? Inconnue (jamais relue) ou sans lot connu : oui ; sinon au moins un lot non expiré. */
export function hasLiveLotOrUnknown(r: any, today: string): boolean {
  const lines = r?.payload?.confirmedLines;
  if (!Array.isArray(lines)) return true;
  const lots = lines.filter((l: any) => l?.lotNumber);
  if (!lots.length) return true;
  return lots.some((l: any) => !l.expiryDate || String(l.expiryDate).slice(0, 10) >= today);
}

/** Demandeur + admins ACTIFS (memberRole=ADMIN, status=ACTIVE) de l'établissement ; comptes désactivés exclus. */
async function resolveRecipients(db: any, r: any): Promise<{ id: string; email: string | null }[]> {
  const ids = new Set<string>([r.requesterUserId]);
  if (r.establishmentId) {
    const admins: any[] = await db.userEstablishment.findMany({ where: { establishmentId: r.establishmentId, memberRole: 'ADMIN', status: 'ACTIVE' }, select: { userId: true } });
    for (const a of admins) ids.add(a.userId);
  }
  const users: any[] = await db.user.findMany({ where: { id: { in: [...ids] }, deactivatedAt: null }, select: { id: true, email: true } });
  return users.map((u) => ({ id: u.id, email: u.email ?? null }));
}

async function raise(deps: Required<Pick<LotAlertDeps, 'db'>> & { mailOn: boolean; now: Date }, r: any, event: LotEvent, line: { productRef: string; productName: string; lotNumber: string }, manufacturer: string | null): Promise<boolean> {
  const { db, now } = deps;
  const key = { marketRequestId: r.id, productRef: line.productRef, lotNumber: line.lotNumber, event };
  if (await db.marketLotAlert.findFirst({ where: key })) return false;
  const recipients = await resolveRecipients(db, r);
  const emailInitial = event === 'WITHDRAWN' && deps.mailOn; // la levée n'est JAMAIS envoyée par e-mail
  try {
    await db.$transaction(async (tx: any) => {
      const a = await tx.marketLotAlert.create({
        data: { ...key, establishmentId: r.establishmentId ?? null, requesterUserId: r.requesterUserId, productName: line.productName, manufacturerName: manufacturer, detectedAt: now },
      });
      for (const u of recipients) {
        await tx.marketLotAlertRecipient.create({ data: { alertId: a.id, userId: u.id, emailStatus: emailInitial && u.email ? 'PENDING' : 'SKIPPED', createdAt: now } });
      }
    });
  } catch (err: any) {
    if (err?.code === 'P2002') return false; // une autre instance l'a créée entre-temps
    throw err;
  }
  return true;
}

async function detect(deps: LotAlertDeps, cfg: LotAlertConfig, now: Date, mailOn: boolean, out: LotAlertPassResult) {
  const db = deps.db;
  const rows: any[] = await db.marketRequest.findMany({
    where: { kind: 'ORDER', status: 'SENT', auditStatus: { in: ALERTABLE_STATUSES }, auditRef: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: MAX_CANDIDATES,
  });
  const today = day(now);
  const cands = rows.filter((r) => hasLiveLotOrUnknown(r, today));
  if (!cands.length) return;
  const watches: any[] = await db.marketLotWatch.findMany({ where: { marketRequestId: { in: cands.map((r) => r.id) } } });
  const last = new Map<string, number>(watches.map((w) => [w.marketRequestId, new Date(w.checkedAt).getTime()]));
  const due = cands
    .filter((r) => { const t = last.get(r.id); return t === undefined || now.getTime() - t >= cfg.recheckMs; })
    .sort((a, b) => (last.get(a.id) ?? 0) - (last.get(b.id) ?? 0)) // jamais relues d'abord, puis les plus anciennes
    .slice(0, cfg.batch);

  for (const r of due) {
    const res = await deps.audit({
      method: 'GET',
      path: `/nexus/v1/orders/${encodeURIComponent(r.auditRef)}`,
      scope: 'orders:read',
      reporterRef: r.requesterUserId, // filtre d'isolation côté Logiciel
    });
    if (res.kind !== 'http') { out.auditDown = true; break; } // Logiciel injoignable : on s'arrête, la prochaine passe réessaiera
    await db.marketLotWatch.upsert({ where: { marketRequestId: r.id }, create: { marketRequestId: r.id, checkedAt: now }, update: { checkedAt: now } });
    const order = res.data;
    if (res.status !== 200 || !Array.isArray(order?.lines)) continue;
    out.checked++;
    if (!ALERTABLE_STATUSES.includes(String(order.status))) continue; // annulée chez le fabricant : pas d'alerte
    // Liste blanche des champs conservés : tout champ inattendu envoyé par le Logiciel (ex. un motif) n'est jamais stocké.
    const lines = order.lines.slice(0, 20).map((l: any) => ({
      product: l?.product ?? null, reference: l?.reference ?? null, quantity: l?.quantity ?? null, unitPrice: l?.unitPrice ?? null,
      lotNumber: l?.lotNumber ?? null, expiryDate: l?.expiryDate ?? null, lotStatus: l?.lotStatus ?? null,
    }));
    // Garde confirmedLines à jour (y compris pour les commandes DELIVERED, que GET /requests ne relit plus) : alimente lotStatus du DTO.
    if (JSON.stringify(r.payload?.confirmedLines ?? null) !== JSON.stringify(lines)) {
      await db.marketRequest.update({ where: { id: r.id }, data: { payload: { ...(r.payload ?? {}), confirmedLines: lines } } });
    }
    const manufacturer = clean(order.manufacturer ?? r.manufacturerName) || null;
    for (const l of lines) {
      if (!l?.lotNumber) continue;
      const line = { productRef: clean(l.reference ?? l.product), productName: clean(l.product ?? l.reference), lotNumber: clean(l.lotNumber) };
      if (!line.productRef || !line.lotNumber) continue;
      const rctx = { db, mailOn, now };
      if (l.lotStatus === 'WITHDRAWN') {
        if (await raise(rctx, r, 'WITHDRAWN', line, manufacturer)) out.created++;
      } else if (l.lotStatus === 'ACTIVE') {
        const wasWithdrawn = await db.marketLotAlert.findFirst({ where: { marketRequestId: r.id, productRef: line.productRef, lotNumber: line.lotNumber, event: 'WITHDRAWN' } });
        if (wasWithdrawn && (await raise(rctx, r, 'REINSTATED', line, manufacturer))) out.reinstated++;
      }
    }
  }
}

const backoffMs = (attempt: number) => Math.min(5 * 60_000 * 2 ** (attempt - 1), 60 * 60_000); // 5, 10, 20, 40 min… plafond 1 h

export function lotAlertEmail(a: { productName: string; lotNumber: string; manufacturerName?: string | null }, instruction: string) {
  const product = clean(a.productName); const lot = clean(a.lotNumber); const maker = clean(a.manufacturerName);
  return {
    subject: `[VigiCore] Lot retiré : ${product} — lot ${lot}`.slice(0, 200),
    text: [
      `Le lot ${lot} du produit « ${product} »${maker ? ` (fabricant : ${maker})` : ''} figure dans une de vos commandes et est signalé comme retiré.`,
      '',
      instruction,
      '',
      'Consultez vos commandes sur VigiCore pour le détail. Cette alerte est indicative et n\'est pas instantanée.',
    ].join('\n'),
  };
}

async function sendPending(deps: LotAlertDeps, cfg: LotAlertConfig, now: Date, out: LotAlertPassResult) {
  const mail = deps.mail ?? { configured: () => mailConfigured(), send: sendMail };
  if (!mail.configured()) return; // les lignes PENDING restent en attente : jamais perdues
  const db = deps.db;
  const pending: any[] = await db.marketLotAlertRecipient.findMany({ where: { emailStatus: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 200 });
  const due = pending.filter((p) => !p.emailNextAttemptAt || new Date(p.emailNextAttemptAt).getTime() <= now.getTime()).slice(0, EMAIL_BATCH);
  for (const rec of due) {
    const [alert, user] = await Promise.all([
      db.marketLotAlert.findFirst({ where: { id: rec.alertId } }),
      db.user.findFirst({ where: { id: rec.userId }, select: { email: true, deactivatedAt: true } }),
    ]);
    if (!alert || alert.event !== 'WITHDRAWN' || !user?.email || user.deactivatedAt) {
      await db.marketLotAlertRecipient.update({ where: { id: rec.id }, data: { emailStatus: 'SKIPPED' } });
      continue;
    }
    try {
      await mail.send({ to: user.email, ...lotAlertEmail(alert, cfg.instruction) });
      await db.marketLotAlertRecipient.update({ where: { id: rec.id }, data: { emailStatus: 'SENT', emailSentAt: now, emailNextAttemptAt: null, emailLastError: null } });
      out.emailed++;
    } catch (err: any) {
      const attempts = rec.emailAttempts + 1;
      const final = attempts >= cfg.maxEmailAttempts;
      await db.marketLotAlertRecipient.update({
        where: { id: rec.id },
        data: { emailAttempts: attempts, emailStatus: final ? 'FAILED' : 'PENDING', emailNextAttemptAt: final ? null : new Date(now.getTime() + backoffMs(attempts)), emailLastError: typeof err?.code === 'string' ? err.code.slice(0, 40) : 'SEND_FAILED' },
      });
      out.emailFailed++;
    }
  }
}

/**
 * Une passe : détection puis envoi des e-mails en attente. Ne rejette JAMAIS (chaque phase est isolée) :
 * une panne du Logiciel ou de la base n'interrompt pas le balayage du serveur.
 */
export async function runLotAlertPass(deps: LotAlertDeps): Promise<LotAlertPassResult> {
  const out: LotAlertPassResult = { checked: 0, created: 0, reinstated: 0, emailed: 0, emailFailed: 0, auditDown: false };
  const cfg = lotAlertConfig(deps.env);
  if (!cfg.enabled) return out;
  const now = (deps.now ?? (() => new Date()))();
  const mailOn = (deps.mail?.configured ?? (() => mailConfigured()))();
  try { await detect(deps, cfg, now, mailOn, out); } catch (err) { console.error('[lotAlerts] detection failed:', describeError(err)); }
  try { await sendPending(deps, cfg, now, out); } catch (err) { console.error('[lotAlerts] email phase failed:', describeError(err)); }
  if (out.created || out.reinstated || out.emailed || out.emailFailed) console.info('[lotAlerts]', JSON.stringify({ created: out.created, reinstated: out.reinstated, emailed: out.emailed, emailFailed: out.emailFailed }));
  return out;
}
