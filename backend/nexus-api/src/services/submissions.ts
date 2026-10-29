/**
 * Envoi des déclarations du Site vers Audit — logique pure + outbox.
 *
 * Règle d'or (C1, DECISIONS_D1_D10.md) : on n'annonce JAMAIS un succès que
 * Audit n'a pas confirmé. La ligne ExternalSubmission est écrite d'abord ; le
 * statut RECEIVED n'est posé qu'après une réponse 200/201 d'Audit.
 *
 * Classement des réponses :
 *   200/201               -> RECEIVED
 *   422 NOT_ROUTABLE      -> NOT_ROUTABLE (brouillon conservé, raison d'Audit)
 *   400 / 409             -> REJECTED (définitif : renvoyer ne changera rien)
 *   401 / 403 / 503 / 5xx -> PENDING + nouvelle tentative (config ou panne côté Audit)
 *   aucune réponse        -> PENDING + nouvelle tentative
 *
 * Types seulement depuis @prisma/client : testable sans `prisma generate`.
 */
import type { PrismaClient } from '@prisma/client';
import type { AuditTransport } from '../lib/auditClient';

export const MAX_AUTO_ATTEMPTS = 12;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 15 * 60_000;

/** Délai avant que le balayage reprenne une ligne que l'envoi immédiat n'a pas finalisée (crash, coupure). */
export const FIRST_SWEEP_DELAY_MS = 60_000;

export type SubmissionKind = 'INCIDENT' | 'DEVICE_MALFUNCTION';
export type Severity = 'legere' | 'moderee' | 'grave';

export const MALFUNCTION_CONTEXTS = ['utilisation', 'demarrage', 'nettoyage', 'maintenance', 'transport'] as const;
export const MALFUNCTION_SYMPTOMS = ['arret', 'alarme', 'mesure', 'chauffe', 'bruit', 'dommage'] as const;
export const MALFUNCTION_ACTIONS = ['hors_service', 'remplace', 'maintenance', 'aucune'] as const;
export const DEVICE_STATES = ['en_service', 'hors_service', 'quarantaine'] as const;
export const MALFUNCTION_IMPACTS = ['none', 'delay', 'exposed', 'injury'] as const;
export type MalfunctionImpact = (typeof MALFUNCTION_IMPACTS)[number];

/** Gravité minimale imposée par l'impact (même règle qu'Audit : jamais de déclassement). */
export const IMPACT_SEVERITY_FLOOR: Record<MalfunctionImpact, Severity | null> = { none: null, delay: null, exposed: 'moderee', injury: 'grave' };
export const IMPACT_DEFAULT_SEVERITY: Record<MalfunctionImpact, Severity> = { none: 'legere', delay: 'moderee', exposed: 'moderee', injury: 'grave' };
/** Exposition ou blessure = incident de matériovigilance (jamais un simple suivi interne). */
export const isEscalatedImpact = (i: MalfunctionImpact) => i === 'exposed' || i === 'injury';
const SEVERITY_RANK: Record<Severity, number> = { legere: 0, moderee: 1, grave: 2 };

export interface DeviceDetail {
  name: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  inventoryNumber?: string;
  udi?: string;
  lastMaintenanceDate?: string;
}
export interface MalfunctionDetail {
  occurredOn: string;
  occurredAt?: string;
  context: (typeof MALFUNCTION_CONTEXTS)[number];
  symptoms?: (typeof MALFUNCTION_SYMPTOMS)[number][];
  errorCode?: string;
  actionTaken?: (typeof MALFUNCTION_ACTIONS)[number];
  maintenanceTicket?: string;
  deviceState: (typeof DEVICE_STATES)[number];
  impact: MalfunctionImpact;
}

export interface SubmissionPayload {
  productRef: string;
  description: string;
  lotNumber?: string;
  manufacturerReference?: string;
  declaredSeverity?: Severity;
  /** Absent = INCIDENT (lignes antérieures à l'extension « panne »). */
  kind?: SubmissionKind;
  device?: DeviceDetail;
  malfunction?: MalfunctionDetail;
  /** AFFICHAGE SEULEMENT (nom du produit du catalogue) : jamais envoyé à Audit, jamais utilisé pour le routage. */
  productLabel?: string;
}

export interface Reporter {
  id: string;
  role: string;
  displayName: string;
}

export interface SubmissionDeps {
  db: PrismaClient;
  audit: AuditTransport;
  now?: () => Date;
}

export function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), BACKOFF_MAX_MS);
}

/** Contrat Annexe A : minimum de données personnelles (D8 OUVERTE) — nom
 *  affiché et rôle seulement ; ni e-mail, ni données patient. */
