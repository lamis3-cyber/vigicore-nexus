import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../lib/asyncHandler';

/**
 * Brouillons des assistants de déclaration, sauvegardés dans le COMPTE (base de données) :
 *   GET    /api/drafts        -> { drafts: [{ key, data, updatedAt }] } (les miens)
 *   GET    /api/drafts/:key   -> { draft: { data, updatedAt } | null }
 *   PUT    /api/drafts/:key   { data }  crée ou remplace (une ligne par utilisateur + clé)
 *   DELETE /api/drafts/:key   supprime (à l'envoi de la déclaration)
 * Portée : toujours l'utilisateur de la session ; la clé du client n'ouvre jamais le brouillon d'un autre.
 * Un brouillon peut contenir des données de santé saisies par l'utilisateur : lecture par son seul auteur.
 */
export const draftsRouter = Router();
draftsRouter.use(requireAuth);

const KEY_RE = /^[A-Za-z0-9._:\-À-ÿ ]{1,160}$/;
const MAX_BYTES = 200_000;
const fail = (res: any, status: number, message: string) => res.status(status).json({ success: false, message });

// Liste de MES brouillons (pour l'onglet « Brouillons » des pages Déclarations) — jamais ceux d'un autre.
draftsRouter.get('/', asyncHandler(async (req, res) => {
  const rows: any[] = await prisma.declarationDraft.findMany({ where: { userId: req.user!.id }, orderBy: { updatedAt: 'desc' }, take: 50 });
  res.json({ success: true, drafts: rows.map((r) => ({ key: r.draftKey, data: r.data, updatedAt: r.updatedAt })) });
}));

draftsRouter.get('/:key', asyncHandler(async (req, res) => {
  const key = String(req.params.key);
  if (!KEY_RE.test(key)) return fail(res, 400, 'Clé de brouillon invalide.');
  const row: any = await prisma.declarationDraft.findUnique({ where: { userId_draftKey: { userId: req.user!.id, draftKey: key } } });
  res.json({ success: true, draft: row ? { data: row.data, updatedAt: row.updatedAt } : null });
}));

draftsRouter.put('/:key', asyncHandler(async (req, res) => {
  const key = String(req.params.key);
  if (!KEY_RE.test(key)) return fail(res, 400, 'Clé de brouillon invalide.');
  const data = req.body?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fail(res, 400, 'Contenu de brouillon invalide.');
  if (Buffer.byteLength(JSON.stringify(data), 'utf8') > MAX_BYTES) return fail(res, 413, 'Brouillon trop volumineux.');
  const userId = req.user!.id;
  const row: any = await prisma.declarationDraft.upsert({
    where: { userId_draftKey: { userId, draftKey: key } },
    create: { userId, draftKey: key, data },
    update: { data },
  });
  res.json({ success: true, draft: { updatedAt: row.updatedAt } });
}));

draftsRouter.delete('/:key', asyncHandler(async (req, res) => {
  const key = String(req.params.key);
  if (!KEY_RE.test(key)) return fail(res, 400, 'Clé de brouillon invalide.');
  await prisma.declarationDraft.deleteMany({ where: { userId: req.user!.id, draftKey: key } });
  res.json({ success: true });
}));
