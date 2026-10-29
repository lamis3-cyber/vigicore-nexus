import express, { Router } from 'express';
import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../lib/asyncHandler';
import { callAudit, auditConfigured } from '../lib/auditClient';
import {
  parseSubmissionPayload,
  sendSubmission,
  toSubmissionDto,
  FIRST_SWEEP_DELAY_MS,
} from '../services/submissions';
import { scheduleCnpmNotification, parseNotifyContext, checkAttachment, deliverAttachment, cnpmNotifyAddress, ATTACHMENT_MAX_BYTES } from '../services/cnpmNotify';
import { mailConfigured } from '../lib/email';
import { isStorageEnabled } from '../services/attachmentStore';

/**
 * Déclarations du Site -> VigiCore Audit (la vigilance de l'organisation
 * destinataire), + relais de messages avec cette vigilance.
 *
 *   POST /api/declarations                    crée + envoie (outbox, idempotent)
 *   GET  /api/declarations                    mes déclarations
 *   GET  /api/declarations/:id                détail + statut public côté Audit
 *   POST /api/declarations/:id/retry          renvoyer (PENDING / NOT_ROUTABLE)
 *   GET  /api/declarations/:id/messages       ?since=ISO
 *   POST /api/declarations/:id/messages       en-tête Idempotency-Key obligatoire
 *   GET  /api/catalogue/products?q=           produits déclarables (approuvés)
 *
 * Portée : l'auteur (req.user.id) ne voit QUE ses déclarations. L'organisation
 * destinataire n'est JAMAIS lue dans la requête : Audit la détermine.
 * Limite connue : pas encore de visibilité « toute l'organisation » (ex. Vigilance
 * Qualité d'un hôpital) — à définir avec §0.1/§0.2 de domain/declaration.js.
 */
export const declarationsRouter = Router();
export const catalogueRouter = Router();
declarationsRouter.use(requireAuth);
catalogueRouter.use(requireAuth);

const fail = (res: Response, status: number, message: string, code?: string, extra: object = {}) =>
  res.status(status).json({ success: false, message, ...(code ? { code } : {}), ...extra });

const IDEMPOTENCY_RE = /^[A-Za-z0-9._:-]{8,128}$/;
const deps = () => ({ db: prisma, audit: callAudit });

async function loadOwn(id: string, userId: string) {
  return prisma.externalSubmission.findFirst({ where: { id, authorUserId: userId } });
}

const reporterOf = (user: { id: string; role: string; displayName: string }) => ({
  id: user.id,
  role: String(user.role),
  displayName: user.displayName,
});

/** Réponse HTTP honnête selon l'état FINAL de l'envoi. */
function respondForSubmission(res: Response, s: any) {
  const submission = toSubmissionDto(s);
  switch (s.status) {
    case 'RECEIVED':
      return res.status(201).json({ success: true, submission });
    case 'PENDING':
      // Enregistrée mais PAS confirmée par Audit : pas de succès annoncé.
      return res.status(202).json({
        success: true,
        submission,
        message: "Enregistrée sur le Site, pas encore reçue par la vigilance. Nouvel envoi automatique en cours.",
      });
    case 'FAILED':
      return fail(res, 502, "La vigilance est injoignable : la déclaration est enregistrée sur le Site mais n'a PAS été reçue. Réessayez plus tard.", 'AUDIT_UNAVAILABLE', { submission });
    case 'NOT_ROUTABLE':
      return fail(res, 422, "Aucune organisation ne peut recevoir cette déclaration pour le moment.", 'NOT_ROUTABLE', {
        reason: s.failureReason,
        submission,
      });
    default:
      // Dit POURQUOI (code et message d'Audit, bornés) : un « refusée » sans raison ne permet pas de corriger.
      return fail(res, 400, `La déclaration a été refusée par la vigilance${s.failureReason ? ` (${String(s.failureReason).slice(0, 80)})` : ''}${s.lastError ? ` : ${String(s.lastError).slice(0, 300)}` : ''}.`, s.failureReason ?? 'REJECTED', { submission });
  }
}

// Destinations RÉELLEMENT disponibles pour ce compte (vérité du serveur, jamais devinée par l'interface).
// ⚠ déclaré AVANT '/:id'.
declarationsRouter.get('/destinations', asyncHandler(async (req, res) => {
  const user = req.user!;
  let org: { id: string; name: string } | null = null;
  if (user.activeEstablishmentId) {
    const e = await prisma.establishment.findUnique({ where: { id: user.activeEstablishmentId } });
    if (e && !e.isSystemReserved) org = { id: e.id, name: e.name };
  }
  res.json({ success: true, destinations: {
    cnpm: !!cnpmNotifyAddress() && mailConfigured(),
    org,
    manufacturer: auditConfigured(),
    storage: isStorageEnabled(),
  } });
}));