export function buildAuditBody(payload: SubmissionPayload, reporter: Reporter) {
  const isMalfunction = payload.kind === 'DEVICE_MALFUNCTION';
  return {
    ...(isMalfunction ? { kind: 'DEVICE_MALFUNCTION' as const } : {}),
    productRef: payload.productRef,
    description: payload.description,
    ...(payload.lotNumber ? { lotNumber: payload.lotNumber } : {}),
    ...(payload.manufacturerReference ? { manufacturerReference: payload.manufacturerReference } : {}),
    ...(payload.declaredSeverity ? { declaredSeverity: payload.declaredSeverity } : {}),
    ...(isMalfunction ? { device: payload.device, malfunction: payload.malfunction } : {}),
    reporter: { role: reporter.role, displayName: reporter.displayName },
  };
}

/** Envoie UNE soumission et enregistre le résultat. Sûr à rappeler : Audit est
 *  idempotent sur `submission.id`. */
export async function sendSubmission(deps: SubmissionDeps, submissionId: string, reporter: Reporter) {
  const now = (deps.now ?? (() => new Date()))();
  const s = await deps.db.externalSubmission.findUnique({ where: { id: submissionId } });
  if (!s) return null;
  if (s.status === 'RECEIVED') return s;

  const result = await deps.audit({
    method: 'POST',
    path: '/nexus/v1/declarations',
    scope: 'intake:write',
    reporterRef: reporter.id,
    idempotencyKey: s.id,
    body: buildAuditBody(s.payload as unknown as SubmissionPayload, reporter),
  });

  const attempts = s.attempts + 1;
  if (result.kind === 'http' && (result.status === 201 || result.status === 200) && result.data?.auditDeclarationId) {
    return deps.db.externalSubmission.update({
      where: { id: s.id },
      data: {
        status: 'RECEIVED',
        attempts,
        auditDeclarationId: String(result.data.auditDeclarationId),
        routingBasis: result.data.routingBasis ?? null,
        receivedAt: result.data.receivedAt ? new Date(result.data.receivedAt) : now,
        failureReason: null,
        lastError: null,
        nextAttemptAt: null,
      },
    });
  }
  if (result.kind === 'http' && result.status === 422 && result.data?.error === 'NOT_ROUTABLE') {
    return deps.db.externalSubmission.update({
      where: { id: s.id },
      data: { status: 'NOT_ROUTABLE', attempts, failureReason: String(result.data.reason ?? 'NOT_ROUTABLE'), lastError: null, nextAttemptAt: null },
    });
  }
  if (result.kind === 'http' && (result.status === 400 || result.status === 409)) {
    return deps.db.externalSubmission.update({
      where: { id: s.id },
      data: { status: 'REJECTED', attempts, failureReason: String(result.data?.error ?? `HTTP_${result.status}`), lastError: result.data?.message ? String(result.data.message).slice(0, 500) : null, nextAttemptAt: null },
    });
  }

  // Tout le reste : envoi NON confirmé -> on garde et on réessaiera.
  const lastError = result.kind === 'network' ? result.error : `HTTP_${result.status}`;
  return deps.db.externalSubmission.update({
    where: { id: s.id },
    data: {
      // Automatic retries exhausted -> FAILED (actionable: the author can re-send manually), never an endless PENDING.
      status: attempts >= MAX_AUTO_ATTEMPTS ? 'FAILED' : 'PENDING',
      attempts,
      lastError,
      failureReason: attempts >= MAX_AUTO_ATTEMPTS ? 'AUDIT_UNAVAILABLE' : null,
      nextAttemptAt: attempts >= MAX_AUTO_ATTEMPTS ? null : new Date(now.getTime() + backoffMs(attempts)),
    },
  });
}

