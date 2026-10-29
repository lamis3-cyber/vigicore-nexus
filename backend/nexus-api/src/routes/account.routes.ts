import { Router } from 'express';
import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../lib/asyncHandler';

/**
 * Réglages du compte connecté (page « Paramètres » des tableaux de bord).
 *   GET    /api/account/preferences   { values }
 *   PUT    /api/account/preferences   { values: { clé: texte } }  fusionne ; une valeur null supprime la clé
 *   DELETE /api/account/preferences   efface tous les réglages
 *   PATCH  /api/account/profile       { displayName }
 * Tout est limité au compte de la session ; rien n'est lu dans la requête pour désigner un autre utilisateur.
 */
export const accountRouter = Router();
accountRouter.use(requireAuth);

const fail = (res: Response, status: number, message: string) => res.status(status).json({ success: false, message });
const KEY_RE = /^[A-Za-z0-9_-]{1,60}$/;
const MAX_KEYS = 150;
const MAX_VALUE = 500;

async function readValues(userId: string): Promise<Record<string, string>> {
  const row = await prisma.userPreference.findUnique({ where: { userId } });
  const data = row?.data;
  return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, string>) : {};
}

accountRouter.get('/preferences', asyncHandler(async (req, res) => {
  res.json({ success: true, values: await readValues(req.user!.id) });
}));

accountRouter.put('/preferences', asyncHandler(async (req, res) => {
  const incoming = req.body?.values;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return fail(res, 400, 'Réglages invalides.');
  const next = { ...(await readValues(req.user!.id)) };
  for (const [k, v] of Object.entries(incoming as Record<string, unknown>)) {
    if (!KEY_RE.test(k)) return fail(res, 400, `Nom de réglage invalide : ${k.slice(0, 30)}.`);
    if (v === null) { delete next[k]; continue; }
    if (typeof v !== 'string' || v.length > MAX_VALUE) return fail(res, 400, `Valeur invalide pour ${k}.`);
    if (k === 'lang' && v !== 'fr' && v !== 'ar' && v !== 'en') return fail(res, 400, 'Langue non prise en charge (fr, ar ou en).');
    next[k] = v;
  }
  if (Object.keys(next).length > MAX_KEYS) return fail(res, 400, 'Trop de réglages enregistrés.');
  await prisma.userPreference.upsert({ where: { userId: req.user!.id }, create: { userId: req.user!.id, data: next }, update: { data: next } });
  res.json({ success: true, values: next });
}));

accountRouter.delete('/preferences', asyncHandler(async (req, res) => {
  await prisma.userPreference.upsert({ where: { userId: req.user!.id }, create: { userId: req.user!.id, data: {} }, update: { data: {} } });
  res.json({ success: true, values: {} });
}));

accountRouter.patch('/profile', asyncHandler(async (req, res) => {
  const name = typeof req.body?.displayName === 'string' ? req.body.displayName.replace(/\s+/g, ' ').trim() : '';
  if (name.length < 2 || name.length > 80) return fail(res, 400, 'Le nom doit contenir entre 2 et 80 caractères.');
  const user = await prisma.user.update({ where: { id: req.user!.id }, data: { displayName: name } });
  res.json({ success: true, displayName: user.displayName });
}));