async function linkToNexusRecord(recordId: unknown, userId: string, submissionId: string) {
  if (typeof recordId !== 'string' || !/^[A-Za-z0-9_-]{6,80}$/.test(recordId)) return;
  try {
    const rec = await prisma.declaration.findFirst({ where: { id: recordId, authorUserId: userId } });
    if (!rec || !Array.isArray(rec.payload)) return;
    // L'identifiant de la ligne MANUFACTURER est celui de l'envoi : son état réel est relu à chaque lecture.
    await (prisma as any).declarationDelivery.create({ data: { id: submissionId, declarationId: rec.id, destination: 'MANUFACTURER', status: 'PENDING' } });
  } catch { /* lien informatif uniquement : jamais bloquant (déjà lié, migration absente…) */ }
}

declarationsRouter.post('/', asyncHandler(async (req, res) => {
  const user = req.user!;
  const parsed = parseSubmissionPayload(req.body);
  if (!parsed.ok) return fail(res, 400, parsed.message, 'VALIDATION_ERROR');

  // Anti double-clic : même auteur + même clientRequestId => on renvoie la ligne existante.
  if (parsed.clientRequestId) {
    const existing = await prisma.externalSubmission.findUnique({
      where: { authorUserId_clientRequestId: { authorUserId: user.id, clientRequestId: parsed.clientRequestId } },
    });
    if (existing) return respondForSubmission(res, existing);
  }

  let created;
  try {
    created = await prisma.externalSubmission.create({
      data: {
        authorUserId: user.id,
        clientRequestId: parsed.clientRequestId ?? null,
        payload: parsed.payload as any,
        // Outbox durable : si le process s'arrête avant l'envoi immédiat, le balayage reprend la ligne.
        nextAttemptAt: new Date(Date.now() + FIRST_SWEEP_DELAY_MS),
        // Si Audit n'est pas configuré, on garde quand même la déclaration.
        ...(auditConfigured() ? {} : { lastError: 'AUDIT_NOT_CONFIGURED' }),
      },
    });
  } catch (err: any) {
    if (err?.code === 'P2002' && parsed.clientRequestId) {
      const winner = await prisma.externalSubmission.findUnique({
        where: { authorUserId_clientRequestId: { authorUserId: user.id, clientRequestId: parsed.clientRequestId } },
      });
      if (winner) return respondForSubmission(res, winner);
    }
    throw err;
  }

  // Lien informatif avec l'enregistrement Nexus de la même déclaration (même auteur) : l'établissement voit si le fabricant
  // a été informé et l'état réel de la transmission. Aucune donnée n'est ajoutée à ce qui part vers Audit.
  await linkToNexusRecord(req.body?.nexusRecordId, user.id, created.id);

  // Notification e-mail CNPM : uniquement à la 1re création (pas sur un rejeu idempotent), sans attendre ni bloquer.
  // `notifyCnpm: false` : le CNPM est géré à part (enregistrement Nexus + destination choisie) ; cette voie ne sert alors qu'au fabricant.
  if (req.body?.notifyCnpm !== false) {
    void Promise.resolve(scheduleCnpmNotification(parsed.payload, user.role, created.id, parseNotifyContext(req.body?.notifyContext))).catch(() => undefined);
  }
  const sent = await sendSubmission(deps(), created.id, reporterOf(user));
  return respondForSubmission(res, sent ?? created);
}));

// Pièce jointe : corps = octets du fichier (application/octet-stream), nom dans l'en-tête X-File-Name (encodé URI).
// Le fichier est transmis par e-mail au CNPM ; il n'est PAS stocké ici et n'est PAS envoyé à Audit.
declarationsRouter.post('/:id/attachments', express.raw({ type: () => true, limit: ATTACHMENT_MAX_BYTES + 1024 }), asyncHandler(async (req, res) => {
  const user = req.user!;
  const s = await loadOwn(String(req.params.id), user.id);
  if (!s) return fail(res, 404, 'Not found.');
  let name = '';
  try { name = decodeURIComponent(String(req.header('x-file-name') ?? '')); } catch { /* nom invalide : refusé ci-dessous */ }
  const chk = checkAttachment(name, req.body);
  if (!chk.ok) return fail(res, chk.status, chk.message, 'ATTACHMENT_REFUSED');
  const p = (s.payload ?? {}) as any;
  const { status, batch } = await deliverAttachment(s.id, p.productLabel ?? p.productRef ?? '—', { name: chk.name, mime: chk.mime, data: chk.data });
  if (status === 'sent' || status === 'queued') return res.json({ success: true, status, name: chk.name });
  return res.status(status === 'skipped' ? 503 : 502).json({
    success: false, status, name: chk.name, batch,
    message: status === 'skipped' ? "L'envoi par e-mail au CNPM n'est pas configuré : la pièce jointe n'a PAS été transmise." : "L'e-mail n'a pas pu être envoyé : la pièce jointe n'a PAS été transmise.",
  });
}));

