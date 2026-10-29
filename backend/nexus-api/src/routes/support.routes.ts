import { Router } from 'express';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../lib/asyncHandler';
import { callAudit } from '../lib/auditClient';
import { prisma } from '../lib/prisma';

/**
 * Support client : un utilisateur du Site écrit au SUPPORT d'un laboratoire (compte du logiciel Audit).
 *
 *   GET  /api/support/organizations?q=     laboratoires joignables (au moins un SUPPORT actif dans Audit)
 *   GET  /api/support/threads              mes conversations de support
 *   POST /api/support/threads              { organizationRef, topic, message }   (Idempotency-Key conseillé)
 *   GET  /api/support/threads/:id/messages ?since=ISO
 *   POST /api/support/threads/:id/messages { content }                           (Idempotency-Key conseillé)
 *
 * Le fil vit dans Audit ; ce routeur ne fait que relayer (backend -> backend, JWT 60 s, scope support:use).
 * L'identité du client = req.user.id, signée par ce serveur : jamais lue dans le corps ou un en-tête.
 * Les PATIENTS n'y ont pas accès (le Site n'est pas un annuaire de patients vers les laboratoires, D8).
 * Les commandes de produits ne passent PAS par ici : elles restent sur la page /services.
 * Sans Idempotency-Key fourni par le navigateur, une clé aléatoire est générée : le renvoi automatique
 * d'une requête réseau perdue peut alors créer un doublon ; le navigateur DOIT envoyer la même clé à chaque renvoi.
 */
export const supportRouter = Router();
supportRouter.use(requireAuth);
supportRouter.use((req, res, next) => {
  if (req.user!.role === 'PATIENT') return fail(res, 403, "Le support laboratoire n'est pas disponible pour ce type de compte.", 'FORBIDDEN');
  next();
});

const fail = (res: Response, status: number, message: string, code?: string) =>
  res.status(status).json({ success: false, message, ...(code ? { code } : {}) });

const KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;
const TOPICS = ['DEVICE_USAGE', 'TECHNICAL_ISSUE', 'URGENT_FAILURE', 'OTHER'];


/**
 * Qui écrit ? Identité PROFESSIONNELLE minimale transmise au support du laboratoire, pour qu'il
 * distingue ses interlocuteurs : nom affiché, rôle, établissement actif. JAMAIS d'e-mail ni de
 * téléphone. Elle vient de la session (req.user), jamais du corps de la requête : le navigateur
 * ne peut pas se faire passer pour quelqu'un d'autre.
 */
async function clientIdentity(req: { user?: { displayName: string; role: string; activeEstablishmentId: string | null } | null }) {
  const u = req.user!;
  let organization: string | undefined;
  if (u.activeEstablishmentId) {
    try {
      const e = await prisma.establishment.findUnique({
        where: { id: u.activeEstablishmentId },
        select: { name: true, isSystemReserved: true },
      });
      if (e && !e.isSystemReserved) organization = e.name.slice(0, 120);
    } catch {
      /* identité partielle plutôt qu'un échec d'envoi */
    }
  }
  return { name: String(u.displayName ?? '').trim().slice(0, 80) || undefined, role: String(u.role ?? '').slice(0, 40) || undefined, organization };
}

function keyOf(raw: string | undefined): string | null {
  if (raw === undefined) return randomUUID();
  return KEY_RE.test(raw) ? raw : null;
}

function relayFailure(res: Response, r: { kind: 'http'; status: number; data: any } | { kind: 'network'; error: string }) {
  console.warn('[support.relayFailure]', JSON.stringify({ kind: r.kind, status: (r as any).status, error: (r as any).data?.error ?? (r as any).error }));
  if (r.kind === 'network') return fail(res, 502, 'Le service du laboratoire est momentanément injoignable.', 'AUDIT_UNAVAILABLE');
  if (r.status === 422) return fail(res, 422, "Ce laboratoire n'a pas de support joignable pour le moment.", 'SUPPORT_UNAVAILABLE');
  if ([400, 404, 409].includes(r.status)) return fail(res, r.status, r.data?.message ?? 'Request refused.', r.data?.error);
  return fail(res, 502, 'Le service du laboratoire est momentanément indisponible.', 'AUDIT_UNAVAILABLE');
}