/** Reprise automatique des PENDING arrivés à échéance (appelée par un timer). */
export async function retryDueSubmissions(deps: SubmissionDeps, limit = 20): Promise<number> {
  const now = (deps.now ?? (() => new Date()))();
  const due = await deps.db.externalSubmission.findMany({
    where: { status: 'PENDING', nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
  });
  let sent = 0;
  for (const s of due) {
    const user = await deps.db.user.findUnique({ where: { id: s.authorUserId }, select: { id: true, role: true, displayName: true } });
    if (!user) continue;
    await sendSubmission(deps, s.id, { id: user.id, role: String(user.role), displayName: user.displayName });
    sent++;
  }
  return sent;
}

// ── Validation de l'entrée du Site ────────────────────────────────

const SEVERITIES = new Set(['legere', 'moderee', 'grave']);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const todayUtc = () => new Date().toISOString().slice(0, 10);
function isRealDate(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
/** Un jour de tolérance : le navigateur peut être en avance sur UTC. */
function isNotFuture(v: string): boolean {
  const limit = new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10);
  return v <= limit;
}

export function parseDeviceAndMalfunction(body: any, opts: { allowNoIdentifier?: boolean } = {}): { ok: true; device: DeviceDetail; malfunction: MalfunctionDetail } | { ok: false; message: string } {
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : undefined);
  const present = (v: unknown) => v !== undefined && v !== null && v !== '';
  const d = body.device;
  const m = body.malfunction;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, message: 'device is required for a device malfunction.' };
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { ok: false, message: 'malfunction is required for a device malfunction.' };

  const device: DeviceDetail = { name: str(d.name, 200) as string };
  if (!device.name) return { ok: false, message: 'device.name is required (max 200 characters).' };
  for (const [key, max] of [['brand', 200], ['model', 200], ['serialNumber', 100], ['inventoryNumber', 100], ['udi', 200]] as const) {
    if (present(d[key])) {
      const v = str(d[key], max);
      if (!v) return { ok: false, message: `device.${key} is invalid (max ${max} characters).` };
      (device as any)[key] = v;
    }
  }
  if (!opts.allowNoIdentifier && !device.serialNumber && !device.inventoryNumber && !device.udi) {
    return { ok: false, message: 'device: at least one of serialNumber, inventoryNumber, udi is required.' };
  }
  if (present(d.lastMaintenanceDate)) {
    if (typeof d.lastMaintenanceDate !== 'string' || !isRealDate(d.lastMaintenanceDate)) return { ok: false, message: 'device.lastMaintenanceDate must be a valid YYYY-MM-DD date.' };
    device.lastMaintenanceDate = d.lastMaintenanceDate;
  }

  if (typeof m.occurredOn !== 'string' || !isRealDate(m.occurredOn)) return { ok: false, message: 'malfunction.occurredOn must be a valid YYYY-MM-DD date.' };
  if (!isNotFuture(m.occurredOn)) return { ok: false, message: 'malfunction.occurredOn cannot be in the future.' };
  if (!(MALFUNCTION_CONTEXTS as readonly string[]).includes(m.context)) return { ok: false, message: 'malfunction.context is invalid.' };
  if (!(DEVICE_STATES as readonly string[]).includes(m.deviceState)) return { ok: false, message: 'malfunction.deviceState is invalid.' };
  if (!(MALFUNCTION_IMPACTS as readonly string[]).includes(m.impact)) return { ok: false, message: 'malfunction.impact is invalid.' };
  const malfunction: MalfunctionDetail = { occurredOn: m.occurredOn, context: m.context, deviceState: m.deviceState, impact: m.impact };

  if (present(m.occurredAt)) {
    if (typeof m.occurredAt !== 'string' || !TIME_RE.test(m.occurredAt)) return { ok: false, message: 'malfunction.occurredAt must be HH:mm.' };
    malfunction.occurredAt = m.occurredAt;
  }
  if (m.symptoms !== undefined && m.symptoms !== null) {
    if (!Array.isArray(m.symptoms) || m.symptoms.length > MALFUNCTION_SYMPTOMS.length || !m.symptoms.every((x: unknown) => (MALFUNCTION_SYMPTOMS as readonly string[]).includes(x as string))) {
      return { ok: false, message: 'malfunction.symptoms is invalid.' };
    }
    malfunction.symptoms = Array.from(new Set(m.symptoms)) as MalfunctionDetail['symptoms'];
  }
  if (present(m.errorCode)) {
    const v = str(m.errorCode, 100);
    if (!v) return { ok: false, message: 'malfunction.errorCode is invalid (max 100 characters).' };
    malfunction.errorCode = v;
  }
  if (present(m.actionTaken)) {
    if (!(MALFUNCTION_ACTIONS as readonly string[]).includes(m.actionTaken)) return { ok: false, message: 'malfunction.actionTaken is invalid.' };
    malfunction.actionTaken = m.actionTaken;
  }
  if (present(m.maintenanceTicket)) {
    const v = str(m.maintenanceTicket, 100);
    if (!v) return { ok: false, message: 'malfunction.maintenanceTicket is invalid (max 100 characters).' };
    malfunction.maintenanceTicket = v;
  }
  return { ok: true, device, malfunction };
}