declarationsRouter.get('/', asyncHandler(async (req, res) => {
  const rows = await prisma.externalSubmission.findMany({
    where: { authorUserId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ success: true, submissions: rows.map(toSubmissionDto) });
}));

declarationsRouter.get('/:id', asyncHandler(async (req, res) => {
  const user = req.user!;
  const s = await loadOwn(String(req.params.id), user.id);
  if (!s) return fail(res, 404, 'Not found.');
  let audit: unknown = null;
  let auditUnavailable = false;
  if (s.status === 'RECEIVED' && s.auditDeclarationId) {
    const r = await callAudit({
      method: 'GET',
      path: `/nexus/v1/declarations/${encodeURIComponent(s.auditDeclarationId)}`,
      scope: 'intake:read',
      reporterRef: user.id,
    });
    if (r.kind === 'http' && r.status === 200) audit = r.data;
    else auditUnavailable = true;
  }
  res.json({ success: true, submission: toSubmissionDto(s), audit, auditUnavailable });
}));

declarationsRouter.post('/:id/retry', asyncHandler(async (req, res) => {
  const user = req.user!;
  const s = await loadOwn(String(req.params.id), user.id);
  if (!s) return fail(res, 404, 'Not found.');
  if (s.status !== 'PENDING' && s.status !== 'NOT_ROUTABLE' && s.status !== 'FAILED') {
    return fail(res, 409, 'Only a pending, failed or not-routable declaration can be re-sent.', 'NOT_RETRYABLE');
  }
  const sent = await sendSubmission(deps(), s.id, reporterOf(user));
  return respondForSubmission(res, sent ?? s);
}));

async function requireReceived(req: any, res: Response) {
  const s = await loadOwn(String(req.params.id), req.user!.id);
  if (!s) {
    fail(res, 404, 'Not found.');
    return null;
  }
  if (s.status !== 'RECEIVED' || !s.auditDeclarationId) {
    fail(res, 409, "La vigilance n'a pas encore reçu cette déclaration.", 'NOT_RECEIVED');
    return null;
  }
  return s;
}

function relayFailure(res: Response, r: { kind: 'http'; status: number; data: any } | { kind: 'network'; error: string }) {
  // Journal sans contenu métier : nature, statut et CODE d'erreur seulement (jamais de secret ni de donnée déclarée).
  //   network : AUDIT_NOT_CONFIGURED (AUDIT_BASE_URL vide / secret < 32 car.) | NETWORK_ERROR (logiciel injoignable) | TIMEOUT
  //   http    : 401 (secret différent des deux côtés) | 503 (secret absent côté logiciel) | …
  console.warn('[relayFailure]', r.kind === 'http'
    ? { kind: r.kind, status: r.status, error: typeof r.data?.error === 'string' ? r.data.error : undefined }
    : { kind: r.kind, error: r.error });
  if (r.kind === 'network') return fail(res, 502, 'Le service de vigilance est momentanément injoignable.', 'AUDIT_UNAVAILABLE');
  if ([400, 404, 409].includes(r.status)) return fail(res, r.status, r.data?.message ?? 'Request refused.', r.data?.error);
  return fail(res, 502, 'Le service de vigilance est momentanément indisponible.', 'AUDIT_UNAVAILABLE');
}

declarationsRouter.get('/:id/messages', asyncHandler(async (req, res) => {
  const s = await requireReceived(req, res);
  if (!s) return;
  const since = typeof req.query.since === 'string' ? `?since=${encodeURIComponent(req.query.since)}` : '';
  const r = await callAudit({
    method: 'GET',
    path: `/nexus/v1/declarations/${encodeURIComponent(s.auditDeclarationId!)}/messages${since}`,
    scope: 'intake:read',
    reporterRef: req.user!.id,
  });
  if (r.kind === 'http' && r.status === 200) return res.json({ success: true, messages: r.data?.messages ?? [] });
  return relayFailure(res, r);
}));

declarationsRouter.post('/:id/messages', asyncHandler(async (req, res) => {
  const key = req.get('idempotency-key');
  if (!key || !IDEMPOTENCY_RE.test(key)) {
    return fail(res, 400, 'Idempotency-Key header is required (8-128 chars).', 'VALIDATION_ERROR');
  }
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  if (!content || content.length > 4000) return fail(res, 400, 'content is required (max 4000 characters).', 'VALIDATION_ERROR');

  const s = await requireReceived(req, res);
  if (!s) return;
  const r = await callAudit({
    method: 'POST',
    path: `/nexus/v1/declarations/${encodeURIComponent(s.auditDeclarationId!)}/messages`,
    scope: 'intake:write',
    reporterRef: req.user!.id,
    idempotencyKey: key,
    body: { content },
  });
  if (r.kind === 'http' && (r.status === 201 || r.status === 200)) return res.status(r.status).json({ success: true, message: r.data });
  return relayFailure(res, r);
}));

catalogueRouter.get('/products', asyncHandler(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  if (q.trim().length < 2) return fail(res, 400, 'q must contain at least 2 characters.', 'VALIDATION_ERROR');
  const r = await callAudit({
    method: 'GET',
    path: `/nexus/v1/catalogue/products?q=${encodeURIComponent(q.trim())}`,
    scope: 'catalogue:read',
    reporterRef: req.user!.id,
  });
  if (r.kind === 'http' && r.status === 200) return res.json({ success: true, products: r.data?.products ?? [] });
  return relayFailure(res, r);
}));