supportRouter.get('/organizations', asyncHandler(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2) return fail(res, 400, 'q must contain at least 2 characters.', 'VALIDATION_ERROR');
  const r = await callAudit({
    method: 'GET',
    path: `/nexus/v1/support/organizations?q=${encodeURIComponent(q.slice(0, 80))}`,
    scope: 'support:use',
    reporterRef: req.user!.id,
  });
  if (r.kind === 'http' && r.status === 200) return res.json({ success: true, organizations: r.data?.organizations ?? [] });
  return relayFailure(res, r);
}));

supportRouter.get('/threads', asyncHandler(async (req, res) => {
  const r = await callAudit({ method: 'GET', path: '/nexus/v1/support/threads', scope: 'support:use', reporterRef: req.user!.id });
  if (r.kind === 'http' && r.status === 200) return res.json({ success: true, threads: r.data?.threads ?? [] });
  return relayFailure(res, r);
}));

supportRouter.post('/threads', asyncHandler(async (req, res) => {
  const key = keyOf(req.get('idempotency-key'));
  if (!key) return fail(res, 400, 'Idempotency-Key must be 8-128 chars (letters, digits, . _ : -).', 'VALIDATION_ERROR');
  const { organizationRef, topic, message } = req.body ?? {};
  const text = typeof message === 'string' ? message.trim() : '';
  if (typeof organizationRef !== 'string' || !organizationRef || !TOPICS.includes(topic) || !text || text.length > 4000) {
    return fail(res, 400, 'organizationRef, topic and message (max 4000 characters) are required.', 'VALIDATION_ERROR');
  }
  const r = await callAudit({
    method: 'POST',
    path: '/nexus/v1/support/threads',
    scope: 'support:use',
    reporterRef: req.user!.id,
    idempotencyKey: key,
    body: { organizationRef, topic, message: text, client: await clientIdentity(req) }, // champs explicites : rien d'autre ne part vers Audit
  });
  if (r.kind === 'http' && (r.status === 201 || r.status === 200)) return res.status(r.status).json({ success: true, ...r.data });
  return relayFailure(res, r);
}));

supportRouter.get('/threads/:id/messages', asyncHandler(async (req, res) => {
  const since = typeof req.query.since === 'string' ? `?since=${encodeURIComponent(req.query.since)}` : '';
  const r = await callAudit({
    method: 'GET',
    path: `/nexus/v1/support/threads/${encodeURIComponent(String(req.params.id))}/messages${since}`,
    scope: 'support:use',
    reporterRef: req.user!.id,
  });
  if (r.kind === 'http' && r.status === 200) return res.json({ success: true, messages: r.data?.messages ?? [] });
  return relayFailure(res, r);
}));

supportRouter.post('/threads/:id/messages', asyncHandler(async (req, res) => {
  const key = keyOf(req.get('idempotency-key'));
  if (!key) return fail(res, 400, 'Idempotency-Key must be 8-128 chars (letters, digits, . _ : -).', 'VALIDATION_ERROR');
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  if (!content || content.length > 4000) return fail(res, 400, 'content is required (max 4000 characters).', 'VALIDATION_ERROR');
  const r = await callAudit({
    method: 'POST',
    path: `/nexus/v1/support/threads/${encodeURIComponent(String(req.params.id))}/messages`,
    scope: 'support:use',
    reporterRef: req.user!.id,
    idempotencyKey: key,
    body: { content, client: await clientIdentity(req) },
  });
  if (r.kind === 'http' && (r.status === 201 || r.status === 200)) return res.status(r.status).json({ success: true, message: r.data });
  return relayFailure(res, r);
}));