export function parseSubmissionPayload(
  body: any
): { ok: true; payload: SubmissionPayload; clientRequestId?: string } | { ok: false; message: string } {
  if (!body || typeof body !== 'object') return { ok: false, message: 'Body must be a JSON object.' };
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : undefined);

  const productRef = str(body.productRef, 100);
  if (!productRef) return { ok: false, message: 'productRef is required (choose a product from the catalogue).' };
  const description = str(body.description, 10_000);
  if (!description) return { ok: false, message: 'description is required (max 10 000 characters).' };

  let kind: SubmissionKind = 'INCIDENT';
  if (body.kind !== undefined && body.kind !== null && body.kind !== '') {
    if (body.kind !== 'INCIDENT' && body.kind !== 'DEVICE_MALFUNCTION') return { ok: false, message: 'kind must be INCIDENT or DEVICE_MALFUNCTION.' };
    kind = body.kind;
  }

  const payload: SubmissionPayload = { productRef, description };
  if (kind === 'DEVICE_MALFUNCTION') payload.kind = 'DEVICE_MALFUNCTION';
  else if (body.device !== undefined || body.malfunction !== undefined) return { ok: false, message: 'device and malfunction are only allowed for a device malfunction.' };
  if (body.lotNumber !== undefined && body.lotNumber !== '') {
    const lot = str(body.lotNumber, 100);
    if (!lot) return { ok: false, message: 'lotNumber is invalid.' };
    payload.lotNumber = lot;
  }
  if (body.manufacturerReference !== undefined && body.manufacturerReference !== '') {
    const m = str(body.manufacturerReference, 200);
    if (!m) return { ok: false, message: 'manufacturerReference is invalid.' };
    payload.manufacturerReference = m;
  }
  if (body.declaredSeverity !== undefined && body.declaredSeverity !== '') {
    if (!SEVERITIES.has(body.declaredSeverity)) return { ok: false, message: 'declaredSeverity must be legere, moderee or grave.' };
    payload.declaredSeverity = body.declaredSeverity;
  }
  if (body.productLabel !== undefined && body.productLabel !== '') {
    const l = str(body.productLabel, 200);
    if (!l) return { ok: false, message: 'productLabel is invalid.' };
    payload.productLabel = l;
  }

  if (kind === 'DEVICE_MALFUNCTION') {
    const dm = parseDeviceAndMalfunction(body);
    if (!dm.ok) return dm;
    payload.device = dm.device;
    payload.malfunction = dm.malfunction;
    // Pas de déclassement silencieux d'un incident de matériovigilance.
    const floor = IMPACT_SEVERITY_FLOOR[dm.malfunction.impact];
    if (payload.declaredSeverity && floor && SEVERITY_RANK[payload.declaredSeverity] < SEVERITY_RANK[floor]) {
      return { ok: false, message: `impact "${dm.malfunction.impact}" requires declaredSeverity of at least "${floor}".` };
    }
    if (!payload.declaredSeverity) payload.declaredSeverity = IMPACT_DEFAULT_SEVERITY[dm.malfunction.impact];
  }

  let clientRequestId: string | undefined;
  if (body.clientRequestId !== undefined) {
    clientRequestId = str(body.clientRequestId, 100);
    if (!clientRequestId) return { ok: false, message: 'clientRequestId is invalid.' };
  }
  return { ok: true, payload, clientRequestId };
}

/** Contenu identique ? (même clientRequestId rejoué avec un autre contenu = conflit,
 *  jamais une réponse silencieuse qui ignorerait ce que l'utilisateur vient de modifier.) */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}
export const samePayload = (a: unknown, b: unknown): boolean => stable(a) === stable(b);

// ── Vue renvoyée au navigateur (aucun champ interne) ──────────────

// ── Vue renvoyée au navigateur (aucun champ interne) ──────────────

export function toSubmissionDto(s: any) {
  const p = (s.payload ?? {}) as Partial<SubmissionPayload>;
  const pending = s.status === 'PENDING';
  return {
    id: s.id,
    status: s.status as 'PENDING' | 'RECEIVED' | 'NOT_ROUTABLE' | 'REJECTED' | 'FAILED',
    createdAt: s.createdAt,
    receivedAt: s.receivedAt ?? null,
    auditDeclarationId: s.auditDeclarationId ?? null,
    failureReason: s.failureReason ?? null,
    // Libellé honnête : PENDING = enregistrée sur le Site, PAS encore reçue.
    description: (s.payload as any)?.description ?? '',
    productRef: (s.payload as any)?.productRef ?? '',
    kind: (p.kind === 'DEVICE_MALFUNCTION' ? 'DEVICE_MALFUNCTION' : 'INCIDENT') as SubmissionKind,
    productLabel: p.productLabel ?? null,
    lotNumber: p.lotNumber ?? null,
    declaredSeverity: p.declaredSeverity ?? null,
    device: p.device ?? null,
    malfunction: p.malfunction ?? null,
    // File d'envoi, sans exposer ni compteur ni message d'erreur brut.
    retrying: pending && !!s.nextAttemptAt,
    autoRetryExhausted: pending && !s.nextAttemptAt && (s.attempts ?? 0) >= MAX_AUTO_ATTEMPTS,
  };
}
